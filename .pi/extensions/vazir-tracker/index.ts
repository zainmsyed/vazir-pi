/// <reference path="../../../types/pi-runtime-ambient.d.ts" />
/// <reference path="../../../types/node-runtime-ambient.d.ts" />

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as piTui from "@mariozechner/pi-tui";
import * as fs from "fs";
import * as path from "path";
import {
  complaintsLogPath,
  compareStoriesByRecencyDesc,
  detectJJ,
  findActiveStory,
  nonTerminalStories,
  nowISO,
  readIfExists,
  todayDate,
  type StoryFrontmatter,
  updateStoryFrontmatter,
} from "../../lib/vazir-helpers.ts";
import {
  applyWorkingMessage,
  beginToolActivity,
  callUiMethod,
  changedFiles,
  claimPendingEditCall,
  endToolActivity,
  ensureSessionChromeMounted,
  type FileInfo,
  formatEditStreamEntry,
  getEditStreamSnapshot,
  invalidateStoryProgressCache,
  pushPendingEditCall,
  recordEditStreamEntry,
  refreshWidgets,
  registerCommandHelpShortcut,
  setChromeSession,
  setVcsFlags,
  startFooterRefreshTicker,
  storyPickerChoices,
  tearDownChromeSession,
  toolPathFromInput,
  viewSelectedStoryOrPlan,
} from "./chrome.ts";
import {
  brandPath,
  componentsPath,
  designSystemPath,
  hasUiTypeOverride,
  isUiStory,
} from "../vazir-context/helpers.ts";
import {
  autoDescribeCurrentJjChange,
  type CheckpointMeta,
  checkpointLabel,
  detectGitRepo,
  findOrphanedGitSessions,
  gitRestoreCheckpoint,
  gitSnapshotFile,
  isGitClean,
  jjCheckpointChoices,
  jjDiffFile,
  jjHasChanges,
  jjRestoreCheckpoint,
  listGitCheckpoints,
  loadJjCheckpointLabels,
  persistCurrentJjCheckpointLabel,
  sessionCheckpointDir,
  syncChanges,
} from "./vcs.ts";

// ── Session state ──────────────────────────────────────────────────────

let lastUserPrompt = "";
let useJJ = false;
let hasGitRepo = false;
let currentSessionId = "";

export function normalizeTrackerInputText(text: string): string {
  return text.trim() === "/impliment" ? "/implement" : text;
}

// ── Story issue helpers ────────────────────────────────────────────────

function appendToStoryIssues(storyPath: string, description: string): void {
  const content = readIfExists(storyPath);
  if (!content) return;

  const issueEntry = [
    `### /fix — "${description}"`,
    `- **Reported:** ${todayDate()}  `,
    `- **Status:** pending  `,
    `- **Agent note:** —  `,
    `- **Solution:** —`,
    "",
  ].join("\n");

  const issuesHeading = "## Issues";
  const issuesIndex = content.indexOf(issuesHeading);
  if (issuesIndex >= 0) {
    const insertPos = issuesIndex + issuesHeading.length;
    const updated = content.slice(0, insertPos) + "\n\n" + issueEntry + content.slice(insertPos);
    fs.writeFileSync(storyPath, updated);
  } else {
    fs.writeFileSync(storyPath, content.trimEnd() + "\n\n## Issues\n\n" + issueEntry + "\n");
  }
}

function sanitizeComplaintDescription(description: string): string {
  return description
    .replace(/\|/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

function appendToComplaintsLog(cwd: string, storyName: string, description: string): void {
  const logPath = complaintsLogPath(cwd);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });

  const safeDescription = sanitizeComplaintDescription(description);
  const entry = `${nowISO()} | ${storyName} | "${safeDescription}" | status: pending\n`;
  const existing = readIfExists(logPath);
  const prefix = existing.trimEnd();
  fs.writeFileSync(logPath, `${prefix ? `${prefix}\n` : ""}${entry}`);
}

