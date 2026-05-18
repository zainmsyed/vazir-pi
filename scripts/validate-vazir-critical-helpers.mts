import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  assert,
  cleanupStubModules,
  installCommonPiStubs,
  loadExtensionModule,
  makePi,
} from "./lib/validation-harness.mts";

const stubModuleDirs = installCommonPiStubs();

// Load the tracker extension to wire its event handlers
const trackerModule = await loadExtensionModule<{ default: (pi: any) => void }>(
  "vazir-tracker",
  String(Date.now()),
);

const chromeModule = await import(
  new URL(`../.pi/extensions/vazir-tracker/chrome.ts?cache=${Date.now()}`, import.meta.url).href
);

const helpersModule = await import(
  new URL(`../.pi/lib/vazir-helpers.ts?cache=${Date.now()}`, import.meta.url).href
);

const contextHelpersModule = await import(
  new URL(`../.pi/extensions/vazir-context/helpers.ts?cache=${Date.now()}`, import.meta.url).href
);

const {
  isProtectedVcsTarget,
  readIfExists,
  normalizeCommandFingerprint,
  approvalTokenForFingerprint,
  vcsApprovalPhrase,
} = helpersModule as Record<string, any>;

const { userExplicitlyApprovedStatusChange } = contextHelpersModule as Record<string, any>;

// --- Scenarios ---

function scenarioToolPathFromInput() {
  const { toolPathFromInput } = chromeModule;

  assert(
    toolPathFromInput({ path: "/foo/bar.ts" }) === "/foo/bar.ts",
    "toolPathFromInput should use path when present",
  );
  assert(
    toolPathFromInput({ filePath: "/foo/bar.ts" }) === "/foo/bar.ts",
    "toolPathFromInput should fall back to filePath",
  );
  assert(
    toolPathFromInput({ path: "/a.ts", filePath: "/b.ts" }) === "/a.ts",
    "toolPathFromInput should prefer path over filePath",
  );
  assert(
    toolPathFromInput({}) === "(unknown file)",
    "toolPathFromInput should return (unknown file) when neither is present",
  );
  console.log("  toolPathFromInput: ok");
}

async function scenarioVcsToolGuardFilePathFallback() {
  const harness = makePi([trackerModule.default]);

  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "vazir-guard-fp-"));
  fs.mkdirSync(path.join(cwd, ".context", "stories"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "settings"), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, ".context", "memory", "system.md"),
    "# System\n",
  );
  fs.writeFileSync(
    path.join(cwd, ".context", "settings", "project.json"),
    JSON.stringify({ active_vcs_mode: "git" }, null, 2),
  );
  fs.mkdirSync(path.join(cwd, ".git"), { recursive: true });

  const notifications: Array<{ message: string; level: string }> = [];
  const ctx = {
    cwd,
    hasUI: false,
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
      setWidget() {},
      setFooter() {},
      setFooterFactory() {},
      onTerminalInput() {
        return () => {};
      },
    },
  };

  // Initialize the extension
  harness.emit("session_start", {}, ctx);

  // Blocked: write with filePath targeting .git
  const blockedWriteFp = await harness.emitResults("tool_call", {
    toolName: "write",
    input: { filePath: ".git/config" },
  }, ctx);

  assert(
    blockedWriteFp.some(
      (r: any) =>
        r &&
        typeof r === "object" &&
        "block" in r &&
        (r as { block: boolean }).block === true,
    ),
    "expected write with filePath targeting .git to be blocked",
  );

  // Blocked: edit with filePath targeting .jj
  const blockedEditFp = await harness.emitResults("tool_call", {
    toolName: "edit",
    input: { filePath: ".jj/store/git" },
  }, ctx);

  assert(
    blockedEditFp.some(
      (r: any) =>
        r &&
        typeof r === "object" &&
        "block" in r &&
        (r as { block: boolean }).block === true,
    ),
    "expected edit with filePath targeting .jj to be blocked",
  );

  // Allowed: write with filePath targeting normal file
  const safeWriteFp = await harness.emitResults("tool_call", {
    toolName: "write",
    input: { filePath: "src/main.ts" },
  }, ctx);

  assert(
    !safeWriteFp.some(
      (r: any) =>
        r &&
        typeof r === "object" &&
        "block" in r &&
        (r as { block: boolean }).block === true,
    ),
    "expected write with filePath to normal file to be allowed",
  );

  console.log("  vcs tool guard filePath fallback: ok");
}

