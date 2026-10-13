import { test, expect, type Locator, type Page } from '@playwright/test';

const original = 'flowchart LR\n A["Original"] --> B\n';
const unrelated = 'Synthetic unrelated note: leave unchanged.';
type Mode = 'success' | 'validation-fails-first' | 'validation-deferred-success' | 'write-fails-first';

// Fake note operations isolate session ownership; the browser and replacement SVG DOM are real.
async function installSource(page: Page, mode: Mode = 'success', initial = original) {
  await page.evaluate(({ mode, initial, unrelated }) => {
    const demo = window.demo;
    const host = document.createElement('div'); host.className = 'mermaid'; host.dataset.sourceSaveFixture = '';
    document.querySelector('main')!.prepend(host);
    const notes = { intended: initial, unrelated };
    const stages: string[] = [];
    const baseline = demo.sessions.count;
    let validationAttempts = 0, writeAttempts = 0, writes = 0, pending: (() => void) | undefined;
    const replace = () => {
      const svg = new DOMParser().parseFromString(demo.sources['branching-flowchart']!, 'image/svg+xml').documentElement;
      host.replaceChildren(document.importNode(svg, true));
    };
    const source = {
      read: async () => ({ source: notes.intended, document: notes.intended, start: 0, end: notes.intended.length, line: 0 }),
      validate: async () => {
        const attempt = ++validationAttempts; stages.push('validation-start');
        if (attempt === 1 && (mode === 'validation-fails-first' || mode === 'validation-deferred-success')) {
          await new Promise<void>(resolve => { pending = resolve; });
        }
        if (attempt === 1 && mode === 'validation-fails-first') { stages.push('validation-error'); throw new Error('Synthetic parser rejection'); }
        stages.push('validation-end');
      },
      write: async (snapshot: { document: string }, next: string) => {
        const attempt = ++writeAttempts; stages.push('write-start');
        if (attempt === 1 && mode === 'write-fails-first') {
          await new Promise<void>(resolve => { pending = resolve; });
          stages.push('write-error'); throw new Error('Synthetic atomic write rejection');
        }
        if (snapshot.document !== notes.intended) throw new Error('Synthetic note changed while editing.');
        notes.intended = next; writes++; replace(); stages.push('write-end');
      },
    };
    replace();
    const scope = new demo.RenderScope(host, undefined, () => source, demo.sessions);
    demo.scopes.push(scope);
    (window as any).sourceSaveProbe = {
      notes, stages, baseline, replace,
      release: () => { if (!pending) throw new Error('No operation is pending.'); const resume = pending; pending = undefined; resume(); },
      inspect: () => ({ notes: { ...notes }, stages: [...stages], writes, validationAttempts, writeAttempts, sessions: demo.sessions.count, scopeCount: scope.count }),
    };
  }, { mode, initial, unrelated });
  await expect(page.locator('[data-source-save-fixture] .kmv-viewer')).toHaveAttribute('data-ready', 'true');
}

async function sourceDocument(code: Locator): Promise<string> {
  return code.evaluate(element => {
    const view = window.demo.EditorView.findFromDOM(element as HTMLElement);
    if (!view) throw new Error('Source editor view is missing.');
    return view.state.doc.toString();
  });
}

async function probe(page: Page) {
  return page.evaluate(() => (window as any).sourceSaveProbe.inspect()) as Promise<{
    notes: { intended: string; unrelated: string }; stages: string[]; writes: number;
    validationAttempts: number; writeAttempts: number; sessions: number; scopeCount: number;
  }>;
}

