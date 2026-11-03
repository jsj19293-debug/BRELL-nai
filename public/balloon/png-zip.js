'use strict';
// PNG is already compressed. ZIP STORE avoids a second full-size compression
// buffer. Only one small CRC chunk is read into JS memory at a time.
const pngZipCRC=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
const PNG_ZIP_LIMIT=0xffffffff;
function zipBytes(size,fill){const out=new Uint8Array(size);fill(new DataView(out.buffer));return out}
async function pngCRC32(blob,check){let crc=0xffffffff;for(let offset=0;offset<blob.size;offset+=1024*1024){check?.();const chunk=new Uint8Array(await blob.slice(offset,offset+1024*1024).arrayBuffer());for(const byte of chunk)crc=(crc>>>8)^pngZipCRC[(crc^byte)&255]}check?.();return (crc^0xffffffff)>>>0}
class PNGProjectZip{
 constructor(){this.parts=[];this.entries=[];this.offset=0;this.closed=false;const d=new Date();this.time=(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1);this.date=((Math.max(1980,Math.min(2107,d.getFullYear()))-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate()}
 async add(name,blob,check){
  if(this.closed)throw Error('이미 완료된 ZIP입니다.');const bytes=new TextEncoder().encode(name);
  if(!bytes.length||bytes.length>65535||blob.size>=PNG_ZIP_LIMIT||this.offset+blob.size+bytes.length+30>=PNG_ZIP_LIMIT)throw Error('ZIP 용량이 너무 큽니다. 프로젝트를 나눠 내보내주세요.');
  const crc=await pngCRC32(blob,check),size=blob.size,offset=this.offset;
  const header=zipBytes(30,v=>{v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x0800,true);v.setUint16(8,0,true);v.setUint16(10,this.time,true);v.setUint16(12,this.date,true);v.setUint32(14,crc,true);v.setUint32(18,size,true);v.setUint32(22,size,true);v.setUint16(26,bytes.length,true)});
  this.parts.push(header,bytes,blob);this.entries.push({bytes,crc,size,offset});this.offset+=30+bytes.length+size;
 }
 finish(){
  if(this.closed)throw Error('이미 완료된 ZIP입니다.');const start=this.offset,central=[];
  if(this.entries.length>65535)throw Error('ZIP 파일 수가 너무 많습니다.');
  for(const e of this.entries){const header=zipBytes(46,v=>{v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x0800,true);v.setUint16(10,0,true);v.setUint16(12,this.time,true);v.setUint16(14,this.date,true);v.setUint32(16,e.crc,true);v.setUint32(20,e.size,true);v.setUint32(24,e.size,true);v.setUint16(28,e.bytes.length,true);v.setUint32(42,e.offset,true)});central.push(header,e.bytes);this.offset+=46+e.bytes.length}
  if(this.offset+22>=PNG_ZIP_LIMIT)throw Error('ZIP 용량이 너무 큽니다. 프로젝트를 나눠 내보내주세요.');
  const count=this.entries.length,end=zipBytes(22,v=>{v.setUint32(0,0x06054b50,true);v.setUint16(8,count,true);v.setUint16(10,count,true);v.setUint32(12,this.offset-start,true);v.setUint32(16,start,true)});
  const blob=new Blob([...this.parts,...central,end],{type:'application/zip'});this.dispose();return blob;
 }
 dispose(){this.closed=true;this.parts=[];this.entries=[]}
}
function exportSafeName(value,fallback='만화'){
 let name=String(value||'').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g,'_').trim().replace(/[. ]+$/g,'');if(!name)name=fallback;
 const encoder=new TextEncoder();while(encoder.encode(name).length>160)name=Array.from(name).slice(0,-1).join('');return name;
}
