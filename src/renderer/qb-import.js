'use strict';

(function (root) {
  const FIELDS = {
    customers: [
      ['name', 'Name'],
      ['phone', 'Phone'],
      ['email', 'Email'],
      ['address', 'Address']
    ],
    vendors: [
      ['name', 'Name'],
      ['phone', 'Phone'],
      ['email', 'Email'],
      ['address', 'Address']
    ],
    employees: [
      ['name', 'Full name'],
      ['firstName', 'First name'],
      ['lastName', 'Last name'],
      ['ssn', 'SSN'],
      ['hireDate', 'Hire date'],
      ['street', 'Street'],
      ['city', 'City'],
      ['state', 'State'],
      ['zip', 'ZIP'],
      ['rate', 'Pay rate'],
      ['jobTitle', 'Job title']
    ],
    items: [
      ['partNumber', 'Part # / Item'],
      ['description', 'Description'],
      ['qty', 'Quantity'],
      ['cost', 'Cost'],
      ['sellPrice', 'Price']
    ],
    paychecks: [
      ['name', 'Employee name'],
      ['payday', 'Pay date'],
      ['periodStart', 'Period start'],
      ['periodEnd', 'Period end'],
      ['checkNumber', 'Check no'],
      ['hours', 'Hours'],
      ['gross', 'Gross'],
      ['federal', 'FIT'],
      ['ss', 'Social Security'],
      ['medicare', 'Medicare'],
      ['state', 'VA tax'],
      ['net', 'Net'],
      ['childSupport', 'Child support'],
      ['garnishments', 'Garnishment']
    ]
  };

  const ALIASES = {
    name: ['name', 'customer', 'customer name', 'vendor', 'vendor name', 'full name', 'employee', 'employee name', 'payee'],
    firstName: ['first', 'first name', 'firstname', 'given name'],
    lastName: ['last', 'last name', 'lastname', 'surname'],
    phone: ['phone', 'telephone', 'mobile', 'cell'],
    email: ['email', 'e-mail'],
    address: ['address', 'bill address', 'main address'],
    ssn: ['ssn', 'social security', 'social security number', 'ss#'],
    hireDate: ['hire date', 'hired', 'date hired', 'start date'],
    street: ['street', 'address 1', 'addr1', 'address1'],
    city: ['city'],
    state: ['state', 'st'],
    zip: ['zip', 'zip code', 'postal'],
    rate: ['rate', 'pay rate', 'hourly', 'salary'],
    jobTitle: ['title', 'job title', 'position'],
    partNumber: ['part', 'part #', 'item', 'item name', 'item number', 'sku', 'inventory item'],
    description: ['description', 'desc', 'memo'],
    qty: ['qty', 'quantity', 'on hand', 'qoh'],
    cost: ['cost', 'unit cost', 'avg cost', 'average cost'],
    sellPrice: ['price', 'sales price', 'sell', 'unit price'],
    payday: ['pay date', 'payday', 'check date', 'date'],
    periodStart: ['period start', 'from', 'start date', 'week start'],
    periodEnd: ['period end', 'to', 'end date', 'week ending', 'period ending'],
    checkNumber: ['check no', 'check number', 'check #', 'chk', 'doc number', 'num'],
    hours: ['hours', 'total hours', 'hrs'],
    gross: ['gross', 'gross pay', 'total pay'],
    federal: ['fit', 'federal', 'federal income tax', 'fed'],
    ss: ['ss', 'social security', 'oasdi', 'fica ss'],
    medicare: ['medicare', 'med', 'fica med'],
    state: ['va', 'virginia', 'state', 'state tax', 'swh'],
    net: ['net', 'net pay', 'check amount'],
    childSupport: ['child support', 'cs'],
    garnishments: ['garnishment', 'garnish', 'levy']
  };

  function normKey(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function guessMapping(kind, headers) {
    const fields = FIELDS[kind] || [];
    const mapping = {};
    const used = new Set();
    for (const [field] of fields) {
      const aliases = ALIASES[field] || [field];
      const hit = (headers || []).find((h) => {
        const n = normKey(h);
        if (used.has(h)) return false;
        return aliases.some((a) => n === a || n.includes(a));
      });
      mapping[field] = hit || '';
      if (hit) used.add(hit);
    }
    return mapping;
  }

  function cell(row, mapping, field) {
    const key = mapping && mapping[field];
    if (!key) return '';
    return row && row[key] != null ? String(row[key]).trim() : '';
  }

  function money(n) {
    const x = Number(String(n || '').replace(/[$,]/g, ''));
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

  function applyImport({ kind, rows, mapping, replaceDupes, books, employees, uid }) {
    const log = { imported: 0, skipped: 0, errors: [], notes: [] };
    const B = root.MooresBooks;
    let nextBooks = books;
    const nextEmployees = employees || [];

    function skip(reason, row) {
      log.skipped += 1;
      log.errors.push(`${reason}${row && row.name ? ` (${row.name})` : ''}`);
    }

    if (kind === 'customers' || kind === 'vendors') {
      const listKey = kind;
      if (!nextBooks[listKey]) nextBooks[listKey] = [];
      for (const row of rows || []) {
        const name = cell(row, mapping, 'name');
        if (!name) {
          skip('Missing name');
          continue;
        }
        const existing = nextBooks[listKey].find((c) => normName(c.name) === normName(name));
        if (existing && !replaceDupes) {
          skip('Already in list', { name });
          continue;
        }
        const rec = {
          id: existing ? existing.id : uid(kind === 'vendors' ? 'vend' : 'cust'),
          name,
          phone: cell(row, mapping, 'phone'),
          email: cell(row, mapping, 'email'),
          address: cell(row, mapping, 'address'),
          terms: existing && existing.terms ? existing.terms : 'Due on receipt'
        };
        if (existing) Object.assign(existing, rec);
        else nextBooks[listKey].push(rec);
        log.imported += 1;
      }
    } else if (kind === 'items') {
      const today = B && B.todayIso ? B.todayIso() : '';
      for (const row of rows || []) {
        const pn = cell(row, mapping, 'partNumber') || cell(row, mapping, 'description');
        if (!pn) {
          skip('Missing item name');
          continue;
        }
        const existing = B.findPart(nextBooks, pn);
        if (existing && !replaceDupes) {
          skip('Item already in inventory', { name: pn });
          continue;
        }
        const qty = money(cell(row, mapping, 'qty'));
        const cost = money(cell(row, mapping, 'cost'));
        const sell = money(cell(row, mapping, 'sellPrice'));
        const desc = cell(row, mapping, 'description') || pn;
        if (!existing) {
          const item = {
            id: uid('part'),
            partNumber: pn,
            description: desc,
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
          nextBooks.inventory.push(item);
        } else {
          existing.description = desc || existing.description;
          if (sell) existing.sellPrice = sell;
          if (qty > 0) {
            existing.layers = [{ qty, cost, date: today, source: 'qb-import' }];
          }
        }
        log.imported += 1;
      }
    } else if (kind === 'employees') {
      for (const row of rows || []) {
        const full = cell(row, mapping, 'name');
        let first = cell(row, mapping, 'firstName');
        let last = cell(row, mapping, 'lastName');
        if (!first && !last && full) {
          const split = splitName(full);
          first = split.firstName;
          last = split.lastName;
        }
        if (!first && !last) {
          skip('Missing employee name');
          continue;
        }
        const name = [first, last].filter(Boolean).join(' ');
        const existing = matchEmployee(nextEmployees, name) || matchEmployee(nextEmployees, full);
        if (existing && !replaceDupes) {
          skip('Employee already exists', { name });
          continue;
        }
        const ssnRaw = cell(row, mapping, 'ssn').replace(/\D/g, '').slice(0, 9);
        const rateRaw = cell(row, mapping, 'rate');
        if (existing) {
          if (cell(row, mapping, 'hireDate')) existing.hireDate = cell(row, mapping, 'hireDate');
          if (cell(row, mapping, 'jobTitle')) existing.jobTitle = cell(row, mapping, 'jobTitle');
          if (cell(row, mapping, 'street')) {
            existing.address = existing.address || {};
            existing.address.street = cell(row, mapping, 'street');
          }
          if (cell(row, mapping, 'city')) existing.address.city = cell(row, mapping, 'city');
          if (cell(row, mapping, 'state')) existing.address.state = cell(row, mapping, 'state');
          if (cell(row, mapping, 'zip')) existing.address.zip = cell(row, mapping, 'zip');
          if (ssnRaw) existing.ssn = ssnRaw;
          if (rateRaw !== '') existing.rate = money(rateRaw);
          log.imported += 1;
          continue;
        }
        const emp = {
          id: uid('emp'),
          firstName: first,
          lastName: last,
          middleInitial: '',
          ssn: ssnRaw,
          hireDate: cell(row, mapping, 'hireDate'),
          address: {
            street: cell(row, mapping, 'street'),
            city: cell(row, mapping, 'city'),
            state: cell(row, mapping, 'state') || 'VA',
            zip: cell(row, mapping, 'zip')
          },
          jobTitle: cell(row, mapping, 'jobTitle'),
          status: 'Active',
          payType: 'hourly',
          rate: rateRaw === '' ? '' : money(rateRaw),
          payFrequency: 'weekly',
          filingStatus: 'single',
          deductions: [],
          payweeks: []
        };
        nextEmployees.push(emp);
        log.imported += 1;
      }
    } else if (kind === 'paychecks') {
      const mappedTax = ['federal', 'ss', 'medicare', 'state'].filter((f) => mapping[f]);
      if (!mappedTax.length) {
        log.notes.push('No tax columns mapped. Amounts were not calculated — stored as 0.');
      }
      for (const row of rows || []) {
        const name = cell(row, mapping, 'name');
        const emp = matchEmployee(nextEmployees, name);
        if (!emp) {
          skip('No matching employee', { name });
          continue;
        }
        const payday = cell(row, mapping, 'payday');
        const checkNumber = cell(row, mapping, 'checkNumber');
        if (!payday) {
          skip('Missing pay date', { name });
          continue;
        }
        emp.payweeks = emp.payweeks || [];
        const dup = emp.payweeks.find(
          (w) => String(w.payday || w.periodEnd) === payday && String(w.checkNumber || '') === checkNumber
        );
        if (dup && !replaceDupes) {
          skip('Duplicate paycheck', { name: `${name} ${payday} ${checkNumber}` });
          continue;
        }
        const rec = {
          periodStart: cell(row, mapping, 'periodStart'),
          periodEnd: cell(row, mapping, 'periodEnd') || payday,
          payday,
          weekEnding: cell(row, mapping, 'periodEnd') || payday,
          checkNumber,
          hours: money(cell(row, mapping, 'hours')),
          gross: money(cell(row, mapping, 'gross')),
          federal: mapping.federal ? money(cell(row, mapping, 'federal')) : 0,
          ss: mapping.ss ? money(cell(row, mapping, 'ss')) : 0,
          medicare: mapping.medicare ? money(cell(row, mapping, 'medicare')) : 0,
          state: mapping.state ? money(cell(row, mapping, 'state')) : 0,
          net: mapping.net ? money(cell(row, mapping, 'net')) : 0,
          childSupport: mapping.childSupport ? money(cell(row, mapping, 'childSupport')) : 0,
          garnishments: mapping.garnishments ? money(cell(row, mapping, 'garnishments')) : 0,
          imported: true
        };
        if (dup && replaceDupes) Object.assign(dup, rec);
        else emp.payweeks.push(rec);
        log.imported += 1;
      }
    } else {
      log.errors.push('Unknown import type.');
    }

    return { ok: true, log, books: nextBooks, employees: nextEmployees };
  }

  const api = { FIELDS, ALIASES, guessMapping, cell, applyImport, matchEmployee, normName };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MooresImport = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
