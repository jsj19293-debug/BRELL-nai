'use strict';
const stickerTintCache=new Map();
const whitePaperPrepared=new WeakSet();
function prepareWhiteStickerPaper(image){
 if(whitePaperPrepared.has(image))return image;
 const c=document.createElement('canvas');c.width=image.width;c.height=image.height;
 const g=c.getContext('2d');g.drawImage(image,0,0);const pixels=g.getImageData(0,0,c.width,c.height),data=pixels.data;
 // Remove the neutral black component, including the ink's antialiased black halo.
 // Channel differences (the colored lettering) and every alpha byte are retained.
 for(let i=0;i<data.length;i+=4){if(!data[i+3])continue;const white=255-Math.max(data[i],data[i+1],data[i+2]);for(let k=0;k<3;k++)data[i+k]+=white;}
 g.putImageData(pixels,0,0);whitePaperPrepared.add(c);return c;
}
function prepareSticker(image,info={}){if(info.whitePaper)image=prepareWhiteStickerPaper(image);if(info.preserveAlpha)return image;const c=document.createElement('canvas');c.width=info.sourceBox?.[2]||image.width;c.height=info.sourceBox?.[3]||image.height;const g=c.getContext('2d');if(info.sourcePolygon){g.beginPath();info.sourcePolygon.forEach(([x,y],i)=>g[i?'lineTo':'moveTo'](x-info.sourceBox[0],y-info.sourceBox[1]));g.closePath();g.clip()}if(info.sourceBox)g.drawImage(image,...info.sourceBox,0,0,c.width,c.height);else g.drawImage(image,0,0);const pixels=g.getImageData(0,0,c.width,c.height),data=pixels.data,n=c.width*c.height,seen=new Uint8Array(n),queue=new Int32Array(n);let head=0,tail=0;
 const inkMask=new Uint8Array(n);
 if(info.inkBox){const [bx,by,bw,bh]=info.inkBox,visited=new Uint8Array(n);for(let y=by;y<by+bh;y++)for(let x=bx;x<bx+bw;x++){const first=y*c.width+x;if(visited[first]||Math.max(...data.subarray(first*4,first*4+3))>=120)continue;const component=[first];visited[first]=1;let edge=false;for(let k=0;k<component.length;k++){const at=component[k],px=at%c.width,py=Math.floor(at/c.width);if(px===bx||px===bx+bw-1||py===by||py===by+bh-1)edge=true;for(const next of [at-1,at+1,at-c.width,at+c.width]){const nx=next%c.width,ny=Math.floor(next/c.width);if(nx<bx||nx>=bx+bw||ny<by||ny>=by+bh||visited[next])continue;visited[next]=1;if(Math.max(...data.subarray(next*4,next*4+3))<120)component.push(next)}}if(!edge&&component.length>12)for(const at of component)inkMask[at]=1}}

 function visit(i){if(seen[i])return;seen[i]=1;if(inkMask[i])return;const j=i*4;if(info.softBackground?Math.max(data[j],data[j+1],data[j+2])<245:info.background?info.background.every((v,k)=>Math.abs(data[j+k]-v)<=18):Math.max(data[j],data[j+1],data[j+2])<=12)queue[tail++]=i}
 for(let x=0;x<c.width;x++){visit(x);visit((c.height-1)*c.width+x)}for(let y=0;y<c.height;y++){visit(y*c.width);visit(y*c.width+c.width-1)}
 while(head<tail){const i=queue[head++],x=i%c.width;if(info.softBackground){const j=i*4,alpha=Math.max(data[j],data[j+1],data[j+2]);data[j+3]=data[j+3]===0||alpha<8?0:alpha;data[j]=data[j+1]=data[j+2]=255}else data[i*4+3]=0;if(x)visit(i-1);if(x<c.width-1)visit(i+1);if(i>=c.width)visit(i-c.width);if(i<n-c.width)visit(i+c.width)}g.putImageData(pixels,0,0);return c;
}
function stickerImageBase(b,im){const paperOpacity=!!referenceInfo(b.assetId)?.paperOpacity;if(!b.assetRecolor&&!paperOpacity)return im;const key=[b.assetId,b.assetRecolor,b.color,b.fill,paperOpacity?b.opacity:''].join(':');if(stickerTintCache.has(key))return stickerTintCache.get(key);const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);const data=g.getImageData(0,0,c.width,c.height),ink=[1,3,5].map(i=>parseInt(b.color.slice(i,i+2),16)),paper=[1,3,5].map(i=>parseInt(b.fill.slice(i,i+2),16));for(let i=0;i<data.data.length;i+=4){if(!data.data[i+3])continue;const luminance=(data.data[i]*.2126+data.data[i+1]*.7152+data.data[i+2]*.0722)/255,t=Math.max(0,Math.min(1,(luminance-.06)/.83));if(b.assetRecolor)for(let k=0;k<3;k++)data.data[i+k]=Math.round(ink[k]*(1-t)+paper[k]*t);if(paperOpacity)data.data[i+3]=Math.round(data.data[i+3]*(1-t+t*Math.max(0,Math.min(1,b.opacity??1))))}g.putImageData(data,0,0);if(stickerTintCache.size>=18)stickerTintCache.delete(stickerTintCache.keys().next().value);stickerTintCache.set(key,c);return c}
function renderStickerChoices(host,catalog='builtin'){if(catalog==='beta-censor'){renderBetaCensorChoices(host);return}if(catalog==='censor'){renderCensorChoices(host);return}if(catalog==='builtin')renderMangaSfxChoices(host);for(const r of referenceBalloons.filter(r=>r.fixed&&!r.hidden&&(catalog==='builtin'?!['ogok','reactions','censor','beta-censor','cross-section'].includes(r.collection):r.collection===catalog)).sort((a,b)=>Number(!!b.featured)-Number(!!a.featured)||a.catalogNumber-b.catalogNumber)){const bt=document.createElement('button');bt.className='type reference-choice';const preview=document.createElement('canvas');preview.width=440;preview.height=Math.max(330,Math.min(900,Math.round(424*r.box[3]/r.box[2]+16)));preview.setAttribute('aria-hidden','true');const label=document.createElement('span');label.textContent=r.label||'에셋 '+r.name;bt.append(preview,label);bt.onclick=()=>addReference(r.id);host.append(bt);loadReference(r.id).then(im=>{const c=preview.getContext('2d'),[sx,sy,sw,sh]=r.box,scale=Math.min(424/sw,(preview.height-16)/sh);c.drawImage(r.paperOpacity?stickerImage({assetId:r.id,color:r.color,fill:r.fill,opacity:r.defaultOpacity,assetRecolor:false},im):im,sx,sy,sw,sh,(440-sw*scale)/2,(preview.height-sh*scale)/2,sw*scale,sh*scale)}).catch(()=>{label.textContent='다시 선택해 불러오기 · '+r.name})}}

