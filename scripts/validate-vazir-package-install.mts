import childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { assert, repoRoot } from "./lib/validation-harness.mts";

const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
// Explicit entrypoint discovery (see "Fix Vazir extension discovery for hidden .pi paths"):
// every real extension module under .pi/extensions must be listed in the manifest.
const extensionsRoot = path.join(repoRoot, ".pi", "extensions");
const expectedExtensions = fs
  .readdirSync(extensionsRoot, { withFileTypes: true })
  .flatMap(entry => {
    if (entry.isDirectory()) return [`.pi/extensions/${entry.name}/index.ts`];
    if (entry.isFile() && entry.name.endsWith(".ts")) return [`.pi/extensions/${entry.name}`];
    return [];
  });
const extensionEntries: string[] = manifest.pi?.extensions ?? [];
assert(expectedExtensions.length > 0, "no extension entrypoints found under .pi/extensions");
for (const entry of expectedExtensions) {
  assert(extensionEntries.includes(entry), `package manifest does not expose extension entrypoint ${entry}`);
}
assert((manifest.pi?.skills ?? []).includes(".pi/skills"), "package manifest does not expose Vazir skills");
assert(manifest.peerDependencies?.["@earendil-works/pi-coding-agent"] === "*", "supported pi runtime is missing from peerDependencies");
assert(manifest.peerDependencies?.["@earendil-works/pi-tui"] === "*", "supported pi TUI runtime is missing from peerDependencies");

const requiredResources = [
  ".pi/extensions/vazir-context/index.ts",
  ".pi/extensions/vazir-tracker/index.ts",
  ".pi/extensions/vazir-live-reload.ts",
  ".pi/skills/vazir-base/SKILL.md",
];
for (const resource of requiredResources) {
  assert(fs.existsSync(path.join(repoRoot, resource)), `package resource is missing: ${resource}`);
}

for (const relativePath of [".pi/extensions", ".pi/lib", "types"]) {
  const root = path.join(repoRoot, relativePath);
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (/\.(?:ts|d\.ts)$/.test(entry.name)) {
        const source = fs.readFileSync(entryPath, "utf8");
        assert(!source.includes("@mariozechner/pi-"), `legacy pi runtime import remains in ${path.relative(repoRoot, entryPath)}`);
      }
    }
  }
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vazir-install-smoke-"));
const fakeBin = path.join(tempRoot, "bin");
const npmPrefix = path.join(tempRoot, "npm-prefix");
const invocationLog = path.join(tempRoot, "pi-invocations.log");
fs.mkdirSync(fakeBin, { recursive: true });

fs.writeFileSync(path.join(fakeBin, "node"), `#!/usr/bin/env bash
if [[ "$1" == "--version" ]]; then echo v22.19.0; exit 0; fi
if [[ "$1" == "-e" ]]; then exit 0; fi
exit 1
`, { mode: 0o755 });

fs.writeFileSync(path.join(fakeBin, "npm"), `#!/usr/bin/env bash
set -e
if [[ "$1" == "prefix" && "$2" == "-g" ]]; then printf '%s\\n' "$FAKE_NPM_PREFIX"; exit 0; fi
if [[ "$1" == "install" && "$2" == "-g" ]]; then
  mkdir -p "$FAKE_NPM_PREFIX/bin"
  cat > "$FAKE_NPM_PREFIX/bin/pi" <<'PI'
#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_PI_LOG"
if [[ "$1" == "--version" ]]; then echo 0.84.1; exit 0; fi
if [[ "$1" == "install" ]]; then exit 0; fi
if [[ "$1" == "list" ]]; then echo 'git:github.com/zainmsyed/vazir-pi'; exit 0; fi
exit 1
PI
  chmod +x "$FAKE_NPM_PREFIX/bin/pi"
  exit 0
fi
exit 1
`, { mode: 0o755 });

// Simulate an unrelated pre-existing pi executable earlier in PATH.
fs.writeFileSync(path.join(fakeBin, "pi"), `#!/usr/bin/env bash
echo old-pi-must-not-run >> "$FAKE_PI_LOG"
exit 1
`, { mode: 0o755 });

const result = childProcess.spawnSync("bash", [path.join(repoRoot, "install.sh")], {
  cwd: repoRoot,
  encoding: "utf8",
  env: {
    ...process.env,
    PATH: `${fakeBin}:/usr/bin:/bin`,
    FAKE_NPM_PREFIX: npmPrefix,
    FAKE_PI_LOG: invocationLog,
  },
});
assert(result.status === 0, `installer smoke test failed:\n${result.stdout}\n${result.stderr}`);
const invocations = fs.readFileSync(invocationLog, "utf8");
assert(invocations.includes("install git:github.com/zainmsyed/vazir-pi"), "installer did not install Vazir with the reconciled pi executable");
assert(invocations.includes("list"), "installer did not verify the installed package");
assert(!invocations.includes("old-pi-must-not-run"), "installer reused an unrelated pi executable");
assert(result.stdout.includes("WARNING: your shell currently resolves 'pi'"), "installer did not warn about the conflicting PATH executable");

console.log("Vazir package/install validation passed");
