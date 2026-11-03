import { cp, mkdir, rm, readdir, copyFile, chmod, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distribution = path.join(root, 'dist');
const app = path.join(distribution, 'CINQRA.app');
function run(command, args) {
    const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`${command} failed`);
}
if (process.platform !== 'darwin') throw new Error('Build the Mac application on macOS.');
if (!process.argv.includes('--skip-build')) run('npm', ['run', 'build']);
await mkdir(distribution, { recursive: true });
await rm(app, { recursive: true, force: true });
const resources = path.join(app, 'Contents', 'Resources');
await mkdir(path.join(app, 'Contents', 'MacOS'), { recursive: true });
await mkdir(resources, { recursive: true });
await copyFile(path.join(root, 'desktop', 'Info.plist'), path.join(app, 'Contents', 'Info.plist'));
await copyFile(path.join(root, 'desktop', 'Cinqra.icns'), path.join(resources, 'Cinqra.icns'));
await cp(path.join(root, '.next', 'standalone'), path.join(resources, 'server'), { recursive: true, dereference: true });
await cp(path.join(root, '.next', 'static'), path.join(resources, 'server', '.next', 'static'), { recursive: true });
await cp(path.join(root, 'public'), path.join(resources, 'server', 'public'), { recursive: true });
await copyFile(process.execPath, path.join(resources, 'node'));
await chmod(path.join(resources, 'node'), 0o755);
await copyFile(path.join(root, 'desktop', 'bootstrap.cjs'), path.join(resources, 'bootstrap.cjs'));
const licenses = path.join(resources, 'Licenses');
await mkdir(licenses, { recursive: true });
await copyFile(path.join(root, 'LICENSE'), path.join(licenses, 'CINQRA-MIT.txt'));
for (const name of ['LICENSE', 'ffmpeg.LICENSE', 'ffmpeg.README']) {
    await copyFile(path.join(root, 'node_modules', 'ffmpeg-static', name), path.join(licenses, 'ffmpeg-' + name));
}
const nodeLicense = await fetch(`https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`);
if (!nodeLicense.ok) throw new Error('Could not retrieve the license for the bundled Node runtime.');
await writeFile(path.join(licenses, 'Node-LICENSE.txt'), await nodeLicense.text());
// Standalone tracing can copy build-machine settings. Packaged credentials belong in Application Support.
for (const entry of await readdir(path.join(resources, 'server'))) {
    if (entry.startsWith('.env') || entry.startsWith('.cinqra') || entry.startsWith('tasks_history')) {
        await rm(path.join(resources, 'server', entry), { recursive: true, force: true });
    }
}
run('swiftc', ['-parse-as-library', '-O', 'desktop/Cinqra.swift', '-o', path.join(app, 'Contents', 'MacOS', 'CINQRA')]);
run('codesign', ['--force', '--deep', '--sign', '-', app]);
run('codesign', ['--verify', '--deep', '--strict', app]);
const image = path.join(distribution, `CINQRA-${process.arch}.dmg`);
await rm(image, { force: true });
run('hdiutil', ['create', '-volname', 'CINQRA', '-srcfolder', app, '-ov', '-format', 'UDZO', image]);
console.log(`Packaged ${app}\nInstaller ${image}\nArchitecture ${process.arch}. Ad-hoc signed. Apple notarization requires an Apple Developer identity.`);
