// Mermaid is a development-only fixture generator, never part of dist/main.js.
import mermaid from 'mermaid';
import { EditorView } from '@codemirror/view';
import wide from '../fixtures/wide-flowchart.mmd';
import tall from '../fixtures/tall-flowchart.mmd';
import branching from '../fixtures/branching-flowchart.mmd';
import sequence from '../fixtures/sequence.mmd';
import { RenderScope } from '../src/viewer/render-scope';
import { DiagramViewer } from '../src/viewer/diagram';
import { SourceEditor } from '../src/viewer/source-editor';
import { SemanticHighlighter } from '../src/viewer/semantics';
import { SourceEditorSessions } from '../src/viewer/source-editor-sessions';
import type { DiagramSource } from '../src/viewer/source';
import { waitForViewportReady } from '../src/viewer/readiness';
import { createHtmlElement, setDomCreationPlatform } from '../src/viewer/dom';
import { DEFAULT_SETTINGS, readSettings, type ViewerSettings } from '../src/viewer/settings';
import { browserDomCreation } from './browser-dom.mjs';

setDomCreationPlatform(browserDomCreation);

const scopes: RenderScope[] = [];
let viewerSettings = { ...DEFAULT_SETTINGS };
function setSettings(changes: Partial<ViewerSettings>): void {
  viewerSettings = readSettings({ ...viewerSettings, ...changes });
  for (const scope of scopes) scope.updateSettings(viewerSettings);
  for (const key of ['background', 'backgroundSpacing', 'initialFit', 'zoomStep', 'hoverHighlighting', 'lineHitWidth', 'showHints'] as const) {
    const control = document.querySelector<HTMLInputElement | HTMLSelectElement>(`#setting-${key}`);
    if (!control) continue;
    if (control instanceof HTMLInputElement && control.type === 'checkbox') control.checked = Boolean(viewerSettings[key]);
    else control.value = String(viewerSettings[key]);
  }
}
for (const key of ['background', 'backgroundSpacing', 'initialFit', 'zoomStep', 'hoverHighlighting', 'lineHitWidth', 'showHints'] as const) {
  const control = document.querySelector<HTMLInputElement | HTMLSelectElement>(`#setting-${key}`);
  control?.addEventListener('change', () => {
    const value = control instanceof HTMLInputElement && control.type === 'checkbox' ? control.checked :
      control instanceof HTMLInputElement && control.type === 'number' ? Number(control.value) : control.value;
    setSettings(readSettings({ ...viewerSettings, [key]: value }));
  });
}
document.querySelector('#settings-reset')?.addEventListener('click', () => setSettings({ ...DEFAULT_SETTINGS }));
setSettings({});
const sessions = new SourceEditorSessions();
const sources: Record<string, string> = {};
const names = ['wide-flowchart', 'tall-flowchart', 'branching-flowchart', 'sequence'];
const fixtureText: Record<string,string> = { 'wide-flowchart': wide, 'tall-flowchart': tall, 'branching-flowchart': branching, sequence };
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', themeVariables: { fontFamily: 'system-ui', primaryColor: '#e6ddfa', primaryTextColor: '#292339', primaryBorderColor: '#9a80bd', lineColor: '#8094b0', secondaryColor: '#dae8f0', tertiaryColor: '#f4e5cb', actorBkg: '#e6ddfa', actorTextColor: '#292339', actorBorder: '#9a80bd', signalColor: '#8094b0', signalTextColor: '#93a6c1' } });
for (const name of names) {
  const source = fixtureText[name]!;
  sources[name] = (await mermaid.render(`fixture_${name.replaceAll('-', '_')}`, source)).svg;
}
function mount(name: string, target: HTMLElement): RenderScope {
  const container = createHtmlElement(document, 'div', 'mermaid');
  // Only locally generated, synthetic test fixtures. Production never parses SVG strings.
  container.append(document.importNode(new DOMParser().parseFromString(sources[name]!, 'image/svg+xml').documentElement, true));
  target.append(container);
  let current = fixtureText[name] ?? (name === 'hidden' ? branching : sequence);
  let revision = 0;
  const source: DiagramSource = {
    read: async () => ({ source: current, document: current, start: 0, end: current.length, line: 0 }),
    validate: async next => { await mermaid.parse(next); },
    write: async (snapshot, next) => {
      if (snapshot.document !== current) throw new Error('Source changed; reopen the editor.');
      const rendered = await mermaid.render(`edited_${name.replaceAll('-', '_')}_${++revision}`, next);
      current = next;
      sources[name] = rendered.svg;
      container.replaceChildren(document.importNode(new DOMParser().parseFromString(rendered.svg, 'image/svg+xml').documentElement, true));
    },
  };
  const scope = new RenderScope(container, (href) => { document.querySelector('#link-status')!.textContent = `Opened ${href}`; }, () => source, sessions, () => viewerSettings);
  scopes.push(scope); return scope;
}
for (const name of names) mount(name, document.querySelector(`[data-fixture="${name}"]`)!);
const hidden = document.querySelector<HTMLElement>('#hidden-content')!;
sources.hidden = (await mermaid.render('fixture_hidden', branching)).svg;
mount('hidden', hidden);
document.querySelector('#show-hidden')!.addEventListener('click', () => { hidden.hidden = !hidden.hidden; });
document.querySelector('#toggle-theme')!.addEventListener('click', () => document.body.classList.toggle('theme-light'));
sources.dynamic = (await mermaid.render('fixture_dynamic', sequence)).svg;
let dynamicScope: RenderScope | undefined;
const dynamic = document.querySelector<HTMLElement>('#dynamic')!;
document.querySelector('#mount')!.addEventListener('click', () => { if (!dynamicScope) dynamicScope = mount('dynamic', dynamic); });
document.querySelector('#unmount')!.addEventListener('click', () => { dynamicScope?.dispose(); dynamicScope = undefined; dynamic.replaceChildren(); });
window.demo = {
    scopes, sources, sessions, mount, DiagramViewer, RenderScope, SourceEditor, SourceEditorSessions, SemanticHighlighter, EditorView,
    DEFAULT_SETTINGS, readSettings, setSettings, getSettings: () => ({ ...viewerSettings }),
    disposeAll: () => { sessions.dispose(); scopes.forEach(scope => scope.dispose()); },
    ready: true,
};
document.documentElement.dataset.ready = 'true';

