'use strict';
let regionOCR=null,ocrJobCounter=0;
function ocrElement(tag,props={},text){const el=document.createElement(tag);Object.assign(el,props);if(text!==undefined)el.textContent=text;return el;}
function ocrCurrent(e){return regionOCR===e&&e.document===state&&!projectBusy&&(e.target.kind==='background'||state.imageLayers.includes(e.target.owner)||state.items.includes(e.target.owner))&&e.fingerprint===aiFingerprint(e.target);}
function ocrUpdateControls(e){
 const has=!!e.output.value.trim();e.run.disabled=e.busy||!e.actions.length;e.copy.disabled=e.insert.disabled=e.busy||!has;e.undo.disabled=e.clear.disabled=e.busy||!e.actions.length;e.language.disabled=e.direction.disabled=e.invert.disabled=e.size.disabled=e.busy;e.output.readOnly=e.busy;e.stop.hidden=!e.busy;
 e.verticalOption.disabled=e.language.value!=='jpn';if(e.language.value!=='jpn')e.direction.value='horizontal';
}
function ocrRedraw(e=regionOCR){
 if(!e||regionOCR!==e)return;const c=e.canvas.getContext('2d');c.clearRect(0,0,e.canvas.width,e.canvas.height);c.drawImage(e.work,0,0);
 const g=e.tint.getContext('2d');g.clearRect(0,0,e.tint.width,e.tint.height);g.drawImage(e.mask,0,0);g.globalCompositeOperation='source-in';g.fillStyle='rgba(224,46,94,.38)';g.fillRect(0,0,e.tint.width,e.tint.height);g.globalCompositeOperation='source-over';c.drawImage(e.tint,0,0);
 if(e.drag?.type==='rect'){c.fillStyle='rgba(224,46,94,.3)';c.fillRect(e.drag.x,e.drag.y,e.drag.w,e.drag.h);}
 for(const [i,r]of (e.regions||[]).entries()){c.strokeStyle='#8d1740';c.lineWidth=2;c.strokeRect(r.x,r.y,r.w,r.h);c.fillStyle='#8d1740';c.fillRect(r.x,r.y,26,26);c.fillStyle='#fff';c.font='bold 18px sans-serif';c.textBaseline='middle';c.fillText(String(i+1),r.x+6,r.y+14);}
 ocrUpdateControls(e);
}
function ocrRebuildMask(e){const c=e.mask.getContext('2d');c.clearRect(0,0,e.mask.width,e.mask.height);for(const action of e.actions)ocrPaintAction(c,action);e.regions=[];if(e.output.value)e.message.textContent='선택 영역이 바뀌었어요. 다시 읽으면 결과가 갱신됩니다.';ocrRedraw(e);}
function ocrStop(e=regionOCR){
 if(!e)return;e.runToken=null;e.worker?.terminate();e.worker=null;e.workerKey=null;
 for(const p of e.pending.values()){clearTimeout(p.timer);p.reject(Object.assign(Error('인식을 중단했어요.'),{name:'AbortError'}));}e.pending.clear();e.busy=false;
 if(regionOCR===e){e.message.textContent='인식을 중단했어요. 선택 영역과 이전 결과는 유지됩니다.';ocrUpdateControls(e);}
}
function ocrWorkerCall(e,type,payload={},transfer=[]){
 return new Promise((resolve,reject)=>{const id='ocr-'+(++ocrJobCounter),timer=setTimeout(()=>{if(!e.pending.has(id))return;ocrStop(e);if(regionOCR===e)e.message.textContent='인식 준비나 처리에 시간이 오래 걸려 중단했어요. 연결 상태를 확인하거나 더 작은 영역으로 다시 시도해 주세요.';},120000);e.pending.set(id,{resolve,reject,timer});try{e.worker.postMessage({id,type,...payload},transfer);}catch(error){clearTimeout(timer);e.pending.delete(id);reject(error);}});
}
async function ocrReadyWorker(e,key,language,direction){
 if(e.worker&&e.workerKey===key)return;
 e.worker?.terminate();e.worker=new Worker('region-ocr-worker.js');e.workerKey=key;const worker=e.worker;
 worker.onmessage=event=>{
  if(regionOCR!==e||e.worker!==worker)return;const p=e.pending.get(event.data?.id);if(!p)return;
  const d=event.data;if(d.type==='progress'){const percent=Math.round(Math.max(0,Math.min(1,d.progress||0))*100);e.message.textContent=(d.status==='recognizing text'?`${e.regionIndex} / ${e.regionCount} 영역 글자 읽는 중`:'OCR 엔진·언어 자료를 준비하는 중')+' · '+percent+'%';return;}
  clearTimeout(p.timer);e.pending.delete(d.id);d.type==='error'?p.reject(Error(d.message||'글자를 읽지 못했어요.')):p.resolve(d);
 };
 worker.onerror=()=>{if(e.worker!==worker)return;ocrStop(e);if(regionOCR===e)e.message.textContent='OCR 엔진을 불러오지 못했어요. 네트워크 연결을 확인하고 다시 시도해 주세요.';};
 await ocrWorkerCall(e,'init',{language,direction});
}
function ocrPNGBytes(canvas){return new Promise((resolve,reject)=>canvas.toBlob(async blob=>{try{if(!blob)throw Error('선택 영역을 이미지로 만들지 못했어요.');resolve(await blob.arrayBuffer());}catch(error){reject(error);}},'image/png'));}
async function ocrRun(){
 const e=regionOCR;if(!e||e.busy)return;if(!ocrCurrent(e)){e.message.textContent='문서나 원본 이미지가 바뀌었어요. 닫은 뒤 다시 선택해 주세요.';return;}
 let selection;try{selection=ocrFindRegions(e.mask,e.direction.value==='vertical');if(!selection.regions.length)throw Error('글씨 전체가 포함되도록 브러시로 칠하거나 네모 박스를 그려 주세요.');}catch(error){e.message.textContent=error.message;return;}
 const token={};e.runToken=token;e.busy=true;e.regions=selection.regions;e.regionCount=e.regions.length;e.regionIndex=1;e.message.textContent='OCR 엔진·언어 자료를 준비하고 있어요. 처음에는 시간이 걸릴 수 있어요.';ocrRedraw(e);
 const language=e.language.value==='jpn'?(e.direction.value==='vertical'?'jpn_vert+eng':'jpn+eng'):e.language.value==='kor'?'kor+eng':'eng',key=language+':'+e.direction.value;
 try{
  await ocrReadyWorker(e,key,language,e.direction.value);const results=[];
  for(const [index,region]of selection.regions.entries()){
   if(!ocrCurrent(e)||e.runToken!==token)throw Object.assign(Error('문서가 바뀌어 이전 인식 결과를 적용하지 않았어요.'),{name:'AbortError'});
   e.regionIndex=index+1;const crop=ocrCropRegion(e,region,selection,Math.min(2000000,8000000/e.regionCount));
   try{const bytes=await ocrPNGBytes(crop);if(!ocrCurrent(e)||e.runToken!==token)throw Object.assign(Error('인식을 중단했어요.'),{name:'AbortError'});const result=await ocrWorkerCall(e,'recognize',{bytes},[bytes]);results.push({text:result.text.replace(/\r\n?/g,'\n').trim(),confidence:result.confidence});}finally{crop.width=crop.height=1;}
  }
  if(e.runToken!==token)return;if(!ocrCurrent(e))throw Error('문서나 원본 이미지가 바뀌었어요. OCR 창을 다시 열어 주세요.');
  e.output.value=results.map(r=>r.text).filter(Boolean).join('\n\n').slice(0,20000);e.details.textContent=results.map((r,i)=>`${i+1}번: ${r.text?'판독 점수 '+Math.round(r.confidence):'읽힌 글자 없음'}`).join(' · ');
  e.message.textContent=e.output.value?(results.some(r=>r.confidence<70||!r.text)?'인식했어요. 불확실한 영역이 있으니 원문과 비교해 결과를 고쳐 주세요.':'인식했어요. 결과를 확인·수정한 뒤 복사하거나 새 대사로 넣어 주세요.'):'글자를 찾지 못했어요. 선택 범위·언어·글 방향·어두운 배경 반전을 확인해 주세요.';
 }catch(error){if(regionOCR===e&&e.runToken===token){e.message.textContent=error.message||'인식에 실패했어요. 다시 시도해 주세요.';e.worker?.terminate();e.worker=null;e.workerKey=null;}}
 finally{if(regionOCR===e&&e.runToken===token){e.busy=false;e.runToken=null;ocrUpdateControls(e);}}
}
async function ocrCopy(){const e=regionOCR;if(!e||e.busy)return;try{await navigator.clipboard.writeText(e.output.value);if(regionOCR===e)e.message.textContent='인식 결과를 복사했어요.';}catch{if(regionOCR===e){e.output.focus();e.output.select();e.message.textContent='결과를 선택했어요. Ctrl+C 또는 길게 눌러 복사해 주세요.';}}}
function ocrInsert(){
 const e=regionOCR;if(!e||e.busy||!e.output.value.trim())return;if(!ocrCurrent(e)){e.message.textContent='문서가 바뀌었어요. 닫은 뒤 다시 열어 주세요.';return;}if(state.items.length>=500){e.message.textContent='이 장에는 객체를 500개까지 넣을 수 있어요.';return;}
 const text=e.output.value.trim().slice(0,20000);closeRegionOCR();add('text');const b=current();if(b){b.text=text;sync();status('OCR 결과를 편집 가능한 새 대사로 넣었어요. Ctrl+Z로 한 번에 되돌릴 수 있어요.');}
}
function closeRegionOCR(){const e=regionOCR;if(!e)return;regionOCR=null;ocrStop(e);if(e.frame)cancelAnimationFrame(e.frame);e.dialog.close();e.dialog.remove();for(const c of [e.work,e.mask,e.tint,e.canvas])c.width=c.height=1;}
function openRegionOCR(){
 if(projectBusy||regionOCR)return;
 try{
  const target=ocrSourceTarget(),scale=Math.min(1,2048/target.width,2048/target.height),work=document.createElement('canvas');work.width=Math.max(1,Math.round(target.width*scale));work.height=Math.max(1,Math.round(target.height*scale));ocrDrawSource(work.getContext('2d'),target,0,0,target.width,target.height,work.width,work.height);
  const dialog=ocrElement('dialog',{className:'ai-retouch-dialog region-ocr-dialog',ariaLabel:'선택 영역 OCR'}),heading=ocrElement('div',{className:'ai-retouch-heading'}),close=ocrElement('button',{type:'button',ariaLabel:'OCR 닫기'},'×');heading.append(ocrElement('h2',{},'선택 영역 OCR · 글자 읽기'),close);
  const description=ocrElement('p',{className:'hint'},target.name+' · 글씨 전체를 브러시로 칠하거나 네모 박스를 그려 주세요. 선택한 부분만 읽고 원본은 유지해요.');
  const tools=ocrElement('div',{className:'ai-retouch-tools'}),rect=ocrElement('button',{type:'button',className:'active'},'네모 박스'),brush=ocrElement('button',{type:'button'},'브러시'),exclude=ocrElement('button',{type:'button'},'제외 지우개'),size=ocrElement('input',{type:'range',min:'4',max:'180',value:'44',ariaLabel:'OCR 브러시 크기'}),sizeText=ocrElement('span',{},'44px'),undo=ocrElement('button',{type:'button'},'선택 되돌리기'),clear=ocrElement('button',{type:'button'},'선택 모두 지우기');tools.append(rect,brush,exclude,size,sizeText,undo,clear);
  const layout=ocrElement('div',{className:'ocr-layout'}),stage=ocrElement('div',{className:'ai-retouch-stage'}),canvas=ocrElement('canvas',{ariaLabel:'OCR 영역 지정'});canvas.width=work.width;canvas.height=work.height;stage.append(canvas);
  const resultPane=ocrElement('div',{className:'ocr-result-pane'}),resultLabel=ocrElement('label',{htmlFor:'regionOCRText'},'인식 결과 · 직접 수정 가능'),output=ocrElement('textarea',{id:'regionOCRText',ariaLabel:'OCR 인식 결과',maxLength:20000,placeholder:'영역을 선택하고 「선택 영역 읽기」를 누르면 여기에 글자가 나타나요.'}),details=ocrElement('p',{className:'hint'});resultPane.append(resultLabel,output,details);layout.append(stage,resultPane);
  const options=ocrElement('div',{className:'ai-retouch-tools'}),language=ocrElement('select',{ariaLabel:'OCR 언어'});for(const [value,label]of [['jpn','일본어 + 영어'],['kor','한국어 + 영어'],['eng','영어']])language.append(ocrElement('option',{value},label));const direction=ocrElement('select',{ariaLabel:'OCR 글 방향'}),verticalOption=ocrElement('option',{value:'vertical'},'세로쓰기 · 일본어');direction.append(verticalOption,ocrElement('option',{value:'horizontal'},'가로쓰기'));const invert=ocrElement('input',{type:'checkbox'}),invertLabel=ocrElement('label');invertLabel.append(invert,document.createTextNode('어두운 배경 반전'));options.append(language,direction,invertLabel);
  try{const saved=JSON.parse(localStorage.getItem('studio.ocr.settings')||'{}');if(['jpn','kor','eng'].includes(saved.language))language.value=saved.language;if(['vertical','horizontal'].includes(saved.direction))direction.value=saved.direction;}catch{}
  const message=ocrElement('p',{className:'ai-retouch-message',role:'status'},'브라우저 안에서 처리해요. 이미지를 서버로 전송하지 않아요.'),hint=ocrElement('p',{className:'hint'},'필기체·장식 글씨는 틀릴 수 있어요. 인식 결과와 판독 점수는 원문과 대조해 주세요. 일본어 세로쓰기는 오른쪽 열부터 읽어요.'),actions=ocrElement('div',{className:'ai-retouch-actions'}),run=ocrElement('button',{type:'button',className:'primary'},'선택 영역 읽기'),stop=ocrElement('button',{type:'button',hidden:true},'인식 중단'),copy=ocrElement('button',{type:'button'},'결과 복사'),insert=ocrElement('button',{type:'button',className:'primary'},'새 대사로 넣기');actions.append(run,stop,copy,insert);dialog.append(heading,description,tools,options,layout,message,hint,actions);document.body.append(dialog);
  const mask=document.createElement('canvas'),tint=document.createElement('canvas');mask.width=tint.width=work.width;mask.height=tint.height=work.height;
  const e={dialog,document:state,target,fingerprint:aiFingerprint(target),work,mask,tint,canvas,actions:[],regions:[],mode:'rect',size,language,direction,verticalOption,invert,output,details,message,run,stop,copy,insert,undo,clear,pending:new Map(),busy:false,worker:null,pointerId:null};regionOCR=e;
  const choose=mode=>{e.mode=mode;for(const [button,key]of [[rect,'rect'],[brush,'brush'],[exclude,'exclude']]){button.classList.toggle('active',mode===key);button.setAttribute('aria-pressed',String(mode===key));}};rect.onclick=()=>choose('rect');brush.onclick=()=>choose('brush');exclude.onclick=()=>choose('exclude');choose('rect');
  size.oninput=()=>sizeText.textContent=size.value+'px';undo.onclick=()=>{e.actions.pop();ocrRebuildMask(e);};clear.onclick=()=>{e.actions=[];ocrRebuildMask(e);};output.oninput=()=>ocrUpdateControls(e);
  language.onchange=direction.onchange=()=>{ocrUpdateControls(e);try{localStorage.setItem('studio.ocr.settings',JSON.stringify({language:language.value,direction:direction.value}));}catch{}};
  const point=event=>{const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(work.width,(event.clientX-r.left)*work.width/r.width)),y:Math.max(0,Math.min(work.height,(event.clientY-r.top)*work.height/r.height))};};
  const cancelPointer=()=>{if(e.drag&&e.drag.type!=='rect')e.actions.pop();e.drag=null;e.pointerId=null;ocrRebuildMask(e);};
  canvas.onpointerdown=event=>{if(e.busy||event.button>0)return;if(e.pointerId!==null){cancelPointer();return;}if(e.actions.length>=1000){message.textContent='선택 기록이 너무 많아요. 일부를 되돌려 주세요.';return;}event.preventDefault();e.regions=[];if(e.output.value)message.textContent='선택 영역이 바뀌었어요. 다시 읽으면 결과가 갱신됩니다.';e.pointerId=event.pointerId;const p=point(event);e.drag=e.mode==='rect'?{type:'rect',x:p.x,y:p.y,w:0,h:0}:{type:e.mode,size:Number(size.value),points:[p]};if(e.mode!=='rect'){e.actions.push(e.drag);ocrPaintAction(mask.getContext('2d'),e.drag);}canvas.setPointerCapture(event.pointerId);ocrRedraw(e);};
  canvas.onpointermove=event=>{if(!e.drag||e.busy||event.pointerId!==e.pointerId)return;const p=point(event);if(e.drag.type==='rect'){e.drag.w=p.x-e.drag.x;e.drag.h=p.y-e.drag.y;}else{const last=e.drag.points.at(-1);if(e.drag.points.length>=10000||Math.hypot(last.x-p.x,last.y-p.y)<.5)return;e.drag.points.push(p);ocrPaintAction(mask.getContext('2d'),{...e.drag,points:[last,p]});}if(!e.frame)e.frame=requestAnimationFrame(()=>{e.frame=null;ocrRedraw(e);});};
  canvas.onpointerup=event=>{if(event.pointerId!==e.pointerId||!e.drag)return;if(e.drag.type==='rect'&&Math.abs(e.drag.w)>=3&&Math.abs(e.drag.h)>=3){e.actions.push(e.drag);ocrPaintAction(mask.getContext('2d'),e.drag);}e.drag=null;e.pointerId=null;ocrRedraw(e);};canvas.onpointercancel=cancelPointer;
  run.onclick=ocrRun;stop.onclick=()=>ocrStop(e);copy.onclick=ocrCopy;insert.onclick=ocrInsert;close.onclick=closeRegionOCR;dialog.oncancel=event=>{event.preventDefault();closeRegionOCR();};dialog.showModal();ocrRedraw(e);
 }catch(error){status(error.message);}
}
window.addEventListener('DOMContentLoaded',()=>{const anchor=$('toolAIRetouch')||$('imageLayerEraser');if(!anchor)return;const button=ocrElement('button',{id:'toolRegionOCR',type:'button'},'선택 영역 OCR · 글자 읽기');button.onclick=openRegionOCR;anchor.before(button);},{once:true});
