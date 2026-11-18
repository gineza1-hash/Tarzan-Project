require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('🌱 Seeding database...');

    // ── Admin user ──
    const adminHash = await bcrypt.hash('Admin@1234', 12);
    const adminResult = await client.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ('admin', 'admin@tarzan.rw', $1, 'admin')
       ON CONFLICT (email) DO NOTHING
       RETURNING user_id`,
      [adminHash]
    );
    const adminId = adminResult.rows[0]?.user_id || (
      await client.query('SELECT user_id FROM users WHERE email = $1', ['admin@tarzan.rw'])
    ).rows[0]?.user_id;
    console.log('✅ Admin user created — email: admin@tarzan.rw | password: Admin@1234');

    // ── Treasurer user ──
    const treasurerHash = await bcrypt.hash('Treasurer@1234', 12);
    const treasurerResult = await client.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ('treasurer', 'treasurer@tarzan.rw', $1, 'treasurer')
       ON CONFLICT (email) DO NOTHING
       RETURNING user_id`,
      [treasurerHash]
    );
    const treasurerId = treasurerResult.rows[0]?.user_id || (
      await client.query('SELECT user_id FROM users WHERE email = $1', ['treasurer@tarzan.rw'])
    ).rows[0]?.user_id;
    console.log('✅ Treasurer user created — email: treasurer@tarzan.rw | password: Treasurer@1234');

    // Members, savings, loans and repayments are created only through the website.
    console.log('✅ Demo members and transactions are not seeded');

    await client.query('COMMIT');
    console.log('\n🎉 Seed complete!\n');
    console.log('Test accounts:');
    console.log('  Admin     → admin@tarzan.rw       / Admin@1234');
    console.log('  Treasurer → treasurer@tarzan.rw   / Treasurer@1234');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