async function resolveStoryForFix(
  cwd: string,
  ui: any,
): Promise<{ story: StoryFrontmatter | null; reason: "resolved" | "missing" | "cancelled" }> {
  const active = findActiveStory(cwd);
  if (active) {
    return { story: active, reason: "resolved" };
  }

  const candidates = nonTerminalStories(cwd).sort(compareStoriesByRecencyDesc);

  if (candidates.length === 0) {
    return { story: null, reason: "missing" };
  }

  if (candidates.length === 1) {
    const selected = candidates[0];
    if (selected.status === "not-started") {
      updateStoryFrontmatter(selected.file, { status: "in-progress", lastAccessed: todayDate() });
      return {
        story: { ...selected, status: "in-progress", lastAccessed: todayDate() },
        reason: "resolved",
      };
    }
    return { story: selected, reason: "resolved" };
  }

  const options = candidates.map(story => `${path.basename(story.file, ".md")} — ${story.status}`);
  const choice = await ui.select(
    "No in-progress story found. Which story should /fix log to? Selecting a not-started story will mark it in-progress.",
    [...options, "Cancel"],
  );

  if (!choice || choice === "Cancel") {
    return { story: null, reason: "cancelled" };
  }

  const index = options.indexOf(choice);
  if (index < 0) return { story: null, reason: "cancelled" };

  const selected = candidates[index];
  if (selected.status === "not-started") {
    updateStoryFrontmatter(selected.file, { status: "in-progress", lastAccessed: todayDate() });
    return {
      story: { ...selected, status: "in-progress", lastAccessed: todayDate() },
      reason: "resolved",
    };
  }

  return { story: selected, reason: "resolved" };
}

function cwdFromStoryPath(storyPath: string): string {
  const marker = `${path.sep}.context${path.sep}stories${path.sep}`;
  const index = storyPath.indexOf(marker);
  if (index >= 0) return storyPath.slice(0, index);
  return process.cwd();
}

function designSystemHasGaps(content: string): boolean {
  const stripped = content.replace(/<!--[^>]*-->/g, "").trim();
  return !stripped || stripped.includes("—");
}

function buildImplementStoryInstruction(storyPath: string): string {
  const storyLabel = path.basename(storyPath, ".md");
  const cwd = cwdFromStoryPath(storyPath);
  const isUi = hasUiTypeOverride(storyPath) || isUiStory(storyPath);
  const designSystem = isUi ? readIfExists(designSystemPath(cwd)) : "";
  const hasDesignGaps = isUi && designSystemHasGaps(designSystem);
  const instructions = [
    `Implement the in-progress story in .context/stories/${storyLabel}.md.`,
    "",
    "Your job:",
    "1. Read the story goal, verification, scope, checklist, issues, and completion summary.",
    "2. Make the code and content changes needed to satisfy the story checklist.",
    "3. Stay inside the story scope unless you need explicit approval for an exception.",
    "4. Update the checklist as you complete items.",
    "5. If you hit blockers, record them in the Issues section instead of pretending the work is done.",
    "6. If the implementation is complete but the summary is weak or missing, write a useful Completion Summary.",
  ];

  if (isUi) {
    instructions.push(
      `7. If this is a UI story, read \`${path.relative(cwd, brandPath(cwd)).replace(/\\/g, "/")}\` and \`${path.relative(cwd, componentsPath(cwd)).replace(/\\/g, "/")}\` before writing component code.`,
    );
    if (hasDesignGaps) {
      instructions.push(
        "8. If `.context/design/design-system.md` is empty or contains `—` placeholders, before writing UI code pause and ask the standard design gap questions in one batch: primary colour, font, visual style (minimal/playful/dense/data-heavy), and hard constraints (dark mode only, no external font CDN, etc.). Ask only for gaps that are still missing.",
        `9. After the user answers, fill the gaps in ${path.relative(cwd, designSystemPath(cwd)).replace(/\\/g, "/")} and ${path.relative(cwd, brandPath(cwd)).replace(/\\/g, "/")} before implementing. Mark filled fields with \`<!-- source: ${storyLabel} -->\`.`,
        "10. Do not mark the story complete. Vazir will handle the final /complete-story closeout after implementation.",
        "11. Report what changed and whether the story is ready for /complete-story.",
      );
    } else {
      instructions.push(
        "8. Do not mark the story complete. Vazir will handle the final /complete-story closeout after implementation.",
        "9. Report what changed and whether the story is ready for /complete-story.",
      );
    }
  } else {
    instructions.push(
      "7. Do not mark the story complete. Vazir will handle the final /complete-story closeout after implementation.",
      "8. Report what changed and whether the story is ready for /complete-story.",
    );
  }

  return instructions.join("\n");
}

