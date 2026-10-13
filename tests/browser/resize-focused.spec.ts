import { test, expect, type Page, type Locator } from '@playwright/test';

async function mount(page: Page, width = 350, height = 260): Promise<Locator> {
  await page.evaluate(({ width, height }) => {
    const pane = document.createElement('div'); pane.id = 'resize-focused-pane'; pane.className = 'view-content markdown-preview-section';
    pane.style.cssText = `width:${width}px;height:${height}px;overflow:auto`;
    const host = document.createElement('div'); host.className = 'mermaid'; host.style.cssText = 'display:flex;justify-content:center';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 600 250');
    const rect = document.createElementNS(svg.namespaceURI, 'rect'); rect.setAttribute('width', '600'); rect.setAttribute('height', '250'); rect.setAttribute('fill', 'currentColor'); svg.append(rect);
    host.append(svg); pane.append(host); document.body.prepend(pane);
    const source = 'flowchart LR\nA[Probe] --> B\n';
    (window as any).resizeViewer = new (window as any).demo.DiagramViewer(svg, undefined, {
      read: async () => ({ source, document: source, start: 0, end: source.length, line: 0 }),
      write: async () => { throw new Error('This fixture only exercises viewing and copying.'); },
    });
  }, { width, height });
  const root = page.locator('#resize-focused-pane .kmv-viewer');
  await expect(root).toHaveAttribute('data-ready', 'true');
  return root;
}
const height = (root: Locator) => root.locator('.kmv-viewport').evaluate(el => el.clientHeight);
async function mouseDrag(page: Page, handle: Locator, dy: number): Promise<void> {
  await handle.scrollIntoViewIfNeeded(); const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + dy, { steps: 6 }); await page.mouse.up();
}
async function touchDrag(page: Page, target: Locator, dy: number, cancel = false): Promise<void> {
  await target.scrollIntoViewIfNeeded(); const box = (await target.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const input = await page.context().newCDPSession(page);
  try {
    await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 6; step++) await input.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + dy * step / 6 }] });
    await input.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
  } finally { await input.detach(); }
}
test.beforeEach(async ({ page }) => { await page.goto('/'); await expect(page.locator('html')).toHaveAttribute('data-ready', 'true'); });

test('short narrow native host supports real resize drags and keyboard reset within its pane', async ({ page }) => {
  const root = await mount(page), handle = root.getByRole('button', { name: 'Resize diagram height', exact: true });
  await expect.poll(() => root.evaluate(el => el.getBoundingClientRect().height)).toBeLessThanOrEqual(260 * .88 + 3);
  const before = await height(root); expect(before).toBeLessThan(150);
  await mouseDrag(page, handle, -80); await expect.poll(() => height(root)).toBeLessThan(before);
  const smaller = await height(root); await mouseDrag(page, handle, 60); await expect.poll(() => height(root)).toBeGreaterThan(smaller);
  await expect(handle).toBeFocused(); await handle.press('ArrowUp'); await expect.poll(() => height(root)).toBeLessThan(before);
  await handle.press('Home'); await expect.poll(() => height(root)).toBe(before);
  await expect.poll(() => root.evaluate(el => el.getBoundingClientRect().height)).toBeLessThanOrEqual(260 * .88 + 3);
});

test('manual resize preference returns after a pane shrinks and expands', async ({ page }) => {
  const root = await mount(page, 600, 900), handle = root.getByRole('button', { name: 'Resize diagram height', exact: true });
  const natural = await height(root); await mouseDrag(page, handle, 180); await expect.poll(() => height(root)).toBeGreaterThan(natural + 150);
  const preferred = await height(root);
  await page.locator('#resize-focused-pane').evaluate(el => (el as HTMLElement).style.height = '300px');
  await expect.poll(() => height(root)).toBeLessThan(preferred);
  await expect.poll(() => root.evaluate(el => el.getBoundingClientRect().height)).toBeLessThanOrEqual(300 * .88 + 3);
  await page.locator('#resize-focused-pane').evaluate(el => (el as HTMLElement).style.height = '900px');
  await expect.poll(() => height(root)).toBe(preferred);
});

