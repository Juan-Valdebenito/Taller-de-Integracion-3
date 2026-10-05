import { AdminComplaintsView } from '../../components/admin/AdminComplaintsView';

export function AdminDashboardPage() {
  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', paddingBottom: 'var(--space-8)' }}>
      <AdminComplaintsView />
    </div>
  );
}

export default AdminDashboardPage;
