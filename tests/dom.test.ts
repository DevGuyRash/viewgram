import { test, beforeEach, afterEach } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { DiagramViewer } from '../src/viewer/diagram';
import { RenderScope } from '../src/viewer/render-scope';
import { ViewportController, type ViewerActionResult } from '../src/viewer/controller';
import { LivePreviewScope } from '../src/editor/live-preview-scope';
import { waitForViewportReady } from '../src/viewer/readiness';
import { setDomCreationPlatform } from '../src/viewer/dom';
import { browserDomCreation } from '../demo/browser-dom.mjs';
setDomCreationPlatform(browserDomCreation);
let window: Window;
const observers = new Set<FakeResizeObserver>();
class FakeResizeObserver {
  constructor(private callback: (entries: { contentRect: { width: number; height: number } }[])=>void) { observers.add(this); }
  observe() { this.callback([{contentRect:{width:600,height:300}}]); }
  unobserve() {}
  disconnect() { observers.delete(this); }
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,25));
function svgHost(width=2000,height=800) {
 const host=window.document.createElement('div');host.className='mermaid';
 const svg=window.document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('id','native-svg');svg.setAttribute('style','max-width: 2000px;');host.append(svg);window.document.body.append(host);
 return {host:host as unknown as HTMLElement,svg:svg as unknown as SVGSVGElement};
}
beforeEach(()=>{
 window=new Window({url:'http://localhost'});
 Object.assign(globalThis,{ResizeObserver:FakeResizeObserver,MutationObserver:window.MutationObserver});
 // Dialog/pointer browser internals are mocked here, not claimed as browser acceptance.
 Object.assign(window.HTMLDialogElement.prototype,{showModal(){(this as any).open=true;},close(){(this as any).open=false;}});
 Object.assign(window.HTMLElement.prototype,{hasPointerCapture(){return false;},setPointerCapture(){},releasePointerCapture(){}});
});
afterEach(async()=>{await window.happyDOM.abort();observers.clear();});
test('wrap/dispose returns exact SVG, original style and sibling ordering',async()=>{
 const {host,svg}=svgHost();const style=svg.getAttribute('style');const viewer=new DiagramViewer(svg);await tick();
 assert.equal(host.querySelectorAll('.kmv-viewer').length,1);assert.equal(host.querySelector('svg'),svg);
 viewer.dispose();viewer.dispose();assert.equal(host.firstChild,svg);assert.equal(svg.getAttribute('style'),style);assert.equal(host.childNodes.length,1);assert.equal(observers.size,0);
});
test('modal uses same SVG and independent controller, retains inline transform',async()=>{
 const {host,svg}=svgHost();const viewer=new DiagramViewer(svg);viewer.inline.setZoom(2);viewer.inline.pan(-1,-1);await tick();const state={...viewer.inline.state};
 viewer.open();viewer.open();await tick();assert.equal(window.document.querySelectorAll('dialog').length,1);assert.equal(window.document.querySelector('dialog svg'),svg);
 assert.equal(window.document.querySelectorAll('#native-svg').length,1);assert.equal(window.document.querySelector('dialog .kmv-viewer')?.getAttribute('data-mode'),'contain');
 window.document.querySelector('dialog')!.dispatchEvent(new window.Event('cancel',{cancelable:true}));await tick();
 assert.equal(window.document.querySelector('dialog'),null);assert.equal(host.querySelector('svg'),svg);assert.deepEqual(viewer.inline.state,state);viewer.dispose();assert.equal(observers.size,0);
});
test('unload while modal is open cleans both controllers and observers',async()=>{
 const {host,svg}=svgHost();const viewer=new DiagramViewer(svg);viewer.open();await tick();viewer.dispose();await tick();
 assert.equal(window.document.querySelector('dialog'),null);assert.equal(host.firstChild,svg);assert.equal(observers.size,0);
});
test('local observer catches late SVG, does not double-wrap, and cleans replacement',async()=>{
 const host=window.document.createElement('div');host.className='mermaid';window.document.body.append(host);const scope=new RenderScope(host as unknown as HTMLElement);
 const {svg}=svgHost();host.append(svg as any);await tick();assert.equal(scope.count,1);assert.equal(host.querySelectorAll('.kmv-viewer').length,1);
 const nested=new RenderScope(host as unknown as HTMLElement);await tick();assert.equal(nested.count,0);
 host.replaceChildren();await tick();assert.equal(scope.count,0);assert.equal(observers.size,0);nested.dispose();scope.dispose();
});
test('SVG dimensions arriving late are observed without polling',async()=>{
 const {host,svg}=svgHost();svg.removeAttribute('viewBox');const scope=new RenderScope(host);assert.equal(scope.count,0);svg.setAttribute('width','2000');svg.setAttribute('height','500');await tick();assert.equal(scope.count,1);scope.dispose();
});
test('rerender during modal closes it and never resurrects removed note content',async()=>{
 const {host}=svgHost();const scope=new RenderScope(host);await tick();(host.querySelector('[aria-label="Open diagram lightbox"]') as HTMLButtonElement).click();await tick();assert.ok(window.document.querySelector('dialog'));
 host.replaceChildren();await tick();assert.equal(scope.count,0);assert.equal(window.document.querySelector('dialog'),null);assert.equal(host.childNodes.length,0);scope.dispose();assert.equal(observers.size,0);
});
test('hidden zero-size callback preserves state until visible fit',async()=>{
 const {svg}=svgHost();const c=new ViewportController(svg,{mode:'width'});c.resize({width:0,height:0});assert.equal(c.state.scale,568/2000);c.resize({width:400,height:300});assert.equal(c.state.scale,368/2000);c.setZoom(1);c.resize({width:800,height:500});assert.equal(c.state.scale,1);c.dispose();
});
test('links remain direct-listener capable and note navigation is source-aware through callback',async()=>{
 const {svg}=svgHost();let direct=0;let opened='';const a=window.document.createElementNS('http://www.w3.org/2000/svg','a');a.classList.add('internal-link');a.setAttribute('data-href','A note');a.addEventListener('click',()=>direct++);svg.append(a as any);
 const viewer=new DiagramViewer(svg,href=>{opened=href;});a.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));assert.equal(direct,1);assert.equal(opened,'A note');viewer.open();a.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));assert.equal(direct,2);viewer.dispose();
});
test('25 rapid create/open/close/dispose cycles leave no active observers or dialogs',async()=>{
 for(let i=0;i<25;i++){const {host,svg}=svgHost();const v=new DiagramViewer(svg);v.open();v.dispose();host.remove();}
 await tick();assert.equal(observers.size,0);assert.equal(window.document.querySelectorAll('.kmv-viewer,dialog').length,0);
});
test('pointermove uses cached geometry; cancellation releases drag state',async()=>{
 const {svg}=svgHost(2000,3000);const v=new DiagramViewer(svg);const c=v.inline;c.setZoom(1);
 c.viewport.getBoundingClientRect=()=>{throw new Error('Pointer movement must not read layout');};
 c.viewport.dispatchEvent(new window.PointerEvent('pointerdown',{pointerId:1,isPrimary:true,button:0,clientX:200,clientY:200,bubbles:true}) as any);
 c.viewport.dispatchEvent(new window.PointerEvent('pointermove',{pointerId:1,isPrimary:true,clientX:100,clientY:100,bubbles:true,cancelable:true}) as any);
 assert.equal(c.state.mode,'manual');assert.ok(c.root.classList.contains('kmv-dragging'));
 c.viewport.dispatchEvent(new window.PointerEvent('pointercancel',{pointerId:1,isPrimary:true}) as any);assert.ok(!c.root.classList.contains('kmv-dragging'));
 v.dispose();
});
test('controls do not bubble into enclosing note editor',()=>{
 const {host,svg}=svgHost();let clicks=0;let doubles=0;host.addEventListener('click',()=>clicks++);host.addEventListener('dblclick',()=>doubles++);
 const v=new DiagramViewer(svg);(v.inline.root.querySelector('[aria-label="Zoom in"]') as HTMLButtonElement).click();
 v.inline.viewport.dispatchEvent(new window.MouseEvent('dblclick',{bubbles:true,cancelable:true}) as any);
 assert.equal(clicks,0);assert.equal(doubles,0);v.dispose();
});