test('dynamic viewport resizing retains keyboard access and bounded menus in a narrow parent', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const root = await mount(page, 350, 900), input = root.getByRole('textbox', { name: 'Zoom percentage' });
  await input.focus(); await page.setViewportSize({ width: 390, height: 360 });
  await expect.poll(() => root.evaluate(el => el.getBoundingClientRect().height)).toBeLessThanOrEqual(360 * .88 + 3);
  await input.press('ArrowDown'); const menu = root.getByRole('group', { name: 'Zoom presets' }); await expect(menu).toBeVisible();
  await expect(menu).toHaveCSS('overflow-y', 'auto');
  const box = (await menu.boundingBox())!; expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(391); expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(361);
  await expect(root.getByRole('button', { name: 'Zoom to 10%', exact: true })).toBeFocused();
  for (let step=0;step<9;step++) await page.keyboard.press('Tab');
  const last=root.getByRole('button',{name:'Zoom to 400%',exact:true});await expect(last).toBeFocused();
  const lastBox=(await last.boundingBox())!;expect(lastBox.y).toBeGreaterThanOrEqual(box.y-1);expect(lastBox.y+lastBox.height).toBeLessThanOrEqual(box.y+box.height+1);
  await page.keyboard.press('Escape'); await expect(menu).toBeHidden(); await expect(input).toBeFocused();
});

test('confirmed copy checks are transient and repeated copy failures keep their actionable fallback', async ({ page }) => {
  const root = await mount(page, 600, 900), summary = root.locator('summary');
  await page.clock.install();
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => {} } }));
  for (let iteration = 0; iteration < 2; iteration++) {
    await summary.click(); await root.getByRole('button', { name: 'Copy Mermaid source', exact: true }).click();
    await expect(summary).toHaveClass(/kmv-copy-success/); await expect(summary.locator('.kmv-control-icon')).toHaveAttribute('data-icon', 'check');
    await expect(summary).toHaveText('Source & export'); await expect(root.locator('.kmv-action-status')).toHaveClass(/kmv-action-status-transient/);
    await page.clock.runFor(2000); await expect(summary).not.toHaveClass(/kmv-copy-success/); await expect(summary.locator('.kmv-control-icon')).toHaveAttribute('data-icon', 'download');
    await expect(root.locator('.kmv-action-status')).toBeEmpty();
  }
  await summary.click(); await root.getByRole('button', { name: 'Copy Mermaid source', exact: true }).click(); await expect(summary).toHaveClass(/kmv-copy-success/);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Denied'); } } }));
  await summary.click(); await root.getByRole('button', { name: 'Copy Mermaid source', exact: true }).click();
  await expect(summary).not.toHaveClass(/kmv-copy-success/); await expect(root.locator('.kmv-action-status')).toContainText('Source was not copied');
  const fallback = root.getByRole('button', { name: 'Save diagram.mmd', exact: true }); await expect(fallback).toBeVisible();
  await page.clock.runFor(2000); await expect(fallback).toBeVisible(); await expect(root.locator('.kmv-action-status')).not.toHaveClass(/kmv-action-status-transient/);
});

test.describe('touch input', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('touch resizing captures the handle, cancels cleanly, and leaves fit-mode document scrolling available', async ({ page }) => {
    const root = await mount(page, 350, 700), handle = root.getByRole('button', { name: 'Resize diagram height', exact: true });
    const before = await height(root), scroll = await page.evaluate(() => scrollY);
    await touchDrag(page, handle, 90, true); await expect.poll(() => height(root)).toBeGreaterThan(before + 60);
    expect(await page.evaluate(() => scrollY)).toBe(scroll);
    const grown = await height(root); await touchDrag(page, handle, -60); await expect.poll(() => height(root)).toBeLessThan(grown);
    await handle.press('Home');
    await touchDrag(page, root.locator('.kmv-viewport'), -100); await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(scroll);
  });
});
