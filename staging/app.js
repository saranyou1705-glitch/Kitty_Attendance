'use strict';
const $ = s => document.querySelector(s);
const CONFIG = {requestsLive:false,liveApi:'https://rlqecfzddxpywbbbiirg.supabase.co/functions/v1/kitty-attendance-live',liffId:'2010336238-UABz60wq', api:'https://rlqecfzddxpywbbbiirg.supabase.co/functions/v1/rapid-processor-staging'};
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
function loginLoading(){return '<div class="login-loading" role="status"><span class="kitty-logo"><img src="kitty-logo.png" alt="Kitty Kawaii" width="6250" height="4167"></span><p>กำลังเข้าสู่ระบบ…</p></div>'}
function panel(s){return `<section class="panel">${s}</section>`}
function empty(s){return `<p class="empty-day">${esc(s)}</p>`}
function disabled(label){const icon={'เข้างาน':'clock','ออกพัก':'coffee','กลับจากพัก':'coffee','ออกงาน':'logout'}[label];return `<button class="btn secondary" disabled title="ยังไม่เปิดการบันทึกในระบบทดลอง">${icon?uiIcon(icon):''}<span>${label}</span></button>`}
const clockTypes={'เข้างาน':'IN','ออกพัก':'BREAK_OUT','กลับจากพัก':'BREAK_IN','ออกงาน':'OUT','เริ่มวันทำงาน':'DAY_IN','เข้าสาขา':'BRANCH_IN','ออกสาขา':'BRANCH_OUT','จบวันทำงาน':'DAY_OUT'};
function clockButton(label,data){
 const event=clockTypes[label],allowed=window.KittyClock?.allowedActions(data.employee?.attendance_mode||state.boot?.employee?.attendance_mode,data.events||[])||[];
 const enabled=data.employee?.active===true&&allowed.includes(event)&&!state.clockBusy&&!state.clockRecorder?.uncertain;
 const icon={IN:'clock',BREAK_OUT:'coffee',BREAK_IN:'coffee',OUT:'logout',DAY_IN:'clock',DAY_OUT:'logout',BRANCH_IN:'offices',BRANCH_OUT:'logout'}[event];
 return `<button class="btn ${enabled?'primary':'secondary'}" data-clock-event="${event}" ${enabled?'':'disabled'}>${uiIcon(icon||'clock')}<span>${label}</span></button>`;
}
function clockError(e){return ({GPS_INACCURATE:'พิกัด GPS ยังไม่แม่นยำ กรุณารอสักครู่แล้วลองใหม่',OUTSIDE_OFFICE:'คุณอยู่นอกพื้นที่สำนักงานหรือสาขาที่อนุญาต',OFFICE_NOT_CONFIGURED:'ยังไม่ได้กำหนดสำนักงานหรือพิกัด กรุณาติดต่อแอดมิน',EMPLOYEE_INACTIVE:'บัญชีพนักงานไม่ได้เปิดใช้งาน',ACTIVE_EMPLOYEE_REQUIRED:'บัญชีนี้ยังไม่มีพนักงานที่เปิดใช้งาน',ACTION_NOT_AVAILABLE:'สถานะการลงเวลาเปลี่ยนแล้ว กรุณาตรวจรายการล่าสุด',GPS_DENIED:'กรุณาอนุญาตตำแหน่งที่ตั้ง แล้วลองใหม่',INVALID_LOCATION:'อ่านพิกัดไม่สำเร็จ กรุณาลองใหม่',GPS_TIMEOUT:'อ่านตำแหน่งใช้เวลานาน กรุณาลองใหม่',RECONCILE_REQUIRED:'ต้องตรวจสถานะล่าสุดก่อนลงเวลาอีกครั้ง',SERVICE_UNAVAILABLE:'ยังยืนยันผลบันทึกไม่ได้ กรุณาตรวจสถานะล่าสุด',INVALID_STANDARD_SEQUENCE:'ลำดับลงเวลาเปลี่ยนแล้ว กรุณาตรวจสถานะ',INVALID_DRIVER_ACTION:'รายการนี้ลงเวลาแล้วหรือยังไม่ถึงลำดับ',INVALID_MULTI_BRANCH_SEQUENCE:'ลำดับเข้าสาขาเปลี่ยนแล้ว กรุณาตรวจสถานะ'})[e.message]||errorMessage(e)}
function clockRecorder(){
 if(!state.clockRecorder)state.clockRecorder=window.KittyClock.createRecorder({
 loadToday:()=>api('today',{date:dateKey()}),record:payload=>api('record',payload),clock:now,
 getPosition:()=>new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(Error('GPS_DENIED'));navigator.geolocation.getCurrentPosition(resolve,e=>reject(Error(e.code===3?'GPS_TIMEOUT':'GPS_DENIED')),{enableHighAccuracy:true,timeout:12000,maximumAge:0})})});
 return state.clockRecorder;
}
async function submitClock(eventType){
 if(state.clockBusy||!state.boot?.employee)return;
 state.clockBusy=true;document.querySelectorAll('[data-clock-event]').forEach(b=>b.disabled=true);
 try{await clockRecorder().submit(eventType);state.clockNotice='บันทึกลงเวลาจริงสำเร็จ';toast(state.clockNotice)}
 catch(e){state.clockNotice=clockError(e);toast(state.clockNotice)}
 finally{state.clockBusy=false;await render()}
}
async function refreshClock(){
 if(state.clockBusy)return;state.clockBusy=true;
 try{await clockRecorder().reconcile();state.clockNotice='อัปเดตสถานะล่าสุดแล้ว ตรวจเวลาในรายการก่อนกดอีกครั้ง'}catch(e){state.clockNotice=clockError(e)}
 finally{state.clockBusy=false;await render()}
}
function table(headers,rows){return `<div class="data-scroll"><table class="data-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${rows.length?'':empty('ไม่พบข้อมูลในช่วงที่เลือก')}`}
function errorMessage(error){const m=String(error?.message||error);if(m==='Failed to fetch')return 'เชื่อมต่อข้อมูลไม่สำเร็จ กรุณาลองใหม่หรือตรวจอินเทอร์เน็ต';if(m==='EMPLOYEE_NOT_REGISTERED')return 'บัญชี LINE นี้ยังไม่ผูกกับพนักงาน';if(m==='INVALID_LINE_TOKEN'||m==='MISSING_LINE_TOKEN')return 'การเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบ LINE อีกครั้ง';return m}
async function api(action,payload={}){
 if(CONFIG.requestsLive&&action.startsWith('staging_ot_'))action=action.replace('staging_ot_','live_ot_');
 if(CONFIG.requestsLive&&action.startsWith('staging_request_'))action=action.replace('staging_request_','live_request_');
 const token=window.liff?.getAccessToken();if(!token)throw new Error('MISSING_LINE_TOKEN');
 const control=new AbortController(),timer=setTimeout(()=>control.abort(),20000);
 const request={...payload};if(state.role==='hr'&&action.startsWith('admin_')&&!action.startsWith('admin_hr_')||state.role==='hr'&&(action==='staging_schedule'||(action.startsWith('staging_request_')||action.startsWith('live_request_')||(action.startsWith('staging_ot_')||action.startsWith('live_ot_'))||action.startsWith('staging_people_'))))request.previewRole='HR';
 try{const r=await fetch(`${(['record','today','employee_month','admin_update_event'].includes(action)||action.startsWith('live_request_')||action.startsWith('live_ot_')||(CONFIG.requestsLive&&(action==='bootstrap'||action==='hr_register'||action.startsWith('admin_hr_'))))?CONFIG.liveApi:CONFIG.api}?action=${encodeURIComponent(action)}`,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','x-line-access-token':token},body:JSON.stringify(request),signal:control.signal});let data;try{data=await r.json()}catch{throw new Error(`บริการข้อมูลตอบกลับไม่สมบูรณ์ (${r.status})`)}if(!r.ok||!data.ok)throw new Error(data.message||data.error||`HTTP ${r.status}`);return data}finally{clearTimeout(timer)}
}
function activeMenu(){if(state.connected&&state.boot&&!state.boot?.employee&&!state.boot?.isAdmin)return [];return state.personal?menus.employee:menus[state.role]}
function loginRedirect(){const url=new URL('https://saranyou1705-glitch.github.io/Kitty_Attendance_Staging/');if(new URLSearchParams(location.search).get('view')==='hr')url.searchParams.set('view','hr');if(new URLSearchParams(location.search).get('register')==='hr')url.searchParams.set('register','hr');return url.href}
function navigation(){
 const legacy=document.querySelector('.legacy-entry');if(legacy)legacy.hidden=state.role!=='admin'||state.personal;
 $('#environmentStatus').hidden=state.connected;
 const avatar=$('#selfProfileButton'),picture=state.boot?.profile?.pictureUrl;avatar.hidden=!state.connected||!state.boot?.employee;avatar.innerHTML=picture&&/^https:\/\//.test(picture)?`<img src="${esc(picture)}" alt="รูปโปรไฟล์ของฉัน" referrerpolicy="no-referrer">`:`<span>${esc((state.boot?.employee?.name||'ฉัน').slice(0,1))}</span>`;
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
 if(location.protocol==='file:'){$('#content').innerHTML=panel('<h2>กรุณาเปิดผ่านเว็บไซต์</h2><p>LINE ไม่รองรับการเข้าสู่ระบบจากไฟล์ในเครื่อง</p><a class="btn primary" href="https://saranyou1705-glitch.github.io/Kitty_Attendance_Staging/">เปิด Kitty Attendance</a>');return}
 state.connected=false;state.boot=null;state.directory=null;renderVersion++;$('#content').innerHTML=loginLoading();$('#environmentStatus').textContent='กำลังเชื่อมต่อ';
 try{
  if(!window.liff)throw new Error('โหลด LINE ไม่สำเร็จ กรุณาลองใหม่');
  await liff.init({liffId:CONFIG.liffId});
  if(!liff.isLoggedIn()){$('#environmentStatus').textContent='เข้าสู่ระบบด้วย LINE';$('#content').innerHTML=panel('<h2>เข้าใช้งาน Kitty Attendance ผ่านเว็บ</h2><p>Admin และ HR เข้าด้วยบัญชี LINE ที่ผูกไว้กับระบบ</p><button class="btn primary" data-action="login">เข้าสู่ระบบด้วย LINE</button>');return}
  const started=Date.now();const boot=await api('bootstrap');
  if(boot.serverTime){const server=Date.parse(boot.serverTime);if(Number.isFinite(server))offset=server-(started+Date.now())/2}
  state.boot=boot;state.connected=true;state.role=String(boot.adminRole).toUpperCase()==='HR'?'hr':boot.isAdmin?'admin':'employee';state.personal=false;
  if(state.role==='admin'&&new URLSearchParams(location.search).get('view')==='hr')state.role='hr';
  state.date=dateKey();state.month=state.date.slice(0,7);state.selected=state.date;state.page=CONFIG.requestsLive&&state.role==='employee'&&new URLSearchParams(location.search).get('register')==='hr'?'hr-register':state.role==='employee'?'clock':'dashboard';
  $('#environmentStatus').textContent=CONFIG.requestsLive?'ลงเวลา ลา แก้เวลา และ OT จริง':'ลงเวลาจริง · คำขอและการจัดการยังเป็นชุดทดลอง';state.loginLoading=true;try{await render()}finally{state.loginLoading=false}
 }catch(e){$('#environmentStatus').textContent='ยังไม่เชื่อมต่อข้อมูล';$('#content').innerHTML=panel(`<h2>โหลดข้อมูลไม่ได้</h2><p>${esc(errorMessage(e))}</p><button class="btn primary" data-action="reconnect">ลองเชื่อมต่อใหม่</button><button class="btn secondary" data-action="login">เข้าสู่ระบบ LINE ใหม่</button>`)}
}
async function directory(){if(state.directory)return state.directory;const role=state.role;const data=await api('admin_bootstrap');if(state.role===role)state.directory=data;return data}
function dayPicker(){return `<label class="field date-field"><span>วันที่</span><input type="date" id="workDate" value="${state.date}" required></label>`}
function eventsTable(events){const names={CHECK_IN:'เข้างาน',CHECK_OUT:'ออกงาน',BREAK_OUT:'ออกพัก',BREAK_IN:'กลับจากพัก',IN:'เข้างาน',OUT:'ออกงาน'};return table(['เหตุการณ์','เวลา'],(events||[]).map(e=>[userLabel(e.event_type,'ไม่ระบุรายการ'),time(e.event_at)]))}
function attendancePeople(rows){
 return '<div class="attendance-people">'+rows.map(r=>{const employee=r.employee||{};return `<button class="attendance-person" data-employee="${esc(r.employee_id||employee.id)}"><span class="person-avatar">${esc((employee.employee_code||'').slice(0,2)||'—')}</span><span class="person-identity"><strong>${esc(employee.name||'ไม่พบชื่อพนักงาน')}</strong><small>${esc(employee.employee_code||'—')}</small></span><span class="person-time"><strong>${time(r.first_in_at)}</strong><small>${r.last_out_at?'ออกงาน '+time(r.last_out_at):r.first_in_at?'เข้างานแล้ว':esc(userLabel(r.schedule_status,'ยังไม่ลงเวลา'))}</small></span></button>`}).join('')+(rows.length?'':empty('ไม่พบข้อมูลในวันที่เลือก'))+'</div>';
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
 return panel(`<div class="section-heading"><h2>${ba?'BA · งานสาขา':'Driver · งานขับรถ'}</h2><span class="attendance-tag">${preview?'ตัวอย่างหน้าจอ':'ข้อมูลของฉัน'}</span></div><div class="clock-actions">${labels.map(label=>preview?disabled(label):clockButton(label,data)).join('')}</div><h3>${ba?'การเข้าสาขาวันนี้':'การลงเวลาวันนี้'}</h3>${table(['รายการ','เวลา',...(ba?['สาขา']:[])],(data.events||[]).map(e=>[userLabel(e.event_type,'ไม่ระบุรายการ'),time(e.event_at),...(ba?[e.office?.name||e.office_name||e.office_id||'—']:[])]))}${preview?'<p>ตัวอย่างหน้าตาเท่านั้น ไม่มีข้อมูลพนักงานจริง และไม่บันทึกการลงเวลา</p>':''}`);
}
function showRolePreview(mode){
 if(state.role!=='admin'||!state.boot?.isAdmin||String(state.boot.adminRole).toUpperCase()==='HR'||!['MULTI_BRANCH','DRIVER'].includes(mode))return;
 $('#actionTitle').textContent='ดูหน้าพนักงาน';
 $('#actionBody').innerHTML=`<div class="request-shortcuts"><button class="btn ${mode==='MULTI_BRANCH'?'primary':'secondary'}" data-role-preview="MULTI_BRANCH">BA</button><button class="btn ${mode==='DRIVER'?'primary':'secondary'}" data-role-preview="DRIVER">Driver</button></div>`+occupationalView({attendance_mode:mode},{},true);
 $('#actionDialog').showModal();
}

function dailyResult(d,s,date){
 const status=s?.schedule_status||d?.schedule_status;
 if(['OFF','HOLIDAY','SICK_LEAVE','BUSINESS_LEAVE','VACATION','UNPAID_LEAVE'].includes(status))return scheduleLabel(status);
 if(!d)return date>dateKey()?'ยังไม่ถึงวันทำงาน':'ยังไม่มีข้อมูลลงเวลา';
 if(!d.last_out_at)return d.first_in_at?'กำลังทำงาน · ยังไม่สรุปทั้งวัน':date<dateKey()&&Number(d.short_hours)>0?'ทำงานขาด '+hours(d.short_hours):'ยังไม่ลงเวลา';
 if((!!d.break_out_at)!=(!!d.break_in_at))return 'เวลาพักไม่ครบ · รอตรวจสอบ';
 if(Number(d.short_hours)>0)return 'ทำงานขาด '+hours(d.short_hours);
 if(Number(d.over_hours)>0)return 'ทำงานเกิน '+hours(d.over_hours);
 if(d.paid_work_hours==null||d.required_hours==null)return 'ข้อมูลสรุปยังไม่ครบ';
 return 'ทำงานครบ';
}
async function ownOtStatus(date,info={},daily){
 if(['MULTI_BRANCH','DRIVER'].includes(state.boot?.employee?.attendance_mode))return '';
 try{const data=await api('staging_ot_mine');info.departure=window.KittyIndividualReport.departure({...daily,work_date:date,requests:data.rows||[]}).label;const rows=(data.rows||[]).filter(r=>r.kind==='overtime'&&[r.source_date,r.target_date].includes(date)&&['APPROVED','PENDING'].includes(r.status));const approved=rows.filter(r=>r.status==='APPROVED');if(!rows.length)return '';if(!approved.length)return ' · มีคำขอ OT รออนุมัติ';if(!CONFIG.requestsLive)return ' · มีคำขอ OT ทดลองอนุมัติแล้ว';const settled=approved.filter(r=>r.settlement_state==='READY'),minutes=settled.reduce((sum,r)=>sum+Number(r.minutes||0),0);return ' · '+(minutes>0?'ใช้ OT '+hours(minutes/60):approved.some(r=>r.settlement_state!=='READY')?'OT อนุมัติแล้ว · รอสรุปเวลาทั้งสองวัน':'OT อนุมัติแล้ว · ไม่มีเวลาที่ต้องชด')}catch{info.departure='ตรวจเวลาออกไม่สำเร็จ';return ' · ตรวจสถานะคำขอ OT ไม่สำเร็จ'}
}
async function clockView(){
 if(!state.boot.employee)return state.boot.isAdmin?panel(empty('บัญชีนี้ยังไม่ผูกกับพนักงาน')):signupView();
 const data=await api('today',{date:dateKey()}),daily=data.daily,otInfo={},otStatus=await ownOtStatus(dateKey(),otInfo,daily);
 const latest=(data.events||[]).slice().sort((a,b)=>String(a.event_at).localeCompare(String(b.event_at))).at(-1);
 const status=latest?({IN:'เข้างานแล้ว',CHECK_IN:'เข้างานแล้ว',BREAK_OUT:'กำลังพัก',BREAK_IN:'กลับจากพักแล้ว',DAY_IN:'เริ่มวันทำงานแล้ว',BRANCH_IN:'อยู่ที่สาขา',BRANCH_OUT:'ออกจากสาขาแล้ว',DAY_OUT:'จบวันทำงานแล้ว',OUT:'ออกงานแล้ว',CHECK_OUT:'ออกงานแล้ว'}[latest.event_type]||'มีการลงเวลาแล้ว'):'ยังไม่ลงเวลา';
 return `<div class="view-heading"><div><p class="page-context">${esc(person(state.boot.employee))}</p><h1>วันทำงานของฉัน</h1></div></div>${state.clockNotice?`<p class="live-clock-notice" role="status">${esc(state.clockNotice)}</p>`:''}${state.clockRecorder?.uncertain?'<button class="btn secondary" data-clock-refresh>ตรวจผลบันทึกที่ยังไม่ยืนยัน</button>':''}<div class="personal-clock-layout"><section class="panel clock-card"><p data-clock-date></p><div class="big-time" data-clock></div><span class="attendance-tag">${status}${latest?' · '+time(latest.event_at):''}</span>${['MULTI_BRANCH','DRIVER'].includes(state.boot.employee.attendance_mode)?'':`<div class="clock-actions">${clockButton('เข้างาน',data)}${clockButton('ออกพัก',data)}${clockButton('กลับจากพัก',data)}${clockButton('ออกงาน',data)}</div>`}</section><section class="panel clock-summary"><h2>เวลาของฉันวันนี้</h2>${[['เข้างาน',daily?.first_in_at],['ออกพัก',daily?.break_out_at],['กลับจากพัก',daily?.break_in_at],['ออกงาน',daily?.last_out_at]].map(([label,value])=>`<div class="time-line"><span>${label}</span><strong>${time(value)}</strong></div>`).join('')}<div class="time-line"><span>ทำงานสุทธิ</span><strong>${hours(daily?.paid_work_hours)}</strong></div><div class="time-line"><span>เวลาที่ควรออก</span><strong>${esc(otInfo.departure||'—')}</strong></div><div class="time-line"><span>สรุปวันนี้</span><strong>${esc(dailyResult(daily,data.schedule,dateKey())+otStatus)}</strong></div></section></div>${occupationalView(state.boot.employee,data)}`;
}
async function dashboardView(){
 const [d,requests]=await Promise.all([api('admin_daily',{date:state.date}),requestQueue()]);
 return `<div class="dashboard-heading"><div><p class="page-context">${state.role==='hr'?'HR · Head Office':'Admin · ทุกกลุ่มพนักงาน'}</p><h1>ภาพรวมวันนี้</h1></div>${dayPicker()}</div><div class="stats">${[['เข้างานแล้ว',d.summary.checked_in],['ยังไม่เข้างาน',d.summary.not_checked_in],['ลา',d.summary.leave],['ออกงานแล้ว',d.summary.checked_out],['วันหยุด',d.summary.off],['กำลังพัก',d.summary.on_break]].map(([label,count])=>`<article class="stat-card"><span>${label}</span><strong>${count??'—'}</strong></article>`).join('')}</div><div class="dashboard-layout"><section class="panel dashboard-main"><div class="section-heading"><h2>การลงเวลาวันนี้</h2><button class="btn secondary" data-page="employees">${uiIcon('arrow')}ดูพนักงานทั้งหมด</button></div>${attendancePeople(d.rows)}<details class="event-details"><summary>ตารางเวลารายละเอียด</summary>${dailyTable(d.rows)}</details></section><aside class="dashboard-aside"><section class="panel dashboard-report"><h2>รายงาน</h2><button class="btn primary" data-page="reports">${uiIcon('reports')}เปิดศูนย์รายงาน</button></section><section class="panel"><h2>สัปดาห์นี้</h2>${weekPicker()}<p class="week-caption">${displayDate(state.date)}</p><button class="btn secondary" data-page="schedule">ดูตารางงาน</button></section></aside><section class="panel dashboard-requests"><div class="section-heading"><h2>คำขอใหม่ / รออนุมัติ</h2><button class="btn secondary" data-page="clock-approvals">ดูทั้งหมด</button></div>${requestList(requests,5)}${state.role==='admin'?'<div class="request-shortcuts"><button class="btn secondary" data-page="line">LINE Report</button><button class="btn secondary" data-role-preview="MULTI_BRANCH">ดูหน้า BA / Driver</button></div>':''}</section></div>`;
}
function dailyTable(rows){return table(['พนักงาน','วันที่','เข้างาน','ออกงาน','ชั่วโมงทำงาน'],(rows||[]).map(r=>[person(r.employee),r.work_date,time(r.first_in_at),time(r.last_out_at),hours(r.paid_work_hours)]))}

async function signupView(){
 if(CONFIG.requestsLive&&new URLSearchParams(location.search).get('register')==='hr')return window.KittyHRAccess.registration(state.boot.hrRegistration);

 const d=await api('staging_people_mine'),r=d.registration;
 if(r)return panel(`<h2>${r.status==='READY'?'HR อนุมัติแล้ว':'ส่งชื่อให้ HR แล้ว'}</h2><p>${esc(r.name)}</p><p>${r.status==='READY'?'ข้อมูลอยู่ในชุดทดลอง รอเปิดใช้งานจริง':'รอ HR ตรวจสอบและเติมข้อมูลพนักงาน'}</p><button class="btn secondary" data-action="retry">ตรวจสถานะ</button>`);
 return panel('<h2>ลงทะเบียนพนักงานใหม่</h2><form id="signupForm" class="request-form"><label>ชื่อ–นามสกุล<input name="name" maxlength="160" required autocomplete="name"></label><p>ส่งให้ HR Head Office กรอกข้อมูลส่วนที่เหลือ · ชุดทดลอง</p><button class="btn primary" type="submit">ส่งชื่อให้ HR</button></form>');
}
async function submitSignup(form){
 const button=form.querySelector('button');button.disabled=true;
 try{await api('staging_people_register',{name:new FormData(form).get('name')});await render()}catch(e){toast(peopleError(e))}finally{button.disabled=false}
}
function peopleError(e){return ({REGISTRATION_REQUIRED:'ต้องรอคำขอจากบัญชี LINE ของพนักงานใหม่',APPROVAL_REQUIRED:'กรุณายืนยันอนุมัติพนักงานใหม่',INVALID_FIELDS:'แก้ไขได้เฉพาะโทรศัพท์และอีเมล',INVALID_PHONE:'กรุณาตรวจสอบเบอร์โทรศัพท์',INVALID_EMAIL:'กรุณาตรวจสอบอีเมล',STALE_PROFILE:'มีการบันทึกข้อมูลนี้แล้ว กรุณาปิดและเปิดใหม่',DUPLICATE_CODE:'รหัสพนักงานนี้มีอยู่แล้ว',INVALID_NAME:'กรุณากรอกชื่อไม่เกิน 160 ตัวอักษร',INVALID_DAYOFF:'กรุณาเลือกวันหยุดจากช่องที่กำหนด',HO_ONLY:'เพิ่มพนักงานใหม่ได้เฉพาะ Head Office ในชุดทดลอง',CODE_IMMUTABLE:'ยังไม่เปิดให้เปลี่ยนรหัสพนักงานเดิม',ALREADY_EMPLOYEE:'บัญชีนี้มีข้อมูลพนักงานแล้ว',INVALID_REQUEST:'กรุณาตรวจชื่อและรหัสพนักงาน',PERSONNEL_SERVICE_ERROR:'บันทึกข้อมูลพนักงานไม่สำเร็จ กรุณาลองใหม่'})[e.message]||workflowError(e)}
function personnelTarget(id){const row=(state.peopleRows||[]).find(e=>e.id===id);return row?.sandbox_new?{profileId:row.id}:{employeeId:id}}
async function loadPeople(){
 const [d,p]=await Promise.all([directory(),trialApi('staging_people_list')]);
 const rows=(d.employees||[]).map(e=>{const s=(p.profiles||[]).find(p=>p.employee_id===e.id);return s?{...e,...s,id:e.id,sandbox_profile:s.id}:e});
 rows.push(...(p.profiles||[]).filter(p=>!p.employee_id).map(p=>({...p,active:true,attendance_mode:'STANDARD',sandbox_new:true})));
 state.peopleRows=rows;return {rows,registrations:p.registrations||[]};
}
async function personnelEditor(target={}){
 if(!['admin','hr'].includes(state.role)||state.personal)return;
 if(state.role==='hr'&&!target.employeeId&&!target.profileId&&!target.registrationId)return;
 try{
  const d=await api('staging_people_get',target),p=d.profile||{};
  const context={...target,profileId:p.id||target.profileId||crypto.randomUUID(),version:p.version||0,...(target.registrationId?{approveRegistration:true}:{})};
  if(target.employeeId)delete context.profileId;
  state.personnelEdit=context;
  const weekdays=['MON','TUE','WED','THU','FRI','SAT','SUN'];
  $('#actionTitle').textContent=target.registrationId?'เติมข้อมูลพนักงานใหม่':target.employeeId||p.id?'แก้ไขข้อมูลพนักงาน':'เพิ่มพนักงาน Head Office';
  $('#actionBody').innerHTML=`<form id="personnelForm" class="request-form"><label>ชื่อ–นามสกุล<input name="name" value="${esc(p.name||'')}" maxlength="160" required></label><label>รหัสพนักงาน<input name="employee_code" value="${esc(p.employee_code||'')}" placeholder="HO027" ${p.employee_id||p.id?'readonly':''} pattern="[A-Za-z]{2,8}[0-9]{1,8}" required></label><label>แผนก<input name="department" value="${esc(p.department||'')}" maxlength="160"></label><label>ตำแหน่ง<input name="position" value="${esc(p.position||'')}" maxlength="160"></label><label>วันที่เริ่มงาน<input type="date" name="start_date" value="${esc(p.start_date||'')}"></label><fieldset class="weekly-dayoffs"><legend>วันหยุดประจำสัปดาห์</legend>${weekdays.map(day=>`<label><input type="checkbox" name="weekly_dayoffs" value="${day}" ${(p.weekly_dayoffs||[]).includes(day)?'checked':''}><span>${userLabel(day)}</span></label>`).join('')}</fieldset>${d.line_user_id?`<p>LINE User ID : ${esc(d.line_user_id)}</p>`:''}<p class="panel-sub">บันทึกในชุดทดลอง ไม่เปลี่ยนบัญชี สิทธิ์ หรือตารางงานระบบเดิม</p><button type="submit" class="btn primary">${target.registrationId?'บันทึกและอนุมัติพนักงานใหม่':'บันทึกข้อมูลทดลอง'}</button></form>`;
  $('#actionDialog').showModal();
  if(target.registrationId){await api('staging_people_read',{registrationId:target.registrationId});await requestQueue()}
 }catch(e){toast(peopleError(e))}
}
async function savePersonnel(form){
 const button=form.querySelector('button[type="submit"]'),fd=new FormData(form);button.disabled=true;
 const data={...state.personnelEdit,name:fd.get('name'),employee_code:fd.get('employee_code'),department:fd.get('department'),position:fd.get('position'),start_date:fd.get('start_date'),weekly_dayoffs:fd.getAll('weekly_dayoffs')};
 try{await api('staging_people_save',data);$('#actionDialog').close();state.directory=null;await render();await requestQueue();toast('บันทึกข้อมูลพนักงานในชุดทดลองแล้ว')}catch(e){toast(peopleError(e))}finally{button.disabled=false}
}

function filteredPeople(){const scope=state.employeeScope||'active',query=(state.employeeSearch||'').trim().toLowerCase();return (state.peopleRows||[]).filter(e=>(scope==='all'||(scope==='inactive'?e.active===false:e.active===true))&&person(e).toLowerCase().includes(query))}
async function employeesView(){
 const d=await loadPeople();
 return panel(`<div class="section-heading"><h2>พนักงาน</h2>${state.role==='admin'?'<button class="btn primary" data-add-personnel>เพิ่มพนักงาน</button>':''}</div><p class="panel-sub">ข้อมูลที่แก้ไขและพนักงานใหม่บันทึกเฉพาะชุดทดลอง</p>${d.registrations.length?`<h3>พนักงานใหม่รอเติมข้อมูล</h3>${d.registrations.map(r=>`<div class="employee-row"><strong>${esc(r.name)}</strong><button class="btn secondary ${r.unread?'request-unread':''}" data-registration="${esc(r.id)}">เปิดอ่าน / เติมข้อมูล</button></div>`).join('')}`:''}<div class="employee-filters"><label class="field">ค้นหาพนักงาน<input id="employeeSearch" type="search" placeholder="ชื่อหรือรหัส" value="${esc(state.employeeSearch||'')}"></label><label class="field">สถานะ<select id="employeeScope">${[['active','ใช้งานอยู่'],['inactive','ปิดใช้งาน'],['all','ทั้งหมด']].map(([v,label])=>`<option value="${v}" ${(state.employeeScope||'active')===v?'selected':''}>${label}</option>`).join('')}</select></label></div><div id="employeeResults">${employeeRows(filteredPeople())}</div>`);
}

function employeeRows(employees,attendanceOnly=false){return (employees||[]).map(e=>`<div class="employee-row"><div><strong>${esc(person(e))}</strong><small>${esc(userLabel(e.attendance_mode))} · ${e.active?'ใช้งานอยู่':'ปิดใช้งาน'}</small></div><button class="btn secondary" ${attendanceOnly?'data-employee':'data-profile'}="${esc(e.id)}">${attendanceOnly?'ดูการลงเวลา':'ดูข้อมูล'}</button>${attendanceOnly?'':`<button class="btn secondary" data-edit-personnel="${esc(e.id)}">แก้ไข</button>`}</div>`).join('')||empty('ไม่พบพนักงาน')}


function userLabel(value,fallback='ไม่ระบุ'){
 const labels={FULL_DAY:'เต็มวัน',HALF_DAY_AM:'ครึ่งวันเช้า',HALF_DAY_PM:'ครึ่งวันบ่าย',SICK_LEAVE:'ลาป่วย',BUSINESS_LEAVE:'ลากิจ',VACATION:'ลาพักร้อน',UNPAID_LEAVE:'ลาไม่รับค่าจ้าง',LEAVE:'ลา',WORK:'ทำงาน',OFF:'วันหยุด',WFH:'ทำงานจากบ้าน',FUTURE:'ยังไม่ถึงวัน',NO_SCHEDULE:'ไม่มีตาราง',STANDARD:'ลงเวลาปกติ',MULTI_BRANCH:'ทำงานหลายสาขา (BA)',STOCK_REFILL:'เติมสินค้า',DRIVER:'พนักงานขับรถ',IN:'เข้างาน',OUT:'ออกงาน',CHECK_IN:'เข้างาน',CHECK_OUT:'ออกงาน',BREAK_OUT:'ออกพัก',BREAK_IN:'กลับจากพัก',DAY_IN:'เริ่มวันทำงาน',DAY_OUT:'จบวันทำงาน',BRANCH_IN:'เข้าสาขา',BRANCH_OUT:'ออกสาขา',PENDING:'รออนุมัติ',APPROVED:'อนุมัติแล้ว',REJECTED:'ไม่อนุมัติ',CANCELLED:'ยกเลิก',ABSENT:'ไม่มาทำงาน',PRESENT:'มาทำงาน',SHORT:'ทำงานไม่ครบ',OVER:'ทำงานเกิน',COMPLETE:'ทำงานครบ',INCOMPLETE:'เวลายังไม่ครบ',MON:'จันทร์',TUE:'อังคาร',WED:'พุธ',THU:'พฤหัสบดี',FRI:'ศุกร์',SAT:'เสาร์',SUN:'อาทิตย์'};
 return labels[value]||(!value?fallback:/^[A-Z][A-Z0-9_]*$/.test(String(value))?fallback:String(value));
}
function leaveDescription(r){return [userLabel(r.leave_type||r.type,'การลา'),userLabel(r.duration,'ไม่ระบุช่วงเวลา')].join(' · ')}

function scheduleLabel(value){return userLabel(value,'ไม่มีข้อมูลตาราง')}
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
 const rows=month.rows||[],daily=day.daily,otInfo={},otStatus=await ownOtStatus(state.selected,otInfo,daily);
 return `<div class="schedule-toolbar"><p>${esc(person(state.boot.employee))}</p><button class="btn secondary" data-today>วันนี้</button></div><div class="personal-calendar-layout">${panel(calendarGrid(rows))}${panel(`<h2>${displayDate(state.selected)}</h2><p>${esc(scheduleLabel(day.schedule?.schedule_status||daily?.schedule_status))}</p>${[['เข้างาน',time(daily?.first_in_at)],['ออกพัก',time(daily?.break_out_at)],['กลับจากพัก',time(daily?.break_in_at)],['ออกงาน',time(daily?.last_out_at)],['ทำงานสุทธิ',hours(daily?.paid_work_hours)],['เวลาที่ควรออก',esc(otInfo.departure||'—')],['สรุปวันนี้',esc(dailyResult(daily,day.schedule,state.selected)+otStatus)]].map(([label,value])=>`<div class="time-line"><span>${label}</span><strong>${value}</strong></div>`).join('')}`)}</div>`;
}

function otSummary(rows){
 const seen=new Set();let minutes=0,waiting=0;
 for(const r of rows||[]){if(r.kind!=='overtime'||r.status!=='APPROVED')continue;if(r.id&&seen.has(r.id))continue;if(r.id)seen.add(r.id);
 if(r.settlement_state==='READY'&&r.minutes!=null&&Number.isFinite(Number(r.minutes))&&Number(r.minutes)>=0)minutes+=Number(r.minutes);else waiting++;
 }
 return {minutes,waiting,hours:waiting?null:minutes/60};
}
function otSummaryLabel(s){return hours(s.minutes/60)+(s.waiting?` · ยังรอตรวจเวลา ${s.waiting} คำขอ`:'')}
async function monthlyOtView(){
 const month=state.month,role=state.role,d=await directory(),employees=reportEmployees(d.employees||[],role);
 const rows=[];
 for(let i=0;i<employees.length;i+=3){
  rows.push(...await Promise.all(employees.slice(i,i+3).map(async e=>{const result=await trialApi('staging_ot_report',{employeeId:e.id,month});return [person(e),otSummaryLabel(otSummary(result.rows||[]))]})));
 }
 return panel(`<h2>ใช้ชดแล้ว · OT${CONFIG.requestsLive?'':' ทดลอง'}</h2><p>คำขอที่อนุมัติสำหรับเดือน ${esc(month)} รวมวันนี้เมื่อเวลาครบทั้งสองวัน</p>${table(['พนักงาน','ใช้ชดแล้ว'],rows)}<p class="panel-sub">${CONFIG.requestsLive?'รวมผลชดไว้ในยอดขาด/เกินแล้ว ไม่ต้องบวกซ้ำ':'แสดงแยกจากยอดระบบเดิม ไม่บวกซ้ำหรือปรับเงินเดือน'}</p>`);
}

async function reportView(){
 const daily=state.reportPeriod!=='monthly';
 const tabs=`<div class="tabs report-tabs"><button class="tab ${daily&&state.reportPeriod!=='individual'?'active':''}" data-report-period="daily">รายงานรายวัน</button><button class="tab ${!daily?'active':''}" data-report-period="monthly">Monthly Summary</button><button class="tab ${state.reportPeriod==='individual'?'active':''}" data-report-period="individual">รายบุคคล / Excel</button></div>`;
 if(state.reportPeriod==='individual')return tabs+await individualReportView();
 if(daily){const d=await api('admin_daily',{date:state.date});return `${tabs}<div class="reports-head"><h2>รายงานรายวัน</h2>${dayPicker()}</div>${panel(`<div class="print-heading"><h2>Kitty Attendance · รายงานรายวัน</h2><p>${displayDate(state.date)} · ${state.role==='hr'?'Head Office':'ทุกกลุ่มพนักงาน'}</p></div>${table(['พนักงาน','สถานะ','เข้างาน','ออกพัก','กลับจากพัก','ออกงาน','ทำงาน','ขาด','เกิน'],d.rows.map(r=>[person(r.employee),userLabel(r.schedule_status||r.work_status,'—'),time(r.first_in_at),time(r.break_out_at),time(r.break_in_at),time(r.last_out_at),hours(r.paid_work_hours),hours(r.short_hours),hours(r.over_hours)]))}<button class="btn primary" data-action="print">พิมพ์ / บันทึก PDF</button><button class="btn secondary" data-action="retry">โหลดรายงานใหม่</button>`)}`}
 const d=await api('admin_monthly_summary',{month:state.month});const ot=await monthlyOtView();return `${tabs}<div class="reports-head"><h2>Monthly Summary</h2><label class="field">เดือน<input type="month" id="month" value="${state.month}"></label></div>${panel(`<div class="print-heading"><h2>Kitty Attendance · Monthly Summary</h2><p>${esc(state.month)} · ${state.role==='hr'?'Head Office ยกเว้น Shane และ Peet':'ทุกกลุ่มพนักงาน'}</p></div><p>เริ่ม ${esc(d.period_start)}${d.period_end_inclusive?' ถึง '+esc(d.period_end_inclusive):''}</p>${table(['พนักงาน','วันทำงาน','ชั่วโมงทำงาน','ชั่วโมงขาด','ชั่วโมงเกิน','เวลาชดระบบเดิม','ชั่วโมงสุทธิ'],d.rows.map(r=>[person(r),r.work_days,hours(r.paid_work_hours),hours(r.short_hours),hours(r.over_hours),hours(r.makeup_hours),hours(r.net_hours)]))}<p class="panel-sub">${CONFIG.requestsLive?'ยอดขาด/เกินรวมผล OT ที่อนุมัติและเวลาครบแล้ว':'ยอดระบบเดิมตามช่วงวันที่ข้างต้น · ดูยอด OT ที่อนุมัติแล้วในตารางแยกด้านล่าง'}</p><button class="btn primary" data-action="print">พิมพ์ / บันทึก PDF</button>`)}${ot}`;
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
  const batch=await Promise.all(selected.slice(i,i+3).map(e=>loadIndividualReport(e.id,month)));
  if(batch.some((r,j)=>r.employee?.id!==selected[i+j].id||r.month!==month))throw Error('ข้อมูลรายงานไม่ตรงกับที่เลือก กรุณาโหลดใหม่');
  if(scope==='active'&&batch.some(r=>r.employee.active!==true)){state.directory=null;throw Error('สถานะพนักงานเปลี่ยนระหว่างโหลด กรุณาโหลดรายชื่อใหม่')}
  reports.push(...batch);
  if(id==='ALL'&&version===renderVersion)$('#content').innerHTML=controls+panel(`<p role="status">กำลังโหลดรายงาน ${reports.length} / ${selected.length} คน…</p>`);
 }
 if(version!==renderVersion||role!==state.role||month!==state.month||id!==state.reportEmployee)return '';
 const report=id==='ALL'?{combined:true,otLive:CONFIG.requestsLive,employee:{id:'ALL',employee_code:'ALL',name:'พนักงานทั้งหมด'},rows:reports.flatMap(r=>r.rows.map(row=>({...row,employee:r.employee}))),warnings:[...new Set(reports.flatMap(r=>r.warnings||[]))],month,generated_at:reports[0].generated_at,employeeCount:reports.length}:reports[0];
 state.individualReport={...report,role,scope};
 const helper=window.KittyIndividualReport,previewRows=report.rows.slice(0,100);
 return controls+panel(`<div class="reports-head"><h2>${id==='ALL'?`พนักงานทั้งหมด ${reports.length} คน`:esc(person(report.employee))}</h2><button class="btn primary" data-action="individual-excel">ดาวน์โหลด Excel</button></div>${report.warnings.map(w=>`<p class="report-warning">${esc(w)}</p>`).join('')}<p class="panel-sub">รวม ${report.rows.length} แถว · Excel มีข้อมูลครบในชีทเดียว${report.rows.length>100?' · ตัวอย่างด้านล่าง 100 แถวแรก':''}</p>${table([...(id==='ALL'?['พนักงาน']:[]),'วันที่','สถานะ','เข้างาน','ออกพัก','กลับจากพัก','ออกงาน','ทำงานสุทธิ',CONFIG.requestsLive?'ใช้ชดแล้ว (OT)':'ใช้ชดแล้ว (OT ทดลอง)','หมายเหตุ / คำขอ'],previewRows.map(r=>[...(id==='ALL'?[person(r.employee)]:[]),r.work_date,scheduleLabel(r.schedule_status),time(r.first_in_at),time(r.break_out_at),time(r.break_in_at),time(r.last_out_at),hours(r.paid_work_hours),r.ot_waiting?'รอตรวจเวลา':hours(r.ot_used_hours),helper.notes(r)]))}`);
}

