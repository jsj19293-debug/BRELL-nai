'use strict';
let connectionAnchor=null,connectionDocument=null,connectionSelection='',connectionActionsReady=false;
function connectionSelectionKey(){return chosenBalloons().map(b=>b.id).sort().join('|')}
function closeConnectionActions(focus=false){
 const anchor=connectionAnchor,popup=$('connectionActions');if(popup)popup.hidden=true;
 for(const id of ['connectBalloons','mobileConnect'])$(id)?.setAttribute('aria-expanded','false');
 connectionAnchor=null;connectionDocument=null;connectionSelection='';
 if(focus&&anchor&&!anchor.disabled)anchor.focus({preventScroll:true});
}
function connectionActionLayout(rect,width,height,viewportWidth,viewportHeight){
 const margin=8,w=Math.min(width,Math.max(0,viewportWidth-margin*2));
 const center=rect.left+rect.width/2,left=Math.max(margin,Math.min(viewportWidth-w-margin,center-w/2));
 // The two choices sit above-left and above-right of the parent connection button.
 return {left,top:Math.max(margin,Math.min(viewportHeight-height-margin,rect.top-height-14)),width:w,stem:Math.max(14,Math.min(w-14,center-left))};
}
function positionConnectionActions(){
 const popup=$('connectionActions');if(!connectionAnchor||!popup||popup.hidden)return;
 const width=Math.min(300,window.innerWidth-16),layout=connectionActionLayout(connectionAnchor.getBoundingClientRect(),width,popup.offsetHeight||60,window.innerWidth,window.innerHeight);
 popup.style.width=layout.width+'px';popup.style.left=layout.left+'px';popup.style.top=layout.top+'px';popup.style.setProperty('--connection-stem',layout.stem+'px');
}
function syncConnectionActions(){
 const popup=$('connectionActions');if(!popup||popup.hidden)return;
 if(projectBusy||connectionDocument!==state||connectionSelection!==connectionSelectionKey()){closeConnectionActions();return}
 const action=connectionActionState();
 $('connectVisualAction').disabled=!action.canConnect;$('groupMovementAction').disabled=!action.canGroup;
 $('connectVisualAction').setAttribute('aria-pressed',String(action.linked));$('groupMovementAction').setAttribute('aria-pressed',String(action.grouped));
 $('connectVisualDescription').textContent=action.linked?'연결됨':selectionUsesObjectGroup()?'말풍선끼리 선택하세요':'바탕·테두리 합치기';
 $('groupMovementDescription').textContent=action.grouped?'이미 함께 이동':'모양 유지·함께 이동';
 if(!action.canOpen){closeConnectionActions();return}positionConnectionActions();
}
function toggleConnectionActions(anchor){
 const popup=$('connectionActions');if(!popup||projectBusy||!connectionActionState().canOpen)return;
 if(connectionAnchor===anchor&&!popup.hidden){closeConnectionActions();return}
 closeConnectionActions();connectionAnchor=anchor;connectionDocument=state;connectionSelection=connectionSelectionKey();
 popup.hidden=false;anchor.setAttribute('aria-expanded','true');syncConnectionActions();
 const first=['connectVisualAction','groupMovementAction'].map($).find(b=>!b.disabled);first?.focus({preventScroll:true});
}
function runConnectionAction(kind){
 const popup=$('connectionActions');if(!popup||popup.hidden)return;
 if(projectBusy||connectionDocument!==state||connectionSelection!==connectionSelectionKey()){closeConnectionActions();return}
 const action=connectionActionState(),enabled=kind==='connect'?action.canConnect:action.canGroup;
 if(!enabled)return;
 closeConnectionActions(true);
 if(kind==='connect')connectBalloons();else groupChosenObjects();
}
function initConnectionActions(){
 if(connectionActionsReady)return;connectionActionsReady=true;
 for(const id of ['connectBalloons','mobileConnect']){$(id).setAttribute('aria-haspopup','dialog');$(id).setAttribute('aria-controls','connectionActions');$(id).setAttribute('aria-expanded','false')}
 $('connectVisualAction').onclick=()=>runConnectionAction('connect');$('groupMovementAction').onclick=()=>runConnectionAction('group');
 document.addEventListener('pointerdown',e=>{const popup=$('connectionActions');if(!connectionAnchor||popup.hidden)return;if(!popup.contains(e.target)&&!connectionAnchor.contains(e.target))closeConnectionActions()},true);
 document.addEventListener('keydown',e=>{
  const popup=$('connectionActions');if(!connectionAnchor||popup.hidden)return;
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeConnectionActions(true);return}
  if(!popup.contains(e.target)||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  e.preventDefault();const options=['connectVisualAction','groupMovementAction'].map($).filter(b=>!b.disabled);if(!options.length)return;
  const i=options.indexOf(document.activeElement),next=e.key==='Home'?0:e.key==='End'?options.length-1:(i+(e.key==='ArrowLeft'?options.length-1:1))%options.length;options[next].focus();
 },true);
 document.addEventListener('focusin',e=>{const popup=$('connectionActions');if(connectionAnchor&&!popup.hidden&&!popup.contains(e.target)&&!connectionAnchor.contains(e.target))closeConnectionActions()});
 window.addEventListener('resize',()=>closeConnectionActions());window.addEventListener('scroll',()=>closeConnectionActions(),true);
}