test('synthetic host overflow override leaves modal geometry and manual-touch overrides effective',async()=>{
 const style=window.document.createElement('style');style.textContent=readFileSync('src/styles.css','utf8')+'\n'+readFileSync('tests/fixtures/host-overflow.css','utf8');window.document.head.append(style);
 const {host,svg}=svgHost();host.classList.add('markdown-preview-section');const v=new DiagramViewer(svg);await tick();
 assert.equal(window.getComputedStyle(v.inline.viewport as any).overflow,'hidden');
 v.inline.setZoom(1);await tick();assert.equal(window.getComputedStyle(v.inline.viewport as any).touchAction,'none');
 v.open();await tick();const modal=window.document.querySelector('dialog .kmv-viewport')!;const computed=window.getComputedStyle(modal);
 assert.equal(parseFloat(computed.minHeight),0);assert.equal(computed.flex,'1 1 auto');assert.equal(parseFloat(computed.height),0);
 (window.document.querySelector('dialog [aria-label="Native size (100%)"]') as any).click();await tick();
 assert.equal(window.getComputedStyle(modal).touchAction,'none');v.dispose();
});

test('pointer starts stay inside noneditable viewer while zoom textbox can focus',()=>{
 const {host,svg}=svgHost();let pointers=0;let mice=0;host.addEventListener('pointerdown',()=>pointers++);host.addEventListener('mousedown',()=>mice++);
 const v=new DiagramViewer(svg);const input=v.inline.zoomInput;
 assert.equal(v.inline.root.getAttribute('contenteditable'),'false');
 const pointer=new window.PointerEvent('pointerdown',{bubbles:true,cancelable:true,isPrimary:true,button:0});
 const mouse=new window.MouseEvent('mousedown',{bubbles:true,cancelable:true});
 input.dispatchEvent(pointer as any);input.dispatchEvent(mouse as any);input.focus();
 assert.equal(pointers,0);assert.equal(mice,0);assert.equal(pointer.defaultPrevented,false);assert.equal(mouse.defaultPrevented,false);assert.equal(window.document.activeElement,input);
 v.dispose();
});
test('viewport drag blocks native caret placement and Escape cancels active drag',()=>{
 const {svg}=svgHost(2000,3000);const v=new DiagramViewer(svg);const c=v.inline;c.setZoom(1);
 const down=new window.PointerEvent('pointerdown',{pointerId:3,isPrimary:true,button:0,clientX:200,clientY:200,bubbles:true,cancelable:true});
 c.viewport.dispatchEvent(down as any);assert.equal(down.defaultPrevented,true);
 c.viewport.dispatchEvent(new window.PointerEvent('pointermove',{pointerId:3,isPrimary:true,clientX:100,clientY:100,bubbles:true,cancelable:true}) as any);
 assert.ok(c.root.classList.contains('kmv-dragging'));c.viewport.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}) as any);
 assert.ok(!c.root.classList.contains('kmv-dragging'));v.dispose();
});
test('primary fit controls indicate the whole chart in both view modes',()=>{
 const {svg}=svgHost();const v=new DiagramViewer(svg);const fit=v.inline.root.querySelector('[aria-label="Fit whole chart"]');assert.equal(fit?.textContent,'Fit chart');v.open();const modalFit=window.document.querySelector('dialog [aria-label="Fit whole chart"]');assert.equal(modalFit?.textContent,'Fit chart');v.dispose();
});