async function loadIndividualReport(employeeId,month){
 if(CONFIG.requestsLive){
  const report=await api('admin_individual_report',{employeeId,month,requestSource:'live'});
  if(report.requestHistory!=='live'||report.otLive!==true)throw Error('รายงานยังไม่เชื่อมคำขอจริง กรุณาโหลดใหม่');
  return report;
 }
 return mergeSandboxReport(await api('admin_individual_report',{employeeId,month}),combineQueues(await api('staging_request_report',{employeeId,month}),await trialApi('staging_ot_report',{employeeId,month})));
}
function mergeSandboxReport(report,requests){
 const records=(requests.rows||[]).filter(r=>['leave','correction','overtime'].includes(r.kind)).map(r=>({...r,sandbox:r.sandbox!==false,effective_date:r.work_date}));
 return {...report,otLive:CONFIG.requestsLive,rows:report.rows.map(row=>({...row,ot_used_hours:otSummary(records.filter(r=>(r.kind==='overtime'?((r.mode==='USE_PRIOR'?r.target_date:r.source_date)||r.work_date):r.work_date)===row.work_date)).hours,ot_waiting:otSummary(records.filter(r=>(r.kind==='overtime'?((r.mode==='USE_PRIOR'?r.target_date:r.source_date)||r.work_date):r.work_date)===row.work_date)).waiting,requests:[...(row.requests||[]),...records.filter(r=>(r.kind==='overtime'?((r.mode==='USE_PRIOR'?r.target_date:r.source_date)||r.work_date):r.work_date)===row.work_date||(r.created_at&&dateKey(new Date(r.created_at))===row.work_date))]})),warnings:[...(report.warnings||[]),...(requests.warnings||[]),CONFIG.requestsLive?'ยอดขาด/เกินรวม OT ที่อนุมัติและเวลาครบแล้ว ไม่ต้องหักหรือบวก OT ซ้ำ':'ยอดใช้ชดแล้ว (OT ทดลอง) นับเฉพาะอนุมัติและเวลาครบ แยกจากเวลาชดระบบเดิม ไม่ปรับเงินเดือน']};
}

