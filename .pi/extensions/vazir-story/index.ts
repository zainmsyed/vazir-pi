/// <reference path="../../../types/pi-runtime-ambient.d.ts" />

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * Split-target scaffold for the future story workflow extraction.
 *
 * Ownership target:
 * - /story, /implement, /fix, and /complete-story orchestration
 * - story picker flows and closeout state handling
 * - story-scoped review handoff wiring
 *
 * Current behavior remains in vazir-tracker and vazir-context until later
 * extraction stories move command registration here.
 */
export default function (_pi: ExtensionAPI) {}
