/// <reference path="../../types/node-runtime-ambient.d.ts" />

import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";

const MANAGED_THEME_VERSION = "2026-05-31";
const MANAGED_THEME_MARKER = "managed-by: vazir";

export interface FossilThemeDesignSpec {
  brandDirection: string[];
  constraints: string[];
  colours: string[];
  typography: string[];
  spacingAndShape: string[];
  componentConventions: string[];
  pageBoundaries: string[];
  componentHighlights: string[];
}

export interface ManagedFossilThemeAssets {
  version: string;
  marker: string;
  spec: FossilThemeDesignSpec;
  css: string;
  header: string;
  footer: string;
}

export type ManagedFossilThemeStatus = "installed" | "replaced" | "updated" | "skipped";

export interface ManagedFossilThemeApplyResult {
  status: ManagedFossilThemeStatus;
  message: string;
  version: string;
}

interface ResolvedThemeTokens {
  background: string;
  surface: string;
  border: string;
  text: string;
  accent: string;
  accentSoft: string;
  pillNeutral: string;
  codeBg: string;
  link: string;
  fontSans: string;
  fontMono: string;
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  sidebarWidth: string;
  contentMaxWidth: string;
  shellMaxWidth: string;
  topbarGap: string;
  bodyPaddingX: string;
  bodyPaddingY: string;
}

function readIfExists(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

function designFile(cwd: string, name: string): string {
  return path.join(cwd, ".context", "design", name);
}

function extractMarkdownSection(content: string, heading: string): string {
  const lines = content.split("\n");
  const headingIndex = lines.findIndex(line => line.trim() === heading);
  if (headingIndex < 0) return "";
  const section: string[] = [];
  for (let i = headingIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^##\s+/.test(line) || /^###\s+/.test(line)) break;
    section.push(line);
  }
  return section.join("\n").trim();
}

function bulletLines(content: string, heading: string): string[] {
  return extractMarkdownSection(content, heading)
    .split("\n")
    .map(line => line.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean);
}

function fallback(values: string[], defaults: string[]): string[] {
  return values.length > 0 ? values : defaults;
}

export function readFossilThemeDesignSpec(cwd: string): FossilThemeDesignSpec {
  const brand = readIfExists(designFile(cwd, "brand.md"));
  const designSystem = readIfExists(designFile(cwd, "design-system.md"));
  const components = readIfExists(designFile(cwd, "components.md"));

  return {
    brandDirection: fallback(bulletLines(brand, "## Theme direction"), ["Product feel: docs-first managed Fossil skin"]),
    constraints: fallback(bulletLines(brand, "## Constraints"), ["Implement with CSS/header/footer only"]),
    colours: fallback(bulletLines(designSystem, "## Colours"), ["Background: dark", "Surface: raised dark panels", "Accent: teal/mint"]),
    typography: fallback(bulletLines(designSystem, "## Typography"), ["Font family: modern sans stack", "Code/hash font: readable monospace"]),
    spacingAndShape: fallback(bulletLines(designSystem, "## Spacing and shape"), ["Base unit: 8px", "Radius: soft small-to-medium rounding"]),
    componentConventions: fallback(bulletLines(designSystem, "## Component conventions"), ["Top nav is simple and app-like", "Wiki/docs pages may use a persistent left sidebar"]),
    pageBoundaries: fallback(bulletLines(designSystem, "## Page treatment boundaries"), ["Full treatment pages: wiki/docs", "Cosmetic-only pages: timeline/diff/admin"]),
    componentHighlights: [
      ...bulletLines(components, "## Global shell"),
      ...bulletLines(components, "## Docs/wiki layer"),
      ...bulletLines(components, "## Shared content styling"),
      ...bulletLines(components, "## Constrained Fossil-native pages"),
    ],
  };
}

function specValue(lines: string[], label: string): string | null {
  const lowerLabel = label.toLowerCase();
  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex < 0) continue;
    const key = line.slice(0, colonIndex).trim().toLowerCase();
    if (key !== lowerLabel) continue;
    const value = line.slice(colonIndex + 1).trim();
    if (value) return value;
  }
  return null;
}

