const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const PORT=38219;
const base=`http://127.0.0.1:${PORT}`;
async function poll(url,init){const r=await fetch(base+url,init);return {r,data:await r.json()};}
test('autenticación, consulta, órdenes y confirmación del dispositivo',async()=>{
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(PORT),ADMIN_PASSWORD:'SuperSecretPassword1234',SESSION_SECRET:'s'.repeat(48),DEVICE_TOKEN:'t'.repeat(48)},stdio:['ignore','pipe','pipe']});
 try{
  let started=false;for(let i=0;i<50;i++){if(proc.exitCode!==null)throw Error('Server stopped');try{const v=await poll('/health');if(v.data.ok){started=true;break;}}catch{} await new Promise(r=>setTimeout(r,50));} assert.equal(started,true);
  let v=await poll('/api/state');assert.equal(v.r.status,401);
  v=await poll('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'incorrect'})});assert.equal(v.r.status,401);
  v=await poll('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'SuperSecretPassword1234'})});assert.equal(v.r.status,200);
  const cookie=v.r.headers.get('set-cookie').split(';')[0];
  v=await poll('/api/command',{method:'POST',headers:{'Content-Type':'application/json','Cookie':cookie},body:JSON.stringify({type:'led',index:0,on:true})});assert.equal(v.r.status,409);
  v=await poll('/api/device/poll',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+('t'.repeat(48))},body:JSON.stringify({ack:0,state:{leds:[false,false,false,false,false],armed:false,fan:0,motor:0,songCount:4}})});assert.equal(v.r.status,200);
  v=await poll('/api/command',{method:'POST',headers:{'Content-Type':'application/json','Cookie':cookie},body:JSON.stringify({type:'motor',direction:1,speed:210})});assert.equal(v.r.status,403);
  v=await poll('/api/command',{method:'POST',headers:{'Content-Type':'application/json','Cookie':cookie},body:JSON.stringify({type:'led',index:0,on:true})});assert.equal(v.r.status,202);const id=v.data.id;
  v=await poll('/api/device/poll',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+('t'.repeat(48))},body:JSON.stringify({ack:0,state:{leds:[false,false,false,false,false],armed:true,motor:0,fan:0,songCount:4}})});assert.equal(v.data.command.type,'led');assert.equal(v.data.command.id,id);
  v=await poll('/api/device/poll',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+('t'.repeat(48))},body:JSON.stringify({ack:id,state:{leds:[true,false,false,false,false],armed:true,motor:0,fan:0,songCount:4}})});assert.equal(v.data.command,null);
  v=await poll('/api/command',{method:'POST',headers:{'Content-Type':'application/json','Cookie':cookie},body:JSON.stringify({type:'motor',direction:1,speed:210})});assert.equal(v.r.status,202);
  v=await poll('/api/state',{headers:{'Cookie':cookie}});assert.equal(v.data.state.leds[0],true);assert.equal(v.data.online,true);
 }finally{proc.kill('SIGTERM');}
});
