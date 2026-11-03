'use strict';
const exportFormats={png:{mime:'image/png',extension:'png',label:'PNG'},webp:{mime:'image/webp',extension:'webp',label:'WEBP'},jpg:{mime:'image/jpeg',extension:'jpg',label:'JPG'}};
let exportingImage=false;
function paintArtworkScene(c){if(typeof inkWithOutput==='function')return inkWithOutput(()=>paintArtworkSceneCore(c));return paintArtworkSceneCore(c)}
function paintArtworkSceneCore(c){c.fillStyle='#ffffff';c.fillRect(0,0,state.width,state.height);if(bg)c.drawImage(bg,0,0,state.width,state.height);drawPatches(c);drawPanelBase(c);drawImageLayers(c);drawPanelProtrusions(c,'below');drawPanelFrames(c);drawImageLayers(c,'above');drawPanelProtrusions(c);drawAllBalloons(c)}
function encodeArtwork(canvas,format,quality){const spec=exportFormats[format];if(!spec)return Promise.reject(Error('지원하지 않는 저장 형식입니다.'));const q=Math.max(.01,Math.min(1,Number(quality)/100||.92));return new Promise((resolve,reject)=>canvas.toBlob(blob=>{if(!blob)return reject(Error('이미지를 만들지 못했습니다. 이미지 크기를 확인해주세요.'));if(blob.type!==spec.mime)return reject(Error(`이 브라우저에서 ${spec.label} 저장을 지원하지 않습니다. PNG를 선택해주세요.`));resolve(blob)},spec.mime,format==='png'?undefined:q))}
function updateExportSettings(){
 const all=$('exportScope').value==='all',format=$('exportFormat').value||'png',spec=exportFormats[format];
 $('exportFormatGroup').hidden=all;$('exportQualityGroup').hidden=all||format==='png';$('exportQualityValue').value=$('exportQuality').value+'%';
 $('exportResolution').textContent=all?`${projectBook.pages.length}장 · 각 장의 원본 해상도`:`${state.width} × ${state.height} px · 현재 이미지`;
 $('exportDescription').textContent=all?'프로젝트의 모든 장을 순서대로 PNG로 저장해 ZIP 파일 하나로 내려받습니다. 말풍선·식자·에셋이 함께 포함됩니다.':format==='png'?'무손실로 저장합니다. 글자와 선을 선명하게 보관할 때 적합합니다.':'화질을 낮추면 용량을 줄일 수 있습니다. 대사와 가는 선의 선명도를 확인해주세요.';
 $('exportFilename').textContent=all?exportSafeName($('title').value)+'_PNG.zip':exportName()+'.'+spec.extension;$('confirmExport').textContent=all?'전체 PNG ZIP 저장':'현재 이미지 저장';
}

async function prepareArtworkAssets(){if(typeof loadAIRetouch==='function')await loadAIRetouch(state);await builtinFontReady;if(state.imageLayers?.some(l=>l.kind==='gameui'&&l.gamePreset===3))await ensureNikkeBonded();if(state.imageLayers?.some(l=>l.kind==='gameui'&&l.gamePreset===4))await loadPixelRpgAssets();await Promise.all((state.imageLayers||[]).filter(l=>l.kind==='gameui'&&l.gamePreset===5).map(loadArknightsAssets));await Promise.all((state.imageLayers||[]).filter(l=>l.kind==='gameui'&&[6,7,8,9].includes(l.gamePreset)).map(l=>loadPokemonAssets(l)));await ensureCustomDocumentFonts(state);if(typeof loadLimbusAssets==='function')await Promise.all((state.imageLayers||[]).filter(l=>l.kind==='gameui'&&l.gamePreset===10).map(loadLimbusAssets));await ensureSocialIconFonts();await ensureDocumentComicFonts();await loadBalloonAssets(state.items);await document.fonts.ready;}
async function saveArtwork(format,quality){if(projectBusy||exportingImage)return;exportingImage=true;setProjectBusy(true);$('exportFields').disabled=true;$('cancelExport').disabled=true;$('exportResult').textContent='이미지를 저장하고 있습니다…';try{await prepareArtworkAssets();const out=document.createElement('canvas');out.width=state.width;out.height=state.height;const c=out.getContext('2d');paintArtworkScene(c);const blob=await encodeArtwork(out,format,quality);download(blob,exportName()+'.'+exportFormats[format].extension);$('exportDialog').close();status(`원본 해상도 ${state.width} × ${state.height}px의 ${exportFormats[format].label}를 저장했습니다.`)}catch(e){$('exportResult').textContent=e.message||'이미지를 저장하지 못했습니다. 다시 시도해주세요.';status('이미지 저장에 실패했습니다. 내보내기 창을 확인해주세요.')}finally{exportingImage=false;setProjectBusy(false);$('exportFields').disabled=false;$('cancelExport').disabled=false}}
function initExport(){
 $('export').onclick=()=>{if(projectBusy)return;$('exportResult').textContent='';$('exportScope').value='current';$('exportProgress').hidden=true;updateExportSettings();$('exportDialog').showModal()};
 $('exportScope').onchange=$('exportFormat').onchange=updateExportSettings;$('exportQuality').oninput=updateExportSettings;
 $('cancelExport').onclick=()=>{if(batchExportJob){cancelProjectExport();return}if(!exportingImage)$('exportDialog').close()};
 $('exportDialog').addEventListener('cancel',e=>{if(exportingImage){e.preventDefault();if(batchExportJob)cancelProjectExport()}});
 $('exportForm').onsubmit=e=>{e.preventDefault();if($('exportScope').value==='all')saveProjectPNGZip();else saveArtwork($('exportFormat').value,$('exportQuality').value)};
}
