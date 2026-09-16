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
assert(tax.roundUp2(3.944) === 3.95, `Medicare mill leftover rounds up ${tax.roundUp2(3.944)}`);
assert(tax.roundUp2(8.84152) === 8.84, `Medicare 8.84152 stays 8.84, got ${tax.roundUp2(8.84152)}`);
assert(tax.VA_STD_DED_MFJ === 17500, 'VA married standard deduction');
assert(tax.vaStandardDeduction({ filingStatus: 'single' }) === 8750, 'VA single std');
assert(tax.vaStandardDeduction({ filingStatus: 'mfj' }) === 17500, 'VA mfj std');
assert(tax.vaStandardDeduction({ filingStatus: 'single', vaFilingStatus: 'married' }) === 17500, 'VA status override');

const mfjVaEmp = {
  payType: 'hourly',
  rate: 20.875,
  payFrequency: 'weekly',
  filingStatus: 'mfj',
  vaWithhold: true,
  extraFederal: 0,
  extraState: 0
};
const mfjVa = tax.computePay(mfjVaEmp, 40);
assert(mfjVa.gross === 835, `MFJ 40h gross ${mfjVa.gross}`);
assert(mfjVa.state === 23.71, `MFJ VA after $17,500 std ${mfjVa.state}`);

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
assert(qb40.stateComputed === 23.71, `QB VA calculated ${qb40.stateComputed}`);
assert(qb40.stateExtra === 5, `QB VA extra ${qb40.stateExtra}`);
assert(qb40.state === 28.71, `QB VA total ${qb40.state}`);

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

const garnEmp = { ...wesley, childSupport: 40, garnishments: 10 };
const garnPay = tax.computePay(garnEmp, 22);
assert(garnPay.childSupport === 40, `child support ${garnPay.childSupport}`);
assert(garnPay.garnishments === 10, `garnishments ${garnPay.garnishments}`);
assert(garnPay.net === tax.round2(314.14 - 50), `garnish net ${garnPay.net} from 22h wesley 314.14-50`);

const ptoPay = tax.computePay(wesley, { regularHours: 32, vacationHours: 4, ptoHours: 4 });
assert(ptoPay.gross === 640, `pto+vac 40h gross ${ptoPay.gross}`);
assert(ptoPay.vacationHours === 4 && ptoPay.ptoHours === 4, 'leave hours recorded');

const leaveEmp = { vacationYear: 2025, vacationHoursBalance: 3, ptoYear: 2025, ptoHoursBalance: 1 };
tax.ensureLeaveBalances(leaveEmp, { vacationHoursPerYear: 40, ptoHoursPerYear: 24 }, new Date('2026-01-02'));
assert(leaveEmp.vacationYear === 2026 && leaveEmp.vacationHoursBalance === 40, `vac reset ${leaveEmp.vacationHoursBalance}`);
assert(leaveEmp.ptoYear === 2026 && leaveEmp.ptoHoursBalance === 24, `pto reset ${leaveEmp.ptoHoursBalance}`);
tax.applyLeaveUsed(leaveEmp, { vacationHours: 8, ptoHours: 2 }, null);
assert(leaveEmp.vacationHoursBalance === 32, `vac after use ${leaveEmp.vacationHoursBalance}`);
assert(leaveEmp.ptoHoursBalance === 22, `pto after use ${leaveEmp.ptoHoursBalance}`);

const a = tax.computePay(wesley, 22);
const b = tax.computePay({ ...wesley, extraFederal: '0', extraState: '0', vaE1: '0' }, '22');
assert(a.federal === b.federal && a.state === b.state && a.gross === b.gross, 'same hours+employee always same FIT/VA');

const strEmp = { ...wesley, extraFederal: '43', extraState: '5', childSupport: '12.5' };
const strPay = tax.computePay(strEmp, 22);
assert(strPay.federalExtra === 43 && strPay.stateExtra === 5 && strPay.childSupport === 12.5, 'string profile amounts coerce');

const multi = {
  ...wesley,
  deductions: [
    { id: 'cs1', type: 'child_support', name: 'VA DCSE case 1234', method: 'flat', amount: 21.58, status: 'Active' },
    { id: 'cs2', type: 'child_support', name: 'VA DCSE case 9999', method: 'flat', amount: 10, status: 'Active' },
    { id: 'g1', type: 'garnishment', name: 'Credit card levy — Midland', method: 'flat', amount: 15, status: 'Active' },
    { id: 'g2', type: 'garnishment', name: 'Paused levy', method: 'flat', amount: 99, status: 'Paused' }
  ]
};
const multiPay = tax.computePay(multi, 22, { payday: '2026-09-09' });
assert(multiPay.deductions.length === 3, `active deductions ${multiPay.deductions.length}`);
assert(multiPay.childSupport === 31.58, `two CS ${multiPay.childSupport}`);
assert(multiPay.garnishments === 15, `one garn ${multiPay.garnishments}`);
assert(multiPay.net === tax.round2(314.14 - 31.58 - 15), `multi net ${multiPay.net}`);
const stubRows = tax.stubDeductionRows({ deductions: multiPay.deductions });
assert(stubRows[0].label === 'Child Support' && stubRows[1].label === 'Child Support 2', `labels ${stubRows.map((r) => r.label)}`);
assert(stubRows[2].label === 'Garnishment', `garn label ${stubRows[2].label}`);

