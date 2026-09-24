'use strict';
const $ = s => document.querySelector(s);
const CONFIG = {liffId:'2010336238-UABz60wq', api:'https://rlqecfzddxpywbbbiirg.supabase.co/functions/v1/rapid-processor-staging'};
const menus = {
 admin:[['dashboard','⌂','ภาพรวมวันนี้'],['employees','♙','พนักงาน'],['offices','◇','Office / Branch'],['schedule','□','ตารางงาน'],['attendance','◷','แก้ไขเวลา'],['clock-approvals','✓','ขอลงเวลา'],['leave','✈','ขอลา'],['reports','▤','รายงาน'],['line','◉','LINE Report'],['audit','≋','Audit Log'],['settings','⚙','ตั้งค่าระบบ']],
 hr:[['dashboard','⌂','ภาพรวมวันนี้'],['employees','♙','พนักงาน'],['schedule','□','ตารางงาน'],['clock-approvals','✓','ขอลงเวลา'],['leave','✈','ขอลา'],['reports','▤','รายงาน']],
 employee:[['clock','◷','ลงเวลา'],['clock-request','＋','ขอลงเวลา'],['calendar','□','ปฏิทินของฉัน'],['my-leave','✈','การลาของฉัน']]
};

function uiIcon(id){
 const calendar='<path d="M8 2v4m8-4v4M3 10h18"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>';
 const clock='<circle cx="12" cy="12" r="10"/><path d="M12 6v6h4"/>';
 const request='<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2m1 10 2 2 4-4"/>';
 const shapes={dashboard:'<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',employees:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',schedule:calendar,calendar,clock,attendance:clock,'clock-request':request,'clock-approvals':request,leave:calendar,'my-leave':calendar,reports:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M8 13h8M8 17h8M12 13v4"/>',more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',coffee:'<path d="M18 8h1a4 4 0 1 1 0 8h-1M3 8h15v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4ZM6 1v3m4-3v3m4-3v3"/>',logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9"/>',arrow:'<path d="M7 17 17 7M7 7h10v10"/>'};
 shapes.leave=shapes['my-leave']='<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 2v4m8-4v4M3 10h18m-9 4v4m-2-2h4"/>';
 shapes['clock-request']='<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6M16 4h2a2 2 0 0 1 2 2v4M16 16l3-3 3 3-6 6h-3v-3Z"/>';
 shapes.offices='<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01"/>';
 shapes.line='<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9H13a8.5 8.5 0 0 1 8 8Z"/>';
 shapes.audit='<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>';
 shapes.settings='<path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M1 14h6m2-6h6m2 8h6"/>';
 return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes[id]||request}</svg>`;
}

let offset=0, renderVersion=0;
const state={role:'employee',personal:false,page:'clock',boot:null,connected:false,directory:null,date:dateKey(),month:dateKey().slice(0,7),selected:dateKey()};
function now(){return new Date(Date.now()+offset)}
function dateKey(d=now()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)}
function displayDate(s){return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'long'}).format(new Date(`${s}T12:00:00+07:00`))}
function time(s){if(!s)return '—';const d=new Date(s);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function hours(v){if(v===null||v===undefined||v===''||!Number.isFinite(Number(v)))return '—';const minutes=Math.round(Math.abs(Number(v))*60);return `${Number(v)<0&&minutes?'-':''}${Math.floor(minutes/60)} ชม. ${minutes%60} นาที`}
function person(e){return `${e?.employee_code||''} · ${e?.name||'ไม่พบชื่อพนักงาน'}`}
function panel(s){return `<section class="panel">${s}</section>`}
function empty(s){return `<p class="empty-day">${esc(s)}</p>`}
function disabled(label){const icon={'เข้างาน':'clock','ออกพัก':'coffee','กลับจากพัก':'coffee','ออกงาน':'logout'}[label];return `<button class="btn secondary" disabled title="ยังไม่เปิดการบันทึกในระบบทดลอง">${icon?uiIcon(icon):''}<span>${label}</span></button>`}
function table(headers,rows){return `<div class="data-scroll"><table class="data-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${rows.length?'':empty('ไม่พบข้อมูลในช่วงที่เลือก')}`}
function errorMessage(error){const m=String(error?.message||error);if(m==='Failed to fetch')return 'เชื่อมต่อข้อมูลไม่สำเร็จ กรุณาลองใหม่หรือตรวจอินเทอร์เน็ต';if(m==='EMPLOYEE_NOT_REGISTERED')return 'บัญชี LINE นี้ยังไม่ผูกกับพนักงาน';if(m==='INVALID_LINE_TOKEN'||m==='MISSING_LINE_TOKEN')return 'การเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบ LINE อีกครั้ง';return m}
async function api(action,payload={}){
 const token=window.liff?.getAccessToken();if(!token)throw new Error('MISSING_LINE_TOKEN');
 const control=new AbortController(),timer=setTimeout(()=>control.abort(),20000);
 const request={...payload};if(state.role==='hr'&&action.startsWith('admin_')||state.role==='hr'&&(action==='staging_schedule'||(action.startsWith('staging_request_')||action.startsWith('staging_ot_'))))request.previewRole='HR';
 try{const r=await fetch(`${CONFIG.api}?action=${encodeURIComponent(action)}`,{method:'POST',headers:{'Content-Type':'application/json','x-line-access-token':token},body:JSON.stringify(request),signal:control.signal});let data;try{data=await r.json()}catch{throw new Error(`บริการข้อมูลตอบกลับไม่สมบูรณ์ (${r.status})`)}if(!r.ok||!data.ok)throw new Error(data.message||data.error||`HTTP ${r.status}`);return data}finally{clearTimeout(timer)}
}
function activeMenu(){return state.personal?menus.employee:menus[state.role]}
function loginRedirect(){const url=new URL('https://saranyou1705-glitch.github.io/Kitty_Attendance_Staging/');if(new URLSearchParams(location.search).get('view')==='hr')url.searchParams.set('view','hr');return url.href}
function navigation(){
 $('#pageHeader').hidden=state.connected&&['dashboard','clock'].includes(state.page);
 const list=activeMenu();const render=items=>items.map(([id,icon,label])=>`<button class="nav-item ${state.page===id?'active':''}" aria-current="${state.page===id?'page':'false'}" data-page="${id}"><span class="nav-symbol">${uiIcon(id)}${requestBadge(id)}</span><span>${label}</span></button>`).join('');
 const managementMenu=['dashboard','employees','schedule','clock-approvals','leave','reports'].map(id=>list.find(x=>x[0]===id)).filter(Boolean);
 const visible=state.personal||state.role==='employee'?list:state.role==='admin'?[...managementMenu,['more','•••','จัดการ']]:managementMenu;
 $('#desktopNav').innerHTML=render(visible);
 $('#bottomNav').innerHTML=render(visible);
 $('#bottomNav').classList.toggle('management-bottom',!state.personal&&state.role!=='employee');
 $('#workspaceSwitch').hidden=state.role==='employee';
 const actualAdmin=state.boot?.isAdmin&&String(state.boot.adminRole).toUpperCase()!=='HR';
 $('#workspaceSwitch').innerHTML=`${actualAdmin?`<button data-workspace="admin" class="${state.role==='admin'&&!state.personal?'active':''}">Admin</button>`:''}<button data-workspace="hr" class="${state.role==='hr'&&!state.personal?'active':''}" ${state.role==='employee'?'hidden':''}>${actualAdmin?'ดูแบบ HR':'งาน HR'}</button><button data-hr-view="personal" class="${state.personal?'active':''}">ของฉัน</button>`;
 $('#consoleName').textContent=state.personal||state.role==='employee'?'My Attendance':state.role==='admin'?'Admin Console':'HR · Head Office';
 $('#pageTitle').textContent=(state.page==='clock'?'วันทำงานของฉัน':list.find(x=>x[0]===state.page)?.[2])||'จัดการ';
}
async function init(){
 if(location.protocol==='file:'){$('#content').innerHTML=panel('<h2>กรุณาเปิดผ่านเว็บ Staging</h2><p>LINE ไม่รองรับการเข้าสู่ระบบจากไฟล์ในเครื่อง</p><a class="btn primary" href="https://saranyou1705-glitch.github.io/Kitty_Attendance_Staging/">เปิดเว็บ Staging</a>');return}
 state.connected=false;state.boot=null;state.directory=null;renderVersion++;$('#content').innerHTML=panel('กำลังเชื่อมต่อบัญชี LINE…');$('#environmentStatus').textContent='STAGING · กำลังเชื่อมต่อ';
 try{
  if(!window.liff)throw new Error('โหลด LINE ไม่สำเร็จ กรุณาลองใหม่');
  await liff.init({liffId:CONFIG.liffId});
  if(!liff.isLoggedIn()){$('#environmentStatus').textContent='STAGING · เข้าสู่ระบบเพื่อดูข้อมูลจริง';$('#content').innerHTML=panel('<h2>เข้าใช้งาน Kitty Attendance ผ่านเว็บ</h2><p>Admin และ HR เข้าด้วยบัญชี LINE ที่ผูกไว้กับระบบ</p><button class="btn primary" data-action="login">เข้าสู่ระบบด้วย LINE</button>');return}
  const started=Date.now();const boot=await api('bootstrap');
  if(boot.serverTime){const server=Date.parse(boot.serverTime);if(Number.isFinite(server))offset=server-(started+Date.now())/2}
  state.boot=boot;state.connected=true;state.role=String(boot.adminRole).toUpperCase()==='HR'?'hr':boot.isAdmin?'admin':'employee';state.personal=false;
  if(state.role==='admin'&&new URLSearchParams(location.search).get('view')==='hr')state.role='hr';
  state.date=dateKey();state.month=state.date.slice(0,7);state.selected=state.date;state.page=state.role==='employee'?'clock':'dashboard';
  $('#environmentStatus').textContent='STAGING · อ่านเวลาจริง · คำขอทดลอง';await render();
 }catch(e){$('#environmentStatus').textContent='STAGING · ยังไม่เชื่อมต่อข้อมูล';$('#content').innerHTML=panel(`<h2>โหลดข้อมูลไม่ได้</h2><p>${esc(errorMessage(e))}</p><button class="btn primary" data-action="reconnect">ลองเชื่อมต่อใหม่</button><button class="btn secondary" data-action="login">เข้าสู่ระบบ LINE ใหม่</button>`)}
}
async function directory(){if(state.directory)return state.directory;const role=state.role;const data=await api('admin_bootstrap');if(state.role===role)state.directory=data;return data}
function dayPicker(){return `<label class="field date-field"><span>วันที่</span><input type="date" id="workDate" value="${state.date}" required></label>`}
function eventsTable(events){const names={CHECK_IN:'เข้างาน',CHECK_OUT:'ออกงาน',BREAK_OUT:'ออกพัก',BREAK_IN:'กลับจากพัก',IN:'เข้างาน',OUT:'ออกงาน'};return table(['เหตุการณ์','เวลา'],(events||[]).map(e=>[names[e.event_type]||e.event_type,time(e.event_at)]))}
function attendancePeople(rows){
 return '<div class="attendance-people">'+rows.map(r=>{const employee=r.employee||{};return `<button class="attendance-person" data-employee="${esc(r.employee_id||employee.id)}"><span class="person-avatar">${esc((employee.employee_code||'').slice(0,2)||'—')}</span><span class="person-identity"><strong>${esc(employee.name||'ไม่พบชื่อพนักงาน')}</strong><small>${esc(employee.employee_code||'—')}</small></span><span class="person-time"><strong>${time(r.first_in_at)}</strong><small>${r.last_out_at?'ออกงาน '+time(r.last_out_at):r.first_in_at?'เข้างานแล้ว':esc(r.schedule_status||'ยังไม่ลงเวลา')}</small></span></button>`}).join('')+(rows.length?'':empty('ไม่พบข้อมูลในวันที่เลือก'))+'</div>';
}
function weekPicker(){
 const date=new Date(state.date+'T12:00:00Z'),weekday=date.getUTCDay();date.setUTCDate(date.getUTCDate()-(weekday===0?6:weekday-1));
 return '<div class="week-strip">'+['จ','อ','พ','พฤ','ศ','ส','อา'].map((label,i)=>{const d=new Date(date);d.setUTCDate(d.getUTCDate()+i);const key=d.toISOString().slice(0,10);return `<button data-dashboard-day="${key}" aria-label="${esc(displayDate(key))}" aria-pressed="${key===state.date}"><span>${label}</span><strong>${d.getUTCDate()}</strong></button>`}).join('')+'</div>';
}

