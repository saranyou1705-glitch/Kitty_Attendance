const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ts=require(process.env.TYPESCRIPT_MODULE||'typescript');
function compile(file,requireFn){
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(__dirname+'/'+file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:requireFn,URL,Response,Request,fetch,Error});
 return exports;
}
const gateway=compile('live-gateway.ts',()=>{throw Error('unexpected import')});
const {createHandler}=compile('handler.ts',()=>gateway);
function setup(clockEnabled=false){
 const calls=[];const handler=createHandler({url:'https://rlqecfzddxpywbbbiirg.supabase.co',serviceKey:'server-only-test-key',clockEnabled,fetcher:async(url,options)=>{
  calls.push({url:String(url),options});
  if(String(url).includes('api.line.me'))return Response.json({userId:'verified'});
  if(String(url).includes('/rpc/'))return Response.json({ok:true,role:'EMPLOYEE'});
  return Response.json({ok:true,employee:{active:true}});
 }});return {handler,calls};
}
const body={eventType:'IN',latitude:13,longitude:100,gpsAccuracy:10};
function req(action,payload=body,origin='https://saranyou1705-glitch.github.io'){
 return new Request('https://app.test/?action='+action,{method:'POST',headers:{origin,'Content-Type':'application/json','x-line-access-token':'caller-token'},body:JSON.stringify(payload)});
}
test('production clock gate denies recording by default without sending a record upstream',async()=>{
 const {handler,calls}=setup();const r=await handler(req('record'));assert.equal((await r.json()).error,'PRODUCTION_CLOCK_NOT_ENABLED');
 assert.equal(calls.filter(c=>c.url.endsWith('action=record')).length,0);
});
test('enabled clock passes caller token but never service key to original attendance service',async()=>{
 const {handler,calls}=setup(true);assert.equal((await handler(req('record'))).status,200);
 const record=calls.find(c=>c.url.endsWith('action=record'));assert.equal(record.options.headers['x-line-access-token'],'caller-token');
 assert(!JSON.stringify(record.options).includes('server-only-test-key'));
});
test('unapproved origin and malformed body produce no upstream requests',async()=>{
 const {handler,calls}=setup();assert.equal((await handler(req('bootstrap',{},'https://evil.test'))).status,403);
 assert.equal((await handler(req('bootstrap',[]))).status,400);assert.equal(calls.length,0);
});
test('service errors are not exposed to browser',async()=>{
 const handler=createHandler({url:'https://rlqecfzddxpywbbbiirg.supabase.co',serviceKey:'private-key',clockEnabled:false,fetcher:async()=>{throw Error('private-key internal SQL')}});
 const r=await handler(req('bootstrap',{}));assert.equal(r.status,503);assert.deepEqual(await r.json(),{ok:false,error:'SERVICE_UNAVAILABLE'});
});
