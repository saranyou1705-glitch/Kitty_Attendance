const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
// Set TYPESCRIPT_MODULE to an installed TypeScript package when running standalone.
const ts=require(process.env.TYPESCRIPT_MODULE||'typescript');
const original=fs.readFileSync(__dirname+'/../supabase/functions/rapid-processor-staging/index.ts','utf8');
const js=ts.transpileModule(original.replace(/import \{ createClient \} from [^;]+;/,'const createClient = mockCreateClient;'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
async function request(action,role='ADMIN',payload={},missingAttendance=false,extras={}){
 let handler,writes=0;
 const employees=[{id:'ho',employee_code:'HO002',name:'Office Employee',attendance_mode:'STANDARD',active:true},{id:'ba',employee_code:'BA001',name:'BA Employee',attendance_mode:'MULTI_BRANCH',active:true},{id:'driver',employee_code:'HO099',name:'Driver',attendance_mode:'DRIVER',active:true},{id:'shane',employee_code:'HO001',name:'Shane Kitty',attendance_mode:'STANDARD',active:true}];
 const tables={employees,admins:role?[{id:'a',role}]:[],offices:[],daily_attendance:employees.map(employee=>({employee_id:employee.id,employee,work_date:'2026-09-10',schedule_status:'WORK',paid_work_hours:8,first_in_at:'2026-09-10T02:00:00Z'})),employee_schedules:employees.map(employee=>({employee_id:employee.id,employee,work_date:'2026-09-10'}))};
 if(missingAttendance){tables.daily_attendance=tables.daily_attendance.filter(r=>r.employee_id!=='ho');tables.employee_schedules=tables.employee_schedules.map(r=>({...r,schedule_status:'WORK'}))}
 Object.assign(tables,extras.tables||{});
 function query(table){let data=tables[table]||[],single=false;const q={select(){return q},eq(key,value){if(!['line_user_id','active'].includes(key))data=data.filter(r=>r[key]===value);return q},in(key,ids){data=data.filter(r=>ids.includes(r[key]));return q},gte(key,value){data=data.filter(r=>r[key]>=value);return q},lt(key,value){data=data.filter(r=>r[key]<value);return q},lte(key,value){data=data.filter(r=>r[key]<=value);return q},range(a,b){data=data.slice(a,b+1);return q},order(){return q},limit(){return q},maybeSingle(){single=true;return q},then(resolve,reject){return Promise.resolve({data:single?data[0]||null:data,error:extras.errors?.[table]||null}).then(resolve,reject)}};for(const method of ['insert','update','delete','upsert'])q[method]=()=>{writes++;throw Error('WRITE DETECTED')};return q}
 const context=vm.createContext({console,Intl,Date,Set,Map,URL,Response,fetch:async()=>({ok:true,json:async()=>({userId:'user'})}),mockCreateClient:()=>({from:query,rpc(name,args){if(extras.rpc)return extras.rpc(name,args);writes++;throw Error('RPC WRITE DETECTED')}}),Deno:{env:{get:k=>k==='STAGING_WRITE_ENABLED'?'true':'test'},serve:fn=>handler=fn}});
 vm.runInContext(js,context);const response=await handler(new Request('https://example.test/?action='+action,{method:'POST',headers:{'Content-Type':'application/json','x-line-access-token':'test'},body:JSON.stringify(payload)}));return {status:response.status,data:await response.json(),writes};
}
test('write actions blocked even if old write-enable secret is true',async()=>{for(const action of ['record','admin_update_event','admin_report_send','cron_report_send','admin_create_employee','self_weekend_wfh']){const r=await request(action);assert.equal(r.status,403);assert.equal(r.data.error,'STAGING_READ_ONLY');assert.equal(r.writes,0)}});
test('HR directory and daily results exclude BA and Driver',async()=>{const directory=await request('admin_bootstrap','HR');assert.deepEqual(directory.data.employees.map(e=>e.id),['ho','shane']);const daily=await request('admin_daily','HR',{date:'2026-09-10'});assert.equal(daily.data.rows.length,2);assert.equal(daily.data.summary.checked_in,2)});
test('HR cannot access LINE report or BA personal details',async()=>{assert.equal((await request('admin_report_preview','HR')).status,403);assert.equal((await request('admin_employee_day','HR',{employeeId:'ba',date:'2026-09-10'})).status,403)});
test('HR monthly report excludes Shane as well as BA and Driver',async()=>{const r=await request('admin_monthly_summary','HR',{month:'2026-09'});assert.equal(r.status,200);assert.deepEqual(r.data.rows.map(e=>e.employee_code),['HO002'])});
test('schedule endpoint returns only permitted HR employees',async()=>{const r=await request('staging_schedule','HR',{date:'2026-09-10'});assert.deepEqual(r.data.rows.map(e=>e.employee_id),['ho','shane']);assert.equal(r.writes,0)});
test('ordinary employee cannot read admin directory',async()=>{assert.equal((await request('admin_bootstrap',null)).status,403)});
test('individual reports enforce employee, HR and Admin scopes server side',async()=>{
 const payload={employeeId:'ho',month:'2026-09'};
 assert.equal((await request('admin_individual_report',null,payload)).status,403);
 for(const employeeId of ['ba','driver','shane'])assert.equal((await request('admin_individual_report','HR',{...payload,employeeId})).status,403);
 assert.equal((await request('admin_individual_report','ADMIN',{...payload,employeeId:'ba'})).status,200);
 assert.equal((await request('admin_individual_report','ADMIN',{...payload,employeeId:'shane',previewRole:'HR'})).status,403);
 const r=await request('admin_individual_report','HR',payload);assert.equal(r.status,200);assert.equal(r.data.rows.length,30);assert.equal(r.data.employee.id,'ho');assert.equal(r.writes,0);
 assert.equal((await request('admin_individual_report','ADMIN',{...payload,month:'2026-13'})).status,400);
});
test('individual request notes include affected and Bangkok submission days without duplicate records',async()=>{
 const extras={tables:{attendance_correction_requests:[{id:'r1',employee_id:'ho',work_date:'2026-09-10',created_at:'2026-09-10T18:01:00Z',status:'APPROVED',approved_sequence_in_month:3,deduction_amount:200},{id:'private',employee_id:'ba',work_date:'2026-09-10',created_at:'2026-09-11T02:00:00Z'}]}};
 const r=await request('admin_individual_report','HR',{employeeId:'ho',month:'2026-09'},false,extras);
 assert.equal(r.status,200);for(const date of ['2026-09-10','2026-09-11']){const row=r.data.rows.find(x=>x.work_date===date);assert.equal(row.requests.length,1);assert.equal(row.requests[0].id,'r1')}
 assert.equal(r.data.rows[0].paid_work_hours,undefined);assert.equal(r.writes,0);
});
test('missing request tables produce warnings; other database errors do not appear as empty history',async()=>{
 const payload={employeeId:'ho',month:'2026-09'};
 const r=await request('admin_individual_report','HR',payload,false,{errors:{leave_requests_v2:{code:'42P01'},attendance_correction_requests:{code:'PGRST205'}}});assert.equal(r.status,200);assert.equal(r.data.warnings.length,2);
 assert.notEqual((await request('admin_individual_report','HR',payload,false,{errors:{leave_requests_v2:{code:'42501',message:'denied'}}})).status,200);
});
test('Admin HR preview narrows results and cannot expose LINE actions',async()=>{const r=await request('admin_bootstrap','ADMIN',{previewRole:'HR'});assert.deepEqual(r.data.employees.map(e=>e.id),['ho','shane']);assert.equal((await request('admin_report_preview','ADMIN',{previewRole:'HR'})).status,403);assert.equal((await request('admin_bootstrap','ADMIN')).data.employees.length,4)});
test('preview flag cannot elevate HR or employee access',async()=>{assert.equal((await request('admin_report_preview','HR',{previewRole:'ADMIN'})).status,403);assert.equal((await request('admin_bootstrap',null,{previewRole:'HR'})).status,403)});
test('LINE preview does not attempt any DB writes',async()=>{const r=await request('admin_report_preview','ADMIN',{date:'2026-09-10',reportType:'END_DAY'});assert.equal(r.writes,0);assert.equal(r.status,200)});
test('dashboard includes real scheduled employees without daily attendance rows',async()=>{const r=await request('admin_daily','HR',{date:'2026-09-10'},true);assert.equal(r.status,200);assert.equal(r.data.summary.not_checked_in,1);assert.equal(r.data.summary.checked_in,1);assert.equal(r.data.rows.find(e=>e.employee_id==='ho').first_in_at,null);assert.equal(r.writes,0)});
test('employee profile is scoped and returns only approved personnel fields',async()=>{
 const extras={tables:{employees:[{id:'ho',employee_code:'HO002',name:'N',attendance_mode:'STANDARD',line_user_id:'line-id',weekly_dayoffs:['MON'],secret:'never-return'}]}};
 const r=await request('admin_employee_profile','HR',{employeeId:'ho'},false,extras);
 assert.equal(r.status,200);assert.equal(r.data.employee.line_user_id,'line-id');assert.deepEqual(r.data.employee.weekly_dayoffs,['MON']);assert.equal(r.data.employee.secret,undefined);assert.equal(r.writes,0);
 assert.equal((await request('admin_employee_profile','HR',{employeeId:'ba'})).status,403);
 assert.equal((await request('admin_employee_profile',null,{employeeId:'ho'})).status,403);
});
test('pending queue excludes other roles and completed requests and remains read-only',async()=>{
 const extras={tables:{leave_requests_v2:[{id:'h',employee_id:'ho',status:'PENDING',created_at:'2026-09-22'},{id:'b',employee_id:'ba',status:'PENDING'},{id:'a',employee_id:'ho',status:'APPROVED'}]}};
 const r=await request('admin_request_queue','HR',{},false,extras);
 assert.equal(r.status,200);assert.deepEqual(r.data.rows.map(r=>r.id),['h']);assert.equal(r.data.rows[0].employee.employee_code,'HO002');assert.equal(r.writes,0);
 assert.equal((await request('admin_request_queue',null)).status,403);
 const missing=await request('admin_request_queue','HR',{},false,{errors:{leave_requests_v2:{code:'42P01'}}});assert.equal(missing.data.warnings.length,1);
});
test('isolated submit uses verified actor and cannot be redirected to another RPC',async()=>{
 let call;const r=await request('staging_request_submit',null,{actor:'forged',operation:'review',employeeId:'ba',kind:'leave'},false,{rpc:async(name,args)=>{call={name,args};return {data:{ok:true,sandbox:true},error:null}}});
 assert.equal(r.status,200);assert.equal(call.name,'kitty_staging_request_v1');assert.equal(call.args.actor,'user');assert.equal(call.args.operation,'submit');assert.equal(r.writes,0);
});
test('employee cannot invoke isolated review and HR preview is fixed server-side',async()=>{
 assert.equal((await request('staging_request_review',null,{id:'x',decision:'APPROVED'})).status,403);
 let call;await request('staging_request_queue','HR',{previewRole:'ADMIN'},false,{rpc:async(name,args)=>{call=args;return {data:{ok:true,rows:[]},error:null}}});
 assert.equal(call.payload.previewRole,'HR');
 const r=await request('staging_request_review','ADMIN',{},false,{rpc:async()=>({error:{message:'ALREADY_REVIEWED'}})});assert.equal(r.status,409);
});
test('OT actions route only to isolated OT RPC and retain HR scope',async()=>{
 let call;const r=await request('staging_ot_submit','HR',{previewRole:'ADMIN',actor:'forged'},false,{rpc:async(name,args)=>{call={name,args};return {data:{ok:true},error:null}}});
 assert.equal(r.status,200);assert.equal(call.name,'kitty_staging_overtime_v1');assert.equal(call.args.actor,'user');assert.equal(call.args.payload.previewRole,'HR');
 assert.equal((await request('staging_ot_review',null)).status,403);
 const invalid=await request('staging_ot_submit','HR',{},false,{rpc:async()=>({error:{message:'OT_INSUFFICIENT_MINUTES'}})});assert.equal(invalid.status,400);assert.equal(invalid.data.error,'OT_INSUFFICIENT_MINUTES');
});
