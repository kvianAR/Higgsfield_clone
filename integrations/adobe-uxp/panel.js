/* Adobe UXP panel: credentials remain in input memory and are never persisted. */
/* eslint-disable @typescript-eslint/no-require-imports -- Adobe UXP exposes host modules through require(). */
const { storage } = require('uxp');
const { app, core } = require('photoshop');
let assets = [];
const element = id => document.getElementById(id);
const status = text => { element('status').textContent = text; };
function configuration() {
    const origin = element('origin').value.replace(/\/$/, '');
    if (!['http://127.0.0.1:3017', 'http://localhost:3017'].includes(origin)) throw new Error('Use the local CINQRA address on port 3017.');
    const username = element('user').value; const password = element('password').value;
    if (Boolean(username) !== Boolean(password)) throw new Error('Provide both access user and password.');
    return { origin, headers: username ? { Authorization: `Basic ${btoa(`${username}:${password}`)}` } : {} };
}
async function get(url) { const { origin, headers } = configuration(); const response = await fetch(`${origin}${url}`, { headers }); if (!response.ok) throw new Error(`CINQRA returned HTTP ${response.status}. Check the app and workspace credentials.`); return response; }
element('refresh').addEventListener('click', async () => {
    try { status('Loading…'); assets = (await (await get('/api/creative/assets')).json()).assets.filter(asset => asset.mimeType.startsWith('image/')); const list = element('assets'); while (list.firstChild) list.removeChild(list.firstChild); assets.forEach(asset => { const option = document.createElement('option'); option.value = asset.id; option.textContent = asset.name; list.appendChild(option); }); status(`${assets.length} images available. No files sent to Adobe cloud.`); } catch (error) { status(error.message); }
});
element('open').addEventListener('click', async () => {
    try {
        const asset = assets.find(asset => asset.id === element('assets').value); if (!asset) throw new Error('Select an image first.');
        if (!/^\/api\/creative\/assets\/[A-Za-z0-9_-]+$/.test(asset.url)) throw new Error('Invalid asset path.');
        status('Opening image…'); const bytes = await (await get(asset.url)).arrayBuffer();
        const extensions = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' };
        if (!extensions[asset.mimeType]) throw new Error('Unsupported Photoshop import format.');
        const folder = await storage.localFileSystem.getTemporaryFolder(); const file = await folder.createFile(`cinqra-${asset.id}${extensions[asset.mimeType]}`, { overwrite: true });
        await file.write(bytes, { format: storage.formats.binary });
        await core.executeAsModal(async () => { await app.open(file); }, { commandName: 'Open CINQRA image' });
        status('Opened in Photoshop. Save your edited document normally.');
    } catch (error) { status(error.message); }
});