async function downloadIndividualReport(button){
 const report=state.individualReport;
 const valid=()=>report&&state.page==='reports'&&state.reportPeriod==='individual'&&!state.personal&&report.role===state.role&&report.scope===(state.reportScope||'active')&&report.month===state.month&&report.employee.id===state.reportEmployee;
 if(!valid())return;
 button.disabled=true;button.textContent='กำลังสร้าง Excel…';
 try{const wb=window.KittyIndividualReport.build(report,window.ExcelJS);const bytes=await wb.xlsx.writeBuffer();if(!valid())return;const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download=`Attendance_${String(report.employee.employee_code).replace(/[^a-zA-Z0-9_-]/g,'_')}_${report.scope}_${report.month}.xlsx`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);toast('สร้างไฟล์ Excel แล้ว กรุณาดูรายการดาวน์โหลด')}catch(e){toast(errorMessage(e))}finally{button.disabled=false;button.textContent='ดาวน์โหลด Excel'}
}
async function lineView(){const type=state.reportType||'END_DAY';const d=await api('admin_report_preview',{date:state.date,reportType:type});return `${dayPicker()}<label class="field">รายงาน<select id="reportType"><option value="MIDDAY" ${type==='MIDDAY'?'selected':''}>13:00</option><option value="END_DAY" ${type==='END_DAY'?'selected':''}>22:00</option></select></label>${panel(`<pre class="report-message">${esc(d.message)}</pre>${disabled('Send Now')}`)}`}
function draftKey(){return `kitty-${CONFIG.requestsLive?'live':'staging'}-drafts:${state.boot?.employee?.id||state.boot?.profile?.userId||'unlinked'}`}
function drafts(){try{return JSON.parse(sessionStorage.getItem(draftKey())||'[]')}catch{return []}}
function draftHistory(kind){return drafts().filter(d=>d.kind===kind).map(d=>`<div class="leave-card"><div><strong>${esc(d.date)} · ${esc(d.label)}</strong><p>${esc(d.reason)}</p><small>แบบร่างในเครื่อง · ยังไม่ส่งอนุมัติ</small></div><button class="btn primary" data-send-draft="${esc(d.id)}">ส่งให้ HR</button><button class="btn secondary" data-remove-draft="${esc(d.id)}">ลบแบบร่าง</button></div>`).join('')||empty('ยังไม่มีแบบร่างในเครื่องนี้')}
function leaveView(){return panel(`<h2>ขอลา</h2><form id="leaveForm" class="request-form"><label>วันที่ลา<input name="date" type="date" value="${dateKey()}" required></label><label>ประเภทการลา<select name="type"><option>ลากิจ</option><option>ลาป่วย</option><option>ลาพักร้อน</option><option>ลาไม่รับค่าจ้าง</option></select></label><label>ระยะเวลา<select name="duration" id="leaveDuration"><option value="FULL_DAY">เต็มวัน</option><option value="HALF_DAY_AM">ครึ่งวันเช้า</option><option value="HALF_DAY_PM">ครึ่งวันบ่าย</option></select></label><p id="halfDayRule" hidden>วันลาครึ่งวันต้องทำงานสุทธิอย่างน้อย 4 ชั่วโมง หลังหักเวลาพัก</p><label>เหตุผล<textarea name="reason" rows="3" required maxlength="1000"></textarea></label><button class="btn secondary" type="submit">บันทึกแบบร่างในเครื่อง</button><button class="btn primary" type="submit" data-send-request="true">ส่งให้ HR</button><p class="panel-sub">${CONFIG.requestsLive?'เมื่ออนุมัติจะปรับตารางงานและสรุปเวลาจริง':'ส่งเข้าชุดทดลองเท่านั้น ไม่แก้ตารางงานหรือเงินเดือนเดิม'}</p></form><h3>แบบร่างของฉัน</h3>${draftHistory('leave')}`)}
function correctionView(){return panel(`<h2>ขอลงเวลาย้อนหลัง</h2><form id="correctionForm" class="request-form"><label>วันที่<input name="date" type="date" max="${dateKey()}" value="${dateKey()}" required></label><label>เหตุการณ์<select name="event"><option>เข้างาน</option><option>ออกงาน</option><option>ออกพัก</option><option>กลับจากพัก</option></select></label><label>เวลา<input name="time" type="time" required></label><label>เหตุผล<textarea name="reason" required maxlength="1000"></textarea></label><button class="btn secondary" type="submit">บันทึกแบบร่างในเครื่อง</button><button class="btn primary" type="submit" data-send-request="true">ส่งให้ HR</button></form>${draftHistory('correction')}`)}
async function leaveManagementView(){const d=await api('staging_schedule',{date:state.date});const rows=d.rows.filter(r=>['SICK_LEAVE','BUSINESS_LEAVE','VACATION','UNPAID_LEAVE','LEAVE'].includes(r.schedule_status));return `${dayPicker()}${panel(`<h2>การลาที่บันทึกในตารางงาน</h2>${table(['พนักงาน','วันที่','ประเภท'],rows.map(r=>[person(r.employee),r.work_date,scheduleLabel(r.schedule_status)]))}<p class="panel-sub">${CONFIG.requestsLive?'ข้อมูลตารางงานจริง รวมการลาที่อนุมัติแล้ว':'ข้อมูลจากระบบเดิม · ระบบรับคำขอและอนุมัติใน Staging ยังไม่เชื่อมต่อ'}</p>`)}`}
function unavailableView(){return panel(`<h2>${esc(activeMenu().find(x=>x[0]===state.page)?.[2]||'รายการ')}</h2><p>หน้านี้ยังไม่เชื่อมข้อมูลและการบันทึกใน Staging</p><p class="panel-sub">ใช้งานฟังก์ชันนี้ผ่านระบบเดิมได้ตามปกติ</p>`)}
function managementView(){return `<div class="management-grid">${state.role==='admin'?'<button class="management-card" data-role-preview="MULTI_BRANCH"><strong>ดูหน้าพนักงาน BA / Driver</strong><span>›</span></button>':''}${activeMenu().filter(x=>!['dashboard','employees','schedule','reports'].includes(x[0])).map(([id,icon,label])=>`<button class="management-card" data-page="${id}"><span class="nav-symbol">${uiIcon(id)}</span><strong>${label}</strong><span>›</span></button>`).join('')}</div>`}
async function hrAccessView(){
 if(!CONFIG.requestsLive||state.role!=='admin')return unavailableView();
 const data=await api('admin_hr_list');state.hrRegistrations=data.registrations||[];
 return window.KittyHRAccess.management(state.hrRegistrations)+panel('<a class="btn secondary" href="legacy.html">ตั้งค่าระบบเดิม</a>');
}
async function hrAccessDecision(button){
 const row=(state.hrRegistrations||[]).find(r=>r.id===button.dataset.registrationId);if(!row)return;
 button.disabled=true;
 try{await window.KittyHRAccess.createController({api,confirm:message=>window.confirm(message)}).review(button.dataset.hrDecision,row);await render()}catch(e){toast(errorMessage(e))}finally{button.disabled=false}
}
async function submitHRRegistration(form){
 const button=form.querySelector('button');button.disabled=true;
 try{const result=await window.KittyHRAccess.createController({api,confirm:()=>false}).register(new FormData(form).get('name'));state.boot.hrRegistration=result.registration;await render()}catch(e){toast(errorMessage(e))}finally{button.disabled=false}
}
async function trialApi(action,payload={}){
 try{return await api(action,payload)}catch(e){if(CONFIG.requestsLive&&['FORBIDDEN','ADMIN_REQUIRED'].includes(e.message))return {rows:[],profiles:[],registrations:[],warnings:['บัญชีนี้ไม่มีสิทธิ์ชุดทดลอง ข้อมูลส่วนนี้ไม่รวมในรายการ']};throw e}
}
async function attendanceView(){const d=await directory();return `${dayPicker()}${panel(`<h2>เลือกพนักงานเพื่อดูเวลา</h2>${employeeRows(d.employees,true)}`)}`}
async function render(){
 navigation();if(!state.connected)return;
 const version=++renderVersion;$('#content').innerHTML=state.loginLoading?loginLoading():panel('กำลังโหลดข้อมูล…');
 const views={'hr-register':()=>window.KittyHRAccess.registration(state.boot.hrRegistration),clock:clockView,dashboard:dashboardView,employees:employeesView,schedule:scheduleView,calendar:calendarView,reports:reportView,line:lineView,'my-leave':()=>personalRequestView('leave'),'clock-request':()=>personalRequestView('correction'),more:managementView,settings:hrAccessView,attendance:attendanceView,offices:async()=>{const d=await directory();return panel(table(['รหัส','สำนักงาน'],d.offices.map(o=>[o.office_code,o.name])))},leave:()=>requestsView('leave'),'clock-approvals':()=>requestsView('correction')};
 try{const html=await (views[state.page]||unavailableView)();if(version===renderVersion){$('#content').innerHTML=html+(html.includes('title="ยังไม่เปิดการบันทึกในระบบทดลอง"')?'<p class="availability-note">ปุ่มสีเทายังไม่เปิดการบันทึกใน Staging · ใช้งานผ่านระบบเดิมได้ตามปกติ</p>':'');tick();if(state.page==='clock-request'&&$('#overtimeForm')?.elements)loadOvertimeBalance($('#overtimeForm [data-ot-balance]'))}}
 catch(e){if(version===renderVersion)$('#content').innerHTML=panel(`<h2>โหลดข้อมูลไม่สำเร็จ</h2><p>${esc(errorMessage(e))}</p><button class="btn primary" data-action="retry">ลองใหม่</button>`)}
}
function tick(){document.querySelectorAll('[data-clock]').forEach(el=>el.textContent=new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(now()));document.querySelectorAll('[data-clock-date]').forEach(el=>el.textContent=displayDate(dateKey()))}
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),4000)}


