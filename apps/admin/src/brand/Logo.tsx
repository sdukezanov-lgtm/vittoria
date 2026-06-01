import { Box, Text } from '@mantine/core';
import { BRAND } from '../theme';

export function Logo({ size = 28, tagline = false }: { size?: number; tagline?: boolean }) {
  return (
    <Box>
      <Text
        component="span"
        style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: size, fontWeight: 700, letterSpacing: 1 }}
      >
        <Text component="span" inherit c={BRAND.graphite}>VITTORIA </Text>
        <Text component="span" inherit c={BRAND.gold}>HOME</Text>
      </Text>
      {tagline && (
        <Text size="9px" c="dimmed" style={{ letterSpacing: 2 }}>СЕРВИС, КОТОРОМУ ДОВЕРЯЮТ</Text>
      )}
    </Box>
  );
}
