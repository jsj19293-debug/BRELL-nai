'use strict';
let editTool='select',retouchDrag=null,activeTextTemplate=null,builtinFontReady=Promise.resolve();
const textStyleKeys=['writingMode','font','fontSize','lineHeight','weight','align','color','effect','shake','art','inkBleed'];
const situationTemplates=[
 {id:'plain',name:'평서',sample:'그랬구나.',font:'comic_gyeonggi_title_medium',inheritFont:true,fontSize:26,lineHeight:1.4,weight:'400',effect:'none',shake:0},
 {id:'panic',name:'당황',sample:'어, 어째서…?',font:'comic_gyeonggi_title_medium',inheritFont:true,fontSize:26,lineHeight:1.5,weight:'400',effect:'shake',shake:3},
 {id:'yell',name:'외침',sample:'잠깐만!',font:'comic_gyeonggi_title_medium',inheritFont:true,fontSize:34,lineHeight:1.3,weight:'900',effect:'none',shake:0},
 {id:'inner',name:'생각',sample:'설마…',font:'comic_gyeonggi_title_medium',inheritFont:true,fontSize:32,lineHeight:1.4,weight:'400',effect:'none',shake:0},
 {id:'story',name:'서술',sample:'그날의 기억.',font:'comic_gyeonggi_title_medium',inheritFont:true,fontSize:25,lineHeight:1.6,weight:'400',effect:'none',shake:0},
 {id:'comic_plain',name:'일반 대사 · KoPub 돋움',sample:'그랬구나.',font:'comic_kopub_dotum_medium',fontSize:23,lineHeight:1.45,weight:'400',effect:'none',shake:0},
 {id:'comic_thought',name:'생각 · KoPub 바탕',sample:'그럴 리가…',font:'comic_kopub_batang_medium',fontSize:23,lineHeight:1.45,weight:'400',effect:'none',shake:0},
 {id:'comic_box',name:'사각형 대사 · 서울남산',sample:'상황을 설명하자면',font:'comic_seoulnamsanm',fontSize:22,lineHeight:1.4,weight:'400',effect:'none',shake:0},
 {id:'comic_shout',name:'외침 · 주아체',sample:'잠깐만!',font:'comic_baemin_jua',fontSize:31,lineHeight:1.25,weight:'400',effect:'none',shake:0,art:{slant:10}},
 {id:'comic_cute',name:'동글한 대사 · 주아체',sample:'안녕!',font:'comic_baemin_jua',fontSize:24,lineHeight:1.4,weight:'400',effect:'none',shake:0},
 {id:'comic_flashback',name:'회상 · 서울한강',sample:'그때의 우리.',font:'comic_seoulhangangm',fontSize:22,lineHeight:1.5,weight:'400',effect:'none',shake:0},
 {id:'comic_anger',name:'분노 대사 · 클래식 B',sample:'도대체 왜!',font:'comic_museum_classic_b',fontSize:29,lineHeight:1.3,weight:'400',effect:'none',shake:0},
 {id:'comic_world',name:'이세계 언어 · 클래식 L',sample:'오래된 문장의 뜻',font:'comic_museum_classic_l',fontSize:21,lineHeight:1.5,weight:'400',effect:'none',shake:0},
 {id:'comic_narration',name:'나레이션 · 경기천년바탕',sample:'이것도 나레이션',font:'comic_gyeonggi_batang_regular',fontSize:21,lineHeight:1.5,weight:'400',effect:'none',shake:0},
 {id:'comic_heading',name:'나레이션 · 경기천년제목',sample:'새로운 이야기',font:'comic_gyeonggi_title_medium',fontSize:22,lineHeight:1.5,weight:'400',effect:'none',shake:0}
];
function styleOnly(source){return structuredClone(Object.fromEntries(textStyleKeys.filter(k=>source[k]!==undefined).map(k=>[k,source[k]])))}
function textWidth(c,b,text){if(b.effect!=='shake')return c.measureText(text).width;const chars=Array.from(text);return chars.reduce((n,ch)=>n+c.measureText(ch).width,0)+Math.max(0,chars.length-1)*(b.shake||0)*.6}
function drawTextLine(c,b,text,x,y,row){
 if(b.effect!=='shake'){paintGlyph(c,b,text,x,y);return}
 const width=textWidth(c,b,text),strength=b.shake||0;let left=x-(b.align==='center'?width/2:b.align==='right'?width:0);
 Array.from(text).forEach((ch,i)=>{const w=c.measureText(ch).width,seed=i+row*29;c.save();c.textAlign='center';c.translate(left+w/2,y+Math.sin(seed*2.37+.8)*strength);c.rotate(Math.sin(seed*1.71+.4)*strength*.023);paintGlyph(c,b,ch,0,0);c.restore();left+=w+strength*.6});
}
function applyNextTemplate(b){if(activeTextTemplate)Object.assign(b,styleOnly(activeTextTemplate));b.font=typeof preferredTextFont==='function'?preferredTextFont():'comic_gyeonggi_title_medium'}
function chooseTemplate(t){if(t.inheritFont)t={...t,font:typeof preferredTextFont==='function'?preferredTextFont():t.font};if(typeof rememberTextFont==='function')rememberTextFont(t.font);activeTextTemplate={...styleOnly(t),name:t.name,id:t.id};const b=current();if(b){checkpoint();Object.assign(b,styleOnly(t));if(b.inkBleed&&typeof inkCanEdit==='function'&&!inkCanEdit(b))delete b.inkBleed;if(typeof clearRichTextProperties==='function')clearRichTextProperties(b,['font','color','fontSize','weight','slant']);sync()}ensureComicFont(t.font).catch(()=>status('폰트를 불러오지 못했어. 다시 선택해줘.'));showTextTemplates();status(b?`${t.name} 템플릿을 대사에 적용했습니다.`:`다음 대사에 ${t.name} 템플릿을 사용합니다.`)}
function showTextTemplates(){
 $('textTemplates').replaceChildren();for(const t of situationTemplates){const bt=document.createElement('button');bt.className='text-template'+(activeTextTemplate?.id===t.id?' active':'');bt.setAttribute('aria-pressed',String(activeTextTemplate?.id===t.id));const sample=document.createElement('span');sample.className='template-sample '+t.id;sample.textContent=t.sample;sample.style.fontFamily=fonts[t.inheritFont&&typeof preferredTextFont==='function'?preferredTextFont():t.font]||'';const name=document.createElement('small');name.textContent=t.name;bt.append(sample,name);bt.onclick=()=>chooseTemplate(t);$('textTemplates').append(bt)}
 $('customTextTemplates').replaceChildren();if(!state.templates?.length)$('customTextTemplates').textContent='글꼴·크기·흔들림을 설정한 뒤 저장하세요.';
 for(const t of state.templates||[]){const row=document.createElement('div');row.className='preset-item';const bt=document.createElement('button');bt.textContent=t.name;bt.onclick=()=>chooseTemplate(t);const remove=document.createElement('button');remove.textContent='×';remove.title=`${t.name} 템플릿 삭제`;remove.onclick=()=>{checkpoint();state.templates=state.templates.filter(x=>x.id!==t.id);if(activeTextTemplate?.id===t.id)activeTextTemplate=null;persistTextTemplates();showTextTemplates()};row.append(bt,remove);$('customTextTemplates').append(row)}
}
function persistTextTemplates(){try{const portable=state.templates.filter(t=>!t.font?.startsWith('custom_'));localStorage.setItem('balloon-text-templates',JSON.stringify(portable))}catch{status('브라우저에 템플릿을 저장하지 못했습니다. 작업 파일로 저장해주세요.')}}
function syncLettering(){syncCoverTitleTemplates();$('cleanupCount').textContent=`지운 영역 ${state.masks?.length||0}개`;$('clearCleanup').disabled=!state.masks?.length;$('saveTextTemplate').disabled=!current()}
function setTool(tool){if(tool!=='select'&&typeof exitPanelBoundaryEditing==='function')exitPanelBoundaryEditing();if(tool!=='stamp'&&typeof deactivateStampBrush==='function')deactivateStampBrush();if(tool!=='select'&&typeof setProtrusionMode==='function'&&protrusionMode)setProtrusionMode(null);if(tool!=='lasso')clearLasso();if(tool!=='select')imageLayerEraser=false;editTool=tool;for(const [id,key] of [['toolSelect','select'],['toolWhiteText','whiteText'],['toolRect','rect'],['toolBrush','brush'],['toolPicker','picker'],['toolLasso','lasso']]){const bt=$(id);if(!bt)continue;bt.classList.toggle('active',key===tool);bt.setAttribute('aria-pressed',String(key===tool))}canvas.style.cursor=tool==='select'?'default':'crosshair';const messages={whiteText:'흰 말풍선의 글자 부분만 드래그해줘. 지정 영역 전체를 흰색으로 덮으니 테두리·장식은 제외해줘.',stamp:'캔버스를 드래그해 스탬프 브러시를 그려줘.',lasso:'글자를 올가미로 감싼 뒤 Alt+클릭으로 복사할 바탕을 지정하세요.',rect:'뭉개진 글자 부분을 드래그하세요. 말풍선 테두리는 포함하지 마세요.',brush:'글자 위를 드래그하면 선택한 배경색으로 덮습니다.',picker:'글자가 없는 말풍선 바탕을 클릭해 색을 찍으세요.',select:'대사를 선택해 이동하거나 편집하세요.'};status(messages[tool])}
function clampPoint(p){return {x:Math.max(0,Math.min(state.width,p.x)),y:Math.max(0,Math.min(state.height,p.y))}}
function rectangle(a,b){return {x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)}}
function drawPatch(c,m){if(m.type==='polygon'){c.save();c.fillStyle=m.color;c.fill(polygonPath(m.points));c.restore();return}c.save();c.fillStyle=m.color;c.strokeStyle=m.color;if(m.type==='rect')c.fillRect(m.x,m.y,m.w,m.h);else if(m.points.length){c.lineWidth=m.size;c.lineCap='round';c.lineJoin='round';if(m.points.length===1){c.beginPath();c.arc(m.points[0].x,m.points[0].y,m.size/2,0,Math.PI*2);c.fill()}else{c.beginPath();c.moveTo(m.points[0].x,m.points[0].y);for(const p of m.points.slice(1))c.lineTo(p.x,p.y);c.stroke()}}c.restore()}
function drawPatches(c,preview=false){if((state.masks||[]).some(m=>m.type==='clone'))c.drawImage(cleanupSurface(),0,0);else if(typeof drawRetouchRecords==='function')drawRetouchRecords(c,state);else for(const m of state.masks||[])drawPatch(c,m);if(preview)drawClonePreview(c);if(preview&&retouchDrag?.type==='rect')drawPatch(c,{type:'rect',...rectangle(retouchDrag.start,retouchDrag.end),color:retouchDrag.color})}
function pickColor(p){const sample=document.createElement('canvas');sample.width=sample.height=1;const sc=sample.getContext('2d');sc.translate(-Math.min(state.width-1,Math.floor(p.x)),-Math.min(state.height-1,Math.floor(p.y)));sc.fillStyle='#fff';sc.fillRect(0,0,state.width,state.height);if(bg)sc.drawImage(bg,0,0,state.width,state.height);drawPatches(sc);const rgb=sc.getImageData(0,0,1,1).data;return '#'+Array.from(rgb).slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join('')}
function beginRetouch(e){
 if(editTool==='select')return false;e.preventDefault();const p=clampPoint(pos(e));if(editTool==='whiteText')return beginWhiteLettering(e,p);if(editTool==='lasso'){beginLasso(e,p);return true}if(editTool==='picker'){try{$('eraseColor').value=pickColor(p);setTool('rect');status('바탕색을 찍었습니다. 글자를 덮을 영역을 드래그하세요.')}catch{status('색을 읽지 못했습니다. 색상 버튼으로 직접 선택해주세요.')}return true}
 selected=null;canvas.setPointerCapture(e.pointerId);const color=$('eraseColor').value;
 if(editTool==='rect')retouchDrag={type:'rect',start:p,end:p,color};else{checkpoint();const size=Math.max(2,Math.min(300,Number($('brushSize').value)||24));const mask={type:'brush',color,size,points:[p]};state.masks??=[];state.masks.push(mask);retouchDrag={type:'brush',mask}}
 sync();return true;
}
function moveRetouch(e){if(!retouchDrag)return editTool!=='select';const p=clampPoint(pos(e));if(retouchDrag.type==='lasso'){const ps=retouchDrag.points,last=ps.at(-1);if(ps.length<30000&&Math.hypot(p.x-last.x,p.y-last.y)>1/zoom)ps.push(p)}else if(['rect','whiteText'].includes(retouchDrag.type))retouchDrag.end=p;else{const points=retouchDrag.mask.points,last=points[points.length-1];if(Math.hypot(p.x-last.x,p.y-last.y)>.5&&points.length<30000)points.push(p)}render();return true}
function endRetouch(e){
 if(!retouchDrag)return;if(e)moveRetouch(e);const d=retouchDrag;retouchDrag=null;
 if(d.type==='whiteText'){finishWhiteLettering(d);return}if(d.type==='lasso'){finishLasso(d);return}if(d.type==='rect'){const r=rectangle(d.start,d.end);if(r.w<3||r.h<3){render();return}checkpoint();state.masks??=[];state.masks.push({type:'rect',color:d.color,...r});if($('autoText').checked){add('text',null,false);const b=current();Object.assign(b,r,{padding:Math.min(8,r.w*.05,r.h*.05),text:'',tail:false});setTool('select');sync();$('text').focus();status('글자를 지웠습니다. 오른쪽 대사 칸에 새 대사를 입력하세요.')}else{sync();status('선택한 영역의 글자를 덮었습니다.')}}else{sync();status('글자를 덮었습니다. 「텍스트만」으로 새 대사를 추가하세요.')}
}
function cancelRetouch(){clearLasso();if(retouchDrag?.type==='brush'){const index=(state.masks||[]).indexOf(retouchDrag.mask);if(index>=0)state.masks.splice(index,1)}retouchDrag=null}
function validateLettering(d){validateArt(d);if(typeof validateAIRetouch==='function')validateAIRetouch(d);
 const finite=Number.isFinite,color=v=>typeof v==='string'&&/^#[\da-f]{6}$/i.test(v);
 if(d.masks!==undefined&&!Array.isArray(d.masks))throw Error('지운 영역 데이터가 올바르지 않습니다.');if((d.masks||[]).length>10000)throw Error('지운 영역이 너무 많습니다.');let points=0;
 for(const m of d.masks||[]){if(m&&['clone','polygon'].includes(m.type)){validateSelectionPatch(m,d);points+=m.points.length;continue}if(!m||!color(m.color))throw Error('지운 영역 색상이 올바르지 않습니다.');if(m.type==='rect'){if(!['x','y','w','h'].every(k=>finite(m[k]))||m.w<0||m.h<0)throw Error('지운 영역 크기가 올바르지 않습니다.')}else if(m.type==='brush'){if(!finite(m.size)||m.size<2||m.size>300||!Array.isArray(m.points)||m.points.length>30000||m.points.some(p=>!p||!finite(p.x)||!finite(p.y)))throw Error('브러시 데이터가 올바르지 않습니다.');points+=m.points.length}else throw Error('지원하지 않는 지우기 방식입니다.')}if(points>1000000)throw Error('브러시 데이터가 너무 큽니다.');
 const checkStyle=t=>{if(typeof validateInkBleed==='function')validateInkBleed(t);if(t.writingMode!==undefined&&!['horizontal','vertical','vertical-left'].includes(t.writingMode))throw Error('쓰기 방향이 올바르지 않습니다.');if(t.effect!==undefined&&!['none','shake'].includes(t.effect))throw Error('지원하지 않는 글자 효과입니다.');if(t.shake!==undefined&&(!finite(t.shake)||t.shake<0||t.shake>12))throw Error('흔들림 강도가 올바르지 않습니다.')};
 if(Array.isArray(d.items))d.items.forEach(b=>{checkStyle(b);if(typeof validateRichText==='function')validateRichText(b)});if(d.templates!==undefined&&!Array.isArray(d.templates))throw Error('템플릿 데이터가 올바르지 않습니다.');if((d.templates||[]).length>300)throw Error('템플릿이 너무 많습니다.');for(const t of d.templates||[]){if(!t||typeof t.name!=='string'||typeof t.id!=='string'||typeof t.font!=='string'||!finite(t.fontSize)||t.fontSize<10||t.fontSize>480||!finite(t.lineHeight)||t.lineHeight<.8||t.lineHeight>3||!['400','700','900'].includes(t.weight))throw Error('템플릿 설정이 올바르지 않습니다.');checkStyle(t)}
}
function initLettering(){
 registerComicFonts();
 try{const t=JSON.parse(localStorage.getItem('balloon-text-templates')||'[]');validateLettering({templates:t});state.templates=t}catch{}
 for(const [id,tool] of [['toolSelect','select'],['toolRect','rect'],['toolBrush','brush'],['toolPicker','picker'],['toolLasso','lasso']])$(id).onclick=()=>{cancelRetouch();setTool(tool);render()};
 $('clearCleanup').onclick=()=>{if(!state.masks?.length&&!state.aiPatches?.length)return;checkpoint();cancelRetouch();state.masks=[];delete state.aiPatches;cleanupKey='';sync();status('지운 영역을 원본으로 되돌렸습니다. 대사는 유지됩니다.')};
 $('saveTextTemplate').onclick=()=>{const b=current();if(!b)return;const name=prompt('대사 템플릿 이름','나의 대사 스타일');if(!name?.trim())return;checkpoint();state.templates??=[];state.templates.push({...styleOnly(b),effect:b.effect||'none',shake:b.shake??3,id:crypto.randomUUID(),name:name.trim().slice(0,80)});persistTextTemplates();showTextTemplates();status(b.font.startsWith('custom_')?'개인 폰트 템플릿은 작업 파일과 함께 저장해주세요.':'대사 템플릿을 저장했습니다. 다음 작업에도 사용할 수 있습니다.')};
 const assets=[['Studio Messenger','pretendard/Pretendard-Regular.woff2','400'],['Studio Messenger','pretendard/Pretendard-Bold.woff2','700'],['Studio Nikke Pretendard','pretendard/Pretendard-SemiBold.woff2','600'],['Studio Nikke Pretendard','pretendard/Pretendard-Bold.woff2','700'],['Studio Gothic','NanumGothic-Regular','400'],['Studio Gothic','NanumGothic-Bold','700'],['Studio Gothic','NanumGothic-ExtraBold','900'],['Studio Myeongjo','NanumMyeongjo-Regular','400'],['Studio Pen','NanumPenScript-Regular','400'],['Studio Dynalight','dynalight/Dynalight-Regular','400'],['Studio Oksooni','Griun_Oksooni-Rg','400'],['Studio Konkon','Ownglyph-Konkon','400'],['Studio Coldi','Ownglyph-Coldi-Webtoon','400']];
 builtinFontReady=Promise.all(assets.map(async([name,file,weight])=>{const f=new FontFace(name,`url(fonts/${file.endsWith('.woff2')?file:file+'.ttf'})`,{weight});await f.load();document.fonts.add(f)})).then(()=>{$('fontStatus').textContent='한글 폰트 6종 내장 · 별도 설치 없이 사용';renderArtCards();render()}).catch(()=>{$('fontStatus').textContent='내장 폰트를 불러오지 못했습니다. 새로고침하거나 내 폰트를 불러와주세요.';status('폰트 로딩에 실패했습니다. 새로고침 후 다시 확인해주세요.');throw Error('내장 폰트 로딩 실패')});
 builtinFontReady.catch(()=>{});showTextTemplates();initCoverTitleTemplates();
}

