'use strict';
let panelWheelHistory=null;
// Editor preference only: never stored in a page or its undo history.
let scrollZoomEnabled=true;
try{scrollZoomEnabled=localStorage.getItem('studio.scrollZoom')!=='off';}catch{}
function syncScrollZoom(){
 for(const id of ['scrollZoomToggle','mobileScrollZoomToggle']){
  const button=$(id);if(!button)continue;
  button.textContent=`${id==='scrollZoomToggle'?'스크롤 줌':'사진 확대'} ${scrollZoomEnabled?'ON':'OFF'}`;
  button.setAttribute('aria-pressed',String(scrollZoomEnabled));
  button.title=scrollZoomEnabled?'컷 안 사진을 휠·두 손가락으로 확대·축소합니다. 누르면 잠급니다.':'컷 사진 확대 잠금 · 화면 스크롤과 캔버스 전체 확대·축소는 가능합니다.';
 }
}
function toggleScrollZoom(){
 scrollZoomEnabled=!scrollZoomEnabled;panelWheelHistory=null;
 try{localStorage.setItem('studio.scrollZoom',scrollZoomEnabled?'on':'off');}catch{}
 syncScrollZoom();
}
function initScrollZoom(){
 for(const id of ['scrollZoomToggle','mobileScrollZoomToggle']){const button=$(id);if(button)button.onclick=toggleScrollZoom;}
 syncScrollZoom();
}
if(typeof document!=='undefined')initScrollZoom();
function panelPhotoAt(p){
 if(typeof panelBoundaryEditMode!=='undefined'&&panelBoundaryEditMode)return null;
 if(projectBusy||editTool!=='select'||window.mobileMultiSelect||imageLayerEraser||socialOcclusionMode||protrusionMode||phoneFitArmed)return null;
 if(state.items.some(b=>hitWarpedBalloon(b,p)))return null;
 const layer=orderedImageLayers().reverse().find(l=>l.visible!==false&&imageLayerContains(l,p));
 return layer?.panelId&&layer.src&&!layer.kind&&imageLayerImages.has(layer.id)?layer:null;
}
function panelPhotoZoomStart(l,anchor){
 constrainPanelPhoto(l);return{id:l.id,document:state,x:l.x,y:l.y,w:l.w,h:l.h,anchor,u:(anchor.x-l.x)/l.w,v:(anchor.y-l.y)/l.h,recorded:false};
}
function zoomPanelPhoto(gesture,factor,anchor=gesture.anchor){
 if(!scrollZoomEnabled||projectBusy||gesture.document!==state)return false;
 const l=state.imageLayers.find(l=>l.id===gesture.id),p=l&&panelForLayer(l);if(!p)return false;
 const image=imageLayerImages.get(l.id);if(!image)return false;
 const cover=Math.max(p.w/image.width,p.h/image.height),minW=image.width*cover,maxW=minW*3,w=Math.max(minW,Math.min(maxW,gesture.w*factor)),h=w*gesture.h/gesture.w;
 const proposed={...l,w,h,x:anchor.x-gesture.u*w,y:anchor.y-gesture.v*h};constrainPanelPhoto(proposed);
 if(Math.abs(proposed.w-l.w)<.001&&Math.abs(proposed.x-l.x)<.001&&Math.abs(proposed.y-l.y)<.001)return true;
 if(!gesture.recorded){checkpoint();gesture.recorded=true;}
 Object.assign(l,{x:proposed.x,y:proposed.y,w:proposed.w,h:proposed.h,panelZoom:proposed.panelZoom});imageLayerSelected=l.id;selected=null;selectedPanel=p.id;render();return true;
}
canvas.addEventListener('wheel',e=>{
 if(!scrollZoomEnabled)return;
 if(e.ctrlKey||e.metaKey||e.altKey||e.shiftKey||!e.deltaY)return;
 const anchor=pos(e),l=panelPhotoAt(anchor);if(!l)return;
 e.preventDefault();e.stopImmediatePropagation();const now=performance.now(),gesture=panelPhotoZoomStart(l,anchor);
 if(panelWheelHistory?.document===state&&panelWheelHistory.id===l.id&&now-panelWheelHistory.time<350)gesture.recorded=true;
 const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?400:1);zoomPanelPhoto(gesture,Math.exp(Math.max(-.4,Math.min(.4,-delta*.002))));
 panelWheelHistory=gesture.recorded?{document:state,id:l.id,time:now}:null;syncPanels();
},{passive:false});
