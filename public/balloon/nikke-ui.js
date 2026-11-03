'use strict';
const NIKKE_ACCENT_COLOR='#ff5046';
const NIKKE_BONDED_INK='rgba(194,36,49,0.72)';
const NIKKE_FONT_FAMILY='"Studio Nikke Pretendard",sans-serif';
const NIKKE_TYPE_SIZE={name:28,body:28,top:26,line:45.7,tracking:.2};
const nikkeNameColors=[['#c8cddc','스노우 화이트 · 흰색'],['#ed2026','라피 · 빨강'],['#a570f0','세실 · 보라'],['#fcc642','아니스 · 노랑'],['#499ef8','네온 · 하늘색']];
const nikkeTypes=[['dialogue','세로 대화'],['choice','대화 선택지'],['consult','상담 화면'],['confirm','상담 확인 팝업']];
gameUIPresets.push({name:'승리의 여신: 니케 · 세로 UI',file:'nikke',w:720,h:1560,text:'오늘은 어떤 이야기를 나눌까요?',size:26});
gameUISVG.push('data:image/svg+xml;base64,'+btoa('<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1560"/>'));
function nikkeLayer(type){return{id:crypto.randomUUID(),kind:'gameui',name:'니케 · '+nikkeTypes.find(x=>x[0]===type)[1],locked:true,src:gameUISVG[3],gamePreset:3,gameText:'오늘은 어떤 이야기를 나눌까요?',gameName:'니케',gameAffiliation:'',font:GAME_UI_FONT,gameFontSize:26,gameTextScale:1,x:0,y:0,w:state.width,h:state.height,visible:true,strokes:[],nikkeType:type,nikkeConfirmOpen:false,nikkeNameColor:nikkeNameColors[0][0],media:'',mediaZoom:100,mediaX:50,mediaY:50,nikkeTop:true,nikkeTopAction:type==='dialogue'?'skip':'cancel',nikkeChoiceOverlay:false,nikkeStoryChoices:false,nikkeFavorite:false,nikkeHeart:false,nikkeHeartRow:2,nikkeChoices:['맛있는 걸 봤을 때?','음악의 영감이 떠오를 때?'],nikkeRank:12,nikkeBond:280,nikkeBondMax:420,nikkeBondIsMax:false,nikkeDiary:20,nikkeDiaryMax:20,nikkeDiaryPhotoY:50,nikkeCount:6,nikkeCountMax:10,nikkeConsultLabel:'상담',nikkeBondedMode:'auto',nikkeConsultScribble:false,nikkeConsultHandwriting:'해명하기',nikkeGems:'976',nikkeCredits:'7773 K',nikkeDim:65,nikkeChoiceY:76,nikkePopupText:'니케의 상담을 진행하겠습니까?'}}
function validateNikkeUI(l){if(l.nikkeConfirmOpen!==undefined&&typeof l.nikkeConfirmOpen!=='boolean')throw Error('상담 확인 팝업 표시 설정이 올바르지 않습니다.');if(l.nikkeBondedMode!==undefined&&!['auto','show','hide'].includes(l.nikkeBondedMode))throw Error('Bonded 표시 설정이 올바르지 않습니다.');if(l.nikkeConsultScribble!==undefined&&typeof l.nikkeConsultScribble!=='boolean')throw Error('상담 취소 낙서 설정이 올바르지 않습니다.');if(l.nikkeConsultHandwriting!==undefined&&(typeof l.nikkeConsultHandwriting!=='string'||l.nikkeConsultHandwriting.length>40))throw Error('상담 손글씨는 40자 이하로 입력해줘.');if(l.nikkeDiaryPhotoY!==undefined&&(!Number.isFinite(l.nikkeDiaryPhotoY)||l.nikkeDiaryPhotoY<0||l.nikkeDiaryPhotoY>100))throw Error('상담 일지 사진 위치가 올바르지 않습니다.');if(l.nikkeConsultLabel!==undefined&&(typeof l.nikkeConsultLabel!=='string'||l.nikkeConsultLabel.length>100))throw Error('상담 버튼 문구는 100자 이하로 입력해줘.');if(l.nikkeBondIsMax!==undefined&&typeof l.nikkeBondIsMax!=='boolean')throw Error('호감도 MAX 모드 설정이 올바르지 않습니다.');if(l.nikkeTopAction!==undefined&&!['skip','cancel'].includes(l.nikkeTopAction))throw Error('니케 상단 메뉴 설정이 올바르지 않습니다.');if(l.nikkeStoryChoices!==undefined&&typeof l.nikkeStoryChoices!=='boolean')throw Error('스토리 선택지 표시 설정이 올바르지 않습니다.');if(l.nikkeChoiceOverlay!==undefined&&typeof l.nikkeChoiceOverlay!=='boolean')throw Error('니케 선택지 표시 방식이 올바르지 않습니다.');if(l.nikkeNameColor!==undefined&&(typeof l.nikkeNameColor!=='string'||!/^#[0-9a-fA-F]{6}$/.test(l.nikkeNameColor)))throw Error('니케 이름 표시 색상이 올바르지 않습니다.');const img=v=>typeof v==='string'&&v.length<=24000000&&(!v||/^data:image\/(png|jpeg|webp);base64,/.test(v));if(!nikkeTypes.some(x=>x[0]===l.nikkeType)||!img(l.media)||!['nikkeTop','nikkeHeart','nikkeFavorite'].every(k=>typeof l[k]==='boolean')||!Array.isArray(l.nikkeChoices)||l.nikkeChoices.length<1||l.nikkeChoices.length>4||l.nikkeChoices.some(x=>typeof x!=='string'||x.length>500)||!['nikkeGems','nikkeCredits','nikkePopupText'].every(k=>typeof l[k]==='string'&&l[k].length<=2000)||!['mediaZoom','mediaX','mediaY','nikkeRank','nikkeBond','nikkeBondMax','nikkeDiary','nikkeDiaryMax','nikkeCount','nikkeCountMax','nikkeDim','nikkeChoiceY','nikkeHeartRow'].every(k=>Number.isFinite(l[k]))||l.mediaZoom<100||l.mediaZoom>500||l.mediaX<0||l.mediaX>100||l.mediaY<0||l.mediaY>100||l.nikkeDim<0||l.nikkeDim>100||l.nikkeChoiceY<15||l.nikkeChoiceY>90||!Number.isInteger(l.nikkeHeartRow)||l.nikkeHeartRow<1||l.nikkeHeartRow>4||['nikkeRank','nikkeBond','nikkeBondMax','nikkeDiary','nikkeDiaryMax','nikkeCount','nikkeCountMax'].some(k=>l[k]<0||l[k]>999999))throw Error('니케 UI 설정이 올바르지 않습니다.')}
function nikkeDialogueTopLayout(c,l){
 c.font='700 '+NIKKE_TYPE_SIZE.top+'px '+NIKKE_FONT_FAMILY;
 const action=l.nikkeTopAction||(l.nikkeType==='dialogue'?'skip':'cancel'),labels=['HIDE','AUTO','LOG',action.toUpperCase()],iconWidth=28,iconGap=10,groupGap=18;
 const groups=labels.map((text,i)=>({text,icon:['hide','auto','log',action][i],width:iconWidth+iconGap+c.measureText(text).width}));
 const total=groups.reduce((n,g)=>n+g.width,0)+groupGap*(groups.length-1),fit=Math.min(1,656/total);let x=672-total*fit;
 for(const g of groups){g.x=x;g.textX=x+(iconWidth+iconGap)*fit;g.right=x+g.width*fit;x=g.right+groupGap*fit}return{groups,fit};
}
function nikkeDrawDialogueTop(c,l,width,height){
 c.save();c.setTransform(width/720,0,0,width/720,0,0);const y=height*102/1560/(width/720),{groups,fit}=nikkeDialogueTopLayout(c,l);
 c.fillStyle='#fff';c.strokeStyle='#fff';c.lineWidth=3;c.lineCap='round';c.lineJoin='round';c.textAlign='left';c.textBaseline='middle';c.font='700 '+NIKKE_TYPE_SIZE.top*fit+'px '+NIKKE_FONT_FAMILY;
 const path=points=>{c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke()},triangle=points=>{c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill()};
 for(const g of groups){c.save();c.translate(g.x,y);c.scale(fit,fit);
 if(g.icon==='hide'){c.beginPath();c.moveTo(1,0);c.bezierCurveTo(7,-12,21,-12,27,0);c.bezierCurveTo(21,12,7,12,1,0);c.stroke();c.beginPath();c.arc(14,0,4,0,Math.PI*2);c.stroke();path([[0,-14],[28,14]])}
 else if(g.icon==='auto'){c.beginPath();c.arc(14,0,10,Math.PI*1.12,Math.PI*1.92);c.stroke();c.beginPath();c.arc(14,0,10,Math.PI*.12,Math.PI*.92);c.stroke();triangle([[26,-7],[26,2],[18,-2]]);triangle([[2,7],[2,-2],[10,2]])}
 else if(g.icon==='log'){c.beginPath();c.roundRect(3,-9,23,17,1);c.fill();triangle([[3,5],[3,14],[10,5]]);c.fillStyle='#53616a';for(const x of [8,14,20]){c.beginPath();c.arc(x,-1,1.4,0,Math.PI*2);c.fill()}}
 else if(g.icon==='skip'){triangle([[3,-7],[3,7],[14,0]]);triangle([[15,-7],[15,7],[26,0]])}
 else{path([[5,-10],[25,10]]);path([[25,-10],[5,10]])}
 c.restore();c.fillText(g.text,g.textX,y);
 }c.restore();
}
function nikkeDrawDialogueText(c,l,width,height){
 const unit=width/720,ratio=l.gameTextScale??1;c.save();c.setTransform(unit,0,0,unit,0,0);c.fillStyle='#fff';c.textAlign='left';c.textBaseline='alphabetic';c.letterSpacing=NIKKE_TYPE_SIZE.tracking*ratio+'px';
 const write=(text,top,size)=>{c.font='600 '+size+'px '+NIKKE_FONT_FAMILY;const m=c.measureText(text);c.fillText(text,51,top+(m.actualBoundingBoxAscent||size*.8))};
 c.font='600 '+NIKKE_TYPE_SIZE.name*ratio+'px '+NIKKE_FONT_FAMILY;let name=l.gameName;while(name.length>1&&c.measureText(name).width>620)name=name.slice(0,-1);if(name!==l.gameName)name=name.slice(0,-1)+'…';c.fillStyle='#f5f5f5';write(name,height*1307/1536/unit,NIKKE_TYPE_SIZE.name*ratio);
 c.font='600 '+NIKKE_TYPE_SIZE.body*ratio+'px '+NIKKE_FONT_FAMILY;c.fillStyle='#e1e1e1';const rows=gameUIWrap(c,l.gameText,620).slice(0,4),top=height*1364/1536/unit;rows.forEach((text,i)=>write(text,top+i*NIKKE_TYPE_SIZE.line*ratio,NIKKE_TYPE_SIZE.body*ratio));c.restore();
}
// Shared vector artwork keeps previews, saved templates and exports identical.
function nikkeDrawGem(c,x,y,size=34){
 c.save();c.translate(x,y);c.scale(size/36,size/36);
 const poly=(p,fill,stroke,w=1)=>{c.beginPath();p.forEach(([a,b],i)=>i?c.lineTo(a,b):c.moveTo(a,b));c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=w;c.stroke()}};
 c.shadowColor='#55dbff';c.shadowBlur=6;poly([[-12,-19],[15,-7],[12,19],[-16,6]],'#111c29','#4dcdf0',2);c.shadowBlur=0;
 poly([[-10,-15],[11,-6],[9,14],[-12,4]],'#147cc4','#071926',2);
 poly([[-10,-15],[-3,-3],[-12,4]],'#a9eefe');poly([[-10,-15],[11,-6],[-3,-3]],'#64d9fa');poly([[11,-6],[9,14],[-3,-3]],'#0661b3');poly([[-12,4],[-3,-3],[9,14]],'#149fef');poly([[-3,-3],[2,3],[-4,9],[-8,1]],'#b5f6ff');poly([[2,3],[9,14],[-4,9]],'#4ac9ff');
 c.strokeStyle='rgba(220,252,255,.7)';c.lineWidth=.7;c.beginPath();c.moveTo(-10,-15);c.lineTo(-3,-3);c.lineTo(9,14);c.moveTo(-12,4);c.lineTo(-3,-3);c.lineTo(11,-6);c.stroke();c.restore();
}
function nikkeDrawCredit(c,x,y,w=38,h=26){
 c.save();c.translate(x,y);c.rotate(.07);
 const g=c.createLinearGradient(-w/2,-h/2,w/2,h/2);g.addColorStop(0,'#fff0ab');g.addColorStop(.3,'#b99751');g.addColorStop(.65,'#ead08c');g.addColorStop(1,'#8c713b');
 c.fillStyle=g;c.strokeStyle='#171e23';c.lineWidth=2;c.beginPath();c.roundRect(-w/2,-h/2,w,h,3);c.fill();c.stroke();
 c.fillStyle='#252b34';c.beginPath();c.roundRect(-w/2+4,-h/2+3,w-8,h-6,2);c.fill();
 c.fillStyle='#d7bd7b';c.beginPath();c.moveTo(-w/2+3,-h/2+3);c.lineTo(-w/2+8,-h/2+3);c.lineTo(-w/2+8,h/2-7);c.lineTo(-w/2+3,h/2-3);c.closePath();c.fill();
 c.fillStyle='#f0ede0';c.fillRect(w*.23,-h*.32,5,3);c.fillStyle='#c6a167';c.beginPath();c.ellipse(w*.23,h*.15,5,6,0,0,Math.PI*2);c.fill();c.fillStyle='#333640';c.fillRect(w*.23-1,h*.15-4,2,7);c.fillRect(w*.23-3,h*.15-2,1,5);c.fillRect(w*.23+2,h*.15-2,1,5);
 c.strokeStyle='rgba(255,255,255,.2)';c.lineWidth=1;c.beginPath();c.moveTo(-8,-6);c.lineTo(1,-6);c.moveTo(-8,6);c.lineTo(-2,6);c.stroke();c.restore();
}
// Font-independent geometric lettering, including every editable rank digit.
const NIKKE_RANK_PATHS={
 R:[31,'M0 40V0H20Q31 0 31 11Q31 21 20 22L32 40H23L12 23H7V40ZM7 7V16H20Q24 16 24 11Q24 7 20 7Z'],
 A:[34,'M0 40L17 0L34 40H26L17 18L8 40Z'],
 N:[32,'M0 40V0L25 26V0H32V40L7 14V40Z'],
 K:[32,'M0 0H7V18L24 0H33L15 20L34 40H24L7 21V40H0Z'],
 0:[32,'M11 0H21Q32 0 32 11V29Q32 40 21 40H11Q0 40 0 29V11Q0 0 11 0ZM11 7Q7 7 7 11V29Q7 33 11 33H21Q25 33 25 29V11Q25 7 21 7Z'],
 1:[18,'M0 7L10 0H18V40H10V9L0 15Z'],
 2:[32,'M0 0H21Q32 0 32 11Q32 20 22 24L9 30Q7 31 7 33H32V40H0V34Q0 27 8 23L22 17Q25 16 25 11Q25 7 21 7H0Z'],
 3:[32,'M0 0H21Q32 0 32 10Q32 17 27 20Q32 23 32 30Q32 40 21 40H0V33H21Q25 33 25 29Q25 23 20 23H4V17H20Q25 17 25 11Q25 7 21 7H0Z'],
 4:[32,'M0 0H7V17H25V0H32V40H25V24H0Z'],
 5:[32,'M0 0H32V7H7V17H21Q32 17 32 29Q32 40 21 40H0V33H21Q25 33 25 29Q25 24 21 24H0Z'],
 6:[32,'M11 0H32V7H11Q7 7 7 11V17H21Q32 17 32 29Q32 40 21 40H11Q0 40 0 29V11Q0 0 11 0ZM7 24V29Q7 33 11 33H21Q25 33 25 29Q25 24 21 24Z'],
 7:[32,'M0 0H32V7L14 40H5L24 7H0Z'],
 8:[32,'M11 0H21Q32 0 32 10Q32 17 27 20Q32 23 32 30Q32 40 21 40H11Q0 40 0 30Q0 23 5 20Q0 17 0 10Q0 0 11 0ZM11 7Q7 7 7 11Q7 17 11 17H21Q25 17 25 11Q25 7 21 7ZM11 23Q7 23 7 29Q7 33 11 33H21Q25 33 25 29Q25 23 21 23Z'],
 9:[32,'M11 0H21Q32 0 32 11V29Q32 40 21 40H0V33H21Q25 33 25 29V23H11Q0 23 0 11Q0 0 11 0ZM11 7Q7 7 7 11Q7 17 11 17H25V11Q25 7 21 7Z']
};
const nikkeRankVectorCache=new Map();
function nikkeDrawRank(c,rank,x=104,y=1018,color=NIKKE_ACCENT_COLOR){
 const chars='RANK '+String(rank),width=Array.from(chars).reduce((n,ch)=>n+(ch===' '?15:NIKKE_RANK_PATHS[ch][0]+4),0)-4;
 c.save();c.translate(x,y);c.scale(Math.min(.9,397/width),.8);c.fillStyle=color;let offset=0;
 for(const ch of chars){if(ch===' '){offset+=15;continue}const [w,d]=NIKKE_RANK_PATHS[ch];if(!nikkeRankVectorCache.has(ch))nikkeRankVectorCache.set(ch,new Path2D(d));c.save();c.translate(offset,0);c.fill(nikkeRankVectorCache.get(ch),'evenodd');c.restore();offset+=w+4}c.restore();
}
function nikkeDrawGift(c,x=193,y=1284){
 c.save();c.translate(x,y);c.fillStyle='#fff';
 const box=(x,y,w,h)=>{c.beginPath();c.roundRect(x,y,w,h,1.7);c.fill()};
 // Four separate blocks leave both ribbon gaps open, including the horizontal one.
 box(-32,-10,28,22);box(4,-10,28,22);box(-27,18,23,21);box(4,18,23,21);
 c.strokeStyle='#fff';c.lineWidth=4.5;c.lineCap='round';c.beginPath();c.moveTo(0,-10);c.bezierCurveTo(-4,-25,-17,-32,-21,-23);c.bezierCurveTo(-27,-12,-12,-10,0,-10);c.bezierCurveTo(4,-25,17,-32,21,-23);c.bezierCurveTo(27,-12,12,-10,0,-10);c.stroke();c.restore();
}

function nikkeDrawNavigation(c){
 const shape=(x,y,w,h)=>{c.beginPath();c.moveTo(x+4,y);c.lineTo(x+w-10,y);c.quadraticCurveTo(x+w-5,y,x+w-4,y+5);c.lineTo(x+w,y+h-5);c.quadraticCurveTo(x+w,y+h,x+w-5,y+h);c.lineTo(x+8,y+h);c.quadraticCurveTo(x+4,y+h,x+4,y+h-4);c.lineTo(x,y+5);c.quadraticCurveTo(x,y,x+4,y);c.closePath()};
 const stroke=(pts,color,width)=>{c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=color;c.lineWidth=width;c.stroke()};
 c.save();
 for(const [x,w]of[[4,155],[168,58]]){const y=1478,h=57;c.save();c.shadowColor='rgba(0,0,0,.3)';c.shadowBlur=4;c.shadowOffsetY=2;shape(x,y,w,h);const g=c.createLinearGradient(x,y,x+w,y+h);g.addColorStop(0,'#00b5e9');g.addColorStop(1,'#049cd8');c.fillStyle=g;c.fill();c.shadowColor='transparent';c.save();shape(x,y,w,h);c.clip();stroke([[x+17,y-2],[x+52,y+h+2]],'rgba(114,226,255,.13)',20);stroke([[x+w-35,y-2],[x+w,y+h+2]],'rgba(0,99,177,.13)',10);c.restore();shape(x,y,w,h);c.strokeStyle='rgba(176,237,255,.6)';c.lineWidth=1;c.stroke()}
 c.lineJoin='round';c.lineCap='round';
 const door=[[30,1496],[30,1491],[49,1491],[51,1493],[51,1519],[49,1521],[30,1521],[30,1516]];
 c.save();c.translate(1.5,2);stroke(door,'#147b9b',5);c.restore();stroke(door,'#fff',3);
 c.fillStyle='#fff';c.beginPath();for(const [i,[x,y]]of[[24,1499],[16,1506],[24,1513],[24,1509],[39,1509],[39,1502],[24,1502]].entries())i?c.lineTo(x,y):c.moveTo(x,y);c.closePath();c.fill();
 c.fillStyle='#fff';c.font='700 20px '+NIKKE_FONT_FAMILY;c.textAlign='center';c.textBaseline='middle';c.fillText('뒤로가기',103,1506,95);
 stroke([[181,1501],[197,1487],[213,1501]],'#fff',2.5);
 c.beginPath();for(const [i,[x,y]]of[[185,1503],[197,1493],[209,1503],[209,1520],[200,1520],[200,1510],[194,1510],[194,1520],[185,1520]].entries())i?c.lineTo(x,y):c.moveTo(x,y);c.closePath();c.fill();c.restore();
}

// Draw both button marks as paths so they do not depend on a device's cursive fonts.
function nikkeConsultWatermarks(c,l){
 c.save();c.beginPath();c.rect(371,1303,273,94);c.clip();
 c.strokeStyle='rgba(204,239,255,.15)';c.lineWidth=6;c.lineJoin='round';
 c.beginPath();c.moveTo(560,1329);c.lineTo(637,1329);c.lineTo(637,1398);c.lineTo(560,1398);c.closePath();c.stroke();
 c.lineCap='round';c.lineWidth=9;for(const x of[575,619]){c.beginPath();c.moveTo(x,1318);c.lineTo(x,1338);c.stroke()}
 c.beginPath();c.moveTo(560,1345);c.lineTo(637,1345);c.lineWidth=4;c.stroke();
 c.fillStyle='rgba(204,239,255,.18)';c.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?6:13,x=599+Math.cos(a)*r,y=1372+Math.sin(a)*r;i?c.lineTo(x,y):c.moveTo(x,y)}c.closePath();c.fill();
 c.restore();
 if(nikkeBondedVisible(l))nikkeBondedSignature(c);
}

function ensureNikkeBonded(){return builtinFontReady}
function nikkeBondedVisible(l){return l.nikkeBondedMode==='show'||l.nikkeBondedMode!=='hide'&&(l.nikkeBondedMode??'auto')==='auto'&&(l.nikkeDiary??0)>=5}
function nikkeBondedSignature(c){
 c.save();c.translate(0,-16);c.fillStyle=NIKKE_BONDED_INK;c.strokeStyle=NIKKE_BONDED_INK;c.lineCap='round';
 c.save();c.translate(371,1370);c.rotate(-.55);c.font='36px "Studio Dynalight"';c.textAlign='left';c.textBaseline='alphabetic';c.fillText('Bonded',0,0);const end=c.measureText('Bonded').width;c.lineWidth=1.15;c.lineJoin='round';c.beginPath();c.moveTo(end-5,-2);c.bezierCurveTo(end,-3,end+3,3,end+7,3);c.bezierCurveTo(end+12,-1,end+20,-6,end+17,-11);c.bezierCurveTo(end+14,-16,end+10,-12,end+9,-8);c.bezierCurveTo(end+8,-14,end+2,-16,end-1,-11);c.bezierCurveTo(end-4,-5,end+2,0,end+7,3);c.bezierCurveTo(end+12,2,end+17,-2,end+21,-5);c.stroke();c.restore();
 c.lineWidth=1.25;c.beginPath();c.moveTo(371,1374);c.bezierCurveTo(398,1361,425,1345,450,1328);c.moveTo(374,1378);c.bezierCurveTo(399,1364,424,1349,448,1333);c.stroke();
 c.restore();
}

// Fixed burgundy ink and an ascending handwritten baseline echo the reference.
const NIKKE_SCRIBBLE_INK='#772b49';
function nikkeDrawConsultScribble(c,l){
 if(!l.nikkeConsultScribble||!nikkeBondedVisible(l))return;
 c.save();c.strokeStyle=NIKKE_SCRIBBLE_INK;c.fillStyle=NIKKE_SCRIBBLE_INK;c.lineCap='round';c.lineJoin='round';
 const stroke=(pts,width)=>{c.lineWidth=width;c.beginPath();c.moveTo(...pts[0]);for(let i=1;i<pts.length;i++)c.lineTo(...pts[i]);c.stroke()};
 // Cancel the existing Bonded signature in its own rotated coordinates.
 c.save();c.translate(365,1297);c.scale(90/113,76/100);c.translate(-371,-1298);c.translate(375,1372);c.rotate(-.55);c.scale(.97,.97);
 stroke([[0,-25],[25,-19],[53,-9],[85,1],[111,10]],3.5);
 stroke([[2,12],[27,2],[55,-11],[84,-24],[110,-32]],4);
 stroke([[5,15],[40,-1],[77,-20],[108,-30]],1.5);
 stroke([[1,-22],[39,-13],[78,1],[109,12]],1.2);
 c.restore();
 const text=String(l.nikkeConsultHandwriting??'해명하기').replace(/\s+/g,' ').trim();
 if(text){c.translate(320,1340);c.rotate(-.55);c.transform(1,0,-.16,1,0,0);c.font='54px "Studio Pen",cursive';c.textAlign='left';c.textBaseline='alphabetic';const fit=Math.min(1,245/Math.max(1,c.measureText(text).width));c.scale(fit,1);c.fillText(text,0,0);}
 c.restore();
}

function nikkeDrawConsult(c,l,photo){
 const red=NIKKE_ACCENT_COLOR,family=NIKKE_FONT_FAMILY;
 const box=(x,y,w,h,fill,r=0,stroke)=>{c.fillStyle=fill;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke()}};
 const path=(pts,fill,stroke,width=2)=>{c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));if(fill){c.closePath();c.fillStyle=fill;c.fill()}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke()}};
 const text=(t,x,y,size=24,color='#fff',align='left',max=650)=>{c.fillStyle=color;c.font='700 '+size+'px '+family;c.textAlign=align;c.textBaseline='middle';c.fillText(String(t),x,y,max)};
 const condensed=(t,x,y,size,max,align='left',color='#fff')=>{c.save();c.translate(x,y);c.scale(.65,1);text(t,0,0,size,color,align,max/.65);c.restore()};
 const info=(x,y,r=10,color='#fff')=>{c.strokeStyle=color;c.lineWidth=2;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.stroke();text('i',x,y+1,r*1.5,color,'center')};
 const star=(x,y,r,color)=>{const p=[];for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,s=i%2?r*.44:r;p.push([x+Math.cos(a)*s,y+Math.sin(a)*s])}path(p,color)};
 const heart=(x,y)=>path([[-15,-7],[-10,-12],[-5,-12],[0,-7],[5,-12],[10,-12],[15,-7],[15,3],[0,16],[-15,3]].map(([a,b])=>[x+a,y+b]),red);
 const hatch=(x,y,w,h,color='rgba(255,255,255,.08)')=>{c.save();c.beginPath();c.rect(x,y,w,h);c.clip();for(let p=-h;p<w;p+=32)path([[x+p,y],[x+p+h,y+h]],null,color,11);c.restore()};
 const button=(x,y,w,h,top,bottom)=>{c.save();c.shadowColor='rgba(0,0,0,.25)';c.shadowBlur=5;c.shadowOffsetY=2;const g=c.createLinearGradient(x,y,x,y+h);g.addColorStop(0,top);g.addColorStop(1,bottom);box(x,y,w,h,g,2,'rgba(255,255,255,.55)');c.restore();box(x+3,y+3,w-6,h-6,'rgba(255,255,255,.025)',1,'rgba(0,0,0,.09)')};
 c.save();
 if(l.nikkeTop){
 box(0,88,143,47,'rgba(9,11,13,.55)');text('상담',38,111,19);info(120,111,10);
 box(155,89,364,45,'rgba(5,8,12,.56)',12,'rgba(225,221,197,.22)');nikkeDrawGem(c,193,111,32);condensed(l.nikkeGems,279,111,30,68,'right');text('+',299,111,30,'#fff','center',30);nikkeDrawCredit(c,378,111,37,25);condensed(l.nikkeCredits,507,111,30,102,'right');
 box(570,88,150,47,'rgba(8,10,14,.54)',6);box(599,99,29,23,'#ddd',2);path([[600,101],[613.5,111],[627,101]],null,'#56595c',2);path([[644,97],[644,126]],null,'rgba(255,255,255,.18)',1);for(const [a,b]of[[660,98],[675,98],[660,113],[675,113]])box(a,b,11,11,'#d8d8d8');c.fillStyle='#ff704d';c.strokeStyle='#fff';c.lineWidth=1.5;c.beginPath();c.arc(694,96,7,0,Math.PI*2);c.fill();c.stroke();
 }
 path([[52,710],[36,737],[52,764]],null,'rgba(0,0,0,.22)',10);path([[52,710],[36,737],[52,764]],null,'#fff',6);path([[669,710],[685,737],[669,764]],null,'#fff',6);
 box(10,967,700,478,'rgba(250,252,254,.91)',4);box(10,961,700,6,red);
 // Subtle screen-print grid and geometric watermark stay behind the content.
 c.save();c.beginPath();c.rect(10,968,700,477);c.clip();for(let x=12;x<710;x+=5)path([[x,969],[x,1445]],null,'rgba(55,94,115,.025)',.7);for(let y=970;y<1445;y+=5)path([[10,y],[710,y]],null,'rgba(55,94,115,.025)',.7);path([[10,1020],[325,967],[432,1445],[130,1445]],'rgba(218,226,235,.2)');text('N',320,1080,170,'rgba(202,214,226,.12)','center');c.restore();
 c.save();c.shadowColor='rgba(0,0,0,.22)';c.shadowBlur=7;c.shadowOffsetY=2;button(47,945,54,55,l.nikkeFavorite?'#ff6851':'#8e969b',l.nikkeFavorite?'#f02b18':'#60666c');c.restore();star(74,973,17,'#fff');for(let i=0;i<4;i++)path([[113+i*10,981],[123+i*10,991]],null,red,4);path([[158,982],[184,982]],null,red,1.5);
 heart(75,1030);nikkeDrawRank(c,l.nikkeRank);text(l.gameName,51,1089,39,'#292a2d','left',410);condensed(l.nikkeBondIsMax?'MAX':l.nikkeBond+'/'+l.nikkeBondMax,503,1127,26,200,'right',red);
 box(50,1144,458,8,'#bfc0c2',4);const bond=l.nikkeBondIsMax?1:Math.min(1,l.nikkeBond/Math.max(1,l.nikkeBondMax));if(bond>0)box(50,1144,458*bond,8,red,4);
 c.strokeStyle='#9b9da0';c.lineWidth=3;c.beginPath();c.arc(57,1173,4,Math.PI,0);c.stroke();box(51,1173,12,11,'#9b9da0',2);text('다음 에피소드 필요 호감도 랭크 ▶▶ 없음',70,1179,16,'#96979a','left',433);
 // The diary is a tilted paper card; the photo stays clipped inside its frame.
 c.save();c.translate(616,1044);c.rotate(.075);c.shadowColor='rgba(0,0,0,.35)';c.shadowBlur=5;c.shadowOffsetY=3;box(-82,-126,165,252,'#f5f5f5',6,'#c5c8cb');c.shadowColor='transparent';
 if(photo){c.save();c.beginPath();c.rect(-72,-111,145,151);c.clip();const iw=photo.naturalWidth||photo.width,ih=photo.naturalHeight||photo.height,k=Math.max(145/iw,151/ih);c.drawImage(photo,-72+(145-iw*k)/2,-111+(151-ih*k)*(l.nikkeDiaryPhotoY??50)/100,iw*k,ih*k);c.restore()}else box(-72,-111,145,151,'#d9dde1');
 box(-69,51,15,21,red);for(const px of[-67,-57])for(const py of[54,60,66])box(px,py,2,3,'#fff');text('상담 일지',15,63,19,'#505052','center',115);box(-69,91,15,13,'#383c40',1);path([[-66,89],[-66,94]],null,'#383c40',2);path([[-57,89],[-57,94]],null,'#383c40',2);box(-66,96,3,3,'#fff');box(-60,96,3,3,'#fff');condensed(l.nikkeDiary+'/'+l.nikkeDiaryMax,64,101,20,111,'right','#4d4d50');box(-72,115,145,6,red);c.restore();
 box(44,1204,632,229,'rgba(255,255,255,.79)',10);path([[344,1228],[344,1404]],null,'#d3d5d7',1);
 button(72,1230,242,169,'#ffb72b','#ff980d');hatch(76,1234,234,161,'rgba(255,255,255,.035)');nikkeDrawGift(c);text('선물하기',193,1361,31,'#fff','center');
 button(368,1230,279,61,'#ff8354','#ff6034');hatch(540,1234,103,53);path([[445,1251],[455,1261],[445,1271]],null,'#fff',4);path([[456,1251],[466,1261],[456,1271]],null,'#fff',4);text('간편 상담',527,1261,24,'#fff','center',190);
 button(368,1300,279,100,'#21a1db','#1679b6');nikkeConsultWatermarks(c,l);text(l.nikkeConsultLabel??'상담',508,1334,32,'#fff','center',235);box(438,1362,139,25,'#e9f6ff',9);text('상담 횟수 '+l.nikkeCount+'/'+l.nikkeCountMax,508,1375,16,'#298fbe','center',135);nikkeDrawConsultScribble(c,l);
 nikkeDrawNavigation(c);
 // The additional-stat tab extends the translucent consultation panel below it.
 c.save();c.fillStyle='rgba(250,252,254,.91)';c.beginPath();c.moveTo(397,1445);c.lineTo(697,1445);c.lineTo(697,1509);c.quadraticCurveTo(697,1521,685,1521);c.lineTo(437,1521);c.quadraticCurveTo(426,1521,422,1510);c.closePath();c.fill();c.restore();
 button(430,1457,247,50,'#ff7350','#ff4938');hatch(596,1461,78,42);info(478,1482,10);text('추가 능력치',568,1482,22,'#fff','center',160);
 c.restore();
}

