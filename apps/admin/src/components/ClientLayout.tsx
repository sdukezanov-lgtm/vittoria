import { Anchor, Box, Container, Group, Paper, Text, ThemeIcon } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Outlet } from 'react-router-dom';
import { getServiceContact } from '../api/cabinet.api';
import { Logo } from '../brand/Logo';
import { BRAND } from '../theme';

export function ClientLayout() {
  const { data: contact } = useQuery({ queryKey: ['serviceContact'], queryFn: getServiceContact });
  return (
    <Box style={{ minHeight: '100vh', background: BRAND.bg }}>
      <Paper shadow="xs" px="md" py="sm" radius={0}>
        <Container size="lg">
          <Group justify="space-between">
            <Logo size={26} tagline />
            {contact && (
              <Group gap="xs">
                <ThemeIcon variant="light" radius="xl" size="lg" color="gold">☎</ThemeIcon>
                <Box>
                  <Text size="xs" c="dimmed">Сервисный отдел</Text>
                  <Anchor href={`tel:${contact.phone.replace(/[^+\d]/g, '')}`} fw={600} c={BRAND.graphite}>
                    {contact.phone}
                  </Anchor>
                </Box>
              </Group>
            )}
          </Group>
        </Container>
      </Paper>
      <Container size="lg" py="lg">
        <Outlet />
      </Container>
    </Box>
  );
}
