'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {}, console };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/renderer/tax.js'), 'utf8'), ctx);
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/renderer/reports.js'), 'utf8'), ctx);
const R = ctx.window.MooresReports;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const emp = {
  firstName: 'Test',
  lastName: 'Tech',
  ssn: '123456789',
  address: { street: '821 Kabrich Street', city: 'Blacksburg', state: 'VA', zip: '24060' },
  jobTitle: 'Technician',
  payType: 'hourly',
  rate: 16,
  payFrequency: 'weekly',
  vacationHoursBalance: 32,
  ptoHoursBalance: 40,
  payweeks: [
    {
      periodStart: '2026-08-12',
      periodEnd: '2026-08-18',
      payday: '2026-08-19',
      hours: 22,
      regularHours: 22,
      otHours: 0,
      vacationHours: 0,
      ptoHours: 0,
      holidayHours: 0,
      gross: 352,
      pretax: 0,
      federal: 4.24,
      ss: 21.83,
      medicare: 5.1,
      state: 6.69,
      childSupport: 0,
      garnishments: 0,
      net: 314.14
    }
  ]
};

const ytd = R.ytdThrough(emp, 2026, '2026-08-19');
assert(ytd.gross === 352, `ytd gross ${ytd.gross}`);
assert(ytd.net === 314.14, `ytd net ${ytd.net}`);
const stub = R.paystubHtml(emp, emp.payweeks[0], ytd, { name: "Moore's Body Shop" }, { ein: '123456789' });
assert(stub.includes('314.14') || stub.includes('$314.14'), 'stub has net');
assert(stub.includes('Employee pay stub'), 'stub title');
assert(!/Child Support/i.test(stub), 'no child support section when none');
assert(!/Garnishment/i.test(stub), 'no garnishment section when none');
assert(!stub.includes('Check No.'), 'omit Check No. when empty');
const stubChk = R.paystubHtml(
  emp,
  { ...emp.payweeks[0], checkNumber: '1042', deductions: [{ id: 'cs1', type: 'child_support', name: 'VA DCSE case 1234', amount: 40, ytd: 40 }] },
  { ...ytd, childSupport: 40, net: 274.14 },
  { name: "Moore's Body Shop" },
  {}
);
assert(stubChk.includes('Check No.') && stubChk.includes('1042'), 'check number on stub');
assert(stubChk.includes('Child Support'), 'child support row when present');
assert(!stubChk.includes('VA DCSE case 1234'), 'internal name stays off the stub');
const stubLoan = R.paystubHtml(
  emp,
  { ...emp.payweeks[0], deductions: [{ id: 'ln1', type: 'loan', name: 'Tool loan 2026', amount: 25, ytd: 25 }] },
  ytd,
  { name: "Moore's Body Shop" },
  {}
);
assert(stubLoan.includes('Loan'), 'loan row when withheld');
assert(!stubLoan.includes('Tool loan 2026'), 'loan internal name off stub');
const w2 = R.w2Html(emp, 2026, ytd, { name: "Moore's Body Shop" }, {});
assert(w2.includes('Form W-2 worksheet'), 'w2 worksheet');
const q = R.quarterWindow(2026, 3);
assert(q.start === '2026-07-01' && q.end === '2026-09-30', `quarter ${q.start} ${q.end}`);
console.log('REPORTS_OK');
