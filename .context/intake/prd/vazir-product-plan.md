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
- Before public binary distribution, perform a license audit for Pi, Node, and all packaging/runtime components; preserve required notices and publish third-party acknowledgements.
- The initial installer must check Node.js and npm before installing anything.
- Required Node.js version: **22.19 or newer**.
- If Node is missing or too old, stop the installation, print copy/paste platform-appropriate commands, and tell the user to rerun the installer.
- Do not silently install Node, run `sudo`, or continue with a partial installation.
- `vazir doctor` should diagnose Node, Pi/runtime, extension loading, authentication, PATH, project trust, and VCS availability.
- Pi should be pinned and tested per Vazir release rather than updated blindly at runtime.
- Pi updates should flow through a tested stable channel with rollback support; a preview channel can be added later if demand justifies it.
- The primary user-facing CLI should be distributed as a standalone binary with Node bundled or otherwise hidden from the user.
- An npm package may remain available as a developer/contributor install path, but it is not the primary onboarding path.
- Stable Vazir binaries, checksums, signatures, and release notes should be distributed through GitHub Releases initially.
- Vazir should reuse Pi’s existing credentials, settings, model configuration, sessions, and runtime behavior wherever possible rather than creating parallel systems.
- The CLI should integrate with Pi directly through its TypeScript SDK and `InteractiveMode`, rather than primarily launching Pi through RPC.
- Vazir-specific persistent project state remains in `.context/`; only genuinely product-specific global state should be added if required.
- Uninstall must preserve repository `.context/` by default because portability of the project brain is a core Vazir goal.
- Uninstall may remove the Vazir binary and its cached runtime/package data, but must preserve Pi credentials, settings, sessions, and models unless explicitly requested otherwise.
- A desktop GUI is deferred; the current product scope is the full-featured CLI/runtime only.
- Decisions about native GUI panels versus existing Pi/Vazir commands are deferred until the CLI is complete.
- The first standalone binary targets macOS and Linux.
- Windows support for the initial release is through WSL2; native Windows packaging is deferred.

## Current proposed phases

### Phase 1 — CLI/runtime spike

- Create the `vazir` executable.
- Start Pi through its SDK or a controlled runtime entrypoint.
- Load Vazir extensions explicitly.
- Verify command registration and footer support.
- Report extension-load errors clearly.

### Phase 2 — Reliable CLI

- Add `vazir doctor`, `vazir version`, `vazir init`, and `vazir update`.
- Own dependency checks and runtime discovery.
- Preserve `.context/` as the project brain.
- Carry every existing Vazir extension command and workflow into the product without feature exclusions.
- Add fresh-install, upgrade, uninstall, and macOS/Linux smoke tests, including Windows WSL2 usage guidance.

### Phase 3 — Distribution

- Publish standalone macOS and Linux binaries as the primary stable distribution.
- Keep an npm-based CLI available as an optional developer/contributor install path.
- Pin a compatible Pi version.
- Add a stable release channel with manual updates by default.
- Distribute stable binaries and update metadata through GitHub Releases.
- Add atomic updates and rollback.
- Define uninstall as runtime/cache removal while preserving `.context/` and reused Pi state by default.
- Defer a preview channel until user demand justifies maintaining it.
- Later produce native installers that bundle Node.

### Phase 4 — Desktop GUI (deferred)

- Choose a desktop framework only after the CLI/runtime is proven.
- Build the GUI on the established Vazir runtime.
- Reuse Pi’s SDK and Vazir workflow logic instead of duplicating the agent engine.

## Decisions still needed

- No product-direction decisions remain from the current planning pass. The next step is to turn the full-parity CLI requirement into an implementation backlog and acceptance checklist.

## Planning notes

- Work through unresolved decisions one at a time.
- Keep this file updated as decisions are confirmed.
- Do not let GUI scope delay the reliable CLI/runtime foundation.
