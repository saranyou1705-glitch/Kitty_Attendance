const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ts=require(process.env.TYPESCRIPT_MODULE||'typescript');
const source=ts.transpileModule(fs.readFileSync(__dirname+'/live-gateway.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const ctx={exports:{}};vm.runInNewContext(source,ctx);const {createGateway}=ctx.exports;
function setup(role='EMPLOYEE',extra={}){
 const calls=[];const handle=createGateway({
  verifyLine:async()=>({userId:'verified-line'}),
  access:async(...args)=>{calls.push(['access',...args]);return {ok:true,role}},
  legacy:async(...args)=>{calls.push(['legacy',...args]);return {ok:true,employee:{active:true},isAdmin:true}},
  ...extra
 });return {handle,calls};
}
test('HR membership never inherits legacy admin flags',async()=>{
 const {handle}=setup('EMPLOYEE');assert.equal((await handle('token','bootstrap')).isAdmin,false);
 const hr=setup('HR');assert.equal((await hr.handle('token','bootstrap')).adminRole,'HR');
});
test('verified LINE identity is authoritative for registration and approval',async()=>{
 const {handle,calls}=setup();await handle('token','hr_register',{name:'HR',actor:'forged'});
 assert.equal(calls[0][1],'verified-line');assert.equal(calls[0][2],'register');
});
test('HR cannot proxy privileged legacy methods or arbitrary actions',async()=>{
 for(const role of ['HR','EMPLOYEE','ADMIN']){
  const {handle,calls}=setup(role);
  for(const action of ['admin_report_send','admin_update_event','admin_bootstrap','cron_report_send','constructor','toString'])
   await assert.rejects(handle('token',action,{}),/ACTION_NOT_CONNECTED/);
  assert.equal(calls.filter(c=>c[0]==='legacy').length,0);
 }
});
test('own reads reject employee overrides',async()=>{
 const {handle}=setup();await assert.rejects(handle('token','today',{employeeId:'other'}),/INVALID_FIELDS/);
 await handle('token','today',{date:'2026-09-24'});
});
const payload={eventType:'IN',eventAt:'2026-09-24T02:00:00Z',workDate:'2026-09-24',latitude:13,longitude:100,gpsAccuracy:10};
test('valid record forwards once using the actual caller token',async()=>{
 const {handle,calls}=setup();await handle('caller-token','record',payload);
 const records=calls.filter(c=>c[0]==='legacy'&&c[2]==='record');assert.equal(records.length,1);assert.equal(records[0][1],'caller-token');
});
test('external HR cannot clock without an active employee and invalid GPS never writes',async()=>{
 const external=setup('HR',{legacy:async()=>({ok:true,employee:null})});await assert.rejects(external.handle('token','record',payload),/ACTIVE_EMPLOYEE_REQUIRED/);
 const {handle,calls}=setup();await assert.rejects(handle('token','record',{...payload,latitude:999}),/INVALID_LOCATION/);
 assert.equal(calls.filter(c=>c[2]==='record').length,0);
});
test('missing LINE token fails before any data access',async()=>{
 const {handle,calls}=setup();await assert.rejects(handle('','record',payload),/MISSING_LINE_TOKEN/);assert.equal(calls.length,0);
});
test('live request routes use verified identity, fixed operations and never proxy legacy',async()=>{
 const requests=[];const {handle,calls}=setup('EMPLOYEE',{requests:async(...args)=>{requests.push(args);return {ok:true}}});
 for(const op of ['submit','review','cancel','mine','queue','report'])await handle('token','live_request_'+op,{actor:'forged'});
 assert.equal(requests.length,6);assert(requests.every(r=>r[0]==='verified-line'));assert.equal(calls.length,0);
 await assert.rejects(handle('token','live_request_delete'),/ACTION_NOT_CONNECTED/);
});
