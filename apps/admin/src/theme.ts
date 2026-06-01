import { createTheme, type MantineColorsTuple } from '@mantine/core';

// Single source of truth for non-Mantine-scale brand colors used inline.
export const BRAND = {
  graphite: '#2B2B2B', // text + "VITTORIA" wordmark
  gold: '#B08D57',     // accent: "HOME", progress, active stage, primary buttons
  goldSoft: '#E9DCC6', // gold tint backgrounds
  bg: '#F6F3EE',       // warm page background
  surface: '#FFFFFF',  // cards
  green: '#4F8A5B',    // prepayment / "Действующий" / 100%
} as const;

const gold: MantineColorsTuple = [
  '#faf6ef', '#efe6d6', '#e0cdab', '#d2b37e', '#c69d5b',
  '#bf9047', '#b08d57', '#9a7942', '#8a6b39', '#79592b',
];

export const theme = createTheme({
  primaryColor: 'gold',
  primaryShade: 6,
  colors: { gold },
  defaultRadius: 'md',
  fontFamily: 'Inter, system-ui, sans-serif',
  headings: { fontFamily: '"Cormorant Garamond", Georgia, serif', fontWeight: '600' },
});
