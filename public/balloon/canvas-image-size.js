'use strict';
let canvasCustomDoc=null,canvasCustomDimensions='';
function canvasPhotoSize(image){
 const w=image?.naturalWidth||image?.width,h=image?.naturalHeight||image?.height;
 return Number.isInteger(w)&&Number.isInteger(h)&&w>0&&h>0&&w<=16000&&h<=30000&&w*h<=40000000?{w,h}:null;
}
function canvasSizePhoto(){
 const photo=l=>l?.media?postMediaImages.get(l.id):l?.src&&l.kind!=='gameui'?imageLayerImages.get(l.id):null;
 const selectedLayer=currentImageLayer();
 if(selectedLayer)return photo(selectedLayer);
 return bg||photo([...(state.imageLayers||[])].reverse().find(l=>l.visible!==false&&photo(l)));
}
function templatePhotoSizeLines(layer){
 if(!layer||layer.visible===false)return [];
 const rect=imageLayerRect(layer),view={...layer,...rect};
 const info=layer.kind==='camera'?cameraPhotoSlots(view):layer.kind==='snsprofile'?snsProfilePhotoSlots(view):null;
 if(!info)return [];
 return info.slots.map(({label,box})=>`${label} 영역 권장 ${Math.max(1,Math.round(box.w*rect.w/info.w))} × ${Math.max(1,Math.round(box.h*rect.h/info.h))} px`);
}
function canvasSizeReadoutText(size){
 const layer=currentImageLayer(),lines=[`캔버스 ${state.width} × ${state.height} px${size?` · ${layer?'선택 이미지 원본':'원본 이미지'} ${size.w} × ${size.h} px`:''}`];
 const panel=layer?(layer.panelId?panelForLayer(layer):null):typeof panelEditMode!=='undefined'&&panelEditMode&&!(typeof current==='function'&&current())?currentPanel():null;
 const pixels=o=>Number.isFinite(o?.w)&&Number.isFinite(o?.h)&&o.w>0&&o.h>0?`${Math.max(1,Math.round(o.w))} × ${Math.max(1,Math.round(o.h))} px`:null;
 if(panel){const value=pixels(panel.shape==='full'?{w:state.width,h:state.height}:panel);if(value)lines.push(`선택 프레임 현재 ${value}`)}
 if(layer){const value=pixels(imageLayerRect(layer));if(value)lines.push(`선택 ${['camera','snsprofile'].includes(layer.kind)?'템플릿':'이미지'} 현재 ${value}`)}
 lines.push(...templatePhotoSizeLines(layer));
 return lines.join('\n');
}
function syncCanvasImageSize(){
 if(typeof syncPanelLayoutLock==='function')syncPanelLayoutLock();
 const dimensions=state.width+'x'+state.height;
 if(canvasCustomDoc!==state||canvasCustomDimensions!==dimensions){canvasCustomDoc=state;canvasCustomDimensions=dimensions;if($('canvasCustomWidth'))$('canvasCustomWidth').value=state.width;if($('canvasCustomHeight'))$('canvasCustomHeight').value=state.height;}
 if($('canvasCustomApply'))$('canvasCustomApply').disabled=projectBusy;
 const button=$('canvasImageSize');if(!button)return;
 const label=state.width===state.height?'정사각':state.width>state.height?'가로':'세로',size=canvasPhotoSize(canvasSizePhoto());
 button.textContent=label;
 button.title=`${label} ${state.width} × ${state.height}px · ${size?`이미지 ${size.w} × ${size.h}px로 맞추기`:'사진을 넣고 눌러 해상도 맞추기'}`;
 button.setAttribute('aria-label',button.title);
 const stage=$('canvasStage');if(stage)stage.style.width=state.width*zoom+'px';
 const readout=$('canvasSizeReadout');if(readout){const text=canvasSizeReadoutText(size);if(readout.textContent!==text)readout.textContent=text;}

}
function matchCanvasToPhoto(image,record=true){
 if(projectBusy)return false;
 const size=canvasPhotoSize(image);if(!size){status('먼저 사진을 넣거나 해상도를 맞출 이미지 레이어를 선택해줘.');return false;}
 const {w,h}=size;if(w===state.width&&h===state.height){if(record)status('이미 이미지 해상도와 같아.');return false;}
 if(!canResizeComicPanels(w,h)){status('이미지 해상도가 작아서 기존 컷을 유지할 수 없어. 더 큰 사진을 넣어줘.');return false;}
 const direction=w===h?'정사각형':w>h?'가로':'세로';
 if(!confirm(`캔버스를 넣은 이미지에 맞춰 ${w} × ${h}px (${direction})로 정말 변경할까요?\n현재 크기: ${state.width} × ${state.height}px\n고정 프레임은 새 화면에 맞춰지고, 나머지 그림과 글자는 비율을 유지해 재배치됩니다.\n되돌리기로 복원할 수 있어요.`))return false;
 const prepared=prepareComicResize(w,h);if(record)checkpoint();
 cancelRetouch();drag=null;emptyPhotoPress=null;
 if(typeof setProtrusionMode==='function')setProtrusionMode(null);
 resizeComicPage(w,h,prepared);sync();
 status(`이미지에 맞춰 ${w} × ${h}px (${direction})로 변경했어.`);return true;
}
function offerImageCanvasSize(layer,image){
 if(layer?.locked&&state.imageLayers?.includes(layer))return matchCanvasToPhoto(image,false);
 return false;
}
function applyCustomCanvasSize(){
 if(projectBusy)return false;
 const w=Number($('canvasCustomWidth').value),h=Number($('canvasCustomHeight').value);
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<40||w>16000||h<40||h>30000||w*h>40000000){status('너비 40~16,000px, 높이 40~30,000px, 전체 4,000만 픽셀 이하의 정수로 입력해줘.');return false;}
 if(w===state.width&&h===state.height){status('이미 같은 캔버스 크기야.');return false;}
 if(!canResizeComicPanels(w,h)){status('기존 컷이 너무 작아져. 캔버스 크기를 늘리거나 컷을 조절해줘.');return false;}
 try{const prepared=prepareComicResize(w,h);checkpoint();cancelRetouch();drag=null;emptyPhotoPress=null;
 if(typeof setProtrusionMode==='function')setProtrusionMode(null);
 resizeComicPage(w,h,prepared);sync();status(`캔버스를 ${w} × ${h}px로 변경했어. 프레임은 새 화면에 맞추고 사진과 글자의 비율은 유지돼.`);return true;
 }catch(e){status(e.message||'캔버스 크기를 변경하지 못했어.');return false;}
}
function initCanvasImageSize(){
 if($('canvasCustomApply'))$('canvasCustomApply').onclick=applyCustomCanvasSize;
 for(const id of ['canvasCustomWidth','canvasCustomHeight'])if($(id))$(id).onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();applyCustomCanvasSize()}};
 $('canvasImageSize').onclick=()=>matchCanvasToPhoto(canvasSizePhoto());syncCanvasImageSize();
}
