/** Offline copy of the author's former namespace; never enable or remove a plugin. */
import { lstat, readFile, readdir, mkdir, open, unlink } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const supplied = process.argv[2];
if (!supplied || process.argv.length !== 3 || !isAbsolute(supplied)) {
  throw new Error('Close Obsidian, then pass its absolute config directory (for example /path/to/vault/.obsidian).');
}
const config = resolve(supplied);
const plugins = join(config, 'plugins');
const legacy = join(plugins, 'devguyrash-mermaid-viewer');
const target = join(plugins, 'viewgram');

async function inspect(path) {
  try { return await lstat(path); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}
async function directory(path) {
  const info = await inspect(path);
  if (!info?.isDirectory() || info.isSymbolicLink()) throw new Error('Expected a real configuration/plugin directory; symlinks are refused.');
}
async function regularFile(path) {
  const info = await inspect(path);
  if (!info?.isFile() || info.isSymbolicLink()) throw new Error('Expected a regular plugin file; symlinks are refused.');
}
async function identity(path, id) {
  await regularFile(path);
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  if (manifest?.id !== id || manifest?.author !== 'DevGuyRash') {
    throw new Error('Plugin manifest does not identify the expected DevGuyRash namespace.');
  }
}
async function writeExclusive(path, data) {
  const file = await open(path, 'wx', 0o600);
  try { await file.writeFile(data); await file.sync(); }
  catch (error) { await file.close(); await unlink(path); throw error; }
  await file.close();
  if (!(await readFile(path)).equals(data)) throw new Error('Settings copy verification failed; the original remains intact.');
}

await directory(config);
await directory(plugins);
await directory(legacy);
await identity(join(legacy, 'manifest.json'), 'devguyrash-mermaid-viewer');
const sourceData = join(legacy, 'data.json');
if (!(await inspect(sourceData))) {
  console.log('The former DevGuyRash plugin has no saved settings; no migration is needed.');
} else {
  await regularFile(sourceData);
  const raw = await readFile(sourceData);
  const settings = JSON.parse(raw.toString('utf8'));
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Saved settings must be a JSON object.');
  const existingTarget = await inspect(target);
  if (existingTarget) {
    await directory(target);
    if (await inspect(join(target, 'data.json'))) throw new Error('Viewgram settings already exist; refusing to overwrite them.');
    if ((await readdir(target)).length) await identity(join(target, 'manifest.json'), 'viewgram');
  }
  const backupName = `data.before-viewgram-${randomUUID()}.json`;
  await writeExclusive(join(legacy, backupName), raw);
  // Obsidian must stay closed: refuse a source save observed during the copy.
  if (!(await readFile(sourceData)).equals(raw)) throw new Error('Source settings changed; backup retained, destination settings not written.');
  if (!existingTarget) await mkdir(target, { mode: 0o700 });
  await writeExclusive(join(target, 'data.json'), raw);
  console.log(`Settings copied byte-for-byte to Viewgram. Backup retained in the former plugin folder as ${backupName}.`);
  console.log('Original settings and enabled-plugin lists were left intact. Keep the former plugin disabled before enabling Viewgram.');
}
