'use strict';

const path = require('path');
const books = require('../src/renderer/books');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function close(a, b, msg) {
  const ok = Math.abs(Number(a) - Number(b)) < 0.005;
  if (!ok) throw new Error(`${msg}: expected ${b}, got ${a}`);
}

const seeded = books.seedBooks();
assert(seeded.accounts.some((a) => a.code === '1000'), 'cash account');
assert(seeded.accounts.some((a) => a.code === '1250'), 'employee loans receivable');
assert(seeded.accounts.some((a) => a.code === '5100'), 'direct labor COGS exists');
assert(seeded.settings.laborCogsEnabled === false, 'labor COGS default off');
assert(seeded.receipts.length === 1 && seeded.receipts[0].status === 'draft', 'one draft receipt');
assert(!seeded.journal.length, 'drafts do not post');

const demo = seeded.receipts[0];
const tot = books.receiptTotals(demo);
close(tot.parts, 125.43, 'parts');
close(tot.mech, 127.8, 'mech labor 1.42*90');
close(tot.labor, 127.8, 'labor');
close(tot.tax, 6.65, '5.3% of 125.43');
close(tot.total, 259.88, 'receipt total');
close(tot.cost, 80, 'est cost');

const unbalanced = books.linesBalance([
  { account: '1000', debit: 10, credit: 0 },
  { account: '4100', debit: 0, credit: 9 }
]);
assert(!unbalanced.ok, 'out of balance rejected');

const finalized = books.finalizeReceipt(seeded, demo.id);
assert(finalized.ok, finalized.error || 'finalize');
const entry = finalized.entry;
const dr = entry.lines.reduce((s, l) => s + l.debit, 0);
const cr = entry.lines.reduce((s, l) => s + l.credit, 0);
close(dr, cr, 'finalize debits=credits');

const by = (code) => entry.lines.find((l) => l.account === code) || { debit: 0, credit: 0 };
close(by('1000').debit, 259.88, 'Dr cash/AR total');
close(by('4100').credit, 125.43, 'Cr parts revenue');
close(by('4000').credit, 127.8, 'Cr mech labor');
close(by('2100').credit, 6.65, 'Cr sales tax');
close(by('5000').debit, 80, 'Dr parts COGS');
close(by('1200').credit, 80, 'Cr inventory');
assert(!entry.lines.some((l) => l.account === '5100'), 'labor is not COGS');
assert(finalized.books.receipts[0].status === 'finalized', 'status finalized');
close(books.qtyOnHand(books.findPart(finalized.books, 'AD-7994')), 0, 'issued FIFO qty');

const tb = books.trialBalance(finalized.books);
assert(tb.balanced, 'trial balance');

const pl = books.profitAndLoss(finalized.books, '2026-01-01', '2026-12-31');
close(pl.revenue.total, 253.23, 'revenue parts+labor');
close(pl.cogs.total, 80, 'cogs');
close(pl.grossProfit, 173.23, 'gross profit');

const invBooks = books.seedBooks();
const bought = books.saveBillDraft(invBooks, {
  date: '2026-09-05',
  vendorName: 'Parts Co',
  paidNow: false,
  lines: [{ kind: 'parts', pn: 'PAD-1', desc: 'Pads', qty: 2, amount: 40, stocked: true, sellPrice: 90 }]
});
assert(bought.ok, bought.error);
const postedBill = books.postBill(bought.books, bought.bill.id);
assert(postedBill.ok, postedBill.error);
const part = books.findPart(postedBill.books, 'PAD-1');
close(books.qtyOnHand(part), 2, 'received qty');
close(books.fifoValue(part), 80, 'FIFO value 2*40');
const billDr = postedBill.entry.lines.find((l) => l.account === '1200');
const billCr = postedBill.entry.lines.find((l) => l.account === '2000');
close(billDr.debit, 80, 'Dr 1200 parts bill');
close(billCr.credit, 80, 'Cr 2000');

const exp = books.saveBillDraft(postedBill.books, {
  date: '2026-09-05',
  vendorName: 'Clean Co',
  lines: [{ kind: 'expense', account: '6420', desc: 'Shop cleaning', amount: 50 }]
});
const expPost = books.postBill(exp.books, exp.bill.id);
assert(expPost.ok, expPost.error);
close(expPost.entry.lines.find((l) => l.account === '6420').debit, 50, 'opex debit');

const pay = books.postPayrollRun(books.emptyBooks(), {
  employeeId: 'e1',
  employeeName: 'Test Tech',
  periodEnd: '2026-09-01',
  payday: '2026-09-02',
  gross: 400,
  net: 300,
  federal: 40,
  ss: 24.8,
  medicare: 5.8,
  additionalMedicare: 0,
  state: 20,
  childSupport: 9.4,
  garnishments: 0,
  pretax: 0
});
assert(pay.ok, pay.error);
const pdr = pay.entry.lines.reduce((s, l) => s + l.debit, 0);
const pcr = pay.entry.lines.reduce((s, l) => s + l.credit, 0);
close(pdr, pcr, 'payroll balanced');
close(pay.entry.lines.find((l) => l.account === '6000').debit, 400, 'Dr payroll expense');
close(pay.entry.lines.find((l) => l.account === '1000').credit, 300, 'Cr net cash');

const loanPay = books.postPayrollRun(books.emptyBooks(), {
  employeeId: 'e1',
  employeeName: 'Test Tech',
  periodEnd: '2026-09-08',
  payday: '2026-09-09',
  gross: 400,
  net: 250,
  federal: 40,
  ss: 24.8,
  medicare: 5.8,
  additionalMedicare: 0,
  state: 20,
  childSupport: 9.4,
  garnishments: 0,
  loans: 50,
  pretax: 0
});
assert(loanPay.ok, loanPay.error);
close(loanPay.entry.lines.find((l) => l.account === '1250').credit, 50, 'Cr 1250 loan');
close(
  loanPay.entry.lines.reduce((s, l) => s + l.debit, 0),
  loanPay.entry.lines.reduce((s, l) => s + l.credit, 0),
  'loan payroll balanced'
);

const added = books.addAccount(books.emptyBooks(), { code: '6950', name: 'Uniforms', type: 'opex' });
assert(added.ok && added.account.code === '6950', 'user can add accounts');

console.log('BOOKS_OK');
