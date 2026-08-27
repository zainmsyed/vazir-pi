# Vazir Product Plan

**Status:** Draft — living planning document
**Last updated:** 2026-08-27

## Product direction

Vazir will become its own product and user-facing application, built on top of the Pi agent engine. Pi remains the underlying runtime for models, authentication, tools, sessions, and agent execution; Vazir owns onboarding, workflows, diagnostics, branding, and distribution.

## Decisions made

- Build a reliable `vazir` CLI wrapper before building a desktop GUI.
- Keep Pi as the agent/runtime foundation rather than reimplementing the agent loop.
- The CLI should explicitly load and verify Vazir extensions, not rely only on package discovery.
- The initial installer must check Node.js and npm before installing anything.
- Required Node.js version: **22.19 or newer**.
- If Node is missing or too old, stop the installation, print copy/paste platform-appropriate commands, and tell the user to rerun the installer.
- Do not silently install Node, run `sudo`, or continue with a partial installation.
- `vazir doctor` should diagnose Node, Pi/runtime, extension loading, authentication, PATH, project trust, and VCS availability.
- Pi should be pinned and tested per Vazir release rather than updated blindly at runtime.
- Pi updates should flow through tested stable/preview channels with rollback support.
- The primary user-facing CLI should be distributed as a standalone binary with Node bundled or otherwise hidden from the user.
- An npm package may remain available as a developer/contributor install path, but it is not the primary onboarding path.
- Vazir should reuse Pi’s existing credentials, settings, model configuration, sessions, and runtime behavior wherever possible rather than creating parallel systems.
- Vazir-specific persistent project state remains in `.context/`; only genuinely product-specific global state should be added if required.
- A desktop GUI is a later layer over the CLI/runtime foundation, not the first implementation.

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
- Add fresh-install, upgrade, uninstall, and cross-platform smoke tests.

### Phase 3 — Distribution

- Publish an npm-based CLI requiring Node 22.19+.
- Pin a compatible Pi version.
- Add stable and preview release channels.
- Add atomic updates and rollback.
- Later produce native installers that bundle Node.

### Phase 4 — Desktop GUI

- Build a desktop shell on the established Vazir runtime.
- Add project picker, chat, model login, context browser, story/plan views, VCS status, and diagnostics.
- Reuse Pi’s SDK and Vazir workflow logic instead of duplicating the agent engine.

## Decisions still needed

1. Which Pi SDK integration should the CLI use: direct `AgentSession`/`InteractiveMode`, or a controlled Pi RPC subprocess?
2. What is the minimum CLI MVP beyond launching Pi and running `/vazir-init`?
3. Which platforms are required for the first release: macOS only, macOS/Linux, or all three major desktop platforms?
4. Should the GUI use Electron, Tauri, or remain deferred until the CLI runtime is proven?
5. What update channel and release infrastructure should host pinned Pi/Vazir releases?
6. What is the complete uninstall and migration contract?
7. Which Vazir features must be native GUI panels versus existing Pi commands/overlays?
8. What licensing and third-party distribution requirements apply to Pi, Node, and the chosen desktop framework?

## Planning notes

- Work through unresolved decisions one at a time.
- Keep this file updated as decisions are confirmed.
- Do not let GUI scope delay the reliable CLI/runtime foundation.
