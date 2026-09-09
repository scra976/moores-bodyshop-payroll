'use strict';

(function (root) {
  const FIELDS = {
    customers: [
      ['name', 'Name'],
      ['company', 'Company'],
      ['email', 'Email'],
      ['phone', 'Phone'],
      ['address', 'Address'],
      ['balance', 'Balance']
    ],
    vendors: [
      ['name', 'Vendor'],
      ['company', 'Company'],
      ['email', 'Email'],
      ['phone', 'Phone'],
      ['balance', 'Balance']
    ],
    employees: [
      ['firstName', 'First name'],
      ['lastName', 'Last name'],
      ['name', 'Full name'],
      ['ssn', 'SSN (optional)'],
      ['hireDate', 'Hire date'],
      ['rate', 'Pay rate']
    ],
    items: [
      ['partNumber', 'Item'],
      ['qty', 'Qty'],
      ['cost', 'Cost'],
      ['sellPrice', 'Price']
    ],
    paychecks: [
      ['name', 'Employee'],
      ['payday', 'Date'],
      ['checkNumber', 'Check'],
      ['hours', 'Hours'],
      ['gross', 'Gross'],
      ['federal', 'FIT'],
      ['ss', 'SS'],
      ['medicare', 'Medicare'],
      ['state', 'VA'],
      ['net', 'Net']
    ],
    open_invoices: [
      ['name', 'Customer'],
      ['payday', 'Date'],
      ['checkNumber', 'Number'],
      ['gross', 'Amount']
    ],
    bills: [
      ['name', 'Vendor'],
      ['payday', 'Date'],
      ['checkNumber', 'Number'],
      ['gross', 'Amount']
    ],
    transactions: [
      ['payday', 'Date'],
      ['name', 'Name'],
      ['checkNumber', 'Num'],
      ['gross', 'Amount'],
      ['address', 'Memo']
    ]
  };

  const ALIASES = {
    name: [
      'name',
      'customer',
      'customer name',
      'customer full name',
      'display name',
      'vendor',
      'vendor name',
      'vendor full name',
      'full name',
      'employee',
      'employee name',
      'payee'
    ],
    company: ['company', 'company name', 'business name'],
    firstName: ['first', 'first name', 'firstname', 'given name'],
    lastName: ['last', 'last name', 'lastname', 'surname'],
    phone: ['phone', 'telephone', 'mobile', 'cell', 'main phone'],
    email: ['email', 'e mail', 'e-mail', 'main email'],
    address: ['address', 'bill address', 'billing address', 'main address', 'bill to'],
    ssn: ['ssn', 'social security', 'social security number'],
    hireDate: ['hire', 'hire date', 'hired', 'date hired'],
    rate: ['pay', 'pay rate', 'rate', 'hourly', 'salary'],
    partNumber: ['item', 'item name', 'item number', 'part', 'part number', 'sku', 'inventory item'],
    qty: ['qty', 'quantity', 'on hand', 'qoh'],
    cost: ['cost', 'unit cost', 'avg cost', 'average cost'],
    sellPrice: ['price', 'sales price', 'sell', 'unit price'],
    payday: ['date', 'pay date', 'payday', 'check date', 'txn date', 'transaction date'],
    checkNumber: ['check', 'check no', 'check number', 'num', 'number', 'doc number', 'ref'],
    hours: ['hours', 'total hours', 'hrs'],
    gross: ['gross', 'gross pay', 'amount', 'total', 'total pay'],
    federal: ['fit', 'federal', 'federal income tax', 'fed'],
    ss: ['ss', 'social security', 'oasdi'],
    medicare: ['medicare', 'med'],
    state: ['va', 'virginia', 'state tax', 'swh'],
    net: ['net', 'net pay', 'check amount'],
    balance: ['balance', 'open balance', 'current balance']
  };

  function normKey(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function isBrandText(s) {
    const n = normKey(s);
    if (!n) return false;
    if (n === 'moores' || n === 'moore' || n === 'moores body shop') return true;
    return /\bmoores?\b/.test(n) && /\b(body|shop|mechanical|payroll|books)\b/.test(n);
  }

  function headerMatches(headerNorm, alias) {
    const h = normKey(headerNorm);
    const a = normKey(alias);
    if (!h || !a || isBrandText(h)) return false;
    if (h === a) return true;
    const words = h.split(' ').filter(Boolean);
    const awords = a.split(' ').filter(Boolean);
    if (awords.length === 1) return awords[0].length >= 3 && words.includes(awords[0]);
    return h === a || h.endsWith(' ' + a) || h.startsWith(a + ' ') || words.join(' ') === a;
  }

  function guessColumnMapping(kind, headers) {
    const fields = FIELDS[kind] || [];
    const mapping = {};
    const used = new Set();
    for (const h of headers || []) {
      mapping[h] = '';
      if (isBrandText(h)) continue;
      for (const [field] of fields) {
        if (used.has(field)) continue;
        const aliases = ALIASES[field] || [field];
        if (aliases.some((a) => headerMatches(h, a))) {
          mapping[h] = field;
          used.add(field);
          break;
        }
      }
    }
    return mapping;
  }

  function invertMapping(columnMapping) {
    const fieldMap = {};
    Object.keys(columnMapping || {}).forEach((header) => {
      const field = columnMapping[header];
      if (field && !fieldMap[field]) fieldMap[field] = header;
    });
    return fieldMap;
  }

  function cell(row, mapping, field) {
    const key = mapping && mapping[field];
    if (!key) return '';
    return row && row[key] != null ? String(row[key]).trim() : '';
  }

  function money(n) {
    const x = Number(String(n || '').replace(/[$,()]/g, (ch) => (ch === '(' ? '-' : '')));
    return Number.isFinite(x) ? Math.round(x * 100) / 100 : 0;
  }

  function normName(s) {
    return String(s || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function splitName(full) {
    const parts = String(full || '').trim().split(/\s+/);
    if (parts.length === 0) return { firstName: '', lastName: '' };
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
  }

  function empName(emp) {
    return [emp.firstName, emp.middleInitial, emp.lastName].filter(Boolean).join(' ');
  }

  function matchEmployee(employees, name) {
    const n = normName(name);
    if (!n) return null;
    return (
      (employees || []).find((e) => normName(empName(e)) === n) ||
      (employees || []).find((e) => normName(`${e.lastName}, ${e.firstName}`) === n) ||
      (employees || []).find((e) => normName(`${e.lastName} ${e.firstName}`) === n) ||
      null
    );
  }

  function partyName(row, mapping) {
    return cell(row, mapping, 'name') || cell(row, mapping, 'company');
  }

  function classifyRow(kind, row, mapping, books, employees, replaceDupes) {
    if (kind === 'customers' || kind === 'vendors') {
      const name = partyName(row, mapping);
      if (!name) return { status: 'error', reason: 'Missing name' };
      const list = (books && books[kind]) || [];
      const exists = list.some((c) => normName(c.name) === normName(name));
      if (exists && !replaceDupes) return { status: 'skip', reason: 'Already in list', name };
      return { status: exists ? 'update' : 'import', name };
    }
    if (kind === 'employees') {
      const full = cell(row, mapping, 'name');
      let first = cell(row, mapping, 'firstName');
      let last = cell(row, mapping, 'lastName');
      if (!first && !last && full) {
        const split = splitName(full);
        first = split.firstName;
        last = split.lastName;
      }
      if (!first && !last) return { status: 'error', reason: 'Missing first/last name' };
      const name = [first, last].filter(Boolean).join(' ');
      const exists = Boolean(matchEmployee(employees, name) || matchEmployee(employees, full));
      if (exists && !replaceDupes) return { status: 'skip', reason: 'Employee already exists', name };
      return { status: exists ? 'update' : 'import', name };
    }
    if (kind === 'items') {
      const pn = cell(row, mapping, 'partNumber') || cell(row, mapping, 'description');
      if (!pn) return { status: 'error', reason: 'Missing item' };
      const B = root.MooresBooks;
      const exists = B && B.findPart ? Boolean(B.findPart(books || { inventory: [] }, pn)) : false;
      if (exists && !replaceDupes) return { status: 'skip', reason: 'Item already in inventory', name: pn };
      return { status: exists ? 'update' : 'import', name: pn };
    }
    if (kind === 'paychecks') {
      const name = cell(row, mapping, 'name');
      const payday = cell(row, mapping, 'payday');
      if (!name) return { status: 'error', reason: 'Missing employee name' };
      if (!payday) return { status: 'error', reason: 'Missing pay date', name };
      const emp = matchEmployee(employees, name);
      if (!emp) return { status: 'error', reason: 'No matching employee', name };
      const checkNumber = cell(row, mapping, 'checkNumber');
      const dup = (emp.payweeks || []).some(
        (w) => String(w.payday || w.periodEnd) === payday && String(w.checkNumber || '') === checkNumber
      );
      if (dup && !replaceDupes) return { status: 'skip', reason: 'Duplicate paycheck', name: `${name} ${payday}` };
      return { status: dup ? 'update' : 'import', name };
    }
    if (kind === 'open_invoices' || kind === 'bills') {
      const name = partyName(row, mapping);
      const amt = money(cell(row, mapping, 'gross'));
      if (!name) return { status: 'error', reason: 'Missing name' };
      if (!amt) return { status: 'error', reason: 'Missing amount', name };
      return { status: 'import', name };
    }
    if (kind === 'transactions') {
      const amt = money(cell(row, mapping, 'gross'));
      if (!amt) return { status: 'error', reason: 'Missing amount' };
      return { status: 'import', name: partyName(row, mapping) };
    }
    return { status: 'error', reason: 'Unknown import type' };
  }

  function previewRows(kind, rows, mapping, books, employees, replaceDupes, limit) {
    const cap = limit || 20;
    const out = [];
    let valid = 0;
    for (let i = 0; i < (rows || []).length; i++) {
      const cls = classifyRow(kind, rows[i], mapping, books, employees, replaceDupes);
      if (cls.status === 'import' || cls.status === 'update') valid += 1;
      if (out.length < cap) {
        out.push({
          index: i + 1,
          status: cls.status,
          reason: cls.reason || '',
          name: cls.name || partyName(rows[i], mapping),
          values: Object.fromEntries((FIELDS[kind] || []).map(([k]) => [k, cell(rows[i], mapping, k)]))
        });
      }
    }
    return { rows: out, valid, total: (rows || []).length };
  }

  function uniqueNamesFromRows(rows, mapping) {
    const seen = new Set();
    const names = [];
    for (const row of rows || []) {
      const name = partyName(row, mapping);
      const key = normName(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
    return names;
  }

  function resolveFieldMap(mapping, columnMapping) {
    const src = columnMapping || mapping || {};
    const fieldKeys = new Set();
    Object.keys(FIELDS).forEach((k) => FIELDS[k].forEach(([id]) => fieldKeys.add(id)));
    const vals = Object.values(src).filter(Boolean);
    if (vals.some((v) => fieldKeys.has(v))) return invertMapping(src);
    return src;
  }

  function applyImport({ kind, rows, mapping, columnMapping, replaceDupes, books, employees, uid, looksLikeRegister, expert, onProgress }) {
    const fieldMap = resolveFieldMap(mapping, columnMapping);
    const log = { imported: 0, skipped: 0, errors: [], notes: [] };
    const B = root.MooresBooks;
    const nextBooks = books || { customers: [], vendors: [], inventory: [], receipts: [], bills: [] };
    const nextEmployees = employees || [];

    function skip(reason, detail) {
      log.skipped += 1;
      log.errors.push(detail ? `${reason}: ${detail}` : reason);
    }

    function progress(i, n) {
      if (typeof onProgress === 'function') onProgress(i, n);
    }

    if (kind === 'transactions' && !expert) {
      return {
        ok: false,
        log: {
          imported: 0,
          skipped: 0,
          errors: [],
          notes: ['Transaction posting is Expert mode only. Switch to Expert, or import Customers / Vendors / Open invoices / Bills instead.']
        },
        books: nextBooks,
        employees: nextEmployees
      };
    }

    const list = rows || [];
    const useUniqueNames = looksLikeRegister && (kind === 'customers' || kind === 'vendors');
    if (looksLikeRegister && (kind === 'customers' || kind === 'vendors')) {
      log.notes.push('This file looks like a transaction register. Unique names will be imported as ' + kind + ' — journal lines are not posted.');
    }

    if (useUniqueNames) {
      const names = uniqueNamesFromRows(list, fieldMap);
      const key = kind;
      if (!nextBooks[key]) nextBooks[key] = [];
      names.forEach((name, i) => {
        const existing = nextBooks[key].find((c) => normName(c.name) === normName(name));
        if (existing && !replaceDupes) skip('Already in list', name);
        else if (existing) {
          log.imported += 1;
        } else {
          nextBooks[key].push({
            id: uid(kind === 'vendors' ? 'vend' : 'cust'),
            name,
            phone: '',
            email: '',
            address: '',
            terms: 'Due on receipt'
          });
          log.imported += 1;
        }
        if (i % 100 === 0) progress(i + 1, names.length);
      });
      progress(names.length, names.length);
      return { ok: true, log, books: nextBooks, employees: nextEmployees };
    }

    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      try {
        if (kind === 'customers' || kind === 'vendors') {
          const name = partyName(row, fieldMap);
          if (!name) {
            skip('Missing name', `row ${i + 1}`);
          } else {
            const existing = (nextBooks[kind] || []).find((c) => normName(c.name) === normName(name));
            if (existing && !replaceDupes) skip('Already in list', name);
            else {
              const rec = {
                id: existing ? existing.id : uid(kind === 'vendors' ? 'vend' : 'cust'),
                name,
                company: cell(row, fieldMap, 'company'),
                phone: cell(row, fieldMap, 'phone'),
                email: cell(row, fieldMap, 'email'),
                address: cell(row, fieldMap, 'address'),
                balance: money(cell(row, fieldMap, 'balance')),
                terms: existing && existing.terms ? existing.terms : 'Due on receipt'
              };
              if (existing) Object.assign(existing, rec);
              else {
                if (!nextBooks[kind]) nextBooks[kind] = [];
                nextBooks[kind].push(rec);
              }
              log.imported += 1;
            }
          }
        } else if (kind === 'items') {
          const pn = cell(row, fieldMap, 'partNumber');
          if (!pn) skip('Missing item', `row ${i + 1}`);
          else {
            const existing = B && B.findPart ? B.findPart(nextBooks, pn) : null;
            if (existing && !replaceDupes) skip('Item already in inventory', pn);
            else {
              const qty = money(cell(row, fieldMap, 'qty'));
              const cost = money(cell(row, fieldMap, 'cost'));
              const sell = money(cell(row, fieldMap, 'sellPrice'));
              const today = B && B.todayIso ? B.todayIso() : '';
              if (!existing) {
                const item = {
                  id: uid('part'),
                  partNumber: pn,
                  description: pn,
                  sellPrice: sell,
                  layers: [],
                  history: []
                };
                if (qty > 0) {
                  item.layers.push({ qty, cost, date: today, source: 'qb-import' });
                  item.history.push({
                    date: today,
                    type: 'receive',
                    qty,
                    cost: Math.round(qty * cost * 100) / 100,
                    ref: 'QuickBooks import',
                    receiptNo: ''
                  });
                }
                nextBooks.inventory = nextBooks.inventory || [];
                nextBooks.inventory.push(item);
              } else {
                if (sell) existing.sellPrice = sell;
                if (qty > 0) existing.layers = [{ qty, cost, date: today, source: 'qb-import' }];
              }
              log.imported += 1;
            }
          }
        } else if (kind === 'employees') {
          const full = cell(row, fieldMap, 'name');
          let first = cell(row, fieldMap, 'firstName');
          let last = cell(row, fieldMap, 'lastName');
          if (!first && !last && full) {
            const split = splitName(full);
            first = split.firstName;
            last = split.lastName;
          }
          if (!first && !last) skip('Missing first/last name', `row ${i + 1}`);
          else {
            const name = [first, last].filter(Boolean).join(' ');
            const existing = matchEmployee(nextEmployees, name) || matchEmployee(nextEmployees, full);
            if (existing && !replaceDupes) skip('Employee already exists', name);
            else if (existing) {
              const ssnRaw = cell(row, fieldMap, 'ssn').replace(/\D/g, '').slice(0, 9);
              if (cell(row, fieldMap, 'hireDate')) existing.hireDate = cell(row, fieldMap, 'hireDate');
              if (ssnRaw) existing.ssn = ssnRaw;
              const rateRaw = cell(row, fieldMap, 'rate');
              if (rateRaw !== '') existing.rate = money(rateRaw);
              log.imported += 1;
            } else {
              nextEmployees.push({
                id: uid('emp'),
                firstName: first,
                lastName: last,
                middleInitial: '',
                ssn: cell(row, fieldMap, 'ssn').replace(/\D/g, '').slice(0, 9),
                hireDate: cell(row, fieldMap, 'hireDate'),
                address: { street: '', city: '', state: 'VA', zip: '' },
                jobTitle: '',
                status: 'Active',
                payType: 'hourly',
                rate: cell(row, fieldMap, 'rate') === '' ? '' : money(cell(row, fieldMap, 'rate')),
                payFrequency: 'weekly',
                filingStatus: 'single',
                deductions: [],
                payweeks: []
              });
              log.imported += 1;
            }
          }
        } else if (kind === 'paychecks') {
          const name = cell(row, fieldMap, 'name');
          const payday = cell(row, fieldMap, 'payday');
          if (!name) skip('Missing employee name', `row ${i + 1}`);
          else if (!payday) skip('Missing pay date', name);
          else {
            const emp = matchEmployee(nextEmployees, name);
            if (!emp) skip('No matching employee', name);
            else {
              const checkNumber = cell(row, fieldMap, 'checkNumber');
              emp.payweeks = emp.payweeks || [];
              const dup = emp.payweeks.find(
                (w) => String(w.payday || w.periodEnd) === payday && String(w.checkNumber || '') === checkNumber
              );
              if (dup && !replaceDupes) skip('Duplicate paycheck', `${name} ${payday} ${checkNumber}`);
              else {
                const rec = {
                  periodStart: '',
                  periodEnd: payday,
                  payday,
                  weekEnding: payday,
                  checkNumber,
                  hours: money(cell(row, fieldMap, 'hours')),
                  gross: money(cell(row, fieldMap, 'gross')),
                  federal: fieldMap.federal ? money(cell(row, fieldMap, 'federal')) : 0,
                  ss: fieldMap.ss ? money(cell(row, fieldMap, 'ss')) : 0,
                  medicare: fieldMap.medicare ? money(cell(row, fieldMap, 'medicare')) : 0,
                  state: fieldMap.state ? money(cell(row, fieldMap, 'state')) : 0,
                  net: fieldMap.net ? money(cell(row, fieldMap, 'net')) : 0,
                  imported: true
                };
                if (dup) Object.assign(dup, rec);
                else emp.payweeks.push(rec);
                log.imported += 1;
              }
            }
          }
        } else if (kind === 'open_invoices') {
          const name = partyName(row, fieldMap);
          const amt = money(cell(row, fieldMap, 'gross'));
          if (!name) skip('Missing customer name', `row ${i + 1}`);
          else if (!amt) skip('Missing amount', name);
          else {
            nextBooks.receipts = nextBooks.receipts || [];
            nextBooks.receipts.push({
              id: uid('rcpt'),
              number: cell(row, fieldMap, 'checkNumber') || `IMP-${i + 1}`,
              date: cell(row, fieldMap, 'payday') || '',
              status: 'finalized',
              customerName: name,
              paymentMethod: 'on_account',
              paymentNote: 'On account',
              lines: [],
              totals: { total: amt },
              balance: amt,
              paid: 0,
              imported: true,
              journalId: ''
            });
            log.imported += 1;
          }
        } else if (kind === 'bills') {
          const name = partyName(row, fieldMap);
          const amt = money(cell(row, fieldMap, 'gross'));
          if (!name) skip('Missing vendor name', `row ${i + 1}`);
          else if (!amt) skip('Missing amount', name);
          else {
            nextBooks.bills = nextBooks.bills || [];
            nextBooks.bills.push({
              id: uid('bill'),
              number: cell(row, fieldMap, 'checkNumber') || `BILL-IMP-${i + 1}`,
              date: cell(row, fieldMap, 'payday') || '',
              dueDate: cell(row, fieldMap, 'payday') || '',
              vendorName: name,
              status: 'draft',
              total: amt,
              balance: amt,
              paid: 0,
              lines: [{ kind: 'expense', account: '6900', desc: 'Imported bill', qty: 1, amount: amt }],
              imported: true
            });
            log.imported += 1;
          }
        } else if (kind === 'transactions') {
          skip('Transaction journal posting is not applied from this row', `row ${i + 1}`);
        } else skip('Unknown import type', `row ${i + 1}`);
      } catch (err) {
        skip('Row failed', `row ${i + 1}: ${err && err.message ? err.message : err}`);
      }
      if (i % 100 === 0) progress(i + 1, list.length);
    }
    progress(list.length, list.length);
    return { ok: true, log, books: nextBooks, employees: nextEmployees };
  }

  const api = {
    FIELDS,
    ALIASES,
    guessColumnMapping,
    invertMapping,
    resolveFieldMap,
    cell,
    applyImport,
    matchEmployee,
    normName,
    previewRows,
    classifyRow,
    uniqueNamesFromRows,
    isBrandText
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MooresImport = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
