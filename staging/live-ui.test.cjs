const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/app.js','utf8').replace('navigation();init();','');
test('real request notes retain real status in individual export',()=>{
 const {run}=setup();const result=run("mergeSandboxReport({rows:[{work_date:'2026-09-24'}]}, {rows:[{kind:'leave',work_date:'2026-09-24',sandbox:false},{kind:'overtime',work_date:'2026-09-24',sandbox:true}]} )");
 assert.equal(result.rows[0].requests[0].sandbox,false);assert.equal(result.rows[0].requests[1].sandbox,true);
});
test('live bootstrap and HR membership route to verified production gateway',async()=>{
 const calls=[];const {run}=setup(async(url,options)=>{calls.push([url,JSON.parse(options.body)]);return {ok:true,json:async()=>({ok:true})}});
 run("CONFIG.requestsLive=true;state.role='employee'");await run("api('bootstrap')");await run("api('hr_register',{name:'HR'})");
 assert(calls.every(c=>c[0].includes('kitty-attendance-live')));assert.deepEqual(calls[1][1],{name:'HR'});
});
test('production requests route separately and isolate old trial drafts',async()=>{
 const calls=[];const {run}=setup(async(url,options)=>{calls.push([url,JSON.parse(options.body)]);return {ok:true,json:async()=>({ok:true})}});
 run("state.boot={employee:{id:'self'}};sessionStorage.setItem(draftKey(),JSON.stringify([{id:'trial'}]));CONFIG.requestsLive=true;state.role='hr'");
 assert.equal(run('drafts().length'),0);
 await run("api('staging_request_review',{id:'real'})");
 assert(calls[0][0].includes('kitty-attendance-live?action=live_request_review'));assert.equal(calls[0][1].previewRole,'HR');
 await run("api('staging_ot_queue')");assert(calls[1][0].includes('rapid-processor-staging?action=staging_ot_queue'));
 assert.equal(run("liveRequest('leave')"),true);assert.equal(run("liveRequest('overtime')"),false);
});
function setup(fetcher){
 const nodes=new Map(),listeners={},storage=new Map();
 const node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',hidden:false,value:'',classList:{add(){},remove(){},toggle(){}},showModal(){}});return nodes.get(key)};
 const context=vm.createContext({console,Intl,Date,Number,String,Set,Map,JSON,Promise,AbortController,FormData,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,setInterval(){},window:{KittyClock:require('./attendance-client.js'),KittyIndividualReport:require('./individual-report.js'),liff:{getAccessToken:()=> 'test-token'}},document:{querySelector:node,querySelectorAll:()=>[],addEventListener:(key,fn)=>listeners[key]=fn},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},fetch:fetcher||(async()=>{throw Error('Failed to fetch')})});
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
 const desktop=node('#desktopNav').innerHTML;assert(desktop.includes('จัดการ'));assert.equal((desktop.match(/data-page=/g)||[]).length,7);for(const name of ['LINE Report','Audit Log','แก้ไขเวลา','ตั้งค่าระบบ'])assert(run('managementView()').includes(name));assert(node('#bottomNav').innerHTML.includes('จัดการ'));
});
test('report defaults to active employees and all-status never widens HR exclusions',()=>{
 const {run}=setup();run("var candidates=[{id:'on',active:true,name:'Office'},{id:'off',active:false,name:'Former'},{id:'private',active:true,name:'Shane'},{id:'unknown',name:'Unknown'}]");
 assert.equal(run("reportEmployees(candidates,'admin').map(e=>e.id).join(',')"),'on,private');assert.equal(run("reportEmployees(candidates,'hr','all').map(e=>e.id).join(',')"),'on,off,unknown');
});
test('all employees report combines permitted active records and aborts on a failed employee',async()=>{
 let fail=false;const calls=[];const {run}=setup(async(url,options)=>{const body=JSON.parse(options.body);calls.push(body.employeeId);if(fail&&body.employeeId==='b')throw Error('offline');return {ok:true,json:async()=>({ok:true,employee:{id:body.employeeId,active:true,name:body.employeeId},month:'2026-09',warnings:[],rows:[{work_date:'2026-09-01'}],generated_at:'2026-09-22T00:00:00Z'})}});
 run("state.role='admin';state.page='reports';state.month='2026-09';state.reportEmployee='ALL';state.directory={employees:[{id:'a',active:true},{id:'b',active:true},{id:'old',active:false}]} ");
 const html=await run('individualReportView()');assert(html.includes('2 คน'));assert.deepEqual(calls,['a','b','a','b','a','b']);assert.equal(run('state.individualReport.rows.length'),2);assert.equal(run('state.individualReport.combined'),true);
 fail=true;await assert.rejects(run('individualReportView()'),/offline/);assert.equal(run('state.individualReport'),null);
});
test('pink dashboard uses actual counts and preserves role-scoped management actions',async()=>{
 const {run}=setup(async()=>({ok:true,json:async()=>({ok:true,summary:{checked_in:7,checked_out:3,not_checked_in:2,leave:1},rows:[]})}));
 run("state.role='admin'");const admin=await run('dashboardView()');assert(admin.includes('<strong>7</strong>'));assert(admin.includes('LINE Report'));assert(admin.includes('dashboard-layout'));assert(!admin.includes('ทุกวันทำงาน'));assert(!admin.includes('ครบทุกคน'));
 run("state.role='hr'");const hr=await run('dashboardView()');assert(hr.includes('Head Office'));assert(!hr.includes('LINE Report'));assert(hr.includes('data-page="clock-approvals"'));
});
test('personal clock matches split-card structure and uses real work duration',async()=>{
 const {run}=setup(async()=>({ok:true,json:async()=>({ok:true,events:[{event_type:'BREAK_OUT',event_at:'2026-09-22T05:00:00Z'}],daily:{first_in_at:'2026-09-22T02:00:00Z',break_out_at:'2026-09-22T05:00:00Z',paid_work_hours:3.25}})}));run("state.boot={employee:{id:'self',name:'Real employee'}}");const html=await run('clockView()');assert(html.includes('personal-clock-layout'));assert(html.includes('panel clock-card'));assert(html.includes('panel clock-summary'));assert(html.includes('3 ชม. 15 นาที'));assert(html.includes('กำลังพัก'));assert(!html.includes('ประวัติการลงเวลาทั้งหมด'));
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
 const releases=[];const {run,node}=setup(async()=>{await new Promise(resolve=>releases.push(resolve));return {ok:true,json:async()=>({ok:true,summary:{},rows:[]})}});
 run("state.connected=true;state.role='admin';state.page='dashboard'");const first=run('render()');run("state.page='settings'");await run('render()');releases.forEach(release=>release());await first;assert(node('#content').innerHTML.includes('ตั้งค่าระบบ'));assert(!node('#content').innerHTML.includes('เข้างานแล้ว'));
});
test('daily report loads selected date and HR scope with break columns and print action',async()=>{const calls=[];const {run}=setup(async(url,options)=>{calls.push({action:new URL(url).searchParams.get('action'),body:JSON.parse(options.body)});return {ok:true,json:async()=>({ok:true,rows:[{employee:{name:'Actual employee'},paid_work_hours:8.5,break_out_at:'2026-09-20T05:00:00Z'}]})}});run("state.role='hr';state.date='2026-09-20'");const html=await run('reportView()');assert.equal(calls[0].action,'admin_daily');assert.equal(calls[0].body.date,'2026-09-20');assert.equal(calls[0].body.previewRole,'HR');assert(html.includes('8 ชม. 30 นาที'));assert(html.includes('ออกพัก'));assert(html.includes('data-action=\"print\"'));assert(!html.includes('data-page=\"dashboard\"'))});
test('monthly report stays available as a separate tab',async()=>{const actions=[];const {run}=setup(async(url)=>{actions.push(new URL(url).searchParams.get('action'));return {ok:true,json:async()=>({ok:true,rows:[],period_start:'2026-09-01'})}});run("state.reportPeriod='monthly'");const html=await run('reportView()');assert(actions.includes('admin_monthly_summary'));assert(html.includes('ใช้ชดแล้ว · OT ทดลอง'));assert(html.includes('data-report-period=\"daily\"'))});
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
test('HR has six direct tabs with separate request types and no management tab',()=>{
 const {run,node}=setup();run("state.role='hr';state.boot={isAdmin:true,adminRole:'HR'};navigation()");
 for(const selector of ['#desktopNav','#bottomNav']){const html=node(selector).innerHTML;assert(!html.includes('data-page="more"'));assert(html.includes('data-page="clock-approvals"'));assert(html.includes('data-page="leave"'));assert.equal((html.match(/data-page=/g)||[]).length,6)}
});
test('employee info uses distinct profile action and escapes LINE and dayoff data',()=>{
 const {run}=setup();assert(run("employeeRows([{id:'ho'}])").includes('data-profile="ho"'));assert(!run("employeeRows([{id:'ho'}])").includes('data-employee='));
 const html=run("profileFields({employee:{line_user_id:'<line>',weekly_dayoffs:['MON','TUE']}})");
 assert(html.includes('&lt;line&gt;'));assert(html.includes('จันทร์, อังคาร'));assert(!html.includes('การลงเวลา'));
 assert(run('dayPicker()').includes('<span>วันที่</span>'));
});
test('request card distinguishes unavailable source from empty queue and escapes reasons',()=>{
 const {run}=setup();const missing=run("requestList({rows:[],warnings:['ยังไม่เชื่อม']})");assert(!missing.includes('ไม่มีคำขอรออนุมัติ'));
 assert(run("requestList({rows:[{kind:'leave',reason:'<script>',employee:{name:'Office'}}]})").includes('&lt;script&gt;'));
});
test('unread dots are per type, disappear only for opened records and stay account scoped',()=>{
 const {run,node}=setup();run("state.role='hr';state.boot={profile:{userId:'one'}};requestCache.set(requestScope(),{rows:[{id:'l1',kind:'leave'},{id:'l2',kind:'leave'},{id:'c1',kind:'correction'}]});navigation()");
 assert(run("requestBadge('leave')").includes('unread-dot'));assert(run("requestBadge('clock-approvals')").includes('unread-dot'));
 run("state.page='leave';navigation()");assert.equal(run("unreadRequests('leave').length"),2);
 run("openRequest('leave:l1')");assert.equal(run("unreadRequests('leave').length"),1);assert(node('#actionTitle').textContent.includes('ลา'));
 run("openRequest('leave:l2')");assert.equal(run("requestBadge('leave')"),'');assert(run("requestBadge('clock-approvals')").includes('unread-dot'));
 run("requestCache.get(requestScope()).rows.push({id:'l3',kind:'leave'})");assert.equal(run("unreadRequests('leave').length"),1);
 run("state.boot={profile:{userId:'two'}}");assert.equal(run("requestBadge('leave')"),'');assert.equal(run("readRequestIds().size"),0);
 run("state.boot={profile:{userId:'one'}};state.personal=true");assert.equal(run("requestBadge('leave')"),'');
});
test('request views filter correction and leave independently',async()=>{
 const {run}=setup(async url=>({ok:true,json:async()=>({ok:true,rows:new URL(url).searchParams.get('action')==='staging_request_queue'?[{id:'l',kind:'leave',reason:'LEAVE-ONLY'},{id:'c',kind:'correction',reason:'CLOCK-ONLY'}]:[]})}));
 run("state.role='hr';state.boot={profile:{userId:'one'}}");
 const correction=await run("requestsView('correction')"),leave=await run("requestsView('leave')");
 assert(correction.includes('CLOCK-ONLY'));assert(!correction.includes('LEAVE-ONLY'));assert(leave.includes('LEAVE-ONLY'));assert(!leave.includes('CLOCK-ONLY'));
});
test('read markers survive memory reload via browser storage and tolerate storage write failure',()=>{
 const {run}=setup();run("var localStorage=sessionStorage;state.role='hr';state.boot={profile:{userId:'one'}};requestCache.set(requestScope(),{rows:[{kind:'leave',id:'1'}]});openRequest('leave:1');readMemory.clear()");
 assert.equal(run("unreadRequests('leave').length"),0);
 run("localStorage={getItem:()=>null,setItem:()=>{throw Error('storage full')}};openRequest('leave:1')");
 assert.equal(run("unreadRequests('leave').length"),0);
});
test('request forms allow explicit sandbox submission but preserve draft actions',()=>{
 const {run}=setup();for(const view of ['leaveView()','correctionView()']){const html=run(view);assert(html.includes('data-send-request="true"'));assert(html.includes('บันทึกแบบร่างในเครื่อง'));assert(!html.includes('ยังส่งไม่ได้'))}
});
test('sandbox request notes merge without modifying production work totals',()=>{
 const {run}=setup();const r=run("mergeSandboxReport({rows:[{work_date:'2026-09-22',paid_work_hours:8}],warnings:[]},{rows:[{kind:'correction',work_date:'2026-09-22',status:'APPROVED',approved_sequence_in_month:3,deduction_amount:200}]})");
 assert.equal(r.rows[0].paid_work_hours,8);assert.equal(r.rows[0].requests[0].sandbox,true);assert.equal(r.rows[0].requests[0].effective_date,'2026-09-22');
});
test('sandbox send retries use same client ID and never accept a forged employee target',async()=>{
 const calls=[];let fail=true;const {run}=setup(async(url,options)=>{calls.push({action:new URL(url).searchParams.get('action'),body:JSON.parse(options.body)});return {ok:!fail,json:async()=>fail?{ok:false,error:'REQUEST_SERVICE_ERROR'}:{ok:true,sandbox:true}}});
 run("var testForm={id:'correctionForm',dataset:{}};var testButton={disabled:false};var testData={date:'2026-09-22',event:'เข้างาน',time:'09:00',reason:'test'}");
 await run('sendRequest(testForm,testData,testButton)');fail=false;await run('sendRequest(testForm,testData,testButton)');
 assert.equal(calls[0].action,'staging_request_submit');assert.equal(calls[0].body.clientId,calls[1].body.clientId);assert.equal(calls[0].body.event,'IN');assert.equal(calls[0].body.employeeId,undefined);assert.equal(run('testButton.disabled'),false);
});
test('calendar hides month totals and expandable event history',async()=>{
 const {run}=setup(async()=>({ok:true,json:async()=>({ok:true,rows:[],events:[],daily:{paid_work_hours:4}})}));run("state.boot={employee:{id:'self'}}");
 const html=await run('calendarView()');assert(!html.includes('calendar-summary'));assert(!html.includes('ประวัติการลงเวลา'));assert(html.includes('4 ชม. 0 นาที'));
});
test('correction copy hides fee text and approved third request is red',()=>{
 const {run}=setup();const html=run('correctionView()');assert(html.includes('ส่งให้ HR'));assert(!html.includes('HR / Admin'));assert(!html.includes('200'));
 assert(run("myRequestHistory([{kind:'correction',status:'APPROVED',approved_sequence_in_month:3}])").includes('frequent-request'));
 assert(!run("myRequestHistory([{kind:'correction',status:'APPROVED',approved_sequence_in_month:2}])").includes('frequent-request'));
});
test('sending a saved leave draft preserves it on failure and removes it only after success',async()=>{
 let fail=true;const calls=[];const {run}=setup(async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:!fail,json:async()=>fail?{ok:false,error:'REQUEST_SERVICE_ERROR'}:{ok:true}}});
 run("state.boot={employee:{id:'one'}};sessionStorage.setItem(draftKey(),JSON.stringify([{id:'00000000-0000-4000-8000-000000000001',kind:'leave',date:'2026-09-24',type:'ลากิจ',duration:'HALF_DAY_AM',reason:'test'}]));var savedButton={dataset:{sendDraft:'00000000-0000-4000-8000-000000000001'},disabled:false}");
 assert(run("draftHistory('leave')").includes('data-send-draft'));
 await run('sendDraft(savedButton)');assert.equal(run('drafts().length'),1);
 fail=false;await run('sendDraft(savedButton)');assert.equal(run('drafts().length'),0);
 assert.equal(calls[0].clientId,calls[1].clientId);assert.equal(calls[1].duration,'HALF_DAY_AM');
});
test('OT belongs to correction queue and unread badge, never correction penalty count',()=>{
 const {run}=setup();run("state.role='hr';state.boot={profile:{userId:'one'}};requestCache.set(requestScope(),{rows:[{id:'ot1',kind:'overtime',mode:'MAKEUP_NEXT'}]})");
 assert.equal(run("unreadRequests('correction').length"),1);assert.equal(run("unreadRequests('leave').length"),0);
 const html=run('overtimeView()');assert(html.includes('USE_PRIOR'));assert(html.includes('MAKEUP_NEXT'));assert(html.includes('ส่งให้ HR'));
});
test('automatic OT form has no minutes and HR sees both actual day totals',()=>{
 const {run,node}=setup();assert(!run('overtimeView()').includes('name="minutes"'));
 run("state.role='hr';state.boot={profile:{userId:'hr'}};requestCache.set(requestScope(),{rows:[{id:'x',kind:'overtime',mode:'USE_PRIOR',source_date:'2026-09-23',target_date:'2026-09-24',source_paid_minutes:600,target_paid_minutes:420,source_required_minutes:480,target_required_minutes:480,minutes:60,remaining_short_minutes:0,settlement_state:'READY'}]});openRequest('overtime:x')");
 const html=node('#actionBody').innerHTML;assert(html.includes('10 ชม. 0 นาที'));assert(html.includes('7 ชม. 0 นาที'));assert(html.includes('ชดได้ 1 ชม. 0 นาที'));
 assert.equal((html.match(/data-review-kind="overtime"/g)||[]).length,2);
 assert(run("overtimeDescription({settlement_state:'WAITING',minutes:null})").includes('รอตรวจเวลาครบทั้งสองวัน'));
});
test('BA and Driver previews cannot impersonate users or send data',()=>{
 const {run,node}=setup();run("state.role='admin';state.boot={isAdmin:true,adminRole:'ADMIN'};showRolePreview('MULTI_BRANCH')");
 assert(node('#actionBody').innerHTML.includes('เข้าสาขา'));assert(node('#actionBody').innerHTML.includes('ตัวอย่างหน้าตาเท่านั้น'));
 assert.equal(run('state.role'),'admin');assert.equal(run('state.boot.employee'),undefined);
 run("showRolePreview('DRIVER')");assert(node('#actionBody').innerHTML.includes('งานขับรถ'));assert(!node('#actionBody').innerHTML.includes('เข้าสาขา'));
 node('#actionBody').innerHTML='unchanged';run("state.role='hr';showRolePreview('MULTI_BRANCH')");assert.equal(node('#actionBody').innerHTML,'unchanged');
});
test('actual BA clock renders branch flow with own events and no fabricated data',async()=>{
 const calls=[];const {run}=setup(async(url)=>{calls.push(new URL(url).searchParams.get('action'));return {ok:true,json:async()=>({ok:true,events:[{event_type:'BRANCH_IN',event_at:'2026-09-24T03:00:00Z',office_name:'Actual Branch'}],daily:{paid_work_hours:2}})}});
 run("state.boot={employee:{id:'self',attendance_mode:'MULTI_BRANCH'}}");
 const html=await run('clockView()');assert(html.includes('Actual Branch'));assert(html.includes('จบวันทำงาน'));assert(html.includes('อยู่ที่สาขา'));assert.deepEqual(calls,['today']);
});
test('overview has six cards including off and current break without hiding zeros',async()=>{
 const {run}=setup(async()=>({ok:true,json:async()=>({ok:true,summary:{checked_in:8,not_checked_in:0,leave:1,checked_out:2,off:3,on_break:4},rows:[]})}));
 run("state.role='admin'");
 const html=await run('dashboardView()');assert.equal((html.match(/class="stat-card"/g)||[]).length,6);assert(html.includes('วันหยุด</span><strong>3'));assert(html.includes('กำลังพัก</span><strong>4'));assert(html.includes('ยังไม่เข้างาน</span><strong>0'));
});
test('OT amount is prominent and incomplete attendance is not presented as zero',()=>{
 const {run}=setup();const html=run("overtimeDetails({settlement_state:'READY',minutes:45,available_minutes:45})");
 assert(html.includes('ชั่วโมงที่ใช้ได้'));assert(html.includes('<strong>0 ชม. 45 นาที</strong>'));
 assert(run("overtimeDetails({settlement_state:'WAITING',minutes:null})").includes('ยังสรุปไม่ได้'));
});
test('HR approval sends immediately with empty review reason and requester reason is labelled',async()=>{
 const calls=[];const {run,node}=setup(async(url,options)=>{calls.push({action:new URL(url).searchParams.get('action'),body:JSON.parse(options.body)});return {ok:true,json:async()=>({ok:true})}});
 node('#actionDialog').close=()=>{};node('#reviewReason').value='stale text';
 run("state.role='hr';state.boot={profile:{userId:'hr'}};requestCache.set(requestScope(),{rows:[{id:'ot',kind:'overtime',reason:'Need rest'}]});openRequest('overtime:ot')");
 assert(node('#actionBody').innerHTML.includes('เหตุผล : Need rest'));
 assert(node('#actionBody').innerHTML.includes('id="rejectionField" hidden'));
 await run("reviewRequest({disabled:false,dataset:{reviewKind:'overtime',reviewId:'ot',decision:'APPROVED'}})");
 assert.equal(calls[0].action,'staging_ot_review');assert.equal(calls[0].body.reviewReason,'');assert.equal(calls[0].body.decision,'APPROVED');
});
test('own correction history also displays submitted OT requests',async()=>{
 const {run}=setup(async(url)=>({ok:true,json:async()=>({ok:true,rows:new URL(url).searchParams.get('action')==='staging_ot_mine'?[{kind:'overtime',reason:'OT reason',status:'PENDING'}]:[]})}));
 const html=await run("personalRequestView('correction')");assert(html.includes('เหตุผล : OT reason'));
 assert(source.includes("loadOvertimeBalance($('#overtimeForm [data-ot-balance]'))"));
});
test('late queue response cannot restore an approved request',async()=>{
 const pending=[];const {run}=setup((url)=>new Promise(resolve=>pending.push({url,resolve})));
 run("state.role='hr';state.boot={profile:{userId:'hr'}};requestCache.set(requestScope(),{rows:[{id:'ot',kind:'overtime',status:'PENDING'}]})");
 const loading=run('requestQueue()');
 run("invalidateReviewedRequest('overtime','ot')");
 for(const p of pending)p.resolve({ok:true,json:async()=>({ok:true,rows:p.url.includes('staging_ot_queue')?[{id:'ot',kind:'overtime',status:'PENDING'}]:[]})});
 const data=await loading;assert.equal(data.rows.length,0);assert.equal(run('requestCache.get(requestScope()).rows.length'),0);
});
test('completed requests are retained only in collapsed history',()=>{
 const {run}=setup();const html=run("personalHistory([{id:'one',kind:'overtime',status:'APPROVED',reason:'approved history'},{id:'two',kind:'overtime',status:'PENDING',reason:'pending request'}])");
 assert(html.indexOf('pending request')<html.indexOf('<details'));assert(html.indexOf('approved history')>html.indexOf('<details'));assert(!html.includes('<details open'));assert(html.includes('อนุมัติทดลอง'));
});
test('personal background refresh updates history without replacing typed form',async()=>{
 const {run,node}=setup(async()=>({ok:true,json:async()=>({ok:true,rows:[]})}));
 run("state.connected=true;state.role='employee';state.page='clock-request';state.boot={employee:{id:'self'}}");
 node('#content').innerHTML='typed form stays';node('#personalRequestHistory').innerHTML='old request';
 await run('refreshRequestNotifications()');assert.equal(node('#content').innerHTML,'typed form stays');assert(!node('#personalRequestHistory').innerHTML.includes('old request'));
});
test('OT report counts approved ready minutes only and preserves legacy totals',()=>{
 const {run}=setup();
 const result=run("mergeSandboxReport({rows:[{work_date:'2026-09-24',makeup_hours:0,paid_work_hours:8.4167}],warnings:[]},{rows:[{id:'a',kind:'overtime',status:'APPROVED',settlement_state:'READY',minutes:35,work_date:'2026-09-24'},{id:'a',kind:'overtime',status:'APPROVED',settlement_state:'READY',minutes:35,work_date:'2026-09-24'},{id:'p',kind:'overtime',status:'PENDING',settlement_state:'READY',minutes:90,work_date:'2026-09-24'}]})");
 assert.equal(result.rows[0].ot_used_hours,35/60);assert.equal(result.rows[0].makeup_hours,0);assert.equal(result.rows[0].paid_work_hours,8.4167);
 assert.equal(run("otSummary([{kind:'overtime',status:'APPROVED',settlement_state:'WAITING',minutes:null}]).hours"),null);
});
test('OT form shows one approved total instead of a redundant new-request balance',async()=>{
 const {run,node}=setup(async(url)=>({ok:true,json:async()=>new URL(url).searchParams.get('action')==='staging_ot_balance'?{ok:true,settlement_state:'READY',minutes:0,available_minutes:0}:{ok:true,rows:[{id:'a',kind:'overtime',status:'APPROVED',settlement_state:'READY',mode:'USE_PRIOR',work_date:'2026-09-24',minutes:35}]}}));
 node('#overtimeForm').elements={mode:{value:'USE_PRIOR'},date:{value:'2026-09-24'}};
 await run("loadOvertimeBalance({disabled:false})");
 const html=node('#otBalance').innerHTML;assert(html.includes('ใช้ชดแล้ว'));assert(html.includes('0 ชม. 35 นาที'));assert(!html.includes('ใช้เพิ่มได้สำหรับคำขอใหม่'));assert.equal((html.match(/class="ot-total"/g)||[]).length,1);
});
test('monthly sandbox OT is scoped separately and includes current-day approval',async()=>{
 const ids=[];const {run}=setup(async(url,options)=>{ids.push(JSON.parse(options.body).employeeId);return {ok:true,json:async()=>({ok:true,rows:[{id:'a',kind:'overtime',status:'APPROVED',settlement_state:'READY',minutes:35}]})}});
 run("state.role='hr';state.month='2026-09';state.directory={employees:[{id:'ho',employee_code:'HO002',name:'Office',active:true},{id:'shane',name:'Shane',active:true},{id:'old',name:'Former',active:false}]}");
 const html=await run('monthlyOtView()');assert.deepEqual(ids,['ho']);assert(html.includes('0 ชม. 35 นาที'));assert(html.includes('รวมวันนี้'));assert(!html.includes('Shane'));
});
test('leave detail and history render Thai labels without internal codes',()=>{
 const {run,node}=setup();run("state.role='hr';state.boot={profile:{userId:'hr'}};requestCache.set(requestScope(),{rows:[{id:'leave',kind:'leave',leave_type:'SICK_LEAVE',duration:'FULL_DAY',status:'PENDING'}]});openRequest('leave:leave')");
 const html=node('#actionBody').innerHTML;assert(html.includes('ลาป่วย · เต็มวัน'));assert(!html.includes('FULL_DAY'));assert(!html.includes('SICK_LEAVE'));
 const history=run("myRequestHistory([{kind:'leave',leave_type:'BUSINESS_LEAVE',duration:'HALF_DAY_PM',status:'APPROVED'}])");assert(history.includes('ลากิจ · ครึ่งวันบ่าย'));
});
test('employee modes and branch events use readable labels without changing form values',()=>{
 const {run}=setup();const html=run("employeeRows([{id:'ba',name:'Example',attendance_mode:'MULTI_BRANCH',active:true}])");assert(html.includes('ทำงานหลายสาขา'));assert(!html.includes('MULTI_BRANCH'));
 assert(run("eventsTable([{event_type:'BRANCH_IN'}])").includes('เข้าสาขา'));assert(run("leaveView()").includes('value="FULL_DAY"'));
 assert.equal(run("scheduleLabel('SICK_LEAVE')"),'ลาป่วย');assert.equal(run("userLabel('UNRECOGNIZED_CODE')"),'ไม่ระบุ');
});
test('HR personnel page hides direct add and keeps registration editing',async()=>{
 const {run}=setup(async(url)=>({ok:true,json:async()=>new URL(url).searchParams.get('action')==='admin_bootstrap'?{ok:true,employees:[{id:'ho',name:'Office',employee_code:'HO001',active:true,attendance_mode:'STANDARD'}]}:{ok:true,profiles:[],registrations:[{id:'reg',name:'New Name',unread:true}]}}));
 run("state.role='hr'");const html=await run('employeesView()');assert(!html.includes('data-add-personnel'));assert(html.includes('data-edit-personnel="ho"'));assert(html.includes('New Name'));assert(html.includes('data-registration="reg"'));
});
test('personnel editor has seven dayoff checkboxes and preserves checked days',async()=>{
 const {run,node}=setup(async()=>({ok:true,json:async()=>({ok:true,profile:{employee_id:'ho',employee_code:'HO001',name:'Name',weekly_dayoffs:['MON','SUN'],version:0}})}));
 run("state.role='hr'");await run("personnelEditor({employeeId:'ho'})");
 const html=node('#actionBody').innerHTML;assert.equal((html.match(/type="checkbox"/g)||[]).length,7);assert(html.includes('value="MON" checked'));assert(html.includes('value="SUN" checked'));assert(!html.includes('name="role"'));
});
test('registration unread dot belongs to employees and disappears after server read',()=>{
 const {run}=setup();run("state.role='hr';state.boot={profile:{userId:'hr'}};requestCache.set(requestScope(),{rows:[{id:'reg',kind:'registration',unread:true}]})");
 assert(run("requestBadge('employees')").includes('unread-dot'));assert.equal(run("requestBadge('leave')"),'');
 run("requestCache.set(requestScope(),{rows:[{id:'reg',kind:'registration',unread:false}]})");assert.equal(run("requestBadge('employees')"),'');
});
test('new signup asks only name and existing submission shows waiting status',async()=>{
 let registered=false;const {run}=setup(async()=>({ok:true,json:async()=>({ok:true,registration:registered?{name:'New',status:'PENDING'}:null})}));
 const html=await run('signupView()');assert(html.includes('name="name"'));assert(!html.includes('name="employee_code"'));assert(!html.includes('name="role"'));
 registered=true;assert((await run('signupView()')).includes('ส่งชื่อให้ HR แล้ว'));
});

