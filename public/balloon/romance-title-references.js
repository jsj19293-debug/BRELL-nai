'use strict';
// Layout/color studies of the linked cover examples. These are not the paid fonts.
const romanceTitleReferenceURL='https://cyanindesign.blogspot.com/2020/05/blog-post.html';
Object.assign(compoundTitleLayouts,{
 royal:{w:760,h:510,parts:[{text:'새벽의',x:20,y:0,w:560,h:180,size:145},{text:'왕관을 잇는',x:180,y:173,w:580,h:125,size:88},{text:'약속',x:85,y:295,w:600,h:215,size:182}]},
 arcane:{w:760,h:540,parts:[{text:'별빛',x:0,y:0,w:500,h:195,size:174},{text:'을 거슬러',x:290,y:154,w:470,h:140,size:90},{text:'그대에게',x:45,y:305,w:710,h:235,size:159}]},
 flourish:{w:760,h:520,parts:[{text:'다시 피는',x:10,y:0,w:720,h:190,size:142},{text:'우리의',x:280,y:182,w:455,h:123,size:91},{text:'계절',x:50,y:298,w:600,h:222,size:192}]},
 ribbon:{w:760,h:480,parts:[{text:'바람이',x:0,y:0,w:650,h:180,size:155},{text:'머무는',x:285,y:170,w:475,h:125,size:98},{text:'푸른 밤',x:35,y:290,w:720,h:190,size:152}]},
 compact:{w:860,h:400,parts:[{text:'마지막',x:5,y:0,w:640,h:170,size:156},{text:'기록을',x:435,y:155,w:425,h:125,size:91},{text:'다시 쓰다',x:0,y:235,w:820,h:165,size:151}]},
 quiet:{w:740,h:530,parts:[{text:'너의',x:210,y:0,w:470,h:190,size:161},{text:'작은 세계에',x:0,y:183,w:735,h:145,size:107},{text:'머물다',x:135,y:335,w:600,h:195,size:160}]}
});
const romanceTitleReferences=[
 ['ahnsamyeol','안삼열체','royal','cover_hs_bombaram_2','자주빛 왕실 서약','#f7e2ba','#bb7a40','#4e293e','https://markethiut.com/'],
 ['heiroflight','빛의계승자체','arcane','cover_cafe24_classic_type','비취빛 마법의 밤','#efffc5','#64b68b','#1a424d','https://heiroflighteclipse.com2us.com/ko?r=p1'],
 ['hs','HS봄바람체','flourish','cover_hs_bombaram_2','봄날의 진홍 서신','#b42c53','#591b40','#fff1dc','https://blog.naver.com/hp0/221074080319'],
 ['baram','바람체','ribbon','cover_cafe24_classic_type','물결치는 푸른 밤','#416dad','#182d68','#fcf3d7','https://markethiut.com/'],
 ['rose-thorn','Rix장미의유혹 Thorn','royal','cover_hs_bombaram_2','흑장미의 은빛 맹세','#fff5f0','#b39ba6','#382535','https://www.sandollcloud.com/font/555/RixRoseLureThorn_Pro'],
 ['rose-basic','Rix장미의유혹 Basic','flourish','cover_cafe24_classic_type','눈부신 푸른 고백','#3276e6','#174392','#ffffff','https://www.sandollcloud.com/'],
 ['sunmyeongjo','순명조 · a/MD 원문 추정','royal','comic_maruburi_semibold','황혼에 맺은 약속','#f6d8aa','#af7145','#47252b','https://www.asiafont.com/'],
 ['gyeokdong','산돌 격동명조','compact','comic_kopubworld_batang_bold','황금빛 마지막 기록','#ffdd79','#ae6624','#302425','https://www.sandollcloud.com/font/254/Sandoll-GyeokdongMyeongjo'],
 ['blanc','블랑체','flourish','cover_cafe24_classic_type','라일락빛 다시 핀 계절','#f0d3f8','#9d69bc','#432958','https://markethiut.com/'],
 ['andante','산돌 안단테','ribbon','cover_cafe24_classic_type','분홍빛 바람의 편지','#ffdce8','#df87b8','#5c254d','https://www.sandollcloud.com/'],
 ['gaehwa','산돌 개화','compact','comic_museum_classic_b','잿불 속의 귀환','#ffdf8a','#e36b38','#3c1d25','https://www.sandollcloud.com/'],
 ['jebi-display','산돌 제비 Display','arcane','comic_kopubworld_batang_bold','새벽의 백은 기록','#ffffff','#c1ceff','#4c3972','https://www.sandollcloud.com/'],
 ['jebi','산돌 제비','quiet','comic_maruburi_regular','고요한 밤의 의미','#fff7e4','#d7c8a8','#433747','https://www.sandollcloud.com/'],
 ['jebi2','산돌 제비2','ribbon','comic_maruburi_semibold','연둣빛 세계의 초대','#fff7ce','#bac98a','#394642','https://www.sandollcloud.com/'],
 ['yale','산돌 예일','quiet','comic_kopubworld_batang_medium','오래된 정원의 편지','#fff9ee','#e5ceb1','#574333','https://www.sandollcloud.com/']
].map(([key,referenceFont,layout,font,name,color,end,stroke,publisherUrl])=>({key,referenceFont,layout,font,name,color,end,stroke,publisherUrl}));
for(const r of romanceTitleReferences){
 coverTitleTemplates.push({id:'cover_reference_'+r.key,referenceKey:r.key,referenceFont:r.referenceFont,referenceUrl:romanceTitleReferenceURL,publisherUrl:r.publisherUrl,
  name:r.name,font:r.font,layout:r.layout,widthPct:r.layout==='compact'?90:78,placement:'center-bottom',sample:compoundTitleLayouts[r.layout].parts.map(p=>p.text).join(' '),
  hint:'크기·기준선이 다른 제목 3개 · '+(r.key==='hs'?'등록된 원본 서체':'보유 폰트 연결 가능'),color:r.color,
  art:{gradient:true,end:r.end,stroke:r.stroke,width:r.layout==='compact'?2.2:1.4,shadow:r.stroke,depth:r.layout==='compact'?3:1.8}});
}
function compoundTitleFontChoices(){return [...COMIC_FONTS.map(f=>({id:f.id,name:f.name})),...(typeof allAvailableCustomFonts==='function'?allAvailableCustomFonts():[]).map(f=>({id:f.id,name:f.name}))]}
function refreshCompoundTitleFonts(value){const select=$('compoundTitleFont');select.replaceChildren();for(const f of compoundTitleFontChoices())select.append(new Option(f.name,f.id));select.value=value}
async function ensureTitleFont(id){
 const f=typeof allAvailableCustomFonts==='function'?allAvailableCustomFonts().find(f=>f.id===id):null;
 if(f){await loadFonts([f]);return}if(!COMIC_FONTS.some(f=>f.id===id))throw Error('사용할 수 없는 글꼴입니다.');await ensureComicFont(id);
}
function syncCompoundReferenceInfo(){const d=compoundTitleDraft,info=$('compoundTitleReferenceInfo');if(!d||!info)return;
 info.hidden=!d.referenceKey;if(!d.referenceKey)return;
 const original=d.referenceKey==='hs'&&d.font==='cover_hs_bombaram_2',custom=d.font.startsWith('custom_');
 $('compoundTitleReferenceNote').textContent='참고 서체: '+d.referenceFont+' · '+(original?'HS봄바람체 2.0 사용':custom?'선택한 보유 폰트 사용':'현재 대체 글꼴: '+coverTitleFontName(d.font))+'\n원문의 서체 식별은 추정이며, 장식·배치를 참고한 새 템플릿입니다.';
 $('compoundTitleReferenceLink').href=d.referenceUrl;$('compoundTitlePublisherLink').href=d.publisherUrl;
}
async function importCompoundTitleFont(files){
 if(projectBusy||compoundTitleBusy||!compoundTitleDraft||!files?.length)return;
 const doc=state,draft=compoundTitleDraft;compoundTitleBusy=true;$('compoundTitleAdd').disabled=true;$('compoundTitleImport').disabled=true;
 try{const added=await importFontFiles(files,{applyToSelection:false});if(state!==doc||compoundTitleDraft!==draft)return;
  if(added?.length){draft.font=added[0].id;refreshCompoundTitleFonts(draft.font);syncCompoundReferenceInfo();await renderCompoundTitlePreview();$('compoundTitleMessage').textContent='불러온 폰트를 이 제목에 연결했습니다.'}
  else $('compoundTitleMessage').textContent=$('fontImportResult').textContent||'글꼴을 불러오지 못했습니다.';
 }finally{compoundTitleBusy=false;$('compoundTitleAdd').disabled=false;$('compoundTitleImport').disabled=false}
}
