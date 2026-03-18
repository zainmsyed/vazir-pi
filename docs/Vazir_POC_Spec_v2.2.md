# Vazir POC Spec — pi-mono Implementation
**Version:** 2.2  
**Base:** `@mariozechner/pi-coding-agent` extension system  
**Goal:** Validate the context engine thesis before building the full Rust/Tauri product  
**Timeline:** 2–3 weeks to working CLI  

> **v2.2 changes from v2.1:** Added `AGENTS.md` support: fallback in `vazir-context.ts` reads `AGENTS.md` if `context-map.md` absent, `/vazir-init` generates both files, architecture diagram updated, `.context/` contract updated, full PRD note added.

---

## What This Is

A proof of concept, not a product. The full Vazir PRD describes a Rust/Tauri desktop application with a custom context engine, zero-token Rust operations, linting pipeline, and polished IDE surface. This POC builds none of that.

What it builds — as four TypeScript extension files, four Markdown skill files, and two prompt templates on top of `pi-coding-agent` — is the core thesis: **does accumulated project context make a cheap model produce better results than a frontier model starting cold?**

The `.context/` folder structure is identical to the full PRD spec from day one. When the full product is built, users migrate their existing `.context/` folders directly. The brain travels.

---

## Success Criteria

After 30 days of real use on real projects:

1. **Does the context map orient the model?** Plans should reference the project structure correctly without the user re-explaining it every session.
2. **Does the self-correcting loop work?** Rejection rate should trend down across the first 20 tasks as learnings accumulate in `system.md`.
3. **Does model-swap quality hold?** After 20 tasks, switching from Claude Sonnet to Haiku (or a local Ollama model) should produce equivalent output on project-specific tasks.
4. **Does the zero-token router reduce friction?** The `select()`/`confirm()` gate should feel faster than typing prefix commands.
5. **Does branch-on-reject capture useful context?** After a rejection and retry, does the LLM avoid the same mistake?

If yes: build the product. If no: you've learned something cheap.

---

## Architecture

```
pi-coding-agent (base)
    ├── .pi/extensions/
    │   ├── vazir-context.ts      # Context map injection + custom compaction
    │   ├── vazir-sandbox.ts      # vwrite/vedit tools + sandbox enforcement
    │   ├── vazir-workflow.ts     # /approve /reject /plan /verify /vazir-init
    │   └── vazir-scorer.ts       # Zero-token input routing gate
    │
    ├── .pi/skills/
    │   ├── vazir-base.md         # automatic: true — always-on constraints
    │   ├── vazir-one-shot.md     # loaded for score ≥ 76
    │   ├── vazir-step-by-step.md # loaded for score 40–75
    │   └── vazir-interview.md    # loaded for score < 40
    │
    ├── .pi/prompts/
    │   ├── task.md               # /task structured form
    │   └── feature.md            # /feature spec template
    │
    ├── AGENTS.md                 # Public face — picked up by Claude Code, Cursor, Windsurf, pi-mono
    └── .context/                 # Vazir brain — identical to full PRD spec
        ├── memory/
        │   ├── context-map.md    # Vazir-optimised conductor (150 tokens, structured sections)
        │   ├── system.md
        │   ├── active-plan.md
        │   └── index.md
        ├── learnings/
        │   └── code-review.md
        ├── sandbox/
        ├── history/
        ├── prd/
        ├── templates/
        └── settings/
            └── project.json
```

---

## Zero-Token Routing Gate

```
User input arrives
      ↓
input hook (zero tokens, <5ms)
      ↓
Is a question? → pass through as chat
Score < 40?   → ctx.ui.select() — clarify / chat / submit anyway
Score 40–75?  → ctx.ui.confirm() — "plan mode, proceed?"
Score ≥ 76?   → pass through immediately
      ↓
before_agent_start injects mode skill
      ↓
LLM fires with protocol already in system prompt
```

---

## Extension Files

