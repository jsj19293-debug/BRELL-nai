'use strict';
// GBC Gold reference: 160×144 screen, 160×48 two-line dialogue area.
// Native stepped simple/bevel borders; no Masters controls. Original scene art is not bundled.
const POKEMON_GOLD_FONT='pixel_galmuri9';
gameUIPresets.push({name:'포켓몬 골드 · 도트 대화창',file:'pokemon-gold',w:960,h:864,text:'새로운 모험이\n너를 기다리고 있단다!',size:20});
gameUISVG.push('data:image/svg+xml;base64,'+btoa('<svg xmlns="http://www.w3.org/2000/svg" width="960" height="864"/>'));
function pokemonGoldLayer(){return{...pokemonLayer(true),gamePreset:7,name:'포켓몬 골드 · 도트 대화창',src:gameUISVG[7],font:POKEMON_GOLD_FONT,gameName:'',gameText:gameUIPresets[7].text,gameFontSize:20,pokeGoldWidth:100,pokeGoldX:50,pokeGoldY:100,pokeGoldMode:'dialogue',pokeGoldBorder:'bevel'};}
function isPokemonGoldBattle(l){return l?.gamePreset===7&&['trainer','wild'].includes(l.pokeGoldMode);}
function validatePokemonGold(l){if(l.pokeGoldMode!==undefined&&!['dialogue','trainer','wild'].includes(l.pokeGoldMode)||l.pokeGoldBorder!==undefined&&!['bevel','simple'].includes(l.pokeGoldBorder))throw Error('골드 창 서식이 올바르지 않습니다.');if(isPokemonGoldBattle(l))validateGoldBattle(l);for(const k of ['pokeGoldWidth','pokeGoldX','pokeGoldY'])if(!Number.isFinite(l[k])||l[k]<(k==='pokeGoldWidth'?30:0)||l[k]>100)throw Error('골드 대화창 크기 또는 위치가 올바르지 않습니다.');}
function pokemonGoldCard(l,height=48){
 const out=document.createElement('canvas');out.width=160;out.height=height;const c=out.getContext('2d'),simple=l.pokeGoldBorder==='simple';
 const palette=simple?[[0,'#181818'],[1,'#fff'],[2,'#181818'],[3,'#fff']]:[[0,'#303030'],[1,'#b8b8b8'],[2,'#080808'],[3,'#f8f8f8']];
 for(const [inset,ink]of palette){c.fillStyle=ink;c.fillRect(inset+2,inset,156-inset*2,height-inset*2);c.fillRect(inset,inset+2,160-inset*2,height-4-inset*2);}
 // Bevel corner highlights stay on the native dot grid; font rasterization below
 // changes only the text, so the grey frame is preserved in PNG output.
 const text=document.createElement('canvas');text.width=160;text.height=height;const g=text.getContext('2d'),size=Math.max(8,Math.min(14,Math.round(l.gameFontSize/2))),family=fonts[POKEMON_GOLD_FONT]||'monospace';g.font=`${size}px ${family}`;
 const lines=gameUIWrap(g,l.gameText,140),shown=lines.slice(0,2);g.save();g.beginPath();g.rect(7,7,146,height-13);g.clip();g.fillStyle=simple?'#181818':'#080808';g.textBaseline='top';shown.forEach((line,i)=>g.fillText(line,8,9+i*16));g.restore();
 const pixels=g.getImageData(0,0,160,height),d=pixels.data;for(let i=0;i<d.length;i+=4){if(d[i+3]<150)d[i+3]=0;else{d[i]=d[i+1]=d[i+2]=simple?24:8;d[i+3]=255;}}g.putImageData(pixels,0,0);c.drawImage(text,0,0);
 if(l.pokeShowNext){c.fillStyle=simple?'#181818':'#080808';for(let row=0;row<4;row++)c.fillRect(145+row,height-9+row,7-row*2,1);}
 return{canvas:out,overflow:lines.length>2};
}
function pokemonGoldLayout(l){const w=Math.max(1,Math.round(Math.min(l.w*l.pokeGoldWidth/100,l.h*160/48))),h=w*48/160;return{x:Math.round((l.w-w)*l.pokeGoldX/100),y:Math.round((l.h-h)*l.pokeGoldY/100),w,h};}
function pokemonGoldBitmap(l,photo=postMediaImages.get(l.id)){
 if(isPokemonGoldBattle(l))return pokemonGoldBattleBitmap(l,photo);
 const out=document.createElement('canvas'),scale=Math.min(1,2000/l.w,3000/l.h);out.width=Math.max(1,Math.round(l.w*scale));out.height=Math.max(1,Math.round(l.h*scale));const c=out.getContext('2d');c.scale(scale,scale);
 if(l.media&&photo){const iw=photo.naturalWidth||photo.width,ih=photo.naturalHeight||photo.height,s=Math.max(l.w/iw,l.h/ih)*l.mediaZoom/100,w=iw*s,h=ih*s;c.drawImage(photo,(l.w-w)*l.mediaX/100,(l.h-h)*l.mediaY/100,w,h);}
 const card=pokemonGoldCard(l).canvas,m=pokemonGoldLayout(l);c.imageSmoothingEnabled=false;c.drawImage(card,m.x,m.y,m.w,m.h);return out;
}
function appendGoldBorderControl(host,l){const label=document.createElement('label'),select=document.createElement('select');label.textContent='도트 테두리';for(const [value,title]of [['bevel','첨부형 · 회색 입체 테두리'],['simple','기본 · 흑백 이중 테두리']]){const o=document.createElement('option');o.value=value;o.textContent=title;select.append(o);}select.value=l.pokeGoldBorder||'bevel';select.oninput=()=>{if(projectBusy||currentImageLayer()!==l)return;recordInput('gold-border');l.pokeGoldBorder=select.value;render();};label.append(select);host.append(label);}
function initPokemonGold(){
 if(typeof initPokemonGoldBattle==='function')initPokemonGoldBattle();
 for(const [only,title]of [[true,'골드 · 대화창만'],[false,'골드 · 배경 포함 대화 화면']]){const b=document.createElement('button');b.type='button';b.className='post-add';const img=document.createElement('img'),layer={...pokemonGoldLayer(),w:960,h:864};img.src=pokemonGoldBitmap(layer).toDataURL('image/png');img.alt=title;img.style.cssText='width:100%;height:200px;object-fit:contain;image-rendering:pixelated;background:repeating-conic-gradient(#dce4dd 0% 25%,#edf2eb 0% 50%) 50%/20px 20px';ensureComicFont(POKEMON_GOLD_FONT).then(()=>{if(img.isConnected)img.src=pokemonGoldBitmap(layer).toDataURL('image/png');}).catch(()=>{});const text=document.createElement('strong');text.textContent=title;b.append(img,text);b.onclick=()=>addPokemon(only,true);$('pokemonGoldChoices').append(b);}
}
