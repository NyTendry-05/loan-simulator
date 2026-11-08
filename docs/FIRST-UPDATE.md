# First staged update: public monthly repayment calculator

This branch isolates the public calculator from the preserved October 30 checkpoint.
It starts from the exact file tree of main at af5664ba7e0ac617fa3a431ebcc0157ded0b2614.

Included: anonymous fixed-rate repayment endpoint; monthly schedule and CSV; bounded
inputs and public request rate limit; credential-free forwarding; public calculator
home and separate demonstration portal; focused backend/gateway/browser tests.
The October 30 dependency lock refresh is included because the old runtime lock
reported five vulnerabilities (three high); the refreshed lock audit reports zero.
Minimal CI checks Java, gateway/lint/audit and isolated calculator browser behavior.

Excluded: annual summaries, scenario comparisons, later response and download
reliability changes, deployment/container overhaul, and unrelated portal/workflow
fixes. Those remain separate future updates and are not silently included here.

## Local verification

- Clean npm installation using the committed lock: passed (450 packages).
- 25 gateway/display tests and ESLint: passed.
- Runtime npm audit: zero vulnerabilities.
- Git whitespace check: passed.
- Maven verify: blocked before compilation by Maven Central DNS resolution.
- Browser: installed Chromium fails before page execution with a process-singleton
  socket permission error. One launch failure, three tests not run (a fifth single-payment regression was added after the launch failure).
- Full PostgreSQL and account-portal integration: not run for this staged snapshot.

This is a draft development update, not a production deployment. Check CI for the
published commit and complete remaining integration verification before merging.

Independent review identified and corrected a single-payment headline mismatch;
a focused unit/browser regression now uses the actual sole ledger payment.