const requestCache=new Map(),readMemory=new Map(),queueVersions=new Map(),settledRequests=new Map();
function invalidateReviewedRequest(kind,id){const scope=requestScope();queueVersions.set(scope,(queueVersions.get(scope)||0)+1);const ids=settledRequests.get(scope)||new Set();ids.add(kind+':'+id);settledRequests.set(scope,ids);const cached=requestCache.get(scope);if(cached)requestCache.set(scope,{...cached,rows:cached.rows.filter(r=>!ids.has(requestKey(r)))});navigation()}
function requestScope(){return state.boot?.profile?.userId ? 'kitty-request-read:'+(CONFIG.requestsLive?'live:':'staging:')+state.boot.profile.userId+':'+state.role : null}
function readRequestIds(){const key=requestScope();if(!key)return new Set();const memory=readMemory.get(key)||[];try{const stored=JSON.parse(localStorage.getItem(key)||'[]');return new Set([...memory,...(Array.isArray(stored)?stored:[])])}catch{return new Set(memory)}}
function requestKey(r){return r.kind+':'+r.id}
function unreadRequests(kind){if(state.personal||!['hr','admin'].includes(state.role))return [];const ids=readRequestIds();return (requestCache.get(requestScope())?.rows||[]).filter(r=>r.id&&r.unread!==false&&requestCategory(r)===kind&&!ids.has(requestKey(r)))}
function requestBadge(page){const kind=page==='employees'?'registration':page==='leave'?'leave':page==='clock-approvals'?'correction':null;return kind&&unreadRequests(kind).length?'<span class="unread-dot" role="img" aria-label="มีคำขอยังไม่ได้อ่าน"></span>':''}
function requestCategory(r){return r.kind==='overtime'?'correction':r.kind}
function combineQueues(a,b){return {rows:[...(a.rows||[]),...(b.rows||[])].sort((x,y)=>String(y.created_at).localeCompare(String(x.created_at))),warnings:[...(a.warnings||[]),...(b.warnings||[])]}}
function overtimeState(r){return r.settlement_state==='READY'?`${r.status==='APPROVED'?'ใช้ชดแล้ว':'ชดได้'} ${hours(Number(r.minutes)/60)} · ยังขาด ${hours(Number(r.remaining_short_minutes||0)/60)}`:r.settlement_state==='SCHEDULE_CHANGED'?'ตารางงานเปลี่ยน กรุณาให้ HR ตรวจสอบ':r.settlement_state==='INACTIVE'?'ไม่ได้ใช้ชั่วโมง':'รอตรวจเวลาครบทั้งสองวัน'}
function otSourceMinutes(r){
 if(r.source_final===false||r.source_paid_minutes==null||r.source_required_minutes==null)return null;
 return Math.max(0,r.mode==='MAKEUP_NEXT'?Number(r.source_required_minutes)-Number(r.source_paid_minutes):Number(r.source_paid_minutes)-Number(r.source_required_minutes));
}
function expectedDeparture(firstIn,minutes,day){
 if(!firstIn)return 'ยังไม่ลงเวลา';
 const stamp=Date.parse(firstIn);if(!Number.isFinite(stamp)||minutes==null)return '—';
 const departure=new Date(stamp+minutes*60000);
 return time(departure.toISOString())+(dateKey(departure)!==day?' ('+displayDate(dateKey(departure))+')':'');
}
function overtimeDetails(r){
 const amount=otSourceMinutes(r);
 const label=r.mode==='MAKEUP_NEXT'?'เวลาที่ต้องทำชด':'ชั่วโมงที่ใช้ได้';
 const adjustment=amount==null?null:(r.mode==='MAKEUP_NEXT'?amount:-amount);
 return `<div class="ot-total"><span>${label}</span><strong>${amount==null?'วันก่อนหน้ายังลงเวลาไม่ครบ':hours(amount/60)}</strong></div>`+table(['วันทำงาน','เวลาสุทธิ','เวลาที่ควรออก'],[
 [r.source_date||'—',hours(r.source_paid_minutes==null?null:r.source_paid_minutes/60),expectedDeparture(r.source_first_in_at,540,r.source_date)],
 [r.target_date||'—',hours(r.target_paid_minutes==null?null:r.target_paid_minutes/60),expectedDeparture(r.target_first_in_at,adjustment==null?null:540+adjustment,r.target_date)]
 ])+`<p class="ot-departure-result">${esc(otDepartureResult(r,adjustment))}</p>`;
}
function otDepartureResult(r,adjustment){
 if(!r.target_first_in_at)return 'ยังไม่ลงเวลาเข้า';
 if(adjustment==null)return 'รอข้อมูลวันทำงานก่อนหน้า';
 if(!r.target_last_out_at)return 'รอเวลาออกงานจริง';
 const delta=Math.round((Date.parse(r.target_last_out_at)-Date.parse(r.target_first_in_at))/60000)-(540+adjustment);
 if(!Number.isFinite(delta))return 'ข้อมูลเวลาไม่ครบ';
 return delta===0?'ออกครบตามเวลาที่ควรออก':delta<0?'ออกก่อนเวลาที่ควรออก '+hours(-delta/60):'ออกหลังเวลาที่ควรออก '+hours(delta/60);
}
function overtimeDescription(r){return `${r.mode==='USE_PRIOR'?'ใช้ชั่วโมงเกิน':'ชดชั่วโมงขาด'} ${esc(overtimeState(r))} · ${esc(r.source_date||'—')} → ${esc(r.target_date||'—')}`}
async function requestQueue(){
 const scope=requestScope(),version=(queueVersions.get(scope)||0)+1;queueVersions.set(scope,version);
 try{const [regular,ot,people]=await Promise.all([api('staging_request_queue'),trialApi('staging_ot_queue'),trialApi('staging_people_list')]);const data=combineQueues(regular,ot);data.rows.push(...(people.registrations||[]).map(r=>({...r,kind:'registration',employee:{name:r.name},reason:'รอ HR กรอกข้อมูลพนักงาน'})));data.rows=data.rows.filter(r=>(!r.status||r.status==='PENDING')&&!settledRequests.get(scope)?.has(requestKey(r)));if(version!==queueVersions.get(scope))return requestCache.get(scope)||{rows:[],warnings:[]};if(scope&&scope===requestScope()){requestCache.set(scope,data);navigation()}return data}
 catch(error){return {rows:[],warnings:[['STAGING_READ_ONLY','UNKNOWN_ACTION'].includes(error.message)?'รายการคำขอยังรอเปิดบริการอ่านข้อมูล':'โหลดคำขอไม่สำเร็จ: '+errorMessage(error)]}}
}
async function refreshRequestNotifications(){
 if(!state.connected||document.hidden||refreshRequestNotifications.busy)return;
 refreshRequestNotifications.busy=true;
 try{
  if(state.personal||state.role==='employee'){
   const kind=state.page==='clock-request'?'correction':state.page==='my-leave'?'leave':null;
   if(kind){const version=renderVersion,rows=await personalRequests(kind);if(version===renderVersion&&$('#personalRequestHistory'))$('#personalRequestHistory').innerHTML=personalHistory(rows)}
  }else if(['admin','hr'].includes(state.role)){
   const scope=requestScope(),before=JSON.stringify(requestCache.get(scope)?.rows),version=renderVersion;
   const data=await requestQueue();
   if(version===renderVersion&&scope===requestScope()&&!data.warnings?.length&&before!==JSON.stringify(data.rows)&&['dashboard','clock-approvals','leave','employees'].includes(state.page)&&!$('#actionDialog').open)await render();
  }
 }catch{/* Keep existing history and typed forms when background refresh fails. */}
 finally{refreshRequestNotifications.busy=false}
}
function liveRequest(kind){return CONFIG.requestsLive&&['leave','correction','overtime'].includes(kind)}
function openRequest(key){
 const r=(requestCache.get(requestScope())?.rows||[]).find(r=>requestKey(r)===key);
 if(!r||state.personal||!['admin','hr'].includes(state.role))return;
 if(r.kind==='registration'){personnelEditor({registrationId:r.id});return}
 $('#actionTitle').textContent=r.kind==='leave'?'คำขอลา':r.kind==='overtime'?'ใช้โอที':'คำขอลงเวลา';
 $('#actionBody').innerHTML=`<h2>${esc(person(r.employee))}</h2><p>วันที่ ${esc(r.leave_date||r.work_date||'—')}</p><p>${r.kind==='overtime'?overtimeDescription(r):esc(r.kind==='leave'?leaveDescription(r):userLabel(r.requested_event_type))}</p>${r.kind==='overtime'?overtimeDetails(r):''}${r.requested_event_at?`<p>เวลาที่ขอ ${time(r.requested_event_at)}</p>`:''}<p class="request-reason">เหตุผล : ${esc(r.reason||'ไม่ระบุเหตุผล')}</p><p>${liveRequest(r.kind)?'การอนุมัติมีผลกับข้อมูลลงเวลาจริง':'คำขอทดลอง · การอนุมัติไม่แก้ข้อมูลลงเวลาเดิม'}</p><label class="field rejection-field" id="rejectionField" hidden>เหตุผลที่ปฏิเสธ<textarea id="reviewReason" maxlength="1000"></textarea></label><div class="request-shortcuts"><button class="btn primary" data-review-kind="${esc(r.kind)}" data-review-id="${esc(r.id)}" data-decision="APPROVED">${liveRequest(r.kind)?'อนุมัติ':'อนุมัติทดลอง'}</button><button class="btn secondary" data-review-kind="${esc(r.kind)}" data-review-id="${esc(r.id)}" data-decision="REJECTED">ปฏิเสธ</button></div>`;
 $('#actionDialog').showModal();
 const ids=readRequestIds();ids.add(key);readMemory.set(requestScope(),[...ids]);try{localStorage.setItem(requestScope(),JSON.stringify([...ids]))}catch{}
 navigation();
 document.querySelectorAll('[data-request-key]').forEach(button=>{if(button.dataset.requestKey===key){button.classList.remove('request-unread');button.querySelector('.request-read-label').textContent='อ่านแล้ว'}});
}
function requestList(data,limit=1000){
 const rows=data.rows||[],warnings=data.warnings||[];
 return warnings.map(w=>`<p class="report-warning">${esc(w)}</p>`).join('')+
 (rows.length?rows.slice(0,limit).map(r=>`<article class="request-item"><div><strong>${esc(person(r.employee))}</strong><span class="attendance-tag">รออนุมัติ</span></div><p>${r.kind==='registration'?'สมัครพนักงานใหม่':r.kind==='leave'?esc(leaveDescription(r)):r.kind==='overtime'?'ใช้โอที':'ขอแก้เวลา'} · ${esc(r.leave_date||r.work_date||'—')}</p><p class="request-reason">เหตุผล : ${esc(r.reason||'ไม่ระบุเหตุผล')}</p><small>ส่ง ${r.created_at?esc(displayDate(dateKey(new Date(r.created_at)))+' '+time(r.created_at)):'—'}</small>${r.id?`<button class="btn secondary ${(r.unread===false||readRequestIds().has(requestKey(r)))?'':'request-unread'}" data-request-key="${esc(requestKey(r))}"><span class="request-read-label">${(r.unread===false||readRequestIds().has(requestKey(r)))?'อ่านแล้ว':'เปิดอ่านคำขอ'}</span></button>`:''}</article>`).join(''):warnings.length?'':empty('ไม่มีคำขอรออนุมัติ'))+
 (rows.length>limit?`<p class="panel-sub">แสดง ${limit} จาก ${rows.length} รายการที่โหลด</p>`:'');
}
async function requestsView(kind){
 const data=await requestQueue(),filtered={...data,rows:(data.rows||[]).filter(r=>requestCategory(r)===kind)};
 return panel(`<div class="section-heading"><h2>${kind==='leave'?'คำขอลา':'คำขอลงเวลา'}</h2><button class="btn secondary" data-action="retry">โหลดใหม่</button></div>${requestList(filtered)}<p class="panel-sub">ล่าสุดไม่เกิน 1,000 รายการ${CONFIG.requestsLive?' · คำขอมีผลกับสรุปเวลาจริง':' · ชุดทดลอง ไม่กระทบระบบเดิม'}</p>`)+(kind==='leave'?`<details class="panel"><summary>การลาที่บันทึกแล้ว</summary>${await leaveManagementView()}</details>`:'');
}

