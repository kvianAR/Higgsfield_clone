# Creative workflow backend

Implemented 2 November 2026. No real credentials or paid generations were used during development.

## Implemented contracts

- `GET /api/creative/workflows`: documented workflow forms and configuration-presence flags for Higgsfield, Google and Freepik. Presence does not verify credentials, balance or model entitlement.
- `POST /api/creative/jobs`: `{workflowId,input,clientRequestId}`. Returns a durable job. Repeating the same request ID returns its existing job; using that ID with different input returns 409.
- `GET /api/creative/jobs`: recent jobs. `?id=<id>` checks and safely polls a selected job.
- `POST /api/creative/director`: `{brief,mode:"prompt"|"storyboard",context?:string}`. Calls Google Gemini with the existing server-side Gemini key. Storyboards contain validated title, prompt and duration fields. Review precedes image/video generation; this route does not generate images or videos.
- `GET /api/creative/jobs/<id>/audio`: durable generated WAV output. Workspace access checks apply to every route, including media.

## Official Higgsfield API evidence

51 model-specific input schemas are pinned in `src/lib/creative/workflows-schemas.json`. They were fetched from official documentation linked by the API console. Example sources:

- <https://dash.higgsfield.ai/models/higgsfield-ai/soul/v2/image-to-image/llms.txt>
- <https://dash.higgsfield.ai/models/bytedance/seedance-2.5/reference-to-video/llms.txt>
- <https://dash.higgsfield.ai/models/kling-video/v4.0/video-edit/llms.txt>
- <https://dash.higgsfield.ai/models/higgsfield/cinema-studio/4.0/llms.txt>
- <https://dash.higgsfield.ai/models/higgsfield/genjutsu/motion-transfer/v1.0/llms.txt>
- <https://dash.higgsfield.ai/models/higgsfield/ads-studio/v1.0/llms.txt>
- <https://dash.higgsfield.ai/models/marketing-studio/image/llms.txt>

Submissions use each document's exact `https://api.higgsfield.ai/<endpoint>` with server-side paired authorization and a stable per-job idempotency key. Polling accepts only `https://api.higgsfield.ai/requests/<matching-request-id>/status`. Unknown acceptance, process interruption or ambiguous provider failure is recorded as `recovery_required`; no automatic paid resubmission or provider fallback occurs.

Input schema types, enums, ranges, array sizes, required fields and conditional `if`/`then`/`else`/`allOf` rules are validated before paid submission. Advanced nested inputs accept JSON. The AI Influencer schema contains unresolved references and is deliberately disabled rather than accepting an incomplete contract.

Official local-media upload: <https://docs.higgsfield.ai/docs/concepts/file-uploads.md>. The implementation requests an upload URL from `/files/generate-upload-url`, PUTs local asset bytes with returned headers, and supplies the public URL to the model. Higgsfield credentials are never forwarded to storage hosts. Supported upload MIME types are JPEG, PNG, WebP, GIF, WAV and MP4. Local files must already be registered workspace assets; arbitrary filesystem paths cannot be read.

Completed remote image/video assets are fetched through the existing bounded safe-media helper and saved into the durable workspace asset library. If archival fails, the provider URL remains visible together with `ERR_CREATIVE_OUTPUT_NOT_ARCHIVED_REMOTE_URL_MAY_EXPIRE`; no new generation is submitted.

## Google director and audio

Official contracts: <https://ai.google.dev/gemini-api/docs/text-generation>, <https://ai.google.dev/gemini-api/docs/audio>, <https://ai.google.dev/gemini-api/docs/speech-generation>.

Director defaults to `gemini-2.5-flash`; synthetic speech defaults to `gemini-2.5-flash-preview-tts`. Explicit server environment overrides are `CINQRA_DIRECTOR_MODEL` and `CINQRA_TTS_MODEL`. Model access and current account availability remain unverified. Provider errors are sanitized and surfaced rather than silently switching models.

Voiceover generates 24 kHz mono PCM WAV using a selected synthetic voice. Re-voice and translate first transcribe/translate audio, then synthesize a new voice track: each action makes **two model requests**. These modes do not clone the source voice, preserve its timing or delivery, synchronize lips, or provide a separate manual transcript-review step. Inputs and descriptions explicitly state these limits.

## Freepik talking-head workflow

The dedicated Lipsync category exposes the existing source's OmniHuman 1.5 API contract: `POST https://api.freepik.com/v1/ai/video/omni-human-1-5`, followed by `GET /v1/ai/video/omni-human-1-5/<task-id>`. Inputs are character image URL, audio URL, 720p/1080p resolution and turbo flag. A separate Freepik key is required. Source contract is `src/models/adapters/video/omni-human.ts`; it has not been live account-tested. Freepik inputs currently require public media URLs; local asset URLs are rejected with an actionable code.

## Explicit limits

- No verified dedicated Higgsfield mask-inpaint, background removal, layer decomposition, video-upscale or lipsync endpoint was discovered in this bounded public catalog audit. Those workflow entries are disabled with reasons. General prompt image editing is not represented as a mask API.
- Catalog presence and adapter tests do not establish real model access, output quality or billing correctness.
- Jobs and Google WAVs use local owner-only durable files; they are not a multi-tenant hosted job service.
- Output links can expire if archival fails. The UI must display the recorded warning.

## Verification

- `node --test scripts/verify-creative-providers.mjs`: 7 tests passed, 0 failed.
- TypeScript check passed after integration with workspace asset helpers.
- Scoped ESLint passed with 0 warnings and 0 errors.
- Tests cover schema/conditional validation, upload credential isolation, fixed polling origins, concurrent and restart-safe idempotency, ambiguous paid submission recovery, WAV creation, structured storyboard validation and Freepik talking-head request contracts.
- Tests use mocked provider HTTP and temporary storage, never production credentials or paid calls.
