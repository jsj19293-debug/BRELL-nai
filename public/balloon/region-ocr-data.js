'use strict';
// Selection is editor-only data; it never changes the source or the project.
function ocrPaintAction(c,a){
 c.save();c.globalCompositeOperation=a.type==='exclude'?'destination-out':'source-over';c.fillStyle=c.strokeStyle='#fff';
 if(a.type==='rect'){c.fillRect(Math.min(a.x,a.x+a.w),Math.min(a.y,a.y+a.h),Math.abs(a.w),Math.abs(a.h));}
 else{c.lineCap=c.lineJoin='round';c.lineWidth=a.size;c.beginPath();const p=a.points;if(p.length===1){c.arc(p[0].x,p[0].y,a.size/2,0,Math.PI*2);c.fill();}else{c.moveTo(p[0].x,p[0].y);for(const v of p.slice(1))c.lineTo(v.x,v.y);c.stroke();}}
 c.restore();
}
function ocrReadOrder(regions,vertical){
 const axis=vertical?'x':'y',size=vertical?'w':'h',secondary=vertical?'y':'x',sign=vertical?-1:1;
 const sorted=[...regions].sort((a,b)=>sign*(a[axis]+a[size]/2-b[axis]-b[size]/2)),groups=[];
 for(const region of sorted){const center=region[axis]+region[size]/2;let group=groups.find(g=>Math.abs(g.center-center)<=Math.min(g.size,region[size])*.45);if(!group){group={center,size:region[size],regions:[]};groups.push(group);}group.regions.push(region);}
 return groups.flatMap(g=>g.regions.sort((a,b)=>a[secondary]-b[secondary]));
}
function ocrFindRegions(mask,vertical=false){
 const cell=4,w=mask.width,h=mask.height,gw=Math.ceil(w/cell),gh=Math.ceil(h/cell),pixels=mask.getContext('2d').getImageData(0,0,w,h).data,occupied=new Uint8Array(gw*gh),labels=new Uint16Array(gw*gh),queue=new Uint32Array(gw*gh),regions=[];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(pixels[(y*w+x)*4+3]>8)occupied[Math.floor(y/cell)*gw+Math.floor(x/cell)]=1;
 let label=0;
 for(let start=0;start<occupied.length;start++){
  if(!occupied[start]||labels[start])continue;if(++label>24)throw Error('한 번에 최대 24개 영역까지 읽을 수 있어요. 일부 영역을 지워 주세요.');
  let head=0,tail=1,x0=gw,y0=gh,x1=0,y1=0;queue[0]=start;labels[start]=label;
  while(head<tail){const at=queue[head++],x=at%gw,y=Math.floor(at/gw);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=gw||yy>=gh)continue;const next=yy*gw+xx;if(occupied[next]&&!labels[next]){labels[next]=label;queue[tail++]=next;}}
  }
  regions.push({label,x:x0*cell,y:y0*cell,w:Math.min(w,(x1+1)*cell)-x0*cell,h:Math.min(h,(y1+1)*cell)-y0*cell});
 }
 return{regions:ocrReadOrder(regions,vertical),labels,gw,cell,pixels};
}
function ocrSourceTarget(){
 const b=current(),info=b?.kind==='asset'&&referenceInfo(b.assetId);
 if(info?.fixed&&!info.censor){const raw=referenceImages.get(b.assetId);if(raw){const image=stickerImage(b,raw);return{kind:'asset',owner:b,image,width:image.width,height:image.height,name:info.label||'선택 PNG 에셋'};}}
 const layer=currentImageLayer();if(layer?.src&&!layer.kind&&!layer.locked){const image=layerBitmap(layer);if(image)return{kind:'layer',owner:layer,image,width:image.naturalWidth||image.width,height:image.naturalHeight||image.height,name:layer.name||'선택 이미지'};}
 if(bg)return{kind:'background',owner:state,image:bg,width:state.width,height:state.height,name:'현재 장의 원본 이미지'};
 throw Error('글자를 읽을 이미지 레이어·고정 PNG 에셋을 선택하거나 원본 이미지를 불러와 주세요.');
}
function ocrDrawSource(c,target,x,y,w,h,dw,dh){
 if(target.kind==='background'){c.save();c.scale(dw/w,dh/h);c.translate(-x,-y);c.drawImage(target.image,0,0,target.width,target.height);drawPatches(c);c.restore();}
 else c.drawImage(target.image,x,y,w,h,0,0,dw,dh);
}
function ocrCropRegion(editor,region,selection,limit=2000000){
 const target=editor.target,rx=target.width/editor.work.width,ry=target.height/editor.work.height,sw=region.w*rx,sh=region.h*ry,scale=Math.min(1,1800/sw,1800/sh,Math.sqrt(limit/(sw*sh))),w=Math.max(1,Math.round(sw*scale)),h=Math.max(1,Math.round(sh*scale));
 const raw=document.createElement('canvas'),mask=document.createElement('canvas'),result=document.createElement('canvas');raw.width=w;raw.height=h;mask.width=region.w;mask.height=region.h;result.width=w+32;result.height=h+32;
 const g=raw.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,w,h);ocrDrawSource(g,target,region.x*rx,region.y*ry,sw,sh,w,h);
 if(editor.invert.checked){const data=g.getImageData(0,0,w,h);for(let p=0;p<data.data.length;p+=4){data.data[p]=255-data.data[p];data.data[p+1]=255-data.data[p+1];data.data[p+2]=255-data.data[p+2];}g.putImageData(data,0,0);}
 const m=mask.getContext('2d'),data=m.createImageData(mask.width,mask.height);
 for(let y=0;y<mask.height;y++)for(let x=0;x<mask.width;x++){const wx=x+region.x,wy=y+region.y,i=(y*mask.width+x)*4;if(selection.labels[Math.floor(wy/selection.cell)*selection.gw+Math.floor(wx/selection.cell)]===region.label&&selection.pixels[(wy*editor.work.width+wx)*4+3]>8){data.data[i]=data.data[i+1]=data.data[i+2]=data.data[i+3]=255;}}
 m.putImageData(data,0,0);g.globalCompositeOperation='destination-in';g.imageSmoothingEnabled=false;g.drawImage(mask,0,0,w,h);
 const out=result.getContext('2d');out.fillStyle='#fff';out.fillRect(0,0,result.width,result.height);out.drawImage(raw,16,16);raw.width=raw.height=mask.width=mask.height=1;return result;
}
