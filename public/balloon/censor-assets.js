'use strict';
// A bounded, deterministic texture set; project files contain only the asset ID.
const censorStyles=[['solid','검정 가림막'],['fog','흰 안개'],['smoke','검은 연무'],['static','TV 노이즈'],['dark','다크 노이즈'],['glitch','글리치 노이즈'],['label','CENSORED']];
for(const shape of ['rect','circle'])for(const [i,[style,label]]of censorStyles.entries()){
 const w=shape==='rect'?640:384,h=shape==='rect'?240:384;
 referenceBalloons.push({id:`censor-${style}-${shape}`,name:label,label:label+' · '+(shape==='rect'?'사각':'원형'),collection:'censor',catalogNumber:i+(shape==='circle'?7:0),fixed:true,preserveAlpha:true,censor:{style,shape},box:[0,0,w,h],body:[0,0,1,1],color:'#000000',fill:'#ffffff',defaultOpacity:1});
}
function censorInfo(b){return b?.kind==='asset'?referenceInfo(b.assetId)?.censor:null}
function isCensorAsset(b){return !!censorInfo(b)}
function censorHash(x,y,seed=19){let n=Math.imul(x,374761393)+Math.imul(y,668265263)+seed;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295}
function censorSmooth(a,b,x){const v=Math.max(0,Math.min(1,(x-a)/(b-a)));return v*v*(3-2*v)}
function censorNoise(x,y){const ix=Math.floor(x),iy=Math.floor(y),u=censorSmooth(0,1,x-ix),v=censorSmooth(0,1,y-iy),a=censorHash(ix,iy),b=censorHash(ix+1,iy),c=censorHash(ix,iy+1),d=censorHash(ix+1,iy+1);return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v}
function makeCensorBitmap(info){
 if(info.censor.dialog)return makeCensorDialogPreview(info);
 if(info.censor.sign)return makeCensorSignPreview(info);
 if(info.censor.tape||info.censor.backdrop)return makeEditableCensorPreview(info);
 const {style,shape}=info.censor,w=info.box[2],h=info.box[3],out=document.createElement('canvas');out.width=w;out.height=h;
 const c=out.getContext('2d'),soft=style==='fog'||style==='smoke',tw=soft?Math.ceil(w/3):w,th=soft?Math.ceil(h/3):h,pixels=c.createImageData(tw,th),rgba=pixels.data;
 for(let y=0;y<th;y++)for(let x=0;x<tw;x++){
  const u=(x+.5)/tw,v=(y+.5)/th,dx=u*2-1,dy=v*2-1,r=shape==='circle'?Math.hypot(dx,dy):Math.max(Math.abs(dx),Math.abs(dy));
  const grain=censorHash(x,y,123),row=censorHash(0,Math.floor(y/3),531);let alpha=shape==='circle'?1-censorSmooth(.988,1,r):1,ink=0,red,green,blue;
  if(style==='fog'||style==='smoke'){
   const turbulence=censorNoise(u*6+1,v*6+3)*.5+censorNoise(u*14+7,v*14+13)*.29+censorNoise(u*36,v*36)*.15+censorNoise(u*80+4,v*80+2)*.06;
   const edge=r+(turbulence-.5)*.32;
   alpha=(1-censorSmooth(.48,.99,edge))*(.68+.32*turbulence);
   ink=style==='fog'?239+16*turbulence:5+29*turbulence;
  }else if(style==='static')ink=grain>.5?242:12;
  else if(style==='dark'||style==='label'){
   ink=style==='label'?8+grain*35:4+Math.pow(grain,3)*110;
   const edge=shape==='circle'?r:Math.max(Math.abs(dx)*.99,Math.abs(dy));
   alpha=1-censorSmooth(.87,1,edge+(grain-.5)*.08);
  }else if(style==='glitch'){
   ink=grain>.72?210:8+grain*36;
   alpha=shape==='circle'?1-censorSmooth(.982,1,r+(row-.5)*.06):1;
   if(row>.95)ink=grain>.3?235:20;
   if(row>.978&&grain>.2){red=235;green=12;blue=163}
   else if(row<.018&&grain>.2){red=5;green=217;blue=235}
  }
  const at=(y*tw+x)*4;rgba[at]=red??ink;rgba[at+1]=green??ink;rgba[at+2]=blue??ink;rgba[at+3]=Math.round(alpha*255);
 }
 if(soft){const low=document.createElement('canvas');low.width=tw;low.height=th;low.getContext('2d').putImageData(pixels,0,0);c.imageSmoothingEnabled=true;c.drawImage(low,0,0,w,h)}else c.putImageData(pixels,0,0);
 if(style==='label'){
  c.save();if(shape==='circle'){c.beginPath();c.ellipse(w/2,h/2,w*.49,h*.49,0,0,Math.PI*2);c.clip()}
  const rows=shape==='circle'?['CEN','SOR','ED']:['CENSORED'];
  rows.forEach((text,i)=>drawCensorWord(c,text,w/2,h/2+(i-(rows.length-1)/2)*h*.252,w*.82,shape==='circle'?h*.205:h*.43));c.restore();
 }
 return out;
}
function drawCensorWord(c,text,cx,cy,maxWidth,height){
 const unit=.62,gap=.14,total=text.length*unit+(text.length-1)*gap,scale=Math.min(height,maxWidth/total);
 const paths={C:[[.88,.14],[.72,.03],[.28,.03],[.12,.2],[.12,.8],[.28,.97],[.72,.97],[.88,.86]],E:[[.88,.03],[.12,.03],[.12,.97],[.88,.97],null,[.12,.5],[.76,.5]],N:[[.12,.97],[.12,.03],[.88,.97],[.88,.03]],S:[[.88,.14],[.72,.03],[.28,.03],[.12,.2],[.12,.38],[.28,.5],[.72,.5],[.88,.64],[.88,.8],[.72,.97],[.28,.97],[.12,.86]],R:[[.12,.97],[.12,.03],[.67,.03],[.88,.2],[.88,.36],[.67,.5],[.12,.5],null,[.58,.5],[.9,.97]],D:[[.12,.03],[.61,.03],[.88,.22],[.88,.78],[.61,.97],[.12,.97],[.12,.03]]};
 c.save();c.strokeStyle='#fff';c.lineWidth=.17;c.lineJoin='round';c.lineCap='square';c.translate(cx-total*scale/2,cy-scale/2);
 for(const char of text){c.save();c.scale(unit*scale,scale);c.beginPath();if(char==='O')c.ellipse(.5,.5,.38,.47,0,0,Math.PI*2);else{let move=true;for(const point of paths[char]||[]){if(!point){move=true;continue}c[move?'moveTo':'lineTo'](...point);move=false}}c.stroke();c.restore();c.translate((unit+gap)*scale,0)}c.restore();
}
function drawCensorAsset(c,b,im,info){
 if(info.censor.dialog)return drawCensorDialog(c,b);if(info.censor.sign)return drawCensorSign(c,b);if(info.censor.tape)return drawEditableCensorTape(c,b);if(info.censor.backdrop)return drawBackdropCensor(c,b);
 c.save();c.globalAlpha=b.opacity??1;
 if(b.warp?.some(v=>v))drawWarpedSticker(c,{...b,opacity:1,assetRecolor:false},im,{...info,fixed:false});
 else c.drawImage(im,...info.box,b.x,b.y,b.w,b.h);
 c.restore();return false;
}
function renderCensorChoices(host){
 for(const shape of ['dialog','editable','rect','circle']){
  if(shape==='editable'&&!referenceBalloons.some(r=>r.censor?.tape||r.censor?.backdrop||r.censor?.sign))continue;
  const title=document.createElement('div');title.className='censor-catalog-heading';title.textContent=shape==='dialog'?'다이얼로그 · 경고창 · 금지표시 6종':shape==='editable'?'문구 · 표지판 · 링 · 실제 이미지 흐림':shape==='rect'?'사각 · 긴 가림막':'원형 · 타원';host.append(title);
  for(const r of referenceBalloons.filter(r=>r.collection==='censor'&&(shape==='dialog'?r.censor.dialog:shape==='editable'?(!r.censor.dialog&&(r.censor.tape||r.censor.backdrop||r.censor.sign)):!r.censor.tape&&!r.censor.backdrop&&!r.censor.sign&&r.censor.shape===shape))){
   const button=document.createElement('button');button.type='button';button.className='type reference-choice censor-choice';button.title=r.label;
   const preview=document.createElement('canvas');preview.width=220;preview.height=150;preview.setAttribute('aria-hidden','true');const g=preview.getContext('2d');
   for(let y=0;y<150;y+=12)for(let x=0;x<220;x+=12){g.fillStyle=(x/12+y/12)%2?'#afc3bc':'#edf1ed';g.fillRect(x,y,12,12)}
   const scale=Math.min(204/r.box[2],134/r.box[3]);loadReference(r.id).then(im=>g.drawImage(im,(220-r.box[2]*scale)/2,(150-r.box[3]*scale)/2,r.box[2]*scale,r.box[3]*scale)).catch(()=>{});
   const label=document.createElement('span');label.textContent=r.label;button.append(preview,label);button.onclick=()=>addReference(r.id);host.append(button);
  }
 }
}
