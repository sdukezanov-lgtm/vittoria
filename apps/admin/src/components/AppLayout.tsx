import { AppShell, Badge, Burger, Button, Group, NavLink, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { NavLink as RouterNavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { listAdminChats } from '../api/chat.api';

export function AppLayout() {
  const [opened, { toggle }] = useDisclosure();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const { data: chats } = useQuery({
    queryKey: ['adminChats', { hasUnread: false }],
    queryFn: () => listAdminChats({ has_unread: false, page: 1, page_size: 100 }),
    refetchInterval: 10_000,
  });
  const totalUnread = chats?.rows.reduce((sum, r) => sum + r.unread_count, 0) ?? 0;

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Title order={4}>VITTORIA HOME</Title>
          </Group>
          <Group>
            <Text size="sm" c="dimmed">{user?.phone}</Text>
            <Button variant="subtle" size="xs" onClick={() => void handleLogout()}>
              Выход
            </Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="md">
        <NavLink component={RouterNavLink} to="/orders" label="Заказы" />
        <NavLink
          component={RouterNavLink}
          to="/chats"
          label="Чат"
          rightSection={totalUnread > 0 ? <Badge size="sm" circle>{totalUnread}</Badge> : null}
        />
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
