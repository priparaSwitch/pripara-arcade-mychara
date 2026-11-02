import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CATEGORIES, STORAGE_KEY, createCharacter, selectPart, buildCharacterInput,
  readCharacter, writeCharacter, createGenerationGuard, identityIsValid, createPlayerCodeSelection} from '../src/app.mjs';
import {TOTAL_LIKES,MAX_LIKES} from '../src/codec.mjs';

const stableIdentity = {profileId: 123456, playerCode: '000001912345'};
function fixture() {
  const parts = Object.fromEntries(CATEGORIES.map(([key]) => [key, [{id: 1, hkValue: 0, name: key, model: 'face-a'}]]));
  parts.face.push({id: 2, hkValue: 8, name: 'second face', model: 'face-b'});
  parts.eye = [
    {id: 1, hkValue: 4, name: 'face A eye', supportedFaceModels: ['face-a']},
    {id: 2, hkValue: 5, name: 'face B eye', supportedFaceModels: ['face-b']},
  ];
  return {version: 1, parts, defaults: Object.fromEntries(CATEGORIES.map(([key]) => [key, 1])), defaultOutfit: [0, 40027, 40028, 40029]};
}
const make = (catalog = fixture(), saved) => createCharacter(catalog, saved, () => ({...stableIdentity}));

test('one blank-named character starts with known defaults and a stable identity', () => {
  const character = make();
  assert.equal(character.name, '');
  assert.deepEqual(character.identity, stableIdentity);
  assert.equal(character.likes,TOTAL_LIKES);
  assert.deepEqual(Object.keys(character.parts), CATEGORIES.map(([key]) => key));
});
test('restoring saved choices preserves the UID but discards the saved player code', () => {
  const catalog = fixture();
  const character = make(catalog); character.name = 'A★';
  selectPart(catalog, character, 'face', 2);
  const restored = createCharacter(catalog, JSON.parse(JSON.stringify(character)), () => ({profileId:99,playerCode:'000000000123'}));
  assert.equal(restored.name, 'A★'); assert.equal(restored.parts.face, 2); assert.equal(restored.parts.eye, 2);
  assert.deepEqual(restored.identity, {profileId:stableIdentity.profileId,playerCode:'000000000123'});
});
test('invalid saved identity is replaced; unsupported saved part IDs return to known defaults', () => {
  const character = make(fixture(), {name: 'Mia', identity: {profileId: 0, playerCode: '000001920094'}, parts: {hair: 999}});
  assert.equal(character.parts.hair, 1); assert.deepEqual(character.identity, stableIdentity);
  assert.equal(identityIsValid({profileId: 1, playerCode: '000001920094'}), false);
  assert.equal(identityIsValid({profileId: 255 ** 4, playerCode: '000001912345'}), false);
});
test('face changes select a compatible eye and report this secondary change', () => {
  const catalog = fixture(); const character = make(catalog);
  assert.equal(selectPart(catalog, character, 'face', 2), true);
  assert.equal(character.parts.eye, 2);
  assert.throws(() => selectPart(catalog, character, 'eye', 1), /눈매/);
});
test('unknown part selections cannot enter the QR input', () => {
  const catalog = fixture(); const character = make(catalog); character.name = 'ABC';
  assert.throws(() => selectPart(catalog, character, 'hair', 999), /파츠/);
  character.parts.hair = 999;
  assert.throws(() => buildCharacterInput(catalog, character), /파츠/);
});
test('QR input uses native appearance order, fixed lesson outfit and original identity', () => {
  const catalog = fixture(); const character = make(catalog); character.name = 'Ab1♪';
  assert.deepEqual(buildCharacterInput(catalog, character), {
    name: 'Ab1♪', appearance: [0, 0, 0, 0, 4, 0, 0, 0, 0], outfit: catalog.defaultOutfit, likes:TOTAL_LIKES, ...stableIdentity,
  });
});
test('blank, unsupported and too-long names cannot produce QR input', () => {
  const catalog = fixture(); const character = make(catalog);
  for (const name of ['', '한글', 'A B', 'ABCDEFG']) {
    character.name = name; assert.throws(() => buildCharacterInput(catalog, character));
  }
});
test('forged incompatible face and eye selection is rejected before payload creation', () => {
  const catalog = fixture(); const character = make(catalog); character.name = 'ABC'; character.parts.face = 2;
  assert.throws(() => buildCharacterInput(catalog, character), /함께/);
});
test('broken local storage recovers while storage write failures remain observable', () => {
  const storage = {getItem: () => '{bad json', setItem: () => { throw new Error('blocked'); }};
  const result = readCharacter(storage, fixture(), () => ({...stableIdentity}));
  assert.equal(result.recovered, true); assert.deepEqual(result.character.identity, stableIdentity);
  assert.equal(writeCharacter(storage, result.character), false);
});
test('local persistence saves UID, name, likes and parts but never player code or manual mode', () => {
  const saved = new Map(); const storage = {getItem: k => saved.get(k), setItem: (k, v) => saved.set(k, v)};
  const original = make(); original.name = 'Mia'; original.likes=123456;
  assert.equal(writeCharacter(storage, original), true);
  assert.deepEqual([...saved.keys()], [STORAGE_KEY]);
  const stored=JSON.parse(saved.get(STORAGE_KEY));
  assert.deepEqual(Object.keys(stored).sort(),['likes','name','parts','profileId']);
  assert.equal(stored.profileId,stableIdentity.profileId);
  const restored=readCharacter(storage,fixture(),()=>({profileId:99,playerCode:'000000000123'})).character;
  assert.deepEqual({...restored,identity:original.identity},original);
  assert.deepEqual(restored.identity,{profileId:stableIdentity.profileId,playerCode:'000000000123'});
});

