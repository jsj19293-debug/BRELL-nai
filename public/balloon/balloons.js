'use strict';
let balloonCategory='thin';
const balloonCategories=[['thin','얇은 선'],['thick','굵은 선'],['translucent','반투명'],['emotion','떨림·움찔'],['handdrawn','손그림 말풍선'],['references','참고 56종'],['stickers','고정 에셋']];
const balloonShapes=[['round','타원형'],['circle','완전 원형'],['cloud','몽실 구름'],['thought','생각'],['shout','외침'],['narration','나레이션'],['pinched','오목 가시'],['linked','이어진 타원'],['wavy','흐물 곡선']];
// Original editable contours developed from the approved six-shape review sheet.
const emotionShapes=[['tremble','01 · 떨림 타원'],['trembleSlim','02 · 떨림 세로'],['trembleBox','03 · 떨림 네모'],['twitch','04 · 움찔 세로'],['twitchWide','05 · 움찔 타원'],['twitchAngular','06 · 움찔 각진형']];
const emotionKinds=emotionShapes.map(([kind])=>kind);
const twitchContours={
 twitch:'M 47 10 C 36 3 28 10 23 22 Q 18 33 5 32 L 14 37 Q 7 40 15 42 C 19 48 19 64 24 68 L 4 82 L 19 76 L 13 87 L 24 82 L 12 98 L 31 80 C 40 91 48 96 60 91 C 67 88 78 85 79 77 C 81 69 92 67 94 54 C 96 41 86 28 79 24 Q 75 20 80 14 L 89 2 Q 72 17 67 16 Q 57 7 47 10 Z',
 twitchWide:'M 49 6 C 37 0 29 11 23 16 Q 16 22 4 22 L 12 29 L 3 34 Q 15 39 9 48 L 0 54 L 11 56 L 4 61 L 14 62 L 9 65 Q 14 65 14 74 L 20 70 L 18 79 L 25 75 L 19 95 L 31 80 C 36 90 46 88 51 96 C 57 100 63 89 72 87 Q 83 83 86 70 L 99 62 L 90 61 Q 92 46 94 38 Q 96 26 85 20 Q 81 18 86 10 L 76 17 Q 61 2 49 6 Z',
 twitchAngular:'M 46 1 Q 55 10 61 13 Q 72 18 84 39 L 94 48 L 84 63 L 100 61 L 85 70 Q 78 76 78 85 L 58 99 Q 52 94 48 88 Q 39 88 34 84 Q 28 79 23 60 L 13 67 L 20 55 L 15 55 L 19 50 L 1 49 Q 22 46 20 39 Q 17 32 28 24 Q 38 16 46 1 Z'
};
function emotionPath(b){
 const p=new Path2D(),shape=twitchContours[b.kind];
 if(shape){const tokens=shape.match(/[MCQLZ]|-?\d+(?:\.\d+)?/g);let i=0;while(i<tokens.length){const cmd=tokens[i++],count={M:2,L:2,Q:4,C:6,Z:0}[cmd],a=[];for(let k=0;k<count;k++)a.push((k%2?b.y:b.x)+Number(tokens[i++])*(k%2?b.h:b.w)/100);if(cmd==='M')p.moveTo(...a);if(cmd==='L')p.lineTo(...a);if(cmd==='Q')p.quadraticCurveTo(...a);if(cmd==='C')p.bezierCurveTo(...a);if(cmd==='Z')p.closePath()}return p}
 const n=120,box=b.kind==='trembleBox',strong=b.kind==='trembleSlim',amount=(b.wobble??6)/6,pts=[];
 for(let i=0;i<n;i++){const t=i*2*Math.PI/n,c=Math.cos(t),v=Math.sin(t),r=.91+amount*((strong?.030:.022)*Math.sin(11*t+.4)+.014*Math.sin(7*t+1.3)+.009*Math.cos(17*t));const exponent=box?.42:1;pts.push([b.x+b.w*(.5+.5*Math.sign(c)*Math.pow(Math.abs(c),exponent)*r),b.y+b.h*(.5+.5*Math.sign(v)*Math.pow(Math.abs(v),exponent)*r)])}
 p.moveTo(...pts[0]);for(let i=0;i<n;i++){const a=pts[(i+n-1)%n],z=pts[i],next=pts[(i+1)%n],end=pts[(i+2)%n];p.bezierCurveTo(z[0]+(next[0]-a[0])/6,z[1]+(next[1]-a[1])/6,next[0]-(end[0]-z[0])/6,next[1]-(end[1]-z[1])/6,...next)}p.closePath();return p;
}
function smoothCloudPath(b){const p=new Path2D(),n=72,step=Math.PI*2/n;function sample(t){const r=.89+.085*Math.cos(9*t),dr=-.765*Math.sin(9*t),c=Math.cos(t),s=Math.sin(t);return {x:b.x+b.w/2+b.w/2*r*c,y:b.y+b.h/2+b.h/2*r*s,dx:b.w/2*(dr*c-r*s),dy:b.h/2*(dr*s+r*c)}}let a=sample(0);p.moveTo(a.x,a.y);for(let i=1;i<=n;i++){const z=sample(i*step);p.bezierCurveTo(a.x+a.dx*step/3,a.y+a.dy*step/3,z.x-z.dx*step/3,z.y-z.dy*step/3,z.x,z.y);a=z}p.closePath();return p}
function balloonChoices(category){const opacity=category==='translucent'?.55:1,strokeWidth=category==='thick'?5:1.5;const shapes=category==='emotion'?emotionShapes:[...balloonShapes,...emotionShapes];return shapes.map(([kind,name])=>({name,kind,opacity,strokeWidth,tail:!emotionKinds.includes(kind)&&!['narration','shout'].includes(kind)&&!!canDirectTail({kind}),tailStyle:['thought','cloud'].includes(kind)?'thought':'speech',tailDirection:'bottom',tx:.5,ty:1.25,wobble:6,innerLines:false,...(emotionKinds.includes(kind)?{w:kind==='trembleSlim'?210:kind==='twitchWide'?320:260,h:kind==='twitchWide'?280:370,padding:20}:{})}))}