// Native lazy images avoid decoding the full 120-file collection into Canvas caches.
function renderBetaCensorChoices(host){
 for(const r of referenceBalloons.filter(r=>r.collection==='beta-censor'&&!r.hidden).sort((a,b)=>a.catalogNumber-b.catalogNumber)){
  const button=document.createElement('button'),image=document.createElement('img'),label=document.createElement('span');button.type='button';button.className='type reference-choice beta-censor-choice';button.title=r.label;image.loading='lazy';image.decoding='async';image.alt='';image.width=r.box[2];image.height=r.box[3];image.src=referenceURL(r.id);label.textContent=r.label;button.append(image,label);button.onclick=()=>addReference(r.id);host.append(button);
 }
}

function initStickerAssets(){$('restoreStickerColor').onclick=()=>{const b=current();if(projectBusy||!referenceInfo(b?.assetId)?.fixed)return;checkpoint();b.assetRecolor=false;sync();status('에셋의 원본 색상으로 되돌렸습니다.')}}

// Inverse-map the complete cropped PNG, including connected bubbles and decorations.
// Premultiplied-alpha interpolation avoids seams and dark fringes on translucent paper.
const stickerWarpCache=new Map();
function drawWarpedSticker(c,b,im,info){
 const scale=info.fixed?Math.min(b.w/info.box[2],b.h/info.box[3]):null;
 const w=scale===null?b.w:info.box[2]*scale,h=scale===null?b.h:info.box[3]*scale;
 const x=b.x+(b.w-w)/2,y=b.y+(b.h-h)/2;
 const key=JSON.stringify([b.assetId,b.assetRecolor,b.color,b.fill,b.opacity,b.w,b.h,b.warp,b.aiPatches]);
 let cached=stickerWarpCache.get(key);
 if(!cached||cached.source!==im){
  const density=Math.min(1,1000/w,1000/h,Math.sqrt(500000/(w*h)));
  const sw=Math.max(1,Math.ceil(w*density)),sh=Math.max(1,Math.ceil(h*density));
  const source=document.createElement('canvas');source.width=sw;source.height=sh;
  const g=source.getContext('2d');g.drawImage(stickerImage(b,im),...info.box,0,0,sw,sh);
  const pixels=g.getImageData(0,0,sw,sh).data;
  const bitmap=document.createElement('canvas');bitmap.width=Math.ceil(sw*1.56);bitmap.height=Math.ceil(sh*1.56);
  const out=bitmap.getContext('2d'),result=out.createImageData(bitmap.width,bitmap.height),dst=result.data;
  for(let py=0;py<bitmap.height;py++)for(let px=0;px<bitmap.width;px++){
   // Angle is measured in the original object's normalized coordinate system.
   const du=(px+.5-bitmap.width/2)/sw,dv=(py+.5-bitmap.height/2)/sh;
   const f=1+warpAmount(b,Math.atan2(dv*h/b.h,du*w/b.w));
   const sx=(du/f+.5)*sw-.5,sy=(dv/f+.5)*sh-.5;
   if(sx<-.5||sy<-.5||sx>sw-.5||sy>sh-.5)continue;
   const ix=Math.floor(sx),iy=Math.floor(sy),tx=sx-ix,ty=sy-iy,at=(py*bitmap.width+px)*4;
   let alpha=0,red=0,green=0,blue=0;
   for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
    const xx=ix+dx,yy=iy+dy;if(xx<0||xx>=sw||yy<0||yy>=sh)continue;
    const i=(yy*sw+xx)*4,weight=(dx?tx:1-tx)*(dy?ty:1-ty),a=pixels[i+3]*weight;
    alpha+=a;red+=pixels[i]*a;green+=pixels[i+1]*a;blue+=pixels[i+2]*a;
   }
   if(alpha){dst[at]=red/alpha;dst[at+1]=green/alpha;dst[at+2]=blue/alpha;dst[at+3]=alpha;}
  }
  out.putImageData(result,0,0);cached={source:im,bitmap,sw,sh};
  if(stickerWarpCache.size>=8)stickerWarpCache.delete(stickerWarpCache.keys().next().value);
  stickerWarpCache.set(key,cached);
 }
 const bitmap=cached.bitmap,ow=w*bitmap.width/cached.sw,oh=h*bitmap.height/cached.sh;
 c.drawImage(bitmap,x+(w-ow)/2,y+(h-oh)/2,ow,oh);
}
function syncStickerEditor(){
 const panel=$('stickerEditor');if(!panel)return;const b=current();panel.hidden=b?.kind!=='asset'||!referenceInfo(b.assetId)?.fixed||typeof isCensorAsset==='function'&&isCensorAsset(b);if(panel.hidden)return;
 for(const [id,key]of [['stickerInkColor','color'],['stickerPaperColor','fill']])if(document.activeElement!==$(id))$(id).value=b[key];
 $('stickerRecolor').checked=!!b.assetRecolor;
}
const originalInitStickerAssets=initStickerAssets;
initStickerAssets=function(){
 originalInitStickerAssets();
 const panel=document.createElement('section');panel.id='stickerEditor';panel.hidden=true;
 panel.innerHTML='<h3>고정 에셋 편집</h3><label class="check"><input id="stickerRecolor" type="checkbox"> 색상 변경 적용</label><label>선·글자 색<input id="stickerInkColor" type="color"></label><label>바탕색<input id="stickerPaperColor" type="color"></label><p class="hint">윤곽 뒤틀기의 보라색 점 8개로 모양을 바꿀 수 있어요. PNG에 포함된 글자·장식도 함께 변형됩니다.</p>';
 $('restoreStickerColor').before(panel);
 for(const [id,key]of [['stickerInkColor','color'],['stickerPaperColor','fill']]){
  const input=$(id);input.onfocus=()=>{inputHistoryKey=null};input.oninput=()=>{const b=current();if(projectBusy||b?.kind!=='asset'||!referenceInfo(b.assetId)?.fixed)return;recordInput('sticker-'+key);b[key]=input.value;b.assetRecolor=true;$(key).value=b[key];syncStickerEditor();render()};input.onchange=()=>{inputHistoryKey=null};
 }
 $('stickerRecolor').onchange=()=>{const b=current();if(projectBusy||b?.kind!=='asset'||!referenceInfo(b.assetId)?.fixed)return;checkpoint();b.assetRecolor=$('stickerRecolor').checked;sync();};
 const oldSync=syncReferenceControls;syncReferenceControls=function(){oldSync();syncStickerEditor()};syncStickerEditor();
};

function stickerImage(b,im){const base=stickerImageBase(b,im);return typeof aiPatchedBitmap==='function'?aiPatchedBitmap(b,base):base;}
