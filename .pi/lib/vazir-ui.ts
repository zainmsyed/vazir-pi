/// <reference path="../../types/node-runtime-ambient.d.ts" />
/// <reference path="../../types/pi-runtime-ambient.d.ts" />

/**
 * Shared pi TUI overlay helpers for Vazir selection lists and markdown viewers.
 *
 * Neutral shared module — no imports from consuming extensions.
 */

import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import {
  Container,
  Key,
  Markdown,
  matchesKey,
  SelectList,
  type SelectItem,
  Spacer,
  Text,
  truncateToWidth,
} from "@earendil-works/pi-tui";

export interface SelectionListOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  danger?: boolean;
}

export type OverlayAnchor =
  | "center"
  | "top-center"
  | "top-left"
  | "top-right"
  | "left-center"
  | "right-center"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface ShowSelectionListOptions {
  /** If true, treat the list as destructive and default-focus the first non-danger item. */
  destructive?: boolean;
}

export interface ShowMarkdownViewerOptions {
  /** Overlay anchor. Default: "center". */
  anchor?: OverlayAnchor;
  /** Overlay width. Default: "70%". */
  width?: number | string;
  /** Overlay minWidth. Default: 60. */
  minWidth?: number;
  /** Overlay maxHeight. Default: "100%". */
  maxHeight?: number | string;
}

export interface CommandDoc {
  command: string;
  shortDesc: string;
  usage: string;
  args: string[];
  examples: string[];
  longDesc: string;
}

export async function showCommandDetailOverlay(
  ctx: { ui: { custom: any } },
  doc: CommandDoc,
): Promise<void> {
  const mdLines = [
    `## ${doc.command}`,
    "",
    doc.shortDesc,
    "",
    `**Usage:** \`${doc.usage}\``,
  ];

  if (doc.args.length > 0) {
    mdLines.push("", "**Arguments:**");
    for (const arg of doc.args) {
      mdLines.push(`- ${arg}`);
    }
  }

  if (doc.examples.length > 0) {
    mdLines.push("", "**Examples:**");
    for (const ex of doc.examples) {
      mdLines.push(`- \`${ex}\``);
    }
  }

  mdLines.push("", doc.longDesc);

  return showMarkdownViewer(ctx, doc.command, mdLines.join("\n"));
}

/**
 * A bordered panel with solid background that frames child components.
 *
 * Renders a full box border (┌─┐ / │ │ / └─┘) around content and fills every
 * line with a background color so the overlay stands out from terminal content
 * underneath.
 *
 * Pi's theme.fg() resets only foreground (\x1b[39m), so background color set by
 * theme.bg() persists across the entire line even when child content brings its
 * own styling.
 */
export class VazirPanel extends Container {
  private title: string;
  private borderFg: (s: string) => string;
  private bg: (s: string) => string;

  constructor(
    title: string,
    borderFg: (s: string) => string,
    bg: (s: string) => string,
  ) {
    super();
    this.title = title;
    this.borderFg = borderFg;
    this.bg = bg;
  }

  render(width: number): string[] {
    const innerWidth = Math.max(1, width - 4);
    const contentLines = super.render(innerWidth);

    const borderInner = Math.max(1, width - 2);

    const top = this.bg(this.borderFg(`┌${"─".repeat(borderInner)}┐`));

    const titleLine = this.bg(
      this.borderFg("│ ") +
        padOrTruncate(this.title, innerWidth) +
        this.borderFg(" │"),
    );

    const divider = this.bg(this.borderFg(`├${"─".repeat(borderInner)}┤`));

    const body = contentLines.map((line) => {
      return this.bg(
        this.borderFg("│ ") + padOrTruncate(line, innerWidth) + this.borderFg(" │"),
      );
    });

    const bottom = this.bg(this.borderFg(`└${"─".repeat(borderInner)}┘`));

    return [top, titleLine, divider, ...body, bottom];
  }
}

/** Strip ANSI CSI escape sequences so we can measure visible width. */
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
}

