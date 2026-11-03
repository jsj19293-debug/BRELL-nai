'use strict';
// Slot keys are local to their parent, never references to other editor objects.
const LIMBUS_PRESET=10;
const limbusSins=[['wrath','분노','#a63528'],['lust','색욕','#cf743c'],['sloth','나태','#c59a27'],['gluttony','탐식','#638c3e'],['gloom','우울','#3a9aaa'],['pride','오만','#455e9e'],['envy','질투','#87337d']];
const limbusTemplates=[
 {key:'story',name:'스토리 대화창',hint:'기울어진 화자 명패 · 대사 · 장소',variants:[['normal','일반 대화'],['narration','내레이션'],['special','특수 화자']]},
 {key:'event',name:'선택지 이벤트',hint:'사건 이미지와 2–4개의 선택지',variants:[['event','이벤트 선택']]},
 {key:'identity',name:'인격 상세 카드',hint:'일러스트 · 능력치 · 스킬 · 패시브',variants:[['detail','인격 상세'],['card','인격 카드']]},
 {key:'results',name:'전투 결과 · 통계',hint:'최대 12명 · 피해량과 기여도',variants:[['summary','전투 결과'],['statistics','통계 비교']]},
 {key:'gift',name:'E.G.O 기프트',hint:'기프트 획득과 재료 1–3개 합성',variants:[['acquire','기프트 획득'],['fusion','기프트 합성']]},
 {key:'extraction',name:'추출 결과 · 획득',hint:'단일 · 10회 · 정지된 획득 연출',variants:[['ten','10회 결과'],['single','단일 결과'],['reveal','획득 강조']]},
 {key:'combat',name:'전투 상태 · 스킬',hint:'HP · 정신력 · 코인 · 상태 · 합',variants:[['skill','스킬 설명'],['hud','전투 HUD'],['clash','합 비교']]},
 {key:'journal',name:'관찰 일지 · 기록',hint:'관찰 문서 · 보고서 · 독립된 여러 페이지',variants:[['observation','관찰 일지'],['report','조사 보고서'],['incident','사건 기록']]}
];
gameUIPresets.push({name:'림버스 컴퍼니',file:'limbus-ui',w:1280,h:720,text:'',size:26});
gameUISVG.push('data:image/svg+xml;base64,'+btoa('<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"/>'));
const lcClamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0));
const lcMeta=key=>limbusTemplates.find(t=>t.key===key)||limbusTemplates[0];
function isLimbus(l){return l?.kind==='gameui'&&l.gamePreset===LIMBUS_PRESET;}
function limbusDefaults(template='story',variant){
 const meta=lcMeta(template),row=(id,name)=>({id,name,image:'',rarity:3,level:60,duplicate:false,damage:0,taken:0,kills:0,color:'#c3a363'});
 return {version:1,template:meta.key,variant:variant||meta.variants[0][0],
  texts:{title:meta.name,subtitle:'LIMBUS COMPANY',name:'단테',role:'관리자',location:'N사 자살 자판기 앞',body:meta.key==='story'?'<다들 괜찮아?>':meta.key==='event'?'낯선 문 앞에서 발걸음을 멈췄다.\n안쪽에서 희미한 소리가 들려온다.':'',footer:'',button:'확인',affiliation:'LCB 수감자',passiveName:'패시브',passive:'전투 시작 시 효과를 적용한다.',result:'VICTORY',giftName:'이름 없는 기프트',giftEffect:'새로운 가능성을 품고 있는 기프트.\n효과 설명을 자유롭게 입력하세요.',fusionResult:'미확정',skillName:'첫 번째 발걸음',skillDescription:'[사용 시] 자신의 상태를 확인한다.\n[적중 시] 대상에게 효과를 부여한다.',opponentName:'대상',opponentSkill:'다가오는 위협',clashResult:'합 가능',author:'기록 담당자',documentNo:'O-00-00',date:'',stage:'관찰 단계 I',note:'주의 · 허가 없이 기록을 반출하지 마십시오.'},
  images:{},textStyles:{},hidden:{},style:{frame:'#896343',accent:'#c79c56',ink:'#e6d6b9',red:'#841f32',paper:'#d5c6a6',opacity:1,decoration:true,panelOpacity:.88,font:GAME_UI_FONT,fontSize:26,lineHeight:1.5,align:'left'},
  options:{scene:false,showName:true,showLocation:true,showNext:true,showBody:true,dialogueY:75,dialogueWidth:96,nameScale:100,dim:20,choiceCount:3,selectedChoice:-1,level:60,rarity:3,hp:180,maxHp:180,sp:45,speed:'3~7',defense:42,attackLevel:45,powerRange:'4~13',attackType:'참격',resistance:'보통 ×1.0',sin:'wrath',memberCount:6,metric:'damage',sort:'input',autoTotal:true,total:0,grade:'III',materialCount:3,cardCount:10,effect:65,phase:'final',basePower:4,coinPower:3,coinCount:3,opponentPower:12,linkedHp:true,hpPercent:100,showDescription:true,page:0},
  choices:Array.from({length:4},(_,i)=>({id:'choice-'+i,text:['다가가서 살펴본다.','잠시 기다린다.','그 자리를 떠난다.','다른 방법을 찾아본다.'][i],enabled:true})),
  cards:Array.from({length:10},(_,i)=>row('card-'+i,'수감자 '+String(i+1).padStart(2,'0'))),
  members:Array.from({length:12},(_,i)=>({...row('member-'+i,'수감자 '+String(i+1).padStart(2,'0')),damage:[12480,10240,8960,6820,5200,3640][i%6],taken:100*(i+1),kills:i%4})),
  skills:Array.from({length:3},(_,i)=>({id:'skill-'+i,name:'스킬 '+(i+1),description:'[적중 시] 효과를 적용한다.'})),
  statuses:[{id:'status-0',name:'화상',value:3,count:2,icon:'burn'}],
  pages:[{id:'page-0',heading:'관찰 기록',body:'대상은 문 앞에 서 있었다.\n\n우리가 가까이 다가가자 천천히 고개를 돌렸다.\n그 이후의 기록은 다음 관찰에서 이어진다.',annotation:''}]
 };
}
function limbusData(l){return l.limbus||limbusDefaults();}
function limbusLayer(template='story',variant){
 const w=Math.min(state.width,1280),h=w*9/16;
 return {id:crypto.randomUUID(),kind:'gameui',gamePreset:LIMBUS_PRESET,name:'림버스 · '+lcMeta(template).name,src:gameUISVG[LIMBUS_PRESET],locked:false,x:(state.width-w)/2,y:Math.max(0,(state.height-h)/2),w,h,rotation:0,visible:true,strokes:[],gameText:'',gameName:'',gameAffiliation:'',font:GAME_UI_FONT,gameFontSize:26,limbus:limbusDefaults(template,variant)};
}
function lcGet(o,path){return path.reduce((a,k)=>a?.[k],o);}
function lcSet(o,path,value){if(!path.length)return value;const [k,...rest]=path,copy=Array.isArray(o)?o.slice():{...o};copy[k]=lcSet(o?.[k]??{},rest,value);return copy;}
function lcStats(d){const metric=['damage','taken','kills'].includes(d.options.metric)?d.options.metric:'damage',rows=d.members.slice(0,d.options.memberCount).map(r=>({...r,value:Math.max(0,Number(r[metric])||0)}));if(d.options.sort==='descending')rows.sort((a,b)=>b.value-a.value);if(d.options.sort==='ascending')rows.sort((a,b)=>a.value-b.value);const max=Math.max(0,...rows.map(r=>r.value));return{rows:rows.map(r=>({...r,ratio:max?r.value/max:0})),total:rows.reduce((sum,r)=>sum+r.value,0)};}
function limbusSlotNames(d){
 const common=[['background','배경']],t=d.template;
 if(t==='story')return [...common,['characterLeft','인물 · 왼쪽'],['characterCenter','인물 · 중앙'],['characterRight','인물 · 오른쪽']];
 if(t==='event')return [...common,['event','사건 이미지']];
 if(t==='identity')return [...common,['portrait','인격 일러스트'],['avatar','인물 아이콘']];
 if(t==='results')return [...common,...d.members.slice(0,d.options.memberCount).map(r=>[r.id,r.name+' · 초상'])];
 if(t==='gift')return [...common,['gift','기프트 · 결과'],...Array.from({length:d.options.materialCount},(_,i)=>['material-'+i,'합성 재료 '+(i+1)])];
 if(t==='extraction')return [...common,...d.cards.slice(0,d.variant==='ten'?d.options.cardCount:1).map(r=>[r.id,r.name+' · 카드'])];
 if(t==='combat')return [...common,['portrait','아군 이미지'],['opponent','상대 이미지'],['skill','스킬 일러스트'],['sin','죄악 아이콘'],...d.statuses.map(r=>[r.id,r.name+' · 아이콘'])];
 return [...common,['subject','관찰 대상']];
}
function validateLimbus(l){
 if(!isLimbus(l))return;const d=l.limbus;if(!d)return;const fail=()=>{throw Error('림버스 UI 설정이 올바르지 않습니다.');};
 if(d.version!==1||!limbusTemplates.some(t=>t.key===d.template)||!lcMeta(d.template).variants.some(v=>v[0]===d.variant))fail();
 if(!d.texts||!d.options||!d.style||!d.images||!d.textStyles||!d.hidden)fail();
 const defaults=limbusDefaults(d.template),finite=(v,a,b)=>Number.isFinite(v)&&v>=a&&v<=b;
 for(const [k,v]of Object.entries(defaults.texts))if(typeof d.texts[k]!=='string'||d.texts[k].length>12000)fail();
 for(const [k,v]of Object.entries(defaults.options)){const n=d.options[k];if(typeof n!==typeof v||typeof n==='number'&&!finite(n,-1000000000,1000000000)||typeof n==='string'&&n.length>100)fail();}
 for(const [k,a,b]of [['choiceCount',2,4],['selectedChoice',-1,3],['memberCount',1,12],['materialCount',1,3],['cardCount',1,10],['rarity',1,3],['coinCount',1,5],['page',0,49]])if(!Number.isInteger(d.options[k])||!finite(d.options[k],a,b))fail();
 for(const [k,a,b]of [['opacity',0,1],['panelOpacity',0,1],['fontSize',10,60],['lineHeight',1,2.5]])if(!finite(d.style[k],a,b))fail();
 for(const k of ['frame','accent','ink','red','paper'])if(!/^#[0-9a-f]{6}$/i.test(d.style[k]))fail();
 if(typeof d.style.font!=='string'||d.style.font.length>100||!['left','center','right'].includes(d.style.align)||typeof d.style.decoration!=='boolean')fail();
 for(const [key,img]of Object.entries(d.images)){if(key.length>100||!img||typeof img.src!=='string'||img.src.length>24000000||img.src&&!/^data:image\/(png|jpeg|webp);base64,/.test(img.src)||!finite(img.zoom,10,300)||!finite(img.x,0,100)||!finite(img.y,0,100)||!finite(img.opacity,0,1)||!['contain','cover'].includes(img.fit)||typeof img.visible!=='boolean')fail();}
 for(const v of Object.values(d.hidden))if(typeof v!=='boolean')fail();
 for(const st of Object.values(d.textStyles))if(!st||st.font!==undefined&&(typeof st.font!=='string'||st.font.length>100)||st.size!==undefined&&!finite(st.size,8,80)||st.color!==undefined&&!/^#[0-9a-f]{6}$/i.test(st.color)||st.align!==undefined&&!['left','center','right'].includes(st.align))fail();
 for(const [key,min,max]of [['choices',4,4],['cards',10,10],['members',12,12],['skills',3,3],['statuses',0,20],['pages',1,50]]){const rows=d[key];if(!Array.isArray(rows)||rows.length<min||rows.length>max||new Set(rows.map(r=>r.id)).size!==rows.length)fail();for(const r of rows){if(!r||typeof r.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(r.id))fail();for(const [k,v]of Object.entries(r)){if(typeof v==='number'&&!finite(v,0,1000000000)||typeof v==='string'&&v.length>12000||!['string','number','boolean'].includes(typeof v))fail();}if(['cards','members'].includes(key)&&(!finite(r.rarity,1,3)||typeof r.name!=='string'||!finite(r.level,0,999)||!['damage','taken','kills'].every(k=>finite(r[k],0,1e9))||!/^#[0-9a-f]{6}$/i.test(r.color)))fail();if(key==='choices'&&(typeof r.text!=='string'||typeof r.enabled!=='boolean'))fail();if(key==='pages'&&['heading','body','annotation'].some(k=>typeof r[k]!=='string'))fail();}}
 if(d.options.page>=d.pages.length)fail();
}
