# Repayment result consistency

This small increment builds on the monthly calculator and annual summaries. It
selectively restores the response reconciliation preserved on November 1, 2026,
while retaining the existing single-payment headline and current browser coverage.

## Behavior

Before an estimate becomes visible or available to download, the browser checks:

- The response's principal, annual interest rate, term and currency precision match
  the submitted scenario. Equivalent decimal spellings compare equally.
- The monthly ledger repays the full principal, and its payment and interest sums
  equal the displayed totals. The stated final payment matches the final ledger row.
- Every non-final instalment matches the quoted regular payment. A single final
  instalment still displays its actual ledger amount, which can differ from the
  regular quote because of currency rounding.
- Metadata, decimal values and the existing monthly ledger remain well-formed.

Amounts are compared and summed with `BigInt` in minor currency units. Rates are
compared exactly to six decimal places. This verifies consistency, not the lending
formula: Spring remains the calculation authority. No dependencies, loan rules,
authentication, database or deployment settings change.

An inconsistent response hides the estimate and both schedule views, keeps the
entered values, announces an error and allows a clean retry. Successful retries
can still switch views and export the selected monthly or annual CSV.

## Verification

From the repository root:

```sh
npm ci --prefix node-api
npm run lint --prefix node-api
npm test --prefix node-api
npm audit --prefix node-api --omit=dev --audit-level=high
sh mvnw --batch-mode --no-transfer-progress verify
cd node-api
npx --no-install playwright install chromium
npx --no-install playwright test simulator.spec.js
```

The unit regressions cover each contradictory summary field, request mismatches,
six-decimal rates, malformed metadata and amounts, exact values beyond binary
floating-point precision, frozen inputs, all supported currency scales, early
payoff and the 1,200-payment limit. Browser regressions cover rejected summaries,
retained inputs, annual export after retry and single-to-monthly headline recovery.

The existing CI workflow also runs Java verification and the PostgreSQL portal
flow. Use successful checks for the exact PR commit as the merge gate. A local
browser launch or dependency-resolution failure is not a passing check.
