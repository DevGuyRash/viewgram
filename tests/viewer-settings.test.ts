import { test, before, beforeEach, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import type MermaidViewer from '../src/main';
import type { MermaidViewerSettingTab } from '../src/settings';

type SavedData = Record<string, unknown>;
type SyntheticPlugin = MermaidViewer & {
  settingTabs: MermaidViewerSettingTab[];
  editorExtensions: unknown[];
  postProcessors: unknown[];
  settingsContainer?: HTMLElement;
};
interface SettingControl {
  name: string;
  value?: unknown;
  change?: (value: unknown) => Promise<void>;
  click?: () => Promise<void>;
}
let api: {
  MermaidViewer: new () => SyntheticPlugin;
  notices: string[];
  controls(container: HTMLElement): SettingControl[];
  clearControls(container: HTMLElement): void;
};

// Bundle the production plugin against the same bounded public-API seam used by
// source-bridge.test.ts. No vault, editor, or real Obsidian settings are involved.
before(async () => {
  const compiled = await build({ stdin: {
    contents: 'export {default as MermaidViewer} from "./src/main"; export {notices, controls, clearControls} from "obsidian";',
    resolveDir: process.cwd(),
  }, bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'synthetic-obsidian', setup(builder) {
    builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'synthetic' }));
    builder.onLoad({ filter: /.*/, namespace: 'synthetic' }, () => ({ contents: `
      export const notices = [];
      export class Notice { constructor(message) { notices.push(message); } }
      export function normalizePath(path) { return path.split('/').filter(Boolean).join('/'); }
      export class Plugin {
        constructor() {
          this.manifest = { id: 'devguyrash-mermaid-viewer', dir: '.fixture-config/plugins/mermaid-viewer' };
          this.app = { workspace: { openLinkText() {} }, vault: { adapter: {} } };
          this.settingTabs = []; this.editorExtensions = []; this.postProcessors = [];
        }
        async loadData() { return null; }
        async saveData() {}
        addSettingTab(tab) { this.settingTabs.push(tab); }
        registerEditorExtension(extension) { this.editorExtensions.push(extension); }
        registerMarkdownPostProcessor(processor) { this.postProcessors.push(processor); }
      }
      export class PluginSettingTab {
        constructor(app, plugin) { this.app = app; this.plugin = plugin; this.containerEl = plugin.settingsContainer; }
      }
      const records = new WeakMap();
      export function controls(container) { return records.get(container) || []; }
      export function clearControls(container) { records.delete(container); }
      export class Setting {
        constructor(container) { this.container = container; }
        setName(name) { this.name = name; return this; }
        setDesc() { return this; }
        addControl(configure) {
          const record = { name: this.name };
          const entries = controls(this.container); entries.push(record); records.set(this.container, entries);
          const control = {
            addOptions() { return this; }, setLimits() { return this; }, setDynamicTooltip() { return this; },
            setButtonText() { return this; }, setValue(value) { record.value = value; return this; },
            onChange(callback) { record.change = callback; return this; },
            onClick(callback) { record.click = callback; return this; },
          };
          configure(control); return this;
        }
        addDropdown(configure) { return this.addControl(configure); }
        addSlider(configure) { return this.addControl(configure); }
        addToggle(configure) { return this.addControl(configure); }
        addButton(configure) { return this.addControl(configure); }
      }
      export class MarkdownRenderChild { constructor(containerEl) { this.containerEl = containerEl; } }
      export class TFile { constructor(path) { this.path = path; } }
      export const editorInfoField = Symbol('editorInfo');
      export const editorLivePreviewField = Symbol('editorLivePreview');
      export async function loadMermaid() { return { parse: async () => true }; }
    ` }));
  } }] });
  api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0]!.text).toString('base64')}`);
});
beforeEach(() => { api.notices.length = 0; });

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(complete => { resolve = complete; });
  return { promise, resolve };
}
function record(value: unknown): SavedData {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value));
  return structuredClone(value as SavedData);
}
function harness(t: TestContext, initial?: SavedData | null) {
  const plugin = new api.MermaidViewer(), writes: SavedData[] = [];
  const settingsPath = '.fixture-config/plugins/mermaid-viewer/data.json';
  // undefined means no file; null is an existing file containing JSON null.
  let persisted: SavedData | null | undefined = initial == null ? initial : record(initial), reads = 0;
  let read: (call: number) => unknown | Promise<unknown> = () => persisted == null ? null : record(persisted);
  let save: (data: SavedData, call: number) => void | Promise<void> = () => {};
  plugin.app.vault.adapter.exists = async path => { assert.equal(path, settingsPath); return persisted !== undefined; };
  plugin.app.vault.adapter.read = async path => {
    assert.equal(path, settingsPath);
    if (persisted === undefined) throw new Error('Synthetic settings file does not exist.');
    return JSON.stringify(persisted);
  };
  plugin.loadData = () => { reads++; return Promise.resolve(read(reads)); };
  plugin.saveData = value => {
    const data = record(value); writes.push(data);
    // Keep the call before Promise.resolve: this boundary can throw synchronously.
    const outcome = save(data, writes.length);
    return Promise.resolve(outcome).then(() => { persisted = record(data); });
  };
  t.after(() => { plugin.onunload(); });
  return {
    plugin, writes, get reads() { return reads; }, get persisted() { return persisted == null ? persisted : record(persisted); },
    setRead(next: typeof read) { read = next; }, setSave(next: typeof save) { save = next; },
  };
}
function registrations(plugin: SyntheticPlugin): number[] {
  return [plugin.settingTabs.length, plugin.editorExtensions.length, plugin.postProcessors.length];
}
function panel(t: TestContext, plugin: SyntheticPlugin) {
  const win = new Window(), container = win.document.createElement('div') as unknown as HTMLElement;
  let displays = 0;
  Object.assign(container, { empty() { displays++; api.clearControls(container); container.replaceChildren(); } });
  plugin.settingsContainer = container;
  t.after(async () => { await win.happyDOM.abort(); });
  return {
    get displays() { return displays; },
    control(name: string) { const control = api.controls(container).find(item => item.name === name); assert.ok(control, `Missing setting: ${name}`); return control; },
  };
}

test('startup reads preferences and registers once without writing defaults', async t => {
  const x = harness(t, { background: 'grid', backgroundSpacing: 30, zoomStep: 80 });
  await x.plugin.onload();
  assert.equal(x.plugin.isActive, true); assert.deepEqual(registrations(x.plugin), [1, 1, 1]);
  assert.equal(x.plugin.settings.background, 'grid'); assert.equal(x.plugin.settings.backgroundSpacing, 30);
  assert.equal(x.plugin.settings.zoomStep, 50); assert.equal(x.reads, 1); assert.deepEqual(x.writes, []);
  assert.deepEqual(x.persisted, { background: 'grid', backgroundSpacing: 30, zoomStep: 80 });
});

test('changing only hints preserves unknown keys and untouched invalid or future known values', async t => {
  const initial = { zoomStep: 80, background: 'future-canvas', initialFit: 'future-fit', lineHitWidth: 'future-width', unknownPreference: { version: 2, enabled: true } };
  const x = harness(t, initial); await x.plugin.onload();
  assert.equal(x.plugin.settings.zoomStep, 50); assert.equal(x.plugin.settings.background, 'none'); assert.equal(x.plugin.settings.lineHitWidth, 12);
  await x.plugin.updateSettings({ showHints: false });
  assert.deepEqual(x.writes, [{ ...initial, showHints: false }]);
  assert.deepEqual(x.persisted, { ...initial, showHints: false }); assert.equal(x.reads, 1);
});

test('failed initial and retry reads block writes until recovery merges only requested preferences', { timeout: 5_000 }, async t => {
  const errors = t.mock.method(console, 'error', () => {});
  const initial = { zoomStep: 80, backgroundSpacing: 34, initialFit: 'future-fit', showHints: true, unknownPreference: { preserve: 'yes' } };
  const x = harness(t, initial), retryStarted = deferred<void>(), recovered = deferred<SavedData>();
  x.setRead(call => {
    if (call < 3) throw new Error('Synthetic settings read failed');
    retryStarted.resolve(undefined); return recovered.promise;
  });
  await x.plugin.onload(); assert.equal(x.plugin.isActive, true); assert.deepEqual(x.writes, []);
  await x.plugin.updateSettings({ showHints: false }); assert.equal(x.reads, 2); assert.deepEqual(x.writes, []);
  const saving = x.plugin.updateSettings({ background: 'grid' }); await retryStarted.promise;
  const firstSlider = x.plugin.updateSettings({ zoomStep: 25 }), lastSlider = x.plugin.updateSettings({ zoomStep: 30 });
  assert.equal(x.reads, 3); assert.deepEqual(x.writes, []); assert.equal(x.plugin.settings.zoomStep, 30);
  recovered.resolve(record(initial)); await Promise.all([saving, firstSlider, lastSlider]);
  const expected = { ...initial, showHints: false, background: 'grid', zoomStep: 30 };
  assert.deepEqual(x.writes, [expected]); assert.deepEqual(x.persisted, expected);
  assert.equal(x.plugin.settings.backgroundSpacing, 34); assert.equal(x.plugin.settings.initialFit, 'contain');
  assert.equal(errors.mock.callCount(), 2); assert.equal(api.notices.length, 2);
});

test('one active save coalesces a pending slider burst into one write with the last selected values', { timeout: 5_000 }, async t => {
  const initial = { zoomStep: 80, unknownPreference: 'keep' }, x = harness(t, initial);
  const started = deferred<void>(), release = deferred<void>(); let active = 0, maxActive = 0;
  x.setSave(async (_data, call) => {
    active++; maxActive = Math.max(maxActive, active);
    try { if (call === 1) { started.resolve(undefined); await release.promise; } }
    finally { active--; }
  });
  await x.plugin.onload(); const first = x.plugin.updateSettings({ backgroundSpacing: 20 }); await started.promise;
  const pending = [x.plugin.updateSettings({ backgroundSpacing: 22 }), x.plugin.updateSettings({ zoomStep: 10 }),
    x.plugin.updateSettings({ backgroundSpacing: 34 }), x.plugin.updateSettings({ zoomStep: 25 }), x.plugin.updateSettings({ showHints: false })];
  assert.equal(active, 1); assert.equal(x.writes.length, 1); assert.deepEqual(x.writes[0], { ...initial, backgroundSpacing: 20 });
  assert.equal(x.plugin.settings.backgroundSpacing, 34); assert.equal(x.plugin.settings.zoomStep, 25);
  release.resolve(undefined); await Promise.all([first, ...pending]);
  assert.equal(maxActive, 1); assert.equal(active, 0); assert.equal(x.writes.length, 2);
  assert.deepEqual(x.writes[1], { ...initial, backgroundSpacing: 34, zoomStep: 25, showHints: false });
  assert.deepEqual(x.persisted, x.writes[1]);
});

test('unload before the initial read settles prevents all registrations and subsequent writes', { timeout: 5_000 }, async t => {
  const x = harness(t), started = deferred<void>(), loaded = deferred<SavedData>();
  x.setRead(() => { started.resolve(undefined); return loaded.promise; });
  const loading = x.plugin.onload(); await started.promise;
  assert.deepEqual(registrations(x.plugin), [0, 0, 0]); const settings = { ...x.plugin.settings };
  x.plugin.onunload(); loaded.resolve({ background: 'grid', unknownPreference: true }); await loading;
  assert.equal(x.plugin.isActive, false); assert.deepEqual(registrations(x.plugin), [0, 0, 0]); assert.deepEqual(x.plugin.settings, settings);
  await x.plugin.updateSettings({ showHints: false });
  assert.equal(x.reads, 1); assert.deepEqual(x.writes, []); assert.deepEqual(x.plugin.settings, settings); assert.deepEqual(api.notices, []);
});

test('unload during a recovery read prevents a save and ignores late preference changes', { timeout: 5_000 }, async t => {
  const errors = t.mock.method(console, 'error', () => {}), x = harness(t);
  const started = deferred<void>(), loaded = deferred<SavedData>();
  x.setRead(call => { if (call === 1) throw new Error('Synthetic initial read failed'); started.resolve(undefined); return loaded.promise; });
  await x.plugin.onload(); const saving = x.plugin.updateSettings({ showHints: false }); await started.promise;
  const settings = { ...x.plugin.settings }, registered = registrations(x.plugin), notices = [...api.notices];
  assert.deepEqual(x.writes, []); x.plugin.onunload(); loaded.resolve({ zoomStep: 80, unknownPreference: true }); await saving;
  await x.plugin.updateSettings({ zoomStep: 25 });
  assert.equal(x.plugin.isActive, false); assert.equal(x.reads, 2); assert.deepEqual(x.writes, []);
  assert.deepEqual(x.plugin.settings, settings); assert.deepEqual(registrations(x.plugin), registered); assert.deepEqual(api.notices, notices);
  assert.equal(errors.mock.callCount(), 1);
});

test('a delayed native settings callback after unload starts no reads or writes', async t => {
  const x = harness(t, { zoomStep: 80 }), ui = panel(t, x.plugin); await x.plugin.onload();
  x.plugin.settingTabs[0]!.display(); const control = ui.control('Zoom step');
  assert.equal(control.value, 50); assert.ok(control.change); const delayed = control.change;
  const settings = { ...x.plugin.settings }, registered = registrations(x.plugin); x.plugin.onunload();
  await delayed(35);
  assert.equal(x.reads, 1); assert.deepEqual(x.writes, []); assert.deepEqual(x.plugin.settings, settings);
  assert.deepEqual(registrations(x.plugin), registered); assert.equal(ui.displays, 1);
});

test('unload lets an admitted write finish without starting its coalesced follow-up', { timeout: 5_000 }, async t => {
  const x = harness(t, { unknownPreference: 'keep' }), started = deferred<void>(), release = deferred<void>();
  x.setSave(() => { started.resolve(undefined); return release.promise; });
  await x.plugin.onload(); const first = x.plugin.updateSettings({ backgroundSpacing: 20 }); await started.promise;
  const pending = x.plugin.updateSettings({ backgroundSpacing: 38 }); assert.equal(x.writes.length, 1);
  x.plugin.onunload(); release.resolve(undefined); await Promise.all([first, pending]);
  await x.plugin.updateSettings({ zoomStep: 30 });
  assert.equal(x.plugin.isActive, false); assert.equal(x.reads, 1);
  assert.deepEqual(x.writes, [{ unknownPreference: 'keep', backgroundSpacing: 20 }]); assert.deepEqual(x.persisted, x.writes[0]);
});

test('a synchronous save failure releases the save queue and retries retained requested values', async t => {
  const errors = t.mock.method(console, 'error', () => {});
  const initial = { zoomStep: 80, unknownPreference: 'keep' }, x = harness(t, initial);
  x.setSave((_data, call) => { if (call === 1) throw new Error('Synthetic synchronous save failure'); });
  await x.plugin.onload(); await x.plugin.updateSettings({ showHints: false });
  assert.deepEqual(x.persisted, initial); assert.deepEqual(x.writes, [{ ...initial, showHints: false }]);
  await x.plugin.updateSettings({ background: 'dots' });
  assert.deepEqual(x.writes, [{ ...initial, showHints: false }, { ...initial, showHints: false, background: 'dots' }]);
  assert.deepEqual(x.persisted, { ...initial, showHints: false, background: 'dots' });
  assert.equal(x.reads, 2);
  assert.equal(errors.mock.callCount(), 1); assert.equal(api.notices.length, 1);
});

test('native Restore defaults renders before persistence and performs no late render after unload', { timeout: 5_000 }, async t => {
  const x = harness(t, { background: 'grid', zoomStep: 30, unknownPreference: 'keep' }), ui = panel(t, x.plugin);
  const started = deferred<void>(), release = deferred<void>(); x.setSave(() => { started.resolve(undefined); return release.promise; });
  await x.plugin.onload(); x.plugin.settingTabs[0]!.display(); assert.equal(ui.displays, 1);
  const restore = ui.control('Restore defaults'); assert.ok(restore.click); const clicked = restore.click();
  assert.equal(ui.displays, 2); assert.equal(ui.control('Background').value, 'none'); assert.equal(ui.control('Zoom step').value, 15);
  await started.promise; x.plugin.onunload(); release.resolve(undefined); await clicked;
  assert.equal(ui.displays, 2); assert.deepEqual(x.persisted, {
    background: 'none', backgroundSpacing: 18, initialFit: 'contain', zoomStep: 15,
    hoverHighlighting: true, lineHitWidth: 12, showHints: true, unknownPreference: 'keep',
  });
});
