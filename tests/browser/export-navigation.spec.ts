import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const fixture = (page: Page, name: string) => page.locator(`[data-fixture="${name}"] .kmv-viewer`);
async function action(root: Locator, label: string): Promise<void> {
  await root.getByRole('button', { name: 'Source & export', exact: true }).click();
  await root.getByRole('button', { name: label, exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(fixture(page, 'wide-flowchart')).toHaveAttribute('data-ready', 'true');
});

test('clicking the resize handle keeps natural height responsive to pane width', async ({ page }) => {
  await page.evaluate(() => {
    const host = document.createElement('div'); host.id = 'resize-probe'; host.className = 'view-content'; host.style.width = '600px'; host.style.height = '1000px';
    host.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 250"><rect width="600" height="250" fill="red"/></svg>';
    document.body.append(host);
    (window as any).resizeProbe = new (window as any).demo.DiagramViewer(host.querySelector('svg'));
  });
  const root = page.locator('#resize-probe .kmv-viewer'), viewport = root.locator('.kmv-viewport');
  await expect(root).toHaveAttribute('data-ready', 'true');
  await expect.poll(() => viewport.evaluate(el => el.clientHeight)).toBe(268);
  await root.getByRole('button', { name: 'Resize diagram height', exact: true }).click();
  await page.locator('#resize-probe').evaluate(el => (el as HTMLElement).style.width = '400px');
  await expect.poll(() => viewport.evaluate(el => el.clientHeight)).toBe(185);
  await root.getByRole('button', { name: 'Resize diagram height', exact: true }).press('ArrowDown');
  await expect.poll(() => viewport.evaluate(el => el.clientHeight)).toBe(225);
  await root.getByRole('button', { name: 'Resize diagram height', exact: true }).press('Home');
  await expect.poll(() => viewport.evaluate(el => el.clientHeight)).toBe(185);
  const handle = root.getByRole('button', { name: 'Resize diagram height', exact: true });
  await handle.scrollIntoViewIfNeeded(); const bounds = (await handle.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 + 200, { steps: 6 }); await page.mouse.up();
  await expect.poll(() => viewport.evaluate(el => el.clientHeight)).toBe(385);
  const windowHeight = await page.evaluate(() => innerHeight);
  await page.locator('#resize-probe').evaluate(el => (el as HTMLElement).style.height = '550px');
  await expect.poll(() => root.evaluate(el => el.getBoundingClientRect().height)).toBeLessThanOrEqual(550 * .88 + 3);
  expect(await page.evaluate(() => innerHeight)).toBe(windowHeight);
});

test('middle-button dragging starts on a native diagram link without opening it', async ({ page }) => {
  await page.evaluate(() => {
    const host = document.createElement('div'); host.id = 'middle-link-probe'; host.style.width = '600px';
    host.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600"><a class="internal-link" data-href="Synthetic note"><rect width="1200" height="600" fill="red"/></a></svg>';
    document.body.append(host);
    (window as any).middleLinkOpens = 0;
    (window as any).middleProbe = new (window as any).demo.DiagramViewer(host.querySelector('svg'), () => { (window as any).middleLinkOpens++; });
  });
  const root = page.locator('#middle-link-probe .kmv-viewer');
  await expect(root).toHaveAttribute('data-ready', 'true');
  await root.getByRole('button', { name: 'Native size (100%)', exact: true }).click();
  await root.locator('.kmv-viewport').scrollIntoViewIfNeeded();
  const link = root.locator('a'), bounds = (await root.locator('.kmv-viewport').boundingBox())!;
  expect(await link.count()).toBe(1);
  const before = await root.locator('.kmv-surface').getAttribute('style');
  await page.mouse.move(bounds.x + 140, bounds.y + 100); await page.mouse.down({ button: 'middle' });
  await page.mouse.move(bounds.x + 100, bounds.y + 60, { steps: 4 });
  await expect(root).toHaveClass(/kmv-dragging/);
  await page.mouse.up({ button: 'middle' });
  await expect(root).not.toHaveClass(/kmv-dragging/);
  await expect(root.locator('.kmv-surface')).not.toHaveAttribute('style', before!);
  expect(await page.evaluate(() => (window as any).middleLinkOpens)).toBe(0);
});

test('real wheel input pans, modifier zooms, and the bottom boundary releases note scrolling', async ({ page }) => {
  const root = fixture(page, 'tall-flowchart'), viewport = root.locator('.kmv-viewport');
  await viewport.focus(); await viewport.press('w'); await expect(root).toHaveAttribute('data-mode', 'width');
  await viewport.scrollIntoViewIfNeeded();
  const bounds = (await viewport.boundingBox())!;
  await page.mouse.move(bounds.x + 30, bounds.y + 100);
  const before = await root.locator('.kmv-surface').getAttribute('style');
  await page.mouse.wheel(0, 100);
  await expect(root.locator('.kmv-surface')).not.toHaveAttribute('style', before!);
  const scale = Number(await root.getAttribute('data-scale'));
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -100); await page.keyboard.up('Control');
  await expect.poll(async () => Number(await root.getAttribute('data-scale'))).toBeGreaterThan(scale);
  await page.mouse.wheel(0, 100_000);
  await expect.poll(() => root.locator('.kmv-surface').getAttribute('style')).not.toBe(before);
  // Wait for the actual wheel frame before recording the next document-scroll baseline.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const scroll = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 180);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(scroll);
});

