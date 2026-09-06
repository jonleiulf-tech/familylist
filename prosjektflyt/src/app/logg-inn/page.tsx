'use client';

import { useFormState } from 'react-dom';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SubmitButton } from '@/components/ui/submit-button';
import { FormError } from '@/components/ui/form-error';
import { ComProMark, ComProWordmark } from '@/components/brand/logo';
import { signIn, signUp, type AuthActionState } from './actions';

const initialState: AuthActionState = { error: null, info: null };

export default function LoggInnPage() {
  const [mode, setMode] = useState<'inn' | 'registrer'>('inn');
  const [signInState, signInAction] = useFormState(signIn, initialState);
  const [signUpState, signUpAction] = useFormState(signUp, initialState);

  const state = mode === 'inn' ? signInState : signUpState;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center gap-3 pt-6 text-center">
          <ComProMark className="h-14 w-14" />
          <CardTitle className="sr-only">ComPro</CardTitle>
          <ComProWordmark className="h-5" />
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
              <Label htmlFor="password">Passord</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={mode === 'registrer' ? 8 : 6}
                autoComplete={mode === 'inn' ? 'current-password' : 'new-password'}
              />
            </div>
            <FormError message={state.error} />
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
    </div>
  );
}
