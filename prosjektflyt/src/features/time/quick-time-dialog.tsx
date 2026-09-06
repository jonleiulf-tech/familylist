'use client';

import { useState } from 'react';
import { Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormError } from '@/components/ui/form-error';
import { SubmitButton } from '@/components/ui/submit-button';
import type { Deliverable, Milestone, ProjectMember } from '@/types/database';
import { todayIsoDate } from '@/lib/dates/today';
import { createTimeEntry } from './actions';

interface Props {
  projectId: string;
  members: ProjectMember[];
  milestones: Milestone[];
  deliverables?: Deliverable[];
  currentMemberId: string | null;
  defaultMilestoneId?: string;
  trigger?: React.ReactNode;
}

export function QuickTimeDialog({
  projectId,
  members,
  milestones,
  deliverables = [],
  currentMemberId,
  defaultMilestoneId,
  trigger,
}: Props) {
  const [open, setOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [mode, setMode] = useState<'hm' | 'start_end'>('hm');
  const [participantMode, setParticipantMode] = useState<'single' | 'selected' | 'all'>('single');
  const [memberId, setMemberId] = useState<string | undefined>(currentMemberId ?? undefined);
  const [error, setError] = useState<string | null>(null);

  const openMilestones = milestones.filter((m) => m.status !== 'completed');
  const otherMembers = members.filter((m) => m.id !== memberId);

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
          <Button variant="secondary">
            <Clock className="h-4 w-4" /> Registrer tid
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrer arbeidstid</DialogTitle>
        </DialogHeader>
        <form
          action={async (formData) => {
            setError(null);
            const result = await createTimeEntry(formData);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setOpen(false);
          }}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="participant_mode" value={participantMode} />
          <input type="hidden" name="duration_mode" value={mode} />
          {participantMode === 'all' &&
            otherMembers.map((m) => <input key={m.id} type="hidden" name="participant_ids" value={m.id} />)}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="work_date">Dato</Label>
              <Input id="work_date" name="work_date" type="date" defaultValue={todayIsoDate()} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="member_id">Person</Label>
              <Select name="member_id" value={memberId} onValueChange={setMemberId} required>
                <SelectTrigger id="member_id">
                  <SelectValue placeholder="Velg person" />
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
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="milestone_id">Milepæl</Label>
            <Select name="milestone_id" defaultValue={defaultMilestoneId}>
              <SelectTrigger id="milestone_id">
                <SelectValue placeholder="Ingen (frittstående)" />
              </SelectTrigger>
              <SelectContent>
                {(openMilestones.length > 0 ? openMilestones : milestones).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Varighet</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={mode === 'hm' ? 'default' : 'outline'} onClick={() => setMode('hm')}>
                Timer/minutter
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === 'start_end' ? 'default' : 'outline'}
                onClick={() => setMode('start_end')}
              >
                Start/slutt
              </Button>
            </div>
            {mode === 'hm' ? (
              <div className="flex items-center gap-2">
                <Input name="hours" type="number" min={0} max={24} defaultValue={0} className="w-20" aria-label="Timer" />
                <span className="text-sm text-muted-foreground">t</span>
                <Input name="minutes" type="number" min={0} max={59} step={5} defaultValue={0} className="w-20" aria-label="Minutter" />
                <span className="text-sm text-muted-foreground">min</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Input name="start_time" type="time" required aria-label="Starttid" />
                <span className="text-sm text-muted-foreground">til</span>
                <Input name="end_time" type="time" required aria-label="Sluttid" />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Hva gjorde du?</Label>
            <Textarea id="description" name="description" rows={2} placeholder="Kort beskrivelse" />
          </div>

          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            Flere valg {showMore ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {showMore && (
            <div className="flex flex-col gap-4 rounded-md border border-border p-3">
              <div className="flex flex-col gap-1.5">
                <Label>Deltagere</Label>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant={participantMode === 'single' ? 'default' : 'outline'} onClick={() => setParticipantMode('single')}>
                    Individuelt
                  </Button>
                  <Button type="button" size="sm" variant={participantMode === 'selected' ? 'default' : 'outline'} onClick={() => setParticipantMode('selected')}>
                    Velg deltagere
                  </Button>
                  <Button type="button" size="sm" variant={participantMode === 'all' ? 'default' : 'outline'} onClick={() => setParticipantMode('all')}>
                    Hele teamet
                  </Button>
                </div>
                {participantMode === 'selected' && (
                  <div className="mt-2 flex max-h-32 flex-col gap-1 overflow-y-auto">
                    {otherMembers.map((m) => (
                      <label key={m.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="participant_ids" value={m.id} />
                        {m.first_name} {m.last_name}
                      </label>
                    ))}
                  </div>
                )}
                {participantMode === 'all' && (
                  <p className="text-xs text-muted-foreground">
                    Registreres for alle {members.length} aktive medlemmer. Varigheten gjelder per person (møte på 1 t
                    med {members.length} deltagere = {members.length} t arbeidsinnsats).
                  </p>
                )}
              </div>

              {deliverables.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="deliverable_id">Leveranse / kategori</Label>
                  <Select name="deliverable_id">
                    <SelectTrigger id="deliverable_id">
                      <SelectValue placeholder="Ikke kategorisert" />
                    </SelectTrigger>
                    <SelectContent>
                      {deliverables.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <FormError message={error} />

          <DialogFooter>
            <SubmitButton>Lagre</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
