import type { DomCreationPlatform } from './dom';

type CreationWindow = Window & { createEl: typeof createEl; createSvg: typeof createSvg };

function hasObsidianCreation(win: Window | undefined): win is CreationWindow {
  return !!win && 'createEl' in win && typeof win.createEl === 'function' &&
    'createSvg' in win && typeof win.createSvg === 'function';
}

function owningWindow(doc: Document): CreationWindow {
  // Detached documents have no defaultView; Obsidian retains their constructor realm.
  const win = doc.defaultView ?? doc.constructorWin;
  if (!hasObsidianCreation(win)) throw new Error('The document has no Obsidian DOM helpers.');
  return win;
}

export const obsidianDomCreation: DomCreationPlatform = {
  createHtml(doc, tag) {
    // Window helpers create in the realm's live document, so adopt into the requested owner.
    return doc.adoptNode(owningWindow(doc).createEl(tag));
  },
  createSvg(doc, tag) {
    return doc.adoptNode(owningWindow(doc).createSvg(tag));
  },
};
