import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './global.css';
import { theme } from './theme';
import { AuthProvider } from './auth/AuthProvider';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { RoleGate } from './auth/RoleGate';
import { AppLayout } from './components/AppLayout';
import { PartnerLayout } from './components/PartnerLayout';
import { LoginPage } from './pages/LoginPage';
import { PartnerOrdersPage } from './pages/PartnerOrdersPage';
import { PartnerOrderPage } from './pages/PartnerOrderPage';
import { PartnerCommissionsPage } from './pages/PartnerCommissionsPage';
import { ProfilePage } from './pages/ProfilePage';
import { RoleHome } from './auth/RoleHome';
import { OrdersPage } from './pages/OrdersPage';
import { OrderPage } from './pages/OrderPage';
import { ChatsPage } from './pages/ChatsPage';
import { PartnersPage } from './pages/PartnersPage';
import { CommissionsPage } from './pages/CommissionsPage';
import { AuditPage } from './pages/AuditPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { ClientLayout } from './components/ClientLayout';
import { CabinetHomePage } from './pages/cabinet/CabinetHomePage';
import { CabinetHistoryPage } from './pages/cabinet/CabinetHistoryPage';
import { CabinetChatPage } from './pages/cabinet/CabinetChatPage';
import { CabinetProfilePage } from './pages/cabinet/CabinetProfilePage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={theme}>
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
              </Route>
              <Route
                element={
                  <ProtectedRoute>
                    <RoleGate allow={['partner']}>
                      <PartnerLayout />
                    </RoleGate>
                  </ProtectedRoute>
                }
              >
                <Route path="/partner/orders" element={<PartnerOrdersPage />} />
                <Route path="/partner/orders/:id" element={<PartnerOrderPage />} />
                <Route path="/partner/commissions" element={<PartnerCommissionsPage />} />
                <Route path="/partner/profile" element={<ProfilePage />} />
              </Route>
              <Route
                element={
                  <ProtectedRoute>
                    <RoleGate allow={['client']}>
                      <ClientLayout />
                    </RoleGate>
                  </ProtectedRoute>
                }
              >
                <Route path="/cabinet" element={<CabinetHomePage />} />
                <Route path="/cabinet/history/:id" element={<CabinetHistoryPage />} />
                <Route path="/cabinet/chat/:id" element={<CabinetChatPage />} />
                <Route path="/cabinet/profile" element={<CabinetProfilePage />} />
              </Route>
              <Route path="*" element={<RoleHome />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </MantineProvider>
    </QueryClientProvider>
  );
}
