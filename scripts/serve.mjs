import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root = resolve('.');
http.createServer(async (req,res)=>{
 try {
  const path = resolve(root, '.' + decodeURIComponent(new URL(req.url,'http://localhost').pathname === '/' ? '/demo/index.html' : new URL(req.url,'http://localhost').pathname));
  if (!path.startsWith(root+'/')) {res.writeHead(403).end();return;}
  const data = await readFile(path);
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.mmd':'text/plain'};
  res.writeHead(200,{'Content-Type':types[extname(path)] || 'application/octet-stream','Cache-Control':'no-store'}).end(data);
 } catch {res.writeHead(404).end('Not found');}
}).listen(4173,'127.0.0.1',()=>console.log('Private demo: http://127.0.0.1:4173'));
