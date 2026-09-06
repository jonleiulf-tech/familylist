'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormError } from '@/components/ui/form-error';
import { SubmitButton } from '@/components/ui/submit-button';
import { PROJECT_MEMBER_ROLE, PROJECT_MEMBER_ROLE_LABELS } from '@/types/enums';
import { inviteMember } from './actions';

export function InviteMemberDialog({ projectId }: { projectId: string }) {
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
        <Button>
          <UserPlus className="h-4 w-4" /> Inviter medlem
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inviter prosjektmedlem</DialogTitle>
        </DialogHeader>
        <form
          action={async (formData) => {
            setError(null);
            const result = await inviteMember(formData);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setOpen(false);
          }}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="project_id" value={projectId} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="first_name">Fornavn *</Label>
              <Input id="first_name" name="first_name" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="last_name">Etternavn</Label>
              <Input id="last_name" name="last_name" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">E-post *</Label>
            <Input id="email" name="email" type="email" required />
            <p className="text-xs text-muted-foreground">
              Har personen allerede en ComPro-konto med denne e-posten, får de tilgang umiddelbart. Ellers kobles de
              automatisk når de registrerer seg med samme adresse.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="role">Rolle i systemet</Label>
              <Select name="role" defaultValue="member">
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_MEMBER_ROLE.map((role) => (
                    <SelectItem key={role} value={role}>
                      {PROJECT_MEMBER_ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project_role_title">Prosjektrolle</Label>
              <Input id="project_role_title" name="project_role_title" placeholder="F.eks. Byggeleder" />
            </div>
          </div>
          <FormError message={error} />
          <DialogFooter>
            <SubmitButton>Legg til medlem</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
