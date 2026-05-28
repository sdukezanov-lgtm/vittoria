import type { UserRole } from '../api/types';
import { PlaceholderPage } from '../components/PlaceholderPage';
import { useAuth } from './useAuth';

export function RoleGate({ allow, children }: { allow: UserRole[]; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user || !allow.includes(user.role)) {
    return <PlaceholderPage />;
  }
  return <>{children}</>;
}
