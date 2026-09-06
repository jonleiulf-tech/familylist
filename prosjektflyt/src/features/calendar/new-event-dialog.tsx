'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Milestone, ProjectMember, Task } from '@/types/database';
import { createCalendarEvent } from './actions';

interface Props {
  projectId: string;
  members: ProjectMember[];
  milestones: Milestone[];
  tasks: Task[];
  defaultDate?: string;
}

export function NewEventDialog({ projectId, members, milestones, tasks, defaultDate }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Ny hendelse
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ny kalenderhendelse</DialogTitle>
        </DialogHeader>
        <form
          action={async (formData) => {
            await createCalendarEvent(formData);
            setOpen(false);
          }}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="project_id" value={projectId} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Hva *</Label>
            <Input id="title" name="title" required />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="start_date">Dato</Label>
              <Input id="start_date" name="start_date" type="date" required defaultValue={defaultDate} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="start_time">Fra</Label>
              <Input id="start_time" name="start_time" type="time" defaultValue="09:00" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="end_time">Til</Label>
              <Input id="end_time" name="end_time" type="time" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="location">Sted</Label>
            <Input id="location" name="location" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Info</Label>
            <Textarea id="description" name="description" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="milestone_id">Milepæl</Label>
              <Select name="milestone_id">
                <SelectTrigger id="milestone_id">
                  <SelectValue placeholder="Ingen" />
                </SelectTrigger>
                <SelectContent>
                  {milestones.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task_id">Oppgave</Label>
              <Select name="task_id">
                <SelectTrigger id="task_id">
                  <SelectValue placeholder="Ingen" />
                </SelectTrigger>
                <SelectContent>
                  {tasks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Hvem</Label>
            <div className="flex max-h-32 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
              {members.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="participant_ids" value={m.id} />
                  {m.first_name} {m.last_name}
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="submit">Legg til hendelse</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
