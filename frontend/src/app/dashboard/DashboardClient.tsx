'use client';

import { AlertTriangle } from 'lucide-react';

import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { useAuth } from '@/providers/AuthProvider';

export function DashboardClient() {
  const { user, mustChangePassword } = useAuth();
  const greeting = user ? `Welcome back, ${user.userId.slice(0, 8)}` : 'Welcome';

  return (
    <div>
      <Breadcrumb items={[{ label: 'Home', href: '/dashboard' }, { label: 'Dashboard' }]} />

      {mustChangePassword ? (
        <div
          className="alert alert-warning d-flex align-items-start gap-2 mb-4"
          role="status"
          aria-live="polite"
        >
          <AlertTriangle size={18} className="mt-1 flex-shrink-0" aria-hidden="true" />
          <div>
            <strong>Password change required.</strong>{' '}
            Your account is on a temporary password. A self-service password
            change endpoint is not available on this build &mdash; please
            contact your school administrator to set a permanent password.
          </div>
        </div>
      ) : null}

      <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
        <div>
          <h1 className="mb-1" style={{ fontSize: 'var(--text-h2)' }}>{greeting}</h1>
          <p className="text-secondary mb-0">Foundation shell — feature pages will land in subsequent sprints.</p>
        </div>
      </div>

      <div className="row g-3">
        {(['Students', 'Teachers', 'Classes', 'Pending Fees'] as const).map((label) => (
          <div className="col-12 col-sm-6 col-xl-3" key={label}>
            <div className="card h-100">
              <div className="card-body">
                <div className="text-muted small text-uppercase fw-semibold mb-2">{label}</div>
                <div style={{ fontSize: 'var(--text-h2)', fontWeight: 600 }}>—</div>
                <div className="small text-muted mt-1">Awaiting backend wiring</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
