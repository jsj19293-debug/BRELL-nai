'use strict';
// Nightmare 4 후처리 엔진: ?mode=engine 으로 열면 화면에는 그림판(캔버스)만 보이고,
// 목록 · 속성 · 버튼은 Nightmare 쪽이 그린다. 부모 창은 window.nightmareEngine 을 바로 부른다.
(()=>{
 if(new URLSearchParams(location.search).get('mode')!=='engine')return;
 document.body.classList.add('nm-engine');
 const style=document.createElement('style');
 style.textContent=[
  'body.nm-engine .studio-header,body.nm-engine #desktopNav,body.nm-engine #mobileLeftPanel,body.nm-engine #mobileRightPanel,',
  'body.nm-engine .workspace>.page-heading,body.nm-engine .workspace>.toolbar,body.nm-engine #mobileCanvasTools,body.nm-engine .workspace>footer,',
  'body.nm-engine #emptyImport,body.nm-engine .empty-state{display:none!important}',
  'body.nm-engine{background:#0b0d10!important;overflow:hidden}',
  'body.nm-engine #projectSurface{display:block!important;height:100dvh!important}',
  'body.nm-engine .workspace{height:100dvh!important;border:0!important;background:#0b0d10!important;display:flex!important;flex-direction:column!important}',
  'body.nm-engine #viewport{flex:1 1 auto!important;min-height:0!important;height:auto!important}',
 ].join('');
 document.head.append(style);

 const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0};
 const thumbOf=button=>{const img=button.querySelector('img');if(img?.src)return img.src;const canvas=button.querySelector('canvas');if(canvas)try{return canvas.toDataURL('image/png')}catch{}return ''};
 const labelOf=button=>(button.querySelector('span,strong,b')?.textContent||button.title||button.textContent||'').trim().replace(/\s+/g,' ').slice(0,40);

 const BALLOON=['thin','thick','translucent','emotion','handdrawn','references'];
 const ASSET=['builtin','ogok','reactions','censor','beta-censor','cross-section','custom'];

 /** 목록의 버튼들을 지금 상태로 다시 그리고 돌려준다 */
 function buttons(group){
  const [kind,name]=group.split(':');
  if(kind==='balloon'&&BALLOON.includes(name)){balloonCategory=name;drawBalloonChoices();return [...$('types').querySelectorAll('button')]}
  if(kind==='asset'&&ASSET.includes(name)){
   balloonCategory='stickers';assetCatalogTab=name;drawBalloonChoices();
   if(name==='custom'){refreshCustomAssets();return [...$('customAssetList').querySelectorAll('.custom-asset-use')]}
   return [...$('types').querySelectorAll('button')];
  }
  if(group==='window'){const d=$('desktopWindowTemplateDialog');$('desktopWindowTemplateOpen').click();const list=[...d.querySelectorAll('button')].filter(b=>b.id!=='desktopWindowTemplateClose');return list}
  if(group==='frame'){const d=$('framePickerDialog');[...document.querySelectorAll('button.import')].find(b=>b.textContent.includes('프레임·템플릿'))?.click();return [...d.querySelectorAll('.frame-picker-groups button')]}
  return [];
 }
 const closeDialogs=()=>{for(const d of document.querySelectorAll('dialog[open]'))d.close()};

 let selectionVersion=0;
 const origSync=typeof sync==='function'?sync:null;
 if(origSync)window.sync=sync=function(...args){selectionVersion++;return origSync.apply(this,args)};

 function selectedLayer(){return typeof imageLayerSelected!=='undefined'&&imageLayerSelected?(state.imageLayers||[]).find(l=>l.id===imageLayerSelected):null}
 const field=id=>{const e=$(id);return e?(e.type==='checkbox'?e.checked:e.value):undefined};
 const DESKTOP_FIELDS=['dw-title','dw-lead','dw-body','dw-footer','dw-button0','dw-button1','dw-button2','dw-code'];

 window.nightmareEngine={
  ready:true,
  /** 목록: [{index,label,thumb}] */
  catalog(group){try{return buttons(group).map((b,index)=>({index,label:labelOf(b),thumb:thumbOf(b)}))}finally{closeDialogs()}},
  /** 미리보기 그림이 다 불러와진 뒤에 목록을 찍는다 (그림은 불러온 뒤에 그려지기 때문) */
  async catalogReady(group){
   const list=buttons(group);
   try{
    const pending=()=>typeof referenceLoads!=='undefined'?[...referenceLoads.values()]:[];
    const started=Date.now();
    while(pending().length&&Date.now()-started<20000)await Promise.race([Promise.allSettled(pending()),new Promise(r=>setTimeout(r,500))]);
    await Promise.all(list.map(b=>b.querySelector('img')).filter(Boolean).map(img=>img.complete?null:new Promise(r=>{img.onload=img.onerror=r})));
    await new Promise(r=>setTimeout(r,60));
    return list.map((b,index)=>({index,label:labelOf(b),thumb:thumbOf(b)}));
   }finally{closeDialogs()}
  },
  /** 목록에서 하나를 넣는다 */
  async choose(group,index){const list=buttons(group);const b=list[index];if(!b){closeDialogs();return false}b.click();await new Promise(r=>setTimeout(r,60));closeDialogs();return true},
  /** 지금 고른 것의 정보 */
  selection(){
   const layer=selectedLayer();
   if(layer){
    const desktop=typeof isDesktopWindow==='function'&&isDesktopWindow(layer);
    if(desktop&&typeof syncDesktopWindowControls==='function')try{syncDesktopWindowControls()}catch{}
    return {version:selectionVersion,type:desktop?'window':'layer',name:layer.name||layer.kind,fields:desktop?Object.fromEntries(DESKTOP_FIELDS.map(id=>[id,field(id)])):null};
   }
   const b=typeof current==='function'?current():null;
   if(!b)return {version:selectionVersion,type:'none'};
   return {version:selectionVersion,type:b.kind==='asset'?'asset':'balloon',name:b.kind,text:b.text??'',fontSize:b.fontSize,color:b.color,fill:b.fill,opacity:b.opacity,hasText:typeof b.text==='string'};
  },
  /** 고른 것 고치기: 스튜디오 입력칸에 값을 넣어 원래 처리 그대로 */
  update(patch){
   const set=(id,value)=>{const e=$(id);if(!e)return;e.onpointerdown?.();e.onfocus?.();if(e.type==='checkbox')e.checked=!!value;else e.value=String(value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));e.onblur?.()};
   if(Object.keys(patch).some(key=>key.startsWith('dw-'))&&typeof syncDesktopWindowControls==='function')try{syncDesktopWindowControls()}catch{}
   for(const [key,value]of Object.entries(patch)){
    if(key.startsWith('dw-'))set(key,value);
    else if(['text','fontSize','color','fill','opacity'].includes(key))set(key,value);
   }
   return this.selection();
  },
  /** 버튼 동작: undo · redo · delete · duplicate · fit · rotate · forward · backward */
  action(name){const ids={undo:'undo',redo:'redo',delete:'mobileDelete',duplicate:'mobileDuplicate',fit:'fit',rotate:'objectRotate',forward:'imageLayerUp',backward:'imageLayerDown'};const e=$(ids[name]);if(e&&!e.disabled)e.click();return this.selection()},
  /** 고른 것 크게 / 작게 (가운데 기준, 글자 크기도 같이) */
  scale(factor){
   const target=(typeof current==='function'&&current())||(typeof currentImageLayer==='function'&&currentImageLayer())||null;
   if(!target||!Number.isFinite(target.w)||!Number.isFinite(target.h))return this.selection();
   const f=Math.max(.2,Math.min(5,factor)),w=Math.max(16,target.w*f),h=Math.max(16,target.h*f),k=w/target.w;
   checkpoint();
   target.x+= (target.w-w)/2;target.y+=(target.h-h)/2;target.w=w;target.h=h;
   if(Number.isFinite(target.fontSize))target.fontSize=Math.max(6,Math.min(480,target.fontSize*k));
   if(typeof markProjectDirty==='function')markProjectDirty();
   sync();
   return this.selection();
  },
  /** 내 에셋 등록 (data URL) */
  async addCustomAsset(dataUrl,name){const blob=await (await fetch(dataUrl)).blob();const file=new File([blob],name||'asset.png',{type:blob.type||'image/png'});await importCustomAssetFiles([file]);return this.catalog('asset:custom')},
  /** 새 이미지로 시작 (말풍선 · 에셋은 비움) */
  async reset(dataUrl){closeDialogs();const im=await imageFrom(dataUrl);state={...state,width:im.width,height:im.height,image:dataUrl,items:[],imageLayers:[],panels:[],masks:[]};bg=im;selected=null;if(typeof imageLayerSelected!=='undefined')imageLayerSelected=null;history=[];future=[];cancelRetouch();setTool('select');fit();sync();return {width:im.width,height:im.height}},
 };
 window.addEventListener('resize',()=>{try{fit()}catch{}});
 // 크기 단축키: + / = / ] 크게, - / [ 작게 (글자 입력 중에는 무시). Delete · 되돌리기는 원래 단축키 그대로.
 window.addEventListener('keydown',e=>{
  if(e.isComposing||e.ctrlKey||e.metaKey||e.altKey||e.target.matches?.('input,textarea,select,[contenteditable]')||e.target.isContentEditable)return;
  const grow=['+','=',']'].includes(e.key),shrink=['-','_','['].includes(e.key);
  if(!grow&&!shrink)return;
  e.preventDefault();e.stopPropagation();
  window.nightmareEngine.scale(grow?(e.shiftKey?1.25:1.1):(e.shiftKey?.8:1/1.1));
 },true);
 window.dispatchEvent(new Event('nightmare-engine-ready'));
})();