test('old browser profiles gain default likes without replacing their saved UID or parts', () => {
  const original=make();original.name='Keep1';selectPart(fixture(),original,'face',2);
  const old=structuredClone(original);delete old.likes;
  const restored=createCharacter(fixture(),old,()=>({...stableIdentity}));
  assert.equal(restored.likes,TOTAL_LIKES);assert.deepEqual(restored.identity,original.identity);
  assert.deepEqual(restored.parts,original.parts);assert.equal(restored.name,original.name);
});
test('manual likes including zero survive storage and reach the QR without replacing UID', () => {
  for(const likes of [0,12345678,MAX_LIKES]){
    const saved=make();saved.name='Edit1';saved.likes=likes;
    const restored=createCharacter(fixture(),JSON.parse(JSON.stringify(saved)),()=>({...stableIdentity}));
    assert.equal(restored.likes,likes);assert.equal(buildCharacterInput(fixture(),restored).likes,likes);
    assert.deepEqual(restored.identity,stableIdentity);
  }
  for(const invalid of [-1,1.5,MAX_LIKES+1,'123',null]){
    assert.equal(createCharacter(fixture(),{...make(),likes:invalid}).likes,TOTAL_LIKES);
    assert.throws(()=>buildCharacterInput(fixture(),{...make(),name:'Edit1',likes:invalid}));
  }
});
test('random mode uses the visible candidate first and refreshes it for each later successful QR',()=>{
  const exclusions=[];const values=['000000000124','000000000125'];
  const selection=createPlayerCodeSelection('000000000123',previous=>{exclusions.push(previous);return values.shift();});
  assert.equal(selection.mode,'random');
  assert.equal(selection.prepare(),'000000000123');
  assert.equal(selection.prepare(),'000000000123');
  selection.markIssued('000000000123');
  assert.equal(selection.prepare(),'000000000124');
  selection.markIssued('000000000124');
  assert.equal(selection.prepare(),'000000000125');
  assert.deepEqual(exclusions,['000000000123','000000000124']);
});

test('manual player codes are padded and retained until random generation is selected',()=>{
  const selection=createPlayerCodeSelection('000000000124',()=> '000000000456');
  selection.edit('123');assert.equal(selection.mode,'manual');
  assert.equal(selection.normalize(),'000000000123');
  selection.markIssued(selection.prepare());
  assert.equal(selection.prepare(),'000000000123');
  assert.equal(selection.randomize(),'000000000456');assert.equal(selection.mode,'random');
  for(const bad of ['0','999999999999','abc']){selection.edit(bad);assert.throws(()=>selection.prepare());}
});

test('player-code changes preserve UID, name, likes, appearance and initial play count',()=>{
  const catalog=fixture(),character=make(catalog);character.name='Keep1';character.likes=12345;
  const original=buildCharacterInput(catalog,character);
  character.identity.playerCode='000000000123';
  const changed=buildCharacterInput(catalog,character);
  assert.deepEqual({...changed,playerCode:original.playerCode},original);
});

test('a changed character invalidates slow QR work and older failures cannot replace newer output', () => {
  const guard = createGenerationGuard(); const first = guard.start();
  guard.invalidate(); assert.equal(guard.isCurrent(first), false);
  const second = guard.start(); assert.equal(guard.isCurrent(second), true);
  assert.equal(guard.isCurrent(first), false);
});
test('static entry uses project-relative assets and has no external runtime or renderer', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/app.mjs', import.meta.url), 'utf8');
  assert.match(html, /src="\.\/src\/app\.mjs"/);
  assert.match(html, /href="\.\/src\/style\.css"/);
  assert.doesNotMatch(html, /(?:src|href)="https?:/);
  assert.ok(html.indexOf('id="character-player-code"')<html.indexOf('id="random-player-code"'));
  assert.ok(html.indexOf('id="random-player-code"')<html.indexOf('id="character-name"'));
  assert.doesNotMatch(html,/같은 브라우저에서는 플레이어 코드가 유지/);
  assert.match(app, /await import\('\.\/qr\.mjs'\)/);
  assert.doesNotMatch(app, /WebGL|three\.js|\/api\//);
});
