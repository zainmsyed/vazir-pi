# Vazir Product Plan

**Status:** Draft — living planning document
**Last updated:** 2026-08-27

## Product direction

Vazir will become its own product and user-facing application, built on top of the Pi agent engine. Pi remains the underlying runtime for models, authentication, tools, sessions, and agent execution; Vazir owns onboarding, workflows, diagnostics, branding, and distribution.

## Decisions made

- Build a reliable `vazir` CLI wrapper before building a desktop GUI.
- Keep Pi as the agent/runtime foundation rather than reimplementing the agent loop.
- The CLI should explicitly load and verify Vazir extensions, not rely only on package discovery.
- The CLI must provide full parity with everything the current Vazir extensions can do; there are no intentionally excluded commands, workflows, lifecycle behaviors, persistence paths, VCS flows, checkpoint operations, reviews, or UI/status behaviors.
- Preserve all core Vazir extension security protections exactly: project trust, protected VCS metadata, explicit destructive-action approval, no silent `sudo`, no automatic commits/pushes/resets/deletes, and secret-safe diagnostics.
- Preserve every current command, including the internal `/vazir-live-reload-apply` command; command removal or production filtering is not part of the CLI plan.
- Before public binary distribution, perform a license audit for Pi, Node, and all packaging/runtime components; preserve required notices and publish third-party acknowledgements.
- Vazir follows semantic versioning, pins one tested Pi version per release, preserves `.context/` compatibility across minor/patch releases, and performs explicit backed-up reversible migrations when structure changes.
- `.context/settings/project.json` is the source of truth for the portable `.context` schema version, stored as `context_schema_version`.
- Unsupported Vazir/Pi/`.context/` combinations must produce clear diagnostics instead of partially loading.
- Telemetry is strictly opt-in and disabled by default; Vazir must not transmit project contents, prompts, credentials, `.context/` data, or secrets.
- `vazir support-bundle` must be a minimal, local-only diagnostic output with no identifying information and no automatic upload; it should include only the smallest set of component versions and sanitized error codes needed for support.
- Standalone user-facing binaries bundle the tested Node runtime and do not require users to install Node or npm.
- The optional npm/developer installation must check Node.js and npm before installing anything.
- Required Node.js version for npm/developer installs: **22.19 or newer**.
- If Node is missing or too old for an npm/developer install, stop the installation, print copy/paste platform-appropriate commands, and tell the user to rerun the installer.
- Do not silently install Node, run `sudo`, or continue with a partial installation.
- `vazir doctor` should diagnose Node, Pi/runtime, extension loading, authentication, PATH, project trust, and VCS availability.
- First-run onboarding should run the doctor checks, explain findings, ask before initializing `.context/` or VCS metadata, and use lightweight polished Vazir presentation without delaying core functionality.
- Pi should be pinned and tested per Vazir release rather than updated blindly at runtime.
- Pi updates should flow through a tested stable channel with rollback support; a preview channel can be added later if demand justifies it.
- The primary user-facing CLI should be distributed as a standalone binary with the tested Node runtime bundled and hidden from the user.
- Standalone binaries install per-user under `~/.local/bin` by default; installation must add that directory to the user’s shell `PATH` idempotently with consent and verify `command -v vazir` afterward, without requiring `sudo`.
- An npm package may remain available as a developer/contributor install path, but it is not the primary onboarding path.
- Stable Vazir binaries, SHA-256 checksums, cryptographic signatures, and release notes should be distributed through GitHub Releases initially.
- The updater must verify both checksums and signatures before installing an artifact.
- Vazir should reuse Pi’s existing credentials, settings, model configuration, sessions, and runtime behavior wherever possible rather than creating parallel systems.
- The CLI should integrate with Pi directly through its TypeScript SDK and `InteractiveMode`, rather than primarily launching Pi through RPC.
- Vazir must preserve Pi’s full compatible CLI command and option surface, including model/provider selection, session continuation/resume, named sessions, print mode, and other existing flags.
- Vazir-specific persistent project state remains in `.context/`; only genuinely product-specific global state should be added if required.
- Uninstall must preserve repository `.context/` by default because portability of the project brain is a core Vazir goal.
- Uninstall may remove the Vazir binary and its cached runtime/package data, but must preserve Pi credentials, settings, sessions, and models unless explicitly requested otherwise.
- Existing Pi/Vazir installations must be detected and migrated non-destructively: reuse existing credentials, settings, models, sessions, and `.context/` without replacing old executables or deleting prior state automatically.
- Preserve the existing Pi package ecosystem so users can continue using compatible third-party extensions, skills, prompts, and themes alongside Vazir.
- Load core Vazir resources independently from third-party packages; report incompatible package failures without silently disabling, removing, or modifying those packages.
- A desktop GUI is deferred; the current product scope is the full-featured CLI/runtime only.
- Herdr is optional and developer-only; it is not bundled in the default production Vazir installation. The core Vazir skill remains bundled.
- Decisions about native GUI panels versus existing Pi/Vazir commands are deferred until the CLI is complete.
- The first standalone binary targets macOS and Linux.
- Required release targets are macOS Apple Silicon (`arm64`) and Linux x64 (`x86_64`).
- Investigate Node Single Executable Applications (SEA) first for standalone packaging; keep a bundled Node runtime plus application directory as the compatibility fallback. Packaging must remain replaceable behind the runtime adapter.
- Preserve `/vazir-live-reload-apply` in all modes; provide explicit `--dev` mode for loading editable extension sources and live reload, while production binaries explain that source reloading requires development mode.
- macOS Intel (`x86_64`) is a best-effort target if the packaging tool and Pi dependencies support it.
- Windows support for the initial release is through WSL2; native Windows packaging is deferred.