function occupationalView(employee,data={},preview=false){
 const mode=employee?.attendance_mode;
 if(!['MULTI_BRANCH','DRIVER'].includes(mode))return '';
 const ba=mode==='MULTI_BRANCH',labels=ba?['เริ่มวันทำงาน','เข้าสาขา','ออกพัก','กลับจากพัก','ออกสาขา','จบวันทำงาน']:['เข้างาน','ออกพัก','กลับจากพัก','ออกงาน'];
 const names={DAY_IN:'เริ่มวันทำงาน',BRANCH_IN:'เข้าสาขา',BREAK_OUT:'ออกพัก',BREAK_IN:'กลับจากพัก',BRANCH_OUT:'ออกสาขา',DAY_OUT:'จบวันทำงาน',IN:'เข้างาน',OUT:'ออกงาน'};
 return panel(`<div class="section-heading"><h2>${ba?'BA · งานสาขา':'Driver · งานขับรถ'}</h2><span class="attendance-tag">${preview?'ตัวอย่างหน้าจอ':'ข้อมูลของฉัน'}</span></div><div class="clock-actions">${labels.map(disabled).join('')}</div><h3>${ba?'การเข้าสาขาวันนี้':'การลงเวลาวันนี้'}</h3>${table(['รายการ','เวลา',...(ba?['สาขา']:[])],(data.events||[]).map(e=>[names[e.event_type]||e.event_type,time(e.event_at),...(ba?[e.office?.name||e.office_name||e.office_id||'—']:[])]))}${preview?'<p>ตัวอย่างหน้าตาเท่านั้น ไม่มีข้อมูลพนักงานจริง และไม่บันทึกการลงเวลา</p>':''}`);
}
function showRolePreview(mode){
 if(state.role!=='admin'||!state.boot?.isAdmin||String(state.boot.adminRole).toUpperCase()==='HR'||!['MULTI_BRANCH','DRIVER'].includes(mode))return;
 $('#actionTitle').textContent='ดูหน้าพนักงาน';
 $('#actionBody').innerHTML=`<div class="request-shortcuts"><button class="btn ${mode==='MULTI_BRANCH'?'primary':'secondary'}" data-role-preview="MULTI_BRANCH">BA</button><button class="btn ${mode==='DRIVER'?'primary':'secondary'}" data-role-preview="DRIVER">Driver</button></div>`+occupationalView({attendance_mode:mode},{},true);
 $('#actionDialog').showModal();
}

