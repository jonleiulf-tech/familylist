'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { signIn, signUp, type AuthActionState } from './actions';

const initialState: AuthActionState = { error: null };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {label}
    </Button>
  );
}

export default function LoggInnPage() {
  const [mode, setMode] = useState<'inn' | 'registrer'>('inn');
  const [signInState, signInAction] = useFormState(signIn, initialState);
  const [signUpState, signUpAction] = useFormState(signUp, initialState);

  const state = mode === 'inn' ? signInState : signUpState;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">ProsjektFlyt</CardTitle>
          <CardDescription>
            {mode === 'inn' ? 'Logg inn for å fortsette' : 'Opprett en ny konto'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={mode === 'inn' ? signInAction : signUpAction} className="flex flex-col gap-4">
            {mode === 'registrer' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="full_name">Navn</Label>
                <Input id="full_name" name="full_name" required placeholder="Ola Nordmann" />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">E-post</Label>
              <Input id="email" name="email" type="email" required placeholder="deg@eksempel.no" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Passord</Label>
              <Input id="password" name="password" type="password" required minLength={6} />
            </div>
            {state.error && <p className="text-sm text-destructive">{state.error}</p>}
            <SubmitButton label={mode === 'inn' ? 'Logg inn' : 'Opprett konto'} />
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
