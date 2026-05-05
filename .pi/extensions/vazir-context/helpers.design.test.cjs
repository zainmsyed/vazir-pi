// Design-system helper regression tests
// Run: node .pi/extensions/vazir-context/helpers.design.test.cjs

const fs = require("fs");
const path = require("path");

const TMP = path.join(__dirname, "__test_tmp__");

function cleanup() {
  if (fs.existsSync(TMP)) {
    fs.rmSync(TMP, { recursive: true, force: true });
  }
}

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    console.error(`FAIL: ${label}`);
    console.error(`  expected: ${e}`);
    console.error(`  actual:   ${a}`);
    process.exitCode = 1;
    return false;
  }
  console.log(`PASS: ${label}`);
  return true;
}

// ── Production implementations (copied from helpers.ts, TypeScript stripped) ──
// Keep these snippets in sync with helpers.ts. The source-sync checks below
// fail if the production implementation changes without this regression test
// being reviewed.

const helpersSource = fs.readFileSync(path.join(__dirname, "helpers.ts"), "utf8");

function assertSourceContains(snippet, label) {
  if (!helpersSource.includes(snippet)) {
    console.error(`FAIL: source-sync — ${label}`);
    console.error(`  missing snippet: ${snippet}`);
    process.exitCode = 1;
    return false;
  }
  console.log(`PASS: source-sync — ${label}`);
  return true;
}

function extractHexColors(text) {
  const hexSet = new Set();
  const matches = text.match(/#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])/g);
  if (matches) {
    for (const m of matches) {
      const len = m.length - 1;
      if (len === 3 || len === 6 || len === 8) {
        hexSet.add(m.toLowerCase());
      }
    }
  }
  return [...hexSet];
}

function extractTypographyHints(text) {
  const fontMatch = text.match(/(?:font[-\s]?family|typeface)\s*[:=]\s*([^\n]+)/i);
  const scaleMatch = text.match(/(?:scale|sizes?)\s*[:=]\s*([^\n]+)/i);
  return {
    font: fontMatch?.[1]?.trim(),
    scale: scaleMatch?.[1]?.trim(),
  };
}

function extractSpacingHints(text) {
  const spacingSection = text.match(/##\s+Spacing[\s\S]*?(?=\n##\s+|$)/i)?.[0] ?? text;
  const baseMatch = spacingSection.match(/(?:base[-\s]?unit|grid|spacing[-\s]?base)\s*[:=]\s*([^\n]+)/i);
  const scaleMatch = spacingSection.match(/(?:spacing[-\s]?scale|scale)\s*[:=]\s*([^\n]+)/i);
  return {
    baseUnit: baseMatch?.[1]?.trim(),
    scale: scaleMatch?.[1]?.trim(),
  };
}

function isUiStory(content) {
  const scopeMatch = content.match(/## Scope[\s\S]*?(?=## Out of scope|## Dependencies|$)/i);
  if (!scopeMatch) return false;
  const scope = scopeMatch[0];
  const uiExtensions = new Set([".tsx", ".jsx", ".css", ".scss", ".html", ".svelte"]);
  const lines = scope.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ")) continue;
    const pathPart = trimmed.slice(2).trim().split(/\s+/)[0];
    if (!pathPart) continue;
    const ext = path.extname(pathPart).toLowerCase();
    if (uiExtensions.has(ext)) return true;
  }
  return false;
}

function hasUiTypeOverride(content) {
  return /^\*\*Type:\*\*\s*ui\b/m.test(content);
}

function seedDesignFromIntake(cwd) {
  const refsDir = path.join(cwd, ".context", "intake", "references");
  if (!fs.existsSync(refsDir)) return { seeded: false, note: "" };

  const designKeywords = /(?:style.?guide|brand|design.?token|colour|color|palette|typography|spacing|theme|visual|ui.?kit)/i;
  let candidateFiles = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (designKeywords.test(entry.name) || designKeywords.test(fs.readFileSync(fullPath, "utf8").slice(0, 2000))) {
        candidateFiles.push(fullPath);
      }
    }
  }
  walk(refsDir);

  if (candidateFiles.length === 0) return { seeded: false, note: "" };

  let colors = [];
  let font;
  let typeScale;
  let baseUnit;
  let spacingScale;

  for (const filePath of candidateFiles) {
    const text = fs.readFileSync(filePath, "utf8");
    colors.push(...extractHexColors(text));
    const typography = extractTypographyHints(text);
    if (typography.font && !font) font = typography.font;
    if (typography.scale && !typeScale) typeScale = typography.scale;
    const spacing = extractSpacingHints(text);
    if (spacing.baseUnit && !baseUnit) baseUnit = spacing.baseUnit;
    if (spacing.scale && !spacingScale) spacingScale = spacing.scale;
  }

  const dsLines = [
    "# Design System",
    "",
    "<!-- source: intake -->",
    "<!-- Keep under ~300 tokens. Colours, typography, spacing, and top-level component conventions. -->",
    "",
  ];

  if (colors.length > 0) {
    dsLines.push("## Colours");
    const unique = [...new Set(colors)].slice(0, 6);
    for (let i = 0; i < unique.length; i++) {
      dsLines.push(`- ${i === 0 ? "Primary" : i === 1 ? "Secondary" : `Color ${i + 1}`}: ${unique[i]}`);
    }
    dsLines.push("");
  }

  dsLines.push("## Typography");
  dsLines.push(`- Font family: ${font || "—"}`);
  dsLines.push(`- Scale: ${typeScale || "—"}`);
  dsLines.push("");

  dsLines.push("## Spacing");
  dsLines.push(`- Base unit: ${baseUnit || "—"}`);
  dsLines.push(`- Scale: ${spacingScale || "—"}`);
  dsLines.push("");

  dsLines.push("## Component conventions", "- —", "");

  const designDir = path.join(cwd, ".context", "design");
  fs.mkdirSync(designDir, { recursive: true });
  fs.writeFileSync(path.join(designDir, "design-system.md"), dsLines.join("\n"));

  return {
    seeded: true,
    note: `Seeded design system from ${candidateFiles.length} intake file${candidateFiles.length === 1 ? "" : "s"}`,
  };
}

