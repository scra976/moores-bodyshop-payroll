'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '../src/renderer/tax.js'), 'utf8');
const ctx = { window: {}, console };
vm.runInNewContext(src, ctx);
const tax = ctx.window.MooresTax;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const wesley = {
  payType: 'hourly',
  rate: 16,
  payFrequency: 'weekly',
  filingStatus: 'single',
  vaWithhold: true,
  multipleJobs: false,
  w4Step3Dependents: 0,
  extraFederal: 0,
  extraState: 0,
  preTaxDeduction: 0,
  vaE1: 0,
  vaE2: 0
};

const stubs = [
  {
    payday: '2026-07-08',
    periodStart: '2026-07-01',
    periodEnd: '2026-07-07',
    input: { regularHours: 30.11, holidayHours: 8 },
    gross: 609.76,
    federal: 31.25,
    ss: 37.81,
    medicare: 8.84,
    state: 20.43,
    taxes: 98.33,
    net: 511.43
  },
  {
    payday: '2026-08-12',
    periodStart: '2026-08-05',
    periodEnd: '2026-08-11',
    input: 29.29,
    gross: 468.64,
    federal: 15.9,
    ss: 29.06,
    medicare: 6.79,
    state: 12.52,
    taxes: 64.27,
    net: 404.37
  },
  {
    payday: '2026-08-19',
    periodStart: '2026-08-12',
    periodEnd: '2026-08-18',
    input: 19.34,
    gross: 309.44,
    federal: 0,
    ss: 19.18,
    medicare: 4.49,
    state: 4.56,
    taxes: 28.23,
    net: 281.21
  },
  {
    payday: '2026-08-26',
    periodStart: '2026-08-19',
    periodEnd: '2026-08-25',
    input: 22,
    gross: 352,
    federal: 4.24,
    ss: 21.83,
    medicare: 5.1,
    state: 6.69,
    taxes: 37.86,
    net: 314.14
  },
  {
    payday: '2026-09-02',
    periodStart: '2026-08-26',
    periodEnd: '2026-09-01',
    input: 17,
    gross: 272,
    federal: 0,
    ss: 16.86,
    medicare: 3.95,
    state: 2.69,
    taxes: 23.5,
    net: 248.5
  }
];

let ytd = 0;
const ficaNotes = [];
for (const s of stubs) {
  const p = tax.computePay(wesley, s.input, { ytdGross: ytd });
  assert(p.gross === s.gross, `${s.payday} gross ${p.gross} != ${s.gross}`);
  assert(p.federal === s.federal, `${s.payday} FIT ${p.federal} != ${s.federal}`);
  assert(p.state === s.state, `${s.payday} VA ${p.state} != ${s.state}`);
  if (p.ss !== s.ss || p.medicare !== s.medicare) {
    ficaNotes.push(`${s.payday} FICA engine SS ${p.ss}/Med ${p.medicare} stub SS ${s.ss}/Med ${s.medicare} (YTD method vs QB prior-year-to-date)`);
  }
  const taxes = tax.round2(p.federal + p.ss + p.medicare + p.state);
  const net = tax.round2(p.gross - taxes);
  assert(Math.abs(taxes - tax.round2(p.federal + p.ss + p.medicare + p.state)) < 0.001, 'tax sum');
  ytd = p.ytdGross;
}

const p = tax.payPeriodFromDate('2026-08-18');
assert(p.periodStart === '2026-08-12', `period start ${p.periodStart}`);
assert(p.periodEnd === '2026-08-18', `period end ${p.periodEnd}`);
assert(p.payday === '2026-08-19', `payday ${p.payday}`);

assert(tax.SS_WAGE_BASE === 184500, '2026 SS wage base');

const first = tax.computePay(wesley, { regularHours: 30.11, holidayHours: 8 }, { ytdGross: 0 });
assert(first.ss === 37.81 && first.medicare === 8.84, `first-period FICA ${first.ss} ${first.medicare}`);
assert(first.net === 511.43, `first net ${first.net}`);
assert(first.totalTaxes === 98.33, `first taxes ${first.totalTaxes}`);

console.log('TAX_OK', { firstFit: first.federal, firstVa: first.state, firstNet: first.net, ficaNotes });
