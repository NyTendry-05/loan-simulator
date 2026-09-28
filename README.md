# NYT — Online Loan Application & Verification

Node.js serves the customer and bank **web interface**. Spring Boot owns authentication, loan rules, verification, and persistence. PostgreSQL stores the actual data.

## Local setup

Install Java 21, Node.js 24 or newer, and PostgreSQL binaries. The Maven wrapper is included in the repository.

Set these environment variables in your local terminal:

| Variable | Purpose |
|---|---|
| `JAVA_HOME` | Path to your JDK 21 installation; Maven uses this to compile the backend |
| `POSTGRES_BIN` | Path to the PostgreSQL directory containing `initdb`, `postgres`, and `pg_ctl` |
| `ADMIN_EMAIL` | Administrator email chosen privately during first-time setup |
| `ADMIN_NAME` | Administrator display name chosen privately during first-time setup |
| `LOCAL_JAVA_HOME` | Optional explicit JDK path for the local application launcher |
| `LOCAL_DATABASE_PORT` | Optional preferred local database port |

Administrator identity values are required only during first-time setup. Supply your own values locally; there is no shared administrator login documented in this repository.

From the repository root, install dependencies and build the backend:

~~~powershell
npm ci --prefix node-api
.\mvnw.cmd -v
.\mvnw.cmd verify
node scripts/local.mjs start
~~~

The Maven version output must show Java 21. The launcher creates local database configuration, generates credentials and encryption keys, and starts PostgreSQL, Spring Boot, and the Node.js portal. It reports the portal address and where the generated administrator credentials can be accessed locally.

Open the reported portal address, normally **http://127.0.0.1:3000**. Use the configured origin exactly so browser session and origin checks agree.

Sign in with the administrator account created during setup, configure loan products, and add officer accounts through **Team access**. Customers register from the sign-in page. Initial setup does not seed loan products or lending rates.

## Start, stop, and restart

From the repository root:

~~~powershell
node scripts/local.mjs start
node scripts/local.mjs stop
node scripts/local.mjs restart
~~~

The startup script starts the persistent PostgreSQL cluster, Spring Boot, and the Node portal in the background without console windows. Repeated start calls report the running portal. Stop preserves the database and secrets. Process identity is checked before stopping managed processes.

Service logs are written to the ignored local runtime directory. On Windows, standard error is written to separate error logs and background processes use hidden consoles.

To start just PostgreSQL:

~~~powershell
node scripts/local.mjs database
~~~

The launcher prefers `LOCAL_JAVA_HOME`, then a workspace-local JDK if present, then `JAVA_HOME`. It chooses an available database port during initial setup if the preferred port is occupied.

Build the Spring package before first startup or after Java changes:

~~~powershell
node scripts/local.mjs stop
.\mvnw.cmd verify
node scripts/local.mjs start
~~~

The generated environment files are reused. Existing nonempty values are not silently replaced. Keep encryption and lookup keys stable while retaining the corresponding database.

## Configuration and confidential information

The root and Node.js `.env.example` files document configuration names and development defaults. Actual credentials, administrator identities, connection settings, and encryption keys belong in private local configuration or a deployment secret manager.

The `.gitignore` excludes environment files containing real values, local runtime data, demo records and screenshots, installed tools, dependencies, logs, and test artifacts. Configuration templates remain available to commit. Ignore rules do not remove files that were already tracked by Git.

Do not publish credentials, tokens, database exports, customer documents, or screenshots containing personal data in documentation, commits, issues, or shared logs. This README contains generic setup instructions and no deployment-specific account details.

## Interface

The responsive portal includes:

- Registration, sign-in, sign-out, and session expiry handling.
- Customer overview, product catalogue, application drafts, uploads, submission, withdrawal, document downloads, and event history.
- Bank review queue, claim review, document verification, approval/rejection, and decision reasons.
- Administrator product creation/deactivation and staff account creation/listing.
- Loading, empty, validation, and service error states. Product terms and upload limits come from Spring.
- Monetary values returned as decimal strings to preserve precision through JavaScript.

Node uses view controllers, static HTML/CSS/ES modules, browser controllers, and a service layer for Spring communication. It does not connect to PostgreSQL at runtime.

## Architecture

~~~mermaid
flowchart LR
    Browser[Customer / bank browser] --> Node[Node.js interface]
    Node --> Spring[Spring MVC REST controllers]
    Spring --> Services[Transactional services]
    Services --> JPA[JPA repositories]
    JPA --> DB[(PostgreSQL)]
~~~

Java 21, Spring Boot 4.1.1, Spring Security, Hibernate/JPA, Flyway, and PostgreSQL. Node.js 24+, Express 5, ESM, and built-in fetch. No production in-memory application data or seeded business policies.

## Database

