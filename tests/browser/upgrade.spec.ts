import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.goto('/');await expect(page.locator('html')).toHaveAttribute('data-ready','true');});

test('upgrade: natural height, preset, wheel and middle drag',async({page})=>{
 const root=page.locator('[data-fixture="tall-flowchart"] .kmv-viewer');await root.scrollIntoViewIfNeeded();
 const height=await root.evaluate(el=>el.getBoundingClientRect().height);expect(height).toBeLessThanOrEqual(883);expect(height).toBeGreaterThan(500);
 await root.getByRole('button',{name:'Choose zoom preset'}).click();await root.getByRole('button',{name:'Zoom to 100%',exact:true}).click();await expect(root).toHaveAttribute('data-scale','1');
 const viewport=root.locator('.kmv-viewport');const before=await root.locator('.kmv-surface').getAttribute('style');await viewport.dispatchEvent('wheel',{deltaY:150,bubbles:true,cancelable:true});await expect(root.locator('.kmv-surface')).not.toHaveAttribute('style',before!);
 const box=(await viewport.boundingBox())!;await page.mouse.move(box.x+40,box.y+100);await page.mouse.down({button:'middle'});await page.mouse.move(box.x+60,box.y+150,{steps:4});await expect(root).toHaveClass(/kmv-dragging/);await page.mouse.up({button:'middle'});await expect(root).not.toHaveClass(/kmv-dragging/);
});

test('upgrade: semantic double-click edits actual source and rerenders escaped label',async({page})=>{
 const root=page.locator('[data-fixture="branching-flowchart"] .kmv-viewer');const node=root.locator('g.node').filter({hasText:'Choose a workflow'});await node.dblclick();
 const editor=page.getByRole('dialog',{name:'Edit Mermaid source'});await expect(editor).toBeVisible();const value='New "label" <tag> [x] & 😀';await editor.getByRole('textbox',{name:'Element label',exact:true}).fill(value);await editor.getByRole('button',{name:'Save source',exact:true}).click();await expect(editor).toHaveCount(0);
 await expect(root.locator('g.node').filter({hasText:value})).toHaveCount(1);await root.locator('summary').click();await root.getByRole('button',{name:'Edit Mermaid source',exact:true}).click();await expect(page.getByRole('textbox',{name:'Mermaid source',exact:true})).toHaveValue(/#34;label#34;/);await page.getByRole('button',{name:'Cancel',exact:true}).click();
});

test('upgrade: SVG save and denied clipboard expose truthful outcomes',async({page})=>{
 const root=page.locator('[data-fixture="wide-flowchart"] .kmv-viewer');await root.locator('summary').click();const pending=page.waitForEvent('download');await root.getByRole('button',{name:'Save diagram as SVG',exact:true}).click();const file=await pending;expect(file.suggestedFilename()).toBe('diagram.svg');
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('Denied');}}}));await root.locator('summary').click();await root.getByRole('button',{name:'Copy Mermaid source',exact:true}).click();await expect(root.locator('.kmv-action-status')).toContainText('Source was not copied');await expect(root.getByRole('button',{name:'Save diagram.mmd',exact:true})).toBeVisible();
});
