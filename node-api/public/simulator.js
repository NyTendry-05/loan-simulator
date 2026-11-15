import { formatMoney, reconcileRepaymentResult, scheduleToCsv } from './calculator-utils.js';

const $ = selector => document.querySelector(selector);
const form = $('#simulation-form');
const currencyScales = { USD: 2, EUR: 2, GBP: 2, CAD: 2, AUD: 2, ZAR: 2, JPY: 0 };
const fields = [
  { input: $('#sim-principal'), error: $('#principal-error') },
  { input: $('#sim-rate'), error: $('#rate-error') },
  { input: $('#sim-term'), error: $('#term-error') },
];
let current = null, page = 0, generation = 0, pending;
const pageSize = 12;

function updateInputContext() {
  const currency = $('#sim-currency').value;
  const scale = currencyScales[currency];
  $('#amount-unit').textContent = currency;
  $('#sim-principal').min = scale === 0 ? '1' : '0.01';
  $('#sim-principal').step = scale === 0 ? '1' : '0.01';
  const months = Number($('#sim-term').value);
  const years = Math.floor(months / 12), remainder = months % 12;
  $('#term-help').textContent = Number.isInteger(months) && months > 0 && months <= 1200
    ? [years ? years + (years === 1 ? ' year' : ' years') : '', remainder ? remainder + (remainder === 1 ? ' month' : ' months') : ''].filter(Boolean).join(', ')
    : 'Enter 1–1,200 whole months.';
}
function clearErrors() {
  $('#simulation-error').hidden = true;
  for (const { input, error } of fields) { input.removeAttribute('aria-invalid'); error.hidden = true; }
}
function idle() {
  $('#calculate').disabled = false;
  $('#calculate').innerHTML = 'Calculate repayments <span aria-hidden="true">→</span>';
  $('#simulation-results').setAttribute('aria-busy', 'false');
}
function clearResult(label, message = '') {
  current = null; page = 0;
  $('#result-content').hidden = true; $('#result-placeholder').hidden = false;
  $('#repayment-schedule').hidden = true; $('#result-state').textContent = label;
  $('#calculation-status').textContent = message;
}
function invalidate() {
  generation++; pending?.abort(); pending = null;
  idle(); clearErrors(); updateInputContext();
  clearResult('Ready to calculate', 'Your values have changed. Calculate again to update the estimate.');
}
form.addEventListener('input', invalidate);
form.addEventListener('change', event => { if (event.target.id === 'sim-currency') invalidate(); });

