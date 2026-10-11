/**
 * SRU Event Attendance & Management Platform — Event evaluation (feedback)
 * Version: 2.4
 *
 * • One overall-satisfaction question on a 5-point Likert scale + one open question (suggestions)
 * • Personal signed link per attendee (no login, cannot be forged or reused for other e-mails)
 * • One response per person per event (re-submitting updates the previous answer)
 * • Manual send from the admin console, or automatic send after each event ends (installFeedbackTrigger)
 */

const SH_FB = 'Feedback';
const FB_HEAD = ['Timestamp', 'EventID', 'EventName', 'FullName', 'Email', 'Rating', 'Comment', 'UpdatedAt'];

const FB_QUESTION_AR = 'ما مدى رضاك العام عن الفعالية؟';
const FB_QUESTION_EN = 'Overall, how satisfied were you with the event?';
const FB_LABELS = [
  ['غير راضٍ إطلاقًا', 'Very dissatisfied'],
  ['غير راضٍ', 'Dissatisfied'],
  ['محايد', 'Neutral'],
  ['راضٍ', 'Satisfied'],
  ['راضٍ جدًا', 'Very satisfied']
];
const FB_OPEN_AR = 'ما مقترحاتك لتحسين الفعاليات القادمة؟';
const FB_OPEN_EN = 'What would you suggest to improve future events?';

function fbSheet_() { return ensureSheet_(ss_(), SH_FB, FB_HEAD); }

function fbSecret_() {
  const p = PropertiesService.getScriptProperties();
  let s = p.getProperty('FB_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('FB_SECRET', s); }
  return s;
}

function fbToken_(eventId, email) {
  const sig = Utilities.computeHmacSha256Signature(String(eventId) + '|' + String(email).toLowerCase(), fbSecret_());
  return sig.slice(0, 10).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}

function fbRows_() {
  const values = fbSheet_().getDataRange().getDisplayValues();
  values.shift();
  return values.map(function (r, i) {
    return { _row: i + 2, t: r[0], e: r[1], en: r[2], n: r[3], m: String(r[4]).toLowerCase(), r: Number(r[5]) || 0, c: r[6] };
  });
}

/* ---------------- public: open the form / submit ---------------- */
function fbVerify_(p) {
  const ev = findEvent_(p.id);
  if (!ev) throw new Error('Event not found');
  const email = String(p.email || '').trim().toLowerCase();
  const test = String(p.test || '') === '1';
  if (!email || String(p.t || '') !== fbToken_(ev.EventID, email + (test ? '#test' : ''))) throw new Error('رابط التقييم غير صالح | Invalid evaluation link');
  // Test links (from "send a test copy") work without an attendance record and are never saved
  if (test) return { ev: ev, email: email, name: 'نسخة تجريبية · Test', test: true };
  const att = rows_(SH_ATT).filter(function (r) { return r.EventID === ev.EventID && String(r.Email).toLowerCase() === email; })[0];
  if (!att) throw new Error('No attendance record for this e-mail');
  return { ev: ev, email: email, name: att.FullName };
}

function fbInfo_(p) {
  const v = fbVerify_(p);
  const prev = v.test ? null : fbRows_().filter(function (r) { return r.e === v.ev.EventID && r.m === v.email; })[0];
  return { ok: true, event: publicEvent_(v.ev), name: v.name, test: !!v.test,
    previous: prev ? { rating: prev.r, comment: prev.c } : null,
    question: { ar: FB_QUESTION_AR, en: FB_QUESTION_EN, labels: FB_LABELS, openAr: FB_OPEN_AR, openEn: FB_OPEN_EN } };
}

function submitFeedback_(p) {
  const v = fbVerify_(p);
  const rating = parseInt(p.r, 10);
  if (!(rating >= 1 && rating <= 5)) return { ok: false, error: 'يرجى اختيار التقييم | Please select a rating' };
  const comment = clean_(p.c, 1500);
  if (v.test) return { ok: true, test: true, updated: false };   // preview only — nothing saved
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = fbSheet_();
    const prev = fbRows_().filter(function (r) { return r.e === v.ev.EventID && r.m === v.email; })[0];
    if (prev) {
      sh.getRange(prev._row, 6, 1, 3).setValues([[rating, comment, now_()]]);
      return { ok: true, updated: true };
    }
    sh.appendRow([now_(), v.ev.EventID, v.ev.EventName, v.name, v.email, rating, comment, '']);
    return { ok: true, updated: false };
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- admin: send requests / status ---------------- */
function fbSentMap_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('FB_SENT') || '{}'); }
  catch (e) { return {}; }
}
function fbMarkSent_(id) {
  const m = fbSentMap_(); m[id] = now_();
  PropertiesService.getScriptProperties().setProperty('FB_SENT', JSON.stringify(m));
}

