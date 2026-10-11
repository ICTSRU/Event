/**
 * SRU ICTD — Event Attendance & Management Platform
 * Backend: Google Apps Script Web App + Google Sheets + MailApp
 * Version: 3.0
 *
 * Sheets created by setup():
 *   Events      — one row per event
 *   Attendance  — one row per check-in
 *   MailLog     — one row per bulk e-mail campaign
 *
 * Public actions (no key):   getEvent, checkin
 * Admin actions (ADMIN_KEY): listEvents, createEvent, updateEvent, setStatus,
 *                            getAttendance, sendBulk, quota
 */

const APP_VERSION = '3.0';
const SH_EVENTS = 'Events';
const SH_ATT = 'Attendance';
const SH_LOG = 'MailLog';

// 'Agenda' (column K) was added in v3.0 — existing sheets get the header automatically
const EV_HEAD = ['EventID', 'EventName', 'Location', 'StartDateTime', 'EndDateTime',
  'Organizer', 'Description', 'Status', 'CreatedAt', 'UpdatedAt', 'Agenda'];
const AT_HEAD = ['Timestamp', 'EventID', 'EventName', 'FullName', 'Email', 'ThankYouSent', 'UserAgent'];
const LOG_HEAD = ['Timestamp', 'EventID', 'Subject', 'Recipients', 'Sent', 'Failed', 'Notes'];

// Google Sheet that stores all data (direct link — works for bound or standalone scripts)
const SPREADSHEET_ID = '1WKlJn9N5H4x3iRI_J468wTTTZ54srgo0tA5DkYDeMA4';

const SENDER_NAME = 'منصة حضور وإدارة الفعاليات | SRU Events Platform';
const TZ = 'Asia/Riyadh';

/* ------------------------------------------------------------------ */
/* One-time setup — run from the editor                                */
/* ------------------------------------------------------------------ */
function setup() {
  const ss = ss_();
  ensureSheet_(ss, SH_EVENTS, EV_HEAD);
  ensureSheet_(ss, SH_ATT, AT_HEAD);
  ensureSheet_(ss, SH_LOG, LOG_HEAD);
  ensureSheet_(ss, SH_FB, FB_HEAD);
  // Keep date-time strings as plain text so Sheets does not reformat them
  ss.getSheetByName(SH_EVENTS).getRange('A:J').setNumberFormat('@');
  ss.getSheetByName(SH_ATT).getRange('A:G').setNumberFormat('@');

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_KEY')) {
    props.setProperty('ADMIN_KEY', Utilities.getUuid().replace(/-/g, '').slice(0, 16));
  }
  Logger.log('Setup complete. ADMIN_KEY = ' + props.getProperty('ADMIN_KEY'));
  Logger.log('Daily e-mail quota remaining: ' + MailApp.getRemainingDailyQuota());
}

function ensureSheet_(ss, name, head) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, head.length).setValues([head])
      .setFontWeight('bold').setBackground('#501e8c').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  } else if (sh.getLastColumn() < head.length) {
    // schema upgrade: append any header columns added in newer versions
    const from = sh.getLastColumn() + 1;
    sh.getRange(1, from, 1, head.length - from + 1).setValues([head.slice(from - 1)])
      .setFontWeight('bold').setBackground('#501e8c').setFontColor('#ffffff');
  }
  return sh;
}

