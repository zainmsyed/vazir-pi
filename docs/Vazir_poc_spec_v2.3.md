# Vazir POC Spec — pi-mono Implementation  
**Version:** 3.0  
**Base:** `@mariozechner/pi-coding-agent` extension system  
**Goal:** Validate the context engine thesis with minimal complexity  
**Timeline:** 1–2 weeks to working CLI  

---

## What This Is

A proof of concept, not a product. We validate the core thesis—**does accumulated project context make a cheap model produce better results than a frontier model starting cold?**—without building the full Rust/Tauri IDE.

This version uses a **simplified backup/restore model**. The AI writes directly to real files using standard `write`/`edit` tools. Before the first write, we backup the original files to `.context/history/pending/`. If the user rejects the changes, we restore from backup. This enables immediate live testing (dev servers, etc.) while preserving the safety of review-before-commit.

The `.context/` folder structure remains identical to the full Vazir PRD. When the full product is built, users migrate their existing `.context/` folders directly—the brain travels.

---

## Success Criteria

After 30 days of real use:

1. **Context map orientation:** Plans reference project structure correctly without re-explaining it each session  
2. **Self-correcting loop:** Rejection rate trends down across 20 tasks as learnings accumulate in `system.md`  
3. **Model-swap quality:** After 20 tasks, switching from Claude Sonnet to Haiku produces equivalent output on project-specific tasks  
4. **Zero-token routing:** The `select()`/`confirm()` gate feels faster than typing prefix commands  
5. **Branch-on-reject:** After rejection and retry, the LLM avoids the same mistake  

---

## Architecture

```
pi-coding-agent (base)
    ├── .pi/extensions/
    │   ├── vazir-context.ts      # Context map + AGENTS.md injection
    │   ├── vazir-backup.ts       # Backup on first write, restore on reject
    │   └── vazir-workflow.ts     # /approve /reject /diff + scorer + learning loop
    │
    ├── .pi/skills/
    │   ├── vazir-base/SKILL.md         # Injected for all tasks
    │   ├── vazir-one-shot/SKILL.md     # Injected when score ≥ 76
    │   ├── vazir-step-by-step/SKILL.md # Injected when score 40–75
    │   └── vazir-interview/SKILL.md    # Injected when score < 40
    │
    ├── AGENTS.md                 # Cross-framework project context (fallback)
    └── .context/                 # Vazir brain — identical to full PRD spec
        ├── memory/
        │   ├── context-map.md    # Vazir-optimised conductor (150 tokens)
        │   ├── system.md         # Rules, learned rules
        │   ├── active-plan.md    # Current task plan
        │   └── index.md          # Codebase index (manual for POC)
        ├── learnings/
        │   └── code-review.md    # Append-only, seen: N counter
        ├── history/              # Snapshots on /approve
        │   └── pending/          # Active backup (deleted on approve/reject)
        ├── prd/
        ├── templates/
        └── settings/
            └── project.json      # Config (test_command, seen_threshold, etc.)
```

---

## The Workflow

```
User submits task
      ↓
Zero-token routing gate (scorer determines mode)
      ↓
Inject mode-specific skill (base + one-shot/step-by-step/interview)
      ↓
AI uses standard write/edit tools (no custom tools)
      ↓
First write triggers backup to .context/history/pending/
      ↓
User tests LIVE immediately (dev server hot-reloads, etc.)
      ↓
Works? → /approve → archive backup, update learnings
Fails? → /reject → restore from backup, capture reason → learnings
```

---

## Extension Files