type LabelRegion = { x: number; y: number; width: number; height: number };
async function nativeGeometry(root: Locator) {
  return root.locator('.kmv-surface > svg').evaluate(svg => {
    const native = svg as SVGSVGElement, viewBox = native.viewBox.baseVal;
    const label = native.querySelector('.nodeLabel')!;
    const box = label.getBoundingClientRect(), inverse = native.getScreenCTM()!.inverse();
    const start = new DOMPoint(box.left, box.top).matrixTransform(inverse);
    const end = new DOMPoint(box.right, box.bottom).matrixTransform(inverse);
    return { width: viewBox.width, height: viewBox.height, label: { x: start.x - viewBox.x, y: start.y - viewBox.y, width: end.x - start.x, height: end.y - start.y } };
  });
}
async function decodedPixels(page: Page, bytes: Buffer, mime: string, label: LabelRegion, nativeWidth: number) {
  return page.evaluate(async ({ data, mime, label, nativeWidth }) => {
    const image = new Image(); image.src = `data:${mime};base64,${data}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let visible = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! > 0) visible++;
    const scale = canvas.width / nativeWidth, colors = new Set<string>();
    const labelPixels = context.getImageData(Math.floor(label.x * scale), Math.floor(label.y * scale), Math.max(1, Math.floor(label.width * scale)), Math.max(1, Math.floor(label.height * scale))).data;
    for (let i = 0; i < labelPixels.length; i += 4) if (labelPixels[i + 3]! > 200) colors.add(`${labelPixels[i]},${labelPixels[i + 1]},${labelPixels[i + 2]}`);
    const result = { width: canvas.width, height: canvas.height, visible, labelColors: colors.size, cornerAlpha: pixels[3] };
    image.removeAttribute('src'); canvas.width = canvas.height = 0;
    return result;
  }, { data: bytes.toString('base64'), mime, label, nativeWidth });
}

for (const theme of ['light', 'dark-filter'] as const) test(`SVG, PNG, JPG and WebP downloads decode with HTML label pixels in ${theme}`, async ({ page }) => {
  test.setTimeout(60_000);
  await page.addStyleTag({ content: '.theme-dark .mermaid > svg { filter: invert(100%) hue-rotate(180deg) saturate(1.25); }' });
  await page.evaluate(dark => { document.body.classList.toggle('theme-dark', dark); document.body.classList.toggle('theme-light', !dark); }, theme === 'dark-filter');
  const root = fixture(page, 'branching-flowchart'), native = await nativeGeometry(root);
  const original = await root.locator('.kmv-surface > svg').evaluate(svg => { (window as any).exportOriginal = svg; return svg.outerHTML; });
  const results = [];
  for (const [format, mime] of [['svg', 'image/svg+xml'], ['png', 'image/png'], ['jpg', 'image/jpeg'], ['webp', 'image/webp']] as const) {
    const pending = page.waitForEvent('download'); await action(root, `Save diagram as ${format.toUpperCase()}`);
    const download = await pending; expect(download.suggestedFilename()).toBe(`diagram.${format}`);
    await download.saveAs(`evidence/exports/${theme}.${format}`);
    const bytes = await readFile((await download.path())!);
    if (format === 'svg') {
      const source = bytes.toString('utf8'); expect(source).toContain('Choose a workflow'); expect(source).toContain('foreignObject');
      expect(source).not.toMatch(/data-kmv-|kmv-semantic|<script|<style/);
    } else if (format === 'png') expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    else if (format === 'jpg') expect(bytes.subarray(0, 3).toString('hex')).toBe('ffd8ff');
    else { expect(bytes.subarray(0, 4).toString()).toBe('RIFF'); expect(bytes.subarray(8, 12).toString()).toBe('WEBP'); }
    const pixels = await decodedPixels(page, bytes, mime, native.label, native.width);
    expect(pixels.width).toBe(format === 'svg' ? Math.round(native.width) : Math.floor(native.width));
    expect(pixels.height).toBe(format === 'svg' ? Math.round(native.height) : Math.floor(native.height));
    expect(pixels.visible).toBeGreaterThan(1000); expect(pixels.labelColors).toBeGreaterThan(10);
    if (format === 'jpg') expect(pixels.cornerAlpha).toBe(255);
    results.push({ format, mime, bytes: bytes.length, ...pixels });
    await expect(root.locator('.kmv-action-status')).toContainText(`Download requested: diagram.${format}`);
  }
  expect(await root.locator('.kmv-surface > svg').evaluate(svg => svg === (window as any).exportOriginal)).toBe(true);
  expect(await root.locator('.kmv-surface > svg').evaluate(svg => svg.outerHTML)).toBe(original);
  const runtime = { chromium: page.context().browser()?.version(), playwright: JSON.parse(await readFile('node_modules/@playwright/test/package.json', 'utf8')).version };
  await writeFile(`evidence/exports/${theme}-receipt.json`, JSON.stringify({ theme, runtime, native, results }, null, 2));
  await test.info().attach('decoded-image-evidence', { body: JSON.stringify({ theme, native, results }), contentType: 'application/json' });
});

test('allowed image and source copies read back from the real Chromium clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const root = fixture(page, 'branching-flowchart'), native = await nativeGeometry(root);
  await action(root, 'Copy diagram image');
  await expect(root.locator('.kmv-action-status')).toContainText('Image copied.');
  const clipboard = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const png = await items.find(item => item.types.includes('image/png'))!.getType('image/png');
    const bytes = new Uint8Array(await png.arrayBuffer());
    let text = ''; for (const byte of bytes) text += String.fromCharCode(byte);
    return { mime: png.type, data: btoa(text) };
  });
  expect(clipboard.mime).toBe('image/png');
  const pixels = await decodedPixels(page, Buffer.from(clipboard.data, 'base64'), clipboard.mime, native.label, native.width);
  expect(pixels.labelColors).toBeGreaterThan(10); expect(pixels.width).toBe(Math.floor(native.width));
  await action(root, 'Copy Mermaid source');
  await expect(root.locator('.kmv-action-status')).toHaveText('Source copied.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await readFile('fixtures/branching-flowchart.mmd', 'utf8'));
});

test('unavailable image clipboard offers a decodable PNG download and reports no copy', async ({ page }) => {
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
  const root = fixture(page, 'branching-flowchart'), native = await nativeGeometry(root);
  await action(root, 'Copy diagram image');
  await expect(root.locator('.kmv-action-status')).toContainText('Image was not copied');
  const pending = page.waitForEvent('download'); await root.getByRole('button', { name: 'Save diagram.png', exact: true }).click();
  const download = await pending, pixels = await decodedPixels(page, await readFile((await download.path())!), 'image/png', native.label, native.width);
  expect(pixels.labelColors).toBeGreaterThan(10);
});