// Keep legacy vertical mode rightward; vertical-left reverses column placement.
function verticalTextLayout(b){
 let height=Math.max(1,b.h-2*b.padding),width=Math.max(1,b.w-2*b.padding);
 if([...emotionKinds,'round','circle','thought','cloud','transparent','pinched','linked','wavy'].includes(b.kind)){height*=.79;width*=.79}if(b.kind==='shout'){height*=.7;width*=.7}
 const step=b.fontSize,capacity=Math.max(1,Math.floor(height/step)),columns=[];
 for(const para of b.text.split('\n')){const chars=Array.from(para);if(!chars.length)columns.push([]);for(let i=0;i<chars.length;i+=capacity)columns.push(chars.slice(i,i+capacity))}
 return {columns,height,width,step,columnStep:b.fontSize*b.lineHeight};
}
function drawVerticalText(c,b){
 c.font=`${b.weight} ${b.fontSize}px ${family(b)}`;c.textAlign='center';c.textBaseline='middle';
 const {columns,height,width,step,columnStep}=verticalTextLayout(b),total=(columns.length-1)*columnStep+b.fontSize;
 const left=b.align==='left'?b.x+(b.w-width)/2:b.align==='right'?b.x+(b.w+width)/2-total:b.x+(b.w-total)/2;
 // Center the complete text block; every column shares the longest column’s start.
 const rows=Math.max(0,...columns.map(chars=>chars.length)),top=b.y+(b.h-rows*step)/2;
 columns.forEach((chars,col)=>{chars.forEach((ch,row)=>{const seed=row+col*29,strength=b.effect==='shake'?(b.shake||0):0;c.save();c.translate(left+b.fontSize/2+(b.writingMode==='vertical-left'?columns.length-1-col:col)*columnStep+Math.sin(row*1.3)*(artOf(b).wave||0)+Math.sin(seed*2.37+.8)*strength,top+step*(row+.5));c.rotate(Math.sin(seed*1.71+.4)*strength*.023);paintGlyph(c,b,ch,0,0);c.restore()})});
 return total+2*((artOf(b).wave||0)+(b.effect==='shake'?(b.shake||0):0))>width||step>height;
}
