# Vazir — Deterministic Port Assignment
**Supplements:** v4.1  
**Status:** Final  
**Scope:** Zero-token port selection and persistence for any local service(s) Vazir manages, keyed by role — not assumed to be a single port

**Deliverable for v1:** The reusable port-assignment helper module and its regression tests. No service consumer (no `/serve` command, no session hook, no preview server) ships in v1; the role-keyed design guarantees a future service can be added by introducing a new key and PID file without reworking the contract.

---

## Problem

Whatever local server Vazir ends up running (dev server, preview server, future UI layer — implementation TBD) needs a port. Left to default behavior, most dev tooling either hardcodes a port (collides with other projects) or picks a random free one every start (URL changes every session, breaks bookmarks/muscle memory, breaks flow-state).

This is not a judgment call. It's a deterministic bind-and-retry problem. It should not involve the LLM at all — consistent with Vazir's "deterministic first" principle (see Zero-Token Automations in v4.1).

Only one such service exists today. More may exist later — a frontend dev server, a Fossil UI instance, others not yet decided — each with its own independent port, lifecycle, and PID. This PRD treats "port" as a role-keyed concern from the start, so adding a second service later is additive to the data contract, not a rework of it.

---

## Goal

Each of a project's local services binds to the same port every time it starts, unless that port is genuinely unavailable — in which case Vazir picks a new one for that service, persists it, and tells the user once, with zero LLM calls involved. This holds whether there's one service or several.

---

## Behavior Contract

### Candidate port range
Committed range: **3100–3199**. High enough to avoid common framework defaults (3000, 5173, 8000, 8080, 4321, 8787), low enough to stay memorable. Not user-configurable in v1 — the override mechanism below covers the cases where a fixed range doesn't work.

### Scope: per service key
Every rule below applies **per service** — identified by a short key such as `"server"`, `"frontend"`, or `"fossil"`. Each key has its own candidate range position, its own persisted port, its own PID file, and its own live-instance detection. Nothing here assumes there's only one service; it just doesn't presume there's more than one either, since only one exists today.

### First run (per key)
1. The first time a given service starts for a project, attempt to bind directly to the first port in the candidate range.
2. If the bind fails, try the next port in the range, and so on. **Binding is the test** — there is no separate "scan then bind" step, since a port free at scan-time can be claimed by another process before a later bind (TOCTOU race). Attempt-bind-and-hold-on-success avoids the gap entirely.
3. On successful bind, persist the port under that key in `.context/settings/project.json`'s `ports` map, and write the current process ID to a PID file named for that key: `.context/.vazir-server-{key}.pid` (e.g. `.vazir-server-frontend.pid`).

### Subsequent runs (per key)
1. Read the port for that key from `ports` in `project.json`.
2. Attempt to bind to it directly.
3. If successful — done. No scan, no log, no notice. This is the common case and should be silent.

### Port occupied on a subsequent run (per key)
1. If binding to the persisted port fails, check that key's PID file:
   - If the PID in the file is alive **and currently holding the port** (verified — not just "process exists," since PIDs can recycle over long-running systems; the check must confirm this specific PID is the one bound to this specific port), it's a live instance of that same service. See "Duplicate instance" below for the defined outcome.
   - If the PID is dead, or the file is missing/stale, the port should already be free (OS reclaims ports on process exit) — **attempt to bind to the same port again.** This retry *is* the proof the port is free, not an assumption on top of it — same "bind is the test" principle as the first-run flow, applied here to avoid a second TOCTOU gap between checking the PID and attempting the bind.
     - If that retry succeeds: the port was reclaimed as expected. Write the new PID to that key's PID file and proceed normally — no notice needed, this isn't a change from the user's perspective.
     - If that retry still fails: something else, unrelated to Vazir, now holds the port. Fall back to attempt-binding through the candidate range starting from the persisted port, update that key's entry in `ports`, and print a single-line notice to the user naming which service moved (e.g. "frontend: port 3104 was in use, switched to 3105").
