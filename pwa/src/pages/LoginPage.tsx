import { motion } from 'motion/react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Notice, cardCls, inputCls } from '@/components/ui/kit';
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

  return <div className="grid min-h-dvh place-items-center bg-background px-4 font-sans text-foreground">
    <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onSubmit={submit} className={`${cardCls} flex w-full max-w-[380px] flex-col gap-5 p-6`}>
      <img src="/icons/icon.svg" alt="" className="size-14 rounded-xl" />
      <div>
        <h1 className="m-0 font-display text-[2.5rem] font-normal leading-none">Discover</h1>
        <p className="m-0 mt-1 text-muted-foreground">Découvrir, écouter, réfléchir.</p>
      </div>
      <Field label="Phrase secrète">
        <input type="password" autoComplete="current-password" className={inputCls} value={passphrase} autoFocus
          onChange={(e) => setPassphrase(e.target.value)} />
      </Field>
      {login.isError && <Notice tone="error">{message(login.error)}</Notice>}
      <Button type="submit" className="h-12" disabled={!passphrase || login.isPending}>{login.isPending ? 'Connexion…' : 'Se connecter'}</Button>
    </motion.form>
  </div>;
}
