import { constants } from "node:fs";
import { open, rename, unlink, chmod } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const CONNECTION_VARIABLES = Object.freeze({
    higgsfield: "HF_API_KEY_ID",
    freepik: "FREEPIK_API_KEY",
    "google-ai-studio": "GEMINI_API_KEY",
    "vercel-ai-gateway": "AI_GATEWAY_API_KEY",
});

export function connectionState(env = process.env) {
    const present = (name) => Boolean(env[name]?.trim());
    return {
        providers: [
            { id: "higgsfield", configured: present("HF_API_KEY_ID") && present("HF_API_KEY_SECRET") },
            { id: "freepik", configured: present("FREEPIK_API_KEY") },
            { id: "google-ai-studio", configured: present("GEMINI_API_KEY") || present("GOOGLE_AI_API_KEY") },
            { id: "vercel-ai-gateway", configured: present("AI_GATEWAY_API_KEY") },
            { id: "google-vertex", configured: present("GOOGLE_CLOUD_PROJECT") || present("GCLOUD_PROJECT") },
            { id: "toapis", configured: present("TOAPIS_API_KEY") },
        ],
    };
}

export function canEditConnections(requestUrl, env = process.env) {
    const hostname = new URL(requestUrl).hostname;
    return (env.NODE_ENV !== "production" || env.CINQRA_DESKTOP_LOCAL === "1") && ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}

export function validateConnection(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)
        || !Object.hasOwn(CONNECTION_VARIABLES, input.provider)
        || typeof input.key !== "string" || !/^[A-Za-z0-9._~+/=-]{8,512}$/.test(input.key)) {
        throw new Error("ERR_INVALID_CONNECTION");
    }
    if (input.provider === "higgsfield" && (typeof input.secret !== "string" || !/^[A-Za-z0-9._~+/=-]{8,512}$/.test(input.secret))) {
        throw new Error("ERR_INVALID_CONNECTION");
    }
    return { variable: CONNECTION_VARIABLES[input.provider], key: input.key, ...(input.provider === "higgsfield" ? { secret: input.secret } : {}) };
}

export function updateConnectionText(original, variable, key) {
    const lines = original.split(/\r?\n/);
    const pattern = new RegExp(`^\\s*(?:export\\s+)?${variable}\\s*=`);
    // Remove all prior assignments so a later duplicate cannot override the saved key.
    const retained = lines.filter((line) => !pattern.test(line));
    while (retained.at(-1) === "") retained.pop();
    return `${retained.length ? `${retained.join("\n")}\n` : ""}${variable}=${key}\n`;
}

let pending = Promise.resolve();

export function saveConnection(input, directory = process.env.CINQRA_SETTINGS_DIR || process.cwd(), env = process.env) {
    const validated = validateConnection(input);
    const operation = pending.catch(() => {}).then(async () => {
        const filename = path.join(directory, ".env.local");
        const temporary = path.join(directory, `.env.local.${randomUUID()}.tmp`);
        let original = "";
        try {
            // Refuse symlinks instead of following a local credential file elsewhere.
            const source = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
            try {
                const stat = await source.stat();
                if (!stat.isFile() || stat.size > 1_048_576) throw new Error("ERR_CONNECTION_STORAGE");
                original = await source.readFile("utf8");
            } finally { await source.close(); }
        } catch (error) { if (error?.code !== "ENOENT") throw new Error("ERR_CONNECTION_STORAGE"); }
        try {
            const target = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
            try {
                let updated = updateConnectionText(original, validated.variable, validated.key);
                if (validated.secret) updated = updateConnectionText(updated, "HF_API_KEY_SECRET", validated.secret);
                await target.writeFile(updated, "utf8");
                await target.sync();
            } finally { await target.close(); }
            await chmod(temporary, 0o600);
            await rename(temporary, filename);
            // Providers read environment keys at request time; no client-side copy is needed.
            env[validated.variable] = validated.key;
            if (validated.secret) env.HF_API_KEY_SECRET = validated.secret;
        } catch {
            await unlink(temporary).catch(() => {});
            throw new Error("ERR_CONNECTION_STORAGE");
        }
        return connectionState(env);
    });
    pending = operation;
    return operation;
}
