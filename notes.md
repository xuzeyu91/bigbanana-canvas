# Notes: Canvas production workflow upgrade

## Product direction

- Canvas remains a generic visual workspace.
- Production features are optional metadata and panels: semantic assets, shot groups, preflight, and activity records.
- The first scope excludes novel/episode planning and an embedded timeline editor.

## Existing foundations

- Canvas has image, text, config, video, and audio node types.
- Canvas projects and assets are local-first, exportable, and WebDAV-syncable.
- Existing video generation already supports asynchronous tasks and multimodal references.

## Implemented foundation

- Optional production metadata lives on existing node metadata, so persisted projects remain backward compatible.
- Selected nodes can be marked as character, scene, prop, or style assets; they can also be locked and grouped under a named shot.
- Locked nodes in the same shot are appended as prompt anchors and media references before generation, then pass through the existing image hydration and video-limit checks.
- Preflight distinguishes blocking input errors from continuity warnings.
- The source node keeps the latest 20 generation records; generated child nodes inherit their production metadata.

## Design constraints

- Preserve existing persisted projects by making all new fields optional.
- Keep production UI in `web/src/app/(user)/canvas/` and use current canvas theme tokens.
- Avoid adding a backend or new global state library.