### 1. `vazir-context.ts` — Context Map + Custom Compaction

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export default function (pi: ExtensionAPI) {

  // Inject context into every agent turn.
  // Priority: context-map.md (Vazir-optimised, 150-token budget)
  //           → AGENTS.md (cross-framework fallback, free-form)
  // AGENTS.md is the project's public face — picked up by Claude Code,
  // Cursor, Windsurf, and any other agent-aware tool automatically.
  // context-map.md is the Vazir-specific conductor — structured sections,
  // token-budgeted, updated by Rust in the full product.
  pi.on("before_agent_start", async (event, _ctx) => {
    const mapPath = join(process.cwd(), ".context/memory/context-map.md");
    const agentsPath = join(process.cwd(), "AGENTS.md");

    let raw: string | null = null;
    let source: string | null = null;

    if (existsSync(mapPath)) {
      raw = readFileSync(mapPath, "utf-8");
      source = "context-map.md";
    } else if (existsSync(agentsPath)) {
      raw = readFileSync(agentsPath, "utf-8");
      source = "AGENTS.md";
    }

    if (!raw) return;

    // Strip HTML comments — template instructions for human, not LLM
    const stripped = raw.replace(/<!--[\s\S]*?-->/g, "").trim();

    return {
      systemPrompt: `${stripped}\n\n---\n\n${event.systemPrompt || ""}`,
    };
  });

  // Custom compaction — structured Vazir summary, zero LLM tokens
  // Reconstructs summary from tool result messages in session branch
  pi.on("session_before_compact", async (_event, ctx) => {
    const branch = ctx.sessionManager.getBranch();

    const completed: string[] = [];
    const rejected: string[] = [];

    for (const entry of branch) {
      if (entry.type !== "message") continue;
      const msg = entry.message;
      if (msg.role !== "toolResult") continue;

      if (msg.toolName === "vsandbox_complete") {
        // Extract task name from active-plan.md at time of call
        const planPath = join(process.cwd(), ".context/memory/active-plan.md");
        if (existsSync(planPath)) {
          const plan = readFileSync(planPath, "utf-8");
          const match = plan.match(/task:\s*"?(.+?)"?\s*\n/);
          if (match) completed.push(match[1]);
        }
      }
    }

    if (completed.length === 0 && rejected.length === 0) return;

    const parts = [
      "Vazir session summary:",
      completed.length > 0 ? `Completed: ${completed.join(", ")}` : null,
      rejected.length > 0 ? `Rejected sandboxes: ${rejected.length}` : null,
    ].filter(Boolean);

    return { summary: parts.join("\n") };
  });

}
```

---

### 2. `vazir-sandbox.ts` — Sandboxed File Tools

Key patterns from `damage-control.ts`:
- Use `isToolCallEventType` for typed tool interception
- Block reason must instruct LLM to use `vwrite`/`vedit` instead — not just explain the block
- Call `ctx.abort()` before returning `{ block: true }` to stop the agent loop
- `pi.appendEntry` persists to session tree

Key patterns from `tilldone.ts`:
- State reconstruction from `getBranch()` on session_start/switch/fork/tree
- `agent_end` nudge if `vsandbox_complete` was not called this cycle
- Widget uses factory function returning `render(width)` for live resizing
- `refreshUI()` centralises all widget/status/footer updates

```typescript
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";

// ── Types ──────────────────────────────────────────────────────────────

interface FileDelta {
  path: string;
  linesAdded: number;
  linesRemoved: number;
}

interface SandboxDetails {
  action: string;
  path: string;
  linesAdded: number;
  linesRemoved: number;
}

// ── In-memory state ────────────────────────────────────────────────────

// diffStore is rebuilt from getBranch() on every session event
const diffStore = new Map<string, FileDelta>();
let sandboxCompleteCalled = false;
let nudgedThisCycle = false;

// ── Helpers ────────────────────────────────────────────────────────────

function computeDelta(original: string, modified: string): { linesAdded: number; linesRemoved: number } {
  const orig = original.split("\n");
  const mod = modified.split("\n");
  let added = 0, removed = 0;
  const max = Math.max(orig.length, mod.length);
  for (let i = 0; i < max; i++) {
    if (i >= orig.length) { added++; continue; }
    if (i >= mod.length) { removed++; continue; }
    if (orig[i] !== mod[i]) { added++; removed++; }
  }
  return { linesAdded: added, linesRemoved: removed };
}

function refreshUI(ctx: ExtensionContext) {
  const count = diffStore.size;

  if (count === 0) {
    ctx.ui.setStatus("vazir-sandbox", undefined);
    ctx.ui.setWidget("vazir-sandbox", undefined);
    return;
  }

  // Status line
  ctx.ui.setStatus(
    "vazir-sandbox",
    `⬡ ${count} file${count !== 1 ? "s" : ""} in sandbox${sandboxCompleteCalled ? " — /approve or /reject" : ""}`,
  );

  // Widget — factory function for live resize (pattern from tilldone.ts)
  ctx.ui.setWidget("vazir-sandbox", (_tui, theme) => {
    return {
      render(width: number): string[] {
        const files = [...diffStore.values()];
        if (files.length === 0) return [];

        let totalAdded = 0, totalRemoved = 0;
        const rows: string[] = [];

        for (const f of files) {
          totalAdded += f.linesAdded;
          totalRemoved += f.linesRemoved;
          const label = f.path.length > 38 ? "..." + f.path.slice(-35) : f.path;
          const delta = theme.fg("success", `+${f.linesAdded}`) + theme.fg("dim", "/") + theme.fg("error", `-${f.linesRemoved}`);
          const pad = " ".repeat(Math.max(1, width - 4 - label.length - `+${f.linesAdded}/-${f.linesRemoved}`.length));
          rows.push(`  ${theme.fg("accent", label)}${pad}${delta}`);
        }

        const sep = theme.fg("dim", "─".repeat(width));
        const total = `  ${files.length} file${files.length !== 1 ? "s" : ""}  ` +
          theme.fg("success", `+${totalAdded}`) + theme.fg("dim", "/") + theme.fg("error", `-${totalRemoved}`);
        const actions = sandboxCompleteCalled
          ? theme.fg("accent", "  /approve   /reject")
          : theme.fg("dim", "  writing...");

        return ["", ...rows, sep, total, actions, ""];
      },
      invalidate() {},
    };
  }, { placement: "aboveEditor" });
}

