import { describe, expect, it } from "vitest";
import { openStore } from "./idb";

describe("openStore", () => {
  it("round_trips_values", async () => {
    const kv = await openStore("nodal-idb-test-1");
    await kv.put("a", { x: 1 });
    expect(await kv.get("a")).toEqual({ x: 1 });
    expect(await kv.get("missing")).toBeUndefined();
  });

  it("put_rejects_when_value_cannot_be_stored", async () => {
    const kv = await openStore("nodal-idb-test-2");
    await expect(kv.put("a", () => 1)).rejects.toBeInstanceOf(Error);
  });
});
