'use client';

import Link from 'next/link';
import { useFormState } from 'react-dom';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SubmitButton } from '@/components/ui/submit-button';
import { FormError } from '@/components/ui/form-error';
import { ComProMark, ComProWordmark } from '@/components/brand/logo';
import { setNewPassword, type NewPasswordState } from './actions';

const initialState: NewPasswordState = { error: null };

export default function NyttPassordPage() {
  const [state, action] = useFormState(setNewPassword, initialState);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center gap-3 pt-6 text-center">
          <ComProMark className="h-14 w-14" />
          <CardTitle className="sr-only">Sett nytt passord</CardTitle>
          <ComProWordmark height={20} />
          <CardDescription>Velg et nytt passord for kontoen din</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Nytt passord</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoFocus
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">Minst 8 tegn.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password_repeat">Gjenta passord</Label>
              <Input
                id="password_repeat"
                name="password_repeat"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <FormError message={state.error} />
            <SubmitButton>Lagre nytt passord</SubmitButton>
            <Link href="/logg-inn" className="text-center text-sm text-muted-foreground hover:text-foreground">
              Tilbake til innlogging
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
