import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getMembers, createMember } from '../../api/services';

export default function Members() {
  const [members, setMembers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ memberNumber: '', fullName: '', phone: '', email: '', nationalId: '' });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { fetchMembers(); }, []);

  async function fetchMembers() {
    try {
      const res = await getMembers();
      setMembers(res.data.members);
    } catch {
      toast.error('Failed to load members.');
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await createMember(form);
      toast.success('Member registered successfully.');
      setShowForm(false);
      setForm({ memberNumber: '', fullName: '', phone: '', email: '', nationalId: '' });
      fetchMembers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to register member.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">Members</h2>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Register Member'}
        </button>
      </div>

      {showForm && (
        <div className="form-card">
          <h3>Register New Member</h3>
          <form onSubmit={handleCreate}>
            <div className="form-row">
              <div className="form-group">
                <label>Member Number *</label>
                <input value={form.memberNumber} onChange={(e) => setForm({ ...form, memberNumber: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Full Name *</label>
                <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Phone</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+250788000000" />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label>National ID</label>
                <input value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} />
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Register Member'}
            </button>
          </form>
        </div>
      )}

      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Member No.</th>
              <th>Full Name</th>
              <th>Phone</th>
              <th>Joined</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.member_id}>
                <td>{m.member_number}</td>
                <td>{m.full_name}</td>
                <td>{m.phone || '—'}</td>
                <td>{new Date(m.joined_at).toLocaleDateString()}</td>
                <td><span className={`badge badge-${m.status}`}>{m.status}</span></td>
                <td>
                  <button className="btn-link" onClick={() => navigate(`/members/${m.member_id}`)}>
                    View
                  </button>
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr><td colSpan={6} className="empty">No members registered yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
