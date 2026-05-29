import { sniffMime } from '../mime-sniff';

describe('sniffMime', () => {
  it('detects JPEG', () => {
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe('image/jpeg');
  });
  it('detects PNG', () => {
    expect(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
  });
  it('detects PDF', () => {
    expect(sniffMime(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe('application/pdf');
  });
  it('returns null for unknown bytes', () => {
    expect(sniffMime(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toBeNull();
  });
});
