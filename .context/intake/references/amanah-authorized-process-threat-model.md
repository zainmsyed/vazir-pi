# Amanah Authorized-Process Threat Model and White-Hat Baseline

**Date:** 2026-08-11  
**Source project:** `/home/zain/Documents/coding/amanah-vault`  
**Purpose:** Security input for Amanah MCP, approval, and hardening stories

## Executive summary

Amanah successfully protects secret values in its encrypted vault, audit records, policy output, and normal CLI output. Exact allow/deny/ask policy checks prevented unauthorized child spawning in disposable-vault tests.

The tests also confirmed an important boundary: once Amanah injects a secret into an authorized process, that process and its descendants must be treated as trusted credential holders. On the tested Linux host, another process running as the same user could read the live child's environment through `/proc/<pid>/environ`. A shell wrapper could also expand an environment secret into a descendant process's argv, where same-user process inspection may reveal it.

These are not MCP protocol leaks, but they materially affect MCP and approval design. An authorized or prompt-injected agent can exfiltrate every secret available to its process tree. Policy approval must therefore authorize an exact credential-bearing execution request—not merely a friendly description or presumed intent.

## Test setup

- Separate Herdr tab: `Amanah white-hat`
- Disposable Amanah homes under `/tmp`
- Dummy credentials only; no production or real API key used
- Exact policy rules over argv, normalized tags, and canonical cwd
- Non-interactive stdin for fail-closed `ask` verification
- Temporary vault and work directories removed after each run

## Baseline policy test results

Eleven checks passed:

1. Exact allow injected a dummy secret into the intended child environment.
2. Exact deny prevented child spawn and filesystem side effects.
3. Unmatched `ask` failed closed in a non-interactive session.
4. Adding a requested tag did not broaden a policy match.
5. Adding an argv element did not broaden a policy match.
6. A different canonical cwd did not match.
7. A symlink cwd resolved to the canonical policy directory.
8. Concurrent policy writers preserved both complete rules.
9. The dummy secret was absent from captured stdout, stderr, and audit JSONL.
10. The dummy secret was absent from a plaintext scan of encrypted vault bytes.
11. Vault and audit permissions remained mode `600`.

## Authorized-process exposure results

| Test | Result | Interpretation |
|---|---|---|
| Descendant environment inheritance | Observed | Children and descendants are inside the credential trust boundary. |
| Same-UID read of `/proc/<pid>/environ` | Exposed on tested host | A peer process under the same user may steal a live injected secret. |
| Shell expansion into descendant argv | Exposed | `sh -c` and similar wrappers can turn an environment-only secret into process arguments. |
| Environment after child exit | Removed | The tested process environment disappeared with process termination. |
| Modified shell command after exact approval | Rejected | Exact argv policy prevented approval reuse for a changed command. |
| Amanah output/audit/vault scan | No plaintext leak | Amanah-owned surfaces retained their metadata-only/encrypted guarantees. |

## Prompt-injection implications

Prompt injection becomes actionable when an LLM client can request MCP execution. If a request is approved and raw credentials are injected, a compromised model-driven process can intentionally read and transmit them. Exact policy matching limits which process starts, but does not prove that the process's runtime behavior or natural-language intent is safe.

Treat these fields as the authorization identity:

- Structured argv, preserving every argument boundary
- Normalized requested tag set
- Canonical cwd
- Client/request identity
- Names of secrets selected for injection (never values)

Any change must create a new request and invalidate prior one-time approval. Client descriptions, model explanations, command summaries, and displayed rationale are untrusted context and must not determine the authorization decision.

## Requirements for MCP implementation

1. Expose structured argv only; never construct shell strings.
2. Enforce encrypted policy immediately before spawn.
3. Inject only the minimum secrets selected by the exact request.
4. Never interpolate secret values into argv, logs, protocol messages, or errors.
5. Treat the complete child process tree as credential-bearing.
6. On cancellation or disconnect, terminate and reap credential-bearing descendants.
7. Test malicious descendants, argv inspection, `/proc` visibility, signals, cancellation, and post-exit cleanup with dummy values.
8. Avoid broad policies for interpreters such as `sh -c`; consider warnings or restrictions because a shell is a flexible execution boundary even when its initial argv is exact.
9. Document residual same-UID inspection risk if process isolation is not implemented.

## Requirements for approval UI

1. Default unmatched requests to `ask`; all missing/timeout/disconnect paths deny.
2. Display canonical argv, tags, cwd, client identity, and secret names without values.
3. Bind approval to the exact canonical request object.
4. Never reuse approval after argv, tags, cwd, client identity, or selected secret names change.
5. Distinguish trusted canonical fields from untrusted model/client descriptions.
6. Test prompt injection, spoofed identity, approval replay, request replacement races, timeout races, and multiple concurrent clients.
7. Explain that approval grants the process tree access to the listed credentials.

## Hardening decisions to evaluate

- Run credential-bearing children under a separate OS identity or stronger sandbox.
- Restrict process inspection with platform controls where practical.
- Prefer brokered operations in which Amanah performs an API action without releasing the raw credential to a general-purpose agent.
- Warn on or restrict shell/interpreter policies.
- Add short credential lifetimes and straightforward rotation guidance.
- Record secret names and authorization metadata only; never record values.

## Acceptance baseline for release

Before release, repeat the disposable-value matrix across CLI, MCP, and approval surfaces. Expected residual exposure must be explicitly documented; accidental exposure in protocol traffic, UI frames, audit, logs, errors, snapshots, or unintended argv is a release blocker.
