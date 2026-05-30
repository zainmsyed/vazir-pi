import {
  assert,
  cleanupStubModules,
  installCommonPiStubs,
} from "./lib/validation-harness.mts";

const stubModuleDirs = installCommonPiStubs();

const chromeModule = await import(
  new URL(`../.pi/extensions/vazir-tracker/chrome.ts?cache=${Date.now()}`, import.meta.url).href
);

const { registerCommandHelpShortcut } = chromeModule as Record<string, any>;

// --- Scenarios ---

function scenarioRegistersInputHandler() {
  let registered = false;
  const mockCtx = {
    ui: {
      onTerminalInput() {
        registered = true;
        return () => { registered = false; };
      },
    },
  };

  registerCommandHelpShortcut(mockCtx);
  assert(registered, "should register an input handler when onTerminalInput is available");
  console.log("  registers input handler: ok");
}

function scenarioIgnoresMissingOnTerminalInput() {
  const mockCtx = {
    ui: {},
  };

  // Should not throw
  registerCommandHelpShortcut(mockCtx);
  console.log("  ignores missing onTerminalInput: ok");
}

function scenarioConsumesHelpShortcut() {
  let capturedHandler: Function | null = null;
  const mockCtx = {
    ui: {
      onTerminalInput(handler: Function) {
        capturedHandler = handler;
        return () => { capturedHandler = null; };
      },
      custom() {
        // Resolve immediately (simulate esc-to-close) so commandHelpOpen resets
        return Promise.resolve(null);
      },
    },
    hasUI: true,
  };

  registerCommandHelpShortcut(mockCtx);
  assert(capturedHandler !== null, "handler should be registered");

  const result = capturedHandler!("?");
  assert(result && result.consume === true, "should consume the help shortcut (Ctrl+?)");
  console.log("  consumes help shortcut: ok");
}

async function waitForMicrotasks() {
  await new Promise(resolve => setTimeout(resolve, 10));
}

function scenarioGuardsAgainstDuplicateOpens() {
  let capturedHandler: Function | null = null;
  const mockCtx = {
    ui: {
      onTerminalInput(handler: Function) {
        capturedHandler = handler;
        return () => { capturedHandler = null; };
      },
      custom() {
        return new Promise(() => {});
      },
    },
    hasUI: true,
  };

  registerCommandHelpShortcut(mockCtx);
  assert(capturedHandler !== null, "handler should be registered");

  // First shortcut opens help (never resolves, so commandHelpOpen stays true)
  const first = capturedHandler!("?");
  assert(first && first.consume === true, "first shortcut should be consumed");

  // Second shortcut while help is still open should be ignored
  const second = capturedHandler!("?");
  assert(second === undefined, "second shortcut should not be consumed while overlay is open");
  console.log("  guards against duplicate opens: ok");
}

function scenarioIgnoresNonShortcutKeys() {
  let capturedHandler: Function | null = null;
  const mockCtx = {
    ui: {
      onTerminalInput(handler: Function) {
        capturedHandler = handler;
        return () => { capturedHandler = null; };
      },
    },
  };

  registerCommandHelpShortcut(mockCtx);
  assert(capturedHandler !== null, "handler should be registered");

  const result = capturedHandler!("x");
  assert(result === undefined, "should ignore non-shortcut keys");
  console.log("  ignores non-shortcut keys: ok");
}

// --- Run ---

try {
  console.log("validate-vazir-help-shortcut:");
  scenarioRegistersInputHandler();
  scenarioIgnoresMissingOnTerminalInput();
  scenarioConsumesHelpShortcut();
  await waitForMicrotasks();
  scenarioGuardsAgainstDuplicateOpens();
  scenarioIgnoresNonShortcutKeys();
  console.log("validate-vazir-help-shortcut: ok");
} finally {
  cleanupStubModules(stubModuleDirs);
}