/**
 * Truncate or pad a string (which may contain ANSI codes) so its visible
 * width exactly matches `targetWidth`.
 *
 * `truncateToWidth` from pi-tui handles truncation but may not pad short
 * strings; this helper adds explicit space padding to guarantee alignment.
 */
function padOrTruncate(str: string, targetWidth: number): string {
  const truncated = truncateToWidth(str, targetWidth, "");
  const visible = stripAnsi(truncated);
  const pad = Math.max(0, targetWidth - visible.length);
  return truncated + " ".repeat(pad);
}

/**
 * Show a Vazir-styled selection list overlay using pi's SelectList.
 *
 * Returns the chosen value or `null` if the user escapes/cancels.
 */
export async function showSelectionList<T extends string = string>(
  ctx: { ui: { custom?: any; select?: any } },
  title: string,
  items: SelectionListOption<T>[],
  options: ShowSelectionListOptions = {},
): Promise<T | null> {
  if (items.length === 0) {
    return null;
  }

  if (typeof ctx.ui?.custom !== "function") {
    if (typeof ctx.ui?.select !== "function") return null;
    const labels = items.map(item => item.label);
    const picked = await ctx.ui.select(title, labels);
    if (picked == null) return null;
    const matched = items.find(item => item.label === picked || item.value === picked);
    return matched?.value ?? null;
  }

  const { destructive = false } = options;
  let initialIndex = 0;
  if (destructive) {
    const firstSafe = items.findIndex((item) => !item.danger);
    if (firstSafe >= 0) initialIndex = firstSafe;
  }

  const selectItems: SelectItem[] = items.map((item) => ({
    value: item.value,
    label: item.label,
    description: item.description,
  }));

  return ctx.ui.custom<T | null>(
    (
      tui: { requestRender(): void },
      theme: {
        fg: (color: string, text: string) => string;
        bold: (text: string) => string;
        bg: (color: string, text: string) => string;
      },
      _kb: unknown,
      done: (result: T | null) => void,
    ) => {
      const borderFg = (s: string) => theme.fg("borderAccent", s);
      const bg = (s: string) => theme.bg("customMessageBg", s);
      const panel = new VazirPanel(
        theme.fg("accent", theme.bold(title)),
        borderFg,
        bg,
      );

      const maxVisible = Math.min(items.length, 10);
      const selectList = new SelectList(selectItems, maxVisible, {
        selectedPrefix: (text: string) => theme.fg("accent", text),
        selectedText: (text: string) => {
          const selectedItem = selectList.getSelectedItem();
          const isDanger = selectedItem
            ? items.find((item) => item.value === selectedItem.value)?.danger ?? false
            : false;
          return theme.fg(isDanger ? "error" : "accent", text);
        },
        description: (text: string) => theme.fg("muted", text),
        scrollInfo: (text: string) => theme.fg("dim", text),
        noMatch: (text: string) => theme.fg("warning", text),
      });

      selectList.setSelectedIndex(initialIndex);
      selectList.onSelect = (item: SelectItem) => done(item.value as T);
      selectList.onCancel = () => done(null);

      panel.addChild(selectList);
      panel.addChild(new Spacer(1));
      panel.addChild(new Text(
        theme.fg("dim", destructive
          ? "↑↓ navigate • enter select • esc cancel • danger items shown in red"
          : "↑↓ navigate • enter select • esc cancel"),
        1,
        0,
      ));

      return {
        render(width: number): string[] {
          return panel.render(width);
        },
        invalidate(): void {
          panel.invalidate();
        },
        handleInput(data: string): void {
          if (matchesKey(data, Key.escape)) {
            done(null);
            return;
          }
          selectList.handleInput(data);
          tui.requestRender();
        },
      };
    },
    {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        width: "60%",
        minWidth: 50,
        maxHeight: "100%",
        margin: 1,
      },
    },
  );
}

class ScrollableMarkdown extends Container {
  private md: Markdown;
  private scrollOffset = 0;
  private maxVisible: number;

  constructor(md: Markdown, maxVisible: number) {
    super();
    this.md = md;
    this.maxVisible = maxVisible;
  }

