'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormError } from '@/components/ui/form-error';
import { SubmitButton } from '@/components/ui/submit-button';
import type { Milestone, ProjectMember } from '@/types/database';
import { MILESTONE_STATUS, MILESTONE_STATUS_LABELS, PRIORITY, PRIORITY_LABELS } from '@/types/enums';
import { createMilestone, updateMilestone } from './actions';

interface Props {
  projectId: string;
  members: ProjectMember[];
  milestone?: Milestone;
  trigger?: React.ReactNode;
}

export function MilestoneFormDialog({ projectId, members, milestone, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(milestone);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="h-4 w-4" /> Ny milepæl
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Rediger milepæl' : 'Ny milepæl'}</DialogTitle>
        </DialogHeader>
        <form
          action={async (formData) => {
            setError(null);
            const result = milestone ? await updateMilestone(milestone.id, formData) : await createMilestone(formData);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setOpen(false);
          }}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="project_id" value={projectId} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Tittel *</Label>
            <Input id="title" name="title" required defaultValue={milestone?.title} autoFocus={!isEdit} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Beskrivelse</Label>
            <Textarea id="description" name="description" rows={2} defaultValue={milestone?.description ?? ''} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="responsible_member_id">Ansvarlig</Label>
              <Select name="responsible_member_id" defaultValue={milestone?.responsible_member_id ?? undefined}>
                <SelectTrigger id="responsible_member_id">
                  <SelectValue placeholder="Ikke satt" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.first_name} {m.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="priority">Prioritet</Label>
              <Select name="priority" defaultValue={milestone?.priority ?? 'medium'}>
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-xs font-medium text-muted-foreground">Planlagt</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="planned_start_date">Start</Label>
              <Input id="planned_start_date" name="planned_start_date" type="date" defaultValue={milestone?.planned_start_date ?? ''} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="planned_end_date">Slutt</Label>
              <Input id="planned_end_date" name="planned_end_date" type="date" defaultValue={milestone?.planned_end_date ?? ''} />
            </div>
          </div>

          <p className="text-xs font-medium text-muted-foreground">Faktisk</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="actual_start_date">Start</Label>
              <Input id="actual_start_date" name="actual_start_date" type="date" defaultValue={milestone?.actual_start_date ?? ''} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="actual_end_date">Slutt</Label>
              <Input id="actual_end_date" name="actual_end_date" type="date" defaultValue={milestone?.actual_end_date ?? ''} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="estimated_hours">Estimerte timer (totalt)</Label>
              <Input id="estimated_hours" name="estimated_hours" type="number" min={0} step={0.5} defaultValue={milestone?.estimated_hours ?? ''} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="estimated_hours_per_week">Estimert timer/uke</Label>
              <Input id="estimated_hours_per_week" name="estimated_hours_per_week" type="number" min={0} step={0.5} defaultValue={milestone?.estimated_hours_per_week ?? ''} />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Planlagt tid = «Estimerte timer» hvis satt, ellers timer/uke × planlagt varighet (Excel-modellen).
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="status">Status</Label>
              <Select name="status" defaultValue={milestone?.status ?? 'not_started'}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MILESTONE_STATUS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {MILESTONE_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="progress_percent">Prosent fullført</Label>
              <Input id="progress_percent" name="progress_percent" type="number" min={0} max={100} step={5} defaultValue={milestone?.progress_percent ?? 0} />
            </div>
          </div>

          <FormError message={error} />

          <DialogFooter>
            <SubmitButton>{isEdit ? 'Lagre' : 'Opprett milepæl'}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