const requestErrors={WORK_SCHEDULE_REQUIRED:'ต้องมีตารางงานวันทำงานก่อนอนุมัติลา',HALF_DAY_REQUIRES_CLOCK:'ลาครึ่งวันใช้กับวันที่ลงเวลาทำงานเท่านั้น',LEAVE_ALREADY_APPROVED:'มีการลาอนุมัติในวันนี้แล้ว',EVENT_ALREADY_EXISTS:'มีการลงเวลาประเภทนี้แล้ว กรุณาให้แอดมินตรวจสอบ',INVALID_EVENT_ORDER:'เวลาที่ขอไม่สัมพันธ์กับลำดับเข้า พัก และออกงาน',USE_ADMIN_BRANCH_CORRECTION:'รายการสาขาของ BA ต้องให้แอดมินแก้ผ่านระบบเดิม',EMPLOYEE_INACTIVE:'พนักงานไม่ได้อยู่ในสถานะใช้งาน',OT_SCHEDULE_REQUIRED:'ยังไม่มีตารางงานครบสำหรับคู่วันทำงานนี้ กรุณาให้ HR ตรวจตาราง',OT_SOURCE_NOT_FINAL:'ต้องมีเวลาออกงานและสรุปเวลาสุทธิของวันที่นำชั่วโมงมาใช้ก่อน',OT_INSUFFICIENT_MINUTES:'ชั่วโมงที่ใช้ได้ไม่พอ หรือมีคำขอใช้ชั่วโมงนี้แล้ว',OT_WINDOW_EXPIRED:'ใช้ได้เฉพาะวันทำงานที่ติดกัน ไม่สามารถยกยอดมาใช้วันนี้ได้',OT_SCHEDULE_CHANGED:'ตารางงานเปลี่ยน กรุณาตรวจคู่วันและส่งคำขอใหม่',DUPLICATE_PENDING_REQUEST:'มีคำขอประเภทนี้ในวันเดียวกันรออนุมัติอยู่แล้ว',ALREADY_REVIEWED:'รายการนี้ถูกพิจารณาหรือยกเลิกแล้ว กรุณาโหลดใหม่',FUTURE_EVENT:'เวลาที่ขอยังมาไม่ถึง',REJECTION_REASON_REQUIRED:'กรุณาระบุเหตุผลที่ปฏิเสธ',FORBIDDEN:'คุณไม่มีสิทธิ์ดำเนินการกับคำขอนี้',REQUEST_SERVICE_ERROR:'บริการคำขอไม่พร้อม กรุณาลองใหม่',IDEMPOTENCY_CONFLICT:'ข้อมูลคำขอเปลี่ยนไป กรุณาส่งใหม่'};
function workflowError(error){if(error.message==='OT_OFFICE_ONLY')return 'การขอใช้ OT นี้เปิดสำหรับพนักงาน Head Office';return requestErrors[error.message]||errorMessage(error)}

