/// <reference path="../../../types/pi-runtime-ambient.d.ts" />
/// <reference path="../../../types/node-runtime-ambient.d.ts" />

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";
import {
  complaintsLogPath,
  detectJJ,
  findActiveStory,
  listStories,
  nowISO,
  readIfExists,
  storiesDir,
  todayDate,
  updateStoryFrontmatter,
} from "../../lib/vazir-helpers.ts";
import { refreshVcsState } from "../vazir-tracker/index.ts";
import {
  activeStoryLabelForReview,
  appendLearnedRules,
  applyLocalRuleDedupe,
  buildContextMapDraftInstruction,
  buildInitSummary,
  buildIntakeBrief,
  buildRememberInstruction,
  buildConsolidationInstruction,
  clearLegacyPendingLearnings,
  compactTimestamp,
  contextMapPath,
  detectGitRepo,
  draftContextMap,
  ensureDir,
  ensureIntakeStructure,
  intakeDir,
  ensureReviewStructure,
  ensureSeedStories,
  findWorkableStory,
  indexPath,
  INTAKE_README_TEMPLATE,
  intakeBriefPath,
  intakeReadmePath,
  learnedRuleLinesFromMd,
  listIntakeFiles,
  malformedStoryFiles,
  memoryDir,
  nextStoryNumber,
  normalizeProjectBrief,
  rememberEntry,
  rememberedRulesPath,
  restoreStoryFrontmatter,
  reviewFileTemplate,
  reviewsDir,
  reviewSummaryPath,
  REMEMBERED_RULES_TEMPLATE,
  REVIEW_SUMMARY_TEMPLATE,
  seededPlanTemplate,
  settingsDir,
  snapshotStoryFrontmatter,
  storyFileName,
  strip,
  syncReviewSummaryAndPromoteRules,
  systemPath,
  undescribedIndexFiles,
  userExplicitlyApprovedStatusChange,
  walkSourceFiles,
  writeIndex,
} from "./helpers.ts";

const CONTEXT_MAP_TEMPLATE = [
  "# Context Map",
  "",
  "<!-- Keep this under 150 tokens. Vazir injects it before every agent turn. -->",
  "<!-- Fill in project name, stack, key directories, and fragile areas. -->",
  "",
  "- Project: ",
  "- Stack: ",
  "- Key dirs: ",
  "- Fragile: ",
  "",
].join("\n");

const SYSTEM_MD_TEMPLATE = [
  "# System Rules",
  "",
  "## Rules",
  "- Follow existing project conventions.",
  "- Write directly to real project files.",
  "- Ask before changing ambiguous areas.",
  "",
  "## Learned Rules",
  "",
].join("\n");

const AGENTS_MD_TEMPLATE = [
  "# AGENTS.md",
  "",
  "## Project",
  "- Name:",
  "- Goal:",
  "- Stack:",
  "",
  "## Important Paths",
  "- ",
  "",
  "## Fragile Areas",
  "- ",
  "",
  "## Working Notes",
  "- ",
  "",
].join("\n");

const JJ_DOCS_URL = "https://www.jj-vcs.dev/latest/install-and-setup/";
const JJ_OVERVIEW_URL = "https://www.jj-vcs.dev/latest/";

let lastUserPrompt = "";
let useJJ = false;
let pendingInitSummary: string | null = null;
const storyFrontmatterSnapshots = new Map<string, Map<string, { status: string; completed: string }>>();

