'use strict';
const imageEraseSelections=new Map();
function canAutoSelectImage(l){return !!l?.src&&!l.kind&&!l.locked;}
async function loadImageEraseSelections(l){for(const src of l.eraseSelections||[])if(!imageEraseSelections.has(src))imageEraseSelections.set(src,await imageFrom(src));}
function validateImageEraseSelections(l){
 const masks=l.eraseSelections;if(masks!==undefined&&(!canAutoSelectImage(l)||!Array.isArray(masks)||masks.length>20||masks.some(src=>typeof src!=='string'||src.length>4000000||!/^data:image\/png;base64,/.test(src))))throw Error('이미지 자동 선택 영역이 올바르지 않습니다.');
 if(l.eraseSelection!==undefined&&(!Number.isInteger(l.eraseSelection)||l.eraseSelection<0||l.eraseSelection>=(masks?.length||0)))throw Error('이미지 선택 영역 번호가 올바르지 않습니다.');
 if(l.eraseOutside!==undefined&&(typeof l.eraseOutside!=='boolean'||l.eraseOutside&&l.eraseSelection===undefined))throw Error('이미지 바깥 지우기 설정이 올바르지 않습니다.');
 for(const s of l.strokes||[]){if(s.whiteText!==undefined&&(s.whiteText!==true||s.points?.length!==4||s.selection!==undefined))throw Error('흰 말풍선 지우기 영역이 올바르지 않습니다.');if(s.selection!==undefined&&(!Number.isInteger(s.selection)||s.selection<0||s.selection>=(masks?.length||0)))throw Error('지우개 선택 영역 기록이 올바르지 않습니다.');}
}
function applyImageEraseStrokes(l,image){
 if(!l.strokes?.length)return typeof aiPatchedBitmap==='function'?aiPatchedBitmap(l,image):image;
 const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height,scale=Math.min(1,Math.sqrt(16000000/(iw*ih))),off=document.createElement('canvas');off.width=Math.max(1,Math.round(iw*scale));off.height=Math.max(1,Math.round(ih*scale));const g=off.getContext('2d');g.drawImage(image,0,0,off.width,off.height);
 let brush=null;
 for(let index=0;index<=l.strokes.length;index++){
  if(typeof drawAIPatchesAt==='function')drawAIPatchesAt(g,l,off.width,off.height,index,l.strokes.length);
  if(index===l.strokes.length)break;const s=l.strokes[index];
  if(s.whiteText){g.globalCompositeOperation='source-atop';g.fillStyle='#ffffff';g.beginPath();s.points.forEach((p,i)=>i?g.lineTo(p.x*off.width,p.y*off.height):g.moveTo(p.x*off.width,p.y*off.height));g.closePath();g.fill();continue;}
  let selection=null;if(s.selection!==undefined){selection=imageEraseSelections.get(l.eraseSelections?.[s.selection]);if(!selection)continue;}
  if(selection&&!brush){brush=document.createElement('canvas');brush.width=off.width;brush.height=off.height;}
  const c=selection?brush.getContext('2d'):g;
  if(selection){c.clearRect(0,0,off.width,off.height);c.globalCompositeOperation='source-over';}else c.globalCompositeOperation='destination-out';
  c.lineCap='round';c.lineJoin='round';c.fillStyle=c.strokeStyle='#000';const pts=s.points,r=s.size*off.width/2;c.lineWidth=r*2;c.beginPath();if(pts.length===1){c.arc(pts[0].x*off.width,pts[0].y*off.height,r,0,Math.PI*2);c.fill();}else{c.moveTo(pts[0].x*off.width,pts[0].y*off.height);for(const p of pts.slice(1))c.lineTo(p.x*off.width,p.y*off.height);c.stroke();}
  if(selection){c.globalCompositeOperation='destination-out';c.drawImage(selection,0,0,off.width,off.height);g.globalCompositeOperation='destination-out';g.drawImage(brush,0,0);}
 }
 return off;
}
function syncImageEraseSelection(){const button=$('imageAutoSelect');if(!button)return;const l=currentImageLayer(),available=canAutoSelectImage(l),ready=available&&l.eraseSelection!==undefined;button.disabled=projectBusy||!available;$('imageEraseOutside').disabled=projectBusy||!ready;$('imageEraseOutside').checked=!!(ready&&l.eraseOutside);$('imageSelectionHint').textContent=ready?'선택된 캐릭터를 보호하며 바깥만 지워요. 체크를 끄면 일반 지우개로 돌아갑니다.':'캐릭터를 자동 선택한 뒤 바깥만 지울 수 있어요. 처음에는 모델을 다운로드합니다.';}
function initImageEraseSelection(){
 const host=$('imageLayerInspector');if(!host)return;const section=document.createElement('section');section.innerHTML='<div class="row"><button id="imageAutoSelect" type="button">캐릭터 자동 선택 · 시험</button></div><label class="check"><input id="imageEraseOutside" type="checkbox">캐릭터 바깥만 지우기</label><p id="imageSelectionHint" class="hint"></p>';host.append(section);
 $('imageAutoSelect').onclick=()=>autoSelectProtrusion('image');$('imageEraseOutside').onchange=()=>{const l=currentImageLayer();if(projectBusy||!canAutoSelectImage(l)||l.eraseSelection===undefined)return;checkpoint();l.eraseOutside=$('imageEraseOutside').checked;sync();};syncImageEraseSelection();
}
window.addEventListener('DOMContentLoaded',initImageEraseSelection,{once:true});
