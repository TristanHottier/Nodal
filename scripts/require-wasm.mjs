import { existsSync } from "node:fs";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const wasm = fileURLToPath(new URL("../crates/nodal-wasm/pkg/nodal_wasm_bg.wasm", import.meta.url));

if (!existsSync(wasm)) {
  process.stderr.write("WASM not built. Run: pnpm build:wasm\n");
  process.exit(1);
}
