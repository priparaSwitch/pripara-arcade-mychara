import {validateName, buildPayload, createIdentity} from './codec.mjs';

export const CATEGORIES = Object.freeze([
  ['face', '눈매'], ['hair', '헤어스타일'], ['hairColor', '헤어컬러'],
  ['eye', '아이컬러'], ['skin', '피부색'], ['glasses', '안경'], ['accent', '원포인트'],
]);
export const STORAGE_KEY = 'pripara-arcade-mychara:v1';

export function identityIsValid(identity) {
  return identity && Number.isInteger(identity.profileId) && identity.profileId > 0 &&
    identity.profileId < 255 ** 4 && /^0000019\d{5}$/.test(identity.playerCode) &&
    identity.playerCode !== '000001920094';
}

export function selectedRow(catalog, character, category) {
  return catalog.parts[category].find(row => row.id === character.parts[category]);
}

export function eyeCompatible(eye, face) {
  return !eye.supportedFaceModels?.length || eye.supportedFaceModels.includes(face.model);
}

export function createCharacter(catalog, saved, identityFactory = createIdentity) {
  const character = {
    name: typeof saved?.name === 'string' ? [...saved.name].slice(0, 6).join('') : '',
    parts: {},
    identity: identityIsValid(saved?.identity) ? {...saved.identity} : identityFactory(),
  };
  for (const [category] of CATEGORIES) {
    const rows = catalog.parts[category];
    if (!Array.isArray(rows) || !rows.length) throw new Error('파츠 목록을 확인할 수 없어요. 페이지를 다시 불러와 주세요.');
    const savedId = saved?.parts?.[category];
    character.parts[category] = rows.some(row => row.id === savedId) ? savedId :
      rows.find(row => row.id === catalog.defaults[category])?.id ?? rows[0].id;
  }
  ensureCompatibleEye(catalog, character);
  return character;
}

function ensureCompatibleEye(catalog, character) {
  const face = selectedRow(catalog, character, 'face');
  const eye = selectedRow(catalog, character, 'eye');
  if (eyeCompatible(eye, face)) return false;
  const replacement = catalog.parts.eye.find(row => eyeCompatible(row, face));
  if (!replacement) throw new Error('이 눈매와 함께 사용할 수 있는 아이컬러가 없어요.');
  character.parts.eye = replacement.id;
  return true;
}

export function selectPart(catalog, character, category, id) {
  const row = catalog.parts[category]?.find(item => item.id === id);
  if (!row) throw new Error('홍콩판에서 사용할 수 없는 파츠예요.');
  if (category === 'eye' && !eyeCompatible(row, selectedRow(catalog, character, 'face'))) {
    throw new Error('이 눈매에서는 사용할 수 없는 아이컬러예요.');
  }
  character.parts[category] = id;
  return category === 'face' && ensureCompatibleEye(catalog, character);
}

export function buildCharacterInput(catalog, character) {
  validateName(character.name);
  if (!identityIsValid(character.identity)) throw new Error('플레이어 코드를 확인할 수 없어요. 페이지를 다시 불러와 주세요.');
  const values = {};
  for (const [category] of CATEGORIES) {
    const row = selectedRow(catalog, character, category);
    if (!row || !Number.isInteger(row.hkValue) || row.hkValue < 0 || row.hkValue > 254) {
      throw new Error('홍콩판에서 사용할 수 없는 파츠가 있어요.');
    }
    values[category] = row.hkValue;
  }
  if (!eyeCompatible(selectedRow(catalog, character, 'eye'), selectedRow(catalog, character, 'face'))) {
    throw new Error('이 눈매와 아이컬러는 함께 사용할 수 없어요.');
  }
  return {
    name: character.name,
    appearance: [values.face, values.hair, values.hairColor, values.skin, values.eye, values.glasses, 0, values.accent, 0],
    outfit: [...catalog.defaultOutfit],
    ...character.identity,
  };
}