function overtimeView(){return panel(`<h2>ใช้โอที</h2><form id="overtimeForm" class="request-form overtime-form"><label>รูปแบบ<select name="mode"><option value="USE_PRIOR">ใช้ชั่วโมงเกินจากวันทำงานก่อนหน้า</option><option value="MAKEUP_NEXT">วันนี้ทำชดชั่วโมงขาดจากวันทำงานก่อนหน้า</option></select></label><label>วันที่<input type="date" name="date" value="${dateKey()}" max="${dateKey()}" required></label><button type="button" class="btn secondary" data-ot-balance>ตรวจเวลาทั้งสองวัน</button><div id="otBalance" role="status"><p>กำลังตรวจชั่วโมงที่ใช้ได้…</p></div><label>เหตุผล<textarea name="reason" maxlength="1000" required></textarea></label><p class="panel-sub">${CONFIG.requestsLive?'HR อนุมัติแล้ว ระบบจะชดตามเวลาจริงของทั้งสองวัน':'OT ส่วนนี้ยังไม่ปรับยอดเวลาจริงหลังอนุมัติ'}</p><button class="btn primary" type="submit" data-send-request="true">ส่งให้ HR</button></form>`)}
let otBalanceVersion=0;
async function otPairForToday(mode,date){
 const prior=await api('staging_ot_balance',{mode:'USE_PRIOR',date});
 if(!prior.source_date)throw Error('OT_SCHEDULE_REQUIRED');
 if(mode==='USE_PRIOR')return {balance:prior,requestDate:date};
 const balance=await api('staging_ot_balance',{mode:'MAKEUP_NEXT',date:prior.source_date});
 if(balance.target_date!==date)throw Error('OT_SCHEDULE_CHANGED');
 return {balance,requestDate:prior.source_date};
}
function priorOtSummary(data,mode,day){
 const daily=day.daily;
 if(!daily?.last_out_at||daily.paid_work_hours==null||((!!daily.break_out_at)!=(!!daily.break_in_at)))return '<p>วันทำงานก่อนหน้ายังลงเวลาไม่ครบ</p>';
 const required=data.source_required_minutes;
 if(required==null)return '<p>ยังไม่พบชั่วโมงทำงานที่กำหนดของวันก่อนหน้า</p>';
 const delta=Math.round(Number(daily.paid_work_hours)*60)-Number(required);
 const minutes=Math.max(0,mode==='USE_PRIOR'?delta:-delta);
 const departure=expectedDeparture(data.target_first_in_at,540+(mode==='MAKEUP_NEXT'?minutes:-minutes),data.target_date);
 return '<p class="ot-prior-summary"><span>วันทำงานก่อนหน้า ('+esc(data.source_date)+') '+(mode==='USE_PRIOR'?'ทำงานเกิน':'ทำงานขาด')+'</span><strong>'+hours(minutes/60)+'</strong></p>'+
 '<p class="ot-prior-summary ot-planned-departure"><span>เวลาที่ควรออกหากคำขอนี้ได้รับอนุมัติ</span><strong>'+esc(departure)+'</strong></p>';
}
async function loadOvertimeBalance(button){
 const form=$('#overtimeForm'),mode=form.elements.mode.value,date=form.elements.date.value,version=renderVersion,requestVersion=++otBalanceVersion;
 if(!date||!button)return;button.disabled=true;$('#otBalance').textContent='กำลังตรวจชั่วโมงที่ใช้ได้…';
 const current=()=>version===renderVersion&&requestVersion===otBalanceVersion&&form.elements.mode.value===mode&&form.elements.date.value===date;
 try{
  const [pair,mine]=await Promise.all([otPairForToday(mode,date),api('staging_ot_mine')]);
  const data=pair.balance,requestDate=pair.requestDate;
  const previous=await api('today',{date:data.source_date});
  const existing=(mine.rows||[]).find(r=>r.mode===mode&&r.work_date===requestDate&&['PENDING','APPROVED'].includes(r.status));
  if(current()){
   form.dataset&&(form.dataset.otBlocked=existing?'true':'false');
   const send=form.querySelector?.('[data-send-request]'),reason=form.querySelector?.('[name="reason"]');
   if(send)send.disabled=!!existing;
   if(reason){reason.disabled=!!existing;reason.closest('label').hidden=!!existing}
   if(existing){$('#otBalance').innerHTML='';return}
  }
  if(current())$('#otBalance').innerHTML=priorOtSummary(data,mode,previous);
 }catch(error){if(current())$('#otBalance').textContent=workflowError(error)}finally{if(requestVersion===otBalanceVersion)button.disabled=false}
}

