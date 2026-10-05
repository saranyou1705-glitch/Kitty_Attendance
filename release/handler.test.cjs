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
test('monthly schedule read is own-employee scoped, includes future days and rolls December into January',async()=>{
 const calls=[];let fail=false;
 const handler=createHandler({url:'https://rlqecfzddxpywbbbiirg.supabase.co',serviceKey:'key',clockEnabled:true,fetcher:async(url,opt)=>{
  const u=String(url);calls.push(u);
  if(u.includes('api.line.me'))return Response.json({userId:'verified-self'});
  if(u.includes('/rpc/'))return Response.json({ok:true,role:'EMPLOYEE'});
  if(u.includes('/rest/v1/employees?'))return Response.json([{id:'self-id'}]);
  if(u.includes('/rest/v1/employee_schedules?'))return fail?Response.json({}, {status:503}):Response.json([{work_date:'2026-12-31',schedule_status:'WORK',required_hours:9}]);
  return Response.json({ok:true,month:'2026-12',rows:[]});
 }});
 const result=await (await handler(req('employee_month',{month:'2026-12'}))).json();
 assert.equal(result.rows[0].work_date,'2026-12-31');assert.equal(result.rows[0].first_in_at,undefined);
 const url=calls.find(u=>u.includes('/employee_schedules?'));assert(url.includes('employee_id=eq.self-id'));assert(url.includes('work_date=gte.2026-12-01'));assert(url.includes('work_date=lt.2027-01-01'));assert(!url.includes('work_date=lte.'));
 assert(calls.some(u=>u.includes('line_user_id=eq.verified-self')));
 fail=true;assert.equal((await handler(req('employee_month',{month:'2026-12'}))).status,503);
});
test('Driver shift lookup scopes real events to verified employee and ignores break events',async()=>{
 let closed=false;const reads=[];
 const handler=createHandler({url:'https://rlqecfzddxpywbbbiirg.supabase.co',serviceKey:'key',clockEnabled:true,fetcher:async(url,opt)=>{
  const u=String(url);reads.push(u);
  if(u.includes('api.line.me'))return Response.json({userId:'verified-driver'});
  if(u.includes('/rpc/'))return Response.json({ok:true,role:'EMPLOYEE'});
  if(u.includes('/rest/v1/employees?'))return Response.json([{id:'own-id',active:true,attendance_mode:'DRIVER'}]);
  if(u.includes('/rest/v1/attendance_events?'))return Response.json([{event_type:closed?'OUT':'IN',work_date:'2026-10-04',event_at:'2026-10-04T10:00:00Z'}]);
  const p=JSON.parse(opt.body);return Response.json({ok:true,employee:{active:true,attendance_mode:'DRIVER'},events:[],date:p.date});
 }});
 let result=await (await handler(req('today',{date:'2026-10-05',activeShift:true}))).json();assert.equal(result.workDate,'2026-10-04');assert.equal(result.date,'2026-10-04');
 assert(reads.some(u=>u.includes('line_user_id=eq.verified-driver')));assert(reads.some(u=>u.includes('employee_id=eq.own-id&event_type=in.(IN,OUT)')));
 closed=true;result=await (await handler(req('today',{date:'2026-10-05',activeShift:true}))).json();assert.notEqual(result.workDate,'2026-10-04');
});
test('employee actions call fixed production RPC using verified LINE identity',async()=>{
 const {handler,calls}=setup();
 for(const action of ['live_employee_activate','live_employee_office'])assert.equal((await handler(req(action,{employeeId:'example'}))).status,200);
 const rpc=calls.filter(c=>c.url.includes('/rpc/'));
 assert.equal(rpc.length,2);assert(rpc[0].url.endsWith('/kitty_live_activate_employee'));assert(rpc[1].url.endsWith('/kitty_live_employee_office'));
 for(const call of rpc)assert.equal(JSON.parse(call.options.body).actor,'verified');
 assert.equal((await handler(req('live_employee_delete',{}))).status,400);
});
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
