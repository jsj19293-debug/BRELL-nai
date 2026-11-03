'use strict';
let censorPopup=null,censorPopupTarget=null,censorOpened=null,censorDismissed=null,censorOpacityGesture=null,censorDetailGesture=null;
function censorMobileUI(){return typeof mobileMedia!=='undefined'?mobileMedia.matches:window.innerWidth<=800}
function censorTarget(){const b=current();return isCensorAsset(b)&&b.visible!==false?b:null}
function beginCensorOpacity(){const b=censorTarget();censorOpacityGesture=b&&!projectBusy?{object:b,document:state,recorded:false}:null}
function changeCensorOpacity(){
 const d=censorOpacityGesture,b=censorTarget();if(projectBusy||censorPopup?.hidden||!d||d.document!==state||d.object!==b)return;
 const raw=Number($('censorOpacity').value);if(!Number.isFinite(raw))return;const value=Math.max(0,Math.min(1,raw/100));if(value===b.opacity)return;
 if(!d.recorded){checkpoint();d.recorded=true}else markProjectDirty();
 b.opacity=value;$('opacity').value=value;$('opacityValue').textContent=Math.round(value*100)+'%';updateLayers(b.id);if(typeof requestEditorInputRender==='function')requestEditorInputRender();else render();
}
function openCensorPopover(b,event=null,inserted=false){
 if(!isCensorAsset(b)||projectBusy||b!==current()||b.visible===false)return false;
 syncCensorPopover();censorDismissed=null;censorOpened={object:b,document:state};
 if(typeof miniOpenedObject!=='undefined'){miniOpenedObject=b;miniOpenedAt=performance.now();if(inserted||event&&(event.pointerType==='touch'||event.pointerType==='pen'||event.sourceCapabilities?.firesTouchEvents))miniOpeningRelease={time:miniOpenedAt};resetMiniEditGesture()}
 if(typeof closeMobilePanel==='function')closeMobilePanel();syncCensorPopover();if(typeof isCensorTape==='function'&&isCensorTape(b)||typeof isCensorSign==='function'&&isCensorSign(b))$('censorTapeText').focus({preventScroll:true});return true;
}
function beginCensorDetail(key){const b=censorTarget();censorDetailGesture=b&&!projectBusy?{key,object:b,document:state,recorded:false}:null}
function changeCensorDetail(key,raw){
 const d=censorDetailGesture,b=censorTarget();if(!d||d.key!==key||d.object!==b||d.document!==state||projectBusy||censorPopup?.hidden)return;
 const sign=typeof isCensorSign==='function'&&isCensorSign(b),tape=typeof isCensorTape==='function'&&isCensorTape(b)||sign,backdrop=typeof isBackdropCensor==='function'&&isBackdropCensor(b);let value,old;
 if(tape&&key==='text'){value=String(raw).slice(0,500);old=b.text}
 else if(tape&&key==='font'){if(typeof raw!=='string'||!Array.from($('font').options||[]).some(o=>o.value===raw&&!o.disabled))return;value=raw;old=b.font}
 else if(tape&&['color','fill'].includes(key)||sign&&key==='stroke'){if(!/^#[0-9a-f]{6}$/i.test(raw))return;value=raw;old=b[key]}
 else if(tape&&['fontSize','gap'].includes(key)||(backdrop||sign&&['notice','glitch-dialog'].includes(censorInfo(b).style))&&key==='strength'){
  if(raw==='')return;value=Number(raw);if(!Number.isFinite(value))return;value=Math.max(key==='fontSize'?10:key==='strength'?1:0,Math.min(key==='fontSize'?480:key==='gap'?240:100,value));old=key==='fontSize'?b.fontSize:censorSetting(b,key);
 }else if(sign&&censorInfo(b).dialog&&['dialogTitle','dialogSubtitle','dialogButton','dialogFooter'].includes(key)){value=String(raw).slice(0,500);old=censorDialogSetting(b,key);
 }else if(sign&&['tracking','band','angle','bannerOffset'].includes(key)){
  if(raw==='')return;value=Number(raw);if(!Number.isFinite(value))return;const limits={tracking:[0,40],band:[8,36],angle:[-180,180],bannerOffset:[0,100]}[key];value=Math.max(limits[0],Math.min(limits[1],value));old=censorSignSetting(b,key);
 }else if(sign&&key==='warningText'){value=String(raw).slice(0,500);old=censorSignSetting(b,key);
 }else if(sign&&key==='repeat'){if(!['fill','single'].includes(raw))return;value=raw==='fill';old=censorSignSetting(b,key);
 }else if(sign&&key==='reveal'){if(!['all','none','mosaic','blur'].includes(raw))return;value=raw;old=censorSignSetting(b,key);
 }else if(sign&&isCensorRing(b)&&key==='ringPalette'){if(!Object.hasOwn(censorRingPalettes,raw))return;value=raw;old=censorRingPalette(b);
 }else if(sign&&isCensorRing(b)&&key==='textGradient'){if(!['solid','vertical'].includes(raw))return;value=raw;old=censorSignSetting(b,key);
 }else if(sign&&isCensorRing(b)&&key==='gradientBottom'){if(typeof raw!=='string'||!/^#[0-9a-f]{6}$/i.test(raw))return;value=raw;old=censorSignSetting(b,key);
 }else if(backdrop&&key==='scope'){if(!['image','all'].includes(raw))return;value=raw;old=censorSetting(b,key);
 }else if(backdrop&&['style','shape'].includes(key)){
  const info=censorInfo(b),style=key==='style'?raw:info.style,shape=key==='shape'?raw:info.shape;if(!['mosaic','blur','frost'].includes(style)||!['rect','circle'].includes(shape))return;value=`censor-${style}-${shape}`;old=b.assetId;
 }else return;
 if(value===old)return;if(!d.recorded){checkpoint();d.recorded=true}else markProjectDirty();
 if(key==='ringPalette'){const {color,fill,stroke,textGradient,gradientBottom}=censorRingPalettes[value];Object.assign(b,{color,fill,stroke});b.censorSettings={...b.censorSettings,version:1,textGradient,gradientBottom};for(const k of ['color','fill','stroke'])$(k).value=b[k]}
 else if(['gap','strength','tracking','band','angle','repeat','reveal','warningText','bannerOffset','textGradient','gradientBottom','scope','dialogTitle','dialogSubtitle','dialogButton','dialogFooter'].includes(key))b.censorSettings={...b.censorSettings,version:1,[key]:value};else if(['style','shape'].includes(key))b.assetId=value;else b[key]=value;
 if(key==='font'){
  if(value==='shout')b.weight='900';if(typeof embeddedDocumentFonts==='function')state.fonts=embeddedDocumentFonts(state);if(typeof rememberTextFont==='function')rememberTextFont(value);
  const doc=state;if(typeof ensureComicFont==='function')ensureComicFont(value).then(()=>{if(state===doc&&current()===b&&b.font===value&&!projectBusy)render()}).catch(()=>{if(state===doc&&current()===b&&b.font===value)status('글꼴을 불러오지 못했습니다. 다시 선택해주세요.')});
 }
 if(['text','font','fontSize','color','fill','stroke'].includes(key))$(key).value=value;updateLayers(b.id);if(typeof requestEditorInputRender==='function')requestEditorInputRender();else render();
}
function syncCensorFontOptions(){
 const source=$('font'),select=$('censorTapeFont');if(!source||!select)return;
 const choices=Array.from(source.options||[]),signature=choices.map(o=>o.value+':'+o.textContent+':'+!!o.disabled).join('|');
 if(select.dataset.fonts!==signature){const value=select.value;select.replaceChildren(...choices.map(o=>o.cloneNode(true)));select.value=value;select.dataset.fonts=signature}
}
function resetCensorSignText(){
 const b=censorTarget();if(projectBusy||censorPopup?.hidden||typeof isCensorSign!=='function'||!isCensorSign(b)||censorInfo(b).style!=='chip')return;
 const text=censorInfo(b).defaultText;if(b.text===text&&censorSignSetting(b,'warningText')===censorWarningText)return;checkpoint();b.text=text;b.censorSettings={...b.censorSettings,version:1,warningText:censorWarningText};censorDetailGesture=null;$('text').value=$('censorTapeText').value=text;$('censorSignWarning').value=censorWarningText;updateLayers(b.id);if(typeof requestEditorInputRender==='function')requestEditorInputRender();else render();
}
function initCensorDetailFields(popup){
 const tape=document.createElement('div'),effect=document.createElement('div');tape.id='censorTapeFields';effect.id='censorEffectFields';tape.className=effect.className='censor-detail-fields';tape.hidden=effect.hidden=true;
 const field=(host,title,id,type,options=null)=>{const label=document.createElement('label'),name=document.createElement('span');name.textContent=title;const input=document.createElement(options?'select':type==='textarea'?'textarea':'input');input.id=id;if(!options&&type!=='textarea')input.type=type;if(options)for(const [value,text]of options){const option=document.createElement('option');option.value=value;option.textContent=text;input.append(option)}label.id=id+'Label';label.append(name,input);host.append(label);return input};
 const text=field(tape,'문구','censorTapeText','textarea');text.maxLength=500;text.rows=2;text.setAttribute('aria-label','반복할 문구');
 const font=field(tape,'글꼴','censorTapeFont',null,[]);font.setAttribute('aria-label','검열 에셋 문구 글꼴');font.onpointerdown=font.onfocus=()=>beginCensorDetail('font');font.onkeydown=()=>{if(!censorDetailGesture)beginCensorDetail('font')};font.onchange=()=>{changeCensorDetail('font',font.value);censorDetailGesture=null};font.onblur=()=>{censorDetailGesture=null};
 const gap=field(tape,'문구 사이 간격 (px)','censorTapeGap','range');gap.min=0;gap.max=240;gap.step=1;const gapValue=document.createElement('output');gapValue.id='censorTapeGapValue';tape.append(gapValue);
 const size=field(tape,'글자 크기 (px)','censorTapeSize','number');size.min=10;size.max=480;size.step=1;
 const ink=field(tape,'글자·테두리 색','censorTapeInk','color'),fill=field(tape,'띠 바탕색','censorTapeFill','color');
 const scope=document.createElement('div');scope.className='censor-scope';scope.setAttribute('role','group');scope.setAttribute('aria-label','검열 대상');const scopeTitle=document.createElement('span');scopeTitle.textContent='검열 대상';scope.append(scopeTitle);
 for(const [value,title]of [['image','그림만'],['all','전부']]){const button=document.createElement('button');button.type='button';button.id=value==='image'?'censorScopeImage':'censorScopeAll';button.textContent=title;button.title=value==='image'?'그림만 검열하고 글자·말풍선·에셋은 선명하게 유지합니다.':'이 영역의 그림·글자·말풍선·에셋을 모두 검열합니다.';button.setAttribute('aria-pressed','false');button.onpointerdown=button.onfocus=()=>beginCensorDetail('scope');button.onkeydown=()=>{if(!censorDetailGesture)beginCensorDetail('scope')};button.onclick=()=>{changeCensorDetail('scope',value);censorDetailGesture=null};button.onblur=()=>{censorDetailGesture=null};scope.append(button)}effect.append(scope);
 const mode=field(effect,'흐림 종류','censorEffectMode',null,[['mosaic','모자이크'],['blur','블러'],['frost','거친 흐림']]),shape=field(effect,'영역 형태','censorEffectShape',null,[['rect','사각'],['circle','원형 · 타원']]);
 const corners=document.createElement('button'),resetCorners=document.createElement('button');corners.id='censorCornerFit';corners.type='button';corners.textContent='모서리 맞춤 · 8점';corners.onclick=()=>{if(isBackdropCensor(censorTarget())&&typeof toggleCornerFit==='function')toggleCornerFit()};resetCorners.id='censorCornerReset';resetCorners.type='button';resetCorners.textContent='모서리 초기화';resetCorners.onclick=()=>{if(isBackdropCensor(censorTarget())&&typeof resetCornerFit==='function')resetCornerFit()};effect.append(corners,resetCorners);const cornerHint=document.createElement('small');cornerHint.textContent='검열 영역만 맞춰요. 기본 8점 · 정밀 16점(각 변 5점)';effect.append(cornerHint);
 const precision=field(effect,'모서리 조절점','censorCornerPoints',null,[['8','기본 · 8점'],['16','정밀 · 16점 (각 변 5점)']]);precision.onpointerdown=precision.onfocus=()=>beginCensorDetail('cornerPoints');precision.onkeydown=()=>{if(!censorDetailGesture)beginCensorDetail('cornerPoints')};precision.onchange=()=>{const d=censorDetailGesture,b=censorTarget();if(d?.key==='cornerPoints'&&d.document===state&&d.object===b&&!censorPopup?.hidden&&typeof setCensorCornerCount==='function')setCensorCornerCount(Number(precision.value));censorDetailGesture=null};
 const strength=field(effect,'효과 강도','censorEffectStrength','range');strength.min=1;strength.max=100;strength.step=1;const strengthValue=document.createElement('output');strengthValue.id='censorEffectStrengthValue';effect.append(strengthValue);
 const sign=document.createElement('div');sign.id='censorSignFields';sign.className='censor-detail-fields';sign.hidden=true;
 const palette=field(sign,'링 색상 조합','censorSignPalette',null,[['pink','분홍 띠 · 흰 글자'],['lime','검정 띠 · 연두 그라데이션'],['custom','사용자 지정']]);palette.children[2].disabled=true;
 const gradient=field(sign,'글자 색상 방식','censorSignGradient',null,[['solid','단색'],['vertical','위 → 아래 그라데이션']]);
 const bottom=field(sign,'글자 아래쪽 색','censorSignBottom','color');
 const tracking=field(sign,'글자 사이 간격 (px)','censorSignTracking','range');tracking.min=0;tracking.max=40;tracking.step=1;
 const band=field(sign,'링 띠 두께 (%)','censorSignBand','range');band.min=8;band.max=36;band.step=1;
 const angle=field(sign,'문구 시작 각도 (°)','censorSignAngle','number');angle.min=-180;angle.max=180;angle.step=1;
 const repeat=field(sign,'원형 문구 배치','censorSignRepeat',null,[['fill','한 바퀴 반복'],['single','한 번만']]);
 const reveal=field(sign,'링 안쪽 검열 해제','censorSignReveal',null,[['all','모자이크·블러 모두'],['mosaic','모자이크만'],['blur','블러·거친 흐림만'],['none','사용 안 함']]);
 const warning=field(sign,'위·아래 안내 문구','censorSignWarning','textarea');warning.rows=2;warning.maxLength=500;
 const offset=field(sign,'아래 안내문 반복 위치 (%)','censorSignOffset','range');offset.min=0;offset.max=100;offset.step=1;
 const reset=document.createElement('button');reset.id='censorSignResetText';reset.type='button';reset.textContent='배너 원본 문구로';reset.title='큰 제목과 위·아래 안내문을 원본 문구로 되돌립니다.';reset.onclick=resetCensorSignText;sign.append(reset);
 const noise=field(sign,'노이즈 강도','censorSignNoise','range');noise.min=1;noise.max=100;noise.step=1;
 const stroke=field(sign,'링 테두리 색','censorSignStroke','color');
 for(const [input,key]of [[text,'text'],[gap,'gap'],[size,'fontSize'],[ink,'color'],[fill,'fill'],[strength,'strength'],[tracking,'tracking'],[band,'band'],[angle,'angle'],[warning,'warningText'],[noise,'strength'],[stroke,'stroke'],[offset,'bannerOffset'],[bottom,'gradientBottom']]){
  input.onfocus=()=>beginCensorDetail(key);input.onpointerdown=()=>{beginCensorDetail(key);if(input.type==='range')input.focus({preventScroll:true})};input.onkeydown=()=>{if(!censorDetailGesture)beginCensorDetail(key)};input.oninput=()=>changeCensorDetail(key,input.value);input.onchange=()=>{changeCensorDetail(key,input.value);censorDetailGesture=null};input.onblur=()=>{censorDetailGesture=null};
 }
 for(const [input,key]of [[mode,'style'],[shape,'shape'],[repeat,'repeat'],[reveal,'reveal']])input.onchange=()=>{beginCensorDetail(key);changeCensorDetail(key,input.value);censorDetailGesture=null};
 for(const [input,key]of [[palette,'ringPalette'],[gradient,'textGradient']]){input.onpointerdown=input.onfocus=()=>beginCensorDetail(key);input.onkeydown=()=>{if(!censorDetailGesture)beginCensorDetail(key)};input.onchange=()=>{changeCensorDetail(key,input.value);censorDetailGesture=null};input.onblur=()=>{censorDetailGesture=null}}
 const dialogs=document.createElement('div');dialogs.id='censorDialogFields';dialogs.className='censor-detail-fields';dialogs.hidden=true;
 for(const [key,title]of [['dialogTitle','제목'],['dialogSubtitle','보조 제목'],['dialogButton','버튼 문구'],['dialogFooter','하단 안내']]){const input=field(dialogs,title,'censorDialog'+key.slice(6),'textarea');input.rows=2;input.maxLength=500;input.onpointerdown=input.onfocus=()=>beginCensorDetail(key);input.onkeydown=()=>{if(!censorDetailGesture)beginCensorDetail(key)};input.oninput=()=>changeCensorDetail(key,input.value);input.onchange=()=>{changeCensorDetail(key,input.value);censorDetailGesture=null};input.onblur=()=>{censorDetailGesture=null}}
 popup.append(tape,effect,sign,dialogs);
}
function syncCensorDetails(b){
 if(!$('censorTapeFields')||!$('censorEffectFields'))return;const sign=typeof isCensorSign==='function'&&isCensorSign(b),ring=sign&&isCensorRing(b),tape=typeof isCensorTape==='function'&&isCensorTape(b)||sign,effect=typeof isBackdropCensor==='function'&&isBackdropCensor(b);
 $('censorTapeFields').hidden=!tape;$('censorEffectFields').hidden=!effect;$('censorSignFields').hidden=!sign;$('censorTapeGapLabel').hidden=$('censorTapeGapValue').hidden=!!sign;const dialog=sign&&!!censorInfo(b).dialog;$('censorDialogFields').hidden=!dialog;$('censorSignFields').hidden=!sign||dialog;
 $('censorTapeFillLabel').children[0].textContent=dialog?'바탕·금지표시 색':'띠 바탕색';$('censorTapeText').setAttribute('aria-label',dialog?'본문 문구':'반복할 문구');
 const set=(id,value)=>{if(document.activeElement!==$(id))$(id).value=value};
 if(tape){syncCensorFontOptions();set('censorTapeText',b.text);set('censorTapeFont',b.font);set('censorTapeGap',censorSetting(b,'gap'));set('censorTapeSize',b.fontSize);set('censorTapeInk',b.color);set('censorTapeFill',b.fill);$('censorTapeGapValue').textContent=censorSetting(b,'gap')+' px'}
 if(sign){$('censorSignStrokeLabel').children[0].textContent='링 테두리 색';$('censorSignTrackingLabel').hidden=false;const values={Tracking:censorSignSetting(b,'tracking'),Band:censorSignSetting(b,'band'),Angle:censorSignSetting(b,'angle'),Repeat:censorSignSetting(b,'repeat')?'fill':'single',Reveal:censorSignSetting(b,'reveal'),Warning:censorSignSetting(b,'warningText'),Offset:censorSignSetting(b,'bannerOffset'),Noise:censorSetting(b,'strength'),Stroke:b.stroke||'#f000bf'};for(const [name,value]of Object.entries(values))set('censorSign'+name,value);for(const name of ['Band','Angle','Repeat','Reveal','Stroke'])$('censorSign'+name+'Label').hidden=!ring;$('censorSignWarningLabel').hidden=$('censorSignOffsetLabel').hidden=$('censorSignResetText').hidden=censorInfo(b).style!=='chip';$('censorSignNoiseLabel').hidden=censorInfo(b).style!=='notice'}
 if(dialog){const defaults=censorInfo(b).defaults;for(const key of ['dialogTitle','dialogSubtitle','dialogButton','dialogFooter']){const id='censorDialog'+key.slice(6);$(id+'Label').hidden=!Object.hasOwn(defaults,key);set(id,censorDialogSetting(b,key))}$('censorSignFields').hidden=false;$('censorSignStrokeLabel').hidden=false;$('censorSignStrokeLabel').children[0].textContent='테두리·강조 색';for(const name of ['Tracking','Warning','Offset','ResetText']){const el=$('censorSign'+name+(name==='ResetText'?'':'Label'));el.hidden=true}$('censorSignNoiseLabel').hidden=censorInfo(b).style!=='glitch-dialog'}
 $('censorSignPaletteLabel').hidden=$('censorSignGradientLabel').hidden=!ring;$('censorSignBottomLabel').hidden=!ring||censorSignSetting(b,'textGradient')!=='vertical';$('censorTapeInkLabel').children[0].textContent=ring&&censorSignSetting(b,'textGradient')==='vertical'?'글자 위쪽 색':'글자·테두리 색';
 if(ring){set('censorSignPalette',censorRingPalette(b));set('censorSignGradient',censorSignSetting(b,'textGradient'));set('censorSignBottom',censorSignSetting(b,'gradientBottom'))}
 if(effect){$('censorCornerFit').textContent='모서리 맞춤 · '+(b.censorSettings?.cornerPoints===16?16:8)+'점';set('censorCornerPoints',b.censorSettings?.cornerPoints===16?16:8);$('censorCornerReset').disabled=projectBusy||!(b.warpCorners?.some(([x,y])=>x||y)||b.warpEdges?.some(([x,y])=>x||y)||b.censorSettings?.edgeQuarters?.some(([x,y])=>x||y));for(const [id,value]of [['censorScopeImage','image'],['censorScopeAll','all']])$(id).setAttribute('aria-pressed',String(censorSetting(b,'scope')===value));set('censorEffectMode',censorInfo(b).style);set('censorEffectShape',censorInfo(b).shape);set('censorEffectStrength',censorSetting(b,'strength'));$('censorEffectStrengthValue').textContent=censorSetting(b,'strength')+' / 100'}
}
function syncCensorPopover(){
 if(!censorPopup)return;const b=censorTarget(),changed=censorPopupTarget?.object!==b||censorPopupTarget?.document!==state;
 if(changed){censorPopupTarget=b?{object:b,document:state}:null;censorOpened=null;censorDismissed=null;censorOpacityGesture=null;censorDetailGesture=null}
 const mobile=censorMobileUI(),opened=censorOpened?.object===b&&censorOpened?.document===state;
 const transforming=typeof drag!=='undefined'&&drag||typeof objectRotationDrag!=='undefined'&&objectRotationDrag||typeof objectResizeDrag!=='undefined'&&objectResizeDrag||typeof viewGesture!=='undefined'&&viewGesture;
 const explicit=mobile||typeof isBackdropCensor==='function'&&isBackdropCensor(b);
 const hidden=!b||projectBusy||b.cornerMode||censorDismissed===b||explicit&&!opened||transforming||typeof warpMode!=='undefined'&&warpMode||typeof editTool!=='undefined'&&editTool!=='select'||!!document.querySelector('dialog[open]');
 censorPopup.hidden=!!hidden;if(hidden){if(!b||changed||projectBusy){censorOpacityGesture=null;censorDetailGesture=null}return}
 $('censorQuickTitle').textContent=referenceInfo(b.assetId).label;
 $('censorOpacity').value=Math.round((b.opacity??1)*100);$('censorOpacityValue').textContent=$('censorOpacity').value+'%';
 syncCensorDetails(b);
 const rect=canvas.getBoundingClientRect(),bounds=typeof rotatedBalloonBounds==='function'?rotatedBalloonBounds(b):{left:b.x,right:b.x+b.w,top:b.y,bottom:b.y+b.h};
 const screenH=window.visualViewport?.height||window.innerHeight,width=Math.min(310,window.innerWidth-24);censorPopup.style.width=width+'px';censorPopup.style.maxHeight=Math.max(120,screenH-24)+'px';const h=censorPopup.offsetHeight||108;
 const sx=rect.width?rect.width/state.width:zoom,sy=rect.height?rect.height/state.height:zoom;
 const left=rect.left+(bounds.left+bounds.right)/2*sx-width/2,below=rect.top+bounds.bottom*sy+12;
 censorPopup.style.left=Math.max(12,Math.min(window.innerWidth-width-12,left))+'px';
 censorPopup.style.top=Math.max(12,Math.min(screenH-h-12,below+h<=screenH-12?below:rect.top+bounds.top*sy-h-12))+'px';
}
function initCensorControls(){
 const popup=document.createElement('section');popup.id='censorQuickPopup';popup.className='censor-quick-popup';popup.hidden=true;popup.setAttribute('aria-label','검열 에셋 빠른 편집');
 const heading=document.createElement('div'),title=document.createElement('strong'),close=document.createElement('button');heading.className='censor-quick-heading';title.id='censorQuickTitle';close.type='button';close.textContent='×';close.setAttribute('aria-label','검열 빠른 조절 닫기');heading.append(title,close);
 const label=document.createElement('label'),text=document.createElement('span'),value=document.createElement('output'),range=document.createElement('input');text.textContent='불투명도';value.id='censorOpacityValue';range.id='censorOpacity';range.type='range';range.min='0';range.max='100';range.step='1';range.setAttribute('aria-label','검열 에셋 불투명도');label.append(text,value,range);const hint=document.createElement('small');hint.textContent='낮출수록 더 투명하게 보여요';popup.append(heading,label);initCensorDetailFields(popup);popup.append(hint);document.body.append(popup);censorPopup=popup;
 close.onclick=()=>{censorDismissed=censorTarget();censorOpened=null;censorOpacityGesture=null;censorDetailGesture=null;popup.hidden=true};
 range.onpointerdown=range.onfocus=beginCensorOpacity;range.onkeydown=()=>{if(!censorOpacityGesture)beginCensorOpacity()};range.oninput=changeCensorOpacity;
 for(const type of ['pointerup','pointercancel','change','blur'])range['on'+type]=()=>{censorOpacityGesture=null};
 popup.addEventListener('pointerdown',e=>e.stopPropagation());
 canvas.addEventListener('pointerdown',()=>{if(censorMobileUI()||typeof isBackdropCensor==='function'&&isBackdropCensor(censorTarget())){censorOpened=null;censorDetailGesture=null;syncCensorPopover()}},true);
 window.addEventListener('pointerup',()=>{censorOpacityGesture=null;syncCensorPopover()});window.addEventListener('pointercancel',()=>{censorOpacityGesture=null;syncCensorPopover()});
 window.addEventListener('resize',syncCensorPopover);window.visualViewport?.addEventListener('resize',syncCensorPopover);$('viewport').addEventListener('scroll',syncCensorPopover,{passive:true});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){censorDismissed=censorTarget();censorOpened=null;censorOpacityGesture=null;censorDetailGesture=null;syncCensorPopover()}});
 const before=render;render=function(){before();syncCensorPopover()};syncCensorPopover();
}
window.addEventListener('DOMContentLoaded',initCensorControls,{once:true});
