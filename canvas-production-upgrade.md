# Canvas production workflow upgrade

## Delivered scope

- Added optional production metadata to existing canvas nodes: semantic role, locked-reference flag, shot ID/title/stage, and recent generation records.
- Added the canvas “制作” panel for semantic tagging, reference locking, shot grouping, preflight, shot overview, and record inspection.
- Locked role assets in the same shot now contribute prompt anchors and media references before generation. Generated child nodes inherit their source production metadata.
- Normal generation and retry flows record success, failure, and cancellation while preserving the existing request, storage, and video-limit logic.

## Verification

- Ran whitespace and diff consistency checks.
- Did not run a build or type check, following the repository instruction that the user performs those checks.

## Follow-up

- See `docs/content/docs/progress/todo.mdx` for multi-shot production planning and delivery work that remains intentionally out of scope.
