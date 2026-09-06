'use client';

import { useMemo, useState } from 'react';
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { nb } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { formatDateTime, formatTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { CalendarEvent, Milestone, ProjectMember, Task } from '@/types/database';
import { NewEventDialog } from './new-event-dialog';
import { deleteCalendarEvent } from './actions';

interface Props {
  projectId: string;
  events: CalendarEvent[];
  members: ProjectMember[];
  milestones: Milestone[];
  tasks: Task[];
}

export function CalendarClient({ projectId, events, members, milestones, tasks }: Props) {
  const [cursor, setCursor] = useState(new Date());

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end: endOfWeek(cursor, { weekStartsOn: 1 }) });
  }, [cursor]);

  const eventsOn = (day: Date) => events.filter((e) => isSameDay(parseISO(e.start_datetime), day));

  const eventDetail = (event: CalendarEvent) => {
    const milestone = milestones.find((m) => m.id === event.milestone_id);
    const task = tasks.find((t) => t.id === event.task_id);
    return (
      <div key={event.id} className="rounded-md border border-border p-2 text-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-medium">{event.title}</div>
            <div className="text-xs text-muted-foreground">
              {formatTime(event.start_datetime)}
              {event.end_datetime && ` – ${formatTime(event.end_datetime)}`}
              {event.location && ` · ${event.location}`}
            </div>
            {(milestone || task) && (
              <div className="mt-1 text-xs text-muted-foreground">
                {milestone && `Milepæl: ${milestone.title}`} {task && `Oppgave: ${task.title}`}
              </div>
            )}
          </div>
          <button onClick={() => deleteCalendarEvent(projectId, event.id)} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Kalender</h1>
        <NewEventDialog
          projectId={projectId}
          members={members}
          milestones={milestones}
          tasks={tasks}
          defaultDate={format(new Date(), 'yyyy-MM-dd')}
        />
      </div>

      <Tabs defaultValue="maned">
        <TabsList>
          <TabsTrigger value="maned">Måned</TabsTrigger>
          <TabsTrigger value="uke">Uke</TabsTrigger>
          <TabsTrigger value="agenda">Agenda</TabsTrigger>
        </TabsList>

        <TabsContent value="maned">
          <div className="mb-2 flex items-center justify-between">
            <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-medium capitalize">{format(cursor, 'MMMM yyyy', { locale: nb })}</span>
            <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-xs">
            {['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'].map((d) => (
              <div key={d} className="p-1 text-center font-medium text-muted-foreground">
                {d}
              </div>
            ))}
            {monthDays.map((day) => {
              const dayEvents = eventsOn(day);
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'flex min-h-20 flex-col gap-0.5 rounded-md border border-border p-1',
                    !isSameMonth(day, cursor) && 'opacity-40',
                    isSameDay(day, new Date()) && 'border-primary',
                  )}
                >
                  <span className="text-right text-muted-foreground">{format(day, 'd')}</span>
                  {dayEvents.slice(0, 3).map((e) => (
                    <span key={e.id} className="truncate rounded bg-primary/10 px-1 text-primary">
                      {e.title}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="uke">
          <div className="mb-2 flex items-center justify-between">
            <Button variant="outline" size="icon" onClick={() => setCursor(addWeeks(cursor, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-medium">Uke {format(cursor, 'I, yyyy')}</span>
            <Button variant="outline" size="icon" onClick={() => setCursor(addWeeks(cursor, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
            {weekDays.map((day) => (
              <div key={day.toISOString()} className="flex flex-col gap-1">
                <div className="text-xs font-medium text-muted-foreground">{format(day, 'EEE d. MMM', { locale: nb })}</div>
                {eventsOn(day).map(eventDetail)}
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="agenda">
          <div className="flex flex-col gap-2">
            {events.length === 0 && <p className="text-sm text-muted-foreground">Ingen kommende hendelser.</p>}
            {events
              .slice()
              .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime))
              .map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
                  <div>
                    <div className="font-medium">{e.title}</div>
                    <div className="text-xs text-muted-foreground">{formatDateTime(e.start_datetime)}</div>
                  </div>
                  <button onClick={() => deleteCalendarEvent(projectId, e.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
