import { describe, expect, it } from "vitest";
import { codexHref, parseRoute } from "./route";

describe("parseRoute", () => {
  it.each(["", "#", "#/", "/", "#/editor", "#/unknown"])("%j is the editor", (hash) => {
    expect(parseRoute(hash)).toEqual({ view: "editor" });
  });

  it.each(["#/codex", "#/codex/", "#//codex//", "#/codex//", "codex"])(
    "%j is the codex index",
    (hash) => {
      expect(parseRoute(hash)).toEqual({ view: "codex", id: null });
    },
  );

  it.each(["#/codex/diode", "#/codex/diode/", "#//codex//diode", "#/codex/diode?x=1"])(
    "%j is the diode entry",
    (hash) => {
      expect(parseRoute(hash)).toEqual({ view: "codex", id: "diode" });
    },
  );

  it("keeps an unknown id so the page can name it", () => {
    expect(parseRoute("#/codex/no-such-thing")).toEqual({ view: "codex", id: "no-such-thing" });
  });

  it("decodes an encoded id and survives bad encoding", () => {
    expect(parseRoute("#/codex/a%20b")).toEqual({ view: "codex", id: "a b" });
    expect(parseRoute("#/codex/%E0%A4%A")).toEqual({ view: "codex", id: "%E0%A4%A" });
  });
});

describe("codexHref", () => {
  it("links to the index and to an entry", () => {
    expect(codexHref()).toBe("#/codex");
    expect(codexHref("diode")).toBe("#/codex/diode");
  });

  it("encodes the id", () => {
    expect(codexHref("a b")).toBe("#/codex/a%20b");
  });
});
