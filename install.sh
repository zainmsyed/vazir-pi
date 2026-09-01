#!/usr/bin/env bash
set -euo pipefail

PI_PACKAGE="@earendil-works/pi-coding-agent"
VAZIR_REPO="git:github.com/zainmsyed/vazir-pi"
MIN_NODE_MAJOR=22
MIN_NODE_MINOR=19

echo "==> Checking for Node.js and npm..."
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is not installed. Please install Node.js LTS first:"
  echo "       https://nodejs.org/"
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm is not installed. Please install Node.js LTS first."
  exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//')
echo "    Found Node.js $NODE_VERSION"
if ! node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > $MIN_NODE_MAJOR || (major === $MIN_NODE_MAJOR && minor >= $MIN_NODE_MINOR) ? 0 : 1)"; then
  echo "ERROR: Vazir requires Node.js ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR} or newer."
  echo "       Install a current Node.js LTS release from https://nodejs.org/"
  exit 1
fi

echo "==> Installing the supported pi-coding-agent..."
# Always reconcile pi. Reusing an unrelated or older `pi` executable can load
# Vazir skills while failing to load the extensions that register its commands.
npm install -g --ignore-scripts "$PI_PACKAGE@latest"

NPM_PREFIX=$(npm prefix -g)
PI_BIN="$NPM_PREFIX/bin/pi"
if [[ ! -x "$PI_BIN" ]]; then
  PI_BIN=$(command -v pi || true)
fi
if [[ -z "$PI_BIN" || ! -x "$PI_BIN" ]]; then
  echo ""
  echo "ERROR: pi was installed but its executable could not be found."
  echo "       Add the npm global bin directory to PATH: $NPM_PREFIX/bin"
  exit 1
fi

echo "    Using $PI_BIN ($("$PI_BIN" --version))"
echo "==> Installing Vazir..."
"$PI_BIN" install "$VAZIR_REPO"

if ! "$PI_BIN" list | grep -Fq "$VAZIR_REPO"; then
  echo "ERROR: pi did not report Vazir as an installed package."
  echo "       Run: $PI_BIN list"
  exit 1
fi

PATH_PI=$(command -v pi || true)
if [[ -n "$PATH_PI" && "$PATH_PI" != "$PI_BIN" ]]; then
  echo ""
  echo "WARNING: your shell currently resolves 'pi' to $PATH_PI"
  echo "         but Vazir was installed with $PI_BIN"
  echo "         Put $NPM_PREFIX/bin before the other pi executable in PATH."
fi

echo ""
echo "✅ Vazir is installed and ready!"
echo ""
echo "Next steps:"
echo "  1. cd into your project directory"
echo "  2. Run: pi"
echo "  3. Inside pi, run: /vazir-init"
echo ""
echo "Then start working: /plan → /implement → /complete-story"
echo ""
