# Changelog — SRU Event Attendance & Management Platform

## v2.6 — 2026-10-11
- Fix: bulk e-mails (مراسلة الحضور, e.g. the post-event thank-you template) lost their line breaks in Outlook and reordered Arabic/English text and dates.
  - Each line of the message becomes its own paragraph with an explicit direction (Arabic → RTL, otherwise LTR); blank lines are kept as spacing.
  - Latin names/values inside Arabic lines are direction-isolated; `{date}` now renders as the Arabic long date (e.g. «الخميس، 15 أكتوبر 2026 في 03:07 م»).
  - Header label for these e-mails: «رسالة للمشاركين · Message to attendees» (was "Attendance check-in").
- Admin preview uses the same Arabic date format.

## v2.5 — 2026-10-11
- Fix: evaluation page could show "Network error" on submit when the server reply was lost.
  - Safe calls (`getEvent`, `checkStatus`, `fbInfo`, `feedback`) now retry automatically up to 3 times on a network failure.
  - Before showing an error, the page re-reads the saved answer (3 checks) and shows success if it was stored.
  - Clearer bilingual message when the server is truly unreachable.

## v2.4 — 2026-10-11
- Evaluation tab: **إرسال نسخة تجريبية لي** — sends one copy of the evaluation e-mail to a chosen address (default `TEST_EMAIL` in `config.js`, remembered per browser).
- Test copies carry preview links (`&test=1`, separately signed): the evaluation page opens in preview mode, works without an attendance record, and never saves the answer. Subject is prefixed with "[نسخة تجريبية · TEST]"; logged in `MailLog`.
- Backend: new admin action `testFeedback`.

## v2.3 — 2026-10-11
- Fix: evaluation e-mail rating buttons broke apart in Outlook desktop (Word rendering engine). Buttons are now table cells with plain links — consistent in Outlook, Gmail and mobile.
- Fix: `check.png` appeared as an attachment in the evaluation and bulk e-mails. Each e-mail now embeds only the images it uses.

## v2.2 — 2026-10-11
- **Event evaluation (تقييم الفعالية):**
  - Evaluation e-mail with one overall-satisfaction question on a 5-point Likert scale (clickable 1–5 buttons) and an open question for suggestions.
  - New `feedback.html` page: personal signed link per attendee (HMAC token), rating pre-selected from the e-mail, optional suggestions, edit previous answer; one response per person per event.
  - Responses saved to the new `Feedback` sheet (created automatically).
  - Admin console: new **تقييم الفعالية** tab — responses, response rate, average satisfaction, send request to attendees who have not answered yet.
  - Automation: `installFeedbackTrigger()` sends the evaluation automatically 1 hour after each event ends (hourly check, once per event).
  - Dashboard: satisfaction KPIs, rating distribution, average satisfaction per event, suggestions list (search, filter by rating, export), responses and average columns in the events summary.
- Backend: new `Feedback.gs`; actions `fbInfo`, `feedback` (public, signed) and `feedbackStatus`, `sendFeedback` (admin); `dashboard` now returns feedback. Manifest adds `script.scriptapp` scope (for the automatic trigger).

## v2.1 — 2026-10-11
- New **dashboard.html** — لوحة مؤشرات الفعاليات والحضور:
  - 6 KPIs: events (open), check-ins, unique people, average per event, repeat-attendance rate, thank-you e-mail rate.
  - Charts: attendees per event (top 12), monthly trend, check-ins by hour, by weekday, internal (sr.edu.sa) vs external, top e-mail domains — with hover tooltips.
  - Tables: events summary with share of total; most engaged (repeat) attendees.
  - Filters: period (30/90 days, month, year, custom), status, search; optional 1-minute auto-refresh; Excel (CSV) export; print/PDF.
- Backend: new admin action `dashboard` (all events + check-ins in one call) — requires a new deployment version.
- Admin console: **لوحة المؤشرات** button in the header.

## v2.0 — 2026-10-11
- Overview: removed the **رصيد البريد اليومي · Mail quota** tile (four KPI tiles remain: events, open, attendees, average per event).

