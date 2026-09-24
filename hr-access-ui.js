(function(root){
 'use strict';
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels={PENDING:'รอแอดมินอนุมัติ',APPROVED:'ได้รับสิทธิ์ HR แล้ว',REJECTED:'ไม่ได้รับอนุมัติ',REVOKED:'ถูกถอนสิทธิ์ HR'};
 function registration(data){
  if(data)return '<section class="panel"><h2>ลงทะเบียน HR</h2><p>'+escape(data.name)+'</p><p>'+escape(labels[data.status]||'ไม่ทราบสถานะ')+'</p><button class="btn secondary" data-hr-refresh>ตรวจสถานะ</button></section>';
  return '<section class="panel"><h2>ลงทะเบียน HR</h2><form id="hrRegistrationForm" class="request-form"><label>ชื่อ–นามสกุล<input name="name" maxlength="160" required autocomplete="name"></label><p>ใช้บัญชี LINE ที่เข้าสู่ระบบ รอแอดมินกำหนดสิทธิ์</p><button class="btn primary" type="submit">ส่งคำขอให้แอดมิน</button></form></section>';
 }
 function management(rows){
  return '<section class="panel"><h2>กำหนดสิทธิ์ HR</h2>'+rows.map(r=>'<article class="hr-access-row"><div><strong>'+escape(r.name)+'</strong><p class="hr-line-id">LINE User ID : '+escape(r.line_user_id)+'</p><p>'+escape(labels[r.status]||'ไม่ทราบสถานะ')+'</p></div><div class="hr-access-actions">'+(r.status==='PENDING'?button(r,'grant','กำหนดเป็น HR')+button(r,'reject','ไม่อนุมัติ'):r.status==='APPROVED'?button(r,'revoke','ถอนสิทธิ์ HR'):'')+'</div></article>').join('')+(rows.length?'':'<p>ยังไม่มีคำขอลงทะเบียน HR</p>')+'</section>';
 }
 function button(r,action,label){return '<button class="btn '+(action==='grant'?'primary':'secondary')+'" data-hr-decision="'+action+'" data-registration-id="'+escape(r.id)+'" data-version="'+escape(r.version)+'">'+label+'</button>'}
 function createController({api,confirm}){
  let busy=false;
  return {
   async register(name){if(busy)throw Error('BUSY');busy=true;try{return await api('hr_register',{name:String(name).trim()})}finally{busy=false}},
   async review(action,row){
    if(!['grant','reject','revoke'].includes(action))throw Error('INVALID_ACTION');
    if(busy)throw Error('BUSY');busy=true;
    try{
     const verb={grant:'กำหนดเป็น HR',reject:'ไม่อนุมัติ',revoke:'ถอนสิทธิ์ HR'}[action];
     if(!await confirm(verb+' : '+row.name+'\nLINE User ID : '+row.line_user_id))return null;
     return await api('admin_hr_'+action,{registrationId:row.id,version:row.version});
    }finally{busy=false}
   }
  };
 }
 const api={registration,management,createController};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.KittyHRAccess=api;
})(typeof globalThis!=='undefined'?globalThis:this);
