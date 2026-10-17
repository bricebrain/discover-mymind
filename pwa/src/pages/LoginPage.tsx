import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { useState, type FormEvent } from 'react';
import { useLogin } from '../api/auth';
import { ApiError } from '../api/client';

function message(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Connexion impossible.';
  if (error.code === 'too_many_attempts') {
    const minutes = error.retryAfter ? Math.ceil(error.retryAfter / 60) : null;
    return minutes ? `Trop de tentatives. Réessaie dans ${minutes} min.` : error.message;
  }
  return error.message;
}

export function LoginPage() {
  const [passphrase, setPassphrase] = useState('');
  const login = useLogin();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (passphrase) login.mutate(passphrase, { onSuccess: () => setPassphrase('') });
  };

  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', px: 2 }}>
      <Paper component="form" onSubmit={submit} variant="outlined" sx={{ p: 3, width: '100%', maxWidth: 380 }}>
        <Stack spacing={2.5}>
          <Box component="img" src="/icons/icon.svg" alt="" sx={{ width: 56, height: 56 }} />
          <Box>
            <Typography variant="h1" component="h1">Discover</Typography>
            <Typography color="text.secondary">Découvrir, écouter, réfléchir.</Typography>
          </Box>
          <TextField
            label="Phrase secrète"
            type="password"
            autoComplete="current-password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoFocus
            fullWidth
          />
          {login.isError && <Alert severity="error">{message(login.error)}</Alert>}
          <Button type="submit" variant="contained" size="large" disabled={!passphrase || login.isPending}>
            {login.isPending ? 'Connexion…' : 'Se connecter'}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
