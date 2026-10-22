-- ============================================================
-- TARZAN SACCO LEDGER — DATABASE SCHEMA
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS (authentication identities)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    user_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username      VARCHAR(50) UNIQUE NOT NULL,
    email         VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'treasurer', 'member')),
    member_id     UUID,                          -- FK added after members table
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    last_login_ip VARCHAR(45),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MEMBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS members (
    member_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_number VARCHAR(20) UNIQUE NOT NULL,
    full_name     VARCHAR(100) NOT NULL,
    phone         VARCHAR(20),
    email         VARCHAR(100),
    national_id   VARCHAR(30) UNIQUE,
    joined_at     DATE NOT NULL DEFAULT CURRENT_DATE,
    status        VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_by    UUID REFERENCES users(user_id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK from users to members
ALTER TABLE users
    ADD CONSTRAINT fk_users_member
    FOREIGN KEY (member_id) REFERENCES members(member_id) ON DELETE SET NULL;

-- ============================================================
-- SAVINGS TRANSACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS savings_transactions (
    transaction_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id        UUID NOT NULL REFERENCES members(member_id) ON DELETE RESTRICT,
    amount           DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal', 'adjustment')),
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    recorded_by      UUID NOT NULL REFERENCES users(user_id),
    reference_code   VARCHAR(50) UNIQUE NOT NULL,
    notes            TEXT,
    is_reversed      BOOLEAN NOT NULL DEFAULT FALSE,
    reversed_by      UUID REFERENCES users(user_id),
    reversed_at      TIMESTAMPTZ,
    reversal_reason  TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- LOANS
-- ============================================================
CREATE TABLE IF NOT EXISTS loans (
    loan_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id       UUID NOT NULL REFERENCES members(member_id) ON DELETE RESTRICT,
    principal       DECIMAL(15, 2) NOT NULL CHECK (principal > 0),
    interest_method VARCHAR(20) NOT NULL DEFAULT 'reducing_balance' CHECK (interest_method IN ('flat', 'reducing_balance', 'simple')),
    interest_rate   DECIMAL(5, 2) NOT NULL DEFAULT 0.00 CHECK (interest_rate >= 0),
    duration_months INTEGER NOT NULL CHECK (duration_months > 0),
    approved_at     DATE,
    disbursed_at    DATE,
    due_date        DATE,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'disbursed', 'closed', 'defaulted')),
    approved_by     UUID REFERENCES users(user_id),
    recorded_by     UUID NOT NULL REFERENCES users(user_id),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- REPAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS repayments (
    repayment_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    loan_id             UUID NOT NULL REFERENCES loans(loan_id) ON DELETE RESTRICT,
    member_id           UUID NOT NULL REFERENCES members(member_id) ON DELETE RESTRICT,
    amount              DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    principal_component DECIMAL(15, 2) NOT NULL DEFAULT 0.00 CHECK (principal_component >= 0),
    interest_component  DECIMAL(15, 2) NOT NULL DEFAULT 0.00 CHECK (interest_component >= 0),
    fees_component      DECIMAL(15, 2) NOT NULL DEFAULT 0.00 CHECK (fees_component >= 0),
    paid_at             DATE NOT NULL DEFAULT CURRENT_DATE,
    recorded_by         UUID NOT NULL REFERENCES users(user_id),
    reference_code      VARCHAR(50) UNIQUE NOT NULL,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    audit_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID REFERENCES users(user_id) ON DELETE SET NULL,
    action        VARCHAR(50) NOT NULL,
    entity_type   VARCHAR(50) NOT NULL,
    entity_id     UUID,
    ip_address    VARCHAR(45),
    user_agent    TEXT,
    before_state  JSONB,
    after_state   JSONB,
    reason        TEXT,
    timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- LOGIN ATTEMPTS (for suspicious login detection)
-- ============================================================
CREATE TABLE IF NOT EXISTS login_attempts (
    attempt_id  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES users(user_id) ON DELETE CASCADE,
    email       VARCHAR(100),
    ip_address  VARCHAR(45) NOT NULL,
    user_agent  TEXT,
    success     BOOLEAN NOT NULL,
    flagged     BOOLEAN NOT NULL DEFAULT FALSE,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_savings_member     ON savings_transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_savings_date       ON savings_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_loans_member       ON loans(member_id);
CREATE INDEX IF NOT EXISTS idx_loans_status       ON loans(status);
CREATE INDEX IF NOT EXISTS idx_repayments_loan    ON repayments(loan_id);
CREATE INDEX IF NOT EXISTS idx_repayments_member  ON repayments(member_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity       ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_user         ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_login_attempts_user ON login_attempts(user_id);
