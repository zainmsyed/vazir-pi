/// <reference path="../../../types/pi-runtime-ambient.d.ts" />

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * Split-target scaffold for the future VCS/settings extraction.
 *
 * Ownership target:
 * - VCS mode selection and settings commands
 * - checkpoint restore/sync flows
 * - VCS guardrails and repo-state publishing
 *
 * Current behavior remains in vazir-tracker and shared helpers until later
 * extraction stories move command registration here.
 */
export default function (_pi: ExtensionAPI) {}