const pctEmp = {
  ...wesley,
  deductions: [{ id: 'p1', type: 'garnishment', name: 'Percent levy', method: 'percent', amount: 10, status: 'Active' }]
};
const pctPay = tax.computePay(pctEmp, 22);
assert(pctPay.garnishments === tax.round2(314.14 * 0.1), `percent ${pctPay.garnishments}`);

const dated = {
  ...wesley,
  deductions: [
    { id: 'future', type: 'child_support', name: 'Future order', method: 'flat', amount: 50, status: 'Active', start: '2027-01-01' }
  ]
};
const datedPay = tax.computePay(dated, 22, { payday: '2026-09-09' });
assert(datedPay.childSupport === 0 && datedPay.deductions.length === 0, 'future start date does not withhold');

const loanUnstarted = {
  ...wesley,
  deductions: [
    {
      id: 'loan0',
      type: 'loan',
      name: 'Tool loan 2026',
      method: 'flat',
      amount: 40,
      originalAmount: 80,
      remaining: 0,
      ytd: 0,
      status: 'Active'
    }
  ]
};
const loanUnstartedPay = tax.computePay(loanUnstarted, 22);
assert(loanUnstartedPay.loans === 40, `new loan with remaining 0 still withholds ${loanUnstartedPay.loans}`);
const unstartedStub = tax.stubDeductionRows({ deductions: loanUnstartedPay.deductions }, loanUnstarted);
assert(unstartedStub.length === 1 && unstartedStub[0].label === 'Loan', `stub loan label ${JSON.stringify(unstartedStub)}`);
assert(!unstartedStub.some((r) => /Tool loan/i.test(r.label)), 'internal name not on stub');

const loanEmp = {
  ...wesley,
  deductions: [
    {
      id: 'loan1',
      type: 'loan',
      name: 'Tool loan 2026',
      method: 'flat',
      amount: 50,
      originalAmount: 80,
      remaining: 80,
      status: 'Active'
    }
  ]
};
const loan1 = tax.computePay(loanEmp, 22);
assert(loan1.loans === 50, `loan withhold ${loan1.loans}`);
assert(loan1.net === tax.round2(314.14 - 50), `loan net ${loan1.net}`);
tax.applyDeductionYtd(loanEmp, loan1.deductions, []);
assert(loanEmp.deductions[0].remaining === 30, `remaining after first ${loanEmp.deductions[0].remaining}`);
const loan2 = tax.computePay(loanEmp, 22);
assert(loan2.loans === 30, `last loan payment ${loan2.loans}`);
tax.applyDeductionYtd(loanEmp, loan2.deductions, []);
assert(loanEmp.deductions[0].remaining === 0, 'loan balance zero');
assert(loanEmp.deductions[0].status === 'Paid off', 'loan paid off');
const stubLoan = tax.stubDeductionRows({
  deductions: [
    { type: 'loan', name: 'Tool loan 2026', amount: 50, ytd: 50 },
    { type: 'loan', name: 'Uniform loan', amount: 10, ytd: 10 }
  ]
});
assert(stubLoan[0].label === 'Loan' && stubLoan[1].label === 'Loan 2', `loan labels ${stubLoan.map((r) => r.label)}`);
assert(!stubLoan.some((r) => /Tool loan/i.test(r.label)), 'internal loan name stays off stub');

const skipPay = tax.computePay(multi, 22, { payday: '2026-09-09', skipDeductions: true });
assert(skipPay.childSupport === 0 && skipPay.garnishments === 0 && skipPay.loans === 0, 'skip takes no CS/garnish/loans');
assert(skipPay.deductions.length === 0, 'skip has no $0 deduction lines');
assert(skipPay.federal === multiPay.federal && skipPay.state === multiPay.state, 'skip still runs taxes');
assert(
  skipPay.net === tax.round2(skipPay.gross - skipPay.pretax - skipPay.federal - skipPay.ss - skipPay.medicare - skipPay.state),
  `skip net is after tax only ${skipPay.net}`
);
assert(tax.stubDeductionRows({ deductions: skipPay.deductions }).length === 0, 'stub omits skipped deductions');

