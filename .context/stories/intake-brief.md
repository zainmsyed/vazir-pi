# Intake Brief

**Last updated:** 2026-09-03

## Planning brief
Promote idea 003 into a stack-neutral, user-directed E2E workspace sandbox. V1 provides a disposable application workspace for repeatable tests; it is explicitly not a security boundary for hostile code.

## Source files
- `.context/intake/prd/vazir-product-plan.md`
- `.context/intake/references/amanah-authorized-process-threat-model.md`

## Distilled product context
- Vazir remains built on Pi and owns user-facing workflows, diagnostics, persistence, and explicit extension loading.
- Core protections remain mandatory: project trust, protected VCS metadata, explicit destructive-action approval, no silent privilege escalation, and secret-safe diagnostics.
- `.context/` is the persistent project brain and must remain compatible and protected from disposable-run side effects.
- The threat model establishes that same-user subprocesses and their descendants are not isolated from host secrets or peer processes; exact argv authorization does not make arbitrary runtime behavior safe.
- Shell wrappers broaden the execution boundary and can expose environment values through argv, so configured commands must preserve structured executable and argument boundaries.

## Confirmed V1 decisions
- The primary use case is running E2E tests in a disposable copy of the project.
- V1 is stack-neutral; Playwright and visual-QA behavior are deferred.
- Invocation is explicit through `/test-sandbox`; ordinary review and story-closeout flows do not run it automatically.
- Configuration is persisted in `.context/settings/project.json` for reproducibility.
- Setup, start, readiness, and test commands are represented as structured executable-and-argument arrays, never shell command strings.
- Setup, start, and readiness may be optional; a test command is required.
- The copied workspace excludes `.context/` and protected VCS metadata, including legacy `.jj/` metadata even though JJ is no longer an active Vazir integration.
- V1 includes isolated loopback ports, bounded execution, process-tree cleanup, logs, results, and optional failure preservation.
- Sandbox output is never copied into the real workspace automatically.

## Explicitly deferred
- Host security isolation through containers, bubblewrap, VMs, separate users, syscall controls, or network controls.
- Claims that malicious or compromised test code cannot access host files, processes, environment variables, credentials, or the network.
- Playwright-specific setup, browser management, screenshot interpretation, and Visual QA agents.
- Automatic sandbox execution selected by the agent or wired into `/complete-story`, `/review`, `/implement`, or `/fix`.
- One-off arbitrary command overrides and exporting sandbox changes into the source project.

## Delivery sequence
- Story 085: normalized persisted settings and validation.
- Story 086: safe disposable workspace staging.
- Story 087: stack-neutral subprocess lifecycle, ports, logs, and cleanup.
- Story 088: explicit `/test-sandbox` command, guided setup, documentation, and integration validation.