The local cluster is stored in the ignored runtime directory. The application database role is not a superuser and cannot create roles or databases. A separate local owner account provisions it. The local launcher binds PostgreSQL to the loopback interface and uses SCRAM password authentication.

Flyway applies migrations; Hibernate validates the schema instead of generating it:

| Table | Purpose |
|---|---|
| loan_products | Immutable lending terms and active/inactive state |
| product_required_documents | Required document types per product |
| loan_applications | Applicant, encrypted financial data, workflow, reviewer and version |
| loan_documents | Encrypted uploads and verification decisions |
| loan_events | Transactional application event history |
| portal_users | Encrypted email/name, email lookup index, password hash and role |
| portal_sessions | Hashed session tokens, user references and expiry |

~~~mermaid
erDiagram
    LOAN_PRODUCTS ||--|{ PRODUCT_REQUIRED_DOCUMENTS : requires
    LOAN_PRODUCTS ||--o{ LOAN_APPLICATIONS : defines
    LOAN_APPLICATIONS ||--o{ LOAN_DOCUMENTS : contains
    LOAN_APPLICATIONS ||--o{ LOAN_EVENTS : records
    PORTAL_USERS ||--o{ PORTAL_SESSIONS : authenticates
~~~

Application applicant/reviewer IDs remain opaque subjects rather than foreign keys to portal_users, so the optional external identity-provider mode stays compatible.

V1__loan_workflow.sql creates the loan domain. V2__local_accounts.sql adds local accounts and sessions. Keys and credentials must be backed up separately from the database. The management script does not implement scheduled backups.

## Authentication and permissions

The configured local profile uses database-backed accounts:

- Public registration always creates a CUSTOMER. Submitted role fields cannot grant staff privileges.
- ADMIN accounts manage loan products and create/list OFFICER or ADMIN accounts.
- OFFICER accounts can see submitted applications and make decisions only after claiming a review.
- Administrators do not automatically have customer or officer permissions.
- Passwords use BCrypt with work factor 12. Passwords require at least 12 characters and at most 72 UTF-8 bytes.
- Email and display name are encrypted. Email matching uses a normalized HMAC-SHA256 index with a separate persistent lookup key.
- Sessions use random 256-bit opaque tokens. PostgreSQL stores only token hashes. Every authenticated request checks session validity, and sign-out revokes the session immediately.
- Node keeps the session token in an HttpOnly, SameSite=Strict cookie. It is never placed in browser local storage or returned by the portal sign-in response.
- Cookie-authenticated mutations require the configured exact Origin and an application request header. HTTPS origins also set Secure cookies.
- Failed logins are tracked transactionally and temporarily lock accounts. The gateway additionally limits authentication requests.
- Session duration, lockout duration, and maximum failures are environment-configurable.
- Password reset, email ownership verification, and MFA are not implemented.

The oidc Spring profile retains the earlier JWT resource-server integration for external API consumers. It requires issuer, JWKS, and audience configuration. The browser’s local registration/sign-in screens use the local profile; an OIDC browser redirect flow is not bundled.

## Loan workflow and calculation

~~~mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> SUBMITTED: Required uploads present
    DRAFT --> WITHDRAWN
    SUBMITTED --> WITHDRAWN
    SUBMITTED --> UNDER_REVIEW: Officer claims
    UNDER_REVIEW --> APPROVED: Evidence verified and policy satisfied
    UNDER_REVIEW --> REJECTED: Officer reason
~~~

Approval requires every required document to be verified and declared income/debt to satisfy the chosen product’s affordability rule. Decisions remain manual.

The fixed-rate amortization algorithm uses BigDecimal DECIMAL128, handles zero interest separately, rounds monthly payments upward to currency precision, and compares affordability before display rounding. Fees, floating rates, payment collection and disbursement are outside this implementation.

Application creation requires an Idempotency-Key UUID. Matching retries return the same application; changed input with the same key returns 409. Database uniqueness protects concurrent requests. A concurrent initial request may return 409; retry the original key/payload to retrieve the committed result.

Row locks serialize state changes and document operations. Only the assigned officer may verify or decide. Self-review is prohibited. Event history commits with the state change. Customers cannot access another customer’s application, documents, or events. Drafts remain private.

Products are immutable: create a new product for changed terms and deactivate the old one. Existing applications keep their original terms. Documents may be replaced in draft. Submitted records and terminal decisions cannot be edited. Appeals, reassignment and resubmission during review are not implemented.

## REST endpoints

Node exposes the authenticated business routes under /api/v1 and portal session routes under /auth. Direct API clients can send Authorization: Bearer with a local session token or a JWT in the matching Spring profile.

| Method | Path | Purpose |
|---|---|---|
| POST | /auth/register | Customer account and browser session |
| POST | /auth/login | Browser sign-in |
| GET | /auth/me | Current browser account |
| POST | /auth/logout | Revoke session and clear cookie |
| GET | /api/v1/capabilities | Document types and maximum upload size |
| GET / POST | /api/v1/products | List active products / create product as ADMIN |
| GET / DELETE | /api/v1/products/{id} | Read terms / deactivate as ADMIN |
| GET / POST | /api/v1/admin/users | List staff / create staff as ADMIN |
| GET / POST | /api/v1/applications | Own applications / create a draft |
| GET | /api/v1/applications/{id} | Authorized application details |
| GET | /api/v1/applications/{id}/events | Chronological status updates |
| POST | /api/v1/applications/{id}/submit | Owner submits draft |
| POST | /api/v1/applications/{id}/withdraw | Owner withdraws draft/submitted application |
| GET / POST | /api/v1/applications/{id}/documents | List / upload multipart file with type parameter |
| DELETE | /api/v1/applications/{id}/documents/{documentId} | Remove draft document |
| GET | /api/v1/applications/{id}/documents/{documentId}/content | Authorized attachment download |
| POST | /api/v1/applications/{id}/documents/{documentId}/verification | Assigned officer verifies |
| GET | /api/v1/reviews?status=SUBMITTED | Officer review queue |
| POST | /api/v1/reviews/{id}/start | Claim review |
| POST | /api/v1/reviews/{id}/decision | Assigned officer decides |

Spring directly exposes local authentication under /api/v1/auth. Public registration/login issue a token for trusted direct clients; Node’s /auth endpoints convert it into an HttpOnly cookie.

Lists accept page (zero based) and size (1–100), and return content, page, size, totalElements and totalPages. OpenAPI is available on Spring at /v3/api-docs when API_DOCS_ENABLED=true, with ADMIN authorization. Both services expose /health for process liveness.

## Verification

Maven uses `JAVA_HOME`, which can differ from the Java executable on `PATH`. If compilation reports `release version 21 not supported`, set `JAVA_HOME` to your JDK 21 installation, open a new terminal if necessary, and verify the selected runtime:

~~~powershell
.\mvnw.cmd -v
~~~

The Maven version output must show Java 21. Configure your editor's Java and Maven settings to use the same JDK; editor configuration is local to each developer.

Stop the local application with `node scripts/local.mjs stop` before packaging on Windows, so the running backend does not lock the JAR. Run `node scripts/local.mjs start` after verification to start it again. Maven `deploy` publishes artifacts to a configured repository; it is not the command for starting this application.

~~~powershell
.\mvnw.cmd verify
cd node-api
npm run lint
npm test
cd ..
node scripts/local.mjs start
cd node-api
npx playwright test
~~~

Java tests cover the loan workflow, actual RSA JWT validation for OIDC, customer/staff authentication, encrypted identity/financial storage, hashed and revoked sessions, account lockout, role restrictions, concurrent review claims, encryption tampering/key rotation, and repayment boundaries. JaCoCo enforces 85% line coverage.

Node tests cover gateway behavior, CSRF rejection, cookie security, authentication errors, multipart uploads, downloads, timeouts, rate limits, and view serving. Jest enforces 85% coverage on server modules; frontend behavior is tested through Playwright.

Browser tests require the local application to be running and Playwright's Chromium browser to be installed (`npx playwright install chromium` from `node-api`). They create explicitly marked test accounts and a loan product, complete the administrator → customer → officer workflow, verify persistence after reload, and delete their own fixtures. They use private local configuration for fixture cleanup; run them only against a development database. Generated screenshots and traces remain in the ignored runtime directory.

For an independent PostgreSQL integration-test database, override the Java test datasource. The browser suite already exercises PostgreSQL through both running services. Tests use ephemeral encryption keys; use a fresh database for repeated standalone integration runs.

## Operating boundaries

Uploads have size and signature validation and encrypted storage. Signature validation is not malware scanning or proof of document authenticity. Verification is manual; quarantine/scanning and KYC integrations remain separate work. Files download as attachments; original filenames are not retained.

Secrets, financial fields, identity data, and uploaded document content are protected as described above. AES-256-GCM envelopes contain a key ID and random nonce; document ciphertext is bound to the application and document ID. Keep historical encryption keys until corresponding data has been re-encrypted. AUTH_LOOKUP_KEY is independent and must remain stable until indexes are rebuilt.

Before external deployment, configure HTTPS, managed secrets, backups, email/MFA/reset flows as needed, database timeout/retention policy, and shared rate limiting if using multiple Node instances. The provided local startup is a development deployment. Email/SMS delivery is not configured; application events supply status updates inside the portal.

References: [Spring Boot](https://docs.spring.io/spring-boot/4.1/), [Spring Security](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/index.html), [springdoc](https://springdoc.org/).
