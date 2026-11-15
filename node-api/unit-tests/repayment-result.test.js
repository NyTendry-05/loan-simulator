import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileRepaymentResult, summarizeSchedule, scheduleToCsv } from '../public/calculator-utils.js';

function scenario() {
  const request = { principal: '100', annualInterestRate: '12', termMonths: 2, currencyScale: 2 };
  const data = { ...request, principal: '100.00', annualInterestRate: '12.000000', estimateOnly: true,
    monthlyPayment: '50.76', finalPayment: '50.74', totalInterest: '1.50', totalRepayment: '101.50',
    repaymentMonths: 2, assumptions: ['Illustrative estimate only.'], schedule: [
      { month: 1, payment: '50.76', principal: '49.76', interest: '1.00', balance: '50.24' },
      { month: 2, payment: '50.74', principal: '50.24', interest: '0.50', balance: '0.00' },
    ] };
  return { request, data };
}

test('reconciles header amounts, request and annual summary without recalculating the ledger', () => {
  const { request, data } = scenario();
  assert.deepEqual(reconcileRepaymentResult(data, request).annual, summarizeSchedule(data.schedule, 2));
});

test('rejects each contradictory summary card even when the ledger reconciles', () => {
  for (const key of ['monthlyPayment', 'finalPayment', 'totalInterest', 'totalRepayment']) {
    const { request, data } = scenario(); data[key] = '999.00';
    assert.throws(() => reconcileRepaymentResult(data, request), /reconcile/, key);
  }
});

test('rejects a different principal or interest rate from the submitted scenario', () => {
  for (const key of ['principal', 'annualInterestRate']) {
    const { request, data } = scenario(); data[key] = '99';
    assert.throws(() => reconcileRepaymentResult(data, request), /scenario/, key);
  }
});

test('rejects a complete, internally consistent ledger for a different principal', () => {
  const { request, data } = scenario(); request.principal = data.principal = '101';
  assert.throws(() => reconcileRepaymentResult(data, request), /reconcile/);
});

test('checks sub-cent interest-rate changes exactly without binary floating point', () => {
  const { request, data } = scenario();
  request.annualInterestRate = '0.000001'; data.annualInterestRate = '0.000002';
  assert.throws(() => reconcileRepaymentResult(data, request), /scenario/);
  for (const invalid of ['100.000001', '0.0000001', '1e1', '-1', 12, null]) {
    request.annualInterestRate = data.annualInterestRate = invalid;
    assert.throws(() => reconcileRepaymentResult(data, request));
  }
});

test('accepts equivalent decimal spellings and does not mutate frozen inputs', () => {
  const { request, data } = scenario();
  request.principal = '000100.0'; request.annualInterestRate = '012.0';
  Object.freeze(request); Object.freeze(data.assumptions); data.schedule.forEach(Object.freeze);
  Object.freeze(data.schedule); Object.freeze(data);
  const { annual } = reconcileRepaymentResult(data, request);
  annual[0].payment = 'changed';
  assert.equal(reconcileRepaymentResult(data, request).annual[0].payment, '101.50');
});

test('detects a single minor-unit disagreement beyond Number safe-integer precision', () => {
  const request = { principal: '123456789012345.67', annualInterestRate: '0', termMonths: 1, currencyScale: 2 };
  const data = { ...request, estimateOnly: true, monthlyPayment: request.principal, finalPayment: request.principal,
    totalInterest: '0', totalRepayment: request.principal, repaymentMonths: 1, assumptions: [],
    schedule: [{ month: 1, payment: request.principal, principal: request.principal, interest: '0', balance: '0' }] };
  assert.equal(reconcileRepaymentResult(data, request).annual[0].principal, request.principal);
  data.totalRepayment = '123456789012345.68';
  assert.throws(() => reconcileRepaymentResult(data, request), /reconcile/);
});

test('allows a rounded final payment distinct from the advertised regular payment', () => {
  // One-month loan: regular payment rounds up, while ledger interest uses half-even rounding.
  const request = { principal: '1', annualInterestRate: '6', termMonths: 1, currencyScale: 2 };
  const data = { ...request, estimateOnly: true, monthlyPayment: '1.01', finalPayment: '1.00', totalInterest: '0',
    totalRepayment: '1.00', repaymentMonths: 1, assumptions: [],
    schedule: [{ month: 1, payment: '1.00', principal: '1.00', interest: '0.00', balance: '0.00' }] };
  assert.equal(reconcileRepaymentResult(data, request).annual[0].payment, '1.00');
  assert.equal(reconcileRepaymentResult(data, request).headline.amount, '1.00');
  assert.equal(reconcileRepaymentResult(data, request).headline.single, true);
  data.monthlyPayment = '999.00';
  assert.equal(reconcileRepaymentResult(data, request).headline.amount, '1.00');
});

