// Runs docs/google-sheets-leads/Code.gs against pretend Google services, so the logic is checked without a Google account.
//   node test/leads.test.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let failed = 0;
const ok = (n, c, d = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!c) failed++; };

function world() {
  const tabs = {}; const mails = []; const triggers = []; const pdfs = []; const files = []; const formulas = [];
  const mkRange = (sh, r, c, n = 1, m = 1) => ({
    setFormula(f) { formulas.push({ r, c, f }); return this; }, setFontWeight() { return this; }, setBackground() { return this; }, setNumberFormat() { return this; }, setVerticalAlignment() { return this; }, setWrap() { return this; },
    getValues: () => sh.rows.slice(r - 1, r - 1 + n).map((row) => row.slice(c - 1, c - 1 + m)),
  });
  const mkSheet = (name) => { const sh = { name, rows: [], appendRow(a) { sh.rows.push(a); }, setFrozenRows() {}, getLastRow: () => sh.rows.length, getLastColumn: () => Math.max(...sh.rows.map((x) => x.length)), getRange: (r, c, n, m) => mkRange(sh, r, c, n, m) }; return sh; };
  const fmt = (d, tz, p) => {
    const o = (opt) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...opt }).format(d);
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
    if (p === 'yyyy-MM-dd') return `${parts.year}-${parts.month}-${parts.day}`;
    if (p === 'EEEE d MMMM yyyy') return o({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return o({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  };
  const ctx = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ setSpreadsheetTimeZone() {}, getSheetByName: (n) => tabs[n] || null, insertSheet: (n) => (tabs[n] = mkSheet(n)) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
    MailApp: { sendEmail: (m) => mails.push(m) },
    Utilities: { formatDate: fmt, newBlob: (html) => ({ html, getAs() { return { setName(n) { pdfs.push(n); return { name: n }; } }; } }) },
    DriveApp: { getFoldersByName: () => ({ hasNext: () => false }), createFolder: () => ({ createFile: (b) => { files.push(b); return { getUrl: () => 'https://drive.google.com/file/d/FAKE/view' }; } }) },
    ScriptApp: { getProjectTriggers: () => triggers, deleteTrigger() {}, newTrigger: (fn) => ({ timeBased() { return this; }, everyDays() { return this; }, atHour() { return this; }, inTimezone() { return this; }, create() { triggers.push({ getHandlerFunction: () => fn }); } }) },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('../docs/google-sheets-leads/Code.gs', import.meta.url), 'utf8') + '\n;this.__api = { doPost, dailySummary, setup, CONFIG };', ctx);
  const post = (obj) => JSON.parse(ctx.__api.doPost({ postData: { contents: typeof obj === 'string' ? obj : JSON.stringify(obj) } }).text).status;
  return { ctx, tabs, mails, triggers, pdfs, files, formulas, post, api: ctx.__api };
}

const w = world();
const sub = { type: 'subscribe', name: 'Ada', email: 'Ada@Example.com', phone: '0801 234 5678', consent: true };
ok('subscriber saved', w.post(sub) === 'ok' && w.tabs['Subscribers'].rows.length === 2);
ok('email lower-cased', w.tabs['Subscribers'].rows[1][2] === 'ada@example.com');
w.post({ ...sub, name: 'Ada again' });
ok('same person twice is saved once', w.tabs['Subscribers'].rows.length === 2);
w.post({ ...sub, email: '', phone: '+234 801 234 5678', name: 'Same phone, other format?' });
ok('0801... and +234801... are the same number, saved once', w.tabs['Subscribers'].rows.length === 2);
w.post({ type: 'subscribe', name: 'Bola', email: '', phone: '0802 111 2222', consent: true });
w.post({ ...sub, email: 'x@y.com', phone: '', consent: false });
ok('no consent -> not saved', w.tabs['Subscribers'].rows.length === 3);
w.post({ type: 'subscribe', consent: true });
ok('no email and no phone -> not saved', w.tabs['Subscribers'].rows.length === 3);
w.post({ ...sub, email: 'not-an-email', phone: '' });
ok('bad email -> not saved', w.tabs['Subscribers'].rows.length === 3);
w.post({ type: 'subscribe', name: '=HYPERLINK("http://evil")', email: 'z@z.com', consent: true });
ok('formula in a cell is neutralised', w.tabs['Subscribers'].rows[3][1].startsWith("'="));

