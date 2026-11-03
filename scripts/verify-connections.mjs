import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, stat, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { canEditConnections, connectionState, saveConnection, validateConnection } from "../src/lib/connections.mjs";

test("connection status exposes configuration booleans, not credentials", () => {
    const state = connectionState({ GEMINI_API_KEY: "test-secret-123", FREEPIK_API_KEY: " " });
    assert.equal(state.providers.find((item) => item.id === "google-ai-studio").configured, true);
    assert.equal(state.providers.find((item) => item.id === "freepik").configured, false);
    assert.equal(JSON.stringify(state).includes("test-secret"), false);
});

test("connection editing stays local and nonproduction", () => {
    assert.equal(canEditConnections("http://127.0.0.1:3000/api/connections", { NODE_ENV: "development" }), true);
    assert.equal(canEditConnections("http://localhost:3000/api/connections", { NODE_ENV: "production" }), false);
    assert.equal(canEditConnections("https://example.com/api/connections", { NODE_ENV: "development" }), false);
});

test("connection validation rejects environment injection and unsupported providers", () => {
    for (const input of [{ provider: "__proto__", key: "test-key-123" }, { provider: "freepik", key: "test-key\nOTHER=oops" },
        { provider: "freepik", key: "${OTHER_KEY}" }, { provider: "freepik", key: "" }]) {
        assert.throws(() => validateConnection(input), /ERR_INVALID_CONNECTION/);
    }
});

test("atomic local key saves preserve other settings and serialize writes", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "cinqra-connections-"));
    const env = {};
    try {
        await writeFile(path.join(directory, ".env.local"), "# keep comment\nOTHER_SETTING=keep\nFREEPIK_API_KEY=old-key\nexport FREEPIK_API_KEY=duplicate-key\n");
        await Promise.all([
            saveConnection({ provider: "freepik", key: "test-freepik-123" }, directory, env),
            saveConnection({ provider: "google-ai-studio", key: "test-gemini-456" }, directory, env),
        ]);
        const filename = path.join(directory, ".env.local");
        const text = await readFile(filename, "utf8");
        assert.match(text, /# keep comment\nOTHER_SETTING=keep/);
        assert.equal(text.match(/FREEPIK_API_KEY=/g).length, 1);
        assert.match(text, /GEMINI_API_KEY=test-gemini-456/);
        assert.equal((await stat(filename)).mode & 0o777, 0o600);
        assert.equal(env.FREEPIK_API_KEY, "test-freepik-123");
        assert.equal(env.GEMINI_API_KEY, "test-gemini-456");
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test("local key saves refuse symlinked credential files", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "cinqra-connections-"));
    try {
        const target = path.join(directory, "untouched");
        await writeFile(target, "leave-this-alone");
        await symlink(target, path.join(directory, ".env.local"));
        await assert.rejects(saveConnection({ provider: "freepik", key: "test-freepik-123" }, directory, {}), /ERR_CONNECTION_STORAGE/);
        assert.equal(await readFile(target, "utf8"), "leave-this-alone");
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Higgsfield requires both credentials and saves the pair without exposing it', async () => {
    for (const input of [{ provider: 'higgsfield', key: 'synthetic-key' }, { provider: 'higgsfield', key: 'synthetic-key', secret: 'bad\nENV=value' }]) assert.throws(() => validateConnection(input), /ERR_INVALID_CONNECTION/);
    assert.equal(connectionState({ HF_API_KEY_ID: 'synthetic-key' }).providers.find(item => item.id === 'higgsfield').configured, false);
    const directory = await mkdtemp(path.join(os.tmpdir(), 'cinqra-higgsfield-'));
    const env = {};
    try {
        const result = await saveConnection({ provider: 'higgsfield', key: 'synthetic-key', secret: 'synthetic-secret' }, directory, env);
        assert.equal(result.providers.find(item => item.id === 'higgsfield').configured, true);
        assert.equal(JSON.stringify(result).includes('synthetic'), false);
        assert.equal(env.HF_API_KEY_ID, 'synthetic-key');
        assert.equal(env.HF_API_KEY_SECRET, 'synthetic-secret');
        const value = await readFile(path.join(directory, '.env.local'), 'utf8');
        assert.match(value, /HF_API_KEY_ID=synthetic-key/);
        assert.match(value, /HF_API_KEY_SECRET=synthetic-secret/);
        assert.equal((await stat(path.join(directory, '.env.local'))).mode & 0o777, 0o600);
    } finally { await rm(directory, { recursive: true, force: true }); }
});
