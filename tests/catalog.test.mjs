import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';

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
