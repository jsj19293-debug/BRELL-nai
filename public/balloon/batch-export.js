'use strict';
let batchExportJob=null;
function batchExportRendering(){return !!batchExportJob?.rendering}
function cancelProjectExport(){if(batchExportJob){batchExportJob.cancelled=true;$('exportResult').textContent='취소하고 현재 작업으로 돌아오는 중…';$('cancelExport').disabled=true}}
function batchExportCheck(job){if(job.cancelled)throw Object.assign(Error('일괄 저장을 취소했습니다.'),{name:'AbortError'})}
function batchExportYield(){return new Promise(resolve=>setTimeout(resolve,0))}
function captureExportCaches(){
 const maps=[
  typeof imageLayerImages!=='undefined'?imageLayerImages:null,typeof imageLayerCache!=='undefined'?imageLayerCache:null,
  typeof postMediaImages!=='undefined'?postMediaImages:null,typeof postAvatarImages!=='undefined'?postAvatarImages:null,
  typeof postCardCache!=='undefined'?postCardCache:null,typeof postMaskCache!=='undefined'?postMaskCache:null,
  typeof aiPatchImages!=='undefined'?aiPatchImages:null,
  typeof imageEraseSelections!=='undefined'?imageEraseSelections:null,typeof protrusionMasks!=='undefined'?protrusionMasks:null,
  typeof profilePhotos!=='undefined'?profilePhotos:null,typeof profileCache!=='undefined'?profileCache:null,
  typeof erostePhotos!=='undefined'?erostePhotos:null,typeof messengerPhotos!=='undefined'?messengerPhotos:null,
  typeof messengerCache!=='undefined'?messengerCache:null,typeof snsProfilePhotos!=='undefined'?snsProfilePhotos:null,
  typeof snsProfileCache!=='undefined'?snsProfileCache:null,typeof streamAvatars!=='undefined'?streamAvatars:null,
  typeof streamCache!=='undefined'?streamCache:null,typeof cameraThumbs!=='undefined'?cameraThumbs:null,
  typeof cameraCache!=='undefined'?cameraCache:null,typeof phoneFrameCache!=='undefined'?phoneFrameCache:null,
  typeof polaroidCardCache!=='undefined'?polaroidCardCache:null,typeof arkImageCache!=='undefined'?arkImageCache:null,
  typeof goldBattleSprites!=='undefined'?goldBattleSprites:null,typeof limbusImages!=='undefined'?limbusImages:null,
  typeof customAssetRegistry!=='undefined'?customAssetRegistry:null,typeof referenceImages!=='undefined'?referenceImages:null,typeof referenceSourceLoads!=='undefined'?referenceSourceLoads:null,
  typeof stickerTintCache!=='undefined'?stickerTintCache:null,typeof stickerWarpCache!=='undefined'?stickerWarpCache:null,
  typeof textCornerCache!=='undefined'?textCornerCache:null
 ].filter(Boolean).map(map=>({map,entries:new Map(map)}));
 const cleanup=typeof cleanupCache!=='undefined'?{cache:cleanupCache,key:cleanupKey,background:cleanupBackground}:null;
 return ()=>{for(const {map,entries}of maps){map.clear();for(const [key,value]of entries)map.set(key,value)}if(cleanup){cleanupCache=cleanup.cache;cleanupKey=cleanup.key;cleanupBackground=cleanup.background}};
}
async function renderBatchPagePNG(page,job,pool,original,restoreCaches){
 let out=null;
 try{
  batchExportCheck(job);
  // Clone only the page being rendered. Legacy loaders may repair defaults;
  // those repairs must not change the editor document or its undo snapshots.
  state=structuredClone(page.doc);state.fonts=embeddedDocumentFonts(state,pool);
  bg=state.image?(state.image===original.state.image?original.bg:await imageFrom(state.image)):null;
  const fonts=(state.imageLayers||[]).filter(l=>Object.hasOwn(l,'font')).map(l=>[l,l.font]);
  await loadImageLayers(state.imageLayers||[]);for(const [layer,font]of fonts)layer.font=font;await prepareArtworkAssets();batchExportCheck(job);
  out=document.createElement('canvas');out.width=state.width;out.height=state.height;paintArtworkScene(out.getContext('2d'));
  const blob=await encodeArtwork(out,'png',100);batchExportCheck(job);return blob;
 }finally{
  if(out){out.width=out.height=1}state=original.state;bg=original.bg;restoreCaches();
 }
}
async function saveProjectPNGZip(){
 if(projectBusy||exportingImage||batchExportJob||!projectBook?.pages?.length)return false;
 const original={state,bg},active=projectBook.activeId,pages=projectBook.pages.map(p=>({id:p.id,name:p.id===active?($('pageTitle').value.trim()||p.name):p.name,doc:p.id===active?state:p.doc}));
 const pool=projectCustomFontPool({pages}),restoreCaches=captureExportCaches(),zip=new PNGProjectZip(),job={cancelled:false,rendering:true};
 const filename=exportSafeName($('title').value)+'_PNG.zip';let pageLabel='',completed=0,success=false;
 batchExportJob=job;exportingImage=true;setProjectBusy(true);$('exportFields').disabled=true;$('cancelExport').disabled=false;$('cancelExport').textContent='일괄 저장 취소';$('exportProgress').hidden=false;$('exportProgress').max=pages.length;$('exportProgress').value=0;
 try{
  for(const [i,page]of pages.entries()){
   pageLabel=String(i+1).padStart(3,'0')+'_'+exportSafeName(page.name,'이미지');
   $('exportResult').textContent=`${i+1} / ${pages.length}장 출력 중 · ${page.name}`;await batchExportYield();batchExportCheck(job);
   const blob=await renderBatchPagePNG(page,job,pool,original,restoreCaches);
   await zip.add(pageLabel+'.png',blob,()=>batchExportCheck(job));completed++;$('exportProgress').value=completed;
  }
  pageLabel='ZIP 파일';$('exportResult').textContent='ZIP 파일을 만드는 중…';await batchExportYield();batchExportCheck(job);
  const blob=zip.finish();download(blob,filename);success=true;$('exportDialog').close();status(`프로젝트 ${completed}장을 원본 해상도 PNG로 묶어 ZIP으로 저장했습니다.`);return true;
 }catch(e){
  const message=e?.name==='AbortError'?'일괄 저장을 취소했습니다. 현재 작업은 유지됩니다.':`${pageLabel||'프로젝트'} 저장 실패 · ${e?.message||'이미지를 만들지 못했습니다.'}`;
  $('exportResult').textContent=message;status(message);return false;
 }finally{
  zip.dispose();state=original.state;bg=original.bg;restoreCaches();job.rendering=false;batchExportJob=null;exportingImage=false;setProjectBusy(false);$('exportFields').disabled=false;$('cancelExport').disabled=false;$('cancelExport').textContent='닫기';$('exportProgress').hidden=true;
  try{sync()}catch{if(success)status('ZIP을 저장했습니다. 화면을 다시 확인해주세요.')}
 }
}
