export interface AuthUser {
  id: string;
  role: 'client' | 'admin' | 'partner';
  jti: string;
}