function editorOwner() {
 let active=true;const scopes=new Set<RenderScope>();const links: {href:string,path:string,newLeaf:boolean}[]=[];
 return {scopes,links,deactivate(){active=false;for(const scope of scopes)scope.dispose();scopes.clear();},owner:{isActive:()=>active,openLink:(href:string,path:string,newLeaf:boolean)=>links.push({href,path,newLeaf}),add:(scope:RenderScope)=>scopes.add(scope),remove:(scope:RenderScope)=>scopes.delete(scope)}};
}
test('Live Preview owns rendered Mermaid islands without moving the native widget root',async()=>{
 const content=window.document.createElement('div');content.className='cm-content';window.document.body.append(content);
 const widget=window.document.createElement('div');widget.className='cm-embed-block';content.append(widget);
 const {host,svg}=svgHost();widget.append(host as any);const beforeStyle=svg.getAttribute('style');
 const unrelated=window.document.createElementNS('http://www.w3.org/2000/svg','svg');unrelated.setAttribute('viewBox','0 0 100 100');content.append(unrelated);
 const owner=editorOwner();const lp=new LivePreviewScope(content as any,owner.owner);lp.sync(false,'A.md');assert.equal(content.querySelectorAll('.kmv-viewer').length,0);
 lp.sync(true,'A.md');await tick();assert.equal(content.querySelectorAll('.kmv-viewer').length,1);assert.equal(content.firstChild,widget);assert.equal(widget.firstChild,host);assert.equal(unrelated.parentNode,content);
 lp.sync(false,'A.md');assert.equal(content.querySelectorAll('.kmv-viewer').length,0);assert.equal(host.firstChild,svg);assert.equal(svg.getAttribute('style'),beforeStyle);assert.equal(owner.scopes.size,0);lp.dispose();
});
test('Live Preview sees asynchronous native widget insertion and removal closes its modal',async()=>{
 const content=window.document.createElement('div');window.document.body.append(content);const owner=editorOwner();const lp=new LivePreviewScope(content as any,owner.owner);lp.sync(true,'A.md');
 const {host}=svgHost();content.append(host as any);await tick();assert.equal(content.querySelectorAll('.kmv-viewer').length,1);
 (content.querySelector('[aria-label="Open diagram lightbox"]') as any).click();assert.ok(window.document.querySelector('dialog'));host.remove();await tick();assert.equal(window.document.querySelector('dialog'),null);assert.equal(observers.size,0);lp.dispose();assert.equal(owner.scopes.size,0);
});
test('Live Preview source-path changes refresh relative internal-link routing',async()=>{
 const {host,svg}=svgHost();const a=window.document.createElementNS('http://www.w3.org/2000/svg','a');a.classList.add('internal-link');a.setAttribute('data-href','Sibling');svg.append(a as any);
 const owner=editorOwner();const lp=new LivePreviewScope(host,owner.owner);lp.sync(true,'folder-a/note.md');a.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
 lp.sync(true,'folder-b/note.md');a.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
 assert.deepEqual(owner.links.map(x=>x.path),['folder-a/note.md','folder-b/note.md']);assert.equal(host.querySelectorAll('.kmv-viewer').length,1);assert.equal(owner.scopes.size,1);lp.dispose();
});
test('Live Preview cannot recreate viewers after plugin unload or editor destruction',async()=>{
 const {host,svg}=svgHost();const owner=editorOwner();const lp=new LivePreviewScope(host,owner.owner);lp.sync(true,'A.md');owner.deactivate();lp.sync(true,'A.md');assert.equal(host.querySelectorAll('.kmv-viewer').length,0);assert.equal(host.querySelector('svg'),svg);lp.dispose();lp.sync(true,'B.md');await tick();assert.equal(host.querySelectorAll('.kmv-viewer').length,0);assert.equal(owner.scopes.size,0);assert.equal(observers.size,0);
});
test('20 Source/Live Preview transitions leave one viewer then clean original SVG',async()=>{
 const {host,svg}=svgHost();const owner=editorOwner();const lp=new LivePreviewScope(host,owner.owner);
 for(let i=0;i<20;i++){lp.sync(true,'A.md');assert.equal(host.querySelectorAll('.kmv-viewer').length,1);lp.sync(false,'A.md');assert.equal(host.firstChild,svg);}
 lp.dispose();await tick();assert.equal(owner.scopes.size,0);assert.equal(observers.size,0);
});
test('native direct-child dark filter survives inline/modal movement exactly once',async()=>{
 const style=window.document.createElement('style');style.textContent=readFileSync('src/styles.css','utf8')+'\n.theme-dark .mermaid > svg { filter: invert(100%) hue-rotate(180deg) saturate(1.25); } .mermaid { margin: 20px; }';window.document.head.append(style);window.document.body.classList.add('theme-dark');
 const {host,svg}=svgHost();const native=window.getComputedStyle(svg as any).filter;assert.ok(native.includes('invert'));
 const v=new DiagramViewer(svg);await tick();assert.equal(window.getComputedStyle(svg as any).filter,native);assert.equal(svg.parentElement,v.inline.surface);assert.equal(window.getComputedStyle(v.inline.surface as any).margin,'0px');assert.ok(!window.getComputedStyle(v.inline.surface as any).filter.includes('invert'));
 v.open();await tick();assert.equal(window.getComputedStyle(svg as any).filter,native);v.dispose();assert.equal(host.firstChild,svg);assert.equal(window.getComputedStyle(svg as any).filter,native);
});
test('native theme preservation respects explicit SVG filters and restores original styles',()=>{
 const style=window.document.createElement('style');style.textContent='.theme-dark .mermaid > svg { filter: invert(100%); }';window.document.head.append(style);window.document.body.classList.add('theme-dark');
 for(const filter of ['none','grayscale(1)','url(#own-filter)']){const {svg}=svgHost();svg.style.filter=filter;const original=svg.getAttribute('style');const v=new DiagramViewer(svg);assert.equal(window.getComputedStyle(svg as any).filter,filter);v.open();assert.equal(window.getComputedStyle(svg as any).filter,filter);v.dispose();assert.equal(svg.getAttribute('style'),original);}
});
test('readiness resolves only after an observable finite positive painted scale',async()=>{
 const root=window.document.createElement('section');window.document.body.append(root);let resolved=false;const waiting=waitForViewportReady(root as any,1000).then(()=>{resolved=true;});
 await Promise.resolve();assert.equal(resolved,false);root.dataset.ready='true';root.dataset.scale='NaN';await tick();assert.equal(resolved,false);root.dataset.scale='0.25';await waiting;assert.equal(resolved,true);
});

