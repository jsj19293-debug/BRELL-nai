'use strict';
// Reference layout: white dialogue, teal name pill, orange prompt and mint controls.
// Native gameui layer; all artwork is drawn as vectors, outside the UI stays transparent.
gameUIPresets.push({name:'포켓몬 마스터즈 EX · 대화창',file:'pokemon-masters',w:720,h:1560,text:'좋아! 준비가 됐다면\n함께 출발해 볼까?',size:28});
gameUISVG.push('data:image/svg+xml;base64,'+btoa('<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1560"/>'));
let pokemonUploadTarget=null,pokemonAdding=false,pokemonExporting=false;
function pokemonLayer(dialogueOnly=false){return{id:crypto.randomUUID(),kind:'gameui',gamePreset:6,name:'포켓몬 마스터즈 EX · '+(dialogueOnly?'대화창만':'대화 화면'),locked:true,src:gameUISVG[6],x:0,y:0,w:state.width,h:state.height,visible:true,strokes:[],gameName:'트레이너',gameText:gameUIPresets[6].text,gameAffiliation:'',font:GAME_UI_FONT,gameFontSize:28,gameTextScale:1,media:'',mediaZoom:100,mediaX:50,mediaY:50,pokeShowName:true,pokeShowNext:true,pokeShowButtons:!dialogueOnly,pokeShowGear:!dialogueOnly,pokeVoiceOn:false,pokeAutoOn:false,pokeNameColor:'#399bb2',pokeDialogueOffset:0};}
function validatePokemon(l){
 if(![6,7,8,9].includes(l.gamePreset))return;if(l.gamePreset===7)validatePokemonGold(l);if(l.gamePreset===8)validatePokemonSun(l);if(l.gamePreset===9)validatePokemonBattle(l);
 if(!['pokeShowName','pokeShowNext','pokeShowButtons','pokeShowGear','pokeVoiceOn','pokeAutoOn'].every(k=>typeof l[k]==='boolean')||!/^#[0-9a-f]{6}$/i.test(l.pokeNameColor)||!Number.isFinite(l.pokeDialogueOffset)||l.pokeDialogueOffset< -40||l.pokeDialogueOffset>20||typeof l.media!=='string'||l.media.length>24000000||l.media&&!/^data:image\/(png|jpeg|webp);base64,/.test(l.media)||!Number.isFinite(l.mediaZoom)||l.mediaZoom<100||l.mediaZoom>300||!['mediaX','mediaY'].every(k=>Number.isFinite(l[k])&&l[k]>=0&&l[k]<=100))throw Error('포켓몬 대화창 설정이 올바르지 않습니다.');
}
function pokemonDialogueLayout(l,c){
 const u=Math.min(l.w/720,l.h/900),font=l.gameFontSize*u*(l.gameTextScale??1),w=l.w*.936,x=(l.w-w)/2;
 c.font=`400 ${font}px ${fonts[GAME_UI_FONT]||fonts.sans}`;const allLines=gameUIWrap(c,l.gameText,w-34*u),lines=allLines.slice(0,8),h=Math.min(l.h*.48,Math.max(176*u,lines.length*font*1.38+48*u));
 const preferred=l.h-(l.h>l.w?488:308)*u+l.h*l.pokeDialogueOffset/100,maxY=l.h-h-(l.pokeShowButtons?118:24)*u,y=Math.max(34*u,Math.min(maxY,preferred)),maxLines=Math.max(1,Math.floor((h-45*u)/(font*1.38)));
 return{x,y,w,h,u,font,lines:lines.slice(0,maxLines),overflow:allLines.length>Math.min(8,maxLines)};
}
async function loadPokemonAssets(l){if(l.gamePreset===7&&typeof loadGoldBattleAssets==='function')await loadGoldBattleAssets(l);await ensureComicFont([7,9].includes(l.gamePreset)?POKEMON_GOLD_FONT:GAME_UI_FONT);if(l.media&&(!postMediaImages.has(l.id)||postMediaImages.get(l.id).src!==l.media))postMediaImages.set(l.id,await imageFrom(l.media));}
function pokemonBitmap(l,photo=postMediaImages.get(l.id)){
 if(l.gamePreset===7)return pokemonGoldBitmap(l,photo);if(l.gamePreset===8)return pokemonSunBitmap(l,photo);if(l.gamePreset===9)return pokemonBattleBitmap(l,photo);
 const out=document.createElement('canvas'),scale=Math.min(1,2000/l.w,3000/l.h);out.width=Math.max(1,Math.round(l.w*scale));out.height=Math.max(1,Math.round(l.h*scale));const c=out.getContext('2d');c.scale(scale,scale);
 if(l.media&&photo){const iw=photo.naturalWidth||photo.width,ih=photo.naturalHeight||photo.height,s=Math.max(l.w/iw,l.h/ih)*l.mediaZoom/100,w=iw*s,h=ih*s;c.drawImage(photo,(l.w-w)*l.mediaX/100,(l.h-h)*l.mediaY/100,w,h);}
 const m=pokemonDialogueLayout(l,c),{x,y,w,h,u,font}=m,family=fonts[GAME_UI_FONT]||fonts.sans;
 const round=(x,y,w,h,r,fill,stroke,width=1)=>{c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}};
 c.save();c.shadowColor='#324f5866';c.shadowBlur=1*u;c.shadowOffsetY=5*u;round(x,y,w,h,22*u,'#fafafa','#dce7e3',1.5*u);c.restore();
 if(l.pokeShowName&&l.gameName.trim()){
  c.font=`700 ${29*u}px ${family}`;const nameW=Math.min(w*.8,Math.max(98*u,c.measureText(l.gameName.replace(/\n/g,' ')).width+34*u)),nameX=x+52*u,nameY=y-25*u;
  round(nameX,nameY,nameW,45*u,23*u,l.pokeNameColor,'#f8fffd',4*u);c.save();c.beginPath();c.roundRect(nameX+4*u,nameY+3*u,nameW-8*u,39*u,20*u);c.clip();c.fillStyle='#fff';c.textAlign='center';c.textBaseline='middle';c.fillText(l.gameName.replace(/\n/g,' '),nameX+nameW/2,nameY+23*u,Math.max(1,nameW-22*u));c.restore();
 }
 c.save();c.beginPath();c.rect(x+16*u,y+28*u,w-32*u,h-43*u);c.clip();c.font=`400 ${font}px ${family}`;c.fillStyle='#17343d';c.textAlign='left';c.textBaseline='top';m.lines.forEach((line,i)=>c.fillText(line,x+16*u,y+31*u+i*font*1.38));c.restore();
 if(l.pokeShowNext){const px=x+w-25*u,py=y+h-16*u;c.beginPath();[[-9,-6],[9,-6],[9,1],[0,7],[-9,1]].forEach(([dx,dy],i)=>i?c.lineTo(px+dx*u,py+dy*u):c.moveTo(px+dx*u,py+dy*u));c.closePath();c.fillStyle='#e76735';c.fill();c.strokeStyle='#eca58b';c.lineWidth=1.3*u;c.stroke();}
 const bottom=l.h-80*u;
 if(l.pokeShowButtons){
  const bw=92*u,bh=46*u,gap=22*u,start=l.w-38*u-bw*3-gap*2;
  for(let i=0;i<3;i++){const bx=start+i*(bw+gap),on=i===0?l.pokeVoiceOn:i===1?l.pokeAutoOn:false,g=c.createLinearGradient(0,bottom,0,bottom+bh);g.addColorStop(0,on?'#dcfbf0':'#fcfffc');g.addColorStop(1,on?'#abd6c9':'#dcece1');c.save();c.shadowColor='#31545b70';c.shadowOffsetY=4*u;round(bx,bottom,bw,bh,9*u,g,'#a9c6bc',2*u);c.restore();round(bx+3*u,bottom+3*u,bw-6*u,bh-6*u,6*u,null,'#f9fffa',1.5*u);c.fillStyle=on?'#3e8a7d':'#799f98';
   if(i<2){c.font=`700 ${22*u}px ${family}`;c.textAlign='center';c.textBaseline='middle';c.fillText(i===0?(l.pokeVoiceOn?'ON':'OFF'):'AUTO',bx+bw/2,bottom+bh/2+1*u,bw-12*u);}else{c.beginPath();c.moveTo(bx+35*u,bottom+11*u);c.lineTo(bx+49*u,bottom+23*u);c.lineTo(bx+35*u,bottom+35*u);c.closePath();c.fill();round(bx+52*u,bottom+11*u,5*u,24*u,1*u,c.fillStyle);}
  }
 }
 if(l.pokeShowGear){const gx=64*u,gy=l.h-57*u;c.beginPath();for(let i=0;i<40;i++){const a=i/40*Math.PI*2,r=(i%4===1||i%4===2?30:24)*u,px=gx+Math.sin(a)*r,py=gy+Math.cos(a)*r;i?c.lineTo(px,py):c.moveTo(px,py);}c.closePath();c.fillStyle='#80bed3';c.fill();c.strokeStyle='#e4f6f3';c.lineWidth=2.5*u;c.stroke();for(const [r,fill,stroke]of [[18,'#eef7ef','#4b9bb6'],[9,'#93c4c9','#5b9eae']]){c.beginPath();c.arc(gx,gy,r*u,0,Math.PI*2);c.fillStyle=fill;c.fill();c.strokeStyle=stroke;c.lineWidth=2*u;c.stroke();}}
 return out;
}
async function addPokemon(dialogueOnly=false,gold=false,preset=gold?7:6,variant='named'){
 const newPage=$(preset===8?'pokemonSunNewPage':preset===9?'pokemonBattleNewPage':gold?'pokemonGoldNewPage':'pokemonNewPage').checked;if(projectBusy||pokemonAdding||(!newPage&&(state.imageLayers||[]).length>=40))return false;
 const doc=state,current=currentImageLayer(),source=!dialogueOnly&&current&&!current.kind?current.src:'';pokemonAdding=true;
 try{await ensureComicFont([7,9].includes(preset)?POKEMON_GOLD_FONT:GAME_UI_FONT);let photo;
  if(source){photo=await imageFrom(source);if(source.length>24000000||(photo.naturalWidth||photo.width)*(photo.naturalHeight||photo.height)>16000000)throw Error('배경 이미지는 1,600만 픽셀 이하로 줄여주세요.');}
  if(projectBusy||state!==doc)return false;
  if(newPage){if(!projectBook||projectBook.pages.length>=100)throw Error('프로젝트는 최대 100장까지 추가할 수 있어요.');cancelRetouch();flushPage();const next=freshDocument();next.width=preset===9&&variant==='sunmoon'?1600:gameUIPresets[preset].w;next.height=preset===9&&variant==='sunmoon'?960:gameUIPresets[preset].h;const page=makePage(preset===7&&['trainer','wild'].includes(variant)?'포켓몬 골드 · '+(variant==='wild'?'야생 조우':'트레이너 조우'):gameUIPresets[preset].name,next);projectBook.pages.push(page);markProjectDirty();await switchPage(page.id);if(projectBook.activeId!==page.id||projectBusy)return false;}
  if((state.imageLayers||[]).length>=40)return false;const l=preset===8?pokemonSunLayer(variant):preset===9?pokemonBattleLayer(variant==='double',variant==='sunmoon'?'sunmoon':'retro'):gold?(variant==='trainer'||variant==='wild'?pokemonGoldBattleLayer(variant):pokemonGoldLayer()):pokemonLayer(dialogueOnly);if(source)l.media=source;
  checkpoint();(state.imageLayers??=[]).push(l);if(photo)postMediaImages.set(l.id,photo);closeGameTemplatePicker();selectImageLayer(l);if(typeof openMobilePanel==='function'&&mobileMedia.matches){closeMobilePanel();openMobilePanel('text');}status(preset===8?'썬·문 대화창 추가 · 이름·대사·선택지와 배경을 편집하세요.':preset===9?'배틀창 추가 · HP·이름·레벨·대사와 행동 메뉴를 편집하세요.':gold&&['trainer','wild'].includes(variant)?'골드 조우 화면 추가 · 파티 표시·대사와 그림을 편집하세요.':gold?'포켓몬 골드 대화창 추가 · 두 줄 대사·크기·위치와 배경을 편집하세요.':'포켓몬 마스터즈 EX 대화창 추가 · 이름·대사·배경과 버튼 표시를 편집하세요.');return true;
 }catch(e){status(e.message||'대화창을 추가하지 못했습니다.');return false;}finally{pokemonAdding=false;}
}
function syncPokemonControls(){
 const panel=$('pokemonInspector'),l=currentImageLayer();if(!panel)return;panel.hidden=![6,7,8,9].includes(l?.gamePreset);if(panel.hidden)return;if([8,9].includes(l.gamePreset)){syncPokemonModernControls(l);return;}const gold=l.gamePreset===7;$('pokemonHeading').textContent=gold?'포켓몬 골드 · 도트 대화창':'포켓몬 마스터즈 EX · 대화창';const host=$('pokemonFields');host.replaceChildren();if(gold&&isPokemonGoldBattle(l)){syncPokemonGoldBattleControls(l);return;}
 const field=(key,title,type,min,max)=>{const label=document.createElement('label');label.textContent=title;const input=document.createElement(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;if(min!==undefined){input.min=min;input.max=max;}else input.maxLength=key==='gameName'?100:2000;if(type==='textarea')input.rows=4;input.value=l[key];input.onfocus=()=>{inputHistoryKey=null;};input.oninput=()=>{if(projectBusy||currentImageLayer()!==l)return;const value=type==='range'?Math.max(min,Math.min(max,Number(input.value)||0)):input.value;if(value===l[key])return;recordInput('pokemon-'+key);l[key]=value;render();updateHint();};label.append(input);host.append(label);};
 if(gold)appendGoldBorderControl(host,l);if(!gold)field('gameName','이름','text');field('gameText','대사','textarea');field('gameFontSize',gold?'도트 글자 크기':'글자 크기','range',gold?16:14,gold?28:42);if(gold){field('pokeGoldWidth','대화창 너비 (%)','range',30,100);field('pokeGoldX','대화창 가로 위치','range',0,100);field('pokeGoldY','대화창 세로 위치','range',0,100);}else{field('pokeNameColor','이름표 색','color');field('pokeDialogueOffset','대화창 위아래 위치','range',-40,20);}
 for(const [key,title]of (gold?[["pokeShowNext","▼ 다음 표시"]]:[['pokeShowName','이름표 표시'],['pokeShowNext','주황색 다음 표시'],['pokeShowButtons','하단 OFF · AUTO · 넘기기 표시'],['pokeShowGear','설정 아이콘 표시'],['pokeVoiceOn','음성 버튼 ON 표시'],['pokeAutoOn','AUTO 켜짐 표시']])){const label=document.createElement('label'),input=document.createElement('input');label.className='check';input.type='checkbox';input.checked=l[key];input.onchange=()=>{if(projectBusy||currentImageLayer()!==l)return;checkpoint();l[key]=input.checked;sync();};label.append(input,document.createTextNode(title));host.append(label);}
 const row=document.createElement('div');row.className='row';for(const [text,action]of [['배경 넣기 · 교체','upload'],['배경 제거 · UI만','remove']]){const b=document.createElement('button');b.type='button';b.textContent=text;b.disabled=action==='remove'&&!l.media;b.onclick=()=>{if(projectBusy||currentImageLayer()!==l)return;if(action==='upload'){pokemonUploadTarget={doc:state,layer:l};$('pokemonImageFile').click();}else{checkpoint();l.media='';postMediaImages.delete(l.id);sync();}};row.append(b);}host.append(row);
 if(l.media){field('mediaZoom','배경 확대 (%)','range',100,300);field('mediaX','배경 가로 위치','range',0,100);field('mediaY','배경 세로 위치','range',0,100);}
 const hint=document.createElement('p');hint.className='hint';const c=document.createElement('canvas').getContext('2d');const updateHint=()=>{hint.textContent=(gold?pokemonGoldCard(l):pokemonDialogueLayout({...l,w:state.width,h:state.height},c)).overflow?(gold?'골드 대화창은 두 줄까지 보여요. 문구·글자 크기·줄바꿈을 조정해주세요.':'대사가 창보다 길어요. 글자 크기나 줄바꿈을 조정해주세요.'):'UI만 따로 필요하면 아래의 투명 PNG 저장 버튼을 사용하세요.';};updateHint();host.append(hint);
}
async function uploadPokemonImage(file,target){
 if(!file||!target||projectBusy||target.doc!==state||currentImageLayer()!==target.layer)return false;
 try{if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>30*1024*1024)throw Error('30MB 이하 PNG·JPG·WEBP를 선택해주세요.');const src=await read(file),photo=await imageFrom(src);if((photo.naturalWidth||photo.width)*(photo.naturalHeight||photo.height)>16000000)throw Error('이미지는 1,600만 픽셀 이하로 줄여주세요.');if(projectBusy||target.doc!==state||currentImageLayer()!==target.layer)return false;checkpoint();target.layer.media=src;postMediaImages.set(target.layer.id,photo);sync();return true;}catch(e){status(e.message||'배경을 불러오지 못했습니다.');return false;}
}
async function exportPokemonUI(){
 const target=currentImageLayer(),doc=state;if(projectBusy||pokemonExporting||![6,7,8,9].includes(target?.gamePreset))return false;
 const layer={...structuredClone(target),...imageLayerRect(target),media:'',...(target.gamePreset===7?{pokeGoldPlayerImage:'',pokeGoldOpponentImage:'',pokeGoldBattleWhite:false}:{})};pokemonExporting=true;$('pokemonExport').disabled=true;
 try{await ensureComicFont([7,9].includes(target.gamePreset)?POKEMON_GOLD_FONT:GAME_UI_FONT);if(projectBusy||state!==doc||currentImageLayer()!==target)return false;
  const png=await encodeArtwork(pokemonBitmap(layer,null),'png',1);if(state!==doc)return false;download(png,target.gamePreset===7?'pokemon-gold-ui.png':target.gamePreset===8?'pokemon-sunmoon-ui.png':target.gamePreset===9?'pokemon-battle-ui.png':'pokemon-masters-ui.png');status('대화창 UI만 투명 PNG로 저장했습니다.');return true;
 }catch(e){status(e.message||'투명 PNG를 저장하지 못했습니다.');return false;}finally{pokemonExporting=false;$('pokemonExport').disabled=false;}
}
function initPokemon(){
 if(typeof initPokemonGold==='function')initPokemonGold();if(typeof initPokemonSunMoon==='function')initPokemonSunMoon();
 $('pokemonExport').onclick=exportPokemonUI;
 for(const [only,title]of [[false,'대화 화면 · 하단 버튼 포함'],[true,'대화창만 · 투명 배경']]){const b=document.createElement('button');b.type='button';b.className='post-add';const img=document.createElement('img'),l={...pokemonLayer(only),w:360,h:780};img.src=pokemonBitmap(l).toDataURL('image/png');img.alt='포켓몬 마스터즈 EX '+title;img.style.cssText='width:100%;height:260px;object-fit:contain;background:linear-gradient(#8bbcb7,#c9dbb6)';const update=()=>{if(img.isConnected)img.src=pokemonBitmap(l).toDataURL('image/png');};ensureComicFont(GAME_UI_FONT).then(update).catch(()=>{});const text=document.createElement('strong');text.textContent=title;b.append(img,text);b.onclick=()=>addPokemon(only);$('pokemonChoices').append(b);}
 $('pokemonImageFile').onchange=e=>{const file=e.target.files[0],target=pokemonUploadTarget;e.target.value='';pokemonUploadTarget=null;uploadPokemonImage(file,target);};$('pokemonDuplicate').onclick=()=>$('duplicateImageLayer').click();$('pokemonDelete').onclick=()=>$('deleteImageLayer').click();
}
