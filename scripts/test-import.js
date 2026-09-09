'use strict';

const path = require('path');
const qbParse = require('../src/main/qb-parse');
const Imp = require('../src/renderer/qb-import');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const csv = Buffer.from(
  'Name,Phone,Email\n"Valued Customer","540-555-0100","a@b.com"\nParts Co,540-555-0199,\n',
  'utf8'
);
const table = qbParse.parseTableBuffer('customers.csv', csv);
assert(table.ok, table.message);
assert(table.headers.includes('Name'), 'csv headers');
assert(table.rows.length === 2, `csv rows ${table.rows.length}`);

const mapping = Imp.guessMapping('customers', table.headers);
assert(mapping.name === 'Name', `guess name ${mapping.name}`);

const books = { customers: [{ id: 'cust-valued', name: 'Valued Customer', phone: '', email: '' }], vendors: [], inventory: [] };
const uid = (p) => `${p}-1`;
const skip = Imp.applyImport({
  kind: 'customers',
  rows: table.rows,
  mapping,
  replaceDupes: false,
  books,
  employees: [],
  uid
});
assert(skip.log.skipped === 1, `skip existing ${skip.log.skipped}`);
assert(skip.log.imported === 1, `import new ${skip.log.imported}`);
assert(skip.books.customers.some((c) => c.name === 'Parts Co'), 'new customer');

const qbw = qbParse.parseTableBuffer('company.qbw', Buffer.from('not a zip'));
assert(!qbw.ok && /QBW/i.test(qbw.message), 'reject qbw');

console.log('IMPORT_OK');
