import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSchedule, scheduleToCsv } from '../public/calculator-utils.js';

function zeroInterest(months, scale = 2) {
  const amount = value => scale ? value + '.' + '0'.repeat(scale) : String(value);
  return Array.from({ length: months }, (_, i) => ({ month: i + 1, payment: amount(1),
    principal: amount(1), interest: amount(0), balance: amount(months - i - 1) }));
}
const one = () => zeroInterest(1);

test('groups whole and partial loan years and retains the closing balance', () => {
  assert.deepEqual(summarizeSchedule(zeroInterest(25), 2), [
    { year: 1, firstMonth: 1, lastMonth: 12, payment: '12.00', principal: '12.00', interest: '0.00', balance: '13.00' },
    { year: 2, firstMonth: 13, lastMonth: 24, payment: '12.00', principal: '12.00', interest: '0.00', balance: '1.00' },
    { year: 3, firstMonth: 25, lastMonth: 25, payment: '1.00', principal: '1.00', interest: '0.00', balance: '0.00' },
  ]);
});

test('sums interest and principal exactly above Number safe-integer precision', () => {
  const rows = [
    { month: 1, payment: '123456789012345.68', principal: '123456789012345.67', interest: '0.01', balance: '0.01' },
    { month: 2, payment: '0.03', principal: '0.01', interest: '0.02', balance: '0.00' },
  ];
  assert.deepEqual(summarizeSchedule(rows, 2)[0], { year: 1, firstMonth: 1, lastMonth: 2,
    payment: '123456789012345.71', principal: '123456789012345.68', interest: '0.03', balance: '0.00' });
});

test('preserves all supported currency precisions without inventing rounded cents', () => {
  for (let scale = 0; scale <= 4; scale++) {
    const expected = scale ? '12.' + '0'.repeat(scale) : '12';
    assert.equal(summarizeSchedule(zeroInterest(12, scale), scale)[0].payment, expected);
  }
  const tiny = [{ month: 1, payment: '0.0001', principal: '0.0001', interest: '0', balance: '0' }];
  assert.equal(summarizeSchedule(tiny, 4)[0].payment, '0.0001');
});

test('handles the maximum term and an early payoff with no invented empty years', () => {
  const years = summarizeSchedule(zeroInterest(1200), 2);
  assert.equal(years.length, 100);
  assert.equal(years.at(-1).lastMonth, 1200);
  assert.equal(years.at(-1).balance, '0.00');
  assert.equal(summarizeSchedule(one(), 2).length, 1);
});

test('does not mutate frozen source rows or leak references into the summary', () => {
  const rows = Object.freeze(zeroInterest(13).map(Object.freeze));
  const years = summarizeSchedule(rows, 2);
  years[0].payment = 'changed';
  assert.equal(rows[0].payment, '1.00');
  assert.equal(summarizeSchedule(rows, 2)[0].payment, '12.00');
});

test('rejects unsupported scales and oversized or empty schedules', () => {
  for (const scale of [-1, 5, 1.5, '2', null, NaN]) assert.throws(() => summarizeSchedule(one(), scale));
  for (const rows of [[], null, {}, zeroInterest(1201)]) assert.throws(() => summarizeSchedule(rows, 2));
});

test('rejects absent, reordered, duplicated or skipped payment months', () => {
  for (const month of [0, 2, '1', undefined]) assert.throws(() => summarizeSchedule([{ ...one()[0], month }], 2));
  assert.throws(() => summarizeSchedule([null], 2));
  const rows = zeroInterest(2); rows[1].month = 1;
  assert.throws(() => summarizeSchedule(rows, 2));
});

test('rejects unsafe CSV cells, malformed amounts, and excess precision', () => {
  for (const value of ['=1+1', '+1', '-1', '1e2', 'NaN', 'Infinity', '1,000', '1\n2', ' 1', '1.001', '1'.repeat(25), 1, null]) {
    for (const key of ['payment', 'principal', 'interest', 'balance']) {
      assert.throws(() => summarizeSchedule([{ ...one()[0], [key]: value }], 2), key + ': ' + value);
    }
  }
});

test('rejects ledgers with inconsistent payments, balances or an unpaid final balance', () => {
  assert.throws(() => summarizeSchedule([{ ...one()[0], payment: '1.01' }], 2), /reconcile/);
  assert.throws(() => summarizeSchedule([{ ...one()[0], payment: '0', principal: '0' }], 2), /reconcile/);
  const rows = zeroInterest(2); rows[0].balance = '2.00';
  assert.throws(() => summarizeSchedule(rows, 2), /reconcile/);
  assert.throws(() => summarizeSchedule([{ ...one()[0], balance: '1.00' }], 2), /repay/);
});

test('annual CSV includes exact totals, currency and explicit partial-year payment ranges', () => {
  const csv = scheduleToCsv(zeroInterest(13), 'USD', 2, 'annual');
  assert.equal(csv, 'Loan year,First payment month,Last payment month,Payment (USD),Principal (USD),Interest (USD),Balance (USD)\r\n'
    + '1,1,12,12.00,12.00,0.00,1.00\r\n2,13,13,1.00,1.00,0.00,0.00\r\n');
});

test('monthly CSV remains backward compatible and preserves zero-decimal amounts', () => {
  assert.equal(scheduleToCsv(zeroInterest(2, 0), 'JPY', 0),
    'Month,Payment (JPY),Principal (JPY),Interest (JPY),Balance (JPY)\r\n1,1,1,0,1\r\n2,1,1,0,0\r\n');
});

test('CSV rejects injected headers and unknown views', () => {
  for (const currency of ['USD,extra', '=USD', 'usd', '', null]) assert.throws(() => scheduleToCsv(one(), currency, 2));
  assert.throws(() => scheduleToCsv(one(), 'USD', 2, 'quarterly'));
});

test('rejects payments after the balance has already been repaid', () => {
  const rows = [one()[0], { month: 2, payment: '0.01', principal: '0.00', interest: '0.01', balance: '0.00' }];
  assert.throws(() => summarizeSchedule(rows, 2), /reconcile/);
  assert.throws(() => scheduleToCsv(rows, 'USD', 2, 'annual'), /reconcile/);
});
