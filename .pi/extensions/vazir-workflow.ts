import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const REQUIRED_DIRECTORIES = [
  ".context/memory",
  ".context/learnings",
  ".context/history",
  ".context/prd/features",
  ".context/technical",
  ".context/templates",
  ".context/settings",
];

export default function vazirWorkflow(pi: ExtensionAPI) {
  pi.registerCommand("vazir-init", {
    description: "Initialize the Vazir context files",
    handler: async (_args, ctx) => {
      createRequiredDirectories();
      writeSeedFileIfMissing(join(process.cwd(), ".context/memory/context-map.md"), CONTEXT_MAP_TEMPLATE);
      writeSeedFileIfMissing(join(process.cwd(), ".context/memory/system.md"), SYSTEM_TEMPLATE);
      writeSeedFileIfMissing(join(process.cwd(), ".context/settings/project.json"), PROJECT_JSON_TEMPLATE);
      writeSeedFileIfMissing(join(process.cwd(), "AGENTS.md"), AGENTS_TEMPLATE);

      ctx.ui.notify("Vazir initialized: .context/ and AGENTS.md are ready.", "info");
    },
  });
}

function createRequiredDirectories(): void {
  for (const directory of REQUIRED_DIRECTORIES) {
    mkdirSync(join(process.cwd(), directory), { recursive: true });
  }
}

function writeSeedFileIfMissing(filePath: string, content: string): void {
  if (existsSync(filePath)) return;
  writeFileSync(filePath, content, "utf-8");
}

const CONTEXT_MAP_TEMPLATE = `# Context Map — Vazir POC

## What this project is
Vazir is a proof of concept for context-driven agent workflows built on pi-coding-agent.

## Where things live
- .pi/extensions/ holds the extension hooks and commands.
- .pi/skills/ holds mode-specific routing guidance.
- .context/ holds persistent project memory and settings.
- docs/ holds the specification and phase plans.

## Rules that matter most
- Keep the implementation minimal and direct.
- Do not add backup or restore behavior in phase 1.
- Preserve .context/ and AGENTS.md when rerunning initialization.
- Prefer the spec and repo conventions over speculative abstractions.

## Known fragile areas
- Extension loading is sensitive to prompt injection order.
- Seed files must never overwrite user edits.

## For more detail
- Full rules: .context/memory/system.md
- Project settings: .context/settings/project.json
`;

const SYSTEM_TEMPLATE = `# System Constitution

## Project
name: Vazir POC
language: TypeScript
framework: pi-coding-agent
description: Proof of concept for context-aware coding workflows.

## Rules
- Keep changes small and direct.
- Preserve user content when initializing the brain files.
- Prefer the current spec when behavior is unclear.
`;

const PROJECT_JSON_TEMPLATE = JSON.stringify(
  {
    project_name: "Vazir POC",
    primary_language: "TypeScript",
    test_command: "",
    seen_threshold: 3,
    onboarded: false,
  },
  null,
  2,
) + "\n";

const AGENTS_TEMPLATE = `# Project Agent Context

## What this project is
Vazir is a proof of concept that tests whether accumulated project context improves agent output.

## Tech stack
TypeScript with the pi-coding-agent extension system.

## Project structure
- .pi/extensions/ contains workflow hooks and commands.
- .pi/skills/ contains routing-mode guidance.
- .context/ contains persistent memory, learnings, and settings.

## Rules
- Do not overwrite existing AGENTS.md or .context files when reinitializing.
- Keep the implementation minimal enough to validate the workflow quickly.

## Known fragile areas
- Context injection should prefer .context/memory/context-map.md.
- Seed content should stay short and stable.

## How to run
- Use /vazir-init to create the required context files.
`;