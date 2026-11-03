'use strict';
// Only two approved artwork states per color: full glow and a single normal glass texture.
const pixelPositiveSpecs={
 blue:{name:'정의감',label:'블루',frame:[0,0,512,400],panes:[[66,68,402,122],[66,207,402,128]]},
 pink:{name:'사랑',label:'핑크',frame:[0,0,512,385],panes:[[64,64,402,123],[64,209,402,112]]},
 orange:{name:'우정',label:'오렌지',frame:[0,0,512,410],panes:[[64,87,402,114],[64,229,402,112]]}
};
const pixelPositiveArt=new Map(),pixelPositiveCache=new Map();let pixelPositiveReady=null;
function pixelPositiveTheme(l){return l.pixelPositiveTheme||'blue'}
function pixelPositiveCanvas(w,h){const out=document.createElement('canvas');out.width=Math.max(1,Math.round(w));out.height=Math.max(1,Math.round(h));return out}
function pixelPositiveRamp(v,a,b){const t=Math.min(1,Math.max(0,(v-a)/(b-a)));return t*t*(3-2*t)}
function pixelPositiveDamage(value,enabled=true){const d=enabled?1-value/100:0;return{d,brightness:1-.57*d,contrast:1-.48*d,saturation:1-.72*d,crack:pixelPositiveRamp(d,.12,.88),split:pixelPositiveRamp(d,.55,1),fall:pixelPositiveRamp(d,.82,1)}}
function pixelPositiveMesh(){
 // Stable Voronoi cells avoid a star-shaped fan and produce shared, connected glass edges.
 const seeds=[[.10,.20],[.38,.12],[.65,.22],[.90,.13],[.20,.55],[.48,.50],[.78,.55],[.05,.85],[.36,.87],[.62,.88],[.92,.90]];
 const cells=seeds.map((p,index)=>{let polygon=[[0,0],[1,0],[1,1],[0,1]];for(let j=0;j<seeds.length;j++){if(j===index)continue;const q=seeds[j],nx=q[0]-p[0],ny=q[1]-p[1],limit=(q[0]*q[0]+q[1]*q[1]-p[0]*p[0]-p[1]*p[1])/2,result=[];for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],da=nx*a[0]+ny*a[1]-limit,db=nx*b[0]+ny*b[1]-limit;if(da<=1e-9)result.push(a);if((da<0&&db>0)||(da>0&&db<0)){const t=da/(da-db);result.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t])}}polygon=result}return{p:polygon,c:p,drop:index===7||index===9,index}});
 const edges=new Map();for(const cell of cells)for(let i=0;i<cell.p.length;i++){let a=cell.p[i],b=cell.p[(i+1)%cell.p.length];if(a.some((v,k)=>(Math.abs(v)<1e-7&&Math.abs(b[k])<1e-7)||(Math.abs(v-1)<1e-7&&Math.abs(b[k]-1)<1e-7)))continue;const point=v=>v.map(n=>n.toFixed(6)).join(','),key=[point(a),point(b)].sort().join('|');if(edges.has(key))continue;if(Math.hypot(a[0]-.53,a[1]-.48)>Math.hypot(b[0]-.53,b[1]-.48))[a,b]=[b,a];edges.set(key,{a,b,near:Math.hypot(a[0]-.53,a[1]-.48)})}
 return{cells,edges:[...edges.values()].sort((a,b)=>a.near-b.near)};
}
const pixelPositiveGlassMesh=pixelPositiveMesh();
function loadPixelPositiveAssets(){
 if(!pixelPositiveReady)pixelPositiveReady=Promise.all(Object.keys(pixelPositiveSpecs).map(async theme=>{
  const im=await imageFrom('pixel-rpg/positive-'+theme+'-pair.png'),spec=pixelPositiveSpecs[theme],frame=pixelPositiveCanvas(480,380),g=frame.getContext('2d');
  g.drawImage(im,...spec.frame,0,0,480,380);g.clearRect(0,0,480,10);
  const boxes=spec.panes.map(([x,y,w,h])=>({x:x*240/spec.frame[2],y:y*190/spec.frame[3],w:w*240/spec.frame[2],h:h*190/spec.frame[3]}));boxes.forEach(b=>g.clearRect(b.x*2,b.y*2,b.w*2,b.h*2));
  const panes=Array.from({length:2},(_,state)=>spec.panes.map(([x,y,w,h])=>{const out=pixelPositiveCanvas(w,h),c=out.getContext('2d');c.drawImage(im,x+state*512,y,w*(state?.9:1),h,0,0,w,h);return out}));pixelPositiveArt.set(theme,{frame,boxes,panes});
 })).catch(e=>{pixelPositiveReady=null;throw e});return pixelPositiveReady;
}
function pixelPositiveAvailable(l){return pixelPositiveTheme(l)!=='legacy'&&pixelPositiveArt.has(pixelPositiveTheme(l))}
function pixelPositiveComposition(l,index){
 const theme=pixelPositiveTheme(l),art=pixelPositiveArt.get(theme),value=pixelRpgLowerValue(l),enabled=l.pixelLowerShatter!==false,t=index?value+'%':l.pixelLowerTitle;
 const key=JSON.stringify([theme,value,enabled,index,t,document.fonts?.status]);if(pixelPositiveCache.has(key))return pixelPositiveCache.get(key);
 const box=art.boxes[index],plate=pixelPositiveCanvas(box.w*2,box.h*2),p=plate.getContext('2d'),w=plate.width,h=plate.height,source=art.panes[value===100?0:1][index],damage=pixelPositiveDamage(value,enabled);
 p.filter='saturate(0.3) brightness(0.26)';p.drawImage(source,0,0,w,h);p.filter='none';
 if(value>0){p.save();p.beginPath();p.rect(0,0,w*value/100,h);p.clip();p.drawImage(source,0,0,w,h);p.restore();if(value<100){p.fillStyle='rgba(225,250,255,.35)';p.fillRect(Math.max(0,w*value/100-1),0,1,h)}}
 p.font='700 '+Math.round(h*.76)+'px "Studio Gothic",sans-serif';p.textAlign='center';p.textBaseline='middle';p.lineJoin='round';p.lineWidth=Math.max(2,h*.045);p.strokeStyle='#102031';p.strokeText(String(t),w/2,h/2,w*.92);p.fillStyle='#fff6df';p.fillText(String(t),w/2,h/2,w*.92);
 // Grow fixed crack paths across the actual glass AND glyph pixels before moving either.
 const cracks=pixelPositiveCanvas(w,h),cc=cracks.getContext('2d'),count=damage.crack*pixelPositiveGlassMesh.edges.length;
 for(let i=0;i<Math.ceil(count);i++){const edge=pixelPositiveGlassMesh.edges[i],f=Math.min(1,count-i);p.beginPath();p.moveTo(edge.a[0]*w,edge.a[1]*h);p.lineTo((edge.a[0]+(edge.b[0]-edge.a[0])*f)*w,(edge.a[1]+(edge.b[1]-edge.a[1])*f)*h);p.strokeStyle='rgba(3,11,22,'+(.45+damage.d*.35)+')';p.lineWidth=1+damage.d*2;p.stroke();p.strokeStyle='rgba(196,237,246,'+(.15+damage.d*.5)+')';p.lineWidth=.7;p.stroke();cc.beginPath();cc.moveTo(edge.a[0]*w,edge.a[1]*h);cc.lineTo((edge.a[0]+(edge.b[0]-edge.a[0])*f)*w,(edge.a[1]+(edge.b[1]-edge.a[1])*f)*h);cc.strokeStyle='rgba(183,220,235,'+(.25+damage.d*.45)+')';cc.lineWidth=.9;cc.stroke()}
 const pane=pixelPositiveCanvas(w,h),c=pane.getContext('2d'),fallers=pixelPositiveCanvas(w,h*2),fc=fallers.getContext('2d'),filter='saturate('+damage.saturation+') contrast('+damage.contrast+') brightness('+damage.brightness+')';c.filter=filter;fc.filter=filter;
 if(damage.split===0){c.drawImage(plate,0,0);c.filter='none';c.drawImage(cracks,0,0)}else for(const cell of pixelPositiveGlassMesh.cells){const draw=g=>{g.save();const [cx,cy]=cell.c,dx=(cx-.53)*damage.split*w*.075+(cell.drop?(cell.index%2?-1:1)*damage.fall*w*.035:0),dy=(cy-.48)*damage.split*h*.15+(cell.drop?damage.fall*h*.78:0),angle=(cell.index%2?1:-1)*(damage.split*.065+(cell.drop?damage.fall*.17:0));g.translate(dx+cx*w,dy+cy*h);g.rotate(angle);g.translate(-cx*w,-cy*h);g.beginPath();cell.p.forEach(([x,y],j)=>j?g.lineTo(x*w,y*h):g.moveTo(x*w,y*h));g.closePath();g.clip();g.drawImage(plate,0,0);g.filter='none';g.drawImage(cracks,0,0);if(damage.split>0){g.strokeStyle='rgba(180,216,232,'+damage.split*.4+')';g.lineWidth=.8;g.stroke()}g.restore()};draw(c);if(cell.drop)draw(fc)}
 const result={pane,fallers};pixelPositiveCache.set(key,result);if(pixelPositiveCache.size>24)pixelPositiveCache.delete(pixelPositiveCache.keys().next().value);return result;
}
function pixelPositivePane(l,index){return pixelPositiveComposition(l,index).pane}
function drawPixelPositiveBacking(c,art,theme){
 // A mirror has an opaque support behind its glass. Shard gaps expose this plate, never the photo.
 const colors={blue:['#26303a','#111820'],pink:['#332730','#191218'],orange:['#362d22','#1b160f']}[theme],surface=c.createLinearGradient(0,0,240,190);surface.addColorStop(0,colors[0]);surface.addColorStop(.55,colors[1]);surface.addColorStop(1,colors[0]);c.fillStyle=surface;
 // The narrow neck joins the upper gauge under the lower plaque's crown.
 c.fillRect(64,-1,132,Math.max(...art.boxes.map(b=>b.y))+2);
 for(const b of art.boxes){c.fillRect(b.x-.5,b.y-.5,b.w+1,b.h+1);c.strokeStyle='rgba(0,0,0,.6)';c.lineWidth=1.5;c.strokeRect(b.x,b.y,b.w,b.h);c.strokeStyle='rgba(211,221,225,.10)';c.lineWidth=.5;c.beginPath();c.moveTo(b.x+2,b.y+2);c.lineTo(b.x+b.w-2,b.y+2);c.stroke()}
}
function drawPixelRpgPositive(c,l,g,s){
 if(!pixelPositiveAvailable(l))return false;const art=pixelPositiveArt.get(pixelPositiveTheme(l));c.save();c.translate(g.x,g.y+740*s);c.scale(s,s);c.imageSmoothingEnabled=true;
 drawPixelPositiveBacking(c,art,pixelPositiveTheme(l));art.boxes.forEach((b,i)=>c.drawImage(pixelPositivePane(l,i),b.x,b.y,b.w,b.h));c.drawImage(art.frame,0,0,240,190);
 if(pixelPositiveDamage(pixelRpgLowerValue(l),l.pixelLowerShatter!==false).fall>0){const b=art.boxes[1];c.save();c.beginPath();c.rect(0,190,240,60);c.clip();c.drawImage(pixelPositiveComposition(l,1).fallers,b.x,b.y,b.w,b.h*2);c.restore()}
 c.restore();return true;
}
// The range emits continuous live renders; each drag/key gesture records only one Undo.
function appendPixelPositiveSlider(l,host,key,label){
 const wrap=document.createElement('label'),range=document.createElement('input'),out=document.createElement('output');wrap.textContent=label;range.type='range';range.min=0;range.max=100;range.step=1;range.value=l[key];range.setAttribute('aria-label',label);out.textContent=l[key]+'%';let transaction=null;
 const valid=()=>!projectBusy&&currentImageLayer()===l&&(!transaction||transaction.doc===state);
 range.oninput=()=>{if(!valid())return;const value=Math.max(0,Math.min(100,Math.round(Number(range.value)||0)));if(value===l[key])return;if(!transaction){transaction={doc:state,start:l[key]};checkpoint()}pixelRpgValue(l,key,value);out.textContent=l[key]+'%';render()};
 range.onchange=()=>{const refresh=valid();transaction=null;if(refresh)sync()};range.onpointercancel=()=>{if(transaction&&transaction.doc===state){pixelRpgValue(l,key,transaction.start);out.textContent=l[key]+'%';range.value=l[key]}transaction=null;if(currentImageLayer()===l)sync()};wrap.append(range,out);host.append(wrap);
}
function appendPixelPositiveControls(l,fields){
 const title=document.createElement('strong');title.textContent='아래 상태 유리 디자인';fields.append(title);
 for(const [theme,spec]of Object.entries({...pixelPositiveSpecs,legacy:{name:'기존 어두운 유리',label:''}})){
  const b=document.createElement('button');b.type='button';b.textContent=theme==='legacy'?spec.name:spec.label+' · '+spec.name;b.setAttribute('aria-pressed',String(pixelPositiveTheme(l)===theme));
  b.onclick=()=>{if(projectBusy||currentImageLayer()!==l)return;const name=theme==='legacy'?l.pixelLowerTitle:spec.name;if(pixelPositiveTheme(l)===theme&&l.pixelLowerTitle===name)return;checkpoint();l.pixelPositiveTheme=theme;l.pixelLowerTitle=name;sync()};fields.append(b);
 }
 const hint=document.createElement('small');hint.textContent='색상 버튼은 예시 이름도 적용해요. 아래 상태 이름은 다시 자유롭게 바꿀 수 있어요. 100%는 전용 광채예요. 슬라이더를 움직이면 빛·명도·대비가 줄고 금이 자라다가 글자와 유리 조각이 함께 어긋나요.';fields.append(hint);
}