  setScrollOffset(offset: number) {
    this.scrollOffset = Math.max(0, offset);
  }

  setMaxVisible(maxVisible: number) {
    this.maxVisible = maxVisible;
  }

  getScrollOffset(): number {
    return this.scrollOffset;
  }

  getTotalLines(width: number): number {
    return this.md.render(width).length;
  }

  render(width: number): string[] {
    const allLines = this.md.render(width);
    const visibleLines = allLines.slice(
      this.scrollOffset,
      this.scrollOffset + this.maxVisible,
    );
    while (visibleLines.length < this.maxVisible) {
      visibleLines.push("");
    }
    return visibleLines;
  }
}

/**
 * Show a Vazir-styled markdown viewer overlay using pi's Markdown component.
 *
 * The overlay closes on Escape or Enter. Supports ↑↓ and PgUp/PgDn scrolling.
 *
 * @param ctx       Command context with `ctx.ui.custom`
 * @param title     Overlay title shown in the frame header
 * @param markdown  Markdown content to render
 * @param options   Layout overrides
 */
export async function showMarkdownViewer(
  ctx: { ui: { custom: any } },
  title: string,
  markdown: string,
  options: ShowMarkdownViewerOptions = {},
): Promise<void> {
  const {
    anchor = "center",
    width = "70%",
    minWidth = 60,
    maxHeight = "100%",
  } = options;

  return ctx.ui.custom<void>(
    (
      tui: { requestRender(): void },
      theme: {
        fg: (color: string, text: string) => string;
        bold: (text: string) => string;
        bg: (color: string, text: string) => string;
      },
      _kb: unknown,
      done: () => void,
    ) => {
      const borderFg = (s: string) => theme.fg("borderAccent", s);
      const bg = (s: string) => theme.bg("customMessageBg", s);

      const panel = new VazirPanel(
        theme.fg(
          "accent",
          theme.bold(`${title} · esc/enter close · ↑↓ scroll`),
        ),
        borderFg,
        bg,
      );

      const mdTheme = getMarkdownTheme();
      const md = new Markdown(markdown, 1, 1, mdTheme);
      const scrollableMd = new ScrollableMarkdown(md, 10);
      panel.addChild(scrollableMd);

      let lastWidth = 80;

      function computeVisibleRows(): number {
        return Math.max(5, (process.stdout.rows || 24) - 10);
      }

      return {
        render(width: number): string[] {
          lastWidth = width;
          const visibleRows = computeVisibleRows();
          scrollableMd.setMaxVisible(visibleRows);
          return panel.render(width);
        },
        invalidate(): void {
          panel.invalidate();
        },
        handleInput(data: string): void {
          if (matchesKey(data, Key.escape) || matchesKey(data, Key.enter)) {
            done();
            return;
          }

          const visibleRows = computeVisibleRows();
          scrollableMd.setMaxVisible(visibleRows);
          const innerWidth = Math.max(1, lastWidth - 4);
          const totalLines = scrollableMd.getTotalLines(innerWidth);
          const pageSize = Math.max(1, visibleRows - 1);

          if (matchesKey(data, Key.up)) {
            scrollableMd.setScrollOffset(
              Math.max(0, scrollableMd.getScrollOffset() - 1),
            );
          } else if (matchesKey(data, Key.down)) {
            scrollableMd.setScrollOffset(
              Math.min(
                Math.max(0, totalLines - visibleRows),
                scrollableMd.getScrollOffset() + 1,
              ),
            );
          } else if (matchesKey(data, Key.pageUp)) {
            scrollableMd.setScrollOffset(
              Math.max(0, scrollableMd.getScrollOffset() - pageSize),
            );
          } else if (matchesKey(data, Key.pageDown)) {
            scrollableMd.setScrollOffset(
              Math.min(
                Math.max(0, totalLines - visibleRows),
                scrollableMd.getScrollOffset() + pageSize,
              ),
            );
          }

          tui.requestRender();
        },
      };
    },
    {
      overlay: true,
      overlayOptions: {
        anchor,
        width,
        minWidth,
        maxHeight,
        margin: 1,
      },
    },
  );
}
