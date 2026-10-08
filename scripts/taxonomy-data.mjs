import { readFile, writeFile } from 'node:fs/promises';
export async function writeTaxonomyData() {
 const matrix=JSON.parse(await readFile('fixtures/taxonomy.json','utf8'));
 for(const fixture of matrix.fixtures)fixture.sourceText=await readFile(fixture.file,'utf8');
 const version=JSON.parse(await readFile('node_modules/mermaid/package.json','utf8')).version;
 await writeFile('demo/taxonomy-data.ts',`// Generated from synthetic fixtures; development renderer only.\nexport const developmentMermaidVersion = ${JSON.stringify(version)};\nexport const taxonomy = ${JSON.stringify(matrix,null,2)};\n`);
}
if(process.argv[1]?.endsWith('/taxonomy-data.mjs'))await writeTaxonomyData();