function feedbackStatus_(id) {
  const ev = findEvent_(id);
  if (!ev) throw new Error('Event not found');
  const people = {};
  rows_(SH_ATT).forEach(function (r) { if (r.EventID === ev.EventID) people[String(r.Email).toLowerCase()] = 1; });
  const resp = fbRows_().filter(function (r) { return r.e === ev.EventID; });
  const avg = resp.length ? resp.reduce(function (s, r) { return s + r.r; }, 0) / resp.length : 0;
  return { ok: true, attendees: Object.keys(people).length, responses: resp.length,
    average: Math.round(avg * 100) / 100, sentAt: fbSentMap_()[ev.EventID] || '',
    pageUrl: PropertiesService.getScriptProperties().getProperty('FEEDBACK_URL') || '' };
}

/**
 * Sends the evaluation e-mail to attendees of one event who have not responded yet.
 * b.pageUrl — full URL of feedback.html (stored for the automatic trigger)
 */
function sendFeedback_(b) {
  const ev = findEvent_(b.id);
  if (!ev) throw new Error('Event not found');
  const props = PropertiesService.getScriptProperties();
  let pageUrl = String(b.pageUrl || '').trim();
  if (/^https:\/\//i.test(pageUrl)) props.setProperty('FEEDBACK_URL', pageUrl);
  else pageUrl = props.getProperty('FEEDBACK_URL') || '';
  if (!/^https:\/\//i.test(pageUrl)) throw new Error('Feedback page URL is not public (https). Open the admin console from GitHub Pages or set the public site URL.');

  const answered = {};
  fbRows_().forEach(function (r) { if (r.e === ev.EventID) answered[r.m] = 1; });
  const seen = {};
  const list = rows_(SH_ATT).filter(function (r) {
    const m = String(r.Email).toLowerCase();
    if (r.EventID !== ev.EventID || seen[m] || answered[m]) return false;
    seen[m] = 1; return true;
  });

  let quota = MailApp.getRemainingDailyQuota(), sent = 0, failed = 0, skipped = 0;
  const images = emailImages_(['sru', 'ictd', 'itoc']);
  list.forEach(function (p) {
    if (quota <= 0) { skipped++; return; }
    try {
      sendFeedbackMail_(ev, p.FullName, p.Email, pageUrl, images);
      sent++; quota--;
    } catch (e) { failed++; }
  });
  fbMarkSent_(ev.EventID);
  sheet_(SH_LOG).appendRow([now_(), ev.EventID, 'Evaluation request / طلب تقييم', list.length, sent, failed,
    skipped ? skipped + ' skipped (daily quota)' : (b.auto ? 'automatic' : '')]);
  return { ok: true, recipients: list.length, sent: sent, failed: failed, skipped: skipped, alreadyAnswered: Object.keys(answered).length };
}

function fbLink_(pageUrl, ev, email, rating, test) {
  return pageUrl + (pageUrl.indexOf('?') < 0 ? '?' : '&') +
    'e=' + encodeURIComponent(ev.EventID) + '&m=' + encodeURIComponent(String(email).toLowerCase()) +
    '&t=' + fbToken_(ev.EventID, String(email).toLowerCase() + (test ? '#test' : '')) +
    (rating ? '&r=' + rating : '') + (test ? '&test=1' : '');
}

/** Admin: send one copy of the evaluation e-mail to the given address (preview links — responses are not saved). */
function testFeedback_(b) {
  const ev = findEvent_(b.id);
  if (!ev) throw new Error('Event not found');
  const to = String(b.to || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) throw new Error('بريد غير صالح | Invalid e-mail');
  const pageUrl = String(b.pageUrl || '').trim() || PropertiesService.getScriptProperties().getProperty('FEEDBACK_URL') || '';
  if (!/^https:\/\//i.test(pageUrl)) throw new Error('Feedback page URL is not public (https).');
  sendFeedbackMail_(ev, 'نسخة تجريبية · Test copy', to, pageUrl, null, true);
  sheet_(SH_LOG).appendRow([now_(), ev.EventID, 'Evaluation request — TEST copy', 1, 1, 0, 'test to ' + to]);
  return { ok: true, to: to, remaining: MailApp.getRemainingDailyQuota() };
}

function sendFeedbackMail_(ev, name, email, pageUrl, images, test) {
  const colors = ['#f4eefb', '#e9def6', '#ddcdf1', '#9c76cc', '#7446b3'];
  const ink = ['#3a1464', '#3a1464', '#3a1464', '#ffffff', '#ffffff'];
  // Outlook (Word engine) safe: styling on <td>, plain inline links inside, no block-styled <a>/<span>
  let cells = '';
  for (let i = 1; i <= 5; i++) {
    const href = fbLink_(pageUrl, ev, email, i, test);
    const a = 'color:' + ink[i - 1] + ';text-decoration:none;font-family:' + FONT_ + ';';
    cells += '<td align="center" valign="middle" width="20%" bgcolor="' + colors[i - 1] + '" ' +
      'style="background-color:' + colors[i - 1] + ';border:1px solid #d6c7ea;padding:10px 2px;mso-line-height-rule:exactly">' +
      '<a href="' + href + '" style="' + a + 'font-size:24px;font-weight:bold;line-height:28px">' + i + '</a><br>' +
      '<a href="' + href + '" style="' + a + 'font-size:12px;font-weight:bold;line-height:18px">' + FB_LABELS[i - 1][0] + '</a><br>' +
      '<a href="' + href + '" style="' + a + 'font-size:10px;line-height:14px">' + FB_LABELS[i - 1][1] + '</a>' +
      '</td>';
  }
  const inner =
    '<div dir="rtl" style="text-align:right">مرحبًا <b>' + esc_(name) + '</b>،<br>شكرًا لحضورك. يهمنا رأيك لتطوير فعالياتنا القادمة — لن يستغرق التقييم أكثر من دقيقة.</div>' +
    '<div dir="ltr" style="text-align:left;color:#6b5a80;font-size:14px;margin-bottom:14px">Thank you for attending. Your feedback helps us improve — it takes less than a minute.</div>' +
    '<div dir="rtl" style="text-align:center;font-weight:700;font-size:17px;color:#3a1464;border-top:1px solid #eee8f5;padding-top:14px">' + FB_QUESTION_AR + '</div>' +
    '<div dir="ltr" style="text-align:center;font-size:13px;color:#6b5a80;margin-bottom:8px">' + FB_QUESTION_EN + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="6" border="0" dir="ltr" style="border-collapse:separate;table-layout:fixed"><tr>' + cells + '</tr></table>' +
    '<div dir="rtl" style="text-align:center;font-size:13px;color:#6b5a80;margin-top:12px">اضغط على رقم للتقييم، ثم يمكنك كتابة مقترحاتك · Tap a number, then add your suggestions</div>';
  MailApp.sendEmail({
    to: email,
    subject: (test ? '[نسخة تجريبية · TEST] ' : '') + 'قيّم الفعالية | Rate the event — ' + ev.EventName,
    name: SENDER_NAME,
    htmlBody: emailShell_(ev, inner, { kicker: 'تقييم الفعالية · <span dir="ltr" style="white-space:nowrap">Event evaluation</span>' }),
    inlineImages: images || emailImages_(['sru', 'ictd', 'itoc']),
    body: FB_QUESTION_AR + '\n' + FB_QUESTION_EN + '\n' + fbLink_(pageUrl, ev, email, 0, test)
  });
}

/* ---------------- automation ---------------- */
/**
 * Runs hourly (after installFeedbackTrigger): sends the evaluation e-mail once,
 * 1 hour after each event's end time (or 3 hours after start when no end time is set).
 */
function autoFeedback() {
  const sentMap = fbSentMap_();
  const now = new Date();
  rows_(SH_EVENTS).forEach(function (r) {
    if (sentMap[r.EventID]) return;
    const endStr = r.EndDateTime || r.StartDateTime;
    const end = new Date(String(endStr).slice(0, 16) + ':00');
    if (isNaN(end)) return;
    const due = new Date(end.getTime() + (r.EndDateTime ? 1 : 3) * 3600e3);
    const tooOld = now - due > 7 * 864e5;   // skip events older than a week (avoid back-sending)
    if (now >= due && !tooOld) {
      try { sendFeedback_({ id: r.EventID, auto: true }); } catch (e) { Logger.log('autoFeedback ' + r.EventID + ': ' + e.message); }
    }
  });
}

/** Run ONCE from the editor to enable automatic evaluation e-mails. */
function installFeedbackTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'autoFeedback') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('autoFeedback').timeBased().everyHours(1).create();
  Logger.log('Automatic evaluation e-mails enabled (hourly check).');
}

/** Run to stop automatic evaluation e-mails. */
function removeFeedbackTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'autoFeedback') ScriptApp.deleteTrigger(t);
  });
  Logger.log('Automatic evaluation e-mails disabled.');
}