function isCssColor(value: string): boolean {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)
    || /^rgba?\(/i.test(value)
    || /^hsla?\(/i.test(value)
    || /^var\(/i.test(value);
}

function phraseColor(value: string, fallbackColor: string): string {
  const normalized = value.toLowerCase();
  if (normalized.includes("near-black") || normalized.includes("charcoal")) return "#1f201d";
  if (normalized.includes("raised dark") || normalized.includes("dark panel")) return "#2d2e2b";
  if (normalized.includes("muted gray")) return "#494b46";
  if (normalized.includes("off-white")) return "#f2f3ef";
  if (normalized.includes("teal") || normalized.includes("mint")) return "#2bb7a1";
  if (normalized.includes("lavender")) return "#ede7ff";
  if (normalized.includes("warm neutral")) return "#f1e8d9";
  return fallbackColor;
}

function resolveColor(value: string | null, fallbackColor: string): string {
  if (!value) return fallbackColor;
  return isCssColor(value) ? value : phraseColor(value, fallbackColor);
}

function resolveFont(value: string | null, fallbackFont: string): string {
  if (!value) return fallbackFont;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—") return fallbackFont;
  return trimmed;
}

function resolveLength(value: string | null, fallbackLength: string): string {
  if (!value) return fallbackLength;
  const match = value.match(/\b\d+(?:\.\d+)?(?:px|rem|em|%)\b/i);
  return match?.[0] ?? fallbackLength;
}

function resolveRadiusSet(value: string | null): { sm: string; md: string; lg: string } {
  const fallback = { sm: "8px", md: "14px", lg: "18px" };
  if (!value) return fallback;
  const match = value.match(/\b\d+(?:\.\d+)?(?:px|rem|em)\b/ig);
  if (match && match.length >= 3) {
    return { sm: match[0], md: match[1], lg: match[2] };
  }
  const normalized = value.toLowerCase();
  if (normalized.includes("small-to-medium")) return fallback;
  if (normalized.includes("round")) return { sm: "10px", md: "16px", lg: "20px" };
  return fallback;
}

function deriveAccentSoft(accent: string): string {
  return accent.toLowerCase() === "#2bb7a1" ? "rgba(43, 183, 161, 0.15)" : "rgba(255,255,255,0.12)";
}

function deriveLink(accent: string): string {
  return accent.toLowerCase() === "#2bb7a1" ? "#5eead4" : accent;
}

function resolveThemeTokens(spec: FossilThemeDesignSpec): ResolvedThemeTokens {
  const background = resolveColor(specValue(spec.colours, "Background"), "#1f201d");
  const surface = resolveColor(specValue(spec.colours, "Surface"), "#2d2e2b");
  const border = resolveColor(specValue(spec.colours, "Border"), "#494b46");
  const text = resolveColor(specValue(spec.colours, "Text"), "#f2f3ef");
  const accent = resolveColor(specValue(spec.colours, "Accent"), "#2bb7a1");
  const radius = resolveRadiusSet(specValue(spec.spacingAndShape, "Radius"));
  const baseUnit = resolveLength(specValue(spec.spacingAndShape, "Base unit"), "8px");
  const fontSans = resolveFont(specValue(spec.typography, "Font family"), 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
  const fontMono = resolveFont(specValue(spec.typography, "Code/hash font"), '"SFMono-Regular", "SF Mono", ui-monospace, "Cascadia Code", Consolas, monospace');

  return {
    background,
    surface,
    border,
    text,
    accent,
    accentSoft: deriveAccentSoft(accent),
    pillNeutral: resolveColor(specValue(spec.colours, "Status pills"), "rgba(255,255,255,0.08)"),
    codeBg: background.toLowerCase() === "#1f201d" ? "#20211f" : "rgba(0,0,0,0.22)",
    link: deriveLink(accent),
    fontSans,
    fontMono,
    radiusSm: radius.sm,
    radiusMd: radius.md,
    radiusLg: radius.lg,
    sidebarWidth: `calc(${baseUnit} * 32.5)`,
    contentMaxWidth: `calc(${baseUnit} * 107.5)`,
    shellMaxWidth: `calc(${baseUnit} * 147.5)`,
    topbarGap: `calc(${baseUnit} * 2.5)`,
    bodyPaddingX: `calc(${baseUnit} * 5)`,
    bodyPaddingY: `calc(${baseUnit} * 4.5)`,
  };
}

function specCommentBlock(spec: FossilThemeDesignSpec): string {
  const lines = [
    `${MANAGED_THEME_MARKER}`,
    `version: ${MANAGED_THEME_VERSION}`,
    ...spec.brandDirection.map(line => `brand: ${line}`),
    ...spec.pageBoundaries.map(line => `boundaries: ${line}`),
  ];
  return lines.map(line => ` * ${line}`).join("\n");
}

function buildCss(spec: FossilThemeDesignSpec): string {
  const tokens = resolveThemeTokens(spec);
  return `/*\n${specCommentBlock(spec)}\n */
:root {
  --vz-bg: ${tokens.background};
  --vz-bg-elevated: ${tokens.surface};
  --vz-surface: ${tokens.surface};
  --vz-surface-2: ${tokens.surface};
  --vz-border: ${tokens.border};
  --vz-text: ${tokens.text};
  --vz-text-muted: #b6b8b2;
  --vz-accent: ${tokens.accent};
  --vz-accent-soft: ${tokens.accentSoft};
  --vz-pill-neutral: ${tokens.pillNeutral};
  --vz-code-bg: ${tokens.codeBg};
  --vz-link: ${tokens.link};
  --vz-shadow: 0 16px 40px rgba(0, 0, 0, 0.24);
  --vz-radius-sm: ${tokens.radiusSm};
  --vz-radius-md: ${tokens.radiusMd};
  --vz-radius-lg: ${tokens.radiusLg};
  --vz-max-width: ${tokens.shellMaxWidth};
  --vz-sidebar-width: ${tokens.sidebarWidth};
  --vz-gap: ${tokens.topbarGap};
  --vz-font-sans: ${tokens.fontSans};
  --vz-font-mono: ${tokens.fontMono};
}

html, body {
  background: var(--vz-bg);
  color: var(--vz-text);
  font-family: var(--vz-font-sans);
}

body {
  margin: 0;
  line-height: 1.6;
}

a {
  color: var(--vz-link);
}

a:hover {
  color: var(--vz-link);
}

pre, code, tt, kbd {
  font-family: var(--vz-font-mono);
}

pre {
  background: var(--vz-code-bg);
  border: 1px solid var(--vz-border);
  border-radius: var(--vz-radius-md);
  color: var(--vz-text);
  overflow-x: auto;
  padding: 16px;
}

code, tt, kbd {
  background: rgba(255,255,255,0.04);
  border-radius: 10px;
  padding: 0.18rem 0.4rem;
}

input, select, textarea, button {
  background: var(--vz-surface);
  border: 1px solid var(--vz-border);
  border-radius: var(--vz-radius-sm);
  color: var(--vz-text);
  font: inherit;
}

button, input[type="submit"] {
  background: var(--vz-accent);
  border-color: transparent;
  color: #0f1514;
  cursor: pointer;
  font-weight: 600;
}

hr, table, th, td {
  border-color: var(--vz-border);
}

table {
  background: transparent;
  border-collapse: collapse;
  width: 100%;
}

th, td {
  border: 1px solid var(--vz-border);
  padding: 10px 12px;
}

th {
  background: rgba(255,255,255,0.03);
  text-align: left;
}

#header, #footer, .header, .footer {
  width: 100%;
}

.vz-shell {
  margin: 0 auto;
  max-width: var(--vz-max-width);
}

.vz-topbar {
  align-items: center;
  background: var(--vz-surface);
  border: 1px solid var(--vz-border);
  border-radius: var(--vz-radius-lg) var(--vz-radius-lg) 0 0;
  box-shadow: var(--vz-shadow);
  display: grid;
  gap: var(--vz-gap);
  grid-template-columns: auto 1fr auto;
  margin: 28px auto 0;
  padding: 18px 22px;
}

.vz-brand {
  align-items: center;
  display: inline-flex;
  font-size: 1.05rem;
  font-weight: 600;
  gap: 14px;
}

.vz-brand-mark {
  align-items: center;
  background: linear-gradient(180deg, #23b59e, #1f9e8b);
  border-radius: 12px;
  color: #effffb;
  display: inline-flex;
  font-size: 1rem;
  height: 40px;
  justify-content: center;
  width: 40px;
}

.vz-brand a,
.vz-topnav a,
.vz-login a,
.vz-footer a {
  color: inherit;
  text-decoration: none;
}

.vz-topnav {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}

.vz-topnav a {
  border-bottom: 2px solid transparent;
  color: var(--vz-text-muted);
  padding: 8px 6px 12px;
}

.vz-topnav a:hover,
.vz-topnav a.vz-active {
  border-bottom-color: var(--vz-accent);
  color: var(--vz-text);
}

.vz-login {
  color: var(--vz-text-muted);
  font-size: 0.95rem;
}

.vz-body {
  background: var(--vz-surface);
  border-left: 1px solid var(--vz-border);
  border-right: 1px solid var(--vz-border);
  min-height: 360px;
  padding: 0;
}

.vz-footer {
  background: var(--vz-surface);
  border: 1px solid var(--vz-border);
  border-radius: 0 0 var(--vz-radius-lg) var(--vz-radius-lg);
  color: var(--vz-text-muted);
  display: flex;
  font-size: 0.92rem;
  justify-content: space-between;
  margin: 0 auto 28px;
  padding: 14px 22px 18px;
}

.content, .content1, .content2, div.content {
  box-sizing: border-box;
  margin: 0 auto;
  max-width: ${tokens.contentMaxWidth};
  padding: ${tokens.bodyPaddingY} ${tokens.bodyPaddingX} calc(${tokens.bodyPaddingY} + 16px);
}

div.content h1, div.content h2, div.content h3,
.content h1, .content h2, .content h3 {
  color: var(--vz-text);
  letter-spacing: -0.02em;
  line-height: 1.15;
}

div.content h1, .content h1 {
  font-size: 3rem;
  font-weight: 650;
  margin-bottom: 12px;
}

div.content p, div.content li, .content p, .content li {
  color: var(--vz-text-muted);
}

/* Docs-first wiki treatment. Use these classes inside curated wiki pages. */
.vz-docs-layout {
  display: grid;
  gap: 0;
  grid-template-columns: minmax(220px, var(--vz-sidebar-width)) 1fr;
  min-height: 720px;
}

.vz-docs-sidebar {
  border-right: 1px solid var(--vz-border);
  padding: 28px 22px;
}

.vz-docs-sidebar h2,
.vz-docs-sidebar h3 {
  color: var(--vz-text-muted);
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  margin: 0 0 14px;
  text-transform: uppercase;
}

.vz-docs-sidebar ul {
  list-style: none;
  margin: 0 0 24px;
  padding: 0;
}

.vz-docs-sidebar li + li {
  margin-top: 6px;
}

.vz-docs-sidebar a {
  border-radius: 10px;
  color: var(--vz-text-muted);
  display: block;
  padding: 8px 10px;
  text-decoration: none;
}

.vz-docs-sidebar a:hover,
.vz-docs-sidebar a.vz-active {
  background: rgba(43, 183, 161, 0.15);
  color: var(--vz-accent);
}

.vz-docs-content {
  padding: ${tokens.bodyPaddingY} calc(${tokens.bodyPaddingX} + 6px) calc(${tokens.bodyPaddingY} + 20px);
}

.vz-subnav {
  color: var(--vz-text-muted);
  display: flex;
  gap: 20px;
  margin-bottom: 26px;
}

.vz-subnav a {
  color: var(--vz-text-muted);
  text-decoration: none;
}

.vz-page-kicker {
  color: var(--vz-text-muted);
  font-size: 1.05rem;
  margin: 0 0 18px;
}

.vz-page-subtitle {
  color: var(--vz-text-muted);
  font-size: 1.35rem;
  margin-top: 0;
}

.vz-changelog-entry {
  border-top: 1px solid var(--vz-border);
  display: grid;
  gap: 16px;
  grid-template-columns: 1fr auto;
  padding: 28px 0;
}

.vz-changelog-entry:first-of-type {
  border-top: 0;
}

.vz-changelog-meta {
  color: var(--vz-text-muted);
}

.vz-pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 12px 0 0;
}

.vz-pill {
  background: var(--vz-accent-soft);
  border-radius: 999px;
  color: var(--vz-accent);
  display: inline-flex;
  font-size: 0.95rem;
  gap: 6px;
  padding: 5px 14px;
}

.vz-pill.vz-pill-neutral {
  background: var(--vz-pill-neutral);
  color: var(--vz-text-muted);
}

.vz-hash-badge {
  align-self: start;
  background: var(--vz-accent-soft);
  border-radius: 10px;
  color: var(--vz-accent);
  font-family: var(--vz-font-mono);
  font-size: 0.95rem;
  padding: 8px 14px;
  white-space: nowrap;
}

.vz-code-badge {
  background: var(--vz-code-bg);
  border: 1px solid rgba(255,255,255,0.04);
  border-radius: 10px;
  color: var(--vz-text);
  font-family: var(--vz-font-mono);
  padding: 0.18rem 0.45rem;
}

/* Conservative styling for native Fossil pages. Keep structure intact. */
.timelineTable,
#timelineTable0,
div.timelineTable,
table.timelineTable,
table.reportfmt,
table.browser,
table.filetree,
table.diff {
  background: transparent;
}

.timelineTable td,
.timelineTable th,
table.diff td,
table.diff th,
table.reportfmt td,
table.reportfmt th {
  padding-top: 10px;
  padding-bottom: 10px;
}

.timelineTable tr:hover td,
table.reportfmt tr:hover td,
table.browser tr:hover td,
table.filetree tr:hover td {
  background: rgba(255,255,255,0.03);
}

.timelineLeaf,
.timelineHistLink,
.timelineTime,
.timelineDateRow,
.timelineModernDetail {
  color: var(--vz-text-muted);
}

.timelineComment {
  color: var(--vz-text);
}

.timelineHistLink,
.timelineLeaf a,
.timelineComment a,
.timelineTime a {
  color: var(--vz-text);
}

.timelineModernCell,
.timelineColumnarCell,
.timelineDetailCell,
.timelineModernCell[id],
.timelineColumnarCell[id],
.timelineDetailCell[id] {
  background: var(--vz-surface) !important;
  border: 1px solid var(--vz-border) !important;
  color: var(--vz-text) !important;
}

.timelineSecondary {
  background-color: rgba(43, 183, 161, 0.12) !important;
}

.timelineSelected {
  background-color: rgba(43, 183, 161, 0.25) !important;
  border: 1px solid var(--vz-accent) !important;
  box-shadow: 0 0 0 1px var(--vz-accent) !important;
}

span.uuid, span.hash, .checkin-hash, .timelineHistLink .uuid {
  background: rgba(255,255,255,0.05);
  border-radius: 10px;
  font-family: var(--vz-font-mono);
  padding: 0.1rem 0.42rem;
}

div.submenu, .submenu, .sectionmenu {
  border-bottom: 1px solid var(--vz-border);
  margin: 0 auto;
  max-width: ${tokens.contentMaxWidth};
  padding: 14px ${tokens.bodyPaddingX} 0;
}

div.submenu a, .submenu a, .sectionmenu a {
  color: var(--vz-text-muted);
  display: inline-block;
  margin: 0 18px 0 0;
  padding: 0 0 12px;
  text-decoration: none;
}

div.submenu a:hover, .submenu a:hover, .sectionmenu a:hover {
  color: var(--vz-text);
}

.diff, .udiff, .sbsdiff, .difftxt {
  background: transparent;
  color: var(--vz-text);
}

.diffadd {
  background: rgba(46, 160, 67, 0.18) !important;
  color: #3fb950 !important;
  border-radius: 4px;
}

.diffrm {
  background: rgba(248, 81, 73, 0.18) !important;
  color: #f85149 !important;
  border-radius: 4px;
}

.diffchng {
  background: rgba(210, 153, 34, 0.18) !important;
  color: #d29922 !important;
  border-radius: 4px;
}

.admin, .forumPostBody, .forumPost,
.wikiedit-content, .wikiwide {
  color: var(--vz-text);
}

@media (max-width: 980px) {
  .vz-topbar {
    grid-template-columns: 1fr;
    justify-items: start;
  }

  .vz-topnav {
    justify-content: flex-start;
  }

  .vz-docs-layout {
    grid-template-columns: 1fr;
  }

  .vz-docs-sidebar {
    border-bottom: 1px solid var(--vz-border);
    border-right: 0;
  }
}
`;
}

function humanizedSpecLine(value: string | undefined, fallbackValue: string): string {
  if (!value) return fallbackValue;
  const colonIndex = value.indexOf(":");
  const text = colonIndex >= 0 ? value.slice(colonIndex + 1).trim() : value.trim();
  return text || fallbackValue;
}

function buildHeader(spec: FossilThemeDesignSpec): string {
  const productFeel = humanizedSpecLine(spec.brandDirection[0], "Vazir-managed docs-first Fossil skin");
  return `<!-- ${MANAGED_THEME_MARKER}; version: ${MANAGED_THEME_VERSION}; asset: header -->
<div class="vz-shell">
  <header class="vz-topbar" title="${productFeel}">
    <div class="vz-brand">
      <span class="vz-brand-mark">V</span>
      <a href="$index_page">Vazir / $project_name</a>
    </div>
    <nav class="vz-topnav" aria-label="Primary">
      <a href="$baseurl/timeline">timeline</a>
      <a href="$baseurl/dir">files</a>
      <a href="$baseurl/wiki">wiki</a>
      <a href="$baseurl/ticket">tickets</a>
      <a href="$baseurl/forum">forum</a>
      <a href="$baseurl/brlist">branches</a>
      <a href="$baseurl/taglist">tags</a>
    </nav>
  </header>
  <div class="vz-body">
`;
}

function buildFooter(spec: FossilThemeDesignSpec): string {
  const boundaryHint = spec.pageBoundaries[1] ?? "Cosmetic-only pages: native Fossil screens";
  const productFeel = humanizedSpecLine(spec.brandDirection[0], "Docs-first Fossil skin");
  return `<!-- ${MANAGED_THEME_MARKER}; version: ${MANAGED_THEME_VERSION}; asset: footer -->
  </div>
  <footer class="vz-footer">
    <span>${productFeel}</span>
    <span>${boundaryHint}</span>
  </footer>
</div>
`;
}

export function buildManagedFossilThemeAssets(cwd: string): ManagedFossilThemeAssets {
  const spec = readFossilThemeDesignSpec(cwd);
  return {
    version: MANAGED_THEME_VERSION,
    marker: MANAGED_THEME_MARKER,
    spec,
    css: buildCss(spec),
    header: buildHeader(spec),
    footer: buildFooter(spec),
  };
}

function fossilSkinValue(cwd: string, skinName: "css" | "header" | "footer"): string {
  try {
    return childProcess.execFileSync("fossil", ["sql", `SELECT value FROM config WHERE name='${skinName}';`], {
      cwd,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
  } catch {
    try {
      return childProcess.execFileSync("fossil", ["sql", "-R", path.join(cwd, ".fslckout"), `SELECT value FROM config WHERE name='${skinName}';`], {
        cwd,
        encoding: "utf-8",
        stdio: "pipe",
      }).trim();
    } catch {
      return "";
    }
  }
}

function writeFossilSkinValue(cwd: string, skinName: "css" | "header" | "footer", value: string): void {
  const escapedValue = value.replace(/'/g, "''");
  const sql = `REPLACE INTO config(name,value,mtime) VALUES('${skinName}','${escapedValue}',strftime('%s','now'));`;
  try {
    childProcess.execFileSync("fossil", ["sql", sql], { cwd, stdio: "pipe" });
    return;
  } catch {
    childProcess.execFileSync("fossil", ["sql", "-R", path.join(cwd, ".fslckout"), sql], { cwd, stdio: "pipe" });
  }
}

function clearFossilDefaultSkin(cwd: string): void {
  const sql = "DELETE FROM config WHERE name='default-skin';";
  try {
    childProcess.execFileSync("fossil", ["sql", sql], { cwd, stdio: "pipe" });
    return;
  } catch {
    childProcess.execFileSync("fossil", ["sql", "-R", path.join(cwd, ".fslckout"), sql], { cwd, stdio: "pipe" });
  }
}

export function applyManagedFossilTheme(cwd: string): ManagedFossilThemeApplyResult {
  const existingCss = fossilSkinValue(cwd, "css");
  const existingHeader = fossilSkinValue(cwd, "header");
  const existingFooter = fossilSkinValue(cwd, "footer");
  const theme = buildManagedFossilThemeAssets(cwd);

  const alreadyManaged = [existingCss, existingHeader, existingFooter].some(value => value.includes(MANAGED_THEME_MARKER));
  const hasExistingSkin = [existingCss, existingHeader, existingFooter].some(value => value.trim().length > 0);

  if (alreadyManaged && existingCss === theme.css && existingHeader === theme.header && existingFooter === theme.footer) {
    return {
      status: "updated",
      message: `Updated Vazir Fossil theme to ${theme.version}.`,
      version: theme.version,
    };
  }

  writeFossilSkinValue(cwd, "css", theme.css);
  writeFossilSkinValue(cwd, "header", theme.header);
  writeFossilSkinValue(cwd, "footer", theme.footer);
  clearFossilDefaultSkin(cwd);

  const status: ManagedFossilThemeStatus = alreadyManaged ? "updated" : hasExistingSkin ? "replaced" : "installed";
  const message = status === "installed"
    ? `Installed Vazir Fossil theme (${theme.version}).`
    : status === "replaced"
      ? `Replaced existing Fossil skin with Vazir-managed theme (${theme.version}).`
      : `Updated Vazir Fossil theme to ${theme.version}.`;

  return { status, message, version: theme.version };
}

export function buildManagedFossilThemePreviewHtml(cwd: string): string {
  const theme = buildManagedFossilThemeAssets(cwd);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Vazir Fossil theme preview</title>
  <style>${theme.css}</style>
</head>
<body>
${theme.header.replace(/\$index_page/g, "#").replace(/\$project_name/g, "pi-mono").replace(/\$baseurl/g, "#").replace(/\$login/g, "login")}
  <div class="vz-docs-layout">
    <aside class="vz-docs-sidebar">
      <h3>Getting Started</h3>
      <ul>
        <li><a href="#">Home</a></li>
        <li><a href="#">Getting started</a></li>
        <li><a href="#">FAQ</a></li>
      </ul>
      <h3>Reference</h3>
      <ul>
        <li><a href="#">Commands</a></li>
        <li><a href="#" class="vz-active">Changelog</a></li>
      </ul>
    </aside>
    <main class="vz-docs-content">
      <div class="vz-subnav"><a href="#">wiki</a><a href="#">Changelog</a></div>
      <p class="vz-page-kicker">curated docs page</p>
      <h1>Changelog</h1>
      <p class="vz-page-subtitle">Append-only updates presented in a docs-first shell.</p>
      <section class="vz-changelog-entry">
        <div>
          <h2>Wiki agent</h2>
          <div class="vz-changelog-meta">30 May 2026</div>
          <div class="vz-pill-row"><span class="vz-pill">feature</span><span class="vz-pill vz-pill-neutral">docs</span></div>
          <ul>
            <li>Added <span class="vz-code-badge">/wiki-review</span> for curated wiki updates.</li>
            <li>Writes pending docs state to <span class="vz-code-badge">.vazir/wiki-pending.json</span>.</li>
          </ul>
        </div>
        <div class="vz-hash-badge">a3f9c1b</div>
      </section>
      <hr>
      <h2>Native timeline polish</h2>
      <table class="timelineTable">
        <tr><th>time</th><th>summary</th><th>hash</th></tr>
        <tr><td class="timelineTime">12:04</td><td class="timelineComment">Refined docs chrome and sidebar treatment</td><td><span class="hash">dbb5743</span></td></tr>
        <tr><td class="timelineTime">11:42</td><td class="timelineComment">Improved diff/admin readability without changing structure</td><td><span class="hash">850aa83</span></td></tr>
      </table>
    </main>
  </div>
${theme.footer}
</body>
</html>`;
}
