import { useState } from 'react';
import { Button, Center, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { requestCode } from '../api/auth.api';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/useAuth';

export function LoginPage() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'authenticated') {
    navigate('/orders', { replace: true });
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
      setError(e instanceof ApiError && e.status === 429 ? 'Слишком много попыток, подождите' : 'Не удалось отправить код');
    } finally {
      setBusy(false);
    }
  };

  const onVerify = async () => {
    setError(null);
    setBusy(true);
    try {
      await login(phone, code);
      navigate('/orders', { replace: true });
    } catch {
      setError('Неверный код');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Center h="100vh">
      <Paper withBorder p="xl" w={360}>
        <Stack>
          <Title order={3}>VITTORIA HOME</Title>
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