test('employee status defaults active and composes with search without changing directory scope',()=>{
 const {run,node,listeners}=setup();run("state.peopleRows=[{id:'a',name:'Alice',active:true},{id:'b',name:'Bob',active:false},{id:'c',name:'Ann',active:false}]");
 assert.equal(run("filteredPeople().map(e=>e.id).join(',')"),'a');
 listeners.change({target:{id:'employeeScope',value:'inactive'}});
 assert(node('#employeeResults').innerHTML.includes('Bob'));assert(!node('#employeeResults').innerHTML.includes('Alice'));
 listeners.input({target:{id:'employeeSearch',value:'ann'}});
 assert(node('#employeeResults').innerHTML.includes('Ann'));assert(!node('#employeeResults').innerHTML.includes('Bob'));
 run("state.employeeScope='all';state.employeeSearch='a'");assert.equal(run("filteredPeople().map(e=>e.id).join(',')"),'a,c');
});
test('explicit empty weekly days are explained rather than blank',()=>{
 const {run}=setup();assert(run("profileFields({employee:{weekly_dayoffs:[]}})").includes('ไม่ได้กำหนดวันหยุดประจำสัปดาห์'));
 const css=fs.readFileSync(__dirname+'/design-system.css','utf8');assert(css.includes('flex:0 0 20px'));assert(css.includes('grid-template-columns:repeat(auto-fit,minmax(120px,1fr))'));
});

