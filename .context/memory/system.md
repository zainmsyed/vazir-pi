# System Rules

## Rules
- Follow existing project conventions.
- Write directly to real project files.
- Ask before changing ambiguous areas.

## Learned Rules
- When parsing structured comment annotations in free text, match each annotation independently so reordering does not corrupt the primary content. <!-- source: story-007 -->
- When a workflow adds generated handoff artifacts or scoring heuristics, add an automated fixture that proves the happy path and edge cases before relying on it for closeout. <!-- source: story-007 -->
- When extending a structured data format with new optional fields, update the parser, formatter, and deduplicator together in one change to preserve backwards compatibility and ensure round-trip integrity. <!-- source: story-007 -->
- When a batch command and a per-item closeout both write to the same artifact, apply identical formatting and categorization in both paths so the output is always consistent. <!-- source: story-007 -->
### From failures
- Use draft-based handoff files for multi-step agent workflows, and distinguish missing or invalid drafts from empty-success cases with clear user warnings. <!-- source: story-005 -->
### From successes
- When injecting context or templates based on story type, detect the type from both explicit frontmatter overrides and inferred scope-path extensions. <!-- source: story-002 -->
- When a project-wide reference file is empty or contains placeholder markers, pause implementation to ask concise gap questions, then fill the file with source-story provenance tags before proceeding. <!-- source: story-002 -->
- Provide both an interactive wizard flow and a direct-instruction shortcut for commands that support multiple usage modes. <!-- source: story-003 -->
- When validation checks depend on a reference file being populated, skip the check and note the skip in the output rather than flagging false violations. <!-- source: story-004 -->
- Sanitize delimiter characters in any text persisted into a delimiter-based log, even when the text comes from tool output rather than direct user input. <!-- source: story-006 -->