function scenarioApprovalBasic() {
  const approvedComplete = userExplicitlyApprovedStatusChange(
    "mark this complete",
    "complete",
  );
  assert(approvedComplete === true, "expected 'mark this complete' to be approved");

  const closeStory = userExplicitlyApprovedStatusChange(
    "close the story",
    "complete",
  );
  assert(closeStory === true, "expected 'close the story' to be approved");

  const startStory = userExplicitlyApprovedStatusChange(
    "start this story",
    "in-progress",
  );
  assert(startStory === true, "expected 'start this story' to be approved");

  const retireStory = userExplicitlyApprovedStatusChange(
    "retire this story",
    "retired",
  );
  assert(retireStory === true, "expected 'retire this story' to be approved");

  const empty = userExplicitlyApprovedStatusChange("", "complete");
  assert(empty === false, "expected empty prompt to be rejected");

  const unknownStatus = userExplicitlyApprovedStatusChange("mark this complete", "unknown-status");
  assert(unknownStatus === false, "expected unknown status to be rejected");

  // Negation guards
  const notComplete = userExplicitlyApprovedStatusChange(
    "do not mark this complete",
    "complete",
  );
  assert(notComplete === false, "expected 'do not mark this complete' to be rejected");

  const dontClose = userExplicitlyApprovedStatusChange(
    "don't close story yet",
    "complete",
  );
  assert(dontClose === false, "expected 'don't close story yet' to be rejected");

  const neverRetire = userExplicitlyApprovedStatusChange(
    "never retire this story",
    "retired",
  );
  assert(neverRetire === false, "expected 'never retire this story' to be rejected");

  const notStart = userExplicitlyApprovedStatusChange(
    "do not start this story",
    "in-progress",
  );
  assert(notStart === false, "expected 'do not start this story' to be rejected");

  console.log("  approval basic paths: ok");
}

function scenarioIsProtectedVcsTarget() {
  assert(
    isProtectedVcsTarget(".git/config") === true,
    ".git/config should be protected",
  );
  assert(
    isProtectedVcsTarget(".jj/store/git") === true,
    ".jj/store/git should be protected",
  );
  assert(
    isProtectedVcsTarget(".fslckout") === true,
    ".fslckout should be protected",
  );
  assert(
    isProtectedVcsTarget(".fossil-settings/ignore-glob") === true,
    ".fossil-settings should be protected",
  );
  assert(
    isProtectedVcsTarget("src/main.ts") === false,
    "src/main.ts should not be protected",
  );
  assert(
    isProtectedVcsTarget("") === false,
    "empty string should not be protected",
  );

  console.log("  isProtectedVcsTarget: ok");
}

function scenarioReadIfExists() {
  const tmpFile = path.join(os.tmpdir(), `vazir-rif-${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, "hello");
  assert(readIfExists(tmpFile) === "hello", "readIfExists should return file content");
  fs.rmSync(tmpFile);
  assert(
    readIfExists("/nonexistent/path/file.txt") === "",
    "readIfExists should return empty string for missing file",
  );

  console.log("  readIfExists: ok");
}

function scenarioApprovalTokenRoundTrip() {
  const fp = normalizeCommandFingerprint("rm -rf .git");
  const token = approvalTokenForFingerprint(fp);
  const phrase = vcsApprovalPhrase(token);

  assert(
    typeof token === "string" && token.startsWith("vcs-"),
    "approvalTokenForFingerprint should produce a vcs- token",
  );
  assert(
    phrase === `VCS_APPROVE ${token}`,
    "vcsApprovalPhrase should format token correctly",
  );

  console.log("  approval token round-trip: ok");
}

// --- Run ---

try {
  console.log("validate-vazir-critical-helpers:");
  scenarioToolPathFromInput();
  await scenarioVcsToolGuardFilePathFallback();
  scenarioApprovalBasic();
  scenarioIsProtectedVcsTarget();
  scenarioReadIfExists();
  scenarioApprovalTokenRoundTrip();
  console.log("validate-vazir-critical-helpers: ok");
} finally {
  cleanupStubModules(stubModuleDirs);
}
