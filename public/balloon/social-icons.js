'use strict';
// Official Google Material Icons, served locally with the editor.
const SOCIAL_ICON_GLYPHS={comment:'\ue0cb',send:'\ue163',share:'\ue80d',upload:'\ue6b8',heart:'\ue87e',heartFilled:'\ue87d',bookmark:'\ue867'};
const socialIconFaces=new Map();
let socialIconPending=null,socialIconVersion=0;
function socialIconRevision(){return socialIconVersion}
function ensureSocialIconFonts(){
 if(socialIconPending)return socialIconPending;
 for(const [style,file]of [['outlined','MaterialIconsOutlined-Regular.otf'],['regular','MaterialIcons-Regular.ttf']]){
  const face=new FontFace('Studio Material '+style,`url(fonts/material-icons/${file})`,{style:'normal',weight:'400'});
  document.fonts.add(face);socialIconFaces.set(style,face);
 }
 socialIconPending=Promise.all([...socialIconFaces.values()].map(face=>face.load())).then(()=>{
  socialIconVersion++;postCardCache.clear();if(typeof streamCache!=='undefined')streamCache.clear();render();return true;
 }).catch(()=>false); // Keep the existing vector fallback if a font cannot load.
 return socialIconPending;
}
function drawMaterialIcon(c,name,x,y,size,color,style='outlined'){
 const face=socialIconFaces.get(style),glyph=SOCIAL_ICON_GLYPHS[name];
 if(!glyph||face?.status!=='loaded')return false;
 c.save();c.font=`400 ${size}px "Studio Material ${style}"`;c.fillStyle=color;c.textAlign='left';c.textBaseline='alphabetic';
 // Position the actual glyph ink within its square, independent of font baselines.
 const m=c.measureText(glyph),left=m.actualBoundingBoxLeft||0,right=m.actualBoundingBoxRight??size;
 const ascent=m.actualBoundingBoxAscent??size*.8,descent=m.actualBoundingBoxDescent||0;
 c.fillText(glyph,x+(size-left-right)/2+left,y+(size-ascent-descent)/2+ascent);c.restore();return true;
}
