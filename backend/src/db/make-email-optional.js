// FILE: backend/src/db/make-email-optional.js   (a NEW file: put it next to migrate.js)
//
// One-time database update so a member can register WITHOUT an email address
// (many members sign in with their phone number and do not use email).
//
//   Run from the backend folder:   node src/db/make-email-optional.js
//
// It only removes the "must not be empty" rule on users.email. Emails stay UNIQUE,
// every existing row is untouched, and running it twice does no harm.
require('dotenv').config();
const pool = require('./pool');

async function run() {
  try {
    await pool.query('ALTER TABLE users ALTER COLUMN email DROP NOT NULL');
    console.log('✅ users.email is now optional.');
  } catch (err) {
    console.error('❌ Could not update the database:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();