import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { getDashboard } from '../../api/services';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

function StatCard({ label, value, sub }) {
  return (
    <div className="stat-card">
      <p className="stat-label">{label}</p>
      <h3 className="stat-value">{value}</h3>
      {sub && <p className="stat-sub">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (['admin', 'treasurer'].includes(user?.role)) {
      getDashboard()
        .then((res) => setData(res.data))
        .catch(() => toast.error('Failed to load dashboard.'));
    }
  }, [user]);

  const chartData = data
    ? [
        { name: 'Deposits', amount: data.savings.totalDeposits },
        { name: 'Withdrawals', amount: data.savings.totalWithdrawals },
        { name: 'Net Balance', amount: data.savings.netBalance },
        { name: 'Loan Outstanding', amount: data.loans.totalOutstandingPrincipal },
        { name: 'Repayments', amount: data.repayments.totalCollected },
      ]
    : [];

  return (
    <div className="page">
      <h2 className="page-title">Dashboard</h2>

      {data ? (
        <>
          <div className="stats-grid">
            <StatCard label="Total Members" value={data.members.total} sub={`${data.members.active} active`} />
            <StatCard label="Net Savings Balance" value={`RWF ${data.savings.netBalance.toLocaleString()}`} />
            <StatCard label="Active Loans" value={data.loans.active} sub={`of ${data.loans.total} total`} />
            <StatCard label="Outstanding Principal" value={`RWF ${data.loans.totalOutstandingPrincipal.toLocaleString()}`} />
            <StatCard label="Total Repayments" value={`RWF ${data.repayments.totalCollected.toLocaleString()}`} />
          </div>

          <div className="chart-card">
            <h3>Financial Overview (RWF)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={(v) => `RWF ${v.toLocaleString()}`} />
                <Bar dataKey="amount" fill="#2d6a4f" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <p>Loading dashboard...</p>
      )}
    </div>
  );
}
