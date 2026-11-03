/* Independent stamp brush format and distance-based stroke sampler. */
(function(root){
'use strict';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function create(name,tips){return {format:'balloon-studio-brush',version:1,id:typeof crypto!=='undefined'?crypto.randomUUID():String(Date.now()),name,type:'stampBrush',tips,tipSelection:'random',spacing:.2,size:{base:100,random:0,pressure:false},rotation:{base:0,followStroke:false,random:0},opacity:{base:1,random:0,pressure:false},scatter:{enabled:false,amount:0}}}
function validate(b){
 const num=(n,a,z)=>Number.isFinite(n)&&n>=a&&n<=z;
 if(!b||b.format!=='balloon-studio-brush'||b.version!==1||b.type!=='stampBrush'||typeof b.id!=='string'||b.id.length>100||typeof b.name!=='string'||!b.name.trim()||b.name.length>80||!Array.isArray(b.tips)||!b.tips.length||b.tips.length>32||!b.tips.every(t=>typeof t==='string'&&/^data:image\/(png|webp);base64,[A-Za-z0-9+/=]+$/.test(t)&&t.length<12000000)||!['random','sequence'].includes(b.tipSelection)||!num(b.spacing,.02,3)||!num(b.size?.base,2,1000)||!num(b.size?.random,0,.95)||typeof b.size?.pressure!=='boolean'||!num(b.rotation?.base,-180,180)||typeof b.rotation?.followStroke!=='boolean'||!num(b.rotation?.random,0,180)||!num(b.opacity?.base,.01,1)||!num(b.opacity?.random,0,.95)||typeof b.opacity?.pressure!=='boolean'||typeof b.scatter?.enabled!=='boolean'||!num(b.scatter?.amount,0,2))throw Error('지원하지 않거나 손상된 공방 브러시 파일이야.');
 return b;
}
function stroke(brush,point,emit,random=Math.random){
 const b=brush,step=Math.max(1,b.size.base*b.spacing);let previous=point,remainder=0,count=0;
 function stamp(p,angle){if(count>=12000)return;const rand=()=>random()*2-1,pressure=b.size.pressure?clamp(p.pressure??1,.05,1):1;
 const size=Math.max(1,b.size.base*(1+rand()*b.size.random)*pressure),rotation=(b.rotation.base+rand()*b.rotation.random)*Math.PI/180+(b.rotation.followStroke?angle:0);
 const radius=b.scatter.enabled?Math.sqrt(random())*b.scatter.amount*b.size.base:0,theta=random()*Math.PI*2;
 const tip=b.tipSelection==='sequence'?count%b.tips.length:Math.min(b.tips.length-1,Math.floor(random()*b.tips.length));
 emit({x:p.x+Math.cos(theta)*radius,y:p.y+Math.sin(theta)*radius,size,rotation,opacity:clamp(b.opacity.base*(1+rand()*b.opacity.random)*(b.opacity.pressure?clamp(p.pressure??1,.05,1):1),.01,1),tip});count++;
 }
 stamp(point,0);
 return {move(p){const dx=p.x-previous.x,dy=p.y-previous.y,len=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);if(!len){previous=p;return}let distance=step-remainder;while(distance<=len&&count<12000){const t=distance/len;stamp({x:previous.x+dx*t,y:previous.y+dy*t,pressure:(previous.pressure??1)+((p.pressure??1)-(previous.pressure??1))*t},angle);distance+=step}remainder=(remainder+len)%step;previous=p},get count(){return count}};
}
function draw(c,stamp,images){const im=images[stamp.tip];if(!im)return;const scale=stamp.size/Math.max(im.width,im.height);c.save();c.translate(stamp.x,stamp.y);c.rotate(stamp.rotation);c.globalAlpha=stamp.opacity;c.drawImage(im,-im.width*scale/2,-im.height*scale/2,im.width*scale,im.height*scale);c.restore()}
const api={create,validate,stroke,draw};root.BrushEngine=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
