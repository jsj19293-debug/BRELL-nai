'use strict';
const limbusImages=new Map(),limbusImagePending=new Map(),limbusRenderInfo=new Map();
function lcBase(d){return d.template==='journal'?{w:960,h:1240}:{w:1280,h:720};}
function lcViewport(l){const base=lcBase(limbusData(l)),scale=Math.min(l.w/base.w,l.h/base.h);return{...base,scale,x:(l.w-base.w*scale)/2,y:(l.h-base.h*scale)/2};}
async function loadLimbusAssets(l){
 const d=limbusData(l);await Promise.all([...new Set([d.style.font,...Object.values(d.textStyles).map(s=>s.font)].filter(Boolean))].map(ensureComicFont));
 await Promise.all(Object.values(d.images).filter(i=>i.src).map(async i=>{if(limbusImages.has(i.src))return;if(!limbusImagePending.has(i.src)){const p=imageFrom(i.src).then(im=>{limbusImages.set(i.src,im);return im;}).finally(()=>limbusImagePending.delete(i.src));limbusImagePending.set(i.src,p);}await limbusImagePending.get(i.src);}));
 if(d.template==='combat'&&typeof ensureBadStatusPixelIcons==='function')await ensureBadStatusPixelIcons();
}
function limbusBitmap(l,{transparent=false,uiOnly=false}={}){
 const d=limbusData(l),v=lcViewport(l),out=document.createElement('canvas'),raster=Math.min(1,4000/l.w,5000/l.h);out.width=Math.max(1,Math.round(l.w*raster));out.height=Math.max(1,Math.round(l.h*raster));
 const c=out.getContext('2d'),st=d.style,o=d.options,tx=d.texts,hits=[],overflow=[];c.scale(raster,raster);c.translate(v.x,v.y);c.scale(v.scale,v.scale);c.globalAlpha=st.opacity;c.save();c.beginPath();c.rect(0,0,v.w,v.h);c.clip();
 const polygon=(points,fill,stroke,width=1)=>{c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.lineWidth=width;c.strokeStyle=stroke;c.stroke();}};
 const cut=(x,y,w,h,k=10)=>[[x+k,y],[x+w-k,y],[x+w,y+k],[x+w,y+h-k],[x+w-k,y+h],[x+k,y+h],[x,y+h-k],[x,y+k]];
 function frame(x,y,w,h,{fill='#191511',edge=st.frame,glow=false,hazard=false}={}){
  c.save();if(glow){c.shadowColor=edge;c.shadowBlur=8;}polygon(cut(x,y,w,h),fill,edge,3);c.restore();polygon(cut(x+5,y+5,w-10,h-10,7),null,edge,1);polygon(cut(x+8,y+8,w-16,h-16,5),null,'#080706',1);
  if(hazard){c.save();c.beginPath();cut(x+3,y+3,w-6,h-6,8).forEach(([a,b],i)=>i?c.lineTo(a,b):c.moveTo(a,b));c.closePath();c.clip();c.strokeStyle='#b29125';c.lineWidth=6;for(let i=x-h;i<x+w;i+=17){c.beginPath();c.moveTo(i,y);c.lineTo(i+h,y+h);c.stroke();}c.restore();polygon(cut(x+11,y+11,w-22,h-22,3),fill,edge,1);}
  if(st.decoration&&!hazard){for(const [rx,ry]of [[x+11,y+11],[x+w-11,y+11],[x+11,y+h-11],[x+w-11,y+h-11]]){c.beginPath();c.arc(rx,ry,2.3,0,Math.PI*2);c.fillStyle='#1a120c';c.fill();c.strokeStyle=edge;c.lineWidth=1;c.stroke();}c.save();c.globalAlpha*=.24;c.strokeStyle='#d8b88a';c.lineWidth=1;c.beginPath();c.moveTo(x+13,y+4);c.lineTo(x+w-13,y+4);c.stroke();c.strokeStyle='#000';c.lineWidth=3;c.beginPath();c.moveTo(x+10,y+h-2);c.lineTo(x+w-10,y+h-2);c.stroke();c.restore();texture(x+10,y+10,w-20,h-20,'#d5bc96',.09);}
 }
 function texture(x,y,w,h,color='#b89356',opacity=.035){if(!st.decoration)return;c.save();c.globalAlpha*=opacity;c.fillStyle=color;for(let i=0;i<320;i++){const px=x+((i*379+17)%997)/997*w,py=y+((i*197+41)%991)/991*h;c.fillRect(px,py,i%3+1,1);}c.restore();}
 function text(key,value,x,y,w,h,size=24,opts={}){
  if(d.hidden[key])return;const local=d.textStyles[key]||{},f=(local.size||size)*st.fontSize/26,align=local.align||opts.align||st.align,font=local.font||st.font,color=local.color||opts.color||st.ink;
  c.save();c.font=`${opts.weight||400} ${f}px ${fonts[font]||fonts[GAME_UI_FONT]||fonts.sans||'sans-serif'}`;c.textBaseline='alphabetic';c.textAlign=align;const lines=gameUIWrap(c,String(value??''),Math.max(1,w)),step=f*st.lineHeight,count=Math.max(1,1+Math.floor((h-f*1.15)/step));if(lines.length>count)overflow.push(key);
  const matrix=c.getTransform(),s=raster*v.scale,transform=(px,py)=>({x:(matrix.a*px+matrix.c*py+matrix.e-raster*v.x)/s,y:(matrix.b*px+matrix.d*py+matrix.f-raster*v.y)/s}),corners=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(([px,py])=>transform(px,py));
  c.beginPath();c.rect(x,y,w,h);c.clip();c.fillStyle=color;if(opts.shadow!==false){c.shadowColor='#000';c.shadowBlur=2;c.shadowOffsetY=1;}lines.slice(0,count).forEach((line,i)=>c.fillText(line,align==='center'?x+w/2:align==='right'?x+w:x,y+f+i*step));c.restore();const left=Math.min(...corners.map(p=>p.x)),top=Math.min(...corners.map(p=>p.y));hits.push({kind:'text',key,x:left,y:top,w:Math.max(...corners.map(p=>p.x))-left,h:Math.max(...corners.map(p=>p.y))-top});
 }
 function txt(key,x,y,w,h,size,opts){text('texts.'+key,tx[key],x,y,w,h,size,opts);}
 function imageSlot(key,x,y,w,h,{placeholder=false,scene=false}={}){
  const im=d.images[key];if(d.hidden['image.'+key]||im?.visible===false||uiOnly&&scene)return;const bitmap=im?.src&&limbusImages.get(im.src);
  if(bitmap){const iw=bitmap.naturalWidth||bitmap.width,ih=bitmap.naturalHeight||bitmap.height,s=(im.fit==='contain'?Math.min(w/iw,h/ih):Math.max(w/iw,h/ih))*im.zoom/100;c.save();c.beginPath();c.rect(x,y,w,h);c.clip();c.globalAlpha*=im.opacity;c.drawImage(bitmap,x+(w-iw*s)*im.x/100,y+(h-ih*s)*im.y/100,iw*s,ih*s);c.restore();}
  else if(placeholder){const g=c.createLinearGradient(x,y,x+w,y+h);g.addColorStop(0,'#25231f');g.addColorStop(1,'#0d0e0e');c.fillStyle=g;c.fillRect(x,y,w,h);c.save();c.beginPath();c.rect(x,y,w,h);c.clip();c.translate(x+w/2,y+h*.45);const scale=Math.min(1,w/160,h/180);c.scale(scale,scale);c.strokeStyle='#8a765345';c.lineWidth=2;for(let i=0;i<3;i++)polygon([[-24-i*11,0],[0,-35-i*15],[24+i*11,0],[0,35+i*15]],null,c.strokeStyle,2);c.restore();}
  hits.push({kind:'image',key,x,y,w,h});
 }
 function rule(x,y,w,color=st.frame){c.fillStyle=color;c.fillRect(x,y,w,1);}
 function button(label,x,y,w=180,key='button'){frame(x,y,w,48,{fill:'#080808',edge:'#b6a78d'});text('texts.'+key,label,x+12,y+10,w-24,31,22,{align:'center',weight:700});}
 function header(title=tx.title){frame(30,22,1220,70,{fill:'#34271a'});texture(30,22,1220,70);text('texts.title',title,65,37,1150,46,32,{weight:700});}
 function ornament(cx,cy,r=60){if(!st.decoration)return;c.save();c.translate(cx,cy);for(const k of [1,.85,.63]){c.beginPath();c.arc(0,0,r*k,0,2*Math.PI);c.strokeStyle=st.frame;c.lineWidth=k===1?6:1;c.stroke();}for(let i=0;i<12;i++){const a=i*Math.PI/6;c.fillStyle=st.accent;c.fillRect(Math.cos(a)*r-2,Math.sin(a)*r-2,4,4);}c.restore();}
 function gear(cx,cy,r){if(!st.decoration)return;c.save();c.globalAlpha*=.45;c.translate(cx,cy);const points=Array.from({length:80},(_,i)=>{const a=i/80*Math.PI*2,rr=r*(i%4===1||i%4===2?1:.85);return[Math.cos(a)*rr,Math.sin(a)*rr];});polygon(points,'#68533a','#17130e',2);for(const n of [.66,.3]){c.beginPath();c.arc(0,0,r*n,0,2*Math.PI);c.strokeStyle='#1c1710';c.lineWidth=r*.08;c.stroke();}c.restore();}
 function card(row,x,y,w,h,prefix,slot=row.id){const fieldKey=k=>prefix==='identity'?(k==='name'?'texts.name':'options.'+k):prefix+'.'+k;
  const edge=row.rarity===3?'#eac343':row.rarity===2?'#c5a975':'#8a7963';frame(x,y,w,h,{fill:'#090908',edge,glow:row.rarity===3});c.save();c.beginPath();c.rect(x+9,y+9,w-18,h-18);c.clip();imageSlot(slot,x+9,y+9,w-18,h-18,{placeholder:true});const g=c.createLinearGradient(0,y+h*.5,0,y+h);g.addColorStop(0,'#00000000');g.addColorStop(.68,'#000000bb');g.addColorStop(1,'#000');c.fillStyle=g;c.fillRect(x+8,y+h*.5,w-16,h*.5);c.restore();
  if(st.decoration&&row.rarity===3){c.strokeStyle='#f3d24b';c.lineWidth=1;for(const dx of [5,w-5])for(let j=22;j<h-20;j+=18){c.beginPath();c.ellipse(x+dx,y+j,3.8,11,0,0,2*Math.PI);c.stroke();}}
  text(fieldKey('rarity'),'0'.repeat(row.rarity),x+16,y+12,w-32,34,Math.min(26,w*.13),{color:edge,weight:700});text(fieldKey('level'),'Lv. '+row.level,x+12,y+h-91,w-24,26,Math.min(19,w*.11),{align:'right'});text(fieldKey('name'),row.name,x+14,y+h-63,w-28,55,Math.min(25,w*.13),{align:'center',color:edge,weight:700});
  if(row.duplicate)text(fieldKey('duplicate'),'중복',x+w-60,y+12,48,24,15,{color:edge,align:'right'});
 }
 // The transparent export removes the scene/backdrop, while retaining UI panels.
 if(!transparent&&!uiOnly&&(d.template!=='story'||o.scene)){c.fillStyle='#0f0e0c';c.fillRect(0,0,v.w,v.h);texture(0,0,v.w,v.h);}
 if(!uiOnly&&!transparent&&(d.template!=='story'||o.scene))imageSlot('background',0,0,v.w,v.h,{scene:true});
 if(d.template==='story'){
  if(o.scene&&!uiOnly){c.fillStyle=`rgba(0,0,0,${lcClamp(o.dim,0,100)/100})`;c.fillRect(0,0,1280,720);for(const [slot,x]of [['characterLeft',20],['characterCenter',420],['characterRight',820]])imageSlot(slot,x,40,440,680,{scene:true});}
  const y=lcClamp(o.dialogueY,40,85)/100*720,w=1280*lcClamp(o.dialogueWidth,40,100)/100,x=(1280-w)/2;
  const g=c.createLinearGradient(0,y-50,0,720);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(.42,`rgba(12,10,8,${st.panelOpacity*.8})`);g.addColorStop(1,`rgba(0,0,0,${st.panelOpacity})`);c.fillStyle=g;c.fillRect(x,y-50,w,770-y);
  if(st.decoration){c.save();c.globalAlpha*=.045;c.fillStyle=st.accent;for(let i=y;i<720;i+=4)c.fillRect(x,i,w,1);c.restore();}
  if(o.showLocation){c.save();c.translate(4,40);c.rotate(-.06);frame(-20,0,Math.min(520,tx.location.length*24+100),55,{fill:'#27231d'});txt('location',22,10,430,39,24,{weight:700});c.restore();}
  if(o.showName&&d.variant!=='narration'){
   const ns=lcClamp(o.nameScale,60,150)/100;c.save();c.translate(x+30,y-3);c.rotate(-.065);c.scale(ns,ns);frame(0,-10,178,39,{fill:'#35291d'});txt('role',13,-3,150,29,17,{align:'center',color:'#bd9e73'});frame(13,27,185,60,{fill:d.variant==='special'?'#27201b':st.red,edge:st.frame});txt('name',28,37,150,42,29,{align:'center',weight:700});c.restore();
  }
  if(o.showBody)txt('body',x+(d.variant==='narration'?65:245),y+61,w-(d.variant==='narration'?130:290),Math.max(65,720-y-78),26,{align:d.variant==='narration'?st.align:'left'});
  if(o.showNext)polygon([[1209,686],[1231,686],[1220,696]],st.accent);
 }else if(d.template==='event'){
  frame(34,47,566,563,{fill:'#181612'});imageSlot('event',47,60,540,537,{placeholder:true});const shade=c.createLinearGradient(0,302,0,600);shade.addColorStop(0,'#00000000');shade.addColorStop(1,'#000000ec');c.fillStyle=shade;c.fillRect(47,302,540,295);txt('body',64,411,506,171,23);polygon([[632,51],[920,51],[897,91],[632,91]],'#532b17');text('event.heading','선택지',651,53,236,38,27,{weight:700});txt('title',34,2,1210,42,24);
  const choices=d.choices.slice(0,o.choiceCount).map((row,i)=>({row,i})).filter(({row})=>!d.hidden['choice.'+row.id]),count=choices.length,step=Math.min(112,440/Math.max(1,count)),start=148+(440-step*count)/2;for(let j=0;j<count;j++){const {row,i}=choices[j],y=start+j*step,selected=o.selectedChoice===i,edge=selected?st.accent:st.frame;c.save();if(!row.enabled)c.globalAlpha*=.4;frame(635,y,605,step-15,{edge,fill:selected?'#3b2a15':'#17130f',glow:selected});text('choices.'+row.id+'.text',row.text,675,y+13,525,step-36,24,{color:selected?'#f4d491':st.ink});polygon([[650,y+22],[660,y+29],[650,y+36]],edge);c.restore();}txt('footer',640,612,580,60,20,{color:st.accent});
 }else if(d.template==='identity'){
  if(d.variant==='card'){card({id:'portrait',name:tx.name,rarity:o.rarity,level:o.level,duplicate:false},425,32,430,656,'identity','portrait');}
  else{header();card({name:tx.name,rarity:o.rarity,level:o.level},45,111,340,562,'identity','portrait');imageSlot('avatar',310,113,69,69);txt('affiliation',415,114,780,40,26,{color:st.accent});txt('name',415,158,780,65,38,{weight:700});
   for(const [i,key,label]of [[0,'hp','체력'],[1,'sp','정신력'],[2,'speed','속도'],[3,'defense','방어']]){frame(415+i*198,235,184,80);text('options.'+key,label+'\n'+o[key],428+i*198,244,158,65,21,{align:'center'});}
   text('options.attackType',o.attackType+'  /  '+o.resistance,425,327,780,36,22,{color:st.accent});
   d.skills.forEach((s,i)=>{const y=372+i*77;frame(415,y,788,68);text('skills.'+s.id+'.name',s.name,431,y+10,210,47,24,{weight:700,color:st.accent});text('skills.'+s.id+'.description',s.description,658,y+10,530,49,18);});txt('passiveName',424,615,225,32,22,{color:st.accent});txt('passive',658,612,530,62,18);}
 }else if(d.template==='results'){
  const stats=lcStats(d),leader=[...stats.rows].sort((a,b)=>b.value-a.value)[0],share=stats.total?Math.round(leader.value/stats.total*100):0;
  imageSlot(leader?.id||'member-0',0,0,590,720,{placeholder:true});const fade=c.createLinearGradient(0,0,640,0);fade.addColorStop(0,'#00000000');fade.addColorStop(.7,'#00000035');fade.addColorStop(1,'#0d0c0b');c.fillStyle=fade;c.fillRect(0,0,640,720);
  text('results.mvp','우수 사원',50,42,410,45,31,{weight:700,color:st.accent});text('results.share','총 피해량 기여율  '+share+'%',50,98,460,55,30,{color:'#ecc52c',weight:700});text('results.leader',leader?.name||'',50,157,460,45,26);txt('result',58,530,500,94,58,{weight:700,color:'#e5bc34'});txt('body',60,631,470,60,20);frame(620,20,635,165,{fill:'#171410'});txt('title',650,38,570,44,25);txt('result',650,92,570,68,42,{align:'center',weight:700,color:'#dfbb38'});
  frame(620,199,635,424);if(d.variant==='statistics'){
   const step=Math.min(58,380/stats.rows.length);stats.rows.forEach((r,i)=>{const y=217+i*step;imageSlot(r.id,638,y,step-5,step-5,{placeholder:true});text('members.'+r.id+'.name',r.name,647+step,y+1,150,step,Math.min(21,step*.55));c.fillStyle='#31281a';c.fillRect(820,y+6,245,Math.max(5,step-15));c.fillStyle=r.color;c.fillRect(820,y+6,245*r.ratio,Math.max(5,step-15));text('members.'+r.id+'.'+o.metric,String(r.value),1080,y+2,153,step,Math.min(21,step*.6),{align:'right'});});
  }else{stats.rows.forEach((r,i)=>{const x=641+(i%6)*100,y=226+Math.floor(i/6)*146;frame(x,y,88,123);imageSlot(r.id,x+5,y+5,78,75,{placeholder:true});text('members.'+r.id+'.name',r.name,x+7,y+83,74,34,14,{align:'center'});});text('results.total','총 '+(o.autoTotal?stats.total:o.total),650,548,560,44,27,{align:'right',color:st.accent});}button(tx.button,1010,648,224);
 }else if(d.template==='gift'){
  header();if(d.variant==='fusion'){
   frame(40,115,550,505,{fill:'#211b12'});for(const [x,y,r]of [[100,178,37],[530,177,36],[104,540,41],[525,537,36]])gear(x,y,r);ornament(315,348,199);ornament(315,348,155);const positions=o.materialCount===1?[[260,158]]:o.materialCount===2?[[85,282],[435,282]]:[[260,140],[85,342],[435,342]];
   positions.forEach(([x,y],i)=>{frame(x,y,116,116,{hazard:true,edge:'#ac8d28'});imageSlot('material-'+i,x+15,y+15,86,86,{placeholder:true});});frame(253,302,124,124,{hazard:true,edge:st.accent});imageSlot('gift',270,319,90,90,{placeholder:true});text('gift.unknown','?',277,323,78,80,52,{align:'center',color:st.accent});txt('fusionResult',84,548,467,46,28,{align:'center',color:st.accent});frame(620,115,620,505);txt('giftName',650,146,560,54,32,{weight:700});text('options.grade','등급 '+o.grade,650,212,560,39,24,{color:st.accent});txt('giftEffect',650,274,560,270,25);button(tx.button,1010,647,224,'button');
  }else{frame(196,140,888,457,{fill:'#17140f'});txt('giftName',250,169,780,64,36,{align:'center',weight:700});frame(253,275,178,178,{hazard:true,edge:st.accent});imageSlot('gift',273,295,138,138,{placeholder:true});text('options.grade',o.grade,260,467,164,55,36,{align:'center',color:st.accent});txt('giftEffect',478,279,545,250,27);button(tx.button,530,637,220);}
 }else if(d.template==='extraction'){
  header();const count=d.variant==='ten'?o.cardCount:1,phase=o.phase;
  if(d.variant!=='ten'&&d.variant==='reveal'){const g=c.createRadialGradient(640,350,30,640,350,480);g.addColorStop(0,'#ebc944'+Math.round(lcClamp(o.effect,0,100)*2.55).toString(16).padStart(2,'0'));g.addColorStop(1,'#bc9b3300');c.fillStyle=g;c.fillRect(0,100,1280,550);ornament(640,360,267);}
  for(let i=0;i<count;i++){const row=d.cards[i],w=count===1?290:198,h=count===1?496:244,x=count===1?495:90+(i%5)*222,y=count===1?115:118+Math.floor(i/5)*262;
   if(phase==='start'){frame(x,y,w,h,{edge:st.accent});ornament(x+w/2,y+h/2,Math.min(w,h)*.3);}else if(phase==='rarity'){card({...row,name:'',level:0},x,y,w,h,'cards.'+row.id);}else card(row,x,y,w,h,'cards.'+row.id);}
  txt('footer',80,656,820,46,23,{color:st.accent});button(tx.button,1012,650,220);
 }else if(d.template==='combat'){
  if(d.variant!=='skill')header();if(d.variant==='hud'){frame(40,446,1200,225);imageSlot('portrait',62,465,157,187,{placeholder:true});txt('name',245,464,370,49,30,{weight:700});const hp=o.linkedHp?(o.maxHp?lcClamp(o.hp/o.maxHp,0,1):0):lcClamp(o.hpPercent,0,100)/100;c.fillStyle='#37251d';c.fillRect(247,530,553,27);c.fillStyle='#a6412e';c.fillRect(247,530,553*hp,27);text('options.hp',o.hp+' / '+o.maxHp,251,574,350,37,25);text('options.sp','정신력 '+o.sp,632,574,350,37,25,{color:'#6fafc3'});txt('skillName',849,472,363,60,25,{color:st.accent});}
  else if(d.variant==='clash'){for(const [side,x]of [['portrait',70],['opponent',827]]){frame(x,132,383,420);imageSlot(side,x+12,144,359,396,{placeholder:true});}txt('name',87,556,350,44,28);txt('opponentName',842,556,350,44,28,{align:'right'});txt('clashResult',455,274,370,90,44,{align:'center',weight:700,color:st.accent});text('options.basePower',String(o.basePower),474,395,140,75,50,{align:'center'});text('options.opponentPower',String(o.opponentPower),666,395,140,75,50,{align:'center'});txt('opponentSkill',828,610,370,55,24,{align:'right'});txt('skillName',72,610,370,55,24);}
  else{
   const sin=limbusSins.find(s=>s[0]===o.sin)||limbusSins[0],color=sin[2],hex=(cx,cy,r)=>Array.from({length:8},(_,i)=>{const a=(i/8-.5)*Math.PI*2;return[cx+Math.cos(a)*r,cy+Math.sin(a)*r];});
   txt('title',75,35,1110,58,34,{weight:700});
   polygon([[70,217],[782,217],[748,270],[48,270]],'#15212bd9',color,3);text('combat.effects','스킬 효과',91,223,315,42,29,{color:'#eadcbf',weight:700});
   text('options.defense',String(o.defense),438,221,100,46,35,{align:'center'});text('combat.defenseLabel','방어',539,235,70,28,17,{color:st.accent});text('options.attackLevel',String(o.attackLevel),648,221,90,46,35,{align:'center'});
   polygon([[60,282],[772,282],[772,603],[60,603]],'#030303bb','#51422c',1);if(o.showDescription)txt('skillDescription',86,308,653,259,28);
   for(let i=0;i<o.coinCount;i++){c.beginPath();c.arc(557+i*49,164,17,0,Math.PI*2);c.fillStyle='#b99558';c.fill();c.strokeStyle='#e8c789';c.lineWidth=3;c.stroke();}text('options.basePower',o.basePower+(o.coinPower<0?' - ':' + ')+Math.abs(o.coinPower),806,119,320,72,43,{color:st.accent});
   const hx=1010,hy=287;polygon(hex(hx,hy,121),'#0a1016',color,6);polygon(hex(hx,hy,108),null,'#bdc2b4',2);c.save();c.beginPath();hex(hx,hy,101).forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.clip();imageSlot('skill',hx-103,hy-103,206,206,{placeholder:true});c.restore();
   text('options.powerRange',o.powerRange,1140,209,116,158,40,{align:'center',color:st.accent});
   c.save();c.translate(784,446);c.rotate(-.16);polygon([[0,0],[428,0],[447,51],[-12,51]],color,'#9fa08b',2);txt('skillName',9,3,403,44,30,{weight:700});c.restore();
   text('options.attackType',o.attackType+' · '+sin[1],813,498,374,39,25,{color:st.accent});imageSlot('portrait',1050,545,105,85);txt('name',805,549,231,40,24);text('options.hp','HP '+o.hp+'/'+o.maxHp,805,588,234,36,21);imageSlot('sin',1167,532,55,55);
  }
  const statusY=d.variant==='hud'?611:640;d.statuses.forEach((r,i)=>{const x=57+i%10*118,sy=statusY+Math.floor(i/10)*38;if(typeof badStatusIcon==='function'&&!d.images[r.id]?.src)badStatusIcon(c,{mode:'builtin',key:'pixel_'+r.icon},x,sy,32,st.ink,st.frame);else imageSlot(r.id,x,sy,32,32,{placeholder:true});text('statuses.'+r.id+'.name',r.name+' '+r.value+'/'+r.count,x+38,sy+4,78,38,15);});
 }else if(d.template==='journal'){
  // Observation logs are tall document panels, unlike the landscape story UI.
  frame(20,15,920,1210,{fill:st.paper,edge:st.frame});texture(28,23,904,1194,'#1f160d',.12);c.save();c.globalAlpha*=.35;c.strokeStyle='#7f6d4b';c.lineWidth=1;for(let y=390;y<1130;y+=38){c.beginPath();c.moveTo(79,y);c.lineTo(880,y);c.stroke();}c.restore();
  const dark={color:'#33291c',shadow:false};txt('title',70,51,820,69,42,{...dark,weight:700});rule(65,128,830,'#59442a');txt('documentNo',73,148,420,42,26,dark);txt('author',510,148,370,42,24,{...dark,align:'right'});imageSlot('subject',73,211,220,155,{placeholder:true});txt('stage',325,215,550,46,29,{...dark,weight:700});txt('date',325,276,550,41,23,dark);
  const p=d.pages[o.page]||d.pages[0];text('pages.'+p.id+'.heading',p.heading,75,399,810,54,30,{...dark,weight:700});text('pages.'+p.id+'.body',p.body,75,472,810,515,26,dark);text('pages.'+p.id+'.annotation',p.annotation,75,1008,810,84,20,{...dark,color:'#742d29'});txt('note',76,1136,760,38,18,{...dark,color:'#742d29'});text('journal.page',String(o.page+1).padStart(2,'0')+' / '+d.pages.length,730,1185,155,30,18,{...dark,align:'right'});
 }
 c.restore();out.limbusHits=hits;out.limbusOverflow=overflow;limbusRenderInfo.set(l.id,{hits,overflow});return out;
}
function limbusHit(l,p){const local=socialLocalPoint(l,p),v=lcViewport(l);if(!local)return null;const x=(local.x-v.x)/v.scale,y=(local.y-v.y)/v.scale;limbusBitmap(l);return (limbusRenderInfo.get(l.id)?.hits||[]).slice().reverse().find(r=>x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h)||null;}
