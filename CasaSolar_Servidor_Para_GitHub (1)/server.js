'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const PORT = Number(process.env.PORT || 3000);
// Acceso publico solicitado: no se necesitan contrasenas ni tokens para el panel o ESP32.
const base = path.join(__dirname, 'public');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8'};
// Cualquiera puede consultar y enviar ordenes publicas. Mantener siempre supervision local.
let deviceLastSeen = 0;
let deviceState = {};
let pending = null;
let nextId = crypto.randomInt(100000, 1800000000); // Evita reutilizar IDs tras reinicios de Render.
function respond(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(data));}
function readBody(req){return new Promise((resolve,reject)=>{let chunks='';req.on('data',x=>{chunks+=x;if(chunks.length>4096){reject(new Error('Demasiados datos'));req.destroy();}});req.on('end',()=>{try{resolve(JSON.parse(chunks||'{}'));}catch(e){reject(e);}});req.on('error',reject);});}
function validCommand(c){
  if(!c||typeof c!=='object')return false;
  switch(c.type){
    case 'led': return Number.isInteger(c.index)&&c.index>=0&&c.index<5&&typeof c.on==='boolean';
    case 'allLeds': return typeof c.on==='boolean';
    case 'fan': return [0,140,200,255].includes(c.power);
    case 'motor': return [-1,0,1].includes(c.direction)&&[160,210,255].includes(c.speed);
    case 'screen':return typeof c.on==='boolean';
    case 'lcd':return ['fijo','centrado','desplazar','parpadear'].includes(c.mode)&&[150,350,800].includes(c.speed)&&['line1','line2'].every(k=>typeof c[k]==='string'&&c[k].length<=16&&/^[\x20-\x7E]*$/.test(c[k]));
    case 'music':return Number.isInteger(c.song)&&c.song>=0&&c.song<Math.min(999,deviceState.songCount||999)&&[75,100,125].includes(c.tempo)&&typeof c.repeat==='boolean';
    case 'musicStop':case 'allOff':case 'allOn': return true;
    default:return false;
  }
}
const isOnline=()=>Date.now()-deviceLastSeen<15000;
const isDangerous=c=>(c.type==='motor'&&c.direction!==0)||c.type==='allOn';
function rejectCrossOrigin(req,res){const origin=req.headers.origin;const host=req.headers.host;if(origin){try{const u=new URL(origin);if(u.host!==host||!['https:','http:'].includes(u.protocol)){respond(res,403,{error:'Origen no autorizado'});return true;}}catch{respond(res,403,{error:'Origen no autorizado'});return true;}}return false;}
const server=http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
 if(pathname==='/health'){respond(res,200,{ok:true});return;}
 if(pathname==='/api/device/poll'&&req.method==='POST'){
   try{const body=await readBody(req);deviceLastSeen=Date.now();deviceState=body.state&&typeof body.state==='object'?body.state:{};
     if(pending&&Number(body.ack)===pending.id)pending=null;
     if(pending&&pending.expires<Date.now())pending=null;
     respond(res,200,{command:pending?pending.command:null});
   }catch{respond(res,400,{error:'Formato inválido'});}return;
 }
 if(pathname==='/api/state'&&req.method==='GET'){
   respond(res,200,{online:isOnline(),ageSeconds:deviceLastSeen?Math.floor((Date.now()-deviceLastSeen)/1000):null,state:deviceState,commandPending:!!pending});return;
 }
 if(pathname==='/api/command'&&req.method==='POST'){
   if(rejectCrossOrigin(req,res))return;
   if(!isOnline()){respond(res,409,{error:'ESP32 desconectado. No se enviará la orden.'});return;}
   if(pending&&pending.expires<Date.now())pending=null;
   if(pending){respond(res,409,{error:'Hay una orden en proceso. Inténtalo de nuevo.'});return;}
   try{const c=await readBody(req);if(!validCommand(c)){respond(res,400,{error:'Comando inválido'});return;}
     if(isDangerous(c)&&!deviceState.armed){respond(res,403,{error:'Motor remoto no autorizado. Mantén 2 segundos el botón físico del motor para habilitarlo durante 2 minutos.'});return;}
     const id=nextId++; pending={id,command:{...c,id},expires:Date.now()+14000};respond(res,202,{queued:true,id});
   }catch{respond(res,400,{error:'Formato inválido'});}return;
 }
 if(req.method!=='GET'&&req.method!=='HEAD'){respond(res,405,{error:'Método no admitido'});return;}
 const allowed={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css'};
 const filename=allowed[pathname]; if(!filename){respond(res,404,{error:'No encontrado'});return;}
 const file=path.join(base,filename);
 try{const content=fs.readFileSync(file);res.writeHead(200,{'Content-Type':types[path.extname(filename)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:content);}
 catch{respond(res,500,{error:'Error interno'});}
});
server.listen(PORT,'0.0.0.0',()=>console.log('Casa Solar en puerto '+PORT));
