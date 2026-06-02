import os from "node:os";
import * as path from "node:path";
import { createRequire } from "node:module";
import { assert, loadFileModule, repoRoot } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");

const modulePath = path.join(repoRoot, ".pi", "lib", "vazir-fossil-theme.ts");
const themeModule = await loadFileModule<{
  buildManagedFossilThemeAssets: (cwd: string) => { version: string; marker: string; css: string; header: string; footer: string; spec: { pageBoundaries: string[]; brandDirection: string[] } };
  buildManagedFossilThemePreviewHtml: (cwd: string) => string;
}>(modulePath, String(Date.now()));

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "vazir-fossil-theme-"));
fs.mkdirSync(path.join(cwd, ".context", "design"), { recursive: true });
fs.writeFileSync(path.join(cwd, ".context", "design", "brand.md"), `# Brand

## Theme direction
- Product feel: DeepWiki-inspired Fossil skin for docs and project pages
- Primary references: dark, minimal, documentation-first
- Non-goals: do not restructure native Fossil timeline HTML

## Constraints
- Implement with Fossil skin CSS, header/footer HTML, and light optional JS only
- Native Fossil timeline and diff get cosmetic polish only
`);
fs.writeFileSync(path.join(cwd, ".context", "design", "design-system.md"), `# Design System

## Colours
- Background: #181a1f
- Surface: #23262d
- Border: #3f4552
- Text: #f7f8fb
- Accent: #4fd1c5
- Status pills: #f3e8c8

## Typography
- Font family: "InterVar", system-ui, sans-serif
- Scale: restrained docs scale with strong page title
- Code/hash font: "JetBrains Mono", monospace

## Spacing and shape
- Base unit: 10px
- Scale: 10 / 20 / 30 / 40
- Radius: 6px 12px 18px

## Component conventions
- Top nav is simple, horizontal, app-like, and low-noise
- Wiki/docs pages may use a persistent left sidebar for local navigation
- Changelog is a curated docs page with section blocks, tags, metadata, and hash badges

## Page treatment boundaries
- Full treatment pages: wiki/docs, FAQ, getting started, reference, curated changelog
- Cosmetic-only pages: native Fossil timeline, diff, ticket, forum, and admin screens keep built-in structure and receive low-risk polish only
`);
fs.writeFileSync(path.join(cwd, ".context", "design", "components.md"), `# Components

## Global shell
- Top navigation: dark horizontal bar
- Page frame: dark app shell with restrained borders

## Docs/wiki layer
- Sidebar: left-hand sidebar for wiki/docs pages only
- Content header: large page title and muted subtitle
- Changelog entry block: title, date, tag pills, hash badge, and bullet changes

## Shared content styling
- Tag pill: soft rounded pill with compact horizontal padding
- Hash/code badge: monospace text on darker inset surface
- Code block / inline code: dark inset panel with subtle border

## Constrained Fossil-native pages
- Timeline: cosmetic-only restyle
- Diff and admin views: low-risk polish only
`);