function drawBalloonChoices(){const assets=balloonCategory==='stickers',custom=assets&&['custom','shared'].includes(assetCatalogTab);$('assetCatalogTabs').hidden=!assets;$('customAssetPanel').hidden=!custom;for(const [id,tab]of [['assetCatalogBuiltin','builtin'],['assetCatalogOgok','ogok'],['assetCatalogReactions','reactions'],['assetCatalogCensor','censor'],['assetCatalogBetaCensor','beta-censor'],['assetCatalogCrossSection','cross-section'],['assetCatalogCustom','custom'],['assetCatalogShared','shared']]){$(id).setAttribute('aria-selected',String(tab===assetCatalogTab));$(id).tabIndex=tab===assetCatalogTab?0:-1;$(id).classList.toggle('active',tab===assetCatalogTab)}if(custom){$('localAssetSection').hidden=assetCatalogTab!=='custom';$('sharedAssetSection').hidden=assetCatalogTab!=='shared';if(assetCatalogTab==='custom')refreshCustomAssets();else refreshSharedAssets()}const host=$('types');host.hidden=custom;host.replaceChildren();host.classList.toggle('sticker-grid',balloonCategory==='stickers');host.classList.toggle('reference-grid',['references','handdrawn'].includes(balloonCategory));if(assets&&!custom)renderStickerChoices(host,assetCatalogTab);if(['references','handdrawn'].includes(balloonCategory))renderReferenceChoices(host,balloonCategory);for(const choice of (['references','stickers','handdrawn'].includes(balloonCategory)?[]:balloonChoices(balloonCategory))){const button=document.createElement('button');button.className='type balloon-choice';button.title=`${choice.name} · ${Math.round(choice.opacity*100)}% · ${choice.strokeWidth}px`;const preview=document.createElement('canvas');preview.width=150;preview.height=95;preview.setAttribute('aria-hidden','true');const c=preview.getContext('2d');if(balloonCategory==='translucent'){for(let y=0;y<95;y+=12)for(let x=0;x<150;x+=12){c.fillStyle=(x/12+y/12)%2?'#bccbc6':'#e1e9e5';c.fillRect(x,y,12,12)}}const b={...choice,x:emotionKinds.includes(choice.kind)?(choice.kind==='twitchWide'?36:48):14,y:9,w:emotionKinds.includes(choice.kind)?(choice.kind==='trembleSlim'?43:choice.kind==='twitchWide'?78:57):122,h:emotionKinds.includes(choice.kind)?76:65,tx:.5,ty:1.18,text:'',font:'sans',fontSize:16,lineHeight:1.4,padding:10,weight:'400',align:'center',color:'#222222',fill:'#ffffff',stroke:'#33463f'};drawBalloon(c,b);const label=document.createElement('span');label.textContent=choice.name;button.append(preview,label);button.onclick=()=>add(choice.kind,{...choice});host.append(button)}
 for(const [category]of balloonCategories){const tab=$('balloonTab-'+category);tab.setAttribute('aria-selected',String(category===balloonCategory));tab.tabIndex=category===balloonCategory?0:-1;tab.classList.toggle('active',category===balloonCategory)}host.setAttribute('aria-labelledby',assets&&!custom?(assetCatalogTab==='ogok'?'assetCatalogOgok':assetCatalogTab==='reactions'?'assetCatalogReactions':assetCatalogTab==='censor'?'assetCatalogCensor':assetCatalogTab==='beta-censor'?'assetCatalogBetaCensor':assetCatalogTab==='cross-section'?'assetCatalogCrossSection':'assetCatalogBuiltin'):'balloonTab-'+balloonCategory);$('balloonHint').hidden=custom;$('balloonHint').textContent=balloonCategory==='emotion'?'떨림 3종 · 움찔 3종. 꼬리 없이 시작하며 대화·생각 꼬리를 붙이거나 윤곽을 뒤틀 수 있어요.':balloonCategory==='handdrawn'?'손그림 말풍선 30종 · 원본 선과 장식은 고정이며 대사·크기·불투명도를 편집할 수 있습니다.':balloonCategory==='stickers'?(assetCatalogTab==='beta-censor'?'베타검열 · 받은 원본 120종 · 문구가 포함된 고정 그림입니다. 크기·회전·불투명도를 조절하세요.':assetCatalogTab==='cross-section'?'단면도 · 원본 패널 2종 + 투명 누끼 1종 · 바깥 배경만 투명하게 분리했습니다. 크기·회전·불투명도·모서리 변형으로 배치하세요.':assetCatalogTab==='censor'?'검열 · 다이얼로그·경고창 6종 / 가림막·표지판·링·흐림. 크기·회전·불투명도와 문구를 편집하세요. PC는 아래 팝업, 폰은 더블탭으로 조절합니다.':assetCatalogTab==='reactions'?'히토미 켜라 · 54종 · 문구·말풍선·장식을 개별로 추가합니다. 츄루루룹♡와 부들은 복원본입니다.':assetCatalogTab==='ogok'?'오곡전도사 · 17종 · 이어진 풍선과 바깥 글씨를 포함하며 흰 바탕의 불투명도를 조절할 수 있습니다.':'기본 고정 에셋 · 글자와 바탕의 색상을 변경할 수 있습니다.'):balloonCategory==='references'?'첨부한 56종 원본 · 선과 꼬리는 고정이며 크기·불투명도·대사를 편집할 수 있습니다.':balloonCategory==='translucent'?'배경이 비치는 15가지 모양 · 꼬리는 캔버스 위에서 방향 또는 없음을 선택하세요. 선 없는 구름은 테두리를 0으로 설정하세요.':`${balloonCategory==='thin'?'얇고 가벼운':'굵고 또렷한'} 테두리 · 15가지 모양. 꼬리는 캔버스 위에서 방향 또는 없음을 선택하세요.`}
