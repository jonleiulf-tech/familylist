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
import type { Milestone, ProjectMember } from '@/types/database';
import { createTask } from './actions';

interface Props {
  projectId: string;
  members: ProjectMember[];
  milestones: Milestone[];
  defaultMilestoneId?: string;
  trigger?: React.ReactNode;
}

export function QuickTaskDialog({ projectId, members, milestones, defaultMilestoneId, trigger }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="h-4 w-4" /> Oppgave
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ny oppgave</DialogTitle>
        </DialogHeader>
        <form
          action={async (formData) => {
            await createTask(formData);
            setOpen(false);
          }}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="project_id" value={projectId} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Oppgave *</Label>
            <Input id="title" name="title" required autoFocus placeholder="Hva skal gjøres?" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Beskrivelse</Label>
            <Textarea id="description" name="description" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="assignee_id">Hvem</Label>
              <Select name="assignee_id">
                <SelectTrigger id="assignee_id">
                  <SelectValue placeholder="Ikke tildelt" />
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
              <Select name="priority" defaultValue="medium">
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Lav</SelectItem>
                  <SelectItem value="medium">Middels</SelectItem>
                  <SelectItem value="high">Høy</SelectItem>
                  <SelectItem value="critical">Kritisk</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="start_date">Fra når</Label>
              <Input id="start_date" name="start_date" type="date" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="due_date">Til når (frist)</Label>
              <Input id="due_date" name="due_date" type="date" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="milestone_id">Tilhører milepæl</Label>
            <Select name="milestone_id" defaultValue={defaultMilestoneId}>
              <SelectTrigger id="milestone_id">
                <SelectValue placeholder="Frittstående TODO" />
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
          <DialogFooter>
            <Button type="submit">Opprett oppgave</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
