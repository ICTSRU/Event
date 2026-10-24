/* SRU Event Attendance & Management Platform — public pages configuration (v5.1)
 * Used only by checkin.html and feedback.html (visitors). The admin console and dashboard
 * run in the secure Apps Script platform (SRU accounts only) and do not use this file.
 * 1. Paste your Apps Script Web App URL below (ends with /exec).
 * 2. Leave it empty to run in DEMO mode (data kept in this browser only).
 */
window.EA_CONFIG = {
  VERSION: '5.1',
  API_URL: 'https://script.google.com/macros/s/AKfycbwA4OA3paT4lDZ3T953kYuUyOCwwtU7ZZJDSMTcKztg19rfFtJNKmONZfxgFMvVpYCr/exec',
  CHECKIN_PAGE: 'checkin.html', // relative to index.html; change only if you rename the file
  ITOC_URL: 'https://ictsru.github.io/ITOC/#forms'
};
