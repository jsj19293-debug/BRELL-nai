'use strict';
// An owned outer worker makes cancellation possible even while the public
// Tesseract createWorker() promise is still downloading/initializing its child.
importScripts('ocr-vendor/tesseract.min.js');
let engine=null,busy=false;
self.onmessage=async event=>{
 const {id,type,language,direction,bytes}=event.data||{};
 if(busy)return;busy=true;
 const send=(kind,data={})=>self.postMessage({id,type:kind,...data});
 try{
  if(type==='init'){
   if(!['eng','jpn+eng','jpn_vert+eng','kor+eng'].includes(language))throw Error('지원하지 않는 OCR 언어입니다.');
   engine=await Tesseract.createWorker(language,1,{workerPath:new URL('ocr-vendor/worker.min.js',self.location.href).href,corePath:new URL('ocr-vendor/core/',self.location.href).href,langPath:new URL('ocr-vendor/lang/',self.location.href).href,workerBlobURL:false,cachePath:'balloon-ocr-best-v1',logger:p=>send('progress',{status:p.status,progress:p.progress})});
   await engine.setParameters({tessedit_pageseg_mode:direction==='vertical'?'5':'6',user_defined_dpi:'300'});send('ready');
  }else if(type==='recognize'){
   if(!engine||!(bytes instanceof ArrayBuffer)||bytes.byteLength>16000000)throw Error('인식할 이미지가 올바르지 않습니다.');
   const {data}=await engine.recognize(new Uint8Array(bytes),{},{text:true});send('result',{text:String(data.text||'').slice(0,20000),confidence:Number(data.confidence)||0});
  }else throw Error('지원하지 않는 OCR 작업입니다.');
 }catch(error){send('error',{message:String(error.message||error).slice(0,300)});}
 finally{busy=false;}
};
