import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const root = new URL('../', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('public/data/parts.json',root),'utf8'));
const categories = ['face','hair','hairColor','eye','skin','glasses','accent'];

test('the seven character categories have unique IDs and valid selected defaults', () => {
  assert.deepEqual(Object.keys(catalog.parts),categories);
  for (const category of categories) {
    const rows = catalog.parts[category];
    assert.ok(rows.length>0);
    assert.equal(new Set(rows.map(row=>row.id)).size,rows.length);
    assert.ok(rows.some(row=>row.id===catalog.defaults[category]));
    for (const row of rows) {
      assert.ok(Number.isSafeInteger(row.id) && row.id>=0);
      assert.ok(Number.isSafeInteger(row.hkValue) && row.hkValue>=0 && row.hkValue<=254);
      assert.ok(typeof row.name==='string' && row.name.length>0);
      assert.equal('source' in row,false);
    }
  }
});

test('proven Switch-to-HK values are not mistaken for editor IDs', () => {
  const value = (category,id) => catalog.parts[category].find(row=>row.id===id)?.hkValue;
  assert.deepEqual(catalog.parts.face.map(row=>[row.id,row.hkValue]), [[6,5],[7,6],[8,7],[9,8],[10,9]]);
  assert.equal(value('hair',1),0);
  assert.equal(value('eye',1),0);
  assert.equal(value('eye',10),9);
  assert.equal(value('hairColor',1),1);
  assert.equal(value('glasses',11),11);
  assert.deepEqual(catalog.defaultOutfit,[0,40027,40028,40029]);
  assert.deepEqual(catalog.parts.accent.map(row=>[row.id,row.hkValue]),[[0,0]]);
});

test('eye restrictions refer to real selectable face models', () => {
  const faces = new Set(catalog.parts.face.map(row=>row.model));
  assert.equal(faces.size,5);
  for (const row of catalog.parts.eye) {
    if (!row.supportedFaceModels) continue;
    assert.ok(row.supportedFaceModels.length>0);
    for (const model of row.supportedFaceModels) assert.ok(faces.has(model));
  }
});

test('all local thumbnails exist, use WebP, and the complete library stays below 500 KB', async () => {
  const images = new Set(Object.values(catalog.parts).flat().map(row=>row.image));
  let total=0;
  for (const image of images) {
    assert.match(image,/^images\/[A-Za-z0-9-]+\.webp$/);
    const url = new URL(`public/${image}`,root);
    const bytes = await readFile(url);
    assert.equal(bytes.subarray(0,4).toString(),'RIFF');
    assert.equal(bytes.subarray(8,12).toString(),'WEBP');
    assert.ok(bytes.length<10000,`${image} is too large`);
    total += (await stat(url)).size;
  }
  assert.ok(total<500000, `Thumbnail total: ${total}`);
});
test('the supplied public starter QR stays an exact, metadata-free PNG asset',async()=>{
  const png=await readFile(new URL('public/images/new-character-qr.png',root));
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16),636);assert.equal(png.readUInt32BE(20),636);
  assert.equal(createHash('sha256').update(png).digest('hex'),'805e3c9cd5a829d237a5a5758ba522f370fba142f8d182c81b817d7941c430f5');
  const chunks=[];
  for(let offset=8;offset<png.length;){const length=png.readUInt32BE(offset);chunks.push(png.toString('ascii',offset+4,offset+8));offset+=12+length;}
  assert.ok(chunks.includes('IHDR')&&chunks.includes('IDAT')&&chunks.includes('IEND'));
  assert.ok(!chunks.some(type=>['tEXt','zTXt','iTXt','eXIf'].includes(type)));
});