// Rebuild diffStore from session branch — same pattern as tilldone reconstructState
function reconstructState(ctx: ExtensionContext) {
  diffStore.clear();
  sandboxCompleteCalled = false;

  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== "message") continue;
    const msg = entry.message;
    if (msg.role !== "toolResult") continue;

    if (msg.toolName === "vwrite" || msg.toolName === "vedit") {
      const details = msg.details as SandboxDetails | undefined;
      if (details?.path) {
        diffStore.set(details.path, {
          path: details.path,
          linesAdded: details.linesAdded,
          linesRemoved: details.linesRemoved,
        });
      }
    }

    if (msg.toolName === "vsandbox_complete") {
      sandboxCompleteCalled = true;
    }
  }

  refreshUI(ctx);
}

// ── Extension ──────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {

  // Reconstruct state on every session event — same as tilldone.ts
  pi.on("session_start", async (_event, ctx) => reconstructState(ctx));
  pi.on("session_switch", async (_event, ctx) => reconstructState(ctx));
  pi.on("session_fork", async (_event, ctx) => reconstructState(ctx));
  pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));

  // Reset nudge flag on new user input
  pi.on("input", async () => {
    nudgedThisCycle = false;
    return { action: "continue" as const };
  });

  // Nudge if agent finishes without calling vsandbox_complete
  // Same pattern as tilldone agent_end nudge
  pi.on("agent_end", async (_event, _ctx) => {
    if (diffStore.size === 0 || sandboxCompleteCalled || nudgedThisCycle) return;
    nudgedThisCycle = true;

    pi.sendMessage(
      {
        customType: "vazir-nudge",
        content: `⚠️ You wrote ${diffStore.size} file(s) to the sandbox but did not call \`vsandbox_complete\`. You MUST call \`vsandbox_complete\` to surface the sandbox for user review. Call it now.`,
        display: true,
      },
      { triggerTurn: true },
    );
  });

  // Block write/edit to real project files — redirect to vwrite/vedit
  // Pattern from damage-control.ts: typed check, ctx.abort(), strong reason string
  pi.on("tool_call", async (event, ctx) => {
    if (
      isToolCallEventType("write", event) ||
      isToolCallEventType("edit", event)
    ) {
      const filePath = event.input.path;
      // Allow writes inside .context/sandbox/ — that's vwrite/vedit's destination
      if (filePath && !filePath.includes(".context/sandbox/")) {
        ctx.ui.notify(`⬡ Vazir: Blocked direct write to ${filePath}`, "warning");
        ctx.abort();
        return {
          block: true,
          reason: `🛑 BLOCKED by Vazir Sandbox: Direct writes to project files are not allowed.\n\nUse the \`vwrite\` tool (for new or full-replacement writes) or \`vedit\` tool (for string replacement edits) instead. These tools write to the sandbox staging area first so you can review before applying.\n\nDO NOT attempt to work around this restriction. Use vwrite or vedit and then call vsandbox_complete when all files are written.`,
        };
      }
    }
    return { block: false };
  });

  // ── Tools ──────────────────────────────────────────────────────────

  // TypeBox schemas — typed params in execute, pattern from tilldone.ts
  const VWriteParams = Type.Object({
    path: Type.String({ description: "File path relative to project root" }),
    content: Type.String({ description: "Complete file content" }),
  });

  const VEditParams = Type.Object({
    path: Type.String({ description: "File path relative to project root" }),
    old_string: Type.String({ description: "Exact string to replace" }),
    new_string: Type.String({ description: "Replacement string" }),
  });

  pi.registerTool({
    name: "vwrite",
    label: "Vazir Write",
    description: "Write a file to the Vazir sandbox. All file writes MUST use this tool. Never use the built-in write tool.",
    parameters: VWriteParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const sandboxPath = join(process.cwd(), ".context/sandbox", params.path);
      const realPath = join(process.cwd(), params.path);

      mkdirSync(dirname(sandboxPath), { recursive: true });

      const original = existsSync(realPath) ? readFileSync(realPath, "utf-8") : "";
      writeFileSync(sandboxPath, params.content);

      const delta = computeDelta(original, params.content);
      diffStore.set(params.path, { path: params.path, ...delta });

      refreshUI(ctx);

      const details: SandboxDetails = { action: "vwrite", path: params.path, ...delta };
      return {
        content: [{ type: "text" as const, text: `Written to sandbox: ${params.path} (+${delta.linesAdded}/-${delta.linesRemoved})` }],
        details,
      };
    },
  });

  pi.registerTool({
    name: "vedit",
    label: "Vazir Edit",
    description: "Edit a file in the Vazir sandbox by replacing a string. All file edits MUST use this tool. Never use the built-in edit tool.",
    parameters: VEditParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const sandboxPath = join(process.cwd(), ".context/sandbox", params.path);
      const realPath = join(process.cwd(), params.path);

      // Read from sandbox if already written this session, else real file
      const sourcePath = existsSync(sandboxPath) ? sandboxPath : realPath;
      if (!existsSync(sourcePath)) {
        return {
          content: [{ type: "text" as const, text: `Error: ${params.path} not found` }],
        };
      }

      const source = readFileSync(sourcePath, "utf-8");
      if (!source.includes(params.old_string)) {
        return {
          content: [{ type: "text" as const, text: `Error: string not found in ${params.path}` }],
        };
      }

      const modified = source.replace(params.old_string, params.new_string);
      mkdirSync(dirname(sandboxPath), { recursive: true });
      writeFileSync(sandboxPath, modified);

      const originalContent = existsSync(realPath) ? readFileSync(realPath, "utf-8") : "";
      const delta = computeDelta(originalContent, modified);
      diffStore.set(params.path, { path: params.path, ...delta });

      refreshUI(ctx);

      const details: SandboxDetails = { action: "vedit", path: params.path, ...delta };
      return {
        content: [{ type: "text" as const, text: `Edited in sandbox: ${params.path} (+${delta.linesAdded}/-${delta.linesRemoved})` }],
        details,
      };
    },
  });

  pi.registerTool({
    name: "vsandbox_complete",
    label: "Sandbox Complete",
    description: "REQUIRED: Call this when you have finished writing all files for the current task. Do not summarise after calling — the sandbox widget handles the review UI.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      sandboxCompleteCalled = true;
      nudgedThisCycle = true; // prevent nudge since we called it
      refreshUI(ctx);
      ctx.ui.notify("Sandbox ready — /approve or /reject", "info");
      return {
        content: [{ type: "text" as const, text: `Sandbox complete. ${diffStore.size} file(s) ready for review.` }],
      };
    },
  });

  // Export for use in vazir-workflow.ts
  return { diffStore, resetSandbox: (ctx: ExtensionContext) => { diffStore.clear(); sandboxCompleteCalled = false; refreshUI(ctx); } };
}