function validate() {
  const principal = $('#sim-principal').value.trim();
  const annualInterestRate = $('#sim-rate').value.trim();
  const term = $('#sim-term').value.trim();
  const currency = $('#sim-currency').value;
  const currencyScale = currencyScales[currency];
  const errors = [];
  if (!/^\d+(?:\.\d+)?$/.test(principal) || Number(principal) <= 0 || Number(principal) > 999999999999.99 || (principal.split('.')[1]?.length ?? 0) > currencyScale) {
    errors[0] = currencyScale === 0
      ? 'Enter a whole amount from 1 to 999,999,999,999 for JPY.'
      : 'Enter an amount from 0.01 to 999,999,999,999.99, with at most 2 decimal places.';
  }
  if (!/^\d+(?:\.\d{1,6})?$/.test(annualInterestRate) || Number(annualInterestRate) > 100) {
    errors[1] = 'Enter a rate from 0 to 100, with at most 6 decimal places.';
  }
  if (!/^\d+$/.test(term) || Number(term) < 1 || Number(term) > 1200) errors[2] = 'Enter a whole number from 1 to 1,200 months.';
  errors.forEach((message, index) => {
    fields[index].input.setAttribute('aria-invalid', 'true');
    fields[index].error.textContent = message; fields[index].error.hidden = false;
  });
  if (errors.length) {
    fields[errors.findIndex(Boolean)].input.focus();
    $('#simulation-error').textContent = 'Check the highlighted fields, then calculate again.';
    $('#simulation-error').hidden = false;
    return null;
  }
  return { currency, body: { principal, annualInterestRate, termMonths: Number(term), currencyScale } };
}
const numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 6 });
function money(value) {
  return formatMoney(value, current.currency, current.body.currencyScale);
}
function renderSchedule() {
  const start = page * pageSize;
  const yearly = $('#schedule-view').value === 'annual';
  const schedule = yearly ? current.annual : current.data.schedule;
  const rows = schedule.slice(start, start + pageSize);
  $('#schedule-period-heading').textContent = yearly ? 'Loan year' : 'Month';
  $('#schedule-caption').textContent = yearly ? 'Estimated annual loan repayment summary' : 'Estimated monthly loan repayment schedule';
  $('#schedule-frequency-note').hidden = !yearly;
  $('#previous-schedule').setAttribute('aria-label', yearly ? 'Previous 12 years' : 'Previous 12 payments');
  $('#next-schedule').setAttribute('aria-label', yearly ? 'Next 12 years' : 'Next 12 payments');
  const fragment = document.createDocumentFragment();
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const key of ['month', 'payment', 'principal', 'interest', 'balance']) {
      const cell = document.createElement(key === 'month' ? 'th' : 'td');
      if (key === 'month') cell.scope = 'row';
      cell.textContent = key === 'month' ? (yearly ? 'Year ' + row.year + ' (months ' + row.firstMonth + '–' + row.lastMonth + ')' : row.month) : money(row[key]);
      tr.append(cell);
    }
    fragment.append(tr);
  }
  $('#schedule-rows').replaceChildren(fragment);
  $('#schedule-page').textContent = (yearly ? 'Years ' : 'Payments ') + (start + 1) + '–' + (start + rows.length) + ' of ' + schedule.length;
  $('#previous-schedule').disabled = page === 0;
  $('#next-schedule').disabled = start + rows.length >= schedule.length;
}
function renderResult(snapshot, data, validated) {
  const { annual, headline } = validated;
  current = { ...snapshot, data, annual }; page = 0;
  $('#payment-heading').textContent = headline.single ? 'Estimated single payment' : 'Estimated monthly payment';
  $('#monthly-payment').textContent = money(headline.amount);
  $('#total-repayment').textContent = money(data.totalRepayment);
  $('#total-interest').textContent = money(data.totalInterest);
  $('#principal-total').textContent = money(data.principal);
  $('#interest-total').textContent = money(data.totalInterest);
  $('#estimate-context').textContent = (headline.single ? '1 payment' : data.repaymentMonths + ' monthly payments') + ' · ' + numberFormat.format(Number(snapshot.body.annualInterestRate)) + '% fixed annual interest · ' + snapshot.currency;
  const share = Number(data.totalInterest) / Number(data.totalRepayment) * 100;
  $('#interest-share').textContent = share.toFixed(1) + '% interest';
  $('#principal-meter').value = 100 - share;
  $('#principal-meter').setAttribute('aria-valuetext', (100 - share).toFixed(1) + '% principal, ' + share.toFixed(1) + '% interest');
  $('#final-payment-note').textContent = 'Final payment: ' + money(data.finalPayment) +
    (data.repaymentMonths < snapshot.body.termMonths ? '. Rounding repays this scenario before the requested ' + snapshot.body.termMonths + ' months.' : '. Rounding is reflected in the schedule below.');
  $('#schedule-description').textContent = money(data.principal) + ' principal · ' + snapshot.currency + ' · ' + numberFormat.format(Number(snapshot.body.annualInterestRate)) + '% fixed annual interest. No fees included.';
  const assumptions = data.assumptions.map(value => { const li = document.createElement('li'); li.textContent = value; return li; });
  $('#calculation-assumptions').replaceChildren(...assumptions);
  renderSchedule();
  $('#result-placeholder').hidden = true; $('#result-content').hidden = false; $('#repayment-schedule').hidden = false;
  $('#result-state').textContent = 'Estimate calculated';
  $('#calculation-status').textContent = 'Estimate ready. ' + money(headline.amount) + (headline.single ? ' in one payment; ' : ' per month; ') + money(data.totalInterest) + ' total interest.';
}
async function calculate() {
  generation++; const requestGeneration = generation;
  pending?.abort(); clearErrors();
  const snapshot = validate(); if (!snapshot) return;
  pending = new AbortController();
  clearResult('Calculating…');
  $('#simulation-results').setAttribute('aria-busy', 'true');
  $('#calculate').disabled = true; $('#calculate').textContent = 'Calculating…';
  $('#calculation-status').textContent = 'Calculating your repayment estimate…';
  try {
    const response = await fetch('/api/v1/simulations/repayment', { method: 'POST', credentials: 'omit',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(snapshot.body),
      signal: AbortSignal.any([pending.signal, AbortSignal.timeout(20000)]) });
    const data = await response.json().catch(() => null);
    if (requestGeneration !== generation) return;
    if (!response.ok) throw new Error(response.status === 429 ? 'Too many calculations. Please wait a minute, then try again.'
      : response.status >= 500 ? 'The calculator is temporarily unavailable. Please try again shortly.'
      : data?.detail ?? 'These values could not be calculated. Check your inputs and try again.');
    let validated;
    try { validated = reconcileRepaymentResult(data, snapshot.body); }
    catch { throw new Error('The calculator returned an incomplete or inconsistent result. Please try again.'); }
    renderResult(snapshot, data, validated);
  } catch (error) {
    if (requestGeneration !== generation) return;
    const message = ['TimeoutError', 'AbortError', 'TypeError'].includes(error.name)
      ? 'We couldn’t reach the calculator. Check your connection and try again.' : error.message;
    $('#simulation-error').textContent = message; $('#simulation-error').hidden = false;
    clearResult('Estimate unavailable', 'No estimate has been generated. Your inputs are still here so you can retry.');
  } finally {
    if (requestGeneration === generation) { pending = null; idle(); }
  }
}
form.addEventListener('submit', event => { event.preventDefault(); calculate(); });
$('#reset-example').addEventListener('click', () => { form.reset(); invalidate(); calculate(); });
$('#schedule-view').addEventListener('change', () => { if (current) { page = 0; renderSchedule(); } });
$('#previous-schedule').addEventListener('click', () => { if (current && page > 0) { page--; renderSchedule(); } });
$('#next-schedule').addEventListener('click', () => { if (current && (page + 1) * pageSize < ($('#schedule-view').value === 'annual' ? current.annual.length : current.data.schedule.length)) { page++; renderSchedule(); } });
$('#download-schedule').addEventListener('click', () => {
  if (!current) return;
  const frequency = $('#schedule-view').value;
  const csv = scheduleToCsv(current.data.schedule, current.currency, current.body.currencyScale, frequency);
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'repayment-simulation-' + (frequency === 'annual' ? 'annual-' : '') + current.currency + '.csv';
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
updateInputContext();
calculate();
