//! Export of a netlist to other simulators' input formats.

mod spice;

pub use spice::to_spice_deck;
