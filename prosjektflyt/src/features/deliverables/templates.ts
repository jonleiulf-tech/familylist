/**
 * Maler for leveransekategorier. Excel-malens faste liste med rapportkapitler
 * er generalisert: et prosjekt definerer egne kategorier, og disse malene er
 * bare hurtigstart.
 */
export const DELIVERABLE_TEMPLATES = {
  usn_rapport: {
    label: 'USN rapport (studentprosjekt)',
    description: 'Kapittelstrukturen fra den opprinnelige Excel-malen.',
    items: [
      'Sammendrag',
      'Summary',
      'Forord',
      'Nomenklaturliste',
      '1. Innledning',
      '2. Hoveddel',
      '3. Resultater',
      '4. Diskusjon',
      '5. Konklusjon',
      'Referanser',
      'Vedlegg',
    ],
  },
  bygg: {
    label: 'Byggeprosjekt',
    description: 'Typiske arbeidskategorier i mindre byggeprosjekter.',
    items: ['Prosjektering', 'Møter', 'Befaring', 'Innkjøp', 'Utførelse', 'Dokumentasjon'],
  },
  utvikling: {
    label: 'Utviklings-/konsulentprosjekt',
    description: 'Kategorier for programvare- og konsulentarbeid.',
    items: ['Analyse', 'Møter', 'Design', 'Programmering', 'Testing', 'Dokumentasjon', 'Opplæring'],
  },
} as const;

export type DeliverableTemplateKey = keyof typeof DELIVERABLE_TEMPLATES;
