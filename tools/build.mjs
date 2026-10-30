import {cp,mkdir,readdir,readFile,writeFile,stat,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';

const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const output=path.join(root,'dist');
if(path.dirname(output)!==root||path.basename(output)!=='dist')throw new Error('Unsafe build output');
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for(const name of ['index.html','src','vendor','THIRD_PARTY_NOTICES.md'])await cp(path.join(root,name),path.join(output,name),{recursive:true});
await cp(path.join(root,'public'),output,{recursive:true});
await writeFile(path.join(output,'.nojekyll'),'');
async function walk(dir){const result=[];for(const name of await readdir(dir)){const p=path.join(dir,name);if((await stat(p)).isDirectory())result.push(...await walk(p));else result.push(p);}return result;}
const files=await walk(output);
const manifest=[];
for(const file of files){
  const relative=path.relative(output,file).split(path.sep).join('/');
  if(!['index.html','.nojekyll','THIRD_PARTY_NOTICES.md'].includes(relative)&&!['src/','vendor/','data/','images/'].some(prefix=>relative.startsWith(prefix)))throw new Error(`Unexpected output: ${relative}`);
  const data=await readFile(file);
  manifest.push({path:relative,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
  if(relative.endsWith('.mjs')){
    const imports=[...data.toString('utf8').matchAll(/(?:from\s*|import\s*\(?\s*)['"](\.\.?\/[^'"]+)['"]/g)];
    for(const match of imports){
      const dependency=path.resolve(path.dirname(file),match[1]);
      if(!dependency.startsWith(output+path.sep))throw new Error(`Import leaves website: ${relative}`);
      if(!(await stat(dependency)).isFile())throw new Error(`Missing dependency for ${relative}: ${match[1]}`);
    }
  }
}
const {version}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const json=JSON.stringify({version,files:manifest},null,2)+'\n';
await writeFile(path.join(output,'build-manifest.json'),json);
const total=manifest.reduce((sum,x)=>sum+x.bytes,0)+Buffer.byteLength(json);
console.log(`GitHub Pages build: ${files.length+1} files, ${total.toLocaleString()} bytes (including manifest) → dist/`);
