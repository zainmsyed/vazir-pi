# Vazir TUI — UI/UX Mod Catalogue

A reference for all discussed interface improvements, organized by what they do and how hard they are to build. All are implementable as pi extensions using `ExtensionUIContext`, widget slots, custom components, or the footer/header factory.

---

## The Surface Area

Before the ideas, the primitives available in pi's extension system:

| Surface | API | Notes |
|---|---|---|
| Widget zones | `ctx.ui.setWidget(key, content, placement)` | `aboveEditor` or `belowEditor`, max 10 lines total |
| Footer | `ctx.ui.setFooterFactory(fn)` | Replaces entire footer, reads git branch + extension statuses |
| Header | `ctx.ui.setHeader(fn)` | Replaces entire header and stays pinned at the top |
| Notifications | `ctx.ui.notify(msg, type)` | Fire-and-forget, `info / warning / error` |
| Status slots | `ctx.ui.setStatus(key, text)` | Named slots rendered in footer |
| Working message | `ctx.ui.setWorkingMessage(msg)` | Replaces default "Thinking…" text |
| Custom components | `ctx.ui.custom(factory, opts)` | Full-screen or overlay, any `render(width): string[]` |
| Raw input capture | `ctx.ui.addInputListener(fn)` | Intercept keystrokes before editor |
| Tool output | `ctx.ui.setToolOutputExpanded(bool)` | Collapse/expand all tool results |
| Theme | `ctx.ui.theme` | Read current theme colors for consistent styling |

Components render via `render(width): string[]` — one string per terminal row. The differential renderer only rewrites changed rows, so animation is cheap as long as row count stays stable.

---

## UX Improvements

### 1. Fixed-Height Streaming Window

**Problem:** The streaming assistant message grows downward line by line, causing the terminal to scroll and jump. Disorienting when the agent is writing a long response.

**Solution:** Pin streaming output to a fixed-height component (e.g. 15 rows) that shows only the last N lines of the current generation. Once streaming ends, the full message is flushed into the chat history normally.

**How it works:**
- On `message_start`, add a `FixedStreamingWindow` component to `chatContainer`
- On `message_update`, call `appendDelta(text)` — internally re-wraps and slices to last N lines
- On `message_end`, remove the window; the completed `AssistantMessageComponent` takes over

```typescript
class FixedStreamingWindow implements Component {
  private lines: string[] = [];
  private maxRows = 15;

  appendDelta(text: string) {
    const full = this.lines.join("\n") + text;
    this.lines = wrapAnsi(full, this.width).split("\n");
  }

  render(width: number): string[] {
    this.width = width;
    return this.lines.slice(-this.maxRows); // always fixed height
  }

  invalidate() {}
}
```

**Effort:** ~2 hours  
**Impact:** Eliminates the single most annoying current UX friction

---

### 2. Contextual Working Messages

**Problem:** "Thinking…" tells you nothing about what the agent is actually doing.

**Solution:** Hook `beforeToolCall` to set a descriptive working message based on which tool is executing and what arguments it received.

```typescript
pi.on("beforeToolCall", (ctx, tool) => {
  const messages: Record<string, (args: any) => string> = {
    read_file:    (a) => `Reading · ${path.basename(a.path)}`,
    write_file:   (a) => `Writing · ${path.basename(a.path)}`,
    bash:         (a) => `Running · ${a.command.slice(0, 40)}`,
    str_replace:  (a) => `Editing · ${path.basename(a.path)}`,
  };
  const msg = messages[tool.name]?.(tool.args) ?? `Using ${tool.name}`;
  ctx.ui.setWorkingMessage(msg);
});

pi.on("afterToolCall", (ctx) => {
  ctx.ui.setWorkingMessage(); // restore default
});
```

**Effort:** ~30 min  
**Impact:** Every session immediately feels smarter and more legible

---

### 3. Vazir Status Widget

**Problem:** You have no ambient awareness of which story is active, what its status is, or how many issues are open — without running a command.

**Solution:** A persistent 1–2 line widget `aboveEditor` that reads the active story's frontmatter on each render and displays a summary line.

```
▸ story-003  in-progress  ⚠ 2 issues  haiku-3.5  $0.0018
```

Updated after each agent turn ends (`message_end` hook). Reads `last_accessed` to find the active story, parses frontmatter for status and issue count.

**Effort:** ~1 hour  
**Impact:** You always know where you are — the "current file" indicator every IDE has

---