test('transient Mermaid widget removed before mutation delivery never gets a disconnected viewer',async()=>{
 const editor=window.document.createElement('div');window.document.body.append(editor);const scope=new RenderScope(editor as any);const {host,svg}=svgHost();editor.append(host as any);host.remove();await tick();assert.equal(scope.count,0);assert.equal(host.querySelectorAll('.kmv-viewer').length,0);assert.equal(host.firstChild,svg);assert.equal(observers.size,0);scope.dispose();
});

test('alternate block-language Mermaid host never acquires a native inversion it did not have',()=>{
 const style=window.document.createElement('style');style.textContent='.theme-dark .mermaid > svg { filter: invert(100%); }';window.document.head.append(style);window.document.body.classList.add('theme-dark');
 const {host,svg}=svgHost();host.className='block-language-mermaid';const native=window.getComputedStyle(svg as any).filter;const v=new DiagramViewer(svg);assert.equal(v.inline.surface.classList.contains('mermaid'),false);assert.equal(window.getComputedStyle(svg as any).filter,native);v.open();assert.equal(svg.parentElement?.classList.contains('mermaid'),false);assert.equal(window.getComputedStyle(svg as any).filter,native);v.dispose();
});
test('light native SVG remains unfiltered in both viewer contexts',()=>{
 const style=window.document.createElement('style');style.textContent='.theme-dark .mermaid > svg { filter: invert(100%); }';window.document.head.append(style);window.document.body.classList.add('theme-light');
 const {svg}=svgHost();const native=window.getComputedStyle(svg as any).filter;const v=new DiagramViewer(svg);assert.equal(window.getComputedStyle(svg as any).filter,native);v.open();assert.equal(window.getComputedStyle(svg as any).filter,native);v.dispose();
});

