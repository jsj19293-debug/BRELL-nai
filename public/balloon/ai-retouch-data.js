'use strict';
// Portable corrections. Pixels live in cropped PNGs; coordinates belong to the source.
const aiPatchImages=new Map();
const aiCompositeCache=new Map();
function aiOwners(doc){return [doc,...(doc.imageLayers||[]),...(doc.items||[])];}
function validateAIRetouch(doc){
 let total=0;
 for(const owner of aiOwners(doc)){
  if(owner.aiPatches===undefined)continue;
  if(!Array.isArray(owner.aiPatches)||owner.aiPatches.length>24)throw Error('AI 복원 기록은 대상당 24개까지 저장할 수 있어요.');
  for(const p of owner.aiPatches){
   if(!p||p.version!==1||!['x','y','w','h'].every(k=>Number.isFinite(p[k]))||p.x<0||p.y<0||p.w<=0||p.h<=0||p.x+p.w>1.000001||p.y+p.h>1.000001||!Number.isInteger(p.afterStroke)||p.afterStroke<0||p.afterStroke>10000||[p.src,p.mask].some(src=>typeof src!=='string'||src.length>2800000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(src)))throw Error('AI 복원 이미지 또는 좌표가 올바르지 않습니다.');
   total+=p.src.length+p.mask.length;
  }
 }
 if(total>8*1024*1024)throw Error('이 장의 AI 복원 이미지가 8MB를 넘어요. 결과를 이미지로 저장해 새 장에서 이어가 주세요.');
}
async function loadAIRetouch(doc){
 validateAIRetouch(doc);
 for(const owner of aiOwners(doc))for(const p of owner.aiPatches||[]){for(const src of [p.src,p.mask]){
  if(aiPatchImages.has(src))continue;
  const image=await imageFrom(src);
  if(image.width*image.height>4194304||image.width>4096||image.height>4096)throw Error('AI 복원 이미지가 너무 큽니다.');
  aiPatchImages.set(src,image);
 }if(aiPatchImages.get(p.src).width!==aiPatchImages.get(p.mask).width||aiPatchImages.get(p.src).height!==aiPatchImages.get(p.mask).height)throw Error('AI 복원 이미지와 마스크 크기가 다릅니다.');}
}
function drawAIPatchesAt(c,owner,width,height,index=0,count=0){
 for(const p of owner.aiPatches||[]){
  if(Math.min(p.afterStroke,count)!==index)continue;
  const image=aiPatchImages.get(p.src),mask=aiPatchImages.get(p.mask);
  if(image&&mask){c.save();c.globalCompositeOperation='destination-out';c.imageSmoothingEnabled=false;c.drawImage(mask,p.x*width,p.y*height,p.w*width,p.h*height);c.globalCompositeOperation='source-over';c.imageSmoothingEnabled=true;c.drawImage(image,p.x*width,p.y*height,p.w*width,p.h*height);c.restore();}
 }
}
function clearAIComposite(){aiCompositeCache.clear();}
function aiPatchedBitmap(owner,base){
 if(!owner.aiPatches?.length)return base;
 const key=JSON.stringify(owner.aiPatches);
 const cached=aiCompositeCache.get(base);if(cached?.key===key)return cached.canvas;
 const out=document.createElement('canvas');out.width=base.naturalWidth||base.width;out.height=base.naturalHeight||base.height;
 const c=out.getContext('2d');c.drawImage(base,0,0);drawAIPatchesAt(c,owner,out.width,out.height,0,0);
 if(aiCompositeCache.size>=3)aiCompositeCache.delete(aiCompositeCache.keys().next().value);
 aiCompositeCache.set(base,{key,canvas:out});return out;
}
function drawRetouchRecords(c,doc){
 const masks=doc.masks||[];
 for(let index=0;index<=masks.length;index++){
  drawAIPatchesAt(c,doc,doc.width,doc.height,index,masks.length);
  if(index<masks.length){const m=masks[index];m.type==='clone'?paintClone(c,m):drawPatch(c,m);}
 }
}
function drawRetouchedBackground(c,doc,image){
 if((doc.masks||[]).some(m=>m.type==='clone')){
  const full=document.createElement('canvas');full.width=doc.width;full.height=doc.height;const g=full.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,full.width,full.height);if(image)g.drawImage(image,0,0,full.width,full.height);drawRetouchRecords(g,doc);c.drawImage(full,0,0);full.width=full.height=1;
 }else{if(image)c.drawImage(image,0,0,doc.width,doc.height);drawRetouchRecords(c,doc);}
}
