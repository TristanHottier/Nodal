//! WebAssembly bindings for the Nodal engine. Browser glue lives here, not in `nodal-engine`.

use wasm_bindgen::prelude::wasm_bindgen;

/// Returns the version of the engine this module was built from.
#[wasm_bindgen]
pub fn engine_version() -> String {
    nodal_engine::VERSION.to_string()
}
