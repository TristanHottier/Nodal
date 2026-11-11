//! Physical constants. ngspice-42 uses the CODATA 2014 values (`const.h`),
//! not the SPICE2 ones. They are defined once, here.

/// Elementary charge in coulombs.
pub const CHARGE: f64 = 1.6021766208e-19;
/// Boltzmann constant in joules per kelvin.
pub const BOLTZMANN: f64 = 1.38064852e-23;
/// Circuit temperature in kelvin (27 degrees Celsius, fixed in v1).
pub const T_NOMINAL: f64 = 300.15;
/// Thermal voltage `k T / q` at `T_NOMINAL`, in volts.
pub const VT: f64 = BOLTZMANN * T_NOMINAL / CHARGE;
