'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-xl font-semibold">Noe gikk galt</h1>
      <p className="text-sm text-muted-foreground">Prøv å laste siden på nytt.</p>
      <Button onClick={reset}>Prøv igjen</Button>
    </div>
  );
}
