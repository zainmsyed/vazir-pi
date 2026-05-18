/// <reference path="../../../types/pi-runtime-ambient.d.ts" />

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * Split-target scaffold for the future review lifecycle extraction.
 *
 * Ownership target:
 * - /review command orchestration
 * - review draft lifecycle and closeout prompts
 * - recurring finding/rule follow-up wiring
 *
 * Current behavior remains in vazir-context until the extraction stories move
 * command registration here.
 */
export default function (_pi: ExtensionAPI) {}
