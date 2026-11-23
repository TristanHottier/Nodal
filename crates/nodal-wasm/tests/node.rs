//! Runs only under `wasm-pack test --node`; `cargo test` skips it on native targets.

#[wasm_bindgen_test::wasm_bindgen_test]
fn engine_version_is_crate_version() {
    assert_eq!(nodal_wasm::engine_version(), "1.1.0");
}

const RC_TRAN: &str = r#"{
  "irVersion": 1,
  "title": "RC",
  "elements": [
    { "kind": "V", "name": "V1", "nodes": ["in", "0"], "dc": 1 },
    { "kind": "R", "name": "R1", "nodes": ["in", "out"], "value": 1000 },
    { "kind": "C", "name": "C1", "nodes": ["out", "0"], "value": 1e-6 }
  ],
  "analyses": [{ "type": "tran", "tstep": 0.00001, "tstop": 0.005 }]
}"#;

const FLOATING: &str = r#"{
  "irVersion": 1,
  "title": "floating",
  "elements": [
    { "kind": "V", "name": "V1", "nodes": ["in", "0"], "dc": 1 },
    { "kind": "R", "name": "R1", "nodes": ["in", "a"], "value": 1000 },
    { "kind": "C", "name": "C1", "nodes": ["a", "b"], "value": 1e-6 },
    { "kind": "R", "name": "R2", "nodes": ["b", "c"], "value": 1000 }
  ],
  "analyses": [{ "type": "op" }]
}"#;

type TestResult = Result<(), String>;

fn recorder() -> Result<(js_sys::Array, js_sys::Function), String> {
    let log = js_sys::Array::new();
    let factory = js_sys::Function::new_with_args("log", "return (p) => { log.push(p); };");
    let cb = factory
        .call1(&wasm_bindgen::JsValue::NULL, &log)
        .map_err(|e| format!("{e:?}"))?;
    let cb = cb
        .dyn_into::<js_sys::Function>()
        .map_err(|_| "callback is not a function".to_string())?;
    Ok((log, cb))
}

use wasm_bindgen::JsCast;

#[wasm_bindgen_test::wasm_bindgen_test]
fn run_rc_tran_reports_progress_and_data() -> TestResult {
    let (log, cb) = recorder()?;
    let mut out = nodal_wasm::run(RC_TRAN, 0, &cb).map_err(|e| format!("run failed: {e:?}"))?;
    let meta: serde_json::Value = serde_json::from_str(&out.meta()).map_err(|e| e.to_string())?;
    assert_eq!(meta["type"], "tran");
    let points = meta["points"].as_u64().unwrap_or(0) as usize;
    let signals = meta["signals"].as_array().map_or(0, Vec::len);
    assert!(points > 10 && signals > 0);
    assert_eq!(out.take_data().len(), points * (1 + signals));
    assert!(out.take_data().is_empty());
    let n = log.length();
    assert!(n >= 2, "progress calls: {n}");
    assert_eq!(log.get(n - 1).as_f64(), Some(1.0));
    // Throttled: at most one call per 0.01, plus the final 1.0.
    assert!(n <= 102, "progress calls: {n}");
    Ok(())
}

#[wasm_bindgen_test::wasm_bindgen_test]
fn run_ignores_throwing_callback() {
    let cb = js_sys::Function::new_with_args("p", "throw new Error('boom');");
    assert!(nodal_wasm::run(RC_TRAN, 0, &cb).is_ok());
}

#[wasm_bindgen_test::wasm_bindgen_test]
fn run_reports_floating_node() -> TestResult {
    let (_, cb) = recorder()?;
    let Err(e) = nodal_wasm::run(FLOATING, 0, &cb) else {
        return Err("expected an error".to_string());
    };
    let text = e.as_string().ok_or("error is not a string")?;
    let info: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    assert!(
        info["nodes"].as_array().is_some_and(|n| !n.is_empty()),
        "{info}"
    );
    assert!(info["message"].as_str().is_some());
    Ok(())
}
