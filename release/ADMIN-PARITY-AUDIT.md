# ผลตรวจฟังก์ชัน Admin เทียบระบบเดิม — 24 กันยายน 2026

ตรวจซอร์สหน้า Production รุ่น 33 เทียบ legacy.html และ rapid-processor version 29 ที่เก็บไว้ ไม่ได้ทดลองเขียนข้อมูลบุคคลจริงหรือส่ง LINE จริง

| ฟังก์ชันเดิมที่ยืนยันจากโค้ด | หน้าใหม่ | หลักฐาน/ข้อจำกัด |
|---|---|---|
| ภาพรวมรายวัน/ดูเวลารายบุคคล | มีเส้นทางอ่านข้อมูลจริง | admin_daily / admin_employee_day |
| แก้เวลารายการเดิม | มี แต่ไม่ครบตัวเลือกเดิม | gateway เปิดเฉพาะ eventId,eventAt,reason; เดิมเปลี่ยน eventType ได้ |
| เพิ่มรายการลงเวลา | ไม่มี | เดิม admin_add_event |
| ลบรายการลงเวลา | ไม่มี | เดิม admin_delete_event |
| แก้สถานะตารางวันทำงาน/ลา/WFH/หยุด | ดูได้ แต่แก้จริงไม่ได้ | เดิม admin_update_schedule; ใหม่ staging_schedule อ่านอย่างเดียว |
| รับ/อนุมัติ/ปฏิเสธสมัครพนักงาน | ยังเป็นชุดทดลอง | ใหม่ staging_people_*; เดิม admin_pending_registrations / admin_approve_registration / admin_reject_registration |
| เพิ่มพนักงาน | ยังไม่สร้างพนักงานจริง | เดิม admin_create_employee; ใหม่ staging_people_save |
| Active/Inactive | มีตัวกรอง แต่ไม่มีปุ่มเปลี่ยนสถานะจริง | เดิม admin_set_employee_active |
| แก้รายละเอียด/วันหยุดในหน้าใหม่ | บันทึกเฉพาะชุดทดลอง | staging_people_save ไม่เปลี่ยน public.employees |
| Monthly Summary | มีอ่านรายงานจริง | OT ใหม่ยังแสดงแยกชุดทดลอง ไม่ใช่การเชื่อมครบ |
| รายงานรายวัน | มีอ่าน/พิมพ์ PDF | ไม่เท่ากับรูปแบบ A4/PNG เดิม |
| รายงาน A4 รายบุคคลและทั้งองค์กร/PNG | ยังไม่มี workflow เดิม | เดิม admin_a4_employee_daily_report / admin_a4_org_monthly_report พร้อมตัวสร้าง PNG ใน legacy.html |
| LINE Preview | มี | admin_report_preview |
| LINE Send Now | ปิดใช้งาน | หน้าใหม่เรียก disabled('Send Now'); เดิม admin_report_send |
| ให้สิทธิ์ HR ผูก LINE | มีจริงใน Production | admin_hr_* ผ่าน live gateway; เป็นฟังก์ชันใหม่ไม่ใช่ parity ระบบเดิม |
| Office/Branch | แสดงรายการ | ไม่พบ workflow แก้ไขในหน้าใหม่; ยังไม่ยืนยันว่า legacy UI ชุดนี้มีตัวแก้สำนักงาน |
| Audit Log | มีชื่อเมนูแต่ไม่มี view | ตกไป unavailableView; ไม่พบหน้า Audit Log ใน legacy UI ชุดที่ตรวจ แม้ backend มี attendance_event_audit |
| ตั้งค่าระบบ | เฉพาะสิทธิ์ HR และลิงก์เดิม | ยังไม่ใช่หน้าตั้งค่าครบ; ไม่พบหลักฐาน UI ตั้งผู้รับรายงานใน legacy ชุดนี้ |

ข้อสรุป: ไม่สามารถเรียกหน้าใหม่ว่า Admin parity ครบได้ การมีลิงก์ legacy เป็นเพียงทางสำรอง ไม่ใช่การคืนฟีเจอร์ในหน้าใหม่

ลำดับงานที่ควรคืน: 1) เวลาเพิ่ม/แก้ชนิด/ลบพร้อม audit 2) ตารางงาน 3) พนักงานและสถานะจริง 4) LINE Send พร้อมยืนยันผู้รับ 5) A4/PNG เดิม
ต้องทดสอบสิทธิ์ Admin เท่านั้น, กัน HR preview, เหตุผลการแก้, คำนวณใหม่, และผลล้มเหลวบางส่วนก่อนเปิดแต่ละเส้นทาง

รอบตรวจนี้เปลี่ยนเฉพาะไอคอนปุ่มลงเวลา (นาฬิกา/กาแฟ/ออกงาน รวม BA/Driver) และทดสอบ 128 รายการ ไม่เปิดฟังก์ชันเขียน Admin เพิ่มจากการตรวจนี้