async function clockView(){
 if(!state.boot.employee)return panel(empty('บัญชีนี้ยังไม่ผูกกับพนักงาน'));
 const data=await api('today',{date:dateKey()}),daily=data.daily;
 const latest=(data.events||[]).slice().sort((a,b)=>String(a.event_at).localeCompare(String(b.event_at))).at(-1);
 const status=latest?({IN:'เข้างานแล้ว',CHECK_IN:'เข้างานแล้ว',BREAK_OUT:'กำลังพัก',BREAK_IN:'กลับจากพักแล้ว',DAY_IN:'เริ่มวันทำงานแล้ว',BRANCH_IN:'อยู่ที่สาขา',BRANCH_OUT:'ออกจากสาขาแล้ว',DAY_OUT:'จบวันทำงานแล้ว',OUT:'ออกงานแล้ว',CHECK_OUT:'ออกงานแล้ว'}[latest.event_type]||'มีการลงเวลาแล้ว'):'ยังไม่ลงเวลา';
 return `<div class="view-heading"><div><p class="page-context">${esc(person(state.boot.employee))}</p><h1>วันทำงานของฉัน</h1></div></div><div class="personal-clock-layout"><section class="panel clock-card"><p data-clock-date></p><div class="big-time" data-clock></div><span class="attendance-tag">${status}${latest?' · '+time(latest.event_at):''}</span>${['MULTI_BRANCH','DRIVER'].includes(state.boot.employee.attendance_mode)?'':`<div class="clock-actions">${disabled('เข้างาน')}${disabled('ออกพัก')}${disabled('กลับจากพัก')}${disabled('ออกงาน')}</div>`}</section><section class="panel clock-summary"><h2>เวลาของฉันวันนี้</h2>${[['เข้างาน',daily?.first_in_at],['ออกพัก',daily?.break_out_at],['กลับจากพัก',daily?.break_in_at],['ออกงาน',daily?.last_out_at]].map(([label,value])=>`<div class="time-line"><span>${label}</span><strong>${time(value)}</strong></div>`).join('')}<div class="time-line"><span>ทำงานสุทธิ</span><strong>${hours(daily?.paid_work_hours)}</strong></div></section></div>${occupationalView(state.boot.employee,data)}`;
}
async function dashboardView(){
 const [d,requests]=await Promise.all([api('admin_daily',{date:state.date}),requestQueue()]);
 return `<div class="dashboard-heading"><div><p class="page-context">${state.role==='hr'?'HR · Head Office':'Admin · ทุกกลุ่มพนักงาน'}</p><h1>ภาพรวมวันนี้</h1></div>${dayPicker()}</div><div class="stats">${[['เข้างานแล้ว',d.summary.checked_in],['ยังไม่เข้างาน',d.summary.not_checked_in],['ลา',d.summary.leave],['ออกงานแล้ว',d.summary.checked_out],['วันหยุด',d.summary.off],['กำลังพัก',d.summary.on_break]].map(([label,count])=>`<article class="stat-card"><span>${label}</span><strong>${count??'—'}</strong></article>`).join('')}</div><div class="dashboard-layout"><section class="panel dashboard-main"><div class="section-heading"><h2>การลงเวลาวันนี้</h2><button class="btn secondary" data-page="employees">${uiIcon('arrow')}ดูพนักงานทั้งหมด</button></div>${attendancePeople(d.rows)}<details class="event-details"><summary>ตารางเวลารายละเอียด</summary>${dailyTable(d.rows)}</details></section><aside class="dashboard-aside"><section class="panel dashboard-report"><h2>รายงาน</h2><button class="btn primary" data-page="reports">${uiIcon('reports')}เปิดศูนย์รายงาน</button></section><section class="panel"><h2>สัปดาห์นี้</h2>${weekPicker()}<p class="week-caption">${displayDate(state.date)}</p><button class="btn secondary" data-page="schedule">ดูตารางงาน</button></section></aside><section class="panel dashboard-requests"><div class="section-heading"><h2>คำขอใหม่ / รออนุมัติ</h2><button class="btn secondary" data-page="clock-approvals">ดูทั้งหมด</button></div>${requestList(requests,5)}${state.role==='admin'?'<div class="request-shortcuts"><button class="btn secondary" data-page="line">LINE Report</button><button class="btn secondary" data-role-preview="MULTI_BRANCH">ดูหน้า BA / Driver</button></div>':''}</section></div>`;
}
function dailyTable(rows){return table(['พนักงาน','วันที่','เข้างาน','ออกงาน','ชั่วโมงทำงาน'],(rows||[]).map(r=>[person(r.employee),r.work_date,time(r.first_in_at),time(r.last_out_at),hours(r.paid_work_hours)]))}
async function employeesView(){const d=await directory();return panel(`<label class="field">ค้นหาพนักงาน<input id="employeeSearch" type="search" placeholder="ชื่อหรือรหัส"></label><div id="employeeResults">${employeeRows(d.employees)}</div>${disabled('เพิ่มพนักงาน')}`)}
function employeeRows(employees,attendanceOnly=false){return (employees||[]).map(e=>`<div class="employee-row"><div><strong>${esc(person(e))}</strong><small>${esc(e.attendance_mode)} · ${e.active?'Active':'Inactive'}</small></div><button class="btn secondary" ${attendanceOnly?'data-employee':'data-profile'}="${esc(e.id)}">${attendanceOnly?'ดูการลงเวลา':'ดูข้อมูล'}</button>${disabled('แก้ไข')}</div>`).join('')||empty('ไม่พบพนักงาน')}

