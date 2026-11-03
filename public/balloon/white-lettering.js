'use strict';
function beginWhiteLettering(e,p){
 const layer=orderedImageLayers().reverse().find(l=>imageLayerContains(l,p));
 if(layer&&!canAutoSelectImage(layer)){status('원본 이미지나 일반 이미지 레이어의 흰 말풍선에 사용해줘.');return true;}
 selected=null;retouchDrag={type:'whiteText',start:p,end:p,layer,document:state,pointer:e.pointerId};canvas.setPointerCapture(e.pointerId);sync();return true;
}
function drawWhiteLetteringPreview(c){const d=retouchDrag;if(d?.type!=='whiteText')return;const r=rectangle(d.start,d.end);c.save();if(d.layer?.panelId){panelPath(c,panelForLayer(d.layer));c.clip();}c.fillStyle='rgba(255,255,255,.8)';c.fillRect(r.x,r.y,r.w,r.h);c.strokeStyle='#177c69';c.lineWidth=1.5/zoom;c.setLineDash([5/zoom,4/zoom]);c.strokeRect(r.x,r.y,r.w,r.h);c.restore();}
function finishWhiteLettering(d){
 const r=rectangle(d.start,d.end);if(projectBusy||d.document!==state||r.w<3||r.h<3||d.layer&&!state.imageLayers.includes(d.layer)){render();return;}
 if(d.layer&&(d.layer.strokes||[]).length>=5000){status('지우기 기록은 이미지당 5,000개까지 가능해.');render();return;}
 checkpoint();if(d.layer){const points=[[r.x,r.y],[r.x+r.w,r.y],[r.x+r.w,r.y+r.h],[r.x,r.y+r.h]].map(([x,y])=>imageLayerPoint({x,y},d.layer));d.layer.strokes.push({whiteText:true,size:.01,points});invalidateImageLayer(d.layer.id);}else{state.masks??=[];state.masks.push({type:'rect',color:'#ffffff',...r});}
 if($('autoText').checked){add('text',null,false);Object.assign(current(),r,{padding:Math.min(8,r.w*.05,r.h*.05),text:'',tail:false});setTool('select');}
 sync();status('선택한 부분을 흰색으로 덮었어. Ctrl+Z로 되돌릴 수 있어.');
}
window.addEventListener('DOMContentLoaded',()=>{const button=document.createElement('button');button.id='toolWhiteText';button.type='button';button.textContent='흰 말풍선 글자 지우기';button.setAttribute('aria-pressed','false');$('toolRect').after(button);button.onclick=()=>{cancelRetouch();setTool('whiteText');if(typeof closeMobilePanel==='function')closeMobilePanel();if(typeof mobilePan!=='undefined')mobilePan=false;window.mobileMultiSelect=false;render();};},{once:true});
