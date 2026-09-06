/* Tilstanden til en idrettsgruppe.

   Gruppene hadde et enkelt av/på-flagg: `active`. Det holdt så lenge en
   gruppe enten fantes eller ikke fantes. Men en gruppe som legges ned er
   ikke det samme som en gruppe som aldri har eksistert – historikken,
   bildene og nyhetene er verdt å ta vare på, og noen skal kunne starte
   den opp igjen. Derfor tre tilstander:

     aktiv    Vises overalt. Treninger i kalenderen, Spond-knapp, alt.
     pauset   Siden og historikken står, men gruppa er ikke i drift.
              Ingen treninger, ingen Spond-knapp; i stedet en beskjed om
              hvordan man kan ta den opp igjen.
     skjult   Vises ingen steder. For grupper som aldri kom i gang, eller
              som er under planlegging.

   Gamle rader har bare `active`, og skal fortsatt leses riktig. */

export const STATUSER = ['aktiv', 'pauset', 'skjult'];

export function statusAv(sport) {
  const s = sport?.status;
  if (STATUSER.includes(s)) return s;
  // Ingen status satt: da er det den gamle boolean-en som gjelder.
  return sport?.active === false ? 'skjult' : 'aktiv';
}

export const erAktiv = (sport) => statusAv(sport) === 'aktiv';
export const erPauset = (sport) => statusAv(sport) === 'pauset';

/* Har gruppa fortsatt en side på nettstedet? Pausede grupper har det –
   det er hele poenget med pause framfor sletting. */
export const erSynlig = (sport) => statusAv(sport) !== 'skjult';

/* `active`-kolonnen i databasen skrives fortsatt, for den leses av
   kalenderfeeden og av alt som ikke er oppdatert ennå. Bare aktive
   grupper er `true`: en pauset gruppe skal ikke lage kalenderoppføringer. */
export const aktivFlagg = (status) => status === 'aktiv';

/* Teksten som står på en pauset gruppes side.

   Malen kan settes per gruppe, eller sentralt under Innstillinger. To
   plassholdere fylles ut her, slik at den sentrale teksten kan brukes for
   alle gruppene uten at noen må skrive navnet inn for hånd. */
export function pausetekst(mal, { gruppe, epost }) {
  if (!mal) return '';
  return String(mal)
    .replaceAll('{gruppe}', gruppe || '')
    .replaceAll('{epost}', epost || '')
    .trim();
}
