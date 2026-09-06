'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { createProject } from './actions';

export function NewProjectDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Nytt prosjekt
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Opprett nytt prosjekt</DialogTitle>
        </DialogHeader>
        <form action={createProject} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Prosjektnavn *</Label>
            <Input id="name" name="name" required placeholder="F.eks. Nytt kontor" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project_number">Prosjektnummer</Label>
              <Input id="project_number" name="project_number" placeholder="PRJ-001" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="client_name">Kunde/oppdragsgiver</Label>
              <Input id="client_name" name="client_name" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="start_date">Startdato</Label>
              <Input id="start_date" name="start_date" type="date" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="planned_end_date">Planlagt sluttdato</Label>
              <Input id="planned_end_date" name="planned_end_date" type="date" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="color">Prosjektfarge</Label>
            <Input id="color" name="color" type="color" defaultValue="#2563eb" className="h-9 w-16 p-1" />
          </div>
          <DialogFooter>
            <Button type="submit">Opprett prosjekt</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
