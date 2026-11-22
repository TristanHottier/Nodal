import { newProject, serializeProject } from "@nodal/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadProject, readProjectFile } from "./files";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const file = (text: string) => new File([text], "x.nodal.json");

describe("readProjectFile", () => {
  it("reads_valid_file", async () => {
    const p = newProject("Demo", "2026-01-01T00:00:00.000Z");
    const r = await readProjectFile(file(serializeProject(p)));
    expect(r).toEqual({ ok: true, project: p });
  });

  it("bad_json_error", async () => {
    const r = await readProjectFile(file("{nope"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^not valid JSON: /);
  });

  it("future_version_error", async () => {
    const p = { ...newProject("Demo", "2026-01-01T00:00:00.000Z"), formatVersion: 99 };
    const r = await readProjectFile(file(JSON.stringify(p)));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/newer version/);
  });
});

describe("downloadProject", () => {
  it("download_uses_safe_name", () => {
    vi.useFakeTimers();
    const create = vi.fn(() => "blob:fake");
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    let name = "";
    let attached = false;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      name = this.download;
      attached = document.body.contains(this);
    });
    downloadProject(newProject("My/Circuit: v2", "2026-01-01T00:00:00.000Z"));
    expect(name).toBe("My_Circuit_ v2.nodal.json");
    expect(attached).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    const arg = (create.mock.calls[0] as unknown[])[0];
    expect(arg).toBeInstanceOf(Blob);
    expect((arg as Blob).type).toBe("application/json");
    expect(document.querySelector("a[download]")).toBeNull();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith("blob:fake");
    vi.unstubAllGlobals();
  });

  it("empty_name_is_untitled", () => {
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: vi.fn() });
    let name = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      name = this.download;
    });
    downloadProject(newProject("  ", "2026-01-01T00:00:00.000Z"));
    expect(name).toBe("untitled.nodal.json");
    vi.unstubAllGlobals();
  });
});
