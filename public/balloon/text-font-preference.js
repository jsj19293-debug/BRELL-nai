'use strict';
const DEFAULT_TEXT_FONT='comic_gyeonggi_title_medium';
const TEXT_FONT_PREFERENCE_KEY='studio.lastTextFont';
let preferredTextFontId=DEFAULT_TEXT_FONT;
try{const id=localStorage.getItem(TEXT_FONT_PREFERENCE_KEY);if(typeof id==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(id))preferredTextFontId=id}catch{}
function preferredTextFont(){return typeof fonts!=='undefined'&&Object.hasOwn(fonts,preferredTextFontId)?preferredTextFontId:DEFAULT_TEXT_FONT}
function rememberTextFont(id){if(typeof id!=='string'||typeof fonts==='undefined'||!Object.hasOwn(fonts,id))return;preferredTextFontId=id;try{localStorage.setItem(TEXT_FONT_PREFERENCE_KEY,id)}catch{}}
function initTextFontPreference(){const id=preferredTextFont();$('font').value=id;ensureComicFont(id).catch(()=>status('기본 글꼴을 불러오지 못했습니다. 글꼴을 다시 선택해주세요.'))}
