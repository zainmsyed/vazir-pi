# Story 079: Harden user-home paths, PATH setup, and WSL2 behavior

**Status:** complete  
**Type:** feature  
**Created:** 2026-08-31  
**Last accessed:** 2026-09-01  
**Completed:** 2026-09-01

---

## Goal
Make the installed command reliably discoverable without system-wide writes. Install the active launcher at `~/.local/bin/vazir`, detect Bash and Zsh profile behavior, ask consent before idempotently editing shell startup files, verify `command -v vazir`, and provide an immediate activation command when the current shell cannot see the change. On WSL2, install in the Linux home directory, use the Linux artifact, verify Linux PATH behavior, and warn about `/mnt/c` permission, symlink, and performance problems.

## Verification
Run isolated shell environments for Bash, Zsh, and WSL2-like detection. Confirm PATH entries are added once with consent, omitted without consent, conflicts are reported, `command -v vazir` resolves the activated launcher in a fresh shell, and WSL2 installs under the Linux home rather than `/mnt/c`.

## Scope — files this story may touch
- `install.sh` — launcher placement, shell-profile prompts, and WSL2 guidance
- `src/install/path.ts` — idempotent PATH and launcher management
- `src/install/platform.ts` — WSL2 and home-directory policy integration
- `scripts/validate-install-paths.mts` — isolated shell and WSL2 regression coverage
- `scripts/run-validations.mts` — register the validation
- `.context/stories/plan.md`
- `.context/stories/story-079.md`

## Out of scope — do not touch
- Runtime artifact assembly (story-077)
- Checksum/signature verification (story-078)
- Upgrade, rollback, and uninstall lifecycle (story-080)
- Native Windows packaging

## Dependencies
- story-076
- story-078

---

## Checklist
- [x] Install and verify the launcher under `~/.local/bin/vazir`
- [x] Detect Bash and Zsh startup files and request consent before edits
- [x] Make PATH edits idempotent and preserve unrelated profile content
- [x] Report conflicting `vazir`/`pi` executables without overwriting them
- [x] Add WSL2 detection, Linux-home placement, and `/mnt/c` warning behavior
- [x] Add isolated fresh-shell and WSL2 regression coverage
- [x] Register the validation in the aggregate runner

---

## Issues

---

## Completion Summary

Implemented per-user launcher placement and shell activation policy. `install.sh` now installs the active launcher at `~/.local/bin/vazir` (while retaining the internal release-root compatibility link), detects existing Bash/Zsh startup chains, asks for one consent decision before editing the login and interactive startup files, appends idempotent marked PATH blocks without disturbing unrelated content, and reports an immediate `export PATH=...` command when the current shell cannot see the launcher. Launcher generation is atomic and preflight checks the bin destination; setup failures before activation clean up the new release, while profile failures are reported as warnings after activation. Conflicting `vazir` executables are preserved and existing `pi` executables are only warned about.

Added `src/install/path.ts` for shell detection, startup-file planning, idempotent PATH edits, managed-launcher detection, and activation-command formatting. Extended `src/install/platform.ts` with WSL2 home policy evaluation and `/mnt` warnings. WSL2 installs reject a HOME under `/mnt` and explain permission, symlink, and performance risks while continuing to use the Linux artifact and Linux home policy. The installer includes a controlled WSL2 test seam so its Linux-home and mounted-filesystem guidance can be verified in isolation.

Added `scripts/validate-install-paths.mts` covering Bash login and interactive resolution, Zsh profile behavior and consent refusal, helper/installer startup-file parity, launcher conflicts, Pi warnings, WSL2 installer behavior, PATH idempotence, and WSL2-like platform policy. Registered it in `scripts/run-validations.mts`. Verification passed with `bash -n install.sh`, the targeted install validations, and the full `npm test` aggregate suite. Story remains in-progress for Vazir closeout.
