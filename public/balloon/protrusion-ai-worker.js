// Runs off the editor thread. Images are processed locally; only model assets are fetched.
let model=null,runtime=null,modelDevice=null;
self.onmessage=async({data})=>{
 const {src}=data;
 try{
  self.postMessage({type:'progress',text:'자동 선택 준비 중… 처음에는 모델을 내려받아요.'});
  runtime??=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js');
  runtime.env.allowLocalModels=false;runtime.env.backends.onnx.wasm.numThreads=1;
  const progress_callback=p=>{if(p.status==='progress')self.postMessage({type:'progress',text:'모델 내려받는 중 · '+Math.round(p.progress||0)+'%'})};
  if(!model){let device='wasm';try{if(self.navigator.gpu&&await self.navigator.gpu.requestAdapter())device='webgpu'}catch{}
   modelDevice=device;try{model=await runtime.pipeline('background-removal','Xenova/modnet',{device,dtype:device==='webgpu'?'fp32':'q8',progress_callback});}
   catch(err){if(device!=='webgpu')throw err;modelDevice='wasm';model=await runtime.pipeline('background-removal','Xenova/modnet',{device:'wasm',dtype:'q8',progress_callback});}
  }
  const start=performance.now();self.postMessage({type:'progress',text:'캐릭터 영역 분석 중…'});
  let image=await runtime.RawImage.read(src);if(Math.max(image.width,image.height)>1024){const scale=1024/Math.max(image.width,image.height);image=await image.resize(Math.round(image.width*scale),Math.round(image.height*scale));}
  let output;try{output=await model(image);}catch(error){if(modelDevice!=='webgpu')throw error;self.postMessage({type:'progress',text:'GPU 실행이 어려워 CPU로 다시 시도 중…'});await model.dispose();modelDevice='wasm';model=await runtime.pipeline('background-removal','Xenova/modnet',{device:'wasm',dtype:'q8',progress_callback});output=await model(image);}const [result]=output;if(result.channels!==4)throw Error('선택 결과를 만들지 못했습니다.');
  const pixels=new Uint8ClampedArray(result.width*result.height*4);let selected=0;
  for(let i=0;i<pixels.length;i+=4){const alpha=result.data[i+3]>=128?255:0;pixels[i]=pixels[i+1]=pixels[i+2]=255;pixels[i+3]=alpha;selected+=alpha?1:0;}
  if(!selected)throw Error('캐릭터를 찾지 못했어요. 브러시로 선택해주세요.');
  self.postMessage({type:'result',width:result.width,height:result.height,pixels:pixels.buffer,seconds:(performance.now()-start)/1000},[pixels.buffer]);
 }catch(error){self.postMessage({type:'error',text:error.message||'자동 선택에 실패했어요.'});}
};
