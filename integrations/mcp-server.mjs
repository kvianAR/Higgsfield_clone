#!/usr/bin/env node
import readline from 'node:readline';
import { request } from './client.mjs';
const tools = [
    { name: 'cinqra_workspace', description: 'Read shared CINQRA projects, reusable elements, storyboard shots and workspace community posts.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
    { name: 'cinqra_assets', description: 'List media assets in the CINQRA workspace.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
    { name: 'cinqra_director', description: 'Ask the configured text AI to draft a prompt or storyboard. May incur provider charges. Never generates images/video automatically.', inputSchema: { type: 'object', properties: { brief: { type: 'string' }, mode: { type: 'string', enum: ['prompt', 'storyboard'] } }, required: ['brief'], additionalProperties: false } },
    { name: 'cinqra_jobs', description: 'Read creative jobs, or refresh one submitted provider job.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, additionalProperties: false } },
    { name: 'cinqra_generate', description: 'Submit a paid generation to a documented CINQRA workflow. Obtain user approval for the specific input and provider charge before invoking.', inputSchema: { type: 'object', properties: { workflowId: { type: 'string' }, input: { type: 'object' }, clientRequestId: { type: 'string' } }, required: ['workflowId', 'input', 'clientRequestId'], additionalProperties: false } },
];
let initialized = false;
const output = value => process.stdout.write(`${JSON.stringify(value)}\n`);
async function dispatch(message) {
    const id = message?.id;
    if (message?.jsonrpc !== '2.0' || typeof message.method !== 'string') { output({ jsonrpc: '2.0', id: id ?? null, error: { code: -32600, message: 'Invalid Request' } }); return; }
    if (message.method.startsWith('notifications/')) return;
    if (id === undefined) return;
    try {
        let result;
        if (message.method === 'initialize') { initialized = true; result = { protocolVersion: '2024-11-05', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'cinqra', version: '0.1.0' } }; }
        else if (message.method === 'ping') result = {};
        else if (!initialized) throw new Error('Initialize the MCP session first');
        else if (message.method === 'tools/list') result = { tools };
        else if (message.method === 'tools/call') {
            const { name, arguments: args = {} } = message.params ?? {}; const tool = tools.find(tool => tool.name === name);
            if (!tool || !args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Unknown tool or invalid arguments');
            if (Object.keys(args).some(key => !Object.hasOwn(tool.inputSchema.properties,key))) throw new Error('Unknown tool argument');
            let value;
            if (name === 'cinqra_workspace') value = await request('/api/creative/workspace');
            else if (name === 'cinqra_assets') value = await request('/api/creative/assets');
            else if (name === 'cinqra_jobs') { if (args.id !== undefined && typeof args.id !== 'string') throw new Error('id must be a string'); value = await request(`/api/creative/jobs${args.id ? `?id=${encodeURIComponent(args.id)}` : ''}`); }
            else if (name === 'cinqra_director') { if (typeof args.brief !== 'string' || args.brief.length > 12_000 || !['prompt','storyboard'].includes(args.mode ?? 'prompt')) throw new Error('Invalid director input'); value = await request('/api/creative/director', { method: 'POST', body: JSON.stringify({ ...args, mode: args.mode ?? 'prompt' }) }); }
            else { if (typeof args.workflowId !== 'string' || typeof args.clientRequestId !== 'string' || !args.input || typeof args.input !== 'object' || Array.isArray(args.input)) throw new Error('Invalid generation input'); value = await request('/api/creative/jobs', { method: 'POST', body: JSON.stringify(args) }); }
            result = { content: [{ type: 'text', text: JSON.stringify(value) }] };
        } else { output({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } }); return; }
        output({ jsonrpc: '2.0', id, result });
    } catch (error) { const text = error instanceof Error ? error.message : 'CINQRA request failed'; if (message.method === 'tools/call') output({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: true } }); else output({ jsonrpc: '2.0', id, error: { code: -32602, message: text } }); }
}
// MCP stdio uses one UTF-8 JSON-RPC message per line; stdout contains protocol only.
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let chain = Promise.resolve();
lines.on('line', line => { if (Buffer.byteLength(line) > 1_000_000) { output({ jsonrpc:'2.0',id:null,error:{code:-32600,message:'Message too large'} }); return; } try { const message = JSON.parse(line); chain = chain.then(() => dispatch(message)); } catch { output({ jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'} }); } });
