'use client';

import { useState } from 'react';
import { Clock, ChevronDown, ChevronUp } from 'lucide-react';
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
import { createTimeEntry } from './actions';

interface Props {
  projectId: string;
  members: ProjectMember[];
  milestones: Milestone[];
  currentMemberId: string | null;
  defaultMilestoneId?: string;
  trigger?: React.ReactNode;
}

const today = () => new Date().toISOString().slice(0, 10);

export function QuickTimeDialog({ projectId, members, milestones, currentMemberId, defaultMilestoneId, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [mode, setMode] = useState<'hm' | 'start_end'>('hm');
  const [participantMode, setParticipantMode] = useState<'single' | 'selected' | 'all'>('single');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
            await createTimeEntry(formData);
            setOpen(false);
          }}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="participant_mode" value={participantMode} />
          <input type="hidden" name="duration_mode" value={mode} />

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="work_date">Dato</Label>
              <Input id="work_date" name="work_date" type="date" defaultValue={today()} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="member_id">Person</Label>
              <Select name="member_id" defaultValue={currentMemberId ?? undefined}>
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
                {milestones.map((m) => (
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
              <div className="flex gap-2">
                <Input name="hours" type="number" min={0} defaultValue={0} className="w-20" aria-label="Timer" />
                <span className="self-center text-sm text-muted-foreground">t</span>
                <Input name="minutes" type="number" min={0} max={59} defaultValue={0} className="w-20" aria-label="Minutter" />
                <span className="self-center text-sm text-muted-foreground">min</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Input name="start_time" type="time" required />
                <span className="text-sm text-muted-foreground">til</span>
                <Input name="end_time" type="time" required />
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
            <div className="flex flex-col gap-3 rounded-md border border-border p-3">
              <div className="flex flex-col gap-1.5">
                <Label>Deltagere</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={participantMode === 'single' ? 'default' : 'outline'}
                    onClick={() => setParticipantMode('single')}
                  >
                    Individuelt
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={participantMode === 'selected' ? 'default' : 'outline'}
                    onClick={() => setParticipantMode('selected')}
                  >
                    Velg deltagere
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={participantMode === 'all' ? 'default' : 'outline'}
                    onClick={() => setParticipantMode('all')}
                  >
                    Hele teamet
                  </Button>
                </div>
                {(participantMode === 'selected' || participantMode === 'all') && (
                  <div className="mt-2 flex max-h-32 flex-col gap-1 overflow-y-auto">
                    {members
                      .filter((m) => m.id !== currentMemberId)
                      .map((m) => (
                        <label key={m.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            name="participant_ids"
                            value={m.id}
                            defaultChecked={participantMode === 'all'}
                          />
                          {m.first_name} {m.last_name}
                        </label>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="submit">Lagre</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
