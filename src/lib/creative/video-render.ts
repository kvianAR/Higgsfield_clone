export type VideoRenderSettings = { start: number; end: number; ratio: 'source' | '16:9' | '9:16' | '1:1';
    height: 360 | 480 | 720 | 1080; fit: 'contain' | 'cover'; freeze: number; volume: number };
export class VideoRenderError extends Error { constructor(public code: string, public status = 400) { super(code); } }
const number = (value: unknown, min: number, max: number) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new VideoRenderError('ERR_VIDEO_SETTINGS');
    return Math.round(value * 1000) / 1000;
};
export function parseVideoRenderSettings(value: unknown): VideoRenderSettings {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new VideoRenderError('ERR_VIDEO_SETTINGS');
    const input = value as Record<string, unknown>;
    const start = number(input.start, 0, 600), end = number(input.end, 0.05, 660);
    if (end <= start || end - start > 60) throw new VideoRenderError('ERR_VIDEO_DURATION');
    const freeze = number(input.freeze ?? 0, 0, 15);
    if (end - start + freeze > 75) throw new VideoRenderError('ERR_VIDEO_DURATION');
    if (!['source', '16:9', '9:16', '1:1'].includes(input.ratio as string) ||
        ![360, 480, 720, 1080].includes(input.height as number) || !['contain', 'cover'].includes(input.fit as string)) throw new VideoRenderError('ERR_VIDEO_SETTINGS');
    return { start, end, freeze, ratio: input.ratio as VideoRenderSettings['ratio'], height: input.height as VideoRenderSettings['height'],
        fit: input.fit as VideoRenderSettings['fit'], volume: number(input.volume ?? 1, 0, 2) };
}
/** All dynamic filter values are validated numbers/enums. Paths never enter filter syntax. */
export function videoRenderArgs(input: string, output: string, settings: VideoRenderSettings): string[] {
    const config = parseVideoRenderSettings(settings), duration = Math.round((config.end - config.start) * 1000) / 1000;
    const filters: string[] = [];
    if (config.ratio === 'source') filters.push(`scale=1920:${config.height}:force_original_aspect_ratio=decrease:force_divisible_by=2`);
    else {
        const [rw, rh] = config.ratio.split(':').map(Number), width = Math.round(config.height * rw / rh / 2) * 2;
        filters.push(`scale=${width}:${config.height}:force_original_aspect_ratio=${config.fit === 'cover' ? 'increase' : 'decrease'}`);
        filters.push(config.fit === 'cover' ? `crop=${width}:${config.height}` : `pad=${width}:${config.height}:(ow-iw)/2:(oh-ih)/2:color=black`);
    }
    filters.push('setsar=1');
    if (config.freeze) filters.push(`tpad=stop_mode=clone:stop_duration=${config.freeze}`);
    return ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-protocol_whitelist', 'file,pipe', '-max_alloc', '268435456',
        '-threads', '2', '-filter_threads', '1', '-ss', String(config.start), '-t', String(duration), '-i', input,
        '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn', '-vf', filters.join(','),
        '-af', `volume=${config.volume},apad=pad_dur=${config.freeze}`, '-t', String(duration + config.freeze),
        '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-fs', '67108864', output];
}
