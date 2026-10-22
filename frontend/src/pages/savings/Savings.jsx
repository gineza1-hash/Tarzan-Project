import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
import { getSavings, recordSavings, getMembers } from '../../api/services';
import { useAuth } from '../../context/AuthContext';

export default function Savings() {
  const { user } = useAuth();
  const isStaff = ['admin', 'treasurer'].includes(user?.role);
  const [transactions, setTransactions] = useState([]);
  const [members, setMembers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedMember, setSelectedMember] = useState(user?.memberId || '');
  const [form, setForm] = useState({
    memberId: user?.memberId || '',
    amount: '',
    transactionType: 'deposit',
    transactionDate: new Date().toISOString().split('T')[0],
    referenceCode: '',
    notes: '',
  });

  useEffect(() => {
    if (isStaff) getMembers().then((r) => setMembers(r.data.members)).catch(() => {});
    if (selectedMember) fetchTransactions(selectedMember);
  }, [selectedMember]);

  async function fetchTransactions(memberId) {
    try {
      const res = await getSavings(memberId);
      setTransactions(res.data.transactions);
    } catch {
      toast.error('Failed to load transactions.');
    }
  }

  async function handleRecord(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const ref = form.referenceCode || `SAV-${Date.now()}`;
      await recordSavings({ ...form, referenceCode: ref });
      toast.success('Transaction recorded.');
      setShowForm(false);
      fetchTransactions(form.memberId);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to record transaction.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">Savings</h2>
        {isStaff && (
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ Record Transaction'}
          </button>
        )}
      </div>

      {isStaff && (
        <div className="form-group" style={{ maxWidth: 300, marginBottom: 16 }}>
          <label>View Member</label>
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
          <h3>Record Savings Transaction</h3>
          <form onSubmit={handleRecord}>
            <div className="form-row">
              <div className="form-group">
                <label>Member *</label>
                <select value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })} required>
                  <option value="">— Select —</option>
                  {members.map((m) => (
                    <option key={m.member_id} value={m.member_id}>{m.member_number} — {m.full_name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Type *</label>
                <select value={form.transactionType} onChange={(e) => setForm({ ...form, transactionType: e.target.value })}>
                  <option value="deposit">Deposit</option>
                  <option value="withdrawal">Withdrawal</option>
                  <option value="adjustment">Adjustment</option>
                </select>
              </div>
              <div className="form-group">
                <label>Amount (RWF) *</label>
                <input type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Date *</label>
                <input type="date" value={form.transactionDate} onChange={(e) => setForm({ ...form, transactionDate: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Reference Code</label>
                <input value={form.referenceCode} onChange={(e) => setForm({ ...form, referenceCode: e.target.value })} placeholder="Auto-generated if empty" />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Record Transaction'}
            </button>
          </form>
        </div>
      )}

      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Amount (RWF)</th>
              <th>Reference</th>
              <th>Recorded By</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.transaction_id}>
                <td>{new Date(t.transaction_date).toLocaleDateString()}</td>
                <td><span className={`badge badge-${t.transaction_type}`}>{t.transaction_type}</span></td>
                <td>{parseFloat(t.amount).toLocaleString()}</td>
                <td>{t.reference_code}</td>
                <td>{t.recorded_by_name}</td>
                <td>{t.is_reversed ? <span className="badge badge-inactive">Reversed</span> : <span className="badge badge-active">Valid</span>}</td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr><td colSpan={6} className="empty">No transactions found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
