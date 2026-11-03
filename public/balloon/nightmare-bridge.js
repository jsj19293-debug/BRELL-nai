'use strict';
// Nightmare 4 ↔ 말풍선 공방 연결. 같은 출처의 부모 창(Nightmare)이 window.nightmareBridge 를 바로 부른다.
(()=>{
 const blobToDataUrl=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob)});
 let busy=Promise.resolve();
 // 한 번에 하나씩만 (렌더 중에는 state 를 잠시 바꾸기 때문)
 const serial=fn=>(...args)=>{const run=busy.then(()=>fn(...args));busy=run.catch(()=>{});return run};
 async function paintPNG(){await prepareArtworkAssets();const out=document.createElement('canvas');out.width=state.width;out.height=state.height;try{paintArtworkScene(out.getContext('2d'));return await encodeArtwork(out,'png',100)}finally{out.width=out.height=1}}

 window.nightmareBridge={
  version:1,
  /** 편집 중인 그림을 바꾼다 (말풍선 등은 그대로) */
  openImage:serial(async(dataUrl,title)=>{const im=await imageFrom(dataUrl);checkpoint();state.image=dataUrl;state.masks=[];state.width=im.width;state.height=im.height;bg=im;selected=null;cancelRetouch();setTool('select');fit();sync();if(title&&$('title'))$('title').value=title;status('Nightmare에서 이미지를 불러왔습니다.');return {width:im.width,height:im.height}}),
  /** 지금 구성(말풍선 · 대사 · 스티커 · 효과)을 템플릿으로: 그림은 빼고 저장 */
  templateDoc:()=>{const doc=structuredClone(state);doc.image=null;doc.masks=[];return doc},
  /** 지금 그림 위에 템플릿을 입힌다 (되돌리기 가능) */
  applyTemplate:serial(async doc=>{const s=structuredClone(doc);s.image=state.image;s.masks=state.masks||[];if(state.image){s.width=doc.width||state.width;s.height=doc.height||state.height}checkpoint();await restore(JSON.stringify(s));fit();status('템플릿을 입혔습니다.')}),
  /** 지금 화면 그대로 PNG */
  exportPNG:serial(async()=>blobToDataUrl(await paintPNG())),
  /**
   * 편집 화면은 건드리지 않고, 템플릿 + 그림으로 PNG 를 만든다 (씬 자동 후처리).
   * 그림 크기가 템플릿과 다르면 템플릿 크기에 맞춰 그린다.
   */
  render:serial(async(doc,dataUrl)=>{
   const original={state,bg},restoreCaches=captureExportCaches();
   try{
    state=structuredClone(doc);state.masks=[];state.image=dataUrl;bg=await imageFrom(dataUrl);
    if(!state.width||!state.height){state.width=bg.width;state.height=bg.height}
    const fonts=(state.imageLayers||[]).filter(l=>Object.hasOwn(l,'font')).map(l=>[l,l.font]);
    await ensureCustomDocumentFonts(state);await loadBalloonAssets(state.items||[]);await loadImageLayers(state.imageLayers||[]);for(const [layer,font]of fonts)layer.font=font;
    return await blobToDataUrl(await paintPNG());
   }finally{state=original.state;bg=original.bg;restoreCaches()}
  }),
  size:()=>({width:state.width,height:state.height,hasImage:!!state.image}),
  ready:true,
 };
 window.dispatchEvent(new Event('nightmare-bridge-ready'));
})();