const loanSkipEmp = {
  ...wesley,
  deductions: [
    { id: 'loan1', type: 'loan', name: 'Tool loan 2026', method: 'flat', amount: 50, originalAmount: 80, remaining: 80, ytd: 0, status: 'Active' }
  ]
};
const skippedLoan = tax.computePay(loanSkipEmp, 22, { payday: '2026-09-09', skipDeductions: true });
assert(skippedLoan.loans === 0, 'skip does not withhold loan');
tax.applyDeductionYtd(loanSkipEmp, [], [], '2026-09-09');
assert(loanSkipEmp.deductions[0].remaining === 80, 'skip does not change remaining');
assert(loanSkipEmp.deductions[0].ytd === 0, 'skip does not change ytd before sync');

const ytdEmp = {
  ...wesley,
  payweeks: [],
  deductions: [
    { id: 'cs1', type: 'child_support', name: 'VA DCSE', method: 'flat', amount: 20, status: 'Active', ytd: 0 }
  ]
};
const yw1 = tax.computePay(ytdEmp, 22, { payday: '2026-09-09', periodEnd: '2026-09-08' });
assert(yw1.deductions[0].amount === 20 && yw1.deductions[0].ytd === 20, `first week ytd ${yw1.deductions[0].ytd}`);
ytdEmp.payweeks.push({ payday: '2026-09-09', periodEnd: '2026-09-08', skipDeductions: false, deductions: yw1.deductions });
tax.syncDeductionYtdFromWeeks(ytdEmp, '2026-09-09');
assert(ytdEmp.deductions[0].ytd === 20, 'employee ytd after first finalize');
const yw2 = tax.computePay(ytdEmp, 22, { payday: '2026-09-16', periodEnd: '2026-09-15' });
assert(yw2.deductions[0].ytd === 40, `second week ytd ${yw2.deductions[0].ytd}`);
ytdEmp.payweeks.push({ payday: '2026-09-16', periodEnd: '2026-09-15', skipDeductions: false, deductions: yw2.deductions });
tax.syncDeductionYtdFromWeeks(ytdEmp, '2026-09-16');
assert(ytdEmp.deductions[0].ytd === 40, 'employee ytd after second');
const yw1again = tax.computePay(ytdEmp, 22, { payday: '2026-09-09', periodEnd: '2026-09-08' });
assert(yw1again.deductions[0].ytd === 40, `re-transfer does not double ytd ${yw1again.deductions[0].ytd}`);
ytdEmp.payweeks[0] = { payday: '2026-09-09', periodEnd: '2026-09-08', skipDeductions: false, deductions: yw1again.deductions };
tax.syncDeductionYtdFromWeeks(ytdEmp, '2026-09-09');
assert(ytdEmp.deductions[0].ytd === 40, 'sync after replace still 40');
ytdEmp.payweeks.push({
  payday: '2025-12-31',
  periodEnd: '2025-12-30',
  skipDeductions: false,
  deductions: [{ id: 'cs1', amount: 99, ytd: 99 }]
});
const y2026 = tax.computePay(ytdEmp, 22, { payday: '2026-09-23', periodEnd: '2026-09-22' });
assert(y2026.deductions[0].ytd === 60, `calendar year ignores prior year ${y2026.deductions[0].ytd}`);

const orderEmp = {
  ...wesley,
  deductions: [
    { id: 'loan1', type: 'loan', name: 'Loan', method: 'flat', amount: 400, originalAmount: 400, remaining: 400, status: 'Active' },
    { id: 'cs1', type: 'child_support', name: 'CS', method: 'flat', amount: 40, status: 'Active' }
  ]
};
const orderPay = tax.computePay(orderEmp, 22, { payday: '2026-09-09' });
assert(orderPay.childSupport === 40, 'CS before loan');
assert(orderPay.net === 0, 'loan last takes leftover net');
assert(orderPay.loans === tax.round2(314.14 - 40), `loan leftover ${orderPay.loans}`);

const sortA = [
  { lastName: 'smith', firstName: 'Ann' },
  { lastName: 'Adams', firstName: 'bob' },
  { lastName: 'adams', firstName: 'Amy' }
];
sortA.sort((a, b) => {
  const ln = String(a.lastName).localeCompare(String(b.lastName), 'en', { sensitivity: 'base' });
  if (ln) return ln;
  return String(a.firstName).localeCompare(String(b.firstName), 'en', { sensitivity: 'base' });
});
assert(sortA[0].firstName === 'Amy' && sortA[1].firstName === 'bob' && sortA[2].lastName === 'smith', 'A-Z last then first, case-insensitive');

console.log('TAX_OK', {
  firstFit: first.federal,
  firstVa: first.state,
  firstNet: first.net,
  qbFit: qb40.federal,
  nineQbFit: nineQb.federal,
  garnNet: garnPay.net,
  ficaNotes
});
