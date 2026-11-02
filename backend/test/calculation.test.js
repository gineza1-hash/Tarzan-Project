const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateInterest,
  calculateMonthlyInstallment,
  calculateOutstandingPrincipal,
  calculateSavingsBalance,
} = require('../src/services/calculationService');

test('calculates zero-interest monthly installments', () => {
  assert.equal(calculateMonthlyInstallment({
    principal: 120000,
    interestRate: 0,
    durationMonths: 12,
  }), 10000);
});

test('calculates flat interest', () => {
  assert.equal(calculateInterest({
    principal: 100000,
    interestRate: 2,
    durationMonths: 6,
    method: 'flat',
  }), 12000);
});

test('does not allow outstanding principal below zero', () => {
  assert.equal(calculateOutstandingPrincipal(100000, 110000), 0);
});

test('ignores reversed savings transactions', () => {
  assert.equal(calculateSavingsBalance([
    { transaction_type: 'deposit', amount: '50000', is_reversed: false },
    { transaction_type: 'withdrawal', amount: '10000', is_reversed: false },
    { transaction_type: 'deposit', amount: '20000', is_reversed: true },
  ]), 40000);
});
