import { Center, Loader } from '@mantine/core';
import { Navigate } from 'react-router-dom';
import { useAuth } from './useAuth';

export function RoleHome() {
  const { user, status } = useAuth();
  if (status === 'loading') {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (status === 'unauthenticated' || !user) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to={user.role === 'partner' ? '/partner/orders' : '/orders'} replace />;
}