function scheduleLabel(value){return ({WORK:'ทำงาน',OFF:'วันหยุด',WFH:'WFH',SICK_LEAVE:'ลาป่วย',BUSINESS_LEAVE:'ลากิจ',VACATION:'ลาพักร้อน',UNPAID_LEAVE:'ลาไม่รับค่าจ้าง',FUTURE:'ยังไม่ถึงวัน',NO_SCHEDULE:'ไม่มีตาราง'})[value]||value||'ไม่มีข้อมูลตาราง'}
async function scheduleView(){
 const d=await api('admin_daily',{date:state.date});
 return `<div class="schedule-toolbar">${dayPicker()}<button class="btn secondary" data-today>วันนี้</button></div><div class="schedule-layout">${panel(calendarGrid([],true))}${panel(`<h2>${displayDate(state.date)}</h2><p class="panel-sub">มีเวลาเข้า ${d.rows.filter(r=>r.first_in_at).length} คน</p>${d.rows.map(r=>`<button class="schedule-entry" data-employee="${esc(r.employee_id||r.employee?.id)}"><strong>${esc(person(r.employee))}</strong><span>เข้า ${time(r.first_in_at)} · ออก ${time(r.last_out_at)}</span><span>พัก ${time(r.break_out_at)} – ${time(r.break_in_at)}</span><span>ทำงานสุทธิ ${hours(r.paid_work_hours)}</span><span class="entry-link">ดูรายละเอียด</span></button>`).join('')||empty('ไม่พบข้อมูลการลงเวลาในวันที่เลือก')}`)}</div>`;
}
function calendarGrid(rows,management=false){
 const [y,m]=state.month.split('-').map(Number),first=new Date(Date.UTC(y,m-1,1)).getUTCDay(),total=new Date(Date.UTC(y,m,0)).getUTCDate();
 const byDate=new Map(rows.map(r=>[r.work_date,r]));let cells=Array(first).fill('<div aria-hidden="true"></div>');
 for(let day=1;day<=total;day++){
  const date=`${state.month}-${String(day).padStart(2,'0')}`,r=byDate.get(date);
  const label=r?.first_in_at?(r.last_out_at?'มีเวลาเข้า–ออก':'ยังไม่ออกงาน'):r?scheduleLabel(r.schedule_status):'ไม่มีข้อมูล';
  const detail=r?.first_in_at?time(r.first_in_at):label;
  cells.push(`<button class="cal-day cal-button ${date===state.selected?'selected':''} ${date===dateKey()?'is-today':''}" data-day="${date}" aria-pressed="${date===state.selected}" aria-label="${esc(displayDate(date))}${management?'':': '+esc(label)}"><strong>${day}</strong>${management?'':`<span class="cal-detail">${esc(detail)}</span>`}</button>`);
 }
 return `<div class="month-nav"><button class="icon-button" data-shift="-1" aria-label="เดือนก่อนหน้า">‹</button><input type="month" aria-label="เดือนปฏิทิน" id="month" value="${state.month}"><button class="icon-button" data-shift="1" aria-label="เดือนถัดไป">›</button></div><div class="calendar">${['อา','จ','อ','พ','พฤ','ศ','ส'].map(x=>`<span class="cal-head">${x}</span>`).join('')}${cells.join('')}</div>${management?'<p class="calendar-key">เลือกวันเพื่อดูการลงเวลาของพนักงาน</p>':'<p class="calendar-key">แสดงเวลาเข้า หรือสถานะตาราง · กดวันที่ดูรายละเอียด</p>'}`;
}
async function calendarView(){
 const [month,day]=await Promise.all([api('employee_month',{month:state.month}),api('today',{date:state.selected})]);
 const rows=month.rows||[],daily=day.daily;
 return `<div class="schedule-toolbar"><p>${esc(person(state.boot.employee))}</p><button class="btn secondary" data-today>วันนี้</button></div><div class="personal-calendar-layout">${panel(calendarGrid(rows))}${panel(`<h2>${displayDate(state.selected)}</h2><p>${esc(scheduleLabel(day.schedule?.schedule_status||daily?.schedule_status))}</p>${[['เข้างาน',time(daily?.first_in_at)],['ออกพัก',time(daily?.break_out_at)],['กลับจากพัก',time(daily?.break_in_at)],['ออกงาน',time(daily?.last_out_at)],['ทำงานสุทธิ',hours(daily?.paid_work_hours)],['ชั่วโมงที่กำหนด',hours(day.schedule?.required_hours??daily?.required_hours)]].map(([label,value])=>`<div class="time-line"><span>${label}</span><strong>${value}</strong></div>`).join('')}`)}</div>`;
}
async function reportView(){
 const daily=state.reportPeriod!=='monthly';
 const tabs=`<div class="tabs report-tabs"><button class="tab ${daily&&state.reportPeriod!=='individual'?'active':''}" data-report-period="daily">รายงานรายวัน</button><button class="tab ${!daily?'active':''}" data-report-period="monthly">Monthly Summary</button><button class="tab ${state.reportPeriod==='individual'?'active':''}" data-report-period="individual">รายบุคคล / Excel</button></div>`;
 if(state.reportPeriod==='individual')return tabs+await individualReportView();
 if(daily){const d=await api('admin_daily',{date:state.date});return `${tabs}<div class="reports-head"><h2>รายงานรายวัน</h2>${dayPicker()}</div>${panel(`<div class="print-heading"><h2>Kitty Attendance · รายงานรายวัน</h2><p>${displayDate(state.date)} · ${state.role==='hr'?'Head Office':'ทุกกลุ่มพนักงาน'}</p></div>${table(['พนักงาน','สถานะ','เข้างาน','ออกพัก','กลับจากพัก','ออกงาน','ทำงาน','ขาด','เกิน'],d.rows.map(r=>[person(r.employee),r.schedule_status||r.work_status||'—',time(r.first_in_at),time(r.break_out_at),time(r.break_in_at),time(r.last_out_at),hours(r.paid_work_hours),hours(r.short_hours),hours(r.over_hours)]))}<button class="btn primary" data-action="print">พิมพ์ / บันทึก PDF</button><button class="btn secondary" data-action="retry">โหลดรายงานใหม่</button>`)}`}
 const d=await api('admin_monthly_summary',{month:state.month});return `${tabs}<div class="reports-head"><h2>Monthly Summary</h2><label class="field">เดือน<input type="month" id="month" value="${state.month}"></label></div>${panel(`<div class="print-heading"><h2>Kitty Attendance · Monthly Summary</h2><p>${esc(state.month)} · ${state.role==='hr'?'Head Office ยกเว้น Shane และ Peet':'ทุกกลุ่มพนักงาน'}</p></div><p>เริ่ม ${esc(d.period_start)}${d.period_end_inclusive?' ถึง '+esc(d.period_end_inclusive):''}</p>${table(['พนักงาน','วันทำงาน','ชั่วโมงทำงาน','ชั่วโมงขาด','ชั่วโมงเกิน','เวลาชด','ชั่วโมงสุทธิ'],d.rows.map(r=>[person(r),r.work_days,hours(r.paid_work_hours),hours(r.short_hours),hours(r.over_hours),hours(r.makeup_hours),hours(r.net_hours)]))}<p class="panel-sub">ยอดจากระบบเดิม ยังไม่รวมกฎเวลาชดและค่าขอแก้เวลาเวอร์ชันทดลอง</p><button class="btn primary" data-action="print">พิมพ์ / บันทึก PDF</button>`)}`;
}
function reportEmployees(employees,role,scope='active'){
 return employees.filter(e=>(scope==='all'||e.active===true)&&(role!=='hr'||!(/\b(shane|peet)\b/i.test(e.name||''))));
}
async function individualReportView(){
 state.individualReport=null;
 const role=state.role,month=state.month,version=renderVersion,scope=state.reportScope||'active';
 const d=await directory();const employees=reportEmployees(d.employees,role,scope);
 if(version!==renderVersion||role!==state.role||month!==state.month)return '';
 const id=state.reportEmployee==='ALL'&&employees.length?'ALL':employees.some(e=>e.id===state.reportEmployee)?state.reportEmployee:'';
 state.reportEmployee=id;
 const controls=`<div class="individual-report-controls"><label class="field">สถานะพนักงาน<select id="reportScope"><option value="active" ${scope==='active'?'selected':''}>Active เท่านั้น</option><option value="all" ${scope==='all'?'selected':''}>ทุกสถานะ (รวม Inactive)</option></select></label><label class="field">พนักงาน<select id="reportEmployee"><option value="">เลือกพนักงาน</option>${employees.length?`<option value="ALL" ${id==='ALL'?'selected':''}>พนักงานทั้งหมดในตัวกรอง (${employees.length} คน)</option>`:''}${employees.map(e=>`<option value="${esc(e.id)}" ${e.id===id?'selected':''}>${esc(person(e))}</option>`).join('')}</select></label><label class="field">เดือน<input type="month" id="month" value="${esc(month)}"></label></div>`;
 if(!id)return controls+panel('<p>เลือกพนักงาน หรือพนักงานทั้งหมด เพื่อดาวน์โหลดข้อมูลรายวันในชีทเดียว</p>');
 const reports=[];
 const selected=id==='ALL'?employees:employees.filter(e=>e.id===id);
 for(let i=0;i<selected.length;i+=3){
  if(version!==renderVersion)return '';
  const batch=await Promise.all(selected.slice(i,i+3).map(async e=>mergeSandboxReport(await api('admin_individual_report',{employeeId:e.id,month}),combineQueues(await api('staging_request_report',{employeeId:e.id,month}),await api('staging_ot_report',{employeeId:e.id,month})))));
  if(batch.some((r,j)=>r.employee?.id!==selected[i+j].id||r.month!==month))throw Error('ข้อมูลรายงานไม่ตรงกับที่เลือก กรุณาโหลดใหม่');
  if(scope==='active'&&batch.some(r=>r.employee.active!==true)){state.directory=null;throw Error('สถานะพนักงานเปลี่ยนระหว่างโหลด กรุณาโหลดรายชื่อใหม่')}
  reports.push(...batch);
  if(id==='ALL'&&version===renderVersion)$('#content').innerHTML=controls+panel(`<p role="status">กำลังโหลดรายงาน ${reports.length} / ${selected.length} คน…</p>`);
 }
 if(version!==renderVersion||role!==state.role||month!==state.month||id!==state.reportEmployee)return '';
 const report=id==='ALL'?{combined:true,employee:{id:'ALL',employee_code:'ALL',name:'พนักงานทั้งหมด'},rows:reports.flatMap(r=>r.rows.map(row=>({...row,employee:r.employee}))),warnings:[...new Set(reports.flatMap(r=>r.warnings||[]))],month,generated_at:reports[0].generated_at,employeeCount:reports.length}:reports[0];
 state.individualReport={...report,role,scope};
 const helper=window.KittyIndividualReport,previewRows=report.rows.slice(0,100);
 return controls+panel(`<div class="reports-head"><h2>${id==='ALL'?`พนักงานทั้งหมด ${reports.length} คน`:esc(person(report.employee))}</h2><button class="btn primary" data-action="individual-excel">ดาวน์โหลด Excel</button></div>${report.warnings.map(w=>`<p class="report-warning">${esc(w)}</p>`).join('')}<p class="panel-sub">รวม ${report.rows.length} แถว · Excel มีข้อมูลครบในชีทเดียว${report.rows.length>100?' · ตัวอย่างด้านล่าง 100 แถวแรก':''}</p>${table([...(id==='ALL'?['พนักงาน']:[]),'วันที่','สถานะ','เข้างาน','ออกพัก','กลับจากพัก','ออกงาน','ทำงานสุทธิ','หมายเหตุ / คำขอ'],previewRows.map(r=>[...(id==='ALL'?[person(r.employee)]:[]),r.work_date,helper.status[r.schedule_status]||r.schedule_status,time(r.first_in_at),time(r.break_out_at),time(r.break_in_at),time(r.last_out_at),hours(r.paid_work_hours),helper.notes(r)]))}`);
}

