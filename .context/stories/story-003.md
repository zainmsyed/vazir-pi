# Story 003: `/design` command and chrome registration

**Status:** not-started  
**Created:** 2026-05-05  
**Last accessed:** 2026-05-05  
**Completed:** —

---

## Goal
Implement the `/design` command so users can review and update design context at any time. Register `/design` in the footer chrome command help.

## Verification
Run `/design` — agent presents a readable summary of `design-system.md`, `brand.md`, and `components.md`. Run `/design switch primary colour to slate-900` — the agent updates the relevant file and confirms the change. Fill `design-system.md` with >300 tokens worth of content, run `/design` again — agent warns and proposes what to trim based on priority order.

## Scope — files this story may touch
- `.pi/extensions/vazir-context/index.ts`
- `.pi/extensions/vazir-context/helpers.ts`
- `.pi/extensions/vazir-tracker/chrome.ts`

## Out of scope — do not touch
- Design injection logic (story-002)
- Review template (story-004)
- Consolidation system (stories 005–007)

## Dependencies
- story-001

---

## Checklist
- [ ] Register `/design` command in vazir-context/index.ts with handler that reads all three design files
- [ ] Build `buildDesignSummary(cwd)` in helpers.ts that returns a concise readable summary (not raw file dump)
- [ ] Implement interactive flow: present summary → ask "What would you like to update?" → apply change to relevant file
- [ ] Support direct invocation: `/design <instruction>` skips summary and applies directly
- [ ] Implement token-count warning in helpers.ts: `warnIfDesignSystemOverCap(cwd)` uses approximate token count (word count / 0.75); if >300, warns and proposes trim based on priority order (colors protected, then typography scale, then spacing descriptions, then component conventions)
- [ ] When trimming is needed, agent proposes moving component conventions to `components.md` before trimming anything else
- [ ] Add `/design` entry to `VAZIR_COMMAND_HELP` in chrome.ts
- [ ] Verify Ctrl+? help list includes `/design`

---

## Issues

---

## Completion Summary

