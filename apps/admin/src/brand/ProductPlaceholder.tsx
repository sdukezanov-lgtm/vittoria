import { Box } from '@mantine/core';
import { BRAND } from '../theme';

// Stand-in for the (not-yet-available) real product photo.
export function ProductPlaceholder({ height = 180 }: { height?: number }) {
  return (
    <Box
      role="img"
      aria-label="Фото изделия"
      style={{
        height, borderRadius: 12,
        background: `linear-gradient(135deg, ${BRAND.goldSoft}, ${BRAND.bg})`,
      }}
    />
  );
}