function mergeSandboxReport(report,requests){
 const records=(requests.rows||[]).filter(r=>['leave','correction','overtime'].includes(r.kind)).map(r=>({...r,sandbox:true,effective_date:r.work_date}));
 return {...report,rows:report.rows.map(row=>({...row,requests:[...(row.requests||[]),...records.filter(r=>r.work_date===row.work_date||(r.created_at&&dateKey(new Date(r.created_at))===row.work_date))]})),warnings:[...(report.warnings||[]),'คำขอทดลองแสดงเป็นหมายเหตุเท่านั้น ยังไม่ปรับยอดเวลาหรือเงินเดือนของระบบเดิม']};
}

async function downloadIndividualReport(button){
 const report=state.individualReport;
 const valid=()=>report&&state.page==='reports'&&state.reportPeriod==='individual'&&!state.personal&&report.role===state.role&&report.scope===(state.reportScope||'active')&&report.month===state.month&&report.employee.id===state.reportEmployee;
 if(!valid())return;
 button.disabled=true;button.textContent='กำลังสร้าง Excel…';
 try{const wb=window.KittyIndividualReport.build(report,window.ExcelJS);const bytes=await wb.xlsx.writeBuffer();if(!valid())return;const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download=`Attendance_${String(report.employee.employee_code).replace(/[^a-zA-Z0-9_-]/g,'_')}_${report.scope}_${report.month}.xlsx`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);toast('สร้างไฟล์ Excel แล้ว กรุณาดูรายการดาวน์โหลด')}catch(e){toast(errorMessage(e))}finally{button.disabled=false;button.textContent='ดาวน์โหลด Excel'}
}
async function lineView(){const type=state.reportType||'END_DAY';const d=await api('admin_report_preview',{date:state.date,reportType:type});return `${dayPicker()}<label class="field">รายงาน<select id="reportType"><option value="MIDDAY" ${type==='MIDDAY'?'selected':''}>13:00</option><option value="END_DAY" ${type==='END_DAY'?'selected':''}>22:00</option></select></label>${panel(`<pre class="report-message">${esc(d.message)}</pre>${disabled('Send Now')}`)}`}
function draftKey(){return `kitty-staging-drafts:${state.boot?.employee?.id||state.boot?.profile?.userId||'unlinked'}`}
function drafts(){try{return JSON.parse(sessionStorage.getItem(draftKey())||'[]')}catch{return []}}
function draftHistory(kind){return drafts().filter(d=>d.kind===kind).map(d=>`<div class="leave-card"><div><strong>${esc(d.date)} · ${esc(d.label)}</strong><p>${esc(d.reason)}</p><small>แบบร่างในเครื่อง · ยังไม่ส่งอนุมัติ</small></div><button class="btn primary" data-send-draft="${esc(d.id)}">ส่งให้ HR</button><button class="btn secondary" data-remove-draft="${esc(d.id)}">ลบแบบร่าง</button></div>`).join('')||empty('ยังไม่มีแบบร่างในเครื่องนี้')}
function leaveView(){return panel(`<h2>ขอลา</h2><form id="leaveForm" class="request-form"><label>วันที่ลา<input name="date" type="date" value="${dateKey()}" required></label><label>ประเภทการลา<select name="type"><option>ลากิจ</option><option>ลาป่วย</option><option>ลาพักร้อน</option><option>ลาไม่รับค่าจ้าง</option></select></label><label>ระยะเวลา<select name="duration" id="leaveDuration"><option value="FULL_DAY">เต็มวัน</option><option value="HALF_DAY_AM">ครึ่งวันเช้า</option><option value="HALF_DAY_PM">ครึ่งวันบ่าย</option></select></label><p id="halfDayRule" hidden>วันลาครึ่งวันต้องทำงานสุทธิอย่างน้อย 4 ชั่วโมง หลังหักเวลาพัก</p><label>เหตุผล<textarea name="reason" rows="3" required maxlength="1000"></textarea></label><button class="btn secondary" type="submit">บันทึกแบบร่างในเครื่อง</button><button class="btn primary" type="submit" data-send-request="true">ส่งให้ HR</button><p class="panel-sub">ส่งเข้าชุดทดลองเท่านั้น ไม่แก้ตารางงานหรือเงินเดือนเดิม</p></form><h3>แบบร่างของฉัน</h3>${draftHistory('leave')}`)}
function correctionView(){return panel(`<h2>ขอลงเวลาย้อนหลัง</h2><form id="correctionForm" class="request-form"><label>วันที่<input name="date" type="date" max="${dateKey()}" value="${dateKey()}" required></label><label>เหตุการณ์<select name="event"><option>เข้างาน</option><option>ออกงาน</option><option>ออกพัก</option><option>กลับจากพัก</option></select></label><label>เวลา<input name="time" type="time" required></label><label>เหตุผล<textarea name="reason" required maxlength="1000"></textarea></label><button class="btn secondary" type="submit">บันทึกแบบร่างในเครื่อง</button><button class="btn primary" type="submit" data-send-request="true">ส่งให้ HR</button></form>${draftHistory('correction')}`)}
async function leaveManagementView(){const d=await api('staging_schedule',{date:state.date});const rows=d.rows.filter(r=>['SICK_LEAVE','BUSINESS_LEAVE','VACATION','UNPAID_LEAVE','LEAVE'].includes(r.schedule_status));return `${dayPicker()}${panel(`<h2>การลาที่บันทึกในตารางงาน</h2>${table(['พนักงาน','วันที่','ประเภท'],rows.map(r=>[person(r.employee),r.work_date,r.schedule_status]))}<p class="panel-sub">ข้อมูลจากระบบเดิม · ระบบรับคำขอและอนุมัติใน Staging ยังไม่เชื่อมต่อ</p>`)}`}
function unavailableView(){return panel(`<h2>${esc(activeMenu().find(x=>x[0]===state.page)?.[2]||'รายการ')}</h2><p>หน้านี้ยังไม่เชื่อมข้อมูลและการบันทึกใน Staging</p><p class="panel-sub">ใช้งานฟังก์ชันนี้ผ่านระบบเดิมได้ตามปกติ</p>`)}
function managementView(){return `<div class="management-grid">${state.role==='admin'?'<button class="management-card" data-role-preview="MULTI_BRANCH"><strong>ดูหน้าพนักงาน BA / Driver</strong><span>›</span></button>':''}${activeMenu().filter(x=>!['dashboard','employees','schedule','reports'].includes(x[0])).map(([id,icon,label])=>`<button class="management-card" data-page="${id}"><span class="nav-symbol">${uiIcon(id)}</span><strong>${label}</strong><span>›</span></button>`).join('')}</div>`}
async function attendanceView(){const d=await directory();return `${dayPicker()}${panel(`<h2>เลือกพนักงานเพื่อดูเวลา</h2>${employeeRows(d.employees,true)}`)}`}
async function render(){
 navigation();if(!state.connected)return;
 const version=++renderVersion;$('#content').innerHTML=panel('กำลังโหลดข้อมูล…');
 const views={clock:clockView,dashboard:dashboardView,employees:employeesView,schedule:scheduleView,calendar:calendarView,reports:reportView,line:lineView,'my-leave':()=>personalRequestView('leave'),'clock-request':()=>personalRequestView('correction'),more:managementView,attendance:attendanceView,offices:async()=>{const d=await directory();return panel(table(['รหัส','สำนักงาน'],d.offices.map(o=>[o.office_code,o.name])))},leave:()=>requestsView('leave'),'clock-approvals':()=>requestsView('correction')};
 try{const html=await (views[state.page]||unavailableView)();if(version===renderVersion){$('#content').innerHTML=html+(html.includes(' disabled')?'<p class="availability-note">ปุ่มสีเทายังไม่เปิดการบันทึกใน Staging · ใช้งานผ่านระบบเดิมได้ตามปกติ</p>':'');tick()}}
 catch(e){if(version===renderVersion)$('#content').innerHTML=panel(`<h2>โหลดข้อมูลไม่สำเร็จ</h2><p>${esc(errorMessage(e))}</p><button class="btn primary" data-action="retry">ลองใหม่</button>`)}
}
function tick(){document.querySelectorAll('[data-clock]').forEach(el=>el.textContent=new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(now()));document.querySelectorAll('[data-clock-date]').forEach(el=>el.textContent=displayDate(dateKey()))}
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),4000)}


