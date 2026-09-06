'use client';

import { useEffect, useState } from 'react';
import { Clock, ChevronDown, ChevronUp, Minus, Plus } from 'lucide-react';
import { subDays } from 'date-fns';
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
import { formatHoursAndMinutes } from '@/lib/time/duration';
import { cn } from '@/lib/utils/cn';
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

/** Hurtigvalg for varighet – dekker de aller fleste registreringer i felt. */
const QUICK_MINUTES = [15, 30, 60, 120, 240, 480];

const lastMilestoneKey = (projectId: string) => `compro:lastMilestone:${projectId}`;

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
  const [milestoneId, setMilestoneId] = useState<string | undefined>(defaultMilestoneId);
  const [workDate, setWorkDate] = useState(todayIsoDate());
  const [minutes, setMinutes] = useState(60);
  const [error, setError] = useState<string | null>(null);

  const openMilestones = milestones.filter((m) => m.status !== 'completed');
  const selectable = openMilestones.length > 0 ? openMilestones : milestones;
  const otherMembers = members.filter((m) => m.id !== memberId);

  // Spec: «Milepæl: sist brukte». Leses først når dialogen åpnes (klient).
  useEffect(() => {
    if (!open || defaultMilestoneId) return;
    try {
      const saved = window.localStorage.getItem(lastMilestoneKey(projectId));
      if (saved && milestones.some((m) => m.id === saved)) setMilestoneId(saved);
    } catch {
      // localStorage kan være utilgjengelig (privat modus) – ufarlig.
    }
  }, [open, projectId, defaultMilestoneId, milestones]);

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const step = (delta: number) => setMinutes((m) => Math.max(5, Math.min(24 * 60, m + delta)));

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
            try {
              const chosen = String(formData.get('milestone_id') ?? '');
              if (chosen) window.localStorage.setItem(lastMilestoneKey(projectId), chosen);
            } catch {
              // ignorer
            }
            setOpen(false);
          }}
          className="flex flex-col gap-5"
        >
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="participant_mode" value={participantMode} />
          <input type="hidden" name="duration_mode" value={mode} />
          <input type="hidden" name="work_date" value={workDate} />
          {mode === 'hm' && (
            <>
              <input type="hidden" name="hours" value={hours} />
              <input type="hidden" name="minutes" value={mins} />
            </>
          )}
          {participantMode === 'all' &&
            otherMembers.map((m) => <input key={m.id} type="hidden" name="participant_ids" value={m.id} />)}

          {/* Dato: to trykk dekker 95 % av tilfellene */}
          <div className="flex flex-col gap-1.5">
            <Label>Dato</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Chip active={workDate === todayIsoDate()} onClick={() => setWorkDate(todayIsoDate())}>
                I dag
              </Chip>
              <Chip active={workDate === todayIsoDate(subDays(new Date(), 1))} onClick={() => setWorkDate(todayIsoDate(subDays(new Date(), 1)))}>
                I går
              </Chip>
              <Input
                type="date"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                className="h-9 w-auto flex-1 min-w-[9rem]"
                aria-label="Velg dato"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="milestone_id">Milepæl</Label>
            <Select name="milestone_id" value={milestoneId} onValueChange={setMilestoneId}>
              <SelectTrigger id="milestone_id" className="h-10">
                <SelectValue placeholder="Ingen (frittstående)" />
              </SelectTrigger>
              <SelectContent>
                {selectable.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Varighet */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Varighet</Label>
              <button
                type="button"
                onClick={() => setMode(mode === 'hm' ? 'start_end' : 'hm')}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                {mode === 'hm' ? 'Bruk start/slutt i stedet' : 'Bruk varighet i stedet'}
              </button>
            </div>

            {mode === 'hm' ? (
              <>
                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-2 py-2">
                  <Button type="button" variant="ghost" size="icon" className="h-11 w-11 rounded-full" onClick={() => step(-15)} aria-label="15 minutter mindre">
                    <Minus className="h-5 w-5" />
                  </Button>
                  <span className="text-2xl font-semibold tabular-nums">{formatHoursAndMinutes(minutes)}</span>
                  <Button type="button" variant="ghost" size="icon" className="h-11 w-11 rounded-full" onClick={() => step(15)} aria-label="15 minutter mer">
                    <Plus className="h-5 w-5" />
                  </Button>
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                  {QUICK_MINUTES.map((q) => (
                    <Chip key={q} active={minutes === q} onClick={() => setMinutes(q)} className="justify-center px-0">
                      {q < 60 ? `${q} min` : `${q / 60} t`}
                    </Chip>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Input name="start_time" type="time" required aria-label="Starttid" className="h-11 text-base" />
                <span className="text-sm text-muted-foreground">til</span>
                <Input name="end_time" type="time" required aria-label="Sluttid" className="h-11 text-base" />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Hva gjorde du?</Label>
            <Textarea id="description" name="description" rows={2} placeholder="Kort beskrivelse" className="text-base sm:text-sm" />
          </div>

          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
          >
            Flere valg {showMore ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {showMore && (
            <div className="flex flex-col gap-4 rounded-xl border border-border p-3">
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

              <div className="flex flex-col gap-1.5">
                <Label>Deltagere</Label>
                <div className="flex flex-wrap gap-2">
                  <Chip active={participantMode === 'single'} onClick={() => setParticipantMode('single')}>Individuelt</Chip>
                  <Chip active={participantMode === 'selected'} onClick={() => setParticipantMode('selected')}>Velg deltagere</Chip>
                  <Chip active={participantMode === 'all'} onClick={() => setParticipantMode('all')}>Hele teamet</Chip>
                </div>
                {participantMode === 'selected' && (
                  <div className="mt-1 flex max-h-32 flex-col gap-1 overflow-y-auto">
                    {otherMembers.map((m) => (
                      <label key={m.id} className="flex items-center gap-2 py-1 text-sm">
                        <input type="checkbox" name="participant_ids" value={m.id} className="h-4 w-4" />
                        {m.first_name} {m.last_name}
                      </label>
                    ))}
                  </div>
                )}
                {participantMode === 'all' && (
                  <p className="text-xs text-muted-foreground">
                    Registreres for alle {members.length} aktive medlemmer. Varigheten gjelder per person.
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

          {/* Person sendes alltid med, også når «Flere valg» er lukket */}
          {!showMore && memberId && <input type="hidden" name="member_id" value={memberId} />}

          <FormError message={error} />

          <DialogFooter>
            <SubmitButton className="h-11 w-full text-base sm:h-9 sm:w-auto sm:text-sm">Lagre</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Chip({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 items-center rounded-full border px-3 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-foreground hover:bg-muted',
        className,
      )}
    >
      {children}
    </button>
  );
}
