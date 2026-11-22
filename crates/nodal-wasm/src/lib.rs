//! WebAssembly bindings for the Nodal engine. Browser glue lives here, not in `nodal-engine`.

pub mod encode;

use wasm_bindgen::{JsValue, prelude::wasm_bindgen};

/// Returns the version of the engine this module was built from.
#[wasm_bindgen]
pub fn engine_version() -> String {
    nodal_engine::VERSION.to_string()
}

/// A finished analysis: JSON metadata plus one flat `Float64Array`.
#[wasm_bindgen]
pub struct RunOutput {
    meta: String,
    data: Vec<f64>,
}

#[wasm_bindgen]
impl RunOutput {
    /// The `encode::Meta` record as JSON.
    #[wasm_bindgen(getter)]
    pub fn meta(&self) -> String {
        self.meta.clone()
    }

    /// Moves the data out as a `Float64Array`, leaving this output empty.
    pub fn take_data(&mut self) -> Vec<f64> {
        std::mem::take(&mut self.data)
    }
}

/// Smallest rise in progress worth a call into JavaScript.
const PROGRESS_STEP: f64 = 0.01;

fn fail(e: &nodal_engine::Error) -> JsValue {
    let json = serde_json::to_string(&encode::error_info(e)).unwrap_or_else(|_| e.to_string());
    JsValue::from_str(&json)
}

/// Runs analysis `analysis_index` of the netlist JSON.
///
/// `on_progress` receives fractions in `[0, 1]`, at most once per 0.01 of
/// progress, and always for 1.0; exceptions it throws are ignored. On failure
/// the error is a string holding `ErrorInfo` JSON.
#[wasm_bindgen]
pub fn run(
    netlist_json: &str,
    analysis_index: u32,
    on_progress: &js_sys::Function,
) -> Result<RunOutput, JsValue> {
    let netlist = nodal_engine::parse_netlist(netlist_json).map_err(|e| fail(&e))?;
    let mut last = f64::NEG_INFINITY;
    let mut forward = |p: f64| {
        if p >= 1.0 || p - last >= PROGRESS_STEP {
            last = p;
            let _ = on_progress.call1(&JsValue::NULL, &JsValue::from_f64(p));
        }
    };
    let result = nodal_engine::simulate_analysis(&netlist, analysis_index as usize, &mut forward)
        .map_err(|e| fail(&e))?;
    let (meta, data) = encode::encode(&result);
    let meta = serde_json::to_string(&meta).map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(RunOutput { meta, data })
}