test('HR cannot open a blank personnel editor and approval is explicit',async()=>{
 let calls=0;const {run,node}=setup(async()=>{calls++;return {ok:true,json:async()=>({ok:true,profile:{name:'New',version:0},line_user_id:'verified-line'})}});
 run("state.role='hr'");await run('personnelEditor()');assert.equal(calls,0);
 await run("personnelEditor({registrationId:'r'})");assert(node('#actionBody').innerHTML.includes('บันทึกและอนุมัติพนักงานใหม่'));assert.equal(run('state.personnelEdit.approveRegistration'),true);
});
test('self profile retains avatar and personal details without contact fields or edit form',async()=>{
 const calls=[];const {run,node}=setup(async(url)=>{calls.push(new URL(url).searchParams.get('action'));return {ok:true,json:async()=>({ok:true,version:2,employee:{name:'Me',employee_code:'HO001',phone:'0812345678',email:'a@example.com',weekly_dayoffs:[]}})}});
 run("state.connected=true;state.boot={employee:{name:'Me'},profile:{pictureUrl:'https://example.com/me.jpg'}};navigation()");
 assert(node('#selfProfileButton').innerHTML.includes('https://example.com/me.jpg'));
 await run('showSelfProfile()');const html=node('#actionBody').innerHTML;assert(!html.includes('โทรศัพท์'));assert(!html.includes('อีเมล'));assert(!html.includes('0812345678'));assert(!html.includes('a@example.com'));assert(!html.includes('<form'));assert(html.includes('HO001'));assert(!html.includes('name="employee_code"'));assert.deepEqual(calls,['staging_self_profile']);
});

