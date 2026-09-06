'use client';

import Link from 'next/link';
import { useFormState } from 'react-dom';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SubmitButton } from '@/components/ui/submit-button';
import { FormError } from '@/components/ui/form-error';
import { ComProMark, ComProWordmark } from '@/components/brand/logo';
import { requestPasswordReset, type ResetActionState } from './actions';

const initialState: ResetActionState = { error: null, info: null };

export default function GlemtPassordPage() {
  const [state, action] = useFormState(requestPasswordReset, initialState);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center gap-3 pt-6 text-center">
          <ComProMark className="h-14 w-14" />
          <CardTitle className="sr-only">Glemt passord</CardTitle>
          <ComProWordmark height={20} />
          <CardDescription>Vi sender deg en lenke for å sette nytt passord</CardDescription>
        </CardHeader>
        <CardContent>
          {state.info ? (
            <div className="flex flex-col gap-4">
              <p role="status" className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
                {state.info}
              </p>
              <Link href="/logg-inn" className="text-center text-sm text-muted-foreground hover:text-foreground">
                Tilbake til innlogging
              </Link>
            </div>
          ) : (
            <form action={action} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">E-post</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  placeholder="deg@eksempel.no"
                />
              </div>
              <FormError message={state.error} />
              <SubmitButton>Send lenke</SubmitButton>
              <Link href="/logg-inn" className="text-center text-sm text-muted-foreground hover:text-foreground">
                Tilbake til innlogging
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