function initBalloonPicker(){for(const [category,label]of balloonCategories){const tab=document.createElement('button');tab.id='balloonTab-'+category;tab.textContent=label;tab.setAttribute('role','tab');tab.setAttribute('aria-controls','types');tab.onclick=()=>{balloonCategory=category;drawBalloonChoices()};tab.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();const i=balloonCategories.findIndex(t=>t[0]===balloonCategory),next=e.key==='Home'?0:e.key==='End'?balloonCategories.length-1:(i+(e.key==='ArrowRight'?1:balloonCategories.length-1))%balloonCategories.length;balloonCategory=balloonCategories[next][0];drawBalloonChoices();$('balloonTab-'+balloonCategory).focus()};$('balloonTabs').append(tab)}$('addTextOnly').onclick=()=>add('text');drawBalloonChoices()}

// Editable vector outlines, independent of lettering and color styles.
function expressivePath(b){
 const p=new Path2D(),cx=b.x+b.w/2,cy=b.y+b.h/2;
 if(b.kind==='pinched'){
  const n=9,pts=Array.from({length:n},(_,i)=>{const t=i*2*Math.PI/n,r=1-.07*Math.sin(i*2.3);return [cx+Math.cos(t)*b.w*.5*r,cy+Math.sin(t)*b.h*.5*r]});
  p.moveTo(...pts[0]);for(let i=0;i<n;i++){const a=pts[i],z=pts[(i+1)%n];p.quadraticCurveTo(cx+((a[0]+z[0])/2-cx)*.66,cy+((a[1]+z[1])/2-cy)*.66,...z)}p.closePath();return p;
 }
 const n=160,amount=(b.wobble??6)/100;
 for(let i=0;i<=n;i++){const t=i*2*Math.PI/n,c=Math.cos(t),s=Math.sin(t);let x,y;
  if(b.kind==='linked'){const r=.66+.32*Math.cos(2*(t-.7));x=c*r;y=s*r}
  else {const r=.92+amount*(.55*Math.sin(t*11)+.3*Math.sin(t*17+.5)+.15*Math.cos(t*7));x=Math.sign(c)*Math.pow(Math.abs(c),.55)*r;y=Math.sign(s)*Math.pow(Math.abs(s),.55)*r}
  const px=cx+x*b.w/2,py=cy+y*b.h/2;i?p.lineTo(px,py):p.moveTo(px,py);
 }p.closePath();return p;
}
function drawInnerLines(c,b){
 // Wavy balloons have a clean outline, including projects saved with old defaults.
 if(!b.innerLines||['text','wavy'].includes(b.kind))return;
 c.save();c.clip(basePath(b));c.strokeStyle=b.stroke;c.globalAlpha=.28;c.lineWidth=Math.max(.7,b.strokeWidth*.45);
 for(const side of [-1,1]){c.beginPath();for(let i=0;i<=70;i++){const t=i/70,yy=b.y+b.h*(.13+.74*t),xx=b.x+b.w*(.5+side*.39)+Math.sin(t*24+side)*Math.min(b.w*.025,7);i?c.lineTo(xx,yy):c.moveTo(xx,yy)}c.stroke()}
 c.restore();
}