async function personalRequestView(kind){
 const form=kind==='leave'?leaveView():correctionView()+overtimeView();
 try{const rows=await personalRequests(kind);return form+panel('<div id="personalRequestHistory">'+personalHistory(rows)+'</div>')}
 catch(error){return form+panel(`<p class="report-warning">โหลดประวัติไม่สำเร็จ: ${esc(workflowError(error))}</p>`)}
}
async function personalRequests(kind){const data=combineQueues(await api('staging_request_mine'),kind==='correction'?await api('staging_ot_mine'):{rows:[]});return (data.rows||[]).filter(r=>requestCategory(r)===kind)}
function personalHistory(rows){const pending=rows.filter(r=>r.status==='PENDING'),done=rows.filter(r=>r.status!=='PENDING');return '<h2>คำขอรออนุมัติ</h2>'+myRequestHistory(pending)+(done.length?`<details class="event-details"><summary>ประวัติคำขอที่พิจารณาแล้ว / ยกเลิก (${done.length})</summary>${myRequestHistory(done)}</details>`:'')}
function requestDescription(r){
 if(r.kind==='overtime')return 'ขอใช้ OT · '+(r.mode==='USE_PRIOR'?'ใช้ชั่วโมงเกินจากวันทำงานก่อนหน้า':'ชดชั่วโมงขาดในวันทำงานถัดไป')+' · '+esc(r.source_date||'—')+' → '+esc(r.target_date||'—');
 if(r.kind==='leave')return 'ขอลา · '+esc(leaveDescription(r));
 if(r.kind==='correction')return 'ขอแก้เวลา · '+esc(userLabel(r.requested_event_type||r.event,'ไม่ระบุรายการ'))+' · เวลา '+esc(r.requested_event_at?time(r.requested_event_at):r.time||'ไม่ระบุ');
 return esc(userLabel(r.kind,'คำขอ'));
}
function myRequestHistory(rows){
 const status={PENDING:'รออนุมัติ',APPROVED:'อนุมัติแล้ว',REJECTED:'ปฏิเสธ',CANCELLED:'ยกเลิก'};
 return rows.map(r=>`<article class="request-item ${r.kind==='correction'&&r.approved_sequence_in_month>=3?'frequent-request':''}"><strong>${esc(r.work_date)} · <span class="request-status ${r.status==='APPROVED'?'request-approved':''}">${status[r.status]||esc(userLabel(r.status))}</span></strong><p>${requestDescription(r)}</p>${r.sandbox===true||!CONFIG.requestsLive?'<small class="request-scope">รายการทดลอง · ยังไม่มีผลกับข้อมูลลงเวลาจริง</small>':''}<p class="request-reason">เหตุผล : ${esc(r.reason)}</p>${r.review_reason?`<p>หมายเหตุ: ${esc(r.review_reason)}</p>`:''}${r.approved_sequence_in_month?`<p class="${r.approved_sequence_in_month>=3?'report-warning':''}">ครั้งที่ ${r.approved_sequence_in_month}</p>`:''}${r.status==='PENDING'?`<button class="btn secondary" data-request-kind="${esc(r.kind)}" data-cancel-request="${esc(r.id)}">ยกเลิกคำขอ</button>`:''}</article>`).join('')||empty(CONFIG.requestsLive?'ยังไม่มีคำขอที่ส่ง':'ยังไม่มีคำขอที่ส่งในชุดทดลอง');
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
 if(form.dataset.sending||form.dataset.otBlocked==='true')return;
 if(form.id==='overtimeForm'){
  form.dataset.sending='true';button.disabled=true;
  try{const pair=await otPairForToday(data.mode,data.date);data={mode:data.mode,date:pair.requestDate,reason:data.reason}}catch(e){toast(workflowError(e));delete form.dataset.sending;button.disabled=false;return}
 }
 const kind=form.id==='leaveForm'?'leave':form.id==='overtimeForm'?'overtime':'correction',events={'เข้างาน':'IN','ออกพัก':'BREAK_OUT','กลับจากพัก':'BREAK_IN','ออกงาน':'OUT'};
 const payload={...data,kind,event:kind==='correction'?events[data.event]:undefined};
 const fingerprint=JSON.stringify(payload);
 if(form.dataset.fingerprint!==fingerprint){form.dataset.clientId=crypto.randomUUID();form.dataset.fingerprint=fingerprint}
 payload.clientId=form.dataset.clientId;
 form.dataset.sending='true';button.disabled=true;const version=renderVersion;
 try{await api(kind==='overtime'?'staging_ot_submit':'staging_request_submit',payload);if(version===renderVersion){await render();toast(liveRequest(kind)?'ส่งคำขอให้ HR แล้ว':'ส่งคำขอทดลองให้ HR แล้ว')}}catch(error){toast(workflowError(error))}finally{delete form.dataset.sending;button.disabled=false}
}
async function reviewRequest(button){
 if(button.disabled)return;
 if(button.dataset.decision==='REJECTED'&&$('#rejectionField').hidden){$('#rejectionField').hidden=false;button.textContent='ยืนยันปฏิเสธ';$('#reviewReason').focus();return}
 const reason=button.dataset.decision==='APPROVED'?'':($('#reviewReason')?.value||'').trim();
 if(button.dataset.decision==='REJECTED'&&!reason){toast('กรุณาระบุเหตุผลที่ปฏิเสธ');return}
 const buttons=document.querySelectorAll('[data-review-id]');buttons.forEach(b=>b.disabled=true);
 try{await api(button.dataset.reviewKind==='overtime'?'staging_ot_review':'staging_request_review',{id:button.dataset.reviewId,decision:button.dataset.decision,reviewReason:reason});invalidateReviewedRequest(button.dataset.reviewKind||'correction',button.dataset.reviewId);$('#actionDialog').close();$('#actionBody').innerHTML='';await render();toast(liveRequest(button.dataset.reviewKind)?'บันทึกผลพิจารณาจริงแล้ว':'บันทึกผลพิจารณาในชุดทดลองแล้ว')}
 catch(error){toast(workflowError(error))}finally{buttons.forEach(b=>b.disabled=false)}
}
async function cancelRequest(button){
 button.disabled=true;
 try{await api(button.dataset.requestKind==='overtime'?'staging_ot_cancel':'staging_request_cancel',{id:button.dataset.cancelRequest});await render();toast(liveRequest(button.dataset.requestKind)?'ยกเลิกคำขอแล้ว':'ยกเลิกคำขอทดลองแล้ว')}catch(error){toast(workflowError(error))}finally{button.disabled=false}
}

