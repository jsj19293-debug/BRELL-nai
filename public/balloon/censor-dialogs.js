'use strict';
// Editable, code-native reference designs. No character art or flattened text.
const censorDialogs=[
 {style:'glitch-dialog',name:'글리치 다이얼로그 박스',w:1000,h:550,color:'#08090b',fill:'#03090d',stroke:'#ffffff',size:.105,text:'너같은 남자는\n평생 못봐'},
 {style:'rough-warning',name:'조잡한 빨간 경고창',w:900,h:570,color:'#090909',fill:'#ffffff',stroke:'#e62526',size:.058,text:'이 콘텐츠는 더 이상 열람이\n불가합니다.\n이 이상의 접근은 제한될 수\n있습니다.',dialogTitle:'경 고'},
 {style:'site-warning',name:'Warning · 접속 차단 안내',w:1000,h:560,color:'#080808',fill:'#56b4ef',stroke:'#ff875e',size:.05,text:'법률에 따라 적법하게 차단된 것이오니\n담당기관으로 문의해주세요~',dialogTitle:'Warning',dialogSubtitle:'불법·유해 시각정보 차단'},
 {style:'access-denied',name:'X · 열람 권한 없음',w:1000,h:640,color:'#555555',fill:'#a5a5a5',stroke:'#555555',size:.07,text:'열람 권한이 없습니다☆'},
 {style:'safe-dialog',name:'클래식 경고 다이얼로그',w:1000,h:730,color:'#080808',fill:'#ffffff',stroke:'#bda9c4',size:.048,text:'허용되지 않은 이미지가\n감지되었습니다.\n접근 권한을 확인한 뒤\n다시 시도해 주세요.',dialogTitle:'SAFE GUARD',dialogButton:'확인',dialogFooter:'안전한 이미지로 재시도'},
 {style:'prohibition-text',name:'금지표시 · 겹치는 문구',w:1000,h:850,color:'#050505',fill:'#e92525',stroke:'#c3bce5',size:.17,text:'궁금하지?\n안알려줘'}
];
for(const [i,d]of censorDialogs.entries())referenceBalloons.push({id:'censor-'+d.style,name:d.name,label:d.name,collection:'censor',catalogNumber:25+i,fixed:true,preserveAlpha:true,box:[0,0,d.w,d.h],body:[0,0,1,1],color:d.color,fill:d.fill,stroke:d.stroke,defaultOpacity:1,censor:{style:d.style,shape:'rect',sign:true,dialog:true,defaultText:d.text,fontRatio:d.size,defaults:Object.fromEntries(['dialogTitle','dialogSubtitle','dialogButton','dialogFooter'].filter(k=>d[k]!==undefined).map(k=>[k,d[k]]))}});
function isCensorDialog(b){return !!censorInfo(b)?.dialog}
function censorDialogSetting(b,key){return b.censorSettings?.[key]??censorInfo(b)?.defaults?.[key]??''}
function censorDialogFont(c,b,size){c.font=`${b.weight||'900'} ${Math.max(.01,size)}px ${typeof family==='function'?family(b):'sans-serif'}`;c.textAlign='center';c.textBaseline='alphabetic';c.lineJoin='round'}
function censorDialogRows(c,b,text,box,size,ink,outline=null,fit=true){
 const rows=String(text).split('\n').slice(0,20);size=Math.max(.01,size);censorDialogFont(c,b,size);
 if(fit){const width=Math.max(1,...rows.map(t=>c.measureText(t).width)),ratio=Math.min(1,box.w/width,box.h/(size*1.25*rows.length));size*=ratio;censorDialogFont(c,b,size)}
 const metrics=c.measureText('가나다Agpq'),ascent=metrics.actualBoundingBoxAscent||size*.8,descent=metrics.actualBoundingBoxDescent||size*.2,line=size*1.25,total=ascent+descent+(rows.length-1)*line,y=box.y+(box.h-total)/2+ascent;
 c.fillStyle=ink;c.strokeStyle=outline||ink;c.lineWidth=Math.max(2,size*.075);
 for(const [i,row]of rows.entries()){if(outline)c.strokeText(row,box.x+box.w/2,y+i*line);c.fillText(row,box.x+box.w/2,y+i*line)}
 return {width:Math.max(0,...rows.map(t=>c.measureText(t).width)),height:total};
}
function censorDialogIcon(c,type,x,y,r,ink,background){
 c.save();c.translate(x,y);c.fillStyle=ink;
 if(type==='warning'){
  c.beginPath();c.moveTo(0,-r);c.lineTo(r*.91,r*.75);c.quadraticCurveTo(r,r*.92,r*.75,r*.92);c.lineTo(-r*.75,r*.92);c.quadraticCurveTo(-r,r*.92,-r*.91,r*.75);c.closePath();c.fill();c.strokeStyle='#111111';c.lineWidth=r*.065;c.stroke();
  c.strokeStyle='#111111';c.lineWidth=r*.12;c.lineCap='round';c.beginPath();c.moveTo(0,-r*.37);c.lineTo(0,r*.25);c.stroke();c.fillStyle='#111111';c.beginPath();c.arc(0,r*.57,r*.08,0,Math.PI*2);c.fill();
 }else if(type==='x'){
  c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();c.strokeStyle=background;c.lineWidth=r*.25;c.lineCap='butt';c.beginPath();c.moveTo(-r*.56,-r*.56);c.lineTo(r*.56,r*.56);c.moveTo(-r*.56,r*.56);c.lineTo(r*.56,-r*.56);c.stroke();
 }else{
  c.strokeStyle=ink;c.lineWidth=r*.16;c.beginPath();c.arc(0,0,r*.91,0,Math.PI*2);c.stroke();c.beginPath();c.moveTo(-r*.65,-r*.65);c.lineTo(r*.65,r*.65);c.stroke();
 }c.restore();
}
function drawCensorGlitchBorder(c,b,w,h){
 const strength=censorSetting(b,'strength')/100,colors=['#03fff2','#ff28d9','#f6f258','#ffffff','#101a23'];
 c.strokeStyle='#edffff';c.lineWidth=12;c.strokeRect(9,9,w-18,h-18);
 for(let i=0;i<450;i++){
  const edge=i%4,a=censorHash(i,71,92),v=censorHash(i,19,331),length=4+censorHash(i,31,49)*112*strength,depth=3+censorHash(i,17,19)*27*strength;
  c.fillStyle=colors[i%colors.length];if(edge<2)c.fillRect(a*w,edge===0?v*20:h-v*20-depth,length,depth);else c.fillRect(edge===2?v*20:w-v*20-depth,a*h,depth,length*.5);
 }
 for(let i=0;i<300;i++){const x=30+censorHash(i,7)* (w-60),y=28+censorHash(i,45)*(h-56);c.fillStyle=i%5===0?'#314647':'#152226';c.fillRect(x,y,1+censorHash(i,8)*21,1)}
 c.fillStyle='#143638';for(let y=32;y<h-24;y+=4)c.fillRect(28,y,w-56,.35);
}
function drawCensorDialogFace(c,b){
 const info=referenceInfo(b.assetId),style=info.censor.style,w=info.box[2],h=info.box[3],size=b.fontSize*w/b.w;
 c.save();c.translate(b.x,b.y);c.scale(b.w/w,b.h/h);if(style!=='prohibition-text'){c.beginPath();c.rect(0,0,w,h);c.clip()}
 if(style==='glitch-dialog'){
  c.fillStyle=b.fill;c.fillRect(0,0,w,h);drawCensorGlitchBorder(c,b,w,h);censorDialogRows(c,b,b.text,{x:70,y:66,w:w-140,h:h-132},size,b.color,b.stroke);
 }else if(style==='rough-warning'){
  c.fillStyle=b.stroke;c.fillRect(0,0,w,h);c.fillStyle=b.fill;c.fillRect(38,38,w-76,h-76);
  censorDialogRows(c,b,censorDialogSetting(b,'dialogTitle'),{x:55,y:55,w:w-110,h:125},size*2.25,b.color);
  censorDialogRows(c,b,b.text,{x:65,y:202,w:w-130,h:h-260},size,b.color);
 }else if(style==='site-warning'){
  const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,b.fill);g.addColorStop(1,'#164970');c.fillStyle=g;c.fillRect(0,0,w,h);
  censorDialogRows(c,b,censorDialogSetting(b,'dialogTitle'),{x:70,y:35,w:490,h:145},size*2.8,'#fff788');
  censorDialogRows(c,b,censorDialogSetting(b,'dialogSubtitle'),{x:60,y:200,w:w-120,h:100},size*1.6,b.stroke);
  censorDialogRows(c,b,b.text,{x:60,y:343,w:w-120,h:145},size,b.color);
 }else if(style==='access-denied'){
  c.fillStyle=b.fill;c.fillRect(0,0,w,h);censorDialogIcon(c,'x',w/2,270,240,b.stroke,b.fill);
  censorDialogRows(c,b,b.text,{x:15,y:545,w:w-30,h:80},size,b.color);
 }else if(style==='safe-dialog'){
  c.fillStyle='#3e3441';c.fillRect(0,0,w,h);c.fillStyle='#e4dfe7';c.fillRect(3,3,w-6,h-6);c.fillStyle=b.stroke;c.fillRect(7,7,w-14,62);c.fillStyle=b.fill;c.fillRect(9,76,w-18,h-85);
  censorDialogRows(c,b,censorDialogSetting(b,'dialogTitle'),{x:18,y:9,w:695,h:52},size*1.23,b.color);
  for(let i=0;i<3;i++){const x=w-182+i*58;c.fillStyle='#d9cedd';c.fillRect(x,12,50,49);c.strokeStyle='#59495c';c.lineWidth=2;c.strokeRect(x,12,50,49);if(i===0){c.beginPath();c.moveTo(x+10,48);c.lineTo(x+39,48);c.stroke()}else if(i===1)c.strokeRect(x+10,21,30,29);else{c.beginPath();c.moveTo(x+10,22);c.lineTo(x+40,50);c.moveTo(x+40,22);c.lineTo(x+10,50);c.stroke()}}
  censorDialogIcon(c,'warning',140,205,86,'#ffe027',b.fill);
  censorDialogRows(c,b,b.text,{x:245,y:150,w:705,h:280},size,b.color);
  c.strokeStyle='#d6ccd9';c.lineWidth=3;c.beginPath();c.roundRect(360,495,280,91,20);c.stroke();censorDialogRows(c,b,censorDialogSetting(b,'dialogButton'),{x:370,y:505,w:260,h:71},size,b.color);
  c.strokeStyle='#bababa';c.lineWidth=2;c.strokeRect(38,650,44,44);censorDialogRows(c,b,censorDialogSetting(b,'dialogFooter'),{x:95,y:639,w:835,h:65},size*.9,'#555555');
 }else if(style==='prohibition-text'){
  // Only the sign has a geometric boundary. Its overlaid text is never clipped
  // to the circle or shrunk to fit: font size can extend past the whole object.
  censorDialogIcon(c,'prohibition',w/2,h/2,365,b.fill,null);
  censorDialogRows(c,b,b.text,{x:0,y:0,w,h},size,b.color,b.stroke,false);
 }c.restore();
}
function censorDialogBounds(c,b){
 if(censorInfo(b).style!=='prohibition-text')return{x:b.x,y:b.y,w:b.w,h:b.h};
 const info=referenceInfo(b.assetId),size=b.fontSize*info.box[2]/b.w;censorDialogFont(c,b,size);const rows=b.text.split('\n').slice(0,20),width=Math.max(b.w,...rows.map(t=>(c.measureText(t).width+size*.2)*b.w/info.box[2])),height=Math.max(b.h,(rows.length*size*1.25+size*.2)*b.h/info.box[3]);
 return{x:b.x+(b.w-width)/2,y:b.y+(b.h-height)/2,w:width,h:height};
}
function drawCensorDialog(c,b){
 if((b.opacity??1)<=0)return false;c.save();c.globalAlpha=b.opacity??1;
 try{if(b.warp?.some(v=>v)||(b.opacity??1)<1){
  const box=censorDialogBounds(c,b),d=Math.min(1,2048/box.w,2048/box.h,Math.sqrt(524288/(box.w*box.h))),im=document.createElement('canvas');im.width=Math.max(1,Math.floor(box.w*d));im.height=Math.max(1,Math.floor(box.h*d));
  try{const g=im.getContext('2d');g.scale(im.width/box.w,im.height/box.h);g.translate(-box.x,-box.y);drawCensorDialogFace(g,{...b,opacity:1});if(b.warp?.some(v=>v))drawWarpedSticker(c,{...b,...box,opacity:1,assetRecolor:false},im,{fixed:false,box:[0,0,im.width,im.height]});else c.drawImage(im,box.x,box.y,box.w,box.h)}finally{im.width=im.height=1}
 }else drawCensorDialogFace(c,b)}finally{c.restore()}return false;
}
function makeCensorDialogPreview(info){const out=document.createElement('canvas');out.width=info.box[2];out.height=info.box[3];drawCensorDialog(out.getContext('2d'),{kind:'asset',assetId:info.id,x:0,y:0,w:out.width,h:out.height,fontSize:out.width*info.censor.fontRatio,text:info.censor.defaultText,font:'comic_gyeonggi_title_medium',weight:'900',color:info.color,fill:info.fill,stroke:info.stroke,opacity:1});return out}