### 4. Custom Footer

**Problem:** The default footer is generic pi branding with no Vazir identity.

**Solution:** Replace with a `setHeader` that renders a Vazir-branded header. It stays pinned at the top of the terminal window:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ◈ vazir  story-003  main  haiku-3.5  ↑2.1k ↓8.4k  $0.0021
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Fields: Vazir wordmark, active story slug, git branch (from `footerData.getGitBranch()`), model name, token counts, session cost. All colored using `ctx.ui.theme`.

**Effort:** ~1 hour  
**Impact:** Frames every session — makes it feel like a real product, not a script

---

### 5. Tool Output Collapsed by Default

**Problem:** File reads and bash outputs flood the chat history, burying the agent's reasoning.

**Solution:** Call `ctx.ui.setToolOutputExpanded(false)` on session start. Tool calls are collapsed to a single summary line. User can expand with `Ctrl+O` (built-in keybinding) when they want to inspect.

```typescript
pi.on("sessionStart", (ctx) => {
  ctx.ui.setToolOutputExpanded(false);
});
```

**Effort:** ~5 min  
**Impact:** Chat history becomes dramatically cleaner

---

### 6. Issue Count Badge in Footer

**Problem:** You don't know issues are accumulating without explicitly checking.

**Solution:** After each `message_end`, recount `pending` + `reopened` issues in the active story file and update a named footer status slot.

```typescript
pi.on("message_end", async (ctx) => {
  const count = await countOpenIssues(activeStoryPath);
  if (count > 0) {
    ctx.ui.setStatus("issues", `⚠ ${count} issue${count > 1 ? "s" : ""}`);
  } else {
    ctx.ui.setStatus("issues", undefined); // clear badge
  }
});
```

The badge appears in the footer alongside other status slots. Goes away when issues resolve.

**Effort:** ~1 hour (including issue parser)  
**Impact:** Low-noise signal that earns its place — you see it without looking for it

---

## Eye Candy

### 7. Animated Braille Spinner

**Problem:** The static "Thinking…" text is inert during what can be a long generation.

**Solution:** Build a custom spinner component that animates using `Date.now()` mod frame count — no timers or intervals needed, driven purely by the render loop.

```typescript
const FRAMES = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];

class BrailleSpinner implements Component {
  constructor(private message: string) {}

  render(width: number): string[] {
    const frame = FRAMES[Math.floor(Date.now() / 80) % FRAMES.length];
    return [`  ${chalk.cyan(frame)}  ${this.message}`];
  }

  invalidate() {}
}
```

Replaces the working message during generation. The render loop drives the animation automatically — no `setInterval` required.

**Effort:** ~30 min  
**Impact:** The tool feels alive during generation

---

### 8. Rich Markdown Theme

**Problem:** The default markdown theme is utilitarian. Every assistant response looks the same.

**Solution:** Replace the `MarkdownTheme` with a Vazir-branded one. Since every field is a `(text: string) => string` function wrapping ANSI codes, you have full control.

Key changes:
- **Code blocks** — subtle `bgFn` background tint, `╭─── typescript ───╮` top border, `╰──────────────────╯` bottom border
- **Headings** — bold + accent color, followed by a short `───` underline
- **Blockquotes** — colored `▌` left gutter in dim accent
- **Horizontal rules** — full-width `─` in accent color
- **Bold** — warmer color, not just `\x1b[1m`
- **List bullets** — `◆` or `▸` instead of `-`

```typescript
const vazirMarkdownTheme: MarkdownTheme = {
  heading:        (t) => chalk.bold.hex("#A78BFA")(t) + "\n" + chalk.dim("─").repeat(30),
  code:           (t) => chalk.bgHex("#1e1e2e").hex("#cba6f7")(` ${t} `),
  codeBlock:      (t) => chalk.hex("#cdd6f4")(t),
  codeBlockBorder:(t) => chalk.hex("#6c7086")(t),
  quote:          (t) => t,
  quoteBorder:    (t) => chalk.hex("#A78BFA")(t),
  hr:             (t) => chalk.hex("#45475a")(t),
  listBullet:     (t) => chalk.hex("#A78BFA")("◆"),
  bold:           (t) => chalk.bold.hex("#f38ba8")(t),
  italic:         (t) => chalk.italic.hex("#89dceb")(t),
  link:           (t) => chalk.underline.hex("#89b4fa")(t),
  linkUrl:        (t) => chalk.dim.hex("#6c7086")(t),
  // ...
};
```

