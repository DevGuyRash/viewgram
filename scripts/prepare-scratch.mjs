/** Run only in an authorized accepting environment; never points at an existing vault. */
import { mkdir, copyFile, readFile, writeFile, access } from 'node:fs/promises';
import { resolve, isAbsolute, join, dirname } from 'node:path';
const supplied=process.argv[2];
if(!supplied || !isAbsolute(supplied)) throw new Error('Pass a NEW absolute scratch-vault directory. Existing directories are refused.');
const target=resolve(supplied);
try { await access(target); throw new Error('Target already exists; refusing to alter it. Choose a new isolated scratch path.'); }
catch(error){if(error.code!=='ENOENT')throw error;}
for (let ancestor=dirname(target); ; ancestor=dirname(ancestor)) {
  try { await access(join(ancestor,'.obsidian')); throw new Error('Refusing a scratch vault inside an existing Obsidian vault.'); }
  catch(error){if(error.code!=='ENOENT')throw error;}
  if(dirname(ancestor)===ancestor)break;
}
const plugin=join(target,'.obsidian','plugins','mermaid-viewer');
await mkdir(plugin,{recursive:true});
for(const file of ['main.js','manifest.json','styles.css']) await copyFile(join('dist',file),join(plugin,file));
let note='# Mermaid viewer acceptance\n\nSynthetic fixtures only. Enable Mermaid Viewer manually in this scratch vault.\n\n';
for(const name of ['wide-flowchart','tall-flowchart','branching-flowchart','sequence']) note+=`## ${name}\n\n\`\`\`mermaid\n${await readFile(join('fixtures',name+'.mmd'),'utf8')}\n\`\`\`\n\n`;
await writeFile(join(target,'Mermaid viewer acceptance.md'),note);
const matrix=JSON.parse(await readFile('fixtures/taxonomy.json','utf8'));
let matrixNote='# Native Mermaid type acceptance\n\nTarget: Obsidian 1.14.4 / Mermaid 11.13.0 with the installed patch. Detection is verified; native parsing, SVG and viewer checks remain pending. First inspect with the viewer disabled, then enable it and compare the same note.\n\n';
for(const fixture of matrix.fixtures){
 if(fixture.scope==='recognition-only')continue;
 matrixNote+=`## ${fixture.id} (${fixture.scope})\n\nNative parse: pending. Native SVG: pending. Viewer: pending.\n\n\`\`\`mermaid\n${await readFile(fixture.file,'utf8')}\n\`\`\`\n\n`;
}
matrixNote+='## Unsupported native families\n\nThese starter probes are recorded as unsupported by the installed native renderer, not viewer failures. Do not replace the renderer to make them pass.\n\n';
for(const fixture of matrix.fixtures.filter(x=>x.scope==='recognition-only'))matrixNote+=`- ${fixture.id}: ${fixture.nativeRecognition}\n`;
await writeFile(join(target,'Mermaid type acceptance.md'),matrixNote);
await writeFile(join(target,'SCRATCH-ONLY.txt'),'Private acceptance vault. No live Kingdom data, Mica source, settings or symlinks. Plugin installed but not enabled.\n');
console.log(`Prepared new isolated scratch vault: ${target}\nPlugin enablement remains a manual acceptance step.`);