test('supplied logo replaces flower and appears in initial and LINE loading states',()=>{
 const {run}=setup();const html=fs.readFileSync(__dirname+'/index.html','utf8');
 assert(!html.includes('✿'));assert(html.includes('src="kitty-logo.png"'));assert(html.includes('class="login-loading"'));
 assert(run('loginLoading()').includes('kitty-logo.png'));assert(source.includes("state.loginLoading?loginLoading()"));
 assert(fs.existsSync(__dirname+'/kitty-logo.png'));
});

test('clock reads and writes route to production while request submissions remain isolated',async()=>{
 const urls=[];const {run}=setup(async(url)=>{urls.push(url);return {ok:true,json:async()=>({ok:true})}});
 await run("api('today',{date:'2026-09-24'})");await run("api('record',{eventType:'IN'})");await run("api('staging_request_submit',{kind:'leave'})");
 assert(urls[0].includes('/kitty-attendance-live?'));assert(urls[1].includes('/kitty-attendance-live?'));assert(urls[2].includes('/rapid-processor-staging?'));
});
test('real clock enables only valid actions for active employees and blocks uncertain writes',()=>{
 const {run}=setup();
 run("var d={employee:{active:true,attendance_mode:'STANDARD'},events:[]}");
 assert(!run("clockButton('เข้างาน',d)").includes('disabled'));assert(run("clockButton('ออกพัก',d)").includes('disabled'));
 run("d.events=[{event_type:'IN',event_at:'2026-09-24T02:00:00Z'}]");
 assert(!run("clockButton('ออกพัก',d)").includes('disabled'));assert(!run("clockButton('ออกงาน',d)").includes('disabled'));
 run("state.clockRecorder={uncertain:true}");assert(run("clockButton('ออกพัก',d)").includes('disabled'));
});
test('preview BA controls cannot send a real attendance event',()=>{
 const {run}=setup();const html=run("occupationalView({attendance_mode:'MULTI_BRANCH'},{},true)");
 assert(!html.includes('data-clock-event'));assert(html.includes('disabled'));
});
