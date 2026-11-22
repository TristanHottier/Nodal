import { afterEach, describe, expect, it, vi } from "vitest";
import { editorFramesPass, measureFrames } from "./editorBench";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("measureFrames", () => {
  it("measure_frames_counts_slow_frames", async () => {
    // Baseline at 0, then 8 frames; two 40 ms gaps, the rest 16 ms.
    const times = [0, 16, 32, 72, 88, 104, 144, 160, 176];
    let k = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => {
      const t = times[k++] ?? 0;
      setTimeout(() => {
        cb(t);
      }, 0);
      return k;
    });
    const driven: number[] = [];
    const s = await measureFrames((i) => driven.push(i), 8);
    expect(driven).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(s.slowFrames).toBe(2);
    expect(s.fps).toBeCloseTo(8 / 0.176, 6);
  });

  it("applies_the_pass_rule", () => {
    expect(editorFramesPass({ fps: 59.9, slowFrames: 12 }, 240)).toBe(true);
    expect(editorFramesPass({ fps: 59.9, slowFrames: 13 }, 240)).toBe(false);
    expect(editorFramesPass({ fps: 57, slowFrames: 0 }, 240)).toBe(false);
  });
});
