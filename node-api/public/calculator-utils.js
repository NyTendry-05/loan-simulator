/** Format the API's decimal strings without converting monetary values to binary floats. */
export function formatMoney(value, currency, scale) {
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new TypeError('Invalid decimal amount');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > scale) throw new RangeError('Amount exceeds currency precision');
  const formatter = new Intl.NumberFormat('en', { style: 'currency', currency,
    minimumFractionDigits: scale, maximumFractionDigits: scale });
  return formatter.formatToParts(BigInt(whole)).map(part => part.type === 'fraction' ? fraction.padEnd(scale, '0') : part.value).join('');
}

/** A single instalment uses the actual ledger payment, not a rounded recurring quote. */
export function paymentHeadline(result) {
  const single = result.repaymentMonths === 1;
  return { single, amount: single ? result.schedule[0].payment : result.monthlyPayment };
}

// API money stays in decimal strings. Never sum monetary values with Number:
// even a valid large principal can exceed its safe integer precision in cents.
function minorUnits(value, scale) {
  if (typeof value !== 'string' || !/^\d{1,24}(?:\.\d{1,4})?$/.test(value))
    throw new TypeError('Invalid decimal amount');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > scale) throw new RangeError('Amount exceeds currency precision');
  return BigInt(whole + fraction.padEnd(scale, '0'));
}
function decimal(units, scale) {
  const value = units.toString().padStart(scale + 1, '0');
  return scale ? value.slice(0, -scale) + '.' + value.slice(-scale) : value;
}

/** Group a complete ledger into loan years, not calendar/tax years. No recalculation or rounding. */
export function summarizeSchedule(schedule, scale) {
  if (!Number.isInteger(scale) || scale < 0 || scale > 4) throw new RangeError('Invalid currency precision');
  if (!Array.isArray(schedule) || !schedule.length || schedule.length > 1200)
    throw new RangeError('Invalid schedule length');
  const years = [];
  let previousBalance;
  for (const [index, row] of schedule.entries()) {
    if (row?.month !== index + 1) throw new TypeError('Invalid schedule order');
    const payment = minorUnits(row.payment, scale), principal = minorUnits(row.principal, scale);
    const interest = minorUnits(row.interest, scale), balance = minorUnits(row.balance, scale);
    if (payment <= 0n || previousBalance === 0n || payment !== principal + interest
      || (previousBalance !== undefined && previousBalance !== principal + balance))
      throw new RangeError('Schedule amounts do not reconcile');
    if (index % 12 === 0) years.push({ year: years.length + 1, firstMonth: row.month,
      lastMonth: row.month, payment: 0n, principal: 0n, interest: 0n, balance });
    const year = years.at(-1);
    year.lastMonth = row.month; year.payment += payment; year.principal += principal;
    year.interest += interest; year.balance = balance;
    previousBalance = balance;
  }
  if (previousBalance !== 0n) throw new RangeError('Schedule does not repay the balance');
  return years.map(year => ({ ...year, payment: decimal(year.payment, scale),
    principal: decimal(year.principal, scale), interest: decimal(year.interest, scale), balance: decimal(year.balance, scale) }));
}

/** Export exact amounts, with explicit payment-month ranges for partial loan years. */
export function scheduleToCsv(schedule, currency, scale, frequency = 'monthly') {
  if (!/^[A-Z]{3}$/.test(currency)) throw new TypeError('Invalid currency');
  if (!['monthly', 'annual'].includes(frequency)) throw new TypeError('Invalid schedule frequency');
  const annual = summarizeSchedule(schedule, scale); // Also validates all exported cells.
  const yearly = frequency === 'annual';
  const rows = [[...(yearly ? ['Loan year', 'First payment month', 'Last payment month'] : ['Month']),
    'Payment (' + currency + ')', 'Principal (' + currency + ')', 'Interest (' + currency + ')', 'Balance (' + currency + ')'],
  ...(yearly ? annual : schedule).map(row => [...(yearly ? [row.year, row.firstMonth, row.lastMonth] : [row.month]),
    row.payment, row.principal, row.interest, row.balance])];
  return rows.map(row => row.join(',')).join('\r\n') + '\r\n';
}
