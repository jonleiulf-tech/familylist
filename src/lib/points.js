// Plukkepoeng — etiketter, satser og motivasjon.
// Selve tildelingen skjer i databasen (triggere i plukkepoeng-migrasjonen);
// dette er kun visningslaget.

export const POINT_KINDS = {
  vare_godkjent: { label: 'Ny vare godkjent i fellesdatabasen', points: 25, icon: '🛒' },
  invitasjon_brukt: { label: 'Vervet en ny bruker', points: 50, icon: '🤝' },
  feil_fikset: { label: 'Meldt varefeil som ble rettet', points: 10, icon: '🔧' },
  tilbud_delt: { label: 'Delte ukens tilbud med fellesskapet', points: 15, icon: '📰' },
  tilbakemelding_løst: { label: 'Feilrapport som ble løst', points: 5, icon: '🐛' },
  bonus: { label: 'Bonus', points: null, icon: '⭐' },
};

/** Måtene å tjene poeng på, til «Slik tjener du»-listen. */
export const EARN_GUIDE = [
  { icon: '🤝', points: 50, text: 'Inviter noen som blir med — del lenke fra Lister-fanen' },
  { icon: '🛒', points: 25, text: 'Foreslå en ny vare som godkjennes til fellesdatabasen' },
  { icon: '📰', points: 15, text: 'Skann eller lim inn en kundeavis — tilbudene deles med alle (per butikk per uke)' },
  { icon: '🔧', points: 10, text: 'Meld feil på en vare (navn/pris) som blir rettet' },
  { icon: '🐛', points: 5, text: 'Rapporter en feil i appen som blir løst' },
];

/** Nivåer — rene hederstitler som gir progresjon å strekke seg etter. */
export const LEVELS = [
  { min: 0, name: 'Plukker' },
  { min: 50, name: 'Stødig plukker' },
  { min: 150, name: 'Handlehelt' },
  { min: 300, name: 'Listemester' },
  { min: 600, name: 'Plukkelegende' },
];

export function levelFor(total) {
  const level = [...LEVELS].reverse().find((l) => total >= l.min) ?? LEVELS[0];
  const next = LEVELS.find((l) => l.min > total) ?? null;
  return { ...level, next, toNext: next ? next.min - total : null };
}

// Motivasjonssetninger — velges deterministisk ut fra dato og poengsum, så
// meldingen ligger fast gjennom dagen i stedet for å flimre per visning.
const MOTIVATION = {
  fresh: [
    'Velkommen! Første poeng er alltid nærmest: inviter en du handler med. 🤝',
    'Fellesdatabasen bygges av folk som deg — foreslå en vare dere savner!',
    'Del handlelisten med familien, så plukker dere dobbelt så fort.',
  ],
  rolling: [
    'Bra driv! Hver vare du foreslår gjør appen bedre for alle. 🛒',
    'Du bidrar mer enn de fleste — fortsett, poengene renner inn.',
    'Neste nivå er innen rekkevidde. Et par bidrag til, så er du der!',
    'Noen sparte nettopp tid takket være bidragene dine. Ikke verst. ⭐',
  ],
  veteran: [
    'Du er blant dem som holder Plukkelisten skarp. Takk! 🏆',
    'Legendestatus bygges ett bidrag om gangen — og du er godt i gang.',
    'Fellesdatabasen hadde vært fattigere uten deg.',
  ],
};

export function motivation(total, date = new Date()) {
  const pool = total >= 150 ? MOTIVATION.veteran : total >= 25 ? MOTIVATION.rolling : MOTIVATION.fresh;
  const seed = date.getFullYear() * 366 + date.getMonth() * 31 + date.getDate() + Math.floor(total / 10);
  return pool[seed % pool.length];
}
