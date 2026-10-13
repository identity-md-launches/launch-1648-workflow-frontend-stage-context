import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256, toBytes } from "viem";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
export const abiHash = (abi) =>
  keccak256(toBytes(JSON.stringify(canonical(abi)))).slice(2);
export const sha256 = (data) => createHash("sha256").update(data).digest("hex");
export const readJSON = async (path) =>
  JSON.parse(await readFile(resolve(root, path), "utf8"));
export async function inputs() {
  const handoff = await readJSON("web/deployment/handoff.json");
  const chain = await readJSON("web/deployment/network.json");
  // The immutable source revision is read, not checked out or modified.
  for (const contract of handoff.contracts) {
    const pinned = execFileSync(
      "git",
      ["show", `${handoff.sourceCommit}:docs/abi/${contract.name}.json`],
      { cwd: root, encoding: "utf8" },
    );
    const abi = JSON.parse(pinned);
    if (!Array.isArray(abi) || abiHash(abi) !== contract.abiHash)
      throw Error(`Pinned ABI hash mismatch: ${contract.name}`);
    const local = await readFile(
      resolve(root, `web/public/abi/${contract.name}.json`),
      "utf8",
    );
    if (local !== pinned)
      throw Error(`ABI bytes do not match pinned source: ${contract.name}`);
  }
  return { handoff, chain };
}
export async function files(directory) {
  const result = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    if (entry.isSymbolicLink())
      throw Error(`Symlink not allowed in export: ${entry.name}`);
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await files(path)));
    else result.push(path);
  }
  return result;
}
export async function makeManifest() {
  const { handoff, chain } = await inputs();
  const dist = resolve(root, "dist");
  const assets = [];
  for (const file of await files(dist)) {
    if (file === resolve(dist, "imd-deployment.json")) continue;
    if ((await stat(file)).size > 8388608)
      throw Error(`Oversize asset: ${file}`);
    assets.push({
      path: relative(dist, file).split("\\").join("/"),
      sha256: sha256(await readFile(file)),
    });
  }
  if (assets.length > 128) throw Error("More than 128 assets");
  const manifest = {
    version: 1,
    launchId: handoff.launchId,
    chainId: handoff.chainId,
    sourceCommit: handoff.sourceCommit,
    attestationHash: handoff.attestationHash,
    contracts: handoff.contracts.map(({ name, address, abiHash }) => ({
      name,
      address,
      abiHash,
      abiPath: `abi/${name}.json`,
    })),
    ...(handoff.poolKey ? { poolKey: handoff.poolKey } : {}),
    ...chain,
    assets,
  };
  await writeFile(
    resolve(dist, "imd-deployment.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  return manifest;
}
