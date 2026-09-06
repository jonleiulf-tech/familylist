'use client';

import { useFormState } from 'react-dom';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SubmitButton } from '@/components/ui/submit-button';
import { FormError } from '@/components/ui/form-error';
import { ComProMark, ComProWordmark } from '@/components/brand/logo';
import { signIn, signUp, type AuthActionState } from './actions';

const initialState: AuthActionState = { error: null, info: null };

const URL_ERRORS: Record<string, string> = {
  mangler_kode: 'Lenken manglet bekreftelseskode. Prøv å registrere deg på nytt for å få en ny e-post.',
  ugyldig_lenke:
    'Bekreftelseslenken er ugyldig eller utløpt. Registrer deg på nytt med samme e-post for å få en ny lenke.',
};

export default function LoggInnPage() {
  // useSearchParams krever en Suspense-grense for at siden skal kunne prerendres.
  return (
    <Suspense fallback={null}>
      <LoggInnForm />
    </Suspense>
  );
}

function LoggInnForm() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<'inn' | 'registrer'>(searchParams.get('modus') === 'registrer' ? 'registrer' : 'inn');
  const [signInState, signInAction] = useFormState(signIn, initialState);
  const [signUpState, signUpAction] = useFormState(signUp, initialState);
  const urlError = URL_ERRORS[searchParams.get('feil') ?? ''] ?? null;

  const state = mode === 'inn' ? signInState : signUpState;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center gap-3 pt-6 text-center">
          <ComProMark className="h-14 w-14" />
          <CardTitle className="sr-only">ComPro</CardTitle>
          <ComProWordmark height={20} />
          <CardDescription>
            {mode === 'inn' ? 'Logg inn for å fortsette' : 'Opprett en ny konto'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={mode === 'inn' ? signInAction : signUpAction} className="flex flex-col gap-4">
            {mode === 'registrer' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="full_name">Navn</Label>
                <Input id="full_name" name="full_name" required placeholder="Ola Nordmann" autoComplete="name" />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">E-post</Label>
              <Input id="email" name="email" type="email" required placeholder="deg@eksempel.no" autoComplete="email" />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="password">Passord</Label>
                {mode === 'inn' && (
                  <Link href="/glemt-passord" className="text-xs text-muted-foreground hover:text-foreground">
                    Glemt passord?
                  </Link>
                )}
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={mode === 'registrer' ? 8 : 6}
                autoComplete={mode === 'inn' ? 'current-password' : 'new-password'}
              />
            </div>
            <FormError message={state.error ?? urlError} />
            {state.info && (
              <p role="status" className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
                {state.info}
              </p>
            )}
            <SubmitButton>{mode === 'inn' ? 'Logg inn' : 'Opprett konto'}</SubmitButton>
          </form>
          <button
            type="button"
            onClick={() => setMode(mode === 'inn' ? 'registrer' : 'inn')}
            className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            {mode === 'inn' ? 'Ny her? Opprett konto' : 'Har du allerede konto? Logg inn'}
          </button>
        </CardContent>
      </Card>
      <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">
        ← Tilbake til forsiden
      </Link>
    </div>
  );
}
