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

const extraEmp = { ...wesley, extraFederal: 43, extraState: 10 };
const extraPay = tax.computePay(extraEmp, 22);
assert(extraPay.federalComputed === 4.24, `FIT tentative ${extraPay.federalComputed}`);
assert(extraPay.federalExtra === 43, `FIT extra ${extraPay.federalExtra}`);
assert(extraPay.federal === 47.24, `FIT total ${extraPay.federal} must be calculated + extra`);
assert(extraPay.stateComputed === 6.69, `VA tentative ${extraPay.stateComputed}`);
assert(extraPay.stateExtra === 10, `VA extra ${extraPay.stateExtra}`);
assert(extraPay.state === 16.69, `VA total ${extraPay.state}`);

assert(tax.paidPunchHours({ clockIn: '08:00', clockOut: '17:00' }) === 9, 'no lunch');
assert(
  tax.paidPunchHours({ clockIn: '08:00', clockOut: '17:00', lunchOut: '12:00', lunchIn: '12:30' }) === 8.5,
  'lunch subtracted'
);

const days = tax.periodDays('2026-08-12', '2026-08-18');
assert(days.length === 7 && days[0] === '2026-08-12' && days[6] === '2026-08-18', 'Wed-Tue days');

const first = tax.computePay(wesley, { regularHours: 30.11, holidayHours: 8 }, { ytdGross: 0 });
assert(first.ss === 37.81 && first.medicare === 8.84, `first-period FICA ${first.ss} ${first.medicare}`);
assert(first.net === 511.43, `first net ${first.net}`);
assert(first.totalTaxes === 98.33, `first taxes ${first.totalTaxes}`);

const qbMfj = {
  payType: 'hourly',
  rate: 20.875,
  payFrequency: 'weekly',
  filingStatus: 'mfj',
  vaWithhold: true,
  multipleJobs: false,
  w4Step3Dependents: 0,
  extraFederal: 43,
  extraState: 5,
  preTaxDeduction: 0,
  w4OtherIncome: 0,
  w4Deductions: 0,
  vaE1: 0,
  vaE2: 0
};
const qb40 = tax.computePay(qbMfj, 40);
assert(qb40.gross === 835, `QB 40h gross ${qb40.gross}`);
assert(qb40.federalComputed === 21.58, `QB calculated FIT ${qb40.federalComputed}`);
assert(qb40.federalExtra === 43, `QB extra ${qb40.federalExtra}`);
assert(qb40.federal === 64.58, `QB FIT total ${qb40.federal} must be 21.58+43`);
assert(qb40.stateComputed === 33.39, `QB VA calculated ${qb40.stateComputed}`);
assert(qb40.stateExtra === 5, `QB VA extra ${qb40.stateExtra}`);
assert(qb40.state === 38.39, `QB VA total ${qb40.state}`);

const qbWeeklySalary = { ...qbMfj, payType: 'salary', rate: 835 };
const qbSalEmpty = tax.computePay(qbWeeklySalary, 0);
assert(qbSalEmpty.gross === 835, `weekly salary with 0 hours gross ${qbSalEmpty.gross}`);
assert(qbSalEmpty.federal === 64.58, `weekly salary FIT ${qbSalEmpty.federal}`);
const qbAnnualSalary = { ...qbMfj, payType: 'salary', rate: 43420 };
const qbSalAnnual = tax.computePay(qbAnnualSalary, []);
assert(qbSalAnnual.gross === 835, `annual salary gross ${qbSalAnnual.gross}`);
assert(qbSalAnnual.federal === 64.58, `annual salary FIT ${qbSalAnnual.federal}`);

const nineMfj2020 = {
  payType: 'hourly',
  rate: 9,
  payFrequency: 'weekly',
  filingStatus: 'mfj',
  w4Form: '2020',
  vaWithhold: true,
  extraFederal: 43,
  extraState: 5
};
const nine2020 = tax.computePay(nineMfj2020, 40);
assert(nine2020.gross === 360, `nine 40h gross ${nine2020.gross}`);
assert(nine2020.federalComputed === 0, `2020 MFJ $9×40 calculated FIT must be 0, got ${nine2020.federalComputed}`);
assert(nine2020.federal === 43, `2020 MFJ $9×40 FIT ${nine2020.federal}`);

const nineLegacy = {
  payType: 'hourly',
  rate: 9,
  payFrequency: 'weekly',
  filingStatus: 'single',
  w4Form: '2019',
  w4Allowances: 0,
  vaWithhold: true,
  extraFederal: 43,
  extraState: 5
};
const nineQb = tax.computePay(nineLegacy, 40);
assert(nineQb.gross === 360, `legacy $9×40 gross ${nineQb.gross}`);
assert(nineQb.federalComputed === 21.58, `2019 Single 0 allowances calculated FIT ${nineQb.federalComputed}`);
assert(nineQb.federalExtra === 43, `legacy extra ${nineQb.federalExtra}`);
assert(nineQb.federal === 64.58, `QB $9/hour FIT ${nineQb.federal} must be 21.58+43`);

console.log('TAX_OK', {
  firstFit: first.federal,
  firstVa: first.state,
  firstNet: first.net,
  qbFit: qb40.federal,
  nineQbFit: nineQb.federal,
  ficaNotes
});
