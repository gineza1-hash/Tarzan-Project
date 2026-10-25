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

    // ── Members ──
    const members = [
      { number: 'RW-001', name: 'MUHIZI SHAUN', phone: '+250788000001', email: 'shaun@example.com', nationalId: '1199880012345678' },
      { number: 'RW-002', name: 'SONIA KEZA GENDANEZA', phone: '+250788000002', email: 'sonia@example.com', nationalId: '1199880012345679' },
      { number: 'RW-003', name: 'MANZI MULINDA DIVIN ELVIS', phone: '+250788000003', email: 'elvis@example.com', nationalId: '1199880012345680' },
      { number: 'RW-004', name: 'HILLARY KAYINABABO', phone: '+250788000004', email: 'hillary@example.com', nationalId: '1199880012345681' },
    ];

    const memberIds = [];
    for (const m of members) {
      const res = await client.query(
        `INSERT INTO members (member_number, full_name, phone, email, national_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (member_number) DO UPDATE SET full_name = EXCLUDED.full_name
         RETURNING member_id`,
        [m.number, m.name, m.phone, m.email, m.nationalId, adminId]
      );
      if (res.rows[0]) memberIds.push(res.rows[0].member_id);
    }
    console.log(`✅ ${memberIds.length} members created`);

    if (memberIds.length === 0) {
      await client.query('COMMIT');
      return;
    }

    // ── Member user accounts ──
    const memberHash = await bcrypt.hash('Member@1234', 12);
    await client.query(
      `INSERT INTO users (username, email, password_hash, role, member_id)
       VALUES ('shaun', 'shaun@example.com', $1, 'member', $2)
       ON CONFLICT (email) DO NOTHING`,
      [memberHash, memberIds[0]]
    );
    console.log('✅ Member user created — email: shaun@example.com | password: Member@1234');

    // ── Savings transactions ──
    const savingsData = [
      { memberId: memberIds[0], amount: 50000, type: 'deposit', ref: 'DEP-001', date: '2026-01-15' },
      { memberId: memberIds[0], amount: 30000, type: 'deposit', ref: 'DEP-002', date: '2026-02-15' },
      { memberId: memberIds[1], amount: 75000, type: 'deposit', ref: 'DEP-003', date: '2026-01-20' },
      { memberId: memberIds[1], amount: 25000, type: 'deposit', ref: 'DEP-004', date: '2026-02-20' },
      { memberId: memberIds[2], amount: 100000, type: 'deposit', ref: 'DEP-005', date: '2026-01-10' },
      { memberId: memberIds[3], amount: 40000, type: 'deposit', ref: 'DEP-006', date: '2026-01-25' },
    ];

    for (const s of savingsData) {
      await client.query(
        `INSERT INTO savings_transactions (member_id, amount, transaction_type, transaction_date, recorded_by, reference_code)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (reference_code) DO NOTHING`,
        [s.memberId, s.amount, s.type, s.date, treasurerId || adminId, s.ref]
      );
    }
    console.log(`✅ ${savingsData.length} savings transactions created`);

    // ── Loan ──
    const existingLoan = await client.query(
      `SELECT loan_id FROM loans
       WHERE member_id = $1 AND principal = 200000 AND status = 'disbursed'
       ORDER BY created_at LIMIT 1`,
      [memberIds[0]]
    );
    const loanResult = existingLoan.rows[0]
      ? existingLoan
      : await client.query(
        `INSERT INTO loans (member_id, principal, interest_method, interest_rate, duration_months, due_date, status, approved_by, approved_at, disbursed_at, recorded_by)
         VALUES ($1, 200000, 'reducing_balance', 2.0, 12, '2027-03-01', 'disbursed', $2, '2026-03-01', '2026-03-05', $2)
         RETURNING loan_id`,
        [memberIds[0], adminId]
      );
    const loanId = loanResult.rows[0].loan_id;
    console.log('✅ Sample loan created (RWF 200,000 — disbursed)');

    // ── Repayments ──
    const repayments = [
      { amount: 18000, principal: 14667, interest: 3333, ref: 'REP-001', date: '2026-04-01' },
      { amount: 18000, principal: 14960, interest: 3040, ref: 'REP-002', date: '2026-05-01' },
    ];

    for (const r of repayments) {
      await client.query(
        `INSERT INTO repayments (loan_id, member_id, amount, principal_component, interest_component, fees_component, paid_at, recorded_by, reference_code)
         VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8)
         ON CONFLICT (reference_code) DO NOTHING`,
        [loanId, memberIds[0], r.amount, r.principal, r.interest, r.date, treasurerId || adminId, r.ref]
      );
    }
    console.log(`✅ ${repayments.length} repayments created`);

    await client.query('COMMIT');
    console.log('\n🎉 Seed complete!\n');
    console.log('Test accounts:');
    console.log('  Admin     → admin@tarzan.rw       / Admin@1234');
    console.log('  Treasurer → treasurer@tarzan.rw   / Treasurer@1234');
    console.log('  Member    → shaun@example.com     / Member@1234');
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
