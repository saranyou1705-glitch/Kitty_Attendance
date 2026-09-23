/* Browser report export. No data leaves the browser while generating the XLSX. */
(function(root){
 'use strict';
 const status={PENDING:'รออนุมัติ',APPROVED:'อนุมัติ',REJECTED:'ปฏิเสธ',CANCELLED:'ยกเลิก',WORK:'ทำงาน',WFH:'WFH',OFF:'หยุด',LEAVE:'ลา',SICK_LEAVE:'ลาป่วย',BUSINESS_LEAVE:'ลากิจ',VACATION:'ลาพักร้อน',UNPAID_LEAVE:'ลาไม่รับค่าจ้าง',FUTURE:'ยังไม่ถึงวัน',NO_SCHEDULE:'ไม่พบตาราง'};
 const events={IN:'เข้างาน',OUT:'ออกงาน',BREAK_OUT:'ออกพัก',BREAK_IN:'กลับจากพัก',CHECK_IN:'เข้างาน',CHECK_OUT:'ออกงาน'};
 const duration={FULL_DAY:'เต็มวัน',HALF_DAY_AM:'ครึ่งวันเช้า',HALF_DAY_PM:'ครึ่งวันบ่าย'};
 const day=value=>value?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value)):'';
 const clock=value=>value?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)):'';
 function notes(row){
  const lines=row.schedule_note?[`หมายเหตุตาราง: ${row.schedule_note}`]:[];
  for(const r of row.requests||[]){
   const kind=r.kind==='leave'?`ขอลา ${duration[r.duration]||r.duration||''}`:`ขอแก้เวลา ${events[r.requested_event_type]||r.requested_event_type||''} ${clock(r.requested_event_at)}`;
   const submitted=r.created_at?`${day(r.created_at)} ${clock(r.created_at)}`:'ไม่ระบุ';
   let text=`${r.sandbox?'[ทดลอง] ':''}${kind} · ${status[r.status]||r.status} · สำหรับวันที่ ${r.effective_date} · ส่ง ${submitted}`;
   if(r.kind==='correction'&&r.status==='APPROVED'){
    if(r.approved_sequence_in_month!=null)text+=` · ครั้งที่ ${r.approved_sequence_in_month}`;
    if(Number(r.deduction_amount)>0)text+=` · ยอดต้องหัก ${Number(r.deduction_amount)} บาท`;
   }
   if(r.reason)text+=` · เหตุผล: ${r.reason}`;
   lines.push(text);
  }
  return lines.join('\n');
 }
 const flagged=row=>(row.requests||[]).some(r=>r.kind==='correction'&&r.status==='APPROVED'&&Number(r.approved_sequence_in_month)>=3);
 const excelDuration=value=>value==null||value===''||!Number.isFinite(Number(value))?null:Math.round(Number(value)*60)/1440;
 const excelTime=value=>{const valueClock=clock(value);if(!valueClock)return null;const [h,m]=valueClock.split(':').map(Number);return(h*60+m)/1440};
 function build(data,ExcelJS){
  if(!ExcelJS)throw Error('โหลดส่วนสร้าง Excel ไม่สำเร็จ กรุณารีเฟรชหน้า');
  const wb=new ExcelJS.Workbook();wb.creator='Kitty Attendance';wb.created=new Date(data.generated_at);wb.calcProperties.fullCalcOnLoad=true;
  const shift=data.combined?2:0,noteCol=data.combined?'M':'K';
  const sheet=wb.addWorksheet('ลงเวลารายบุคคล',{views:[{state:'frozen',xSplit:1+shift,ySplit:7,showGridLines:false}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'7:7'}});
  sheet.columns=[...(data.combined?[16,30]:[]),14,22,13,13,13,13,23,23,23,23,100].map(width=>({width}));
  sheet.getCell('A2').value=data.combined?'รายงานลงเวลาพนักงานทั้งหมด':'รายงานลงเวลารายบุคคล';sheet.getCell('A2').font={name:'Arial',size:16,bold:true};
  sheet.getCell('A3').value=data.combined?`${data.employeeCount} คน · ${data.scope==='all'?'ทุกสถานะ รวม Inactive':'Active เท่านั้น'}`:`${data.employee.employee_code} · ${data.employee.name}`;
  sheet.getCell('A4').value=`เดือน ${data.month} · เวลาไทย · ดึงข้อมูล ${day(data.generated_at)} ${clock(data.generated_at)}`;
  sheet.getCell('A5').value='แหล่งข้อมูล: Kitty Attendance Staging / ฐานข้อมูลจริง (อ่านอย่างเดียว)';
  sheet.getCell(`${noteCol}5`).value=(data.warnings||[]).join('\n')||'หมายเหตุคำขอแสดงทั้งวันที่ส่งและวันที่เกี่ยวข้อง ไม่นับซ้ำเป็นคำขอใหม่';
  sheet.getCell(`${noteCol}5`).alignment={wrapText:true,vertical:'top'};sheet.getRow(5).height=46;
  if(data.warnings?.length)sheet.getCell(`${noteCol}5`).font={name:'Arial',size:11,color:{argb:'FF9C6500'}};
  const headers=[...(data.combined?['รหัสพนักงาน','ชื่อพนักงาน']:[]),'วันที่','สถานะตาราง','เข้างาน','ออกพัก','กลับจากพัก','ออกงาน','ทำงานสุทธิ','ขาด','เกิน','เวลาชด','หมายเหตุ / คำขอ'];
  sheet.getRow(7).values=headers;sheet.getRow(7).height=28;
  sheet.getRow(7).eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF223452'}};cell.font={name:'Arial',size:11,bold:true,color:{argb:'FFFFFFFF'}};cell.alignment={horizontal:'center',vertical:'middle'}});
  data.rows.forEach((r,i)=>{
   const n=i+8;const text=notes(r);const row=sheet.getRow(n);
   row.values=[...(data.combined?[r.employee.employee_code,r.employee.name]:[]),new Date(r.work_date+'T00:00:00Z'),status[r.schedule_status]||r.schedule_status||'',...['first_in_at','break_out_at','break_in_at','last_out_at'].map(k=>excelTime(r[k])),...['paid_work_hours','short_hours','over_hours','makeup_hours'].map(k=>excelDuration(r[k])),text||null];
   row.eachCell({includeEmpty:true},cell=>{cell.font={name:'Arial',size:11,color:{argb:'FF1E293B'}};cell.alignment={vertical:'top',horizontal:typeof cell.value==='number'?'right':'left'};if(i%2===1)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF3F6FA'}}});
   row.getCell(1+shift).numFmt='dd/mm/yyyy';
   for(let c=3;c<=6;c++)row.getCell(c+shift).numFmt='hh:mm';
   for(let c=7;c<=10;c++)row.getCell(c+shift).numFmt='[h]" ชม. "mm" นาที"';
   row.getCell(11+shift).alignment={wrapText:true,vertical:'top'};
   if(flagged(r))row.getCell(11+shift).font={name:'Arial',size:11,bold:true,color:{argb:'FFB91C1C'}};
   row.height=Math.min(409,Math.max(26,text.split('\n').reduce((sum,line)=>sum+Math.max(1,Math.ceil(line.length/80)),0)*17+8));
  });
  sheet.autoFilter={from:'A7',to:`${noteCol}${7+data.rows.length}`};
  const n=data.rows.length+8;sheet.getCell(`B${n}`).value='รวมเวลาที่มีข้อมูล';
  for(let c=7;c<=10;c++){
   const col=String.fromCharCode(64+c+shift);const values=data.rows.map(r=>excelDuration(r[['paid_work_hours','short_hours','over_hours','makeup_hours'][c-7]])).filter(v=>v!==null);
   if(values.length)sheet.getCell(`${col}${n}`).value={formula:`SUM(${col}8:${col}${n-1})`,result:values.reduce((a,b)=>a+b,0)};
   sheet.getCell(`${col}${n}`).numFmt='[h]" ชม. "mm" นาที"';
  }
  sheet.getRow(n).font={name:'Arial',size:11,bold:true};sheet.getRow(n).height=28;
  sheet.getCell(`${noteCol}${n}`).value='ช่องว่าง = ไม่มีข้อมูล ไม่ใช่ 0 ชั่วโมง';
  return wb;
 }
 root.KittyIndividualReport={notes,flagged,status,build,excelDuration,excelTime};
 if(typeof module==='object'&&module.exports)module.exports=root.KittyIndividualReport;
})(typeof window==='object'?window:globalThis);