export { diffStore };
```

---

### 3. `vazir-workflow.ts` — Commands

Pattern notes:
- `ctx.ui.editor()` for plan editing (multiline, pre-filled)
- `ctx.ui.confirm()` with `{ timeout: 30000 }` to auto-dismiss
- `branchWithSummary()` on reject so next LLM turn knows what was attempted
- `pi.appendEntry` to persist task events to session tree

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { copyFileSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { diffStore } from "./vazir-sandbox";

const CONTEXT = () => join(process.cwd(), ".context");
const LEARNINGS = () => join(CONTEXT(), "learnings/code-review.md");
const PLAN = () => join(CONTEXT(), "memory/active-plan.md");
const SYSTEM = () => join(CONTEXT(), "memory/system.md");
const SANDBOX = () => join(CONTEXT(), "sandbox");

export default function (pi: ExtensionAPI) {

  pi.registerCommand("approve", {
    description: "Accept sandbox changes and apply to the real project",
    handler: async (_args, ctx) => {
      if (diffStore.size === 0) {
        ctx.ui.notify("No sandbox changes to accept.", "info");
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const snapshotDir = join(CONTEXT(), "history", timestamp);
      mkdirSync(join(snapshotDir, "files"), { recursive: true });

      const manifest: { timestamp: string; task: string; files: string[] } = {
        timestamp,
        task: getActiveTask(),
        files: [],
      };

      for (const [filePath] of diffStore.entries()) {
        const realPath = join(process.cwd(), filePath);
        const sandboxPath = join(SANDBOX(), filePath);

        if (existsSync(realPath)) {
          const snap = join(snapshotDir, "files", filePath);
          mkdirSync(dirname(snap), { recursive: true });
          copyFileSync(realPath, snap);
        }

        mkdirSync(dirname(realPath), { recursive: true });
        copyFileSync(sandboxPath, realPath);
        manifest.files.push(filePath);
      }

      writeFileSync(join(snapshotDir, "manifest.json"), JSON.stringify(manifest, null, 2));

      // Persist to session tree
      pi.appendEntry("vazir-task", {
        status: "accepted",
        task: manifest.task,
        files: manifest.files,
        timestamp,
      });

      // Wipe sandbox
      rmSync(SANDBOX(), { recursive: true, force: true });
      diffStore.clear();
      ctx.ui.setWidget("vazir-sandbox", undefined);
      ctx.ui.setStatus("vazir-sandbox", undefined);

      const count = manifest.files.length;
      ctx.ui.notify(`✓ Accepted — ${count} file${count !== 1 ? "s" : ""} applied`, "info");
    },
  });

  pi.registerCommand("reject", {
    description: "Reject sandbox changes with optional learning capture",
    handler: async (_args, ctx) => {
      const reason = await ctx.ui.input(
        "Why are you rejecting? (optional — Enter to skip)",
        "e.g. broke the token validation signature...",
      );

      const filesAttempted = [...diffStore.keys()];

      // branchWithSummary so next LLM turn knows what was tried
      const summary = [
        "Sandbox rejected.",
        reason?.trim() ? `Reason: ${reason.trim()}` : null,
        filesAttempted.length > 0 ? `Files attempted: ${filesAttempted.join(", ")}` : null,
      ].filter(Boolean).join(" ");

      await ctx.sessionManager.branchWithSummary(summary);

      // Wipe sandbox
      rmSync(SANDBOX(), { recursive: true, force: true });
      diffStore.clear();
      ctx.ui.setWidget("vazir-sandbox", undefined);
      ctx.ui.setStatus("vazir-sandbox", undefined);

      pi.appendEntry("vazir-task", {
        status: "rejected",
        task: getActiveTask(),
        reason: reason?.trim() || null,
        filesAttempted,
        timestamp: new Date().toISOString(),
      });

      if (reason?.trim()) {
        appendLearning(reason.trim());

        const similar = findSimilarLearning(reason.trim());
        if (similar && similar.seen >= getSeenThreshold()) {
          const promote = await ctx.ui.confirm(
            "Promote to permanent rule?",
            `This pattern has appeared ${similar.seen + 1} times.`,
            { timeout: 30000 },
          );
          if (promote) {
            const ruleText = await ctx.ui.editor(
              "Edit rule before saving to system.md",
              `- ${similar.text}`,
            );
            if (ruleText?.trim()) {
              appendToSystemMd(ruleText.trim(), "manual");
              ctx.ui.notify("Rule added to system.md", "info");
            }
          }
        }
      }
    },
  });

  pi.registerCommand("plan", {
    description: "Show and optionally edit the active plan",
    handler: async (_args, ctx) => {
      if (!existsSync(PLAN())) {
        ctx.ui.notify("No active plan. Submit a task to generate one.", "info");
        return;
      }

      const current = readFileSync(PLAN(), "utf-8");
      const action = await ctx.ui.select("Active plan", ["View only", "Edit plan", "Abandon plan"]);

      if (action === "Edit plan") {
        const edited = await ctx.ui.editor("Edit plan YAML", current);
        if (edited?.trim()) {
          writeFileSync(PLAN(), edited);
          ctx.ui.notify("Plan updated", "info");
        }
      } else if (action === "Abandon plan") {
        const confirmed = await ctx.ui.confirm("Abandon plan?", "This will clear the active plan.", { timeout: 30000 });
        if (confirmed) {
          rmSync(PLAN(), { force: true });
          ctx.ui.notify("Plan abandoned", "info");
        }
      }
    },
  });

  pi.registerCommand("verify", {
    description: "Run the configured test command",
    handler: async (_args, ctx) => {
      const settings = loadSettings();
      if (!settings.test_command) {
        ctx.ui.notify("No test command — add test_command to .context/settings/project.json", "warning");
        return;
      }

      ctx.ui.setWorkingMessage(`Running: ${settings.test_command}`);
      const { execSync } = await import("child_process");

      try {
        const output = execSync(settings.test_command, {
          cwd: process.cwd(),
          encoding: "utf-8",
          timeout: 120000,
        });
        ctx.ui.setWorkingMessage();
        ctx.ui.notify("✓ Tests passed", "info");
      } catch (e: any) {
        ctx.ui.setWorkingMessage();
        const failureLines = (e.stdout || "")
          .split("\n")
          .filter((l: string) => /FAIL|Error|failed|assertion/i.test(l))
          .slice(0, 5)
          .join("\n");

        if (failureLines) {
          appendLearning(`Test failure: ${failureLines}`);
          ctx.ui.notify("Test failure captured to learnings", "warning");
        }
      }
    },
  });

  pi.registerCommand("vazir-init", {
    description: "Initialise .context/ folder for this project",
    handler: async (_args, ctx) => {
      const root = CONTEXT();
      const dirs = [
        "memory", "learnings", "sandbox", "history",
        "prd/features", "technical", "prompts", "templates", "settings", "chat/threads",
      ];

      for (const dir of dirs) mkdirSync(join(root, dir), { recursive: true });

      if (!existsSync(join(root, "memory/context-map.md"))) {
        writeFileSync(join(root, "memory/context-map.md"), CONTEXT_MAP_TEMPLATE);
      }
      if (!existsSync(join(root, "memory/system.md"))) {
        writeFileSync(join(root, "memory/system.md"), SYSTEM_MD_TEMPLATE);
      }
      if (!existsSync(join(root, "settings/project.json"))) {
        writeFileSync(join(root, "settings/project.json"), JSON.stringify({
          project_name: "",
          primary_language: "",
          test_command: "",
          onboarded: false,
          history_max_sessions: 100,
          seen_threshold: 3,
          model_tier: "balanced",
        }, null, 2));
      }

      // Generate AGENTS.md at project root if it doesn't exist
      // This is the cross-framework public face — works in Claude Code,
      // Cursor, Windsurf, pi-mono, and any AGENTS.md-aware tool.
      const agentsPath = join(process.cwd(), "AGENTS.md");
      if (!existsSync(agentsPath)) {
        writeFileSync(agentsPath, AGENTS_MD_TEMPLATE);
      }

      ctx.ui.notify("✓ .context/ initialised + AGENTS.md created", "info");
    },
  });

}

// ── Helpers ──────────────────────────────────────────────────────────────

function loadSettings() {
  const p = join(process.cwd(), ".context/settings/project.json");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf-8")) : {};
}

function getSeenThreshold() { return loadSettings().seen_threshold ?? 3; }

function getActiveTask() {
  const p = PLAN();
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf-8").match(/task:\s*"?(.+?)"?\s*\n/)?.[1] || "";
}

function appendLearning(reason: string) {
  const p = LEARNINGS();
  mkdirSync(dirname(p), { recursive: true });
  const entry = `\n---\n${new Date().toISOString()}\n${reason}\nseen: 1\n`;
  writeFileSync(p, (existsSync(p) ? readFileSync(p, "utf-8") : "") + entry);
}

function findSimilarLearning(text: string): { text: string; seen: number } | null {
  const p = LEARNINGS();
  if (!existsSync(p)) return null;
  for (const block of readFileSync(p, "utf-8").split("---").filter(b => b.trim())) {
    const m = block.match(/\n(.+)\nseen: (\d+)/);
    if (m && jaroWinkler(text.toLowerCase(), m[1].toLowerCase()) > 0.8) {
      return { text: m[1], seen: parseInt(m[2]) };
    }
  }
  return null;
}

function appendToSystemMd(rule: string, source: "manual" | "learned") {
  const p = SYSTEM();
  if (!existsSync(p)) return;
  let content = readFileSync(p, "utf-8");
  const entry = `${rule} *(source: ${source})*`;
  content = content.includes("## Learned Rules")
    ? content.replace("## Learned Rules", `## Learned Rules\n${entry}`)
    : content + `\n\n## Learned Rules\n${entry}\n`;
  writeFileSync(p, content);
}

