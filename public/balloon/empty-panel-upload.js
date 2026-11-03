'use strict';
// Use native mouse double-click and a movement-limited touch double-tap.
let emptyPanelTap=null,emptyPanelDown=null,emptyPanelOpenedAt=-Infinity;
const emptyPanelPointers=new Set();
function resetEmptyPanelTouch(){emptyPanelPointers.clear();emptyPanelDown=null;emptyPanelTap=null;}
window.addEventListener('blur',resetEmptyPanelTouch);
document.addEventListener('visibilitychange',()=>{if(document.hidden)resetEmptyPanelTouch()});
function emptyPanelAtEvent(e){
 if(typeof panelBoundaryEditMode!=='undefined'&&panelBoundaryEditMode)return null;
 if(projectBusy||editTool!=='select'||e.shiftKey||window.mobileMultiSelect||mobilePan||phoneFitArmed||imageLayerEraser||socialOcclusionMode||polaroidTool||protrusionMode)return null;
 const point=pos(e),panel=panelAt(point);if(!panel)return null;
 if(state.items.some(b=>hitWarpedBalloon(b,point)))return null;
 if((state.imageLayers||[]).some(l=>l.panelId===panel.id))return null;
 if(orderedImageLayers().some(l=>l.visible!==false&&imageLayerContains(l,point)))return null;
 return panel;
}
function openEmptyPanelPhoto(panel){
 if(projectBusy||!state.panels.includes(panel)||(state.imageLayers||[]).some(l=>l.panelId===panel.id))return false;
 selectedPanel=panel.id;selected=null;imageLayerSelected=null;panelDrag=null;drag=null;sync();emptyPanelOpenedAt=performance.now();$('panelImageFile').click();emptyPanelTap=null;return true;
}
canvas.addEventListener('dblclick',e=>{if(e.pointerType==='touch'||performance.now()-emptyPanelOpenedAt<500)return;const panel=emptyPanelAtEvent(e);if(panel){e.preventDefault();e.stopImmediatePropagation();openEmptyPanelPhoto(panel)}},true);
canvas.addEventListener('pointerdown',e=>{
 if(e.button!==0)return;emptyPanelPointers.add(e.pointerId);
 if(emptyPanelPointers.size>1){emptyPanelDown=null;emptyPanelTap=null;return;}
 const panel=emptyPanelAtEvent(e);emptyPanelDown=panel?{panel,document:state,id:e.pointerId,x:e.clientX,y:e.clientY,time:performance.now()}:null;
 // Keep the selected photo's inspector from collapsing and moving the canvas
 // between down and up. Panel editing still owns its drag gestures.
 if(panel&&!panelEditMode&&(e.pointerType==='touch'||e.pointerType==='pen')){e.preventDefault();e.stopImmediatePropagation();canvas.setPointerCapture(e.pointerId);}
},true);
canvas.addEventListener('pointermove',e=>{const d=emptyPanelDown;if(d&&d.id===e.pointerId&&Math.hypot(e.clientX-d.x,e.clientY-d.y)>8){emptyPanelDown=null;emptyPanelTap=null}},true);
canvas.addEventListener('pointercancel',e=>{emptyPanelPointers.delete(e.pointerId);emptyPanelDown=null;emptyPanelTap=null},true);
canvas.addEventListener('pointerup',e=>{
 emptyPanelPointers.delete(e.pointerId);const d=emptyPanelDown;emptyPanelDown=null;
 if(!d||d.id!==e.pointerId||d.document!==state||performance.now()-d.time>500||Math.hypot(e.clientX-d.x,e.clientY-d.y)>8)return;
 const panel=emptyPanelAtEvent(e);if(panel!==d.panel)return;
 if(e.pointerType!=='touch'&&e.pointerType!=='pen')return;
 const now=performance.now(),last=emptyPanelTap;
 if(last&&last.document===state&&last.panel===panel&&now-last.time<=350&&Math.hypot(e.clientX-last.x,e.clientY-last.y)<=24){e.preventDefault();e.stopImmediatePropagation();panelDrag=null;drag=null;openEmptyPanelPhoto(panel);return;}
 emptyPanelTap={document:state,panel,time:now,x:e.clientX,y:e.clientY};selectedPanel=panel.id;sync();
},true);
