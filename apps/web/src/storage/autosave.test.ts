import { newProject, type Project } from "@nodal/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditorStore } from "../editor/store";
import { startAutosave } from "./autosave";
import { type KvStore, openStore } from "./idb";

let n = 0;
const freshKv = () => openStore(`nodal-test-${String(++n)}`);
const T0 = "2026-01-01T00:00:00.000Z";

// fake-indexeddb schedules its work with setImmediate, so only fake what autosave uses.
const fakeTimers = () => vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("startAutosave", () => {
  it("restores_saved_project", async () => {
    const kv = await freshKv();
    const saved = newProject("Saved", T0);
    await kv.put("current", saved);
    const store = createEditorStore();
    const h = await startAutosave(store, kv);
    expect(h.message).toBeNull();
    expect(store.getState().getProject()).toEqual(saved);
    h.stop();
  });

  it("does_not_overwrite_saved_project_with_empty_state", async () => {
    fakeTimers();
    const kv = await freshKv();
    const saved = newProject("Saved", T0);
    await kv.put("current", saved);
    const store = createEditorStore();
    const h = await startAutosave(store, kv);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await kv.get("current")).toEqual(saved);
    h.stop();
  });

  it("debounces_writes", async () => {
    fakeTimers();
    const kv = await freshKv();
    const put = vi.spyOn(kv, "put");
    const store = createEditorStore();
    const h = await startAutosave(store, kv, { delayMs: 500 });
    store.getState().setProjectName("A");
    await vi.advanceTimersByTimeAsync(300);
    store.getState().setProjectName("B");
    await vi.advanceTimersByTimeAsync(300);
    expect(put).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(put).toHaveBeenCalledTimes(1);
    expect(((await kv.get("current")) as Project).name).toBe("B");
    h.stop();
  });

  it("stop_flushes_pending_write_once", async () => {
    fakeTimers();
    const kv = await freshKv();
    const put = vi.spyOn(kv, "put");
    const store = createEditorStore();
    const h = await startAutosave(store, kv);
    store.getState().setProjectName("A");
    h.stop();
    expect(put).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("pagehide_flushes_pending_write", async () => {
    fakeTimers();
    const kv = await freshKv();
    const store = createEditorStore();
    const h = await startAutosave(store, kv, { delayMs: 500 });
    store.getState().setProjectName("A");
    window.dispatchEvent(new Event("pagehide"));
    expect(((await kv.get("current")) as Project).name).toBe("A");
    h.stop();
  });

  it("hidden_visibility_flushes_pending_write", async () => {
    fakeTimers();
    const kv = await freshKv();
    const store = createEditorStore();
    const h = await startAutosave(store, kv);
    store.getState().setProjectName("A");
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(((await kv.get("current")) as Project).name).toBe("A");
    h.stop();
  });

  it("edit_during_startup_read_is_kept", async () => {
    fakeTimers();
    const kv = await freshKv();
    await kv.put("current", newProject("Saved", T0));
    const store = createEditorStore();
    const slow: KvStore = {
      put: (k, v) => kv.put(k, v),
      get: async (k) => {
        const v = await kv.get(k);
        store.getState().setProjectName("Typed");
        return v;
      },
    };
    const h = await startAutosave(store, slow, { delayMs: 500 });
    expect(store.getState().project.name).toBe("Typed");
    await vi.advanceTimersByTimeAsync(600);
    await vi.waitFor(async () => {
      expect(((await kv.get("current")) as Project).name).toBe("Typed");
    });
    h.stop();
  });

  const diagonal = {
    ...newProject("Bad", T0),
    schematic: {
      ...newProject("Bad", T0).schematic,
      wires: [
        {
          id: "w1",
          points: [
            { x: 0, y: 0 },
            { x: 3, y: 4 },
          ],
        },
      ],
    },
  };
  const cases: [string, unknown][] = [
    ["garbage", { hello: "world" }],
    ["future_version", { ...newProject("F", T0), formatVersion: 99 }],
    ["diagonal_wire", diagonal],
  ];
  for (const [name, record] of cases) {
    it(`corrupt_autosave_is_kept_and_reported_${name}`, async () => {
      fakeTimers();
      vi.setSystemTime(new Date("2026-02-03T04:05:06.000Z"));
      const kv = await freshKv();
      await kv.put("current", record);
      const store = createEditorStore();
      const empty = store.getState().getProject();
      const h = await startAutosave(store, kv, { delayMs: 500 });
      expect(h.message).toMatch(
        /^The autosaved project could not be loaded \(.+\)\. A copy was kept in browser storage\.$/,
      );
      expect(store.getState().getProject()).toEqual(empty);
      expect(await kv.get("current")).toEqual(record);
      expect(await kv.get("current-invalid-2026-02-03T04:05:06.000Z")).toEqual(record);
      store.getState().setProjectName("Edited");
      await vi.advanceTimersByTimeAsync(600);
      expect(((await kv.get("current")) as Project).name).toBe("Edited");
      h.stop();
    });
  }

  it("corrupt_autosave_backup_holds_record", async () => {
    fakeTimers();
    vi.setSystemTime(new Date("2026-02-03T04:05:06.000Z"));
    const kv = await freshKv();
    const record = { hello: "world" };
    await kv.put("current", record);
    const h = await startAutosave(createEditorStore(), kv);
    expect(await kv.get("current-invalid-2026-02-03T04:05:06.000Z")).toEqual(record);
    h.stop();
  });

  it("write_failure_reported", async () => {
    fakeTimers();
    const kv: KvStore = {
      get: () => Promise.resolve(undefined),
      put: () => Promise.reject(new Error("quota exceeded")),
    };
    const store = createEditorStore();
    const h = await startAutosave(store, kv);
    store.getState().setProjectName("A");
    await vi.advanceTimersByTimeAsync(600);
    await vi.waitFor(() => {
      expect(store.getState().statusMessage).toBe("Autosave failed: quota exceeded");
    });
    h.stop();
  });

  it("unavailable_read_reports_and_does_not_subscribe", async () => {
    fakeTimers();
    const put = vi.fn(() => Promise.resolve());
    const kv: KvStore = { get: () => Promise.reject(new Error("blocked")), put };
    const store = createEditorStore();
    const h = await startAutosave(store, kv);
    expect(h.message).toBe("Autosave is unavailable: blocked");
    store.getState().setProjectName("A");
    await vi.advanceTimersByTimeAsync(2000);
    expect(put).not.toHaveBeenCalled();
    h.stop();
  });
  it("failure_message_clears_after_a_successful_write", async () => {
    fakeTimers();
    let fail = true;
    const kv: KvStore = {
      get: () => Promise.resolve(undefined),
      put: () => (fail ? Promise.reject(new Error("quota exceeded")) : Promise.resolve()),
    };
    const store = createEditorStore();
    const h = await startAutosave(store, kv);
    store.getState().setProjectName("A");
    await vi.advanceTimersByTimeAsync(600);
    await vi.waitFor(() => {
      expect(store.getState().statusMessage).toBe("Autosave failed: quota exceeded");
    });
    fail = false;
    store.getState().setProjectName("B");
    await vi.advanceTimersByTimeAsync(600);
    await vi.waitFor(() => {
      expect(store.getState().statusMessage).toBeNull();
    });
    h.stop();
  });

  it("success_keeps_an_unrelated_status_message", async () => {
    fakeTimers();
    const kv = await freshKv();
    const store = createEditorStore();
    const h = await startAutosave(store, kv);
    store.getState().setStatusMessage("Could not open x.json: nope");
    store.getState().setProjectName("A");
    await vi.advanceTimersByTimeAsync(600);
    expect(store.getState().statusMessage).toBe("Could not open x.json: nope");
    h.stop();
  });

  describe("two tabs", () => {
    const PAUSED =
      "Nodal is open in another tab; autosave is paused here. Reload this tab to continue here.";

    it("the_newest_tab_keeps_saving_and_the_older_one_pauses", async () => {
      fakeTimers();
      const kv = await freshKv();
      const first = createEditorStore();
      const second = createEditorStore();
      const a = await startAutosave(first, kv);
      const b = await startAutosave(second, kv);
      await vi.advanceTimersByTimeAsync(10);
      await vi.waitFor(() => {
        expect(first.getState().statusMessage).toBe(PAUSED);
      });
      expect(second.getState().statusMessage).toBeNull();

      first.getState().setProjectName("Old tab");
      await vi.advanceTimersByTimeAsync(600);
      expect(await kv.get("current")).toBeUndefined();

      second.getState().setProjectName("New tab");
      await vi.advanceTimersByTimeAsync(600);
      expect(((await kv.get("current")) as Project).name).toBe("New tab");
      a.stop();
      b.stop();
    });

    it("a_pending_write_is_dropped_when_another_tab_takes_over", async () => {
      fakeTimers();
      const kv = await freshKv();
      const first = createEditorStore();
      const a = await startAutosave(first, kv);
      first.getState().setProjectName("Pending");
      const b = await startAutosave(createEditorStore(), kv);
      await vi.waitFor(() => {
        expect(first.getState().statusMessage).toBe(PAUSED);
      });
      await vi.advanceTimersByTimeAsync(600);
      window.dispatchEvent(new Event("pagehide"));
      expect(await kv.get("current")).toBeUndefined();
      a.stop();
      b.stop();
    });

    it("stop_closes_the_channel", async () => {
      fakeTimers();
      const kv = await freshKv();
      const first = createEditorStore();
      const a = await startAutosave(first, kv);
      a.stop();
      const b = await startAutosave(createEditorStore(), kv);
      await vi.advanceTimersByTimeAsync(10);
      expect(first.getState().statusMessage).toBeNull();
      b.stop();
    });
  });
});
