import { expect, test } from "vitest";
import { IR_VERSION, PROJECT_FORMAT } from "./index";

test("format identifiers match ARCHITECTURE §3 and §7", () => {
  expect(IR_VERSION).toBe(1);
  expect(PROJECT_FORMAT).toBe("nodal-project");
});
