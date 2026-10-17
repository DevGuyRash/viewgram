import type { DomCreationPlatform } from '../src/viewer/dom';

/**
 * Standalone ESM development adapter, also used by the DOM fixtures.
 * Browsers have no Obsidian createEl/createSvg helpers. Native creation preserves
 * the supplied Document and SVG namespace; plugin code uses obsidian-dom.ts.
 */
export const browserDomCreation: DomCreationPlatform = {
  createHtml(doc, tag) {
    return doc.createElement(tag);
  },
  createSvg(doc, tag) {
    return doc.createElementNS('http://www.w3.org/2000/svg', tag);
  },
};
