'use strict';
// Nightmare 4 후처리 팝업용: ?mode=post 로 열면 말풍선 · 에셋 · 이미지 템플릿만 남긴다.
(()=>{
 if(new URLSearchParams(location.search).get('mode')!=='post')return;
 document.body.classList.add('nm-post');
 const sections=[...document.querySelectorAll('.left>[data-mobile-section]')];
 const bySection=name=>sections.find(s=>s.dataset.mobileSection===name);
 // 이미지 · 레이어(지우기 도구) · 대사 단축 칸은 숨긴다.
 for(const name of ['image','tools assets','text']){const s=bySection(name);if(s){s.dataset.mobileSection='';s.classList.add('nm-hidden')}}
 // 이미지 템플릿(윈도우 창 · 프레임/템플릿)만 남기고 에셋 탭에서 보이게.
 const templates=bySection('image tools');
 if(templates){
  templates.dataset.mobileSection='assets';
  const keepIds=new Set(['desktopWindowTemplateOpen','imageLayerHint']);
  let inTemplateBlock=false;
  for(const child of [...templates.children]){
   const label=child.classList.contains('section-label')?child.textContent.trim():'';
   if(label)inTemplateBlock=label.includes('이미지 템플릿');
   const keep=keepIds.has(child.id)||(inTemplateBlock&&(label||child.matches('button.import')||child.hidden))||child.matches('[id$="TemplatePanel"],.stream-mode-tabs');
   if(!keep)child.classList.add('nm-hidden');
  }
 }
 // 이미지 템플릿을 에셋 목록 위로 (긴 에셋 목록 아래에 묻히지 않게)
 const assetsBlock=bySection('balloons assets');if(templates&&assetsBlock)assetsBlock.parentElement.insertBefore(templates,assetsBlock);
 for(const tab of document.querySelectorAll('[data-desktop-tab]'))if(!['balloons','assets'].includes(tab.dataset.desktopTab))tab.classList.add('nm-hidden');
 const style=document.createElement('style');
 style.textContent='.nm-hidden,body.nm-post .studio-header,body.nm-post #toolRegionOCR,body.nm-post #toolAIRetouch,body.nm-post #imageLayerEraser,body.nm-post #addImageLayer,body.nm-post label:has(>#imageLayerBrush){display:none!important}@media(min-width:801px){body.nm-post #projectSurface{height:100dvh!important}}';
 document.head.append(style);
 if(typeof setDesktopStudioTab==='function')setDesktopStudioTab('assets');
})();
