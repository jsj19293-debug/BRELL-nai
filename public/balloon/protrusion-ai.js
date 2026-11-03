'use strict';
const protrusionMasks=new Map();let protrusionAIWorker=null,protrusionAIJob=null;
function cancelProtrusionAI(){if(protrusionAIJob?.timeout)clearTimeout(protrusionAIJob.timeout);$('protrusionAIDialog')?.close();if(protrusionAIWorker)protrusionAIWorker.terminate();protrusionAIWorker=null;protrusionAIJob=null;setProjectBusy(false);$('panelAutoSelect').textContent='캐릭터 자동 선택 · 시험';$('panelAutoCancel').hidden=true;status('자동 선택을 취소했어.');}
async function autoSelectProtrusion(mode='protrusion'){
 const l=mode==='image'?currentImageLayer():protrusionLayer();if(mode==='image'&&(!canAutoSelectImage(l)||(l.eraseSelections||[]).length>=20)){status('자동 선택은 이미지당 20번까지 가능해.');return;}if(projectBusy||!l?.src)return;const doc=state,id=l.id;
 setProjectBusy(true);$('panelAutoCancel').hidden=false;$('panelAutoCancel').disabled=false;$('panelAutoSelect').textContent='자동 선택 중…';status('캐릭터 자동 선택 준비 중…');
 try{
  protrusionAIWorker??=new Worker('protrusion-ai-worker.js',{type:'module'});protrusionAIJob={doc,id};
  $('protrusionAIDialog').showModal();const timeout=setTimeout(()=>{if(protrusionAIJob?.id===id){cancelProtrusionAI();status('처리가 오래 걸려 중단했어. 다시 시도하거나 브러시로 선택해줘.');}},180000);
  protrusionAIJob.timeout=timeout;protrusionAIWorker.onmessage=async({data})=>{
   if(data.type==='progress'){status(data.text);$('panelAIStatus').textContent=data.text;$('protrusionAIProgress').textContent=data.text;return;}
   clearTimeout(timeout);const job=protrusionAIJob;protrusionAIJob=null;
   try{
    if(data.type==='error')throw Error(data.text);if(!job||job.doc!==state||!state.imageLayers.some(x=>x.id===id))return;
    const mask=document.createElement('canvas');mask.width=data.width;mask.height=data.height;mask.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.pixels),data.width,data.height),0,0);
    if(mode==='image'){checkpoint();const src=mask.toDataURL('image/png');l.eraseSelections??=[];l.eraseSelections.push(src);l.eraseSelection=l.eraseSelections.length-1;l.eraseOutside=true;imageEraseSelections.set(src,mask);selected=null;imageLayerSelected=id;if(protrusionMode)setProtrusionMode(null);panelEditMode=false;imageLayerEraser=true;setTool('select');canvas.style.cursor='crosshair';if(typeof closeMobilePanel==='function')closeMobilePanel();status('캐릭터 자동 선택 완료. 이미지 지우개로 바깥 배경만 지워줘.');return;}
    checkpoint();l.protrusionMask=mask.toDataURL('image/png');l.protrusions=[];protrusionMasks.set(l.protrusionMask,mask);
    selectedPanel=l.panelId;panelEditMode=false;imageLayerSelected=null;setTool('select');setProtrusionMode('paint');
    $('panelAIStatus').textContent='분석 '+data.seconds.toFixed(1)+'초 · 브러시·지우개로 다듬어주세요.';status('자동 선택 완료 · '+data.seconds.toFixed(1)+'초. 브러시·지우개로 다듬어줘.');
   }catch(error){$('panelAIStatus').textContent='자동 선택 실패 · 브러시로 계속 편집할 수 있어요.';status(error.message);protrusionAIWorker?.terminate();protrusionAIWorker=null;}
   finally{$('protrusionAIDialog').close();setProjectBusy(false);$('panelAutoCancel').hidden=true;$('panelAutoSelect').textContent='캐릭터 자동 선택 · 시험';sync();}
  };
  protrusionAIWorker.onerror=()=>{clearTimeout(timeout);cancelProtrusionAI();$('panelAIStatus').textContent='자동 선택을 불러오지 못했어요. 인터넷 연결을 확인해주세요.';};
  protrusionAIWorker.postMessage({src:l.src});
 }catch(error){cancelProtrusionAI();status(error.message||'자동 선택을 시작하지 못했어.');}
}
function drawProtrusionGuide(c){
 if(!protrusionMode||projectBusy)return;const l=protrusionLayer(),p=l&&panelForLayer(l),bitmap=l&&layerBitmap(l);if(!p||!bitmap)return;
 c.save();c.beginPath();c.rect(0,0,state.width,state.height);const vertices=panelVertices(p);vertices.forEach(([u,v],i)=>i?c.lineTo(p.x+u*p.w,p.y+v*p.h):c.moveTo(p.x+u*p.w,p.y+v*p.h));c.closePath();c.clip('evenodd');c.globalAlpha=.3;c.drawImage(bitmap,l.x,l.y,l.w,l.h);c.restore();
}
function drawMaskedProtrusion(c,l,bitmap){
 const ratio=bitmap.width/bitmap.height,w=Math.min(1600,bitmap.width),h=Math.max(1,Math.round(w/ratio)),out=document.createElement('canvas');out.width=w;out.height=h;const g=out.getContext('2d'),mask=protrusionMasks.get(l.protrusionMask);if(mask)g.drawImage(mask,0,0,w,h);
 g.lineCap='round';g.lineJoin='round';g.fillStyle=g.strokeStyle='#fff';
 for(const s of l.protrusions||[]){g.globalCompositeOperation=s.mode==='erase'?'destination-out':'source-over';g.lineWidth=s.size*w;g.beginPath();const pts=s.points;g.moveTo(pts[0].x*w,pts[0].y*h);if(pts.length===1){g.arc(pts[0].x*w,pts[0].y*h,g.lineWidth/2,0,Math.PI*2);g.fill();}else{for(const p of pts.slice(1))g.lineTo(p.x*w,p.y*h);g.stroke();}}
 g.globalCompositeOperation='source-in';g.drawImage(bitmap,0,0,w,h);c.drawImage(out,l.x,l.y,l.w,l.h);
}
function initProtrusionAI(){const host=$('panelProtrusionControls');if(!host)return;const row=document.createElement('div');row.className='row';row.innerHTML='<button id="panelAutoSelect" type="button">캐릭터 자동 선택 · 시험</button><button id="panelAutoCancel" type="button" hidden>취소</button>';const hint=document.createElement('p');hint.id='panelAIStatus';hint.className='hint';hint.textContent='처음 실행할 때 모델을 다운로드합니다. 사진은 기기 안에서 처리돼요. 자동 선택 후 브러시·지우개로 다듬어주세요.';host.prepend(row,hint);const dialog=document.createElement('dialog');dialog.id='protrusionAIDialog';dialog.innerHTML='<h2>캐릭터 자동 선택</h2><p id="protrusionAIProgress">처리 준비 중…</p><button type="button" id="protrusionAICancel">취소</button>';document.body.append(dialog);$('protrusionAICancel').onclick=cancelProtrusionAI;dialog.addEventListener('cancel',e=>{e.preventDefault();cancelProtrusionAI();});$('panelAutoSelect').onclick=()=>autoSelectProtrusion();$('panelAutoCancel').onclick=cancelProtrusionAI;}
