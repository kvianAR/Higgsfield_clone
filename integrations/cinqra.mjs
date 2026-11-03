#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { request, configuration, projectExport } from './client.mjs';
const [command, ...args] = process.argv.slice(2);
try {
    let result;
    switch (command) {
        case 'workspace': result = await request('/api/creative/workspace'); break;
        case 'assets': result = await request('/api/creative/assets'); break;
        case 'jobs': result = await request('/api/creative/jobs'); break;
        case 'job': result = await request(`/api/creative/jobs?id=${encodeURIComponent(args[0] || '')}`); break;
        case 'director': result = await request('/api/creative/director', { method: 'POST', body: JSON.stringify({ brief: args.join(' '), mode: 'prompt' }) }); break;
        case 'generate': {
            const input = JSON.parse(args[1] || '{}');
            result = await request('/api/creative/jobs', { method: 'POST', body: JSON.stringify({ workflowId: args[0], input, clientRequestId: crypto.randomUUID() }) }); break;
        }
        case 'upload': {
            if (!args[0]) throw new Error('Provide a file path');
            const bytes = await readFile(args[0]); if (bytes.length > 64 * 1024 * 1024) throw new Error('Upload limit is 64 MiB; image files have a 20 MiB limit');
            const form = new FormData(); form.append('file', new Blob([bytes]), path.basename(args[0])); result = await request('/api/creative/assets', { method: 'POST', body: form }); break;
        }
        case 'export': result = projectExport(await request('/api/creative/workspace'), args[0], configuration().base); break;
        default: result = { usage: 'node integrations/cinqra.mjs <workspace|assets|upload FILE|export PROJECT_ID|director BRIEF|jobs|job ID|generate WORKFLOW_ID INPUT_JSON>', environment: ['CINQRA_URL (default http://127.0.0.1:3017)', 'CINQRA_ACCESS_USER and CINQRA_ACCESS_PASSWORD if workspace auth is enabled'], warning: 'generate and director may incur provider charges. Credentials are never included in exports.' };
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) { process.stderr.write(`${error instanceof Error ? error.message : 'CINQRA request failed'}\n`); process.exitCode = 1; }