### 1. `vazir-context.ts` — Context Map Injection

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export default function (pi: ExtensionAPI) {
  // Inject context map into every agent turn
  pi.on("before_agent_start", async (event, _ctx) => {
    const mapPath = join(process.cwd(), ".context/memory/context-map.md");
    const agentsPath = join(process.cwd(), "AGENTS.md");

    let raw: string | null = null;
    
    if (existsSync(mapPath)) {
      raw = readFileSync(mapPath, "utf-8");
    } else if (existsSync(agentsPath)) {
      raw = readFileSync(agentsPath, "utf-8");
    }

    if (!raw) return;

    // Strip HTML comments
    const stripped = raw.replace(/<!--[\s\S]*?-->/g, "").trim();
    
    return {
      systemPrompt: `${stripped}\n\n---\n\n${event.systemPrompt || ""}`,
    };
  });

  // Custom compaction summary
  pi.on("session_before_compact", async (_event, ctx) => {
    const branch = ctx.sessionManager.getBranch();
    const completed: string[] = [];
    
    for (const entry of branch) {
      if (entry.type !== "message") continue;
      const msg = entry.message;
      if (msg.role !== "toolResult") continue;
      if (msg.toolName === "write" || msg.toolName === "edit") {
        const planPath = join(process.cwd(), ".context/memory/active-plan.md");
        if (existsSync(planPath)) {
          const plan = readFileSync(planPath, "utf-8");
          const match = plan.match(/task:\s*"?(.+?)"?\s*\n/);
          if (match && !completed.includes(match[1])) {
            completed.push(match[1]);
          }
        }
      }
    }

    if (completed.length === 0) return;
    return { 
      summary: `Vazir session summary: Completed ${completed.join(", ")}` 
    };
  });
}
```

### 2. `vazir-backup.ts` — Backup on First Write

```typescript
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { copyFileSync, existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join, dirname } from "path";

const BACKUP_DIR = () => join(process.cwd(), ".context/history/pending");
const TRACKED_FILES = new Set<string>();
const modifiedFiles = new Map<string, { original: string; current: string }>();

export default function (pi: ExtensionAPI) {
  // Backup on first write/edit
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "write" || event.toolName === "edit") {
      const filePath = event.input.path as string;
      if (!filePath) return { block: false };

      const realPath = join(process.cwd(), filePath);
      const backupPath = join(BACKUP_DIR(), filePath);

      // First encounter: backup original
      if (!TRACKED_FILES.has(filePath)) {
        TRACKED_FILES.add(filePath);
        
        if (existsSync(realPath)) {
          mkdirSync(dirname(backupPath), { recursive: true });
          copyFileSync(realPath, backupPath);
          modifiedFiles.set(filePath, {
            original: readFileSync(realPath, "utf-8"),
            current: readFileSync(realPath, "utf-8")
          });
        } else {
          modifiedFiles.set(filePath, { original: "", current: "" });
        }

        ctx.ui.notify(`⬡ Backing up ${filePath}`, "info");
      }

      // Update tracking
      if (event.toolName === "write") {
        modifiedFiles.set(filePath, {
          original: modifiedFiles.get(filePath)?.original || "",
          current: event.input.content as string
        });
      } else if (event.toolName === "edit") {
        const current = modifiedFiles.get(filePath)?.current || "";
        const newContent = current.replace(
          event.input.old_string as string,
          event.input.new_string as string
        );
        modifiedFiles.set(filePath, {
          original: modifiedFiles.get(filePath)?.original || "",
          current: newContent
        });
      }
    }
    return { block: false };
  });

  // Exports for workflow extension
  return { 
    getModifiedFiles: () => modifiedFiles,
    getBackupDir: BACKUP_DIR,
    clearTracking: () => {
      TRACKED_FILES.clear();
      modifiedFiles.clear();
    },
    restoreFromBackup: () => {
      const pendingDir = BACKUP_DIR();
      if (!existsSync(pendingDir)) return;
      
      for (const file of walkDir(pendingDir)) {
        const backupPath = join(pendingDir, file);
        const realPath = join(process.cwd(), file);
        copyFileSync(backupPath, realPath);
      }
    },
    archiveBackup: (timestamp: string) => {
      const { renameSync } = require('fs');
      const archiveDir = join(process.cwd(), ".context/history", timestamp);
      renameSync(BACKUP_DIR(), archiveDir);
      return archiveDir;
    }
  };
}