async function openSource(page: Page) {
  const root = page.locator('[data-source-save-fixture] .kmv-viewer');
  await root.locator('summary').click();
  await root.getByRole('button', { name: 'Edit Mermaid source', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit Mermaid source' });
  await expect(editor).toBeVisible();
  return { editor, code: editor.getByRole('textbox', { name: 'Mermaid source', exact: true }), status: editor.locator('.kmv-source-status') };
}

async function replaceSourceRender(page: Page) {
  await page.evaluate(() => (window as any).sourceSaveProbe.replace());
  await expect.poll(async () => { const state = await probe(page); return state.sessions - (await page.evaluate(() => (window as any).sourceSaveProbe.baseline)); }).toBe(2);
  await expect(page.locator('[data-source-save-fixture] .kmv-viewer')).toHaveAttribute('data-ready', 'true');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
});

test('validation failure after render replacement retains the draft and retry saves only its intended source', async ({ page }) => {
  await installSource(page, 'validation-fails-first');
  const { editor, code, status } = await openSource(page);
  const draft = 'flowchart LR\n A["Retained draft"] --> B\n';
  await code.fill(draft); await editor.getByRole('button', { name: 'Save source', exact: true }).click();
  await expect(status).toHaveAttribute('data-state', 'checking');
  await expect(code).toHaveAttribute('aria-disabled', 'true');
  await replaceSourceRender(page); await expect(editor).toBeVisible();
  await page.evaluate(() => (window as any).sourceSaveProbe.release());
  await expect(status).toHaveAttribute('data-state', 'error');
  await expect(status).toContainText('Mermaid validation failed: Synthetic parser rejection');
  await expect.poll(() => sourceDocument(code)).toBe(draft);
  await expect(code).toHaveAttribute('aria-disabled', 'false');
  await expect(editor.getByRole('button', { name: 'Save source', exact: true })).toBeEnabled();
  expect((await probe(page)).notes).toEqual({ intended: original, unrelated });
  expect((await probe(page)).writes).toBe(0);
  const corrected = 'flowchart LR\n A["Corrected draft"] --> B\n';
  await code.fill(corrected); await editor.getByRole('button', { name: 'Save source', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect.poll(async () => (await probe(page)).notes).toEqual({ intended: corrected, unrelated });
  expect((await probe(page)).writes).toBe(1);
  const reopened = await openSource(page); await expect.poll(() => sourceDocument(reopened.code)).toBe(corrected);
  await reopened.editor.getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('asynchronous write failure after replacement keeps the draft editable and retry commits once', async ({ page }) => {
  await installSource(page, 'write-fails-first');
  const { editor, code, status } = await openSource(page);
  const draft = 'flowchart LR\n A["Write retry"] --> B\n';
  await code.fill(draft); await editor.getByRole('button', { name: 'Save source', exact: true }).click();
  await expect(status).toHaveAttribute('data-state', 'saving');
  await replaceSourceRender(page); await expect(editor).toBeVisible();
  await page.evaluate(() => (window as any).sourceSaveProbe.release());
  await expect(status).toContainText('Source could not be saved: Synthetic atomic write rejection');
  await expect(status).toHaveAttribute('data-state', 'error');
  await expect.poll(() => sourceDocument(code)).toBe(draft);
  await expect(editor.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
  expect((await probe(page)).notes).toEqual({ intended: original, unrelated });
  expect((await probe(page)).writes).toBe(0);
  await editor.getByRole('button', { name: 'Save source', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect.poll(async () => (await probe(page)).notes).toEqual({ intended: draft, unrelated });
  expect((await probe(page)).writes).toBe(1);
});

test('repeated open, cancel and render replacement release retired sessions', async ({ page }) => {
  await installSource(page);
  const baseline = await page.evaluate(() => (window as any).sourceSaveProbe.baseline);
  for (let cycle = 0; cycle < 6; cycle++) {
    const { editor, code } = await openSource(page);
    await expect.poll(() => sourceDocument(code)).toBe(original);
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await page.evaluate(() => (window as any).sourceSaveProbe.replace());
    await expect.poll(async () => (await probe(page)).sessions).toBe(baseline + 1);
    await expect(page.locator('[data-source-save-fixture] .kmv-viewer')).toHaveAttribute('data-ready', 'true');
  }
  expect((await probe(page)).writes).toBe(0);
  await page.evaluate(() => window.demo.disposeAll());
  await expect(page.locator('.kmv-source-editor, .kmv-viewer')).toHaveCount(0);
  expect((await probe(page)).sessions).toBe(0);
});

test('unload closes a retained pending draft and prevents its later validation from writing', async ({ page }) => {
  await installSource(page, 'validation-deferred-success');
  const { editor, code, status } = await openSource(page);
  await code.fill('flowchart LR\n A["Never commit after unload"] --> B\n');
  await editor.getByRole('button', { name: 'Save source', exact: true }).click();
  await expect(status).toHaveAttribute('data-state', 'checking'); await replaceSourceRender(page);
  await page.evaluate(() => window.demo.disposeAll());
  await expect(editor).toHaveCount(0); expect((await probe(page)).sessions).toBe(0);
  await page.evaluate(() => (window as any).sourceSaveProbe.release());
  await expect.poll(async () => (await probe(page)).stages).toContain('validation-end');
  expect((await probe(page)).writes).toBe(0);
  expect((await probe(page)).notes).toEqual({ intended: original, unrelated });
});

test('smart Enter, Tab, Shift-Tab and standard CodeMirror undo operate on the source document', async ({ page }) => {
  const initial = 'flowchart LR\nsubgraph Work';
  await installSource(page, 'success', initial);
  const { editor, code } = await openSource(page);
  await code.press('Control+End'); await code.press('Enter');
  await expect.poll(() => sourceDocument(code)).toBe(initial + '\n  ');
  await code.press('Control+z'); await expect.poll(() => sourceDocument(code)).toBe(initial);
  await code.press('Control+Shift+z'); await expect.poll(() => sourceDocument(code)).toBe(initial + '\n  ');
  await code.pressSequentially('A --> B'); await code.press('Enter'); await code.press('Tab');
  await expect.poll(() => sourceDocument(code)).toBe(initial + '\n  A --> B\n    ');
  await code.press('Shift+Tab'); await expect.poll(() => sourceDocument(code)).toBe(initial + '\n  A --> B\n  ');
  const lines = 'flowchart LR\nA --> B\nB --> C';
  await code.fill(lines); await code.press('Control+a'); await code.press('Tab');
  await expect.poll(() => sourceDocument(code)).toBe('  flowchart LR\n  A --> B\n  B --> C');
  await code.press('Shift+Tab'); await expect.poll(() => sourceDocument(code)).toBe(lines);
  await code.fill('sequenceDiagram\nloop Retry'); await code.press('Control+End'); await code.press('Enter');
  await expect.poll(() => sourceDocument(code)).toBe('sequenceDiagram\nloop Retry\n  ');
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('narrow source editor keeps its controls and focused caret visible when available height shrinks', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const initial = 'flowchart LR\n' + Array.from({ length: 50 }, (_, index) => ` N${index}["Synthetic line ${index}"]`).join('\n');
  await installSource(page, 'success', initial);
  const { editor, code } = await openSource(page); await code.press('Control+End');
  await page.setViewportSize({ width: 390, height: 360 });
  await expect.poll(() => editor.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const buttons = [...element.querySelectorAll('.kmv-source-actions button')].map(button => button.getBoundingClientRect());
    return rect.left >= 0 && rect.right <= window.innerWidth && rect.top >= 0 && rect.bottom <= window.innerHeight &&
      buttons.every(button => button.top >= 0 && button.bottom <= window.innerHeight && button.width > 0);
  })).toBe(true);
  await expect.poll(() => code.evaluate(element => {
    const view = window.demo.EditorView.findFromDOM(element as HTMLElement);
    if (!view) return false;
    const caret = view.coordsAtPos(view.state.selection.main.head);
    const scroller = view.scrollDOM.getBoundingClientRect();
    const body = element.closest('.kmv-source-body')!.getBoundingClientRect();
    return !!caret && caret.top >= Math.max(scroller.top, body.top) - 2 && caret.bottom <= Math.min(scroller.bottom, body.bottom) + 2;
  })).toBe(true);
  await expect.poll(() => sourceDocument(code)).toBe(initial);
  await expect(editor.getByRole('button', { name: 'Save source', exact: true })).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
});
