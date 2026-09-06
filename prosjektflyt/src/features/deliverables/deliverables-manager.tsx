'use client';

import { useState, useTransition } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormError } from '@/components/ui/form-error';
import { SubmitButton } from '@/components/ui/submit-button';
import type { Deliverable } from '@/types/database';
import { applyDeliverableTemplate, createDeliverable, deleteDeliverable } from './actions';
import { DELIVERABLE_TEMPLATES, type DeliverableTemplateKey } from './templates';

export function DeliverablesManager({ projectId, deliverables }: { projectId: string; deliverables: Deliverable[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Leveranser / arbeidskategorier</CardTitle>
        <CardDescription>
          Kategorier timer kan knyttes til – f.eks. rapportkapitler, «Møter», «Programmering». Brukes i
          rapporten «Tid per leveranse».
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FormError message={error} />

        <ul className={pending ? 'opacity-60' : undefined}>
          {deliverables.length === 0 && (
            <li className="text-sm text-muted-foreground">Ingen kategorier ennå. Legg til én, eller start fra en mal.</li>
          )}
          {deliverables.map((d) => (
            <li key={d.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
              <span>{d.name}</span>
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Slett ${d.name}`}
                onClick={() => {
                  if (!window.confirm(`Slette kategorien «${d.name}»? Timer som er knyttet til den beholdes, men blir ukategorisert.`)) return;
                  startTransition(async () => {
                    setError(null);
                    const result = await deleteDeliverable(projectId, d.id);
                    if (!result.ok) setError(result.error);
                  });
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>

        <form
          action={async (formData) => {
            setError(null);
            const result = await createDeliverable(formData);
            if (!result.ok) setError(result.error);
            else (document.getElementById('deliverable-name') as HTMLInputElement | null)?.form?.reset();
          }}
          className="flex items-end gap-2"
        >
          <input type="hidden" name="project_id" value={projectId} />
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="deliverable-name">Ny kategori</Label>
            <Input id="deliverable-name" name="name" placeholder="F.eks. Befaring" required />
          </div>
          <SubmitButton variant="secondary">
            <Plus className="h-4 w-4" /> Legg til
          </SubmitButton>
        </form>

        <div className="flex flex-col gap-2">
          <Label>Start fra mal</Label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(DELIVERABLE_TEMPLATES) as DeliverableTemplateKey[]).map((key) => (
              <Button
                key={key}
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                title={DELIVERABLE_TEMPLATES[key].description}
                onClick={() =>
                  startTransition(async () => {
                    setError(null);
                    const result = await applyDeliverableTemplate(projectId, key);
                    if (!result.ok) setError(result.error);
                  })
                }
              >
                {DELIVERABLE_TEMPLATES[key].label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Kategorier som allerede finnes hoppes over.</p>
        </div>
      </CardContent>
    </Card>
  );
}
