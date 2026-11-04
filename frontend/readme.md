# Tarzan SACCO Ledger — Frontend

Plain HTML, CSS and JavaScript. No build step.

## Run it

1. Start the backend (from the backend folder):
   ```
   npm install
   npm run migrate    # needs the SQL file renamed to schema.sql, inside src/db
   npm run seed       # creates the test accounts
   npm run dev        # API on http://localhost:5000
   ```
2. Serve this folder on port **5173** (the backend only allows that origin):
   ```
   npx serve -l 5173
   ```
   or
   ```
   python -m http.server 5173
   ```
3. Open http://localhost:5173

Opening the files by double-clicking (`file://`) will not work: the backend blocks those requests.

## Test accounts (from the seed script)

| Role      | Email                 | Password         |
|-----------|-----------------------|------------------|
| Admin     | admin@tarzan.rw       | Admin@1234       |
| Treasurer | treasurer@tarzan.rw   | Treasurer@1234   |
| Member    | shaun@example.com     | Member@1234      |

Login is limited to 20 attempts per 15 minutes.

## Files

```
index.html        redirects to login or the right home page
login.html        sign in
dashboard.html    staff dashboard (admin, treasurer)
members.html      member list, add and edit (admin, treasurer)
savings.html      savings history, record and reverse (all roles)
loans.html        loans: create, approve, disburse, details (all roles)
repayments.html   repayment history and recording (all roles)
reports.html      transaction report + CSV (staff), audit log (admin)
users.html        create login accounts (admin)
portal.html       member's own summary
css/styles.css    all styling; colours are variables at the top
js/auth.js        token + user storage, role guards, logout
js/api.js         every backend request (API_BASE lives here)
js/utils.js       money/date formatting, HTML escaping
js/layout.js      sidebar menu (add new pages to NAV_ITEMS)
js/login.js       login form
js/dashboard.js   dashboard data
js/members.js     members list, search, add/edit form
js/savings.js     savings history, record form, reversal
js/loans.js       loan list, new loan, approve/disburse, details
js/repayments.js  repayment history, totals, record form
js/reports.js     transaction report, CSV download, audit log
js/users.js       member logins overview, create account
js/portal.js      member summary data
```

Script order matters on every page: `auth.js`, `api.js`, `utils.js`, then `layout.js`, then the page's own script.