function walkDir(dir: string): string[] {
  const result: string[] = [];
  if (!existsSync(dir)) return result;
  
  const entries = require('fs').readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = walkDir(fullPath).map(f => join(entry.name, f));
      result.push(...sub);
    } else {
      result.push(entry.name);
    }
  }
  return result;
}
```

### 3. `vazir-workflow.ts` — Commands, Scorer & Learning Loop

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { copyFileSync, renameSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';

const CONTEXT = () => join(process.cwd(), ".context");
const LEARNINGS = () => join(CONTEXT(), "learnings/code-review.md");
const PLAN = () => join(CONTEXT(), "memory/active-plan.md");
const SYSTEM = () => join(CONTEXT(), "memory/system.md");
const PENDING = () => join(CONTEXT(), "history/pending");

// Scorer constants
const AMBIGUOUS = ['refactor', 'clean up', 'improve', 'fix', 'optimize', 'enhance', 'rework', 'tidy', 'simplify'];
const NEGATIONS = ["don't", "avoid", "without", "instead of"];
const ACTIONS = ['add', 'implement', 'create', 'update', 'delete', 'write', 'build', 'move', 'change', 'migrate', 'extract', 'rename'];

let backupApi: any = null;
let pendingMode: string | null = null;

export default function (pi: ExtensionAPI) {
  // Get backup API reference
  pi.on("session_start", async (_event, ctx) => {
    backupApi = (ctx as any).extensions?.["vazir-backup"];
  });

  // Zero-token routing gate
  pi.on("input", async (event, ctx) => {
    const text = (event.text || "").trim();
    if (!text || text.startsWith("/")) return { action: "continue" as const };

    const result = score(text, process.cwd());
    ctx.ui.setStatus("vazir-score", `score ${result.score} · ${result.mode}`);

    // Questions pass through
    if (/^(what|why|how|should|can|does|is|are|when|where)\b/i.test(text) || text.endsWith("?")) {
      pendingMode = "chat";
      return { action: "continue" as const };
    }

    // Score < 40: show routing dialog
    if (result.score < 40) {
      const choice = await ctx.ui.select(
        `Underspecified task (score: ${result.score})`,
        [
          "Help me clarify it (interview mode)",
          "Send as chat question instead", 
          "Submit anyway"
        ]
      );

      if (choice === "Help me clarify it (interview mode)") {
        pendingMode = "interview";
        return { action: "transform" as const, text: `[VAZIR:interview]\n\n${text}` };
      }
      if (choice === "Send as chat question instead") {
        pendingMode = "chat";
        return { action: "continue" as const };
      }
      pendingMode = result.score >= 40 ? "step-by-step" : "interview";
      return { action: "transform" as const, text: `[task score: ${result.score}]\n\n${text}` };
    }

    // Score 40-75: confirm step-by-step
    if (result.score < 76) {
      const proceed = await ctx.ui.confirm(
        `Step-by-step mode (score: ${result.score})`,
        "Vazir will generate a plan for your approval before writing files."
      );
      if (!proceed) {
        ctx.ui.setEditorText(text);
        return { action: "handled" as const };
      }
      pendingMode = "step-by-step";
      return { action: "transform" as const, text: `[VAZIR:step-by-step]\n\n${text}` };
    }

    // Score >= 76: one-shot
    pendingMode = "one-shot";
    return { action: "continue" as const };
  });

  // Inject skills before agent starts
  pi.on("before_agent_start", async (event, ctx) => {
    const mode = pendingMode;
    pendingMode = null;
    if (!mode || mode === "chat") return;

    const baseSkill = loadSkill(".pi/skills/vazir-base/SKILL.md");
    const modeSkill = loadSkill(`.pi/skills/vazir-${mode}/SKILL.md`);
    
    return {
      systemPrompt: `${baseSkill}\n\n${modeSkill}\n\n${event.systemPrompt || ""}`
    };
  });

  // Commands
  pi.registerCommand("approve", {
    description: "Accept changes and archive backup",
    handler: async (_args, ctx) => {
      if (!existsSync(PENDING())) {
        ctx.ui.notify("No pending changes to approve.", "info");
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      backupApi?.archiveBackup(timestamp);

      const files = backupApi?.getModifiedFiles ? 
        Array.from(backupApi.getModifiedFiles().keys()) : [];
      
      writeFileSync(join(CONTEXT(), "history", timestamp, "manifest.json"), JSON.stringify({
        timestamp, task: getActiveTask(), files
      }, null, 2));

      backupApi?.clearTracking();
      ctx.ui.notify(`✓ Accepted — ${files.length} file(s) archived`, "info");
    }
  });

  pi.registerCommand("reject", {
    description: "Reject changes and restore from backup",
    handler: async (_args, ctx) => {
      if (!existsSync(PENDING())) {
        ctx.ui.notify("No pending changes to reject.", "info");
        return;
      }

      const reason = await ctx.ui.input("Why are you rejecting? (optional)");
      
      backupApi?.restoreFromBackup();
      
      const files = backupApi?.getModifiedFiles ? 
        Array.from(backupApi.getModifiedFiles().keys()) : [];
      
      await ctx.sessionManager.branchWithSummary(
        `Rejected: ${reason || "No reason given"}. Files: ${files.join(", ")}`
      );

      if (reason?.trim()) {
        await appendLearning(reason.trim());
        const similar = findSimilarLearning(reason.trim());
        if (similar?.seen >= getSeenThreshold()) {
          const promote = await ctx.ui.confirm(
            "Promote to permanent rule?", 
            `Pattern appeared ${similar.seen + 1} times`
          );
          if (promote) {
            const rule = await ctx.ui.editor("Edit rule:", `- ${similar.text}`);
            if (rule?.trim()) appendToSystemMd(rule.trim(), "manual");
          }
        }
      }

      rmSync(PENDING(), { recursive: true, force: true });
      backupApi?.clearTracking();
      ctx.ui.notify("Changes rejected and restored.", "info");
    }
  });

  pi.registerCommand("diff", {
    description: "Show pending changes",
    handler: async (_args, ctx) => {
      const files = backupApi?.getModifiedFiles?.() || new Map();
      if (files.size === 0) {
        ctx.ui.notify("No pending changes.", "info");
        return;
      }

      const lines = ["", "┌─ pending changes ──────────────────────────┐"];
      for (const [path, { original, current }] of files) {
        const delta = { 
          added: Math.max(0, current.split('\n').length - original.split('\n').length),
          removed: Math.max(0, original.split('\n').length - current.split('\n').length)
        };
        const pad = " ".repeat(Math.max(0, 40 - path.length));
        lines.push(`│ ~ ${path}${pad}+${delta.added}/-${delta.removed}  │`);
      }
      lines.push("└────────────────────────────────────────────┘");
      lines.push("Use /approve to keep or /reject to restore.");
      
      ctx.ui.notify(lines.join("\n"), "info");
    }
  });

  pi.registerCommand("plan", {
    description: "Show active plan",
    handler: async (_args, ctx) => {
      if (!existsSync(PLAN())) {
        ctx.ui.notify("No active plan.", "info");
        return;
      }
      ctx.ui.notify(readFileSync(PLAN(), "utf-8"), "info");
    }
  });

  pi.registerCommand("verify", {
    description: "Run test command",
    handler: async (_args, ctx) => {
      const settings = loadSettings();
      if (!settings.test_command) {
        ctx.ui.notify("No test_command configured.", "warning");
        return;
      }
      
      ctx.ui.setWorkingMessage("Running tests...");
      try {
        const { execSync } = require("child_process");
        execSync(settings.test_command, { cwd: process.cwd(), encoding: "utf-8", timeout: 120000 });
        ctx.ui.setWorkingMessage();
        ctx.ui.notify("✓ Tests passed", "info");
      } catch (e: any) {
        ctx.ui.setWorkingMessage();
        const failure = e.stdout?.split("\n").filter((l: string) => /FAIL|Error|failed/i.test(l)).slice(0, 5).join("\n");
        if (failure) appendLearning(`Test failure: ${failure}`);
        ctx.ui.notify("✗ Tests failed — captured to learnings", "warning");
      }
    }
  });

  pi.registerCommand("vazir-init", {
    description: "Initialize .context/ folder",
    handler: async (_args, ctx) => {
      const dirs = ["memory", "learnings", "history", "prd/features", "technical", "templates", "settings"];
      dirs.forEach(d => mkdirSync(join(CONTEXT(), d), { recursive: true }));

      if (!existsSync(join(CONTEXT(), "memory/context-map.md"))) {
        writeFileSync(join(CONTEXT(), "memory/context-map.md"), CONTEXT_MAP_TEMPLATE);
      }
      if (!existsSync(join(process.cwd(), "AGENTS.md"))) {
        writeFileSync(join(process.cwd(), "AGENTS.md"), AGENTS_MD_TEMPLATE);
      }
      if (!existsSync(SYSTEM())) {
        writeFileSync(SYSTEM(), SYSTEM_MD_TEMPLATE);
      }
      if (!existsSync(join(CONTEXT(), "settings/project.json"))) {
        writeFileSync(join(CONTEXT(), "settings/project.json"), JSON.stringify({
          project_name: "", primary_language: "", test_command: "",
          onboarded: false, history_max_sessions: 100, seen_threshold: 3, model_tier: "balanced"
        }, null, 2));
      }
      ctx.ui.notify("✓ .context/ initialized + AGENTS.md created", "info");
    }
  });
}

// Helpers
function score(text: string, cwd: string) {
  let s = 50;
  const index = existsSync(join(cwd, ".context/memory/index.md")) ? 
    readFileSync(join(cwd, ".context/memory/index.md"), "utf-8") : "";

  const files = (text.match(/\b[\w/]+\.\w{1,5}\b/g) || []).filter(f => index.includes(f));
  if (files.length > 0) s += 20;

  if (/\b(jwt|oauth|redis|postgres|stripe|prisma|express|fastapi)\b/i.test(text)) s += 15;

  if (/\b(should return|must output|expected|returns|endpoint)\b/i.test(text)) s += 10;

  if (/\b(all|entire|every|throughout|whole codebase)\b/i.test(text)) s -= 30;

  const hasNegation = NEGATIONS.some(n => text.toLowerCase().includes(n));
  if (!hasNegation && AMBIGUOUS.some(v => text.toLowerCase().includes(v))) {
    s += (files.length > 0) ? -20 : -40;
  }

  if (!ACTIONS.some(v => text.toLowerCase().includes(v))) s -= 20;

  s = Math.max(0, Math.min(100, s));
  return { 
    score: s, 
    mode: s >= 76 ? "one-shot" : s >= 40 ? "step-by-step" : "interview" 
  };
}

function loadSkill(path: string): string {
  const fullPath = join(process.cwd(), path);
  if (!existsSync(fullPath)) return "";
  const content = readFileSync(fullPath, "utf-8");
  return content.replace(/^---[\s\S]*?---\n/, "").trim();
}

function loadSettings() {
  const p = join(CONTEXT(), "settings/project.json");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf-8")) : {};
}

function getSeenThreshold() { return loadSettings().seen_threshold ?? 3; }
function getActiveTask() {
  if (!existsSync(PLAN())) return "";
  return readFileSync(PLAN(), "utf-8").match(/task:\s*"?(.+?)"?\s*\n/)?.[1] || "";
}

async function appendLearning(reason: string) {
  mkdirSync(dirname(LEARNINGS()), { recursive: true });
  const entry = `\n---\n${new Date().toISOString()}\n${reason}\nseen: 1\n`;
  writeFileSync(LEARNINGS(), (existsSync(LEARNINGS()) ? readFileSync(LEARNINGS(), "utf-8") : "") + entry);
}

function findSimilarLearning(text: string) {
  if (!existsSync(LEARNINGS())) return null;
  const content = readFileSync(LEARNINGS(), "utf-8");
  for (const block of content.split("---").filter(b => b.trim())) {
    const m = block.match(/\n(.+)\nseen: (\d+)/);
    if (m && jaroWinkler(text.toLowerCase(), m[1].toLowerCase()) > 0.8) {
      return { text: m[1], seen: parseInt(m[2]) };
    }
  }
  return null;
}

function appendToSystemMd(rule: string, source: "manual" | "learned") {
  let content = readFileSync(SYSTEM(), "utf-8");
  const entry = `${rule} *(source: ${source})*`;
  content = content.includes("## Learned Rules")
    ? content.replace("## Learned Rules", `## Learned Rules\n${entry}`)
    : content + `\n\n## Learned Rules\n${entry}\n`;
  writeFileSync(SYSTEM(), content);
}