/* ------------------------------------------------------------------ */
/* HTTP entry points                                                   */
/* ------------------------------------------------------------------ */
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === 'getEvent') return json_(getEventPublic_(p.id));
    if (p.action === 'checkin') return json_(checkin_(p));
    if (p.action === 'checkStatus') return json_(checkStatus_(p.id, p.email));
    if (p.action === 'fbInfo') return json_(fbInfo_(p));
    if (p.action === 'feedback' || p.action === 'rate') return json_(submitFeedback_(p));
    return json_({ ok: true, app: 'SRU Event Attendance & Management Platform', version: APP_VERSION, sheet: ss_().getName() });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  let body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'Invalid JSON body' });
  }
  try {
    switch (body.action) {
      case 'getEvent': return json_(getEventPublic_(body.id));
      case 'checkin': return json_(checkin_(body));
      case 'checkStatus': return json_(checkStatus_(body.id, body.email));
      case 'fbInfo': return json_(fbInfo_(body));
      case 'rate':
      case 'feedback': return json_(submitFeedback_(body));
    }
    requireAdmin_(body.key);
    switch (body.action) {
      case 'listEvents': return json_(listEvents_());
      case 'createEvent': return json_(createEvent_(body.event));
      case 'updateEvent': return json_(updateEvent_(body.event));
      case 'setStatus': return json_(setStatus_(body.id, body.status));
      case 'getAttendance': return json_(getAttendance_(body.id));
      case 'dashboard': return json_(dashboard_());
      case 'feedbackStatus': return json_(feedbackStatus_(body.id));
      case 'sendFeedback': return json_(sendFeedback_(body));
      case 'testFeedback': return json_(testFeedback_(body));
      case 'sendBulk': return json_(sendBulk_(body));
      case 'quota': return json_({ ok: true, remaining: MailApp.getRemainingDailyQuota() });
      case 'verify': return json_({ ok: true, sheet: ss_().getName(), sheetUrl: ss_().getUrl() });
      default: return json_({ ok: false, error: 'Unknown action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function requireAdmin_(key) {
  const real = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!real || String(key || '') !== real) throw new Error('Unauthorized: invalid admin key');
}

/* ------------------------------------------------------------------ */
/* Data helpers                                                        */
/* ------------------------------------------------------------------ */
function ss_() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

const HEADS_ = {};
HEADS_[SH_EVENTS] = EV_HEAD; HEADS_[SH_ATT] = AT_HEAD; HEADS_[SH_LOG] = LOG_HEAD;

function sheet_(name) {
  const ss = ss_();
  // Self-healing: recreate a missing tab with its headers instead of failing
  return ss.getSheetByName(name) || ensureSheet_(ss, name, HEADS_[name]);
}

function rows_(name) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getDisplayValues();
  const head = values.shift() || [];
  return values.map(function (r, i) {
    const o = { _row: i + 2 };
    head.forEach(function (h, j) { o[h] = r[j]; });
    return o;
  });
}

function now_() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss");
}

function clean_(s, max) {
  s = String(s == null ? '' : s).trim();
  // Neutralise spreadsheet formula injection
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s.slice(0, max || 300);
}

function findEvent_(id) {
  id = String(id || '').trim();
  if (!id) return null;
  return rows_(SH_EVENTS).filter(function (r) { return r.EventID === id; })[0] || null;
}

function newId_() {
  const stamp = Utilities.formatDate(new Date(), TZ, 'yyMMdd');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rnd = '';
  for (let i = 0; i < 4; i++) rnd += chars.charAt(Math.floor(Math.random() * chars.length));
  return 'EV-' + stamp + '-' + rnd;
}

function publicEvent_(r) {
  return {
    id: r.EventID, name: r.EventName, location: r.Location,
    start: r.StartDateTime, end: r.EndDateTime, organizer: r.Organizer,
    description: r.Description, status: r.Status, agenda: parseAgenda_(r.Agenda)
  };
}

/* ---------------- event agenda (برنامج الفعالية) ---------------- */
function parseAgenda_(s) {
  try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}

function cleanAgenda_(list) {
  if (!Array.isArray(list)) return [];
  const t = function (v) { v = String(v || '').trim(); return /^\d{2}:\d{2}$/.test(v) ? v : ''; };
  const s = function (v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n); };
  return list.slice(0, 40).map(function (r) {
    return { from: t(r.from), to: t(r.to), title: s(r.title, 200), speaker: s(r.speaker, 120) };
  }).filter(function (r) { return r.title; });
}