function nikkeBitmap(l,photo=postMediaImages.get(l.id)){
 const out=document.createElement('canvas'),scale=Math.min(1,2000/l.w,3000/l.h);out.width=Math.max(1,Math.round(l.w*scale));out.height=Math.max(1,Math.round(l.h*scale));const c=out.getContext('2d');c.scale(out.width/720,out.height/1560);const type=l.nikkeType,family=NIKKE_FONT_FAMILY,ratio=l.gameTextScale??1;
 const rect=(x,y,w,h,color,r=0)=>{c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,r);c.fill()},txt=(s,x,y,size=26,color='#fff',align='left',max=650)=>{c.fillStyle=color;c.font='700 '+size+'px '+family;c.textAlign=align;c.textBaseline='middle';c.fillText(String(s),x,y,max)},line=(pts,color='#fff',width=3)=>{c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=color;c.lineWidth=width;c.stroke()},heart=(x,y,size,color)=>{c.save();c.translate(x,y);c.scale(size/28,size/28);c.fillStyle=color;c.beginPath();c.moveTo(0,10);c.bezierCurveTo(-25,-7,-12,-23,0,-10);c.bezierCurveTo(12,-23,25,-7,0,10);c.fill();c.restore()},wrap=(text,x,y,width,size,color='#fff',align='left',maxLines=5)=>{c.font='700 '+size+'px '+family;const rows=gameUIWrap(c,text,width);rows.slice(0,maxLines).forEach((row,i)=>txt(row,x,y+i*size*1.4,size,color,align,width));return rows.length};
 if(photo&&!(type==='choice'&&l.nikkeChoiceOverlay)){const iw=photo.naturalWidth||photo.width,ih=photo.naturalHeight||photo.height,k=Math.max(out.width/iw,out.height/ih)*l.mediaZoom/100,w=iw*k,h=ih*k;c.save();c.setTransform(1,0,0,1,0,0);c.drawImage(photo,(out.width-w)*l.mediaX/100,(out.height-h)*l.mediaY/100,w,h);c.restore()}
 if(type==='choice')rect(0,0,720,1560,'rgba(0,0,0,'+l.nikkeDim/100+')');
 const dialogueTop=()=>{if(l.nikkeTop)nikkeDrawDialogueTop(c,l,out.width,out.height)};
 if(type==='dialogue'){dialogueTop();const g=c.createLinearGradient(0,1230,0,1560);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(.32,'rgba(0,0,0,.7)');g.addColorStop(1,'rgba(0,0,0,.96)');rect(0,1190,720,370,g);rect(34,1330,5,27,l.nikkeNameColor||nikkeNameColors[0][0]);nikkeDrawDialogueText(c,l,out.width,out.height);line([[673,1503],[678,1514],[683,1503]],'#ddd',4)}
 if(type==='choice'){if(!l.nikkeChoiceOverlay)dialogueTop();c.save();const unit=out.width/720,availableHeight=out.height/unit;c.setTransform(unit,0,0,unit,0,0);const n=l.nikkeChoices.length,baseFont=26*ratio;const measures=l.nikkeChoices.map(t=>{c.font='700 '+baseFont+'px '+family;const rows=gameUIWrap(c,t,460);return{rows,h:Math.max(78,rows.length*baseFont*1.4+22)}}),total=measures.reduce((a,m)=>a+m.h,0)+(n-1)*18,fit=Math.min(1,950/total);c.save();const start=Math.max(270,Math.min(availableHeight*.93-total*fit,availableHeight*l.nikkeChoiceY/100-total*fit/2));c.translate(64,start);c.scale(1,fit);let y=0;measures.forEach((m,i)=>{const active=l.nikkeHeart&&i+1===l.nikkeHeartRow;rect(0,y,592,m.h,'rgba(3,14,22,.84)');c.strokeStyle=active?'#ff4c47':'#70848f';c.lineWidth=active?4:2;c.strokeRect(0,y,592,m.h);c.save();c.beginPath();c.rect(3,y+3,586,m.h-6);c.clip();for(let x=-80;x<650;x+=22){line([[x,y],[x+50,y+m.h]],'rgba(83,152,192,.11)',1);line([[x+50,y],[x,y+m.h]],'rgba(83,152,192,.11)',1)}c.restore();for(const [x,dir]of[[12,1],[580,-1]]){c.fillStyle='#c8ecff';c.beginPath();c.moveTo(x,y+m.h/2-5);c.lineTo(x+dir*5,y+m.h/2);c.lineTo(x,y+m.h/2+5);c.fill()}if(active)heart(35,y+m.h/2,24,'#ff4c47');const first=y+m.h/2-(m.rows.length-1)*baseFont*.7;m.rows.forEach((r,j)=>txt(r,296,first+j*baseFont*1.4,baseFont,'#fff','center',460));y+=m.h+18});c.restore();c.restore()}
 if(type==='consult'||type==='confirm')nikkeDrawConsult(c,l,photo);
 if(nikkeConfirmVisible(l)){rect(0,0,720,1560,'rgba(0,0,0,'+l.nikkeDim/100+')');rect(40,477,640,408,'#1888d2',8);txt('ⓘ 상담하기',360,515,27,'#fff','center');line([[630,505],[656,531]]);line([[656,505],[630,531]]);rect(56,554,608,314,'#fff',12);txt('✓',559,763,190,'#f4f4f4','center');wrap(l.nikkePopupText,360,714,500,22*ratio,'#333','center',4);rect(78,914,267,60,'#f5f5f5',10);txt('×   취소',211,944,26,'#333','center');rect(379,914,267,60,'#03a9e7',10);txt('✓   확인',512,944,26,'#fff','center')}
 if(type==='dialogue'&&l.nikkeStoryChoices){const choices=nikkeBitmap({...l,nikkeType:'choice',nikkeChoiceOverlay:true},null);c.save();c.setTransform(1,0,0,1,0,0);c.drawImage(choices,0,0);c.restore()}
 return out;
}
async function addNikkeTemplate(type,overlay=false){if(projectBusy)return;const doc=state;try{await builtinFontReady;await ensureNikkeBonded();await ensureComicFont(GAME_UI_FONT);if(state!==doc||projectBusy)return;if(!overlay&&$('nikkeNewPage').checked){if(projectBook.pages.length>=100)throw Error('프로젝트는 최대 100장이야.');cancelRetouch();flushPage();const next=freshDocument();next.width=720;next.height=1560;const page=makePage('니케 · '+nikkeTypes.find(x=>x[0]===type)[1],next);projectBook.pages.push(page);markProjectDirty();await switchPage(page.id);if(projectBook.activeId!==page.id)return}if((state.imageLayers||[]).length>=40)throw Error('이미지 레이어는 최대 40개야.');checkpoint();const l=nikkeLayer(type);if(overlay){l.framePriority='above';if(type==='dialogue'){l.nikkeStoryChoices=true;l.name='니케 · 세로 대화 + 선택지'}else{l.nikkeChoiceOverlay=true;l.name='니케 · 스토리 선택지 덧씌우기'}}state.imageLayers??=[];state.imageLayers.push(l);closeGameTemplatePicker();selectImageLayer(l);if(typeof openMobilePanel==='function'&&mobileMedia.matches){closeMobilePanel();openMobilePanel('text')}status(overlay&&type==='dialogue'?'세로 대화와 스토리 선택지를 함께 추가했어. 이름·대사·선택지 문구를 편집해줘.':overlay?'현재 그림과 대화창 위에 선택지를 덧씌웠어. 배경 명도를 조절해줘.':'니케 UI를 추가했어. 사진과 문구를 편집해줘.')}catch(e){status(e.message||'니케 UI를 추가하지 못했어.')}}
function syncNikkeControls(){syncNikkeMarkerControls();const l=currentImageLayer(),panel=$('nikkeInspector');if(!panel)return;panel.hidden=l?.gamePreset!==3;if(panel.hidden)return;const fields=$('nikkeFields');fields.replaceChildren();const change=(key,value)=>{if(projectBusy||currentImageLayer()?.id!==l.id)return;checkpoint();l[key]=value;if(key==='nikkeChoiceOverlay'){if(value)l.framePriority='above';l.name=value?'니케 · 스토리 선택지 덧씌우기':'니케 · 대화 선택지'}if(key==='nikkeType'){l.nikkeConfirmOpen=false;}if(key==='nikkeType')l.name='니케 · '+nikkeTypes.find(x=>x[0]===value)[1];sync()},field=(key,label,min,max,options)=>{const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement(options?'select':key==='gameText'||key==='nikkePopupText'?'textarea':'input');if(options){for(const [v,t]of options){const o=document.createElement('option');o.value=v;o.textContent=t;input.append(o)}}else if(min!==undefined){input.type='number';input.min=min;input.max=max;input.step=key==='gameTextScale'?.1:1}else{input.maxLength=key==='nikkeConsultHandwriting'?40:key==='nikkeConsultLabel'?100:2000}input.value=key==='nikkeBondedMode'?(l[key]??'auto'):key==='nikkeTopAction'?(l[key]||(l.nikkeType==='dialogue'?'skip':'cancel')):key==='nikkeConsultLabel'?(l[key]??'상담'):key==='nikkeConsultHandwriting'?(l[key]??'해명하기'):l[key];input.onchange=()=>change(key,min===undefined?input.value:Math.max(min,Math.min(max,Number(input.value)||min)));wrap.append(input);fields.append(wrap)},check=(key,label)=>{const wrap=document.createElement('label');wrap.className='check';const input=document.createElement('input');input.type='checkbox';input.checked=l[key];input.onchange=()=>change(key,input.checked);wrap.append(input,document.createTextNode(label));fields.append(wrap)};
 field('nikkeType','UI 종류',undefined,undefined,nikkeTypes.filter(([type])=>type!=='confirm'||l.nikkeType==='confirm'));check('visible','UI 보이기');if(!(l.nikkeType==='choice'&&l.nikkeChoiceOverlay))check('nikkeTop','상단 메뉴 보이기');if(l.nikkeTop&&(l.nikkeType==='dialogue'||l.nikkeType==='choice'&&!l.nikkeChoiceOverlay))field('nikkeTopAction','상단 마지막 메뉴',undefined,undefined,[['skip','SKIP · 스토리'],['cancel','CANCEL · 상담']]);field('gameTextScale','글자 크기 배율',.5,2);if(l.nikkeType==='dialogue'){field('gameName','이름');const label=document.createElement('label');label.textContent='이름 옆 표시 색상';const picker=document.createElement('input');picker.type='color';picker.value=l.nikkeNameColor||nikkeNameColors[0][0];picker.onchange=()=>change('nikkeNameColor',picker.value);label.append(picker);fields.append(label);const palette=document.createElement('div');palette.className='nikke-name-palette';palette.setAttribute('role','group');palette.setAttribute('aria-label','참고 이미지 색상');for(const [color,name]of nikkeNameColors){const b=document.createElement('button');b.type='button';b.textContent=name;b.title=name+' '+color;b.setAttribute('aria-pressed',String((l.nikkeNameColor||nikkeNameColors[0][0]).toLowerCase()===color));const swatch=document.createElement('span');swatch.style.backgroundColor=color;swatch.setAttribute('aria-hidden','true');b.prepend(swatch);b.onclick=()=>change('nikkeNameColor',color);palette.append(b)}fields.append(palette);field('gameText','대사');check('nikkeStoryChoices','스토리 선택지 표시')}if(l.nikkeType==='choice'){const convert=document.createElement('button');convert.type='button';convert.textContent='세로 대화와 함께 표시';convert.onclick=()=>{if(projectBusy||currentImageLayer()?.id!==l.id)return;checkpoint();l.nikkeType='dialogue';l.nikkeStoryChoices=true;l.nikkeChoiceOverlay=false;l.name='니케 · 세로 대화 + 선택지';sync()};fields.append(convert);check('nikkeChoiceOverlay','기존 레이어 위에 선택지만 덧씌우기')}if(l.nikkeType==='choice'||l.nikkeType==='dialogue'&&l.nikkeStoryChoices){field('nikkeChoiceY','선택지 묶음 위치 (%)',15,90);field('nikkeDim','배경 어둡게 (%)',0,100);check('nikkeHeart','상담용 하트 표시');if(l.nikkeHeart)field('nikkeHeartRow','하트를 표시할 선택지',1,l.nikkeChoices.length);l.nikkeChoices.forEach((text,i)=>{const wrap=document.createElement('label');wrap.textContent='선택지 '+(i+1);const input=document.createElement('textarea');input.maxLength=500;input.value=text;input.onchange=()=>{if(projectBusy)return;checkpoint();l.nikkeChoices[i]=input.value;sync()};wrap.append(input);fields.append(wrap)});const row=document.createElement('div');row.className='row';for(const [label,add]of [['선택지 추가',true],['마지막 선택지 제거',false]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=add?l.nikkeChoices.length>=4:l.nikkeChoices.length<=1;b.onclick=()=>{if(projectBusy)return;checkpoint();if(add)l.nikkeChoices.push('새 선택지');else{l.nikkeChoices.pop();l.nikkeHeartRow=Math.min(l.nikkeHeartRow,l.nikkeChoices.length)}sync()};row.append(b)}fields.append(row)}if(['consult','confirm'].includes(l.nikkeType)){field('gameName','캐릭터 이름');field('nikkeConsultLabel','상담 버튼 문구');field('nikkeBondedMode','Bonded 표시',undefined,undefined,[['auto','자동 · 상담 일지 5 이상'],['show','항상 표시'],['hide','숨김']]);check('nikkeConsultScribble','Bonded 필기체 취소 낙서');if(l.nikkeConsultScribble){field('nikkeConsultHandwriting','덧쓸 손글씨 문구');const note=document.createElement('p');note.className='hint';note.textContent='자주색 펜 고정 · Bonded 위에 X와 손글씨를 덧써요. Bonded 숨김 시 낙서도 함께 숨겨져요.';fields.append(note)}check('nikkeFavorite','즐겨찾기 별 표시');check('nikkeBondIsMax','호감도 MAX 모드');for(const [key,label]of [['nikkeRank','호감도 RANK'],['nikkeBond','호감도 현재'],['nikkeBondMax','호감도 최대'],['nikkeDiary','상담 일지 현재'],['nikkeDiaryMax','상담 일지 최대'],['nikkeCount','상담 횟수 현재'],['nikkeCountMax','상담 횟수 최대']])if(!l.nikkeBondIsMax||!['nikkeBond','nikkeBondMax'].includes(key))field(key,label,0,999999);field('nikkeGems','보석 표시');field('nikkeCredits','크레디트 표시');const hint=document.createElement('p');hint.className='hint';hint.textContent='캔버스의 상담 일지 사진을 잡고 위아래로 끌어 얼굴 위치를 맞추세요.';fields.append(hint)}if(['consult','confirm'].includes(l.nikkeType)){const popupButton=document.createElement('button');popupButton.type='button';popupButton.textContent=nikkeConfirmVisible(l)?'상담 확인 팝업 닫기':'상담 확인 팝업 열기';popupButton.onclick=()=>setNikkeConfirm(l,!nikkeConfirmVisible(l));fields.append(popupButton);field('nikkePopupText','확인 팝업 문구');field('nikkeDim','배경 어둡게 (%)',0,100)}if(l.media&&!(l.nikkeType==='choice'&&l.nikkeChoiceOverlay)){field('mediaZoom','사진 확대 (%)',100,500);field('mediaX','사진 가로 위치 (%)',0,100);field('mediaY','사진 세로 위치 (%)',0,100)}$('nikkeAddPhoto').hidden=$('nikkeRemovePhoto').hidden=l.nikkeType==='choice'&&!!l.nikkeChoiceOverlay;$('nikkeRemovePhoto').disabled=!l.media;
}
let nikkeDiaryDrag=null;
function nikkeDiaryLocalPoint(l,p){
 const r=imageLayerRect(l),local=socialLocalPoint({...l,...r},p);if(!local)return null;
 const x=local.x*720/r.w-616,y=local.y*1560/r.h-1044,a=.075;
 return{x:Math.cos(a)*x+Math.sin(a)*y,y:-Math.sin(a)*x+Math.cos(a)*y};
}
function beginNikkeDiaryPointer(e){
 const l=currentImageLayer();if(projectBusy||editTool!=='select'||e.button!==0||e.shiftKey||window.mobileMultiSelect||typeof mobilePan!=='undefined'&&mobilePan||l?.gamePreset!==3||l.nikkeType!=='consult'||nikkeConfirmVisible(l)||!l.visible)return false;
 const photo=postMediaImages.get(l.id),p=pos(e),local=nikkeDiaryLocalPoint(l,p);if(!photo||!local||local.x< -72||local.x>73||local.y< -111||local.y>40||state.items.some(b=>hitWarpedBalloon(b,p)))return false;
 const iw=photo.naturalWidth||photo.width,ih=photo.naturalHeight||photo.height,travel=ih*Math.max(145/iw,151/ih)-151;if(travel<1)return false;
 nikkeDiaryDrag={id:l.id,pointerId:e.pointerId,startY:local.y,start:l.nikkeDiaryPhotoY??50,travel,recorded:false};canvas.setPointerCapture(e.pointerId);return true;
}
function moveNikkeDiaryPointer(e){
 const d=nikkeDiaryDrag;if(!d||e.pointerId!==d.pointerId)return false;const l=currentImageLayer();if(projectBusy||l?.id!==d.id){cancelNikkeDiaryPointer();return true}const local=nikkeDiaryLocalPoint(l,pos(e));if(!local)return true;
 const value=Math.max(0,Math.min(100,d.start-(local.y-d.startY)*100/d.travel));if(Math.abs(value-(l.nikkeDiaryPhotoY??50))<.001)return true;
 if(!d.recorded){checkpoint();d.recorded=true}l.nikkeDiaryPhotoY=value;render();return true;
}
function endNikkeDiaryPointer(e){if(!nikkeDiaryDrag||e.pointerId!==nikkeDiaryDrag.pointerId)return false;cancelNikkeDiaryPointer();return true}
function cancelNikkeDiaryPointer(){const d=nikkeDiaryDrag;nikkeDiaryDrag=null;if(d&&canvas.hasPointerCapture?.(d.pointerId))canvas.releasePointerCapture(d.pointerId)}
function initNikkeDiaryDrag(){
 const stop=e=>{e.preventDefault();e.stopImmediatePropagation()};
 canvas.addEventListener('pointerdown',e=>{if(beginNikkeDiaryPointer(e))stop(e)},true);
 canvas.addEventListener('pointermove',e=>{if(moveNikkeDiaryPointer(e))stop(e)},true);
 for(const type of ['pointerup','pointercancel'])canvas.addEventListener(type,e=>{if(endNikkeDiaryPointer(e))stop(e)},true);
}

function initNikkeUI(){ensureNikkeBonded().then(()=>render()).catch(()=>status('Bonded 소재를 불러오지 못했어. 새로고침해줘.'));initNikkeConsultInteraction();initNikkeDiaryDrag();initNikkeMarkers();canvas.addEventListener('click',e=>{const l=currentImageLayer();if(projectBusy||editTool!=='select'||l?.gamePreset!==3||!['consult','confirm'].includes(l.nikkeType)||nikkeConfirmVisible(l)||!l.visible||e.shiftKey)return;const p=pos(e),r=imageLayerRect(l),x=(p.x-r.x)*720/r.w,y=(p.y-r.y)*1560/r.h;if(x<47||x>101||y<945||y>1000||state.items.some(b=>hitWarpedBalloon(b,p)))return;checkpoint();l.nikkeFavorite=!l.nikkeFavorite;sync()});for(const [type,label]of nikkeTypes.filter(([type])=>type!=='confirm')){const b=document.createElement('button');b.type='button';b.className='post-add';const l={...nikkeLayer(type),w:360,h:780},preview=document.createElement('img');preview.src=nikkeBitmap(l).toDataURL('image/png');Promise.all([builtinFontReady,ensureNikkeBonded()]).then(()=>{preview.src=nikkeBitmap(l).toDataURL('image/png')}).catch(()=>{});preview.alt='';preview.style.cssText='width:100%;height:220px;object-fit:contain;background:#343943';const title=document.createElement('strong');title.textContent=label;b.append(preview,title);b.onclick=()=>addNikkeTemplate(type);$('nikkeTemplateChoices').append(b)}const overlayButton=document.createElement('button');overlayButton.type='button';overlayButton.className='post-add';overlayButton.textContent='세로 대화 + 스토리 선택지 · 현재 장에 추가';overlayButton.onclick=()=>addNikkeTemplate('dialogue',true);$('nikkeTemplateChoices').append(overlayButton);$('nikkeAddPhoto').onclick=()=>$('nikkePhotoFile').click();$('nikkePhotoFile').onchange=async e=>{const file=e.target.files[0],l=currentImageLayer(),doc=state;e.target.value='';if(!file||l?.gamePreset!==3||projectBusy)return;try{if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>30*1024*1024)throw Error('30MB 이하 PNG·JPG·WEBP 사진을 선택해줘.');const src=await read(file),im=await imageFrom(src);if(im.width*im.height>16000000)throw Error('사진은 1,600만 픽셀 이하로 준비해줘.');if(projectBusy||state!==doc||currentImageLayer()?.id!==l.id)return;checkpoint();l.media=src;postMediaImages.set(l.id,im);offerImageCanvasSize(l,im);sync()}catch(e){status(e.message)}};$('nikkeRemovePhoto').onclick=()=>{const l=currentImageLayer();if(l?.gamePreset!==3||projectBusy||!l.media)return;checkpoint();l.media='';postMediaImages.delete(l.id);sync()};$('nikkeDuplicate').onclick=()=>$('duplicateImageLayer').click();$('nikkeDelete').onclick=()=>$('deleteImageLayer').click()}

