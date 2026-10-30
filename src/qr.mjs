import {qrcodegen} from '../vendor/qrcodegen/qrcodegen.mjs';

export function createQrMatrix(payload) {
  if(!(payload instanceof Uint8Array)||payload.length!==121)throw new Error('QR을 만들 데이터가 올바르지 않아요.');
  // Raw byte segment: never UTF-8 encode these binary bytes and never add ECI.
  const segment=qrcodegen.QrSegment.makeBytes([...payload]);
  const qr=qrcodegen.QrCode.encodeSegments([segment],qrcodegen.QrCode.Ecc.MEDIUM,1,40,-1,false);
  return Array.from({length:qr.size},(_,y)=>Array.from({length:qr.size},(_,x)=>qr.getModule(x,y)));
}
export function matrixToSvg(matrix,scale=12) {
  const border=4,modules=matrix.length+border*2,pixelSize=modules*scale;
  const commands=[];
  matrix.forEach((row,y)=>row.forEach((dark,x)=>{if(dark)commands.push(`M${x+border} ${y+border}h1v1h-1z`);}));
  return {svgText:`<svg xmlns="http://www.w3.org/2000/svg" width="${pixelSize}" height="${pixelSize}" viewBox="0 0 ${modules} ${modules}" shape-rendering="crispEdges"><path fill="#fff" d="M0 0h${modules}v${modules}H0z"/><path fill="#000" d="${commands.join('')}"/></svg>`,pixelSize};
}
export async function renderQr(payload) {
  const matrix=createQrMatrix(payload);
  const {svgText,pixelSize}=matrixToSvg(matrix);
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=pixelSize;
  const context=canvas.getContext('2d',{alpha:false});
  if(!context)throw new Error('이 브라우저에서 QR 이미지를 만들 수 없어요.');
  context.fillStyle='#fff';context.fillRect(0,0,pixelSize,pixelSize);
  context.fillStyle='#000';
  matrix.forEach((row,y)=>row.forEach((dark,x)=>{if(dark)context.fillRect((x+4)*12,(y+4)*12,12,12);}));
  return {pngDataUrl:canvas.toDataURL('image/png'),svgText,pixelSize};
}