// ── Tests ──

console.log("=== source-sync ===");
assertSourceContains("const matches = text.match(/#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])/g);", "hex extraction regex");
assertSourceContains("const fontMatch = text.match(/(?:font[-\\s]?family|typeface)\\s*[:=]\\s*([^\\n]+)/i);", "typography font regex");
assertSourceContains("const spacingSection = text.match(/##\\s+Spacing[\\s\\S]*?(?=\\n##\\s+|$)/i)?.[0] ?? text;", "spacing section scoping");
assertSourceContains("const scaleMatch = spacingSection.match(/(?:spacing[-\\s]?scale|scale)\\s*[:=]\\s*([^\\n]+)/i);", "spacing scale regex");

console.log("\n=== extractHexColors ===");
assertEqual(
  extractHexColors("Colors: #2D6BE4, #1A1A2E, #ABC").sort(),
  ["#1a1a2e", "#2d6be4", "#abc"],
  "extracts 3-digit and 6-digit hex"
);
assertEqual(
  extractHexColors("Alpha: #2D6BE4FF, #FF00FF80").sort(),
  ["#2d6be4ff", "#ff00ff80"],
  "extracts 8-digit hex with alpha"
);
assertEqual(
  extractHexColors("No colors here"),
  [],
  "returns empty when no hex present"
);
assertEqual(
  extractHexColors("Invalid: #GGGGGG, #12345, #123456789"),
  [],
  "ignores invalid hex lengths"
);
assertEqual(
  extractHexColors("Dupes: #ABC, #abc, #Abc").length,
  1,
  "deduplicates case-insensitively"
);

