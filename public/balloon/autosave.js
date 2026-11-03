'use strict';
// IndexedDB stores full project documents; the separate index keeps the picker light.
let localProjectId=crypto.randomUUID(),localRevision=0,localChanges=0,localSaved=0;
let localTimer=null,localSaving=null,localTransition=false,localDbPromise=null;
const LOCAL_SAVE_IDLE_MS=20000,LOCAL_SAVE_MAX_MS=60000;
let localDirtySince=null,localLastEditAt=null,localPendingSince=null,localRetryAfter=0,localIdentityEpoch=0;
let localComposing=false;
const localActivePointers=new Set();
function localSaveStatus(message,error=false){const el=$('autosaveStatus');el.textContent=message;el.classList.toggle('save-error',error)}
function projectDatabase(){
 if(localDbPromise)return localDbPromise;
 localDbPromise=new Promise((resolve,reject)=>{
  const req=indexedDB.open('balloon-studio-projects',2);
  req.onupgradeneeded=()=>{const db=req.result;for(const name of ['projects','summaries','recovery'])if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:'id'})};
  req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();localDbPromise=null};resolve(db)};
  req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('다른 탭을 닫고 다시 시도해주세요.'));
 }).catch(e=>{localDbPromise=null;throw e});return localDbPromise;
}
async function readLocal(store,id){const db=await projectDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly'),req=id===undefined?tx.objectStore(store).getAll():tx.objectStore(store).get(id);let result;req.onsuccess=()=>{result=req.result};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
async function writeLocal(record,expected){
 const db=await projectDatabase();return new Promise((resolve,reject)=>{
  const tx=db.transaction(['projects','summaries','recovery'],'readwrite'),summaries=tx.objectStore('summaries');let conflict=false;
  const req=summaries.get(record.id);req.onsuccess=()=>{
   if((req.result?.revision||0)!==expected){conflict=true;tx.abort();return}
   const previous=req.result,slot=previous?(previous.slot==='recovery'?'projects':'recovery'):'projects';
   tx.objectStore(slot).put(record);
   const {book,...summary}=record;summaries.put({...summary,slot,previousSlot:previous?(previous.slot||'projects'):null,previousRevision:previous?.revision||0});
  };tx.oncomplete=resolve;tx.onabort=()=>reject(Error(conflict?'다른 탭에서 변경된 프로젝트입니다. 파일로 백업한 뒤 다시 열어주세요.':'저장 공간이나 브라우저 설정을 확인하고 파일로 백업해주세요.'));tx.onerror=()=>{};
 })
}
function queueProjectSave(){
 clearTimeout(localTimer);localTimer=null;
 if(localChanges===localSaved)return;
 const now=Date.now(),due=Math.min((localLastEditAt??now)+LOCAL_SAVE_IDLE_MS,(localDirtySince??now)+LOCAL_SAVE_MAX_MS);
 localTimer=setTimeout(()=>saveLocalProject(),Math.max(0,due-now,localRetryAfter-now));
}
function scheduleProjectSave(){
 const now=Date.now();localChanges++;localLastEditAt=now;
 if(localDirtySince===null)localDirtySince=now;
 if(localSaving&&localPendingSince===null)localPendingSince=now;
 localSaveStatus('저장 대기 중…');queueProjectSave();
}
function localSaveInteractionActive(){
 return localComposing||localActivePointers.size>0||
  (typeof drag!=='undefined'&&drag)||(typeof retouchDrag!=='undefined'&&retouchDrag)||
  (typeof imageLayerDrag!=='undefined'&&imageLayerDrag)||(typeof panelDrag!=='undefined'&&panelDrag)||
  (typeof objectRotationDrag!=='undefined'&&objectRotationDrag)||(typeof textCornerDrag!=='undefined'&&textCornerDrag)||
  (typeof protrusionDrag!=='undefined'&&protrusionDrag)||(typeof viewGesture!=='undefined'&&viewGesture);
}
async function saveLocalProject(force=false){
 clearTimeout(localTimer);localTimer=null;
 if(localSaving){if(!await localSaving)return false;return force&&localChanges!==localSaved?saveLocalProject(true):true}
 if(localChanges===localSaved)return true;
 if(localSaveInteractionActive()||(!force&&(projectBusy||localTransition))){localTimer=setTimeout(()=>saveLocalProject(force),500);return false}
 const revision=localChanges,id=localProjectId,expected=localRevision,epoch=localIdentityEpoch;
 localPendingSince=null;
 localSaveStatus('저장 중…');
 localSaving=Promise.resolve().then(async()=>{try{
  const book=serializableBook();
  await writeLocal({id,revision:expected+1,title:book.title||'이름 없는 프로젝트',updatedAt:Date.now(),count:book.pages.length,thumbnail:activePage()?.thumbnail||null,book},expected);
  if(id===localProjectId&&epoch===localIdentityEpoch){localRevision=expected+1;localSaved=revision;localRetryAfter=0;if(localChanges===revision){localDirtySince=localLastEditAt=null;projectDirty=false;localSaveStatus('저장 완료 · 이 브라우저')}else{localDirtySince=localPendingSince??localLastEditAt;localSaveStatus('저장 대기 중…')}}
  return true;
 }catch(e){if(id===localProjectId&&epoch===localIdentityEpoch){localRetryAfter=Date.now()+5000;localSaveStatus('저장 실패 · 파일로 백업해주세요',true);$('localProjectMessage').textContent=e.message||'자동저장을 사용할 수 없습니다.';}return false}finally{localSaving=null}});
 const ok=await localSaving;if(ok&&epoch===localIdentityEpoch&&localChanges!==localSaved)queueProjectSave();return ok;
}
async function preserveCurrentProject(){
 if(projectBusy||localTransition)return false;
 localTransition=true;setProjectBusy(true);
 const ok=await saveLocalProject(true);setProjectBusy(false);localTransition=false;
 if(!ok)status('현재 작업을 자동저장하지 못했습니다. 프로젝트 저장으로 파일을 백업하고 자동저장을 다시 시도해주세요.');return ok;
}
function resetLocalIdentity(id=crypto.randomUUID(),revision=0){clearTimeout(localTimer);localTimer=null;localIdentityEpoch++;localDirtySince=localLastEditAt=localPendingSince=null;localRetryAfter=0;localProjectId=id;localRevision=revision;localChanges=localSaved=0;localSaveStatus(revision?'저장 완료 · 이 브라우저':'수정하면 자동저장됩니다')}
async function showLocalProjects(){
 if(projectBusy||localTransition)return;
 const dialog=$('localProjectsDialog');if(!dialog.open)dialog.showModal();
 $('localProjectList').replaceChildren();$('localRecoveryPages').replaceChildren();$('localProjectMessage').textContent='프로젝트 목록을 불러오는 중…';
 try{
  if(localChanges!==localSaved)await saveLocalProject(true);
  const rows=await readLocal('summaries');rows.sort((a,b)=>b.updatedAt-a.updatedAt);
  $('localProjectMessage').textContent=rows.length?'':'저장된 프로젝트가 없습니다. 편집을 시작하면 자동으로 저장됩니다.';
  for(const row of rows){
   const entry=document.createElement('div');entry.className='local-project-row';
   const open=document.createElement('button');open.className='local-project-open';
   const img=document.createElement('img');img.alt='';img.src=row.thumbnail||'favicon.svg';
   const info=document.createElement('span'),title=document.createElement('strong'),meta=document.createElement('small');title.textContent=row.title;
   meta.textContent=`${row.count}장 · ${new Date(row.updatedAt).toLocaleString('ko-KR')}${row.id===localProjectId?' · 현재 작업':''}`;info.append(title,meta);open.append(img,info);
   open.onclick=()=>openSavedProject(row,dialog);
   const actions=document.createElement('div');actions.className='local-project-actions';
   const action=(label,fn)=>{const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=fn;actions.append(button)};
   action('파일로 백업',()=>backupSavedProject(row));
   action('장별 복구',()=>showSavedPages(row,dialog));
   if(row.previousRevision)action('이전 저장본 복구',()=>openSavedProject(row,dialog,true));
   const remove=document.createElement('button');remove.textContent='삭제';remove.className='danger';remove.disabled=row.id===localProjectId;remove.title=remove.disabled?'현재 작업은 다른 프로젝트를 연 뒤 삭제할 수 있습니다.':'브라우저 저장본 삭제';
   remove.onclick=async()=>{if(projectBusy||localTransition||!confirm(`「${row.title}」의 브라우저 저장본을 삭제할까요? 내려받은 파일은 남습니다.`))return;try{const db=await projectDatabase();await new Promise((resolve,reject)=>{const tx=db.transaction(['projects','summaries','recovery'],'readwrite');tx.objectStore('projects').delete(row.id);tx.objectStore('summaries').delete(row.id);tx.objectStore('recovery').delete(row.id);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});await showLocalProjects()}catch{$('localProjectMessage').textContent='삭제하지 못했습니다. 다시 시도해주세요.'}};
   actions.append(remove);entry.append(open,actions);$('localProjectList').append(entry);
  }
 }catch{$('localProjectMessage').textContent='브라우저 저장소를 열 수 없습니다. 기존 프로젝트 파일 열기와 저장은 사용할 수 있습니다.';localSaveStatus('자동저장 사용 불가 · 파일로 저장',true)}
}
async function readSavedProject(row,previous=false){
 const record=await readLocal(previous?row.previousSlot:(row.slot||'projects'),row.id);
 if(!record?.book)throw Error('저장본을 읽지 못했습니다. 이전 저장본이 있으면 복구를 시도해주세요.');
 if(record.revision!==(previous?row.previousRevision:row.revision))throw Error('다른 탭에서 저장본이 바뀌었습니다. 목록을 다시 열어주세요.');
 return record;
}
async function openSavedProject(row,dialog,previous=false){
 if(projectBusy||localTransition)return;
 if(!previous&&row.id===localProjectId){dialog.close();return}
 try{
  setProjectBusy(true);const record=await readSavedProject(row,previous);setProjectBusy(false);
  if(await openBookData(record.book,previous?null:record)){$('localRecoveryPages').replaceChildren();dialog.close()}
  else $('localProjectMessage').textContent='프로젝트를 열지 못했습니다. 저장본은 보존되어 있습니다. 파일로 백업하거나 장별 복구를 시도해주세요.';
 }catch(e){$('localProjectMessage').textContent=e.message||'복구하지 못했습니다. 저장본은 삭제하지 않았습니다.'}finally{setProjectBusy(false)}
}
async function backupSavedProject(row){
 if(projectBusy||localTransition)return;
 setProjectBusy(true);try{const record=await readSavedProject(row);download(projectBookBlob(record.book),(row.title||'만화')+'.recovery.balloon.json');$('localProjectMessage').textContent='그림을 열지 않고 저장본을 파일로 백업했습니다.'}catch(e){$('localProjectMessage').textContent=e.message||'백업하지 못했습니다.'}finally{setProjectBusy(false)}
}
async function showSavedPages(row,dialog){
 if(projectBusy||localTransition)return;
 setProjectBusy(true);try{
  const record=await readSavedProject(row),host=$('localRecoveryPages');host.replaceChildren();
  const hint=document.createElement('p');hint.textContent='복구할 장을 고르세요. 한 장씩 새 프로젝트로 열며 원본 저장본은 유지합니다.';host.append(hint);
  for(const [i,page]of record.book.pages.entries()){
   const button=document.createElement('button');button.type='button';button.textContent=`${i+1}. ${page.name||'이름 없는 장'}`;
   button.onclick=async()=>{if(projectBusy||localTransition)return;const book={...record.book,title:(record.book.title||'만화')+' · '+(i+1)+'장 복구',activeId:page.id,pages:[page]};if(await openBookData(book)){host.replaceChildren();dialog.close()}else $('localProjectMessage').textContent='이 장을 열지 못했습니다. 다른 장을 선택하거나 파일로 백업해주세요.'};host.append(button);
  }
 }catch(e){$('localProjectMessage').textContent=e.message||'장 목록을 읽지 못했습니다.'}finally{setProjectBusy(false)}
}
function initProjectStorage(){
 $('openProject').onclick=showLocalProjects;
 $('localProjectsDialog').addEventListener('close',()=>$('localRecoveryPages').replaceChildren());
 $('closeLocalProjects').onclick=()=>{$('localRecoveryPages').replaceChildren();$('localProjectsDialog').close()};
 $('openProjectFile').onclick=()=>{$('localRecoveryPages').replaceChildren();$('localProjectsDialog').close();$('projectFile').click()};
 $('retryAutosave').onclick=async()=>{if(!projectBusy){if(localChanges===localSaved)scheduleProjectSave();await saveLocalProject(true)}};
 document.addEventListener('compositionstart',()=>{localComposing=true},true);
 document.addEventListener('compositionend',()=>{localComposing=false},true);
 document.addEventListener('pointerdown',e=>localActivePointers.add(e.pointerId),true);
 for(const type of ['pointerup','pointercancel'])document.addEventListener(type,e=>localActivePointers.delete(e.pointerId),true);
 window.addEventListener('blur',()=>{localActivePointers.clear();localComposing=false});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveLocalProject()});
 window.addEventListener('pagehide',()=>{saveLocalProject()});
 window.addEventListener('beforeunload',e=>{if(localChanges!==localSaved){e.preventDefault();e.returnValue=''}});
 // Do not silently replace the initial document or create empty saved projects.
 readLocal('summaries').then(rows=>{if(rows.length&&localChanges===0&&!projectDirty&&!projectBusy&&!document.querySelector('dialog[open]'))showLocalProjects()}).catch(()=>localSaveStatus('자동저장 사용 불가 · 파일로 저장',true));
}
initProjectStorage();
