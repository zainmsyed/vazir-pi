# Vazir POC Spec — pi-mono Implementation  
**Version:** 2.3  
**Base:** `@mariozechner/pi-coding-agent` extension system  
**Goal:** Validate the context engine thesis with minimal complexity  
**Timeline:** 1–2 weeks to working CLI  

---

## What This Is

A proof of concept, not a product. We validate the core thesis—**does accumulated project context make a cheap model produce better results than a frontier model starting cold?**—without building the full Rust/Tauri IDE.

This version uses a **simplified backup/restore model** instead of a complex sandbox. The AI writes directly to real files using standard `write`/`edit` tools. Before the first write, we backup the original files. If the user rejects the changes, we restore from backup. This enables immediate live testing (dev servers, etc.) while preserving the safety of review-before-commit.

The `.context/` folder structure remains identical to the full Vazir PRD. When the full product is built, users migrate their existing `.context/` folders directly.

---

## Success Criteria

After 30 days of real use:

1. **Context map orientation:** Plans reference project structure correctly without re-explaining it each session  
2. **Self-correcting loop:** Rejection rate trends down across 20 tasks as learnings accumulate in `system.md`  
3. **Model-swap quality:** After 20 tasks, switching from Claude Sonnet to Haiku produces equivalent output on project-specific tasks  
4. **Zero-token routing:** The `select()`/`confirm()` gate feels faster than typing prefix commands  
5. **Branch-on-reject:** After rejection and retry, the LLM avoids the same mistake  

If these answer yes: build the product. If no: you've learned something cheap.

---

## Architecture (Simplified)

```
pi-coding-agent (base)
    ├── .pi/extensions/
    │   ├── vazir-context.ts      # Context map injection + AGENTS.md fallback
    │   ├── vazir-backup.ts       # Backup on first write, restore on reject
    │   └── vazir-workflow.ts     # /approve /reject /diff /plan /verify /vazir-init
    │
    ├── .pi/skills/
    │   ├── vazir-base.md         # automatic: true — always-on constraints
    │   ├── vazir-one-shot.md     # loaded for score ≥ 76
    │   ├── vazir-step-by-step.md # loaded for score 40–75
    │   └── vazir-interview.md    # loaded for score < 40
    │
    ├── AGENTS.md                 # Cross-framework project context
    └── .context/                 # Vazir brain — identical to full PRD spec
        ├── memory/
        │   ├── context-map.md    # Vazir-optimised conductor (150 tokens)
        │   ├── system.md         # Rules, learned rules
        │   ├── active-plan.md    # Current task plan
        │   └── index.md          # Codebase index (manual for POC)
        ├── learnings/
        │   └── code-review.md    # Append-only, seen: N counter
        ├── history/              # Snapshots on /approve
        │   └── pending/          # Active backup before /approve or /reject
        ├── prd/
        ├── templates/
        └── settings/
            └── project.json
```

---

## The Simplified Workflow

```
User submits task
      ↓
Zero-token routing gate (score < 40, 40-75, ≥76)
      ↓
Inject mode-specific skill (one-shot, step-by-step, interview)
      ↓
AI uses standard write/edit tools (no custom tools!)
      ↓
First write triggers backup to .context/history/pending/
      ↓
User tests LIVE immediately (dev server hot-reloads, etc.)
      ↓
Works? → /approve → move backup to history/, update learnings
Fails? → /reject → restore from backup, capture reason → learnings
```

**Key difference from v2:** No `vwrite`/`vedit`. No tool interception complexity. No "sandbox directory." Just standard file operations with a backup safety net.

---

## Extension Files