// Jaro-Winkler similarity
function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const range = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const m1 = new Array(s1.length).fill(false);
  const m2 = new Array(s2.length).fill(false);
  let matches = 0, transpositions = 0;
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - range), end = Math.min(i + range + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (m2[j] || s1[i] !== s2[j]) continue;
      m1[i] = m2[j] = true; matches++; break;
    }
  }
  if (!matches) return 0;
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!m1[i]) continue;
    while (!m2[k]) k++;
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
<!-- One sentence. What it does and for whom. Injected into every prompt. -->

## Where things live
<!-- Key directories. 3-6 lines max.
     e.g. "handlers/ — HTTP request handlers" -->

## Rules that matter most
<!-- 3-5 rules most likely to be violated.
     e.g. "Never modify ValidateToken() signature" -->

## Known fragile areas
<!-- Files needing extra care. -->

## For more detail
- Full rules → .context/memory/system.md
- Index → .context/memory/index.md
- Current task → .context/memory/active-plan.md
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

// AGENTS.md — cross-framework project context
// Picked up automatically by Claude Code, Cursor, Windsurf, pi-mono, and others.
// Free-form. No token budget. Write naturally.
// Relationship to context-map.md: AGENTS.md is what you show the world.
// context-map.md is what Vazir optimises for injection (structured, 150 tokens).
// Write AGENTS.md first in natural prose, then distill into context-map.md.
const AGENTS_MD_TEMPLATE = `# [Project Name] — Agent Context

## What this project is
<!-- One paragraph. What it does, for whom, and why it exists. -->

## Tech stack
<!-- Language, framework, key dependencies. -->

## Project structure
<!-- Key directories and what lives in each one.
     e.g. handlers/ — HTTP request handlers
          models/   — database models and queries (no raw SQL outside here)
          routes/   — all endpoint registration -->

## Rules
<!-- Hard constraints the agent must respect.
     e.g. Never modify ValidateToken() signature
          All database queries go through models/ only
          Use := not var in Go -->

## Known fragile areas
<!-- Files or modules that need extra care.
     e.g. auth/token.go — timezone edge cases in expiry logic
          migrations/ — never auto-generate, always write by hand -->

## How to run
<!-- Test command, dev server command, build command. -->
`;
```

---

### 4. `vazir-scorer.ts` — Zero-Token Input Routing

Pattern notes:
- `return { action: "handled" as const }` — the `as const` is required for TypeScript
- `return { action: "continue" as const }` — explicit pass-through
- `return { action: "transform", text: "..." } as const` — modify input before LLM
- Load skill manually since we need to inject it programmatically via `before_agent_start`

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const AMBIGUOUS = ["refactor", "clean up", "improve", "fix", "optimize", "enhance", "rework", "tidy", "simplify"];
const NEGATIONS = ["don't", "avoid", "without", "instead of"];
const ACTIONS = ["add", "implement", "create", "update", "delete", "write", "build", "move", "change", "migrate", "extract", "rename"];
const QUESTION_RE = /^(what|why|how|should|can|does|is|are|when|where)\b/i;

let pendingMode: "one-shot" | "step-by-step" | "interview" | "chat" | null = null;

export default function (pi: ExtensionAPI) {

  pi.on("input", async (event, ctx) => {
    const text = (event.text || "").trim();
    if (!text || text.startsWith("/")) return { action: "continue" as const };

    const result = score(text, process.cwd());
    ctx.ui.setStatus("vazir-score", `score ${result.score} · ${result.mode}`);

    // Questions below threshold — pass through as chat, no dialog
    if ((QUESTION_RE.test(text) || text.endsWith("?")) && result.score < 60) {
      pendingMode = "chat";
      return { action: "continue" as const };
    }

    // Score < 40 — show routing dialog (zero tokens)
    if (result.score < 40) {
      const choice = await ctx.ui.select(
        `Underspecified task (score: ${result.score})`,
        [
          "Help me clarify it (interview mode)",
          "Send as chat question instead",
          "Submit anyway",
        ],
      );

      if (choice === "Help me clarify it (interview mode)") {
        pendingMode = "interview";
        return { action: "transform", text: `[VAZIR:interview]\n\n${text}` };
      }

      if (choice === "Send as chat question instead") {
        pendingMode = "chat";
        return { action: "continue" as const };
      }

      // Submit anyway
      pendingMode = result.score >= 40 ? "step-by-step" : "interview";
      return {
        action: "transform" as const,
        text: `[task score: ${result.score}, mode: ${result.mode}]\n\n${text}`,
      };
    }

    // Score 40–75 — confirm plan mode (zero tokens)
    if (result.score < 76) {
      const proceed = await ctx.ui.confirm(
        `Step-by-step mode (score: ${result.score})`,
        "Vazir will generate a plan for your approval before writing any files.",
      );

      if (!proceed) {
        // Put text back in editor — user wants to refine
        ctx.ui.setEditorText(text);
        ctx.ui.setStatus("vazir-score", "refine your task and resubmit");
        return { action: "handled" as const }; // zero tokens
      }

      pendingMode = "step-by-step";
      return {
        action: "transform" as const,
        text: `[VAZIR:step-by-step]\n\n${text}`,
      };
    }

    // Score ≥ 76 — one-shot, no dialog
    pendingMode = "one-shot";
    return { action: "continue" as const };
  });

  // Inject mode skill before LLM call
  pi.on("before_agent_start", async (event, _ctx) => {
    const mode = pendingMode;
    pendingMode = null;

    if (!mode || mode === "chat") return;

    const skillMap: Record<string, string> = {
      "one-shot": "vazir-one-shot",
      "step-by-step": "vazir-step-by-step",
      "interview": "vazir-interview",
    };

    const skillName = skillMap[mode];
    if (!skillName) return;

    // Try project skills first, then global
    const paths = [
      join(process.cwd(), `.pi/skills/${skillName}.md`),
      join(process.env.HOME || "~", `.pi/agent/skills/${skillName}.md`),
    ];
    const skillPath = paths.find(p => existsSync(p));
    if (!skillPath) return;

    const content = readFileSync(skillPath, "utf-8").replace(/^---[\s\S]*?---\n/, "").trim();
    return { systemPrompt: `${event.systemPrompt || ""}\n\n${content}` };
  });

}

function score(text: string, cwd: string) {
  let s = 50;
  const signals: string[] = [];
  let positiveCount = 0;

  const indexPath = join(cwd, ".context/memory/index.md");
  const index = existsSync(indexPath) ? readFileSync(indexPath, "utf-8") : "";

  const files = (text.match(/\b[\w/]+\.\w{1,5}\b/g) || []).filter(f => index.includes(f));
  if (files.length > 0) { s += 20; signals.push("+20 file ref"); positiveCount++; }

  if (/\b(jwt|oauth|redis|postgres|stripe|prisma|express|fastapi|sqlalchemy|gin|gorm)\b/i.test(text)) {
    s += 15; signals.push("+15 dependency"); positiveCount++;
  }

  if (/\b(should return|must output|expected|returns|endpoint)\b/i.test(text)) {
    s += 10; signals.push("+10 output described"); positiveCount++;
  }

  if (/\b(all|entire|every|throughout|whole codebase)\b/i.test(text)) {
    s -= 30; signals.push("-30 broad scope");
  }

  const hasNegation = NEGATIONS.some(n => text.toLowerCase().startsWith(n));
  const ambiguous = !hasNegation && AMBIGUOUS.some(v => text.toLowerCase().includes(v));
  if (ambiguous) {
    const penalty = positiveCount >= 2 ? -20 : -40;
    s += penalty; signals.push(`${penalty} ambiguous verb`);
  }

  if (!ACTIONS.some(v => text.toLowerCase().includes(v)) && !ambiguous) {
    s -= 20; signals.push("-20 no action verb");
  }

  s = Math.max(0, Math.min(100, s));
  const mode = s >= 76 ? "one-shot" : s >= 40 ? "step-by-step" : "needs-interview";
  return { score: s, mode, signals };
}
```

