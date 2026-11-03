# Validation record

Date: 1 November 2026, Asia/Kolkata.

- TypeScript: passed.
- ESLint: 0 errors, 2 inherited React Hook Form compiler warnings.
- Regression tests: 123 total, 122 pass, 0 fail, 1 PostgreSQL integration skip.
- Optimized Next.js build: passed.
- API settings unit tests cover state non-disclosure, local-only policy, input validation, concurrent atomic updates, preserved settings, owner-only file mode and symlink refusal.
- Live settings route: foreign origin rejected with 403; same-origin invalid provider rejected with 400. Local origin pinned in `.env.local` to resolve internal localhost normalization.
- Browser: Explore loaded at 1440×1000; no broken images or document-level horizontal overflow in checked layout.
- Product filter reduced inspiration cards to one.
- Saved inspiration and a created project board survived reload.
- Canvas assembled scene/style text and transferred it to Video Studio for review.
- Cinema camera/lens choices appeared in the resulting prompt.
- Dolly zoom effect transferred its editable prompt to Video Studio.
- Mobile 390×844 studio and cinema layouts visually checked.
- No real provider key configured. No paid generation submitted. End-to-end output, provider validity/access, downloads of generated media and real polling remain unverified.
- Native Swift/WebKit Mac shell compiled; ad-hoc signature verified. Initial launcher failed cold-start and was replaced with the native shell. The final native build’s window/startup could not be visually verified because the Mac was locked; this remains a release check, not a passed test.
- Original Higgsfield app was not modified. No public deployment performed.

## Higgsfield update — 2 November 2026

- Added paired Higgsfield credentials, official credential link, 7 documented text-generation workflows, missing-key model locks and targeted settings navigation.
- Model adapters and request/poll contracts tested with synthetic credentials and mocked upstream responses; never with a real paid account.
- 131 tests: 130 pass, 0 fail, 1 database-dependent skip.
- TypeScript and optimized build passed; ESLint 0 errors, 2 inherited warnings.
- Browser simulated configured-state test did not write keys to `.env.local`. Mock was removed afterward; live provider status remains unconfigured.
- Actual paid generation and account-specific model access remain unverified.


## Creative suite expansion — 2 November 2026

- Full regression run: 164 tests, 163 passed, 0 failed, 1 PostgreSQL integration skipped. Log: `output/creative-tests.log`.
- TypeScript passed. ESLint: 0 errors, 2 inherited legacy React Hook Form warnings.
- Final optimized production build passed after all workflow/editor and reference-prefill changes. Log: `output/creative-build.log`.
- Actual FFmpeg fixture rendering and protected video-render route tests passed. Browser uploaded a test MP4, reframed to portrait360p, rendered and saved a real MP4 asset.
- Existing single Playwright session `cinqra` reused; no additional Chrome instance created. Browser checks covered14 sections, project creation, Elements, workspace posts/remix persistence, shared canvas save/reload, image upload/text-layer composition saved to assets, missing-Google-key feedback, mobile layout and video render.
- Browser test locator timeouts were corrected; a dev hot-reload loop during simultaneous editing/build was cleared by restarting the owned dev server before the final browser render check.
- Native application signature verification passed. Native launcher remains the relative-path Swift/WebKit wrapper; new features are served from this project.
-51 official Higgsfield model schemas pinned; catalog includes54 enabled documented adapters plus6 disabled/unresolved operations,60 entries total. Configuration is not live model access.
- No real API keys or paid generation used. Adobe host execution, real multi-machine hosting and cloud deployment remain unverified.
- Full14-area delivery and explicit remaining gaps: `FEATURE-CHECKLIST.md`.

- Native startup exposed an inherited duplicate manifest route (static public manifest plus Next manifest route). Removed the duplicate static file and branded the dynamic manifest. HTTP `/manifest.webmanifest`, `/en` and `/api/creative/workflows` now return200.


## Reliability and Mac packaging — 3 November 2026

- Added credential-fingerprinted provider states, authenticated connection checks for Google/Higgsfield, and completed-generation evidence. Freepik directs users to a reviewed generation. Real keys are absent in source settings, so paid testing remains pending.
- Added settings-specific confirmed-rate estimates with separate normal/discounted USD totals. Automatic provider pricing discovery remains pending. Cost form waits for the current pricing profile before saving a rate.
- Added legacy history reuse/variation/retry review and image-to-video reference preparation. New video jobs persist local reference URLs. Legacy tasks without saved source references require review/re-attachment.
- Active creative jobs link to project storyboard records with input references, job status and archived outputs. Failed project linking is marked pending and reconciled on later reads. Historical Studio tasks can link to project shots and expose original settings/results.
- GitHub README now uses the CINQRA icon and `docs/assets/banner.svg`. Original upstream README preserved under docs.
- ARM64 Mac application and DMG built with bundled Node, Next standalone output and FFmpeg. Deep code-signature verification passed. Runtime licenses included. Build-machine secrets/data excluded.
- Packaged server booted from its bundled runtime on an isolated test port/data directory. Pages, provider configuration, workspace and reliability APIs returned200. Temporary local settings save returned200 without exposing key values.
- Single Playwright browser verified normal/discounted estimate calculation and history prompt restore through the normal UI. HTTP history was mocked for that check and the mock removed afterward. No paid generation requested.
- Fixed a package-signing failure caused by dependency symlinks pointing outside the app bundle by dereferencing copied standalone files. Added dist to ESLint ignores.
- Package is ad-hoc signed and architecture-specific. Apple notarization remains dependent on an Apple Developer identity. Packaged app stores data under Application Support. Existing source-mode storage is retained in its original directory.
