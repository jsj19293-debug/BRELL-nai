'use strict';
// Editable tape and backdrop effects share native asset geometry and document history.
referenceBalloons.push({id:'censor-tape-rect',name:'반복 문구 경고 띠',label:'반복 문구 경고 띠',collection:'censor',catalogNumber:14,fixed:true,preserveAlpha:true,censor:{style:'tape',shape:'rect',tape:true},box:[0,0,640,96],body:[0,0,1,1],color:'#111111',fill:'#ffd34d',defaultOpacity:1});
for(const shape of ['rect','circle'])for(const [i,[style,label]]of [['mosaic','모자이크'],['blur','블러'],['frost','거친 흐림']].entries())referenceBalloons.push({id:`censor-${style}-${shape}`,name:label,label:label+' · '+(shape==='rect'?'사각':'원형'),collection:'censor',catalogNumber:15+i+(shape==='circle'?3:0),fixed:true,preserveAlpha:true,censor:{style,shape,backdrop:true},box:[0,0,shape==='rect'?480:384,384],body:[0,0,1,1],color:'#111111',fill:'#ffffff',defaultOpacity:1});
function isCensorTape(b){return !!censorInfo(b)?.tape}
function isBackdropCensor(b){return !!censorInfo(b)?.backdrop}
function isEditableCensor(b){const info=censorInfo(b);return !!(info?.tape||info?.backdrop||info?.sign)}
function censorSetting(b,key){return b.censorSettings?.[key]??(key==='scope'?'image':key==='gap'?36:55)}
function censorsAllArtwork(b){return isBackdropCensor(b)&&censorSetting(b,'scope')==='all'}
function validateCensorSettings(b){
 if(b.censorSettings===undefined)return;const s=b.censorSettings;
 if(!isCensorAsset(b)||!s||typeof s!=='object'||Array.isArray(s)||s.version!==1||Object.keys(s).some(k=>!['version','gap','strength','tracking','band','angle','reveal','repeat','warningText','bannerOffset','textGradient','gradientBottom','scope','cornerPoints','edgeQuarters','dialogTitle','dialogSubtitle','dialogButton','dialogFooter'].includes(k)))throw Error('검열 효과 설정이 올바르지 않습니다.');
 for(const key of ['dialogTitle','dialogSubtitle','dialogButton','dialogFooter'])if(s[key]!==undefined&&(!censorInfo(b)?.dialog||typeof s[key]!=='string'||s[key].length>500))throw Error('검열 다이얼로그 문구가 올바르지 않습니다.');
 for(const [key,min,max]of [['gap',0,240],['strength',1,100],['tracking',0,40],['band',8,36],['angle',-180,180],['bannerOffset',0,100]])if(s[key]!==undefined&&(!Number.isFinite(s[key])||s[key]<min||s[key]>max))throw Error('검열 효과 강도나 간격이 올바르지 않습니다.');
 if(s.reveal!==undefined&&!['all','none','mosaic','blur'].includes(s.reveal)||s.repeat!==undefined&&typeof s.repeat!=='boolean'||s.warningText!==undefined&&(typeof s.warningText!=='string'||s.warningText.length>500))throw Error('검열 문구나 링 설정이 올바르지 않습니다.');
 if(s.textGradient!==undefined&&!['solid','vertical'].includes(s.textGradient)||s.gradientBottom!==undefined&&(typeof s.gradientBottom!=='string'||!/^#[0-9a-f]{6}$/i.test(s.gradientBottom)))throw Error('링 글자 그라데이션 설정이 올바르지 않습니다.');
 if(s.scope!==undefined&&!['image','all'].includes(s.scope))throw Error('검열 대상 설정이 올바르지 않습니다.');
 if((s.cornerPoints!==undefined||s.edgeQuarters!==undefined)&&!isBackdropCensor(b)||s.cornerPoints!==undefined&&![8,16].includes(s.cornerPoints)||s.edgeQuarters!==undefined&&(!Array.isArray(s.edgeQuarters)||s.edgeQuarters.length!==8||s.edgeQuarters.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||Math.abs(v)>.8))))throw Error('검열 영역의 정밀 모서리 정보가 올바르지 않습니다.');
}
function drawCensorTapeFace(c,b){
 const size=Math.max(1,Math.min(b.fontSize||36,b.h*.74)),gap=censorSetting(b,'gap'),border=Math.min(4,b.h*.065);
 c.save();c.beginPath();c.rect(b.x,b.y,b.w,b.h);c.clip();c.fillStyle=b.fill||'#ffd34d';c.fillRect(b.x,b.y,b.w,b.h);c.fillStyle=b.color||'#111111';c.fillRect(b.x,b.y,b.w,border);c.fillRect(b.x,b.y+b.h-border,b.w,border);
 c.font=`${b.weight||900} ${size}px ${typeof family==='function'?family(b):'sans-serif'}`;c.textAlign='left';c.textBaseline='alphabetic';
 const text=(b.text??'접근 금지').replace(/[\r\n]+/g,' ').slice(0,500),m=c.measureText(text),step=Math.max(1,m.width+gap),asc=m.actualBoundingBoxAscent??size*.8,desc=m.actualBoundingBoxDescent??size*.2,y=b.y+(b.h+asc-desc)/2;
 if(text.trim())for(let x=b.x+gap/2,n=0;x<b.x+b.w&&n<4096;x+=step,n++)c.fillText(text,x,y);
 c.restore();
}
function drawEditableCensorTape(c,b){
 c.save();c.globalAlpha=b.opacity??1;
 if(b.warp?.some(v=>v)){
  const density=Math.min(1,2048/b.w,512/b.h,Math.sqrt(524288/(b.w*b.h))),im=document.createElement('canvas');im.width=Math.max(1,Math.ceil(b.w*density));im.height=Math.max(1,Math.ceil(b.h*density));
  const g=im.getContext('2d');g.scale(im.width/b.w,im.height/b.h);drawCensorTapeFace(g,{...b,x:0,y:0});
  drawWarpedSticker(c,{...b,opacity:1,assetRecolor:false},im,{fixed:false,box:[0,0,im.width,im.height]});
 }else drawCensorTapeFace(c,b);
 c.restore();return false;
}
function hasCensorCorners(b){return isBackdropCensor(b)&&(!!b.warpCorners?.some(([x,y])=>x||y)||typeof hasCornerEdges==='function'&&hasCornerEdges(b))}
function censorMaskGeometry(b){
 const info=censorInfo(b),path=new Path2D(),points=[];
 if(hasCensorCorners(b)){
  const m=cornerProjector({...b,rotation:0});for(let i=0;i<192;i++){const a=i*Math.PI*2/192,co=Math.cos(a),si=Math.sin(a),r=info.shape==='circle'?.5:.5/Math.max(Math.abs(co),Math.abs(si)),f=1+(b.warp?.some(v=>v)?warpAmount(b,a):0),p=m.map(.5+co*r*f,.5+si*r*f);points.push(p);i?path.lineTo(p.x,p.y):path.moveTo(p.x,p.y)}path.closePath();
 }else if(b.warp?.some(v=>v)){
  for(let i=0;i<192;i++){const a=i*Math.PI*2/192,co=Math.cos(a),si=Math.sin(a),r=info.shape==='circle'?.5:.5/Math.max(Math.abs(co),Math.abs(si)),f=1+warpAmount(b,a),x=b.x+b.w*(.5+co*r*f),y=b.y+b.h*(.5+si*r*f);points.push({x,y});i?path.lineTo(x,y):path.moveTo(x,y)}path.closePath();
 }else{if(info.shape==='circle')path.ellipse(b.x+b.w/2,b.y+b.h/2,b.w/2,b.h/2,0,0,Math.PI*2);else path.rect(b.x,b.y,b.w,b.h);points.push({x:b.x,y:b.y},{x:b.x+b.w,y:b.y+b.h})}
 const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));return{path,points,x,y,w:Math.max(...points.map(p=>p.x))-x,h:Math.max(...points.map(p=>p.y))-y};
}
function censorCapture(c,box,width,height){
 const out=document.createElement('canvas');out.width=width;out.height=height;const g=out.getContext('2d'),m=c.getTransform(),det=m.a*m.d-m.b*m.c;
 if(!Number.isFinite(det)||Math.abs(det)<1e-12){out.width=out.height=1;return null}
 g.imageSmoothingQuality='high';g.scale(width/box.w,height/box.h);g.translate(-box.x,-box.y);
 g.transform(m.d/det,-m.b/det,-m.c/det,m.a/det,(m.c*m.f-m.d*m.e)/det,(m.b*m.e-m.a*m.f)/det);
 g.drawImage(c.canvas,0,0);return out;
}
// Three separable box passes, premultiplied alpha; no browser Canvas filter dependency.
function censorBlurPixels(image,w,h,radius){
 const a=image.data,tmp=new Uint8ClampedArray(a.length),r=Math.max(1,Math.round(radius/Math.sqrt(3))),span=r*2+1;
 for(let i=0;i<a.length;i+=4)for(let k=0;k<3;k++)a[i+k]=a[i+k]*a[i+3]/255;
 for(let pass=0;pass<3;pass++)for(const vertical of [false,true]){
  const src=vertical?tmp:a,dst=vertical?a:tmp,lines=vertical?w:h,length=vertical?h:w,stride=vertical?w*4:4;
  for(let line=0;line<lines;line++)for(let k=0;k<4;k++){
   const start=(vertical?line:line*w)*4+k;let sum=0;for(let j=-r;j<=r;j++)sum+=src[start+Math.max(0,Math.min(length-1,j))*stride];
   for(let i=0;i<length;i++){dst[start+i*stride]=sum/span;sum+=src[start+Math.min(length-1,i+r+1)*stride]-src[start+Math.max(0,i-r)*stride]}
  }
 }
 for(let i=0;i<a.length;i+=4)if(a[i+3])for(let k=0;k<3;k++)a[i+k]=Math.min(255,a[i+k]*255/a[i+3]);
}
function drawBackdropCensor(c,b){
 if((b.opacity??1)<=0)return false;
 const mask=censorMaskGeometry(b),strength=censorSetting(b,'strength'),style=censorInfo(b).style,radius=style==='frost'?2+strength*.12:2+strength*.45,pad=style==='mosaic'?0:radius*3;
 const box={x:mask.x-pad,y:mask.y-pad,w:mask.w+pad*2,h:mask.h+pad*2};
 let density=Math.min(1,1024/box.w,1024/box.h,Math.sqrt(524288/(box.w*box.h))),w,h;
 if(style==='mosaic'){
  const cell=Math.max(4+strength*.6,box.w/1000,box.h/1000,Math.sqrt(box.w*box.h/500000));if(hasCensorCorners(b)){const right=box.x+box.w,bottom=box.y+box.h;box.x=b.x+Math.floor((box.x-b.x)/cell)*cell;box.y=b.y+Math.floor((box.y-b.y)/cell)*cell;box.w=right-box.x;box.h=bottom-box.y;}w=Math.max(1,Math.ceil(box.w/cell));h=Math.max(1,Math.ceil(box.h/cell));box.w=w*cell;box.h=h*cell;
 }else{w=Math.max(1,Math.floor(box.w*density));h=Math.max(1,Math.floor(box.h*density))}
 const out=censorCapture(c,box,w,h);if(!out)return false;
 let revealed=null;try{
  const g=out.getContext('2d');if(style!=='mosaic'){
   const image=g.getImageData(0,0,w,h);censorBlurPixels(image,w,h,radius*density);
   if(style==='frost'){
    const a=image.data,copy=new Uint8ClampedArray(a),jitter=Math.max(1,(4+strength*.55)*density);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
     const xx=Math.max(0,Math.min(w-1,Math.round(x+(censorHash(x,y,901)-.5)*jitter*2))),yy=Math.max(0,Math.min(h-1,Math.round(y+(censorHash(x,y,337)-.5)*jitter*2))),from=(yy*w+xx)*4,at=(y*w+x)*4;
     for(let k=0;k<4;k++)a[at+k]=copy[from+k];
    }
   }g.putImageData(image,0,0);
  }
  if(typeof makeCensorRevealLayer==='function')revealed=makeCensorRevealLayer(c,b,out,box);
  c.save();try{c.clip(mask.path);c.globalAlpha=b.opacity??1;c.imageSmoothingEnabled=style!=='mosaic';c.drawImage(revealed||out,box.x,box.y,box.w,box.h)}finally{c.restore()}
 }finally{if(revealed)revealed.width=revealed.height=1;out.width=out.height=1}
 return false;
}
function makeEditableCensorPreview(info){
 const out=document.createElement('canvas');out.width=info.box[2];out.height=info.box[3];const c=out.getContext('2d'),b={kind:'asset',assetId:info.id,x:0,y:0,w:out.width,h:out.height,opacity:1,text:'접근 금지 ·',fontSize:58,weight:900,color:info.color,fill:info.fill};
 if(info.censor.tape)drawCensorTapeFace(c,b);
 else{
  const grad=c.createLinearGradient(0,0,out.width,out.height);grad.addColorStop(0,'#f3c178');grad.addColorStop(.45,'#e77d9b');grad.addColorStop(1,'#2b7ca2');c.fillStyle=grad;c.fillRect(0,0,out.width,out.height);
  c.fillStyle='#213b69';for(let x=0;x<out.width;x+=36)c.fillRect(x,0,12,out.height);c.fillStyle='#f1edd8';c.beginPath();c.arc(out.width*.55,out.height*.5,out.height*.33,0,Math.PI*2);c.fill();drawBackdropCensor(c,b);
  if(info.censor.shape==='circle'){c.globalCompositeOperation='destination-in';c.beginPath();c.ellipse(out.width/2,out.height/2,out.width/2,out.height/2,0,0,Math.PI*2);c.fill()}
 }return out;
}