const requestCache=new Map(),readMemory=new Map();
function requestScope(){return state.boot?.profile?.userId ? 'kitty-request-read:'+state.boot.profile.userId+':'+state.role : null}
function readRequestIds(){const key=requestScope();if(!key)return new Set();const memory=readMemory.get(key)||[];try{const stored=JSON.parse(localStorage.getItem(key)||'[]');return new Set([...memory,...(Array.isArray(stored)?stored:[])])}catch{return new Set(memory)}}
function requestKey(r){return r.kind+':'+r.id}
function unreadRequests(kind){if(state.personal||!['hr','admin'].includes(state.role))return [];const ids=readRequestIds();return (requestCache.get(requestScope())?.rows||[]).filter(r=>r.id&&requestCategory(r)===kind&&!ids.has(requestKey(r)))}
function requestBadge(page){const kind=page==='leave'?'leave':page==='clock-approvals'?'correction':null;return kind&&unreadRequests(kind).length?'<span class="unread-dot" role="img" aria-label="มีคำขอยังไม่ได้อ่าน"></span>':''}
function requestCategory(r){return r.kind==='overtime'?'correction':r.kind}
function combineQueues(a,b){return {rows:[...(a.rows||[]),...(b.rows||[])].sort((x,y)=>String(y.created_at).localeCompare(String(x.created_at))),warnings:[...(a.warnings||[]),...(b.warnings||[])]}}
function overtimeState(r){return r.settlement_state==='READY'?`ชดได้ ${hours(Number(r.minutes)/60)} · ยังขาด ${hours(Number(r.remaining_short_minutes||0)/60)}`:r.settlement_state==='SCHEDULE_CHANGED'?'ตารางงานเปลี่ยน กรุณาให้ HR ตรวจสอบ':r.settlement_state==='INACTIVE'?'ไม่ได้ใช้ชั่วโมง':'รอตรวจเวลาครบทั้งสองวัน'}
function overtimeDetails(r){return table(['วันทำงาน','เวลาสุทธิ','เวลาที่กำหนด'],[[r.source_date||'—',hours(r.source_paid_minutes==null?null:r.source_paid_minutes/60),hours(r.source_required_minutes==null?null:r.source_required_minutes/60)],[r.target_date||'—',hours(r.target_paid_minutes==null?null:r.target_paid_minutes/60),hours(r.target_required_minutes==null?null:r.target_required_minutes/60)]])+ `<p role="status">${esc(overtimeState(r))}</p>`}
function overtimeDescription(r){return `${r.mode==='USE_PRIOR'?'ใช้ชั่วโมงเกิน':'ชดชั่วโมงขาด'} ${esc(overtimeState(r))} · ${esc(r.source_date||'—')} → ${esc(r.target_date||'—')}`}
async function requestQueue(){
 const scope=requestScope();
 try{const [regular,ot]=await Promise.all([api('staging_request_queue'),api('staging_ot_queue')]);const data=combineQueues(regular,ot);if(scope&&scope===requestScope()){requestCache.set(scope,data);navigation()}return data}
 catch(error){return {rows:[],warnings:[['STAGING_READ_ONLY','UNKNOWN_ACTION'].includes(error.message)?'รายการคำขอยังรอเปิดบริการอ่านข้อมูล':'โหลดคำขอไม่สำเร็จ: '+errorMessage(error)]}}
}
async function refreshRequestNotifications(){if(!state.connected||state.personal||!['admin','hr'].includes(state.role)||document.hidden||refreshRequestNotifications.busy)return;refreshRequestNotifications.busy=true;try{await requestQueue()}finally{refreshRequestNotifications.busy=false}}
function openRequest(key){
 const r=(requestCache.get(requestScope())?.rows||[]).find(r=>requestKey(r)===key);
 if(!r||state.personal||!['admin','hr'].includes(state.role))return;
 $('#actionTitle').textContent=r.kind==='leave'?'คำขอลา':r.kind==='overtime'?'ใช้โอที':'คำขอลงเวลา';
 $('#actionBody').innerHTML=`<h2>${esc(person(r.employee))}</h2><p>วันที่ ${esc(r.leave_date||r.work_date||'—')}</p><p>${r.kind==='overtime'?overtimeDescription(r):esc(r.duration||r.requested_event_type||'')}</p>${r.kind==='overtime'?overtimeDetails(r):''}${r.requested_event_at?`<p>เวลาที่ขอ ${time(r.requested_event_at)}</p>`:''}<p>${esc(r.reason||'ไม่ระบุเหตุผล')}</p><p>คำขอทดลอง · การอนุมัติไม่แก้ข้อมูลลงเวลาเดิม</p><label class="field">หมายเหตุการพิจารณา<textarea id="reviewReason" maxlength="1000"></textarea></label><div class="request-shortcuts"><button class="btn primary" data-review-kind="${esc(r.kind)}" data-review-id="${esc(r.id)}" data-decision="APPROVED">อนุมัติทดลอง</button><button class="btn secondary" data-review-kind="${esc(r.kind)}" data-review-id="${esc(r.id)}" data-decision="REJECTED">ปฏิเสธ</button></div>`;
 $('#actionDialog').showModal();
 const ids=readRequestIds();ids.add(key);readMemory.set(requestScope(),[...ids]);try{localStorage.setItem(requestScope(),JSON.stringify([...ids]))}catch{}
 navigation();
 document.querySelectorAll('[data-request-key]').forEach(button=>{if(button.dataset.requestKey===key){button.classList.remove('request-unread');button.querySelector('.request-read-label').textContent='อ่านแล้ว'}});
}
function requestList(data,limit=1000){
 const rows=data.rows||[],warnings=data.warnings||[];
 return warnings.map(w=>`<p class="report-warning">${esc(w)}</p>`).join('')+
 (rows.length?rows.slice(0,limit).map(r=>`<article class="request-item"><div><strong>${esc(person(r.employee))}</strong><span class="attendance-tag">รออนุมัติ</span></div><p>${r.kind==='leave'?'ขอลา':r.kind==='overtime'?'ใช้โอที':'ขอแก้เวลา'} · ${esc(r.leave_date||r.work_date||'—')}</p><p>${esc(r.reason||'ไม่ระบุเหตุผล')}</p><small>ส่ง ${r.created_at?esc(displayDate(dateKey(new Date(r.created_at)))+' '+time(r.created_at)):'—'}</small>${r.id?`<button class="btn secondary ${readRequestIds().has(requestKey(r))?'':'request-unread'}" data-request-key="${esc(requestKey(r))}"><span class="request-read-label">${readRequestIds().has(requestKey(r))?'อ่านแล้ว':'เปิดอ่านคำขอ'}</span></button>`:''}</article>`).join(''):warnings.length?'':empty('ไม่มีคำขอรออนุมัติ'))+
 (rows.length>limit?`<p class="panel-sub">แสดง ${limit} จาก ${rows.length} รายการที่โหลด</p>`:'');
}
async function requestsView(kind){
 const data=await requestQueue(),filtered={...data,rows:(data.rows||[]).filter(r=>requestCategory(r)===kind)};
 return panel(`<div class="section-heading"><h2>${kind==='leave'?'คำขอลา':'คำขอลงเวลา'}</h2><button class="btn secondary" data-action="retry">โหลดใหม่</button></div>${requestList(filtered)}<p class="panel-sub">ล่าสุดไม่เกิน 1,000 รายการ · ชุดทดลอง ไม่กระทบระบบเดิม</p>`)+(kind==='leave'?`<details class="panel"><summary>การลาที่บันทึกแล้ว</summary>${await leaveManagementView()}</details>`:'');
}