## v1.9 — 2026-10-11
- Admin console header: **قاعدة البيانات** and **الإعدادات** buttons hidden.
- Settings still reachable by opening `index.html#settings`, and open automatically if the admin key or connection fails.

## v1.8 — 2026-10-11
- Redesigned thank-you e-mail to match the check-in page: logo band (university right, ICTD left), purple event header with location and Arabic long date, blue stripe, green check badge with "تم تسجيل حضورك بنجاح / Your attendance has been recorded", bilingual thanks, ITOC footer.
- Logos embedded as inline images (new `EmailAssets.gs`) — displayed in Outlook/Gmail without "download pictures".
- Table-based, inline-styled layout for Outlook compatibility; bulk e-mails use the same branded shell.

## v1.7 — 2026-10-11
- Fix: on iPhone/Safari the check-in page could show "Network error" although the attendance was saved and the thank-you e-mail sent.
  - Visitor actions (`getEvent`, `checkin`, `checkStatus`) now use a simple GET request, which follows the Apps Script redirect reliably.
  - If the reply is still lost, the page confirms the registration with the new `checkStatus` action (up to 3 tries) and shows success.
- Backend: `doGet` handles `checkin` and `checkStatus` (requires a new deployment version).

## v1.6 — 2026-10-11
- Admin key preset in `assets/config.js` (`ADMIN_KEY`) — the admin console connects without entering the key. A key typed in Settings still overrides it on that browser.
- Security note: the key is readable by anyone who can open `config.js` on a public site; rotate it in Script Properties if exposed.

## v1.5 — 2026-10-11
- Fix: QR code did nothing on phones when the admin console was opened from the local computer (QR contained a `file://` / localhost link).
- New **Public site URL** setting (`PUBLIC_URL` in `config.js` or Settings) — QR codes and check-in links are always built from the published GitHub Pages address.
- Warning shown on the QR tab when the check-in link is not reachable from phones.

## v1.4 — 2026-10-11
- Fix: "Network error" when the Settings URL field contained extra text (e.g. `API_URL: '…'`). The pasted value is now cleaned to the bare `https://script.google.com/…/exec` URL; invalid input is rejected with a clear message.
- A previously saved bad URL in the browser is ignored automatically; the default from `config.js` is used.
- Clearer network-error message and Settings hint.

## v1.3 — 2026-10-11
- Backend linked directly to the data Google Sheet by ID (`SPREADSHEET_ID` in `Code.gs`) — works whether the Apps Script project is bound to the sheet or standalone.
- Missing tabs (Events / Attendance / MailLog) are recreated automatically with headers.
- Manifest scope changed to `spreadsheets` (required by `openById`).
- Admin console: new **قاعدة البيانات** button opening the Google Sheet; connection check now shows the linked sheet name.

## v1.2 — 2026-10-11
- Connected the front end to the live Apps Script Web App (`assets/config.js` → `API_URL`); demo mode is no longer active by default.

## v1.1 — 2026-10-11
- Renamed to **منصة تسجيل حضور وإدارة الفعاليات · Event Attendance & Management Platform** (page titles, header, footer, e-mail sender name, docs).
- Added official logos: `logo-sru.png` (header right), `logo-ictd.png` (header left), `logo-itoc.png` (footer, linked to the ITOC forms hub); also used on the printable QR poster and printed report.
- Header logos scale down on small phone screens.

## v1.0 — 2026-10-11
Initial release.

- Admin console (`index.html`): create/edit events (name, location, start/end, organizer, description), Open/Closed registration toggle, search/filter list, all-events overview with KPIs.
- QR code per event with copy link, PNG download and printable A4 poster.
- Public bilingual check-in page (`checkin.html`): name + e-mail, duplicate protection, closed-event handling, "register another person".
- Automatic bilingual thank-you e-mail (SRU-branded HTML) on check-in.
- Attendance report: KPIs, check-ins by hour, searchable list, CSV/Excel export (UTF-8 BOM for Arabic), print/PDF.
- Bulk e-mail to all attendees of an event with `{name} {event} {date} {location}` placeholders, preview, quota guard and `MailLog`.
- Apps Script backend with admin key, script lock on check-in, formula-injection protection.
- Built-in demo mode when no API URL is configured.
