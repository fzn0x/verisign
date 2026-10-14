// Cross-platform build used by `pnpm build` and by Wrangler's [build] step.
//
//   node scripts/build.mjs           build the frontend and the Worker
//   node scripts/build.mjs --worker  build only the Go Worker (web/dist must exist)
import { spawnSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";

const workerOnly = process.argv.includes("--worker");

// pnpm is a .cmd shim on Windows and needs a shell; go must not get one,
// or the shell splits the quoted -ldflags value.
function run(cmd, args, env = {}) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32" && cmd === "pnpm",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (workerOnly) {
  // Wrangler refuses to start when the assets directory is missing.
  mkdirSync("web/dist", { recursive: true });
} else {
  run("pnpm", ["--dir", "web", "build"]);
}

run("go", ["run", "github.com/syumai/workers-go/cmd/workers-assets-gen", "-mode=go", "-o", "build"]);
run(
  "go",
  ["build", "-trimpath", "-ldflags=-s -w", "-o", "build/app.wasm", "./cmd/worker"],
  { GOOS: "js", GOARCH: "wasm" },
);

const size = statSync("build/app.wasm").size;
console.log(`worker: build/app.wasm ${(size / 1024 / 1024).toFixed(2)} MiB`);
