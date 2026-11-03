'use strict';
const AI_LOCAL_URL='http://127.0.0.1:23119';
let aiEditor=null,aiConnectionToken=null;
function aiElement(tag,props={},text){const el=document.createElement(tag);Object.assign(el,props);if(text!==undefined)el.textContent=text;return el;}
function aiTarget(){
 const b=current(),info=b?.kind==='asset'&&referenceInfo(b.assetId);
 if(info?.fixed&&!info.censor){const raw=referenceImages.get(b.assetId);if(raw)return{owner:b,image:stickerImage(b,raw),name:info.label||b.text||'선택 에셋',kind:'asset'};}
 const layer=currentImageLayer();
 if(layer?.src&&!layer.kind&&!layer.locked){const image=layerBitmap(layer);if(image)return{owner:layer,image,name:layer.name||'선택 이미지',kind:'layer'};}
 if(bg){const scale=Math.min(1,2048/state.width,2048/state.height),image=document.createElement('canvas');image.width=Math.max(1,Math.round(state.width*scale));image.height=Math.max(1,Math.round(state.height*scale));const c=image.getContext('2d');c.scale(scale,scale);c.drawImage(bg,0,0,state.width,state.height);drawPatches(c);return{owner:state,image,name:'현재 장의 원본 이미지',kind:'background',temporary:true};}
 throw Error('복원할 일반 이미지나 고정 PNG 에셋을 선택하거나 원본 이미지를 불러와 주세요.');
}
function aiFingerprint(target){return JSON.stringify([target.kind==='background'?state.image:target.owner.src||target.owner.assetId,target.owner.aiPatches,target.owner.assetRecolor,target.owner.color,target.owner.fill,target.owner.opacity,target.kind==='background'?state.masks:target.owner.strokes,state.width,state.height]);}
function aiStillCurrent(editor){return editor.document===state&&aiEditor===editor&&(editor.target.kind==='background'||state.imageLayers.includes(editor.target.owner)||state.items.includes(editor.target.owner))&&editor.fingerprint===aiFingerprint(editor.target);}
function aiBrushStroke(c,stroke){c.save();c.globalCompositeOperation=stroke.erase?'destination-out':'source-over';c.lineCap=c.lineJoin='round';c.strokeStyle=c.fillStyle='#fff';c.lineWidth=stroke.size;c.beginPath();const p=stroke.points;if(p.length===1){c.arc(p[0].x,p[0].y,stroke.size/2,0,Math.PI*2);c.fill();}else{c.moveTo(p[0].x,p[0].y);for(const v of p.slice(1))c.lineTo(v.x,v.y);c.stroke();}c.restore();}
function aiRedraw(){const e=aiEditor;if(!e)return;const c=e.canvas.getContext('2d');c.clearRect(0,0,e.canvas.width,e.canvas.height);c.drawImage(e.preview&&!e.showOriginal?e.preview:e.work,0,0,e.canvas.width,e.canvas.height);if(!e.preview){const tint=e.tint.getContext('2d');tint.clearRect(0,0,e.tint.width,e.tint.height);tint.drawImage(e.mask,0,0);tint.globalCompositeOperation='source-in';tint.fillStyle='rgba(233,46,104,.45)';tint.fillRect(0,0,e.tint.width,e.tint.height);tint.globalCompositeOperation='source-over';c.drawImage(e.tint,0,0);}e.apply.disabled=!e.preview||e.busy;e.compare.disabled=!e.preview||e.busy;e.run.disabled=e.busy||!e.strokes.length;e.undo.disabled=e.busy||!e.strokes.length;e.clear.disabled=e.busy||!e.strokes.length;e.quality.disabled=e.alpha.disabled=e.busy;}
function aiResetMask(){const e=aiEditor;if(!e||e.busy)return;e.preview=null;e.mask.getContext('2d').clearRect(0,0,e.mask.width,e.mask.height);for(const stroke of e.strokes)aiBrushStroke(e.mask.getContext('2d'),stroke);aiRedraw();}
async function aiCall(path,body,signal){
 const response=await fetch(AI_LOCAL_URL+path,{method:body===undefined?'GET':'POST',mode:'cors',headers:body===undefined?{}:{'Content-Type':'application/json','X-Balloon-AI':'1',...(aiConnectionToken?{Authorization:'Bearer '+aiConnectionToken}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal});
 const data=await response.json();if(!response.ok){if(response.status===401)aiConnectionToken=null;throw Error(data.error||'AI 연결에 실패했습니다.');}return data;
}
async function aiConnect(retry=false){
 const e=aiEditor;if(!e||e.connecting)return;e.connecting=true;e.message.textContent='이 PC의 AI 복원 모듈을 확인하고 있어요…';
 try{
  const health=await aiCall('/health',undefined,AbortSignal.timeout(4000));if(aiEditor!==e)return;
  if(health.service!=='balloon-studio-local-ai')throw Error('공방 복원 모듈을 확인하지 못했습니다.');
  if(!aiConnectionToken)aiConnectionToken=(await aiCall('/session',{},AbortSignal.timeout(4000))).token;
  if(aiEditor!==e)return;
  e.connected=health.phase==='ready';e.message.textContent=health.message+(health.provider?' · '+health.provider:'')+(health.phase==='downloading'?' '+health.progress+'%':'');
  e.run.disabled=e.busy||!e.strokes.length||!e.connected;
  if(health.phase==='error'){if(retry===true){await aiCall('/retry',{});e.poll=setTimeout(aiConnect,1800);}else e.message.textContent+=' · AI 연결 확인을 눌러 다시 시도해 주세요.';}
  else if(!e.connected)e.poll=setTimeout(aiConnect,1800);
 }catch(error){if(aiEditor===e){e.connected=false;e.setup.open=true;e.message.textContent='PC 모듈이 꺼져 있거나 연결 권한이 필요해요. 아래에서 설치 또는 AI 엔진 켜기를 선택한 뒤 연결을 확인해 주세요.';e.run.disabled=true;}}
 finally{e.connecting=false;}
}
function aiMaskBounds(mask){const {width:w,height:h}=mask,pixels=mask.getContext('2d').getImageData(0,0,w,h).data;let x0=w,y0=h,x1=-1,y1=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(pixels[(y*w+x)*4+3]){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}return x1<0?null:{x:Math.max(0,x0-50),y:Math.max(0,y0-50),right:Math.min(w,x1+51),bottom:Math.min(h,y1+51)};}
async function aiRun(){
 const e=aiEditor;if(!e||e.busy)return;
 if(!e.connected){await aiConnect();if(!e.connected)return;}
 const bounds=aiMaskBounds(e.mask);if(!bounds){e.message.textContent='복원할 글씨 위를 브러시로 칠해 주세요.';return;}
 if(!aiStillCurrent(e)){e.message.textContent='문서가 바뀌었어요. 닫은 뒤 대상을 다시 선택해 주세요.';return;}
 e.busy=true;e.preview=null;e.request=new AbortController();e.jobId=crypto.randomUUID();aiRedraw();e.message.textContent='브러시로 칠한 영역을 AI로 복원하고 있어요…';
 const w=bounds.right-bounds.x,h=bounds.bottom-bounds.y,crop=document.createElement('canvas'),mask=document.createElement('canvas');crop.width=mask.width=w;crop.height=mask.height=h;crop.getContext('2d').drawImage(e.work,-bounds.x,-bounds.y);mask.getContext('2d').drawImage(e.mask,-bounds.x,-bounds.y);
 try{
  const result=await aiCall('/inpaint',{jobId:e.jobId,image:crop.toDataURL('image/png'),mask:mask.toDataURL('image/png'),size:Number(e.quality.value),alphaMode:e.alpha.checked?'repair':'preserve'},e.request.signal);
  if(!aiStillCurrent(e)||result.jobId!==e.jobId)throw Error('문서가 바뀌어 이전 결과를 적용하지 않았어요.');
  const image=await imageFrom(result.image);if(!aiStillCurrent(e))return;
  if(image.width!==w||image.height!==h)throw Error('복원 결과의 크기가 올바르지 않습니다.');
  const selected=mask.getContext('2d').getImageData(0,0,w,h),pixels=image.width*image.height;
  // Crisp, binary commit mask. Partly painted pixels are explicitly selected.
  for(let i=0;i<pixels;i++){const j=i*4;selected.data[j]=selected.data[j+1]=selected.data[j+2]=255;selected.data[j+3]=selected.data[j+3]?255:0;}
  mask.getContext('2d').putImageData(selected,0,0);
  const patch=document.createElement('canvas');patch.width=w;patch.height=h;const g=patch.getContext('2d');g.drawImage(image,0,0);g.globalCompositeOperation='destination-in';g.drawImage(mask,0,0);
  e.patch={version:1,x:bounds.x/e.work.width,y:bounds.y/e.work.height,w:w/e.work.width,h:h/e.work.height,src:patch.toDataURL('image/png'),mask:mask.toDataURL('image/png'),afterStroke:e.target.kind==='background'?(state.masks||[]).length:e.target.kind==='layer'?(e.target.owner.strokes||[]).length:0};
  e.preview=document.createElement('canvas');e.preview.width=e.work.width;e.preview.height=e.work.height;const p=e.preview.getContext('2d');p.drawImage(e.work,0,0);p.save();p.globalCompositeOperation='destination-out';p.drawImage(mask,bounds.x,bounds.y);p.globalCompositeOperation='source-over';p.drawImage(patch,bounds.x,bounds.y);p.restore();e.showOriginal=false;e.message.textContent='복원 결과를 확인해 주세요. '+result.provider+' · '+result.seconds+'초';
 }catch(error){if(aiEditor===e)e.message.textContent=error.name==='AbortError'?'복원을 취소했어요.':error.message;}
 finally{crop.width=crop.height=mask.width=mask.height=1;if(aiEditor===e){e.busy=false;aiRedraw();}}
}
async function aiApply(){const e=aiEditor;if(!e||!e.preview||e.busy||!aiStillCurrent(e))return;e.busy=true;aiRedraw();try{
 const list=[...(e.target.owner.aiPatches||[]),e.patch],test={...state};
 // Validate the proposed change without mutating the active document.
 if(e.target.kind==='background')test.aiPatches=list;else if(e.target.kind==='layer')test.imageLayers=state.imageLayers.map(l=>l===e.target.owner?{...l,aiPatches:list}:l);else test.items=state.items.map(b=>b===e.target.owner?{...b,aiPatches:list}:b);
 validateAIRetouch(test);await loadAIRetouch(test);if(!aiStillCurrent(e))return;
 checkpoint();e.target.owner.aiPatches=list;if(e.target.kind==='layer')invalidateImageLayer(e.target.owner.id);clearAIComposite();cleanupKey='';aiClose();sync();status('브러시 영역에 AI 복원을 적용했어요. Ctrl+Z로 되돌릴 수 있어요.');
 }catch(error){e.message.textContent=error.message;}finally{if(aiEditor===e){e.busy=false;aiRedraw();}}}
function aiClose(){const e=aiEditor;if(!e)return;aiEditor=null;clearTimeout(e.poll);e.request?.abort();if(e.busy&&e.jobId)aiCall('/cancel',{jobId:e.jobId}).catch(()=>{});e.dialog.close();e.dialog.remove();for(const c of [e.work,e.mask,e.tint,e.canvas,e.preview])if(c)c.width=c.height=1;if(e.target.temporary)e.target.image.width=e.target.image.height=1;}
function openAIRetouch(){
 if(projectBusy||aiEditor)return;
 try{
  const target=aiTarget(),image=target.image,iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height,scale=Math.min(1,2048/iw,2048/ih),work=document.createElement('canvas');work.width=Math.max(1,Math.round(iw*scale));work.height=Math.max(1,Math.round(ih*scale));work.getContext('2d').drawImage(image,0,0,work.width,work.height);
  const dialog=aiElement('dialog',{className:'ai-retouch-dialog',ariaLabel:'브러시 영역 AI 복원'}),heading=aiElement('div',{className:'ai-retouch-heading'}),close=aiElement('button',{type:'button','ariaLabel':'AI 복원 닫기'},'×');heading.append(aiElement('h2',{},'브러시 영역 AI 복원'),close);
  const description=aiElement('p',{className:'hint'},target.name+' · 지울 글씨만 칠해 주세요. 여러 군데를 칠한 뒤 한 번에 복원할 수 있어요.');
  const tools=aiElement('div',{className:'ai-retouch-tools'}),draw=aiElement('button',{type:'button',className:'active'},'복원 브러시'),erase=aiElement('button',{type:'button'},'보호·제외'),size=aiElement('input',{type:'range',min:'2',max:'180',value:'28','ariaLabel':'복원 브러시 크기'}),sizeText=aiElement('span',{},'28px'),undo=aiElement('button',{type:'button'},'획 되돌리기'),clear=aiElement('button',{type:'button'},'칠한 영역 지우기');tools.append(draw,erase,size,sizeText,undo,clear);
  const stage=aiElement('div',{className:'ai-retouch-stage'}),view=aiElement('canvas',{'ariaLabel':'브러시로 복원 영역 지정'});view.width=work.width;view.height=work.height;stage.append(view);
  const options=aiElement('div',{className:'ai-retouch-tools'}),quality=aiElement('select',{'ariaLabel':'복원 품질'});quality.append(aiElement('option',{value:'512'},'기본 품질'),aiElement('option',{value:'1024'},'정밀 · 느림'));const alpha=aiElement('input',{type:'checkbox'}),alphaLabel=aiElement('label');alphaLabel.append(alpha,document.createTextNode('투명 바탕도 복원'));options.append(quality,alphaLabel);
  const message=aiElement('p',{className:'ai-retouch-message',role:'status'},'AI 연결을 확인해 주세요. 이미지는 이 PC에서만 처리합니다.'),actions=aiElement('div',{className:'ai-retouch-actions'}),run=aiElement('button',{type:'button',className:'primary'},'칠한 영역 일괄 복원'),compare=aiElement('button',{type:'button'},'원본 / 결과'),apply=aiElement('button',{type:'button',className:'primary'},'결과 적용'),cancel=aiElement('button',{type:'button'},'취소');actions.append(run,compare,apply,cancel);
  const setup=aiElement('details',{className:'ai-retouch-setup'});setup.append(aiElement('summary',{},'처음 사용하는 PC · 설치 / AI 연결'));
  setup.append(aiElement('p',{className:'hint'},'Windows 64비트 PC에서 처음 한 번 동의 후 설치 도우미를 실행하면 구성요소와 모델 약 270MB를 AppData에 자동으로 준비해요. 별도 Python·CUDA 설치는 필요하지 않아요. 모델 준비가 끝나면 이 창에서 바로 사용할 수 있어요.'));
  const consent=aiElement('input',{type:'checkbox'}),consentLabel=aiElement('label');consentLabel.append(consent,document.createTextNode('로컬 AI 구성요소 설치와 모델 다운로드에 동의합니다.'));
  const install=aiElement('a',{href:'local-ai/BalloonStudio-AI-Setup.exe',download:'BalloonStudio-AI-Setup.exe',className:'ai-install-link'},'① 설치 도우미 받기'),start=aiElement('a',{href:'balloonstudio-ai://start',className:'ai-install-link'},'② 설치된 AI 엔진 켜기'),connect=aiElement('button',{type:'button'},'AI 연결 확인');install.style.display='none';consent.onchange=()=>install.style.display=consent.checked?'inline-flex':'none';setup.append(consentLabel,install,start,connect);
  dialog.append(heading,description,tools,stage,options,message,actions,setup);document.body.append(dialog);
  const mask=document.createElement('canvas'),tint=document.createElement('canvas');mask.width=tint.width=work.width;mask.height=tint.height=work.height;
  aiEditor={dialog,document:state,target,fingerprint:aiFingerprint(target),work,mask,tint,canvas:view,strokes:[],size,erase:false,busy:false,setup,message,run,apply,compare,undo,clear,quality,alpha,connected:false};
  const e=aiEditor;draw.onclick=()=>{e.erase=false;draw.classList.add('active');erase.classList.remove('active');};erase.onclick=()=>{e.erase=true;erase.classList.add('active');draw.classList.remove('active');};size.oninput=()=>sizeText.textContent=size.value+'px';undo.onclick=()=>{e.strokes.pop();aiResetMask();};clear.onclick=()=>{e.strokes=[];aiResetMask();};
  const point=event=>{const r=view.getBoundingClientRect();return{x:Math.max(0,Math.min(work.width,(event.clientX-r.left)*work.width/r.width)),y:Math.max(0,Math.min(work.height,(event.clientY-r.top)*work.height/r.height))};};
  view.onpointerdown=event=>{if(e.busy||e.strokes.length>=1000)return;event.preventDefault();e.preview=null;e.stroke={erase:e.erase,size:Number(size.value),points:[point(event)]};e.strokes.push(e.stroke);view.setPointerCapture(event.pointerId);aiBrushStroke(mask.getContext('2d'),e.stroke);aiRedraw();};
  view.onpointermove=event=>{if(!e.stroke||e.busy)return;const p=point(event),last=e.stroke.points.at(-1);if(e.stroke.points.length>=10000||Math.hypot(p.x-last.x,p.y-last.y)<.6)return;e.stroke.points.push(p);aiBrushStroke(mask.getContext('2d'),{...e.stroke,points:[last,p]});if(!e.frame)e.frame=requestAnimationFrame(()=>{e.frame=null;aiRedraw();});};
  view.onpointerup=view.onpointercancel=()=>{e.stroke=null;};
  run.onclick=aiRun;compare.onclick=()=>{e.showOriginal=!e.showOriginal;aiRedraw();};apply.onclick=aiApply;cancel.onclick=close.onclick=aiClose;dialog.oncancel=event=>{event.preventDefault();aiClose();};connect.onclick=()=>aiConnect(true);start.onclick=()=>{message.textContent='AI 엔진 실행을 허용한 뒤 연결 확인을 눌러 주세요.';};
  dialog.showModal();aiRedraw();aiConnect();
 }catch(error){status(error.message);}
}
window.addEventListener('DOMContentLoaded',()=>{const anchor=$('imageLayerEraser');if(!anchor)return;const button=aiElement('button',{id:'toolAIRetouch',type:'button'},'브러시 영역 AI 복원');button.onclick=openAIRetouch;anchor.before(button);},{once:true});
