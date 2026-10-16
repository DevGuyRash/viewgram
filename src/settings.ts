import { PluginSettingTab, type Setting, type App, type Plugin, type SettingDefinitionItem } from 'obsidian';
import { DEFAULT_SETTINGS, type ViewerSettings } from './viewer/settings';

export interface SettingsOwner {
  settings: ViewerSettings;
  updateSettings(changes: Partial<ViewerSettings>): Promise<void>;
}
interface SettingGroupDefinition {
  type: 'group';
  heading: string;
  items: { name: string; desc: string; render: (setting: Setting) => void }[];
}
export class ViewgramSettingTab extends PluginSettingTab {
  constructor(app: App, plugin: Plugin, private readonly owner: SettingsOwner) { super(app, plugin); }
  getSettingDefinitions(): SettingDefinitionItem[] { return this.groups(); }
  private groups(): SettingGroupDefinition[] {
    return [
      { type: 'group', heading: 'Diagram view', items: [
        { name: 'Background', desc: 'Choose a plain canvas, grid, or dots.', render: setting => { setting.addDropdown(control => control
          .addOptions({ none: 'None', grid: 'Grid', dots: 'Dots' }).setValue(this.owner.settings.background)
          .onChange(async value => { await this.owner.updateSettings({ background: value === 'grid' || value === 'dots' ? value : 'none' }); })); } },
        this.slider('Background spacing', 'Spacing between grid lines or dots, in pixels.', 'backgroundSpacing', 8, 48, 2),
        { name: 'Initial fit', desc: 'Fit chart shows the entire diagram. Fit width keeps tall diagrams larger.', render: setting => { setting.addDropdown(control => control
          .addOptions({ contain: 'Fit chart', width: 'Fit width' }).setValue(this.owner.settings.initialFit)
          .onChange(async value => { await this.owner.updateSettings({ initialFit: value === 'width' ? 'width' : 'contain' }); })); } },
        this.slider('Zoom step', 'Percentage points used by the zoom buttons and plus/minus keys. Shift uses a larger step.', 'zoomStep', 5, 50, 5),
        { name: 'Show interaction hint', desc: 'Show the short pan and zoom hint below the diagram. Keyboard help stays available to screen readers.', render: setting => { setting.addToggle(control => control
          .setValue(this.owner.settings.showHints).onChange(async value => { await this.owner.updateSettings({ showHints: value }); })); } },
      ] },
      { type: 'group', heading: 'Diagram elements', items: [
        { name: 'Highlight related elements', desc: 'Emphasize the hovered element and its relationships. Element editing stays available when disabled.', render: setting => { setting.addToggle(control => control
          .setValue(this.owner.settings.hoverHighlighting).onChange(async value => { await this.owner.updateSettings({ hoverHighlighting: value }); })); } },
        this.slider('Line hover area', 'Invisible area around relationship lines, in pixels. The rendered line keeps its native appearance.', 'lineHitWidth', 6, 30, 2),
        { name: 'Restore defaults', desc: 'Restore viewer preferences for open and future diagrams.', render: setting => { setting.addButton(control => control.setButtonText('Restore defaults').onClick(async () => {
          const saved = this.owner.updateSettings({ ...DEFAULT_SETTINGS });
          this.update();
          await saved;
        })); } },
      ] },
    ];
  }
  private slider(name: string, desc: string, key: 'backgroundSpacing' | 'zoomStep' | 'lineHitWidth', min: number, max: number, step: number): SettingGroupDefinition['items'][number] {
    return { name, desc, render: setting => { setting.addSlider(control => {
      control.setLimits(min, max, step).setValue(this.owner.settings[key]);
      // Keep the native slider title aligned with its current value.
      control.sliderEl.title = String(this.owner.settings[key]);
      control.onChange(async value => { control.sliderEl.title = String(value); await this.owner.updateSettings({ [key]: value }); });
    }); } };
  }
}
