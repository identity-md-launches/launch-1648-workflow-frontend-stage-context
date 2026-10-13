import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import opentype from "opentype.js";
import { root } from "./manifest.mjs";
const publicDir = resolve(root, "web/public");
const definitions = [
  {
    id: "a",
    name: "Keystone",
    display: "Space Grotesk",
    slug: "space-grotesk",
    primary: ["#1F2A6B", "#F26B4E"],
    secondary: ["#D7DCEF", "#FFD8C9"],
    neutral: ["#FFFFFF", "#F5F4F0", "#1E233A"],
    concept: "A shared foundation",
    rationale:
      "A hexagonal frame gathers distinct contributions around a common center. The cross is a meeting point: individual seats adding to one collective identity.",
    voice: "Direct, grounded and constructive.",
    proportions:
      "60% warm neutral, 25% indigo, 10% coral and 5% supporting tints.",
    clear:
      "Use one cross-stroke width (6 units of the 64-unit mark) on every side.",
    minimum:
      "16 CSS pixels for the mark alone; 120 CSS pixels for the horizontal lockup.",
    use: "Use indigo for navigation, coral for illustration accents and white for negative space. The cross always remains centered.",
    avoid:
      "Do not rotate the hexagon, stretch its frame, separate the cross, add gradients or recolor individual cross strokes.",
  },
  {
    id: "b",
    name: "Orbit",
    display: "Fraunces",
    slug: "fraunces",
    primary: ["#0B3D3A", "#2EC4B6"],
    secondary: ["#C8E6DF", "#D3B98C"],
    neutral: ["#F4F1DE", "#FFFFFF", "#14302D"],
    concept: "Independent, in connection",
    rationale:
      "A center, a ring and a satellite describe an open network of people. The circle gives the system continuity while the off-center satellite leaves room for an individual point of view.",
    voice: "Open, thoughtful and welcoming.",
    proportions: "60% cream, 25% deep green, 10% turquoise and 5% sand.",
    clear:
      "Keep 8 units of the 64-unit mark clear on each side, equal to the center circle radius.",
    minimum:
      "16 CSS pixels for the mark alone; 128 CSS pixels for the horizontal lockup.",
    use: "Keep the satellite at the right edge of the ring. Pair expressive serif headings with quiet sans-serif instructions.",
    avoid:
      "Do not move the satellite, turn the orbit into a spiral, use a glow effect, tilt the mark or add another ring.",
  },
  {
    id: "c",
    name: "Lattice",
    display: "Space Mono",
    slug: "space-mono",
    primary: ["#22223B", "#F2A900"],
    secondary: ["#CDCDE2", "#FFE4A1"],
    neutral: ["#FFFFFF", "#F3F3F7", "#282833"],
    concept: "Many seats, one system",
    rationale:
      "Four modular corners connect through a bright central unit. The regular grid makes contributions visible and gives the identity a precise, repeatable construction language.",
    voice: "Precise, transparent and practical.",
    proportions: "65% white, 20% ink, 10% amber and 5% supporting tints.",
    clear:
      "Keep 12 units of the 64-unit mark clear on each side, equal to one outer tile.",
    minimum:
      "16 CSS pixels for the mark alone; 128 CSS pixels for the horizontal lockup.",
    use: "Align applications to a square grid. Use the amber tiles as supporting geometry without treating them as interface status lights.",
    avoid:
      "Do not round tiles into circles, change tile spacing, replace the white center, skew the grid or add more tiles.",
  },
];
const fonts = [
  ["dm-sans", 400],
  ["dm-sans", 600],
  ["space-grotesk", 700],
  ["fraunces", 700],
  ["space-mono", 700],
];
await mkdir(resolve(publicDir, "fonts"), { recursive: true });
for (const [slug, weight] of fonts)
  await copyFile(
    resolve(
      root,
      `web/node_modules/@fontsource/${slug}/files/${slug}-latin-${weight}-normal.woff2`,
    ),
    resolve(publicDir, `fonts/${slug}-latin-${weight}-normal.woff2`),
  );
for (const slug of [...new Set(fonts.map((f) => f[0]))])
  await copyFile(
    resolve(root, `web/node_modules/@fontsource/${slug}/LICENSE`),
    resolve(publicDir, `fonts/${slug}-OFL.txt`),
  );
const lum = (hex) => {
  const rgb = hex
    .slice(1)
    .match(/../g)
    .map((x) => parseInt(x, 16) / 255)
    .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
};
const ratio = (a, b) =>
  (
    (Math.max(lum(a), lum(b)) + 0.05) /
    (Math.min(lum(a), lum(b)) + 0.05)
  ).toFixed(2);
const rgb = (hex) =>
  hex
    .slice(1)
    .match(/../g)
    .map((x) => parseInt(x, 16));