function agendaHtml_(agenda) {
  if (!agenda || !agenda.length) return '';
  const th = 'style="background:#f0ebf8;color:#3a1464;font-family:' + FONT_ + ';font-size:13px;padding:8px 10px;text-align:right;border-bottom:1px solid #e6dff0"';
  const td = 'font-family:' + FONT_ + ';font-size:14px;color:#241436;padding:8px 10px;border-bottom:1px solid #eee8f5;text-align:right;vertical-align:top';
  return '<div dir="rtl" style="text-align:right;font-weight:bold;font-size:16px;color:#3a1464;margin:18px 0 8px">برنامج الفعالية · <span dir="ltr">Agenda</span></div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="rtl" style="border:1px solid #e6dff0;border-collapse:collapse">' +
    '<tr><td ' + th + ' width="110">الوقت</td><td ' + th + '>الفقرة</td><td ' + th + ' width="150">المقدّم</td></tr>' +
    agenda.map(function (a) {
      // RTL order: start time on the right (read first), each time isolated as LTR
      const time = a.from ? '<span dir="ltr">' + esc_(a.from) + '</span>' + (a.to ? ' – <span dir="ltr">' + esc_(a.to) + '</span>' : '') : '';
      return '<tr><td style="' + td + ';white-space:nowrap">' + time + '</td>' +
        '<td style="' + td + ';font-weight:bold">' + esc_(a.title) + '</td>' +
        '<td style="' + td + ';color:#6b5a80">' + esc_(a.speaker) + '</td></tr>';
    }).join('') + '</table>';
}

/* ------------------------------------------------------------------ */
/* Public actions                                                      */
/* ------------------------------------------------------------------ */
function getEventPublic_(id) {
  const r = findEvent_(id);
  if (!r) return { ok: false, error: 'Event not found' };
  return { ok: true, event: publicEvent_(r) };
}

function checkin_(b) {
  const name = clean_(b.name, 120);
  const email = clean_(b.email, 160).toLowerCase();
  if (name.length < 3) return { ok: false, error: 'Please enter your full name' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: 'Invalid e-mail address' };

  const ev = findEvent_(b.id);
  if (!ev) return { ok: false, error: 'Event not found' };
  if (ev.Status !== 'Open') return { ok: false, error: 'Registration for this event is closed', closed: true };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const dup = rows_(SH_ATT).some(function (r) {
      return r.EventID === ev.EventID && String(r.Email).toLowerCase() === email;
    });
    if (dup) return { ok: true, duplicate: true, event: publicEvent_(ev) };

    const sh = sheet_(SH_ATT);
    sh.appendRow([now_(), ev.EventID, ev.EventName, name, email, 'Pending', clean_(b.ua, 200)]);
    const row = sh.getLastRow();
    let sent = 'No';
    try {
      sendThankYou_(ev, name, email);
      sent = 'Yes';
    } catch (mailErr) {
      sent = 'Failed: ' + String(mailErr.message || mailErr).slice(0, 80);
    }
    sh.getRange(row, 6).setValue(sent);
    return { ok: true, duplicate: false, emailSent: sent === 'Yes', event: publicEvent_(ev) };
  } finally {
    lock.releaseLock();
  }
}

 // Lets the check-in page confirm a registration if the first reply was lost on the network
function checkStatus_(id, email) {
  email = String(email || '').trim().toLowerCase();
  if (!id || !email) return { ok: false, error: 'Missing data' };
  const found = rows_(SH_ATT).filter(function (r) {
    return r.EventID === String(id).trim() && String(r.Email).toLowerCase() === email;
  })[0];
  return { ok: true, registered: !!found, emailSent: !!found && found.ThankYouSent === 'Yes' };
}

/* ------------------------------------------------------------------ */
/* Admin actions                                                       */
/* ------------------------------------------------------------------ */
function listEvents_() {
  const counts = {};
  rows_(SH_ATT).forEach(function (r) { counts[r.EventID] = (counts[r.EventID] || 0) + 1; });
  const events = rows_(SH_EVENTS).map(function (r) {
    const e = publicEvent_(r);
    e.createdAt = r.CreatedAt;
    e.attendees = counts[r.EventID] || 0;
    return e;
  }).sort(function (a, b) { return String(b.start).localeCompare(String(a.start)); });
  return { ok: true, events: events, quota: MailApp.getRemainingDailyQuota(), version: APP_VERSION };
}

function validateEvent_(e) {
  if (!e) throw new Error('Missing event data');
  const out = {
    name: clean_(e.name, 200), location: clean_(e.location, 200),
    start: clean_(e.start, 25), end: clean_(e.end, 25),
    organizer: clean_(e.organizer, 120), description: clean_(e.description, 1000),
    agenda: JSON.stringify(cleanAgenda_(e.agenda))
  };
  if (!out.name) throw new Error('Event name is required');
  if (!out.location) throw new Error('Location is required');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(out.start)) throw new Error('Valid start date/time is required');
  if (out.end && out.end < out.start) throw new Error('End time must be after start time');
  return out;
}

