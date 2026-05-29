import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { AuthProvider } from './auth/AuthProvider';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { RoleGate } from './auth/RoleGate';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { OrdersPage } from './pages/OrdersPage';
import { OrderPage } from './pages/OrderPage';
import { ChatsPage } from './pages/ChatsPage';
import { PartnersPage } from './pages/PartnersPage';
import { CommissionsPage } from './pages/CommissionsPage';
import { AuditPage } from './pages/AuditPage';
import { TemplatesPage } from './pages/TemplatesPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <Notifications />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                element={
                  <ProtectedRoute>
                    <RoleGate allow={['admin']}>
                      <AppLayout />
                    </RoleGate>
                  </ProtectedRoute>
                }
              >
                <Route path="/orders" element={<OrdersPage />} />
                <Route path="/orders/:id" element={<OrderPage />} />
                <Route path="/chats" element={<ChatsPage />} />
                <Route path="/partners" element={<PartnersPage />} />
                <Route path="/commissions" element={<CommissionsPage />} />
                <Route path="/audit" element={<AuditPage />} />
                <Route path="/templates" element={<TemplatesPage />} />
                <Route index element={<Navigate to="/orders" replace />} />
              </Route>
              <Route path="*" element={<Navigate to="/orders" replace />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </MantineProvider>
    </QueryClientProvider>
  );
}
