/* eslint-disable @typescript-eslint/no-require-imports -- Next's standalone server uses a CommonJS entry point. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const storage = process.env.CINQRA_DATA_DIR || path.join(os.homedir(), 'Library', 'Application Support', 'CINQRA');
fs.mkdirSync(storage, { recursive: true, mode: 0o700 });
const settings = path.join(storage, '.env.local');
if (fs.existsSync(settings)) process.loadEnvFile(settings);
const port = process.env.CINQRA_PORT || '3017';
if (!/^\d{4,5}$/.test(port)) throw new Error('Invalid local port');
Object.assign(process.env, {
    NODE_ENV: 'production',
    CINQRA_DESKTOP_LOCAL: '1',
    CINQRA_SETTINGS_DIR: storage,
    OPEN_HIGGSFIELD_STORAGE_DIR: storage,
    APP_ORIGIN: 'http://127.0.0.1:' + port,
    HOSTNAME: '127.0.0.1',
    PORT: port,
    DEPLOYMENT_PROFILE: 'single-process',
    TASK_WORKER_MODE: 'local',
    ASSET_STORAGE_MODE: 'local',
    GENERATION_ENABLED: 'true',
});
require(path.join(__dirname, 'server', 'server.js'));
