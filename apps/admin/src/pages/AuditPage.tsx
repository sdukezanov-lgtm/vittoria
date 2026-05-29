import { useState } from 'react';
import {
  Button,
  Code,
  Group,
  Loader,
  Modal,
  Pagination,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listAuditLog, type AuditLogRow } from '../api/audit.api';

export function AuditPage() {
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AuditLogRow | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['auditLog', { entity, page }],
    queryFn: () => listAuditLog({ entity: entity || undefined, page, page_size: 20 }),
    placeholderData: keepPreviousData,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <Stack>
      <Title order={3}>Аудит</Title>

      <Group>
        <TextInput
          placeholder="Сущность (Order, User…)"
          value={entity}
          onChange={(e) => { setEntity(e.currentTarget.value); setPage(1); }}
          w={280}
        />
      </Group>

      {isLoading && <Loader />}
      {isError && <Text c="red">Не удалось загрузить журнал</Text>}
      {data && data.rows.length === 0 && <Text c="dimmed">Записей нет</Text>}

      {data && data.rows.length > 0 && (
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Время</Table.Th>
              <Table.Th>Действие</Table.Th>
              <Table.Th>Сущность</Table.Th>
              <Table.Th>ID объекта</Table.Th>
              <Table.Th>Актор</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.rows.map((row) => (
              <Table.Tr key={row.id}>
                <Table.Td>{new Date(row.created_at).toLocaleString('ru-RU')}</Table.Td>
                <Table.Td>{row.action}</Table.Td>
                <Table.Td>{row.entity}</Table.Td>
                <Table.Td>{row.entity_id}</Table.Td>
                <Table.Td>{row.actor_user_id ?? '—'}</Table.Td>
                <Table.Td>
                  <Button size="xs" variant="subtle" onClick={() => setDetail(row)}>
                    Подробнее
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {totalPages > 1 && (
        <Pagination value={page} onChange={setPage} total={totalPages} />
      )}

      <Modal
        opened={detail !== null}
        onClose={() => setDetail(null)}
        title={detail?.action}
        size="lg"
      >
        <Stack>
          <div>
            <Text fw={600}>Было</Text>
            <Code block>{JSON.stringify(detail?.before ?? null, null, 2)}</Code>
          </div>
          <div>
            <Text fw={600}>Стало</Text>
            <Code block>{JSON.stringify(detail?.after ?? null, null, 2)}</Code>
          </div>
        </Stack>
      </Modal>
    </Stack>
  );
}