### 1. `vazir-context.ts` — Context Map Injection

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export default function (pi: ExtensionAPI) {
  // Inject context into every agent turn
  // Priority: context-map.md → AGENTS.md
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

  // Custom compaction — reconstruct from session branch
  pi.on("session_before_compact", async (_event, ctx) => {
    const branch = ctx.sessionManager.getBranch();
    const completed: string[] = [];
    
    for (const entry of branch) {
      if (entry.type !== "message") continue;
      const msg = entry.message;
      if (msg.role !== "toolResult") continue;
      if (msg.toolName === "write" || msg.toolName === "edit") {
        // Track completed work
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
import { copyFileSync, existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";

const BACKUP_DIR = () => join(process.cwd(), ".context/history/pending");
const TRACKED_FILES = new Set<string>();

// Compute simple line delta for display
function computeDelta(original: string, modified: string): { added: number; removed: number } {
  const origLines = original.split("\n");
  const modLines = modified.split("\n");
  // Simple approximation: if lengths differ significantly, report net change
  const added = Math.max(0, modLines.length - origLines.length);
  const removed = Math.max(0, origLines.length - modLines.length);
  return { added, removed };
}

export default function (pi: ExtensionAPI) {
  // Track modified files for diff display
  const modifiedFiles = new Map<string, { original: string; current: string }>();

  // Hook into tool calls to backup before first write
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "write" || event.toolName === "edit") {
      const filePath = event.input.path as string;
      if (!filePath) return { block: false };

      const realPath = join(process.cwd(), filePath);
      const backupPath = join(BACKUP_DIR(), filePath);

      // Backup only on first encounter
      if (!TRACKED_FILES.has(filePath)) {
        TRACKED_FILES.add(filePath);
        
        if (existsSync(realPath)) {
          mkdirSync(dirname(backupPath), { recursive: true });
          copyFileSync(realPath, backupPath);
          
          // Store original content for diff
          modifiedFiles.set(filePath, {
            original: readFileSync(realPath, "utf-8"),
            current: readFileSync(realPath, "utf-8")
          });
        } else {
          // New file — mark as empty original
          modifiedFiles.set(filePath, { original: "", current: "" });
        }

        // Show backup notification
        ctx.ui.notify(`⬡ Backing up ${filePath}`, "info");
      }

      // Update current content tracking (for diff display)
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

  // Export for use in workflow extension
  return { 
    getModifiedFiles: () => modifiedFiles,
    getBackupDir: BACKUP_DIR,
    clearTracking: () => {
      TRACKED_FILES.clear();
      modifiedFiles.clear();
    }
  };
}
```

### 3. `vazir-workflow.ts` — Commands & Learning Loop

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { copyFileSync, renameSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";

const CONTEXT = () => join(process.cwd(), ".context");
const LEARNINGS = () => join(CONTEXT(), "learnings/code-review.md");
const PLAN = () => join(CONTEXT(), "memory/active-plan.md");
const SYSTEM = () => join(CONTEXT(), "memory/system.md");
const PENDING = () => join(CONTEXT(), "history/pending");

// Jaro-Winkler for deduplication
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

export default function (pi: ExtensionAPI) {
  // Import backup tracking from vazir-backup
  let backupApi: any = null;
  
  pi.on("session_start", async (_event, ctx) => {
    // Get reference to backup extension's exports
    backupApi = (ctx as any).extensions?.["vazir-backup"];
  });

  pi.registerCommand("approve", {
    description: "Accept changes and archive backup",
    handler: async (_args, ctx) => {
      if (!existsSync(PENDING())) {
        ctx.ui.notify("No pending changes to approve.", "info");
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const archiveDir = join(CONTEXT(), "history", timestamp);
      renameSync(PENDING(), archiveDir);

      // Write manifest
      const files = readdirSync(archiveDir).filter(f => f !== "manifest.json");
      const manifest = {
        timestamp,
        task: getActiveTask(),
        files
      };
      writeFileSync(join(archiveDir, "manifest.json"), JSON.stringify(manifest, null, 2));

      // Clear tracking
      backupApi?.clearTracking();

      // Update index (simplified — just touch files for now)
      updateIndex(files);

      ctx.ui.notify(`✓ Accepted — ${files.length} file(s) archived`, "info");
      backupApi = null;
    }
  });

  pi.registerCommand("reject", {
    description: "Reject changes and restore from backup",
    handler: async (_args, ctx) => {
      if (!existsSync(PENDING())) {
        ctx.ui.notify("No pending changes to reject.", "info");
        return;
      }

      const reason = await ctx.ui.input(
        "Why are you rejecting? (optional)",
        "e.g. broke the token validation signature..."
      );

      // Restore files from backup
      const pendingDir = PENDING();
      for (const file of walkDir(pendingDir)) {
        const backupPath = join(pendingDir, file);
        const realPath = join(process.cwd(), file);
        copyFileSync(backupPath, realPath);
      }

      // Branch session so LLM knows what was attempted
      const filesAttempted = walkDir(pendingDir);
      await ctx.sessionManager.branchWithSummary(
        `Rejected changes. ${reason ? `Reason: ${reason}. ` : ""}Files attempted: ${filesAttempted.join(", ")}`
      );

      // Capture learning
      if (reason?.trim()) {
        await appendLearning(reason.trim());
        
        // Check for promotion
        const similar = findSimilarLearning(reason.trim());
        if (similar && similar.seen >= getSeenThreshold()) {
          const promote = await ctx.ui.confirm(
            "Promote to permanent rule?",
            `This pattern has appeared ${similar.seen + 1} times.`
          );
          if (promote) {
            const ruleText = await ctx.ui.editor("Edit rule:", `- ${similar.text}`);
            if (ruleText?.trim()) {
              appendToSystemMd(ruleText.trim(), "manual");
              ctx.ui.notify("Rule added to system.md", "info");
            }
          }
        }
      }

      // Cleanup
      rmSync(pendingDir, { recursive: true, force: true });
      backupApi?.clearTracking();
      ctx.ui.notify("Changes rejected and restored.", "info");
      backupApi = null;
    }
  });

  pi.registerCommand("diff", {
    description: "Show diff of pending changes",
    handler: async (_args, ctx) => {
      if (!existsSync(PENDING())) {
        ctx.ui.notify("No pending changes.", "info");
        return;
      }

      const files = backupApi?.getModifiedFiles?.() || new Map();
      if (files.size === 0) {
        ctx.ui.notify("No files tracked.", "info");
        return;
      }

      // Build diff output
      const lines: string[] = ["", "┌─ pending changes ──────────────────────────┐"];
      
      for (const [path, { original, current }] of files.entries()) {
        const delta = computeLineDelta(original, current);
        const indicator = delta.added > 0 || delta.removed > 0 ? "~" : existsSync(join(process.cwd(), path)) ? " " : "+";
        const pad = " ".repeat(Math.max(0, 40 - path.length));
        lines.push(`│ ${indicator} ${path}${pad}+${delta.added}/-${delta.removed}  │`);
      }

      lines.push("└────────────────────────────────────────────┘");
      lines.push("");
      lines.push("Use /approve to keep or /reject to restore.");

      ctx.ui.notify(lines.join("\n"), "info");
    }
  });

  pi.registerCommand("plan", {
    description: "Show current active plan",
    handler: async (_args, ctx) => {
      if (!existsSync(PLAN())) {
        ctx.ui.notify("No active plan.", "info");
        return;
      }
      const content = readFileSync(PLAN(), "utf-8");
      ctx.ui.notify(content, "info");
    }
  });

  pi.registerCommand("verify", {
    description: "Run configured test command",
    handler: async (_args, ctx) => {
      const settings = loadSettings();
      if (!settings.test_command) {
        ctx.ui.notify("No test_command in settings.", "warning");
        return;
      }

      ctx.ui.setWorkingMessage("Running tests...");
      const { execSync } = await import("child_process");
      
      try {
        const output = execSync(settings.test_command, { 
          cwd: process.cwd(), 
          encoding: "utf-8",
          timeout: 120000 
        });
        ctx.ui.setWorkingMessage();
        ctx.ui.notify("✓ Tests passed", "info");
      } catch (e: any) {
        ctx.ui.setWor# Vazir POC Spec — pi-mono Implementation  
**Version:** 3.0  
**Base:** `@mariozechner/pi-coding-agent` extension system  
**Goal:** Validate the context engine thesis with minimal complexity  
**Timeline:** 1–2 weeks to working CLI  

---

## What This Is

A proof of concept, not a product. We validate the core thesis—**does accumulated project context make a cheap model produce better results than a frontier model starting cold?**—without building the full Rust/Tauri IDE.

This version uses a **simplified backup/restore model** instead of a complex sandbox. The AI writes directly to real files using standard `write`/`edit` tools. Before the first write, we backup the original files. If the user rejects the changes, we restore from backup. This enables immediate live testing (dev servers, etc.) while preserving the safety of review-before-commit.

The `.context/` folder structure remains identical to the full Vazir PRD. When the full product is built, users migrate their existing `.context/` folders directly.

---

## Success Criteria

After 30 days of real use:

1. **Context map orientation:** Plans reference project structure correctly without re-explaining it each session  
2. **Self-correcting loop:** Rejection rate trends down across 20 tasks as learnings accumulate in `system.md`  
3. **Model-swap quality:** After 20 tasks, switching from Claude Sonnet to Haiku produces equivalent output on project-specific tasks  
4. **Zero-token routing:** The `select()`/`confirm()` gate feels faster than typing prefix commands  
5. **Branch-on-reject:** After rejection and retry, the LLM avoids the same mistake  

If these answer yes: build the product. If no: you've learned something cheap.

---

## Architecture (Simplified)

```
pi-coding-agent (base)
    ├── .pi/extensions/
    │   ├── vazir-context.ts      # Context map injection + AGENTS.md fallback
    │   ├── vazir-backup.ts       # Backup on first write, restore on reject
    │   └── vazir-workflow.ts     # /approve /reject /diff /plan /verify /vazir-init
    │
    ├── .pi/skills/
    │   ├── vazir-base.md         # automatic: true — always-on constraints
    │   ├── vazir-one-shot.md     # loaded for score ≥ 76
    │   ├── vazir-step-by-step.md # loaded for score 40–75
    │   └── vazir-interview.md    # loaded for score < 40
    │
    ├── AGENTS.md                 # Cross-framework project context
    └── .context/                 # Vazir brain — identical to full PRD spec
        ├── memory/
        │   ├── context-map.md    # Vazir-optimised conductor (150 tokens)
        │   ├── system.md         # Rules, learned rules
        │   ├── active-plan.md    # Current task plan
        │   └── index.md          # Codebase index (manual for POC)
        ├── learnings/
        │   └── code-review.md    # Append-only, seen: N counter
        ├── history/              # Snapshots on /approve
        │   └── pending/          # Active backup before /approve or /reject
        ├── prd/
        ├── templates/
        └── settings/
            └── project.json
```

---

## The Simplified Workflow

```
User submits task
      ↓
Zero-token routing gate (score < 40, 40-75, ≥76)
      ↓
Inject mode-specific skill (one-shot, step-by-step, interview)
      ↓
AI uses standard write/edit tools (no custom tools!)
      ↓
First write triggers backup to .context/history/pending/
      ↓
User tests LIVE immediately (dev server hot-reloads, etc.)
      ↓
Works? → /approve → move backup to history/, update learnings
Fails? → /reject → restore from backup, capture reason → learnings
```

**Key difference from v2:** No `vwrite`/`vedit`. No tool interception complexity. No "sandbox directory." Just standard file operations with a backup safety net.

---

## Extension Files

### 1. `vazir-context.ts` — Context Map Injection

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export default function (pi: ExtensionAPI) {
  // Inject context into every agent turn
  // Priority: context-map.md → AGENTS.md
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

  // Custom compaction — reconstruct from session branch
  pi.on("session_before_compact", async (_event, ctx) => {
    const branch = ctx.sessionManager.getBranch();
    const completed: string[] = [];
    
    for (const entry of branch) {
      if (entry.type !== "message") continue;
      const msg = entry.message;
      if (msg.role !== "toolResult") continue;
      if (msg.toolName === "write" || msg.toolName === "edit") {
        // Track completed work
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
import { copyFileSync, existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";

const BACKUP_DIR = () => join(process.cwd(), ".context/history/pending");
const TRACKED_FILES = new Set<string>();

// Compute simple line delta for display
function computeDelta(original: string, modified: string): { added: number; removed: number } {
  const origLines = original.split("\n");
  const modLines = modified.split("\n");
  // Simple approximation: if lengths differ significantly, report net change
  const added = Math.max(0, modLines.length - origLines.length);
  const removed = Math.max(0, origLines.length - modLines.length);
  return { added, removed };
}

export default function (pi: ExtensionAPI) {
  // Track modified files for diff display
  const modifiedFiles = new Map<string, { original: string; current: string }>();

  // Hook into tool calls to backup before first write
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "write" || event.toolName === "edit") {
      const filePath = event.input.path as string;
      if (!filePath) return { block: false };

      const realPath = join(process.cwd(), filePath);
      const backupPath = join(BACKUP_DIR(), filePath);

      // Backup only on first encounter
      if (!TRACKED_FILES.has(filePath)) {
        TRACKED_FILES.add(filePath);
        
        if (existsSync(realPath)) {
          mkdirSync(dirname(backupPath), { recursive: true });
          copyFileSync(realPath, backupPath);
          
          // Store original content for diff
          modifiedFiles.set(filePath, {
            original: readFileSync(realPath, "utf-8"),
            current: readFileSync(realPath, "utf-8")
          });
        } else {
          // New file — mark as empty original
          modifiedFiles.set(filePath, { original: "", current: "" });
        }

        // Show backup notification
        ctx.ui.notify(`⬡ Backing up ${filePath}`, "info");
      }

      // Update current content tracking (for diff display)
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

  // Export for use in workflow extension
  return { 
    getModifiedFiles: () => modifiedFiles,
    getBackupDir: BACKUP_DIR,
    clearTracking: () => {
      TRACKED_FILES.clear();
      modifiedFiles.clear();
    }
  };
}
```

### 3. `vazir-workflow.ts` — Commands & Learning Loop

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { copyFileSync, renameSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";

const CONTEXT = () => join(process.cwd(), ".context");
const LEARNINGS = () => join(CONTEXT(), "learnings/code-review.md");
const PLAN = () => join(CONTEXT(), "memory/active-plan.md");
const SYSTEM = () => join(CONTEXT(), "memory/system.md");
const PENDING = () => join(CONTEXT(), "history/pending");

// Jaro-Winkler for deduplication
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

export default function (pi: ExtensionAPI) {
  // Import backup tracking from vazir-backup
  let backupApi: any = null;
  
  pi.on("session_start", async (_event, ctx) => {
    // Get reference to backup extension's exports
    backupApi = (ctx as any).extensions?.["vazir-backup"];
  });

  pi.registerCommand("approve", {
    description: "Accept changes and archive backup",
    handler: async (_args, ctx) => {
      if (!existsSync(PENDING())) {
        ctx.ui.notify("No pending changes to approve.", "info");
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const archiveDir = join(CONTEXT(), "history", timestamp);
      renameSync(PENDING(), archiveDir);

      // Write manifest
      const files = readdirSync(archiveDir).filter(f => f !== "manifest.json");
      const manifest = {
        timestamp,
        task: getActiveTask(),
        files
      };
      writeFileSync(join(archiveDir, "manifest.json"), JSON.stringify(manifest, null, 2));

      // Clear tracking
      backupApi?.clearTracking();

      // Update index (simplified — just touch files for now)
      updateIndex(files);

      ctx.ui.notify(`✓ Accepted — ${files.length} file(s) archived`, "info");
      backupApi = null;
    }
  });

  pi.registerCommand("reject", {
    description: "Reject changes and restore from backup",
    handler: async (_args, ctx) => {
      if (!existsSync(PENDING())) {
        ctx.ui.notify("No pending changes to reject.", "info");
        return;
      }

      const reason = await ctx.ui.input(
        "Why are you rejecting? (optional)",
        "e.g. broke the token validation signature..."
      );

      // Restore files from backup
      const pendingDir = PENDING();
      for (const file of walkDir(pendingDir)) {
        const backupPath = join(pendingDir, file);
        const realPath = join(process.cwd(), file);
        copyFileSync(backupPath, realPath);
      }

      // Branch session so LLM knows what was attempted
      const filesAttempted = walkDir(pendingDir);
      await ctx.sessionManager.branchWithSummary(
        `Rejected changes. ${reason ? `Reason: ${reason}. ` : ""}Files attempted: ${filesAttempted.join(", ")}`
      );

      // Capture learning
      if (reason?.trim()) {
        await appendLearning(reason.trim());
        
        // Check for promotion
        const similar = findSimilarLearning(reason.trim());
        if (similar && similar.seen >= getSeenThreshold()) {
          const promote = await ctx.ui.confirm(
            "Promote to permanent rule?",
            `This pattern has appeared ${similar.seen + 1} times.`
          );
          if (promote) {
            const ruleText = await ctx.ui.editor("Edit rule:", `- ${similar.text}`);
            if (ruleText?.trim()) {
              appendToSystemMd(ruleText.trim(), "manual");
              ctx.ui.notify("Rule added to system.md", "info");
            }
          }
        }
      }

      // Cleanup
      rmSync(pendingDir, { recursive: true, force: true });
      backupApi?.clearTracking();
      ctx.ui.notify("Changes rejected and restored.", "info");
      backupApi = null;
    }
  });

  pi.registerCommand("diff", {
    description: "Show diff of pending changes",
    handler: async (_args, ctx) => {
      if (!existsSync(PENDING())) {
        ctx.ui.notify("No pending changes.", "info");
        return;
      }

      const files = backupApi?.getModifiedFiles?.() || new Map();
      if (files.size === 0) {
        ctx.ui.notify("No files tracked.", "info");
        return;
      }

      // Build diff output
      const lines: string[] = ["", "┌─ pending changes ──────────────────────────┐"];
      
      for (const [path, { original, current }] of files.entries()) {
        const delta = computeLineDelta(original, current);
        const indicator = delta.added > 0 || delta.removed > 0 ? "~" : existsSync(join(process.cwd(), path)) ? " " : "+";
        const pad = " ".repeat(Math.max(0, 40 - path.length));
        lines.push(`│ ${indicator} ${path}${pad}+${delta.added}/-${delta.removed}  │`);
      }

      lines.push("└────────────────────────────────────────────┘");
      lines.push("");
      lines.push("Use /approve to keep or /reject to restore.");

      ctx.ui.notify(lines.join("\n"), "info");
    }
  });

  pi.registerCommand("plan", {
    description: "Show current active plan",
    handler: async (_args, ctx) => {
      if (!existsSync(PLAN())) {
        ctx.ui.notify("No active plan.", "info");
        return;
      }
      const content = readFileSync(PLAN(), "utf-8");
      ctx.ui.notify(content, "info");
    }
  });

  pi.registerCommand("verify", {
    description: "Run configured test command",
    handler: async (_args, ctx) => {
      const settings = loadSettings();
      if (!settings.test_command) {
        ctx.ui.notify("No test_command in settings.", "warning");
        return;
      }

      ctx.ui.setWorkingMessage("Running tests...");
      const { execSync } = await import("child_process");
      
      try {
        const output = execSync(settings.test_command, { 
          cwd: process.cwd(), 
          encoding: "utf-8",
          timeout: 120000 
        });
        ctx.ui.setWorkingMessage();
        ctx.ui.notify("✓ Tests passed", "info");
      } catch (e: any) {
        ctx.ui.setWorkingMessage();
        const failure = e.stdout?.split("\n").slice(0, 5).join("\n") || "Test failure";
        await appendLearning(`Test failure: ${failure}`);
        ctx.ui.notify("✗ Tests failed — captured to learnings", "warning");
      }
    }
  });

  pi.registerCommand("vazir-init", {
    description: "Initialize .context/ folder",
    handler: async (_args, ctx) => {
      const dirs = [
        "memory", "learnings", "history", "prd/features",
        "technical", "templates", "settings"
      ];
      
      for (const dir of dirs) {
        mkdirSync(join(CONTEXT(), dir), { recursive: true });
      }

      // Context map (Vazir-optimized)
      if (!existsSync(join(CONTEXT(), "memory/context-map.md"))) {
        writeFileSync(join(CONTEXT(), "memory/context-map.md"), CONTEXT_MAP_TEMPLATE);
      }

      // AGENTS.md (cross-framework)
      const agentsPath = join(process.cwd(), "AGENTS.md");
      if (!existsSync(agentsPath)) {
        writeFileSync(agentsPath, AGENTS_MD_TEMPLATE);
      }

      // System.md
      if (!existsSync(SYSTEM())) {
        writeFileSync(SYSTEM(), SYSTEM_MD_TEMPLATE);
      }

      // Settings
      if (!existsSync(join(CONTEXT(), "settings/project.json"))) {
        writeFileSync(join(CONTEXT(), "settings/project.json"), JSON.stringify({
          project_name: "",
          primary_language: "",
          test_command: "",
          onboarded: false,
          history_max_sessions: 100,
          seen_threshold: 3,
          model_tier: "balanced"
        }, null, 2));
      }

      ctx.ui.notify("✓ .context/ initialized + AGENTS.md created", "info");
    }
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────

function loadSettings() {
  const p = join(CONTEXT(), "settings/project.json");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf-8")) : {};
}

function getSeenThreshold() { 
  return loadSettings().seen_threshold ?? 3; 
}

function getActiveTask() {
  if (!existsSync(PLAN())) return "";
  const content = readFileSync(PLAN(), "utf-8");
  return content.match(/task:\s*"?(.+?)"?\s*\n/)?.[1] || "";
}

async function appendLearning(reason: string) {
  mkdirSync(dirname(LEARNINGS()), { recursive: true });
  const entry = `\n---\n${new Date().toISOString()}\n${reason}\nseen: 1\n`;
  writeFileSync(LEARNINGS(), (existsSync(LEARNINGS()) ? readFileSync(LEARNINGS(), "utf-8") : "") + entry);
}

function findSimilarLearning(text: string): { text: string; seen: number } | null {
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

function walkDir(dir: string): string[] {
  const result: string[] = [];
  if (!existsSync(dir)) return result;
  
  function walk(current: string, prefix: string) {
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      const relPath = prefix ? join(prefix, entry.name) : entry.name;
      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else {
        result.push(relPath);
      }
    }
  }
  walk(dir, "");
  return result;
}

function computeLineDelta(original: string, current: string): { added: number; removed: number } {
  const origLines = original ? original.split("\n").length : 0;
  const currLines = current ? current.split("\n").length : 0;
  return {
    added: Math.max(0, currLines - origLines),
    removed: Math.max(0, origLines - currLines)
  };
}

function updateIndex(files: string[]) {
  // Simplified — just touch index.md for now
  const indexPath = join(CONTEXT(), "memory/index.md");
  const timestamp = new Date().toISOString();
  const entries = files.map(f => `## ${f}\n- last_indexed: ${timestamp}\n`);
  const existing = existsSync(indexPath) ? readFileSync(indexPath, "utf-8") : "";
  writeFileSync(indexPath, existing + "\n" + entries.join("\n"));
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

## Skill Files (Unchanged)

The skill system remains the same — modes are injected via `before_agent_start` based on the scorer result.

**`.pi/skills/vazir-base.md`** (automatic: true)
```markdown
---
name: vazir-base
description: Baseline constraints
automatic: true
---

- Use standard write/edit tools normally
- All changes are tracked automatically — do not summarize after editing
- Wait for user to run /approve or /reject — do not ask "shall I apply these changes?"
```

**`.pi/skills/vazir-one-shot.md`**, **`.pi/skills/vazir-step-by-step.md`**, **`.pi/skills/vazir-interview.md`** — unchanged from v2.2.

---

## Zero-Token Routing (Scorer)

Same as v2.2, but simplified — no need to handle sandbox mode switching. The scorer just determines which skill to load.

---

## `.context/` Folder Contract

Identical to full Vazir PRD. The POC writes:
- `memory/context-map.md` — 150-token conductor
- `memory/system.md` — constitution with learned rules
- `memory/active-plan.md` — current task (YAML)
- `learnings/code-review.md` — append-only log
- `history/YYYY-MM-DD.../` — snapshots on approve
- `history/pending/` — active backup (deleted on approve/reject)
- `settings/project.json` — config

---

## Build Order (Revised)

**Days 1–2:** `vazir-context.ts` + `/vazir-init`  
Get context injection working. Test: does the model orient correctly?

**Days 3–5:** `vazir-backup.ts`  
Backup on first write, track modified files. Test: files backup correctly?

**Days 6–8:** `vazir-workflow.ts`  
`/approve`, `/reject`, `/diff`, learning capture. Test: full loop works?

**Days 9–10:** Scorer + skills  
Add routing gate and mode skills. Polish.

---

## What Changed from v2.2

| Aspect | v2.2 (Complex) | v3.0 (Simplified) |
|--------|----------------|-------------------|
| **Sandbox** | `vwrite`/`vedit` custom tools | Standard `write`/`edit` + backup |
| **Tool interception** | Block built-in, redirect to sandbox | Allow through, backup first write |
| **Live testing** | Requires preview overlay | Works immediately (real files) |
| **Diff viewing** | Custom widget required | `/diff` command + external `delta` |
| **Complexity** | High (state reconstruction) | Low (file copy/restore) |
| **Lines of code** | ~400 | ~200 |

---

## Known Limitations

- **No pre-accept linting** — run manually or post-accept
- **Diff is line-based approximation** — not character-level
- **No shadow overlay** — files are touched immediately (but restorable)
- **Single-session tracking** — `TRACKED_FILES` is global (acceptable for POC)

---

## Transition to Full Product

When validating:
- `.context/` folder format proven ✓
- Workflow validated (approve/reject/learn) ✓
- Scorer thresholds calibrated ✓

Then build Rust/Tauri version with:
- True sandbox (files untouched until approve)
- Pre-accept lint pipeline
- CM6 diff view
- Multi-session state management

---

*Vazir POC Spec v3.0 — Simplified backup model. Standard tools, backup safety net, immediate live testing. Build the thesis in 1–2 weeks, not 3–4.*kingMessage();
        const failure = e.stdout?.split("\n").slice(0, 5).join("\n") || "Test failure";
        await appendLearning(`Test failure: ${failure}`);
        ctx.ui.notify("✗ Tests failed — captured to learnings", "warning");
      }
    }
  });

  pi.registerCommand("vazir-init", {
    description: "Initialize .context/ folder",
    handler: async (_args, ctx) => {
      const dirs = [
        "memory", "learnings", "history", "prd/features",
        "technical", "templates", "settings"
      ];
      
      for (const dir of dirs) {
        mkdirSync(join(CONTEXT(), dir), { recursive: true });
      }

      // Context map (Vazir-optimized)
      if (!existsSync(join(CONTEXT(), "memory/context-map.md"))) {
        writeFileSync(join(CONTEXT(), "memory/context-map.md"), CONTEXT_MAP_TEMPLATE);
      }

      // AGENTS.md (cross-framework)
      const agentsPath = join(process.cwd(), "AGENTS.md");
      if (!existsSync(agentsPath)) {
        writeFileSync(agentsPath, AGENTS_MD_TEMPLATE);
      }

      // System.md
      if (!existsSync(SYSTEM())) {
        writeFileSync(SYSTEM(), SYSTEM_MD_TEMPLATE);
      }

      // Settings
      if (!existsSync(join(CONTEXT(), "settings/project.json"))) {
        writeFileSync(join(CONTEXT(), "settings/project.json"), JSON.stringify({
          project_name: "",
          primary_language: "",
          test_command: "",
          onboarded: false,
          history_max_sessions: 100,
          seen_threshold: 3,
          model_tier: "balanced"
        }, null, 2));
      }

      ctx.ui.notify("✓ .context/ initialized + AGENTS.md created", "info");
    }
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────

function loadSettings() {
  const p = join(CONTEXT(), "settings/project.json");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf-8")) : {};
}

function getSeenThreshold() { 
  return loadSettings().seen_threshold ?? 3; 
}

function getActiveTask() {
  if (!existsSync(PLAN())) return "";
  const content = readFileSync(PLAN(), "utf-8");
  return content.match(/task:\s*"?(.+?)"?\s*\n/)?.[1] || "";
}

async function appendLearning(reason: string) {
  mkdirSync(dirname(LEARNINGS()), { recursive: true });
  const entry = `\n---\n${new Date().toISOString()}\n${reason}\nseen: 1\n`;
  writeFileSync(LEARNINGS(), (existsSync(LEARNINGS()) ? readFileSync(LEARNINGS(), "utf-8") : "") + entry);
}

function findSimilarLearning(text: string): { text: string; seen: number } | null {
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

function walkDir(dir: string): string[] {
  const result: string[] = [];
  if (!existsSync(dir)) return result;
  
  function walk(current: string, prefix: string) {
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      const relPath = prefix ? join(prefix, entry.name) : entry.name;
      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else {
        result.push(relPath);
      }
    }
  }
  walk(dir, "");
  return result;
}

function computeLineDelta(original: string, current: string): { added: number; removed: number } {
  const origLines = original ? original.split("\n").length : 0;
  const currLines = current ? current.split("\n").length : 0;
  return {
    added: Math.max(0, currLines - origLines),
    removed: Math.max(0, origLines - currLines)
  };
}

function updateIndex(files: string[]) {
  // Simplified — just touch index.md for now
  const indexPath = join(CONTEXT(), "memory/index.md");
  const timestamp = new Date().toISOString();
  const entries = files.map(f => `## ${f}\n- last_indexed: ${timestamp}\n`);
  const existing = existsSync(indexPath) ? readFileSync(indexPath, "utf-8") : "";
  writeFileSync(indexPath, existing + "\n" + entries.join("\n"));
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

## Skill Files (Unchanged)

The skill system remains the same — modes are injected via `before_agent_start` based on the scorer result.

**`.pi/skills/vazir-base.md`** (automatic: true)
```markdown
---
name: vazir-base
description: Baseline constraints
automatic: true
---

- Use standard write/edit tools normally
- All changes are tracked automatically — do not summarize after editing
- Wait for user to run /approve or /reject — do not ask "shall I apply these changes?"
```

**`.pi/skills/vazir-one-shot.md`**, **`.pi/skills/vazir-step-by-step.md`**, **`.pi/skills/vazir-interview.md`** — unchanged from v2.2.

---

## Zero-Token Routing (Scorer)

Same as v2.2, but simplified — no need to handle sandbox mode switching. The scorer just determines which skill to load.

---

## `.context/` Folder Contract

Identical to full Vazir PRD. The POC writes:
- `memory/context-map.md` — 150-token conductor
- `memory/system.md` — constitution with learned rules
- `memory/active-plan.md` — current task (YAML)
- `learnings/code-review.md` — append-only log
- `history/YYYY-MM-DD.../` — snapshots on approve
- `history/pending/` — active backup (deleted on approve/reject)
- `settings/project.json` — config

---

## Build Order (Revised)

**Days 1–2:** `vazir-context.ts` + `/vazir-init`  
Get context injection working. Test: does the model orient correctly?

**Days 3–5:** `vazir-backup.ts`  
Backup on first write, track modified files. Test: files backup correctly?

**Days 6–8:** `vazir-workflow.ts`  
`/approve`, `/reject`, `/diff`, learning capture. Test: full loop works?

**Days 9–10:** Scorer + skills  
Add routing gate and mode skills. Polish.

---

## What Changed from v2.2

| Aspect | v2.2 (Complex) | v3.0 (Simplified) |
|--------|----------------|-------------------|
| **Sandbox** | `vwrite`/`vedit` custom tools | Standard `write`/`edit` + backup |
| **Tool interception** | Block built-in, redirect to sandbox | Allow through, backup first write |
| **Live testing** | Requires preview overlay | Works immediately (real files) |
| **Diff viewing** | Custom widget required | `/diff` command + external `delta` |
| **Complexity** | High (state reconstruction) | Low (file copy/restore) |
| **Lines of code** | ~400 | ~200 |

---

## Known Limitations

- **No pre-accept linting** — run manually or post-accept
- **Diff is line-based approximation** — not character-level
- **No shadow overlay** — files are touched immediately (but restorable)
- **Single-session tracking** — `TRACKED_FILES` is global (acceptable for POC)

---

## Transition to Full Product

When validating:
- `.context/` folder format proven ✓
- Workflow validated (approve/reject/learn) ✓
- Scorer thresholds calibrated ✓

Then build Rust/Tauri version with:
- True sandbox (files untouched until approve)
- Pre-accept lint pipeline
- CM6 diff view
- Multi-session state management

---

*Vazir POC Spec v3.0 — Simplified backup model. Standard tools, backup safety net, immediate live testing. Build the thesis in 1–2 weeks, not 3–4.*