function implementStoryPickerLabel(cwd: string, storyFile: string): string {
  const pickerChoice = storyPickerChoices(cwd).find(choice => choice.kind === "story" && choice.file === storyFile);
  if (!pickerChoice) {
    return path.basename(storyFile, ".md");
  }

  return pickerChoice.label;
}

function implementStoryStartLabel(cwd: string, storyFile: string): string {
  const pickerChoice = implementStoryPickerLabel(cwd, storyFile);
  const labelParts = pickerChoice.split(" — ");
  const storyNumber = labelParts[0]?.replace(/^story-/, "story ") || path.basename(storyFile, ".md");
  const titleAndAge = labelParts.slice(2).join(" — ");
  return titleAndAge ? `Start ${storyNumber} — ${titleAndAge}` : `Start ${storyNumber}`;
}

async function resolveStoryForImplementation(
  cwd: string,
  ui: { select: (prompt: string, choices: string[]) => Promise<string | undefined> },
): Promise<StoryFrontmatter | null> {
  const active = findActiveStory(cwd);
  if (active) return active;

  const candidates = nonTerminalStories(cwd)
    .filter(story => story.status === "in-progress" || story.status === "not-started")
    .sort((left, right) => left.number - right.number);
  const firstStory = candidates[0];
  const startNextStoryLabel = firstStory
    ? implementStoryStartLabel(cwd, firstStory.file)
    : "Start story — begin the earliest open story";
  const pickStoryLabel = "Pick story — choose an existing story to implement";

  const choice = await ui.select("No in-progress story found. What would you like to do?", [
    pickStoryLabel,
    startNextStoryLabel,
    "Cancel",
  ]);

  if (!choice || choice === "Cancel") return null;

  if (choice === startNextStoryLabel) {
    if (!firstStory) return null;

    const now = todayDate();
    updateStoryFrontmatter(firstStory.file, { status: "in-progress", lastAccessed: now });
    return { ...firstStory, status: "in-progress", lastAccessed: now };
  }

  if (choice !== pickStoryLabel || candidates.length === 0) {
    return null;
  }

  const labels = candidates.map(story => implementStoryPickerLabel(cwd, story.file));
  const pick = await ui.select("Which story should /implement use?", [...labels, "Cancel"]);
  if (!pick || pick === "Cancel") return null;

  const selectedIndex = labels.indexOf(pick);
  if (selectedIndex < 0) return null;

  const selected = candidates[selectedIndex];
  if (selected.status === "not-started") {
    const now = todayDate();
    updateStoryFrontmatter(selected.file, { status: "in-progress", lastAccessed: now });
    return { ...selected, status: "in-progress", lastAccessed: now };
  }

  return selected;
}

export function refreshVcsState(cwd: string): void {
  hasGitRepo = detectGitRepo(cwd);
  useJJ = hasGitRepo ? detectJJ(cwd) : false;
  setVcsFlags(hasGitRepo, useJJ);
  if (useJJ) loadJjCheckpointLabels(cwd);
  syncChanges(cwd, hasGitRepo, useJJ);
  refreshWidgets();
}

