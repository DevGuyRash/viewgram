import { build } from 'esbuild';
import { writeTaxonomyData } from './taxonomy-data.mjs';
await writeTaxonomyData();
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
await mkdir('dist', {recursive:true});
const licenseBanner = `/*!\n${(await readFile('LICENSE', 'utf8')).trim()}\n*/`;
const pluginBuild = await build({entryPoints:['src/main.ts'],outfile:'dist/main.js',bundle:true,external:['obsidian','@codemirror/state','@codemirror/view','@codemirror/commands','@codemirror/language','@lezer/highlight'],platform:'browser',format:'cjs',target:'es2022',minify:true,banner:{js:licenseBanner},metafile:true,write:false});
// Check the resolved input graph, including reexports and literal dynamic imports.
const unexpectedInputs = Object.keys(pluginBuild.metafile.inputs).filter(input => {
  const path = relative(process.cwd(), resolve(input)).split(sep).join('/');
  return !path.startsWith('src/') && !path.split('/').includes('node_modules');
});
if (unexpectedInputs.length) throw new Error(`Plugin inputs must be source under src/ or package dependencies: ${unexpectedInputs.join(', ')}`);
for (const output of pluginBuild.outputFiles) await writeFile(output.path, output.contents);
await copyFile('manifest.json','dist/manifest.json');
await build({entryPoints:['src/styles.css'],outfile:'dist/styles.css',bundle:true,banner:{css:licenseBanner}});
await build({entryPoints:['demo/demo.ts'],outfile:'demo/viewer.js',bundle:true,loader:{'.mmd':'text'},minify:true,platform:'browser',format:'esm',target:'es2022',banner:{js:licenseBanner}});

const demoHtml = (await readFile('demo/index.html','utf8')).replace('<link rel="stylesheet" href="/src/styles.css">', `<style>${await readFile('dist/styles.css','utf8')}</style>`).replace('<script type="module" src="/demo/viewer.js"></script>', `<script type="module">${(await readFile('demo/viewer.js','utf8')).replaceAll('</script', '<\\/script')}</script>`);
await writeFile('demo/standalone.html',demoHtml);
