'use strict';
// Editable text remains vector text; only its transient ink masks are rasterized.
const INK_DEFAULTS={version:1,type:'inkBleed',mode:'soft',enabled:true,intensity:35,radius:30,irregularity:25,density:80,color:null,splatter:0,innerTexture:0,paperTexture:0};
const INK_PRESETS=[
 {name:'정통 무협',mode:'soft',intensity:30,radius:25,irregularity:10,density:90,splatter:0,innerTexture:0,paperTexture:0},
 {name:'필살기 발동',mode:'organic',intensity:60,radius:45,irregularity:70,density:95,splatter:45,innerTexture:0,paperTexture:0},
 {name:'천마강림',mode:'watercolor',intensity:65,radius:55,irregularity:55,density:85,splatter:25,innerTexture:40,paperTexture:65}
];
const inkMaskCache=new Map(),INK_CACHE_BYTES=12*1024*1024;
const inkWarpCache=new Map();
let inkCacheBytes=0,inkWarpBytes=0,inkCacheDocument=null,inkOutputDepth=0,inkPreviewQuality='auto';
try{const value=localStorage.getItem('studio.inkQuality');if(['auto','low','high'].includes(value))inkPreviewQuality=value}catch{}
function inkHash(x,y=0,seed=0){let h=Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^(seed|0);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295}
function inkStringSeed(value){let h=2166136261;for(const ch of String(value)){h^=ch.codePointAt(0);h=Math.imul(h,16777619)}return h>>>0}
function inkSettings(b){return {...INK_DEFAULTS,enabled:!!b.inkBleed,...b.inkBleed,seed:b.inkBleed?.seed??inkStringSeed(b.id||'ink-text')}}
function inkActive(b){return !!b?.inkBleed&&b.inkBleed.enabled!==false&&['soft','organic','watercolor'].includes(b.inkBleed.mode)&&b.inkBleed.intensity!==0}
function inkCanEdit(b){return !!b&&!b.statusUI&&!b.mangaSfx&&typeof b.text==='string'&&(b.kind!=='asset'||!!b.assetComposition||typeof referenceInfo==='function'&&!referenceInfo(b.assetId)?.fixed)}
function validateInkBleed(b){
 if(b.inkBleed===undefined)return;const s=b.inkBleed,keys=Object.keys(INK_DEFAULTS).concat('seed');
 if(!inkCanEdit(b)&&b.kind!==undefined||!s||typeof s!=='object'||Array.isArray(s)||s.version!==1||s.type!=='inkBleed'||!['soft','organic','watercolor'].includes(s.mode)||typeof s.enabled!=='boolean'||Object.keys(s).some(k=>!keys.includes(k)))throw Error('먹 번짐 설정이 올바르지 않습니다.');
 for(const key of ['intensity','radius','irregularity','density','splatter','innerTexture','paperTexture'])if(s[key]!==undefined&&(!Number.isFinite(s[key])||s[key]<0||s[key]>100))throw Error('먹 번짐 수치는 0~100이어야 합니다.');
 if(s.color!==undefined&&s.color!==null&&(typeof s.color!=='string'||!/^#[0-9a-f]{6}$/i.test(s.color))||s.seed!==undefined&&(!Number.isInteger(s.seed)||s.seed<0||s.seed>4294967295))throw Error('먹 색상이나 패턴 시드가 올바르지 않습니다.');
}
function clearInkCache(){for(const e of inkMaskCache.values()){e.bleed.width=e.bleed.height=1;if(e.texture)e.texture.width=e.texture.height=1}for(const e of inkWarpCache.values())e.canvas.width=e.canvas.height=1;inkMaskCache.clear();inkWarpCache.clear();inkCacheBytes=inkWarpBytes=0}
function inkWithOutput(fn){inkOutputDepth++;try{return fn()}finally{inkOutputDepth--}}
function inkNoise(x,y,seed){const ix=Math.floor(x),iy=Math.floor(y),sx=x-ix,sy=y-iy,u=sx*sx*(3-2*sx),v=sy*sy*(3-2*sy);return (1-v)*((1-u)*inkHash(ix,iy,seed)+u*inkHash(ix+1,iy,seed))+v*((1-u)*inkHash(ix,iy+1,seed)+u*inkHash(ix+1,iy+1,seed))}
function inkExpandAlpha(source,w,h,r){
 if(r<1)return source.slice();r=Math.ceil(r);const temp=new Uint8ClampedArray(source.length),out=new Uint8ClampedArray(source.length),q=new Int32Array(Math.max(w,h)+r*2+2);
 for(const vertical of [false,true]){const src=vertical?temp:source,dst=vertical?out:temp,length=vertical?h:w,lines=vertical?w:h,stride=vertical?w:1;
  for(let line=0;line<lines;line++){let head=0,tail=0;const at=(vertical?line:line*w);for(let i=-r;i<length+r;i++){const index=Math.min(length-1,Math.max(0,i)),value=src[at+index*stride];while(tail>head&&src[at+q[tail-1]*stride]<=value)tail--;q[tail++]=index;const left=i-2*r;while(head<tail&&q[head]<left)head++;if(i>=r)dst[at+(i-r)*stride]=src[at+q[head]*stride]}}
 }return out;
}
function inkBlurAlpha(source,w,h,radius){
 const a=source.slice(),temp=new Uint8ClampedArray(a.length),r=Math.max(1,Math.round(radius/Math.sqrt(3))),span=r*2+1;
 for(let pass=0;pass<3;pass++)for(const vertical of [false,true]){const src=vertical?temp:a,dst=vertical?a:temp,length=vertical?h:w,lines=vertical?w:h,stride=vertical?w:1;
  for(let line=0;line<lines;line++){const at=vertical?line:line*w;let sum=0;for(let k=-r;k<=r;k++)sum+=src[at+Math.max(0,Math.min(length-1,k))*stride];for(let i=0;i<length;i++){dst[at+i*stride]=sum/span;sum+=src[at+Math.min(length-1,i+r+1)*stride]-src[at+Math.max(0,i-r)*stride]}}
 }return a;
}
function inkSoftMask(source,w,h,r,s){const expanded=inkExpandAlpha(source,w,h,r*.16),blur=inkBlurAlpha(expanded,w,h,r*.48);for(let i=0;i<blur.length;i++)blur[i]*=s.intensity/100*.64;return blur}
function inkDistance(source,w,h){
 const d=new Float32Array(source.length),diagonal=Math.SQRT2;for(let i=0;i<d.length;i++)d[i]=source[i]>24?0:1e6;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(x)d[i]=Math.min(d[i],d[i-1]+1);if(y){d[i]=Math.min(d[i],d[i-w]+1);if(x)d[i]=Math.min(d[i],d[i-w-1]+diagonal);if(x<w-1)d[i]=Math.min(d[i],d[i-w+1]+diagonal)}}
 for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;if(x<w-1)d[i]=Math.min(d[i],d[i+1]+1);if(y<h-1){d[i]=Math.min(d[i],d[i+w]+1);if(x)d[i]=Math.min(d[i],d[i+w-1]+diagonal);if(x<w-1)d[i]=Math.min(d[i],d[i+w+1]+diagonal)}}return d;
}
function inkOrganicMask(source,w,h,r,s,scale){
 const distance=inkDistance(source,w,h),out=new Uint8ClampedArray(source.length),rough=s.irregularity/100,period=Math.max(3,scale*9);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,n=inkNoise(x/period,y/period,s.seed)*.7+inkNoise(x/(period*.4),y/(period*.4),s.seed+7)*.3,reach=r*(.22+(1-rough)*.3+rough*n*.9),edge=Math.max(0,Math.min(1,(reach-distance[i])/Math.max(.8,r*.12)));out[i]=Math.max(source[i]*.3,255*edge*(.4+n*.55))*s.intensity/100}
 const softened=inkBlurAlpha(out,w,h,Math.max(.6,r*.075));inkAddDrops(softened,source,w,h,r,s);return softened;
}
function inkWatercolorMask(source,w,h,r,s,scale){
 const distance=inkDistance(source,w,h),out=new Uint8ClampedArray(source.length),period=Math.max(4,scale*17),rough=s.irregularity/100;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,n=inkNoise(x/period,y/period,s.seed),fiber=inkHash(x,y,s.seed+31),reach=Math.max(1,r*(.55+rough*n*.85)),ratio=distance[i]/reach,wash=Math.exp(-ratio*ratio*2.8)*(.25+n*.27),waterline=Math.exp(-Math.pow((ratio-.88-n*.08)/.055,2))*.16,near=Math.exp(-distance[i]/Math.max(1,r*.18))*.28;out[i]=255*(wash+waterline+near)*(1-s.paperTexture/100*.38*fiber)*s.intensity/100}
 inkAddDrops(out,source,w,h,r,{...s,splatter:s.splatter*.75});return out;
}
function inkAddDrops(out,source,w,h,r,s){
 if(!s.splatter)return;const edge=[];for(let y=2;y<h-2;y+=2)for(let x=2;x<w-2;x+=2){const i=y*w+x;if(source[i]>120&&(source[i-1]<50||source[i+1]<50||source[i-w]<50||source[i+w]<50))edge.push(i)}if(!edge.length)return;
 const count=Math.min(180,Math.ceil((edge.length/40+7)*s.splatter/100));for(let n=0;n<count;n++){const at=edge[Math.min(edge.length-1,Math.floor(inkHash(n,7,s.seed)*edge.length))],x=at%w,y=Math.floor(at/w),a=inkHash(n,14,s.seed)*Math.PI*2,d=r*(.65+inkHash(n,18,s.seed)*1.45),cx=x+Math.cos(a)*d,cy=y+Math.sin(a)*d,rr=Math.max(.7,r*(.025+inkHash(n,22,s.seed)*.14));for(let yy=Math.max(0,Math.floor(cy-rr));yy<Math.min(h,cy+rr+1);yy++)for(let xx=Math.max(0,Math.floor(cx-rr));xx<Math.min(w,cx+rr+1);xx++){const dist=Math.hypot(xx+.5-cx,yy+.5-cy)/rr;if(dist<1)out[yy*w+xx]=Math.max(out[yy*w+xx],(1-dist*.35)*220*s.intensity/100)}}
}
function inkGlyphEntry(c,b,text){
 if(!inkActive(b)||!text.trim())return null;if(typeof state!=='undefined'&&inkCacheDocument!==state){clearInkCache();inkCacheDocument=state}
 const s=inkSettings(b),m=c.measureText(text),size=b.fontSize||26,radius=size*(.012+s.radius*.0032),pad=Math.ceil(radius*2.6+3),align=c.textAlign,baseline=c.textBaseline;
 const left=-(m.actualBoundingBoxLeft??(align==='center'?m.width/2:align==='right'?m.width:0))-pad,top=-(m.actualBoundingBoxAscent??size)-pad,width=Math.max(1,(m.actualBoundingBoxLeft??0)+(m.actualBoundingBoxRight??m.width)+2*pad),height=Math.max(1,(m.actualBoundingBoxAscent??size)+(m.actualBoundingBoxDescent??size*.25)+2*pad);
 const matrix=c.getTransform(),deviceScale=Math.max(Math.hypot(matrix.a,matrix.b),Math.hypot(matrix.c,matrix.d)),mobile=typeof mobileMedia!=='undefined'&&mobileMedia.matches;
 const stableScale=Math.round(deviceScale*1000)/1000,quality=inkOutputDepth?'high':inkPreviewQuality,requested=quality==='low'?.5:quality==='high'?Math.max(1,stableScale):Math.max(.25,Math.min(1,stableScale))*(mobile?.7:1),budget=quality==='high'?1048576:524288;
 const scale=Math.min(requested,2048/width,2048/height,Math.sqrt(budget/(width*height))),w=Math.max(1,Math.ceil(width*scale)),h=Math.max(1,Math.ceil(height*scale));
 const color=s.color||b.color||'#222222',ready=typeof comicFontFaces!=='undefined'?comicFontFaces.get(b.font)?.status:'',key=JSON.stringify([text,c.font,align,baseline,color,s,w,h,ready,document.fonts?.status]);let cached=inkMaskCache.get(key);if(cached){inkMaskCache.delete(key);inkMaskCache.set(key,cached);return cached}
 const mask=document.createElement('canvas');mask.width=w;mask.height=h;let bleed,texture;
 try{const g=mask.getContext('2d');g.scale(scale,scale);g.translate(-left,-top);g.font=c.font;g.textAlign=align;g.textBaseline=baseline;g.fillStyle='#ffffff';g.fillText(text,0,0);const pixels=g.getImageData(0,0,w,h).data,source=new Uint8ClampedArray(w*h);for(let i=0;i<source.length;i++)source[i]=pixels[i*4+3];
  const r=radius*scale,alpha=s.mode==='soft'?inkSoftMask(source,w,h,r,s):s.mode==='organic'?inkOrganicMask(source,w,h,r,s,scale):inkWatercolorMask(source,w,h,r,s,scale);
  bleed=document.createElement('canvas');bleed.width=w;bleed.height=h;const bg=bleed.getContext('2d');bg.fillStyle=color;bg.fillRect(0,0,1,1);const rgba=bg.getImageData(0,0,1,1).data,rgb=Array.from(rgba).slice(0,3),colorAlpha=rgba[3]/255;bg.clearRect(0,0,w,h);const image=bg.createImageData(w,h);for(let i=0;i<alpha.length;i++){image.data[i*4]=rgb[0];image.data[i*4+1]=rgb[1];image.data[i*4+2]=rgb[2];image.data[i*4+3]=alpha[i]*s.density/100*colorAlpha}bg.putImageData(image,0,0);
  if(s.mode==='watercolor'&&(s.innerTexture||s.paperTexture)){texture=document.createElement('canvas');texture.width=w;texture.height=h;const tg=texture.getContext('2d'),im=tg.createImageData(w,h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,n=inkNoise(x/Math.max(2,scale*10),y/Math.max(2,scale*10),s.seed+91),fiber=inkHash(x,y,s.seed+42),amount=Math.min(.38,s.innerTexture/100*.22*(.3+n)+s.paperTexture/100*.12*fiber)*s.density/100;for(let k=0;k<3;k++)im.data[i*4+k]=Math.min(255,rgb[k]+(255-rgb[k])*(.35+n*.3));im.data[i*4+3]=source[i]*amount*colorAlpha}tg.putImageData(im,0,0)}
  cached={bleed,texture,left,top,width,height,bytes:w*h*4*(texture?2:1)};while(inkMaskCache.size&&(inkCacheBytes+cached.bytes>INK_CACHE_BYTES||inkMaskCache.size>=8)){const id=inkMaskCache.keys().next().value,e=inkMaskCache.get(id);inkCacheBytes-=e.bytes;e.bleed.width=e.bleed.height=1;if(e.texture)e.texture.width=e.texture.height=1;inkMaskCache.delete(id)}inkMaskCache.set(key,cached);inkCacheBytes+=cached.bytes;return cached;
 }catch(e){if(bleed)bleed.width=bleed.height=1;if(texture)texture.width=texture.height=1;throw e}finally{mask.width=mask.height=1}
}
function paintInkLayer(c,e,x,y,texture=false){if(!e||(texture&&!e.texture))return;c.save();try{c.shadowColor='transparent';c.shadowBlur=c.shadowOffsetX=c.shadowOffsetY=0;c.drawImage(texture?e.texture:e.bleed,x+e.left,y+e.top,e.width,e.height)}finally{c.restore()}}
function drawInkCornerText(c,b,textOnly,draw){
 if(typeof state!=='undefined'&&inkCacheDocument!==state){clearInkCache();inkCacheDocument=state}
 const size=Math.max(b.fontSize,...(b.textRuns||[]).map(r=>r.fontSize||0)),s=inkSettings(b),pad=Math.ceil(size*(.012+s.radius*.0032)*2.8+(b.art?.width||0)*2+5),width=b.w+pad*2,height=b.h+pad*2;
 const local={...b,x:0,y:0,objectRotation:0,warpCorners:undefined,warpEdges:undefined,cornerExtended:false,cornerMode:false},quality=inkOutputDepth?'high':inkPreviewQuality;
 const key=JSON.stringify([local,quality,typeof family==='function'?family(b):'',document.fonts?.status,typeof comicFontFaces!=='undefined'?[b.font,...(b.textRuns||[]).map(r=>r.font)].map(id=>comicFontFaces.get(id)?.status):[]]);let entry=inkWarpCache.get(key);
 if(!entry){const factor=quality==='low'?.5:quality==='auto'&&typeof mobileMedia!=='undefined'&&mobileMedia.matches?.7:1,density=Math.min(factor,2048/width,2048/height,Math.sqrt(1048576/(width*height))),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.floor(width*density));canvas.height=Math.max(1,Math.floor(height*density));const g=canvas.getContext('2d');g.scale(canvas.width/width,canvas.height/height);g.translate(pad,pad);let overflow;try{overflow=draw(g,local,textOnly)}catch(e){canvas.width=canvas.height=1;throw e}entry={canvas,overflow,bytes:canvas.width*canvas.height*4};while(inkWarpCache.size&&(inkWarpBytes+entry.bytes>8*1024*1024||inkWarpCache.size>=4)){const id=inkWarpCache.keys().next().value,e=inkWarpCache.get(id);inkWarpBytes-=e.bytes;e.canvas.width=e.canvas.height=1;inkWarpCache.delete(id)}inkWarpCache.set(key,entry);inkWarpBytes+=entry.bytes}
 const projector=cornerProjector(textCornerLayer(b)),n=24,bw=entry.canvas.width,bh=entry.canvas.height;
 // Extrapolate the existing mesh beyond its original UV bounds; no clipping at
 // the text box, so ink and droplets survive corner enlargement/rotation.
 c.save();try{for(let y=0;y<n;y++)for(let x=0;x<n;x++){const u=x/n,v=y/n,u1=(x+1)/n,v1=(y+1)/n,map=(a,z)=>projector.map((a*width-pad)/b.w,(z*height-pad)/b.h),a={x:u*bw,y:v*bh},bb={x:u1*bw,y:v*bh},cc={x:u1*bw,y:v1*bh},dd={x:u*bw,y:v1*bh},q=[map(u,v),map(u1,v),map(u1,v1),map(u,v1)];if(q.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>1e6||Math.abs(p.y)>1e6))continue;const box={x:a.x,y:a.y,w:bb.x-a.x,h:dd.y-a.y};affineSocialTriangle(c,entry.canvas,a,bb,cc,q[0],q[1],q[2],box);affineSocialTriangle(c,entry.canvas,a,cc,dd,q[0],q[2],q[3],box)}}finally{c.restore()}return entry.overflow;
}
