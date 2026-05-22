import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  assert,
  cleanupStubModules,
  installCommonPiStubs,
  loadExtensionModule,
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

const { showScrollableOverlay, showScrollableText } = chromeModule as Record<string, any>;

// --- Scenarios ---

function scenarioShowScrollableOverlayIsExported() {
  assert(
    typeof showScrollableOverlay === "function",
    "showScrollableOverlay should be exported as a function",
  );
  console.log("  showScrollableOverlay exported: ok");
}

async function scenarioFallbackOnNarrowTerminal() {
  const originalColumns = process.stdout.columns;

  // Mock narrow terminal
  (process.stdout as any).columns = 60;

  let overlayCalled = false;
  const mockCtx = {
    ui: {
      custom(_factory: any, options: any) {
        if (options?.overlay === true) {
          overlayCalled = true;
        }
        return Promise.resolve();
      },
      notify() {},
    },
  };

  try {
    await showScrollableOverlay(mockCtx, "Title", "Subtitle", "Body");
    assert(
      overlayCalled === false,
      "narrow terminal should delegate to showScrollableText, not call ctx.ui.custom with overlay",
    );
  } finally {
    (process.stdout as any).columns = originalColumns;
  }

  console.log("  fallback on narrow terminal: ok");
}

async function scenarioOverlayReturnsPromise() {
  const originalColumns = process.stdout.columns;
  (process.stdout as any).columns = 120;

  let customCalled = false;
  const mockCtx = {
    ui: {
      custom(factory: any, options: any) {
        customCalled = true;
        assert(
          options?.overlay === true,
          "overlay option should be true",
        );
        assert(
          options?.overlayOptions?.anchor === "right-center",
          "overlay anchor should be right-center",
        );
        assert(
          options?.overlayOptions?.width === "50%",
          "overlay width should be 50%",
        );
        assert(
          options?.overlayOptions?.minWidth === 60,
          "overlay minWidth should be 60",
        );
        assert(
          options?.overlayOptions?.maxHeight === "80%",
          "overlay maxHeight should be 80%",
        );
        assert(
          options?.overlayOptions?.margin === 1,
          "overlay margin should be 1",
        );

        // Simulate a quick resolve to avoid hanging
        const component = factory(
          { requestRender() {} },
          {},
          {},
          () => {},
        );

        // Verify keyboard handlers exist for supported keys
        assert(
          typeof component.handleInput === "function",
          "component should have handleInput",
        );
        assert(
          typeof component.render === "function",
          "component should have render",
        );
        assert(
          typeof component.invalidate === "function",
          "component should have invalidate",
        );

        // Verify render produces framed output
        const rendered = component.render(40);
        assert(
          Array.isArray(rendered) && rendered.length > 0,
          "render should return a non-empty array of strings",
        );
        assert(
          rendered[0].includes("┌") && rendered[0].includes("┐"),
          "first line should contain top border corners",
        );
        assert(
          rendered[rendered.length - 1].includes("└") && rendered[rendered.length - 1].includes("┘"),
          "last line should contain bottom border corners",
        );

        // Verify title appears in the border
        assert(
          rendered[0].includes("Title"),
          "title should appear in the top border",
        );

        // Verify "esc close" hint appears
        assert(
          rendered[0].includes("esc close"),
          "esc close hint should appear in the top border",
        );

        return Promise.resolve();
      },
      notify() {},
    },
  };

  try {
    const result = showScrollableOverlay(mockCtx, "Title", "Subtitle", "Line 1\nLine 2\nLine 3");
    assert(
      result instanceof Promise,
      "showScrollableOverlay should return a Promise",
    );
    await result;
    assert(customCalled, "ctx.ui.custom should have been called for overlay");
  } finally {
    (process.stdout as any).columns = originalColumns;
  }

  console.log("  overlay returns promise with correct options: ok");
}

async function scenarioKeyboardHandlersWork() {
  const originalColumns = process.stdout.columns;
  (process.stdout as any).columns = 120;

  const mockCtx = {
    ui: {
      custom(factory: any, options: any) {
        const component = factory(
          { requestRender() {} },
          {},
          {},
          () => {},
        );

        // Test that handleInput accepts keyboard data without throwing
        // We can't fully test scrolling without a real TUI, but we can verify
        // the handler exists and processes key sequences
        const keys = ["\x1b[A", "\x1b[B", "\x1b[5~", "\x1b[6~", "\x1b[H", "\x1b[F", "\x1b"];
        for (const key of keys) {
          try {
            component.handleInput(key);
          } catch (err) {
            throw new Error(`handleInput threw for key sequence: ${JSON.stringify(key)}: ${err}`);
          }
        }

        return Promise.resolve();
      },
      notify() {},
    },
  };

  try {
    await showScrollableOverlay(mockCtx, "Title", "Subtitle", "Line 1\nLine 2\nLine 3");
  } finally {
    (process.stdout as any).columns = originalColumns;
  }

  console.log("  keyboard handlers accept all key sequences: ok");
}

// --- Run ---

try {
  console.log("validate-vazir-overlay-reader:");
  scenarioShowScrollableOverlayIsExported();
  await scenarioFallbackOnNarrowTerminal();
  await scenarioOverlayReturnsPromise();
  await scenarioKeyboardHandlersWork();
  console.log("validate-vazir-overlay-reader: ok");
} finally {
  cleanupStubModules(stubModuleDirs);
}