function nikkeMarkerBitmap(type,color='white'){
 const out=document.createElement('canvas');out.width=256;out.height=256;const c=out.getContext('2d');
 const polygon=(pts,fill,stroke,width=1)=>{c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();if(fill){c.fillStyle=fill;c.fill()}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.lineJoin='round';c.stroke()}};
 if(type==='arrow'){
 c.shadowColor=color==='orange'?'rgba(255,152,35,.55)':'rgba(78,166,230,.65)';c.shadowBlur=14;c.shadowOffsetY=3;const fill=color==='orange'?'#ff8a2d':'#ffffff';
 polygon([[26,38],[56,38],[128,166],[200,38],[230,38],[128,220]],fill);polygon([[91,38],[165,38],[128,103]],fill);
 }else{
 c.shadowColor='rgba(0,0,0,.45)';c.shadowBlur=8;c.shadowOffsetY=4;polygon([[29,29],[227,29],[128,223]],'#9b9a91');c.shadowBlur=0;c.shadowOffsetY=0;polygon([[37,35],[219,35],[128,212]],'#242b2f');polygon([[46,41],[210,41],[128,197]],'#ffad13');
 c.strokeStyle='#171d23';c.lineWidth=10;c.lineCap='round';c.beginPath();c.arc(111,91,24,0,Math.PI*2);c.stroke();c.beginPath();c.moveTo(129,111);c.lineTo(155,144);c.stroke();
 }
 return out;
}
async function addNikkeMarker(type){if(projectBusy||(state.imageLayers||[]).length>=40){if(!projectBusy)status('이미지 레이어는 최대 40개야.');return}const doc=state,color=type==='search'?'orange':'white',src=nikkeMarkerBitmap(type,color).toDataURL('image/png'),im=await imageFrom(src);if(projectBusy||state!==doc||(state.imageLayers||[]).length>=40)return;checkpoint();const w=Math.min(120,state.width*.18),l={id:crypto.randomUUID(),name:type==='arrow'?'니케 · 탐사 화살표':'니케 · 탐사 돋보기',src,nikkeMarker:type,nikkeMarkerColor:color,x:(state.width-w)/2,y:Math.max(0,Math.min(state.height-w,($('viewport').scrollTop+100)/zoom)),w,h:w,visible:true,strokes:[]};state.imageLayers??=[];state.imageLayers.push(l);imageLayerImages.set(l.id,im);closeGameTemplatePicker();selectImageLayer(l);if(typeof closeMobilePanel==='function')closeMobilePanel();status('니케 탐사 에셋을 추가했어. 드래그해서 배치해줘.')}
function syncNikkeMarkerControls(){const l=currentImageLayer(),panel=$('nikkeMarkerInspector');if(!panel)return;panel.hidden=!l?.nikkeMarker;if(panel.hidden)return;$('nikkeMarkerColorField').hidden=l.nikkeMarker!=='arrow';$('nikkeMarkerColor').value=l.nikkeMarkerColor}
function initNikkeMarkers(){const section=$('gameNikkeSection'),heading=document.createElement('h3'),grid=document.createElement('div');heading.textContent='탐사 에셋 · 이동 / 크기 조절';grid.className='frame-picker-grid';section.append(heading,grid);for(const [type,label]of [['arrow','탐사 화살표 · 흰색 / 주황색'],['search','탐사 돋보기 마크']]){const b=document.createElement('button');b.type='button';b.className='post-add';const img=document.createElement('img');img.src=nikkeMarkerBitmap(type,type==='search'?'orange':'white').toDataURL('image/png');img.alt='';img.style.cssText='display:block;width:100%;height:110px;object-fit:contain;background:#344255;border-radius:8px';const title=document.createElement('strong');title.textContent=label;b.append(img,title);b.onclick=()=>addNikkeMarker(type);grid.append(b)}$('nikkeMarkerColor').onchange=async e=>{const l=currentImageLayer(),doc=state,color=e.target.value;if(projectBusy||l?.nikkeMarker!=='arrow'||color===l.nikkeMarkerColor||!['white','orange'].includes(color))return;const src=nikkeMarkerBitmap('arrow',color).toDataURL('image/png'),im=await imageFrom(src);if(projectBusy||state!==doc||currentImageLayer()?.id!==l.id)return;checkpoint();l.nikkeMarkerColor=color;l.src=src;imageLayerImages.set(l.id,im);invalidateImageLayer(l.id);sync()}}