---

## Skill Files

### `.pi/skills/vazir-base.md` — automatic: true

```markdown
---
name: vazir-base
description: Vazir baseline constraints — always active
automatic: true
---

# Vazir Execution Constraints

- **Never use the built-in `write` or `edit` tools.** Use `vwrite` and `vedit` instead. The built-in tools bypass the sandbox.
- **All file changes go to sandbox first.** `vwrite` and `vedit` write to `.context/sandbox/` — not real files.
- **Always call `vsandbox_complete` when finished.** This is mandatory. Never end a task without calling it.
- **Do not explain or summarise after calling `vsandbox_complete`.** The sandbox widget handles the review UI.
- If unsure which files to modify, ask — do not guess and write to random files.
```

### `.pi/skills/vazir-one-shot.md`

```markdown
---
name: vazir-one-shot
description: One-shot execution protocol for high-confidence tasks
automatic: false
---

# One-Shot Execution Protocol

## Before writing any code, state:
1. Which files you will modify and why
2. Any constraints from the context map that apply
3. What the expected output is

## While writing:
- Use `vwrite` for new files or full replacements
- Use `vedit` for targeted string replacements
- Complete one file before starting the next

## When complete:
- Call `vsandbox_complete` — mandatory, never skip
- Stop after calling it — do not add commentary
```

