'use strict';
const erosteStatusInputs=new Map(),erosteStatusSections=new Map(),erosteStatusPhaseInputs=new Map();
let erosteStatusDrag=null;
const EROSTE_CYCLE_RING={x:1106,y:667,radius:56},EROSTE_STATUS_PINK='#c45a9d';
function erosteCycleTotal(l){return Math.max(...ensureErosteStatus(l).phases.map(p=>p.end))}
function erosteCycleAngle(p){return(Math.atan2(p.y-EROSTE_CYCLE_RING.y,p.x-EROSTE_CYCLE_RING.x)+Math.PI/2+Math.PI*2)%(Math.PI*2)}
const statusNameIndices=erosteStatusFields.flatMap((f,i)=>f.value==='세리나'?[i]:[]);
const statusIndex=label=>erosteStatusFields.findIndex(f=>f.group==='임신 정보'&&f.label===label);
const erosteStatusBodyInputs=new Map();
const erosteBodyStages=[
 {name:'피로도',labels:['매우 양호','양호','다소 피곤','피곤','매우 피곤']},
 {name:'청결도',labels:['매우 불결','불결','보통','깨끗함','매우 깨끗함']},
 {name:'스트레스',labels:['안정된 상태','가벼운 긴장','긴장된 상태','스트레스 높음','매우 불안정']},
 {name:'요의',labels:['거의 없음','여유 있음','절반 정도','많이 참','매우 가득 참']},
 {name:'배변욕',labels:['편안함','정상','가벼운 신호','배변 필요','강한 배변 신호']}
];
function erosteBodyIndex(name,kind){return erosteStatusFields.findIndex(f=>f.group==='신체 상태'&&f.label===name+' '+kind)}
function ensureErosteBody(l){for(const [oldName,newName,row]of [['배뇨량','요의',4],['배변 상태','배변욕',5]]){const index=erosteStatusFields.findIndex(f=>f.group==='신체 상태'&&f.label===row+'. 항목');if(l.statusValues[index]===oldName)l.statusValues[index]=newName}if(l.statusBodyAuto===undefined)l.statusBodyAuto=erosteBodyStages.map(({name})=>{const i=erosteBodyIndex(name,'설명');return l.statusValues[i]===erosteStatusFields[i].value});return l.statusBodyAuto}
function erosteBodyDescription(l,i){const {name,labels}=erosteBodyStages[i];return ensureErosteBody(l)[i]?labels[Math.min(4,Math.max(0,Math.ceil(l.statusValues[erosteBodyIndex(name,'수치')]/20)-1))]:l.statusValues[erosteBodyIndex(name,'설명')]}
const statusPhaseNames=['난포기','배란기','월경','황체기'];
function ensureErosteStatus(l){if(l.statusName===undefined)l.statusName=statusNameIndices.map(i=>l.statusValues[i]).find(v=>v!=='세리나')||l.statusValues[statusNameIndices[0]];if(!l.statusCycle){const day=Number(String(l.statusValues[statusIndex('주기 일수')]).match(/\d+/)?.[0])||6;l.statusCycle={day,pregnant:false,eggLaying:false,phases:statusPhaseNames.map((name,i)=>{const desc=String(l.statusValues[statusIndex(name+' 설명')]),days=desc.match(/(\d+)일?\s*~\s*(\d+)/),fallback=[[6,10],[11,16],[1,5],[17,28]][i];return{start:days?Number(days[1]):fallback[0],end:days?Number(days[2]):fallback[1],description:desc.split('\n')[0]}})}}return l.statusCycle}
function validateErosteStatusExtras(l){if(l.statusBodyAuto!==undefined&&(!Array.isArray(l.statusBodyAuto)||l.statusBodyAuto.length!==5||l.statusBodyAuto.some(v=>typeof v!=='boolean')))throw Error('신체 상태 설명 설정이 올바르지 않습니다.');if(l.statusName!==undefined&&(typeof l.statusName!=='string'||l.statusName.length>2000))throw Error('이름 정보가 올바르지 않습니다.');const q=l.statusCycle;if(q!==undefined&&(!q||!Number.isInteger(q.day)||q.day<1||q.day>9999||typeof q.pregnant!=='boolean'||typeof q.eggLaying!=='boolean'||!Array.isArray(q.phases)||q.phases.length!==4||q.phases.some(p=>!p||!Number.isInteger(p.start)||!Number.isInteger(p.end)||p.start<1||p.end<p.start||p.end>9999||typeof p.description!=='string'||p.description.length>2000)))throw Error('주기 정보가 올바르지 않습니다.')}
function erosteCyclePhaseIndex(l){const q=ensureErosteStatus(l);return q.phases.findIndex(p=>q.day>=p.start&&q.day<=p.end)}
function erosteCyclePhase(l){const i=erosteCyclePhaseIndex(l);return i<0?'주기 미설정':l.statusValues[statusIndex(statusPhaseNames[i]+' 이름')]}
function erosteStatusDisplayValues(l){ensureErosteBody(l);const q=ensureErosteStatus(l),values=l.statusValues.slice();erosteBodyStages.forEach(({name},i)=>values[erosteBodyIndex(name,'설명')]=erosteBodyDescription(l,i));statusNameIndices.forEach(i=>values[i]=l.statusName);const phase=erosteCyclePhase(l);values[statusIndex('현재 주기')]='현재 주기 : '+phase;values[statusIndex('중앙 주기')]=phase;values[statusIndex('주기 일수')]=q.day+'일째';values[statusIndex('임신 여부')]=(q.eggLaying?'포란 여부    ':'임신 여부    ')+(q.pregnant?(q.eggLaying?'포란 중':'임신 중'):(q.eggLaying?'포란 아님':'임신 아님'));if(q.eggLaying)values[statusIndex('제목')]='포란 정보';q.phases.forEach((p,i)=>values[statusIndex(statusPhaseNames[i]+' 설명')]=p.description+'\n('+p.start+'일~'+p.end+'일)');return values}
function buildErosteStatusControls(l,section,field,photoControls){const cycle=ensureErosteStatus(l);erosteStatusInputs.clear();erosteStatusPhaseInputs.clear();erosteStatusBodyInputs.clear();ensureErosteBody(l);const open=erosteStatusSections.get(l.id)||new Set();erosteStatusSections.set(l.id,open);const sections=new Map(),part=label=>{if(!sections.has(label)){const d=section(label);d.open=open.has(label);d.ontoggle=()=>{if(d.open)open.add(label);else open.delete(label)};sections.set(label,d)}return sections.get(label)};
 const root=$('erosteFields'),actions=document.createElement('div');actions.className='row';for(const [label,on]of[['모두 접기',false],['모두 펼치기',true]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{for(const [title,d]of sections){d.open=on;if(on)open.add(title);else open.delete(title)}};actions.append(b)}root.append(actions);
 const input=(p,label,obj,key,type='text',max=2000,onChange=null,min=0)=>{const lab=document.createElement('label'),e=document.createElement(type==='textarea'?'textarea':'input');lab.textContent=label;if(type!=='textarea')e.type=type;if(type==='checkbox'){e.checked=obj[key];lab.className='check'}else{e.value=obj[key];e.maxLength=2000;e.min=min;e.max=max}const update=()=>{if(projectBusy||currentImageLayer()!==l)return;if(type==='checkbox')checkpoint();else recordInput('eroste-status-'+label);obj[key]=type==='checkbox'?e.checked:type==='number'?Math.max(min,Math.min(max,Math.round(Number(e.value)||min))):e.value.slice(0,2000);onChange?.();updateErosteStatusInputs(l);render()};if(type==='checkbox')e.onchange=update;else{e.onfocus=()=>inputHistoryKey=null;e.oninput=update}lab.append(e);p.append(lab);return e};
 photoControls(part('가운데 캐릭터 이미지 · 빈칸 클릭 / 사진 드래그'),l.main);photoControls(part('현재 파트너 정보'),l.portrait);input(part('기본 정보'),'캐릭터 이름 · 전체 적용',l,'statusName','text',2000,()=>statusNameIndices.forEach(i=>l.statusValues[i]=l.statusName));
 const derived=new Set(['현재 주기','중앙 주기','주기 일수','임신 여부',...statusPhaseNames.map(n=>n+' 설명')]);erosteStatusFields.forEach((f,i)=>{if(statusNameIndices.includes(i)||f.group==='임신 정보'&&derived.has(f.label)||f.group==='신체 상태'&&f.label.endsWith(' 설명'))return;const obj={value:l.statusValues[i]},e=input(part(f.group),f.label,obj,'value',f.number?'number':f.value.includes('\n')?'textarea':'text',f.number?f.max:2000,()=>l.statusValues[i]=obj.value);if(f.gauge)erosteStatusInputs.set(i,e)});
 const bodySection=part('신체 상태');const bodyHint=document.createElement('p');bodyHint.className='hint';bodyHint.textContent='자동 설명은 0~20%, 21~40%, 41~60%, 61~80%, 81~100%의 5단계입니다. 체크를 끄면 직접 입력할 수 있습니다.';bodySection.append(bodyHint);erosteBodyStages.forEach(({name},i)=>{input(bodySection,name+' · 자동 단계 설명',l.statusBodyAuto,i,'checkbox');const index=erosteBodyIndex(name,'설명'),obj={value:l.statusValues[index]},e=input(bodySection,name+' 설명',obj,'value','text',2000,()=>l.statusValues[index]=obj.value);erosteStatusBodyInputs.set(i,e)});updateErosteStatusInputs(l);
 const d=part('임신 정보');const info=document.createElement('p');info.className='hint';info.textContent='주기 일수에 맞는 구간 이름과 원형 게이지가 자동으로 연동됩니다.';d.append(info);const day=input(d,'주기 일수',cycle,'day','number',9999,null,1);erosteStatusInputs.set('cycle-day',day);input(d,'임신 / 포란 상태',cycle,'pregnant','checkbox');input(d,'난생 · 포란으로 표시',cycle,'eggLaying','checkbox');cycle.phases.forEach((p,i)=>{const name=statusPhaseNames[i];input(d,name+' · 설명',p,'description');for(const key of ['start','end']){const e=input(d,name+(key==='start'?' · 시작 일':' · 종료 일'),p,key,'number',9999,()=>{if(key==='start')p.end=Math.max(p.start,p.end);else p.start=Math.min(p.start,p.end)},1);erosteStatusPhaseInputs.set(i+'-'+key,{e,p,key})}});
}
function updateErosteStatusInputs(l){for(const [key,e]of erosteStatusInputs)e.value=key==='cycle-day'?ensureErosteStatus(l).day:l.statusValues[key];for(const {e,p,key}of erosteStatusPhaseInputs.values())e.value=p[key];for(const [i,e]of erosteStatusBodyInputs){e.disabled=l.statusBodyAuto[i];e.value=erosteBodyDescription(l,i)}}
function drawErosteCycleRing(c,l){const q=ensureErosteStatus(l),total=erosteCycleTotal(l),ratio=Math.max(0,Math.min(1,q.day/total)),cx=EROSTE_CYCLE_RING.x,cy=EROSTE_CYCLE_RING.y,r=EROSTE_CYCLE_RING.radius;c.save();c.fillStyle='#fafafa';c.beginPath();c.arc(cx,cy,63,0,Math.PI*2);c.fill();c.lineWidth=4;c.strokeStyle='#dedbdf';c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.stroke();c.strokeStyle='#c45a9d';c.beginPath();c.arc(cx,cy,r,-Math.PI/2,-Math.PI/2+Math.min(ratio*Math.PI*2,Math.PI*2-0.000001));c.stroke();for(const phase of q.phases){const a=-Math.PI/2+(phase.start-1)/total*Math.PI*2;c.fillStyle='#737176';c.beginPath();c.arc(cx+Math.cos(a)*r,cy+Math.sin(a)*r,2.6,0,Math.PI*2);c.fill()}const a=-Math.PI/2+ratio*Math.PI*2;c.fillStyle='#c45a9d';c.beginPath();c.arc(cx+Math.cos(a)*r,cy+Math.sin(a)*r,4,0,Math.PI*2);c.fill();const font='"Studio Messenger",sans-serif';c.textAlign='center';c.textBaseline='top';c.fillStyle='#282828';for(const [text,y,size]of[[l.statusValues[statusIndex('중앙 안내')],636,11],[erosteCyclePhase(l),656,17],[q.day+'일째',685,12]]){c.font='700 '+size+'px '+font;c.fillStyle=y===656?EROSTE_STATUS_PINK:'#282828';c.fillText(text,cx,y,101)}c.restore()}
function erosteStatusLocalPoint(l,p){const r=imageLayerRect(l);return{x:(p.x-r.x)*1536/r.w,y:(p.y-r.y)*864/r.h}}
function beginErosteStatusPointer(e,l,p){
 if(l?.kind!=='eroste'||l.erosteType!=='status'||!l.visible||projectBusy||editTool!=='select'||e.button!==0||e.shiftKey||window.mobileMultiSelect)return false;
 const q=erosteStatusLocalPoint(l,p),ring=EROSTE_CYCLE_RING,radial=Math.hypot(q.x-ring.x,q.y-ring.y);
 const slot=EROSTE_STATUS_PHOTO_SLOTS.find(b=>q.x>=b.x&&q.y>=b.y&&q.x<b.x+b.w&&q.y<b.y+b.h&&l[b.key].src);
 if(slot){erosteStatusDrag={mode:'photo',l,slot,photo:l[slot.key],startY:q.y,startOffset:l[slot.key].offsetY??0,pointer:e.pointerId,recorded:false};}
 else if(Math.abs(radial-ring.radius)<=18){
  let angle=erosteCycleAngle(q);if(angle<0.08&&ensureErosteStatus(l).day>erosteCycleTotal(l)/2)angle+=Math.PI*2;
  erosteStatusDrag={mode:'cycle',l,pointer:e.pointerId,recorded:false,angle,lastAngle:erosteCycleAngle(q)};
 }else{
  const hits=erosteStatusFields.flatMap((f,i)=>f.gauge&&q.x>=f.gauge.x-12&&q.x<=f.gauge.x+f.gauge.w+12&&Math.abs(q.y-(f.gauge.y+f.gauge.h/2))<=16?[i]:[]).sort((a,b)=>Math.abs(q.y-erosteStatusFields[a].gauge.y)-Math.abs(q.y-erosteStatusFields[b].gauge.y));
  if(!hits.length)return false;erosteStatusDrag={mode:'gauge',l,index:hits[0],pointer:e.pointerId,recorded:false};
 }
 e.preventDefault();canvas.setPointerCapture(e.pointerId);moveErosteStatusPointer(e,p);return true;
}
function moveErosteStatusPointer(e,p=pos(e)){
 const d=erosteStatusDrag;if(!d||e.pointerId!==d.pointer)return false;if(projectBusy||currentImageLayer()!==d.l){erosteStatusDrag=null;return true}
 const q=erosteStatusLocalPoint(d.l,p);let obj,key,v;
 if(d.mode==='photo'){if(!d.l.visible||d.l[d.slot.key]!==d.photo){erosteStatusDrag=null;return true}const value=Math.max(-100,Math.min(100,d.startOffset+(q.y-d.startY)/d.slot.h*100));if(Math.abs(value-(d.photo.offsetY??0))>.001){if(!d.recorded){checkpoint();d.recorded=true}d.photo.offsetY=value;render()}return true;}
 if(d.mode==='cycle'){
  if(Math.hypot(q.x-EROSTE_CYCLE_RING.x,q.y-EROSTE_CYCLE_RING.y)<12)return true;
  const angle=erosteCycleAngle(q),tau=Math.PI*2;let delta=angle-d.lastAngle;if(delta>Math.PI)delta-=tau;if(delta<-Math.PI)delta+=tau;
  d.angle=Math.max(0,Math.min(tau,d.angle+delta));d.lastAngle=angle;const total=erosteCycleTotal(d.l);
  obj=ensureErosteStatus(d.l);key='day';v=Math.max(1,Math.min(total,Math.round(d.angle/tau*total)));
 }else{const g=erosteStatusFields[d.index].gauge;obj=d.l.statusValues;key=d.index;v=Math.round(Math.max(0,Math.min(100,(q.x-g.x)/g.w*100)))}
 if(obj[key]!==v){if(!d.recorded){checkpoint();d.recorded=true}obj[key]=v;updateErosteStatusInputs(d.l);render()}return true;
}
function endErosteStatusPointer(e){if(!erosteStatusDrag||erosteStatusDrag.pointer!==e.pointerId)return false;const photo=erosteStatusDrag.mode==='photo';moveErosteStatusPointer(e);erosteStatusDrag=null;if(photo)syncErosteControls();return true}
function cancelErosteStatusPointer(){erosteStatusDrag=null}
