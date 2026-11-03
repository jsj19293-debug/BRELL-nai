'use strict';
// Responsive controls use the same editor state and project format as desktop.
const mobileMedia=matchMedia('(max-width: 800px)');
let mobilePanel=null,mobilePan=false;
window.mobileMultiSelect=false;
const mobilePanelNames={image:'이미지 · 프로젝트',balloons:'말풍선',text:'대사 · 스타일',assets:'에셋',tools:'식자 · 레이어'};
function closeMobilePanel(){mobilePanel=null;document.body.removeAttribute('data-mobile-panel');for(const b of document.querySelectorAll('[data-mobile-tab]'))b.setAttribute('aria-expanded','false');}
function openMobilePanel(name,focusHeading=true){if(!mobileMedia.matches||projectBusy)return;if(mobilePanel===name){closeMobilePanel();return}mobilePanel=name;document.body.dataset.mobilePanel=name;$('mobileLeftTitle').textContent=mobilePanelNames[name];for(const b of document.querySelectorAll('[data-mobile-tab]'))b.setAttribute('aria-expanded',String(b.dataset.mobileTab===name));for(const section of document.querySelectorAll('[data-mobile-section]'))section.classList.toggle('mobile-section-active',section.dataset.mobileSection.split(' ').includes(name));if(name==='assets'){balloonCategory='stickers';drawBalloonChoices()}else if(name==='balloons'&&['stickers','references'].includes(balloonCategory)){balloonCategory='thin';drawBalloonChoices()}const panel=name==='text'?$('mobileRightPanel'):$('mobileLeftPanel');panel.scrollTop=0;if(focusHeading)panel.querySelector('[data-close-mobile]').focus({preventScroll:true});}
for(const b of document.querySelectorAll('[data-mobile-tab]'))b.onclick=()=>openMobilePanel(b.dataset.mobileTab);
for(const b of document.querySelectorAll('[data-close-mobile]'))b.onclick=()=>{const name=mobilePanel;closeMobilePanel();document.querySelector(`[data-mobile-tab="${name}"]`)?.focus({preventScroll:true})};
window.syncMobileUI=()=>{if(!mobileMedia.matches)return;const chosen=chosenBalloons();$('mobileConnect').disabled=typeof connectionActionState==='function'?!connectionActionState(chosen).canOpen:projectBusy||chosen.length<2;$('mobileConnect').textContent='연결';$('mobileDisconnect').disabled=projectBusy||!chosen.some(b=>b.balloonGroup||b.objectGroup);$('mobileDisconnect').textContent=typeof disconnectionUsesObjectGroup==='function'&&disconnectionUsesObjectGroup(chosen)?'그룹 해제':'연결 해제';$('mobileDuplicate').disabled=projectBusy||!(current()||currentImageLayer());const frame=panelDeleteTarget();$('mobileDelete').disabled=projectBusy||!(current()||currentImageLayer()||frame);$('mobileDelete').textContent=frame?'컷 삭제':'삭제';$('mobilePan').textContent=window.mobileMultiSelect?'선택 이동':'이동';$('mobilePan').setAttribute('aria-label',window.mobileMultiSelect?'다중 선택한 요소 함께 이동':'화면 이동');$('mobilePan').setAttribute('aria-pressed',String(mobilePan));$('mobileMulti').setAttribute('aria-pressed',String(window.mobileMultiSelect));};
$('mobilePan').onclick=()=>{if(projectBusy)return;mobilePan=!mobilePan;cancelMultiMove();cancelRetouch();drag=null;setTool('select');closeMobilePanel();render();status(mobilePan?(window.mobileMultiSelect?'선택한 요소를 끌어 함께 이동 · 빈 곳은 화면 이동 · 두 손가락 확대·축소':'한 손가락으로 화면 이동 · 두 손가락으로 확대·축소'):'말풍선을 터치해 선택하거나 끌어 이동하세요.')};
$('mobileMulti').onclick=()=>{if(projectBusy)return;cancelMultiMove();window.mobileMultiSelect=!window.mobileMultiSelect;mobilePan=false;cancelRetouch();drag=null;setTool('select');closeMobilePanel();render();status(window.mobileMultiSelect?'요소를 하나씩 터치해 선택한 뒤 선택 이동을 켜고 끌어주세요. 연결도 가능해요.':'다중 선택을 종료했습니다.')};
for(const [source,target]of [['mobileConnect','connectBalloons'],['mobileDisconnect','disconnectBalloons'],['mobileDuplicate','duplicate'],['mobileDelete','delete']])$(source).onclick=()=>{if(target==='connectBalloons'){if(!projectBusy&&typeof toggleConnectionActions==='function')toggleConnectionActions($(source));return;}if(!projectBusy)$(currentImageLayer()&&target==='delete'?'deleteImageLayer':currentImageLayer()&&target==='duplicate'?'duplicateImageLayer':target).click()};
// Close the sheet once a canvas tool or preset is chosen, leaving the canvas ready.
document.querySelector('.left').addEventListener('click',e=>{if(!mobileMedia.matches)return;const b=e.target.closest('button');if(!b)return;if(b.closest('#types')||['addTextOnly','expressionSoft','expressionStrong','toolSelect','toolWhiteText','toolRect','toolBrush','toolPicker','toolLasso','pickCloneSource','addImageLayer','addPostCard','addPostFrame','addInstagramCard','addInstagramFrame','panelEdit'].includes(b.id)){closeMobilePanel();mobilePan=false;window.mobileMultiSelect=false;window.syncMobileUI()}});
$('layers').addEventListener('click',e=>{if(!e.target.closest('.layer-eye')&&mobileMedia.matches&&!window.mobileMultiSelect)closeMobilePanel()});
// Open the lettering sheet for canvas double-tap and tool-created text fields.
const desktopDoubleClick=canvas.ondblclick;
canvas.ondblclick=e=>{if(mobileMedia.matches&&current()){if(mobilePanel!=='text')openMobilePanel('text',false);$('text').focus()}else desktopDoubleClick?.(e)};
document.addEventListener('focusin',e=>{if(mobileMedia.matches&&e.target===$('text')&&mobilePanel!=='text')openMobilePanel('text',false)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mobilePanel){closeMobilePanel();e.preventDefault()}});
// Multi-selection movement is separate from viewport panning and document data.
let multiMove=null;
function cancelMultiMove(){
 if(multiMove?.document===state&&multiMove.recorded)for(const start of multiMove.items){const b=state.items.find(b=>b.id===start.id);if(b)Object.assign(b,{x:start.x,y:start.y});}
 multiMove=null;
}
function beginMultiMove(e){
 if(typeof panelBoundaryEditMode!=='undefined'&&panelBoundaryEditMode)return false;
 if(projectBusy||editTool!=='select'||e.button!==0||e.shiftKey||e.target!==canvas)return false;
 if(typeof phoneFitArmed!=='undefined'&&phoneFitArmed||typeof imageLayerEraser!=='undefined'&&imageLayerEraser||typeof socialOcclusionMode!=='undefined'&&socialOcclusionMode||typeof protrusionMode!=='undefined'&&protrusionMode)return false;
 const p=pos(e),hit=[...state.items].reverse().find(b=>hitWarpedBalloon(b,p)),persistent=hit?.objectGroup&&typeof objectGroupMembers==='function'&&objectGroupMembers(hit).length>1;
 if(mobileMedia.matches&&(!mobilePan||!window.mobileMultiSelect)&&(!persistent||window.mobileMultiSelect))return false;
 if(persistent&&!chosenBalloons().some(b=>b===hit))pickBalloon(hit.id,false);
 const items=chosenBalloons();if((mobileMedia.matches?items.length<1:items.length<2)||!items.some(b=>b===hit))return false;
 multiMove={document:state,pointer:e.pointerId,p,zoom,items:items.map(b=>({id:b.id,x:b.x,y:b.y,w:b.w,h:b.h})),recorded:false};
 if(typeof resetMiniEditGesture==='function')resetMiniEditGesture();
 e.preventDefault();e.stopImmediatePropagation();viewport.setPointerCapture(e.pointerId);return true;
}
function moveMultiMove(e){
 if(!multiMove||multiMove.pointer!==e.pointerId)return false;
 e.preventDefault();e.stopImmediatePropagation();const g=multiMove;
 if(g.document!==state||projectBusy){cancelMultiMove();return true;}
 const p=pos(e);let dx=p.x-g.p.x,dy=p.y-g.p.y;
 if(!g.recorded&&Math.hypot(dx,dy)*g.zoom<4)return true;
 // One shared translation keeps the spacing even at the canvas edge.
 const minX=Math.max(...g.items.map(b=>-b.w+20-b.x)),maxX=Math.min(...g.items.map(b=>state.width-20-b.x)),minY=Math.max(...g.items.map(b=>-b.h+20-b.y)),maxY=Math.min(...g.items.map(b=>state.height-20-b.y));
 dx=Math.max(Math.min(0,minX),Math.min(Math.max(0,maxX),dx));dy=Math.max(Math.min(0,minY),Math.min(Math.max(0,maxY),dy));
 if(!g.recorded){if(!dx&&!dy)return true;checkpoint();g.recorded=true;}
 for(const start of g.items){const b=state.items.find(b=>b.id===start.id);if(b)Object.assign(b,{x:start.x+dx,y:start.y+dy});}
 render();return true;
}
function finishMultiMove(e){
 if(!multiMove||multiMove.pointer!==e.pointerId)return false;
 if(e.type==='pointercancel')cancelMultiMove();else{moveMultiMove(e);multiMove=null;}
 e.preventDefault();e.stopImmediatePropagation();sync();return true;
}
const touchPoints=new Map();let viewGesture=null,panStart=null,suppressTouches=false;
const viewport=$('viewport');
function resetMobileTouch(){cancelMultiMove();render();touchPoints.clear();viewGesture=null;panStart=null;suppressTouches=false;}
window.addEventListener('blur',resetMobileTouch);
document.addEventListener('visibilitychange',()=>{if(document.hidden)resetMobileTouch()});
function touchPair(){const [a,b]=[...touchPoints.values()];return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))}}
function cancelCanvasTouch(){if(typeof cancelPanelBoundaryDrag==='function')cancelPanelBoundaryDrag();cancelMultiMove();cancelBadStatusGesture();cancelNikkeConsultPointer();cancelPixelRpgPointer();cancelMessengerTap();cancelTextCorner();cancelNikkeDiaryPointer();cancelObjectRotation();if(typeof cancelObjectResize==='function')cancelObjectResize();cancelStampPointer();if(drag?.recorded&&current())Object.assign(current(),drag.start);drag=null;cancelRetouch();render()}
function beginViewGesture(){cancelCanvasTouch();if(typeof resetMiniEditGesture==='function')resetMiniEditGesture();const m=touchPair(),rect=canvas.getBoundingClientRect();const anchor={x:(m.x-rect.left)/zoom,y:(m.y-rect.top)/zoom},layer=(typeof scrollZoomEnabled==='undefined'||scrollZoomEnabled)&&!mobilePan&&panelPhotoAt(anchor);imageLayerDrag=null;panelDrag=null;emptyPhotoPress=null;if(typeof emptyPanelTap!=='undefined')emptyPanelTap=null;viewGesture=layer?{distance:m.d,photo:panelPhotoZoomStart(layer,anchor)}:{distance:m.d,zoom,x:anchor.x,y:anchor.y};panStart=null;suppressTouches=true;}
viewport.addEventListener('pointerdown',e=>{if(e.target.closest('button')||projectBusy)return;if(!mobileMedia.matches||e.pointerType!=='touch'){beginMultiMove(e);return;}touchPoints.set(e.pointerId,{x:e.clientX,y:e.clientY});if(touchPoints.size>=2){e.preventDefault();e.stopImmediatePropagation();viewport.setPointerCapture(e.pointerId);beginViewGesture()}else if(beginMultiMove(e)){return;}else if(mobilePan){e.preventDefault();e.stopImmediatePropagation();viewport.setPointerCapture(e.pointerId);panStart={x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};suppressTouches=true;}},true);
viewport.addEventListener('pointermove',e=>{if(touchPoints.has(e.pointerId))touchPoints.set(e.pointerId,{x:e.clientX,y:e.clientY});if(moveMultiMove(e))return;if(!touchPoints.has(e.pointerId))return;if(!suppressTouches)return;e.preventDefault();e.stopImmediatePropagation();if(viewGesture&&touchPoints.size>=2){const m=touchPair();if(viewGesture.photo){const rect=canvas.getBoundingClientRect();zoomPanelPhoto(viewGesture.photo,m.d/viewGesture.distance,{x:(m.x-rect.left)/zoom,y:(m.y-rect.top)/zoom});return;}zoom=Math.max(.05,Math.min(3,viewGesture.zoom*m.d/viewGesture.distance));size();const rect=canvas.getBoundingClientRect();viewport.scrollLeft+=rect.left+viewGesture.x*zoom-m.x;viewport.scrollTop+=rect.top+viewGesture.y*zoom-m.y;}else if(panStart){viewport.scrollLeft=panStart.left+panStart.x-e.clientX;viewport.scrollTop=panStart.top+panStart.y-e.clientY;}},true);
function finishMobileTouch(e){const moved=finishMultiMove(e);if(!touchPoints.has(e.pointerId))return;touchPoints.delete(e.pointerId);if(moved&&!touchPoints.size){viewGesture=null;panStart=null;suppressTouches=false;return;}if(suppressTouches){e.preventDefault();e.stopImmediatePropagation();drag=null;}if(touchPoints.size<2){if(viewGesture?.photo)syncPanels();viewGesture=null;}if(!touchPoints.size){viewGesture=null;panStart=null;suppressTouches=false;}}
viewport.addEventListener('pointerup',finishMobileTouch,true);viewport.addEventListener('pointercancel',finishMobileTouch,true);
function refreshMobileLayout(){closeMobilePanel();mobilePan=false;window.mobileMultiSelect=false;touchPoints.clear();viewGesture=null;panStart=null;suppressTouches=false;cancelCanvasTouch();requestAnimationFrame(()=>{fit();window.syncMobileUI()});}
mobileMedia.addEventListener('change',refreshMobileLayout);
window.addEventListener('orientationchange',()=>{closeMobilePanel();setTimeout(()=>{fit()},150)});
if(mobileMedia.matches){requestAnimationFrame(()=>{fit();window.syncMobileUI();status('하단 메뉴에서 시작하세요. 두 손가락 확대·이동, 다중 선택으로 말풍선 연결.');});}

function sizeMobileKeyboard(){const view=window.visualViewport;if(!view)return;const inset=Math.max(0,window.innerHeight-view.height-view.offsetTop);document.documentElement.style.setProperty('--mobile-keyboard-inset',inset+'px');document.documentElement.style.setProperty('--mobile-visible-height',view.height+'px');}
window.visualViewport?.addEventListener('resize',sizeMobileKeyboard);
window.visualViewport?.addEventListener('scroll',sizeMobileKeyboard);
sizeMobileKeyboard();
