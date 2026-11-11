import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

const probe = spawnSync("wasm-pack", ["--version"], { stdio: "ignore" });
if (probe.error || probe.status !== 0) {
  process.stderr.write(
    "wasm-pack not found. Install wasm-pack 0.15.1, then run: pnpm build:wasm\n",
  );
  process.exit(1);
}

const args = ["build", "crates/nodal-wasm", "--target", "web", "--release"];
if (process.env.NODAL_WASM_NO_OPT === "1") args.push("--no-opt");

const result = spawnSync("wasm-pack", args, { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);
