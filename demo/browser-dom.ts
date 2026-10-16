import type { DomCreationPlatform } from '../src/viewer/dom';

/** Native creation for the standalone browser entry and its DOM fixtures only. */
export const browserDomCreation: DomCreationPlatform = {
  createHtml(doc, tag) {
    return doc.createElement(tag);
  },
  createSvg(doc, tag) {
    return doc.createElementNS('http://www.w3.org/2000/svg', tag);
  },
};