export function readCharacter(storage, catalog, identityFactory = createIdentity) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return {character: createCharacter(catalog, raw ? JSON.parse(raw) : null, identityFactory), recovered: false};
  } catch {
    return {character: createCharacter(catalog, null, identityFactory), recovered: true};
  }
}

export function writeCharacter(storage, character) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(character)); return true; } catch { return false; }
}

export function createGenerationGuard() {
  let version = 0;
  return {invalidate: () => ++version, start: () => ++version, isCurrent: token => token === version};
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function makeThumbnail(row, className, lazy = true) {
  if (!row.image) return element('span', `${className} no-thumbnail`, '—');
  const img = element('img', className);
  img.src = new URL(row.image, document.baseURI).href;
  img.alt = '';
  img.width = 96; img.height = 96;
  img.loading = lazy ? 'lazy' : 'eager';
  img.decoding = 'async';
  return img;
}

export async function startApp() {
  const $ = id => document.getElementById(id);
  let storage;
  try { storage = window.localStorage; } catch { storage = null; }
  const response = await fetch(new URL('../data/parts.json', import.meta.url));
  if (!response.ok) throw new Error('파츠 목록을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.');
  const catalog = await response.json();
  const restored = readCharacter(storage, catalog);
  const character = restored.character;
  const generation = createGenerationGuard();
  let active = 'face';
  let generating = false;
  let output = null;

  function persist() {
    const saved = writeCharacter(storage, character);
    $('storage-note').textContent = saved ?
      '이름과 선택한 파츠는 이 브라우저에만 저장돼요.' :
      '이 브라우저에서는 저장할 수 없어요. 페이지를 닫기 전에 만든 QR을 보관해 주세요.';
    document.getElementById('identity-note').textContent = saved ?
      '같은 브라우저에서는 플레이어 코드가 유지돼요. 다른 기기에서 이어서 쓰려면 만든 QR을 보관해 주세요.' :
      '이 브라우저에서는 플레이어 코드를 저장할 수 없어요. 만든 QR을 보관해서 이어서 사용해 주세요.';
  }

  function updateNameError(force = false) {
    $('name-count').textContent = `${[...character.name].length} / 6`;
    let error = '';
    try { validateName(character.name); } catch (reason) { if (force || character.name) error = reason.message; }
    $('name-error').textContent = error;
    $('name-error').hidden = !error;
    $('character-name').setAttribute('aria-invalid', error ? 'true' : 'false');
    return !error && character.name.length > 0;
  }

  function invalidateOutput() {
    generation.invalidate(); generating = false; output = null;
    $('generate').disabled = false;
    $('generate').textContent = '✦ 홍콩판 QR 만들기';
    $('qr-image').hidden = true; $('qr-image').removeAttribute('src');
    $('qr-empty').hidden = false; $('qr-details').hidden = true;
    $('download').removeAttribute('href'); $('download').removeAttribute('download');
    $('download').classList.add('disabled'); $('download').setAttribute('aria-disabled', 'true');
    $('copy').disabled = true;
    $('qr-state').textContent = '준비';
    $('qr-name').textContent = '홍콩판 마이캐릭터';
    $('qr-description').textContent = '이름과 선택한 파츠로 QR을 만들어요. 좋아요는 20,000,000으로 설정돼요.';
    $('qr-status').hidden = true;
  }

  function showSelection(message) {
    $('selection-status').textContent = message;
    $('selection-status').hidden = !message;
  }

  function showCategory(category, focusTab = false) {
    active = category;
    $('part-search').value = '';
    for (const [key] of CATEGORIES) {
      const tab = $(`tab-${key}`);
      tab.setAttribute('aria-selected', key === active ? 'true' : 'false');
      tab.tabIndex = key === active ? 0 : -1;
    }
    $('category-title').textContent = CATEGORIES.find(([key]) => key === active)[1];
    $('part-grid').setAttribute('aria-labelledby', `tab-${active}`);
    if (focusTab) $(`tab-${active}`).focus();
    renderGrid();
  }

  function renderSelected() {
    const fragment = document.createDocumentFragment();
    for (const [category, label] of CATEGORIES) {
      const row = selectedRow(catalog, character, category);
      const button = element('button', 'selected-part');
      button.type = 'button';
      button.setAttribute('aria-label', `${label} ${row.name} 변경`);
      button.append(makeThumbnail(row, 'selected-thumb', false));
      const text = element('span', 'selected-text');
      text.append(element('span', 'selected-label', label), element('strong', '', row.name));
      button.append(text, element('span', 'selected-arrow', '›'));
      button.addEventListener('click', () => {
        showCategory(category, true);
        $('picker-title').scrollIntoView({block: 'start', behavior: 'auto'});
      });
      fragment.append(button);
    }
    $('selected-parts').replaceChildren(fragment);
  }

  function renderGrid(focusId) {
    const query = $('part-search').value.trim().toLocaleLowerCase();
    const rows = catalog.parts[active].filter(row =>
      `${row.name} ${row.nameJa || ''} ${row.id}`.toLocaleLowerCase().includes(query));
    const face = selectedRow(catalog, character, 'face');
    const fragment = document.createDocumentFragment();
    let focusedButton;
    for (const row of rows) {
      const button = element('button', 'part-card');
      const compatible = active !== 'eye' || eyeCompatible(row, face);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(character.parts[active] === row.id));
      button.setAttribute('aria-label', `${row.name} · ID ${row.id}` + (compatible ? '' : ' · 현재 눈매에서 사용 불가'));
      button.disabled = !compatible;
      const photo = element('span', 'part-photo');
      photo.append(makeThumbnail(row, 'part-thumb'));
      photo.append(element('span', 'selected-check', '✓'));
      button.append(photo, element('span', 'part-name', row.name));
      const metadata = element('span', 'part-meta');
      metadata.append(element('span', 'part-id', `ID ${row.id}`));
      if (row.nameJa) {
        metadata.append(element('span', 'part-meta-separator', '·'));
        const ja = element('span', 'part-japanese', row.nameJa); ja.lang = 'ja'; metadata.append(ja);
      }
      button.append(metadata);
      if (!compatible) button.append(element('span', 'incompatible-note', '다른 눈매용'));
      button.addEventListener('click', () => {
        const eyeChanged = selectPart(catalog, character, active, row.id);
        invalidateOutput(); persist(); renderSelected(); renderGrid(row.id);
        showSelection(eyeChanged ? '선택한 눈매에 맞는 아이컬러로 함께 변경했어요.' : '');
      });
      if (row.id === focusId) focusedButton = button;
      fragment.append(button);
    }
    $('part-grid').replaceChildren(fragment);
    $('category-count').textContent = query ? `${rows.length} / ${catalog.parts[active].length}개` : `${rows.length}개`;
    $('no-parts').hidden = rows.length > 0;
    focusedButton?.focus({preventScroll: true});
  }

  for (const [category, label] of CATEGORIES) {
    const button = element('button', 'category-tab', label);
    button.id = `tab-${category}`; button.type = 'button';
    button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', 'part-grid');
    button.addEventListener('click', () => showCategory(category));
    button.addEventListener('keydown', event => {
      const index = CATEGORIES.findIndex(([key]) => key === category);
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % CATEGORIES.length;
      else if (event.key === 'ArrowLeft') next = (index + CATEGORIES.length - 1) % CATEGORIES.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = CATEGORIES.length - 1;
      if (next !== undefined) { event.preventDefault(); showCategory(CATEGORIES[next][0], true); }
    });
    $('category-tabs').append(button);
  }
  $('total-count').textContent = `${CATEGORIES.reduce((total, [key]) => total + catalog.parts[key].length, 0)} PARTS`;
  $('character-name').value = character.name;
  $('character-name').addEventListener('input', event => {
    character.name = event.target.value;
    updateNameError(); invalidateOutput(); persist();
  });
  document.querySelectorAll('[data-character]').forEach(button => button.addEventListener('click', () => {
    const input = $('character-name');
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const next = input.value.slice(0, start) + button.dataset.character + input.value.slice(end);
    if ([...next].length <= 6) {
      input.value = next; character.name = next;
      input.setSelectionRange(start + 1, start + 1);
      updateNameError(); invalidateOutput(); persist();
    }
    input.focus();
  }));
  $('part-search').addEventListener('input', renderGrid);

  $('generate').addEventListener('click', async () => {
    if (generating) return;
    if (!updateNameError(true)) { $('character-name').focus(); return; }
    invalidateOutput();
    const token = generation.start(); generating = true;
    $('generate').disabled = true; $('generate').textContent = 'QR을 만들고 있어요…';
    $('qr-status').hidden = false; $('qr-status').textContent = '이 기기에서 QR을 만들고 있어요.';
    $('qr-status').classList.remove('error');
    try {
      const input = buildCharacterInput(catalog, character);
      const payload = buildPayload(input);
      const {renderQr} = await import('./qr.mjs');
      const result = await renderQr(payload);
      if (!generation.isCurrent(token)) return;
      output = result;
      $('qr-image').src = result.pngDataUrl; $('qr-image').hidden = false;
      $('qr-empty').hidden = true; $('qr-details').hidden = false;
      $('qr-name').textContent = character.name;
      $('qr-description').textContent = '선택한 파츠로 만들었어요. PNG를 저장해서 사용해 주세요.';
      $('player-code').textContent = character.identity.playerCode;
      $('download').href = result.pngDataUrl;
      $('download').download = `mychara-${character.name.replace(/[^A-Za-z0-9]/g, '_')}.png`;
      $('download').classList.remove('disabled'); $('download').setAttribute('aria-disabled', 'false');
      $('copy').disabled = false; $('copy').textContent = '이미지 복사';
      $('qr-state').textContent = '완성';
      $('qr-status').textContent = 'QR이 완성됐어요.';
      $('qr-panel').scrollIntoView({block: 'nearest', behavior: 'auto'});
    } catch (error) {
      if (!generation.isCurrent(token)) return;
      $('qr-status').textContent = error.message || 'QR을 만들지 못했어요. 다시 시도해 주세요.';
      $('qr-status').classList.add('error');
    } finally {
      if (generation.isCurrent(token)) {
        generating = false; $('generate').disabled = false;
        $('generate').textContent = '✦ 홍콩판 QR 만들기';
      }
    }
  });

  $('copy').addEventListener('click', async () => {
    if (!output) return;
    const currentOutput = output;
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('unsupported');
      const binary = atob(currentOutput.pngDataUrl.split(',')[1]);
      const data = Uint8Array.from(binary, value => value.charCodeAt(0));
      await navigator.clipboard.write([new ClipboardItem({'image/png': new Blob([data], {type: 'image/png'})})]);
      if (output === currentOutput) $('copy').textContent = '복사했어요';
    } catch {
      if (output !== currentOutput) return;
      $('qr-status').hidden = false;
      $('qr-status').textContent = '이 브라우저에서는 복사가 어려워요. PNG 저장을 눌러 주세요.';
    }
  });

  renderSelected(); showCategory('face'); updateNameError(); persist();
  if (restored.recovered) showSelection('저장된 정보를 읽지 못해 기본 파츠로 시작했어요.');
  $('load-status').hidden = true; $('retry').hidden = true; $('workspace').hidden = false;
}

if (typeof document !== 'undefined') {
  startApp().catch(error => {
    const message = document.getElementById('load-status');
    message.textContent = error.message || '페이지를 준비하지 못했어요. 다시 불러와 주세요.';
    message.classList.add('error');
    document.getElementById('retry').hidden = false;
  });
  document.getElementById('retry').addEventListener('click', () => window.location.reload());
}
