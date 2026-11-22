import { describe, expect, it } from "vitest";
import { decodeError, decodeResult, signalKey, type Signal } from "./results";

const f64 = (...v: number[]) => new Float64Array(v);

function at(signals: Signal[], i: number): Signal {
  const s = signals[i];
  if (s === undefined) throw new Error(`no signal ${String(i)}`);
  return s;
}

describe("decodeResult", () => {
  it("decodes_each_type", () => {
    const op = decodeResult(
      '{"type":"op","source":null,"points":1,"signals":[{"name":"a","kind":"v"},{"name":"V1","kind":"i"}]}',
      f64(1, -0.5),
    );
    expect(op.type).toBe("op");
    expect(op.source).toBeUndefined();
    expect(op.axis.length).toBe(0);
    expect(op.signals.map((s) => [s.name, s.kind, Array.from(s.re)])).toEqual([
      ["a", "v", [1]],
      ["V1", "i", [-0.5]],
    ]);

    const dc = decodeResult(
      '{"type":"dc","source":"V1","points":2,"signals":[{"name":"a","kind":"v"}]}',
      f64(0, 1, 0, 0.5),
    );
    expect(dc.type).toBe("dc");
    expect(dc.source).toBe("V1");
    expect(Array.from(dc.axis)).toEqual([0, 1]);
    expect(Array.from(at(dc.signals, 0).re)).toEqual([0, 0.5]);
    expect(at(dc.signals, 0).im).toBeUndefined();

    const ac = decodeResult(
      '{"type":"ac","points":2,"signals":[{"name":"a","kind":"v"},{"name":"V1","kind":"i"}]}',
      f64(1, 10, 1, 2, 3, 4, 5, 6, 7, 8),
    );
    expect(ac.type).toBe("ac");
    expect(Array.from(ac.axis)).toEqual([1, 10]);
    expect(Array.from(at(ac.signals, 0).re)).toEqual([1, 2]);
    expect(Array.from(at(ac.signals, 0).im ?? [])).toEqual([3, 4]);
    expect(Array.from(at(ac.signals, 1).re)).toEqual([5, 6]);
    expect(Array.from(at(ac.signals, 1).im ?? [])).toEqual([7, 8]);

    const data = f64(0, 1e-3, 5, 6);
    const tran = decodeResult(
      '{"type":"tran","source":null,"points":2,"signals":[{"name":"a","kind":"v"}]}',
      data,
    );
    expect(tran.type).toBe("tran");
    expect(Array.from(tran.axis)).toEqual([0, 1e-3]);
    expect(Array.from(at(tran.signals, 0).re)).toEqual([5, 6]);
    // Views, not copies.
    expect(at(tran.signals, 0).re.buffer).toBe(data.buffer);
    expect(tran.axis.buffer).toBe(data.buffer);
  });

  it("rejects_length_mismatch", () => {
    const meta = '{"type":"tran","points":2,"signals":[{"name":"a","kind":"v"}]}';
    expect(() => decodeResult(meta, f64(0, 1, 5))).toThrow(/malformed engine result/);
    expect(() => decodeResult(meta, f64(0, 1, 5, 6, 7))).toThrow(/malformed engine result/);
  });

  it("rejects_bad_meta", () => {
    for (const meta of [
      "not json",
      "{}",
      '{"type":"noise","points":1,"signals":[]}',
      '{"type":"op","points":-1,"signals":[]}',
      '{"type":"op","points":1.5,"signals":[]}',
      '{"type":"op","points":1,"signals":[{"name":"a","kind":"x"}]}',
    ]) {
      expect(() => decodeResult(meta, f64(1)), meta).toThrow(/malformed engine result/);
    }
  });
});

describe("decodeError", () => {
  it("decode_error_falls_back", () => {
    expect(decodeError('{"message":"boom","elements":["R1"],"nodes":["a"]}')).toEqual({
      message: "boom",
      elements: ["R1"],
      nodes: ["a"],
    });
    const fallback = (raw: unknown, message: string): void => {
      expect(decodeError(raw)).toEqual({ message, elements: [], nodes: [] });
    };
    fallback("plain text", "plain text");
    fallback('{"message":1}', '{"message":1}');
    fallback(new Error("x"), "Error: x");
    fallback(42, "42");
  });
});

describe("signalKey", () => {
  it("formats", () => {
    expect(signalKey({ name: "out", kind: "v" })).toBe("V(out)");
    expect(signalKey({ name: "V1", kind: "i" })).toBe("I(V1)");
  });
});
