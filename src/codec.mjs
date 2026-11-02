// Independently recovered HK v3 App MyTicket format; no source game assets needed.
export const TOTAL_LIKES = 20_000_000;
export const MAX_LIKES = 255 ** 4 - 1;
// A zero play count triggers the game's first-play identity reset after login.
export const INITIAL_PLAY_COUNT = 1;
export const RECORDED_DATE = Object.freeze([2026, 10, 29]);
export const MAX_PROFILE_ID = 255 ** 4 - 1;
export const MAX_NATIVE_MAKE_ID = 255 ** 3 - 1;
export const PLAYER_CODE_XOR = 0x1D4C5E;
export const ALLOWED_NAME_CHARACTERS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ!?abcdefghijklmnopqrstuvwxyz★☆♪';
const NAME_CODES = new Map([['!',413],['?',414],['★',415],['☆',416],['♪',412]]);
for (let i=0;i<26;i++) { NAME_CODES.set(String.fromCharCode(65+i),201+i); NAME_CODES.set(String.fromCharCode(97+i),301+i); }
for (let i=0;i<10;i++) NAME_CODES.set(String(i),400+i);
const CODE_NAMES = new Map([...NAME_CODES].map(([name,code])=>[code,name]));
const SWAPS = [[[41,58],[39,37],[3,19],[40,50],[46,98],[55,17],[112,80],[105,69],[111,87],[43,10],[38,84],[117,6],[108,99],[8,56],[116,30],[12,51],[13,63],[86,49],[91,32],[61,21]],[[98,45],[6,30],[43,29],[100,14],[3,10],[13,115],[70,74],[50,83],[91,42],[68,89],[52,73],[71,55],[66,87],[105,113],[110,97],[11,90],[62,38],[107,20],[85,35],[18,25]],[[50,76],[70,58],[101,63],[57,25],[97,69],[67,6],[22,68],[26,109],[88,79],[83,66],[18,107],[110,35],[54,82],[62,64],[44,39],[15,108],[8,40],[23,48],[36,4],[104,45]],[[68,55],[28,104],[84,64],[96,116],[79,83],[20,8],[107,112],[100,77],[37,53],[14,26],[9,69],[105,111],[117,6],[81,35],[72,45],[41,51],[71,70],[90,39],[99,38],[21,78]],[[90,32],[26,57],[18,17],[73,46],[61,76],[67,66],[111,20],[96,119],[54,7],[55,14],[107,34],[81,80],[4,58],[75,33],[10,118],[116,60],[48,85],[69,30],[56,92],[49,113]],[[39,103],[12,8],[37,53],[42,3],[66,112],[14,27],[34,48],[33,110],[7,76],[29,9],[13,43],[74,99],[88,50],[97,114],[85,87],[41,31],[109,19],[6,101],[58,63],[68,119]],[[26,74],[12,7],[25,100],[62,115],[89,66],[30,43],[82,83],[46,103],[81,27],[56,76],[32,36],[10,73],[63,21],[49,38],[119,64],[3,104],[57,84],[101,19],[117,58],[45,52]],[[9,45],[114,40],[92,62],[78,80],[32,31],[49,63],[65,119],[37,12],[85,23],[57,68],[58,7],[46,61],[98,60],[30,91],[83,88],[50,79],[28,10],[11,5],[77,89],[64,101]],[[112,47],[38,6],[117,107],[9,62],[11,49],[85,36],[63,72],[91,75],[90,88],[73,37],[74,77],[96,33],[103,23],[60,53],[20,64],[27,66],[50,3],[71,70],[41,14],[51,4]],[[41,49],[68,77],[39,118],[55,45],[65,40],[90,19],[112,60],[85,33],[113,117],[98,17],[97,102],[64,106],[3,72],[116,43],[57,4],[56,47],[109,36],[70,82],[67,30],[9,86]]];

