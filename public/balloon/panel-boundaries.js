'use strict';
// Session-only tool. Shared edges are inferred from the existing native polygons.
let panelBoundaryEditMode=false,panelBoundaryDocument=null,panelBoundaryDrag=null;
const boundaryDot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const boundaryCross=(a,b)=>a[0]*b[1]-a[1]*b[0];
function panelBoundaryEdges(doc=state){
 const panels=(doc.panels||[]).filter(p=>p.visible!==false&&panelShapeEditable(p)&&!p.overlayOn&&!(doc.panels||[]).some(q=>q.overlayOn===p.id));
 return panels.flatMap(panel=>{
  const points=panelAbsoluteVertices(panel),center=points.reduce((s,p)=>[s[0]+p[0]/points.length,s[1]+p[1]/points.length],[0,0]);
  return points.map((a,index)=>{const b=points[(index+1)%points.length],v=[b[0]-a[0],b[1]-a[1]],length=Math.hypot(...v),axis=Math.abs(v[0])>=Math.abs(v[1])?'y':'x',sign=(axis==='y'?v[0]:v[1])<0?-1:1,t=v.map(n=>n/length*sign),n=[-t[1],t[0]];return {panel,index,a,b,t,n,length,axis,side:Math.sign(boundaryDot([center[0]-a[0],center[1]-a[1]],n))};});
 });
}
function panelBoundaryGroups(doc=state){
 const edges=panelBoundaryEdges(doc),parents=edges.map((_,i)=>i),linked=new Set(),gapLimit=Math.max(8,Math.min(doc.width,doc.height)*.055);
 const root=i=>{while(parents[i]!==i)i=parents[i];return i;};
 for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){
  const a=edges[i],b=edges[j];
  if(a.panel===b.panel||a.axis!==b.axis||a.side===b.side||Math.abs(boundaryCross(a.t,b.t))>.03)continue;
  const ai=[boundaryDot(a.a,a.t),boundaryDot(a.b,a.t)].sort((x,y)=>x-y),bi=[boundaryDot(b.a,a.t),boundaryDot(b.b,a.t)].sort((x,y)=>x-y),lo=Math.max(ai[0],bi[0]),hi=Math.min(ai[1],bi[1]);
  if(hi-lo<Math.max(2,Math.min(a.length,b.length)*.08))continue;
  const offsets=[lo,hi].map(t=>{const k=(t-boundaryDot(b.a,a.t))/boundaryDot(b.t,a.t),p=[b.a[0]+b.t[0]*k,b.a[1]+b.t[1]*k];return boundaryDot([p[0]-a.a[0],p[1]-a.a[1]],a.n);});
  if(offsets.some(d=>Math.abs(d)>gapLimit||d*a.side>.5))continue;
  parents[root(j)]=root(i);linked.add(i);linked.add(j);
 }
 const groups=new Map();for(const i of linked){const id=root(i);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(edges[i]);}
 return [...groups.values()].filter(es=>new Set(es.map(e=>e.panel.id)).size>1).map(es=>({edges:es,axis:es[0].axis}));
}
function boundarySegmentDistance(p,a,b){const v=[b[0]-a[0],b[1]-a[1]],d=boundaryDot(v,v),t=Math.max(0,Math.min(1,boundaryDot([p.x-a[0],p.y-a[1]],v)/d));return Math.hypot(p.x-a[0]-t*v[0],p.y-a[1]-t*v[1]);}
function panelBoundaryAt(point,touch=false){
 const threshold=(touch?26:15)/zoom;
 return panelBoundaryGroups().map(g=>({...g,distance:Math.min(...g.edges.map(e=>boundarySegmentDistance(point,e.a,e.b)))})).filter(g=>g.distance<=threshold).sort((a,b)=>a.distance-b.distance)[0]||null;
}
function boundaryLineIntersection(a,u,b,v){const cross=boundaryCross(u,v);if(Math.abs(cross)<1e-8)return null;const t=boundaryCross([b[0]-a[0],b[1]-a[1]],v)/cross;return[a[0]+u[0]*t,a[1]+u[1]*t];}
function boundaryPolygonsOverlap(a,b){
 for(const points of [a,b])for(let i=0;i<points.length;i++){
  const p=points[i],q=points[(i+1)%points.length],n=[q[1]-p[1],p[0]-q[0]],av=a.map(v=>boundaryDot(v,n)),bv=b.map(v=>boundaryDot(v,n));
  if(Math.min(Math.max(...av),Math.max(...bv))-Math.max(Math.min(...av),Math.min(...bv))<.001)return false;
 }
 return true;
}
function panelBoundaryProposal(d,delta){
 const shift=d.group.axis==='y'?[0,delta]:[delta,0],proposals=new Map();
 for(const original of d.originals){
  const moved=new Set(d.group.edges.filter(e=>e.panel.id===original.id).map(e=>e.index)),points=panelAbsoluteVertices(original),lines=points.map((a,i)=>({a:moved.has(i)?[a[0]+shift[0],a[1]+shift[1]]:a,v:[points[(i+1)%points.length][0]-a[0],points[(i+1)%points.length][1]-a[1]]}));
  const corners=lines.map((line,i)=>{const before=lines[(i+lines.length-1)%lines.length];return boundaryLineIntersection(before.a,before.v,line.a,line.v);});
  if(corners.some(p=>!p||p.some(n=>!Number.isFinite(n))||p[0]<0||p[1]<0||p[0]>d.document.width||p[1]>d.document.height))return null;
  if(corners.some((p,i)=>Math.hypot(p[0]-corners[(i+1)%corners.length][0],p[1]-corners[(i+1)%corners.length][1])<40))return null;
  const signedArea=ps=>ps.reduce((s,p,i)=>s+boundaryCross(p,ps[(i+1)%ps.length]),0);if(signedArea(corners)*signedArea(points)<=0)return null;
  const candidate=panelFromCorners(corners);if(!candidate)return null;
  // Keep a usable cross-section, even for very narrow slanted wedges.
  const area=Math.abs(corners.reduce((s,p,i)=>s+boundaryCross(p,corners[(i+1)%corners.length]),0))/2;
  if(area/Math.max(candidate.w,candidate.h)<40)return null;
  proposals.set(original.id,{...original,...candidate,shape:'polygon'});
 }
 const panels=(d.document.panels||[]).filter(p=>p.visible!==false&&!p.overlayOn&&p.shape!=='full'&&p.shape!=='hex');
 for(let i=0;i<panels.length;i++)for(let j=i+1;j<panels.length;j++){
  const a=panels[i],b=panels[j];if(!proposals.has(a.id)&&!proposals.has(b.id))continue;
  const pa=panelAbsoluteVertices(proposals.get(a.id)||a),pb=panelAbsoluteVertices(proposals.get(b.id)||b);
  if(boundaryPolygonsOverlap(pa,pb)&&!boundaryPolygonsOverlap(panelAbsoluteVertices(d.originals.find(p=>p.id===a.id)||a),panelAbsoluteVertices(d.originals.find(p=>p.id===b.id)||b)))return null;
 }
 return proposals;
}
function cancelPanelBoundaryDrag(){
 const d=panelBoundaryDrag;if(!d)return;
 if(d.document===state&&d.recorded&&d.refs.every(p=>state.panels.includes(p))){
  for(const original of d.originals){const p=d.refs.find(p=>p.id===original.id);Object.assign(p,structuredClone(original));if(original.vertices===undefined)delete p.vertices;}
  for(const original of d.images){const l=state.imageLayers.find(l=>l.id===original.id&&l.panelId===original.panelId);if(l){for(const key of ['x','y','w','h','panelZoom'])if(original[key]===undefined)delete l[key];else l[key]=original[key];}}
 }
 panelBoundaryDrag=null;if(d.document===state)render();
}
function syncPanelBoundaryEditing(){
 if(panelBoundaryEditMode&&(panelBoundaryDocument!==state||panelLayoutLocked()||panelEditMode||protrusionMode||selected||imageLayerSelected||editTool!=='select')){cancelPanelBoundaryDrag();panelBoundaryEditMode=false;panelBoundaryDocument=null;}
 if(panelBoundaryDrag&&(projectBusy||panelBoundaryDrag.refs.some(p=>!state.panels.includes(p))))cancelPanelBoundaryDrag();
 for(const id of ['panelBoundaryToggle','panelBoundaryEdit']){const b=$(id);if(!b)continue;
 b.disabled=projectBusy||panelLayoutLocked()||!panelBoundaryGroups().length;b.setAttribute('aria-pressed',String(panelBoundaryEditMode));b.classList.toggle('active',panelBoundaryEditMode);b.textContent=panelBoundaryEditMode?'경계 조정 완료':'컷 경계 조정';}
 if(panelBoundaryEditMode)$('panelLockHint').textContent='민트색 경계를 끌면 양쪽 컷 크기를 함께 조정해요. 사선 각도와 간격은 유지해요.';
}
function exitPanelBoundaryEditing(){cancelPanelBoundaryDrag();panelBoundaryEditMode=false;panelBoundaryDocument=null;canvas.style&&(canvas.style.cursor='default');syncPanelBoundaryEditing();}
function togglePanelBoundaryEditing(){
 if(projectBusy||panelLayoutLocked())return;
 if(panelBoundaryEditMode){cancelPanelBoundaryDrag();panelBoundaryEditMode=false;panelBoundaryDocument=null;sync();return;}
 if(!panelBoundaryGroups().length){status('서로 맞닿은 사각형·사선 컷 경계가 있어야 조정할 수 있어요.');return;}
 exitPanelEditing();if(protrusionMode)setProtrusionMode(null);if(typeof cancelMultiMove==='function')cancelMultiMove();if(typeof cancelCanvasTouch==='function')cancelCanvasTouch();
 selected=null;imageLayerSelected=null;if(typeof mobilePan!=='undefined')mobilePan=false;window.mobileMultiSelect=false;setTool('select');
 panelBoundaryEditMode=true;panelBoundaryDocument=state;if(canvas.style)canvas.style.cursor='crosshair';if(typeof resetMiniEditGesture==='function')resetMiniEditGesture();if(typeof closeMobilePanel==='function')closeMobilePanel();sync();status('민트색 컷 경계를 위아래 또는 좌우로 끌어주세요. 양쪽 컷이 함께 늘고 줄어요.');
}
function beginPanelBoundaryPointer(e){
 if(!panelBoundaryEditMode)return false;
 if(panelBoundaryDrag)return true;
 if(projectBusy||panelLayoutLocked()||panelBoundaryDocument!==state||e.button!==0)return true;
 e.preventDefault();const group=panelBoundaryAt(pos(e),e.pointerType==='touch');if(!group)return true;
 const refs=[...new Set(group.edges.map(e=>e.panel))];
 panelBoundaryDrag={document:state,group,refs,originals:refs.map(p=>structuredClone(p)),images:(state.imageLayers||[]).filter(l=>refs.some(p=>p.id===l.panelId)).map(l=>({id:l.id,panelId:l.panelId,x:l.x,y:l.y,w:l.w,h:l.h,panelZoom:l.panelZoom})),point:pos(e),pointer:e.pointerId,zoom,recorded:false,delta:0};
 canvas.setPointerCapture(e.pointerId);render();return true;
}
function movePanelBoundaryPointer(e){
 const d=panelBoundaryDrag;if(!d){if(panelBoundaryEditMode&&canvas.style){const hit=panelBoundaryAt(pos(e),e.pointerType==='touch');canvas.style.cursor=hit?(hit.axis==='y'?'ns-resize':'ew-resize'):'default';}return panelBoundaryEditMode;}
 if(e.pointerId!==d.pointer)return true;
 if(d.document!==state||projectBusy||panelLayoutLocked()||d.refs.some(p=>!state.panels.includes(p))){cancelPanelBoundaryDrag();return true;}
 const point=pos(e),requested=point[d.group.axis]-d.point[d.group.axis];if(!d.recorded&&Math.abs(requested)*d.zoom<4)return true;
 let delta=requested,proposal=panelBoundaryProposal(d,delta);
 if(!proposal){let low=0,high=1;for(let i=0;i<18;i++){const mid=(low+high)/2;if(panelBoundaryProposal(d,requested*mid))low=mid;else high=mid;}delta=requested*low;proposal=panelBoundaryProposal(d,delta);}
 if(!proposal||Math.abs(delta-d.delta)<1e-6)return true;
 if(!d.recorded){checkpoint();d.recorded=true;}
 for(const original of d.originals){const panel=d.refs.find(p=>p.id===original.id);Object.assign(panel,proposal.get(original.id));resizePanelPhotos(panel,original,d.images.filter(l=>l.panelId===panel.id));}
 d.delta=delta;render();return true;
}
function endPanelBoundaryPointer(e){if(!panelBoundaryDrag)return panelBoundaryEditMode;if(e.pointerId!==panelBoundaryDrag.pointer)return true;movePanelBoundaryPointer(e);panelBoundaryDrag=null;sync();return true;}
function drawPanelBoundaries(c){
 if(!panelBoundaryEditMode||panelBoundaryDocument!==state||panelLayoutLocked())return;
 c.save();c.strokeStyle='#38d8bd';c.fillStyle='#0d544d';c.lineWidth=4/zoom;c.setLineDash([8/zoom,5/zoom]);
 for(const group of panelBoundaryGroups())for(const edge of group.edges){c.beginPath();c.moveTo(...edge.a);c.lineTo(...edge.b);c.stroke();}
 c.setLineDash([]);
 for(const group of panelBoundaryGroups()){
  const edge=[...group.edges].sort((a,b)=>b.length-a.length)[0],x=(edge.a[0]+edge.b[0])/2,y=(edge.a[1]+edge.b[1])/2;
  c.beginPath();c.arc(x,y,13/zoom,0,Math.PI*2);c.fill();c.stroke();c.fillStyle='#fff';c.font=`${18/zoom}px sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText(group.axis==='y'?'↕':'↔',x,y);c.fillStyle='#0d544d';
 }
 c.restore();
}
function initPanelBoundaryEditing(){
 for(const id of ['panelBoundaryToggle','panelBoundaryEdit'])$(id).onclick=togglePanelBoundaryEditing;
 canvas.addEventListener('lostpointercapture',e=>{if(panelBoundaryDrag?.pointer===e.pointerId){cancelPanelBoundaryDrag();sync();}});
 window.addEventListener('blur',()=>{if(panelBoundaryDrag){cancelPanelBoundaryDrag();sync();}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&panelBoundaryDrag){cancelPanelBoundaryDrag();sync();}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&panelBoundaryEditMode){cancelPanelBoundaryDrag();panelBoundaryEditMode=false;panelBoundaryDocument=null;sync();e.preventDefault();}});
}
