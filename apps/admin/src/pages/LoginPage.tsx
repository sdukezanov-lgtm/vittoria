import { useState } from 'react';
import { Button, Center, Paper, Stack, Text, TextInput } from '@mantine/core';
import { Navigate } from 'react-router-dom';
import { requestCode } from '../api/auth.api';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/useAuth';
import { Logo } from '../brand/Logo';

export function LoginPage() {
  const { login, status } = useAuth();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A successful login flips status to 'authenticated', which re-renders this
  // and redirects — no imperative navigate() needed (that was a render-time side effect).
  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  const onRequestCode = async () => {
    setError(null);
    if (!/^\+7\d{10}$/.test(phone)) {
      setError('Введите телефон в формате +7XXXXXXXXXX');
      return;
    }
    setBusy(true);
    try {
      await requestCode(phone);
      setStep('code');
    } catch (e) {
      const rateLimited = e instanceof ApiError && (e.status === 429 || e.code === 'AUTH_RATE_LIMITED');
      setError(rateLimited ? 'Слишком много попыток, подождите' : 'Не удалось отправить код');
    } finally {
      setBusy(false);
    }
  };

  const onVerify = async () => {
    setError(null);
    setBusy(true);
    try {
      await login(phone, code);
    } catch {
      setError('Неверный код');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Center h="100vh">
      <Paper withBorder p="xl" w={360} radius="lg" shadow="sm">
        <Stack>
          <Logo size={30} tagline />
          {step === 'phone' ? (
            <>
              <TextInput
                label="Телефон"
                placeholder="+79990000000"
                value={phone}
                onChange={(e) => setPhone(e.currentTarget.value)}
              />
              <Button loading={busy} onClick={() => void onRequestCode()}>
                Получить код
              </Button>
            </>
          ) : (
            <>
              <TextInput
                label="Код из SMS"
                placeholder="1234"
                value={code}
                onChange={(e) => setCode(e.currentTarget.value)}
              />
              <Button loading={busy} onClick={() => void onVerify()}>
                Войти
              </Button>
              <Button variant="subtle" size="xs" onClick={() => { setStep('phone'); setError(null); }}>
                Назад
              </Button>
            </>
          )}
          {error && <Text c="red" size="sm">{error}</Text>}
        </Stack>
      </Paper>
    </Center>
  );
}