const order = { type: 'order', ref: 'BB-7K2Q', customer: 'Ada Obi', fulfilment: 'delivery', address: '5 Adeniran Ogunsanya St, Surulere', items: [{ name: 'Vanilla Celebration Cake', option: '8-inch', qty: 2, price: 25000 }, { name: 'Meat Pie', qty: 3, price: 1200 }], note: 'Call me <b>first</b>', total: 1 };
ok('order saved', w.post(order) === 'ok' && w.tabs['Orders'].rows.length === 2);
const row = w.tabs['Orders'].rows[1];
ok('order row has customer, delivery and address', row[2] === 'Ada Obi' && row[3] === 'Delivery' && /Adeniran/.test(row[4]));
ok('total is recomputed on the server (not trusted)', row[6] === 53600, String(row[6]));
ok('invoice PDF is kept in Drive and linked in the Sheet', w.files.length === 1 && w.formulas.length === 1 && w.formulas[0].c === 10 && /HYPERLINK\("https:\/\/drive\.google\.com/.test(w.formulas[0].f));
ok('invoice email with PDF sent to the owner', w.mails.length === 1 && w.mails[0].attachments?.length === 1 && w.mails[0].to === 'owner@example.com' && /Invoice BB-7K2Q/.test(w.mails[0].subject) && /Ada Obi/.test(w.mails[0].subject));
ok('invoice shows INVOICE, bill-to, items, total', /INVOICE/.test(w.mails[0].htmlBody) && /Billed to/.test(w.mails[0].htmlBody) && /Ada Obi/.test(w.mails[0].htmlBody) && /Vanilla Celebration Cake \(8-inch\)/.test(w.mails[0].htmlBody) && /₦53,600/.test(w.mails[0].htmlBody) && /Adeniran/.test(w.mails[0].htmlBody));
ok('customer text is HTML-escaped in the invoice', !/<b>first<\/b>/.test(w.mails[0].htmlBody) && /&lt;b&gt;/.test(w.mails[0].htmlBody));
w.post(order);
ok('same order ref twice is saved, filed and emailed once', w.tabs['Orders'].rows.length === 2 && w.mails.length === 1 && w.files.length === 1);
w.post({ ...order, ref: 'BB-PICK', customer: 'Bola', fulfilment: 'pickup', address: 'should be ignored' });
ok('pickup order ignores any address', w.tabs['Orders'].rows[2][3] === 'Pickup' && w.tabs['Orders'].rows[2][4] === '');
w.mails.length = 1; w.files.length = 1; w.formulas.length = 1; w.tabs['Orders'].rows.pop();

const booking = { type: 'booking', ref: 'BB-ABCD', date: '2026-11-27', dateText: 'Friday, 27 November 2026', occasion: 'Birthday', fulfilment: 'delivery', name: 'Ada', details: 'Pink 2-tier' };
ok('booking saved + emailed', w.post(booking) === 'ok' && w.tabs['Date requests'].rows.length === 2 && w.mails.length === 2 && /Booking request BB-ABCD/.test(w.mails[1].subject) && /BOOKING REQUEST/.test(w.mails[1].htmlBody) && w.files.length === 2);
ok('booking row has delivery + name', w.tabs['Date requests'].rows[1][4] === 'Delivery' && w.tabs['Date requests'].rows[1][5] === 'Ada');

ok('unknown type ignored', w.post({ type: 'hack' }) === 'ignored');
ok('garbage body does not crash', w.post('not json') === 'error');
w.api.CONFIG.TOKEN = 'secret';
ok('wrong token ignored', w.post({ ...sub, email: 'q@q.com', phone: '' }) === 'ignored');
ok('right token accepted', w.post({ ...sub, email: 'q@q.com', phone: '', token: 'secret' }) === 'ok');
w.api.CONFIG.TOKEN = '';

w.api.dailySummary();
const sum = w.mails.at(-1);
ok('daily summary emailed with a PDF', /Daily summary/.test(sum.subject) && sum.attachments?.length === 1);
ok('summary counts subscribers, orders and requests', /New subscribers today/.test(sum.htmlBody) && /Orders today<\/td><td[^>]*>1 /.test(sum.htmlBody) && /Ada Obi/.test(sum.htmlBody) && /₦53,600/.test(sum.htmlBody));

w.api.setup();
ok('setup creates the evening trigger', w.triggers.length === 1 && w.triggers[0].getHandlerFunction() === 'dailySummary');

w.api.CONFIG.MAX_PER_DAY = 3;
ok('daily safety limit stops saving', w.post({ ...sub, email: 'late@z.com', phone: '', name: 'Late' }) === 'full');

console.log(failed ? `\n${failed} FAILED` : '\nall leads checks passed');
process.exit(failed ? 1 : 0);