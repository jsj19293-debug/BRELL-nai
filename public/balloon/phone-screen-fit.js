'use strict';
// A local, single-tap edge search. This only reads the source picture, never the
// overlaid SNS card, and returns no geometry unless all four edges are supported.
function detectPhoneScreen(image, tap, canvasWidth, canvasHeight) {
  if (!image || !canvasWidth || !canvasHeight) return null;
  const scale=Math.min(1,500/Math.max(canvasWidth,canvasHeight));
  const w=Math.max(1,Math.round(canvasWidth*scale)),h=Math.max(1,Math.round(canvasHeight*scale));
  const work=document.createElement('canvas');work.width=w;work.height=h;
  const ctx=work.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(image,0,0,w,h);
  let pixels;try{pixels=ctx.getImageData(0,0,w,h).data}catch{return null}
  const gray=new Float32Array(w*h),edge=new Float32Array(w*h),tx=tap.x*scale,ty=tap.y*scale;
  for(let i=0,j=0;i<gray.length;i++,j+=4)gray[i]=.299*pixels[j]+.587*pixels[j+1]+.114*pixels[j+2];
  let sum=0,count=0;
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const i=y*w+x,dx=gray[i+1]-gray[i-1],dy=gray[i+w]-gray[i-w];
    edge[i]=Math.hypot(dx,dy);sum+=edge[i];count++;
  }
  const mean=sum/Math.max(1,count);if(mean<1)return null;
  const sample=(x,y)=>{const ix=Math.round(x),iy=Math.round(y);return ix<2||iy<2||ix>=w-2||iy>=h-2?0:edge[iy*w+ix]};
  const minSide=12,maxSide=Math.min(w,h)*.58;
  let best=null;
  // The tap is allowed to miss the geometric centre by up to 15%.
  for(let deg=-85;deg<=85;deg+=5){const a=deg*Math.PI/180,ux=Math.cos(a),uy=Math.sin(a),vx=-uy,vy=ux;
    for(const side of [18,25,35,48,66,90,125,150,170,190,200,210,230,260,310]){
      if(side<minSide||side>maxSide)continue;
      for(const ratio of [.4,.5,.58,.67,.75,1,1.35,1.7,2,2.4]){
        const halfW=side/2,halfH=side*ratio/2;
        if(halfH<minSide/2||halfH>maxSide/2)continue;
        for(const shiftU of [-.12,0,.12])for(const shiftV of [-.12,0,.12]){
          const cx=tx+ux*side*shiftU+vx*side*ratio*shiftV,cy=ty+uy*side*shiftU+vy*side*ratio*shiftV;
          let totals=[0,0,0,0],hits=[0,0,0,0];
          for(let k=0;k<12;k++){
            const t=(k+.5)/12*1.7-.85;
            for(let j=0;j<4;j++){
              const u=j<2?t*halfW:(j===2?halfW:-halfW),v=j<2?(j===0?-halfH:halfH):t*halfH;
              let e=0;for(let d=-3;d<=3;d+=3){const px=cx+ux*(u+(j<2?0:d))+vx*(v+(j<2?d:0)),py=cy+uy*(u+(j<2?0:d))+vy*(v+(j<2?d:0));e=Math.max(e,sample(px,py))}
              totals[j]+=Math.min(e,120);if(e>Math.max(25,mean*1.7))hits[j]++;
            }
          }
          const strengths=totals.map(v=>v/18),coverage=hits.map(v=>v/18);
          const score=strengths.reduce((a,b)=>a+b,0)/4*Math.min(...coverage)**.6;
          if(!best||score>best.score)best={score,strengths,coverage,cx,cy,halfW,halfH,ux,uy,vx,vy};
        }
      }
    }
  }
  if(!best||best.score<Math.max(22,mean*1.25)||Math.min(...best.coverage)<.39||Math.min(...best.strengths)<Math.max(24,mean*1.35))return null;
  // Fit each border independently, then intersect the lines. This preserves mild perspective.
  const {cx,cy,ux,uy,vx,vy,halfW,halfH}=best;
  function border(normal,base,along,extent){const points=[];for(let k=0;k<22;k++){
    const t=(k+.5)/22*1.72- .86,alongPos=t*extent;
    let peak=-1,offset=0;
    for(let d=-Math.min(7,extent*.12);d<=Math.min(7,extent*.12);d+=1){
      const px=cx+base.x+along.x*alongPos+normal.x*d,py=cy+base.y+along.y*alongPos+normal.y*d,e=sample(px,py);
      if(e>peak){peak=e;offset=d}
    }
    if(peak>Math.max(24,mean*1.6))points.push({t:alongPos,d:offset,weight:Math.min(peak,120)});
  }let sw=0,st=0,sd=0,stt=0,std=0;for(const p of points){sw+=p.weight;st+=p.t*p.weight;sd+=p.d*p.weight;stt+=p.t*p.t*p.weight;std+=p.t*p.d*p.weight}
    const slope=(std-st*sd/sw)/(stt-st*st/sw||1),intercept=(sd-slope*st)/sw;
    return points.length<8?null:{slope,intercept};}
  const top=border({x:vx,y:vy},{x:-vx*halfH,y:-vy*halfH},{x:ux,y:uy},halfW),bottom=border({x:vx,y:vy},{x:vx*halfH,y:vy*halfH},{x:ux,y:uy},halfW),left=border({x:ux,y:uy},{x:-ux*halfW,y:-uy*halfW},{x:vx,y:vy},halfH),right=border({x:ux,y:uy},{x:ux*halfW,y:uy*halfW},{x:vx,y:vy},halfH);
  if(!top||!bottom||!left||!right)return null;
  function corner(horizontal,vertical,hs,vs){let u=hs*halfW,v=vs*halfH;
    for(let i=0;i<4;i++){v=vs*halfH+horizontal.intercept+horizontal.slope*u;u=hs*halfW+vertical.intercept+vertical.slope*v}
    return{x:(cx+ux*u+vx*v)/scale,y:(cy+uy*u+vy*v)/scale};}
  return [corner(top,left,-1,-1),corner(top,right,1,-1),corner(bottom,right,1,1),corner(bottom,left,-1,1)];
}