// Stroke only the union's exposed edges; keep one opacity layer for body and tail.
function strokeOutside(c,outline,inside,x,y,w,h){
 const outside=new Path2D(inside);outside.closePath();outside.rect(x,y,w,h);
 c.save();c.clip(outside,'evenodd');c.stroke(outline);c.restore();
}

function canDirectTail(b){return b&&!b.statusUI&&[...emotionKinds,'round','circle','thought','cloud','transparent','pinched','linked','wavy','shout','narration'].includes(b.kind)}
function balloonTailStyle(b){return b.tailStyle??(['thought','cloud'].includes(b.kind)?'thought':'speech')}
function chooseBalloonTailStyle(style){const b=current();if(!canDirectTail(b)||projectBusy||!['speech','thought'].includes(style))return;if(balloonTailStyle(b)===style&&b.tail)return;checkpoint();b.tailStyle=style;b.tail=true;sync()}
let tailDirectionMenu=null;
const tailDirectionChoices={top:[['↖','좌상'],['↑','정방향'],['↗','우상']],bottom:[['↙','좌하'],['↓','정방향'],['↘','우하']],left:[['↖','좌상'],['←','정방향'],['↙','좌하']],right:[['↗','우상'],['→','정방향'],['↘','우하']]};
function closeTailDirectionMenu(focus=false){const menu=tailDirectionMenu;tailDirectionMenu=null;const popup=$('tailDirectionPopup');if(popup)popup.hidden=true;menu?.button.setAttribute('aria-expanded','false');if(focus)menu?.button.focus({preventScroll:true})}
function syncTailDirection(){
 const b=current(),bar=$('tailDirectionBar');bar.hidden=!canDirectTail(b)||editTool!=='select';
 if(tailDirectionMenu&&(bar.hidden||projectBusy||tailDirectionMenu.object!==b))closeTailDirectionMenu();
 if(bar.hidden)return;
 for(const button of bar.querySelectorAll('button')){const direction=button.dataset.tailDirection,active=direction===(b.tail?(b.tailDirection||'bottom'):'none');button.setAttribute('aria-pressed',String(active));if(tailDirectionChoices[direction]){const index=active?(b.tailSlant??0)+1:1;button.textContent=tailDirectionChoices[direction][index][0]+' '+{top:'상',bottom:'하',left:'좌',right:'우'}[direction]}}
}
function openTailDirectionMenu(button){
 const b=current(),direction=button.dataset.tailDirection;if(!canDirectTail(b)||projectBusy||editTool!=='select'||!tailDirectionChoices[direction])return;
 if(tailDirectionMenu?.button===button){closeTailDirectionMenu();return}closeTailDirectionMenu();
 const popup=$('tailDirectionPopup');if(!popup)return;tailDirectionMenu={direction,button,object:b};popup.replaceChildren();popup.setAttribute('aria-label',button.textContent+' 꼬리 방향 선택');
 for(const [i,[arrow,label]]of tailDirectionChoices[direction].entries()){const choice=document.createElement('button');choice.type='button';choice.textContent=arrow+' '+label;choice.setAttribute('aria-pressed',String(!!b.tail&&(b.tailDirection||'bottom')===direction&&(b.tailSlant??0)===i-1));choice.onclick=()=>{if(current()!==b||projectBusy){closeTailDirectionMenu();return}closeTailDirectionMenu(true);chooseTailDirection(direction,i-1)};popup.append(choice)}
 popup.hidden=false;button.setAttribute('aria-expanded','true');const r=button.getBoundingClientRect(),width=Math.min(window.innerWidth-16,Math.max(52,r.width)*3+28);popup.style.width=width+'px';const height=popup.offsetHeight||50;popup.style.left=Math.max(8,Math.min(window.innerWidth-width-8,r.left+r.width/2-width/2))+'px';popup.style.top=Math.max(8,Math.min(window.innerHeight-height-8,r.bottom+height+8<=window.innerHeight-8?r.bottom+8:r.top-height-8))+'px';
 (popup.querySelector('[aria-pressed="true"]')||popup.children[1])?.focus({preventScroll:true});
}
function initTailDirectionPopup(){
 if($('tailDirectionPopup'))return;const popup=document.createElement('div');popup.id='tailDirectionPopup';popup.hidden=true;popup.setAttribute('role','group');document.body.append(popup);
 for(const button of document.querySelectorAll('[data-tail-direction]')){const d=button.dataset.tailDirection;if(d==='none')button.onclick=()=>{closeTailDirectionMenu();chooseTailDirection('none')};else{button.setAttribute('aria-controls',popup.id);button.setAttribute('aria-expanded','false');button.title='정방향·대각선 꼬리 선택';button.onclick=()=>openTailDirectionMenu(button)}}
 document.addEventListener('pointerdown',e=>{if(tailDirectionMenu&&!popup.contains(e.target)&&!e.target.closest?.('[data-tail-direction]'))closeTailDirectionMenu()},true);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&tailDirectionMenu){e.preventDefault();closeTailDirectionMenu(true)}});
 window.addEventListener('resize',()=>closeTailDirectionMenu());window.visualViewport?.addEventListener('resize',()=>closeTailDirectionMenu());$('viewport').addEventListener('scroll',()=>closeTailDirectionMenu(),{passive:true});
}
function chooseTailDirection(direction,slant=0){
 const b=current();if(!canDirectTail(b)||projectBusy||![-1,0,1].includes(slant)||!['top','bottom','left','right','none'].includes(direction))return;
 if(direction==='none'){if(!b.tail)return;checkpoint();b.tail=false;sync();status('꼬리를 숨겼습니다. 방향 버튼으로 다시 켤 수 있습니다.');return}
 checkpoint();b.tail=true;b.tailDirection=direction;b.tailSlant=slant;
 const tips={top:[.5,-.25],bottom:[.5,1.25],left:[-.25,.5],right:[1.25,.5]};[b.tx,b.ty]=tips[direction];
 if(slant){if(['top','bottom'].includes(direction))b.tx=slant<0?-.25:1.25;else b.ty=slant<0?-.25:1.25}
 sync();status('꼬리 방향을 바꿨습니다. 주황색 끝점을 끌어 길이와 위치를 조절하세요.');
}
function constrainTailTip(b){
 const clamp=(v,a,z)=>Math.max(a,Math.min(z,v)),slant=b.tailSlant||0,tangent=v=>slant<0?clamp(v,-1,-.12):slant>0?clamp(v,1.12,2):clamp(v,.2,.8);
 if(['top','bottom'].includes(b.tailDirection)){b.tx=tangent(b.tx);b.ty=b.tailDirection==='top'?clamp(b.ty,-1,-.12):clamp(b.ty,1.12,2)}else{b.ty=tangent(b.ty);b.tx=b.tailDirection==='left'?clamp(b.tx,-1,-.12):clamp(b.tx,1.12,2)}
}
// Keep the draggable last circle at the tip; halve the clear gaps between circles.
function thoughtTailPath(ax,ay,tx,ty,unit){
 const p=new Path2D(),distance=Math.hypot(tx-ax,ty-ay),ux=distance?(tx-ax)/distance:0,uy=distance?(ty-ay)/distance:1,step=distance/3;
 const radii=[3*unit,2*unit,unit],centers=[0,0,0];
 for(let i=1;i>=0;i--){const touching=radii[i]+radii[i+1],spacing=step>touching?touching+(step-touching)*.5:step;centers[i]=centers[i+1]+spacing}
 for(let i=0;i<3;i++){const x=tx-ux*centers[i],y=ty-uy*centers[i],r=radii[i];p.moveTo(x+r,y);p.arc(x,y,r,0,Math.PI*2)}return p;
}
function directedTailPath(b){
 const p=new Path2D(),d=b.tailDirection,vertical=d==='top'||d==='bottom',sign=d==='top'||d==='left'?-1:1;
 const anchor=warpedPoint(b,b.x+b.w*(vertical?.5:(sign<0?.28:.72)),b.y+b.h*(vertical?(sign<0?.28:.72):.5));const ax=anchor.x,ay=anchor.y,tx=b.x+b.tx*b.w,ty=b.y+b.ty*b.h;
 if(balloonTailStyle(b)==='thought')return thoughtTailPath(ax,ay,tx,ty,Math.min(b.w,b.h)*.025)
 const half=(vertical?b.w:b.h)*.1,ux=vertical?half:0,uy=vertical?0:half,reach=(vertical?Math.abs(ty-ay):Math.abs(tx-ax))*.45,nx=vertical?0:sign*reach,ny=vertical?sign*reach:0;
 p.moveTo(ax-ux,ay-uy);p.quadraticCurveTo(ax-ux+nx,ay-uy+ny,tx,ty);p.quadraticCurveTo(ax+ux+nx,ay+uy+ny,ax+ux,ay+uy);p.closePath();return p;
}