2. **No process is ever killed by this feature.** Reclamation means recognizing the port is already free (via the OS), never terminating another process to free it. This replaces any heuristic "identify and kill the stale process" approach — matching by command name, cwd, or parent PID is unreliable across platforms and risks killing something unrelated (a debugger, a terminal multiplexer session, another tool). A PID file gives a positive, cheap check on Vazir's own process instead.
3. No confirmation prompt needed for a port reassignment (the "something else holds it" branch above) — this is a low-stakes, reversible, informational change, not a destructive operation (does not need Addendum A's archive/delete UX tiers).
4. Each service's port conflict, retry, and reassignment is independent — one service failing to bind and reassigning does not affect any other service's port.

### Range exhaustion
If every port in the candidate range (3100–3199) is occupied for a given key — no free port found across the whole range, whether on first run or during a reassignment scan — Vazir fails hard for that service rather than falling back to an ephemeral, unpersisted OS-assigned port. An ephemeral fallback would defeat the purpose of this feature (stable, rememberable ports) in exactly the scenario where a clear error is more useful than silent instability. The error should name the key and the range, e.g. "No free port found for 'server' in range 3100–3199." The user can resolve this via the override mechanism (a specific port outside the range) if needed.

### Duplicate instance (live PID currently holding the port)
This feature's job is detection, not decision. When a live instance of a given service is confirmed for its key, the port assignment logic returns that outcome explicitly rather than silently picking a different port or failing quietly:

- Return the service key, the occupied port number, a `live_instance: true` flag, the PID, and a usable base URL (e.g. `http://localhost:3103`) — for logging/debugging and so the caller doesn't have to reconstruct protocol/host if it decides to open a browser tab to the existing instance.
- The caller (whatever triggers that service's start — a command, a session start hook) decides what to do with that: open a browser tab to the existing instance, warn the user "frontend already running on 3103," or exit cleanly. That decision is out of scope for this PRD — it belongs to whatever start-flow calls into this module for that key.

### Bind interface
Vazir services bind to `127.0.0.1` by default, not `0.0.0.0` or an IPv6-only interface. This is what makes it safe to hand back a bare `http://localhost:{port}` URL in the duplicate-instance return contract above without checking which interface the existing instance actually bound to — a service that follows this constraint is always reachable at that URL.

### Implementation constraint
No service's implementation should enable `SO_REUSEADDR` (or platform equivalent) in a mode that permits multiple processes to bind the same port simultaneously. This feature's live-instance detection depends on a second bind attempt failing when a live instance already holds the port — if simultaneous binds are allowed, that signal disappears and duplicate instances could start silently. On Windows, the closer equivalent to enforce is `SO_EXCLUSIVEADDRUSE`, since `SO_REUSEADDR` doesn't carry the same exclusivity semantics there. Applies to every service, independently.

### PID file lifecycle (intentional, not an oversight)
Each service's PID file is written on successful bind and is **not** cleaned up on graceful shutdown. This is deliberate: leaving it in place means every normal restart exercises the "check PID → dead → retry bind" path rather than skipping it, which keeps that path continuously validated in real use instead of only in crash scenarios. A future contributor should not "fix" this by adding an `unlink`-on-exit hook — the file is meant to persist between runs. This applies independently per key.

### User override
Per key, a user can override the auto logic two ways: a matching entry in a `ports_override` object in `.context/settings/project.json`, or a `VAZIR_PORT_{KEY}` environment variable (e.g. `VAZIR_PORT_FRONTEND=3005`), uppercased. If present, Vazir attempts to bind to that port first for that key, before consulting the persisted `ports` value. This covers cases the automatic range can't — firewall rules, proxy configs, or container port mappings tied to a specific number. If both are set for the same key, **the environment variable takes precedence** over the `ports_override` entry (standard convention: env overrides config file). If the override port is unavailable, standard fallback behavior applies for that key (bind fails → notice → next free port in range).

An override value that isn't a valid, bindable port number (non-numeric, out of the 1–65535 range, or otherwise malformed) is treated the same as "unavailable" — Vazir logs a single warning naming the bad value and the key (e.g. "Invalid override port 'foo' for 'server' — falling back to auto-assignment"), then proceeds exactly as if no override had been set for that key.

### Agent involvement
- None, in the normal path. This is bootstrap logic, not agent logic.
- The agent may be asked *about* the port after the fact ("why did my port change?") — in that case it reads `project.json` and answers from the persisted value. It does not decide ports itself.

---

## Data Contract

`.context/settings/project.json` gains a `ports` map, keyed by service role, plus a matching override map:

```json
{
  "project_name": "...",
  "model_tier": "...",
  "ports": {
    "server": 3103
  },
  "previous_ports": {
    "server": 3102
  },
  "ports_override": {}
}
```

- `ports` — the last successfully bound port per service key. Auto-managed, not meant for manual editing. Starts with whatever key(s) actually exist today (just `"server"` currently) — keys are added only when a real service starts using this system, never pre-declared.
- `previous_ports` — mirrors `ports`, holding each key's value immediately before its last change, if any. Updated alongside `ports` whenever a given key's bound port actually changes — regardless of what triggered the change (automatic reassignment, a failed override falling through, range exhaustion recovery after a manual fix, etc.). One write path, one trigger condition ("the persisted port for this key differs from before"), no branching on cause. If the agent needs to explain *why* a change happened, not just that one happened, it cross-references `ports_override` at the same time: a present override that doesn't match the currently bound port implies the override failed and Vazir fell back; no override present implies a plain automatic reassignment. Still not an agent decision either way — the agent only reads these fields, never writes them.
- `ports_override` — optional user overrides, keyed the same way. Empty/absent keys mean "use the auto logic" for that service. A present key takes priority every run for that key (see User Override above).
- Not injected into the agent's context window — same treatment as `model_tier` and `project_name` today.
- Read once at each service's bootstrap; each service only reads and writes its own key.

A separate PID file per key, `.context/.vazir-server-{key}.pid`, holds the OS process ID of the currently running instance for that service. Written on successful bind, used only for that key's live-instance check. Not part of `project.json` since it's process-lifetime state, not project configuration.

Today only one key (`"server"`) is in real use. Adding a second — e.g. `"frontend"` if the PWA UI layer gets built, or `"fossil"` if Fossil UI's local port gets tracked here — is purely additive: a new key in `ports`, a new PID file, no change to existing keys or to any other part of this contract.

---

## Explicit Non-Goals

- Not a system-prompt / `system.md` concern. Port numbers are runtime state, not a behavioral rule — they don't belong in every-turn injection.
- Not an LLM decision at any point in the happy path.
- Not a candidate for the destructive-operation UX hierarchy (Addendum A) — port reassignment is low-stakes and easily reversible (just try the old port again next time).
- Does not specify runtime, framework, or server implementation — that's an implementation detail of whatever server Vazir ships, decided separately.

---

## Considered and Deferred

**Deterministic starting offset per project (path hashing).** To reduce first-run scan collisions when a user runs many Vazir projects at once, each project's starting port could be derived from a hash of its path instead of always starting at the bottom of the range. Not adopted for v1 — the plain sequential fallback (attempt-bind through the range, take the first free one) already handles this adequately, and it's a rare enough case not to justify the extra logic yet. Revisit only if scan collisions become a noticeable annoyance in real use.

**Which service keys will exist.** This PRD deliberately does not enumerate or pre-declare keys beyond `"server"`, which is the only one in real use today. Candidates that were considered but not committed to: a `"frontend"` key for a future PWA dev server, and a `"fossil"` key for `fossil ui`'s local port (Fossil is already part of the wiki system, so this is the more concrete of the two). Neither is adopted here because neither is a settled part of the architecture yet — the schema is shaped to accept them additively whenever they become real, not to predict them now.

## Open Question

Exact bind/retry implementation (socket library specifics, PID-liveness check method) depends on the runtime the server ends up on — not yet decided, out of scope for this PRD. Not blocking.

---

*Deterministic-first: one more instance of the same principle behind zero-token JJ auto-describe and index.md patching — mechanical problems get mechanical solutions, the LLM's attention is reserved for judgment calls.*