test('ordinary wheel pans overflowing diagrams, modifiers zoom, and edges release note scrolling',()=>{
 const {svg}=svgHost(2000,3000);const v=new DiagramViewer(svg),c=v.inline;c.setZoom(1);c.fit('width');
 const before=c.state.y;const wheel=new window.WheelEvent('wheel',{deltaY:80,bubbles:true,cancelable:true});c.viewport.dispatchEvent(wheel as any);assert.ok(c.state.y<before);assert.equal(wheel.defaultPrevented,true);
 const scale=c.state.scale;const zoom=new window.WheelEvent('wheel',{deltaY:-100,bubbles:true,cancelable:true});Object.defineProperties(zoom,{ctrlKey:{value:true},clientX:{value:100},clientY:{value:100}});c.viewport.dispatchEvent(zoom as any);assert.ok(c.state.scale>scale);assert.equal(zoom.defaultPrevented,true);
 c.setZoom(.01);const edge=new window.WheelEvent('wheel',{deltaY:80,bubbles:true,cancelable:true});c.viewport.dispatchEvent(edge as any);assert.equal(edge.defaultPrevented,false);v.dispose();
});
test('zoom presets and middle-button drag keep the independent viewport controls functional',()=>{
 const {svg}=svgHost(2000,3000);const v=new DiagramViewer(svg),c=v.inline;
 (c.root.querySelector('[aria-label="Choose zoom preset"]') as HTMLButtonElement).click();assert.equal(c.root.querySelector<HTMLElement>('.kmv-zoom-menu')!.hidden,false);
 (c.root.querySelector('[aria-label="Zoom to 150%"]') as HTMLButtonElement).click();assert.equal(c.state.scale,1.5);assert.equal(c.root.querySelector<HTMLElement>('.kmv-zoom-menu')!.hidden,true);
 c.viewport.dispatchEvent(new window.PointerEvent('pointerdown',{pointerId:9,isPrimary:true,button:1,clientX:200,clientY:200,bubbles:true,cancelable:true}) as any);
 c.viewport.dispatchEvent(new window.PointerEvent('pointermove',{pointerId:9,isPrimary:true,clientX:100,clientY:100,bubbles:true,cancelable:true}) as any);assert.ok(c.root.classList.contains('kmv-dragging'));
 c.viewport.dispatchEvent(new window.PointerEvent('pointerup',{pointerId:9}) as any);assert.ok(!c.root.classList.contains('kmv-dragging'));v.dispose();
});
test('inline natural height respects viewport cap and resize handle restores automatic mode',()=>{
 const {svg}=svgHost(600,250);const v=new DiagramViewer(svg),c=v.inline;
 Object.defineProperty(c.viewport,'clientWidth',{get:()=>600});Object.defineProperty(c.viewport,'clientHeight',{get:()=>parseFloat(c.viewport.style.height)||300});
 c.resize({width:600,height:300});const natural=parseFloat(c.viewport.style.height);assert.equal(natural,269);
 const handle=c.root.querySelector('[aria-label="Resize diagram height"]')!;
 handle.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}) as any);assert.equal(parseFloat(c.viewport.style.height),309);
 handle.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}) as any);assert.equal(parseFloat(c.viewport.style.height),natural);
 v.dispose();const tall=svgHost(600,9000);const t=new DiagramViewer(tall.svg);t.inline.resize({width:600,height:300});assert.ok(parseFloat(t.inline.viewport.style.height)<=window.innerHeight*.88);t.dispose();
});

