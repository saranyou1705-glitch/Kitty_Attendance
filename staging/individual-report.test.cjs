const {test}=require('node:test');
const assert=require('node:assert/strict');
const ExcelJS=require('./vendor/exceljs-4.4.0.min.js');
const report=require('./individual-report.js');
test('employee and Excel departure share approved OT calculation and Bangkok date',async()=>{
 const row={work_date:'2026-09-25',first_in_at:'2026-09-25T02:00:00Z',requests:[{id:'ot',kind:'overtime',mode:'USE_PRIOR',target_date:'2026-09-25',status:'APPROVED',sandbox:false,source_final:true,source_paid_minutes:602,source_required_minutes:540}]};
 assert.equal(report.departure(row).label,'16:58');
 const pending={...row,requests:row.requests.map(r=>({...r,status:'PENDING'}))};assert.equal(report.departure(pending).label,'18:00 · OT รออนุมัติ');
 assert.equal(report.departure({...row,requests:row.requests.map(r=>({...r,mode:'MAKEUP_NEXT',source_paid_minutes:478}))}).label,'19:02');
 const wb=report.build({...sample,otLive:true,rows:[row]},ExcelJS);const opened=new ExcelJS.Workbook();await opened.xlsx.load(await wb.xlsx.writeBuffer());const sheet=opened.worksheets[0];
 assert.equal(sheet.getCell('M7').value,'เวลาที่ควรออก');assert.equal(sheet.getCell('M8').value.toISOString(),'2026-09-25T16:58:00.000Z');assert.equal(sheet.getCell('N8').value,'16:58');assert(!sheet.getCell('A5').value.includes('Staging'));
});
const sample={employee:{id:'x',employee_code:'HO-TEST',name:'Test employee'},month:'2026-09',generated_at:'2026-09-21T18:01:00Z',warnings:['ยังไม่เชื่อมประวัติคำขอลา'],rows:[
 {work_date:'2026-09-01',schedule_status:'WORK',first_in_at:'2026-09-01T02:00:00Z',break_out_at:'2026-09-01T05:00:00Z',break_in_at:'2026-09-01T06:00:00Z',last_out_at:'2026-09-01T11:00:00Z',paid_work_hours:8,short_hours:0,over_hours:0,makeup_hours:0,schedule_note:'=1+1',requests:[{kind:'correction',status:'APPROVED',effective_date:'2026-09-01',created_at:'2026-09-02T02:00:00Z',requested_event_type:'OUT',requested_event_at:'2026-09-01T11:00:00Z',approved_sequence_in_month:3,deduction_amount:200,reason:'ลืมลงเวลา'}]},
 {work_date:'2026-09-02',schedule_status:'NO_SCHEDULE',requests:[]}
]};
test('combined export puts every employee in one sheet with aligned dates, notes and totals',async()=>{
 const data={...sample,combined:true,scope:'active',employeeCount:2,rows:[...sample.rows.map(r=>({...r,employee:{employee_code:'HO001',name:'One'}})),...sample.rows.map(r=>({...r,employee:{employee_code:'HO002',name:'Two'}}))]};
 const wb=report.build(data,ExcelJS);const bytes=await wb.xlsx.writeBuffer();const opened=new ExcelJS.Workbook();await opened.xlsx.load(bytes);const s=opened.worksheets[0];
 assert.equal(opened.worksheets.length,1);assert.equal(s.getCell('A8').value,'HO001');assert.equal(s.getCell('B10').value,'Two');assert.equal(s.getCell('C10').value.toISOString(),'2026-09-01T00:00:00.000Z');assert.equal(s.getCell('I8').numFmt,'[h]" ชม. "mm" นาที"');assert.match(s.getCell('M8').value,/ครั้งที่ 3/);assert.equal(s.getCell('I12').formula,'SUM(I8:I11)');assert.equal(s.views[0].xSplit,3);
});
test('notes distinguish submission date, effective date and approved sequence',()=>{const text=report.notes(sample.rows[0]);assert.match(text,/ครั้งที่ 3/);assert.match(text,/200 บาท/);assert.match(text,/สำหรับวันที่ 2026-09-01/);assert.match(text,/ส่ง 2026-09-02 09:00/);assert.equal(report.flagged(sample.rows[0]),true);const rejected={...sample.rows[0],requests:sample.rows[0].requests.map(r=>({...r,status:'REJECTED'}))};assert(!report.notes(rejected).includes('ยอดต้องหัก'));assert(!report.flagged(rejected))});
test('time values use Bangkok minutes and preserve missing vs zero',()=>{assert.equal(report.excelTime('2026-09-21T18:01:00Z'),61/1440);assert.equal(report.excelDuration(null),null);assert.equal(report.excelDuration(0),0);assert.equal(report.excelDuration(9.81),589/1440)});
test('browser export round-trips valid XLSX with typed dates, duration formats, formulas and literal notes',async()=>{
 const wb=report.build(sample,ExcelJS);const bytes=await wb.xlsx.writeBuffer();assert.equal(bytes[0],80);assert.equal(bytes[1],75);
 const opened=new ExcelJS.Workbook();await opened.xlsx.load(bytes);const sheet=opened.worksheets[0];const serial=v=>v instanceof Date?v.getTime()/86400000+25569:v;
 assert.equal(opened.worksheets.length,1);assert.equal(sheet.getCell('A8').value.toISOString(),'2026-09-01T00:00:00.000Z');assert.equal(serial(sheet.getCell('C8').value),9/24);
 assert(Math.abs(serial(sheet.getCell('G8').value)-8/24)<1e-9);assert.equal(sheet.getCell('G8').numFmt,'[h]" ชม. "mm" นาที"');assert.equal(sheet.getCell('G9').value,null);assert.equal(serial(sheet.getCell('H8').value),0);
 assert.equal(sheet.getCell('G10').formula,'SUM(G8:G9)');assert(Math.abs(serial(sheet.getCell('G10').result)-8/24)<1e-9);
 assert.equal(typeof sheet.getCell('K8').value,'string');assert.match(sheet.getCell('K8').value,/=1\+1/);assert.equal(sheet.getCell('K8').font.color.argb,'FFB91C1C');assert.match(sheet.getCell('K5').value,/ยังไม่เชื่อม/);assert.equal(sheet.views[0].ySplit,7);
});
test('OT minutes export in a separate numeric column without overwriting legacy makeup',async()=>{
 for(const combined of [false,true]){
  const data={...sample,combined,employeeCount:1,rows:[{...sample.rows[0],employee:sample.employee,ot_used_hours:35/60}]};
  const wb=report.build(data,ExcelJS),bytes=await wb.xlsx.writeBuffer(),loaded=new ExcelJS.Workbook();await loaded.xlsx.load(bytes);const s=loaded.worksheets[0],ot=combined?'N':'L',legacy=combined?'L':'J';
  const serial=v=>v instanceof Date?v.getTime()/86400000+25569:v;
  assert.equal(wb.worksheets[0].getCell(ot+'8').value,35/1440);
  assert.equal(s.getCell(ot+'7').value,'ใช้ชดแล้ว (OT ทดลอง)');assert(Math.abs(serial(s.getCell(ot+'8').value)-35/1440)<1e-9);assert.equal(serial(s.getCell(legacy+'8').value),0);
  assert.equal(s.getCell(ot+'9').formula,'SUM('+ot+'8:'+ot+'8)');assert.equal(s.getCell(ot+'8').numFmt,'[h]" ชม. "mm" นาที"');
 }
});
test('leave export notes translate type and duration without exposing codes',()=>{const text=report.notes({requests:[{kind:'leave',leave_type:'SICK_LEAVE',duration:'FULL_DAY',status:'APPROVED',effective_date:'2026-09-24'}]});assert(text.includes('ลาป่วย'));assert(text.includes('เต็มวัน'));assert(!text.includes('SICK_LEAVE'));assert(!text.includes('FULL_DAY'));assert(!text.includes('APPROVED'))});