export class QrValidationError extends Error {
  constructor(message) { super(message); this.name='QrValidationError'; }
}
function integer(value,minimum,maximum,label) {
  if (!Number.isInteger(value)||value<minimum||value>maximum) throw new QrValidationError(`${label}: ${minimum}~${maximum} 범위의 정수가 필요합니다.`);
  return value;
}
export function encodeNumber(value,width) {
  integer(width,1,4,'width'); integer(value,0,255**width-1,'value');
  const result=new Uint8Array(width);
  for(let i=width-1;i>=0;i--) { result[i]=value%255+1;value=Math.floor(value/255); }
  return result;
}
export function decodeNumber(bytes) {
  if (!(bytes instanceof Uint8Array)||!bytes.length||bytes.some(v=>v===0)) throw new QrValidationError('잘못된 radix-255 숫자입니다.');
  return bytes.reduce((n,d)=>n*255+d-1,0);
}
export function validateLikes(value) {
  return integer(value,0,MAX_LIKES,'좋아요');
}
export function parseLikesInput(text) {
  if(typeof text!=='string'||!/^\d+$/.test(text.trim()))throw new QrValidationError('좋아요는 0 이상의 정수로 입력해 주세요.');
  return validateLikes(Number(text.trim()));
}
export function validateName(name) {
  if(typeof name!=='string'||[...name].length<1||[...name].length>6) throw new QrValidationError('이름은 홍콩판에서 지원하는 문자 1~6자로 입력해 주세요.');
  const invalid=[...new Set([...name].filter(c=>!NAME_CODES.has(c)))];
  if(invalid.length) throw new QrValidationError(`이름에 지원하지 않는 문자가 있습니다: ${invalid.join(' ')}`);
  const result=[...name].map(c=>NAME_CODES.get(c));
  return [...result,...Array(6-result.length).fill(0)];
}
export function normalizePlayerCode(code) {
  if(typeof code!=='string'||!/^\d{1,12}$/.test(code.trim())) throw new QrValidationError('플레이어 코드는 숫자 1~12자리로 입력해 주세요.');
  const normalized=code.trim().padStart(12,'0');
  if(Number(normalized)===0) throw new QrValidationError('000000000000은 사용할 수 없어요. 다른 번호를 입력하거나 임의생성을 눌러 주세요.');
  // App MyTicket has no display-manager field. Check before XOR so JS cannot
  // silently truncate an unsupported 12-digit number into a different identity.
  if(Number(normalized)>0xFFFFFF) throw new QrValidationError('홍콩판 QR에서 유지할 수 없는 번호예요. 임의생성으로 사용할 수 있는 번호를 만들어 주세요.');
  const makeId=Number(normalized)^PLAYER_CODE_XOR;
  if(makeId===0) throw new QrValidationError('000001920094는 게임에서 신규 캐릭터로 처리되므로 사용할 수 없습니다.');
  if(makeId>MAX_NATIVE_MAKE_ID) throw new QrValidationError('홍콩판 QR에서 유지할 수 없는 번호예요. 임의생성으로 사용할 수 있는 번호를 만들어 주세요.');
  return normalized;
}
export function validatePlayerCode(code) {
  return Number(normalizePlayerCode(code))^PLAYER_CODE_XOR;
}
function randomBelow(maximum,fillRandom) {
  const cap=Math.floor(2**32/maximum)*maximum;
  const words=new Uint32Array(1);
  for(let retry=0;retry<1000;retry++) {
    fillRandom(words);
    if(words[0]<cap)return words[0]%maximum;
  }
  throw new QrValidationError('안전한 캐릭터 번호를 만들지 못했어요. 다시 시도해 주세요.');
}
export function createIdentity(fillRandom=(words)=>globalThis.crypto.getRandomValues(words)) {
  const profileId=randomBelow(MAX_PROFILE_ID,fillRandom)+1;
  return {profileId,playerCode:randomPlayerCode('',fillRandom)};
}
export function randomPlayerCode(exclude='',fillRandom=(words)=>globalThis.crypto.getRandomValues(words)) {
  for(let retry=0;retry<1000;retry++) {
    const makeId=randomBelow(MAX_NATIVE_MAKE_ID,fillRandom)+1;
    const number=makeId^PLAYER_CODE_XOR;
    const playerCode=String(number).padStart(12,'0');
    if(number!==0&&playerCode!==exclude)return playerCode;
  }
  throw new QrValidationError('캐릭터 번호를 만들지 못했어요. 다시 시도해 주세요.');
}
function family(bytes) {
  const selector=bytes[58]-2;
  return selector>=92&&selector<=94&&bytes[selector] ? (bytes[selector]-1)%10:0;
}
function validBody(body) {
  return body[0]===85&&body[1]===73&&body[2]===4&&[2,3,4].includes(body[3])&&!body.subarray(0,119).includes(0);
}
function checkBytes(value,label) {
  if(!(value instanceof Uint8Array)||value.length!==121) throw new QrValidationError(`${label}은 121바이트여야 합니다.`);
}
const sum = bytes=>bytes.reduce((a,b)=>a+b,0);
export function packBody(body) {
  checkBytes(body,'HK 앱 티켓 본문');
  if(!validBody(body))throw new QrValidationError('지원하지 않는 HK 앱 티켓 본문입니다.');
  const result=new Uint8Array(body);
  result[119]=sum(result.subarray(0,60))%255+1;
  result[120]=sum(result.subarray(60,119))%255+1;
  for(const[a,b]of SWAPS[family(result)])[result[a-1],result[b-1]]=[result[b-1],result[a-1]];
  return result;
}
export function unpackPayload(payload) {
  checkBytes(payload,'HK 앱 티켓');
  const body=new Uint8Array(payload);
  for(const[a,b]of [...SWAPS[family(body)]].reverse())[body[a-1],body[b-1]]=[body[b-1],body[a-1]];
  if(!validBody(body)||body[119]!==sum(body.subarray(0,60))%255+1||body[120]!==sum(body.subarray(60,119))%255+1) throw new QrValidationError('HK 앱 티켓 검증값 또는 헤더가 올바르지 않습니다.');
  return body;
}
export function buildPayload({name,appearance,outfit,profileId,playerCode,likes=TOTAL_LIKES}) {
  const nameCodes=validateName(name);
  if(!Array.isArray(appearance)||appearance.length!==9) throw new QrValidationError('홍콩판 외형 값은 정확히 9개가 필요합니다.');
  if(!Array.isArray(outfit)||outfit.length!==4) throw new QrValidationError('홍콩판 코디 값은 정확히 4개가 필요합니다.');
  appearance.forEach((value,index)=>integer(value,0,254,`외형 ${index+1}`));
  outfit.forEach((value,index)=>integer(value,0,65024,`코디 ${index+1}`));
  integer(profileId,1,MAX_PROFILE_ID,'profile_id');
  const makeId=validatePlayerCode(playerCode);
  validateLikes(likes);
  const body=new Uint8Array(121).fill(1);
  body.set([85,73,4,3]);
  [outfit[1],outfit[2],outfit[3],outfit[0]].forEach((value,index)=>body.set(encodeNumber(value,2),[4,7,10,13][index]));
  body.set(encodeNumber(profileId,4),16);
  body.set(encodeNumber(makeId,4),20);
  body.set(encodeNumber(INITIAL_PLAY_COUNT,3),26);
  body.set(encodeNumber(likes,4),29);
  body.set(encodeNumber(likes,4),33);
  body.set([27,11,30],48);
  body[58]=94;
  body.set(appearance.map(v=>v+1),66);
  nameCodes.forEach((value,index)=>body.set(encodeNumber(value,2),105+index*2));
  return packBody(body);
}
export function decodePayload(payload) {
  const body=unpackPayload(payload);
  const num=(offset,width)=>decodeNumber(body.subarray(offset,offset+width));
  const nameCodes=Array.from({length:6},(_,i)=>num(105+i*2,2));
  const makeId=num(20,4);
  const normalizedMakeId=Math.min(makeId,MAX_NATIVE_MAKE_ID);
  const playerCode=String(normalizedMakeId?(normalizedMakeId^PLAYER_CODE_XOR):0).padStart(12,'0');
  return {
    name:nameCodes.filter(Boolean).map(code=>CODE_NAMES.get(code)??`[code:${code}]`).join(''),
    nameCodes,profileId:num(16,4),makeId,playerCode,gamePlayerCode:playerCode,displayManager:0,normalizedMakeId,
    type:num(3,1),version:num(2,1),totalPlays:num(26,3),likes:num(29,4),rankUpLikePoint:num(33,4),
    appearance:Array.from({length:9},(_,i)=>num(66+i,1)),outfit:[num(13,2),num(4,2),num(7,2),num(10,2)],
    recordedDate:[2000+num(48,1),num(49,1),num(50,1)],timeSupported:false,dateField:'stamp_rally_date',checksumValid:true,shuffleFamily:family(body),
  };
}
