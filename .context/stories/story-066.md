# Story 066: Core deterministic port assignment helper

**Status:** complete  
**Type:** feature  
**Created:** 2026-08-07  
**Last accessed:** 2026-08-08  
**Completed:** 2026-08-08

---

## Goal
Implement the reusable port-assignment module in `.pi/lib/vazir-ports.ts`. For any service key (starting with `"server"`), it must deterministically bind to 127.0.0.1, persist the selected port, write a PID file, detect live duplicate instances by verifying that the recorded PID is actually holding the port, and fall back through the 3100–3199 range when the persisted port is unavailable. If no port in the range is free, it fails hard with a clear error.

## Verification
Run a targeted validation script that exercises: first-run allocation starting at 3100; subsequent-run reuse of a persisted port; dead-PID reclaim (bind retry succeeds without a user notice); live-PID duplicate instance detection returning the existing port, PID, and base URL; and range exhaustion producing a named error for the service key.

## Scope — files this story may touch
- `.pi/lib/vazir-ports.ts` — new module: bind-as-test logic, persistence, PID lifecycle, duplicate detection, range scan, error formatting
- `.pi/lib/vazir-helpers.ts` — project settings accessors if not already added by story-065
- `scripts/validate-vazir-ports.mts` — branch-level regression coverage
- `.context/stories/plan.md`
- `.context/stories/intake-brief.md`
- `.context/stories/story-066.md`

## Out of scope — do not touch
- File and environment override handling (story-067)
- Any command, UI surface, or service consumer
- Changing the default interface away from 127.0.0.1

## Dependencies
- story-065

---

## Checklist
- [x] Implement bind-as-test on 127.0.0.1 for a single candidate port
- [x] Implement first-run range scan (3100–3199) taking the first successful bind
- [x] Implement subsequent-run direct bind to the persisted port for the key
- [x] Implement dead-PID retry and live-PID duplicate-instance detection with port verification
- [x] Persist selected port to `ports` and mirror previous value to `previous_ports` only when it changes
- [x] Write `.context/.vazir-server-{key}.pid` on successful bind and leave it in place on shutdown
- [x] Add regression coverage for all branches using throwaway TCP listeners and fake PID files

---

## Issues

---

## Completion Summary

Implemented `.pi/lib/vazir-ports.ts` with loopback bind-as-test leases, deterministic 3100–3199 allocation, persisted-port reuse, dead-PID recovery, `/proc`-verified live duplicate detection, PID-file persistence, previous-port tracking, range exhaustion errors, and service-key metadata. The PID file intentionally remains after lease shutdown. Expanded `scripts/validate-vazir-ports.mts` to cover schema compatibility plus first allocation, reuse, dead-PID reclaim, reassignment, duplicate metadata, and full range exhaustion.

Verification: `node --experimental-strip-types scripts/validate-vazir-ports.mts` passes. No service consumer or override handling was added, consistent with story scope.
