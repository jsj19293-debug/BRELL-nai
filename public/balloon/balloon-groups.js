'use strict';
let pickedBalloons=new Set(),pickedDocument=null;
const sharedBalloonKeys=['fill','stroke','strokeWidth','borderStyle','dashGap','opacity','opaqueStroke'];
function connectable(b){return b&&!b.statusUI&&!['text','asset'].includes(b.kind)}
function objectGroupMembers(b){return b?.objectGroup?state.items.filter(o=>o.visible!==false&&o.objectGroup===b.objectGroup):b?[b]:[];}
function normalizePicked(){
 if(pickedDocument!==state||!selected){pickedBalloons.clear();pickedDocument=state;}
 for(const id of pickedBalloons)if(!state.items.some(b=>b.id===id))pickedBalloons.delete(id);
 if(selected&&!pickedBalloons.has(selected))pickedBalloons=new Set([selected]);
 const groups=new Set(state.items.filter(b=>pickedBalloons.has(b.id)&&b.visible!==false).map(b=>b.objectGroup).filter(Boolean));
 for(const b of state.items)if(b.visible!==false&&groups.has(b.objectGroup))pickedBalloons.add(b.id);
}
function pickBalloon(id,extend){
 if(id&&typeof exitPanelEditing==='function')exitPanelEditing();balloonOpacityDismissed=null;imageLayerSelected=null;imageLayerEraser=false;normalizePicked();
 const unit=objectGroupMembers(state.items.find(b=>b.id===id));
 if(extend&&id){const remove=unit.every(b=>pickedBalloons.has(b.id));for(const b of unit)if(remove)pickedBalloons.delete(b.id);else pickedBalloons.add(b.id);selected=pickedBalloons.has(id)?id:[...pickedBalloons].at(-1)||null;}
 else{selected=id;pickedBalloons=new Set(unit.map(b=>b.id));}
 pickedDocument=state;sync();
}
function chosenBalloons(){normalizePicked();return state.items.filter(b=>b.visible!==false&&pickedBalloons.has(b.id))}
function deleteChosenBalloons(){
 if(projectBusy)return;
 const chosen=chosenBalloons();if(!chosen.length)return;
 if(typeof cancelMultiMove==='function')cancelMultiMove();
 const ids=new Set(chosen.map(b=>b.id)),groups=new Set(chosen.map(b=>b.objectGroup).filter(Boolean));
 checkpoint();state.items=state.items.filter(b=>!ids.has(b.id)&&!groups.has(b.objectGroup));
 selected=null;imageLayerSelected=null;pickedBalloons.clear();pickedDocument=state;drag=null;sync();
 status(`${chosen.length}개 선택 항목을 삭제했습니다.`);
}
function duplicateChosenBalloons(source=null,active=selected,offset=25,fonts=[]){
 if(projectBusy)return false;
 const chosen=source||chosenBalloons();if(!chosen.length)return false;
 if(state.items.length+chosen.length>500){status('한 장에는 요소를 500개까지 넣을 수 있어요.');return false;}
 const groups=new Map(),objectGroups=new Map();
 const copies=chosen.map(b=>{
  const n=structuredClone(b);n.id=crypto.randomUUID();n.x+=offset;n.y+=offset;
  if(b.statusUI)n.statusUI=cloneBadStatusUI(b.statusUI);
  if(b.balloonGroup&&chosen.filter(o=>o.balloonGroup===b.balloonGroup).length>1){if(!groups.has(b.balloonGroup))groups.set(b.balloonGroup,crypto.randomUUID());n.balloonGroup=groups.get(b.balloonGroup);}else delete n.balloonGroup;
  if(b.objectGroup){if(!objectGroups.has(b.objectGroup))objectGroups.set(b.objectGroup,crypto.randomUUID());n.objectGroup=objectGroups.get(b.objectGroup);}
  return n;
 });
 checkpoint();if(fonts.length){state.fonts??=[];for(const f of fonts)if(!state.fonts.some(o=>o.id===f.id))state.fonts.push(structuredClone(f));}state.items.push(...copies);selected=copies[chosen.findIndex(b=>b.id===active)]?.id||copies.at(-1).id;
 pickedDocument=state;pickedBalloons=new Set(copies.map(b=>b.id));imageLayerSelected=null;sync();
 status(copies.length>1?`${copies.length}개를 함께 복제했습니다. 선택된 복제본을 옮길 수 있어요.`:'선택한 요소를 복제했습니다.');return true;
}
// A hidden tail and an existing movement group do not change a balloon's type.
function selectionUsesObjectGroup(chosen=chosenBalloons()){return chosen.some(b=>!connectable(b));}
function disconnectionUsesObjectGroup(chosen=chosenBalloons()){return chosen.some(b=>b.objectGroup)&&(selectionUsesObjectGroup(chosen)||!chosen.some(b=>b.balloonGroup));}
function selectedVisualGroup(chosen=chosenBalloons()){
 const id=chosen[0]?.balloonGroup;
 return id&&chosen.every(b=>connectable(b)&&b.balloonGroup===id)?id:null;
}
function movementGroupTargets(chosen=chosenBalloons()){
 const id=selectedVisualGroup(chosen);
 return id?state.items.filter(b=>b.visible!==false&&connectable(b)&&b.balloonGroup===id):chosen;
}
function alreadyMovementGrouped(chosen){return chosen.length>1&&!!chosen[0].objectGroup&&chosen.every(b=>b.objectGroup===chosen[0].objectGroup)}
function connectionActionState(chosen=chosenBalloons()){
 const linked=!!selectedVisualGroup(chosen),targets=movementGroupTargets(chosen),grouped=alreadyMovementGrouped(targets);
 return {linked,grouped,canConnect:!projectBusy&&chosen.length>1&&!selectionUsesObjectGroup(chosen)&&!linked,canGroup:!projectBusy&&targets.length>1&&!grouped,canOpen:!projectBusy&&(chosen.length>1||targets.length>1)};
}
function groupChosenObjects(){
 if(projectBusy)return false;const chosen=movementGroupTargets();if(chosen.length<2||alreadyMovementGrouped(chosen))return false;
 const ids=new Set(chosen.map(b=>b.id)),oldGroups=new Set(chosen.map(b=>b.objectGroup).filter(Boolean));
 checkpoint();const id=crypto.randomUUID();for(const b of state.items)if(ids.has(b.id)||oldGroups.has(b.objectGroup))b.objectGroup=id;
 pickedBalloons=new Set(chosen.map(b=>b.id));
 sync();status(`${chosen.length}개를 이동 그룹으로 묶었습니다. 하나를 끌면 함께 움직여요.`);return true;
}
function handleGroupShortcut(){
 if(projectBusy)return;const action=connectionActionState();if(typeof closeConnectionActions==='function')closeConnectionActions();
 if(action.canConnect)connectBalloons();else if(action.canGroup)groupChosenObjects();
}
function syncBalloonGroups(){
 const chosen=chosenBalloons(),action=connectionActionState(chosen),releaseGroup=disconnectionUsesObjectGroup(chosen);
 $('connectBalloons').disabled=!action.canOpen;$('connectBalloons').textContent='연결';$('connectBalloons').title='말풍선 연결 / 이동 그룹화 선택 · Ctrl+G: 연결 후 이동 그룹화';
 $('disconnectBalloons').disabled=projectBusy||!chosen.some(b=>b.balloonGroup||b.objectGroup);$('disconnectBalloons').textContent=releaseGroup?'그룹 해제':'연결 해제';$('disconnectBalloons').title=releaseGroup?'Ctrl+Shift+G 이동 그룹 해제':'말풍선의 연결만 해제합니다. Ctrl+Shift+G는 이동 그룹을 해제합니다.';
 $('groupHint').textContent='연결 버튼에서 말풍선 연결 / 이동 그룹화를 선택하세요. Ctrl+G: 말풍선 연결 → 한 번 더 누르면 이동 그룹화. Ctrl+Shift+G: 이동 그룹 해제';
 if(typeof syncConnectionActions==='function')syncConnectionActions();
}
function connectBalloons(){
 const chosen=chosenBalloons();if(!connectionActionState(chosen).canConnect)return false;
 checkpoint();const groups=new Set(chosen.map(b=>b.balloonGroup).filter(Boolean)),id=crypto.randomUUID(),style=Object.fromEntries(sharedBalloonKeys.map(k=>[k,current()[k]]));
 for(const b of state.items)if(pickedBalloons.has(b.id)||groups.has(b.balloonGroup)){b.balloonGroup=id;Object.assign(b,style)}
 sync();status('말풍선을 연결했습니다. Ctrl+G를 한 번 더 누르면 함께 이동하는 그룹으로 묶습니다.');return true;
}
function ungroupChosenObjects(){
 if(projectBusy)return;const groups=new Set(chosenBalloons().map(b=>b.objectGroup).filter(Boolean));if(!groups.size)return;
 checkpoint();for(const b of state.items)if(groups.has(b.objectGroup))delete b.objectGroup;
 sync();status('그룹을 해제했습니다.');
}
function disconnectBalloons(){
 if(projectBusy)return;const chosen=chosenBalloons();if(disconnectionUsesObjectGroup(chosen)){ungroupChosenObjects();return;}
 const groups=new Set(chosen.map(b=>b.balloonGroup).filter(Boolean));if(!groups.size)return;
 checkpoint();for(const b of state.items)if(groups.has(b.balloonGroup))delete b.balloonGroup;
 sync();status('말풍선 연결을 해제했습니다.');
}
function shareBalloonStyle(b,key){if(!b.balloonGroup||!sharedBalloonKeys.includes(key))return;for(const other of state.items)if(other.balloonGroup===b.balloonGroup)other[key]=b[key]}
function groupPaths(b){const paths=[basePath(b)];if(b.tail&&canDirectTail(b))paths.push(tailPath(b));return paths}
function drawConnectedBalloons(c,members){members=members.filter(b=>b.visible!==false);if(!members.length)return false;const style=members[0],paths=members.flatMap(groupPaths),pad=style.strokeWidth+3+Math.max(...members.map(b=>b.warp?Math.max(b.w,b.h)*.22:0));
 const bounds=members.map(rotatedBalloonBounds),x=Math.floor(Math.min(...bounds.map(b=>b.left))-pad),y=Math.floor(Math.min(...bounds.map(b=>b.top))-pad),right=Math.ceil(Math.max(...bounds.map(b=>b.right))+pad),bottom=Math.ceil(Math.max(...bounds.map(b=>b.bottom))+pad);
 const layer=document.createElement('canvas');layer.width=right-x;layer.height=bottom-y;const g=layer.getContext('2d');g.translate(-x,-y);g.fillStyle=style.fill;g.strokeStyle=style.stroke;g.lineWidth=style.strokeWidth;g.lineJoin='round';for(const p of paths)g.fill(p);
 if(style.opaqueStroke!==false){c.save();c.globalAlpha=style.opacity;c.drawImage(layer,x,y);c.restore();g.clearRect(x,y,layer.width,layer.height)}if(style.strokeWidth)drawBalloonOutlines(g,paths,x,y,layer.width,layer.height,style);for(const b of members)drawInnerLines(g,b);c.save();if(style.opaqueStroke===false)c.globalAlpha=style.opacity;c.drawImage(layer,x,y);c.restore();let overflow=false;for(const b of members){const o=drawBalloon(c,b,true);if(b.id===selected)overflow=o}return overflow;
}
function drawAllBalloons(c){let overflow=false;const backdrop=b=>typeof isBackdropCensor==='function'&&isBackdropCensor(b);for(const b of state.items)if(b.visible!==false&&backdrop(b)&&!censorsAllArtwork(b))drawBalloon(c,b);const groups=new Map();for(const b of state.items)if(b.visible!==false&&b.balloonGroup&&connectable(b)){if(!groups.has(b.balloonGroup))groups.set(b.balloonGroup,[]);groups.get(b.balloonGroup).push(b)}for(const b of state.items){if(b.visible===false||backdrop(b))continue;const group=groups.get(b.balloonGroup);if(group?.length>1){if(group.at(-1)!==b)continue;const o=drawConnectedBalloons(c,group);if(group.some(m=>m.id===selected))overflow=o}else{const o=drawBalloon(c,b);if(b.id===selected)overflow=o}}for(const b of state.items)if(b.visible!==false&&backdrop(b)&&censorsAllArtwork(b))drawBalloon(c,b);return overflow}
function drawPickedBalloons(c){normalizePicked();c.save();c.strokeStyle='#177c69';c.lineWidth=1.5/zoom;c.setLineDash([5/zoom,4/zoom]);for(const b of state.items)if(b.visible!==false&&b.id!==selected&&pickedBalloons.has(b.id)){c.save();if(typeof hasTextCorners==='function'&&hasTextCorners(b)){const q=cornerBoundary(textCornerLayer(b));c.beginPath();q.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.stroke()}else{applyObjectRotation(c,b);c.strokeRect(b.x,b.y,b.w,b.h)}c.restore();}c.restore()}
function initBalloonGroups(){$('connectBalloons').onclick=()=>{if(typeof toggleConnectionActions==='function')toggleConnectionActions($('connectBalloons'))};$('disconnectBalloons').onclick=disconnectBalloons;if(typeof initConnectionActions==='function')initConnectionActions();syncBalloonGroups()}
