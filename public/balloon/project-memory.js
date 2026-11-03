'use strict';
// Budgets apply across the whole book, not once per page. Never alter documents.
const PROJECT_HISTORY_CHARS=24*1024*1024;
function trimProjectHistory(){
 const currentStacks=[history,future],seen=new Set(currentStacks),older=[];
 if(typeof projectBook!=='undefined')for(const p of projectBook?.pages||[])for(const stack of [p.history,p.future])if(Array.isArray(stack)&&!seen.has(stack)){seen.add(stack);older.push(stack)}
 const stacks=[...older,...currentStacks];
 let size=stacks.reduce((sum,stack)=>sum+stack.reduce((n,s)=>n+s.length,0),0);
 for(const stack of stacks)while(size>PROJECT_HISTORY_CHARS&&stack.length){size-=stack.shift().length}
}
function pruneProjectImages(doc){
 if(typeof clearDesktopWindowCache==='function')clearDesktopWindowCache();if(typeof clearInkCache==='function')clearInkCache();if(typeof clearAIComposite==='function')clearAIComposite();
 const ids=new Set((doc.imageLayers||[]).map(l=>l.id)),sources=new Set();
 const walk=v=>{if(typeof v==='string'){if(v.startsWith('data:image/')||v.startsWith('blob:'))sources.add(v);return}if(!v||typeof v!=='object')return;for(const [key,value]of Object.entries(v))if(key!=='fonts')walk(value)};
 walk(doc);
 const prune=(map,keep)=>{for(const key of map.keys())if(!keep.has(key))map.delete(key)};
 // These caches are reloadable from the active document. Shared bundled artwork
 // and pending loaders are deliberately retained. Prune only at load boundaries.
 for(const map of [
  typeof imageLayerImages!=='undefined'?imageLayerImages:null,
  typeof imageLayerCache!=='undefined'?imageLayerCache:null,
  typeof postMediaImages!=='undefined'?postMediaImages:null,
  typeof postAvatarImages!=='undefined'?postAvatarImages:null,
  typeof postCardCache!=='undefined'?postCardCache:null,
  typeof postMaskCache!=='undefined'?postMaskCache:null,
  typeof cameraThumbs!=='undefined'?cameraThumbs:null,
  typeof cameraCache!=='undefined'?cameraCache:null,
  typeof phoneFrameCache!=='undefined'?phoneFrameCache:null,
  typeof polaroidCardCache!=='undefined'?polaroidCardCache:null,
  typeof streamCache!=='undefined'?streamCache:null,
  typeof profileCache!=='undefined'?profileCache:null,
  typeof messengerCache!=='undefined'?messengerCache:null,
  typeof snsProfileCache!=='undefined'?snsProfileCache:null
 ])if(map)prune(map,ids);
 for(const map of [
  typeof aiPatchImages!=='undefined'?aiPatchImages:null,
  typeof imageEraseSelections!=='undefined'?imageEraseSelections:null,
  typeof protrusionMasks!=='undefined'?protrusionMasks:null,
  typeof profilePhotos!=='undefined'?profilePhotos:null,
  typeof erostePhotos!=='undefined'?erostePhotos:null,
  typeof messengerPhotos!=='undefined'?messengerPhotos:null,
  typeof snsProfilePhotos!=='undefined'?snsProfilePhotos:null,
  typeof streamAvatars!=='undefined'?streamAvatars:null,
  typeof arkImageCache!=='undefined'?arkImageCache:null,
  typeof goldBattleSprites!=='undefined'?goldBattleSprites:null,
  typeof limbusImages!=='undefined'?limbusImages:null
 ])if(map)for(const key of map.keys())if((key.startsWith('data:image/')||key.startsWith('blob:'))&&!sources.has(key))map.delete(key);
}
// Avoid one giant JSON string (and its engine string-length ceiling). Blob parts
// are encoded a page at a time; normal v3 JSON remains portable and unchanged.
function projectBookBlob(book){
 const parts=['{'];let separator='';
 for(const key of Object.keys(book)){parts.push(separator,JSON.stringify(key),':');separator=',';if(key==='pages'&&Array.isArray(book.pages)){parts.push('[');book.pages.forEach((p,i)=>parts.push(...(i?[',']:[]),new Blob([JSON.stringify(p)])));parts.push(']')}else parts.push(new Blob([JSON.stringify(book[key])]))}
 parts.push('}');return new Blob(parts,{type:'application/json'});
}
