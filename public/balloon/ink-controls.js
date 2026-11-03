'use strict';
let inkPanel=null,inkControlTarget=null,inkGesture=null,inkCommand=null,inkClipboard=null,inkCoveragePromise=null,inkThumbKey='';
let inkUserPresets=[];
try{const list=JSON.parse(localStorage.getItem('studio.inkPresets')||'[]');if(Array.isArray(list))inkUserPresets=list.slice(0,20).filter(p=>{try{validateInkBleed({inkBleed:p.settings});return typeof p.name==='string'&&p.name.length<=40}catch{return false}})}catch{}
function inkCurrent(){const b=current();return inkCanEdit(b)&&b.visible!==false?b:null}
function inkSelection(){return typeof chosenBalloons==='function'?chosenBalloons().filter(inkCanEdit):inkCurrent()?[inkCurrent()]:[]}
function inkSelectionKey(){return inkSelection().map(b=>b.id).join('|')}
function inkCapture(key){const b=inkCurrent();return b&&!projectBusy&&!$('layerMiniPopup')?.hidden?{key,object:b,document:state,selection:inkSelectionKey(),recorded:false}:null}
function inkGuard(d){return !!d&&d.document===state&&d.object===inkCurrent()&&!projectBusy&&!$('layerMiniPopup')?.hidden&&!inkPanel?.hidden}
function inkRequestRender(){if(typeof requestEditorInputRender==='function')requestEditorInputRender();else render()}
function inkCommit(patch,d,targets=null){
 if(!inkGuard(d))return false;const objects=targets||[d.object];if(targets&&d.selection!==inkSelectionKey())return false;
 const changes=objects.map(b=>({b,next:{...inkSettings(b),...structuredClone(patch)}})).filter(({b,next})=>JSON.stringify(b.inkBleed)!==JSON.stringify(next));if(!changes.length)return false;
 for(const {b,next}of changes)validateInkBleed({...b,inkBleed:next});if(!d.recorded){checkpoint();d.recorded=true}else markProjectDirty();for(const {b,next}of changes)b.inkBleed=next;updateLayers(d.object.id);inkRequestRender();return true;
}
function inkBindCommand(button,action){button.onpointerdown=button.onfocus=()=>{inkCommand=inkCapture('command')};button.onkeydown=()=>{if(!inkCommand)inkCommand=inkCapture('command')};button.onclick=()=>{const d=inkCommand;inkCommand=null;if(inkGuard(d))action(d)}}
function inkApplyPreset(preset,d){if(!inkGuard(d))return;const settings={...INK_DEFAULTS,...preset,seed:inkSettings(d.object).seed};delete settings.name;inkCommit(settings,d)}
function inkHasCodepoint(ranges,point){let lo=0,hi=ranges.length-1;while(lo<=hi){const mid=(lo+hi)>>1,[a,z]=ranges[mid];if(point<a)hi=mid-1;else if(point>z)lo=mid+1;else return true}return false}
function inkFontWarning(b,coverage){
 const missing=[],unknown=[];let offset=0;for(const ch of b.text){const point=ch.codePointAt(0),han=point>=0x3400&&point<=0x9fff||point>=0xf900&&point<=0xfaff||point>=0x20000&&point<=0x323af,font=typeof richStyleAt==='function'?richStyleAt(b,offset).font||b.font:b.font;offset+=ch.length;if(!han)continue;let ranges=coverage[font];if(typeof ranges==='string')ranges=coverage[ranges];if(!Array.isArray(ranges))unknown.push(ch);else if(!inkHasCodepoint(ranges,point))missing.push(ch)}
 if(missing.length)return '이 글꼴에 '+[...new Set(missing)].slice(0,12).join(' · ')+' 글리프가 없습니다. 대체 글꼴로 표시될 수 있어요. 한자 무공명에는 조선궁서체를 확인해 보세요.';
 return unknown.length?'이 사용자 글꼴의 한자 지원을 자동 확인하지 못했습니다. 미리보기에서 대체 글꼴이 섞이는지 확인해 주세요.':'';
}
function inkUpdateFontWarning(b){
 const node=$('inkFontNotice'),han=/[\u3400-\u9fff\uf900-\ufaff]|[\u{20000}-\u{323af}]/u.test(b.text);node.hidden=!han;if(!han)return;
 const doc=state,text=b.text,font=b.font,runs=JSON.stringify(b.textRuns);inkCoveragePromise??=fetch('font-coverage.json').then(r=>{if(!r.ok)throw Error('coverage');return r.json()});
 inkCoveragePromise.then(coverage=>{if(state!==doc||inkCurrent()!==b||b.text!==text||b.font!==font||JSON.stringify(b.textRuns)!==runs)return;node.textContent=inkFontWarning(b,coverage);node.hidden=!node.textContent}).catch(()=>{if(state===doc&&inkCurrent()===b){node.textContent='한자 지원 정보를 확인하지 못했습니다. 선택한 글꼴의 미리보기를 확인해 주세요.';node.hidden=false}});
}
function renderInkThumbnails(b){
 const key=[b.font,b.color,typeof comicFontFaces!=='undefined'?comicFontFaces.get(b.font)?.status:''].join('|');if(inkThumbKey===key)return;inkThumbKey=key;
 for(const mode of ['none','soft','organic','watercolor']){const canvas=$('inkThumb'+mode),g=canvas.getContext('2d');g.clearRect(0,0,canvas.width,canvas.height);g.fillStyle='#edf1ec';g.fillRect(0,0,canvas.width,canvas.height);g.font=`400 32px ${family(b)}`;g.textAlign='center';g.textBaseline='middle';const preset=INK_PRESETS.find(p=>p.mode===mode)||INK_DEFAULTS;paintGlyph(g,{...b,id:'ink-thumb-'+mode,fontSize:32,color:'#202c28',art:{width:0,depth:0,slant:0,rotation:0,wave:0,gradient:false},inkBleed:mode==='none'?undefined:{...INK_DEFAULTS,...preset,seed:91827}},b.font==='cover_chosun_gs'?'天':'먹',canvas.width/2,canvas.height/2)}
}
function syncInkControls(){
 if(!inkPanel)return;const b=inkCurrent(),changed=inkControlTarget?.object!==b||inkControlTarget?.document!==state;if(changed){inkControlTarget=b?{object:b,document:state}:null;inkGesture=null;inkCommand=null;inkPanel.open=false;inkThumbKey=''}inkPanel.hidden=!b;if(!b||!inkPanel.open||$('layerMiniPopup').hidden)return;
 const s=inkSettings(b),set=(id,value)=>{if(document.activeElement!==$(id))$(id).value=value};$('inkEnabled').checked=!!b.inkBleed&&s.enabled;
 for(const mode of ['none','soft','organic','watercolor'])$('inkMode'+mode).setAttribute('aria-pressed',String(mode==='none'?!b.inkBleed||!s.enabled:!!b.inkBleed&&s.enabled&&s.mode===mode));
 for(const key of ['intensity','radius','irregularity','density','splatter','innerTexture','paperTexture']){set('ink'+key,s[key]);$('ink'+key+'Value').textContent=s[key];$('ink'+key+'Label').hidden=key==='irregularity'&&s.mode==='soft'||key==='splatter'&&s.mode==='soft'||['innerTexture','paperTexture'].includes(key)&&s.mode!=='watercolor'}
 set('inkColor',s.color||b.color);$('inkFollowColor').checked=s.color===null;$('inkColor').disabled=s.color===null;set('inkQuality',inkPreviewQuality);$('inkPaste').disabled=!inkClipboard;
 const targets=inkSelection();$('inkBulk').disabled=targets.length<2;$('inkBulk').textContent='선택한 '+targets.length+'개 텍스트에 일괄 적용';
 const select=$('inkPreset'),signature=JSON.stringify(inkUserPresets);if(select.dataset.presets!==signature){select.replaceChildren();for(const [value,title]of [['','프리셋 선택'],...INK_PRESETS.map((p,i)=>['builtin-'+i,p.name]),...inkUserPresets.map((p,i)=>['user-'+i,p.name])]){const o=document.createElement('option');o.value=value;o.textContent=title;select.append(o)}select.dataset.presets=signature}
 renderInkThumbnails(b);inkUpdateFontWarning(b);
}
function initInkControls(){
 const host=$('layerMiniTextFields');if(!host)return;inkPanel=document.createElement('details');inkPanel.id='inkEffectPanel';inkPanel.className='ink-effect-panel';const summary=document.createElement('summary');summary.textContent='효과 · 먹 번짐';inkPanel.append(summary);host.append(inkPanel);
 const field=(title,id,type='range',options=null)=>{const label=document.createElement('label'),span=document.createElement('span'),input=document.createElement(options?'select':'input');label.id=id+'Label';span.textContent=title;input.id=id;if(options)for(const [value,text]of options){const o=document.createElement('option');o.value=value;o.textContent=text;input.append(o)}else input.type=type;label.append(span,input);if(type==='range'&&!options){input.min=0;input.max=100;input.step=1;const value=document.createElement('output');value.id=id+'Value';label.append(value)}inkPanel.append(label);return input};
 const enabled=field('먹 번짐 켜기','inkEnabled','checkbox');enabled.onpointerdown=enabled.onfocus=()=>{inkGesture=inkCapture('enabled')};enabled.onchange=()=>{inkCommit({enabled:enabled.checked},inkGesture);inkGesture=null};
 const modes=document.createElement('div');modes.className='ink-mode-grid';modes.setAttribute('role','group');modes.setAttribute('aria-label','먹 번짐 유형');for(const [mode,title]of [['none','없음'],['soft','약한 먹 번짐'],['organic','불규칙 먹 번짐'],['watercolor','수묵·수채화']]){const button=document.createElement('button'),canvas=document.createElement('canvas'),name=document.createElement('span');button.id='inkMode'+mode;button.type='button';canvas.id='inkThumb'+mode;canvas.width=104;canvas.height=66;canvas.setAttribute('aria-hidden','true');name.textContent=title;button.append(canvas,name);modes.append(button);inkBindCommand(button,d=>inkCommit(mode==='none'?{enabled:false}:{mode,enabled:true},d))}inkPanel.append(modes);
 for(const [key,title]of [['intensity','번짐 강도'],['radius','번짐 범위'],['irregularity','불규칙도'],['density','먹 농도'],['splatter','먹 튀김'],['innerTexture','내부 질감'],['paperTexture','종이 질감']]){const input=field(title,'ink'+key);input.onpointerdown=input.onfocus=()=>{inkGesture=inkCapture(key)};input.onkeydown=()=>{if(!inkGesture)inkGesture=inkCapture(key)};input.oninput=()=>{if(inkGesture?.key!==key||input.value==='')return;const value=Number(input.value);if(Number.isFinite(value))inkCommit({[key]:Math.max(0,Math.min(100,value))},inkGesture)};input.onchange=input.onblur=()=>{inkGesture=null}}
 const follow=field('원본 글자색 따라가기','inkFollowColor','checkbox'),color=field('먹 색상','inkColor','color');for(const input of [follow,color])input.onpointerdown=input.onfocus=()=>{inkGesture=inkCapture('color')};follow.onchange=()=>{inkCommit({color:follow.checked?null:color.value},inkGesture);inkGesture=null};color.oninput=()=>{if(/^#[0-9a-f]{6}$/i.test(color.value))inkCommit({color:color.value},inkGesture)};color.onchange=color.onblur=()=>{inkGesture=null};
 const preset=field('먹 번짐 프리셋','inkPreset',null,[]);preset.onpointerdown=preset.onfocus=()=>{inkGesture=inkCapture('preset')};preset.onchange=()=>{const [source,index]=preset.value.split('-'),p=source==='builtin'?INK_PRESETS[Number(index)]:inkUserPresets[Number(index)]?.settings;if(p)inkApplyPreset(p,inkGesture);inkGesture=null;preset.value=''};
 const button=(id,title,action)=>{const b=document.createElement('button');b.id=id;b.type='button';b.textContent=title;inkPanel.append(b);inkBindCommand(b,action);return b};
 button('inkReset','기본값 복원',d=>inkCommit({...INK_DEFAULTS,mode:inkSettings(d.object).mode,seed:inkSettings(d.object).seed},d));
 button('inkSavePreset','현재 설정을 프리셋으로 저장',d=>{const name=prompt('먹 번짐 프리셋 이름','나의 먹 번짐');if(!name?.trim()||!inkGuard(d))return;const settings=inkSettings(d.object);delete settings.seed;inkUserPresets.push({name:name.trim().slice(0,40),settings});inkUserPresets=inkUserPresets.slice(-20);try{localStorage.setItem('studio.inkPresets',JSON.stringify(inkUserPresets));status('먹 번짐 프리셋을 저장했습니다.')}catch{status('브라우저에 프리셋을 저장하지 못했습니다. 프로젝트 파일로 설정을 보관해 주세요.')}syncInkControls()});
 button('inkCopy','효과 복사',d=>{inkClipboard=structuredClone(inkSettings(d.object));status('먹 번짐 설정을 복사했습니다. 다른 텍스트에서 효과 붙여넣기를 누르세요.');syncInkControls()});
 button('inkPaste','효과 붙여넣기',d=>{if(inkClipboard)inkCommit(inkClipboard,d)});
 button('inkBulk','선택한 텍스트에 일괄 적용',d=>{const targets=inkSelection();if(targets.length>1)inkCommit(inkSettings(d.object),d,targets)});
 const quality=field('미리보기 품질','inkQuality',null,[['auto','자동'],['low','가볍게'],['high','선명하게']]);quality.onpointerdown=quality.onfocus=()=>{inkGesture=inkCapture('quality')};quality.onchange=()=>{if(inkGuard(inkGesture)&&['auto','low','high'].includes(quality.value)){inkPreviewQuality=quality.value;try{localStorage.setItem('studio.inkQuality',quality.value)}catch{}clearInkCache();inkThumbKey='';inkRequestRender()}inkGesture=null};
 for(const [input,key]of [[enabled,'enabled'],[follow,'color'],[preset,'preset'],[quality,'quality']])input.onkeydown=()=>{if(!inkGesture)inkGesture=inkCapture(key)};
 const note=document.createElement('small');note.textContent='글자는 계속 편집할 수 있어요. 모서리 맞추기로 글자와 번짐을 함께 확대할 수 있습니다. 내보내기는 최종 품질로 계산합니다.';inkPanel.append(note);const notice=document.createElement('p');notice.id='inkFontNotice';notice.className='ink-font-notice';notice.setAttribute('role','status');notice.hidden=true;inkPanel.append(notice);
 inkPanel.ontoggle=()=>{if(inkPanel.open)syncInkControls()};const previous=syncLayerMiniPopup;syncLayerMiniPopup=function(){previous();syncInkControls()};const draw=render;render=function(){draw();syncInkControls()};window.addEventListener('pointercancel',()=>{inkGesture=null;inkCommand=null});syncInkControls();
}
window.addEventListener('DOMContentLoaded',initInkControls,{once:true});
