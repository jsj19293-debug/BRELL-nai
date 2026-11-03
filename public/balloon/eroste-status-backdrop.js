'use strict';
function drawErosteStatusBackdrop(c,ref){
 c.save();c.fillStyle='#fafafa';c.fillRect(0,0,1536,864);
 const line=(points,color='#d5d5d5',width=1)=>{c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=color;c.lineWidth=width;c.stroke()};
 const box=(x,y,w,h)=>{c.strokeStyle='#d5d5d5';c.lineWidth=1;c.strokeRect(x,y,w,h)};
 const polygon=(points,color)=>{c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=color;c.fill()};
 const crop=(x,y,w,h)=>{if(ref)c.drawImage(ref,x,y,w,h,x,y,w,h)};
 // Copy only isolated pictograms. No source lettering is drawn.
 box(351,50,381,814);crop(1380,15,35,40);crop(44,745,50,55);
 for(let i=0;i<10;i++)crop(43,141+i*22.2,17,19);
 for(let i=0;i<6;i++)crop(771,112+i*33,22,24);
 for(let i=0;i<5;i++)crop(772,372+i*29.5,22,23);
 for(let i=0;i<5;i++)crop(767,578+i*48,23,23);
 for(let i=0;i<12;i++)crop(1294,127+i*31.5,23,23);
 polygon([[267,0],[423,0],[393,48],[236,48]],'#08080d');
 polygon([[756,65],[891,65],[913,93],[756,93]],'#08080d');
 line([[0,48],[1536,48]]);line([[44,133],[327,133]]);
 for(const y of [331,531])line([[755,y],[1258,y]]);
 for(const [x,y,w,h]of [[23,372,309,161],[23,543,309,143],[23,698,309,124],[752,531,504,308],[1283,72,232,438],[1283,521,232,289]])box(x,y,w,h);
 line([[953,541],[953,839]]);line([[974,776],[1243,776]]);line([[1298,110],[1503,110]]);
 for(const points of [[[1039,598],[1049,598],[1062,621]],[[1184,598],[1174,598],[1150,626]],[[1038,715],[1048,715],[1062,701]],[[1183,715],[1172,715],[1152,700]]])line(points,'#d5d5d5');
 const key=(text,x,y,w,h,color='#777')=>{c.strokeStyle=color;c.lineWidth=1.5;c.beginPath();c.roundRect(x,y,w,h,4);c.stroke();c.fillStyle=color;c.font='700 11px "Studio Messenger",sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(text,x+w/2,y+h/2,w-4)};
 key('LB',22,17,27,15);key('RB',890,17,27,15);
 key('B',1344,835,17,17,'#996777');key('≡',1445,835,17,17);
 c.restore();
}