## Current proposed phases

### Phase 1 — CLI/runtime spike

- Create the `vazir` executable.
- Start Pi through its SDK or a controlled runtime entrypoint while preserving Pi’s full compatible CLI behavior.
- Load Vazir extensions explicitly.
- Support `--dev` loading from editable Vazir sources for live reload.
- Verify command registration and footer support.
- Report extension-load errors clearly.
- Include a polished but terminal-safe onboarding presentation: branded header, step indicators, pass/warn/fail states, and copy/paste remediation commands.

### Phase 2 — Reliable CLI

- Add `vazir doctor`, `vazir version`, `vazir init`, and `vazir update`.
- Own dependency checks and runtime discovery.
- Preserve `.context/` as the project brain.
- Carry every existing Vazir extension command and workflow into the product without feature exclusions.
- Preserve and test compatibility with the existing Pi resource ecosystem while isolating failures from core Vazir loading.
- Keep auxiliary developer tooling such as Herdr outside the default production bundle while preserving the core Vazir functionality and security behavior.
- Acceptance command set: `/vazir-init`, `/plan`, `/story`, `/implement`, `/fix`, `/idea`, `/complete-story`, `/review`, `/remember`, `/memory-review`, `/unlearn`, `/consolidate`, `/design`, `/vcs-settings`, `/vcs-mirror-sync`, `/diff`, `/edits`, `/checkpoint`, `/reset`, and `/vazir-live-reload-apply`.
- Add fresh-install, upgrade, uninstall, and macOS/Linux smoke tests, including Windows WSL2 usage guidance.

### Phase 3 — Distribution

- Publish standalone macOS Apple Silicon and Linux x64 binaries as the required primary stable distribution, with Node bundled.
- Install per-user to `~/.local/bin`, provide shell startup-file guidance, and support immediate activation without requiring a system-wide install.
- Produce a macOS Intel binary when technically supported.
- Keep an npm-based CLI available as an optional developer/contributor install path.
- Pin a compatible Pi version.
- Add a stable release channel with manual updates by default.
- Include an explicit telemetry setting and make opt-in consent clear and reversible.
- Keep support diagnostics minimal, non-identifying, reviewable by the user, and offline by default.
- Distribute stable binaries and update metadata through GitHub Releases.
- Add atomic updates and rollback.
- Verify binary checksums and signatures before activation.
- Define uninstall as runtime/cache removal while preserving `.context/` and reused Pi state by default.
- Detect and preserve existing Pi/Vazir installations during first-run migration; offer cleanup only through explicit user choice.
- Defer a preview channel until user demand justifies maintaining it.
- Keep the npm-based CLI as an optional developer/contributor path requiring Node 22.19+.

### Phase 4 — Desktop GUI (deferred)

- Choose a desktop framework only after the CLI/runtime is proven.
- Build the GUI on the established Vazir runtime.
- Reuse Pi’s SDK and Vazir workflow logic instead of duplicating the agent engine.

## Decisions still needed

1. What migration locking, backup, interruption recovery, and downgrade behavior should `.context/` use?

The command parity, security, distribution, migration, privacy, compatibility, and Node-bundling decisions are settled for the current planning pass.

## Planning notes

- Work through unresolved decisions one at a time.
- Keep this file updated as decisions are confirmed.
- Do not let GUI scope delay the reliable CLI/runtime foundation.
