//! Analog circuit simulation engine.
//!
//! This crate performs no I/O, reads no clock and has no browser dependency.
//! File, process and browser access belong in `nodal-cli` and `nodal-wasm`.

/// Crate version, taken from the manifest.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    #[test]
    fn version_matches_manifest() {
        assert_eq!(super::VERSION, "0.1.0");
    }
}
