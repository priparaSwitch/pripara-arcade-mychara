import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {ALLOWED_NAME_CHARACTERS,MAX_PROFILE_ID,MAX_NATIVE_MAKE_ID,TOTAL_LIKES,INITIAL_PLAY_COUNT,MAX_LIKES,parseLikesInput,
  buildPayload,decodePayload,packBody,unpackPayload,validateName,validatePlayerCode,
  encodeNumber,decodeNumber,createIdentity} from '../src/codec.mjs';
import {createQrMatrix,matrixToSvg,renderQr} from '../src/qr.mjs';
const vectors=JSON.parse(await fs.readFile(new URL('./fixtures/myticket-vectors.json',import.meta.url),'utf8')).cases;
const sample=()=>structuredClone(vectors[0].input);
test('48 independent Python vectors preserve every binary byte and decoded field',()=>{
  for(const item of vectors){
    const bytes=buildPayload(item.input);
    assert.equal(Buffer.from(bytes).toString('hex'),item.hex);
    assert.deepEqual(decodePayload(bytes),item.decoded);
    assert.deepEqual(packBody(unpackPayload(bytes)),bytes);
  }
});
test('fixed likes/date, initial play count and empty remaining fields match the generator',()=>{
  const input=sample(),bytes=buildPayload(input),body=unpackPayload(bytes),decoded=decodePayload(bytes);
  assert.equal(decoded.likes,TOTAL_LIKES);assert.equal(decoded.rankUpLikePoint,20000000);
  assert.equal(INITIAL_PLAY_COUNT,1);assert.equal(decoded.totalPlays,1);
  assert.deepEqual(decoded.recordedDate,[2026,10,29]);assert.equal(decoded.timeSupported,false);
  const controlled=new Set([...[...Array(20)].map((_,i)=>i+4),26,27,28,...[...Array(8)].map((_,i)=>i+29),48,49,50,58,...[...Array(9)].map((_,i)=>i+66),...[...Array(12)].map((_,i)=>i+105)]);
  for(let i=4;i<119;i++)if(!controlled.has(i))assert.equal(body[i],1,`unrequested field ${i}`);
  assert.equal(decoded.type,2);assert.equal(decoded.version,3);
});

