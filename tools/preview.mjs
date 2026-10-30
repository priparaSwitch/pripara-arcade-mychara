import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const host='127.0.0.1',port=8766,prefix='/pripara-arcade-mychara';
await stat(path.join(root,'index.html')).catch(()=>{throw new Error('먼저 npm run build를 실행해 주세요.');});
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.jpg':'image/jpeg','.svg':'image/svg+xml','.md':'text/plain; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    let pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    if(pathname===prefix){res.writeHead(302,{Location:prefix+'/'});res.end();return;}
    if(pathname.startsWith(prefix+'/'))pathname=pathname.slice(prefix.length);
    if(pathname.endsWith('/'))pathname+='index.html';
    const file=path.resolve(root,'.'+pathname);
    if(!file.startsWith(root+path.sep)||!(await stat(file)).isFile()){res.writeHead(404);res.end();return;}
    const body=await readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':body.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(404);res.end();}
});
server.on('error',error=>{
  console.error(error.code==='EADDRINUSE'?'127.0.0.1:8766이 이미 사용 중입니다. 다른 포트를 열거나 기존 프로그램을 종료하지 않습니다.':error.message);
  process.exitCode=1;
});
server.listen(port,host,()=>console.log(`MyChara preview: http://${host}:${port}${prefix}/`));
