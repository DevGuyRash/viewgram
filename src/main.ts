import { MarkdownRenderChild, Notice, Plugin, normalizePath, type MarkdownPostProcessorContext } from 'obsidian';
import { RenderScope } from './viewer/render-scope';
import { readingSource } from './editor/source-bridge';
import { livePreviewExtension } from './editor/live-preview';
import { SourceEditorSessions } from './viewer/source-editor-sessions';
import { DEFAULT_SETTINGS, readSettings, settingsRecord, type ViewerSettings } from './viewer/settings';
import { ViewgramSettingTab } from './settings';
import { setDomCreationPlatform } from './viewer/dom';
import { obsidianDomCreation } from './viewer/obsidian-dom';

setDomCreationPlatform(obsidianDomCreation);

class MermaidRenderChild extends MarkdownRenderChild {
  private scope?: RenderScope;
  constructor(el: HTMLElement, private readonly plugin: Viewgram, private readonly context: MarkdownPostProcessorContext) { super(el); }
  onload(): void {
    this.scope = new RenderScope(this.containerEl, (href, newLeaf) => {
      void this.plugin.app.workspace.openLinkText(href, this.context.sourcePath, newLeaf);
    }, svg => readingSource(this.plugin.app, this.context, this.containerEl, svg, () => this.plugin.isActive), this.plugin.editorSessions, () => this.plugin.settings);
    this.plugin.scopes.add(this.scope);
  }
  onunload(): void {
    if (!this.scope) return;
    this.scope.dispose(); this.plugin.scopes.delete(this.scope); this.scope = undefined;
  }
}
export default class Viewgram extends Plugin {
  // An active-instance registry for unload only. No cached source, SVG or viewport state.
  readonly scopes = new Set<RenderScope>();
  readonly editorSessions = new SourceEditorSessions();
  settings: ViewerSettings = { ...DEFAULT_SETTINGS };
  private storedData: Record<string, unknown> = {};
  private settingsLoaded = false;
  private pendingChanges?: Partial<ViewerSettings>;
  private saving?: Promise<void>;
  private lifecycle = 0;
  private active = false;
  get isActive(): boolean { return this.active; }
  async onload(): Promise<void> {
    const lifecycle = ++this.lifecycle;
    try {
      const data = await this.readStoredData();
      if (lifecycle !== this.lifecycle) return;
      this.storedData = data; this.settingsLoaded = true;
    }
    catch (error) {
      console.error('Viewgram could not read settings.', error);
      if (lifecycle === this.lifecycle) new Notice('Viewgram could not read saved preferences. Saving changes will retry the read first.');
    }
    if (lifecycle !== this.lifecycle) return;
    this.settings = readSettings(this.storedData);
    this.active = true;
    this.addSettingTab(new ViewgramSettingTab(this.app, this, this));
    this.registerEditorExtension(livePreviewExtension({
      isActive: () => this.active,
      openLink: (href, sourcePath, newLeaf) => { void this.app.workspace.openLinkText(href, sourcePath, newLeaf); },
      add: scope => this.scopes.add(scope),
      remove: scope => this.scopes.delete(scope),
      editorSessions: this.editorSessions,
      settings: () => this.settings,
    }));
    this.registerMarkdownPostProcessor((el, ctx) => {
      if (el.closest('.kmv-viewer, .kmv-dialog')) return;
      if (!el.matches('.mermaid, .block-language-mermaid, code.language-mermaid') && !el.querySelector('.mermaid, .block-language-mermaid, code.language-mermaid')) return;
      ctx.addChild(new MermaidRenderChild(el, this, ctx));
    }, 1000);
  }
  updateSettings(changes: Partial<ViewerSettings>): Promise<void> {
    if (!this.active) return Promise.resolve();
    this.settings = readSettings({ ...this.settings, ...changes });
    for (const scope of this.scopes) scope.updateSettings(this.settings);
    // Coalesce slider events to one pending change set while one save is in flight.
    this.pendingChanges = { ...this.pendingChanges, ...changes };
    if (!this.saving) this.saving = Promise.resolve().then(() => this.saveSettings());
    return this.saving;
  }
  private settingsPath(): string {
    const dir = this.manifest.dir;
    if (!dir) throw new Error('The viewer plugin directory is unavailable.');
    return normalizePath(`${dir}/data.json`);
  }
  private async readStoredData(): Promise<Record<string, unknown>> {
    const path = this.settingsPath();
    const data: unknown = await this.loadData();
    // Obsidian returns undefined after a read or JSON error, and null for a missing file.
    if (data === undefined) throw new Error('Saved viewer preferences could not be read.');
    if (data === null) {
      if (await this.app.vault.adapter.exists(path)) throw new Error('Saved viewer preferences are not an object.');
    } else if (typeof data !== 'object' || Array.isArray(data)) throw new Error('Saved viewer preferences are not an object.');
    return settingsRecord(data);
  }
  private async writeStoredData(data: Record<string, unknown>): Promise<void> {
    const path = this.settingsPath();
    await this.saveData(data);
    // saveData can resolve after a failed write; trust it only after reading the owned file.
    const saved: unknown = JSON.parse(await this.app.vault.adapter.read(path));
    if (JSON.stringify(saved) !== JSON.stringify(data)) throw new Error('Saved viewer preferences did not match the requested changes.');
  }
  private retainPendingChanges(changes: Partial<ViewerSettings>): void {
    this.pendingChanges = { ...changes, ...this.pendingChanges };
  }
  private async saveSettings(): Promise<void> {
    const lifecycle = this.lifecycle;
    try {
      while (this.pendingChanges && this.active && lifecycle === this.lifecycle) {
        if (!this.settingsLoaded) {
          try {
            const data = await this.readStoredData();
            if (!this.active || lifecycle !== this.lifecycle) return;
            this.storedData = data; this.settingsLoaded = true;
            this.settings = readSettings({ ...data, ...this.pendingChanges });
            for (const scope of this.scopes) scope.updateSettings(this.settings);
          } catch (error) {
            console.error('Viewgram refused to overwrite unread preferences.', error);
            if (this.active && lifecycle === this.lifecycle) new Notice('Viewgram could not read saved preferences. Your changes were not saved; try changing a preference again.');
            return;
          }
        }
        const changes = this.pendingChanges; this.pendingChanges = undefined;
        const data = { ...this.storedData };
        for (const [key, value] of Object.entries(this.settings)) if (Object.prototype.hasOwnProperty.call(changes, key)) data[key] = value;
        try {
          await this.writeStoredData(data);
          if (this.active && lifecycle === this.lifecycle) this.storedData = data;
        }
        catch (error) {
          console.error('Viewgram could not save settings.', error);
          if (this.active && lifecycle === this.lifecycle) {
            this.settingsLoaded = false;
            this.retainPendingChanges(changes);
            new Notice('Viewgram could not save preferences. Please try again.');
          }
          return;
        }
      }
    } finally { this.saving = undefined; }
  }
  onunload(): void { ++this.lifecycle; this.active = false; this.pendingChanges = undefined; this.editorSessions.dispose(); for (const scope of this.scopes) scope.dispose(); this.scopes.clear(); }
}
