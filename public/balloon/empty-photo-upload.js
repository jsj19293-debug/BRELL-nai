'use strict';
// A click opens a picker; dragging, editing handles and painting keep their own tools.
let emptyPhotoPress=null;
function emptyPhotoTarget(l,p){
 const rect=imageLayerRect(l),local=socialLocalPoint({...l,...rect},p);if(!local)return null;if(l.kind==='snsprofile')return snsProfileTarget({...l,...rect},local);
 const inside=b=>local.x>b.x&&local.y>b.y&&local.x<b.x+b.w&&local.y<b.y+b.h;
 if(isSocialLayer(l)){
  const view={...l,...rect},pad=rect.w*.045;
  if(!l.avatar&&inside({x:pad,y:pad*.65,w:rect.w*.09,h:rect.w*.09}))return{file:'postAvatarFile'};
  if(!l.media&&inside(socialMediaRect(view)))return{file:'postMediaFile'};
 }
 if(l.kind==='gameui'&&l.gamePreset===3&&!l.media&&!(l.nikkeType==='choice'&&l.nikkeChoiceOverlay)&&inside({x:0,y:rect.h*.1,w:rect.w,h:rect.h*.5}))return{file:'nikkePhotoFile'};
 if(l.kind==='polaroid'&&!l.media&&inside(polaroidPhotoRect(rect)))return{file:'polaroidMediaFile'};
 if(l.kind==='camera'&&!l.media){const b=cameraPhotoBox({...l,...rect}),sx=rect.w/(l.variant==='rec'?1280:720),sy=rect.h/(l.variant==='rec'?b.h:1560);if(inside({x:b.x*sx,y:b.y*sy,w:b.w*sx,h:b.h*sy}))return{file:'cameraPhotoFile'};}
 if(l.kind==='stream'&&!l.media){const design=streamDesignSize(l.preset),x=local.x*design.w/rect.w,y=local.y*design.h/rect.h;
  // Restrict to the exposed broadcast area, outside chat boards and player controls.
  const regions=[ [350,80,700,650],[40,90,900,650],[250,80,620,650],[300,100,650,600],[340,90,900,640],[520,90,700,540],[40,90,930,650],[100,230,470,500],[100,230,470,500],[100,230,470,420],[100,250,470,460],[710,170,530,450],[40,160,840,450] ];const b=regions[l.preset];if(b&&x>b[0]&&y>b[1]&&x<b[0]+b[2]&&y<b[1]+b[3])return{file:'streamMediaFile'};
 }
 if(l.kind==='eroste'&&l.erosteType==='status'){const x=local.x*1536/rect.w,y=local.y*864/rect.h;const slot=EROSTE_STATUS_PHOTO_SLOTS.find(b=>x>=b.x&&y>=b.y&&x<b.x+b.w&&y<b.y+b.h);if(slot&&!l[slot.key].src)return{erostePhoto:l[slot.key]};}
 if(isIdentityCard(l)){const t=identityTypes[l.identityType],b=identityPhotoBox(l),x=local.x*t.w/rect.w,y=local.y*t.h/rect.h;if(x>b.x&&y>b.y&&x<b.x+b.w&&y<b.y+b.h)return{photo:l.main};return null;}
 if(l.kind==='profile'){
  const x=local.x*1536/rect.w,y=local.y*1024/rect.h,boxes=[[l.main,0,0,500,1024],[l.main,1144,546,122,122]];
  if(l.gallery.length){boxes.push([l.gallery[0],918,88,l.gallery.length===1?574:332,302]);const rest=l.gallery.slice(1),cols=rest.length>3?2:1,rows=Math.ceil(rest.length/cols),w=230/cols-(cols===2?4:0),h=(302-(rows-1)*8)/rows;rest.forEach((photo,i)=>boxes.push([photo,1262+(i%cols)*(w+8),88+Math.floor(i/cols)*(h+8),w,h]));}
  const rh=Math.min(108,242/Math.max(1,Math.ceil(l.relationships.length/2)));l.relationships.forEach((photo,i)=>boxes.push([photo,i%2===0?920:1374,493+Math.floor(i/2)*rh,116,Math.max(30,rh-42)]));
  const b=boxes.find(([photo,bx,by,w,h])=>!photo.src&&x>bx&&y>by&&x<bx+w&&y<by+h);if(b)return{photo:b[0]};
 }
 return null;
}
function beginEmptyPhotoPointer(e){
 if(projectBusy||editTool!=='select'||e.shiftKey||window.mobileMultiSelect||phoneFitArmed||socialOcclusionMode||imageLayerEraser||panelEditMode||polaroidTool)return false;
 const p=pos(e);if(state.items.some(b=>hitWarpedBalloon(b,p)))return false;
 const l=orderedImageLayers().reverse().find(l=>l.visible!==false&&imageLayerContains(l,p));if(!l||l.cornerMode)return false;
 const r=imageLayerRect(l),margin=(e.pointerType==='touch'?22:13)/zoom;if(!l.locked&&(Math.min(Math.abs(p.x-r.x),Math.abs(p.x-r.x-r.w))<margin||Math.min(Math.abs(p.y-r.y),Math.abs(p.y-r.y-r.h))<margin))return false;
 const target=emptyPhotoTarget(l,p);if(!target)return false;
 emptyPhotoPress={id:l.id,target,document:state,pointer:e.pointerId,x:e.clientX,y:e.clientY};imageLayerSelected=l.id;selected=null;sync();canvas.setPointerCapture(e.pointerId);return true;
}
function endEmptyPhotoPointer(e){
 const press=emptyPhotoPress;if(!press||press.pointer!==e.pointerId)return false;emptyPhotoPress=null;
 if(projectBusy||press.document!==state||currentImageLayer()?.id!==press.id||Math.hypot(e.clientX-press.x,e.clientY-press.y)>6)return true;
 if(press.target.snsPhoto){pickSNSProfilePhoto(currentImageLayer(),press.target.snsPhoto);return true;}
 if(press.target.snsField){editSNSProfileField(press.target.snsField);return true;}
 if(press.target.erostePhoto){const file=[...$('erosteFields').querySelectorAll('input[type=file]')].find(f=>f._erostePhoto===press.target.erostePhoto);file?.click();return true;}
 // Camera uploads must register the destination layer before opening the file picker.
 if(press.target.file==='cameraPhotoFile'){$('cameraAddPhoto')?.click();return true;}
 const file=press.target.photo?[...$('profileFields').querySelectorAll('input[type=file]')].find(f=>f._profilePhoto===press.target.photo):$(press.target.file);file?.click();return true;
}
