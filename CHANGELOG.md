# Changelog — SRU Event Attendance & Management Platform

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
