import { test, expect, type Locator, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const fixture = (page: Page, name: string) => page.locator(`[data-fixture="${name}"] .kmv-viewer`);
async function wholeChart(root: Locator): Promise<void> {
  await expect(root).toHaveAttribute('data-mode', 'contain');
  await expect.poll(() => root.evaluate(el => {
    const viewport = el.querySelector('.kmv-viewport')!.getBoundingClientRect();
    const svg = el.querySelector('.kmv-surface > svg')!.getBoundingClientRect();
    return Math.max(viewport.left + 15 - svg.left, viewport.top + 15 - svg.top, svg.right - viewport.right + 15, svg.bottom - viewport.bottom + 15);
  })).toBeLessThanOrEqual(1);
}
async function mountResizeProbe(page: Page): Promise<Locator> {
  await page.evaluate(() => {
    const pane = document.createElement('div'); pane.id = 'outer-frame-probe'; pane.className = 'view-content markdown-preview-section';
    pane.style.cssText = 'width:600px;height:900px';
    const host = document.createElement('div'); host.className = 'mermaid';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 600 250');
    const shape = document.createElementNS(svg.namespaceURI, 'rect'); shape.setAttribute('width', '600'); shape.setAttribute('height', '250'); shape.setAttribute('fill', 'currentColor');
    svg.append(shape); host.append(svg); pane.append(host); document.body.prepend(pane);
    Object.assign(window, { outerFrameProbe: new window.demo.DiagramViewer(svg) });
  });
  const root = page.locator('#outer-frame-probe .kmv-viewer'); await expect(root).toHaveAttribute('data-ready', 'true'); return root;
}
async function frame(root: Locator) {
  return root.evaluate(el => {
    const outer = el.getBoundingClientRect(), viewport = el.querySelector('.kmv-viewport')!.getBoundingClientRect();
    const footer = el.querySelector('.kmv-footer')!.getBoundingClientRect(), grip = el.querySelector('.kmv-resize-handle')!.getBoundingClientRect();
    return { outerHeight: outer.height, viewportHeight: viewport.height, footerTop: footer.top - outer.top, gripTop: grip.top - outer.top, gripBottom: outer.bottom - grip.bottom, preferredHeight: (el as HTMLElement).style.height, priority: (el as HTMLElement).style.getPropertyPriority('height') };
  });
}
async function dragHeight(page: Page, grip: Locator, change: number): Promise<void> {
  await grip.scrollIntoViewIfNeeded(); const box = (await grip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + change, { steps: 6 }); await page.mouse.up();
}
test.beforeEach(async ({ page }) => {
  await page.goto('/'); await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(fixture(page, 'tall-flowchart')).toHaveAttribute('data-ready', 'true');
});

test('primary Fit chart contains every native SVG boundary after native zoom and explicit width fit', async ({ page }) => {
  const root = fixture(page, 'tall-flowchart'); await wholeChart(root);
  await root.getByRole('button', { name: 'Native size (100%)', exact: true }).click();
  await root.getByRole('button', { name: 'Fit whole chart', exact: true }).click(); await wholeChart(root);
  const viewport = root.getByRole('region', { name: 'Diagram', exact: true }); await viewport.focus(); await viewport.press('w');
  await expect(root).toHaveAttribute('data-mode', 'width');
  expect(await root.evaluate(el => el.querySelector('.kmv-surface > svg')!.getBoundingClientRect().height - el.querySelector('.kmv-viewport')!.getBoundingClientRect().height)).toBeGreaterThan(0);
  await viewport.press('f'); await wholeChart(root);
});

test('bottom-right grip changes the outer chart, footer, and viewport together under host sizing rules', async ({ page }) => {
  await page.addStyleTag({ content: '#outer-frame-probe .kmv-viewer { height:350px; min-height:200px; flex:1 0 90%; } #outer-frame-probe .kmv-viewport { height:300px; min-height:150px; flex:1 0 auto; }' });
  const root = await mountResizeProbe(page), grip = root.getByRole('button', { name: 'Resize diagram height', exact: true });
  await grip.scrollIntoViewIfNeeded(); const before = await frame(root);
  await dragHeight(page, grip, 90);
  await expect.poll(async () => (await frame(root)).outerHeight).toBeGreaterThan(before.outerHeight + 80);
  const after = await frame(root), growth = after.outerHeight - before.outerHeight;
  expect(after.viewportHeight - before.viewportHeight).toBeCloseTo(growth, 0);
  expect(after.footerTop - before.footerTop).toBeCloseTo(growth, 0);
  expect(after.gripTop - before.gripTop).toBeCloseTo(growth, 0);
  expect(after.gripBottom).toBeCloseTo(before.gripBottom, 0); expect(after.priority).toBe('important');
  await grip.press('ArrowUp'); await expect.poll(async () => (await frame(root)).outerHeight).toBeLessThan(after.outerHeight - 30);
  await grip.press('Home'); await expect.poll(async () => (await frame(root)).outerHeight).toBeCloseTo(before.outerHeight, 0);
  await dragHeight(page, grip, 80); await grip.dblclick(); await expect.poll(async () => (await frame(root)).outerHeight).toBeCloseTo(before.outerHeight, 0);
  await test.info().attach('outer-frame-resize', { body: JSON.stringify({ before, after, growth }, null, 2), contentType: 'application/json' });
});

test('background preferences update existing, future, and lightbox viewers without changing manual zoom', async ({ page }) => {
  const root = fixture(page, 'wide-flowchart'), viewport = root.getByRole('region', { name: 'Diagram', exact: true });
  await expect(root).toHaveAttribute('data-background', 'none'); await expect(viewport).toHaveCSS('background-image', 'none');
  await root.getByRole('button', { name: 'Native size (100%)', exact: true }).click();
  await page.locator('#setting-background').selectOption('grid');
  await page.locator('#setting-backgroundSpacing').fill('30'); await page.locator('#setting-backgroundSpacing').press('Tab');
  await expect(root).toHaveAttribute('data-background', 'grid'); await expect(viewport).toHaveCSS('background-size', '30px 30px, 30px 30px');
  await expect(viewport).toHaveCSS('background-image', /linear-gradient/); await expect(root).toHaveAttribute('data-scale', '1');
  await page.getByRole('button', { name: 'Mount sequence', exact: true }).click();
  const future = page.locator('#dynamic .kmv-viewer'); await expect(future).toHaveAttribute('data-background', 'grid'); await expect(future.locator('.kmv-viewport')).toHaveCSS('background-size', '30px 30px, 30px 30px');
  await root.getByRole('button', { name: 'Open diagram lightbox' }).click();
  const modal = page.locator('.kmv-dialog .kmv-viewer'); await expect(modal).toHaveAttribute('data-background', 'grid');
  await page.evaluate(() => window.demo.setSettings({ background: 'dots', showHints: false }));
  await expect(modal.locator('.kmv-viewport')).toHaveCSS('background-image', /radial-gradient/);
  await expect(modal.locator('.kmv-hint')).toBeHidden(); await expect(root).toHaveAttribute('data-background', 'dots');
  await page.getByRole('button', { name: 'Close diagram lightbox' }).click(); await expect(root).toHaveAttribute('data-scale', '1');
  await page.locator('#setting-background').selectOption('none'); await expect(viewport).toHaveCSS('background-image', 'none');
});

test('configured zoom increments and keyboard reset retain independent whole-chart lightbox fit', async ({ page }) => {
  await page.locator('#setting-zoomStep').fill('20'); await page.locator('#setting-zoomStep').press('Tab');
  await page.locator('#setting-initialFit').selectOption('width');
  const root = fixture(page, 'tall-flowchart'), viewport = root.getByRole('region', { name: 'Diagram', exact: true });
  await root.getByRole('button', { name: 'Native size (100%)', exact: true }).click();
  await root.getByRole('button', { name: 'Zoom in', exact: true }).click(); await expect(root).toHaveAttribute('data-scale', '1.2');
  await viewport.focus(); await viewport.press('+'); await expect(root).toHaveAttribute('data-scale', '1.4');
  await viewport.press('r'); await expect(root).toHaveAttribute('data-mode', 'width');
  await root.getByRole('button', { name: 'Open diagram lightbox' }).click(); const modal = page.locator('.kmv-dialog .kmv-viewer'); await wholeChart(modal);
  await modal.getByRole('button', { name: 'Native size (100%)', exact: true }).click(); await modal.locator('.kmv-viewport').focus(); await modal.locator('.kmv-viewport').press('r'); await wholeChart(modal);
  await page.getByRole('button', { name: 'Close diagram lightbox' }).click(); await expect(root).toHaveAttribute('data-mode', 'width');
});

test('toolbar follows theme variables and avoids native details decoration and the long initial tooltip label', async ({ page }) => {
  await page.addStyleTag({ content: 'button:not(.clickable-icon):not([aria-label="Sticker"]):not(.markdown-rendered button.copy-code-button) { background:linear-gradient(blue,deepskyblue); box-shadow:inset 0 0 2em cyan; color:white; }' });
  await page.evaluate(() => {
    let decorations = 0;
    const decorate = () => { for (const details of document.querySelectorAll('details:not([data-clipboard-decorated])')) { details.setAttribute('data-clipboard-decorated', 'true'); const button = document.createElement('button'); button.textContent = 'External clipboard'; details.querySelector('summary')?.append(button); decorations++; } };
    const observer = new MutationObserver(decorate); observer.observe(document.body, { childList: true, subtree: true }); decorate();
    Object.assign(window, { clipboardDecorations: () => decorations });
  });
  const root = fixture(page, 'branching-flowchart'), tools = root.getByRole('button', { name: 'Source & export', exact: true });
  await expect(root.locator('details, summary')).toHaveCount(0); await expect(root.getByRole('button', { name: 'External clipboard' })).toHaveCount(0);
  await expect(tools).toHaveCSS('background-image', 'none'); await expect(tools).toHaveCSS('box-shadow', 'none');
  const darkColor = await tools.evaluate(el => getComputedStyle(el).color); expect(darkColor).toBe(await root.evaluate(el => getComputedStyle(el).color));
  await page.getByRole('button', { name: 'Light / dark' }).click();
  expect(await tools.evaluate(el => getComputedStyle(el).color)).toBe(await root.evaluate(el => getComputedStyle(el).color)); expect(await tools.evaluate(el => getComputedStyle(el).color)).not.toBe(darkColor);
  const region = root.getByRole('region', { name: 'Diagram', exact: true }); await expect(region).toHaveAttribute('aria-label', 'Diagram');
  expect(await region.getAttribute('aria-describedby')).toMatch(/^kmv-help-/); await expect(root.locator('.kmv-accessible-help')).toBeHidden();
  await expect(root.locator('.kmv-action-status')).toBeEmpty(); await expect(page.locator('[aria-label^="Diagram. Arrow keys"]')).toHaveCount(0);
  await tools.focus(); await tools.press('ArrowDown'); await expect(tools).toHaveAttribute('aria-expanded', 'true'); await expect(root.getByRole('button', { name: 'Edit Mermaid source', exact: true })).toBeFocused();
  await mkdir('evidence/ui-v2', { recursive: true }); await page.screenshot({ path: 'evidence/ui-v2/theme-toolbar.png', fullPage: false, animations: 'disabled' });
  await page.keyboard.press('Escape'); await expect(tools).toHaveAttribute('aria-expanded', 'false'); await expect(tools).toBeFocused();
});

test('whole-chart button and blank double-click open source while semantic elements and links retain their own actions', async ({ page }) => {
  const root = fixture(page, 'branching-flowchart'), editor = page.locator('.kmv-source-editor');
  await page.evaluate(() => {
    const host = document.querySelector('[data-fixture="branching-flowchart"]')!;
    let outerDoubleClicks = 0; host.addEventListener('dblclick', () => { outerDoubleClicks++; }); Object.assign(window, { outerDoubleClicks: () => outerDoubleClicks });
  });
  await root.getByRole('button', { name: 'Edit whole chart', exact: true }).click(); await expect(editor).toHaveAttribute('data-mode', 'source'); await expect(editor.locator('.cm-editor')).toHaveCount(1); await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await root.locator('.kmv-viewport').dblclick({ position: { x: 4, y: 4 } }); await expect(editor).toHaveAttribute('data-mode', 'source'); await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await root.locator('g.node').first().dblclick(); await expect(editor).toHaveAttribute('data-mode', 'node'); await expect(editor.locator('.cm-editor')).toHaveCount(0); await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  const linkActions = await root.locator('.kmv-surface > svg').evaluate(svg => {
    const link = document.createElementNS(svg.namespaceURI, 'a'); link.classList.add('internal-link'); link.setAttribute('data-href', 'Synthetic note'); svg.append(link);
    let calls = 0; link.addEventListener('dblclick', () => { calls++; });
    link.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    return calls;
  });
  expect(linkActions).toBe(1);
  await expect(editor).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { outerDoubleClicks(): number }).outerDoubleClicks())).toBe(0);
});
