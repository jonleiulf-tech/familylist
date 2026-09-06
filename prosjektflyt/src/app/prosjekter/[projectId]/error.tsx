'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function ProjectError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-16 text-center">
      <h2 className="text-lg font-semibold">Noe gikk galt</h2>
      <p className="text-sm text-muted-foreground">
        Handlingen kunne ikke fullføres. Prøv igjen – og si fra til prosjektlederen hvis feilen vedvarer.
      </p>
      {error.digest && <p className="text-xs text-muted-foreground">Referanse: {error.digest}</p>}
      <Button onClick={reset}>Prøv igjen</Button>
    </div>
  );
}
