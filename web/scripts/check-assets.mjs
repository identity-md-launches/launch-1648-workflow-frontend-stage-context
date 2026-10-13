import assert from "node:assert/strict";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { root, files, sha256 } from "./manifest.mjs";
const layers = [];
let kitCount = 0;
const checks = [];
const names = [
  "logomark",
  "logomark-mono",
  "logomark-reversed",
  "wordmark",
  "lockup",
];
for (const [row, id] of ["a", "b", "c"].entries()) {
  const dir = resolve(root, `web/public/guides/finalist-${id}`);
  const original = await readFile(
    resolve(root, `art/finalist-${id}/logomark.svg`),
  );
  assert(original.length < 4096);
  assert.deepEqual(await readFile(resolve(dir, "logomark.svg")), original);
  const png = await sharp(resolve(dir, "logomark-512.png")).metadata();
  assert.equal(png.width, 512);
  assert.equal(png.height, 512);
  const ico = await readFile(resolve(dir, "favicon.ico"));
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 1);
  assert.equal(ico.readUInt32LE(18), 22);
  const palette = JSON.parse(
    await readFile(resolve(dir, "colors.json"), "utf8"),
  );
  for (const colors of Object.values(palette))
    for (const color of colors)
      assert.deepEqual(
        color.rgb,
        color.hex
          .slice(1)
          .match(/../g)
          .map((x) => parseInt(x, 16)),
      );
  for (const [col, name] of names.entries()) {
    const svg = await readFile(resolve(dir, `${name}.svg`));
    assert(
      !/<(?:image|text|foreignObject)\b|url\(|href=['"]https?:/i.test(
        svg.toString(),
      ),
    );
    const image = await sharp(svg)
      .resize({
        width: 180,
        height: 160,
        fit: "contain",
        background: col === 2 ? "#171b20" : "#f6f5f0",
      })
      .flatten({ background: col === 2 ? "#171b20" : "#f6f5f0" })
      .png()
      .toBuffer();
    layers.push({ input: image, left: col * 230 + 25, top: row * 250 + 75 });
  }
  for (const file of await readdir(
    resolve(root, `web/kits/png/finalist-${id}`),
  )) {
    const expected = Number(file.match(/-(\d+)\.png$/)[1]);
    const image = await sharp(
      resolve(root, `web/kits/png/finalist-${id}`, file),
    ).metadata();
    assert.equal(image.width, expected, file);
    if (file.startsWith("logomark")) assert.equal(image.height, expected, file);
    kitCount++;
  }
  checks.push({
    finalist: id,
    originalSVGBytes: original.length,
    originalUnchanged: true,
    PNG512: true,
    ICO: true,
    RGB: true,
    svgPathsOnly: true,
  });
}
const labels = `<svg xmlns="http://www.w3.org/2000/svg" width="1150" height="800"><rect width="1150" height="800" fill="#f6f5f0"/><g font-family="sans-serif" fill="#252b28" font-size="16">${["Full color", "One color", "Reversed on dark", "Outlined wordmark", "Horizontal lockup"].map((name, col) => `<text x="${col * 230 + 25}" y="30">${name}</text>`).join("")}${["A · Keystone", "B · Orbit", "C · Lattice"].map((name, row) => `<text x="25" y="${row * 250 + 65}">${name}</text>`).join("")}</g></svg>`;
await sharp(Buffer.from(labels))
  .composite(layers)
  .png()
  .toFile(resolve(root, "docs/frontend/asset-contact-sheet.png"));
for (const file of await files(resolve(root, "web/public"))) {
  const relative = file.slice(resolve(root, "web/public").length + 1);
  assert.equal(
    sha256(await readFile(file)),
    sha256(await readFile(resolve(root, "dist", relative))),
    `Export byte mismatch: ${relative}`,
  );
}
const report = {
  checks,
  repositoryPNGCount: kitCount,
  publicAssetsMatchExport: true,
};
await writeFile(
  resolve(root, "docs/frontend/asset-checks.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
