
// Supabase Edge Function: rapid-processor-staging
// Production data stays read-only. Explicit request RPC actions write only kitty_staging.
// Never deploy this file over rapid-processor.
// Required secrets:
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// LINE access token is supplied per request and verified with LINE.
// Never expose the service-role key in GitHub Pages.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-line-access-token",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "X-Kitty-Environment": "staging",
};

// These actions call a single RPC whose only write targets are kitty_staging.
const STAGING_REQUEST_ACTIONS:Record<string,string> = {
  staging_request_submit:"submit", staging_request_review:"review",
  staging_request_cancel:"cancel", staging_request_mine:"mine",
  staging_request_queue:"queue", staging_request_report:"report",
  staging_ot_submit:"submit",staging_ot_balance:"balance",staging_ot_review:"review",
  staging_ot_cancel:"cancel",staging_ot_mine:"mine",staging_ot_queue:"queue",staging_ot_report:"report",
};
const STAGING_PERSONNEL_ACTIONS:Record<string,string>={staging_self_profile:"get",staging_self_profile_save:"save",staging_people_register:"register",staging_people_mine:"mine",staging_people_list:"list",staging_people_get:"get",staging_people_save:"save",staging_people_read:"read"};
const STAGING_READ_ACTIONS = new Set([
  "bootstrap",
  "registration_options",
  "today",
  "employee_month",
  "admin_pending_registrations",
  "admin_bootstrap",
  "admin_daily",
  "admin_employee_day",
  "admin_individual_report",
  "admin_a4_employee_daily_report",
  "admin_a4_org_monthly_report",
  "admin_monthly_summary",
  "admin_report_preview",
  "staging_schedule",
  "admin_employee_profile",
  "admin_request_queue",
]);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

async function verifyLine(req: Request) {
  const token = req.headers.get("x-line-access-token") || "";
  if (!token) throw new Error("MISSING_LINE_TOKEN");

  const profileRes = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!profileRes.ok) throw new Error("INVALID_LINE_TOKEN");
  return await profileRes.json() as { userId: string; displayName: string; pictureUrl?: string };
}



function bangkokDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function thaiDisplayDate(date: string) {
  const [y,m,d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("th-TH", {
    timeZone:"Asia/Bangkok", day:"numeric", month:"long", year:"numeric"
  }).format(new Date(Date.UTC(y,m-1,d)));
}

function hm(hours: unknown) {
  const n = Math.max(0, Number(hours || 0));
  const mins = Math.round(n * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h} ชม. ${m} นาที`;
  if (h) return `${h} ชม.`;
  return `${m} นาที`;
}

function clock(v: string | null) {
  if (!v) return "";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone:"Asia/Bangkok", hour:"2-digit", minute:"2-digit", hour12:false
  }).format(new Date(v));
}


const MAX_GPS_ACCURACY_METERS = 150;

function calculateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) {
  const earthRadius = 6371000;
  const toRadians = (value: number) => value * Math.PI / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findOpenBranchOfficeId(events: any[]) {
  let openOfficeId: string | null = null;

  for (const event of events || []) {
    if (event.event_type === "BRANCH_IN") {
      openOfficeId = event.office_id || null;
    } else if (event.event_type === "BRANCH_OUT") {
      openOfficeId = null;
    }
  }

  return openOfficeId;
}

async function validateAttendanceLocation(
  supabase: any,
  employee: any,
  workDate: string,
  eventType: string,
  body: any,
  existingEvents: any[],
) {
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const gpsAccuracy = Number(body.gpsAccuracy);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("ไม่สามารถตรวจสอบตำแหน่ง GPS ได้ กรุณาเปิด Location แล้วลองใหม่");
  }

  if (
    !Number.isFinite(gpsAccuracy) ||
    gpsAccuracy > MAX_GPS_ACCURACY_METERS
  ) {
    throw new Error(
      `GPS ยังไม่แม่นยำ (${Number.isFinite(gpsAccuracy) ? Math.round(gpsAccuracy) : "-"} เมตร) ` +
      "กรุณารอสักครู่แล้วลองใหม่",
    );
  }

  const [
    { data: schedule, error: scheduleError },
    { data: officeRows, error: officeError },
  ] = await Promise.all([
    supabase
      .from("employee_schedules")
      .select("office_id,schedule_status")
      .eq("employee_id", employee.id)
      .eq("work_date", workDate)
      .maybeSingle(),

    supabase
      .from("offices")
      .select("id,office_code,name,latitude,longitude,radius_meters,active")
      .eq("active", true),
  ]);

  if (scheduleError || officeError) throw scheduleError || officeError;

  const offices = (officeRows || [])
    .map((office: any) => ({
      ...office,
      latitude: Number(office.latitude),
      longitude: Number(office.longitude),
      radius_meters: Number(office.radius_meters || 200),
    }))
    .filter((office: any) =>
      Number.isFinite(office.latitude) &&
      Number.isFinite(office.longitude) &&
      Number.isFinite(office.radius_meters) &&
      office.radius_meters > 0
    );

  if (!offices.length) {
    throw new Error("ยังไม่ได้ตั้งค่าพิกัดและ Radius ของสาขาในระบบ");
  }

  const withDistance = offices.map((office: any) => ({
    ...office,
    distance_meters: calculateDistanceMeters(
      office.latitude,
      office.longitude,
      latitude,
      longitude,
    ),
  }));

  let targetOffice: any = null;
  let gpsStatus = "WITHIN_NEAREST_OFFICE";

  const isMultiBranch = employee.attendance_mode === "MULTI_BRANCH";

  if (isMultiBranch) {
    const openBranchOfficeId = findOpenBranchOfficeId(existingEvents);

    if (
      openBranchOfficeId &&
      ["BREAK_OUT", "BREAK_IN", "BRANCH_OUT"].includes(eventType)
    ) {
      targetOffice = withDistance.find(
        (office: any) => office.id === openBranchOfficeId,
      ) || null;
      gpsStatus = "WITHIN_CURRENT_BRANCH";
    }
  }

  if (!targetOffice && !isMultiBranch && employee.allow_any_office !== true) {
    const lockedOfficeId =
      schedule?.office_id ||
      employee.assigned_office_id ||
      null;

    if (!lockedOfficeId) {
      throw new Error(
        `พนักงาน ${employee.employee_code} ยังไม่ได้กำหนด Default Office`,
      );
    }

    targetOffice = withDistance.find(
      (office: any) => office.id === lockedOfficeId,
    ) || null;

    if (!targetOffice) {
      throw new Error(
        "ไม่พบพิกัดของ Default Office หรือสาขาดังกล่าวถูกปิดใช้งาน",
      );
    }

    gpsStatus = schedule?.office_id
      ? "WITHIN_SCHEDULED_OFFICE"
      : "WITHIN_ASSIGNED_OFFICE";
  }

  if (!targetOffice) {
    targetOffice = withDistance
      .slice()
      .sort(
        (a: any, b: any) =>
          a.distance_meters - b.distance_meters,
      )[0];
  }

  if (targetOffice.distance_meters > targetOffice.radius_meters) {
    throw new Error(
      `คุณอยู่นอกพื้นที่ ${targetOffice.name} ` +
      `ระยะ ${Math.round(targetOffice.distance_meters)} เมตร ` +
      `(กำหนดไม่เกิน ${Math.round(targetOffice.radius_meters)} เมตร)`,
    );
  }

  return {
    officeId: targetOffice.id,
    officeName: targetOffice.name,
    latitude,
    longitude,
    gpsAccuracy,
    distanceMeters: Math.round(targetOffice.distance_meters),
    gpsStatus,
  };
}


function groupOffice(list: any[]) {
  const groups: Record<string, any[]> = {};
  for (const x of list || []) {
    const office = x.office_name || "ไม่ระบุสาขา";
    (groups[office] ||= []).push(x);
  }
  return groups;
}

function officeNames(list: any[]) {
  const groups = groupOffice(list);
  return Object.keys(groups).sort().map(o =>
    `${o}: ${groups[o].map(x => x.name).join(", ")}`
  ).join("\n");
}

function officeIssues(list: any[], mode: "short"|"over") {
  const groups = groupOffice(list);
  return Object.keys(groups).sort().map(o =>
    `${o}: ${groups[o].map(x =>
      mode === "short"
        ? `${x.name} ขาด ${hm(x.short_hours)}`
        : `${x.name} เกิน ${hm(x.over_hours)}`
    ).join(", ")}`
  ).join("\n");
}

function section(icon: string, title: string, list: any[], formatter: (x:any[])=>string) {
  const safe = list || [];
  const header = `${icon} ${title} (${safe.length} คน)`;
  return safe.length ? `${header}\n${formatter(safe)}` : `${header}\n• ไม่มี`;
}

function optionalSection(icon: string, title: string, list: any[]) {
  if (!list?.length) return "";
  return `${icon} ${title} (${list.length} คน)\n${list.map(x=>`• ${x.name}`).join("\n")}`;
}

function firstEvent(events:any[], eventTypes:string[]) {
  return (events || []).find((event:any) =>
    eventTypes.includes(event.event_type)
  ) || null;
}

function latestEvent(events:any[], eventTypes:string[]) {
  return [...(events || [])].reverse().find((event:any) =>
    eventTypes.includes(event.event_type)
  ) || null;
}

function eventRange(start:any, end:any) {
  const startText = start ? clock(start.event_at) : "-";
  const endText = end ? clock(end.event_at) : "ยังไม่ออก";

  if (!start || !end) return `${startText} - ${endText}`;

  const duration =
    Math.max(
      0,
      (
        new Date(end.event_at).getTime() -
        new Date(start.event_at).getTime()
      ) / 3600000,
    );

  return `${startText} - ${endText} (${hm(duration)})`;
}

function buildBaDetail(employee:any, events:any[]) {
  const ordered = [...(events || [])].sort(
    (a:any,b:any) =>
      new Date(a.event_at).getTime() -
      new Date(b.event_at).getTime(),
  );

  const dayIn = firstEvent(
    ordered,
    ["DAY_IN", "IN", "WORK_IN", "REFILL_IN"],
  );

  const dayOut = latestEvent(
    ordered,
    ["DAY_OUT", "OUT", "WORK_OUT"],
  );

  const visits:any[] = [];
  const breaks:any[] = [];
  let openVisit:any = null;
  let openBreak:any = null;

  for (const event of ordered) {
    if (event.event_type === "BRANCH_IN") {
      if (openVisit) visits.push(openVisit);

      openVisit = {
        inEvent:event,
        outEvent:null,
        name:
          event.office_name_snapshot ||
          "ไม่พบชื่อสาขา",
      };
    } else if (
      event.event_type === "BRANCH_OUT" &&
      openVisit
    ) {
      openVisit.outEvent = event;
      visits.push(openVisit);
      openVisit = null;
    } else if (event.event_type === "BREAK_OUT") {
      openBreak = {
        outEvent:event,
        inEvent:null,
      };
    } else if (
      event.event_type === "BREAK_IN" &&
      openBreak
    ) {
      openBreak.inEvent = event;
      breaks.push(openBreak);
      openBreak = null;
    }
  }

  if (openVisit) visits.push(openVisit);
  if (openBreak) breaks.push(openBreak);

  const lines:string[] = [];
  const branchNames:string[] = [];

  for (const visit of visits) {
    if (!branchNames.includes(visit.name)) {
      branchNames.push(visit.name);
    }
  }

  const branchLabel = branchNames.length
    ? branchNames.join(", ")
    : "ยังไม่เข้าสาขา";

  lines.push(
    `${employee.name} : ${branchLabel} (${visits.length} สาขา)`,
  );

  visits.forEach((visit:any,index:number) => {
    lines.push(
      `- ${visit.name} : ` +
      eventRange(visit.inEvent, visit.outEvent),
    );

    if (
      index < visits.length - 1 &&
      visit.outEvent &&
      visits[index + 1].inEvent
    ) {
      lines.push(
        "- เดินทาง " +
        eventRange(
          visit.outEvent,
          visits[index + 1].inEvent,
        ),
      );
    }
  });

  for (const breakItem of breaks) {
    lines.push(
      "- เวลาพัก : " +
      eventRange(
        breakItem.outEvent,
        breakItem.inEvent,
      ),
    );
  }

  if (!dayOut) {
    const lastType = ordered.length
      ? ordered[ordered.length - 1].event_type
      : "";

    let status = "ยังไม่เริ่มงาน";

    if (lastType === "BREAK_OUT") {
      status = "กำลังพัก";
    } else if (
      ["BRANCH_OUT", "DAY_IN"].includes(lastType)
    ) {
      status = "กำลังเดินทาง";
    } else if (
      ["BRANCH_IN", "BREAK_IN"].includes(lastType)
    ) {
      const openOffice =
        [...ordered].reverse().find(
          (event:any) =>
            event.event_type === "BRANCH_IN",
        )?.office_name_snapshot ||
        "สาขา";

      status = `อยู่ ${openOffice}`;
    }

    lines.push(`- สถานะปัจจุบัน : ${status}`);
  } else if (dayIn) {
    lines.push(
      "- เวลารวม : " +
      eventRange(dayIn, dayOut),
    );
  }

  return {
    lines,
    visitCount:visits.length,
    dayIn,
    dayOut,
  };
}

function officeLateIssues(list:any[]) {
  const groups = groupOffice(list);

  return Object.keys(groups)
    .sort()
    .map((officeName) => {
      const names = groups[officeName]
        .map((employee:any) => {
          const checkIn = employee.in_time
            ? ` เข้า ${employee.in_time}`
            : "";

          return (
            `${employee.name}${checkIn} ` +
            `สาย ${Math.round(employee.late_minutes || 0)} นาที`
          );
        })
        .join(", ");

      return `${officeName}: ${names}`;
    })
    .join("\n");
}

// Read-only union: schedules define expected attendance even before the first clock event.
async function loadScheduledAttendance(supabase:any,date:string) {
  const [daily,schedules]=await Promise.all([
    supabase.from("daily_attendance").select("*,employee:employees(id,employee_code,name,attendance_mode,assigned_office:offices(name)),office:offices(name)").eq("work_date",date),
    supabase.from("employee_schedules").select("employee_id,work_date,schedule_status,required_hours,employee:employees(id,employee_code,name,attendance_mode,assigned_office:offices(name)),office:offices(name)").eq("work_date",date),
  ]);
  if(daily.error||schedules.error)throw daily.error||schedules.error;
  const merged=new Map((daily.data||[]).map((r:any)=>[r.employee_id||r.employee?.id,r]));
  for(const s of schedules.data||[]){
    const r:any=merged.get(s.employee_id);
    merged.set(s.employee_id,r?{...r,schedule_status:s.schedule_status??r.schedule_status,required_hours:s.required_hours??r.required_hours,employee:r.employee||s.employee,office:s.office||r.office}:
      {...s,first_in_at:null,last_out_at:null,break_out_at:null,break_in_at:null,paid_work_hours:null,net_hours:null});
  }
  return {data:[...merged.values()],error:null};
}

async function loadOriginalReportData(
  supabase:any,
  date:string,
) {
  const [
    { data:dailyRows, error:dailyError },
    { data:eventRows, error:eventError },
  ] = await Promise.all([
    loadScheduledAttendance(supabase,date),

    supabase
      .from("attendance_events")
      .select(`
        employee_id,
        event_type,
        event_at,
        office_id,
        office_name_snapshot
      `)
      .eq("work_date", date)
      .order("event_at", { ascending:true }),
  ]);

  if (dailyError || eventError) {
    throw dailyError || eventError;
  }

  const eventsByEmployee:Record<string,any[]> = {};

  for (const event of eventRows || []) {
    (
      eventsByEmployee[event.employee_id] ||=
      []
    ).push(event);
  }

  const out:any = {
    checkedIn:[],
    checkedOut:[],
    noCheckOut:[],
    absent:[],
    shortWork:[],
    overWork:[],
    late:[],
    leaves:[],
    wfh:[],
    holidayWorkers:[],
    baStatus:[],
    drivers:[],
  };

  for (const row of dailyRows || []) {
    const employee:any = row.employee || {};
    const employeeCode =
      String(employee.employee_code || "");

    const attendanceMode =
      employee.attendance_mode || "STANDARD";

    const employeeEvents =
      eventsByEmployee[employee.id] || [];

    const item:any = {
      employee_id:employee.id,
      employee_code:employeeCode,
      name:employee.name || "",
      attendance_mode:attendanceMode,
      office_name:
        row.office?.name ||
        row.employee?.assigned_office?.name ||
        "ไม่ระบุสาขา",
      in_time:clock(row.first_in_at),
      break_out_time:clock(row.break_out_at),
      break_in_time:clock(row.break_in_at),
      out_time:clock(row.last_out_at),
      work_hours:Number(
        row.paid_work_hours || 0,
      ),
      short_hours:Number(
        row.short_hours || 0,
      ),
      over_hours:Number(
        row.over_hours || 0,
      ),
      late_minutes:Number(
        row.late_minutes || 0,
      ),
      schedule_status:row.schedule_status,
      work_status:row.work_status,
    };

    if (attendanceMode === "DRIVER") {
      out.drivers.push(item);
      continue;
    }

    const isBa =
      attendanceMode === "MULTI_BRANCH" ||
      employeeCode.toUpperCase().startsWith("BA");

    const leave = [
      "SICK_LEAVE",
      "BUSINESS_LEAVE",
      "VACATION",
      "UNPAID_LEAVE",
    ].includes(row.schedule_status);

    if (leave) {
      out.leaves.push(item);
      continue;
    }

    if (row.schedule_status === "WFH") {
      out.wfh.push(item);
      continue;
    }

    const isOff =
      row.schedule_status !== "WORK";

    if (isBa) {
      const detail = buildBaDetail(
        item,
        employeeEvents,
      );

      if (detail.dayIn) {
        out.baStatus.push({
          ...item,
          events:employeeEvents,
          detail,
        });
      }

      // BA rule:
      // If BA has any clock event, show only in BA report.
      // Do not show BA as "holiday worker" even when the schedule row is OFF.
      continue;
    }

    if (
      row.schedule_status === "OFF" &&
      row.first_in_at
    ) {
      out.holidayWorkers.push(item);
      continue;
    }

    if (
      !row.first_in_at &&
      row.schedule_status === "WORK"
    ) {
      out.absent.push(item);
      continue;
    }

    if (row.first_in_at) {
      out.checkedIn.push(item);
    }

    if (
      row.first_in_at &&
      row.last_out_at
    ) {
      out.checkedOut.push(item);
    }

    if (
      row.first_in_at &&
      !row.last_out_at
    ) {
      out.noCheckOut.push(item);
    }

    if (
      item.late_minutes > 0 &&
      row.first_in_at
    ) {
      out.late.push(item);
    }

    if (
      item.short_hours > 0 &&
      row.last_out_at
    ) {
      out.shortWork.push(item);
    }

    if (
      item.over_hours > 0.5 &&
      row.last_out_at
    ) {
      out.overWork.push(item);
    }
  }

  return out;
}

function driverSection(
  list:any[],
  reportType:"MIDDAY"|"END_DAY",
) {
  const safe = list || [];

  if (!safe.length) {
    return "🚗 คนขับรถ (0 คน)\n• ไม่มี";
  }

  const lines = safe.map((employee:any) => {
    const parts = [
      `เข้า ${employee.in_time || "-"}`,
      `ออกพัก ${employee.break_out_time || "-"}`,
      `เข้าพัก ${employee.break_in_time || "-"}`,
      `ออก ${employee.out_time || "-"}`,
    ];

    if (employee.out_time) {
      parts.push(
        `รวม ${hm(employee.work_hours)}`,
      );
    }

    return (
      `• ${employee.name}: ` +
      parts.join(" | ")
    );
  });

  return (
    `🚗 คนขับรถ (${safe.length} คน)\n` +
    lines.join("\n")
  );
}

function leaveSection(list:any[]) {
  if (!list?.length) return "";

  const labels:Record<string,string> = {
    SICK_LEAVE:"ลาป่วย",
    BUSINESS_LEAVE:"ลากิจ",
    VACATION:"ลาพักร้อน",
    UNPAID_LEAVE:"ลาไม่รับค่าจ้าง",
  };

  return (
    `📝 การลา (${list.length} คน)\n` +
    list.map((employee:any) =>
      `• ${employee.name} - ` +
      (
        labels[employee.schedule_status] ||
        employee.schedule_status
      )
    ).join("\n")
  );
}

function holidaySection(list:any[]) {
  if (!list?.length) return "";

  return (
    `🟣 มาทำงานในวันหยุด (${list.length} คน)\n` +
    list.map((employee:any) => {
      const range =
        `${employee.in_time || "-"} - ` +
        `${employee.out_time || "ยังไม่ออก"}`;

      const total =
        employee.out_time
          ? ` : ${hm(employee.work_hours)}`
          : "";

      return (
        `• ${employee.name} ` +
        `(${range}${total})`
      );
    }).join("\n")
  );
}

function baDetailedSection(list:any[]) {
  if (!list?.length) return "";

  const lines = [
    `🚗 รายงาน BA (${list.length} คน)`,
  ];

  for (const employee of list) {
    lines.push(...employee.detail.lines);
  }

  return lines.join("\n");
}

async function buildLineReport(
  supabase:any,
  date:string,
  reportType = "END_DAY",
  includeDrivers = true,
) {
  const data =
    await loadOriginalReportData(
      supabase,
      date,
    );

  const compact = (sections:string[]) =>
    sections
      .filter((section) =>
        String(section || "").trim()
      )
      .join("\n\n")
      .trim();

  if (reportType === "MIDDAY") {
    return compact([
      "📋 รายงานการเข้างาน",
      "🕐 เวลา 13:00 น.",
      `📅 ${thaiDisplayDate(date)}`,
      section(
        "✅",
        "เข้างานแล้ว",
        data.checkedIn,
        officeNames,
      ),
      section(
        "❌",
        "ยังไม่เข้างาน",
        data.absent,
        officeNames,
      ),
      data.late.length
        ? section(
            "⏰",
            "มาสาย",
            data.late,
            officeLateIssues,
          )
        : "",
      leaveSection(data.leaves),
      optionalSection(
        "🏠",
        "WFH",
        data.wfh,
      ),
      holidaySection(
        data.holidayWorkers,
      ),
      baDetailedSection(
        data.baStatus,
      ),
      includeDrivers
        ? driverSection(
            data.drivers,
            "MIDDAY",
          )
        : "",
    ]);
  }

  return compact([
    "🌙 รายงานปิดวัน",
    "🕙 เวลา 22:00 น.",
    `📅 ${thaiDisplayDate(date)}`,
    section(
      "✅",
      "ออกงานแล้ว",
      data.checkedOut,
      officeNames,
    ),
    section(
      "⏳",
      "ยังไม่ออกงาน",
      data.noCheckOut,
      officeNames,
    ),
    section(
      "❌",
      "ไม่มาทำงาน",
      data.absent,
      officeNames,
    ),
    section(
      "⚠️",
      "ทำงานไม่ครบ",
      data.shortWork,
      (list:any[]) =>
        officeIssues(list, "short"),
    ),
    section(
      "🔵",
      "ทำงานเกิน",
      data.overWork,
      (list:any[]) =>
        officeIssues(list, "over"),
    ),
    leaveSection(data.leaves),
    optionalSection(
      "🏠",
      "WFH",
      data.wfh,
    ),
    holidaySection(
      data.holidayWorkers,
    ),
    baDetailedSection(
      data.baStatus,
    ),
    includeDrivers
      ? driverSection(
          data.drivers,
          "END_DAY",
        )
      : "",
  ]);
}

async function pushLineReport(
  supabase: any,
  messageWithDrivers: string,
  messageWithoutDrivers = messageWithDrivers,
) {
  const token = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
  if (!token) throw new Error("LINE_CHANNEL_TOKEN_MISSING");

  const { data: receivers, error } = await supabase
    .from("report_receivers")
    .select("line_to_id,receive_driver_summary")
    .eq("active", true);
  if (error) throw error;

  const results = [];
  for (const r of receivers || []) {
    const text = r.receive_driver_summary === false
      ? messageWithoutDrivers
      : messageWithDrivers;

    const resp = await fetch("https://api.line.me/v2/bot/message/push", {
      method:"POST",
      headers:{
        Authorization:`Bearer ${token}`,
        "Content-Type":"application/json",
      },
      body:JSON.stringify({
        to:r.line_to_id,
        messages:[{type:"text",text}],
      }),
    });

    results.push({
      to:r.line_to_id,
      includeDrivers:r.receive_driver_summary !== false,
      ok:resp.ok,
      status:resp.status,
    });
  }
  return results;
}

async function pushDriverEventAlert(
  supabase: any,
  employee: any,
  event: any,
  daily: any,
) {
  const token = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
  if (!token) throw new Error("LINE_CHANNEL_TOKEN_MISSING");

  const { data: receivers, error } = await supabase
    .from("report_receivers")
    .select("line_to_id")
    .eq("active", true)
    .eq("receive_driver_realtime", true);
  if (error) throw error;

  const labels:Record<string,string> = {
    IN:"เข้างาน",
    BREAK_OUT:"ออกพัก",
    BREAK_IN:"เข้าพัก",
    OUT:"ออกงาน",
  };

  const actionLabel = labels[event.event_type] || event.event_type;
  const totalLine = event.event_type === "OUT"
    ? `\nเวลาทำงานรวม ${hm(daily?.paid_work_hours || 0)}`
    : "";

  const message =
    `🚗 แจ้งเตือนคนขับรถ\n` +
    `${employee.employee_code} - ${employee.name}\n` +
    `${actionLabel} ${clock(event.event_at)}` +
    totalLine;

  const results = [];
  for (const r of receivers || []) {
    const resp = await fetch("https://api.line.me/v2/bot/message/push", {
      method:"POST",
      headers:{
        Authorization:`Bearer ${token}`,
        "Content-Type":"application/json",
      },
      body:JSON.stringify({
        to:r.line_to_id,
        messages:[{type:"text",text:message}],
      }),
    });

    results.push({
      to:r.line_to_id,
      ok:resp.ok,
      status:resp.status,
    });
  }

  return {message,results};
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "bootstrap";
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    if (!STAGING_READ_ACTIONS.has(action) && !Object.prototype.hasOwnProperty.call(STAGING_REQUEST_ACTIONS,action) && !Object.prototype.hasOwnProperty.call(STAGING_PERSONNEL_ACTIONS,action)) {
      return json({
        ok: false,
        error: "STAGING_READ_ONLY",
        message: "โหมดทดลองอ่านข้อมูลจริงได้ แต่ยังไม่อนุญาตให้แก้ไขข้อมูล",
      }, 403);
    }

    if (action === "cron_report_send") {
      const suppliedSecret = req.headers.get("x-cron-secret") || "";
      const expectedSecret = Deno.env.get("CRON_SECRET") || "";

      if (!expectedSecret || suppliedSecret !== expectedSecret) {
        return json({ ok: false, error: "INVALID_CRON_SECRET" }, 401);
      }

      const date = String(body.date || bangkokDate());
      const reportType = String(body.reportType || "END_DAY").toUpperCase();

      if (!["MIDDAY", "END_DAY"].includes(reportType)) {
        return json({ ok: false, error: "INVALID_REPORT_TYPE" }, 400);
      }

      const message = await buildLineReport(supabase, date, reportType, true);
      const messageWithoutDrivers = await buildLineReport(supabase, date, reportType, false);
      const results = await pushLineReport(supabase, message, messageWithoutDrivers);

      const success = results.every((x: any) => x.ok);

      await supabase.from("report_logs").insert({
        report_date: date,
        report_type: reportType === "MIDDAY"
          ? "SCHEDULED_MIDDAY"
          : "SCHEDULED_END_DAY",
        status: success ? "SUCCESS" : "PARTIAL",
        message_preview: message.slice(0, 500),
        error_message: success
          ? null
          : JSON.stringify(results.filter((x: any) => !x.ok)).slice(0, 1000),
      });

      return json({
        ok: true,
        date,
        reportType,
        message,
        results,
      });
    }

    async function weeklyDays(employeeId:string){
      const {data,error}=await supabase.from("employee_weekly_dayoffs").select("iso_dow").eq("employee_id",employeeId).eq("active",true).order("iso_dow");
      if(error)throw error;
      const days=["MON","TUE","WED","THU","FRI","SAT","SUN"];
      return [...new Set((data||[]).filter((r:any)=>Number.isInteger(r.iso_dow)&&r.iso_dow>=1&&r.iso_dow<=7).map((r:any)=>days[r.iso_dow-1]))];
    }
    const profile = await verifyLine(req);
    if(Object.prototype.hasOwnProperty.call(STAGING_PERSONNEL_ACTIONS,action)){
      const {data,error}=await supabase.rpc(action.startsWith("staging_self_profile")?"kitty_staging_self_profile_v1":"kitty_staging_personnel_v1",{actor:profile.userId,operation:STAGING_PERSONNEL_ACTIONS[action],payload:body});
      if(error){const known=["UNAUTHENTICATED","FORBIDDEN","ALREADY_EMPLOYEE","INVALID_NAME","NOT_FOUND","INVALID_REQUEST","STALE_PROFILE","CODE_IMMUTABLE","HO_ONLY","DUPLICATE_CODE","INVALID_DAYOFF","REGISTRATION_REQUIRED","APPROVAL_REQUIRED","INVALID_FIELDS","INVALID_PHONE","INVALID_EMAIL"];
        const message=known.includes(error.message)?error.message:error.code==="23505"?"DUPLICATE_CODE":"PERSONNEL_SERVICE_ERROR";
        return json({ok:false,error:message},message==="FORBIDDEN"?403:message==="PERSONNEL_SERVICE_ERROR"?503:400);
      }
      if(action==="staging_people_get" && data?.profile?.employee_id && !data.profile.id){data.profile.weekly_dayoffs=await weeklyDays(data.profile.employee_id)}
      if(action==="staging_self_profile")data.pictureUrl=profile.pictureUrl||null;
      return json(data);
    }


    if (action === "registration_options") {
      const [{ data: offices, error: officeError }, { data: existingRequest, error: requestError }] = await Promise.all([
        supabase.from("offices")
          .select("id,office_code,name")
          .eq("active", true)
          .order("office_code"),
        supabase.from("employee_registration_requests")
          .select("id,status,employee_code,name,created_at")
          .eq("line_user_id", profile.userId)
          .order("created_at", { ascending:false })
          .limit(1)
          .maybeSingle()
      ]);
      if (officeError || requestError) throw officeError || requestError;
      return json({ok:true,offices:offices||[],existingRequest});
    }

    if (action === "submit_employee_registration") {
      if (!profile?.userId) {
        return json({ ok:false,error:"LINE_PROFILE_REQUIRED" }, 401);
      }

      const name = String(body.name || "").trim();
      if (!name) {
        return json({ ok:false,error:"กรุณากรอกชื่อพนักงาน" }, 400);
      }

      const { data: existingEmployee, error: existingEmployeeError } =
        await supabase
          .from("employees")
          .select("id,employee_code,name,active")
          .eq("line_user_id", profile.userId)
          .maybeSingle();

      if (existingEmployeeError) throw existingEmployeeError;

      if (existingEmployee) {
        return json({ ok:true, alreadyEmployee:true, employee:existingEmployee });
      }

      const { data: existingRequest, error: existingRequestError } =
        await supabase
          .from("employee_registration_requests")
          .select("id,status")
          .eq("line_user_id", profile.userId)
          .maybeSingle();

      if (existingRequestError) throw existingRequestError;

      if (existingRequest) {
        return json({ ok:true, alreadyRequested:true, request:existingRequest });
      }

      const generatedCode = "PENDING-" + String(profile.userId).slice(-8).toUpperCase();

      const { data: request, error } = await supabase
        .from("employee_registration_requests")
        .insert({
          line_user_id: profile.userId,
          employee_code: generatedCode,
          name,
          assigned_office_id: null,
          allow_any_office: false,
          require_break_clock: true,
          deduction_type: "NONE",
          wht_3_percent: false,
          sso: false,
          active: true,
          start_date: bangkokDate(),
          position: null,
          department: null,
          attendance_mode: "STANDARD",
          require_branch_visit_clock: false,
          max_branch_visits_per_day: null,
          leave_eligible: true,
          status: "PENDING"
        })
        .select("*")
        .single();

      if (error) throw error;

      return json({ ok:true, request });
    }

    const { data: currentEmployee, error: currentEmployeeError } = await supabase
      .from("employees")
      .select("*, assigned_office:offices(*)")
      .eq("line_user_id", profile.userId)
      .maybeSingle();

    if (currentEmployeeError) throw currentEmployeeError;

    const { data: currentAdmin, error: currentAdminError } = await supabase
      .from("admins")
      .select("id,role")
      .eq("line_user_id", profile.userId)
      .eq("active", true)
      .maybeSingle();

    if (currentAdminError) throw currentAdminError;

    const employee = currentEmployee;
    let admin = currentAdmin;
    // New HR grants are deliberately not stored in public.admins. Allow only
    // existing scoped read endpoints here; live mutations use their own gateway.
    if (!admin && STAGING_READ_ACTIONS.has(action)) {
      const {data:identity,error:identityError}=await supabase.rpc('kitty_live_access_v1',{actor:profile.userId,operation:'identity',payload:{}});
      if(identityError)throw identityError;
      if(identity?.ok&&identity.role==='HR')admin={id:identity.registration?.id,role:'HR'};
    }
    // Admin may inspect the HR workspace, but the preview only narrows access.
    const isHR = String(admin?.role || "").toUpperCase() === "HR" || (!!admin && body.previewRole === "HR");
    let hrEmployees: any[] = [];
    if (isHR) {
      const allowedActions = new Set(["bootstrap", "today", "employee_month", "admin_bootstrap", "admin_daily", "admin_employee_day", "admin_monthly_summary", "admin_individual_report", "staging_schedule", "admin_employee_profile", "admin_request_queue"]);
      if (!allowedActions.has(action) && !Object.prototype.hasOwnProperty.call(STAGING_REQUEST_ACTIONS,action)) return json({ok:false,error:"ADMIN_REQUIRED"},403);
      const {data, error} = await supabase.from("employees").select("id,employee_code,name,attendance_mode");
      if (error) throw error;
      hrEmployees = (data || []).filter((e:any) => /^HO/i.test(e.employee_code || "") && !["MULTI_BRANCH", "DRIVER"].includes(String(e.attendance_mode).toUpperCase()));
    }
    const hrIds = new Set(hrEmployees.map(e => e.id));
    const hrReportIds = new Set(hrEmployees.filter(e => !/\b(shane|peet)\b/i.test(e.name || "")).map(e => e.id));
    if (isHR && action === "admin_employee_day" && !hrIds.has(String(body.employeeId || ""))) return json({ok:false,error:"FORBIDDEN"},403);

    if (Object.prototype.hasOwnProperty.call(STAGING_REQUEST_ACTIONS,action)) {
      const operation=STAGING_REQUEST_ACTIONS[action];
      if (["review","queue","report"].includes(operation) && !admin) return json({ok:false,error:"FORBIDDEN"},403);
      if (["submit","cancel","mine","balance"].includes(operation) && !employee) return json({ok:false,error:"EMPLOYEE_REQUIRED"},403);
      const {data,error}=await supabase.rpc(action.startsWith("staging_ot_")?"kitty_staging_overtime_v1":"kitty_staging_request_v1",{
        actor:profile.userId,operation,payload:{...body,previewRole:isHR?"HR":undefined},
      });
      if(error) {
        const known=["FORBIDDEN","UNAUTHENTICATED","AMBIGUOUS_IDENTITY","EMPLOYEE_REQUIRED","INVALID_REQUEST","INVALID_DATE","INVALID_LEAVE","INVALID_EVENT","FUTURE_EVENT","IDEMPOTENCY_CONFLICT","NOT_FOUND","INVALID_DECISION","REJECTION_REASON_REQUIRED","INVALID_REASON","ALREADY_REVIEWED","INVALID_REPORT"];
        const otErrors=["INVALID_OT_MODE","OT_SCHEDULE_REQUIRED","OT_SOURCE_NOT_FINAL","OT_WINDOW_EXPIRED","OT_INSUFFICIENT_MINUTES","OT_SCHEDULE_CHANGED"];
        const message=known.includes(error.message)||otErrors.includes(error.message)?error.message:error.code==="23505"?"DUPLICATE_PENDING_REQUEST":"REQUEST_SERVICE_ERROR";
        const status=["FORBIDDEN","UNAUTHENTICATED","AMBIGUOUS_IDENTITY"].includes(message)?403:message==="NOT_FOUND"?404:["ALREADY_REVIEWED","DUPLICATE_PENDING_REQUEST","IDEMPOTENCY_CONFLICT"].includes(message)?409:message==="REQUEST_SERVICE_ERROR"?503:400;
        return json({ok:false,error:message},status);
      }
      return json(data);
    }

    if (action === "admin_employee_profile") {
      if (!admin) return json({ok:false,error:"ADMIN_REQUIRED"},403);
      const id=String(body.employeeId || "");
      if (!id) return json({ok:false,error:"EMPLOYEE_REQUIRED"},400);
      if (isHR && !hrIds.has(id)) return json({ok:false,error:"FORBIDDEN"},403);
      const {data:record,error}=await supabase.from("employees").select("*").eq("id",id).maybeSingle();
      if (error) throw error;
      if (!record) return json({ok:false,error:"EMPLOYEE_NOT_FOUND"},404);
      // Return only approved personnel fields, never arbitrary employee columns.
      const profile:Record<string,unknown>={};
      for (const key of ["id","employee_code","name","attendance_mode","active","line_user_id","default_office_id","office_id","weekly_dayoff","weekly_dayoffs","weekly_days_off","weekly_off_days","day_off","phone","email","position","department"]) {
        if (Object.prototype.hasOwnProperty.call(record,key)) profile[key]=record[key];
      }
      profile.weekly_dayoffs=await weeklyDays(id);
      const officeId=record.assigned_office_id || record.default_office_id || record.office_id;
      let office=null;
      if (officeId) {
        const result=await supabase.from("offices").select("id,office_code,name").eq("id",officeId).maybeSingle();
        if (result.error) throw result.error;
        office=result.data;
      }
      return json({ok:true,employee:profile,office});
    }
    if (action === "admin_request_queue") {
      if (!admin) return json({ok:false,error:"ADMIN_REQUIRED"},403);
      const warnings:string[]=[];
      async function pending(table:string,columns:string,kind:string) {
        let query=supabase.from(table).select(columns).eq("status","PENDING");
        if (isHR) query=query.in("employee_id",[...hrIds]);
        const result=await query.order("created_at",{ascending:false}).limit(100);
        if (result.error) {
          if (["42P01","PGRST205"].includes(result.error.code)) {warnings.push(kind==="leave"?"ยังไม่เชื่อมข้อมูลคำขอลา":"ยังไม่เชื่อมข้อมูลคำขอแก้เวลา");return [];}
          throw result.error;
        }
        return (result.data||[]).map(r=>({...r,kind}));
      }
      const [leave,correction]=await Promise.all([
        pending("leave_requests_v2","id,employee_id,leave_date,duration,status,reason,created_at","leave"),
        pending("attendance_correction_requests","id,employee_id,work_date,requested_event_type,requested_event_at,status,reason,created_at","correction"),
      ]);
      const rows=[...leave,...correction].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
      const ids=[...new Set(rows.map(r=>r.employee_id))];
      let people:any[]=[];
      if(ids.length){const result=await supabase.from("employees").select("id,employee_code,name").in("id",ids);if(result.error)throw result.error;people=result.data||[];}
      return json({ok:true,rows:rows.map(r=>({...r,employee:people.find(p=>p.id===r.employee_id)||null})),warnings,limitPerType:100});
    }

    if (action === "admin_individual_report") {
      if (!admin) return json({ok:false,error:"ADMIN_REQUIRED"},403);
      const employeeId = String(body.employeeId || "");
      const month = String(body.month || "");
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0,4)) < 1900 || Number(month.slice(0,4)) > 9998) return json({ok:false,error:"INVALID_MONTH"},400);
      if (!employeeId) return json({ok:false,error:"EMPLOYEE_REQUIRED"},400);
      if (isHR && !hrReportIds.has(employeeId)) return json({ok:false,error:"FORBIDDEN"},403);
      const {data:person,error:personError} = await supabase.from("employees").select("id,employee_code,name,attendance_mode,active").eq("id",employeeId).maybeSingle();
      if (personError) throw personError;
      if (!person) return json({ok:false,error:"EMPLOYEE_NOT_FOUND"},404);
      const start = month + "-01";
      const next = new Date(start + "T00:00:00Z");
      next.setUTCMonth(next.getUTCMonth()+1);
      const end = next.toISOString().slice(0,10);
      const [daily,schedules] = await Promise.all([
        supabase.from("daily_attendance").select("work_date,schedule_status,first_in_at,break_out_at,break_in_at,last_out_at,paid_work_hours,short_hours,over_hours,makeup_hours,work_status").eq("employee_id",employeeId).gte("work_date",start).lt("work_date",end).order("work_date"),
        supabase.from("employee_schedules").select("work_date,schedule_status,notes").eq("employee_id",employeeId).gte("work_date",start).lt("work_date",end).order("work_date"),
      ]);
      if (daily.error || schedules.error) throw daily.error || schedules.error;
      // Report only real submitted records. A missing request table is NOT an empty history.
      const warnings:string[] = [];
      async function requestRows(table:string, dateColumn:string, columns:string, label:string) {
        const found = new Map();
        for (const column of [dateColumn,"created_at"]) {
          for (let offset=0;;offset+=500) {
            const result = await supabase.from(table).select(columns).eq("employee_id",employeeId)
              .gte(column,column==="created_at" ? start+"T00:00:00+07:00" : start)
              .lt(column,column==="created_at" ? end+"T00:00:00+07:00" : end)
              .order("id").range(offset,offset+499);
            if (result.error) {
              if (["42P01","PGRST205"].includes(result.error.code)) { warnings.push(`ยังไม่เชื่อมประวัติ${label} จึงยืนยันไม่ได้ว่าไม่มีคำขอ`); return []; }
              throw result.error;
            }
            for (const row of result.data || []) found.set(row.id,row);
            if ((result.data || []).length < 500) break;
          }
        }
        return [...found.values()];
      }
      const liveHistory = body.requestSource === 'live';
      const [leave,corrections] = liveHistory ? [[],[]] : await Promise.all([
        requestRows("leave_requests_v2","leave_date","id,leave_date,duration,status,reason,created_at","คำขอลา"),
        requestRows("attendance_correction_requests","work_date","id,work_date,requested_event_type,requested_event_at,reason,status,created_at,approved_sequence_in_month,deduction_amount","คำขอแก้เวลา"),
      ]);
      const requests = [
        ...leave.map(r=>({...r,kind:"leave",effective_date:r.leave_date})),
        ...corrections.map(r=>({...r,kind:"correction",effective_date:r.work_date})),
      ].sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
      if(liveHistory){
        const payload={employeeId,month,...(isHR?{previewRole:'HR'}:{})};
        const results=await Promise.all([
          supabase.rpc('kitty_live_request_v1',{actor:profile.userId,operation:'report',payload}),
          supabase.rpc('kitty_live_overtime_v1',{actor:profile.userId,operation:'report',payload}),
        ]);
        for(const result of results){
          if(result.error)throw result.error;
          if(!result.data?.ok||!Array.isArray(result.data.rows))throw Error('LIVE_HISTORY_UNAVAILABLE');
          if(result.data.rows.length>=1000)throw Error('LIVE_HISTORY_LIMIT');
          requests.push(...result.data.rows.map((r:any)=>({...r,sandbox:false,effective_date:r.kind==='overtime'?(r.mode==='USE_PRIOR'?r.target_date:r.source_date):r.work_date})));
        }
      }
      const byDaily = new Map<string,any>((daily.data || []).map(r=>[r.work_date,r]));
      const bySchedule = new Map<string,any>((schedules.data || []).map(r=>[r.work_date,r]));
      const rows = [];
      for (let day=1;day<=new Date(next.getTime()-86400000).getUTCDate();day++) {
        const date = month+"-"+String(day).padStart(2,"0");
        const schedule = bySchedule.get(date);
        rows.push({work_date:date,schedule_status:schedule?.schedule_status || (date>bangkokDate()?"FUTURE":"NO_SCHEDULE"),...byDaily.get(date),schedule_note:schedule?.notes || null,
          requests:requests.filter(r=>r.effective_date===date || (r.created_at && new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(r.created_at))===date))});
      }
      if(liveHistory)for(const row of rows){
        const approved=requests.filter((r:any)=>r.kind==='overtime'&&r.status==='APPROVED'&&r.effective_date===row.work_date);
        row.ot_waiting=approved.filter((r:any)=>r.settlement_state!=='READY').length;
        row.ot_used_hours=row.ot_waiting?null:approved.reduce((total:number,r:any)=>total+Number(r.minutes||0),0)/60;
      }
      return json({ok:true,employee:person,month,rows,warnings,otLive:liveHistory,requestHistory:liveHistory?'live':'legacy',generated_at:new Date().toISOString()});
    }

    if (action === "staging_schedule") {
      if (!admin) return json({ok:false,error:"ADMIN_REQUIRED"},403);
      const date = String(body.date || bangkokDate());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ok:false,error:"INVALID_DATE"},400);
      let query = supabase.from("employee_schedules").select("*,employee:employees(id,employee_code,name,attendance_mode),office:offices(name),shift:shifts(*)").eq("work_date",date);
      if (isHR) query = query.in("employee_id", [...hrIds]);
      const {data,error} = await query;
      if (error) throw error;
      return json({ok:true,date,rows:data || []});
    }

    if (action === "bootstrap") {
      return json({
        ok: true,
        profile,
        employee,
        isAdmin: !!admin,
        adminRole: admin?.role || null,
        serverTime: new Date().toISOString(),
      });
    }

    if (!employee && (!admin || ["today", "employee_month"].includes(action))) return json({ ok: false, error: "EMPLOYEE_NOT_REGISTERED", profile }, 403);

    if (action === "today") {
      const date = String(body.date || new Date().toISOString().slice(0, 10));
      const [{ data: schedule, error: scheduleError }, { data: events, error: eventError }, { data: daily, error: dailyError }] = await Promise.all([
        supabase.from("employee_schedules").select("*,office:offices(*),shift:shifts(*)")
          .eq("employee_id", employee.id).eq("work_date", date).maybeSingle(),
        supabase.from("attendance_events").select("*")
          .eq("employee_id", employee.id).eq("work_date", date).order("event_at"),
        supabase.from("daily_attendance").select("*")
          .eq("employee_id", employee.id).eq("work_date", date).maybeSingle(),
      ]);
      if (scheduleError || eventError || dailyError) throw scheduleError || eventError || dailyError;
      return json({ ok: true, employee, schedule, events, daily });
    }


    if (action === "employee_month") {
      const month = String(body.month || bangkokDate().slice(0, 7));
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return json({ ok:false, error:"INVALID_MONTH" }, 400);
      }

      const start = `${month}-01`;
      const nextMonth = new Date(`${start}T00:00:00Z`);
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
      const end = nextMonth.toISOString().slice(0, 10);
      const today = bangkokDate();

      const [
        { data: dailyRows, error: dailyError },
        { data: scheduleRows, error: scheduleError },
      ] = await Promise.all([
        supabase
          .from("daily_attendance")
          .select(`
            work_date,
            schedule_status,
            required_hours,
            first_in_at,
            break_out_at,
            break_in_at,
            last_out_at,
            paid_work_hours,
            short_hours,
            over_hours,
            makeup_hours,
            net_hours,
            work_status,
            attendance_status
          `)
          .eq("employee_id", employee.id)
          .gte("work_date", start)
          .lt("work_date", end)
          .lte("work_date", today),

        supabase
          .from("employee_schedules")
          .select("work_date,schedule_status,required_hours")
          .eq("employee_id", employee.id)
          .gte("work_date", start)
          .lt("work_date", end)
          .lte("work_date", today),
      ]);

      if (dailyError || scheduleError) throw dailyError || scheduleError;

      const merged:Record<string,any> = {};

      for (const s of scheduleRows || []) {
        merged[s.work_date] = {
          work_date:s.work_date,
          schedule_status:s.schedule_status,
          required_hours:Number(s.required_hours || 0),
          first_in_at:null,
          break_out_at:null,
          break_in_at:null,
          last_out_at:null,
          paid_work_hours:0,
          short_hours:0,
          over_hours:0,
          makeup_hours:0,
          net_hours:0,
          work_status:s.schedule_status,
          attendance_status:s.schedule_status,
        };
      }

      for (const d of dailyRows || []) {
        merged[d.work_date] = {
          ...(merged[d.work_date] || {}),
          ...d,
        };
      }

      const monthLastDate = new Date(`${end}T00:00:00Z`);
      monthLastDate.setUTCDate(monthLastDate.getUTCDate() - 1);
      const currentMonthLast = today < monthLastDate.toISOString().slice(0,10)
        ? today
        : monthLastDate.toISOString().slice(0,10);

      const firstVisibleDate = employee.start_date && employee.start_date > start
        ? employee.start_date
        : start;

      for (
        let cursor = new Date(`${firstVisibleDate}T00:00:00Z`);
        cursor <= new Date(`${currentMonthLast}T00:00:00Z`);
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      ) {
        const date = cursor.toISOString().slice(0,10);
        if (!merged[date]) {
          merged[date] = {
            work_date:date,
            schedule_status:"NO_SCHEDULE",
            required_hours:0,
            first_in_at:null,
            break_out_at:null,
            break_in_at:null,
            last_out_at:null,
            paid_work_hours:0,
            short_hours:0,
            over_hours:0,
            makeup_hours:0,
            net_hours:0,
            work_status:"NO_SCHEDULE",
            attendance_status:"NO_SCHEDULE",
          };
        }
      }

      const rows = Object.values(merged)
        .sort((a:any,b:any)=>String(b.work_date).localeCompare(String(a.work_date)));

      return json({ ok:true, month, rows });
    }

    if (action === "record") {
      const eventType = String(body.eventType || "");
      const allowed = ["IN","BREAK_OUT","BREAK_IN","OUT","DAY_IN","BRANCH_IN","BRANCH_OUT","DAY_OUT",
        "WORK_IN","WORK_OUT","REFILL_IN","REFILL_OUT"];
      if (!allowed.includes(eventType)) return json({ ok:false,error:"INVALID_EVENT_TYPE" }, 400);

      const eventAt = String(body.eventAt || new Date().toISOString());
      const workDate = String(body.workDate || bangkokDate());

      const { data: existingEvents, error: existingError } = await supabase
        .from("attendance_events")
        .select("event_type,event_at,office_id,office_name_snapshot")
        .eq("employee_id", employee.id)
        .eq("work_date", workDate)
        .order("event_at", { ascending:true });
      if (existingError) throw existingError;

      const existingTypes = (existingEvents || []).map((x:any)=>x.event_type);
      const lastType = existingTypes.length ? existingTypes[existingTypes.length - 1] : null;

      if (employee.attendance_mode === "DRIVER") {
        const hasIn = existingTypes.includes("IN");
        const hasOut = existingTypes.includes("OUT");
        const hasBreakOut = existingTypes.includes("BREAK_OUT");
        const hasBreakIn = existingTypes.includes("BREAK_IN");

        const valid =
          (eventType === "IN" && !hasIn && !hasOut) ||
          (eventType === "OUT" && hasIn && !hasOut) ||
          (eventType === "BREAK_OUT" && hasIn && !hasOut && !hasBreakOut) ||
          (eventType === "BREAK_IN" && hasIn && !hasOut && hasBreakOut && !hasBreakIn);

        if (!valid) {
          return json({
            ok:false,
            error:"INVALID_DRIVER_ACTION",
            currentState:{
              hasIn,
              hasOut,
              hasBreakOut,
              hasBreakIn
            },
            attempted:eventType
          }, 409);
        }
      } else if (employee.attendance_mode === "MULTI_BRANCH") {
        const valid =
          (eventType === "DAY_IN" && existingTypes.length === 0) ||
          (eventType === "BRANCH_IN" && ["DAY_IN","BRANCH_OUT"].includes(lastType)) ||
          (eventType === "BREAK_OUT" && ["BRANCH_IN","BREAK_IN"].includes(lastType)) ||
          (eventType === "BREAK_IN" && lastType === "BREAK_OUT") ||
          (eventType === "BRANCH_OUT" && ["BRANCH_IN","BREAK_IN"].includes(lastType)) ||
          (eventType === "DAY_OUT" && ["DAY_IN","BRANCH_OUT"].includes(lastType));

        if (!valid) {
          return json({
            ok:false,
            error:"INVALID_MULTI_BRANCH_SEQUENCE",
            lastType,
            attempted:eventType
          }, 409);
        }
      } else {
        const valid =
          (eventType === "IN" && existingTypes.length === 0) ||
          (eventType === "BREAK_OUT" && lastType === "IN") ||
          (eventType === "BREAK_IN" && lastType === "BREAK_OUT") ||
          (eventType === "OUT" && ["IN","BREAK_IN"].includes(lastType));

        if (!valid) {
          return json({
            ok:false,
            error:"INVALID_STANDARD_SEQUENCE",
            lastType,
            attempted:eventType
          }, 409);
        }
      }

      const validatedLocation =
        await validateAttendanceLocation(
          supabase,
          employee,
          workDate,
          eventType,
          body,
          existingEvents || [],
        );

      const { data: inserted, error } = await supabase.from("attendance_events").insert({
        event_at: eventAt,
        work_date: workDate,
        employee_id: employee.id,
        event_type: eventType,
        latitude: validatedLocation.latitude,
        longitude: validatedLocation.longitude,
        office_id: validatedLocation.officeId,
        office_name_snapshot: validatedLocation.officeName,
        distance_meters: validatedLocation.distanceMeters,
        gps_accuracy: validatedLocation.gpsAccuracy,
        gps_status: validatedLocation.gpsStatus,
        attendance_mode: employee.attendance_mode,
        session_id: body.sessionId ?? `${employee.employee_code}-${workDate}`,
        visit_id: body.visitId ?? null,
        visit_sequence: body.visitSequence ?? null,
        source: "LIFF",
        metadata: { lineDisplayName: profile.displayName },
      }).select().single();
      if (error) throw error;

      const { data: daily, error: recalcError } = await supabase.rpc("recalculate_daily", {
        p_employee_id: employee.id, p_work_date: workDate,
      });
      if (recalcError) throw recalcError;

      let driverAlert = null;
      if (employee.attendance_mode === "DRIVER") {
        try {
          driverAlert = await pushDriverEventAlert(
            supabase,
            employee,
            inserted,
            daily,
          );
        } catch (alertError) {
          console.error("DRIVER_ALERT_FAILED", alertError);
        }
      }

      return json({ ok:true,event:inserted,daily,driverAlert });
    }

    if (action === "self_weekend_wfh") {
      const date = String(body.date || bangkokDate());

      const [year, month, day] = date.split("-").map(Number);
      const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      if (![0, 6].includes(weekday)) {
        return json({ ok:false, error:"WFH_WEEKEND_ONLY" }, 400);
      }

      const { data: existingEvents, error: eventsError } = await supabase
        .from("attendance_events")
        .select("id")
        .eq("employee_id", employee.id)
        .eq("work_date", date)
        .limit(1);
      if (eventsError) throw eventsError;

      if ((existingEvents || []).length > 0) {
        return json({ ok:false, error:"WFH_HAS_ATTENDANCE_EVENTS" }, 409);
      }

      const { data: currentSchedule, error: currentError } = await supabase
        .from("employee_schedules")
        .select("*")
        .eq("employee_id", employee.id)
        .eq("work_date", date)
        .maybeSingle();
      if (currentError) throw currentError;

      const { data: schedule, error } = await supabase
        .from("employee_schedules")
        .upsert({
          employee_id: employee.id,
          work_date: date,
          office_id: currentSchedule?.office_id || employee.assigned_office_id || null,
          shift_id: currentSchedule?.shift_id || null,
          schedule_status: "WFH",
          required_hours: 9,
          notes: "Employee self-selected weekend WFH",
          original_schedule_status: currentSchedule?.schedule_status || "OFF",
          adjustment_type: "SELF_WEEKEND_WFH",
          adjustment_reason: "Employee selected weekend WFH",
          adjusted_by_line_user_id: profile.userId,
          adjusted_at: new Date().toISOString(),
          approval_status: "APPROVED",
        }, { onConflict: "work_date,employee_id" })
        .select()
        .single();

      if (error) throw error;

      const { data: daily, error: recalcError } = await supabase.rpc("recalculate_daily", {
        p_employee_id: employee.id,
        p_work_date: date,
      });
      if (recalcError) throw recalcError;

      return json({ ok:true, schedule, daily });
    }


    if (action === "admin_pending_registrations") {
      if (!admin) return json({ok:false,error:"ADMIN_REQUIRED"},403);

      const { data: rows, error } = await supabase
        .from("employee_registration_requests")
        .select("*")
        .eq("status","PENDING")
        .order("submitted_at",{ascending:true});

      if (error) throw error;
      return json({ok:true,rows:rows||[]});
    }

    if (action === "admin_approve_registration") {
      if (!admin) return json({ ok:false,error:"ADMIN_REQUIRED" }, 403);

      const requestId = String(body.requestId || "");
      const employeeCode = String(body.employeeCode || "").trim();
      const assignedOfficeId = body.assignedOfficeId ? String(body.assignedOfficeId) : null;
      const attendanceMode = String(body.attendanceMode || "STANDARD").trim().toUpperCase();

      if (!requestId) {
        return json({ ok:false,error:"REQUEST_ID_REQUIRED" }, 400);
      }

      if (!employeeCode || employeeCode.startsWith("PENDING-")) {
        return json({ ok:false,error:"กรุณากรอกรหัสพนักงานจริงก่อนอนุมัติ" }, 400);
      }

      if (!["STANDARD","MULTI_BRANCH","STOCK_REFILL","DRIVER"].includes(attendanceMode)) {
        return json({ ok:false,error:"INVALID_ATTENDANCE_MODE" }, 400);
      }

      const { data: req, error: reqError } = await supabase
        .from("employee_registration_requests")
        .select("*")
        .eq("id", requestId)
        .single();

      if (reqError) throw reqError;

      if (req.status !== "PENDING") {
        return json({ ok:false,error:"REQUEST_ALREADY_REVIEWED" }, 409);
      }

      const { data: duplicated, error: dupError } = await supabase
        .from("employees")
        .select("id")
        .eq("employee_code", employeeCode)
        .maybeSingle();

      if (dupError) throw dupError;
      if (duplicated) {
        return json({ ok:false,error:"รหัสพนักงานนี้มีอยู่แล้ว" }, 409);
      }

      const { data: employee, error: employeeError } = await supabase
        .from("employees")
        .insert({
          employee_code: employeeCode,
          name: req.name,
          line_user_id: req.line_user_id,
          assigned_office_id: assignedOfficeId,
          allow_any_office: req.allow_any_office ?? false,
          require_break_clock: req.require_break_clock ?? true,
          deduction_type: req.deduction_type || "NONE",
          wht_3_percent: req.wht_3_percent ?? false,
          sso: req.sso ?? false,
          active: true,
          start_date: req.start_date || bangkokDate(),
          position: req.position,
          department: req.department,
          attendance_mode: attendanceMode,
          require_branch_visit_clock: req.require_branch_visit_clock ?? false,
          max_branch_visits_per_day: req.max_branch_visits_per_day,
          leave_eligible: req.leave_eligible ?? true
        })
        .select("*")
        .single();

      if (employeeError) throw employeeError;

      const { error: updateError } = await supabase
        .from("employee_registration_requests")
        .update({
          status:"APPROVED",
          reviewed_at:new Date().toISOString(),
          reviewed_by_line_user_id:profile.userId,
          employee_code:employeeCode,
          assigned_office_id:assignedOfficeId,
          attendance_mode:attendanceMode
        })
        .eq("id", requestId);

      if (updateError) throw updateError;

      return json({ ok:true, employee });
    }

    if (action === "admin_reject_registration") {
      if (!admin) return json({ok:false,error:"ADMIN_REQUIRED"},403);

      const reason = String(body.reason || "").trim();
      if (!reason) return json({ok:false,error:"REASON_REQUIRED"},400);

      const { data, error } = await supabase
        .from("employee_registration_requests")
        .update({
          status:"REJECTED",
          rejection_reason:reason,
          reviewed_by_line_user_id:profile.userId,
          reviewed_at:new Date().toISOString()
        })
        .eq("id",String(body.registrationId || ""))
        .select()
        .single();

      if (error) throw error;
      return json({ok:true,registration:data});
    }

    if (action === "admin_bootstrap") {
      if (!admin) return json({ ok:false,error:"ADMIN_REQUIRED" }, 403);
      const [{ data: employees, error }, { data: offices, error: officeError }] = await Promise.all([
        supabase.from("employees")
          .select("id,employee_code,name,attendance_mode,active")
          .order("employee_code"),
        supabase.from("offices")
          .select("id,office_code,name,active")
          .eq("active", true)
          .order("office_code")
      ]);
      if (error || officeError) throw error || officeError;
      return json({ ok:true, employees:isHR ? (employees || []).filter(e => hrIds.has(e.id)) : employees || [], offices:isHR ? [] : offices || [] });
    }


    if (action === "admin_create_employee") {
      if (!admin) return json({ ok:false,error:"ADMIN_REQUIRED" }, 403);

      const employeeCode = String(body.employeeCode || "").trim();
      const name = String(body.name || "").trim();
      const lineUserId = String(body.lineUserId || "").trim() || null;
      const attendanceMode = String(body.attendanceMode || "STANDARD").trim();

      if (!employeeCode || !name) {
        return json({ ok:false,error:"EMPLOYEE_CODE_AND_NAME_REQUIRED" }, 400);
      }

      const allowedModes = ["STANDARD","MULTI_BRANCH","STOCK_REFILL","DRIVER"];
      if (!allowedModes.includes(attendanceMode)) {
        return json({ ok:false,error:"INVALID_ATTENDANCE_MODE" }, 400);
      }

      const { data: employee, error } = await supabase
        .from("employees")
        .insert({
          employee_code: employeeCode,
          name,
          line_user_id: lineUserId,
          assigned_office_id: body.assignedOfficeId || null,
          attendance_mode: attendanceMode,
          position: String(body.position || "").trim() || null,
          department: String(body.department || "").trim() || null,
          active: true,
          require_break_clock: attendanceMode !== "DRIVER",
          allow_any_office: attendanceMode === "DRIVER",
          leave_eligible: true,
        })
        .select()
        .single();

      if (error) throw error;
      return json({ ok:true, employee });
    }

    if (action === "admin_set_employee_active") {
      if (!admin) return json({ ok:false,error:"ADMIN_REQUIRED" }, 403);

      const employeeId = String(body.employeeId || "");
      const active = body.active === true;

      if (!employeeId) {
        return json({ ok:false,error:"EMPLOYEE_ID_REQUIRED" }, 400);
      }

      if (employeeId === employee?.id && active === false) {
        return json({ ok:false,error:"ไม่สามารถปิดใช้งานบัญชีตัวเองได้" }, 400);
      }

      const { data: updated, error } = await supabase
        .from("employees")
        .update({
          active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", employeeId)
        .select("id,employee_code,name,active")
        .single();

      if (error) throw error;
      return json({ ok:true, employee:updated });
    }

    if (action === "admin_daily") {
      if (!admin) return json({ ok:false,error:"ADMIN_REQUIRED" }, 403);
      const date = String(body.date || bangkokDate());

      const {data:visibleRows}=await loadScheduledAttendance(supabase,date);
      const rows = isHR ? visibleRows.filter(r => hrIds.has(r.employee_id)) : visibleRows;

      const summary = {
        checked_in: 0,
        checked_out: 0,
        not_checked_in: 0,
        on_break: 0,
        off: 0,
        leave: 0,
      };

      for (const r of rows || []) {
        if (r.first_in_at) summary.checked_in += 1;
        if (r.last_out_at) summary.checked_out += 1;
        if (r.first_in_at && !r.last_out_at && r.break_out_at && (!r.break_in_at || Date.parse(r.break_out_at)>Date.parse(r.break_in_at))) summary.on_break += 1;

        if (r.schedule_status === "OFF") {
          summary.off += 1;
          continue;
        }

        if (["SICK_LEAVE","BUSINESS_LEAVE","VACATION","UNPAID_LEAVE"].includes(r.schedule_status)) {
          summary.leave += 1;
          continue;
        }

        if (["WORK","WFH"].includes(r.schedule_status) && !r.first_in_at) {
          summary.not_checked_in += 1;
        }
      }

      return json({ ok:true, rows:rows || [], summary });
    }

    if (action === "admin_employee_day") {
      if (!admin) return json({ ok:false,error:"ADMIN_REQUIRED" }, 403);
      const employeeId = String(body.employeeId || "");
      const date = String(body.date || "");
      const [{ data:events,error:eventError },{ data:daily,error:dailyError },{ data:schedule,error:scheduleError }] = await Promise.all([
        supabase.from("attendance_events").select("*").eq("employee_id",employeeId).eq("work_date",date).order("event_at"),
        supabase.from("daily_attendance").select("*").eq("employee_id",employeeId).eq("work_date",date).maybeSingle(),
        supabase.from("employee_schedules").select("*").eq("employee_id",employeeId).eq("work_date",date).maybeSingle()
      ]);
      if (eventError || dailyError || scheduleError) throw eventError || dailyError || scheduleError;
      return json({ok:true,events:events||[],daily,schedule});
    }

    if (action === "admin_add_event") {
      if (!admin) return json({ ok:false,error:"ADMIN_REQUIRED" }, 403);
      const reason = String(body.reason || "").trim();
      if (!reason) return json({ok:false,error:"REASON_REQUIRED"},400);
      const employeeId = String(body.employeeId || "");
      const eventAt = String(body.eventAt || "");
      const workDate = eventAt.slice(0,10);
      const eventType = String(body.eventType || "");

      const { data:event,error } = await supabase.from("attendance_events").insert({
        employee_id:employeeId,event_at:eventAt,work_date:workDate,event_type:eventType,
        source:"ADMIN",edited_by_line_user_id:profile.userId,edited_at:new Date().toISOString()
      }).select().single();
      if (error) throw error;

      await supabase.from("attendance_event_audit").insert({
        attendance_event_id:event.id,action:"INSERT",new_data:event,reason,actor_line_user_id:profile.userId
      });
      const { data:daily,error:recalcError } = await supabase.rpc("recalculate_daily",{p_employee_id:employeeId,p_work_date:workDate});
      if (recalcError) throw recalcError;
      return json({ok:true,event,daily});
    }

    if (action === "admin_delete_event") {
      if (!admin) return json({ ok:false,error:"ADMIN_REQUIRED" }, 403);
      const reason = String(body.reason || "").trim();
      if (!reason) return json({ok:false,error:"REASON_REQUIRED"},400);
      const eventId = String(body.eventId || "");
      const { data:oldEvent,error:oldError } = await supabase.from("attendance_events").select("*").eq("id",eventId).single();
      if (oldError) throw oldError;
      const { error } = await supabase.from("attendance_events").delete().eq("id",eventId);
      if (error) throw error;
      await supabase.from("attendance_event_audit").insert({
        attendance_event_id:eventId,action:"DELETE",old_data:oldEvent,reason,actor_line_user_id:profile.userId
      });
      const { data:daily,error:recalcError } = await supabase.rpc("recalculate_daily",{p_employee_id:oldEvent.employee_id,p_work_date:oldEvent.work_date});
      if (recalcError) throw recalcError;
      return json({ok:true,daily});
    }



    if (action === "admin_a4_employee_daily_report") {
      if (!admin) return json({ ok:false,error:"ADMIN_REQUIRED" }, 403);

      const month = String(body.month || bangkokDate().slice(0,7));
      const employeeId = body.employeeId ? String(body.employeeId) : null;

      if (!/^\d{4}-\d{2}$/.test(month)) {
        return json({ ok:false,error:"INVALID_MONTH" }, 400);
      }

      const start = `${month}-01`;
      const next = new Date(`${start}T00:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + 1);
      const monthEndExclusive = next.toISOString().slice(0,10);

      const today = bangkokDate();
      const dayCursor = new Date(`${start}T00:00:00+07:00`);
      const endCursor = new Date(`${monthEndExclusive}T00:00:00+07:00`);

      const monthDates:string[] = [];
      while (dayCursor < endCursor) {
        monthDates.push(
          new Intl.DateTimeFormat("en-CA", {
            timeZone:"Asia/Bangkok",
            year:"numeric",
            month:"2-digit",
            day:"2-digit",
          }).format(dayCursor)
        );
        dayCursor.setDate(dayCursor.getDate() + 1);
      }

      let employeesQuery = supabase
        .from("employees")
        .select("id,employee_code,name,attendance_mode,active")
        .eq("active", true)
        .order("employee_code");

      if (employeeId) {
        employeesQuery = employeesQuery.eq("id", employeeId);
      }

      const { data: employees, error: employeeError } = await employeesQuery;
      if (employeeError) throw employeeError;

      const reports:any[] = [];

      for (const emp of employees || []) {
        const [
          { data: dailyRows, error: dailyError },
          { data: scheduleRows, error: scheduleError },
        ] = await Promise.all([
          supabase
            .from("daily_attendance")
            .select(`
              work_date,
              schedule_status,
              required_hours,
              first_in_at,
              break_out_at,
              break_in_at,
              last_out_at,
              paid_work_hours,
              short_hours,
              over_hours,
              makeup_hours,
              net_hours,
              work_status,
              attendance_status
            `)
            .eq("employee_id", emp.id)
            .gte("work_date", start)
            .lt("work_date", monthEndExclusive)
            .order("work_date", { ascending:true }),

          supabase
            .from("employee_schedules")
            .select("work_date,schedule_status,required_hours")
            .eq("employee_id", emp.id)
            .gte("work_date", start)
            .lt("work_date", monthEndExclusive)
            .order("work_date", { ascending:true }),
        ]);

        if (dailyError || scheduleError) throw dailyError || scheduleError;

        const byDate:Record<string,any> = {};

        for (const date of monthDates) {
          const isFuture = date > today;

          byDate[date] = {
            work_date: date,
            schedule_status: isFuture ? "FUTURE" : "NO_SCHEDULE",
            required_hours: 0,
            first_in_at: null,
            break_out_at: null,
            break_in_at: null,
            last_out_at: null,
            paid_work_hours: 0,
            short_hours: 0,
            over_hours: 0,
            makeup_hours: 0,
            net_hours: 0,
            work_status: isFuture ? "FUTURE" : "NO_SCHEDULE",
            attendance_status: isFuture ? "FUTURE" : "NO_SCHEDULE",
          };
        }

        for (const row of scheduleRows || []) {
          byDate[row.work_date] = {
            ...byDate[row.work_date],
            work_date: row.work_date,
            schedule_status: row.schedule_status,
            required_hours: Number(row.required_hours || 0),
            work_status: row.schedule_status,
            attendance_status: row.schedule_status,
          };
        }

        for (const row of dailyRows || []) {
          byDate[row.work_date] = {
            ...byDate[row.work_date],
            ...row,
            net_hours: Number(
              (Number(row.over_hours || 0) +
               Number(row.makeup_hours || 0) -
               Number(row.short_hours || 0)).toFixed(2)
            ),
          };
        }

        const rows = monthDates.map(date => byDate[date]);

        const summary = rows.reduce((acc:any,row:any)=>{
          acc.work_days += Number(row.paid_work_hours || 0) > 0 ? 1 : 0;
          acc.paid_work_hours += Number(row.paid_work_hours || 0);
          acc.short_hours += Number(row.short_hours || 0);
          acc.over_hours += Number(row.over_hours || 0);
          acc.makeup_hours += Number(row.makeup_hours || 0);
          acc.net_hours += Number(row.net_hours || 0);
          return acc;
        }, {
          work_days:0,
          paid_work_hours:0,
          short_hours:0,
          over_hours:0,
          makeup_hours:0,
          net_hours:0,
        });

        for (const key of Object.keys(summary)) {
          summary[key] = Number(summary[key].toFixed(2));
        }

        reports.push({
          employee: emp,
          rows,
          summary,
        });
      }

      return json({ ok:true, month, reports });
    }

    if (action === "admin_a4_org_monthly_report") {
      if (!admin) return json({ ok:false,error:"ADMIN_REQUIRED" }, 403);

      const month = String(body.month || bangkokDate().slice(0,7));

      if (!/^\d{4}-\d{2}$/.test(month)) {
        return json({ ok:false,error:"INVALID_MONTH" }, 400);
      }

      const start = `${month}-01`;
      const next = new Date(`${start}T00:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + 1);
      const monthEndExclusive = next.toISOString().slice(0,10);

      const [
        { data: employees, error: employeeError },
        { data: data, error }
      ] = await Promise.all([
        supabase
          .from("employees")
          .select("id,employee_code,name,attendance_mode,active")
          .eq("active", true)
          .order("employee_code"),

        supabase
          .from("daily_attendance")
          .select(`
            employee_id,
            work_date,
            paid_work_hours,
            short_hours,
            over_hours,
            makeup_hours,
            net_hours,
            employee:employees(employee_code,name,attendance_mode,active)
          `)
          .gte("work_date", start)
          .lt("work_date", monthEndExclusive)
          .order("employee_id")
      ]);

      if (employeeError || error) throw employeeError || error;

      const grouped:Record<string,any> = {};

      for (const emp of employees || []) {
        grouped[emp.id] = {
          employee_code: emp.employee_code,
          name: emp.name,
          attendance_mode: emp.attendance_mode,
          work_days: 0,
          paid_work_hours: 0,
          short_hours: 0,
          over_hours: 0,
          makeup_hours: 0,
          net_hours: 0,
        };
      }

      for (const row of data || []) {
        if (!row.employee?.active) continue;

        const key = row.employee_id;
        if (!grouped[key]) continue;

        const g = grouped[key];

        if (Number(row.paid_work_hours || 0) > 0) {
          g.work_days += 1;
        }

        g.paid_work_hours += Number(row.paid_work_hours || 0);
        g.short_hours += Number(row.short_hours || 0);
        g.over_hours += Number(row.over_hours || 0);
        g.makeup_hours += Number(row.makeup_hours || 0);
        g.net_hours +=
          Number(row.over_hours || 0) +
          Number(row.makeup_hours || 0) -
          Number(row.short_hours || 0);
      }

      const rows = Object.values(grouped)
        .map((row:any)=>({
          ...row,
          paid_work_hours:Number(row.paid_work_hours.toFixed(2)),
          short_hours:Number(row.short_hours.toFixed(2)),
          over_hours:Number(row.over_hours.toFixed(2)),
          makeup_hours:Number(row.makeup_hours.toFixed(2)),
          net_hours:Number(row.net_hours.toFixed(2)),
        }))
        .sort((a:any,b:any)=>a.employee_code.localeCompare(b.employee_code));

      const summary = rows.reduce((acc:any,row:any)=>{
        acc.employee_count += 1;
        acc.work_days += Number(row.work_days || 0);
        acc.paid_work_hours += Number(row.paid_work_hours || 0);
        acc.short_hours += Number(row.short_hours || 0);
        acc.over_hours += Number(row.over_hours || 0);
        acc.makeup_hours += Number(row.makeup_hours || 0);
        acc.net_hours += Number(row.net_hours || 0);
        return acc;
      }, {
        employee_count:0,
        work_days:0,
        paid_work_hours:0,
        short_hours:0,
        over_hours:0,
        makeup_hours:0,
        net_hours:0,
      });

      for (const key of Object.keys(summary)) {
        if (typeof summary[key] === "number") {
          summary[key] = Number(summary[key].toFixed(2));
        }
      }

      return json({ ok:true, month, rows, summary });
    }

    if (action === "admin_monthly_summary") {
      if (!admin) return json({ ok:false,error:"ADMIN_REQUIRED" }, 403);

      const month = String(body.month || bangkokDate().slice(0,7));
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return json({ ok:false,error:"INVALID_MONTH" }, 400);
      }

      const start = `${month}-01`;
      const next = new Date(`${start}T00:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + 1);
      const monthEndExclusive = next.toISOString().slice(0,10);

      const today = bangkokDate();
      const todayLocal = new Date(`${today}T00:00:00+07:00`);
      todayLocal.setDate(todayLocal.getDate() - 1);
      const yesterday = new Intl.DateTimeFormat("en-CA", {
        timeZone:"Asia/Bangkok", year:"numeric", month:"2-digit", day:"2-digit"
      }).format(todayLocal);

      let end = monthEndExclusive;
      if (month === today.slice(0,7)) {
        const exclusive = new Date(`${yesterday}T00:00:00+07:00`);
        exclusive.setDate(exclusive.getDate() + 1);
        end = new Intl.DateTimeFormat("en-CA", {
          timeZone:"Asia/Bangkok", year:"numeric", month:"2-digit", day:"2-digit"
        }).format(exclusive);
      }

      const { data, error } = await supabase
        .from("daily_attendance")
        .select(`
          employee_id,work_date,paid_work_hours,short_hours,
          over_hours,makeup_hours,net_hours,
          employee:employees(employee_code,name,active)
        `)
        .gte("work_date", start)
        .lt("work_date", end)
        .order("employee_id");

      if (error) throw error;

      const grouped: Record<string, any> = {};
      for (const r of data || []) {
        if (isHR && !hrReportIds.has(r.employee_id)) continue;
        if (!r.employee?.active) continue;
        const key = r.employee_id;
        if (!grouped[key]) grouped[key] = {
          employee_code:r.employee.employee_code,
          name:r.employee.name,
          work_days:0,
          paid_work_hours:0,
          short_hours:0,
          over_hours:0,
          makeup_hours:0,
          net_hours:0
        };
        const g = grouped[key];
        if (Number(r.paid_work_hours || 0) > 0) g.work_days += 1;
        g.paid_work_hours += Number(r.paid_work_hours || 0);
        g.short_hours += Number(r.short_hours || 0);
        g.over_hours += Number(r.over_hours || 0);
        g.makeup_hours += Number(r.makeup_hours || 0);
        g.net_hours += Number(r.net_hours || 0);
      }

      const rows = Object.values(grouped)
        .map((x:any)=>({
          ...x,
          paid_work_hours:Number(x.paid_work_hours.toFixed(2)),
          short_hours:Number(x.short_hours.toFixed(2)),
          over_hours:Number(x.over_hours.toFixed(2)),
          makeup_hours:Number(x.makeup_hours.toFixed(2)),
          net_hours:Number(x.net_hours.toFixed(2))
        }))
        .sort((a:any,b:any)=>a.employee_code.localeCompare(b.employee_code));

      return json({
        ok:true,
        month,
        period_start:start,
        period_end_inclusive: month === today.slice(0,7) ? yesterday : null,
        rows
      });
    }

    if (action === "admin_report_preview") {
      if (!admin) return json({ ok:false,error:"ADMIN_REQUIRED" }, 403);

      const date = String(body.date || bangkokDate());
      const reportType = String(body.reportType || "END_DAY").toUpperCase();

      if (!["MIDDAY", "END_DAY"].includes(reportType)) {
        return json({ ok:false, error:"INVALID_REPORT_TYPE" }, 400);
      }

      try {
        const message = await buildLineReport(supabase, date, reportType, true);

        return json({ ok:true, date, reportType, message });
      } catch (error) {
        throw error;
      }
    }

    if (action === "admin_report_send") {
      if (!admin) return json({ ok:false,error:"ADMIN_REQUIRED" }, 403);

      const date = String(body.date || bangkokDate());
      const reportType = String(body.reportType || "END_DAY").toUpperCase();

      if (!["MIDDAY", "END_DAY"].includes(reportType)) {
        return json({ ok:false, error:"INVALID_REPORT_TYPE" }, 400);
      }

      const message = await buildLineReport(supabase, date, reportType, true);
      const messageWithoutDrivers = await buildLineReport(supabase, date, reportType, false);
      const results = await pushLineReport(supabase, message, messageWithoutDrivers);
      const success = results.every((x:any) => x.ok);

      await supabase.from("report_logs").insert({
        report_date: date,
        report_type: reportType === "MIDDAY"
          ? "MANUAL_MIDDAY"
          : "MANUAL_END_DAY",
        status: success ? "SUCCESS" : "PARTIAL",
        message_preview: message.slice(0,500),
        error_message: success
          ? null
          : JSON.stringify(results.filter((x:any) => !x.ok)).slice(0,1000),
      });

      return json({ ok:true, date, reportType, message, results });
    }

    if (action.startsWith("admin_")) {
      if (!admin) return json({ ok:false,error:"ADMIN_REQUIRED" }, 403);
    }

    if (action === "admin_update_schedule") {
      const employeeId = String(body.employeeId || "");
      const workDate = String(body.workDate || "");
      const status = String(body.scheduleStatus || "");
      const reason = String(body.reason || "").trim();
      if (!reason) return json({ ok:false,error:"REASON_REQUIRED" }, 400);

      const { data: employeeRecord, error: employeeError } = await supabase
        .from("employees")
        .select("assigned_office_id,attendance_mode")
        .eq("id", employeeId)
        .single();
      if (employeeError) throw employeeError;

      const { data: existingSchedule, error: existingError } = await supabase
        .from("employee_schedules")
        .select("*")
        .eq("employee_id", employeeId)
        .eq("work_date", workDate)
        .maybeSingle();
      if (existingError) throw existingError;

      const officeId = body.officeId
        || existingSchedule?.office_id
        || employeeRecord.assigned_office_id
        || null;

      const requiredHours = employeeRecord.attendance_mode === "DRIVER"
        ? 0
        : (body.requiredHours ?? existingSchedule?.required_hours ?? null);

      const { data, error } = await supabase.from("employee_schedules").upsert({
        employee_id: employeeId,
        work_date: workDate,
        office_id: status === "WORK" ? officeId : (existingSchedule?.office_id || officeId),
        shift_id: body.shiftId || existingSchedule?.shift_id || null,
        schedule_status: status,
        required_hours: requiredHours,
        notes: body.notes || existingSchedule?.notes || null,
        original_schedule_status: existingSchedule?.schedule_status || null,
        adjustment_type: "ADMIN_CHANGE",
        adjustment_reason: reason,
        adjusted_by_line_user_id: profile.userId,
        adjusted_at: new Date().toISOString(),
        approval_status: "APPROVED",
      }, { onConflict: "work_date,employee_id" }).select().single();
      if (error) throw error;

      const { data: daily, error: recalcError } = await supabase.rpc("recalculate_daily", {
        p_employee_id: employeeId, p_work_date: workDate,
      });
      if (recalcError) throw recalcError;
      return json({ ok:true,schedule:data,daily });
    }

    if (action === "admin_update_event") {
      const eventId = String(body.eventId || "");
      const reason = String(body.reason || "").trim();
      if (!reason) return json({ ok:false,error:"REASON_REQUIRED" }, 400);

      const { data: oldEvent, error: oldError } = await supabase.from("attendance_events")
        .select("*").eq("id", eventId).single();
      if (oldError) throw oldError;

      const changes: Record<string, unknown> = {
        edited_by_line_user_id: profile.userId,
        edited_at: new Date().toISOString(),
      };
      if (body.eventAt) {
        changes.event_at = body.eventAt;
        changes.work_date = String(body.eventAt).slice(0,10);
      }
      if (body.eventType) changes.event_type = body.eventType;
      if ("officeId" in body) changes.office_id = body.officeId || null;

      const { data: updated, error } = await supabase.from("attendance_events")
        .update(changes).eq("id", eventId).select().single();
      if (error) throw error;

      await supabase.from("attendance_event_audit").insert({
        attendance_event_id: eventId,
        action: "UPDATE",
        old_data: oldEvent,
        new_data: updated,
        reason,
        actor_line_user_id: profile.userId,
      });

      const affectedDates = [...new Set([oldEvent.work_date, updated.work_date])];
      const daily = [];
      for (const d of affectedDates) {
        const { data, error: e } = await supabase.rpc("recalculate_daily", {
          p_employee_id: oldEvent.employee_id, p_work_date: d,
        });
        if (e) throw e;
        daily.push(data);
      }
      return json({ ok:true,event:updated,daily });
    }

    return json({ ok:false,error:"UNKNOWN_ACTION" }, 404);
  } catch (e) {
    if (["MISSING_LINE_TOKEN","INVALID_LINE_TOKEN"].includes(String(e?.message))) return json({ok:false,error:String(e.message)},401);
    console.error(e);
    return json({ ok:false,error:String(e?.message || e) }, 500);
  }
});
