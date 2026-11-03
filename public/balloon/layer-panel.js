'use strict';
function editorLayerEntries(){return [...[...state.items].reverse().map(object=>({type:'balloon',object})),...orderedImageLayers().reverse().map(object=>({type:'image',object})),...[...(state.panels||[])].reverse().map(object=>({type:'panel',object}))]}
function editorLayerVisible(entry){return entry.object.visible!==false&&(entry.type!=='image'||!entry.object.panelId||(state.panels||[]).find(p=>p.id===entry.object.panelId)?.visible!==false)}
function editorLayerName(entry){const o=entry.object;if(entry.type==='panel')return '컷 프레임 '+((state.panels||[]).indexOf(o)+1);if(entry.type==='image')return o.name||'이미지';return o.text?.replace(/\n/g,' ').trim()||'빈 말풍선'}
function editorLayerType(entry){const o=entry.object;if(entry.type==='panel')return '프레임';if(entry.type==='balloon')return o.kind==='text'?'텍스트':o.kind==='asset'?'PNG 에셋':'말풍선';return o.kind?'템플릿':'이미지'}
function toggleEditorLayer(entry){
 if(projectBusy)return;const list=entry.type==='balloon'?state.items:entry.type==='panel'?state.panels:state.imageLayers;if(!list?.includes(entry.object))return;
 checkpoint();const o=entry.object;o.visible=o.visible===false;
 if(!o.visible){if(entry.type==='balloon'){if(selected===o.id)selected=null;pickedBalloons.delete(o.id)}else if(entry.type==='image'){if(imageLayerSelected===o.id)imageLayerSelected=null}else{if(selectedPanel===o.id){selectedPanel=null;panelEditMode=false}const l=(state.imageLayers||[]).find(l=>l.id===imageLayerSelected);if(l?.panelId===o.id)imageLayerSelected=null}drag=null;imageLayerDrag=null;imageLayerEraser=false;socialOcclusionMode=false;protrusionMode=null;protrusionDrag=null;panelDrag=null;}
 sync();status(editorLayerName(entry)+(o.visible?' 표시했어.':' 숨겼어. 눈 버튼을 다시 누르면 표시돼.'));
}
function selectEditorLayer(entry,e){
 if(projectBusy)return;const o=entry.object;
 if(entry.type==='balloon'){imageLayerSelected=null;pickBalloon(o.id,e.shiftKey||window.mobileMultiSelect)}
 else if(entry.type==='image')selectImageLayer(o);
 else{selected=null;imageLayerSelected=null;selectedPanel=o.id;panelEditMode=true;setTool('select');sync()}
}
// Keep DOM nodes and decoded thumbnail elements stable while text is edited.
const editorLayerRows=new Map();let editorLayerHost=null,editorLayerEmpty=null;
const editorEyeOpen='<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',editorEyeClosed='<path d="m3 3 18 18M10.6 5.1 12 5c6.5 0 10 7 10 7a20 20 0 0 1-3 3.7M6.2 6.2A23 23 0 0 0 2 12s3.5 7 10 7a13 13 0 0 0 5.8-1.4M10 10a3 3 0 0 0 4 4"/>';
function layerValue(node,key,value){if(node[key]!==value)node[key]=value}
function layerAttribute(node,key,value){if(node.getAttribute?.(key)!==value)node.setAttribute(key,value)}
function createEditorLayerRow(entry){
 const row=document.createElement('div'),eye=document.createElement('button'),select=document.createElement('button'),thumb=document.createElement('span'),copy=document.createElement('span'),kind=document.createElement('small'),title=document.createElement('span');
 eye.type=select.type='button';eye.className='layer-eye';thumb.className='layer-thumb';copy.className='layer-copy';copy.append(kind,title);select.append(thumb,copy);row.append(eye,select);
 const binding={entry,row,eye,select,thumb,kind,title,source:null,eyeState:null};
 eye.onclick=e=>{e.stopPropagation();toggleEditorLayer(binding.entry)};
 select.onclick=e=>selectEditorLayer(binding.entry,e);
 return binding;
}
function updateEditorLayerRow(binding,entry){
 binding.entry=entry;const {row,eye,select,thumb,kind,title}=binding,o=entry.object,visible=editorLayerVisible(entry),name=editorLayerName(entry),hidden=o.visible===false;
 layerValue(row,'className','layer-entry'+(!visible?' layer-hidden':''));
 layerValue(eye,'title',(hidden?'표시':'숨기기')+' · '+name);layerAttribute(eye,'aria-label',eye.title);layerAttribute(eye,'aria-pressed',String(!hidden));layerValue(eye,'disabled',projectBusy);
 if(binding.eyeState!==hidden){eye.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(hidden?editorEyeClosed:editorEyeOpen)+'</svg>';binding.eyeState=hidden}
 const active=entry.type==='balloon'?pickedBalloons.has(o.id):entry.type==='image'?imageLayerSelected===o.id:selectedPanel===o.id;
 layerValue(select,'className','layer layer-select'+(active?' active':''));layerValue(select,'disabled',projectBusy);layerValue(select,'title',name);
 const src=(entry.type==='image'?(o.src||o.media||(typeof o.avatar==='string'?o.avatar:o.avatar?.src)):entry.type==='balloon'&&o.kind==='asset'?referenceImages.get(o.assetId)?.src:'')||'';
 const icon=entry.type==='panel'?'▣':entry.type==='image'?'▧':o.kind==='text'?'T':'▱',source=src||icon;
 if(binding.source!==source){thumb.replaceChildren();if(src){const img=document.createElement('img');img.src=src;img.alt='';img.loading='lazy';img.decoding='async';thumb.append(img)}else thumb.textContent=icon;binding.source=source}
 layerValue(kind,'textContent',editorLayerType(entry)+(hidden?' · 숨김':!visible?' · 프레임 숨김':''));layerValue(title,'textContent',name);
}
function renderLayerList(changedId){
 const host=$('layers');if(!host)return;
 if(editorLayerHost!==host){editorLayerRows.clear();editorLayerEmpty=null;editorLayerHost=host}
 if(changedId){const object=state.items.find(o=>o.id===changedId),binding=editorLayerRows.get('balloon:'+changedId);if(object&&binding){updateEditorLayerRow(binding,{type:'balloon',object});return}}
 const entries=editorLayerEntries(),keys=new Set(entries.map(e=>e.type+':'+e.object.id));
 for(const [key,binding]of editorLayerRows)if(!keys.has(key)){host.removeChild(binding.row);editorLayerRows.delete(key)}
 layerValue($('count'),'textContent',String(entries.length));
 if(!entries.length){if(!editorLayerEmpty){editorLayerEmpty=document.createElement('p');editorLayerEmpty.className='hint';editorLayerEmpty.textContent='추가한 말풍선·텍스트·이미지·프레임이 여기에 표시돼요.';host.append(editorLayerEmpty)}return}
 if(editorLayerEmpty){host.removeChild(editorLayerEmpty);editorLayerEmpty=null}
 entries.forEach((entry,i)=>{const key=entry.type+':'+entry.object.id;let binding=editorLayerRows.get(key);if(!binding){binding=createEditorLayerRow(entry);editorLayerRows.set(key,binding)}updateEditorLayerRow(binding,entry);if(host.children[i]!==binding.row){if(host.children[i])host.insertBefore(binding.row,host.children[i]);else host.append(binding.row)}});
}
function initLayerPanel(){const group=$('layers')?.closest('[data-mobile-section]');if(!group)return;const first=group.parentElement.querySelector('[data-mobile-section]');if(first!==group)first.before(group);const hint=document.createElement('p');hint.className='hint';hint.textContent='눈 버튼으로 표시·숨김 · 이름을 눌러 선택';$('layers').before(hint)}
