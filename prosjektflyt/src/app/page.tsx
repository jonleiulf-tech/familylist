import Link from 'next/link';
import {
  GanttChartSquare,
  ListChecks,
  Clock,
  CalendarDays,
  Users,
  BarChart3,
  ArrowRight,
  CheckCircle2,
  Compass,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ComProLogo, ComProMark } from '@/components/brand/logo';

export const metadata = {
  title: { absolute: 'ComPro – communication and projects' },
  description:
    'Enkel, rask og oversiktlig prosjektkoordinering for små og mellomstore prosjekter: milepæler, Gantt, oppgaver, timeføring, kalender og rapporter – samlet.',
};

const FEATURES = [
  {
    icon: GanttChartSquare,
    title: 'Fremdrift og Gantt',
    text: 'Planlagt og faktisk periode side om side, fremdrift i prosent og forsinkelser markert. Dag-, uke- eller månedsvisning.',
  },
  {
    icon: ListChecks,
    title: 'Oppgaver',
    text: 'Liste, kanban og «mine oppgaver». Frittstående TODO-er, eller koblet til milepæl – og ett klikk for å gjøre en oppgave om til en milepæl.',
  },
  {
    icon: Clock,
    title: 'Timeføring på 10 sekunder',
    text: '«4 t 15 min» eller 08:00–12:15. Individuelt eller for hele teamet – gruppetid og arbeidsinnsats holdes fra hverandre automatisk.',
  },
  {
    icon: CalendarDays,
    title: 'Kalender',
    text: 'Byggemøter, befaringer og frister koblet til milepæler og oppgaver. Måned, uke eller agenda.',
  },
  {
    icon: Users,
    title: 'Team',
    text: 'Hvem gjør hva, hvor mye tid hver enkelt har lagt ned, og hvordan arbeidet er fordelt.',
  },
  {
    icon: BarChart3,
    title: 'Rapporter og prosjekthelse',
    text: 'Planlagt vs. registrert tid per milepæl, avvik i timer og prosent, og en ukesrapport generert fra faktiske data – ikke fra magefølelsen.',
  },
];

