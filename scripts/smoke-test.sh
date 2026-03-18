#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
TMP_DIR=$(mktemp -d)

cd "$ROOT_DIR"

cleanup() {
  if [ -f "$TMP_DIR/active-plan.md" ]; then
    mkdir -p .context/memory
    cp "$TMP_DIR/active-plan.md" .context/memory/active-plan.md
  else
    rm -f .context/memory/active-plan.md
  fi

  rm -rf .context/sandbox
  if [ -d "$TMP_DIR/sandbox" ]; then
    mkdir -p .context
    cp -R "$TMP_DIR/sandbox" .context/sandbox
  fi

  rm -rf "$TMP_DIR"
}

trap cleanup EXIT

if [ -f .context/memory/active-plan.md ]; then
  mkdir -p "$TMP_DIR"
  cp .context/memory/active-plan.md "$TMP_DIR/active-plan.md"
fi

if [ -d .context/sandbox ]; then
  cp -R .context/sandbox "$TMP_DIR/sandbox"
fi

if ! command -v pi >/dev/null 2>&1; then
  echo "pi is not installed or not on PATH" >&2
  exit 1
fi

echo "[1/3] Typechecking Vazir extensions"
npm run typecheck >/dev/null

echo "[2/6] Running diff helper tests"
npm test >/dev/null

echo "[3/6] Running pi /vazir-init smoke test"
pi -p --no-session "/vazir-init" >/dev/null 2>&1

echo "[4/6] Verifying generated contract files"
for path in \
  AGENTS.md \
  .context/memory/context-map.md \
  .context/memory/system.md \
  .context/memory/index.md \
  .context/learnings/code-review.md \
  .context/settings/project.json
do
  if [ ! -e "$path" ]; then
    echo "Missing required file: $path" >&2
    exit 1
  fi
done

echo "[5/6] Verifying pending-plan approval handoff"
cat > .context/memory/active-plan.md <<'EOF'
<!-- VAZIR_PLAN
{
  "task": "Smoke test plan",
  "status": "pending",
  "currentStep": 0,
  "createdAt": "2026-03-18T00:00:00.000Z",
  "updatedAt": "2026-03-18T00:00:00.000Z",
  "steps": [
    {
      "title": "Edit README",
      "files": ["README.md"],
      "status": "pending"
    }
  ]
}
-->

# Active Plan

task: Smoke test plan
status: pending
current_step: 1

1. [ ] Edit README
   files: README.md
   status: pending
EOF

APPROVE_OUTPUT=$(pi -p --no-session "/approve" 2>/dev/null || true)
printf '%s' "$APPROVE_OUTPUT" | grep 'Plan approved. Execute step 1' >/dev/null
grep '"status": "active"' .context/memory/active-plan.md >/dev/null
grep 'status: in-progress' .context/memory/active-plan.md >/dev/null

echo "[6/6] Verifying sandbox review commands"
mkdir -p .context/sandbox
printf '%s\n' '# Vazir POC for pi' '' 'Smoke review line' > .context/sandbox/README.md

DELTA_OUTPUT=$(pi -p --no-session "/delta" 2>/dev/null || true)
printf '%s' "$DELTA_OUTPUT" | grep 'Sandbox delta:' >/dev/null
printf '%s' "$DELTA_OUTPUT" | grep 'README.md' >/dev/null

DIFF_OUTPUT=$(pi -p --no-session "/diff" 2>/dev/null || true)
printf '%s' "$DIFF_OUTPUT" | grep '^--- README.md' >/dev/null
printf '%s' "$DIFF_OUTPUT" | grep '^+++ .context/sandbox/README.md' >/dev/null

REVIEW_OUTPUT=$(pi -p --no-session "/review README.md" 2>/dev/null || true)
printf '%s' "$REVIEW_OUTPUT" | grep '^--- README.md' >/dev/null
printf '%s' "$REVIEW_OUTPUT" | grep '^+++ .context/sandbox/README.md' >/dev/null

echo "Smoke test passed."