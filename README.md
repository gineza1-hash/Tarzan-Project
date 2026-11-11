# Tarzan: SACCO Ledger

A low-cost digital ledger for savings groups and SACCOs in Rwanda.

## Team 1 — Tarzan
BSc. Software Engineering | Foundations Project | October 2026

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| Database | PostgreSQL (Supabase recommended) |
| Frontend | React + Vite |
| USSD | Africa's Talking |
| SMS Alerts | Africa's Talking SMS |
| Auth | JWT + bcrypt |

---

## Project's Structure

```
Tarzan-Project/
├── backend/
│   ├── src/
│   │   ├── controllers/     # Business logic per domain
│   │   ├── routes/          # Express route definitions
│   │   ├── middleware/       # Auth, audit logging
│   │   ├── services/        # SMS, USSD, calculations
│   │   ├── db/              # Schema, migrations, pool
│   │   ├── utils/           # Logger
│   │   └── server.js        # Entry point
│   ├── .env.example
│   └── package.json
└── frontend/                # React dashboard (coming next)
```

---

## Getting Started

### 1. Clone & install

```bash
git clone https://github.com/gineza1-hash/Tarzan-Project.git
cd Tarzan-Project/backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in DATABASE_URL, JWT_SECRET, AT_API_KEY, and AT_USERNAME
```

For Supabase, use the connection string from **Dashboard → Connect → Session pooler** (or the transaction pooler for short-lived scripts), rather than the direct `db.<project-ref>.supabase.co:5432` host when your network cannot reach the direct endpoint. Keep `DATABASE_SSL=true`.

### Configure Africa's Talking USSD

1. Create or open an Africa's Talking account and select the Rwanda application/environment.
2. Set `AT_USERNAME` to the application username and `AT_API_KEY` to its API key. Use `sandbox` as the username while testing in the sandbox.
3. In the Africa's Talking USSD channel settings, create a USSD code and set its callback URL to the deployed URL followed by `/ussd`, for example:
   `https://tarzan-sacco-api.onrender.com/ussd`
4. Set the same code in `AT_USSD_CODE`. The callback must be reachable over HTTPS; no trailing slash is required.
5. Ensure every member's phone is stored with the Rwanda country code (for example `+250788000001`). The callback accepts Africa's Talking's international format and ignores spaces, `+`, and other punctuation when matching.

Africa's Talking sends `sessionId`, `serviceCode`, `phoneNumber`, and `text` as `application/x-www-form-urlencoded`. The API returns the required plain-text `CON` or `END` response.

For sandbox testing only, set `USSD_DEMO_DEPOSITS=true` in the deployment environment. This adds option `5`, records a clearly labeled demo deposit, and sends an SMS if Africa's Talking SMS is configured. It does not process mobile-money payments and must remain disabled for production.

The USSD menu also supports:

```text
6. Request Withdrawal
7. Apply for Loan
```

Withdrawals are requests, not automatic payouts. The default daily limit is RWF 50,000, configurable with `USSD_DAILY_WITHDRAWAL_LIMIT_RWF`. Staff review requests through `/api/withdrawals`, and only an approved request can be marked completed and recorded as a withdrawal. This prevents the system from claiming that mobile-money funds were sent before MTN/Airtel payout integration is approved.

Loan applications collect the requested amount, repayment period, and purpose. They enter `pending` status for administrator review. Administrators can approve with `PATCH /api/loans/:loanId/approve` or reject with `PATCH /api/loans/:loanId/reject` and a reason; the member receives an SMS when the decision is made.

### Member account lifecycle

Member records are never deleted when someone leaves or needs to be blocked. An administrator can edit a member and set the status to **Inactive**, providing a reason. This preserves savings, loan, repayment, and audit history while preventing the member from logging in, using USSD, or using an existing session. Reactivating the member restores access without changing financial records.

The database migration adds deactivation metadata and a normalized unique phone index. Before applying it to an existing production database, check for duplicate phone numbers:

```sql
SELECT regexp_replace(phone, '[^0-9]', '', 'g') AS normalized_phone, COUNT(*)
FROM members
WHERE phone IS NOT NULL
GROUP BY normalized_phone
HAVING COUNT(*) > 1;
```

Resolve any duplicates before running `npm run migrate`. The migration is otherwise safe to rerun.

For a live deployment, keep `USSD_DEMO_DEPOSITS=false`, use production payment credentials only after provider approval, keep `DATABASE_URL` and `JWT_SECRET` in Render environment variables, and verify database backups before onboarding real members.

### 3. Run database migration

```bash
npm run migrate
```

The migration is safe to run more than once. After the schema is created, load demo data:

```bash
npm run seed
```

The seed creates demo admin, treasurer, and member accounts plus savings, loan, and repayment records. Change the demo passwords before using the application outside development.

### 4. Start the server

```bash
npm run dev       # development
npm start         # production
```

### Run backend tests

From `Tarzan-Project/backend`:

```bash
npm test
```

The tests cover the health endpoint, authentication boundary, USSD request validation,
and core savings/loan calculations. Full database workflow tests should be run against
a disposable PostgreSQL database before production use.