test('new QR avoids the first-play reset while retaining identity and other profile fields',()=>{
  const current=buildPayload(sample()),currentBody=unpackPayload(current);
  const legacyBody=new Uint8Array(currentBody);
  legacyBody.set(encodeNumber(0,3),26);
  const legacy=packBody(legacyBody),before=decodePayload(legacy),after=decodePayload(current);
  assert.equal(before.totalPlays,0);assert.equal(after.totalPlays,1);
  assert.equal(after.profileId,before.profileId);assert.equal(after.makeId,before.makeId);
  assert.equal(after.playerCode,before.playerCode);
  assert.deepEqual({...after,totalPlays:0},before);
  const decodedLegacyBody=unpackPayload(legacy);
  const differences=[...currentBody].flatMap((value,index)=>value!==decodedLegacyBody[index]?[index]:[]);
  assert.deepEqual(differences,[28,119]);
});
test('manual likes update cumulative and rank points while preserving plays and the profile',()=>{
  const original=decodePayload(buildPayload(sample()));
  for(const likes of [0,1,254,255,12345678,MAX_LIKES]){
    const next=decodePayload(buildPayload({...sample(),likes}));
    assert.equal(next.likes,likes);assert.equal(next.rankUpLikePoint,likes);
    assert.deepEqual({...next,likes:original.likes,rankUpLikePoint:original.rankUpLikePoint},original);
    assert.equal(next.totalPlays,1);assert.equal(next.checksumValid,true);
  }
  for(const likes of [-1,1.5,MAX_LIKES+1,Infinity,NaN,true,null,'123'])assert.throws(()=>buildPayload({...sample(),likes}));
});
test('likes input accepts complete decimal integers and rejects empty, fractions and overflow',()=>{
  for(const [text,expected] of [['0',0],['0001',1],['20000000',20000000],[' 12345678 ',12345678],[String(MAX_LIKES),MAX_LIKES]])assert.equal(parseLikesInput(text),expected);
  for(const text of ['',' ','-1','1.5','1e3','NaN','20,000,000',String(MAX_LIKES+1),null,true])assert.throws(()=>parseLikesInput(text));
});
test('only the screenshot character set is allowed and names never silently change',()=>{
  const expected='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ!?abcdefghijklmnopqrstuvwxyz★☆♪';
  assert.equal(ALLOWED_NAME_CHARACTERS,expected);
  for(const c of expected)assert.equal(validateName(c).length,6);
  assert.deepEqual(validateName('A!?★☆♪'),[201,413,414,415,416,412]);
  assert.deepEqual(validateName('Ab0'),[201,302,400,0,0,0]);
  for(const bad of ['', '1234567', 'a b','♥','♡','한글','あ','Ａ','！','-','~','\n',null,123,'😀'])assert.throws(()=>validateName(bad));
});
test('all radix255 boundaries round-trip without zero bytes',()=>{
  for(let width=1;width<=4;width++)for(const n of [0,1,254,255**width-1]){
    if(n>255**width-1)continue;
    const bytes=encodeNumber(n,width);assert.equal(bytes.length,width);assert.ok(!bytes.includes(0));assert.equal(decodeNumber(bytes),n);
  }
  for(const bad of [true,1.5,-1,NaN,Infinity])assert.throws(()=>encodeNumber(bad,4));
  assert.throws(()=>decodeNumber(new Uint8Array([0])));
});
test('player codes use native twelve-digit format and exclude new-character sentinel',()=>{
  for(const code of ['000001900000','000001900001','000001950000','000001999999']){
    const input=sample();input.playerCode=code;
    assert.equal(decodePayload(buildPayload(input)).gamePlayerCode,code);
    assert.ok(validatePlayerCode(code)>0&&validatePlayerCode(code)<=MAX_NATIVE_MAKE_ID);
  }
  for(const code of ['000001920094','000001900000000','000001899999','000002000000','1900000','00000190000','000001900000 ','0000019１２３４５','',1900000,true])assert.throws(()=>validatePlayerCode(code));
});
test('identity generator rejects biased high values and make-zero sentinel',()=>{
  const words=[0xffffffff,123,0xffffffff,20094,3];
  const identity=createIdentity(out=>{out[0]=words.shift();});
  assert.deepEqual(identity,{profileId:124,playerCode:'000001900003'});
  assert.equal(words.length,0);
  assert.throws(()=>createIdentity(out=>{out[0]=0xffffffff;}));
});
test('crypto identities are independent and nonzero',()=>{
  const identities=Array.from({length:24},()=>createIdentity());
  assert.equal(new Set(identities.map(x=>x.profileId)).size,24);
  for(const identity of identities){assert.ok(identity.profileId>0&&identity.profileId<=MAX_PROFILE_ID);assert.ok(validatePlayerCode(identity.playerCode)>0);}
});
test('encoding does not mutate the character or identity and edits preserve assigned IDs',()=>{
  const original=sample(),before=structuredClone(original);
  buildPayload(original);assert.deepEqual(original,before);
  const next={...original,name:'New1',appearance:[...original.appearance]};next.appearance[1]=42;
  const old=decodePayload(buildPayload(original)),current=decodePayload(buildPayload(next));
  assert.equal(current.profileId,old.profileId);assert.equal(current.playerCode,old.playerCode);assert.equal(current.name,'New1');
});
test('numeric overflow, booleans, wrong array lengths, missing identity fail closed',()=>{
  for(const value of [0,-1,MAX_PROFILE_ID+1,true,1.5,undefined,NaN])assert.throws(()=>buildPayload({...sample(),profileId:value}));
  for(const value of [255,-1,true,1.5,NaN])assert.throws(()=>buildPayload({...sample(),appearance:[...Array(8).fill(0),value]}));
  for(const value of [65025,-1,true,1.5,NaN])assert.throws(()=>buildPayload({...sample(),outfit:[0,0,0,value]}));
  for(const value of [[],Array(8).fill(0),Array(10).fill(0),null])assert.throws(()=>buildPayload({...sample(),appearance:value}));
  for(const value of [[],Array(3).fill(0),Array(5).fill(0),null])assert.throws(()=>buildPayload({...sample(),outfit:value}));
});
test('truncated and corrupted tickets are rejected',()=>{
  const raw=buildPayload(sample());
  for(const bad of [raw.slice(0,120),new Uint8Array(122),new Uint8Array(121)])assert.throws(()=>unpackPayload(bad));
  for(const index of [0,16,29,66,105,119]){
    const bad=new Uint8Array(raw);bad[index]=((bad[index]+1)%255)||1;assert.throws(()=>unpackPayload(bad));
  }
});
test('binary QR uses version7 dimensions and four-module white border at integer scale',()=>{
  const matrix=createQrMatrix(buildPayload(sample()));
  assert.equal(matrix.length,45);assert.ok(matrix.every(row=>row.length===45));
  const output=matrixToSvg(matrix);assert.equal(output.pixelSize,636);
  assert.match(output.svgText,/viewBox="0 0 53 53"/);assert.match(output.svgText,/shape-rendering="crispEdges"/);
  assert.match(output.svgText,/fill="#fff" d="M0 0h53v53H0z"/);
  assert.throws(()=>createQrMatrix(new Uint8Array(122)));assert.throws(()=>createQrMatrix('text'));
});
test('PNG rendering paints exact opaque modules without interpolation',async()=>{
  const previous=globalThis.document;const calls=[];
  const context={fillStyle:'',fillRect(x,y,w,h){calls.push({color:this.fillStyle,x,y,w,h});}};
  const canvas={getContext:()=>context,toDataURL:type=>`data:${type};base64,SYNTHETIC`};
  globalThis.document={createElement:tag=>{assert.equal(tag,'canvas');return canvas;}};
  try{
    const result=await renderQr(buildPayload(sample()));
    assert.equal(canvas.width,636);assert.equal(canvas.height,636);assert.equal(result.pixelSize,636);
    assert.equal(result.pngDataUrl,'data:image/png;base64,SYNTHETIC');
    assert.deepEqual(calls[0],{color:'#fff',x:0,y:0,w:636,h:636});
    for(const c of calls.slice(1)){assert.equal(c.color,'#000');assert.equal(c.w,12);assert.equal(c.h,12);assert.ok(c.x>=48&&c.y>=48&&c.x<588&&c.y<588);assert.equal(c.x%12,0);assert.equal(c.y%12,0);}
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
