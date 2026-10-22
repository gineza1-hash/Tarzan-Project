/**
 * Loan calculation engine
 * Supports: flat rate, reducing balance, simple interest
 */

/**
 * Calculate total interest for a loan
 */
function calculateInterest({ principal, interestRate, durationMonths, method }) {
  const rate = parseFloat(interestRate) / 100;
  const P = parseFloat(principal);

  switch (method) {
    case 'flat':
      // Flat: interest = P * rate * months
      return parseFloat((P * rate * durationMonths).toFixed(2));

    case 'simple':
      // Simple annual: interest = P * rate * (months/12)
      return parseFloat((P * rate * (durationMonths / 12)).toFixed(2));

    case 'reducing_balance':
      // Monthly reducing balance: total interest = sum of monthly interest on outstanding principal
      const monthlyRate = rate / 12;
      const monthlyPayment = (P * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -durationMonths));
      let balance = P;
      let totalInterest = 0;
      for (let i = 0; i < durationMonths; i++) {
        const interestForMonth = balance * monthlyRate;
        totalInterest += interestForMonth;
        balance -= monthlyPayment - interestForMonth;
      }
      return parseFloat(totalInterest.toFixed(2));

    default:
      return 0;
  }
}

/**
 * Calculate monthly installment (reducing balance)
 */
function calculateMonthlyInstallment({ principal, interestRate, durationMonths }) {
  const monthlyRate = parseFloat(interestRate) / 100 / 12;
  const P = parseFloat(principal);
  if (monthlyRate === 0) return parseFloat((P / durationMonths).toFixed(2));
  const installment = (P * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -durationMonths));
  return parseFloat(installment.toFixed(2));
}

/**
 * Calculate outstanding principal on a loan given total repaid principal
 */
function calculateOutstandingPrincipal(principal, totalPrincipalRepaid) {
  const outstanding = parseFloat(principal) - parseFloat(totalPrincipalRepaid);
  return parseFloat(Math.max(outstanding, 0).toFixed(2));
}

/**
 * Calculate member savings balance from transactions
 */
function calculateSavingsBalance(transactions) {
  return transactions.reduce((balance, tx) => {
    if (tx.is_reversed) return balance;
    if (tx.transaction_type === 'deposit') return balance + parseFloat(tx.amount);
    if (tx.transaction_type === 'withdrawal') return balance - parseFloat(tx.amount);
    if (tx.transaction_type === 'adjustment') return balance + parseFloat(tx.amount); // can be negative
    return balance;
  }, 0);
}

module.exports = {
  calculateInterest,
  calculateMonthlyInstallment,
  calculateOutstandingPrincipal,
  calculateSavingsBalance,
};