function deferred<T>() {
 let resolve!: (value:T)=>void;
 const promise=new Promise<T>(done=>{resolve=done;});
 return {promise,resolve};
}
test('latest action feedback wins out-of-order results and announcement errors remain visible',async()=>{
 const older=deferred<ViewerActionResult>(),latest=deferred<ViewerActionResult>();const {host,svg}=svgHost();
 const c=new ViewportController(svg,{mode:'width',actions:[
  {text:'First',label:'First operation',icon:'copy',run:()=>older.promise},
  {text:'Second',label:'Second operation',icon:'download',run:()=>latest.promise},
 ]});host.append(c.root);
 (c.root.querySelector('[aria-label="First operation"]') as HTMLButtonElement).click();
 (c.root.querySelector('[aria-label="Second operation"]') as HTMLButtonElement).click();await tick();
 latest.resolve({message:'Download requested.',feedback:'success'});await tick();
 const summary=c.root.querySelector('[aria-label="Source & export"]')!;assert.ok(summary.classList.contains('kmv-copy-success'));
 assert.equal(summary.querySelector('.kmv-control-icon')?.getAttribute('data-icon'),'check');
 c.announce('Current operation failed.');
 older.resolve({message:'Copied is only part of this stale warning.',feedback:'warning',fallback:{label:'Save stale file',run(){}}});await tick();
 assert.equal(c.root.querySelector('.kmv-action-status')!.textContent,'Current operation failed.');
 assert.equal(c.root.querySelector('[aria-label="Save stale file"]'),null);
 assert.ok(!summary.classList.contains('kmv-copy-success'));assert.equal(summary.querySelector('.kmv-control-icon')?.getAttribute('data-icon'),'download');c.dispose();
});
test('a notice alone never creates success feedback and actionable warnings remain visible',async()=>{
 const {host,svg}=svgHost();const c=new ViewportController(svg,{mode:'width',actions:[
  {text:'Notice',label:'Notice operation',icon:'copy',run:()=>({message:'Copied.'})},
  {text:'Warning',label:'Warning operation',icon:'image',run:()=>({message:'Image was not copied. Save SVG instead.',feedback:'warning',fallback:{label:'Save SVG',run(){throw new Error('Download is unavailable.');}}})},
 ]});host.append(c.root);
 (c.root.querySelector('[aria-label="Notice operation"]') as HTMLButtonElement).click();await tick();
 assert.equal(c.root.querySelector('.kmv-copy-success'),null);assert.equal(c.root.querySelector('.kmv-action-status')!.textContent,'Copied.');
 (c.root.querySelector('[aria-label="Warning operation"]') as HTMLButtonElement).click();await tick();
 const status=c.root.querySelector('.kmv-action-status')!;assert.ok(!status.classList.contains('kmv-action-status-transient'));
 const fallback=c.root.querySelector('[aria-label="Save SVG"]') as HTMLButtonElement;assert.ok(fallback);
 fallback.click();assert.ok(status.textContent?.includes('Download is unavailable.'));assert.equal(c.root.querySelector('[aria-label="Save SVG"]'),fallback);assert.equal(c.root.querySelector('.kmv-copy-success'),null);c.dispose();
});
test('disposal prevents queued actions and late results from mutating a released controller',async()=>{
 const {host,svg}=svgHost();let started=0;const c=new ViewportController(svg,{mode:'width',actions:[{text:'Queued',label:'Queued operation',icon:'copy',run:()=>{started++;return {message:'Copied.',feedback:'success'};}}]});host.append(c.root);
 (c.root.querySelector('[aria-label="Queued operation"]') as HTMLButtonElement).click();c.dispose();await tick();assert.equal(started,0);
 const second=svgHost(),result=deferred<ViewerActionResult>();const pending=new ViewportController(second.svg,{mode:'width',actions:[{text:'Pending',label:'Pending operation',icon:'copy',run:()=>result.promise}]});second.host.append(pending.root);
 (pending.root.querySelector('[aria-label="Pending operation"]') as HTMLButtonElement).click();await tick();pending.dispose();const released=pending.root.outerHTML;
 result.resolve({message:'Copied.',feedback:'success'});await tick();assert.equal(pending.root.outerHTML,released);assert.equal(pending.root.querySelector('.kmv-copy-success'),null);assert.equal(observers.size,0);
 const third=svgHost(),confirmed=new ViewportController(third.svg,{mode:'width',actions:[{text:'Confirmed',label:'Confirmed operation',icon:'copy',run:()=>({message:'Copied.',feedback:'success'})}]});third.host.append(confirmed.root);await tick();
 const created:ReturnType<typeof window.setTimeout>[]=[],cleared:ReturnType<typeof window.setTimeout>[]=[],nativeSet=window.setTimeout.bind(window),nativeClear=window.clearTimeout.bind(window);
 window.setTimeout=((callback:any,delay?:number,...args:any[])=>{const id=nativeSet(callback,delay,...args);created.push(id);return id;}) as typeof window.setTimeout;
 window.clearTimeout=((id:ReturnType<typeof window.setTimeout>)=>{cleared.push(id);nativeClear(id);}) as typeof window.clearTimeout;
 (confirmed.root.querySelector('[aria-label="Confirmed operation"]') as HTMLButtonElement).click();await tick();assert.ok(confirmed.root.querySelector('.kmv-copy-success'));assert.ok(created.length>0);
 confirmed.dispose();assert.ok(created.every(id=>cleared.includes(id)));assert.equal(confirmed.root.querySelector('.kmv-copy-success'),null);
});
test('visualViewport-only changes clamp preferred height and their listeners are removed on disposal',()=>{
 class Visual extends window.EventTarget {
  height=768;offsetTop=0;active=new Set<string>();
  addEventListener(type:string,listener:any,options?:any){this.active.add(type);super.addEventListener(type,listener,options);}
  removeEventListener(type:string,listener:any){this.active.delete(type);super.removeEventListener(type,listener);}
 }
 const visual=new Visual();Object.defineProperty(window,'visualViewport',{value:visual,configurable:true});
 const {host,svg}=svgHost(600,250),c=new ViewportController(svg,{mode:'width'});host.append(c.root);
 Object.defineProperty(c.viewport,'clientWidth',{get:()=>600});Object.defineProperty(c.viewport,'clientHeight',{get:()=>parseFloat(c.viewport.style.height)||300});c.resize({width:600,height:300});
 const handle=c.root.querySelector('[aria-label="Resize diagram height"]')!;handle.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}) as any);const preferred=parseFloat(c.viewport.style.height);
 const outerHeight=window.innerHeight;visual.height=240;visual.dispatchEvent(new window.Event('resize'));assert.ok(parseFloat(c.viewport.style.height)<150);assert.equal(window.innerHeight,outerHeight);
 visual.height=768;visual.dispatchEvent(new window.Event('resize'));assert.equal(parseFloat(c.viewport.style.height),preferred);assert.deepEqual([...visual.active].sort(),['resize','scroll']);
 c.dispose();assert.equal(visual.active.size,0);const released=c.viewport.style.height;visual.height=180;visual.dispatchEvent(new window.Event('resize'));assert.equal(c.viewport.style.height,released);
});