const requestErrors={OT_SCHEDULE_REQUIRED:'ยังไม่มีตารางงานครบสำหรับคู่วันทำงานนี้ กรุณาให้ HR ตรวจตาราง',OT_SOURCE_NOT_FINAL:'ต้องมีเวลาออกงานและสรุปเวลาสุทธิของวันที่นำชั่วโมงมาใช้ก่อน',OT_INSUFFICIENT_MINUTES:'ชั่วโมงที่ใช้ได้ไม่พอ หรือมีคำขอใช้ชั่วโมงนี้แล้ว',OT_WINDOW_EXPIRED:'ใช้ได้เฉพาะวันทำงานที่ติดกัน ไม่สามารถยกยอดมาใช้วันนี้ได้',OT_SCHEDULE_CHANGED:'ตารางงานเปลี่ยน กรุณาตรวจคู่วันและส่งคำขอใหม่',DUPLICATE_PENDING_REQUEST:'มีคำขอประเภทนี้ในวันเดียวกันรออนุมัติอยู่แล้ว',ALREADY_REVIEWED:'รายการนี้ถูกพิจารณาหรือยกเลิกแล้ว กรุณาโหลดใหม่',FUTURE_EVENT:'เวลาที่ขอยังมาไม่ถึง',REJECTION_REASON_REQUIRED:'กรุณาระบุเหตุผลที่ปฏิเสธ',FORBIDDEN:'คุณไม่มีสิทธิ์ดำเนินการกับคำขอนี้',REQUEST_SERVICE_ERROR:'บริการคำขอไม่พร้อม กรุณาลองใหม่',IDEMPOTENCY_CONFLICT:'ข้อมูลคำขอเปลี่ยนไป กรุณาส่งใหม่'};
function workflowError(error){return requestErrors[error.message]||errorMessage(error)}

function overtimeView(){return panel(`<h2>ใช้โอที</h2><form id="overtimeForm" class="request-form"><label>รูปแบบ<select name="mode"><option value="USE_PRIOR">ใช้ชั่วโมงเกินจากวันทำงานก่อนหน้า</option><option value="MAKEUP_NEXT">ชดชั่วโมงขาดในวันทำงานถัดไป</option></select></label><label>วันที่<input type="date" name="date" value="${dateKey()}" max="${dateKey()}" required></label><button type="button" class="btn secondary" data-ot-balance>ตรวจเวลาทั้งสองวัน</button><div id="otBalance" role="status"></div><label>เหตุผล<textarea name="reason" maxlength="1000" required></textarea></label><p class="panel-sub">ใช้เฉพาะคู่วันทำงานที่ติดกัน ไม่สะสมข้ามวัน · คำขอทดลอง</p><button class="btn primary" type="submit" data-send-request="true">ส่งให้ HR</button></form>`)}
async function loadOvertimeBalance(button){
 const form=$('#overtimeForm'),mode=form.elements.mode.value,date=form.elements.date.value,version=renderVersion;
 if(!date)return;button.disabled=true;
 try{const data=await api('staging_ot_balance',{mode,date});if(version===renderVersion&&form.elements.mode.value===mode&&form.elements.date.value===date)$('#otBalance').innerHTML=overtimeDetails(data)}
 catch(error){if(version===renderVersion)$('#otBalance').textContent=workflowError(error)}finally{button.disabled=false}
}

async function personalRequestView(kind){
 const form=kind==='leave'?leaveView():correctionView()+overtimeView();
 try{const data=combineQueues(await api('staging_request_mine'),kind==='correction'?await api('staging_ot_mine'):{rows:[]});return form+panel('<h2>คำขอที่ส่งแล้ว · ทดลอง</h2>'+myRequestHistory((data.rows||[]).filter(r=>r.kind===kind)))}
 catch(error){return form+panel(`<p class="report-warning">โหลดประวัติไม่สำเร็จ: ${esc(workflowError(error))}</p>`)}
}
function myRequestHistory(rows){
 const status={PENDING:'รออนุมัติ',APPROVED:'อนุมัติทดลอง',REJECTED:'ปฏิเสธ',CANCELLED:'ยกเลิก'};
 return rows.map(r=>`<article class="request-item ${r.kind==='correction'&&r.approved_sequence_in_month>=3?'frequent-request':''}"><strong>${esc(r.work_date)} · ${status[r.status]||esc(r.status)}</strong><p>${r.kind==='overtime'?overtimeDescription(r):''}</p><p>${esc(r.reason)}</p>${r.review_reason?`<p>หมายเหตุ: ${esc(r.review_reason)}</p>`:''}${r.approved_sequence_in_month?`<p class="${r.approved_sequence_in_month>=3?'report-warning':''}">ครั้งที่ ${r.approved_sequence_in_month}</p>`:''}${r.status==='PENDING'?`<button class="btn secondary" data-request-kind="${esc(r.kind)}" data-cancel-request="${esc(r.id)}">ยกเลิกคำขอ</button>`:''}</article>`).join('')||empty('ยังไม่มีคำขอที่ส่งในชุดทดลอง');
}

async function sendDraft(button){
 const key=draftKey(),draft=drafts().find(d=>d.id===button.dataset.sendDraft);
 if(!draft||!state.boot?.employee||!['leave','correction'].includes(draft.kind))return;
 button.disabled=true;const version=renderVersion;
 const events={'เข้างาน':'IN','ออกพัก':'BREAK_OUT','กลับจากพัก':'BREAK_IN','ออกงาน':'OUT'};
 const payload={clientId:draft.id,kind:draft.kind,date:draft.date,reason:draft.reason,
   ...(draft.kind==='leave'?{type:draft.type,duration:draft.duration}:{event:events[draft.event],time:draft.time})};
 try{
  await api('staging_request_submit',payload);
  try{const saved=JSON.parse(sessionStorage.getItem(key)||'[]');sessionStorage.setItem(key,JSON.stringify(saved.filter(d=>d.id!==draft.id)))}catch{toast('ส่งแล้ว แต่ลบแบบร่างในเครื่องไม่สำเร็จ ส่งซ้ำจะไม่สร้างคำขอซ้ำ')}
  if(version===renderVersion){await render();toast('ส่งแบบร่างให้ HR แล้ว')}
 }catch(error){toast(workflowError(error))}finally{button.disabled=false}
}

async function sendRequest(form,data,button){
 if(form.dataset.sending)return;
 if(form.id==='overtimeForm'){data={mode:data.mode,date:data.date,reason:data.reason}}
 const kind=form.id==='leaveForm'?'leave':form.id==='overtimeForm'?'overtime':'correction',events={'เข้างาน':'IN','ออกพัก':'BREAK_OUT','กลับจากพัก':'BREAK_IN','ออกงาน':'OUT'};
 const payload={...data,kind,event:kind==='correction'?events[data.event]:undefined};
 const fingerprint=JSON.stringify(payload);
 if(form.dataset.fingerprint!==fingerprint){form.dataset.clientId=crypto.randomUUID();form.dataset.fingerprint=fingerprint}
 payload.clientId=form.dataset.clientId;
 form.dataset.sending='true';button.disabled=true;const version=renderVersion;
 try{await api(kind==='overtime'?'staging_ot_submit':'staging_request_submit',payload);if(version===renderVersion){await render();toast('ส่งคำขอทดลองให้ HR แล้ว')}}catch(error){toast(workflowError(error))}finally{delete form.dataset.sending;button.disabled=false}
}
async function reviewRequest(button){
 if(button.disabled)return;
 const reason=$('#reviewReason').value.trim();
 if(button.dataset.decision==='REJECTED'&&!reason){toast('กรุณาระบุเหตุผลที่ปฏิเสธ');return}
 const buttons=document.querySelectorAll('[data-review-id]');buttons.forEach(b=>b.disabled=true);
 try{await api(button.dataset.reviewKind==='overtime'?'staging_ot_review':'staging_request_review',{id:button.dataset.reviewId,decision:button.dataset.decision,reviewReason:reason});$('#actionDialog').close();await render();toast('บันทึกผลพิจารณาในชุดทดลองแล้ว')}
 catch(error){toast(workflowError(error))}finally{buttons.forEach(b=>b.disabled=false)}
}
async function cancelRequest(button){
 button.disabled=true;
 try{await api(button.dataset.requestKind==='overtime'?'staging_ot_cancel':'staging_request_cancel',{id:button.dataset.cancelRequest});await render();toast('ยกเลิกคำขอทดลองแล้ว')}catch(error){toast(workflowError(error))}finally{button.disabled=false}
}

