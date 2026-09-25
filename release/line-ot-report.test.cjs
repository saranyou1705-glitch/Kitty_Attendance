const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ts=require(process.env.TYPESCRIPT_MODULE||'typescript');
for(const name of ['rapid-processor','rapid-processor-staging']){
 function setup(ids=[],rpcError=null){
  const raw=fs.readFileSync(__dirname+'/../supabase/functions/'+name+'/index.ts','utf8').replace(/^import .*$/mg,'');
  const context=vm.createContext({Deno:{serve(){}},console,Date,Set});
  vm.runInContext(ts.transpileModule(raw,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  const rows=['settled','unsettled'].map(id=>({work_date:'2026-09-25',schedule_status:'WORK',first_in_at:'2026-09-25T02:00:00Z',last_out_at:'2026-09-25T10:00:00Z',short_hours:1,over_hours:1,employee:{id,employee_code:'HO001',name:id,attendance_mode:'OFFICE'}}));
  context.fixtureRows=rows;
  if(name.endsWith('staging'))vm.runInContext('loadScheduledAttendance=async()=>({data:fixtureRows})',context);
  const client={from(table){const q={select(){return q},eq(){return q},order(){return q},then(resolve){return Promise.resolve({data:table==='daily_attendance'?rows:[]}).then(resolve)}};return q},
    async rpc(fn,p){assert.equal(fn,'kitty_live_line_ot_complete');assert.equal(p.report_date,'2026-09-25');return {data:ids,error:rpcError}}};
  return ()=>context.loadOriginalReportData(client,'2026-09-25');
 }
 test(name+': completed approved OT excluded from both LINE exception lists only',async()=>{
  const data=await setup(['settled'])();
  assert.deepEqual(Array.from(data.shortWork,x=>x.name),['unsettled']);
  assert.deepEqual(Array.from(data.overWork,x=>x.name),['unsettled']);
  assert.equal(data.checkedOut.length,2);
 });
 test(name+': no approved completed OT keeps existing exceptions',async()=>{
  const data=await setup()();assert.equal(data.shortWork.length,2);assert.equal(data.overWork.length,2);
 });
 test(name+': verification outage stops report instead of hiding exceptions',async()=>{
  await assert.rejects(setup(null,new Error('offline')),/offline/);
 });
}
