'use strict';

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

const colMap = Imp.guessColumnMapping('customers', table.headers);
assert(colMap.Name === 'name', `colmap Name ${colMap.Name}`);
assert(colMap.Phone === 'phone', `colmap Phone ${colMap.Phone}`);
assert(!Object.values(colMap).some((v) => /moore/i.test(v)), 'destinations are not Moores');

const books = { customers: [{ id: 'cust-valued', name: 'Valued Customer', phone: '', email: '' }], vendors: [], inventory: [] };
const uid = (p) => `${p}-${Math.random().toString(36).slice(2, 6)}`;
const skip = Imp.applyImport({
  kind: 'customers',
  rows: table.rows,
  columnMapping: colMap,
  replaceDupes: false,
  books,
  employees: [],
  uid
});
assert(skip.log.skipped === 1, `skip existing ${skip.log.skipped}`);
assert(skip.log.imported === 1, `import new ${skip.log.imported}`);
assert(skip.books.customers.some((c) => c.name === 'Parts Co'), 'new customer');

const titled = Buffer.from(
  "Moore's Body Shop\nCustomer Contact List\nCustomer Full Name,Company,Email,Phone,Bill Address,Balance\n" +
    'Ann Adams,Adams LLC,ann@a.com,540-111-1111,1 Main,10\n' +
    'Bob Baker,Baker Inc,bob@b.com,540-222-2222,2 Oak,0\n' +
    'Cara Cole,,cara@c.com,,3 Pine,5\n',
  'utf8'
);
const titledTable = qbParse.parseTableBuffer('customers.csv', titled);
assert(titledTable.headers.includes('Customer Full Name'), `headers ${titledTable.headers.join('|')}`);
assert(!titledTable.headers.some((h) => /moore/i.test(h) && /body|shop/i.test(h)), 'title row not used as header');
assert(titledTable.rows.length === 3, `titled rows ${titledTable.rows.length}`);
const titledMap = Imp.guessColumnMapping('customers', titledTable.headers);
assert(titledMap['Customer Full Name'] === 'name', `mapped customer name ${titledMap['Customer Full Name']}`);
assert(titledMap.Email === 'email', 'email mapped');
assert(titledMap.Company === 'company', 'company mapped');
const titledImp = Imp.applyImport({
  kind: 'customers',
  rows: titledTable.rows,
  columnMapping: titledMap,
  replaceDupes: false,
  books: { customers: [], vendors: [], inventory: [] },
  employees: [],
  uid
});
assert(titledImp.log.imported === 3, `imported ${titledImp.log.imported} of 3`);

const skipCol = { ...titledMap, Phone: '' };
const skipImp = Imp.applyImport({
  kind: 'customers',
  rows: titledTable.rows,
  columnMapping: skipCol,
  replaceDupes: false,
  books: { customers: [], vendors: [], inventory: [] },
  employees: [],
  uid
});
assert(skipImp.log.imported === 3, `skip phone still imports ${skipImp.log.imported}`);

const register = Buffer.from(
  'Type,Date,Num,Name,Amount,Memo\nInvoice,2026-01-02,1001,Ann Adams,125.00,RO\nPayment,2026-01-03,882,Ann Adams,-125.00,\nBill,2026-01-04,44,Parts Co,80.00,pads\n',
  'utf8'
);
const reg = qbParse.parseTableBuffer('register.csv', register);
assert(reg.looksLikeRegister, 'register detected');
const regMap = Imp.guessColumnMapping('customers', reg.headers);
assert(regMap.Name === 'name', 'register name maps');
const names = Imp.uniqueNamesFromRows(reg.rows, Imp.invertMapping(regMap));
assert(names.length === 2, `unique names ${names.join(',')}`);
const regImp = Imp.applyImport({
  kind: 'customers',
  rows: reg.rows,
  columnMapping: regMap,
  looksLikeRegister: true,
  replaceDupes: false,
  books: { customers: [], vendors: [], inventory: [] },
  employees: [],
  uid
});
assert(regImp.log.imported === 2, `register unique customers ${regImp.log.imported}`);

const qbw = qbParse.parseTableBuffer('company.qbw', Buffer.from('not a zip'));
assert(!qbw.ok && /QBW/i.test(qbw.message), 'reject qbw');

const many = ['Customer,Email'];
for (let i = 0; i < 3600; i++) many.push(`Person ${i},p${i}@x.com`);
const big = qbParse.parseTableBuffer('big.csv', Buffer.from(many.join('\n')));
assert(big.rows.length === 3600, `3600 rows parsed ${big.rows.length}`);
const bigMap = Imp.guessColumnMapping('customers', big.headers);
const bigImp = Imp.applyImport({
  kind: 'customers',
  rows: big.rows,
  columnMapping: bigMap,
  replaceDupes: false,
  books: { customers: [], vendors: [], inventory: [] },
  employees: [],
  uid
});
assert(bigImp.log.imported === 3600, `3600 imported ${bigImp.log.imported}`);

console.log('IMPORT_OK');
