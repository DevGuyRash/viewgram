import { test, expect, type Page } from '@playwright/test';
const fixture = (page: Page, name: string) => page.locator(`[data-fixture="${name}"] .kmv-viewer`);
async function ready(page: Page) { await page.goto('/'); await expect(page.locator('html')).toHaveAttribute('data-ready','true'); await expect(fixture(page,'wide-flowchart')).toHaveAttribute('data-scale', /\d/); }
async function geometry(locator: ReturnType<typeof fixture>) {
 await expect(locator).toHaveAttribute('data-ready','true');
 await expect.poll(async () => Number(await locator.getAttribute('data-scale'))).toBeGreaterThan(0);
 return locator.evaluate(root=>{
  const svg=root.querySelector<SVGSVGElement>('.kmv-surface > svg')!; const viewport=root.querySelector('.kmv-viewport')!;
  const a=svg.getBoundingClientRect(),b=viewport.getBoundingClientRect();
  const v=svg.viewBox.baseVal;
  return {scale:Number((root as HTMLElement).dataset.scale),svg:{x:a.x,y:a.y,width:a.width,height:a.height},viewport:{x:b.x,y:b.y,width:b.width,height:b.height},native:{width:v.width,height:v.height},overflow:getComputedStyle(viewport).overflow};
 });
}
test.beforeEach(async({page})=>ready(page));
test('all four fixtures initially fit the whole diagram; explicit width fit keeps tall labels larger',async({page})=>{
 for(const name of ['wide-flowchart','tall-flowchart','branching-flowchart','sequence']) {
  const g=await geometry(fixture(page,name));
  expect(g.svg.width).toBeLessThanOrEqual(g.viewport.width-31);
  expect(g.svg.height).toBeLessThanOrEqual(g.viewport.height-31);
  expect(g.overflow).toBe('hidden');
 }
 const tallRoot=fixture(page,'tall-flowchart');await tallRoot.locator('.kmv-viewport').focus();await tallRoot.locator('.kmv-viewport').press('w');await expect(tallRoot).toHaveAttribute('data-mode','width');
 const tall=await geometry(tallRoot);
 expect(tall.svg.height).toBeGreaterThan(tall.viewport.height);
 expect(tall.svg.y-tall.viewport.y).toBeCloseTo(16,1);
});
test('100% is actual native SVG size and may overflow',async({page})=>{
 const root=fixture(page,'wide-flowchart');await root.getByRole('button',{name:'Native size (100%)',exact:true}).click();
 await expect(root).toHaveAttribute('data-scale','1');
 const g=await geometry(root);expect(g.svg.width).toBeCloseTo(g.native.width,1);expect(g.svg.width).toBeGreaterThan(g.viewport.width);
});
test('editable zoom uses percent; invalid text is rejected; limits apply',async({page})=>{
 const root=fixture(page,'wide-flowchart'),input=root.getByRole('textbox',{name:'Zoom percentage'});
 await input.fill('200%');await input.press('Enter');await expect(root).toHaveAttribute('data-scale','2');
 await input.fill('oops');await input.press('Enter');await expect(input).toHaveValue('200%');
 await input.fill('99999');await input.press('Enter');await expect(root).toHaveAttribute('data-scale','10');
 await input.fill('1');await input.press('Enter');await expect(root).toHaveAttribute('data-scale','0.01');
});
test('D-pad recenter preserves scale and geometrically centers',async({page})=>{
 const root=fixture(page,'tall-flowchart');await root.getByRole('button',{name:'Native size (100%)',exact:true}).click();
 await root.getByRole('button',{name:'Pan down',exact:true}).click();
 await root.getByRole('button',{name:'Recenter diagram',exact:true}).click();
 const g=await geometry(root);expect(g.scale).toBe(1);expect(g.svg.y+g.svg.height/2).toBeCloseTo(g.viewport.y+g.viewport.height/2,1);
});
test('mouse drag pans with grab cursor and no source mutation',async({page})=>{
 const root=fixture(page,'tall-flowchart');await root.getByRole('button',{name:'Native size (100%)',exact:true}).click();
 const vp=root.locator('.kmv-viewport');await expect(vp).toHaveCSS('cursor','grab');
 const before=await geometry(root);const box=(await vp.boundingBox())!;
 await page.mouse.move(box.x+35,box.y+box.height*.7);await page.mouse.down();await page.mouse.move(box.x+35,box.y+box.height*.3,{steps:8});
 await expect(vp).toHaveCSS('cursor','grabbing');await page.mouse.up();
 const after=await geometry(root);expect(after.svg.y).toBeLessThan(before.svg.y-50);await expect(vp).toHaveCSS('cursor','grab');
});
test('keyboard panning and fit/native shortcuts only affect focused viewport',async({page})=>{
 const root=fixture(page,'wide-flowchart'),vp=root.locator('.kmv-viewport');await vp.focus();await vp.press('0');await expect(root).toHaveAttribute('data-scale','1');
 const before=await geometry(root);await vp.press('ArrowRight');const after=await geometry(root);expect(after.svg.x).toBeLessThan(before.svg.x);
 await vp.press('f');await expect(root).toHaveAttribute('data-mode','contain');
});
test('modal fits both axes on every opening, independent from inline zoom',async({page})=>{
 for(const name of ['wide-flowchart','tall-flowchart','branching-flowchart','sequence']) {
  const root=fixture(page,name);await root.getByRole('button',{name:'Native size (100%)',exact:true}).click();
  await expect(root).toHaveAttribute('data-scale','1');
  const inlineBefore=await root.getAttribute('data-scale');
  await root.getByRole('button',{name:'Open diagram lightbox'}).click();
  const modal=page.locator('.kmv-dialog .kmv-viewer');await expect(modal).toHaveAttribute('data-mode','contain');
  const g=await geometry(modal);expect(g.svg.width).toBeLessThanOrEqual(g.viewport.width-31);expect(g.svg.height).toBeLessThanOrEqual(g.viewport.height-31);
  await modal.getByRole('button',{name:'Native size (100%)',exact:true}).click();await expect(modal).toHaveAttribute('data-scale','1');
  await page.getByRole('button',{name:'Close diagram lightbox'}).click();await expect(root).toHaveAttribute('data-scale',inlineBefore!);
  await root.getByRole('button',{name:'Open diagram lightbox'}).click();await expect(page.locator('.kmv-dialog .kmv-viewer')).toHaveAttribute('data-mode','contain');
  await page.keyboard.press('Escape');await expect(page.locator('.kmv-dialog')).toHaveCount(0);
 }
});
test('modal keeps original SVG identity and never adds duplicate IDs',async({page})=>{
 const root=fixture(page,'sequence');
 const before=await page.evaluate(()=>{(window as any).originalSVG=document.querySelector('[data-fixture="sequence"] .mermaid > svg');const svg=document.querySelector('[data-fixture="sequence"] .mermaid > svg')!;return [svg.id,...[...svg.querySelectorAll('[id]')].map(el=>el.id)].filter(Boolean);});
 await root.getByRole('button',{name:'Open diagram lightbox'}).click();
 expect(await page.evaluate(()=>document.querySelector('.kmv-dialog .kmv-surface > svg')===(window as any).originalSVG)).toBe(true);
 expect(await page.evaluate(ids=>ids.map(id=>document.querySelectorAll(`#${CSS.escape(id)}`).length),before)).toEqual(before.map(()=>1));
 await page.keyboard.press('Escape');expect(await page.evaluate(()=>document.querySelector('[data-fixture="sequence"] .mermaid > svg')===(window as any).originalSVG)).toBe(true);
 expect(await page.evaluate(ids=>ids.map(id=>document.querySelectorAll(`#${CSS.escape(id)}`).length),before)).toEqual(before.map(()=>1));
});
test('Escape, backdrop and rapid repeated open/close restore focus',async({page})=>{
 const expand=fixture(page,'wide-flowchart').getByRole('button',{name:'Open diagram lightbox'});
 for(let i=0;i<8;i++){await expand.click();await page.keyboard.press('Escape');await expect(page.locator('.kmv-dialog')).toHaveCount(0);await expect(expand).toBeFocused();}
 await expand.click();await page.mouse.click(2,2);await expect(page.locator('.kmv-dialog')).toHaveCount(0);await expect(expand).toBeFocused();
});
test('hidden-to-visible initializes fit; width resize refits but native mode stays 100%',async({page})=>{
 await page.getByRole('button',{name:'Show / hide deferred diagram'}).click();const hidden=page.locator('#hidden-content .kmv-viewer');
 await expect(hidden).toHaveAttribute('data-mode','contain');const g=await geometry(hidden);expect(g.scale).toBeGreaterThan(0);expect(g.svg.width).toBeLessThanOrEqual(g.viewport.width-31);
 const root=fixture(page,'wide-flowchart');const previous=await geometry(root);await page.setViewportSize({width:900,height:900});await expect.poll(async()=>(await geometry(root)).scale).not.toBe(previous.scale);
 await root.getByRole('button',{name:'Native size (100%)',exact:true}).click();await page.setViewportSize({width:1100,height:900});await expect(root).toHaveAttribute('data-scale','1');
});
test('ordinary wheel scrolls the note when the width-fitted diagram cannot pan',async({page})=>{
 const root=fixture(page,'wide-flowchart');const before=await root.getAttribute('data-scale');const box=(await root.locator('.kmv-viewport').boundingBox())!;await page.mouse.move(box.x+30,box.y+30);await page.mouse.wheel(0,250);
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(0);await expect(root).toHaveAttribute('data-scale',before!);
});
test('repeated mount/unmount and render replacement remove orphan controllers',async({page})=>{
 for(let i=0;i<10;i++){await page.getByRole('button',{name:'Mount sequence',exact:true}).click();await expect(page.locator('#dynamic .kmv-viewer')).toHaveCount(1);await page.getByRole('button',{name:'Unmount sequence',exact:true}).click();await expect(page.locator('#dynamic .kmv-viewer')).toHaveCount(0);}
 await page.evaluate(()=>{const host=document.querySelector('[data-fixture="wide-flowchart"] .mermaid')!;host.replaceChildren();});
 await expect(page.locator('[data-fixture="wide-flowchart"] .kmv-viewer')).toHaveCount(0);
});
test('source render removed while modal open closes without resurrecting old SVG',async({page})=>{
 await fixture(page,'wide-flowchart').getByRole('button',{name:'Open diagram lightbox'}).click();
 await page.evaluate(()=>document.querySelector('[data-fixture="wide-flowchart"] .mermaid')!.replaceChildren());
 await expect(page.locator('.kmv-dialog')).toHaveCount(0);await expect(page.locator('[data-fixture="wide-flowchart"] svg')).toHaveCount(0);
});
test('component unload restores original SVG styling, listeners, and removes UI',async({page})=>{
 const original=await page.evaluate(()=>{const svg=document.querySelector('[data-fixture="sequence"] .mermaid > svg')!;(window as any).sameNode=svg;svg.addEventListener('verification',()=>{(window as any).verificationCount=((window as any).verificationCount||0)+1;});return svg.getAttribute('id');});
 await page.evaluate(()=>(window as any).demo.disposeAll());await expect(page.locator('.kmv-viewer')).toHaveCount(0);
 expect(await page.evaluate(()=>{const svg=document.querySelector('[data-fixture="sequence"] .mermaid > svg')!;svg.dispatchEvent(new Event('verification'));return svg===(window as any).sameNode&&(window as any).verificationCount===1;})).toBe(true);
 expect(await page.locator('[data-fixture="sequence"] .mermaid > svg').getAttribute('id')).toBe(original);
 expect(await page.locator('[data-fixture="sequence"] .mermaid > svg').getAttribute('style')).not.toContain('width: 100');
});
test('internal note links work without firing enclosing Mica edit gestures',async({page})=>{
 await page.evaluate(()=>{const host=document.querySelector('[data-fixture="wide-flowchart"]')!;host.addEventListener('dblclick',()=>{(window as any).micaEdits=((window as any).micaEdits||0)+1;});const a=document.createElementNS('http://www.w3.org/2000/svg','a');a.classList.add('internal-link');a.setAttribute('data-href','Test note');const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');rect.setAttribute('width','100');rect.setAttribute('height','40');a.append(rect);host.querySelector('.kmv-surface > svg')!.append(a);a.dispatchEvent(new MouseEvent('click',{bubbles:true}));host.querySelector('.kmv-viewport')!.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true}));});
 await expect(page.locator('#link-status')).toHaveText('Opened Test note');expect(await page.evaluate(()=>(window as any).micaEdits||0)).toBe(0);
});
test('mobile layout, manual touch dragging and reduced-motion styles',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
 const root=fixture(page,'tall-flowchart');await root.getByRole('button',{name:'Native size (100%)',exact:true}).click();await expect(root.locator('.kmv-viewport')).toHaveCSS('touch-action','none');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await root.getByRole('button',{name:'Open diagram lightbox'}).click();const modal=page.locator('.kmv-dialog .kmv-viewer');await expect(modal).toHaveAttribute('data-mode','contain');
 const g=await geometry(modal);expect(g.svg.height).toBeLessThanOrEqual(g.viewport.height-31);await page.keyboard.press('Escape');
});
test('no external requests or browser errors in viewer-only harness',async({page})=>{
 const requests:string[]=[];const errors:string[]=[];page.on('request',req=>{if(!req.url().startsWith('http://127.0.0.1:4173'))requests.push(req.url());});page.on('pageerror',e=>errors.push(e.message));await ready(page);
 await fixture(page,'branching-flowchart').getByRole('button',{name:'Open diagram lightbox'}).click();await page.keyboard.press('Escape');expect(requests).toEqual([]);expect(errors).toEqual([]);
});
test('capture review images',async({page})=>{
 await page.screenshot({path:'evidence/01-overview-dark.png',fullPage:true});
 await fixture(page,'branching-flowchart').getByRole('button',{name:'Open diagram lightbox'}).click();await expect(page.locator('.kmv-dialog .kmv-viewer')).toHaveAttribute('data-mode','contain');await page.screenshot({path:'evidence/02-branching-lightbox.png'});await page.keyboard.press('Escape');
 await fixture(page,'tall-flowchart').getByRole('button',{name:'Native size (100%)',exact:true}).click();await fixture(page,'tall-flowchart').getByRole('button',{name:'Recenter diagram',exact:true}).click();await page.screenshot({path:'evidence/03-native-recenter.png'});
 await page.getByRole('button',{name:'Light / dark'}).click();await page.screenshot({path:'evidence/04-overview-light.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await fixture(page,'sequence').getByRole('button',{name:'Open diagram lightbox'}).click();await expect(page.locator('.kmv-dialog .kmv-viewer')).toHaveAttribute('data-mode','contain');await page.screenshot({path:'evidence/05-mobile-lightbox.png'});
});

test('all required diagram types keep original text and fit in the viewer',async({page})=>{
 test.setTimeout(180_000);
 const cases=await page.evaluate(()=>(window as any).demo.taxonomy.fixtures.filter((x:any)=>x.scope==='required-native').map((x:any)=>x.id) as string[]);
 expect(cases).toHaveLength(36);
 for(const id of cases){
  const result=await page.evaluate(async(id)=>(window as any).demo.runTypeCase(id),id);
  expect(result.parse,`${id}: syntax stage ${result.message||''}`).toBe('pass');
  expect(result.svg,`${id}: SVG stage ${result.message||''}`).toBe('pass');
  expect(result.viewer,`${id}: viewer stage ${result.message||''}`).toBe('pass');
  const root=page.locator('#taxonomy-preview .kmv-viewer');
  await root.getByRole('button',{name:'Native size (100%)',exact:true}).click();await expect(root).toHaveAttribute('data-scale','1');
  await root.getByRole('button',{name:'Open diagram lightbox'}).click();const modal=page.locator('.kmv-dialog .kmv-viewer');await expect(modal).toHaveAttribute('data-mode','contain');
  const g=await geometry(modal);expect(g.svg.width,`${id} modal width`).toBeLessThanOrEqual(g.viewport.width-31);expect(g.svg.height,`${id} modal height`).toBeLessThanOrEqual(g.viewport.height-31);
  await page.keyboard.press('Escape');await expect(page.locator('.kmv-dialog')).toHaveCount(0);
 }
});

test('type workbench offers original-versus-viewer comparison without source edits',async({page})=>{
 await page.locator('#taxonomy-select').selectOption('class-v2');await page.getByRole('button',{name:'Render original',exact:true}).click();
 await expect(page.locator('#taxonomy-preview .mermaid > svg')).toHaveCount(1);await expect(page.locator('#taxonomy-preview .kmv-viewer')).toHaveCount(0);
 const before=await page.locator('#taxonomy-preview .mermaid > svg').textContent();await page.getByRole('button',{name:'Attach viewer',exact:true}).click();await expect(page.locator('#taxonomy-preview .kmv-viewer')).toHaveAttribute('data-mode','contain');
 expect(await page.locator('#taxonomy-preview .mermaid > svg').textContent()).toBe(before);
});

test('native SVG dark filter survives wrapping, modal movement and light-dark transitions',async({page})=>{
 await page.addStyleTag({content:'.theme-dark .mermaid > svg { filter: invert(100%) hue-rotate(180deg) saturate(1.25); }'});
 await page.evaluate(()=>document.body.classList.add('theme-dark'));
 await page.locator('#taxonomy-select').selectOption('flowchart');await page.getByRole('button',{name:'Render original',exact:true}).click();
 const svg=page.locator('#taxonomy-preview .mermaid > svg');await expect(svg).toHaveCount(1);
 const originalFilter=await svg.evaluate(el=>getComputedStyle(el).filter);expect(originalFilter).toContain('invert');
 await page.getByRole('button',{name:'Attach viewer',exact:true}).click();const root=page.locator('#taxonomy-preview .kmv-viewer');await expect(root).toHaveAttribute('data-ready','true');
 await expect(svg).toHaveCSS('filter',originalFilter);await expect(root.locator('.kmv-surface')).toHaveCSS('filter','none');
 await root.getByRole('button',{name:'Open diagram lightbox'}).click();const modalSvg=page.locator('.kmv-dialog .kmv-surface > svg');await expect(modalSvg).toHaveCSS('filter',originalFilter);
 await page.evaluate(()=>document.body.classList.replace('theme-dark','theme-light'));await expect(modalSvg).toHaveCSS('filter','none');
 await page.evaluate(()=>document.body.classList.replace('theme-light','theme-dark'));await expect(modalSvg).toHaveCSS('filter',originalFilter);
 await page.keyboard.press('Escape');await expect(svg).toHaveCSS('filter',originalFilter);
});

test('native presentation context does not override an explicit SVG filter',async({page})=>{
 await page.addStyleTag({content:'.theme-dark .mermaid > svg { filter: invert(100%); }'});await page.evaluate(()=>document.body.classList.add('theme-dark'));
 await page.locator('#taxonomy-select').selectOption('flowchart');await page.getByRole('button',{name:'Render original',exact:true}).click();
 await page.locator('#taxonomy-preview .mermaid > svg').evaluate(el=>(el as SVGSVGElement).style.filter='grayscale(1)');
 await page.getByRole('button',{name:'Attach viewer',exact:true}).click();const root=page.locator('#taxonomy-preview .kmv-viewer');await expect(root).toHaveAttribute('data-ready','true');
 await expect(root.locator('.kmv-surface > svg')).toHaveCSS('filter','grayscale(1)');await root.getByRole('button',{name:'Open diagram lightbox'}).click();await expect(page.locator('.kmv-dialog .kmv-surface > svg')).toHaveCSS('filter','grayscale(1)');await page.keyboard.press('Escape');
});

test('demo type selector stays inside a narrow viewport without hiding page overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});const rect=await page.locator('#taxonomy-select').boundingBox();expect(rect).not.toBeNull();expect(rect!.x+rect!.width).toBeLessThanOrEqual(390);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
