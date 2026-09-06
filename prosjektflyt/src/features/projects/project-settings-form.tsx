'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormError } from '@/components/ui/form-error';
import { SubmitButton } from '@/components/ui/submit-button';
import type { Project } from '@/types/database';
import { PROJECT_STATUS, PROJECT_STATUS_LABELS } from '@/types/enums';
import { updateProject } from './actions';

export function ProjectSettingsForm({ project }: { project: Project }) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <form
      action={async (formData) => {
        setError(null);
        setSaved(false);
        const result = await updateProject(formData);
        if (!result.ok) setError(result.error);
        else setSaved(true);
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="project_id" value={project.id} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Prosjektnavn</Label>
        <Input id="name" name="name" defaultValue={project.name} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project_number">Prosjektnummer</Label>
          <Input id="project_number" name="project_number" defaultValue={project.project_number ?? ''} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="client_name">Kunde/oppdragsgiver</Label>
          <Input id="client_name" name="client_name" defaultValue={project.client_name ?? ''} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Beskrivelse</Label>
        <Textarea id="description" name="description" defaultValue={project.description ?? ''} rows={3} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="start_date">Startdato</Label>
          <Input id="start_date" name="start_date" type="date" defaultValue={project.start_date ?? ''} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="planned_end_date">Planlagt slutt</Label>
          <Input id="planned_end_date" name="planned_end_date" type="date" defaultValue={project.planned_end_date ?? ''} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="actual_end_date">Faktisk slutt</Label>
          <Input id="actual_end_date" name="actual_end_date" type="date" defaultValue={project.actual_end_date ?? ''} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status">Status</Label>
          <Select name="status" defaultValue={project.status}>
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_STATUS.map((status) => (
                <SelectItem key={status} value={status}>
                  {PROJECT_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="color">Prosjektfarge</Label>
          <Input id="color" name="color" type="color" defaultValue={project.color} className="h-9 w-16 p-1" />
        </div>
      </div>
      <FormError message={error} />
      {saved && <p role="status" className="text-sm text-success">Endringene er lagret.</p>}
      <SubmitButton className="w-fit">Lagre endringer</SubmitButton>
    </form>
  );
}