// Confirmation shares the consultation layer; the help bubble is editor-only.
function nikkeConfirmVisible(l){return l.nikkeType==='confirm'||l.nikkeType==='consult'&&l.nikkeConfirmOpen===true}
function setNikkeConfirm(l,open){if(projectBusy||currentImageLayer()?.id!==l.id||l.gamePreset!==3||!['consult','confirm'].includes(l.nikkeType)||nikkeConfirmVisible(l)===open)return;checkpoint();if(l.nikkeType==='confirm'){l.nikkeType='consult';l.name='니케 · 상담 화면'}l.nikkeConfirmOpen=open;sync()}
const nikkeConsultHintsDismissed=new Set();let nikkeConsultPress=null,nikkeConsultClick=null;
function nikkeConsultHintVisible(l){return l?.gamePreset===3&&l.nikkeType==='consult'&&!nikkeConfirmVisible(l)&&l.visible!==false&&!nikkeConsultHintsDismissed.has(l.id)}
function drawNikkeConsultHint(c,l){if(!nikkeConsultHintVisible(l))return;const r=imageLayerRect(l);c.save();c.translate(r.x,r.y);c.scale(r.w/720,r.h/1560);c.fillStyle='#164a69';c.beginPath();c.roundRect(278,1179,394,105,12);c.fill();c.strokeStyle='#72daf4';c.lineWidth=2;c.stroke();c.beginPath();c.moveTo(483,1284);c.lineTo(505,1297);c.lineTo(527,1284);c.closePath();c.fill();c.fillStyle='#fff';c.textAlign='center';c.textBaseline='middle';c.font='700 20px '+NIKKE_FONT_FAMILY;c.fillText('아래 상담 버튼을 누르면 확인 팝업이 떠요',475,1211,372);c.font='400 17px '+NIKKE_FONT_FAMILY;c.fillStyle='#d3edf9';c.fillText('빈 곳을 한 번 누르면 이 안내가 사라져요',475,1250,372);c.restore()}
function nikkeConsultPoint(l,e){const p=pos(e),r=imageLayerRect(l);return{x:(p.x-r.x)*720/r.w,y:(p.y-r.y)*1560/r.h}}
function nikkeConsultAction(l,e){const p=nikkeConsultPoint(l,e),inside=(x,y,w,h)=>p.x>=x&&p.x<=x+w&&p.y>=y&&p.y<=y+h;if(!inside(0,0,720,1560))return null;if(nikkeConfirmVisible(l)){if(inside(620,495,48,48)||inside(78,914,267,60)||inside(379,914,267,60)||!inside(40,477,640,497))return 'close';return 'hold'}if(inside(368,1300,279,100))return 'open';// Existing favorite and diary interactions retain priority.
 if(nikkeConsultHintVisible(l)&&!inside(47,945,54,55)&&!inside(515,900,200,290))return 'hint';return null}
