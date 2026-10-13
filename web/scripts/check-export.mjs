import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { root, inputs, readJSON, files, abiHash, sha256 } from "./manifest.mjs";
const { handoff, chain } = await inputs();
const manifest = await readJSON("dist/imd-deployment.json");
assert.deepEqual(
  Object.keys(manifest).sort(),
  [
    "version",
    "launchId",
    "chainId",
    "sourceCommit",
    "attestationHash",
    "contracts",
    "assets",
    ...(handoff.poolKey ? ["poolKey"] : []),
    ...Object.keys(chain),
  ].sort(),
);
for (const key of [
  "version",
  "launchId",
  "chainId",
  "sourceCommit",
  "attestationHash",
])
  assert.deepEqual(manifest[key], handoff[key], key);
assert.deepEqual(manifest.poolKey, handoff.poolKey);
assert.deepEqual(manifest.network, chain.network);
assert.deepEqual(manifest.walletAddChain, chain.walletAddChain);
assert.deepEqual(
  manifest.contracts.map(({ name, address, abiHash }) => ({
    name,
    address,
    abiHash,
  })),
  handoff.contracts.map(({ name, address, abiHash }) => ({
    name,
    address,
    abiHash,
  })),
);
const safe = (path) =>
  typeof path === "string" &&
  !path.startsWith("/") &&
  !path.includes("..") &&
  !path.includes(":") &&
  !path.includes("\\");
const dist = resolve(root, "dist");
const inventory = (await files(dist))
  .filter((p) => p !== resolve(dist, "imd-deployment.json"))
  .map((p) => relative(dist, p))
  .sort();
assert.deepEqual(
  manifest.assets.map((a) => a.path).sort(),
  inventory,
  "Asset inventory is exhaustive and unique",
);
assert(manifest.assets.length <= 128);
let bytes = 0;
for (const asset of manifest.assets) {
  assert(safe(asset.path));
  assert(/^[a-f0-9]{64}$/.test(asset.sha256));
  const content = await readFile(resolve(dist, asset.path));
  assert(content.length <= 8388608);
  bytes += content.length;
  assert.equal(sha256(content), asset.sha256, asset.path);
}
for (const contract of manifest.contracts) {
  assert(safe(contract.abiPath));
  const abi = JSON.parse(
    await readFile(resolve(dist, contract.abiPath), "utf8"),
  );
  assert(Array.isArray(abi));
  assert.equal(abiHash(abi), contract.abiHash, contract.name);
}
assert(bytes < 8388608, "Website under 8 MiB");
const html = await readFile(resolve(dist, "index.html"), "utf8");
assert(!/(?:src|href)="\/(?!\/)/.test(html), "Relative static assets");
console.log(
  JSON.stringify(
    {
      check: "export",
      contracts: manifest.contracts.length,
      assets: inventory.length,
      bytes,
      hashes: "all matched",
      sourceCommit: manifest.sourceCommit,
    },
    null,
    2,
  ),
);