export default function (pi: ExtensionAPI) {
  pi.on("input", async (event: any) => {
    if (event.text?.trim() && !event.text.startsWith("/")) {
      lastUserPrompt = event.text.trim();
    }
    return { action: "continue" as const };
  });

  pi.on("session_start", async (_event: any, ctx: any) => {
    useJJ = detectJJ(ctx.cwd);
  });

  pi.on("before_agent_start", async (event: any, ctx: any) => {
    storyFrontmatterSnapshots.set(ctx.cwd, snapshotStoryFrontmatter(ctx.cwd));

    const workable = findWorkableStory(ctx.cwd);
    if (workable && workable.status === "not-started") {
      updateStoryFrontmatter(workable.file, { status: "in-progress", lastAccessed: todayDate() });
    }

    const parts: string[] = [];
    if (pendingInitSummary) {
      parts.push(pendingInitSummary);
      pendingInitSummary = null;
    }
    const contextMap = strip(readIfExists(contextMapPath(ctx.cwd)));
    const agents = strip(readIfExists(path.join(ctx.cwd, "AGENTS.md")));
    const systemMd = strip(readIfExists(systemPath(ctx.cwd)));
    const indexMd = strip(readIfExists(indexPath(ctx.cwd)));

    if (contextMap) parts.push(contextMap);
    else if (agents) parts.push(agents);
    if (systemMd) parts.push(systemMd);
    if (indexMd) parts.push(indexMd);

    // Inject active story
    const active = findActiveStory(ctx.cwd);
    if (active) {
      const storyContent = strip(readIfExists(active.file));
      if (storyContent) {
        parts.push(`[Active Story]\n${storyContent}`);
      }
    }

    if (parts.length === 0) return;

    return {
      systemPrompt: `${parts.join("\n\n---\n\n")}\n\n---\n\n${event.systemPrompt || ""}`,
    };
  });

  pi.on("session_before_compact", async (_event: any, ctx: any) => {
    syncReviewSummaryAndPromoteRules(ctx.cwd);
    clearLegacyPendingLearnings(ctx.cwd);
    applyLocalRuleDedupe(ctx.cwd);
  });

  pi.on("session_shutdown", async (_event: any, ctx: any) => {
    syncReviewSummaryAndPromoteRules(ctx.cwd);
    clearLegacyPendingLearnings(ctx.cwd);
    applyLocalRuleDedupe(ctx.cwd);
    storyFrontmatterSnapshots.delete(ctx.cwd);
  });

  // ── agent_end: zero-token index.md structural updates ─────────────────

  pi.on("agent_end", async (_event: any, ctx: any) => {
    const cwd = ctx.cwd;
    const promotedReviewRules = syncReviewSummaryAndPromoteRules(cwd);
    if (promotedReviewRules.length > 0) {
      ctx.ui.notify(
        `Promoted review rule${promotedReviewRules.length === 1 ? "" : "s"} to system.md: ${promotedReviewRules.join(", ")}`,
        "info",
      );
    }
    // Confirm or revert unauthorized story status changes interactively.
    // Build the candidate list before deleting the snapshot.
    const snapshot = storyFrontmatterSnapshots.get(cwd);
    const pendingStatusChanges: Array<{
      storyFile: string;
      basename: string;
      previous: { status: string; completed: string };
      nextStatus: string;
    }> = [];
    if (snapshot) {
      for (const story of listStories(cwd)) {
        const previous = snapshot.get(story.file);
        if (!previous) continue;
        if (story.status !== "complete" && story.status !== "retired") continue;
        if (story.status === previous.status) continue;
        if (userExplicitlyApprovedStatusChange(lastUserPrompt, story.status)) continue;
        pendingStatusChanges.push({
          storyFile: story.file,
          basename: path.basename(story.file),
          previous,
          nextStatus: story.status,
        });
      }
      storyFrontmatterSnapshots.delete(cwd);
    }

    for (const change of pendingStatusChanges) {
      let shouldRevert: boolean;
      if (ctx.hasUI) {
        const choice = await ctx.ui.select(
          `The agent marked ${change.basename} as "${change.nextStatus}". Did you mean to close this story?`,
          [
            `Yes — keep it as ${change.nextStatus}`,
            `No — revert to ${change.previous.status}`,
          ],
        );
        shouldRevert = choice == null || choice.startsWith("No");
      } else {
        // No interactive UI — auto-revert unauthorized status changes.
        shouldRevert = true;
      }
      if (shouldRevert) {
        restoreStoryFrontmatter(change.storyFile, change.previous);
        ctx.ui.notify(`${change.basename} reverted to "${change.previous.status}"`, "warning");
      }
    }

    const idxPath = indexPath(cwd);
    if (!fs.existsSync(idxPath)) return;

    const existing = readIfExists(idxPath);
    const lines = existing.split("\n");
    const currentFiles = new Set(walkSourceFiles(cwd));
    const updated: string[] = [];
    const indexedFiles = new Set<string>();

    for (const line of lines) {
      // Lines like: path/to/file.ts — description
      const match = line.match(/^(.+?)\s+—\s+(.+)$/);
      if (match) {
        const filePath = match[1].trim();
        if (currentFiles.has(filePath)) {
          updated.push(line);
          indexedFiles.add(filePath);
        }
        // Else: file was deleted/renamed — skip it
      } else {
        updated.push(line);
      }
    }

    // Add new files as (undescribed)
    for (const file of currentFiles) {
      if (!indexedFiles.has(file)) {
        updated.push(`${file} — (undescribed)`);
      }
    }

    const newContent = updated.join("\n");
    if (newContent !== existing) {
      fs.writeFileSync(idxPath, newContent);
    }
  });

  // ── /vazir-init ──────────────────────────────────────────────────────

  pi.registerCommand("vazir-init", {
    description: "Bootstrap Vazir context files, then set up git and JJ when available",
    handler: async (_args: string, ctx: any) => {
      const cwd = ctx.cwd;

      ensureDir(memoryDir(cwd));
      ensureDir(storiesDir(cwd));
      ensureDir(settingsDir(cwd));
      ensureIntakeStructure(cwd);
      ensureReviewStructure(cwd);
      ensureDir(path.join(cwd, ".context", "checkpoints"));

      if (!fs.existsSync(intakeReadmePath(cwd))) {
        fs.writeFileSync(intakeReadmePath(cwd), INTAKE_README_TEMPLATE);
        ctx.ui.notify("intake README created", "info");
      }

      if (!fs.existsSync(systemPath(cwd))) {
        fs.writeFileSync(systemPath(cwd), SYSTEM_MD_TEMPLATE);
        ctx.ui.notify("system.md created", "info");
      }

      // complaints-log.md
      if (!fs.existsSync(complaintsLogPath(cwd))) {
        fs.writeFileSync(complaintsLogPath(cwd), "# Complaints Log\n\n");
        ctx.ui.notify("complaints-log.md created", "info");
      }

      if (!fs.existsSync(reviewSummaryPath(cwd))) {
        fs.writeFileSync(reviewSummaryPath(cwd), REVIEW_SUMMARY_TEMPLATE);
        ctx.ui.notify("review summary created", "info");
      }

      if (!fs.existsSync(rememberedRulesPath(cwd))) {
        fs.writeFileSync(rememberedRulesPath(cwd), REMEMBERED_RULES_TEMPLATE);
        ctx.ui.notify("remembered rules log created", "info");
      }

      const projectSettingsPath = path.join(settingsDir(cwd), "project.json");
      if (!fs.existsSync(projectSettingsPath)) {
        fs.writeFileSync(projectSettingsPath, JSON.stringify({ project_name: "", model_tier: "balanced" }, null, 2));
        ctx.ui.notify("project.json created", "info");
      }

      const agentsPath = path.join(cwd, "AGENTS.md");
      if (!fs.existsSync(agentsPath)) {
        fs.writeFileSync(agentsPath, AGENTS_MD_TEMPLATE);
        ctx.ui.notify("AGENTS.md created", "info");
      }

      const sourceFiles = walkSourceFiles(cwd);
      const indexSummary = writeIndex(cwd, sourceFiles);
      ctx.ui.notify("index.md generated", "info");

      let contextMapStatus = "existing";
      const contextMapExisted = fs.existsSync(contextMapPath(cwd));
      let shouldRequestModelDraft = false;
      if (!contextMapExisted) {
        fs.writeFileSync(contextMapPath(cwd), CONTEXT_MAP_TEMPLATE);
        contextMapStatus = "fill in manually";
        const draftedContextMap = draftContextMap(cwd, sourceFiles);
        if (draftedContextMap) {
          fs.writeFileSync(contextMapPath(cwd), draftedContextMap);
          contextMapStatus = "seeded";
          shouldRequestModelDraft = true;
          ctx.ui.notify("context-map.md seeded — Pi will refine it using the current model", "info");
        }
      }

      ctx.ui.notify(
        `Vazir bootstrap complete • context-map.md: ${contextMapStatus} • index.md: ${indexSummary.total} files indexed • Git check runs now`,
        "info",
      );

      let jjLine = "☒ JJ (Jujutsu): Not started";
      let jjDetailLine = `  ↳ Go here to install directions ${JJ_DOCS_URL}`;
      let gitReady = detectGitRepo(cwd);

      if (!gitReady) {
        const choice = await ctx.ui.select(
          "This folder has no git repo. Git is required for version control and JJ checkpoint support. Initialise git here?",
          [
            "Yes — initialise git",
            "No — I understand, skip git and JJ",
          ],
        );

        if (choice === "Yes — initialise git") {
          try {
            childProcess.execSync("git init", { cwd, stdio: "pipe" });
            gitReady = true;
            ctx.ui.notify("✓ git initialised\nRemember to add a remote:\ngit remote add origin <url>", "info");
          } catch (error: any) {
            ctx.ui.notify(`Git init failed: ${error?.message || String(error)} — JJ skipped`, "warning");
            jjDetailLine = "  ↳ Git initialisation failed, so JJ was skipped";
          }
        } else {
          ctx.ui.notify("No git — JJ skipped, checkpoints unavailable", "warning");
          jjDetailLine = "  ↳ Git is not initialised here, so JJ was skipped";
        }
      }

      let jjAvailable = false;
      if (gitReady) {
        try {
          childProcess.execFileSync("jj", ["--version"], { cwd, stdio: "pipe" });
          jjAvailable = true;
        } catch {
          ctx.ui.notify(
            "JJ is not installed. It gives Vazir a full checkpoint history of every agent turn.\n\nTo install:  brew install jj  (macOS)\n             cargo install jj-cli  (Linux)\n\nAfter installing, run:  jj git init --colocate\nOr just re-run /vazir-init — files are already set up.",
            "info",
          );
        }
      }

      try {
        if (jjAvailable) {
          try {
            childProcess.execFileSync("jj", ["root"], { cwd, stdio: "pipe" });
            ctx.ui.notify("JJ already initialised", "info");
            jjLine = "☑ JJ (Jujutsu): active";
            jjDetailLine = `  ↳ Learn more about JJ ${JJ_OVERVIEW_URL}`;
          } catch {
            childProcess.execFileSync("jj", ["git", "init", "--colocate"], { cwd, stdio: "pipe" });
            for (const branch of ["main", "master"]) {
              try {
                childProcess.execFileSync("jj", ["bookmark", "track", `${branch}@origin`], { cwd, stdio: "pipe" });
                break;
              } catch {
                // Try the next common default branch.
              }
            }
            ctx.ui.notify("JJ initialised", "info");
            jjLine = "☑ JJ (Jujutsu): active";
            jjDetailLine = `  ↳ Learn more about JJ ${JJ_OVERVIEW_URL}`;
          }

          const gitignorePath = path.join(cwd, ".gitignore");
          const gitignore = readIfExists(gitignorePath);
          if (!gitignore.includes(".jj/")) {
            const nextGitignore = `${gitignore.trimEnd()}${gitignore.trim() ? "\n" : ""}.jj/\n`;
            fs.writeFileSync(gitignorePath, nextGitignore);
            ctx.ui.notify("Added .jj/ to .gitignore", "info");
          }
        }
      } catch (error: any) {
        ctx.ui.notify(`JJ setup failed: ${error?.message || String(error)} — continuing with git fallback`, "warning");
      }

      useJJ = jjAvailable && detectJJ(cwd);
      const initSummary = buildInitSummary([
        { label: ".context/memory/system.md", present: fs.existsSync(systemPath(cwd)) },
        { label: ".context/memory/index.md", present: fs.existsSync(indexPath(cwd)) },
        { label: ".context/memory/context-map.md", present: fs.existsSync(contextMapPath(cwd)) },
        { label: ".context/stories/", present: fs.existsSync(storiesDir(cwd)) },
        { label: ".context/intake/", present: fs.existsSync(intakeDir(cwd)) },
        { label: ".context/reviews/", present: fs.existsSync(reviewsDir(cwd)) },
        { label: ".context/complaints-log.md", present: fs.existsSync(complaintsLogPath(cwd)) },
        { label: "AGENTS.md", present: fs.existsSync(agentsPath) },
        { label: ".context/settings/project.json", present: fs.existsSync(projectSettingsPath) },
      ], useJJ ? "☑ JJ (Jujutsu): active" : jjLine, useJJ ? `  ↳ Learn more about JJ ${JJ_OVERVIEW_URL}` : jjDetailLine);
      pendingInitSummary = initSummary;
      ctx.ui.notify(initSummary, "info");

      if (shouldRequestModelDraft || indexSummary.undescribed > 0) {
        await pi.sendUserMessage(buildContextMapDraftInstruction(cwd), { deliverAs: "followUp" });
      }

      // Refresh the footer immediately so the VCS state (branch, commit counter)
      // reflects the new git/JJ setup without requiring a manual /reload.
      refreshVcsState(cwd);
    },
  });

  // ── /plan ────────────────────────────────────────────────────────────

  pi.registerCommand("plan", {
    description: "Start a planning conversation — generates plan.md and story files",
    handler: async (args: string, ctx: any) => {
      const cwd = ctx.cwd;
      ensureDir(storiesDir(cwd));
      ensureIntakeStructure(cwd);

      const planPath = path.join(storiesDir(cwd), "plan.md");
      const planExists = fs.existsSync(planPath);
      const intakeFiles = listIntakeFiles(cwd);

      if (planExists && !args.trim()) {
        const choice = await ctx.ui.select(
          "A plan already exists. What would you like to do?",
          [
            "View current plan",
            "Replan — update scope and stories",
            "Cancel",
          ],
        );

        if (choice === "Cancel" || choice == null) return;

        if (choice === "View current plan") {
          const plan = readIfExists(planPath);
          const stories = listStories(cwd);
          const storyList = stories
            .sort((a, b) => a.number - b.number)
            .map(s => `  ${storyFileName(s.number)} — ${s.status}`)
            .join("\n");
          ctx.ui.notify(`${plan}\n\nStory files:\n${storyList}`, "info");
          return;
        }
      }

      // Read project settings for name
      let projectName = "";
      try {
        const settings = JSON.parse(readIfExists(path.join(settingsDir(cwd), "project.json")));
        projectName = settings.project_name || "";
      } catch { /* ignore */ }

      let planningBrief = args.trim();
      if (!planningBrief) {
        planningBrief = (await ctx.ui.input?.(
          "What are we planning?",
          intakeFiles.length > 0
            ? "Keep it short if needed — /plan will review .context/intake first"
            : "e.g. a SaaS dashboard for tracking team OKRs",
        ))?.trim() ?? "";
      }
      planningBrief = normalizeProjectBrief(planningBrief, projectName);

      fs.writeFileSync(intakeBriefPath(cwd), buildIntakeBrief(cwd, planningBrief, intakeFiles));

      if (intakeFiles.length > 0) {
        ctx.ui.notify(`Found ${intakeFiles.length} intake file${intakeFiles.length === 1 ? "" : "s"} in .context/intake/`, "info");
      } else {
        ctx.ui.notify("No intake files found in .context/intake/ — /plan will rely on the conversation", "info");
      }
      ctx.ui.notify("intake-brief.md refreshed in .context/stories/", "info");

      // Generate or update plan.md
      if (!planExists) {
        fs.writeFileSync(planPath, seededPlanTemplate(projectName, planningBrief, nextStoryNumber(cwd)));
        ctx.ui.notify("plan.md created in .context/stories/", "info");
      }

      const storySeed = ensureSeedStories(cwd, planningBrief);
      const storyFiles = storySeed.files;
      if (storyFiles.length > 0) {
        ctx.ui.notify(
          storySeed.created ? `Seeded starter stories: ${storyFiles.join(", ")}` : `Using existing stories: ${storyFiles.join(", ")}`,
          "info",
        );
      }

      // Instruct the agent to run the planning conversation
      const instruction = [
        "The user wants to plan their project.",
        "Seeded scaffold files already exist in .context/stories/ as temporary placeholders — treat them as scaffolds, not finished content.",
        "",
        "THIS IS A STRICT TWO-PHASE PROCESS. Follow the phases in order.",
        "",
        "━━ PHASE 1 — GATHER INFORMATION (ask questions, write nothing) ━━",
        `Step 1. Read .context/stories/intake-brief.md now.${intakeFiles.length > 0 ? ` Intake files listed there: ${intakeFiles.join(", ")}` : ""}`,
        intakeFiles.length > 0
          ? "Step 2. Use raw .context/intake/ files only when the brief is ambiguous, incomplete, or conflicting. They are planning inputs, not permanent rules."
          : "Step 2. No intake files were provided. Start from the conversation alone.",
        "Step 3. Identify every gap you need answered to write a complete, specific plan.",
        "Step 4. Ask clarifying questions ONE AT A TIME in the chat conversation.",
        "        Wait for the user's full answer before asking the next question.",
        "        Cover all unresolved areas. Common gaps:",
        "        - Who are the users?",
        "        - What is the most important thing to get right in v1?",
        "        - What are we explicitly NOT building in v1?",
        "        - What stack or existing codebase are we working with?",
        "RULE: Do NOT write or edit any files — not intake-brief.md, not plan.md, not story files — until Phase 2.",
        "RULE: Do NOT put questions or open issues inside checklist items in story files.",
        "Step 5. Once all questions are answered, tell the user: 'I have everything I need — writing the plan and stories now.'",
        "        Then move immediately to Phase 2.",
        "",
        "━━ PHASE 2 — WRITE FILES (after ALL questions answered) ━━",
        `Step 6. Update .context/stories/intake-brief.md to reflect the final distilled answers. Brief so far: ${planningBrief}`,
        "Step 7. Rewrite .context/stories/plan.md completely — replace all placeholder text with real content.",
        `Step 8. Rewrite the seeded story files completely: ${storyFiles.join(", ") || "existing story files"}.`,
        "        Create additional story-NNN.md files ONLY if the seeded three are genuinely insufficient.",
        "Step 9. Every story must use the exact template: Status, Created, Last accessed, Completed, Goal, Verification,",
        "        Scope, Out of scope, Dependencies, Checklist, Issues, Completion Summary.",
        "        Checklist items must be concrete implementation tasks — not questions, not open issues.",
        `Step 10. Number any new stories from ${nextStoryNumber(cwd)}.`,
        "Step 11. Each story must be completable in one focused session with one clear, observable verification step.",
        "Step 12. Present the final story list to the user and ask if anything needs adjusting.",
        "",
        planExists ? "NOTE: Plan already exists — this is a replan. Update affected sections and stories. Append to the replanning log. Do not touch unaffected stories." : "",
      ].filter(Boolean).join("\n");

      await pi.sendUserMessage(instruction);
    },
  });

  // ── /remember ────────────────────────────────────────────────────────

  pi.registerCommand("remember", {
    description: "Promote a confirmed lesson into memory; if no rule is provided, draft one from the recent fix context",
    handler: async (args: string, ctx: any) => {
      const cwd = ctx.cwd;
      ensureReviewStructure(cwd);

      const rule = args.trim();
      if (!rule) {
        ctx.ui.notify("Drafting a remembered rule from the recent fix context", "info");
        await pi.sendUserMessage(buildRememberInstruction(cwd), { deliverAs: "followUp" });
        return;
      }

      const rememberLog = readIfExists(rememberedRulesPath(cwd));
      fs.writeFileSync(rememberedRulesPath(cwd), `${rememberLog.trimEnd()}\n${rememberEntry(rule)}`.trimStart());
      appendLearnedRules(cwd, [rule]);
      syncReviewSummaryAndPromoteRules(cwd);
      ctx.ui.notify(`Remembered: ${rule}`, "info");
    },
  });

  // ── /review ─────────────────────────────────────────────────────────

  pi.registerCommand("review", {
    description: "Create a detailed code review file and sync recurring findings into summary memory",
    handler: async (args: string, ctx: any) => {
      const cwd = ctx.cwd;
      ensureReviewStructure(cwd);

      const created = nowISO();
      const focus = args.trim() || `active story ${activeStoryLabelForReview(cwd)} and recent changes`;
      const reviewFileName = `review-${compactTimestamp(created)}.md`;
      const reviewFilePath = path.join(reviewsDir(cwd), reviewFileName);
      fs.writeFileSync(reviewFilePath, reviewFileTemplate(cwd, focus));

      syncReviewSummaryAndPromoteRules(cwd);
      ctx.ui.notify(`Created ${reviewFileName} in .context/reviews/`, "info");

      const instruction = [
        `Run a code review and write the findings to .context/reviews/${reviewFileName}.`,
        "",
        "Requirements:",
        "1. Focus on bugs, regressions, missing tests, scope drift, and workflow violations.",
        "2. Keep findings primary. If there are no findings, replace the placeholder finding with a short 'No findings' note.",
        "3. For every finding, fill in Severity, Category, Summary, Evidence, Recommendation, and Rule candidate.",
        "4. Use `- Rule candidate: —` when a finding should not become a reusable rule.",
        "5. Do not update .context/reviews/summary.md manually unless you need to add a short note outside the generated sync format — Vazir rebuilds it automatically.",
        `6. Review focus: ${focus}.`,
      ].join("\n");

      await pi.sendUserMessage(instruction, { deliverAs: "followUp" });
    },
  });

  pi.registerCommand("unlearn", {
    description: "Remove a promoted rule from system.md",
    handler: async (args: string, ctx: any) => {
      const cwd = ctx.cwd;
      const systemMdPath = systemPath(cwd);

      if (!fs.existsSync(systemMdPath)) {
        ctx.ui.notify("No system.md found — run /vazir-init first", "warning");
        return;
      }

      const systemMd = readIfExists(systemMdPath);
      const rules = learnedRuleLinesFromMd(systemMd);

      if (rules.length === 0) {
        ctx.ui.notify("No learned rules to remove", "info");
        return;
      }

      // Direct number argument: /unlearn 2
      let ruleIndex = -1;
      const directNum = parseInt(args.trim(), 10);

      if (!isNaN(directNum) && directNum >= 1 && directNum <= rules.length) {
        ruleIndex = directNum - 1;
      } else {
        // Show numbered list and let user pick
        const labels = rules.map((rule, i) => `${i + 1}. ${rule}`);
        const pick = await ctx.ui.select(
          "Learned rules in system.md — select one to remove:",
          [...labels, "Cancel"],
        );

        if (pick == null || pick === "Cancel") return;

        const pickIndex = labels.indexOf(pick);
        if (pickIndex < 0) return;
        ruleIndex = pickIndex;
      }

      const ruleText = rules[ruleIndex];
      const confirm = await ctx.ui.confirm(
        `Remove rule ${ruleIndex + 1}: "${ruleText}"?`,
        "This rule will no longer constrain the agent.",
      );

      if (!confirm) {
        ctx.ui.notify("Unlearn cancelled", "info");
        return;
      }

      // Remove the rule from system.md
      const bullet = `- ${ruleText}`;
      const updatedSystemMd = systemMd
        .split("\n")
        .filter(line => line.trim() !== bullet)
        .join("\n");
      fs.writeFileSync(systemMdPath, updatedSystemMd);

      // Mark in complaints-log if present
      const clPath = complaintsLogPath(cwd);
      if (fs.existsSync(clPath)) {
        const log = readIfExists(clPath);
        // Append unlearned marker
        const marker = `${nowISO()} | unlearned | "${ruleText}"\n`;
        fs.writeFileSync(clPath, log.trimEnd() + "\n" + marker);
      }

      ctx.ui.notify(`Rule removed: "${ruleText}"\nIt will no longer constrain the agent.`, "info");
    },
  });

  // ── /consolidate ─────────────────────────────────────────────────────

  pi.registerCommand("consolidate", {
    description: "Cluster complaints-log, promote threshold hits, consolidate learned rules",
    handler: async (_args: string, ctx: any) => {
      const systemMdPath = systemPath(ctx.cwd);
      if (!fs.existsSync(systemMdPath)) {
        ctx.ui.notify("No system.md found — run /vazir-init first", "warning");
        return;
      }

      const undescribed = undescribedIndexFiles(ctx.cwd);
      const malformed = malformedStoryFiles(ctx.cwd);
      const complaints = readIfExists(complaintsLogPath(ctx.cwd))
        .split("\n")
        .filter(line => line.trim() && !line.startsWith("#"))
        .length;

      const preview = [
        `Complaints entries: ${complaints}`,
        `Undescribed index entries: ${undescribed.length}`,
        `Malformed story files: ${malformed.length}`,
        "Local learned-rule dedupe applied after confirmation only",
      ].join("\n");

      ctx.ui.notify(preview, "info");
      const apply = await ctx.ui.select("Apply these consolidation changes?", ["Apply", "Discard"]);
      if (apply !== "Apply") {
        ctx.ui.notify("Consolidation discarded", "info");
        return;
      }

      applyLocalRuleDedupe(ctx.cwd);
      await pi.sendUserMessage(buildConsolidationInstruction(ctx.cwd), { deliverAs: "followUp" });
      ctx.ui.notify("Consolidation handed to the current Pi model", "info");
    },
  });
}
