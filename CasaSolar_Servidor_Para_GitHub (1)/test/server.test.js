const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const PORT=38219;
const base=`http://127.0.0.1:${PORT}`;
async function poll(url,init){const r=await fetch(base+url,init);return {r,data:await r.json()};}
test('acceso publico sin clave, ordenes y proteccion fisica del motor',async()=>{
 const env={...process.env,PORT:String(PORT)};
 delete env.ADMIN_PASSWORD;delete env.SESSION_SECRET;delete env.DEVICE_TOKEN;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env,stdio:['ignore','pipe','pipe']});
 try{
  let started=false;
  for(let i=0;i<100;i++){if(proc.exitCode!==null)throw Error('Server stopped');try{const v=await poll('/health');if(v.data.ok){started=true;break;}}catch{} await new Promise(r=>setTimeout(r,50));}
  assert.equal(started,true);
  let v=await poll('/api/state');assert.equal(v.r.status,200);assert.equal(v.data.online,false);
  v=await poll('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'led',index:0,on:true})});assert.equal(v.r.status,409);
  v=await poll('/api/device/poll',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ack:0,state:{leds:[false,false,false,false,false],armed:false,fan:0,motor:0,songCount:4}})});assert.equal(v.r.status,200);
  v=await poll('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'motor',direction:1,speed:210})});assert.equal(v.r.status,403);
  v=await poll('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'led',index:0,on:true})});assert.equal(v.r.status,202);const id=v.data.id;
  v=await poll('/api/device/poll',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ack:0,state:{leds:[false,false,false,false,false],armed:true,motor:0,fan:0,songCount:4}})});assert.equal(v.data.command.type,'led');assert.equal(v.data.command.id,id);
  v=await poll('/api/device/poll',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ack:id,state:{leds:[true,false,false,false,false],armed:true,motor:0,fan:0,songCount:4}})});assert.equal(v.data.command,null);
  v=await poll('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'motor',direction:1,speed:210})});assert.equal(v.r.status,202);
  v=await poll('/api/state');assert.equal(v.data.state.leds[0],true);assert.equal(v.data.online,true);
  v=await fetch(base+'/');assert.equal(v.status,200);const html=await v.text();assert.equal(html.includes('loginForm'),false);
 }finally{proc.kill('SIGTERM');}
});