function profileFields(data){
 const e=data.employee,offKeys=['weekly_dayoffs','weekly_dayoff','weekly_days_off','weekly_off_days','day_off'];
 const value=offKeys.find(k=>e[k]!==undefined&&e[k]!==null);
 const dayoff=value?(Array.isArray(e[value])?(e[value].map(v=>userLabel(v,'ไม่ระบุวัน')).join(', ')||'ไม่ได้กำหนดวันหยุดประจำสัปดาห์'):userLabel(e[value],'ไม่ระบุวัน')):'ยังไม่มีข้อมูลวันหยุดประจำสัปดาห์จากระบบ';
 return [['รหัสพนักงาน',e.employee_code],['ชื่อ',e.name],['สถานะ',e.active===true?'ใช้งานอยู่':e.active===false?'ปิดใช้งาน':'ไม่ระบุ'],['รูปแบบลงเวลา',userLabel(e.attendance_mode)],['LINE User ID',Object.prototype.hasOwnProperty.call(e,'line_user_id')?(e.line_user_id||'ยังไม่ผูก LINE'):'ยังไม่เชื่อมข้อมูล LINE User ID'],['สำนักงาน',data.office?.name||e.default_office_id||e.office_id||'ไม่ระบุ'],['วันหยุดประจำสัปดาห์',dayoff],['แผนก',e.department],['ตำแหน่ง',e.position]].map(([label,value])=>`<div class="profile-field"><dt>${label}</dt><dd>${esc(value??'ไม่ระบุ')}</dd></div>`).join('');
}
async function showProfile(id){
 const staged=(state.peopleRows||[]).find(e=>e.id===id);
 if(staged?.sandbox_new||staged?.sandbox_profile){try{const d=await api('staging_people_get',personnelTarget(id));$('#actionTitle').textContent='ข้อมูลพนักงาน · ชุดทดลอง';$('#actionBody').innerHTML='<dl class="employee-profile">'+profileFields({employee:{...staged,...d.profile,id,line_user_id:d.line_user_id}})+'</dl>';$('#actionDialog').showModal()}catch(e){toast(peopleError(e))}return}
 const version=renderVersion;
 try{let d;try{d=await api('admin_employee_profile',{employeeId:id})}catch(error){if(!['STAGING_READ_ONLY','UNKNOWN_ACTION'].includes(error.message))throw error;const employee=state.directory?.employees.find(e=>e.id===id);if(!employee)throw error;d={employee,pending:true}}if(version!==renderVersion)return;$('#actionTitle').textContent='ข้อมูลพนักงาน';$('#actionBody').innerHTML=`${d.pending?'<p class="report-warning">ข้อมูลเพิ่มเติมของพนักงานยังรอเปิดบริการอ่านข้อมูล</p>':''}<dl class="employee-profile">${profileFields(d)}</dl>`;$('#actionDialog').showModal()}catch(error){toast(errorMessage(error))}
}

async function showSelfProfile(){
 try{const d=await api('staging_self_profile');
 $('#actionTitle').textContent='ข้อมูลส่วนตัวของฉัน';
 const e=d.employee;
 $('#actionBody').innerHTML=`<dl class="employee-profile">${profileFields({employee:e})}</dl>`;
 $('#actionDialog').showModal();
 }catch(e){toast(peopleError(e))}
}
async function showEmployee(id){
 const e=state.directory?.employees.find(e=>e.id===id);const version=renderVersion;
 try{const d=await api('admin_employee_day',{employeeId:id,date:state.date});if(version!==renderVersion)return;$('#actionTitle').textContent=e?person(e):'การลงเวลาพนักงาน';$('#actionBody').innerHTML=`<p>${displayDate(state.date)}</p>${eventsTable(d.events)}${state.role==='admin'&&!state.personal?adminEventForms(d.events,id):''}<p>สถานะตาราง: ${esc(scheduleLabel(d.schedule?.schedule_status))}</p><p>ชั่วโมงทำงาน: ${hours(d.daily?.paid_work_hours)}</p>`;$('#actionDialog').showModal()}catch(e){toast(errorMessage(e))}
}

function adminEventForms(events,employeeId){
 return (events||[]).map(e=>'<form class="request-form admin-event-form" data-admin-event="'+esc(e.id)+'" data-employee-id="'+esc(employeeId)+'"><h3>'+esc(userLabel(e.event_type))+'</h3><label>วันที่<input name="date" type="date" required value="'+esc(e.work_date||state.date)+'"></label><label>เวลา<input name="time" type="time" required value="'+esc(time(e.event_at))+'"></label><label>เหตุผลที่แก้ไข<textarea name="reason" maxlength="1000" required></textarea></label><button class="btn primary" type="submit">บันทึกเวลาใหม่</button></form>').join('');
}
async function saveAdminEvent(form){
 if(state.role!=='admin'||state.personal||form.dataset.saving)return;
 const data=Object.fromEntries(new FormData(form)),eventAt=data.date+'T'+data.time+':00+07:00';
 if(!data.reason.trim())return toast('กรุณาระบุเหตุผลที่แก้ไข');
 if(!window.confirm('ยืนยันแก้เวลาจริงเป็น '+data.date+' '+data.time+' ?'))return;
 form.dataset.saving='true';const button=form.querySelector('button');button.disabled=true;
 try{await api('admin_update_event',{eventId:form.dataset.adminEvent,eventAt,reason:data.reason});toast('บันทึกและคำนวณเวลาใหม่แล้ว');await showEmployee(form.dataset.employeeId)}
 catch(e){toast('ยังยืนยันผลไม่ได้ กรุณาปิดแล้วเปิดข้อมูลล่าสุดก่อนแก้ซ้ำ: '+errorMessage(e))}
 finally{delete form.dataset.saving;button.disabled=false}
}

document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b||b.disabled)return;
 if(b.dataset.hrDecision){hrAccessDecision(b);return}
 if(b.dataset.hrRefresh!==undefined){init();return}
 if(b.id==='selfProfileButton'){showSelfProfile();return}
 if(b.dataset.clockEvent){submitClock(b.dataset.clockEvent);return}
 if(b.dataset.clockRefresh!==undefined){refreshClock();return}
 if(b.dataset.addPersonnel!==undefined){personnelEditor();return}
 if(b.dataset.editPersonnel){personnelEditor(personnelTarget(b.dataset.editPersonnel));return}
 if(b.dataset.registration){personnelEditor({registrationId:b.dataset.registration});return}
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
 if(b.dataset.action==='login'){$('#content').innerHTML=loginLoading();if(window.liff){if(liff.isLoggedIn())liff.logout();liff.login({redirectUri:loginRedirect()})}else location.reload();return}
 if(b.dataset.action==='personal-leave'){state.personal=true;state.page='my-leave';render();return}
 if(b.dataset.action==='print')window.print();
});
document.addEventListener('input',e=>{if(e.target.id==='employeeSearch'){state.employeeSearch=e.target.value;$('#employeeResults').innerHTML=employeeRows(filteredPeople())}});
document.addEventListener('change',e=>{if(e.target.id==='employeeScope'){state.employeeScope=e.target.value;$('#employeeResults').innerHTML=employeeRows(filteredPeople())}if(e.target.closest?.('#overtimeForm')&&['mode','date'].includes(e.target.name))loadOvertimeBalance($('#overtimeForm [data-ot-balance]'));if(e.target.id==='reportScope'){state.reportScope=e.target.value;state.reportEmployee='';state.directory=null;render()}if(e.target.id==='reportEmployee'){state.reportEmployee=e.target.value;render()}if(e.target.id==='workDate'&&e.target.value){state.date=e.target.value;state.selected=state.date;state.month=state.date.slice(0,7);render()}if(e.target.id==='month'&&e.target.value){state.month=e.target.value;state.selected=state.month+'-01';if(state.page==='schedule')state.date=state.selected;render()}if(e.target.id==='reportType'){state.reportType=e.target.value;render()}if(e.target.id==='leaveDuration')$('#halfDayRule').hidden=e.target.value==='FULL_DAY'});
document.addEventListener('submit',e=>{
 if(e.target.dataset.adminEvent){e.preventDefault();saveAdminEvent(e.target);return}
 if(e.target.id==='hrRegistrationForm'){e.preventDefault();submitHRRegistration(e.target);return}
 if(e.target.id==='signupForm'){e.preventDefault();submitSignup(e.target);return}
 if(e.target.id==='personnelForm'){e.preventDefault();savePersonnel(e.target);return}
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
setInterval(refreshRequestNotifications,30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){tick();refreshRequestNotifications()}});
navigation();init();