// Apply fill opacity once, then draw opaque exposed outlines on a separate pass.
function drawBalloonOutlines(c,paths,x,y,w,h,b={}){c.save();c.setLineDash(b.borderStyle==='dotted'?[.01,(b.dashGap??6)+c.lineWidth]:[]);if(b.borderStyle==='dotted')c.lineCap='round';for(let i=0;i<paths.length;i++){c.save();for(let j=0;j<paths.length;j++)if(i!==j){const outside=new Path2D(paths[j]);outside.closePath();outside.rect(x,y,w,h);c.clip(outside,'evenodd')}c.stroke(paths[i]);c.restore()}c.restore()}

function syncBalloonBorderControls(){
 const b=current(),supported=!!b&&!['text','asset'].includes(b.kind);
 const group=$('balloonBorderOptions');if(group)group.hidden=!supported;
 for(const prefix of ['', 'layerMini']){
  const id=prefix?prefix+'BorderStyle':'borderStyle',gapId=prefix?prefix+'DashGap':'dashGap',style=$(id),gap=$(gapId),output=$(gapId+'Value');
  if(style){style.value=b?.borderStyle||'solid';style.disabled=projectBusy||!supported}
  if(gap){gap.value=b?.dashGap??6;gap.disabled=projectBusy||!supported||b.borderStyle!=='dotted'}
  if(output)output.textContent=(b?.dashGap??6)+' px';
 }
}
function initBalloonBorderControls(){
 for(const [id,key]of [['borderStyle','borderStyle'],['dashGap','dashGap'],['layerMiniBorderStyle','borderStyle'],['layerMiniDashGap','dashGap']]){
  const field=$(id);if(!field)continue;field.onfocus=()=>{inputHistoryKey=null};field.oninput=()=>{const b=current();if(projectBusy||!b||['text','asset'].includes(b.kind))return;const value=key==='dashGap'?Math.max(1,Math.min(40,Number(field.value)||1)):field.value;if(key==='borderStyle'&&!['solid','dotted'].includes(value)||b[key]===value)return;recordInput(key);b[key]=value;shareBalloonStyle(b,key);render()};field.onchange=()=>{inputHistoryKey=null};
 }
 syncBalloonBorderControls();
}