### Database backups and recovery

The backend includes PostgreSQL backup and restore scripts. Install the PostgreSQL
client tools (`pg_dump` and `pg_restore`), set `DATABASE_URL` in the shell only, and
never commit it.

On Windows PowerShell:

```powershell
.\scripts\backup.ps1
.\scripts\restore.ps1 .\backups\tarzan-YYYYMMDD-HHMMSS.dump
```

On Linux/macOS:

```bash
./scripts/backup.sh
./scripts/restore.sh ./backups/tarzan-YYYYMMDD-HHMMSS.dump
```

Restore only into a test database first. A recovery test is complete when the schema,
users, members, transactions, loans, repayments, and audit records are present after
the restore and `/health` responds successfully.

### Deploy to Render

The repository includes [render.yaml](./render.yaml) and a production [Dockerfile](./backend/Dockerfile).
In Render, choose **New → Blueprint**, select this repository, and confirm the blueprint.
Set the secret environment variables shown as `sync: false`, then deploy. Render's
health check uses `/health`. Run the migration and seed commands against the Supabase
database before testing the deployed API:

```bash
npm run migrate
npm run seed
```

Do not use the demo seed passwords outside a test environment.

---

## API Endpoints

### Auth
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/auth/login` | Public | Login, returns JWT |
| POST | `/api/auth/register` | Admin only | Create user account |
| GET | `/api/auth/me` | Authenticated | Get current user |

### Members
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/members` | Admin/Treasurer | List all members |
| POST | `/api/members` | Admin/Treasurer | Register new member |
| GET | `/api/members/:id` | Own data | Get member profile |
| PATCH | `/api/members/:id` | Admin/Treasurer | Update member |
| GET | `/api/members/:id/summary` | Own data | Savings + loan summary |

### Savings
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/savings/member/:id` | Own data | Get savings transactions |
| POST | `/api/savings` | Admin/Treasurer | Record deposit/withdrawal |
| PATCH | `/api/savings/:id/reverse` | Admin only | Reverse a transaction |

### Loans
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/loans/member/:id` | Own data | Get member loans |
| POST | `/api/loans` | Admin/Treasurer | Register new loan |
| PATCH | `/api/loans/:id/approve` | Admin only | Approve loan |
| PATCH | `/api/loans/:id/disburse` | Admin/Treasurer | Mark as disbursed |
| GET | `/api/loans/:id/schedule` | Authenticated | Get repayment schedule |

### Repayments
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/repayments/loan/:id` | Authenticated | Get loan repayments |
| POST | `/api/repayments` | Admin/Treasurer | Record repayment |

### Reports
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/reports/dashboard` | Admin/Treasurer | Summary statistics |
| GET | `/api/reports/transactions` | Admin/Treasurer | Filtered transaction report |
| GET | `/api/reports/audit` | Admin only | Audit log |

### USSD
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/ussd` | Africa's Talking callback |
```

The USSD callback expects Africa's Talking form data (`sessionId`, `phoneNumber`, `serviceCode`, and `text`) and returns plain-text `CON`/`END` responses. Registered members can use:

```text
1. Savings Balance
2. Last 3 Transactions
3. Loan Balance
4. Repayment History
0. Exit
```

For a local contract check:

```bash
curl -X POST http://localhost:5000/ussd ^
  -H "Content-Type: application/x-www-form-urlencoded" ^
  --data "sessionId=test-session&serviceCode=*384*57890%23&phoneNumber=%2B250788000001&text="

**USSD Menu (`*XXX#`):**
```
1. Savings Balance
2. Last 3 Transactions
3. Loan Balance
4. Repayment History
0. Exit
```

---

## Security Features

- JWT authentication on all private routes
- Server-side role-based access control (admin / treasurer / member)
- Members can only access their own data
- Suspicious login detection → SMS alert sent to member
- Rate limiting on auth endpoints (20 req / 15 min)
- Password hashing with bcrypt (cost factor 12)
- Helmet.js security headers
- Database transactions for financial operations
- Unique reference codes prevent duplicate postings
- Full audit log for all sensitive actions

---

## SMS Notifications

Triggered automatically on:
- Savings deposit recorded
- Loan approved
- Repayment recorded
- Suspicious login from unknown IP

---

## Team Contributions

| Member | Role |
|--------|------|
| MUHIZI SHAUN | Project coordination & requirements |
| HILLARY KAYINABABO | Research & literature review |
| NITEKA LOUANGE MOREL | UI/UX & frontend |
| MANZI MULINDA DIVIN ELVIS | Backend & database |
| SONIA KEZA GENDANEZA | Testing & documentation |
| ELSIE GLENNA INEZA | Scrum Master |
| IbBYISHAKA REMY | Full stack|

Trello Link: https://trello.com/b/gNkH9DO9/tarzan-project
Figma Design Link: https://www.figma.com/design/wbjYQRHb0nia6yK3x1GI57/Tarzan-Figma-Design?node-id=0-1&t=eCieMmIr2e4lI3DF-1
