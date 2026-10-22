import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { getLoanRepayments, recordRepayment, getMemberLoans, getMembers } from '../../api/services';
import { useAuth } from '../../context/AuthContext';

export default function Repayments() {
  const { user } = useAuth();
  const isStaff = ['admin', 'treasurer'].includes(user?.role);
  const [members, setMembers] = useState([]);
  const [loans, setLoans] = useState([]);
  const [repayments, setRepayments] = useState([]);
  const [selectedLoan, setSelectedLoan] = useState('');
  const [selectedMember, setSelectedMember] = useState(user?.memberId || '');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    loanId: '', memberId: '', amount: '', principalComponent: '',
    interestComponent: '', feesComponent: '0', paidAt: new Date().toISOString().split('T')[0],
    referenceCode: '', notes: '',
  });

  useEffect(() => {
    if (isStaff) getMembers().then((r) => setMembers(r.data.members)).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedMember) {
      getMemberLoans(selectedMember).then((r) => setLoans(r.data.loans)).catch(() => {});
    }
  }, [selectedMember]);

  useEffect(() => {
    if (selectedLoan) fetchRepayments(selectedLoan);
  }, [selectedLoan]);

  async function fetchRepayments(loanId) {
    try {
      const res = await getLoanRepayments(loanId);
      setRepayments(res.data.repayments);
    } catch { toast.error('Failed to load repayments.'); }
  }

  async function handleRecord(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const ref = form.referenceCode || `REP-${Date.now()}`;
      const res = await recordRepayment({ ...form, referenceCode: ref });
      toast.success(`Repayment recorded. Outstanding: RWF ${res.data.outstandingBalance.toLocaleString()}`);
      setShowForm(false);
      fetchRepayments(form.loanId);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to record repayment.');
    } finally { setLoading(false); }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">Repayments</h2>
        {isStaff && (
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ Record Repayment'}
          </button>
        )}
      </div>

      {isStaff && (
        <div className="form-row" style={{ marginBottom: 16 }}>
          <div className="form-group">
            <label>Member</label>
            <select value={selectedMember} onChange={(e) => { setSelectedMember(e.target.value); setSelectedLoan(''); }}>
              <option value="">— Select member —</option>
              {members.map((m) => <option key={m.member_id} value={m.member_id}>{m.member_number} — {m.full_name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Loan</label>
            <select value={selectedLoan} onChange={(e) => setSelectedLoan(e.target.value)}>
              <option value="">— Select loan —</option>
              {loans.filter(l => ['disbursed', 'approved'].includes(l.status)).map((l) => (
                <option key={l.loan_id} value={l.loan_id}>RWF {parseFloat(l.principal).toLocaleString()} — {l.status}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {showForm && isStaff && (
        <div className="form-card">
          <h3>Record Repayment</h3>
          <form onSubmit={handleRecord}>
            <div className="form-row">
              <div className="form-group">
                <label>Member *</label>
                <select value={form.memberId} onChange={(e) => { setForm({ ...form, memberId: e.target.value }); getMemberLoans(e.target.value).then(r => setLoans(r.data.loans)); }} required>
                  <option value="">— Select —</option>
                  {members.map((m) => <option key={m.member_id} value={m.member_id}>{m.member_number} — {m.full_name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Loan *</label>
                <select value={form.loanId} onChange={(e) => setForm({ ...form, loanId: e.target.value })} required>
                  <option value="">— Select —</option>
                  {loans.filter(l => ['disbursed', 'approved'].includes(l.status)).map((l) => (
                    <option key={l.loan_id} value={l.loan_id}>RWF {parseFloat(l.principal).toLocaleString()}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Total Amount (RWF) *</label>
                <input type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Principal Component *</label>
                <input type="number" min="0" step="0.01" value={form.principalComponent} onChange={(e) => setForm({ ...form, principalComponent: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Interest Component *</label>
                <input type="number" min="0" step="0.01" value={form.interestComponent} onChange={(e) => setForm({ ...form, interestComponent: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Fees</label>
                <input type="number" min="0" step="0.01" value={form.feesComponent} onChange={(e) => setForm({ ...form, feesComponent: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Date *</label>
                <input type="date" value={form.paidAt} onChange={(e) => setForm({ ...form, paidAt: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Reference Code</label>
                <input value={form.referenceCode} onChange={(e) => setForm({ ...form, referenceCode: e.target.value })} placeholder="Auto-generated if empty" />
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Saving...' : 'Record Repayment'}</button>
          </form>
        </div>
      )}

      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Amount (RWF)</th>
              <th>Principal</th>
              <th>Interest</th>
              <th>Fees</th>
              <th>Reference</th>
              <th>Recorded By</th>
            </tr>
          </thead>
          <tbody>
            {repayments.map((r) => (
              <tr key={r.repayment_id}>
                <td>{new Date(r.paid_at).toLocaleDateString()}</td>
                <td>{parseFloat(r.amount).toLocaleString()}</td>
                <td>{parseFloat(r.principal_component).toLocaleString()}</td>
                <td>{parseFloat(r.interest_component).toLocaleString()}</td>
                <td>{parseFloat(r.fees_component).toLocaleString()}</td>
                <td>{r.reference_code}</td>
                <td>{r.recorded_by_name}</td>
              </tr>
            ))}
            {repayments.length === 0 && <tr><td colSpan={7} className="empty">No repayments found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
