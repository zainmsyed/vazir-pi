# Intake Brief

**Last updated:** 2026-08-07

## Planning brief
Implement the Vazir deterministic port assignment helper described in `Vazir_Port_Assignment_PRD.md`. v1 ships the reusable module and its regression tests only; no service consumer is built. The helper binds to 127.0.0.1, persists ports per service key in `.context/settings/project.json`, writes per-key PID files, handles dead/live PID detection, scans 3100–3199 on conflict, and supports file plus environment overrides. The PRD status has been promoted to Final with an explicit v1 deliverable note.

## Source files
- .context/intake/prd/Vazir_Port_Assignment_PRD.md (14669 bytes)

## Distilled notes
### .context/intake/prd/Vazir_Port_Assignment_PRD.md
- **Scope:** Zero-token port selection and persistence for local services Vazir may manage, keyed by service role (`server`, future `frontend`/`fossil`/etc.).
- **Range:** 3100–3199, not user-configurable in v1.
- **Persistence:** `ports`, `previous_ports`, and `ports_override` maps in `.context/settings/project.json`; PID files at `.context/.vazir-server-{key}.pid`.
- **Bind principle:** bind is the test; no separate scan step. Retry binds close TOCTOU gaps.
- **Subsequent-run behavior:** try persisted port; if occupied, verify PID is alive and actually holding the port. Dead PIDs → retry same port. Live PIDs → return duplicate-instance metadata. Foreign holder → scan range, update `ports`, emit single-line notice.
- **Range exhaustion:** hard error naming the key and range; no ephemeral fallback.
- **Overrides:** `ports_override` in project.json or `VAZIR_PORT_{KEY}` env var; env wins. Invalid overrides warn once and fall back to auto.
- **Agent involvement:** none in the happy path; agent only reads persisted values when asked.
- **v1 deliverable:** the helper module plus tests; no `/serve` command, session hook, or other consumer. The role-keyed design makes future consumers additive.

## Planning rules
- Treat listed source files as user-authored planning inputs unless they are explicitly marked as generated artifacts.
- Vazir-generated files in .context/stories/ are replan context, not primary intake.
- Read all text-based planning sources before asking questions.
- Ask only implementation-blocking delta questions after reviewing this brief and any raw files you actually need.
- State safe default assumptions briefly so the user can correct them.
- Surface contradictions instead of resolving them silently.