const STEPS = [
  { step: '1', title: 'Opprett prosjekt og team', text: 'Navn, kunde, datoer. Inviter medlemmene på e-post.' },
  { step: '2', title: 'Legg inn milepæler og oppgaver', text: 'Planlagt start og slutt, ansvarlig og estimert tid.' },
  { step: '3', title: 'Registrer tid underveis', text: 'Fra hvilken som helst side, på mobil eller desktop.' },
  { step: '4', title: 'Se status på dashboardet', text: 'Grønn, gul eller rød – alltid med forklaring på hvorfor.' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <ComProLogo markClassName="h-9 w-9" wordmarkHeight={18} />
          <nav className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/logg-inn">Logg inn</Link>
            </Button>
            <Button asChild className="hidden sm:inline-flex">
              <Link href="/logg-inn?modus=registrer">
                Kom i gang <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-6 pb-16 pt-20 md:pb-24 md:pt-28">
          <div className="max-w-3xl">
            <p className="mb-4 text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Communication and projects
            </p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
              Se hva som er planlagt, hva som er gjort – og hva som skjer videre.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
              ComPro samler milepæler, oppgaver, timeføring, kalender og team i én rolig oversikt. Laget for
              byggeprosjekter, studentprosjekter, konsulentoppdrag og interne prosjekter – uten regneark.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link href="/logg-inn?modus=registrer">
                  Opprett gratis konto <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/logg-inn">
                  <Compass className="h-4 w-4" /> Utforsk eksempelprosjektet
                </Link>
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Eksempelprosjektet «Nytt kontor i Skien» med Ola og Kari Nordmann er ferdig utfylt – ett klikk etter
              innlogging.
            </p>
          </div>
        </section>

        {/* Dashboard-illustrasjon (ren CSS/SVG, ingen skjermbilder å vedlikeholde) */}
        <section className="mx-auto max-w-6xl px-6">
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
              <span className="ml-3">compro.no / prosjekter / nytt-kontor-i-skien / oversikt</span>
            </div>
            <div className="grid gap-4 p-4 md:grid-cols-[1fr_2fr] md:p-6">
              <div className="flex flex-col gap-3">
                <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm font-medium text-warning">
                  Gul – 2 oppgaver er forfalt og én milepæl ligger 1 uke etter plan.
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['13', 'Åpne oppgaver'],
                    ['2', 'Forfalte'],
                    ['2', 'Milepæler i gang'],
                    ['1', 'Forsinket'],
                  ].map(([value, label]) => (
                    <div key={label} className="rounded-md border border-border p-3">
                      <div className="text-2xl font-semibold">{value}</div>
                      <div className="text-xs text-muted-foreground">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-md border border-border p-3">
                <div className="mb-3 text-xs font-medium text-muted-foreground">Fremdrift · uke</div>
                <div className="flex flex-col gap-2.5">
                  {[
                    ['Forprosjekt', 2, 22, 100, false],
                    ['Rammesøknad', 22, 20, 100, true],
                    ['Riving og klargjøring', 40, 20, 100, false],
                    ['Elektro og datakabling', 58, 26, 65, true],
                    ['Skillevegger og glass', 70, 26, 40, false],
                    ['Møbler og innredning', 88, 12, 0, false],
                  ].map(([title, start, width, progress, overdue]) => (
                    <div key={title as string} className="grid grid-cols-[9rem_1fr] items-center gap-3 text-xs">
                      <span className="truncate">{title as string}</span>
                      <div className="relative h-5">
                        <div
                          className="absolute top-0 h-2 rounded-sm bg-plan"
                          style={{ left: `${start}%`, width: `${width}%` }}
                        />
                        <div
                          className={`absolute top-2.5 h-2 rounded-sm ${overdue ? 'bg-overdue' : 'bg-actual'}`}
                          style={{
                            left: `${start}%`,
                            width: `${Math.max(2, ((width as number) * (progress as number)) / 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-4 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-plan" /> Planlagt</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-actual" /> Faktisk</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-overdue" /> Utover plan</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Alt du trenger. Ingenting du ikke trenger.</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Informasjon registreres én gang og gjenbrukes overalt: en time registrert mot en milepæl vises i
            dashboardet, i teamoversikten, i milepælens avvik og i ukesrapporten.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-lg border border-border bg-card p-5">
                <f.icon className="h-5 w-5 text-primary" />
                <h3 className="mt-3 font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Slik fungerer det */}
        <section className="border-y border-border bg-muted/30">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Slik fungerer det</h2>
            <div className="mt-10 grid gap-8 md:grid-cols-4">
              {STEPS.map((s) => (
                <div key={s.step}>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {s.step}
                  </div>
                  <h3 className="mt-3 font-semibold">{s.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Hvorfor */}
        <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <div className="grid gap-10 md:grid-cols-2 md:items-center">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Laget for å erstatte regnearket</h2>
              <p className="mt-3 text-muted-foreground">
                ComPro er bygget rundt en velprøvd prosjektmodell fra Excel – men uten dens svakheter. Ingen
                radgrenser, ingen formler som peker feil, ingen «4,15 timer» som egentlig var 4 timer og 15 minutter.
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {[
                  'Ekte datoer og ISO-uker – fungerer over nyttår',
                  'Tid lagres i hele minutter, vises som «4 t 15 min»',
                  'Individuell tid og gruppetid holdes fra hverandre',
                  'Alt kobles med ID-er, aldri med tekst i en celle',
                  'Tilgangsstyring per prosjekt: eier, prosjektleder, medlem, leser',
                  'Norsk i hele grensesnittet',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <ComProMark className="h-12 w-12" />
              <p className="mt-4 text-lg font-medium leading-snug">
                «Jeg åpner prosjektet og ser umiddelbart: hva vi skulle gjøre, hva vi faktisk har gjort, hvem som gjør
                hva, hvor mye tid vi bruker, hva som er forsinket – og hva som skjer videre.»
              </p>
              <p className="mt-3 text-sm text-muted-foreground">Det er hele ideen.</p>
              <Button className="mt-6" asChild>
                <Link href="/logg-inn?modus=registrer">
                  Kom i gang <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 py-8 text-sm text-muted-foreground md:flex-row md:items-center">
          <ComProLogo markClassName="h-6 w-6" wordmarkHeight={12} />
          <p>ComPro · communication and projects · compro.no</p>
        </div>
      </footer>
    </div>
  );
}
