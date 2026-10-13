import { build } from 'esbuild';
import { writeTaxonomyData } from './taxonomy-data.mjs';
await writeTaxonomyData();
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
await mkdir('dist', {recursive:true});
await build({entryPoints:['src/main.ts'],outfile:'dist/main.js',bundle:true,external:['obsidian','@codemirror/state','@codemirror/view','@codemirror/commands','@codemirror/language'],platform:'browser',format:'cjs',target:'es2022',minify:true,banner:{js:'/* Mermaid Viewer: generated from private source. Do not hand-edit. */'}});
await copyFile('manifest.json','dist/manifest.json');
await build({entryPoints:['src/styles.css'],outfile:'dist/styles.css',bundle:true});
await build({entryPoints:['demo/demo.ts'],outfile:'demo/viewer.js',bundle:true,loader:{'.mmd':'text'},minify:true,platform:'browser',format:'esm',target:'es2022'});

const demoHtml = (await readFile('demo/index.html','utf8')).replace('<link rel="stylesheet" href="/src/styles.css">', `<style>${await readFile('dist/styles.css','utf8')}</style>`).replace('<script type="module" src="/demo/viewer.js"></script>', `<script type="module">${(await readFile('demo/viewer.js','utf8')).replaceAll('</script', '<\\/script')}</script>`);
await writeFile('demo/standalone.html',demoHtml);