### `.pi/skills/vazir-step-by-step.md`

```markdown
---
name: vazir-step-by-step
description: Step-by-step execution protocol requiring plan approval
automatic: false
---

# Step-by-Step Execution Protocol

## Phase 1 — Plan (before any code)
Present a numbered checklist. Each item must include:
- What you will do
- Which file: `path/to/file.ext`

Example:
1. [ ] Add RefreshToken field — file: `models/user.go`
2. [ ] Update auth handler — file: `handlers/auth.go`

**Wait for the user to run `/approve` before writing any code.**

## Phase 2 — Execute
Work through steps in order. After each step call `vsandbox_complete` and wait for `/approve` before the next. Maximum 3 files per step. Never skip ahead.
```

### `.pi/skills/vazir-interview.md`

```markdown
---
name: vazir-interview
description: Clarification protocol for underspecified tasks
automatic: false
---

# Interview Protocol

The task is underspecified. Ask exactly 1–3 targeted questions — no more.

- Target the most impactful gap first
- Do not ask generic "tell me more" questions  
- After answers, proceed with execution
- Do not suggest solutions yet

Common gaps to target:
- No files mentioned: which part of the codebase?
- Ambiguous verb: add, remove, or modify?
- No expected output: what should the result look like?
```

---

## Prompt Templates

