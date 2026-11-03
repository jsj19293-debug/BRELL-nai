'use strict';
const censorWarningText='위험! 열등 유전자 근절조치에 협조해 주시기 바랍니다. Warning! Please cooperate with the measures to eradicate inferior genes.';
const censorRingPalettes={pink:{color:'#ffffff',fill:'#f6add2',stroke:'#f000bf',textGradient:'solid',gradientBottom:'#ffffff'},lime:{color:'#78b456',fill:'#08130d',stroke:'#8da867',textGradient:'vertical',gradientBottom:'#d8dc83'}};
for(const [i,s]of [
 {id:'censor-chip-rect',name:'베타칩 이식 완료',style:'chip',shape:'rect',box:[0,0,1000,300],color:'#080808',fill:'#f8d62c',text:'베타칩 이식 완료'},
 {id:'censor-notice-rect',name:'노이즈 경고 말풍선',style:'notice',shape:'rect',box:[0,0,1000,300],color:'#ffe02e',fill:'#031b29',text:'도태남 접근금지'},
 {id:'censor-ring-circle',name:'원형 문구 · 검열 해제 링',style:'ring',shape:'circle',box:[0,0,500,500],color:'#ffffff',fill:'#f6add2',text:'여기에 문구를 입력하세요 ·'},
 {id:'censor-ring-lime-circle',name:'검정·연두 그라데이션 링',style:'ring',shape:'circle',box:[0,0,500,500],...censorRingPalettes.lime,text:'여기에 문구를 입력하세요 ·'}
].entries())referenceBalloons.push({id:s.id,name:s.name,label:s.name,collection:'censor',catalogNumber:21+i,fixed:true,preserveAlpha:true,censor:{style:s.style,shape:s.shape,sign:true,ring:s.style==='ring',defaultText:s.text,...(s.textGradient?{textGradient:s.textGradient,gradientBottom:s.gradientBottom}:{})},box:s.box,body:[0,0,1,1],color:s.color,fill:s.fill,...(s.stroke?{stroke:s.stroke}:{}),defaultOpacity:1});
function isCensorSign(b){return !!censorInfo(b)?.sign}
function isCensorRing(b){return !!censorInfo(b)?.ring}
function censorSignSetting(b,key){return b.censorSettings?.[key]??({tracking:3,band:16,angle:-90,reveal:'all',repeat:true,warningText:censorWarningText,bannerOffset:40,textGradient:'solid',gradientBottom:b.color}[key])}
function censorRingPalette(b){return Object.keys(censorRingPalettes).find(key=>{const p=censorRingPalettes[key];return ['color','fill','stroke'].every(k=>b[k]?.toLowerCase()===p[k])&&censorSignSetting(b,'textGradient')===p.textGradient&&(p.textGradient==='solid'||censorSignSetting(b,'gradientBottom')?.toLowerCase()===p.gradientBottom)})||'custom'}
function censorSignRotation(c,b,inverse=false){const angle=(b.objectRotation||0)*Math.PI/180*(inverse?-1:1);if(!angle)return;c.translate(b.x+b.w/2,b.y+b.h/2);c.rotate(angle);c.translate(-b.x-b.w/2,-b.y-b.h/2)}
function censorSignLine(c,b,text,x,y,width,maxSize,tracking=0,stroke=null){
 const chars=Array.from(text),weight=b.weight||'900',font=typeof family==='function'?family(b):'sans-serif';let size=Math.min(maxSize,b.fontSize*1000/b.w||maxSize),gap=tracking;
 const setFont=()=>{c.font=`${weight} ${size}px ${font}`};setFont();let lengths=chars.map(t=>c.measureText(t).width),total=lengths.reduce((a,v)=>a+v,0)+Math.max(0,chars.length-1)*gap;
 if(total>width){const k=width/total;size*=k;gap*=k;setFont();lengths=chars.map(t=>c.measureText(t).width);total=lengths.reduce((a,v)=>a+v,0)+Math.max(0,chars.length-1)*gap}
 const metrics=c.measureText(text),baseline=y+((metrics.actualBoundingBoxAscent??size*.8)-(metrics.actualBoundingBoxDescent??size*.2))/2;c.textAlign='left';c.textBaseline='alphabetic';let left=x-total/2;
 for(let i=0;i<chars.length;i++){if(stroke){c.strokeStyle=stroke;c.lineWidth=Math.max(1.5,size*.045);c.strokeText(chars[i],left,baseline)}c.fillText(chars[i],left,baseline);left+=lengths[i]+gap}
}
function drawCensorChip(c,b){
 c.fillStyle=b.fill;c.fillRect(0,0,1000,300);c.fillStyle=b.color;
 for(const y of [0,276]){c.save();c.beginPath();c.rect(0,y,1000,24);c.clip();for(let x=-90;x<1100;x+=124){c.beginPath();c.moveTo(x,y+24);c.lineTo(x+29,y);c.lineTo(x+94,y);c.lineTo(x+65,y+24);c.closePath();c.fill()}c.restore()}
 for(const x of [24,846]){
  c.fillStyle=b.color;c.fillRect(x+34,70,64,100);c.beginPath();c.moveTo(x,154);c.lineTo(x+132,154);c.lineTo(x+66,232);c.closePath();c.fill();
  c.save();c.translate(x+66,143);c.strokeStyle=b.fill;c.lineWidth=2;c.beginPath();c.moveTo(0,-38);c.lineTo(43,37);c.lineTo(-43,37);c.closePath();c.stroke();
  for(const [px,py]of [[0,-5],[-15,21],[15,21]]){c.beginPath();c.arc(px,py,12,0,Math.PI*2);c.fillStyle=b.fill;c.fill();c.fillStyle=b.color;for(let i=0;i<5;i++){c.beginPath();const a=i*Math.PI*2/5;c.arc(px+Math.cos(a)*5,py+Math.sin(a)*5,1.6,0,Math.PI*2);c.fill()}}
  c.restore();
 }
 c.fillStyle=b.color;censorSignLine(c,b,b.text.replace(/[\r\n]+/g,' ').slice(0,500),500,150,650,110,censorSignSetting(b,'tracking')*1000/b.w);
 c.font=`900 16px ${typeof family==='function'?family(b):'sans-serif'}`;c.textBaseline='alphabetic';c.textAlign='left';const warning=censorSignSetting(b,'warningText').replace(/[\r\n]+/g,' '),step=Math.max(1,c.measureText(warning+' ').width);
 if(warning.trim())for(const y of [42,268]){const offset=y===268?step*censorSignSetting(b,'bannerOffset')/100:0;for(let x=7-offset,n=0;x<1000&&n<256;x+=step,n++)c.fillText(warning+' ',x,y);}
}
function drawCensorNotice(c,b){
 const strength=censorSetting(b,'strength')/100,alpha=c.globalAlpha;
 for(let i=0;i<420;i++){
  const a=censorHash(i,19,93),v=censorHash(i,63,217),x=35+a*930,y=28+v*244,near=Math.abs(y-150)>62;
  c.globalAlpha=alpha*(near?.35:.8)*(.45+strength*.55);c.fillStyle=['#00f1df','#f32845','#ffffff','#18222f'][i%4];
  if(i%5===0)c.fillRect(x,y,1+censorHash(i,7)*2,(8+censorHash(i,8)*70)*strength);
  else c.fillRect(x,y,(4+censorHash(i,11)*86)*strength,i%7===0?4:1+censorHash(i,27)*2);
 }
 c.globalAlpha=alpha;c.fillStyle='#ed2643';c.fillRect(67,96,865,119);c.fillStyle='#00e7d9';c.fillRect(75,79,852,130);c.fillStyle=b.fill;c.fillRect(76,86,848,126);
 const rows=b.text.split('\n').slice(0,3),size=Math.min(100,104/Math.max(1,rows.length));c.fillStyle=b.color;
 rows.forEach((text,i)=>censorSignLine(c,b,text.slice(0,500),500,149+(i-(rows.length-1)/2)*(size+6),782,size,censorSignSetting(b,'tracking')*1000/b.w,'#f44135'));
}
function censorRingInnerPath(b){
 const p=new Path2D(),r=.5-censorSignSetting(b,'band')/100;
 if(b.warp?.some(v=>v)){for(let i=0;i<192;i++){const a=i*Math.PI*2/192,f=1+warpAmount(b,a),x=b.x+b.w*(.5+Math.cos(a)*r*f),y=b.y+b.h*(.5+Math.sin(a)*r*f);i?p.lineTo(x,y):p.moveTo(x,y)}p.closePath()}
 else p.ellipse(b.x+b.w/2,b.y+b.h/2,b.w*r,b.h*r,0,0,Math.PI*2);
 return p;
}
function censorRingInk(c,b,x,y,angle){
 if(censorSignSetting(b,'textGradient')!=='vertical')return b.color;
 // Undo the glyph transform so every letter shares the ring's top-to-bottom axis.
 const cos=Math.cos(angle),sin=Math.sin(angle),top=-500-y,bottom=500-y;
 const ink=c.createLinearGradient(-x*cos+top*sin,x*sin+top*cos,-x*cos+bottom*sin,x*sin+bottom*cos);
 ink.addColorStop(0,b.color);ink.addColorStop(1,censorSignSetting(b,'gradientBottom'));return ink;
}
function drawCensorRing(c,b){
 const band=censorSignSetting(b,'band')*10,inner=500-band,radius=500-band/2;
 c.save();c.translate(500,500);c.fillStyle=b.fill;c.beginPath();c.arc(0,0,495,0,Math.PI*2);c.arc(0,0,inner,0,Math.PI*2,true);c.fill();c.strokeStyle=b.stroke||'#f000bf';c.lineWidth=10;
 for(const r of [495,inner]){c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.stroke()}
 const plain=b.text.replace(/[\r\n]+/g,' ').slice(0,500);if(!plain.trim()){c.restore();return}
 const font=typeof family==='function'?family(b):'sans-serif';let size=Math.min(b.fontSize*1000/Math.min(b.w,b.h),band*.65),gap=censorSignSetting(b,'tracking')*1000/Math.min(b.w,b.h),chars=Array.from(plain),circ=Math.PI*2*radius;
 c.font=`${b.weight||'700'} ${size}px ${font}`;let lengths=chars.map(t=>c.measureText(t).width),total=lengths.reduce((a,v)=>a+v,0)+gap*chars.length;
 if(total>circ*.96){const k=circ*.96/total;size*=k;gap*=k;c.font=`${b.weight||'700'} ${size}px ${font}`;lengths=chars.map(t=>c.measureText(t).width);total=lengths.reduce((a,v)=>a+v,0)+gap*chars.length}
 if(censorSignSetting(b,'repeat')){
  const count=Math.max(1,Math.min(16,Math.floor(circ/(total+size))));chars=Array.from((plain+' ').repeat(count));lengths=chars.map(t=>c.measureText(t).width);gap=Math.max(0,(circ-lengths.reduce((a,v)=>a+v,0))/chars.length);
 }
 const metrics=c.measureText(plain),dy=((metrics.actualBoundingBoxAscent??size*.8)-(metrics.actualBoundingBoxDescent??size*.2))/2;c.textAlign='center';c.textBaseline='alphabetic';c.fillStyle=b.color;
 let a=censorSignSetting(b,'angle')*Math.PI/180;for(let i=0;i<chars.length;i++){const advance=lengths[i]+gap,angle=a+advance/radius/2,x=Math.cos(angle)*radius,y=Math.sin(angle)*radius,turn=angle+Math.PI/2;c.save();c.translate(x,y);c.rotate(turn);c.fillStyle=censorRingInk(c,b,x,y,turn);c.fillText(chars[i],0,dy);c.restore();a+=advance/radius}c.restore();
}
function drawCensorSignFace(c,b){const style=censorInfo(b).style;c.save();c.translate(b.x,b.y);c.scale(b.w/1000,b.h/(style==='ring'?1000:300));c.beginPath();c.rect(0,0,1000,style==='ring'?1000:300);c.clip();if(style==='chip')drawCensorChip(c,b);else if(style==='notice')drawCensorNotice(c,b);else drawCensorRing(c,b);c.restore()}
function drawCensorSign(c,b){
 if((b.opacity??1)<=0)return false;
 c.save();c.globalAlpha=b.opacity??1;
 try{if(b.warp?.some(v=>v)||(b.opacity??1)<1){
  const density=Math.min(1,1200/b.w,1200/b.h,Math.sqrt(500000/(b.w*b.h))),im=document.createElement('canvas');im.width=Math.max(1,Math.floor(b.w*density));im.height=Math.max(1,Math.floor(b.h*density));const g=im.getContext('2d');g.scale(im.width/b.w,im.height/b.h);drawCensorSignFace(g,{...b,x:0,y:0,opacity:1});
  if(b.warp?.some(v=>v))drawWarpedSticker(c,{...b,opacity:1,assetRecolor:false},im,{fixed:false,box:[0,0,im.width,im.height]});else try{c.drawImage(im,b.x,b.y,b.w,b.h)}finally{im.width=im.height=1}
 }else drawCensorSignFace(c,b)}finally{c.restore()}return false;
}
function makeCensorSignPreview(info){const out=document.createElement('canvas');out.width=info.box[2];out.height=info.box[3];drawCensorSign(out.getContext('2d'),{kind:'asset',assetId:info.id,x:0,y:0,w:out.width,h:out.height,text:info.censor.defaultText,fontSize:info.censor.ring?38:105,weight:'900',color:info.color,fill:info.fill,stroke:info.stroke||'#f000bf',opacity:1,censorSettings:{version:1,tracking:info.censor.style==='notice'?14:3,...(info.censor.textGradient?{textGradient:info.censor.textGradient,gradientBottom:info.censor.gradientBottom}:{})}});return out}
// Remove only app-native filters below the ring, before drawing those filters.
// The original pixels and intervening ordinary layers are never erased or replayed.
function makeCensorRevealLayer(c,b,out,box){
 if(typeof state==='undefined'||!Array.isArray(state.items))return null;const index=state.items.findIndex(o=>o===b||b.id&&o.id===b.id);if(index<0)return null;
 const style=censorInfo(b).style,rings=state.items.slice(index+1).filter(o=>{
  if(o.visible===false||!isCensorRing(o)||(o.opacity??1)<=0)return false;const mode=censorSignSetting(o,'reveal');if(mode==='none'||mode==='mosaic'&&style!=='mosaic'||mode==='blur'&&style==='mosaic')return false;
  // Conservative overlap in the filter's unrotated coordinate space.
  const cx=o.x+o.w/2,cy=o.y+o.h/2,r=Math.hypot(o.w,o.h)*.65,angle=-(b.objectRotation||0)*Math.PI/180,dx=cx-b.x-b.w/2,dy=cy-b.y-b.h/2,x=b.x+b.w/2+dx*Math.cos(angle)-dy*Math.sin(angle),y=b.y+b.h/2+dx*Math.sin(angle)+dy*Math.cos(angle);
  return x+r>box.x&&x-r<box.x+box.w&&y+r>box.y&&y-r<box.y+box.h;
 });if(!rings.length)return null;
 const density=Math.min(1,1024/box.w,1024/box.h,Math.sqrt(524288/(box.w*box.h))),layer=document.createElement('canvas');layer.width=Math.max(1,Math.floor(box.w*density));layer.height=Math.max(1,Math.floor(box.h*density));
 const mask=document.createElement('canvas');mask.width=layer.width;mask.height=layer.height;
 try{const g=layer.getContext('2d');g.imageSmoothingEnabled=style!=='mosaic';g.drawImage(out,0,0,layer.width,layer.height);const m=mask.getContext('2d');m.scale(layer.width/box.w,layer.height/box.h);m.translate(-box.x,-box.y);censorSignRotation(m,b,true);
  for(const ring of rings){m.save();m.fillStyle=`rgba(0,0,0,${Math.max(0,Math.min(1,ring.opacity??1))})`;censorSignRotation(m,ring);m.fill(censorRingInnerPath(ring));m.restore()}
  // An explicit alpha mask keeps overlapping/faded reveals consistent across
  // Canvas implementations, including their Porter-Duff rounding differences.
  const pixels=g.getImageData(0,0,layer.width,layer.height),holes=m.getImageData(0,0,layer.width,layer.height).data;
  for(let i=3;i<pixels.data.length;i+=4)pixels.data[i]=Math.round(pixels.data[i]*(1-holes[i]/255));g.putImageData(pixels,0,0);return layer;
 }catch(e){layer.width=layer.height=1;throw e}finally{mask.width=mask.height=1}
}
