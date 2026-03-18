export interface ReviewDelta {
  path: string;
  linesAdded: number;
  linesRemoved: number;
}

interface DiffOperation {
  type: "equal" | "add" | "remove";
  line: string;
}

interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

export function countLineDelta(original: string, modified: string): { linesAdded: number; linesRemoved: number } {
  const operations = buildOperations(original.split("\n"), modified.split("\n"));
  let linesAdded = 0;
  let linesRemoved = 0;

  for (const operation of operations) {
    if (operation.type === "add") linesAdded += 1;
    if (operation.type === "remove") linesRemoved += 1;
  }

  return { linesAdded, linesRemoved };
}

function buildOperations(original: string[], modified: string[]): DiffOperation[] {
  const rows = original.length;
  const cols = modified.length;
  const matrix = Array.from({ length: rows + 1 }, () => new Array<number>(cols + 1).fill(0));

  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let col = cols - 1; col >= 0; col -= 1) {
      matrix[row][col] =
        original[row] === modified[col]
          ? matrix[row + 1][col + 1] + 1
          : Math.max(matrix[row + 1][col], matrix[row][col + 1]);
    }
  }

  const operations: DiffOperation[] = [];
  let row = 0;
  let col = 0;

  while (row < rows && col < cols) {
    if (original[row] === modified[col]) {
      operations.push({ type: "equal", line: original[row] });
      row += 1;
      col += 1;
      continue;
    }

    if (matrix[row + 1][col] >= matrix[row][col + 1]) {
      operations.push({ type: "remove", line: original[row] });
      row += 1;
      continue;
    }

    operations.push({ type: "add", line: modified[col] });
    col += 1;
  }

  while (row < rows) {
    operations.push({ type: "remove", line: original[row] });
    row += 1;
  }

  while (col < cols) {
    operations.push({ type: "add", line: modified[col] });
    col += 1;
  }

  return operations;
}

function buildHunks(operations: DiffOperation[], contextLines: number): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let previousEqualCount = 0;
  let oldLine = 1;
  let newLine = 1;
  let current: DiffHunk | null = null;

  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index];
    const oldBefore = oldLine;
    const newBefore = newLine;

    if (operation.type === "equal") {
      previousEqualCount += 1;

      if (current) {
        if (previousEqualCount <= contextLines * 2) {
          current.lines.push(` ${operation.line}`);
          current.oldCount += 1;
          current.newCount += 1;
        } else {
          current.lines.splice(current.lines.length - contextLines, contextLines);
          current.oldCount -= contextLines;
          current.newCount -= contextLines;
          hunks.push(current);
          current = null;
        }
      }

      oldLine += 1;
      newLine += 1;
      continue;
    }

    if (!current) {
      const prefixLength = Math.min(contextLines, previousEqualCount);
      const prefix = operations.slice(index - prefixLength, index);

      current = {
        oldStart: Math.max(1, oldBefore - prefix.length),
        oldCount: prefix.length,
        newStart: Math.max(1, newBefore - prefix.length),
        newCount: prefix.length,
        lines: prefix.map((item) => ` ${item.line}`),
      };
    }

    previousEqualCount = 0;

    if (operation.type === "remove") {
      current.lines.push(`-${operation.line}`);
      current.oldCount += 1;
      oldLine += 1;
      continue;
    }

    current.lines.push(`+${operation.line}`);
    current.newCount += 1;
    newLine += 1;
  }

  if (current) {
    hunks.push(current);
  }

  return hunks;
}

export function createUnifiedDiff(path: string, original: string, modified: string, contextLines = 2): string {
  if (original === modified) {
    return `No staged diff for ${path}.`;
  }

  const originalLines = original.split("\n");
  const modifiedLines = modified.split("\n");
  const operations = buildOperations(originalLines, modifiedLines);
  const hunks = buildHunks(operations, contextLines);

  const output = [`--- ${path}`, `+++ .context/sandbox/${path}`];
  for (const hunk of hunks) {
    output.push(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`);
    output.push(...hunk.lines);
  }

  return output.join("\n");
}

export function formatDeltaSummary(deltas: ReviewDelta[]): string {
  if (deltas.length === 0) {
    return "No sandbox changes are currently staged.";
  }

  const totalAdded = deltas.reduce((sum, delta) => sum + delta.linesAdded, 0);
  const totalRemoved = deltas.reduce((sum, delta) => sum + delta.linesRemoved, 0);
  const lines = [
    `Sandbox delta: ${deltas.length} file(s), +${totalAdded}/-${totalRemoved}`,
    ...deltas.map((delta) => `- ${delta.path} (+${delta.linesAdded}/-${delta.linesRemoved})`),
  ];

  if (deltas.length > 1) {
    lines.push("Run /review <file> to inspect a single staged diff.");
  }

  return lines.join("\n");
}

export function resolveReviewTarget(requested: string, pendingFiles: string[]): { path: string | null; error: string | null } {
  if (pendingFiles.length === 0) {
    return { path: null, error: "No sandbox changes are currently staged." };
  }

  const normalized = requested.trim();
  if (!normalized) {
    if (pendingFiles.length === 1) {
      return { path: pendingFiles[0], error: null };
    }

    return {
      path: null,
      error: "Multiple sandbox files are staged. Run /delta to list them, then /review <file>.",
    };
  }

  const exact = pendingFiles.find((file) => file === normalized);
  if (exact) return { path: exact, error: null };

  const suffixMatches = pendingFiles.filter((file) => file.endsWith(normalized));
  if (suffixMatches.length === 1) {
    return { path: suffixMatches[0], error: null };
  }

  if (suffixMatches.length > 1) {
    return {
      path: null,
      error: `Ambiguous review target: ${normalized}. Matches: ${suffixMatches.join(", ")}`,
    };
  }

  return { path: null, error: `No staged sandbox file matches: ${normalized}` };
}