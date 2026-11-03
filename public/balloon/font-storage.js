'use strict';
// Keep original font bytes independently of page state, and embed every referenced
// font in the page document when saving a portable project.
const customFontRecords=new Map(),customFontFaces=new Map(),storedCustomFonts=new Map();
let customFontDbPromise=null,customFontLibraryReady=Promise.resolve(),customFontStorageError=false;
function customFontDatabase(){
 if(customFontDbPromise)return customFontDbPromise;
 customFontDbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open('balloon-studio-fonts',1);req.onupgradeneeded=()=>req.result.createObjectStore('fonts',{keyPath:'id'});req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();customFontDbPromise=null};resolve(db)};req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('다른 공방 탭을 닫고 다시 시도해주세요.'))}).catch(e=>{customFontDbPromise=null;throw e});return customFontDbPromise;
}
async function readCustomFontLibrary(){const db=await customFontDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction('fonts','readonly'),req=tx.objectStore('fonts').getAll();let rows;req.onsuccess=()=>{rows=req.result};tx.oncomplete=()=>resolve(rows||[]);tx.onerror=tx.onabort=()=>reject(tx.error)})}
async function storeCustomFonts(list){const pending=list.filter(f=>storedCustomFonts.get(f.id)!==f.data);if(!pending.length)return;const db=await customFontDatabase();await new Promise((resolve,reject)=>{const tx=db.transaction('fonts','readwrite');for(const f of pending)tx.objectStore('fonts').put({id:f.id,name:f.name,data:f.data});tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error)});for(const f of pending)storedCustomFonts.set(f.id,f.data);customFontStorageError=false}
function validCustomFont(f){return f&&typeof f.id==='string'&&/^custom_[a-zA-Z0-9_-]+$/.test(f.id)&&typeof f.name==='string'&&typeof f.data==='string'&&/^data:/.test(f.data)}
async function loadCustomFonts(list,remember=true){
 const loaded=[];
 for(const f of list){if(!validCustomFont(f))throw Error('잘못된 폰트 데이터');let cached=customFontFaces.get(f.id);if(cached&&cached.data!==f.data)throw Error('같은 폰트 ID에 서로 다른 파일이 있습니다.');
  if(!cached){const promise=(async()=>{const face=new FontFace(f.id,`url(${f.data})`);await face.load();document.fonts.add(face);if(typeof textCornerCache!=='undefined')textCornerCache.clear();if(typeof streamCache!=='undefined')streamCache.clear();return face})();cached={data:f.data,promise};customFontFaces.set(f.id,cached);promise.catch(()=>{if(customFontFaces.get(f.id)===cached)customFontFaces.delete(f.id)})}
  await cached.promise;customFontRecords.set(f.id,{id:f.id,name:f.name,data:f.data});fonts[f.id]=`"${f.id}"`;if(![...$('font').options].some(o=>o.value===f.id))$('font').add(new Option(f.name,f.id));loaded.push(f);
 }
 if(remember&&loaded.length)try{await storeCustomFonts(loaded)}catch{customFontStorageError=true}
}
function allAvailableCustomFonts(doc=state){return [...new Map([...customFontRecords.values(),...(doc.fonts||[])].map(f=>[f.id,f])).values()]}
function referencedCustomFonts(doc){const ids=new Set(),walk=v=>{if(!v||typeof v!=='object')return;for(const[key,value]of Object.entries(v)){if(key==='font'&&typeof value==='string'&&value.startsWith('custom_'))ids.add(value);else if(key!=='fonts')walk(value)}};for(const key of ['items','imageLayers','templates'])walk(doc[key]);return ids}
function projectCustomFontPool(book){const pool=new Map(customFontRecords);for(const p of book.pages||[])for(const f of p.doc.fonts||[])pool.set(f.id,f);return pool}
function embeddedDocumentFonts(doc,pool=customFontRecords){const list=new Map((doc.fonts||[]).map(f=>[f.id,f]));for(const id of referencedCustomFonts(doc)){const f=pool.get(id);if(f&&!list.has(id))list.set(id,f)}return [...list.values()]}
async function prepareBookFonts(book){await customFontLibraryReady;const pool=projectCustomFontPool(book);const projectFonts=new Map();for(const p of book.pages)for(const f of p.doc.fonts||[])projectFonts.set(f.id,f);await loadFonts([...projectFonts.values()]);let changed=false;for(const p of book.pages){const list=embeddedDocumentFonts(p.doc,pool);if(list.length!==(p.doc.fonts||[]).length){p.doc.fonts=list;changed=true}}return changed}
async function ensureCustomDocumentFonts(doc){await customFontLibraryReady;doc.fonts=embeddedDocumentFonts(doc);await loadFonts(doc.fonts)}
async function restoreCustomFontLibrary(){try{const rows=await readCustomFontLibrary();let failed=0;for(const f of rows){try{await loadCustomFonts([f],false);storedCustomFonts.set(f.id,f.data)}catch{failed++}}if(rows.length){$('fontImportResult').textContent=`내 폰트 ${rows.length-failed}개 복원${failed?' · '+failed+'개를 불러오지 못했습니다.':''}`;if(typeof sync==='function')sync()}}catch{customFontStorageError=true;$('fontImportResult').textContent='이 브라우저에서 개인 폰트 보관함을 열지 못했습니다. 폰트는 프로젝트 파일에 함께 저장됩니다.'}}