function beginNikkeConsultPointer(e){if(nikkeConsultPress||projectBusy||editTool!=='select'||e.button!==0||e.shiftKey||window.mobileMultiSelect||typeof mobilePan!=='undefined'&&mobilePan)return false;const l=currentImageLayer();if(l?.gamePreset!==3||!['consult','confirm'].includes(l.nikkeType)||!l.visible)return false;const p=pos(e);if(state.items.some(b=>hitWarpedBalloon(b,p)))return false;const action=nikkeConsultAction(l,e);if(!action)return false;nikkeConsultPress={l,doc:state,id:e.pointerId,action,x:e.clientX,y:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);return true}
function moveNikkeConsultPointer(e){const d=nikkeConsultPress;if(!d||d.id!==e.pointerId)return false;if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>7)d.moved=true;return true}
function endNikkeConsultPointer(e){const d=nikkeConsultPress;if(!d||d.id!==e.pointerId)return false;moveNikkeConsultPointer(e);nikkeConsultClick={x:e.clientX,y:e.clientY,time:Date.now()};cancelNikkeConsultPointer();if(projectBusy||d.doc!==state||currentImageLayer()?.id!==d.l.id||d.moved||nikkeConsultAction(d.l,e)!==d.action)return true;if(d.action==='open'||d.action==='close')setNikkeConfirm(d.l,d.action==='open');else if(d.action==='hint'){nikkeConsultHintsDismissed.add(d.l.id);render()}return true}
function cancelNikkeConsultPointer(){const d=nikkeConsultPress;nikkeConsultPress=null;if(d&&canvas.hasPointerCapture?.(d.id))canvas.releasePointerCapture(d.id)}
function suppressNikkeConsultClick(e){return !!nikkeConsultClick&&Date.now()-nikkeConsultClick.time<500&&Math.hypot(e.clientX-nikkeConsultClick.x,e.clientY-nikkeConsultClick.y)<8}
function initNikkeConsultInteraction(){const stop=e=>{e.preventDefault();e.stopImmediatePropagation()};for(const type of ['click','dblclick'])canvas.addEventListener(type,e=>{if(suppressNikkeConsultClick(e))stop(e)},true);canvas.addEventListener('pointerdown',e=>{if(beginNikkeConsultPointer(e))stop(e)},true);canvas.addEventListener('pointermove',e=>{if(moveNikkeConsultPointer(e))stop(e)},true);canvas.addEventListener('pointerup',e=>{if(endNikkeConsultPointer(e))stop(e)},true);canvas.addEventListener('pointercancel',e=>{if(nikkeConsultPress?.id===e.pointerId){cancelNikkeConsultPointer();stop(e)}},true);canvas.addEventListener('lostpointercapture',e=>{if(nikkeConsultPress?.id===e.pointerId)cancelNikkeConsultPointer()});window.addEventListener('blur',cancelNikkeConsultPointer)}
