import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
try {
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:4173/demo/render-fixtures.html');
 await page.waitForFunction(()=>typeof window.renderFixture==='function');
 for(const name of ['wide-flowchart','tall-flowchart','branching-flowchart','sequence']) {
  const source=await readFile(`fixtures/${name}.mmd`,'utf8');
  const svg=await page.evaluate(async({name,source})=>window.renderFixture(name,source),{name,source});
  await writeFile(`fixtures/${name}.svg`,svg); console.log(name,svg.length);
 }
} finally {await browser.close();}
