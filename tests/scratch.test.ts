import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const script = resolve('scripts/prepare-scratch.mjs');
const pluginId = 'devguyrash-mermaid-viewer';
const identity = { id: pluginId, name: 'Mermaid Viewer', author: 'DevGuyRash', version: '0.1.0' };
const artifacts = { 'main.js': '// Synthetic test artifact; never executed.\n', 'styles.css': '/* Synthetic test artifact. */\n' };

async function fixture(t: TestContext) {
  const root = await mkdtemp('/tmp/mermaid-viewer-id-');
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = join(root, 'project');
  await mkdir(join(project, 'dist'), { recursive: true });
  await mkdir(join(project, 'fixtures'));
  for (const [name, bytes] of Object.entries(artifacts)) await writeFile(join(project, 'dist', name), bytes);
  for (const name of ['wide-flowchart', 'tall-flowchart', 'branching-flowchart', 'sequence']) await writeFile(join(project, 'fixtures', `${name}.mmd`), 'flowchart LR\nA-->B\n');
  await writeFile(join(project, 'fixtures', 'taxonomy.json'), JSON.stringify({ fixtures: [] }));
  const manifests = async (source: Record<string, unknown> = identity, built: Record<string, unknown> = source) => {
    await writeFile(join(project, 'manifest.json'), JSON.stringify(source));
    await writeFile(join(project, 'dist', 'manifest.json'), JSON.stringify(built));
  };
  await manifests();
  const stage = (target: string) => run(process.execPath, [script, target], { cwd: project, encoding: 'utf8', timeout: 10_000 });
  return { root, project, manifests, stage };
}

const absent = (path: string) => assert.rejects(access(path), { code: 'ENOENT' });

test('scratch staging copies only the new-ID artifacts without enabling or migrating a plugin', async t => {
  const { root, project, stage } = await fixture(t), target = join(root, 'new-scratch');
  await stage(target);
  const plugins = join(target, '.obsidian', 'plugins'), installed = join(plugins, pluginId);
  assert.deepEqual(await readdir(plugins), [pluginId]);
  assert.deepEqual((await readdir(installed)).sort(), ['main.js', 'manifest.json', 'styles.css']);
  for (const name of ['main.js', 'manifest.json', 'styles.css']) assert.deepEqual(await readFile(join(installed, name)), await readFile(join(project, 'dist', name)));
  await absent(join(plugins, 'mermaid-viewer'));
  await absent(join(installed, 'data.json'));
  await absent(join(target, '.obsidian', 'community-plugins.json'));
  assert.match(await readFile(join(target, 'SCRATCH-ONLY.txt'), 'utf8'), /not enabled/);
});

test('scratch staging refuses stale built identity before creating any target', async t => {
  const { root, manifests, stage } = await fixture(t);
  for (const [field, value] of Object.entries({ id: 'mermaid-viewer', name: 'Another Viewer', author: 'Another Author', version: '0.0.9' })) {
    await manifests(identity, { ...identity, [field]: value });
    const target = join(root, `stale-${field}`);
    await assert.rejects(stage(target), /Built plugin identity does not match/);
    await absent(target);
  }
});

test('scratch staging refuses unsafe plugin IDs even when source and build agree', async t => {
  const { root, manifests, stage } = await fixture(t);
  for (const [index, id] of ['../escape', '/absolute', 'nested/path', 'nested\\path', '', null, 42].entries()) {
    await manifests({ ...identity, id });
    const target = join(root, `unsafe-${index}`);
    await assert.rejects(stage(target), /unsafe plugin ID/);
    await absent(target);
  }
  await absent(join(root, 'escape'));
});

test('scratch staging refuses existing and nested vault targets without modifying sentinel data', async t => {
  const { root, stage } = await fixture(t);
  for (const kind of ['existing', 'nested']) {
    const vault = join(root, `${kind}-vault`), oldPlugin = join(vault, '.obsidian', 'plugins', 'mermaid-viewer');
    await mkdir(oldPlugin, { recursive: true });
    const data = join(oldPlugin, 'data.json'), enabled = join(vault, '.obsidian', 'community-plugins.json'), sentinel = join(vault, 'sentinel.txt');
    await writeFile(data, '{"syntheticLegacy":true}\n');
    await writeFile(enabled, '["mermaid-viewer"]\n');
    await writeFile(sentinel, 'Synthetic vault: leave unchanged.\n');
    const before = await Promise.all([data, enabled, sentinel].map(path => readFile(path)));
    const target = kind === 'existing' ? vault : join(vault, 'new-scratch');
    await assert.rejects(stage(target), kind === 'existing' ? /Target already exists/ : /inside an existing Obsidian vault/);
    for (const [index, path] of [data, enabled, sentinel].entries()) assert.deepEqual(await readFile(path), before[index]);
    assert.deepEqual(await readdir(join(vault, '.obsidian', 'plugins')), ['mermaid-viewer']);
    if (kind === 'nested') await absent(target);
  }
});

test('scratch staging refuses symlink aliases into an existing vault, including missing intermediate parents', async t => {
  const { root, stage } = await fixture(t), vault = join(root, 'aliased-vault'), subdir = join(vault, 'subdir'), alias = join(root, 'alias');
  const oldPlugin = join(vault, '.obsidian', 'plugins', 'mermaid-viewer');
  await mkdir(oldPlugin, { recursive: true });
  await mkdir(subdir);
  const data = join(oldPlugin, 'data.json'), enabled = join(vault, '.obsidian', 'community-plugins.json');
  await writeFile(data, '{"syntheticLegacy":true}\n');
  await writeFile(enabled, '["mermaid-viewer"]\n');
  const before = await Promise.all([data, enabled].map(path => readFile(path)));
  await symlink(subdir, alias, 'dir');
  for (const suffix of ['new-scratch', 'missing/new-scratch']) {
    const target = join(alias, suffix);
    await assert.rejects(stage(target), /inside an existing Obsidian vault/);
    await absent(target);
    await absent(join(subdir, suffix));
  }
  await absent(join(subdir, 'missing'));
  for (const [index, path] of [data, enabled].entries()) assert.deepEqual(await readFile(path), before[index]);
  assert.deepEqual(await readdir(join(vault, '.obsidian', 'plugins')), ['mermaid-viewer']);
});
