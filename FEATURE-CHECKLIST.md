# CINQRA creative suite — implementation checklist

Updated 2 November 2026. All work lives in `/Users/Apple/Projects/Higgsfield_clone`.

Open **Creative suite** in CINQRA. The original Image/Video/Cinema/Effects/Canvas screens remain available.

“Implemented” below means source, local tests and available browser checks. It does not mean paid provider execution or exact Higgsfield parity. No real paid generation was performed.

| # | Requested area | Delivered | Remaining limitation |
|---|---|---|---|
| 1 | Image workspace | Actual mask paint/erase/export; undo/redo; transparent expansion; local texture fill; color-key background removal; local relight/2× upscale; documented image-edit workflow forms | Masked generative inpaint and dedicated AI background removal have no verified adapter here. Color key/texture fill are local tools, clearly labelled. |
| 2 | Layers/text editing | Image/text layers, transform, visibility, opacity, stacking, mask extraction into a new layer, PNG export and portable document JSON; prompt-driven image-edit handoff | AI automatic layer decomposition disabled. Text overlay and manual layer extraction are not automatic recovery of source layers. |
| 3 | Video workspace | Actual FFmpeg trim, contain/crop reframe, resize, volume/mute and freeze-tail MP4 export; API forms for documented video editing/reference workflows | Freeze extension creates no new motion. Dedicated AI upscale has no verified adapter. |
| 4 | Elements | Durable character/location/prop/product records and reusable uploaded media | Trusted shared workspace, not a cloud asset account. |
| 5 | Character consistency | Saved identity descriptions, reference assets, per-shot continuity assignment and brief construction | Model must support references; text guidance does not guarantee identity. Transfer to legacy Studio copies prompt; manually attach references there. |
| 6 | AI Director | Real Google Gemini prompt improvement and structured storyboard suggestions; editable review before media generation | Requires Google AI Studio key and provider access. No paid request tested. |
| 7 | Storyboard | Project shots, durations, reorder, references, Director suggestions and JSON/brief export | Not an assembled timeline or rendered multi-shot film. Each shot is reviewed/generated separately. |
| 8 | Lipsync Studio | Dedicated Freepik OmniHuman talking-head form and durable job handling | Requires Freepik key and public reference URLs. No dedicated Higgsfield lipsync endpoint is claimed. |
| 9 | Audio Studio | Gemini speech WAV, audio transcription/re-voice and translation/synthetic speech | Re-voice/translation use two model requests; no voice cloning, original timing or automatic lip synchronization. |
| 10 | Marketing/Ads | Campaign brief builder, product Elements and pinned documented Marketing/Ads workflow forms | Not every Higgsfield marketing template or website product-import automation. |
| 11 | Motion transfer | Documented Genjutsu/motion-control/reference workflow forms, official HF media uploads, async status/history | Provider account/model limits apply. No paid generation tested. |
| 12 | Team collaboration | Shared server projects, Elements/storyboards and live-refreshed draggable canvas; revision conflict protection | Same trusted server, refresh every 3 seconds, explicit saves. No per-user roles, cloud identities, invite emails or public deployment. |
| 13 | Community/remix | Workspace posts, asset references, likes, source-attributed remixes and prompt reuse | Workspace-local feed; author labels are not verified accounts and likes are not unique-user voting. |
| 14 | External integrations | Actual Node CLI, stdio MCP server, Photoshop UXP source and AE/Premiere file-import JSX handoffs | Adobe hosts unverified; JSX is import handoff, not an installed live generation plugin. |

## Credentials and availability

- Existing API settings accept Higgsfield Key ID + Secret, Google AI Studio and Freepik connections. Keys stay server-side.
- Creative suite **Refresh** updates provider configuration after saving credentials.
- Workflow availability means a documented schema/adapter exists, not verified account entitlement or balance.
- Public API discovery pinned 51 Higgsfield schemas. Unresolved schema references and unverified operations remain disabled with explanations.
- Local images (20 MiB maximum) and video/audio (64 MiB maximum) are stored behind workspace access. Compatible Higgsfield workflows upload local inputs using the official upload URL contract.
- Creative jobs keep a client request identity to prevent duplicate submissions. Uncertain submission outcomes require reconciliation rather than automatic paid retries.
- Completed media is archived locally when possible; archival failure preserves the result with an explicit expiry warning.

## Storage and handoff

- Shared data and creative media: `.cinqra-creative/`; durable workflow jobs/audio: `.cinqra-creative-jobs/` (both ignored by git). Keep both when backing up the project.
- CLI/MCP/Adobe instructions: `integrations/README.md`.
- API endpoint/schema limitations: `WORKFLOWS-NOTES.md`.
- Image document JSON includes layer state and raster images; use PNG for a flattened handoff.
- Project JSON contains references and protected server URLs; download media before offline editor handoff.

## Verification boundaries

Regression tests cover workspace persistence/revision conflicts, references/remixes, upload/origin checks, CLI/MCP, image document/pixel operations, provider payloads/status/idempotency, Director/audio contracts and actual FFmpeg MP4 rendering. Browser checks cover all 14 section navigation, project/Element persistence, posts/remixes, shared canvas persistence, image composition save and mobile layout. Final aggregate results are recorded in `VALIDATION.md` after the full run.

Browser video upload, portrait reframe, local render and asset-library save also passed with an actual generated test clip. No provider key validity, paid output quality, real multi-machine hosting, Adobe host execution, notarization or cloud deployment is claimed.