// Explicit taxonomy workbench. It is idle until requested and never changes a vault.
import { taxonomy, developmentMermaidVersion } from './taxonomy-data';
const taxonomySelect = document.querySelector<HTMLSelectElement>('#taxonomy-select')!;
const taxonomyPreview = document.querySelector<HTMLElement>('#taxonomy-preview')!;
const taxonomyStatus = document.querySelector<HTMLElement>('#taxonomy-status')!;
document.querySelector('#taxonomy-version')!.textContent = `Development renderer: Mermaid ${developmentMermaidVersion}. Native target: Obsidian ${taxonomy.nativeRenderer.obsidian_version}, Mermaid 11.13.0 (patched).`;
for (const item of taxonomy.fixtures) {
 const option=createHtmlElement(document,'option');option.value=item.id;option.textContent=`${item.id} · ${item.nativeRecognition === 'unsupported' ? 'unsupported by native renderer' : item.scope}`;taxonomySelect.append(option);
}
export type TypeResult = { id: string; recognition: string; parse: string; svg: string; viewer: string; message?: string; textPreserved?: boolean; nativeRecognition: string; scale?: number };
let taxonomyScope: RenderScope | undefined;
let originalSvg: SVGSVGElement | undefined;
let originalText='';
let renderCount=0;
let taxonomyBusy=false;
const typeResults: TypeResult[]=[];
async function showOriginal(id: string): Promise<TypeResult> {
 const fixture=taxonomy.fixtures.find(x=>x.id===id)!;
 taxonomyScope?.dispose();taxonomyScope=undefined;taxonomyPreview.replaceChildren();originalSvg=undefined;
 const result: TypeResult={id,recognition:'not-tested',parse:'not-tested',svg:'not-tested',viewer:'not-tested',nativeRecognition:fixture.nativeRecognition};
 try { result.recognition=mermaid.detectType(fixture.sourceText); }
 catch(error){result.recognition='unsupported';result.message=String(error);return result;}
 if(fixture.scope==='recognition-only'){result.message='Native renderer does not recognize this family. This is a starter-only probe, not a full source/render case.';return result;}
 try{await mermaid.parse(fixture.sourceText);result.parse='pass';}
 catch(error){result.parse='fail';result.message=String(error);return result;}
 try{
  const rendered=await mermaid.render(`taxonomy_${++renderCount}_${id.replaceAll('-','_')}`,fixture.sourceText);
  const parsed=new DOMParser().parseFromString(rendered.svg,'image/svg+xml').documentElement;
  const host=createHtmlElement(document,'div','mermaid');host.append(document.importNode(parsed,true));taxonomyPreview.append(host);
  originalSvg=host.querySelector('svg')!;originalText=originalSvg.textContent||'';result.svg='pass';
 }catch(error){result.svg='fail';result.message=String(error);}
 return result;
}
async function attachTypeViewer(result: TypeResult): Promise<TypeResult> {
 if(!originalSvg || result.svg!=='pass')return result;
 const host=taxonomyPreview.querySelector<HTMLElement>('.mermaid')!;
 let current = taxonomy.fixtures.find(item => item.id === result.id)!.sourceText;
 taxonomyScope=new RenderScope(host, undefined, () => ({
   read: async () => ({source:current,document:current,start:0,end:current.length,line:0}),
   validate: async next => { await mermaid.parse(next); },
   write: async (snapshot, next) => {
     if(snapshot.source !== current) throw new Error('Source changed; reopen editor.');
     const rendered = await mermaid.render(`taxonomy_edit_${++renderCount}`,next);
     current=next; host.replaceChildren(document.importNode(new DOMParser().parseFromString(rendered.svg,'image/svg+xml').documentElement,true));
   },
 }), sessions, () => viewerSettings);
 scopes.push(taxonomyScope);
 const root=host.querySelector<HTMLElement>('.kmv-viewer');
 if(!root){result.viewer='fail';result.message='Native SVG has no usable dimensions or was not wrapped.';return result;}
 try { await waitForViewportReady(root); }
 catch(error) { result.viewer='fail';result.message=String(error);return result; }
 const rect=originalSvg.getBoundingClientRect(),vp=root.querySelector('.kmv-viewport')!.getBoundingClientRect();
 result.textPreserved=originalSvg.textContent===originalText;
 result.scale=Number(root.dataset.scale);
 result.viewer=result.textPreserved && rect.width<=vp.width-31 && rect.width>0 ? 'pass' : 'fail';
 return result;
}
async function runTypeCase(id: string): Promise<TypeResult> {
 if(taxonomyBusy)throw new Error('A type case is already running.');
 taxonomyBusy=true;
 try { const result=await attachTypeViewer(await showOriginal(id));taxonomyStatus.textContent=JSON.stringify(result,null,2);return result; }
 finally{taxonomyBusy=false;}
}
let selectedResult: TypeResult | undefined;
function onTaxonomyClick(selector: string, action: () => Promise<void>): void {
 document.querySelector(selector)!.addEventListener('click', () => {
  void action().catch((error: unknown) => { taxonomyStatus.textContent = String(error); });
 });
}
onTaxonomyClick('#taxonomy-original',async()=>{if(taxonomyBusy)return;taxonomyBusy=true;try{selectedResult=await showOriginal(taxonomySelect.value);taxonomyStatus.textContent=JSON.stringify(selectedResult,null,2);}finally{taxonomyBusy=false;}});
onTaxonomyClick('#taxonomy-attach',async()=>{if(taxonomyBusy||!selectedResult)return;taxonomyBusy=true;try{selectedResult=await attachTypeViewer(selectedResult);taxonomyStatus.textContent=JSON.stringify(selectedResult,null,2);}finally{taxonomyBusy=false;}});
onTaxonomyClick('#taxonomy-run',async()=>{
 if(taxonomyBusy)return;typeResults.length=0;selectedResult=undefined;
 for(const fixture of taxonomy.fixtures){const result=await runTypeCase(fixture.id);typeResults.push(result);taxonomyStatus.textContent=typeResults.map(x=>`${x.id}: recognition=${x.recognition}, parse=${x.parse}, SVG=${x.svg}, viewer=${x.viewer}`).join('\n');}
});
window.demo = { ...window.demo, taxonomy, runTypeCase, typeResults, showOriginal, attachTypeViewer };
