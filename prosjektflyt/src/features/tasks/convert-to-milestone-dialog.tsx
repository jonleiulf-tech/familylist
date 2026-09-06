'use client';

import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FormError } from '@/components/ui/form-error';
import { SubmitButton } from '@/components/ui/submit-button';
import type { Task } from '@/types/database';
import { convertTaskToMilestone } from './actions';

export function ConvertToMilestoneDialog({ projectId, task }: { projectId: string; task: Task }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowUpRight className="h-3 w-3" /> Gjør om til milepæl
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gjør «{task.title}» om til en milepæl</DialogTitle>
        </DialogHeader>
        <form
          action={async (formData) => {
            setError(null);
            const result = await convertTaskToMilestone(formData);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setOpen(false);
          }}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="task_id" value={task.id} />
          <p className="text-sm text-muted-foreground">
            Tittel, beskrivelse, ansvarlig og datoer gjenbrukes automatisk fra oppgaven. Oppgaven kobles til den nye
            milepælen.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="estimated_hours">Estimert timebruk</Label>
            <Input id="estimated_hours" name="estimated_hours" type="number" min={0} step={0.5} />
          </div>
          <FormError message={error} />
          <DialogFooter>
            <SubmitButton>Opprett milepæl</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
