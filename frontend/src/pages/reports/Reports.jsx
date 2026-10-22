import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { getTransactionReport, getAuditLog } from '../../api/services';
import { useAuth } from '../../context/AuthContext';

export default function Reports() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [tab, setTab] = useState('transactions');
  const [transactions, setTransactions] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [filters, setFilters] = useState({ from: '', to: '', type: '' });

  useEffect(() => {
    if (tab === 'transactions') fetchTransactions();
    if (tab === 'audit' && isAdmin) fetchAudit();
  }, [tab]);

  async function fetchTransactions() {
    try {
      const res = await getTransactionReport(filters);
      setTransactions(res.data.transactions);
    } catch { toast.error('Failed to load report.'); }
  }

  async function fetchAudit() {
    try {
      const res = await getAuditLog();
      setAuditLogs(res.data.logs);
    } catch { toast.error('Failed to load audit log.'); }
  }

  return (
    <div className="page">
      <h2 className="page-title">Reports</h2>

      <div className="tab-bar">
        <button className={`tab ${tab === 'transactions' ? 'active' : ''}`} onClick={() => setTab('transactions')}>
          Transaction Report
        </button>
        {isAdmin && (
          <button className={`tab ${tab === 'audit' ? 'active' : ''}`} onClick={() => setTab('audit')}>
            Audit Log
          </button>
        )}
      </div>

      {tab === 'transactions' && (
        <>
          <div className="form-row" style={{ marginBottom: 16 }}>
            <div className="form-group">
              <label>From</label>
              <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
            </div>
            <div className="form-group">
              <label>To</label>
              <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Type</label>
              <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
                <option value="">All</option>
                <option value="deposit">Deposit</option>
                <option value="withdrawal">Withdrawal</option>
                <option value="adjustment">Adjustment</option>
              </select>
            </div>
            <div className="form-group" style={{ justifyContent: 'flex-end', display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn-primary" onClick={fetchTransactions}>Apply Filters</button>
            </div>
          </div>

          <div className="table-card">
            <p style={{ marginBottom: 8, color: '#666' }}>{transactions.length} records</p>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Member</th>
                  <th>Type</th>
                  <th>Amount (RWF)</th>
                  <th>Reference</th>
                  <th>Recorded By</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.transaction_id}>
                    <td>{new Date(t.transaction_date).toLocaleDateString()}</td>
                    <td>{t.member_number} — {t.full_name}</td>
                    <td><span className={`badge badge-${t.transaction_type}`}>{t.transaction_type}</span></td>
                    <td>{parseFloat(t.amount).toLocaleString()}</td>
                    <td>{t.reference_code}</td>
                    <td>{t.recorded_by_name}</td>
                  </tr>
                ))}
                {transactions.length === 0 && <tr><td colSpan={6} className="empty">No transactions found.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'audit' && isAdmin && (
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Entity</th>
                <th>IP</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((l) => (
                <tr key={l.audit_id}>
                  <td>{new Date(l.timestamp).toLocaleString()}</td>
                  <td>{l.username || '—'}</td>
                  <td><span className="badge badge-info">{l.action}</span></td>
                  <td>{l.entity_type}</td>
                  <td>{l.ip_address || '—'}</td>
                  <td>{l.reason || '—'}</td>
                </tr>
              ))}
              {auditLogs.length === 0 && <tr><td colSpan={6} className="empty">No audit logs found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
