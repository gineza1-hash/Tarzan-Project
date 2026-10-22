import api from './client';

// Auth
export const login = (data) => api.post('/auth/login', data);
export const getMe = () => api.get('/auth/me');

// Members
export const getMembers = () => api.get('/members');
export const getMember = (id) => api.get(`/members/${id}`);
export const createMember = (data) => api.post('/members', data);
export const updateMember = (id, data) => api.patch(`/members/${id}`, data);
export const getMemberSummary = (id) => api.get(`/members/${id}/summary`);

// Savings
export const getSavings = (memberId, params) => api.get(`/savings/member/${memberId}`, { params });
export const recordSavings = (data) => api.post('/savings', data);
export const reverseSavings = (id, data) => api.patch(`/savings/${id}/reverse`, data);

// Loans
export const getMemberLoans = (memberId) => api.get(`/loans/member/${memberId}`);
export const createLoan = (data) => api.post('/loans', data);
export const approveLoan = (id) => api.patch(`/loans/${id}/approve`);
export const disburseLoan = (id) => api.patch(`/loans/${id}/disburse`);
export const getLoanSchedule = (id) => api.get(`/loans/${id}/schedule`);

// Repayments
export const getLoanRepayments = (loanId) => api.get(`/repayments/loan/${loanId}`);
export const recordRepayment = (data) => api.post('/repayments', data);

// Reports
export const getDashboard = () => api.get('/reports/dashboard');
export const getTransactionReport = (params) => api.get('/reports/transactions', { params });
export const getAuditLog = (params) => api.get('/reports/audit', { params });
