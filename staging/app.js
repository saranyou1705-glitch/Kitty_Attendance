'use strict';
const $ = s => document.querySelector(s);
const CONFIG = {liffId:'2010336238-UABz60wq', api:'https://rlqecfzddxpywbbbiirg.supabase.co/functions/v1/rapid-processor-staging'};
const menus = {
 admin:[['dashboard','⌂','ภาพรวมวันนี้'],['employees','♙','พนักงาน'],['offices','◇','Office / Branch'],['schedule','□','ตารางงาน'],['attendance','◷','แก้ไขเวลา'],['clock-approvals','✓','คำขอลงเวลา'],['leave','✈','การลา'],['reports','▤','รายงาน'],['line','◉','LINE Report'],['audit','≋','Audit Log'],['settings','⚙','ตั้งค่าระบบ']],
 hr:[['dashboard','⌂','ภาพรวมวันนี้'],['employees','♙','พนักงาน'],['schedule','□','ตารางงาน'],['clock-approvals','✓','คำขอลงเวลา'],['leave','✈','การลา'],['reports','▤','รายงาน']],
 employee:[['clock','◷','ลงเวลา'],['clock-request','＋','ขอลงเวลา'],['calendar','□','ปฏิทินของฉัน'],['my-leave','✈','การลาของฉัน']]
};
let offset=0, renderVersion=0;
const state={role:'employee',personal:false,page:'clock',boot:null,connected:false,directory:null,date:dateKey(),month:dateKey().slice(0,7),selected:dateKey()};
function now(){return new Date(Date.now()+offset)}
function dateKey(d=now()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)}
function displayDate(s){return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'long'}).format(new Date(`${s}T12:00:00+07:00`))}
function time(s){if(!s)return '—';const d=new Date(s);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function hours(v){return v===null||v===undefined?'—':Number(v).toLocaleString('th-TH',{maximumFractionDigits:2})}
function person(e){return `${e?.employee_code||''} · ${e?.name||'ไม่พบชื่อพนักงาน'}`}
function panel(s){return `<section class="panel">${s}</section>`}
function empty(s){return `<p class="empty-day">${esc(s)}</p>`}
function disabled(label){return `<button class="btn secondary" disabled title="ยังไม่เปิดการบันทึกในระบบทดลอง">${label}</button>`}
function table(headers,rows){return `<div class="data-scroll"><table class="data-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>${rows.length?'':empty('ไม่พบข้อมูลในช่วงที่เลือก')}`}
function errorMessage(error){const m=String(error?.message||error);if(m==='Failed to fetch')return 'เชื่อมต่อข้อมูลไม่สำเร็จ กรุณาลองใหม่หรือตรวจอินเทอร์เน็ต';if(m==='EMPLOYEE_NOT_REGISTERED')return 'บัญชี LINE นี้ยังไม่ผูกกับพนักงาน';if(m==='INVALID_LINE_TOKEN'||m==='MISSING_LINE_TOKEN')return 'การเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบ LINE อีกครั้ง';return m}
async function api(action,payload={}){
 const token=window.liff?.getAccessToken();if(!token)throw new Error('MISSING_LINE_TOKEN');
 const control=new AbortController(),timer=setTimeout(()=>control.abort(),20000);
 try{const r=await fetch(`${CONFIG.api}?action=${encodeURIComponent(action)}`,{method:'POST',headers:{'Content-Type':'application/json','x-line-access-token':token},body:JSON.stringify(payload),signal:control.signal});let data;try{data=await r.json()}catch{throw new Error(`บริการข้อมูลตอบกลับไม่สมบูรณ์ (${r.status})`)}if(!r.ok||!data.ok)throw new Error(data.message||data.error||`HTTP ${r.status}`);return data}finally{clearTimeout(timer)}
}
function activeMenu(){return state.personal?menus.employee:menus[state.role]}
function navigation(){
 const list=activeMenu();const render=items=>items.map(([id,icon,label])=>`<button class="nav-item ${state.page===id?'active':''}" data-page="${id}"><span>${icon}</span><span>${label}</span></button>`).join('');
 $('#desktopNav').innerHTML=render(list);
 $('#bottomNav').innerHTML=render(list.length>5?[list.find(x=>x[0]==='dashboard'),list.find(x=>x[0]==='employees'),list.find(x=>x[0]==='schedule'),list.find(x=>x[0]==='reports'),['more','•••','จัดการ']]:list);
 $('#workspaceSwitch').hidden=state.role==='employee';
 document.querySelectorAll('[data-hr-view]').forEach(b=>{b.classList.toggle('active',(b.dataset.hrView==='personal')===state.personal);if(b.dataset.hrView==='work')b.textContent=state.role==='admin'?'งาน Admin':'งาน HR'});
 $('#consoleName').textContent=state.personal||state.role==='employee'?'My Attendance':state.role==='admin'?'Admin Console':'HR · Head Office';
 $('#pageTitle').textContent=list.find(x=>x[0]===state.page)?.[2]||'จัดการ';
}
async function init(){
 state.connected=false;state.boot=null;state.directory=null;renderVersion++;$('#content').innerHTML=panel('กำลังเชื่อมต่อบัญชี LINE…');$('#environmentStatus').textContent='STAGING · กำลังเชื่อมต่อ';
 try{
  if(!window.liff)throw new Error('โหลด LINE ไม่สำเร็จ กรุณาลองใหม่');
  await liff.init({liffId:CONFIG.liffId});
  if(!liff.isLoggedIn()){liff.login({redirectUri:location.origin+location.pathname});return}
  const started=Date.now();const boot=await api('bootstrap');
  if(boot.serverTime){const server=Date.parse(boot.serverTime);if(Number.isFinite(server))offset=server-(started+Date.now())/2}
  state.boot=boot;state.connected=true;state.role=String(boot.adminRole).toUpperCase()==='HR'?'hr':boot.isAdmin?'admin':'employee';state.personal=false;
  state.date=dateKey();state.month=state.date.slice(0,7);state.selected=state.date;state.page=state.role==='employee'?'clock':'dashboard';
  $('#environmentStatus').textContent='STAGING · ข้อมูลจริง · อ่านอย่างเดียว';await render();
 }catch(e){$('#environmentStatus').textContent='STAGING · ยังไม่เชื่อมต่อข้อมูล';$('#content').innerHTML=panel(`<h2>โหลดข้อมูลไม่ได้</h2><p>${esc(errorMessage(e))}</p><button class="btn primary" data-action="reconnect">ลองเชื่อมต่อใหม่</button><button class="btn secondary" data-action="login">เข้าสู่ระบบ LINE ใหม่</button>`)}
}
async function directory(){if(!state.directory)state.directory=await api('admin_bootstrap');return state.directory}
function dayPicker(){return `<label class="field">วันที่<input type="date" id="workDate" value="${state.date}" required></label>`}
function eventsTable(events){const names={CHECK_IN:'เข้างาน',CHECK_OUT:'ออกงาน',BREAK_OUT:'ออกพัก',BREAK_IN:'กลับจากพัก',IN:'เข้างาน',OUT:'ออกงาน'};return table(['เหตุการณ์','เวลา'],(events||[]).map(e=>[names[e.event_type]||e.event_type,time(e.event_at)]))}
async function clockView(){
 if(!state.boot.employee)return panel(empty('บัญชีนี้ยังไม่ผูกกับพนักงาน'));
 const data=await api('today',{date:dateKey()});
 return `<div class="clock-view">${panel(`<div class="clock-card"><div class="big-time" data-clock></div><p data-clock-date></p><p>${esc(person(state.boot.employee))}</p></div>${eventsTable(data.events)}<div class="clock-actions">${disabled('เข้างาน')}${disabled('ออกงาน')}</div>`)}</div>`;
}
async function dashboardView(){const d=await api('admin_daily',{date:state.date});return `${dayPicker()}<div class="stats">${[['เข้างานแล้ว',d.summary.checked_in],['ออกงานแล้ว',d.summary.checked_out],['ยังไม่เข้างาน',d.summary.not_checked_in],['ลา',d.summary.leave]].map(([label,count])=>`<article class="stat-card"><span>${label}</span><strong>${count??'—'}</strong></article>`).join('')}</div>${panel(dailyTable(d.rows))}`}
function dailyTable(rows){return table(['พนักงาน','วันที่','เข้างาน','ออกงาน','ชั่วโมงทำงาน'],(rows||[]).map(r=>[person(r.employee),r.work_date,time(r.first_in_at),time(r.last_out_at),hours(r.paid_work_hours)]))}
async function employeesView(){const d=await directory();return panel(`<label class="field">ค้นหาพนักงาน<input id="employeeSearch" type="search" placeholder="ชื่อหรือรหัส"></label><div id="employeeResults">${employeeRows(d.employees)}</div>${disabled('เพิ่มพนักงาน')}`)}
function employeeRows(employees){return (employees||[]).map(e=>`<div class="employee-row"><div><strong>${esc(person(e))}</strong><small>${esc(e.attendance_mode)} · ${e.active?'Active':'Inactive'}</small></div><button class="btn secondary" data-employee="${esc(e.id)}">ดูข้อมูล</button>${disabled('แก้ไข')}</div>`).join('')||empty('ไม่พบพนักงาน')}
async function scheduleView(){const d=await api('staging_schedule',{date:state.date});return `${dayPicker()}<div class="schedule-layout">${panel(calendarGrid([]))}${panel(`<h2>${displayDate(state.date)}</h2>${table(['พนักงาน','สถานะ','สำนักงาน','ชั่วโมงที่กำหนด'],d.rows.map(r=>[person(r.employee),r.schedule_status,r.office?.name||'—',hours(r.required_hours)]))}<div class="employee-list">${d.rows.map(r=>`<div class="employee-row"><strong>${esc(person(r.employee))}</strong><button class="btn secondary" data-employee="${esc(r.employee_id)}">ดูการลงเวลาวันที่เลือก</button></div>`).join('')}</div>${disabled('แก้ไขตาราง')}${disabled('สร้างเดือนหน้า')}`)}</div>`}
function calendarGrid(rows){const [y,m]=state.month.split('-').map(Number);const first=new Date(Date.UTC(y,m-1,1)).getUTCDay(),total=new Date(Date.UTC(y,m,0)).getUTCDate();let cells=Array(first).fill('<div></div>');for(let day=1;day<=total;day++){const date=`${state.month}-${String(day).padStart(2,'0')}`,r=rows.find(x=>x.work_date===date);cells.push(`<button class="cal-day cal-button ${date===state.selected?'selected':''}" data-day="${date}"><strong>${day}</strong>${r?.first_in_at?'<span class="dot"></span>':''}</button>`)}return `<div class="month-nav"><button class="icon-button" data-shift="-1" aria-label="เดือนก่อนหน้า">‹</button><input type="month" id="month" value="${state.month}"><button class="icon-button" data-shift="1" aria-label="เดือนถัดไป">›</button></div><div class="calendar">${['อา','จ','อ','พ','พฤ','ศ','ส'].map(x=>`<span class="cal-head">${x}</span>`).join('')}${cells.join('')}</div>`}
async function calendarView(){
 const [month,day]=await Promise.all([api('employee_month',{month:state.month}),api('today',{date:state.selected})]);
 return `<p>${esc(person(state.boot.employee))}</p><div class="personal-calendar-layout">${panel(calendarGrid(month.rows))}${panel(`<h2>${displayDate(state.selected)}</h2>${eventsTable(day.events)}<p>ชั่วโมงทำงาน: ${hours(day.daily?.paid_work_hours)}</p>`)}</div>`;
}
async function reportView(){const d=await api('admin_monthly_summary',{month:state.month});return `<div class="reports-head"><h2>Monthly Summary</h2><label class="field">เดือน<input type="month" id="month" value="${state.month}"></label></div>${panel(`<p>เริ่ม ${esc(d.period_start)}${d.period_end_inclusive?' ถึง '+esc(d.period_end_inclusive):''}</p>${table(['พนักงาน','วันทำงาน','ชั่วโมงทำงาน','ชั่วโมงขาด','ชั่วโมงเกิน','เวลาชด','ชั่วโมงสุทธิ'],d.rows.map(r=>[person(r),r.work_days,hours(r.paid_work_hours),hours(r.short_hours),hours(r.over_hours),hours(r.makeup_hours),hours(r.net_hours)]))}<p class="panel-sub">ยอดจากระบบเดิม ยังไม่รวมกฎเวลาชดและค่าขอแก้เวลาเวอร์ชันทดลอง</p><button class="btn secondary" data-action="print">พิมพ์ / บันทึก PDF</button><button class="btn secondary" data-page="dashboard">รายงานรายวัน</button>`)}`}
async function lineView(){const type=state.reportType||'END_DAY';const d=await api('admin_report_preview',{date:state.date,reportType:type});return `${dayPicker()}<label class="field">รายงาน<select id="reportType"><option value="MIDDAY" ${type==='MIDDAY'?'selected':''}>13:00</option><option value="END_DAY" ${type==='END_DAY'?'selected':''}>22:00</option></select></label>${panel(`<pre class="report-message">${esc(d.message)}</pre>${disabled('Send Now')}`)}`}
function draftKey(){return `kitty-staging-drafts:${state.boot?.employee?.id||state.boot?.profile?.userId||'unlinked'}`}
function drafts(){try{return JSON.parse(sessionStorage.getItem(draftKey())||'[]')}catch{return []}}
function draftHistory(kind){return drafts().filter(d=>d.kind===kind).map(d=>`<div class="leave-card"><div><strong>${esc(d.date)} · ${esc(d.label)}</strong><p>${esc(d.reason)}</p><small>แบบร่างในเครื่อง · ยังไม่ส่งอนุมัติ</small></div><button class="btn secondary" data-remove-draft="${esc(d.id)}">ลบแบบร่าง</button></div>`).join('')||empty('ยังไม่มีแบบร่างในเครื่องนี้')}
function leaveView(){return panel(`<h2>ขอลา</h2><form id="leaveForm" class="request-form"><label>วันที่ลา<input name="date" type="date" value="${dateKey()}" required></label><label>ประเภทการลา<select name="type"><option>ลากิจ</option><option>ลาป่วย</option><option>ลาพักร้อน</option><option>ลาไม่รับค่าจ้าง</option></select></label><label>ระยะเวลา<select name="duration" id="leaveDuration"><option value="FULL_DAY">เต็มวัน</option><option value="HALF_DAY_AM">ครึ่งวันเช้า</option><option value="HALF_DAY_PM">ครึ่งวันบ่าย</option></select></label><p id="halfDayRule" hidden>วันลาครึ่งวันต้องทำงานสุทธิอย่างน้อย 4 ชั่วโมง หลังหักเวลาพัก</p><label>เหตุผล<textarea name="reason" rows="3" required maxlength="1000"></textarea></label><button class="btn primary" type="submit">บันทึกแบบร่างในเครื่อง</button><p class="panel-sub">ยังไม่ส่งให้ HR หรือ Admin อนุมัติ</p></form><h3>แบบร่างของฉัน</h3>${draftHistory('leave')}`)}
function correctionView(){return panel(`<h2>ขอลงเวลาย้อนหลัง</h2><form id="correctionForm" class="request-form"><label>วันที่<input name="date" type="date" max="${dateKey()}" value="${dateKey()}" required></label><label>เหตุการณ์<select name="event"><option>เข้างาน</option><option>ออกงาน</option><option>ออกพัก</option><option>กลับจากพัก</option></select></label><label>เวลา<input name="time" type="time" required></label><label>เหตุผล<textarea name="reason" required maxlength="1000"></textarea></label><button class="btn primary" type="submit">บันทึกแบบร่างในเครื่อง</button><p class="panel-sub">ยังไม่ส่งอนุมัติและยังไม่นับจำนวนคำขอ</p></form>${draftHistory('correction')}`)}
function unavailableView(){return panel(`<h2>${esc(activeMenu().find(x=>x[0]===state.page)?.[2]||'รายการ')}</h2><p>หน้านี้ยังไม่เชื่อมข้อมูลและการบันทึกใน Staging</p><p class="panel-sub">ใช้งานฟังก์ชันนี้ผ่านระบบเดิมได้ตามปกติ</p>`)}
function managementView(){return `<div class="management-grid">${activeMenu().filter(x=>!['dashboard','employees','schedule','reports'].includes(x[0])).map(([id,icon,label])=>`<button class="management-card" data-page="${id}"><span>${icon}</span><strong>${label}</strong><span>›</span></button>`).join('')}</div>`}
async function attendanceView(){const d=await directory();return `${dayPicker()}${panel(`<h2>เลือกพนักงานเพื่อดูเวลา</h2>${employeeRows(d.employees)}`)}`}
async function render(){
 navigation();if(!state.connected)return;
 const version=++renderVersion;$('#content').innerHTML=panel('กำลังโหลดข้อมูล…');
 const views={clock:clockView,dashboard:dashboardView,employees:employeesView,schedule:scheduleView,calendar:calendarView,reports:reportView,line:lineView,'my-leave':leaveView,'clock-request':correctionView,more:managementView,attendance:attendanceView,offices:async()=>{const d=await directory();return panel(table(['รหัส','สำนักงาน'],d.offices.map(o=>[o.office_code,o.name])))},leave:()=>panel('<h2>การลา</h2><p>ยังไม่เชื่อมประวัติคำขอและการอนุมัติ</p><button class="btn primary" data-action="personal-leave">สร้างแบบร่างการลาของฉัน</button>')};
 try{const html=await (views[state.page]||unavailableView)();if(version===renderVersion){$('#content').innerHTML=html;tick()}}
 catch(e){if(version===renderVersion)$('#content').innerHTML=panel(`<h2>โหลดข้อมูลไม่สำเร็จ</h2><p>${esc(errorMessage(e))}</p><button class="btn primary" data-action="retry">ลองใหม่</button>`)}
}
function tick(){document.querySelectorAll('[data-clock]').forEach(el=>el.textContent=new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(now()));document.querySelectorAll('[data-clock-date]').forEach(el=>el.textContent=displayDate(dateKey()))}
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),4000)}
async function showEmployee(id){
 const e=state.directory?.employees.find(e=>e.id===id);const version=renderVersion;
 try{const d=await api('admin_employee_day',{employeeId:id,date:state.date});if(version!==renderVersion)return;$('#actionTitle').textContent=e?person(e):'การลงเวลาพนักงาน';$('#actionBody').innerHTML=`<p>${displayDate(state.date)}</p>${eventsTable(d.events)}<p>สถานะตาราง: ${esc(d.schedule?.schedule_status||'ไม่พบตาราง')}</p><p>ชั่วโมงทำงาน: ${hours(d.daily?.paid_work_hours)}</p>`;$('#actionDialog').showModal()}catch(e){toast(errorMessage(e))}
}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b||b.disabled)return;
 if(b.dataset.page){if(!activeMenu().some(x=>x[0]===b.dataset.page)&&!(b.dataset.page==='more'&&activeMenu().length>5))return;state.page=b.dataset.page;if(state.page==='schedule'){state.month=state.date.slice(0,7);state.selected=state.date}render();return}
 if(b.dataset.hrView){state.personal=b.dataset.hrView==='personal';state.page=state.personal?'clock':'dashboard';render();return}
 if(b.dataset.day){state.selected=b.dataset.day;if(state.page==='schedule')state.date=state.selected;render();return}
 if(b.dataset.shift){const [y,m]=state.month.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+Number(b.dataset.shift),1));state.month=d.toISOString().slice(0,7);state.selected=state.month+'-01';if(state.page==='schedule')state.date=state.selected;render();return}
 if(b.dataset.employee){showEmployee(b.dataset.employee);return}
 if(b.dataset.removeDraft){try{sessionStorage.setItem(draftKey(),JSON.stringify(drafts().filter(d=>d.id!==b.dataset.removeDraft)));render()}catch{toast('ไม่สามารถลบแบบร่างได้')}return}
 if(b.dataset.action==='retry'){render();return}
 if(b.dataset.action==='reconnect'){init();return}
 if(b.dataset.action==='login'){if(window.liff){liff.logout();liff.login({redirectUri:location.origin+location.pathname})}else location.reload();return}
 if(b.dataset.action==='personal-leave'){state.personal=true;state.page='my-leave';render();return}
 if(b.dataset.action==='print')window.print();
});
document.addEventListener('input',e=>{if(e.target.id==='employeeSearch'){const query=e.target.value.toLowerCase();$('#employeeResults').innerHTML=employeeRows(state.directory.employees.filter(p=>person(p).toLowerCase().includes(query)))}});
document.addEventListener('change',e=>{if(e.target.id==='workDate'&&e.target.value){state.date=e.target.value;state.selected=state.date;state.month=state.date.slice(0,7);render()}if(e.target.id==='month'&&e.target.value){state.month=e.target.value;state.selected=state.month+'-01';if(state.page==='schedule')state.date=state.selected;render()}if(e.target.id==='reportType'){state.reportType=e.target.value;render()}if(e.target.id==='leaveDuration')$('#halfDayRule').hidden=e.target.value==='FULL_DAY'});
document.addEventListener('submit',e=>{
 if(!['leaveForm','correctionForm'].includes(e.target.id))return;e.preventDefault();
 if(!state.boot?.employee){toast('บัญชีนี้ยังไม่ผูกกับพนักงาน');return}
 const form=e.target,data=Object.fromEntries(new FormData(form));if(!data.reason.trim()){toast('กรุณาระบุเหตุผล');return}
 const leave=form.id==='leaveForm';const duration={FULL_DAY:'เต็มวัน',HALF_DAY_AM:'ครึ่งวันเช้า',HALF_DAY_PM:'ครึ่งวันบ่าย'};
 const draft={...data,id:crypto.randomUUID(),kind:leave?'leave':'correction',label:leave?`${data.type} · ${duration[data.duration]}`:`${data.event} ${data.time}`,requiredNetMinutes:leave&&data.duration!=='FULL_DAY'?240:0,status:'LOCAL_DRAFT'};
 try{sessionStorage.setItem(draftKey(),JSON.stringify([...drafts(),draft]));render();toast('บันทึกแบบร่างในเครื่องแล้ว ยังไม่ส่งอนุมัติ')}catch{toast('บันทึกแบบร่างไม่ได้ กรุณาตรวจการตั้งค่าพื้นที่จัดเก็บของเบราว์เซอร์')}
});
$('#closeActionDialog').onclick=$('#cancelActionDialog').onclick=()=>$('#actionDialog').close();
setInterval(tick,1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});
navigation();init();
