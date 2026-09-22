const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/app.js','utf8').replace('navigation();init();','');
function setup(fetcher){
 const nodes=new Map(),listeners={},storage=new Map();
 const node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',hidden:false,value:'',classList:{add(){},remove(){},toggle(){}},showModal(){}});return nodes.get(key)};
 const context=vm.createContext({console,Intl,Date,Number,String,Set,Map,JSON,Promise,AbortController,FormData,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,setInterval(){},window:{KittyIndividualReport:require('./individual-report.js'),liff:{getAccessToken:()=> 'test-token'}},document:{querySelector:node,querySelectorAll:()=>[],addEventListener:(key,fn)=>listeners[key]=fn},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},fetch:fetcher||(async()=>{throw Error('Failed to fetch')})});
 vm.runInContext(source,context);return {run:code=>vm.runInContext(code,context),node,listeners};
}
test('Bangkok clock converts timestamps and no fixed demo clock remains',()=>{
 const {run}=setup();assert.equal(run("dateKey(new Date('2026-09-17T18:01:00Z'))"),'2026-09-18');assert.equal(run("time('2026-09-17T18:01:00Z')"),'01:01');assert(!source.includes('13:55'));assert(!source.includes('Don Thanakorn'));
});
test('calendar loads only authenticated employee endpoints for selected month and day',async()=>{
 const calls=[];const {run}=setup(async(url,options)=>{calls.push([new URL(url).searchParams.get('action'),JSON.parse(options.body)]);return {ok:true,json:async()=>({ok:true,rows:[],events:[],daily:null})}});
 run("state.boot={employee:{id:'self',name:'Actual Person'}};state.month='2026-08';state.selected='2026-08-12'");
 const html=await run('calendarView()');assert(html.includes('Actual Person'));assert.deepEqual(calls,[['employee_month',{month:'2026-08'}],['today',{date:'2026-08-12'}]]);assert(!html.includes('09:02'));
});
test('failed load displays error, never fabricated attendance',async()=>{
 const {run,node}=setup();run("state.connected=true;state.boot={employee:{id:'self'}};state.page='clock'");await run('render()');assert(node('#content').innerHTML.includes('โหลดข้อมูลไม่สำเร็จ'));assert(!node('#content').innerHTML.includes('พิกัดพร้อม'));
});
test('half-day drafts require 240 net minutes and are isolated per employee',()=>{
 const {run}=setup();run("state.boot={employee:{id:'first'}}");assert(run('leaveView()').includes('HALF_DAY_AM'));assert(run('leaveView()').includes('HALF_DAY_PM'));run("sessionStorage.setItem(draftKey(),JSON.stringify([{kind:'leave',date:'2026-09-18',label:'PRIVATE DRAFT'}]))");assert(run("draftHistory('leave')").includes('PRIVATE DRAFT'));run("state.boot={employee:{id:'second'}}");assert(!run("draftHistory('leave')").includes('PRIVATE DRAFT'));assert(source.includes("requiredNetMinutes:leave&&data.duration!=='FULL_DAY'?240:0"));
});
test('individual report selector preserves HR scope and loads selected employee/month',async()=>{
 const calls=[];const {run}=setup(async(url,options)=>{const action=new URL(url).searchParams.get('action');const body=JSON.parse(options.body);calls.push({action,body});return {ok:true,json:async()=>action==='admin_bootstrap'?{ok:true,employees:[{id:'ho',employee_code:'HO002',name:'Office',active:true},{id:'shane',employee_code:'HO001',name:'Shane'},{id:'peet',employee_code:'HO003',name:'Peet'}],offices:[]}:{ok:true,employee:{id:'ho',employee_code:'HO002',name:'Office',active:true},month:'2026-09',warnings:['ยังไม่เชื่อมประวัติคำขอลา'],rows:[{work_date:'2026-09-01',paid_work_hours:8}]}}});
 run("state.role='hr';state.page='reports';state.month='2026-09';state.reportPeriod='individual';state.reportEmployee='ho'");
 const html=await run('reportView()');assert(html.includes('ดาวน์โหลด Excel'));assert(html.includes('8 ชม. 0 นาที'));assert(html.includes('ยังไม่เชื่อม'));assert(!html.includes('value="shane"'));assert(!html.includes('value="peet"'));assert.equal(run('state.individualReport.employee.id'),'ho');assert.deepEqual(calls[1],{action:'admin_individual_report',body:{employeeId:'ho',month:'2026-09',previewRole:'HR'}});
});
test('table closes its scroll container before subsequent page controls',()=>{
 const {run}=setup();const html=run("table(['Date'],[['2026-09-22']])");assert(html.endsWith('</table></div>'));assert.equal(html.split('<div').length,html.split('</div>').length);
});
test('Admin menus retain desktop and mobile access to all management features',()=>{
 const {run,node}=setup();run("state.role='admin';state.boot={isAdmin:true,adminRole:'ADMIN'};navigation()");
 const desktop=node('#desktopNav').innerHTML;assert(desktop.includes('จัดการ'));assert.equal((desktop.match(/data-page=/g)||[]).length,6);for(const name of ['LINE Report','Audit Log','แก้ไขเวลา','ตั้งค่าระบบ'])assert(run('managementView()').includes(name));assert(node('#bottomNav').innerHTML.includes('จัดการ'));
});
test('report defaults to active employees and all-status never widens HR exclusions',()=>{
 const {run}=setup();run("var candidates=[{id:'on',active:true,name:'Office'},{id:'off',active:false,name:'Former'},{id:'private',active:true,name:'Shane'},{id:'unknown',name:'Unknown'}]");
 assert.equal(run("reportEmployees(candidates,'admin').map(e=>e.id).join(',')"),'on,private');assert.equal(run("reportEmployees(candidates,'hr','all').map(e=>e.id).join(',')"),'on,off,unknown');
});
test('all employees report combines permitted active records and aborts on a failed employee',async()=>{
 let fail=false;const calls=[];const {run}=setup(async(url,options)=>{const body=JSON.parse(options.body);calls.push(body.employeeId);if(fail&&body.employeeId==='b')throw Error('offline');return {ok:true,json:async()=>({ok:true,employee:{id:body.employeeId,active:true,name:body.employeeId},month:'2026-09',warnings:[],rows:[{work_date:'2026-09-01'}],generated_at:'2026-09-22T00:00:00Z'})}});
 run("state.role='admin';state.page='reports';state.month='2026-09';state.reportEmployee='ALL';state.directory={employees:[{id:'a',active:true},{id:'b',active:true},{id:'old',active:false}]} ");
 const html=await run('individualReportView()');assert(html.includes('2 คน'));assert.deepEqual(calls,['a','b']);assert.equal(run('state.individualReport.rows.length'),2);assert.equal(run('state.individualReport.combined'),true);
 fail=true;await assert.rejects(run('individualReportView()'),/offline/);assert.equal(run('state.individualReport'),null);
});
test('pink dashboard uses actual counts and preserves role-scoped management actions',async()=>{
 const {run}=setup(async()=>({ok:true,json:async()=>({ok:true,summary:{checked_in:7,checked_out:3,not_checked_in:2,leave:1},rows:[]})}));
 run("state.role='admin'");const admin=await run('dashboardView()');assert(admin.includes('<strong>7</strong>'));assert(admin.includes('LINE Report'));assert(admin.includes('dashboard-layout'));assert(!admin.includes('ทุกวันทำงาน'));assert(!admin.includes('ครบทุกคน'));
 run("state.role='hr'");const hr=await run('dashboardView()');assert(hr.includes('Head Office'));assert(!hr.includes('LINE Report'));assert(hr.includes('data-page="clock-approvals"'));
});
test('personal clock matches split-card structure and uses real work duration',async()=>{
 const {run}=setup(async()=>({ok:true,json:async()=>({ok:true,events:[{event_type:'BREAK_OUT',event_at:'2026-09-22T05:00:00Z'}],daily:{first_in_at:'2026-09-22T02:00:00Z',break_out_at:'2026-09-22T05:00:00Z',paid_work_hours:3.25}})}));run("state.boot={employee:{id:'self',name:'Real employee'}}");const html=await run('clockView()');assert(html.includes('personal-clock-layout'));assert(html.includes('panel clock-card'));assert(html.includes('panel clock-summary'));assert(html.includes('3 ชม. 15 นาที'));assert(html.includes('กำลังพัก'));assert(html.includes('ประวัติการลงเวลาทั้งหมด'));
});
test('attendance list keeps employee IDs, escapes names and has no fabricated people',()=>{
 const {run}=setup();const html=run("attendancePeople([{employee_id:'id1',employee:{name:'<script>',employee_code:'HO001'},first_in_at:'2026-09-22T02:00:00Z'}])");assert(html.includes('data-employee="id1"'));assert(html.includes('&lt;script&gt;'));assert(html.includes('09:00'));assert(!html.includes('พนักงานตัวอย่าง'));
});
test('employee cannot navigate into admin pages through fabricated button',()=>{
 const {run,listeners}=setup();listeners.click({target:{closest:()=>({dataset:{page:'audit'}})}});assert.equal(run('state.page'),'clock');
});
test('work hours display actual paid_work_hours, not the net report balance',()=>{
 const {run}=setup();const html=run("dailyTable([{employee:{name:'Example'},work_date:'2026-09-01',paid_work_hours:9.81,net_hours:1.81}])");assert(html.includes('9 ชม. 49 นาที'));assert(!html.includes('1 ชม. 49 นาที'));
});
test('duration formatting handles minutes, negative balances and rounding rollover',()=>{const {run}=setup();assert.equal(run('hours(1.5)'),'1 ชม. 30 นาที');assert.equal(run('hours(-0.5)'),'-0 ชม. 30 นาที');assert.equal(run('hours(1.999)'),'2 ชม. 0 นาที');assert.equal(run('hours(null)'),'—');assert.equal(run('hours(0)'),'0 ชม. 0 นาที')});
test('clock retains all four attendance buttons',async()=>{const {run}=setup(async()=>({ok:true,json:async()=>({ok:true,events:[]})}));run("state.boot={employee:{id:'self'}}");const html=await run('clockView()');for(const label of ['เข้างาน','ออกพัก','กลับจากพัก','ออกงาน'])assert(html.includes(label))});
test('actual HR cannot switch into Admin workspace',()=>{const {run,listeners}=setup();run("state.role='hr';state.boot={isAdmin:true,adminRole:'HR'}");listeners.click({target:{closest:()=>({dataset:{workspace:'admin'}})}});assert.equal(run('state.role'),'hr')});
test('Admin can inspect HR with server scoped requests',async()=>{const bodies=[];const {run,listeners}=setup(async(url,options)=>{bodies.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true,summary:{},rows:[]})}});run("state.boot={isAdmin:true,adminRole:'ADMIN'};state.connected=true;state.role='admin'");listeners.click({target:{closest:()=>({dataset:{workspace:'hr'}})}});assert.equal(run('state.role'),'hr');assert.equal(bodies[0].previewRole,'HR');assert(!run('activeMenu().some(x=>x[0]===\"audit\")'))});
test('entering schedule aligns calendar month and selected work date',()=>{
 const {run,listeners}=setup();run("state.role='admin';state.date='2026-09-21';state.month='2026-08';state.selected='2026-08-01'");listeners.click({target:{closest:()=>({dataset:{page:'schedule'}})}});assert.equal(run('state.month'),'2026-09');assert.equal(run('state.selected'),'2026-09-21');
});
test('older request cannot replace a newer page',async()=>{
 let release;const {run,node}=setup(async()=>{await new Promise(resolve=>release=resolve);return {ok:true,json:async()=>({ok:true,summary:{},rows:[]})}});
 run("state.connected=true;state.role='admin';state.page='dashboard'");const first=run('render()');run("state.page='settings'");await run('render()');release();await first;assert(node('#content').innerHTML.includes('ตั้งค่าระบบ'));assert(!node('#content').innerHTML.includes('เข้างานแล้ว'));
});
test('daily report loads selected date and HR scope with break columns and print action',async()=>{const calls=[];const {run}=setup(async(url,options)=>{calls.push({action:new URL(url).searchParams.get('action'),body:JSON.parse(options.body)});return {ok:true,json:async()=>({ok:true,rows:[{employee:{name:'Actual employee'},paid_work_hours:8.5,break_out_at:'2026-09-20T05:00:00Z'}]})}});run("state.role='hr';state.date='2026-09-20'");const html=await run('reportView()');assert.equal(calls[0].action,'admin_daily');assert.equal(calls[0].body.date,'2026-09-20');assert.equal(calls[0].body.previewRole,'HR');assert(html.includes('8 ชม. 30 นาที'));assert(html.includes('ออกพัก'));assert(html.includes('data-action=\"print\"'));assert(!html.includes('data-page=\"dashboard\"'))});
test('monthly report stays available as a separate tab',async()=>{let action;const {run}=setup(async(url)=>{action=new URL(url).searchParams.get('action');return {ok:true,json:async()=>({ok:true,rows:[],period_start:'2026-09-01'})}});run("state.reportPeriod='monthly'");const html=await run('reportView()');assert.equal(action,'admin_monthly_summary');assert(html.includes('data-report-period=\"daily\"'))});
test('calendar shows real entry time, off days, missing data and accessible selection',()=>{
 const {run}=setup();run("state.month='2026-09';state.selected='2026-09-02'");
 const html=run("calendarGrid([{work_date:'2026-09-01',first_in_at:'2026-09-01T02:15:00Z'},{work_date:'2026-09-02',schedule_status:'OFF'}])");
 assert(html.includes('09:15'));assert(html.includes('วันหยุด'));assert(html.includes('ไม่มีข้อมูล'));assert(html.includes('aria-pressed="true"'));assert(!html.includes('ขาดงาน'));
});
test('schedule joins real attendance and preserves HR server scope',async()=>{
 const calls=[];const {run}=setup(async(url,options)=>{const action=new URL(url).searchParams.get('action'),body=JSON.parse(options.body);calls.push({action,body});return {ok:true,json:async()=>({ok:true,rows:action==='staging_schedule'?[{employee_id:'ho',employee:{name:'Office'},schedule_status:'WORK',required_hours:8}]:[{employee_id:'ho',first_in_at:'2026-09-22T02:15:00Z',paid_work_hours:4.5}]})}});
 run("state.role='hr';state.date='2026-09-22'");const html=await run('scheduleView()');
 assert(html.includes('09:15'));assert(html.includes('4 ชม. 30 นาที'));assert(html.includes('data-employee="ho"'));assert(calls.every(c=>c.body.previewRole==='HR'));
});
test('icons use fixed viewBox vectors instead of platform-dependent glyphs',()=>{
 const {run,node}=setup();run("navigation()");assert(node('#bottomNav').innerHTML.includes('<svg'));assert(!node('#bottomNav').innerHTML.includes('◷'));assert(run("disabled('ออกพัก')").includes('<svg'));
});
