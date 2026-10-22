import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { getMemberLoans, createLoan, approveLoan, disburseLoan, getLoanSchedule, getMembers } from '../../api/services';
import { useAuth } from '../../context/AuthContext';

export default function Loans() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isStaff = ['admin', 'treasurer'].includes(user?.role);
  const [members, setMembers] = useState([]);
  const [loans, setLoans] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [selectedMember, setSelectedMember] = useState(user?.memberId || '');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    memberId: '', principal: '', interestMethod: 'reducing_balance',
    interestRate: '2', durationMonths: '12', dueDate: '', notes: '',
  });

  useEffect(() => {
    if (isStaff) getMembers().then((r) => setMembers(r.data.members)).catch(() => {});
    if (selectedMember) fetchLoans(selectedMember);
  }, [selectedMember]);

  async function fetchLoans(memberId) {
    try {
      const res = await getMemberLoans(memberId);
      setLoans(res.data.loans);
    } catch { toast.error('Failed to load loans.'); }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await createLoan(form);
      toast.success('Loan registered.');
      setShowForm(false);
      fetchLoans(form.memberId);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to register loan.');
    } finally { setLoading(false); }
  }

  async function handleApprove(loanId) {
    try {
      await approveLoan(loanId);
      toast.success('Loan approved. SMS sent to member.');
      fetchLoans(selectedMember);
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to approve.'); }
  }

  async function handleDisburse(loanId) {
    try {
      await disburseLoan(loanId);
      toast.success('Loan marked as disbursed.');
      fetchLoans(selectedMember);
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to disburse.'); }
  }

  async function handleSchedule(loanId) {
    try {
      const res = await getLoanSchedule(loanId);
      setSchedule(res.data);
    } catch { toast.error('Failed to load schedule.'); }
  }

  const statusColor = { pending: 'warning', approved: 'info', disbursed: 'active', closed: 'inactive', defaulted: 'danger' };

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">Loans</h2>
        {isStaff && (
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ Register Loan'}
          </button>
        )}
      </div>

      {isStaff && (
        <div className="form-group" style={{ maxWidth: 300, marginBottom: 16 }}>
          <label>View Member Loans</label>
          <select value={selectedMember} onChange={(e) => setSelectedMember(e.target.value)}>
            <option value="">— Select member —</option>
            {members.map((m) => (
              <option key={m.member_id} value={m.member_id}>{m.member_number} — {m.full_name}</option>
            ))}
          </select>
        </div>
      )}

      {showForm && isStaff && (
        <div className="form-card">
          <h3>Register Loan</h3>
          <form onSubmit={handleCreate}>
            <div className="form-row">
              <div className="form-group">
                <label>Member *</label>
                <select value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })} required>
                  <option value="">— Select —</option>
                  {members.map((m) => <option key={m.member_id} value={m.member_id}>{m.member_number} — {m.full_name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Principal (RWF) *</label>
                <input type="number" min="1" value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} required />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Interest Method</label>
                <select value={form.interestMethod} onChange={(e) => setForm({ ...form, interestMethod: e.target.value })}>
                  <option value="reducing_balance">Reducing Balance</option>
                  <option value="flat">Flat Rate</option>
                  <option value="simple">Simple Interest</option>
                </select>
              </div>
              <div className="form-group">
                <label>Interest Rate (%)</label>
                <input type="number" step="0.01" min="0" value={form.interestRate} onChange={(e) => setForm({ ...form, interestRate: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Duration (months) *</label>
                <input type="number" min="1" value={form.durationMonths} onChange={(e) => setForm({ ...form, durationMonths: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Due Date</label>
                <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Saving...' : 'Register Loan'}</button>
          </form>
        </div>
      )}

      {schedule && (
        <div className="form-card">
          <div className="page-header">
            <h3>Repayment Schedule</h3>
            <button className="btn-link" onClick={() => setSchedule(null)}>Close</button>
          </div>
          <div className="stats-grid">
            <div className="stat-card"><p className="stat-label">Principal</p><h3>RWF {schedule.principal.toLocaleString()}</h3></div>
            <div className="stat-card"><p className="stat-label">Total Interest</p><h3>RWF {schedule.totalInterest.toLocaleString()}</h3></div>
            <div className="stat-card"><p className="stat-label">Total Repayable</p><h3>RWF {schedule.totalRepayable.toLocaleString()}</h3></div>
            <div className="stat-card"><p className="stat-label">Monthly Installment</p><h3>RWF {schedule.monthlyInstallment.toLocaleString()}</h3></div>
          </div>
        </div>
      )}

      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Principal</th>
              <th>Method</th>
              <th>Rate</th>
              <th>Duration</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loans.map((l) => (
              <tr key={l.loan_id}>
                <td>RWF {parseFloat(l.principal).toLocaleString()}</td>
                <td>{l.interest_method}</td>
                <td>{l.interest_rate}%</td>
                <td>{l.duration_months} mo.</td>
                <td>{l.due_date ? new Date(l.due_date).toLocaleDateString() : '—'}</td>
                <td><span className={`badge badge-${statusColor[l.status]}`}>{l.status}</span></td>
                <td className="action-cell">
                  <button className="btn-link" onClick={() => handleSchedule(l.loan_id)}>Schedule</button>
                  {isAdmin && l.status === 'pending' && <button className="btn-link" onClick={() => handleApprove(l.loan_id)}>Approve</button>}
                  {isStaff && l.status === 'approved' && <button className="btn-link" onClick={() => handleDisburse(l.loan_id)}>Disburse</button>}
                </td>
              </tr>
            ))}
            {loans.length === 0 && <tr><td colSpan={7} className="empty">No loans found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
