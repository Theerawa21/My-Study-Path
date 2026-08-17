const SHEET_ID = '15teyIjFUrcotBqJ5g8ZRKNoubM5yJuFWWJ4YwquHe_A';
const SHEETS = { STUDENTS:'นักเรียน', RESPONSES:'คำตอบ', SETTINGS:'ตั้งค่า' };

function doGet(e) {
  const p = (e && e.parameter) || {};
  const action = clean_(p.action);
  try {
    let result;
    switch (action) {
      case 'student': result = { ok:true, student:getStudentById_(p.studentId) }; break;
      case 'teacherLogin': result = teacherLogin_(p.code); break;
      case 'dashboard': assertTeacher_(p.code); result = getTeacherDashboard_(); result.ok = true; break;
      case 'config': result = { ok:true, config:getConfig_() }; break;
      case 'ping': result = { ok:true, message:'My Study Path API พร้อมใช้งาน' }; break;
      default: result = { ok:false, message:'ไม่พบคำสั่งที่ร้องขอ' };
    }
    return output_(result, p.callback);
  } catch (err) {
    return output_({ ok:false, message:err.message || String(err) }, p.callback);
  }
}

function doPost(e) {
  try {
    const p = (e && e.parameter) || {};
    const action = clean_(p.action);
    let payload = {};
    try { payload = p.payload ? JSON.parse(p.payload) : {}; } catch (_) {}
    let result;
    if (action === 'saveSurvey') result = saveSurvey_(payload);
    else if (action === 'saveCounselorNote') result = saveCounselorNote_(payload);
    else result = { ok:false, message:'ไม่พบคำสั่งที่ร้องขอ' };
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok:false, message:err.message || String(err) })).setMimeType(ContentService.MimeType.JSON);
  }
}

function ss_() { return SpreadsheetApp.openById(SHEET_ID); }

function getConfig_() {
  const sh = ss_().getSheetByName(SHEETS.SETTINGS);
  const values = sh.getRange(2,1,Math.max(1,sh.getLastRow()-1),2).getValues();
  const map = {};
  values.forEach(r => { if (r[0]) map[clean_(r[0])] = r[1]; });
  return {
    appName: map['ชื่อระบบ'] || 'My Study Path',
    academicYear: map['ปีการศึกษา'] || '',
    accepting: map['เปิดรับคำตอบ'] !== false
  };
}

function getStudentById_(studentId) {
  const id = clean_(studentId);
  if (!id) throw new Error('กรุณากรอกรหัสประจำตัวนักเรียน');
  const sh = ss_().getSheetByName(SHEETS.STUDENTS);
  if (!sh || sh.getLastRow() < 2) throw new Error('ยังไม่มีรายชื่อนักเรียนในฐานข้อมูล');
  const rows = sh.getRange(2,1,sh.getLastRow()-1,7).getValues();
  for (let i=0;i<rows.length;i++) {
    if (clean_(rows[i][0]) === id) {
      const status = clean_(rows[i][6]);
      if (status && !['ใช้งาน','Active','พร้อมใช้งาน'].includes(status)) throw new Error('บัญชีนักเรียนนี้ยังไม่เปิดใช้งาน');
      return {
        studentId:id,
        firstName:rows[i][1] || '',
        lastName:rows[i][2] || '',
        level:rows[i][3] || 'ม.3',
        room:rows[i][4] || '',
        number:rows[i][5] || '',
        fullName:[rows[i][1],rows[i][2]].filter(Boolean).join(' '),
        existing:getExistingSurvey_(id)
      };
    }
  }
  throw new Error('ไม่พบรหัสประจำตัวนักเรียน กรุณาตรวจสอบอีกครั้ง');
}

function getExistingSurvey_(studentId) {
  const sh = ss_().getSheetByName(SHEETS.RESPONSES);
  if (!sh || sh.getLastRow() < 2) return null;
  const rows = sh.getRange(2,1,sh.getLastRow()-1,29).getValues();
  for (let i=rows.length-1;i>=0;i--) if (clean_(rows[i][1]) === clean_(studentId)) return rowToSurvey_(rows[i]);
  return null;
}

