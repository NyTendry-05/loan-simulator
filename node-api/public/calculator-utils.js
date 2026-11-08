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