console.log("\n=== extractTypographyHints ===");
assertEqual(
  extractTypographyHints("Font family: Inter, system-ui\nScale: 12px, 16px"),
  { font: "Inter, system-ui", scale: "12px, 16px" },
  "extracts font family and scale"
);
assertEqual(
  extractTypographyHints("Font: 16px\nScale: 12px"),
  { font: undefined, scale: "12px" },
  'ignores bare "font:" lines'
);
assertEqual(
  extractTypographyHints("Typeface = Roboto\nSize = 14px"),
  { font: "Roboto", scale: "14px" },
  "matches typeface and size alias"
);
assertEqual(
  extractTypographyHints("Font-family: Arial\nSizes: 10px / 14px / 18px"),
  { font: "Arial", scale: "10px / 14px / 18px" },
  "matches font-family hyphenated and sizes alias"
);
assertEqual(
  extractTypographyHints("Font family: Inter\nScale: 12px\nMore text"),
  { font: "Inter", scale: "12px" },
  "does not span newlines"
);

console.log("\n=== extractSpacingHints ===");
assertEqual(
  extractSpacingHints("Base unit: 4px\nSpacing scale: 4, 8, 12, 16"),
  { baseUnit: "4px", scale: "4, 8, 12, 16" },
  "extracts base unit and spacing scale"
);
assertEqual(
  extractSpacingHints("## Typography\n- Scale: 12px, 16px\n## Spacing\n- Base unit: 4px\n- Scale: 4, 8, 12, 16"),
  { baseUnit: "4px", scale: "4, 8, 12, 16" },
  "extracts plain Scale from Spacing section without using typography scale"
);
assertEqual(
  extractSpacingHints("Grid = 8px\nSpacing scale = 8, 16, 24"),
  { baseUnit: "8px", scale: "8, 16, 24" },
  "matches grid and spacing-scale variants"
);
assertEqual(
  extractSpacingHints("Base unit: 4px\nSpacing scale: 4\nMore text here"),
  { baseUnit: "4px", scale: "4" },
  "does not span newlines in capture groups"
);

console.log("\n=== isUiStory / hasUiTypeOverride ===");

const uiStoryContent = `# Story 001: Test
**Status:** not-started
**Type:** ui
## Scope — files this story may touch
- src/components/Button.tsx
- src/utils/api.ts
`;

const nonUiStoryContent = `# Story 002: Test
**Status:** not-started
## Scope — files this story may touch
- src/utils/api.ts
- src/types/user.ts
`;

assertEqual(isUiStory(uiStoryContent), true, "isUiStory true when .tsx in scope");
assertEqual(isUiStory(nonUiStoryContent), false, "isUiStory false when only .ts in scope");
assertEqual(hasUiTypeOverride(uiStoryContent), true, "hasUiTypeOverride true when Type: ui");
assertEqual(hasUiTypeOverride(nonUiStoryContent), false, "hasUiTypeOverride false when no Type");

console.log("\n=== seedDesignFromIntake ===");

cleanup();
fs.mkdirSync(path.join(TMP, ".context", "intake", "references"), { recursive: true });
fs.writeFileSync(
  path.join(TMP, ".context", "intake", "references", "brand-style-guide.md"),
  `# Brand Style Guide
## Colors
- Primary: #2D6BE4
- Secondary: #1A1A2E
- Surface: #F5F5F7
- Text: #111111
## Typography
- Font family: Inter, system-ui
- Scale: 12px, 14px, 16px, 20px, 24px, 32px
## Spacing
- Base unit: 4px
- Scale: 4, 8, 12, 16, 24, 32, 48, 64
`
);

const seedResult = seedDesignFromIntake(TMP);
assertEqual(seedResult.seeded, true, "seedDesignFromIntake returns seeded=true");
assertEqual(seedResult.note, "Seeded design system from 1 intake file", "seedDesignFromIntake returns correct note");

const dsContent = fs.readFileSync(path.join(TMP, ".context", "design", "design-system.md"), "utf8");
assertEqual(dsContent.includes("#2d6be4"), true, "design-system.md includes primary color");
assertEqual(dsContent.includes("Inter, system-ui"), true, "design-system.md includes font family");
assertEqual(dsContent.includes("4px"), true, "design-system.md includes base unit");
assertEqual(dsContent.includes("4, 8, 12, 16"), true, "design-system.md includes spacing scale");

cleanup();

console.log("\n=== ALL TESTS COMPLETE ===");
if (process.exitCode) {
  console.log("Some tests failed.");
} else {
  console.log("All tests passed.");
}