function createEvent_(e) {
  const v = validateEvent_(e);
  const id = newId_();
  const ts = now_();
  ensureSheet_(ss_(), SH_EVENTS, EV_HEAD);   // adds the Agenda header on older sheets
  sheet_(SH_EVENTS).appendRow([id, v.name, v.location, v.start, v.end, v.organizer,
    v.description, 'Open', ts, ts, v.agenda]);
  return { ok: true, id: id };
}

function updateEvent_(e) {
  const r = findEvent_(e && e.id);
  if (!r) throw new Error('Event not found');
  const v = validateEvent_(e);
  sheet_(SH_EVENTS).getRange(r._row, 2, 1, 6)
    .setValues([[v.name, v.location, v.start, v.end, v.organizer, v.description]]);
  ensureSheet_(ss_(), SH_EVENTS, EV_HEAD);
  sheet_(SH_EVENTS).getRange(r._row, 10, 1, 2).setValues([[now_(), v.agenda]]);
  return { ok: true, id: r.EventID };
}

function setStatus_(id, status) {
  if (['Open', 'Closed'].indexOf(status) < 0) throw new Error('Status must be Open or Closed');
  const r = findEvent_(id);
  if (!r) throw new Error('Event not found');
  sheet_(SH_EVENTS).getRange(r._row, 8).setValue(status);
  sheet_(SH_EVENTS).getRange(r._row, 10).setValue(now_());
  return { ok: true };
}

// All events + all check-ins in one call, for dashboard.html
function dashboard_() {
  const events = rows_(SH_EVENTS).map(function (r) {
    const e = publicEvent_(r); e.createdAt = r.CreatedAt; return e;
  });
  const att = rows_(SH_ATT).map(function (r) {
    return { e: r.EventID, t: r.Timestamp, n: r.FullName, m: String(r.Email).toLowerCase(), s: r.ThankYouSent };
  });
  const fb = fbRows_().map(function (r) { return { e: r.e, t: r.t, n: r.n, m: r.m, r: r.r, c: r.c }; });
  return { ok: true, events: events, attendance: att, feedback: fb, generatedAt: now_() };
}

function getAttendance_(id) {
  const ev = findEvent_(id);
  if (!ev) throw new Error('Event not found');
  const list = rows_(SH_ATT).filter(function (r) { return r.EventID === ev.EventID; })
    .map(function (r) {
      return { time: r.Timestamp, name: r.FullName, email: r.Email, thankYou: r.ThankYouSent };
    });
  return { ok: true, event: publicEvent_(ev), attendees: list };
}

function sendBulk_(b) {
  const ev = findEvent_(b.id);
  if (!ev) throw new Error('Event not found');
  const subject = clean_(b.subject, 200);
  const message = String(b.message || '').slice(0, 10000);
  if (!subject || !message.trim()) throw new Error('Subject and message are required');

  const people = rows_(SH_ATT).filter(function (r) { return r.EventID === ev.EventID; });
  const seen = {};
  const unique = people.filter(function (p) {
    const k = String(p.Email).toLowerCase();
    if (seen[k]) return false;
    seen[k] = true; return true;
  });

  let quota = MailApp.getRemainingDailyQuota();
  const images = emailImages_(['sru', 'ictd', 'itoc']);
  let sent = 0, failed = 0, skipped = 0;
  unique.forEach(function (p) {
    if (quota <= 0) { skipped++; return; }
    try {
      const body = fill_(message, ev, p.FullName);
      MailApp.sendEmail({
        to: p.Email,
        subject: fill_(subject, ev, p.FullName),
        name: SENDER_NAME,
        htmlBody: emailShell_(ev, messageHtml_(message, ev, p.FullName),
          { kicker: 'رسالة للمشاركين · <span dir="ltr" style="white-space:nowrap">Message to attendees</span>' }),
        inlineImages: images,
        body: body
      });
      sent++; quota--;
    } catch (err) {
      failed++;
    }
  });
  sheet_(SH_LOG).appendRow([now_(), ev.EventID, subject, unique.length, sent, failed,
    skipped ? skipped + ' skipped (daily quota)' : '']);
  return { ok: true, recipients: unique.length, sent: sent, failed: failed, skipped: skipped,
    remaining: MailApp.getRemainingDailyQuota() };
}

