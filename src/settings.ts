import { PluginSettingTab, Setting, type App, type Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, type ViewerSettings } from './viewer/settings';

export interface SettingsOwner {
  settings: ViewerSettings;
  updateSettings(changes: Partial<ViewerSettings>): Promise<void>;
}
export class ViewgramSettingTab extends PluginSettingTab {
  constructor(app: App, plugin: Plugin, private readonly owner: SettingsOwner) { super(app, plugin); }
  display(): void {
    this.containerEl.empty();
    this.heading('Diagram view');
    new Setting(this.containerEl).setName('Background').setDesc('Choose a plain canvas, grid, or dots.').addDropdown(control => control
      .addOptions({ none: 'None', grid: 'Grid', dots: 'Dots' }).setValue(this.owner.settings.background)
      .onChange(async value => { await this.owner.updateSettings({ background: value === 'grid' || value === 'dots' ? value : 'none' }); }));
    this.slider('Background spacing', 'Spacing between grid lines or dots, in pixels.', 'backgroundSpacing', 8, 48, 2);
    new Setting(this.containerEl).setName('Initial fit').setDesc('Fit chart shows the entire diagram. Fit width keeps tall diagrams larger.').addDropdown(control => control
      .addOptions({ contain: 'Fit chart', width: 'Fit width' }).setValue(this.owner.settings.initialFit)
      .onChange(async value => { await this.owner.updateSettings({ initialFit: value === 'width' ? 'width' : 'contain' }); }));
    this.slider('Zoom step', 'Percentage points used by the zoom buttons and plus/minus keys. Shift uses a larger step.', 'zoomStep', 5, 50, 5);
    new Setting(this.containerEl).setName('Show interaction hint').setDesc('Show the short pan and zoom hint below the diagram. Keyboard help stays available to screen readers.').addToggle(control => control
      .setValue(this.owner.settings.showHints).onChange(async value => { await this.owner.updateSettings({ showHints: value }); }));
    this.heading('Diagram elements');
    new Setting(this.containerEl).setName('Highlight related elements').setDesc('Emphasize the hovered element and its relationships. Element editing stays available when disabled.').addToggle(control => control
      .setValue(this.owner.settings.hoverHighlighting).onChange(async value => { await this.owner.updateSettings({ hoverHighlighting: value }); }));
    this.slider('Line hover area', 'Invisible area around relationship lines, in pixels. The rendered line keeps its native appearance.', 'lineHitWidth', 6, 30, 2);
    new Setting(this.containerEl).setName('Restore defaults').setDesc('Restore viewer preferences for open and future diagrams.').addButton(control => control.setButtonText('Restore defaults').onClick(async () => {
      const saved = this.owner.updateSettings({ ...DEFAULT_SETTINGS }); this.display(); await saved;
    }));
  }
  private heading(text: string): void {
    const heading = this.containerEl.ownerDocument.createElement('h3'); heading.textContent = text; this.containerEl.append(heading);
  }
  private slider(name: string, description: string, key: 'backgroundSpacing' | 'zoomStep' | 'lineHitWidth', min: number, max: number, step: number): void {
    new Setting(this.containerEl).setName(name).setDesc(description).addSlider(control => control
      .setLimits(min, max, step).setValue(this.owner.settings[key]).setDynamicTooltip()
      .onChange(async value => { await this.owner.updateSettings({ [key]: value }); }));
  }
}
