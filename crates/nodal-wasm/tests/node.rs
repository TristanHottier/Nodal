#[wasm_bindgen_test::wasm_bindgen_test]
fn engine_version_is_crate_version() {
    assert_eq!(nodal_wasm::engine_version(), "0.1.0");
}