### `.pi/prompts/task.md`

```markdown
---
description: Structured Vazir task input
---
{{what}}

Files: {{files}}
Expected output: {{expected_output}}
Constraint: {{constraints}}
```

### `.pi/prompts/feature.md`

```markdown
---
description: Feature spec
---
# feat-{{number}}: {{name}}

## Problem
{{problem}}

## Proposed Solution
{{solution}}

## Acceptance Criteria
- [ ] {{criteria}}

## Files Likely Affected
{{files}}
```

---

## `.context/` Folder Contract

Identical to full Vazir PRD spec. Every file the POC writes conforms to this structure.

**Two files, two purposes:**

| File | Purpose | Token budget | Who reads it |
|---|---|---|---|
| `AGENTS.md` (project root) | Free-form project context. Cross-framework — Claude Code, Cursor, Windsurf, pi-mono all pick it up. | None | Any agent tool |
| `.context/memory/context-map.md` | Vazir-optimised conductor. Structured sections, 150-token budget. Injected first into every Vazir prompt. | 150 tokens max | Vazir only |

Write `AGENTS.md` first in natural prose. Distill it into `context-map.md` for Vazir. When you stop using Vazir and switch to another tool, `AGENTS.md` ensures continuity — the project still teaches the agent about itself.

```
[project root]/
├── AGENTS.md             ← Cross-framework. Fill this first. Natural prose.
└── .context/
    ├── memory/
    │   ├── context-map.md    ← Vazir conductor. Distilled from AGENTS.md. 150 tokens max.
    │   ├── system.md         ← Rules, learned rules
    │   ├── active-plan.md    ← Written by LLM during execution
    │   └── index.md          ← Manual for POC
    ├── learnings/
    │   └── code-review.md    ← Append-only, seen: N counter
    ├── sandbox/              ← vwrite/vedit write here
    ├── history/              ← Snapshots on /approve
    ├── prd/
    ├── technical/
    ├── templates/
    └── settings/
        └── project.json      ← test_command, seen_threshold, model_tier
```

---

## Build Order

**Days 1–3:** `vazir-context.ts` + `/vazir-init`  
Fill `context-map.md` and test on a real project. Does the model orient correctly without you re-explaining the structure?

**Days 4–7:** `vazir-sandbox.ts`  
Get `vwrite`/`vedit`/`vsandbox_complete` working. Verify the `tool_call` block actually intercepts built-in write/edit. The `agent_end` nudge is critical — without it the LLM will forget to call `vsandbox_complete`.

**Days 8–10:** `vazir-workflow.ts`  
`/approve` + `/reject` with `branchWithSummary()`. Once this works the self-correcting loop is testable.

**Days 11–14:** `vazir-scorer.ts` + skills  
Zero-token routing gate and mode skills. Add last — the core loop works without them.

---

## Known Limitations vs Full PRD

| Feature | POC | Full Product |
|---|---|---|
| Scorer | ~5ms TypeScript | <10ms Rust |
| Diff view | `pi review <file>` or `delta` | CM6 MergeView |
| Linting | External | Pre-accept lint pipeline |
| Context injection | `before_agent_start` | ContextProfile per call type |
| Index management | Manual | Rust + LLM enrichment |
| Desktop UI | Terminal | Tauri + CodeMirror 6 |

Everything in `.context/` is identical and portable.

---

## Transition Point

Move to full product when:
1. Score trends up, rejection rate trends down across 20 tasks
2. Model-swap test passes — Haiku with mature `.context/` matches Sonnet without
3. You miss specific things the terminal can't give you — diff view, inline linting, onboarding

---

*Vazir POC Spec v2.2 — AGENTS.md cross-framework support: vazir-context.ts reads context-map.md first then falls back to AGENTS.md; /vazir-init generates both files; AGENTS_MD_TEMPLATE added; architecture and contract sections updated with two-file model. AGENTS.md = public face (any tool), context-map.md = Vazir conductor (structured, 150 tokens).*
