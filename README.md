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

## Project Structure

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
# Fill in DATABASE_URL, JWT_SECRET, AT_API_KEY, AT_USERNAME
```

### 3. Run database migration

```bash
npm run migrate
```

### 4. Start the server

```bash
npm run dev       # development
npm start         # production
```

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