**Effort:** ~2 hours (mostly tuning colors)  
**Impact:** Transforms every response — the highest-leverage visual change since you see markdown constantly

---

### 9. Story Progress Bar in Status Widget

**Problem:** "3/5 tasks" is readable but not glanceable.

**Solution:** Render a Unicode block progress bar inline in the status widget, alongside the story status badge.

```typescript
function progressBar(done: number, total: number, width = 10): string {
  const filled = Math.round((done / total) * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  return chalk.hex("#A78BFA")(`▐${bar}▌`);
}

// renders as:
// ▸ story-003  ▐███████░░░▌  3/5 tasks  ⚠ 2 issues
```

**Effort:** ~30 min (add to existing status widget)  
**Impact:** Makes progress tactile and glanceable

---

### 10. Box-Drawn Session Header

**Problem:** There's no visual sense of "entering" a Vazir session.

**Solution:** On session start, display a brief full-width header using box-drawing characters before the first prompt. Can be a `custom()` overlay that persists as a static header component, or just printed once into `chatContainer`.

```
╭──────────────────────────────────────────────────────────────╮
│  ◈  V A Z I R   ·   context engine                          │
│  project · my-app   story · 003   branch · main             │
╰──────────────────────────────────────────────────────────────╯
```

Rendered once at startup, stays at the top of the chat history. Sets the tone for the whole session.

**Effort:** ~30 min  
**Impact:** Makes opening a session feel intentional, not accidental

---

### 11. "Done" Completion Flash

**Problem:** When the agent finishes a long turn, there's no satisfying signal that it's landed.

**Solution:** On `message_end`, briefly show a 1-line overlay at the bottom of the chat that animates through `█ ▓ ▒ ░ ·` over ~500ms, then disappears. Driven by `Date.now()` in `render()`, auto-dismissed after a fixed duration.

```typescript
const FADE = ["█","▓","▒","░","·",""];
class CompletionFlash implements Component {
  private startTime = Date.now();

  render(width: number): string[] {
    const elapsed = Date.now() - this.startTime;
    const frameIdx = Math.min(Math.floor(elapsed / 100), FADE.length - 1);
    if (frameIdx >= FADE.length - 1) return []; // done, render nothing
    const char = FADE[frameIdx];
    return [chalk.hex("#A78BFA")(char.repeat(Math.floor(width / 2)))];
  }

  invalidate() {}
}
```

**Effort:** ~1 hour  
**Impact:** Adds a tactile "thud" to the end of every generation — small but memorable

---

### 12. Colored Bash Output

**Problem:** Raw bash output in tool execution blocks is a wall of undifferentiated text.

**Solution:** In a `tool_execution_update` handler for bash calls, apply a lightweight syntax pass: lines starting with `+` in green, `-` in red, file paths in accent, error keywords (`error`, `fatal`, `failed`) in red, numbers dimmed.

```typescript
function colorBashLine(line: string): string {
  if (line.startsWith("+")) return chalk.green(line);
  if (line.startsWith("-")) return chalk.red(line);
  if (/error|fatal|failed/i.test(line)) return chalk.red.bold(line);
  if (/\/[\w./]+\.\w+/.test(line)) return line.replace(
    /\/[\w./]+\.\w+/g,
    (m) => chalk.hex("#89b4fa")(m)
  );
  return chalk.dim(line);
}
```

**Effort:** ~2 hours  
**Impact:** Makes watching the agent work genuinely enjoyable instead of anxiety-inducing

---

## Implementation Priority

Ordered by impact-to-effort ratio:

| # | Mod | Effort | Impact |
|---|---|---|---|
| 1 | Tool output collapsed by default | 5 min | High |
| 2 | Contextual working messages | 30 min | High |
| 3 | Braille spinner | 30 min | Medium |
| 4 | Story progress bar | 30 min | Medium |
| 5 | Box-drawn session header | 30 min | Medium |
| 6 | Vazir status widget | 1 hr | High |
| 7 | Custom footer | 1 hr | High |
| 8 | Issue count badge | 1 hr | Medium |
| 9 | "Done" completion flash | 1 hr | Medium |
| 10 | Fixed-height streaming window | 2 hrs | High |
| 11 | Rich markdown theme | 2 hrs | High |
| 12 | Colored bash output | 2 hrs | Medium |

Total estimated: ~12–14 hours for the full set. The first five items alone take under 2 hours and transform the feel of the tool.
