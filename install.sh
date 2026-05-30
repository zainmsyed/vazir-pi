#!/usr/bin/env bash
set -euo pipefail

PI_PACKAGE="@earendil-works/pi-coding-agent"
VAZIR_REPO="git:github.com/zainmsyed/vazir-pi"

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

echo "==> Installing pi-coding-agent..."
if command -v pi >/dev/null 2>&1; then
  echo "    pi is already installed"
else
  npm install -g "$PI_PACKAGE"
  if ! command -v pi >/dev/null 2>&1; then
    echo ""
    echo "WARNING: pi was installed but is not in your PATH."
    echo "         You may need to add your npm global bin directory to PATH:"
    npm bin -g 2>/dev/null || echo "         $(npm config get prefix)/bin"
    exit 1
  fi
fi

echo "==> Installing Vazir..."
pi install "$VAZIR_REPO"

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
