# CINQRA — AI Creative Studio

**Cinema, Reimagined.**

CINQRA is an independent local creative studio inspired by the observable Higgsfield web experience. It uses the supplied CINQRA brand image and an MIT-licensed Open-Higgsfield generation backend. It is not affiliated with Higgsfield.

## Open on this Mac

Open `CINQRA.app` in the parent output folder. Keep the application beside the `cinqra` project folder. The native Mac shell starts a local development server if needed, then opens CINQRA in its own WebKit window.

Direct access: <http://127.0.0.1:3017/en>.

This is a native Mac shell around a local web application, not a notarized, self-contained distribution. It depends on the included project, installed dependencies, and `/usr/local/bin/node`. The app terminates the server process it started when the last window closes. A separately started server is reused and remains independent. It binds only to the loopback interface.

Manual start:

```sh
npm install
npm run dev -- --port 3017
```

Local `.env.local` config pins `APP_ORIGIN=http://127.0.0.1:3017` so the framework’s internal localhost routing does not reject valid mutations. It contains no provider key initially. Use this exact browser origin.

The inherited project declares Node 22.23.4–22.x. This Mac currently uses Node 24.5.0; install, checks and build succeeded here. REA requires a newer supported Node version than this Mac's current 24.5.0.

## What works

- CINQRA branding, responsive Explore page, searchable and filterable stock-reference recipes.
- Image and video studio with model-specific prompt controls, attachments, aspect ratios and other supported parameters.
- Existing provider-backed submission, asynchronous task handling, recovery status, history, previews and downloads.
- 53 image/video catalog entries in the checked source; catalog presence is not a promise of provider availability or access.
- API-key settings for Higgsfield (Key ID + Secret), Google AI Studio, Freepik and Vercel AI Gateway. Server-only keys saved atomically to `.env.local` with owner-only file permissions. No key values are returned to the browser. Models with missing provider credentials show a lock; selecting one opens provider settings. Saving credentials allows selection but does not prove validity or model access.
- Cinema Studio builds a generation prompt from camera, lens and movement choices.
- Six editable motion/style prompt presets.
- Creative Canvas: draggable prompt/style/output nodes, connections, editable text, local saving, JSON export, cycle detection, and a review step in Studio.
- Local project boards and bookmarked inspiration persist in browser storage.
- Single-workspace backend; local media/task persistence and optional upstream database/storage support remain available.

## Boundaries

- **No paid generation was run.** No real provider keys were supplied. Model access, balance, actual output quality and end-to-end paid generation remain unverified.
- A configured key has not necessarily been validated. Provider pricing and quotas apply. No universal price estimator or monetary spending cap is implemented.
- Cinema/effect presets are prompt directions, not Higgsfield proprietary effects or physical camera simulation.
- Canvas combines text into one generation brief. It does not yet execute a multi-model node pipeline.
- Project boards currently name and start creative briefs; they do not attach generated assets to separate projects. Generated media is in shared history.
- Browser data is device/profile-specific and is not cloud synced. API keys are stored separately on the server.
- No Higgsfield proprietary backend/models, exact output parity, social/community features, account system, paid subscriptions, automated ads, lip sync or timeline editor are included.
- This is not a production multi-tenant SaaS release. Review inherited production configuration, account isolation, billing, limits and deployment requirements before public use.
- Dependency installation reported 16 moderate advisories. No blanket dependency upgrades were applied. Existing React Hook Form compiler warnings remain in two inherited, unused legacy studio components.

## Validation

- TypeScript check passed.
- ESLint completed without errors; inherited compiler warnings noted above.
- Regression suite: 123 tests total, 122 passed, 0 failed, 1 skipped (PostgreSQL integration requires a database). Includes five new connection-settings cases.
- Optimized Next.js build passed.
- Browser checks covered desktop/mobile layouts, API settings presence, saved inspiration, project creation and persistence after reload, and Canvas prompt transfer to Video Studio.
- Native Mac shell compiled and ad-hoc code-signature verification passed. Native window/startup verification remains incomplete because the Mac was locked.

## Provenance

Original backend: <https://github.com/TechBeme/open-higgsfield>, pinned checkout recorded in `RESEARCH.md`. Original `LICENSE` retained; original README remains as upstream reference.

The supplied CINQRA image is used as brand artwork. Reference photos are from Unsplash; sources are recorded in `RESEARCH.md`. They are inspiration images, not generated samples.

## Higgsfield integration — 2 November 2026

Open **Connect API**, select **Higgsfield API**, and follow **Get Higgsfield credentials ↗**. Save the official **Key ID** and **Secret** as a pair. API billing is separate from a website subscription. Credentials stay server-side in the owner-readable local settings file.

Implemented text workflows: SOUL V2 and SOUL Standard (image); Seedance 2.5, Wan 3.0, MiniMax H3, Hailuo 2.3 Standard and Kling 3.0 Pro (video). Model-specific input schemas are pinned from the official documentation in `src/models/capabilities/higgsfield-schemas.json`. This is a supported subset, not a claim that all Higgsfield website models or features are implemented. These entries accept text prompts only; image-reference workflows need separate adapters.

Requests use `Authorization: Key KEY_ID:SECRET`, a stable per-task `Idempotency-Key`, and the existing asynchronous job/history pipeline. Poll URLs must stay on Higgsfield's documented API origin and match the accepted request ID. An ambiguous submission is not automatically resubmitted or sent to another provider.

No automatic paid key verification runs. Configuration presence is not verified model access, account balance or successful generation. No customer credentials were provided or paid generation run during development.

Validation: 131 regression tests total; 130 passed, 1 PostgreSQL integration skipped, 0 failed. TypeScript and optimized build passed. ESLint has 0 errors and 2 inherited React Hook Form compiler warnings. UI checks covered missing-key locks and settings targeting, official key link and credential fields, simulated configured-state unlocking, and model resolution controls. Simulated state was removed after testing.

Official references: <https://docs.higgsfield.ai/docs/authentication>, <https://docs.higgsfield.ai/docs/concepts/requests>, <https://docs.higgsfield.ai/docs/models>.


## Creative suite expansion

Open **Creative suite** for14 new workspaces/tools. See `FEATURE-CHECKLIST.md` for delivered functions, partial features and verification boundaries. It supersedes earlier broad omissions about audio/lipsync, local community, reference media and shared project support. The legacy image/video catalog remains53 entries; the separate creative workflow catalog has60 entries (54 enabled adapters,6 explicitly unavailable). API entitlement and paid generation are unverified.

The image editor performs real local mask/layer/text edits and exports PNG/document JSON. Local video editing uses bundled `ffmpeg-static` for trim/reframe/resize/audio/freeze-tail output. Creative projects, references, posts and shared canvas persist server-side. Google AI Director/audio and Freepik talking-head require their own provider keys; Higgsfield credentials cannot unlock those providers. Adobe integrations ship as source and host execution remains unverified.

Back up `.cinqra-creative/` and `.cinqra-creative-jobs/` as well as existing generation storage. See `integrations/README.md` for CLI/MCP/Adobe handoff.
