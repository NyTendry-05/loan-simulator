# Annual repayment summary

This increment builds on the public monthly calculator merged in PR #2.
It selectively restores the annual-summary work preserved on October 31, 2026,
while keeping the first release’s actual single-payment display fix.

## Behavior

- Monthly payments remain the default. The schedule selector switches to loan-year
  totals and resets pagination. A loan year is up to 12 payments, not a calendar or
  tax year. Short final years and early payoff are shown without empty years.
- Payment, principal and interest are added in exact integer minor units with
  `BigInt`. No money is summed using floating-point arithmetic. Closing balances
  come from the last monthly payment in each group. Java remains the calculation
  authority; interest and repayments are not recalculated in the browser.
- CSV exports all rows in the selected view, independently of the visible page.
  Annual CSV includes the first and last payment month. Monthly format and filenames
  remain compatible.
- The helper rejects malformed amounts, invalid order, inconsistent monthly rows,
  unpaid balances and payments after payoff before displaying or exporting a ledger.
  This is ledger validation, not full request/response or financial-formula validation.
- Changing inputs removes stale results. Incomplete or inconsistent ledgers leave
  the inputs available for retry without displaying or exporting the old estimate.

No dependencies, Java loan rules, authentication, database, deployment configuration
or lending policies change. Comparisons and other preserved improvements remain
separate increments.

## Verification

Run from the repository root:

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

`npm test` includes the dependency-free calculator unit suite and existing gateway
tests. The calculator browser suite covers pagination, partial years, CSV, maximum
term, repeated switching, JPY early payoff, mobile width and error recovery.
The existing workflow also runs Java verification and the PostgreSQL portal flow.
Use the checks for the exact PR commit as the release gate; a local launch or
dependency-resolution failure is not a passing test.
