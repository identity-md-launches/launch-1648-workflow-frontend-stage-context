import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { inputs, makeManifest, root } from "./manifest.mjs";
await inputs();
execFileSync(
  process.execPath,
  [resolve(root, "web/node_modules/vite/bin/vite.js"), "build"],
  { cwd: resolve(root, "web"), stdio: "inherit" },
);
await makeManifest();
await import("./check-export.mjs");