test('preserves legitimate early payoff at every supported currency precision', () => {
  for (let scale = 0; scale <= 4; scale++) {
    const amount = scale ? '0.' + '0'.repeat(scale - 1) + '1' : '1';
    const request = { principal: amount, annualInterestRate: '0', termMonths: 1200, currencyScale: scale };
    const data = { ...request, estimateOnly: true, monthlyPayment: amount, finalPayment: amount,
      totalInterest: '0', totalRepayment: amount, repaymentMonths: 1, assumptions: [],
      schedule: [{ month: 1, payment: amount, principal: amount, interest: '0', balance: '0' }] };
    assert.equal(reconcileRepaymentResult(data, request).annual[0].principal, amount);
  }
});

test('rejects continued charges after the balance has already been repaid', () => {
  const { request, data } = scenario();
  data.schedule[0] = { month: 1, payment: '100', principal: '100', interest: '0', balance: '0' };
  data.schedule[1] = { month: 2, payment: '1', principal: '0', interest: '1', balance: '0' };
  for (const view of ['monthly', 'annual']) assert.throws(() => scheduleToCsv(data.schedule, 'USD', 2, view), /reconcile/);
  assert.throws(() => reconcileRepaymentResult(data, request), /reconcile/);
});

test('rejects missing and invalid result metadata before rendering', () => {
  const invalidFields = { estimateOnly: [false, 'true', undefined], currencyScale: [0, '2', undefined],
    termMonths: [1, '2', undefined], repaymentMonths: [0, 1, 3, 1.5, '2', undefined],
    assumptions: [null, {}, [1]], schedule: [null, {}, []] };
  for (const [key, values] of Object.entries(invalidFields)) for (const value of values) {
    const { request, data } = scenario(); data[key] = value;
    assert.throws(() => reconcileRepaymentResult(data, request), undefined, key);
  }
  const { request } = scenario();
  for (const data of [null, undefined, {}, []]) assert.throws(() => reconcileRepaymentResult(data, request));
});

test('rejects malformed summary amounts instead of truncating, coercing or rounding', () => {
  for (const key of ['principal', 'monthlyPayment', 'finalPayment', 'totalInterest', 'totalRepayment']) {
    for (const value of ['=1+1', '-1', '1e2', '1.001', '1'.repeat(25), '', 1, null, undefined]) {
      const { request, data } = scenario(); data[key] = value;
      assert.throws(() => reconcileRepaymentResult(data, request), undefined, key + ': ' + value);
    }
  }
});

test('rejects invalid request metadata and nonpositive principal or regular payment', () => {
  for (const [key, values] of Object.entries({ currencyScale: [-1, 5, '2', null], termMonths: [0, 1201, 1.5, '2', null] })) {
    for (const value of values) {
      const { request, data } = scenario(); request[key] = data[key] = value;
      assert.throws(() => reconcileRepaymentResult(data, request));
    }
  }
  for (const key of ['principal', 'monthlyPayment']) {
    const { request, data } = scenario(); request[key] = data[key] = '0';
    assert.throws(() => reconcileRepaymentResult(data, request));
  }
  assert.throws(() => reconcileRepaymentResult(scenario().data, null));
});

test('checks every regular installment, not only the first payment', () => {
  const request = { principal: '6', annualInterestRate: '0', termMonths: 3, currencyScale: 0 };
  const data = { ...request, estimateOnly: true, monthlyPayment: '1', finalPayment: '3',
    totalInterest: '0', totalRepayment: '6', repaymentMonths: 3, assumptions: [], schedule: [
      { month: 1, payment: '1', principal: '1', interest: '0', balance: '5' },
      { month: 2, payment: '2', principal: '2', interest: '0', balance: '3' },
      { month: 3, payment: '3', principal: '3', interest: '0', balance: '0' },
    ] };
  assert.throws(() => reconcileRepaymentResult(data, request), /reconcile/);
});

test('reconciles all 1,200 installments and the full 100-year summary', () => {
  const request = { principal: '1200', annualInterestRate: '0', termMonths: 1200, currencyScale: 0 };
  const data = { ...request, estimateOnly: true, monthlyPayment: '1', finalPayment: '1',
    totalInterest: '0', totalRepayment: '1200', repaymentMonths: 1200, assumptions: [],
    schedule: Array.from({ length: 1200 }, (_, index) => ({ month: index + 1, payment: '1', principal: '1',
      interest: '0', balance: String(1199 - index) })) };
  const validated = reconcileRepaymentResult(data, request);
  assert.equal(validated.annual.length, 100);
  assert.equal(validated.annual.at(-1).balance, '0');
  assert.equal(validated.headline.amount, '1');
  assert.equal(validated.headline.single, false);
});
