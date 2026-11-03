# CINQRA integrations

All integrations target the same running CINQRA workspace. They do not copy provider keys into clients. Start CINQRA on `http://127.0.0.1:3017`; configure optional workspace access with the existing `APP_ACCESS_USER`, `APP_ACCESS_PASSWORD`, and `APP_ORIGIN` settings.

## CLI and editing-app handoff

Run `node integrations/cinqra.mjs` for help. Read projects with `workspace`, list media with `assets`, upload a file with `upload /absolute/file.png`, and export a storyboard with `export PROJECT_ID > project.json`. Exported projects contain shot order, settings, referenced Elements and media URLs. Media URLs remain protected by the source workspace; download the files before offline handoff to an editor. No Adobe app is launched automatically.

For authenticated workspaces set `CINQRA_ACCESS_USER` and `CINQRA_ACCESS_PASSWORD` in the integration process environment. Set `CINQRA_URL` to another trusted HTTPS origin only when intentionally using a remotely hosted workspace. Do not place access credentials in URLs or commit them.

`generate WORKFLOW_ID INPUT_JSON` submits a provider job; it can incur charges. `director BRIEF` calls the configured text AI and can incur charges. Commands do not automatically retry paid submissions.

## MCP

Configure a local MCP client to launch `node` with this project's absolute `integrations/mcp-server.mjs` path. Its standard-input/output transport speaks newline-delimited MCP JSON-RPC, protocol `2024-11-05`, with initialize, ping, tools/list and tools/call. Pass the same environment configuration above. Tools read workspace/assets/jobs, draft prompts/storyboards, and explicitly submit generation. The generation tool description requires confirmation of the specific paid request. This server does not install or modify any MCP client's configuration.

## Adobe Photoshop UXP panel

Load `adobe-uxp/manifest.json` through Adobe UXP Developer Tool while Photoshop 25+ is running. Start the panel from Plugins, refresh CINQRA assets, select an image and choose **Open image in Photoshop**. The panel downloads to UXP's temporary plugin storage and opens a real Photoshop document inside `executeAsModal`. Optional access credentials remain in memory. Only loopback port 3017 is allowed by the manifest. No provider keys are needed in the panel.

The panel source and JavaScript are checked locally; actual Photoshop loading/import requires an installed Adobe host and remains unverified. This is a Photoshop panel, not a Premiere Pro or After Effects live generation plugin.

For After Effects, download your CINQRA media, then use **File > Scripts > Run Script File** and select `adobe-handoff/after-effects-import.jsx`. The script opens a file picker and imports each selected file through `app.project.importFile(new ImportOptions(file))`, reporting failures. For Premiere Pro, execute `adobe-handoff/premiere-import.jsx` in an ExtendScript host attached to Premiere Pro; a saved project must already be open. The script calls `app.project.importFiles` to import selected files into the root bin. The scripts import actual downloaded files; they do not claim live generation, timeline assembly, or an installed CEP panel. Neither host execution has been verified on this Mac.

## Collaboration and community boundaries

Projects, Elements, storyboard shots, media and posts persist in server-owned `.cinqra-creative` files. Clients refresh the shared revision; writes require the last observed revision and return HTTP 409 on conflicts. Two clients using the same workspace can collaborate without overwriting each other's stale edits. This is trusted-workspace collaboration, not a multi-tenant cloud account service. Author names are display labels, not verified identities; likes are workspace counters, not unique-user votes. Community posts/remixes remain inside this workspace and are not posted to Higgsfield or a public social service.

Creative asset uploads accept media files up to 64 MiB, including a separate 64 KiB multipart-envelope allowance; images are capped at 20 MiB. Other generation routes retain their existing 4 MiB request limit. Files are magic-byte checked, stored with generated identifiers and private file permissions, and served only through guarded routes.

The default app remains bound to loopback. No network exposure, account creation, deployment, or third-party publishing is performed by these features. Remote team use requires a deliberately deployed HTTPS workspace with existing workspace authentication. Fine-grained project roles and user identity are not implemented.
