// Color math for the token tests: OKLCH to sRGB, WCAG contrast, color-vision-deficiency simulation.
// OKLab matrices from Björn Ottosson (https://bottosson.github.io/posts/oklab/).
// CVD matrices from Machado, Oliveira and Fernandes (2009), severity 1.0, applied in linear RGB.

/** sRGB, gamma encoded, each channel in [0, 1]. */
export type Rgb = [number, number, number];
type Mat3 = readonly [readonly number[], readonly number[], readonly number[]];

const mul = (m: Mat3, v: readonly number[]): Rgb => [
  (m[0][0] ?? 0) * (v[0] ?? 0) + (m[0][1] ?? 0) * (v[1] ?? 0) + (m[0][2] ?? 0) * (v[2] ?? 0),
  (m[1][0] ?? 0) * (v[0] ?? 0) + (m[1][1] ?? 0) * (v[1] ?? 0) + (m[1][2] ?? 0) * (v[2] ?? 0),
  (m[2][0] ?? 0) * (v[0] ?? 0) + (m[2][1] ?? 0) * (v[1] ?? 0) + (m[2][2] ?? 0) * (v[2] ?? 0),
];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** Parses `oklch(L C H)`; L as a number or a percentage, H optionally in `deg`. */
export function parseOklch(s: string): [number, number, number] {
  const m = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*\)$/.exec(s.trim());
  if (!m) throw new Error(`Not an oklch() color: ${s}`);
  const l = Number(m[1]) / (m[2] === "%" ? 100 : 1);
  return [l, Number(m[3]), Number(m[4])];
}

const LMS_TO_LIN: Mat3 = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.707614701],
];
const LIN_TO_LMS: Mat3 = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
];
const LMS_TO_LAB: Mat3 = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
];

function oklchToLinear(l: number, c: number, h: number): Rgb {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);
  const lms = [
    (l + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    (l - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    (l - 0.0894841775 * a - 1.291485548 * b) ** 3,
  ];
  return mul(LMS_TO_LIN, lms);
}

/** Gamma-encoded sRGB; channels may fall outside [0, 1] for out-of-gamut colors. */
export function oklchToSrgb(l: number, c: number, h: number): Rgb {
  const [r, g, b] = oklchToLinear(l, c, h);
  const enc = (x: number) => Math.sign(x) * toGamma(Math.abs(x));
  return [enc(r), enc(g), enc(b)];
}

export function inSrgbGamut(rgb: Rgb, eps = 1e-4): boolean {
  return rgb.every((x) => x >= -eps && x <= 1 + eps);
}

const clamp = (x: number) => Math.min(1, Math.max(0, x));

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((x) => toLinear(clamp(x))) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio, from 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const CVD: Record<"protan" | "deutan" | "tritan", Mat3> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

/** How a color looks under full protanopia, deuteranopia or tritanopia. */
export function simulateCvd(rgb: Rgb, kind: keyof typeof CVD): Rgb {
  const lin = rgb.map((x) => toLinear(clamp(x)));
  const out = mul(CVD[kind], lin);
  return out.map((x) => toGamma(clamp(x))) as Rgb;
}

function toOklab(rgb: Rgb): Rgb {
  const lms = mul(
    LIN_TO_LMS,
    rgb.map((x) => toLinear(clamp(x))),
  ).map((x) => Math.cbrt(x));
  return mul(LMS_TO_LAB, lms);
}

/** Euclidean distance in OKLab (a just-noticeable difference is about 0.02). */
export function oklabDistance(a: Rgb, b: Rgb): number {
  const p = toOklab(a);
  const q = toOklab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