function saveSurvey_(payload) {
  if (!payload || !payload.studentId) throw new Error('ไม่พบข้อมูลนักเรียน');
  if (getConfig_().accepting === false) throw new Error('ระบบปิดรับคำตอบชั่วคราว');
  const student = getStudentById_(payload.studentId);
  const sh = ss_().getSheetByName(SHEETS.RESPONSES);
  const now = new Date();
  const confidence = Number(payload.confidence || 0);
  const pathway = clean_(payload.pathway);
  const storedPathway = pathway === 'อื่น ๆ' && clean_(payload.otherPath) ? `อื่น ๆ: ${clean_(payload.otherPath)}` : pathway;
  const infoNeeded = join_(payload.infoNeeded);
  const confirmed = payload.confirmed === true || String(payload.confirmed) === 'true';
  const studentStatus = confirmed ? 'ยืนยันแล้ว' : 'บันทึกร่าง';
  const needsGuidance = pathway === 'ยังไม่แน่ใจ' || confidence <= 2 || infoNeeded.indexOf('ต้องการพูดคุยกับครูแนะแนว') > -1;
  const guidanceStatus = needsGuidance ? 'ควรแนะแนว' : (confidence === 3 ? 'ควรติดตาม' : 'ปกติ');
  const values = [
    now, student.studentId, student.fullName, `${student.level || 'ม.3'}/${student.room || ''}`,
    join_(payload.likedSubjects), join_(payload.goodSubjects), join_(payload.interests), join_(payload.strengths), storedPathway,
    clean_(payload.plan1), clean_(payload.plan2), clean_(payload.plan3),
    clean_(payload.institution1), clean_(payload.institutionReason1), clean_(payload.institution2), clean_(payload.institution3),
    clean_(payload.career1), clean_(payload.career2), clean_(payload.career3), clean_(payload.careerReason1),
    join_(payload.factors), join_(payload.advisors), infoNeeded, confidence, studentStatus, confirmed ? now : '', '', guidanceStatus, now
  ];
  let row = findStudentResponseRow_(student.studentId);
  if (row) {
    const oldTeacher = sh.getRange(row,27,1,2).getValues()[0];
    values[26] = oldTeacher[0] || '';
    if (oldTeacher[1] && !['ปกติ','ควรติดตาม','ควรแนะแนว'].includes(clean_(oldTeacher[1]))) values[27] = oldTeacher[1];
    sh.getRange(row,1,1,values.length).setValues([values]);
  } else {
    sh.appendRow(values);
    row = sh.getLastRow();
  }
  sh.getRange(row,1).setNumberFormat('dd/MM/yyyy HH:mm');
  sh.getRange(row,26).setNumberFormat('dd/MM/yyyy HH:mm');
  sh.getRange(row,29).setNumberFormat('dd/MM/yyyy HH:mm');
  SpreadsheetApp.flush();
  return { ok:true, status:studentStatus, guidanceStatus };
}

function teacherLogin_(code) {
  const actual = getTeacherCode_();
  if (!actual) return { ok:false, message:'ยังไม่ได้ตั้งรหัสครู กรุณากำหนดในชีต “ตั้งค่า” ช่อง B4' };
  if (clean_(code) !== actual) return { ok:false, message:'รหัสครูไม่ถูกต้อง' };
  return { ok:true };
}

