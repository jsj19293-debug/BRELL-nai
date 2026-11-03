'use strict';
let lassoPoints=null,cloneSource=null,sourcePicking=false,clonePreview=false;
let cleanupCache=null,cleanupKey='',cleanupBackground=null;
function polygonPath(points,dx=0,dy=0){const p=new Path2D();points.forEach((v,i)=>i?p.lineTo(v.x+dx,v.y+dy):p.moveTo(v.x+dx,v.y+dy));p.closePath();return p}
function lassoBounds(points){const xs=points.map(p=>p.x),ys=points.map(p=>p.y),x=Math.floor(Math.min(...xs)),y=Math.floor(Math.min(...ys));return {x,y,w:Math.ceil(Math.max(...xs))-x,h:Math.ceil(Math.max(...ys))-y}}
function cloneMask(){if(!lassoPoints||!cloneSource)return null;const r=lassoBounds(lassoPoints);return {type:'clone',points:structuredClone(lassoPoints),dx:Math.round(cloneSource.x-(r.x+r.w/2)),dy:Math.round(cloneSource.y-(r.y+r.h/2)),feather:Math.max(0,Math.min(12,Number($('cloneFeather').value)||0))}}
function validCloneSource(m){const r=lassoBounds(m.points);return r.x+m.dx>=0&&r.y+m.dy>=0&&r.x+r.w+m.dx<=state.width&&r.y+r.h+m.dy<=state.height}
function newPatchCanvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c}
function paintClone(c,m,source=c.canvas){
 const r=lassoBounds(m.points);if(!r.w||!r.h)return;
 const patch=newPatchCanvas(r.w,r.h),g=patch.getContext('2d');
 // Copy before painting, so overlapping source/destination never feeds back.
 g.drawImage(source,r.x+m.dx,r.y+m.dy,r.w,r.h,0,0,r.w,r.h);
 const mask=newPatchCanvas(r.w,r.h),a=mask.getContext('2d'),path=polygonPath(m.points,-r.x,-r.y);
 a.fillStyle='#fff';a.fill(path);
 const feather=Math.min(m.feather,r.w/6,r.h/6);if(feather){a.globalCompositeOperation='destination-out';a.lineWidth=feather*2;a.strokeStyle='#fff';a.stroke(path);const softened=newPatchCanvas(r.w,r.h),s=softened.getContext('2d');s.filter=`blur(${feather/2}px)`;s.drawImage(mask,0,0);a.globalCompositeOperation='copy';a.drawImage(softened,0,0)}
 g.globalCompositeOperation='destination-in';g.drawImage(mask,0,0);
 c.save();c.clip(polygonPath(m.points));c.drawImage(patch,r.x,r.y);c.restore();
}
function cleanupSurface(){const key=JSON.stringify([state.width,state.height,state.masks,state.aiPatches]);if(cleanupCache&&cleanupKey===key&&cleanupBackground===bg)return cleanupCache;
 const out=newPatchCanvas(state.width,state.height),c=out.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,state.width,state.height);if(bg)c.drawImage(bg,0,0,state.width,state.height);
 if(typeof drawRetouchRecords==='function')drawRetouchRecords(c,state);else for(const m of state.masks||[])m.type==='clone'?paintClone(c,m):drawPatch(c,m);
 cleanupCache=out;cleanupKey=key;cleanupBackground=bg;return out;
}
function clearLasso(){lassoPoints=null;cloneSource=null;sourcePicking=false;clonePreview=false;syncCloneControls()}
function syncCloneControls(){const ready=!!lassoPoints,m=cloneMask(),valid=!!m&&validCloneSource(m);$('pickCloneSource').disabled=!ready;$('fillLassoColor').disabled=!ready;$('clearLasso').disabled=!ready;$('previewClone').disabled=!valid;$('applyClone').disabled=!valid;$('previewClone').textContent=clonePreview?'미리보기 끄기':'미리보기';$('cloneHint').textContent=!ready?'① 올가미로 글자 주변을 드래그하세요.':!m?'② Alt+클릭 또는 「복사 위치 지정」으로 깨끗한 바탕의 중심을 찍으세요.':!valid?'복사 범위가 이미지 밖입니다. 주황색 영역이 이미지 안에 오도록 다시 찍으세요.':'③ 주황색 영역을 복사합니다. 미리보기 확인 후 「복제 채우기」를 누르세요.'}
function beginLasso(e,p){if(e.altKey||sourcePicking){if(!lassoPoints){status('먼저 올가미로 영역을 선택하세요.');return}cloneSource=p;sourcePicking=false;clonePreview=false;syncCloneControls();render();return}clearLasso();retouchDrag={type:'lasso',points:[p]};selected=null;canvas.setPointerCapture(e.pointerId);sync()}
function finishLasso(d){if(d.points.length<3){clearLasso();render();return}const r=lassoBounds(d.points);if(r.w<3||r.h<3){clearLasso();render();return}lassoPoints=d.points;cloneSource=null;syncCloneControls();render();status('영역을 선택했습니다. Alt+클릭으로 복사할 바탕의 중심을 찍으세요.')}
function drawCloneOverlay(c){if(editTool!=='lasso')return;const points=retouchDrag?.type==='lasso'?retouchDrag.points:lassoPoints;if(!points?.length)return;
 const m=cloneMask();
 c.save();c.lineWidth=1.5/zoom;c.setLineDash([5/zoom,4/zoom]);c.strokeStyle='#177c69';c.stroke(polygonPath(points));if(m){c.strokeStyle=validCloneSource(m)?'#ed982f':'#dc3545';c.stroke(polygonPath(points,m.dx,m.dy));c.setLineDash([]);c.beginPath();c.moveTo(cloneSource.x-8/zoom,cloneSource.y);c.lineTo(cloneSource.x+8/zoom,cloneSource.y);c.moveTo(cloneSource.x,cloneSource.y-8/zoom);c.lineTo(cloneSource.x,cloneSource.y+8/zoom);c.stroke()}c.restore();
}
function applyLassoFill(clone){const m=clone?cloneMask():lassoPoints?{type:'polygon',points:structuredClone(lassoPoints),color:$('eraseColor').value}:null;if(!m||clone&&!validCloneSource(m))return;checkpoint();state.masks??=[];state.masks.push(m);clearLasso();sync();status(clone?'선택 영역을 복제해 채웠습니다. Ctrl+Z로 되돌릴 수 있습니다.':'올가미 안을 지정색으로 채웠습니다.')}
function validateSelectionPatch(m,d){if(!Array.isArray(m.points)||m.points.length<3||m.points.length>30000||m.points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>d.width||p.y>d.height))throw Error('올가미 영역이 올바르지 않습니다.');if(m.type==='clone'){const r=lassoBounds(m.points);if(!['dx','dy','feather'].every(k=>Number.isFinite(m[k]))||m.feather<0||m.feather>12||r.x+m.dx<0||r.y+m.dy<0||r.x+r.w+m.dx>d.width||r.y+r.h+m.dy>d.height)throw Error('복제 영역이 올바르지 않습니다.')}else if(!/^#[a-f\d]{6}$/i.test(m.color))throw Error('채우기 색상이 올바르지 않습니다.')}
function initCloneFill(){$('toolLasso').onclick=()=>{cancelRetouch();setTool('lasso');syncCloneControls();render()};$('pickCloneSource').onclick=()=>{sourcePicking=true;status('가져올 깨끗한 바탕의 중심을 클릭하세요.')};$('clearLasso').onclick=()=>{clearLasso();render()};$('previewClone').onclick=()=>{clonePreview=!clonePreview;syncCloneControls();render()};$('cloneFeather').oninput=()=>{syncCloneControls();render()};$('applyClone').onclick=()=>applyLassoFill(true);$('fillLassoColor').onclick=()=>applyLassoFill(false);syncCloneControls()}

function drawClonePreview(c){const m=cloneMask();if(editTool==='lasso'&&clonePreview&&m&&validCloneSource(m))paintClone(c,m,cleanupSurface())}