// ── Extension ──────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.on("input", async (event: { text?: string }) => {
    if (event.text?.trim() === "/impliment") {
      event.text = normalizeTrackerInputText(event.text);
    }

    if (event.text?.trim() && !event.text.startsWith("/")) {
      lastUserPrompt = event.text.trim();
    }
    return { action: "continue" as const };
  });

  // ── session_start ────────────────────────────────────────────────────

  pi.on(
    "session_start",
    async (
      _event: unknown,
      ctx: {
        cwd: string;
        hasUI: boolean;
        sessionManager?: {
          getSessionFile?: () => string;
          getBranch?: () => Array<{
            type: string;
            provider?: string;
            modelId?: string;
            thinkingLevel?: string;
            message?: { role?: string; usage?: { cost?: { total?: number } } };
          }>;
          getEntries?: () => Array<{
            type: string;
            message?: { role?: string; usage?: { cost?: { total?: number } } };
          }>;
          getSessionName?: () => string | undefined;
        };
        model?: { provider?: string; id?: string; reasoning?: boolean };
        getContextUsage?: () => { tokens: number | null; contextWindow: number; percent: number | null } | undefined;
        ui: any;
      },
    ) => {
      const cwd = ctx.cwd;
      hasGitRepo = detectGitRepo(cwd);
      useJJ = hasGitRepo ? detectJJ(cwd) : false;
      if (useJJ) loadJjCheckpointLabels(cwd);

      setVcsFlags(hasGitRepo, useJJ);

      const sessionManager = {
        getBranch: ctx.sessionManager?.getBranch ?? (() => []),
        getEntries: ctx.sessionManager?.getEntries ?? (() => []),
        getSessionName: ctx.sessionManager?.getSessionName,
      };
      setChromeSession(
        { cwd, model: ctx.model, sessionManager, getContextUsage: ctx.getContextUsage ?? (() => undefined) },
        () =>
          (
            pi as {
              getModel?: () => { provider?: string; id?: string; reasoning?: boolean } | null | undefined;
            }
          ).getModel?.() ?? ctx.model,
        () => pi.getThinkingLevel(),
      );

      const sessionFile = (ctx.sessionManager as any)?.getSessionFile?.() ?? "";
      const match = sessionFile.match(/_([a-f0-9]+)\.jsonl$/);
      currentSessionId = match ? match[1] : Date.now().toString(16);

      if (ctx.hasUI) {
        const isInitialized =
          fs.existsSync(path.join(cwd, ".context", "memory", "system.md")) ||
          fs.existsSync(path.join(cwd, ".context", "settings", "project.json"));
        if (!isInitialized) {
          ctx.ui.notify(
            "Vazir is not initialized here. Run /vazir-init to bootstrap .context and optional git/JJ setup.",
            "info",
          );
        }
        startFooterRefreshTicker(cwd => {
          // Re-detect VCS when git was not present at session start (e.g. /vazir-init ran mid-session).
          if (!hasGitRepo) {
            hasGitRepo = detectGitRepo(cwd);
            if (hasGitRepo) {
              useJJ = detectJJ(cwd);
              setVcsFlags(hasGitRepo, useJJ);
              if (useJJ) loadJjCheckpointLabels(cwd);
            }
          }
          syncChanges(cwd, hasGitRepo, useJJ);
        });
        registerCommandHelpShortcut(ctx);
      }

      // ── Recovery check ────────────────────────────────────────────
      if (useJJ) {
        if (jjHasChanges(cwd)) {
          ctx.ui.notify(
            "Work in progress from previous session detected. Use /reset to restore an earlier state.",
            "warning",
          );
        }
      } else if (hasGitRepo) {
        const orphans = findOrphanedGitSessions(cwd, currentSessionId);
        if (orphans.length > 0) {
          if (!isGitClean(cwd)) {
            ctx.ui.notify(
              "Unfinished work from a previous session detected. Use /reset to restore a checkpoint.",
              "warning",
            );
          } else {
            for (const id of orphans) {
              const d = sessionCheckpointDir(cwd, id);
              if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
            }
          }
        }
      }

      if (!ctx.hasUI) return;
      syncChanges(cwd, hasGitRepo, useJJ);
      callUiMethod(ctx.ui, "setToolOutputExpanded", false);
      applyWorkingMessage(ctx.ui);
      ensureSessionChromeMounted(ctx.ui, cwd);
    },
  );

  pi.on("session_shutdown", async (_event: unknown, ctx: { ui?: any }) => {
    hasGitRepo = false;
    useJJ = false;
    tearDownChromeSession(ctx.ui);
  });

  // ── Git fallback: snapshot before agent writes ────────────────────────

  let gitCurrentCheckpointDir = "";
  let gitCheckpointCount = 0;

  pi.on("before_agent_start", async (_event: unknown, ctx: { cwd: string; hasUI?: boolean; ui?: any }) => {
    if (ctx.hasUI) {
      ensureSessionChromeMounted(ctx.ui, ctx.cwd);
    }

    if (useJJ || !hasGitRepo) return;

    gitCheckpointCount++;
    const dir = path.join(sessionCheckpointDir(ctx.cwd, currentSessionId), String(gitCheckpointCount));
    fs.mkdirSync(path.join(dir, "files"), { recursive: true });
    const meta: CheckpointMeta = {
      timestamp: new Date().toISOString(),
      prompt: lastUserPrompt.slice(0, 60),
      files: [],
      newFiles: [],
    };
    fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
    gitCurrentCheckpointDir = dir;
  });

  pi.on(
    "tool_call",
    async (event: { toolName?: string; input?: { path?: string } }, ctx: { cwd: string; ui?: any }) => {
      beginToolActivity(ctx.ui, event.toolName, event.input);

      if (event.toolName === "write" || event.toolName === "edit") {
        const toolName = event.toolName;
        const file = toolPathFromInput(event.input);
        pushPendingEditCall(toolName, file);
        recordEditStreamEntry("start", toolName, file);
        refreshWidgets();
      }

      if (useJJ) return;
      if (event.toolName === "write" || event.toolName === "edit") {
        const filePath = (event.input as any)?.path;
        if (filePath && gitCurrentCheckpointDir) {
          gitSnapshotFile(ctx.cwd, filePath, gitCurrentCheckpointDir);
          const isNew = !fs.existsSync(path.join(ctx.cwd, filePath));
          const mp = path.join(gitCurrentCheckpointDir, "meta.json");
          const meta: CheckpointMeta = JSON.parse(fs.readFileSync(mp, "utf-8"));
          if (!meta.files.includes(filePath)) meta.files.push(filePath);
          if (isNew && !meta.newFiles.includes(filePath)) meta.newFiles.push(filePath);
          fs.writeFileSync(mp, JSON.stringify(meta, null, 2));
        }
      }
    },
  );

  pi.on("tool_result", async (event: { toolName?: string }, ctx: { cwd: string; ui?: any }) => {
    endToolActivity(ctx.ui);

    if (event.toolName === "write" || event.toolName === "edit") {
      const toolName = event.toolName;
      recordEditStreamEntry("done", toolName, claimPendingEditCall(toolName));
    }

    if (event.toolName === "write" || event.toolName === "edit" || event.toolName === "bash") {
      syncChanges(ctx.cwd, hasGitRepo, useJJ);
      refreshWidgets();
    }
  });

  pi.on("agent_end", async (_event: unknown, ctx: { cwd: string; hasUI?: boolean; ui?: any }) => {
    syncChanges(ctx.cwd, hasGitRepo, useJJ);
    refreshWidgets();
    if (ctx.hasUI) ensureSessionChromeMounted(ctx.ui, ctx.cwd);

    if (!useJJ || !lastUserPrompt.trim()) return;

    try {
      persistCurrentJjCheckpointLabel(ctx.cwd, lastUserPrompt);
    } catch {
      /* silent */
    }

    try {
      autoDescribeCurrentJjChange(ctx.cwd, lastUserPrompt);
    } catch {
      /* silent */
    }
  });

  // ── /diff ─────────────────────────────────────────────────────────────

  pi.registerCommand("diff", {
    description: "Show inline terminal diff for a changed file",
    handler: async (_args: string, ctx: { cwd: string; ui: any }) => {
      syncChanges(ctx.cwd, hasGitRepo, useJJ);
      if (changedFiles.size === 0) {
        ctx.ui.notify("No changed files", "info");
        return;
      }

      const files = [...changedFiles.values()];
      let chosen: FileInfo;

      if (files.length === 1) {
        chosen = files[0];
      } else {
        const labels = files.map(f => `${f.status} ${f.file}  +${f.added}/-${f.removed}`);
        const pick = await ctx.ui.select("Diff which file?", labels);
        if (pick == null) return;
        chosen = files[labels.indexOf(pick)];
      }

      let diffText: string;
      try {
        if (useJJ) {
          diffText = jjDiffFile(ctx.cwd, chosen.file);
        } else if (chosen.status === "?") {
          const content = fs.readFileSync(path.join(ctx.cwd, chosen.file), "utf-8");
          diffText = content
            .split("\n")
            .map((l: string) => `+ ${l}`)
            .join("\n");
        } else {
          const { execFileSync } = await import("child_process");
          diffText = execFileSync("git", ["diff", "--no-color", "HEAD", "--", chosen.file], {
            cwd: ctx.cwd,
            encoding: "utf-8",
          });
        }
      } catch (e: any) {
        ctx.ui.notify(`Failed to get diff: ${e.message}`, "error");
        return;
      }

      if (!diffText.trim()) {
        ctx.ui.notify("No diff output", "info");
        return;
      }

      const lines = diffText.split("\n");
      let scrollOffset = 0;

      await ctx.ui.custom((tui: { requestRender(): void }, _theme: unknown, _kb: unknown, done: () => void) => {
        return {
          render(width: number): string[] {
            const visibleRows = Math.max(5, (process.stdout.rows || 24) - 8);
            const header = ` ${chosen.status} ${chosen.file}  +${chosen.added}/-${chosen.removed}  ↑↓ scroll · esc close`;
            const body = lines.slice(scrollOffset, scrollOffset + visibleRows).map(l => l.slice(0, width));
            return [header.slice(0, width), ...body];
          },
          invalidate() {},
          handleInput(data: string) {
            if (piTui.matchesKey(data, piTui.Key.up)) scrollOffset = Math.max(0, scrollOffset - 1);
            else if (piTui.matchesKey(data, piTui.Key.down))
              scrollOffset = Math.min(lines.length - 1, scrollOffset + 1);
            else if (piTui.matchesKey(data, piTui.Key.pageUp)) scrollOffset = Math.max(0, scrollOffset - 10);
            else if (piTui.matchesKey(data, piTui.Key.pageDown))
              scrollOffset = Math.min(lines.length - 1, scrollOffset + 10);
            else if (piTui.matchesKey(data, piTui.Key.escape)) {
              done();
              return;
            }
            tui.requestRender();
          },
        };
      });
    },
  });

  // ── /story ───────────────────────────────────────────────────────────

  pi.registerCommand("story", {
    description: "Pick a story or plan file and open it in a scrollable terminal view",
    handler: async (_args: string, ctx: { cwd: string; ui: any }) => {
      const choices = storyPickerChoices(ctx.cwd);
      if (choices.length === 0) {
        ctx.ui.notify("No plan or story files found yet. Run /plan first.", "info");
        return;
      }

      const labels = choices.map(choice => choice.label);
      const pick = await ctx.ui.select("Which plan or story do you want to view?", labels);
      if (pick == null) return;

      const selected = choices[labels.indexOf(pick)];
      if (!selected) return;

      await viewSelectedStoryOrPlan(ctx, selected.file, selected.label);
    },
  });

  // ── /edits ───────────────────────────────────────────────────────────

  pi.registerCommand("edits", {
    description: "Show the recent file edit stream in an expandable terminal view",
    handler: async (_args: string, ctx: { ui: any }) => {
      const snapshot = getEditStreamSnapshot();
      if (snapshot.length === 0) {
        ctx.ui.notify("No file edit activity captured yet", "info");
        return;
      }

      const lines = snapshot.map(formatEditStreamEntry);
      let scrollOffset = 0;

      await ctx.ui.custom((tui: { requestRender(): void }, _theme: unknown, _kb: unknown, done: () => void) => {
        return {
          render(width: number): string[] {
            const visibleRows = Math.max(5, (process.stdout.rows || 24) - 8);
            const header = ` Recent edits  ${snapshot.length} events  ↑↓ scroll · esc close`;
            const body = lines
              .slice(scrollOffset, scrollOffset + visibleRows)
              .map(line => line.slice(0, width));
            return [header.slice(0, width), ...body];
          },
          invalidate() {},
          handleInput(data: string) {
            if (piTui.matchesKey(data, piTui.Key.up)) scrollOffset = Math.max(0, scrollOffset - 1);
            else if (piTui.matchesKey(data, piTui.Key.down))
              scrollOffset = Math.min(Math.max(0, lines.length - 1), scrollOffset + 1);
            else if (piTui.matchesKey(data, piTui.Key.pageUp)) scrollOffset = Math.max(0, scrollOffset - 10);
            else if (piTui.matchesKey(data, piTui.Key.pageDown))
              scrollOffset = Math.min(Math.max(0, lines.length - 1), scrollOffset + 10);
            else if (piTui.matchesKey(data, piTui.Key.escape)) {
              done();
              return;
            }
            tui.requestRender();
          },
        };
      });
    },
  });

  // ── /fix ──────────────────────────────────────────────────────────────

  pi.registerCommand("fix", {
    description: "Log an issue to the active story and complaints-log, then attempt a fix",
    handler: async (args: string, ctx: { cwd: string; ui: any }) => {
      const cwd = ctx.cwd;

      let description = args.trim();
      if (!description) {
        description =
          (
            await ctx.ui.input("What went wrong?", "e.g. signup button not submitting after refactor")
          )?.trim() ?? "";
      }
      if (!description) {
        ctx.ui.notify("No description provided — /fix cancelled", "info");
        return;
      }

      ctx.ui.notify(
        "Before logging — make sure your complaint doesn't contain API keys, database URLs, or credentials. complaints-log.md is plaintext and persists across sessions.",
        "warning",
      );

      const resolved = await resolveStoryForFix(cwd, ctx.ui);
      if (resolved.reason === "missing") {
        ctx.ui.notify(
          "No active or available story found. Run /plan first so /fix can log against a story file.",
          "warning",
        );
        return;
      }

      if (resolved.reason === "cancelled" || !resolved.story) {
        ctx.ui.notify("/fix cancelled — no story selected", "info");
        return;
      }

      const active = resolved.story;
      const storyName = path.basename(active.file, ".md");

      appendToStoryIssues(active.file, description);
      updateStoryFrontmatter(active.file, { lastAccessed: todayDate() });
      invalidateStoryProgressCache(cwd);
      refreshWidgets();

      ctx.ui.notify(`Issue logged to ${storyName}`, "info");
      appendToComplaintsLog(cwd, storyName, description);

      const instruction = [
        `The user reported an issue via /fix: "${description}"`,
        "",
        `Issue logged to ${storyName} and complaints-log.md.`,
        "",
        "Your job:",
        "1. Investigate and attempt to fix the issue.",
        "2. After fixing, explicitly state what you can verify mechanically and what requires user confirmation.",
        '3. If you cannot verify the fix (UI behaviour, browser state), leave the issue status as "pending" and ask the user to confirm.',
        '4. Never claim "should be working now" without declaring your verification limits.',
      ].join("\n");

      await pi.sendUserMessage(instruction);
    },
  });

  // ── /implement ──────────────────────────────────────────────────────

  const implementStoryHandler = async (_args: string, ctx: { cwd: string; ui: any }) => {
    const cwd = ctx.cwd;
    const story = await resolveStoryForImplementation(cwd, ctx.ui);

    if (!story) {
      ctx.ui.notify("No in-progress story is available to implement.", "info");
      return;
    }

    updateStoryFrontmatter(story.file, { lastAccessed: todayDate() });
    invalidateStoryProgressCache(cwd);
    refreshWidgets();

    const storyLabel = path.basename(story.file, ".md");
    ctx.ui.notify(`Implementing ${storyLabel}`, "info");
    await pi.sendUserMessage(buildImplementStoryInstruction(story.file));
  };

  pi.registerCommand("implement", {
    description: "Implement the active in-progress story and report whether it is ready for closeout",
    handler: implementStoryHandler,
  });

  // ── /checkpoint and /reset ────────────────────────────────────────────

  async function runCheckpointRestore(ctx: { cwd: string; ui: any }) {
    const cwd = ctx.cwd;

    if (useJJ) {
      const pickable = jjCheckpointChoices(cwd);
      if (pickable.length === 0) {
        ctx.ui.notify("No checkpoints available to restore", "info");
        return;
      }

      const restoreChoice = await ctx.ui.select("Restore checkpoint?", [
        "Previous checkpoint — undo last agent turn",
        "Choose checkpoint — pick from history",
        "Cancel",
      ]);

      if (restoreChoice === "Cancel" || restoreChoice == null) return;

      if (restoreChoice === "Previous checkpoint — undo last agent turn") {
        try {
          jjRestoreCheckpoint(cwd, pickable[0].id);
          ctx.ui.notify(`Restored to previous checkpoint (${checkpointLabel(pickable[0])})`, "info");
        } catch (e: any) {
          ctx.ui.notify(`Restore failed: ${e.message}`, "error");
        }
      } else if (restoreChoice === "Choose checkpoint — pick from history") {
        const labels = pickable.map(op => checkpointLabel(op));
        const pick = await ctx.ui.select("Restore to which checkpoint?", labels);
        if (pick != null) {
          const chosen = pickable[labels.indexOf(pick)];
          try {
            jjRestoreCheckpoint(cwd, chosen.id);
            ctx.ui.notify(`Restored to checkpoint: ${checkpointLabel(chosen)}`, "info");
          } catch (e: any) {
            ctx.ui.notify(`Restore failed: ${e.message}`, "error");
          }
        }
      }

      syncChanges(cwd, hasGitRepo, useJJ);
      refreshWidgets();
      return;
    }

    const checkpoints = listGitCheckpoints(cwd, currentSessionId);
    if (checkpoints.length === 0) {
      ctx.ui.notify("No checkpoints available to restore", "info");
      return;
    }

    const restoreChoice = await ctx.ui.select("Restore checkpoint?", [
      "Previous checkpoint — undo last agent turn",
      "Choose checkpoint — pick from list",
      "Cancel",
    ]);

    if (restoreChoice === "Cancel" || restoreChoice == null) return;

    if (restoreChoice === "Previous checkpoint — undo last agent turn") {
      gitRestoreCheckpoint(cwd, checkpoints[0].dir);
      syncChanges(cwd, hasGitRepo, useJJ);
      refreshWidgets();
      ctx.ui.notify("Restored to previous checkpoint", "info");
    } else if (restoreChoice === "Choose checkpoint — pick from list") {
      const labels = checkpoints.map(cp => {
        const t = new Date(cp.meta.timestamp).toLocaleTimeString();
        return `#${cp.n} · ${t} · ${cp.meta.prompt || "—"} · ${cp.meta.files.slice(0, 3).join(", ")}`;
      });
      const pick = await ctx.ui.select("Choose checkpoint to restore:", labels);
      if (pick != null) {
        const chosen = checkpoints[labels.indexOf(pick)];
        gitRestoreCheckpoint(cwd, chosen.dir);
        syncChanges(cwd, hasGitRepo, useJJ);
        refreshWidgets();
        ctx.ui.notify(`Restored checkpoint #${chosen.n}`, "info");
      }
    }
  }

  pi.registerCommand("checkpoint", {
    description: "JJ checkpoint picker — restore to a previous operation",
    handler: async (_args: string, ctx: { cwd: string; ui: any }) => {
      await runCheckpointRestore(ctx);
    },
  });

  pi.registerCommand("reset", {
    description: "Alias for /checkpoint",
    handler: async (_args: string, ctx: { cwd: string; ui: any }) => {
      await runCheckpointRestore(ctx);
    },
  });
}