function getTeacherDashboard_() {
  const ss = ss_();
  const studentSh = ss.getSheetByName(SHEETS.STUDENTS);
  const responseSh = ss.getSheetByName(SHEETS.RESPONSES);
  const totalStudents = studentSh ? Math.max(0,studentSh.getLastRow()-1) : 0;
  const rows = responseSh && responseSh.getLastRow()>1 ? responseSh.getRange(2,1,responseSh.getLastRow()-1,29).getValues() : [];
  const path = r => clean_(r[8]).replace(/^อื่น ๆ:.*/, 'อื่น ๆ');
  const stats = {
    totalStudents,
    responded:rows.length,
    confirmed:rows.filter(r=>clean_(r[24])==='ยืนยันแล้ว').length,
    m4:rows.filter(r=>path(r)==='ม.4 สายสามัญ').length,
    vocational:rows.filter(r=>path(r)==='สายอาชีพ ปวช.').length,
    unsure:rows.filter(r=>path(r)==='ยังไม่แน่ใจ').length,
    guidance:rows.filter(r=>clean_(r[27])==='ควรแนะแนว').length
  };
  const students = rows.map(r=>({
    studentId:clean_(r[1]), name:clean_(r[2]), room:clean_(r[3]), pathway:clean_(r[8]), plan1:clean_(r[9]),
    institution1:clean_(r[12]), career1:clean_(r[16]), confidence:Number(r[23]||0), status:clean_(r[24]), teacherNote:clean_(r[26]),
    guidanceStatus:clean_(r[27]), counselorStatus:['ปกติ','ควรติดตาม','ควรแนะแนว'].includes(clean_(r[27])) ? '' : clean_(r[27])
  }));
  return { stats, students };
}

function saveCounselorNote_(payload) {
  assertTeacher_(payload.code);
  const sh = ss_().getSheetByName(SHEETS.RESPONSES);
  const row = findStudentResponseRow_(payload.studentId);
  if (!row) throw new Error('ไม่พบข้อมูลนักเรียน');
  sh.getRange(row,27).setValue(clean_(payload.note));
  sh.getRange(row,28).setValue(clean_(payload.status) || 'ติดตามเพิ่มเติม');
  sh.getRange(row,29).setValue(new Date()).setNumberFormat('dd/MM/yyyy HH:mm');
  SpreadsheetApp.flush();
  return { ok:true };
}

function findStudentResponseRow_(studentId) {
  const sh = ss_().getSheetByName(SHEETS.RESPONSES);
  if (!sh || sh.getLastRow()<2) return 0;
  const ids = sh.getRange(2,2,sh.getLastRow()-1,1).getValues().flat();
  const idx = ids.findIndex(v=>clean_(v)===clean_(studentId));
  return idx>=0 ? idx+2 : 0;
}
function getTeacherCode_() { const sh=ss_().getSheetByName(SHEETS.SETTINGS); return sh ? clean_(sh.getRange('B4').getValue()) : ''; }
function assertTeacher_(code) { const actual=getTeacherCode_(); if (!actual || clean_(code)!==actual) throw new Error('ไม่มีสิทธิ์เข้าถึงข้อมูลครู'); }
function rowToSurvey_(r) {
  const storedPath=clean_(r[8]),isOther=storedPath.indexOf('อื่น ๆ:')===0;
  return { likedSubjects:split_(r[4]),goodSubjects:split_(r[5]),interests:split_(r[6]),strengths:split_(r[7]),pathway:isOther?'อื่น ๆ':storedPath,otherPath:isOther?storedPath.replace(/^อื่น ๆ:\s*/,''):'',plan1:clean_(r[9]),plan2:clean_(r[10]),plan3:clean_(r[11]),institution1:clean_(r[12]),institutionReason1:clean_(r[13]),institution2:clean_(r[14]),institution3:clean_(r[15]),career1:clean_(r[16]),career2:clean_(r[17]),career3:clean_(r[18]),careerReason1:clean_(r[19]),factors:split_(r[20]),advisors:split_(r[21]),infoNeeded:split_(r[22]),confidence:Number(r[23]||0),status:clean_(r[24]),guidanceStatus:clean_(r[27]) };
}
function output_(obj,callback) {
  const json=JSON.stringify(obj);
  if (callback && /^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(callback)) return ContentService.createTextOutput(`${callback}(${json});`).setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
function clean_(v){return v===null||v===undefined?'':String(v).trim()}
function join_(v){return Array.isArray(v)?v.map(clean_).filter(Boolean).join(' | '):clean_(v)}
function split_(v){return clean_(v)?clean_(v).split('|').map(s=>s.trim()).filter(Boolean):[]}