for (const d of definitions) {
  const dir = resolve(publicDir, `guides/finalist-${d.id}`);
  await mkdir(dir, { recursive: true });
  const original = await readFile(
    resolve(root, `art/finalist-${d.id}/logomark.svg`),
    "utf8",
  );
  await writeFile(resolve(dir, "logomark.svg"), original);
  const mono = original.replace(/#[a-fA-F0-9]{6}/g, (hex) =>
    hex.toUpperCase() === d.primary[0] ||
    (d.id === "a" && hex.toUpperCase() === "#FFFFFF")
      ? "#171B20"
      : "#FFFFFF",
  );
  await writeFile(resolve(dir, "logomark-mono.svg"), mono);
  const reversed = mono
    .replaceAll("#171B20", "#TEMP")
    .replaceAll("#FFFFFF", "#171B20")
    .replaceAll("#TEMP", "#FFFFFF");
  await writeFile(resolve(dir, "logomark-reversed.svg"), reversed);
  const font = opentype.loadSync(
    resolve(
      root,
      `web/node_modules/@fontsource/${d.slug}/files/${d.slug}-latin-700-normal.woff`,
    ),
  );
  const path = font.getPath("IMD", 0, 74, 88).toPathData(2);
  const width = Math.ceil(font.getAdvanceWidth("IMD", 88));
  const wordmark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 100"><title>IMD ${d.name} wordmark</title><path fill="${d.primary[0]}" d="${path}"/></svg>`;
  await writeFile(resolve(dir, "wordmark.svg"), wordmark);
  const inner = original.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const lockup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width + 110} 100"><title>IMD ${d.name} lockup</title><g transform="translate(0 10) scale(1.25)">${inner}</g><path transform="translate(110 0)" fill="${d.primary[0]}" d="${path}"/></svg>`;
  await writeFile(resolve(dir, "lockup.svg"), lockup);
  await sharp(Buffer.from(original))
    .resize(512, 512)
    .png()
    .toFile(resolve(dir, "logomark-512.png"));
  const png = await sharp(Buffer.from(original))
    .resize(32, 32)
    .png()
    .toBuffer();
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header[6] = 32;
  header[7] = 32;
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  await writeFile(resolve(dir, "favicon.ico"), Buffer.concat([header, png]));
  const colors = Object.fromEntries(
    ["primary", "secondary", "neutral"].map((group) => [
      group,
      d[group].map((hex) => ({ hex, rgb: rgb(hex) })),
    ]),
  );
  await writeFile(
    resolve(dir, "colors.json"),
    JSON.stringify(colors, null, 2) + "\n",
  );
  const identity = {
    name: d.name,
    edition: 1,
    rationale: d.rationale,
    colors,
    typefaces: {
      display: { family: d.display, license: "OFL-1.1" },
      text: { family: "DM Sans", license: "OFL-1.1" },
    },
    typeScale: [14, 16, 20, 28, 40, 56],
    license: "CC0-1.0",
    provenance:
      "Guide kit authored in the frontend stage from the exact deployed logomark; only logomarks were present in the pinned source bundle.",
  };
  await writeFile(
    resolve(dir, "identity.json"),
    JSON.stringify(identity, null, 2) + "\n",
  );
  await writeFile(
    resolve(dir, "tokens.css"),
    `:root {\n  --brand-ink: ${d.primary[0]};\n  --brand-accent: ${d.primary[1]};\n  --brand-surface: ${d.neutral[1]};\n  --brand-text: ${d.neutral[2]};\n  --brand-display: '${d.display}', sans-serif;\n  --brand-body: 'DM Sans', sans-serif;\n  --type-small: 0.875rem;\n  --type-body: 1rem;\n  --type-subheading: 1.25rem;\n  --type-heading: 1.75rem;\n  --type-title: 2.5rem;\n  --type-display: 3.5rem;\n}\n`,
  );
  const guide = `# ${d.name}\n\n## Overview\n\n${d.concept}. ${d.rationale}\n\nVisualIdentity.md, Edition 1. This is a community proposal for IMD, not official branding. Tone: ${d.voice}\n\n## Logo\n\n![${d.name} logomark](logomark.svg)\n\n![IMD ${d.name} horizontal lockup](lockup.svg)\n\n### Clear space and minimum size\n\n${d.clear} ${d.minimum} Test the mark at its actual output size. Use the horizontal lockup when the name must be readable, and the mark alone in square avatars. Align to a layout edge, never against a container border.\n\n### Color variations\n\nUse the original full-color mark on a neutral surface. The supplied one-color version uses ink and negative space; the reversed version uses white and dark negative space. The original deployed mark is preserved exactly. ${d.use}\n\n### Incorrect usage\n\n${d.avoid} Do not use the mark as a certification badge, endorsement or official IMD signature.\n\n## Color\n\n${d.proportions}\n\n| Role | HEX | RGB |\n| --- | --- | --- |\n${Object.entries(
    colors,
  )
    .flatMap(([group, cs]) =>
      cs.map(
        (c, i) => `| ${group} ${i + 1} | ${c.hex} | ${c.rgb.join(", ")} |`,
      ),
    )
    .join(
      "\n",
    )}\n\n### Accessible pairings\n\nWCAG 2.2 AA normal text requires 4.5:1, and large text requires 3:1. Ratios below are calculated from sRGB relative luminance.\n\n| Text | Background | Ratio | Usage |\n| --- | --- | --- | --- |\n| ${d.primary[0]} | #FFFFFF | ${ratio(d.primary[0], "#FFFFFF")}:1 | Normal text |\n| #FFFFFF | ${d.primary[0]} | ${ratio(d.primary[0], "#FFFFFF")}:1 | Normal text |\n| ${d.primary[0]} | ${d.primary[1]} | ${ratio(d.primary[0], d.primary[1])}:1 | ${Number(ratio(d.primary[0], d.primary[1])) >= 4.5 ? "Normal text" : "Large text only"} |\n\nTints and accents are for supporting geometry, not body text on white. Never use color alone for errors, selection or voting results. Pair color with a label.\n\n## Typography\n\nDisplay: **${d.display}**, weight 700, licensed under the SIL Open Font License. Text: **DM Sans**, weights 400 and 600, also OFL. Font licenses are included in the website fonts directory. Outlined wordmarks need no installed fonts.\n\nScale: 14, 16, 20, 28, 40 and 56 px. Body text starts at 16 px with a 1.6 line height. Headings use 1.1–1.2 and sentence case. Keep prose below 70 characters per line. ${d.id === "c" ? "Reserve the monospace display face for short titles and numeric labels; use DM Sans for paragraphs." : ""}\n\nWeb fallbacks: ${d.display}, ${d.id === "b" ? "Georgia, serif" : d.id === "c" ? "Courier New, monospace" : "Arial, sans-serif"} for display; DM Sans, system-ui, sans-serif for text. Host fonts locally, use WOFF2, and retain the font licenses.\n\n## Applications\n\n### Site header\n\nUse the horizontal lockup at 128–180 px wide with the specified clear space. Keep navigation in DM Sans. Separate identity from transaction state: a brand accent never replaces an error message or a disabled control.\n\n### Avatar\n\nCenter the mark in a square, keep clear space inside the crop, and inspect at 32 and 64 px. Use the original mark for community profiles and label the context as a proposal.\n\n### Token icon\n\nUse the mark alone, with enough padding to survive a circular crop. The 512 px PNG and favicon are ready for small contexts. Do not add price claims or verification marks.\n\n## Licensing\n\nThe original mark and this guide kit are dedicated to the public domain under CC0-1.0. Adopt, change or ignore them; no endorsement is implied. Font software remains under its included OFL licenses. These AI-created identities have not been checked against a trademark registry.\n\n## Version history\n\n- Edition 1, guide v1.0: complete frontend kit assembled around the deployed ${d.name} logomark. Earlier full guides were not present in the pinned source bundle.\n- The community winner is determined solely by BrandGenesisNFT. A collector mint is never a vote.\n`;
  await writeFile(resolve(dir, "BRAND_GUIDELINES.md"), guide);
  const kit = resolve(root, `web/kits/png/finalist-${d.id}`);
  await mkdir(kit, { recursive: true });
  for (const [name, svg] of [
    ["logomark", original],
    ["logomark-mono", mono],
    ["logomark-reversed", reversed],
    ["wordmark", wordmark],
    ["lockup", lockup],
  ]) {
    const sizes = name.startsWith("logomark")
      ? [16, 32, 64, 128, 256, 512, 1024, 2048]
      : [512, 1024, 2048];
    for (const size of sizes) {
      await sharp(Buffer.from(svg))
        .resize({ width: size })
        .png()
        .toFile(resolve(kit, `${name}-${size}.png`));
    }
  }
}
const favicon =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#252b28"/><path d="M15 18h9v28h-9zm13 0h9v28h-9zm13 0h9v28h-9z" fill="#f6f5f0"/><path d="M15 37h35v9H15z" fill="#ed653f"/></svg>';
await writeFile(resolve(publicDir, "favicon.svg"), favicon);
let marks = "";
for (let i = 0; i < 3; i++) {
  const svg = await readFile(
    resolve(publicDir, `guides/finalist-${definitions[i].id}/logomark.svg`),
    "utf8",
  );
  marks += `<g transform="translate(${100 + i * 210} 325) scale(2)">${svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "")}</g>`;
}
const social = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#f6f5f0"/><text x="80" y="95" font-family="sans-serif" font-size="28" fill="#38433d">VisualIdentity.md / Edition 1</text><text x="80" y="220" font-family="sans-serif" font-size="64" font-weight="bold" fill="#252b28">A community identity.</text><text x="80" y="277" font-family="sans-serif" font-size="30" fill="#536158">Three proposals. Seat holders decide.</text>${marks}<text x="80" y="578" font-family="sans-serif" font-size="24" fill="#536158">A community proposal, not official IMD branding.</text></svg>`;
await sharp(Buffer.from(social)).png().toFile(resolve(publicDir, "social.png"));
console.log(
  "Created three complete guide kits, local fonts, share image and repository-only PNG kits.",
);