/* ------------------------------------------------------------------ */
/* E-mail                                                              */
/* ------------------------------------------------------------------ */
function fmtDate_(s) {
  if (!s) return '';
  const d = new Date(String(s).slice(0, 16) + ':00');
  if (isNaN(d)) return s;
  return Utilities.formatDate(d, TZ, 'yyyy-MM-dd  HH:mm');
}

function fill_(text, ev, name) {
  return String(text)
    .replace(/\{name\}/g, name || '')
    .replace(/\{event\}/g, ev.EventName || '')
    .replace(/\{location\}/g, ev.Location || '')
    .replace(/\{date\}/g, fmtArDate_(ev.StartDateTime));
}

/**
 * Turns the plain-text message typed in the admin console into Outlook-safe HTML:
 * one <p> per line (Outlook ignores white-space:pre-line), each with an explicit
 * direction (Arabic → RTL, otherwise LTR) so names and numbers are not reordered.
 * Placeholders are filled after escaping; Latin values inside Arabic lines are isolated.
 */
function messageHtml_(text, ev, name) {
  const AR = /[\u0600-\u06FF]/;
  return String(text).replace(/\r/g, '').split('\n').map(function (line) {
    if (!line.trim()) return '<p style="margin:0;line-height:12px;font-size:12px">&nbsp;</p>';
    const rtl = AR.test(line.replace(/\{[a-z]+\}/g, ''));
    const iso = function (v) {
      v = esc_(v || '');
      return rtl && !AR.test(v) ? '<span dir="ltr">' + v + '</span>' : v;   // keep Latin names/values intact
    };
    const html = esc_(line)
      .replace(/\{name\}/g, iso(name))
      .replace(/\{event\}/g, iso(ev.EventName))
      .replace(/\{location\}/g, iso(ev.Location))
      .replace(/\{date\}/g, iso(fmtArDate_(ev.StartDateTime)));
    return '<p dir="' + (rtl ? 'rtl' : 'ltr') + '" style="margin:0 0 6px;text-align:' + (rtl ? 'right' : 'left') +
      ';font-family:' + FONT_ + ';font-size:15px;line-height:26px;color:#241436">' + html + '</p>';
  }).join('');
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

const ITOC_URL = 'https://ictsru.github.io/ITOC/#forms';
const FONT_ = "Cairo,'Segoe UI',Tahoma,Arial,sans-serif";

// Arabic long date, e.g. "الخميس، 15 أكتوبر 2026 في 10:00 ص"
function fmtArDate_(s) {
  if (!s) return '';
  const d = new Date(String(s).slice(0, 16) + ':00');
  if (isNaN(d)) return s;
  const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  let h = d.getHours();
  const ap = h < 12 ? 'ص' : 'م';
  h = h % 12 || 12;
  const mm = ('0' + d.getMinutes()).slice(-2);
  return days[d.getDay()] + '، ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear() +
    ' في ' + ('0' + h).slice(-2) + ':' + mm + ' ' + ap;
}

/**
 * Branded e-mail layout matching the check-in page.
 * Table-based with inline styles for Outlook/Gmail; logos are inline (cid:) images.
 * opts.check = true  → green check badge + "attendance recorded" headline
 */
function emailShell_(ev, inner, opts) {
  opts = opts || {};
  const purple = '#501e8c', ink = '#241436', muted = '#6b5a80';
  const hero =
    '<tr><td style="background:' + purple + ';padding:22px 26px;font-family:' + FONT_ + ';color:#ffffff;text-align:right" dir="rtl">' +
      '<div style="font-size:13px;color:#e4d9f3">منصة تسجيل حضور وإدارة الفعاليات · ' + (opts.kicker || '<span dir="ltr" style="white-space:nowrap">Attendance check-in</span>') + '</div>' +
      '<div style="font-size:24px;font-weight:700;line-height:1.5;margin:6px 0 10px">' + esc_(ev.EventName) + '</div>' +
      '<div style="font-size:15px;line-height:1.9">📍 ' + esc_(ev.Location) + '</div>' +
      '<div style="font-size:15px;line-height:1.9">🗓️ ' + esc_(fmtArDate_(ev.StartDateTime)) + '</div>' +
    '</td></tr>' +
    '<tr><td style="background:#0a6eaa;height:6px;line-height:6px;font-size:0">&nbsp;</td></tr>';
  const badge = opts.check
    ? '<tr><td align="center" style="padding:28px 26px 4px"><img src="cid:check" width="64" height="64" alt="✓" style="display:block;border:0"></td></tr>' +
      '<tr><td align="center" dir="rtl" style="font-family:' + FONT_ + ';padding:8px 26px 0;font-size:24px;font-weight:700;color:#3a1464">تم تسجيل حضورك بنجاح</td></tr>' +
      '<tr><td align="center" dir="ltr" style="font-family:' + FONT_ + ';padding:4px 26px 0;font-size:15px;color:' + muted + '">Your attendance has been recorded</td></tr>'
    : '';
  return '' +
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
  '<body style="margin:0;padding:0;background:#f7f5fb">' +
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7f5fb"><tr><td align="center" style="padding:24px 10px">' +
  '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e6dff0;border-collapse:collapse">' +
    // logo band — university right, ICTD left (as on the page)
    '<tr><td style="padding:14px 22px;border-bottom:1px solid #eee8f5">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
        '<td align="left" valign="middle"><img src="cid:ictd" height="48" alt="ICTD" style="display:block;border:0;height:48px;width:auto"></td>' +
        '<td align="right" valign="middle"><img src="cid:sru" height="40" alt="Sulaiman Alrajhi University" style="display:block;border:0;height:40px;width:auto;margin-left:auto"></td>' +
      '</tr></table>' +
    '</td></tr>' +
    '<tr><td style="padding:18px 18px 0">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e6dff0;border-collapse:collapse">' +
        hero + badge +
        '<tr><td style="padding:18px 26px 26px;font-family:' + FONT_ + ';color:' + ink + ';font-size:15px;line-height:1.9">' + inner + '</td></tr>' +
      '</table>' +
    '</td></tr>' +
    // footer — ITOC left, directorate right
    '<tr><td style="padding:18px 22px;border-top:1px solid #eee8f5;margin-top:18px">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
        '<td align="left" valign="middle"><a href="' + ITOC_URL + '"><img src="cid:itoc" height="30" alt="ITOC — IT Operations Center" style="display:block;border:0;height:30px;width:auto"></a></td>' +
        '<td align="right" valign="middle" dir="rtl" style="font-family:' + FONT_ + ';font-size:12px;color:' + muted + '">الإدارة التنفيذية للاتصالات وتقنية المعلومات · <span dir="ltr">v' + APP_VERSION + '</span></td>' +
      '</tr></table>' +
    '</td></tr>' +
  '</table>' +
  '<div style="font-family:' + FONT_ + ';font-size:11px;color:#9a8fae;padding-top:10px" dir="rtl">رسالة آلية من منصة تسجيل حضور وإدارة الفعاليات — جامعة سليمان الراجحي</div>' +
  '</td></tr></table></body></html>';
}

function sendThankYou_(ev, name, email) {
  const inner =
    '<div dir="rtl" style="text-align:center;font-size:17px;color:#241436">شكرًا لانضمامك إلينا <b>' + esc_(name) + '</b> 🌟</div>' +
    '<div dir="ltr" style="text-align:center;font-size:14px;color:#6b5a80;margin-bottom:16px">Thank you for joining us, ' + esc_(name) + '!</div>' +
    '<div dir="rtl" style="text-align:right;border-top:1px solid #eee8f5;padding-top:14px">يسعدنا حضورك في <b>' + esc_(ev.EventName) + '</b>، ونتمنى لك تجربة مفيدة وممتعة.</div>' +
    '<div dir="ltr" style="text-align:left;color:#6b5a80;font-size:14px">We are glad to have you at <b>' + esc_(ev.EventName) + '</b> — we hope you enjoy the event.</div>' +
    agendaHtml_(parseAgenda_(ev.Agenda));
  MailApp.sendEmail({
    to: email,
    subject: 'شكرًا لحضورك | Thank you for joining — ' + ev.EventName,
    name: SENDER_NAME,
    htmlBody: emailShell_(ev, inner, { check: true }),
    inlineImages: emailImages_(['sru', 'ictd', 'itoc', 'check']),
    body: 'تم تسجيل حضورك بنجاح — ' + ev.EventName + '\nThank you for joining ' + ev.EventName + ', ' + name + '. Your attendance has been recorded.'
  });
}
