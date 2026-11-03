'use strict';
// Editable artwork windows. All instances use the existing movable image-layer path.
const DESKTOP_WINDOW_PRESET=11;
const desktopWindowTemplates=[
 {key:'error11',name:'Windows 11 · 오류',theme:'modern',w:760,h:330,icon:'error',title:'시스템 오류',lead:'작업을 완료할 수 없습니다.',text:'예기치 않은 오류가 발생했습니다.\n잠시 후 다시 시도해 주세요.',footer:'',buttons:['확인'],accent:'#0078d4',surface:'#ffffff',ink:'#202020'},
 {key:'warning11',name:'Windows 11 · 경고',theme:'modern',w:760,h:350,icon:'warning',title:'경고',lead:'변경한 내용을 저장하시겠습니까?',text:'저장하지 않은 내용이 있습니다.\n계속하기 전에 작업 내용을 확인해 주세요.',footer:'',buttons:['저장','저장 안 함','취소'],accent:'#0078d4',surface:'#ffffff',ink:'#202020'},
 {key:'sticky11',name:'고정 키 · 확인창',theme:'modern',w:920,h:370,icon:'none',title:'고정 키',lead:'고정 키를 켜시겠습니까?',text:'고정 키 기능을 사용하면 두 개의 키를 동시에 누르기 힘든 경우\n<Shift>, <Ctrl>, <Alt> 키 또는 Windows 로고 키를 눌러 있는\n상태로 고정할 수 있습니다.\n<Shift> 키를 다섯 번 누르면 고정 키 기능이 켜집니다.',footer:'접근성 키보드 설정에서 이 바로 가기 키 사용 안 함',buttons:['예(Y)','아니요(N)'],accent:'#0078d4',surface:'#ffffff',ink:'#202020'},
 {key:'update10',name:'Windows 업데이트 · 다시 시작',theme:'update',w:1120,h:350,icon:'none',title:'다시 시작할 시간이 거의 다 되었습니다.',lead:'',text:'업데이트를 설치할 준비가 되었습니다.\n장치를 지금 다시 시작하거나 나중에 다시 시작할 수 있습니다.\n다시 시작하기 전에 작업 중인 내용을 저장해 주세요.',footer:'',buttons:['1시간 대기','확인','다시 시작'],accent:'#006fa8',surface:'#006fa8',ink:'#ffffff'},
 {key:'errorClassic',name:'Windows 클래식 · 오류',theme:'classic',w:700,h:320,icon:'error',title:'Windows',lead:'프로그램에 오류가 발생했습니다.',text:'잘못된 작업을 수행하여 프로그램을 종료합니다.\n문제가 계속되면 관리자에게 문의하십시오.',footer:'',buttons:['닫기','자세히'],accent:'#000080',surface:'#c0c0c0',ink:'#000000'},
 {key:'warningXP',name:'Windows XP · 경고',theme:'xp',w:740,h:340,icon:'warning',title:'Windows 경고',lead:'이 작업을 계속하시겠습니까?',text:'이 작업을 수행하면 현재 설정이 변경됩니다.\n진행하려면 확인을 선택하십시오.',footer:'',buttons:['확인','취소'],accent:'#1769e0',surface:'#ece9d8',ink:'#111111'},
 {key:'bsod',name:'블루스크린 · 오류 정보',theme:'bsod',w:1120,h:700,icon:'none',title:':(',lead:'',text:'장치에 문제가 발생하여 다시 시작해야 합니다.\n일부 오류 정보를 수집하고 있습니다.\n그런 다음 자동으로 다시 시작합니다.',footer:'지원 담당자에게 아래 중지 코드를 알려 주세요.',buttons:[],accent:'#0078d7',surface:'#0078d7',ink:'#ffffff',code:'CRITICAL_PROCESS_DIED',progress:20},
 {key:'bsodClassic',name:'블루스크린 · 클래식',theme:'bsodClassic',w:1000,h:680,icon:'none',title:'Windows',lead:'치명적인 오류가 발생했습니다.',text:'오류가 발생하여 현재 작업을 계속할 수 없습니다.\n\n* 아무 키나 누르면 이전 화면으로 돌아갑니다.\n* 시스템을 다시 시작하기 전에 작업 내용을 확인하십시오.',footer:'계속하려면 아무 키나 누르십시오 _',buttons:[],accent:'#000080',surface:'#000080',ink:'#ffffff',code:'STOP: 0x0000007B',progress:0}
];
gameUIPresets.push({name:'윈도우 창',file:'desktop-window',w:760,h:350,text:'',size:24});
gameUISVG.push('data:image/svg+xml;base64,'+btoa('<svg xmlns="http://www.w3.org/2000/svg" width="760" height="350"/>'));
const desktopWindowCache=new Map();
let desktopWindowCacheBytes=0,desktopWindowAdding=false,desktopWindowControlTarget=null;
const dwMeta=key=>desktopWindowTemplates.find(t=>t.key===key)||desktopWindowTemplates[0];
const dwClamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0));
function isDesktopWindow(l){return l?.kind==='gameui'&&l.gamePreset===DESKTOP_WINDOW_PRESET;}
function desktopWindowLayer(key){
 const p=dwMeta(key),scale=Math.max(.001,Math.min(1,state.width*.88/p.w,state.height*.88/p.h)),w=p.w*scale,h=p.h*scale;
 return{id:crypto.randomUUID(),kind:'gameui',gamePreset:DESKTOP_WINDOW_PRESET,name:p.name,src:gameUISVG[DESKTOP_WINDOW_PRESET],locked:false,x:(state.width-w)/2,y:(state.height-h)/2,w,h,rotation:0,visible:true,strokes:[],font:p.theme==='bsodClassic'?'pixel_galmuri9':GAME_UI_FONT,gameFontSize:24,gameTextScale:1,gameName:p.title,gameText:p.text,gameAffiliation:p.footer,windowUI:{version:1,preset:p.key,lead:p.lead,icon:p.icon,buttons:[...p.buttons],accent:p.accent,surface:p.surface,ink:p.ink,opacity:1,code:p.code||'',progress:p.progress||0}};
}
function validateDesktopWindow(l){
 const d=l.windowUI,hex=v=>typeof v==='string'&&/^#[\da-f]{6}$/i.test(v);
 if(!isDesktopWindow(l)||l.locked!==false||!d||d.version!==1||!desktopWindowTemplates.some(p=>p.key===d.preset)||typeof d.lead!=='string'||d.lead.length>200||!['none','error','warning','info','question'].includes(d.icon)||!Array.isArray(d.buttons)||d.buttons.length>3||d.buttons.some(t=>typeof t!=='string'||t.length>32)||!['accent','surface','ink'].every(k=>hex(d[k]))||!Number.isFinite(d.opacity)||d.opacity<0||d.opacity>1||typeof d.code!=='string'||d.code.length>160||!Number.isFinite(d.progress)||d.progress<0||d.progress>100)throw Error('윈도우 창 설정이 올바르지 않습니다.');
 if(l.gameName.length>200)throw Error('창 제목은 200자까지 입력할 수 있습니다.');
}
function clearDesktopWindowCache(){for(const e of desktopWindowCache.values())e.canvas.width=e.canvas.height=1;desktopWindowCache.clear();desktopWindowCacheBytes=0;}
async function loadDesktopWindowAssets(l){await ensureComicFont(l.font);clearDesktopWindowCache();}
function dwRound(c,x,y,w,h,r,fill,stroke,width=1){c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function dwText(c,text,x,y,width,size,color,family,weight='400',align='left'){
 c.fillStyle=color;c.textBaseline='top';c.textAlign=align;
 let fit=size;c.font=weight+' '+fit+'px '+family;while(fit>8&&c.measureText(String(text)).width>width){fit-=.5;c.font=weight+' '+fit+'px '+family;}
 c.fillText(String(text),x,y);c.textAlign='left';
}
function dwParagraph(c,text,x,y,width,height,size,color,family){
 let lines=[],font=size;const wrap=()=>{c.font=font+'px '+family;lines=[];for(const para of String(text).split('\n')){let line='';for(const ch of para){if(line&&c.measureText(line+ch).width>width){lines.push(line);line=ch;}else line+=ch;}lines.push(line);}};
 wrap();while(font>10&&lines.length*font*1.5>height){font-=.5;wrap();}
 const count=Math.max(1,Math.floor(height/(font*1.5))),overflow=lines.length>count;lines=lines.slice(0,count);if(overflow)lines[lines.length-1]=lines.at(-1).slice(0,-1)+'…';
 c.font=font+'px '+family;c.textAlign='left';c.textBaseline='top';c.fillStyle=color;lines.forEach((line,i)=>c.fillText(line,x,y+i*font*1.5));return overflow;
}
function dwIcon(c,type,x,y,size){
 if(type==='none')return;const cx=x+size/2,cy=y+size/2;c.save();c.lineWidth=Math.max(2,size*.055);
 if(type==='warning'){c.beginPath();c.moveTo(cx,y+2);c.lineTo(x+size-2,y+size-3);c.lineTo(x+2,y+size-3);c.closePath();c.fillStyle='#ffcc35';c.fill();c.strokeStyle='#9c7500';c.stroke();c.fillStyle='#242424';c.fillRect(cx-size*.055,y+size*.32,size*.11,size*.32);c.beginPath();c.arc(cx,y+size*.78,size*.06,0,Math.PI*2);c.fill();}
 else{c.beginPath();c.arc(cx,cy,size*.46,0,Math.PI*2);c.fillStyle=type==='error'?'#d92828':'#087ac9';c.fill();if(type==='error'){c.strokeStyle='#fff';c.lineWidth=size*.1;c.beginPath();c.moveTo(x+size*.32,y+size*.32);c.lineTo(x+size*.68,y+size*.68);c.moveTo(x+size*.68,y+size*.32);c.lineTo(x+size*.32,y+size*.68);c.stroke();}else{c.fillStyle='#fff';c.font='700 '+size*.72+'px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(type==='question'?'?':'i',cx,cy+size*.025);}}
 c.restore();
}
function dwBevel(c,x,y,w,h,fill='#c0c0c0',pressed=false){c.fillStyle=fill;c.fillRect(x,y,w,h);c.lineWidth=2;c.strokeStyle=pressed?'#555':'#fff';c.beginPath();c.moveTo(x,y+h);c.lineTo(x,y);c.lineTo(x+w,y);c.stroke();c.strokeStyle=pressed?'#fff':'#555';c.beginPath();c.moveTo(x+w,y);c.lineTo(x+w,y+h);c.lineTo(x,y+h);c.stroke();}
function drawDesktopWindow(c,l){
 const d=l.windowUI,p=dwMeta(d.preset),W=p.w,H=p.h,scale=l.gameTextScale??1,family=fonts[l.font]||fonts.sans||'sans-serif';let overflow=false;
 c.save();c.globalAlpha*=d.opacity;c.scale(l.w/W,l.h/H);
 const classic=p.theme==='classic',xp=p.theme==='xp',screen=p.theme.startsWith('bsod'),update=p.theme==='update';
 if(screen){
  c.fillStyle=d.surface;c.fillRect(0,0,W,H);
  if(p.theme==='bsod'){
   dwText(c,l.gameName,64,36,W-128,Math.min(150,120*scale),d.ink,family);overflow=dwParagraph(c,l.gameText,68,210,W-136,205,27*scale,d.ink,family);
   dwText(c,Math.round(d.progress)+'% 완료',68,440,W-136,26*scale,d.ink,family);
   dwParagraph(c,l.gameAffiliation,68,535,W-136,60,17*scale,d.ink,family);
   dwText(c,'중지 코드: '+d.code,68,605,W-136,17*scale,d.ink,family);
  }else{
   dwRound(c,W*.37,56,W*.26,34,0,d.ink);dwText(c,l.gameName,W/2,60,W*.24,Math.min(26,24*scale),d.surface,family,'700','center');
   dwText(c,d.lead,56,140,W-112,25*scale,d.ink,family,'700');overflow=dwParagraph(c,l.gameText,56,210,W-112,240,23*scale,d.ink,family);
   dwText(c,d.code,56,490,W-112,21*scale,d.ink,family);dwText(c,l.gameAffiliation,W/2,580,W-112,20*scale,d.ink,family,'400','center');
  }
 }else if(update){
  dwRound(c,1,1,W-2,H-2,0,d.surface,'#93a9b6',2);
  dwText(c,l.gameName,32,32,W-64,38*scale,d.ink,family);overflow=dwParagraph(c,l.gameText,40,104,W-80,140,24*scale,d.ink,family);
 }else{
  if(classic)dwBevel(c,1,1,W-2,H-2,d.surface);else dwRound(c,1,1,W-2,H-2,xp?9:12,d.surface,xp?'#1355bf':'#acacac',xp?3:1);
  const bar=classic?34:xp?44:48;
  if(classic||xp){const gradient=c.createLinearGradient(0,0,W,0);gradient.addColorStop(0,d.accent);gradient.addColorStop(1,xp?'#67a6ff':'#91b6da');dwRound(c,classic?5:3,classic?5:3,W-(classic?10:6),bar-(classic?5:3),xp?[6,6,0,0]:0,gradient);}
  if(p.key==='sticky11')dwIcon(c,'info',18,12,24);
  dwText(c,l.gameName,p.key==='sticky11'?50:18,classic?10:15,W-160,Math.min(24,18*scale),classic||xp?'#fff':d.ink,family,classic||xp?'700':'400');
  const buttonX=W-116;
  if(classic||xp){for(let i=0;i<3;i++)dwBevel(c,buttonX+i*35,classic?9:10,29,25,i===2&&xp?'#df5b3c':d.surface);}
  c.strokeStyle=classic||xp?'#fff':'#666';c.lineWidth=1.5;c.beginPath();c.moveTo(W-105,27);c.lineTo(W-91,27);c.rect(W-72,19,13,11);c.moveTo(W-34,19);c.lineTo(W-22,31);c.moveTo(W-22,19);c.lineTo(W-34,31);c.stroke();
  let x=30,y=bar+30,width=W-60;
  if(d.icon!=='none'){dwIcon(c,d.icon,x,y+4,52);x+=78;width-=78;}
  if(d.lead){dwText(c,d.lead,x,y,width,Math.min(30,24*scale),d.ink,family,'400');y+=42;}
  const footerSpace=l.gameAffiliation?42:0;overflow=dwParagraph(c,l.gameText,x,y,width,H-78-footerSpace-y,18*scale,d.ink,family);
  if(l.gameAffiliation)dwText(c,l.gameAffiliation,p.key==='sticky11'?76:30,H-112,W-106,Math.min(20,17*scale),d.accent,family);
  if(!classic&&!xp){c.fillStyle='#00000008';c.fillRect(2,H-74,W-4,72);c.fillStyle='#00000010';c.fillRect(2,H-75,W-4,1);}
 }
 if(!screen){
  const labels=d.buttons.filter(t=>t.trim()),gap=update?28:14,bw=update?166:118,bh=update?48:38,y=H-(update?78:58),start=W-30-labels.length*bw-Math.max(0,labels.length-1)*gap;
  labels.forEach((text,i)=>{const x=start+i*(bw+gap);if(classic)dwBevel(c,x,y,bw,bh,d.surface);else dwRound(c,x,y,bw,bh,xp?4:update?0:5,update?(i===1?'#07517a':d.surface):xp?'#f5f4ea':d.surface,update?'#fff':i===0?d.accent:'#c6c6c6',update?2:1);dwText(c,text,x+bw/2,y+(bh-Math.min(22,20*scale))/2,bw-16,Math.min(22,20*scale),d.ink,family,'400','center');if(p.key==='sticky11'&&i===0){c.save();c.setLineDash([2,2]);c.strokeStyle='#777';c.strokeRect(x+5,y+5,bw-10,bh-10);c.restore();}});
 }
 c.restore();return overflow;
}
function desktopWindowBitmap(l){
 const rasterScale=Math.min(1,2048/l.w,2048/l.h,Math.sqrt(1500000/(l.w*l.h))),w=Math.max(1,Math.round(l.w*rasterScale)),h=Math.max(1,Math.round(l.h*rasterScale));
 const key=JSON.stringify([w,h,l.gameName,l.gameText,l.gameAffiliation,l.font,fonts[l.font],l.gameTextScale,l.windowUI]);let old=desktopWindowCache.get(key);if(old){desktopWindowCache.delete(key);desktopWindowCache.set(key,old);return old.canvas;}
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const c=canvas.getContext('2d');c.scale(w/l.w,h/l.h);const overflow=drawDesktopWindow(c,l),bytes=w*h*4;
 while(desktopWindowCache.size&&(desktopWindowCache.size>=3||desktopWindowCacheBytes+bytes>12*1024*1024)){const first=desktopWindowCache.keys().next().value,e=desktopWindowCache.get(first);desktopWindowCacheBytes-=e.bytes;e.canvas.width=e.canvas.height=1;desktopWindowCache.delete(first);}
 desktopWindowCache.set(key,{canvas,bytes,overflow});desktopWindowCacheBytes+=bytes;return canvas;
}
async function addDesktopWindow(key){
 if(projectBusy||desktopWindowAdding||(state.imageLayers||[]).length>=40)return false;const doc=state;desktopWindowAdding=true;
 try{const l=desktopWindowLayer(key);await loadDesktopWindowAssets(l);if(projectBusy||state!==doc||(state.imageLayers||[]).length>=40)return false;checkpoint();(state.imageLayers??=[]).push(l);$('desktopWindowTemplateDialog').close();selectImageLayer(l);status(l.name+' 추가 · 드래그로 이동하고 더블클릭·더블탭으로 문구를 편집하세요.');return true;}
 catch(e){status(e.message||'윈도우 창을 추가하지 못했습니다.');return false;}finally{desktopWindowAdding=false;}
}
function dwFocus(el){inputHistoryKey=null;el.dwDocument=state;el.dwObject=currentImageLayer();}
function dwPointer(el){
 const l=currentImageLayer();if(projectBusy||!isDesktopWindow(l)||l.visible===false||desktopWindowControlTarget!==l)return;
 // Touch/native controls need not emit focus before input. Capture the gesture
 // here, and keep the range (rather than the body textarea) as the active field.
 dwFocus(el);if(el.type==='range')el.focus({preventScroll:true});
}
function dwChange(id,change,discrete=false){
 const l=currentImageLayer();if(projectBusy||!isDesktopWindow(l)||l.visible===false)return;
 if(!discrete||id==='icon'){const el=$('dw-'+id);if(el.dwDocument!==state||el.dwObject!==l)return;}
 if(discrete)checkpoint();else recordInput('desktop-window-'+id);change(l);render();syncDesktopWindowControls();
}
function syncDesktopWindowControls(){
 const panel=$('desktopWindowInspector');if(!panel)return;const l=currentImageLayer();panel.hidden=!isDesktopWindow(l);if(panel.hidden){desktopWindowControlTarget=null;return;}
 const changed=desktopWindowControlTarget!==l;if(changed){if(document.activeElement?.id?.startsWith('dw-'))document.activeElement.blur?.();desktopWindowControlTarget=l;inputHistoryKey=null;}const d=l.windowUI,p=dwMeta(d.preset);$('desktopWindowHeading').textContent=p.name+' · 이동형';
 const values={title:l.gameName,lead:d.lead,body:l.gameText,footer:l.gameAffiliation,icon:d.icon,font:l.font,scale:Math.round((l.gameTextScale??1)*100),accent:d.accent,surface:d.surface,ink:d.ink,opacity:Math.round(d.opacity*100),progress:d.progress,code:d.code,x:l.x,y:l.y,width:l.w,rotation:l.rotation||0};
 for(let i=0;i<3;i++)values['button'+i]=d.buttons[i]||'';
 for(const [key,value]of Object.entries(values)){const el=$('dw-'+key);if(changed||document.activeElement!==el)el.value=value;el.disabled=projectBusy||l.visible===false;}
 const select=$('dw-font'),source=$('font'),signature=Array.from(source.options||[]).map(o=>o.value+':'+o.textContent).join('|');if(select.dataset.fonts!==signature){select.replaceChildren(...Array.from(source.options||[]).map(o=>o.cloneNode(true)));select.dataset.fonts=signature;select.value=l.font;}
 $('dw-buttons').hidden=p.theme.startsWith('bsod');$('dw-error-fields').hidden=!p.theme.startsWith('bsod');$('dw-progress-label').hidden=p.theme!=='bsod';
 $('dw-visible').checked=l.visible;$('dw-visible').disabled=projectBusy;
 $('dw-restore').disabled=projectBusy||l.visible===false;$('dw-duplicate').disabled=$('dw-delete').disabled=projectBusy;
 const picture=desktopWindowBitmap(l),entry=[...desktopWindowCache.values()].find(e=>e.canvas===picture);$('dw-overflow').textContent=entry?.overflow?'문구가 길어 일부가 생략됩니다. 글자 크기를 줄이거나 내용을 나누세요.':'';
}
function openDesktopWindowEditor(l,event=null){
 if(!isDesktopWindow(l)||projectBusy||currentImageLayer()!==l||l.visible===false)return false;
 if(event&&(event.pointerType==='touch'||event.pointerType==='pen'||event.sourceCapabilities?.firesTouchEvents))miniOpeningRelease={time:performance.now()};resetMiniEditGesture();
 if(typeof openMobilePanel==='function'&&mobileMedia.matches){closeMobilePanel();openMobilePanel('text');}else if(typeof setDesktopStudioTab==='function')setDesktopStudioTab('text');
 syncDesktopWindowControls();$('desktopWindowInspector').scrollIntoView?.({block:'nearest'});$('dw-body').focus({preventScroll:true});return true;
}
function initDesktopWindows(){
 const field=(host,key,title,type='text',attributes={})=>{const label=document.createElement('label'),el=document.createElement(type==='textarea'?'textarea':type==='select'?'select':'input');label.textContent=title;el.id='dw-'+key;if(type!=='textarea'&&type!=='select')el.type=type;Object.assign(el,attributes);el.onpointerdown=()=>dwPointer(el);label.append(el);host.append(label);return el;};
 const host=$('desktopWindowFields');
 for(const [key,title,type,max]of [['title','창 제목','text',200],['lead','강조 문구','text',200],['body','본문','textarea',2000],['footer','추가 안내 · 링크 문구','text',2000]]){const el=field(host,key,title,type,{maxLength:max,...(type==='textarea'?{rows:5}:{})});el.onfocus=()=>dwFocus(el);el.oninput=()=>dwChange(key,l=>{if(key==='lead')l.windowUI.lead=el.value;else l[{title:'gameName',body:'gameText',footer:'gameAffiliation'}[key]]=el.value;});}
 const icon=field(host,'icon','아이콘','select');for(const [key,title]of [['none','없음'],['error','오류'],['warning','경고'],['info','안내'],['question','질문']])icon.add(new Option(title,key));icon.onfocus=()=>dwFocus(icon);icon.onchange=()=>dwChange('icon',l=>l.windowUI.icon=icon.value,true);
 const font=field(host,'font','글꼴','select');font.onfocus=()=>dwFocus(font);font.onchange=()=>{const l=currentImageLayer(),doc=state,value=font.value;if(projectBusy||!isDesktopWindow(l)||l.visible===false||l.font===value||font.dwDocument!==state||font.dwObject!==l)return;checkpoint();l.font=value;if(typeof embeddedDocumentFonts==='function')state.fonts=embeddedDocumentFonts(state);if(typeof rememberTextFont==='function')rememberTextFont(value);ensureComicFont(value).then(()=>{if(state!==doc||currentImageLayer()!==l||l.font!==value)return;clearDesktopWindowCache();render();syncDesktopWindowControls();}).catch(()=>{if(state===doc&&currentImageLayer()===l&&l.font===value)status('글꼴을 불러오지 못했습니다. 다른 글꼴을 선택해 주세요.');});render();};
 for(const [key,title,type,min,max]of [['scale','글자 크기 (%)','range',50,200],['opacity','창 불투명도 (%)','range',0,100],['progress','완료율 (%)','range',0,100]]){const el=field(key==='progress'?$('dw-error-fields'):host,key,title,type,{min,max,step:1});if(key==='progress')el.parentElement.id='dw-progress-label';el.onfocus=()=>dwFocus(el);el.oninput=el.onchange=()=>{const l=currentImageLayer(),n=dwClamp(el.value,min,max),value=key==='progress'?n:n/100;if(!isDesktopWindow(l)||(key==='scale'?l.gameTextScale??1:l.windowUI[key])===value)return;dwChange(key,l=>{if(key==='scale')l.gameTextScale=value;else l.windowUI[key]=value;});};}
 for(const [key,title]of [['accent','강조색'],['surface','바탕색'],['ink','글자색']]){const el=field(host,key,title,'color');el.onfocus=()=>dwFocus(el);el.oninput=()=>dwChange(key,l=>l.windowUI[key]=el.value);}
 for(let i=0;i<3;i++){const el=field($('dw-buttons'),'button'+i,'버튼 '+(i+1),'text',{maxLength:32});el.onfocus=()=>dwFocus(el);el.oninput=()=>dwChange('button'+i,l=>{l.windowUI.buttons=Array.from({length:3},(_,j)=>j===i?el.value:l.windowUI.buttons[j]||'');});}
 const code=field($('dw-error-fields'),'code','중지 코드','text',{maxLength:160});code.onfocus=()=>dwFocus(code);code.oninput=()=>dwChange('code',l=>l.windowUI.code=code.value);
 for(const [key,title,min,max]of [['x','가로 위치',-30000,30000],['y','세로 위치',-30000,30000],['width','창 너비',20,16000],['rotation','회전 (°)',-180,180]]){const el=field($('dw-geometry'),key,title,'number',{min,max,step:key==='rotation'?.1:1});el.onfocus=()=>dwFocus(el);el.oninput=()=>{if(!Number.isFinite(el.valueAsNumber))return;dwChange(key,l=>{const n=dwClamp(el.value,min,max);if(key==='width'){l.h*=n/l.w;l.w=n;}else l[key]=n;});};}
 $('dw-visible').onchange=()=>{const l=currentImageLayer();if(projectBusy||!isDesktopWindow(l))return;checkpoint();l.visible=$('dw-visible').checked;sync();};
 $('dw-restore').onclick=()=>dwChange('defaults',l=>{const p=dwMeta(l.windowUI.preset);Object.assign(l,{gameName:p.title,gameText:p.text,gameAffiliation:p.footer});Object.assign(l.windowUI,{lead:p.lead,buttons:[...p.buttons],code:p.code||'',progress:p.progress||0});},true);
 $('dw-duplicate').onclick=()=>$('duplicateImageLayer').click();$('dw-delete').onclick=()=>$('deleteImageLayer').click();
 const dialog=$('desktopWindowTemplateDialog');$('desktopWindowTemplateClose').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog&&e.clientX!==undefined){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 const paintChoices=()=>{const root=$('desktopWindowChoices');root.replaceChildren();for(const p of desktopWindowTemplates){const b=document.createElement('button');b.type='button';b.className='desktop-window-choice';b.dataset.preset=p.key;const l=desktopWindowLayer(p.key);l.w=p.w;l.h=p.h;const cv=document.createElement('canvas');cv.width=360;cv.height=Math.round(360*p.h/p.w);cv.setAttribute('aria-hidden','true');const c=cv.getContext('2d');c.scale(cv.width/p.w,cv.height/p.h);drawDesktopWindow(c,l);const title=document.createElement('strong'),hint=document.createElement('small');title.textContent=p.name;hint.textContent='이동형 · 제목·본문·버튼 편집';b.append(cv,title,hint);b.onclick=()=>addDesktopWindow(p.key);root.append(b);}};
 $('desktopWindowTemplateOpen').onclick=()=>{if(projectBusy)return;paintChoices();dialog.showModal();Promise.all([ensureComicFont(GAME_UI_FONT),ensureComicFont('pixel_galmuri9')]).then(()=>{if(dialog.open)paintChoices();}).catch(()=>{});};
}