const theme = themeModule.buildManagedFossilThemeAssets(cwd);
assert(theme.version === "2026-05-31", "theme version should be stable");
assert(theme.marker === "managed-by: vazir", "theme marker should be exported");
assert(theme.css.includes("managed-by: vazir"), "css should include managed marker");
assert(theme.header.includes("asset: header"), "header should include asset marker");
assert(theme.footer.includes("asset: footer"), "footer should include asset marker");
assert(theme.css.includes(".vz-docs-layout"), "css should include docs layout styling");
assert(theme.css.includes(".vz-pill"), "css should include pill styling");
assert(theme.css.includes(".timelineTable"), "css should include conservative timeline styling");
assert(theme.css.includes("table.diff"), "css should include diff styling");
assert(theme.css.includes("--vz-bg: #181a1f;"), "css should derive background from design tokens");
assert(theme.css.includes("--vz-accent: #4fd1c5;"), "css should derive accent from design tokens");
assert(theme.css.includes('--vz-font-sans: "InterVar", system-ui, sans-serif;'), "css should derive font family from design tokens");
assert(theme.css.includes('--vz-font-mono: "JetBrains Mono", monospace;'), "css should derive mono font from design tokens");
assert(theme.css.includes("--vz-radius-md: 12px;"), "css should derive radius tokens from design spec");
assert(theme.css.includes("--vz-sidebar-width: calc(10px * 32.5);"), "css should derive layout sizing from base unit");
assert(theme.header.includes("$baseurl/timeline"), "header should include fossil timeline nav link");
assert(theme.header.includes("Vazir / $project_name"), "header should use repo branding placeholder");
assert(theme.header.includes("title=\"DeepWiki-inspired Fossil skin for docs and project pages\""), "header should derive a representative value from brand direction");
assert(theme.footer.includes("Cosmetic-only pages:"), "footer should carry page-boundary hint");
assert(theme.footer.includes("DeepWiki-inspired Fossil skin for docs and project pages"), "footer should derive a representative value from brand direction");
assert(theme.spec.brandDirection.some(line => line.includes("DeepWiki-inspired")), "theme spec should be read from brand.md");
assert(theme.spec.pageBoundaries.some(line => line.includes("Cosmetic-only pages")), "theme spec should be read from design-system.md");

const preview = themeModule.buildManagedFossilThemePreviewHtml(cwd);
assert(preview.includes("<style>"), "preview should inline css");
assert(preview.includes("class=\"vz-docs-layout\""), "preview should include docs layout markup");
assert(preview.includes("class=\"timelineTable\""), "preview should include native timeline sample");
assert(preview.includes("class=\"vz-hash-badge\""), "preview should include changelog hash badge");
assert(preview.includes("login"), "preview should render login placeholder fallback");

fs.writeFileSync(path.join(cwd, ".context", "design", "brand.md"), `# Brand\n\n## Theme direction\n- Product feel: Soft graphite docs workspace\n\n## Constraints\n- Implement with Fossil skin CSS, header/footer HTML, and light optional JS only\n`);
fs.writeFileSync(path.join(cwd, ".context", "design", "design-system.md"), `# Design System\n\n## Colours\n- Background: #101418\n- Surface: #1a2027\n- Border: #556070\n- Text: #eef3ff\n- Accent: #ff7a59\n- Status pills: #efe0d1\n\n## Typography\n- Font family: "IBM Plex Sans", system-ui, sans-serif\n- Code/hash font: "Fira Code", monospace\n\n## Spacing and shape\n- Base unit: 12px\n- Radius: 4px 10px 16px\n\n## Page treatment boundaries\n- Full treatment pages: wiki/docs\n- Cosmetic-only pages: native Fossil timeline and admin screens\n`);
const variedTheme = themeModule.buildManagedFossilThemeAssets(cwd);
assert(variedTheme.css.includes("--vz-bg: #101418;"), "css should change when background token changes");
assert(variedTheme.css.includes("--vz-accent: #ff7a59;"), "css should change when accent token changes");
assert(variedTheme.css.includes('--vz-font-sans: "IBM Plex Sans", system-ui, sans-serif;'), "css should change when sans font token changes");
assert(variedTheme.css.includes('--vz-font-mono: "Fira Code", monospace;'), "css should change when mono font token changes");
assert(variedTheme.css.includes("--vz-radius-md: 10px;"), "css should change when radius tokens change");
assert(variedTheme.header.includes("Soft graphite docs workspace"), "header should change when brand direction changes");
assert(variedTheme.footer.includes("native Fossil timeline and admin screens"), "footer should change when page boundaries change");

fs.rmSync(cwd, { recursive: true, force: true });
console.log("validate-vazir-fossil-theme");
console.log("All managed Fossil theme assertions passed.");