function profileFields(data){
 const e=data.employee,offKeys=['weekly_dayoff','weekly_dayoffs','weekly_days_off','weekly_off_days','day_off'];
 const value=offKeys.find(k=>e[k]!==undefined&&e[k]!==null);
 const dayoff=value?(Array.isArray(e[value])?e[value].join(', '):String(e[value])):'ยังไม่มีข้อมูลวันหยุดประจำสัปดาห์จากระบบ';
 return [['รหัสพนักงาน',e.employee_code],['ชื่อ',e.name],['สถานะ',e.active===true?'Active':e.active===false?'Inactive':'ไม่ระบุ'],['รูปแบบลงเวลา',e.attendance_mode],['LINE User ID',Object.prototype.hasOwnProperty.call(e,'line_user_id')?(e.line_user_id||'ยังไม่ผูก LINE'):'ยังไม่เชื่อมข้อมูล LINE User ID'],['สำนักงาน',data.office?.name||e.default_office_id||e.office_id||'ไม่ระบุ'],['วันหยุดประจำสัปดาห์',dayoff],['แผนก',e.department],['ตำแหน่ง',e.position],['โทรศัพท์',e.phone],['อีเมล',e.email]].map(([label,value])=>`<div class="profile-field"><dt>${label}</dt><dd>${esc(value??'ไม่ระบุ')}</dd></div>`).join('');
}
async function showProfile(id){
 const version=renderVersion;
 try{let d;try{d=await api('admin_employee_profile',{employeeId:id})}catch(error){if(!['STAGING_READ_ONLY','UNKNOWN_ACTION'].includes(error.message))throw error;const employee=state.directory?.employees.find(e=>e.id===id);if(!employee)throw error;d={employee,pending:true}}if(version!==renderVersion)return;$('#actionTitle').textContent='ข้อมูลพนักงาน';$('#actionBody').innerHTML=`${d.pending?'<p class="report-warning">ข้อมูลเพิ่มเติมของพนักงานยังรอเปิดบริการอ่านข้อมูล</p>':''}<dl class="employee-profile">${profileFields(d)}</dl>`;$('#actionDialog').showModal()}catch(error){toast(errorMessage(error))}
}

async function showEmployee(id){
 const e=state.directory?.employees.find(e=>e.id===id);const version=renderVersion;
 try{const d=await api('admin_employee_day',{employeeId:id,date:state.date});if(version!==renderVersion)return;$('#actionTitle').textContent=e?person(e):'การลงเวลาพนักงาน';$('#actionBody').innerHTML=`<p>${displayDate(state.date)}</p>${eventsTable(d.events)}<p>สถานะตาราง: ${esc(d.schedule?.schedule_status||'ไม่พบตาราง')}</p><p>ชั่วโมงทำงาน: ${hours(d.daily?.paid_work_hours)}</p>`;$('#actionDialog').showModal()}catch(e){toast(errorMessage(e))}
}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b||b.disabled)return;
 if(b.dataset.rolePreview){showRolePreview(b.dataset.rolePreview);return}
 if(b.dataset.otBalance!==undefined){loadOvertimeBalance(b);return}
 if(b.dataset.sendDraft){sendDraft(b);return}
 if(b.dataset.reviewId){reviewRequest(b);return}
 if(b.dataset.cancelRequest){cancelRequest(b);return}
 if(b.dataset.requestKey){openRequest(b.dataset.requestKey);return}
 if(b.dataset.action==='individual-excel'){downloadIndividualReport(b);return}
 if(b.dataset.reportPeriod){if(!['admin','hr'].includes(state.role)||state.personal)return;state.reportPeriod=b.dataset.reportPeriod;render();return}
 if(b.dataset.dashboardDay){state.date=b.dataset.dashboardDay;state.selected=state.date;state.month=state.date.slice(0,7);render();return}
 if(b.dataset.page){if(!activeMenu().some(x=>x[0]===b.dataset.page)&&!(b.dataset.page==='more'&&state.role==='admin'&&!state.personal))return;state.page=b.dataset.page;if(state.page==='schedule'){state.month=state.date.slice(0,7);state.selected=state.date}render();return}
 if(b.dataset.workspace){const actualHR=String(state.boot?.adminRole).toUpperCase()==='HR';if(!state.boot?.isAdmin||actualHR&&b.dataset.workspace!=='hr')return;if(!['admin','hr'].includes(b.dataset.workspace))return;state.role=b.dataset.workspace;state.personal=false;state.directory=null;state.page='dashboard';render();return}
 if(b.dataset.hrView){state.personal=b.dataset.hrView==='personal';state.page=state.personal?'clock':'dashboard';render();return}
 if(b.dataset.today!==undefined){state.date=dateKey();state.selected=state.date;state.month=state.date.slice(0,7);render();return}
 if(b.dataset.day){state.selected=b.dataset.day;if(state.page==='schedule')state.date=state.selected;render();return}
 if(b.dataset.shift){const [y,m]=state.month.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+Number(b.dataset.shift),1));state.month=d.toISOString().slice(0,7);state.selected=state.month+'-01';if(state.page==='schedule')state.date=state.selected;render();return}
 if(b.dataset.profile){showProfile(b.dataset.profile);return}
 if(b.dataset.employee){showEmployee(b.dataset.employee);return}
 if(b.dataset.removeDraft){try{sessionStorage.setItem(draftKey(),JSON.stringify(drafts().filter(d=>d.id!==b.dataset.removeDraft)));render()}catch{toast('ไม่สามารถลบแบบร่างได้')}return}
 if(b.dataset.action==='retry'){render();return}
 if(b.dataset.action==='reconnect'){init();return}
 if(b.dataset.action==='login'){if(window.liff){if(liff.isLoggedIn())liff.logout();liff.login({redirectUri:loginRedirect()})}else location.reload();return}
 if(b.dataset.action==='personal-leave'){state.personal=true;state.page='my-leave';render();return}
 if(b.dataset.action==='print')window.print();
});
document.addEventListener('input',e=>{if(e.target.id==='employeeSearch'){const query=e.target.value.toLowerCase();$('#employeeResults').innerHTML=employeeRows(state.directory.employees.filter(p=>person(p).toLowerCase().includes(query)))}});
document.addEventListener('change',e=>{if(e.target.closest?.('#overtimeForm')&&['mode','date'].includes(e.target.name))$('#otBalance').innerHTML='';if(e.target.id==='reportScope'){state.reportScope=e.target.value;state.reportEmployee='';state.directory=null;render()}if(e.target.id==='reportEmployee'){state.reportEmployee=e.target.value;render()}if(e.target.id==='workDate'&&e.target.value){state.date=e.target.value;state.selected=state.date;state.month=state.date.slice(0,7);render()}if(e.target.id==='month'&&e.target.value){state.month=e.target.value;state.selected=state.month+'-01';if(state.page==='schedule')state.date=state.selected;render()}if(e.target.id==='reportType'){state.reportType=e.target.value;render()}if(e.target.id==='leaveDuration')$('#halfDayRule').hidden=e.target.value==='FULL_DAY'});
document.addEventListener('submit',e=>{
 if(!['leaveForm','correctionForm','overtimeForm'].includes(e.target.id))return;e.preventDefault();
 if(!state.boot?.employee){toast('บัญชีนี้ยังไม่ผูกกับพนักงาน');return}
 const form=e.target,data=Object.fromEntries(new FormData(form));if(!data.reason.trim()){toast('กรุณาระบุเหตุผล');return}
 if(e.submitter?.dataset.sendRequest){sendRequest(form,data,e.submitter);return}
 const leave=form.id==='leaveForm';const duration={FULL_DAY:'เต็มวัน',HALF_DAY_AM:'ครึ่งวันเช้า',HALF_DAY_PM:'ครึ่งวันบ่าย'};
 const draft={...data,id:crypto.randomUUID(),kind:leave?'leave':'correction',label:leave?`${data.type} · ${duration[data.duration]}`:`${data.event} ${data.time}`,requiredNetMinutes:leave&&data.duration!=='FULL_DAY'?240:0,status:'LOCAL_DRAFT'};
 try{sessionStorage.setItem(draftKey(),JSON.stringify([...drafts(),draft]));render();toast('บันทึกแบบร่างในเครื่องแล้ว ยังไม่ส่งอนุมัติ')}catch{toast('บันทึกแบบร่างไม่ได้ กรุณาตรวจการตั้งค่าพื้นที่จัดเก็บของเบราว์เซอร์')}
});
$('#closeActionDialog').onclick=$('#cancelActionDialog').onclick=()=>$('#actionDialog').close();
setInterval(tick,1000);
setInterval(refreshRequestNotifications,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){tick();refreshRequestNotifications()}});
navigation();init();