function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);
  let matches = 0, transpositions = 0;
  
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = s2Matches[j] = true;
      matches++;
      break;
    }
  }
  
  if (!matches) return 0;
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  
  const jaro = (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefix++; else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

const CONTEXT_MAP_TEMPLATE = `# Context Map — [project-name]
last_updated: ${new Date().toISOString().split("T")[0]}

## What this project is
<!-- One sentence. What it does and for whom. -->

## Where things live
<!-- Key directories. 3-6 lines max. -->

## Rules that matter most
<!-- 3-5 imperative rules. -->

## Known fragile areas
<!-- Files needing extra care. -->

## For more detail
- Full rules → .context/memory/system.md
- Index → .context/memory/index.md
- Current task → .context/memory/active-plan.md
`;

const AGENTS_MD_TEMPLATE = `# Project Agent Context

## What this project is
<!-- One paragraph description. -->

## Tech stack
<!-- Language, framework, dependencies. -->

## Project structure
<!-- Key directories and responsibilities. -->

## Rules
<!-- Hard constraints for agents. -->

## Known fragile areas
<!-- Files/modules needing care. -->

## How to run
<!-- Test, dev, build commands. -->
`;

const SYSTEM_MD_TEMPLATE = `# System Constitution

## Project
name: 
language: 
framework: 
description: 

## Rules

## Learned Rules

## Dependencies

## Known Fragile Areas
`;
```

---

## Skill Files (Pi-Compatible Format)

Each skill is a directory with `SKILL.md`. The extension injects them based on score; users can also force-load with `/skill:vazir-one-shot`, etc.

### `.pi/skills/vazir-base/SKILL.md`

```markdown
---
name: vazir-base
description: Vazir baseline constraints for all tasks. Ensures backup safety and workflow compliance.
---

# Vazir Baseline Constraints

## Critical Rules

1. **Standard Tools Only**: Use built-in `write` and `edit` tools normally. Do NOT use custom file tools.

2. **Backup System Active**: Files are automatically backed up before modification. Do not manually backup.

3. **No Self-Approval**: After making changes, STOP. Do not ask "shall I apply these changes?" Wait for the user to run `/approve` or `/reject`.

4. **Task Tracking**: Active task is tracked in `.context/memory/active-plan.md`. Do not modify directly.

5. **Learning Capture**: If changes are rejected, the user will provide a reason. Use this to avoid repeating mistakes.

## Workflow

1. User submits task → You receive context map + mode-specific instructions
2. You edit files using standard tools (backups happen automatically)
3. You STOP after completing the work
4. User tests live and runs `/approve` or `/reject`
5. On reject, you learn from the reason provided
```

### `.pi/skills/vazir-one-shot/SKILL.md`

```markdown
---
name: vazir-one-shot
description: High-confidence task execution. Use when task is specific, files are named, scope is clear. Single-pass execution.
---

# One-Shot Execution Protocol

## When to Use

Task is high-confidence: specific files mentioned, clear output described, no ambiguous verbs like "refactor" or "improve."

## Execution Rules

1. **State Intent First**: Before editing, briefly state:
   - Which files you will modify
   - Why (per context map rules)
   - Expected outcome

2. **Edit Efficiently**: Use `edit` for targeted changes, `write` for new files. Work file by file.

3. **Complete Fully**: Implement the entire task in one pass. Do not ask for mid-task confirmation.

4. **Stop Clean**: When done, stop completely. Do not summarize or ask for approval. The user will test and run `/approve` or `/reject`.
```

### `.pi/skills/vazir-step-by-step/SKILL.md`

```markdown
---
name: vazir-step-by-step
description: Planning mode for medium-complexity tasks. Use when task spans multiple files. Requires explicit plan approval.
---

# Step-by-Step Execution Protocol

## Phase 1 — Plan Generation (REQUIRED)

Do not write code yet. Present a plan:

```yaml
steps:
  1:
    action: "Add RefreshToken field to User model"
    file: "models/user.go"
    
  2:
    action: "Update auth handler"
    file: "handlers/auth.go"
    depends_on: 1
```

**Wait for explicit user approval before Phase 2.**

## Phase 2 — Execute by Step

Work through steps in order. Maximum 3 files per step. If a step fails, stop and report.

## Completion

When all steps complete, stop. User will `/approve` or `/reject` the entire changeset.
```

### `.pi/skills/vazir-interview/SKILL.md`

```markdown
---
name: vazir-interview
description: Clarification mode for underspecified tasks. Use when task lacks file references or uses ambiguous verbs like "refactor".
---

# Interview Protocol

The task is underspecified. Before writing code, clarify with 1–3 targeted questions.

## Priority Questions

1. **Missing files**: "Which specific files should I modify?"
2. **Ambiguous action**: "When you say 'improve,' do you mean add functionality, fix a bug, or refactor?"
3. **Missing output**: "What should the result look like?"

## Rules

- Ask only the most impactful 1–3 questions
- Do not suggest solutions yet
- Do not start coding
- Wait for answers, then proceed with execution
```

---

## Build Order

**Days 1–3:** `vazir-context.ts` + `/vazir-init`  
Test: Does context map injection work? Does the model orient correctly?

**Days 4–6:** `vazir-backup.ts`  
Test: Do files backup correctly on first write?

**Days 7–10:** `vazir-workflow.ts`  
Test: Do `/approve`, `/reject`, `/diff` work? Does the learning loop capture rejections?

**Days 11–14:** Scorer tuning + polish  
Test: Does the zero-token routing feel right? Are thresholds correct?

---

## What Changed from v2.2

| Aspect | v2.2 (Complex Sandbox) | v3.0 (Simplified) |
|--------|------------------------|-------------------|
| File safety | Custom `vwrite`/`vedit` tools | Standard tools + backup/restore |
| Live testing | Required preview overlay | Works immediately |
| Tool interception | Block built-in tools | Allow through, backup first |
| Lines of code | ~600 | ~300 |
| User commands | `/approve`, `/reject` | Same, plus `/diff` |
| Skills | `.md` files with `automatic:` frontmatter | Directories with `SKILL.md`, extension-controlled |

---

## Transition to Full Product

When thesis is validated:
- `.context/` format proven ✓
- Workflow validated ✓  
- Scorer thresholds calibrated ✓

Build Rust/Tauri version with:
- True sandbox (files untouched until approve)
- Pre-accept lint pipeline
- CM6 diff view
- Multi-session state management

The brain (`.context/` folder) transfers directly.