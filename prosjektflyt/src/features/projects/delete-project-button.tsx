'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormError } from '@/components/ui/form-error';
import { deleteProject } from './actions';

/**
 * Sletting av hele prosjektet (kun eier). Krever at brukeren skriver
 * prosjektnavnet – dette sletter milepæler, oppgaver, timer og hendelser
 * for godt (ON DELETE CASCADE).
 */
export function DeleteProjectButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const matches = typed.trim() === projectName.trim();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm-delete">Skriv prosjektnavnet for å bekrefte</Label>
        <Input id="confirm-delete" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={projectName} />
      </div>
      <Button
        variant="destructive"
        className="w-fit"
        disabled={!matches || pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await deleteProject(projectId);
            if (result && !result.ok) setError(result.error);
          })
        }
      >
        <Trash2 className="h-4 w-4" /> {pending ? 'Sletter…' : 'Slett prosjektet for godt'}
      </Button>
      <FormError message={error} />
    </div>
  );
}
