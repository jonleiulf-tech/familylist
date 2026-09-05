/* Hva en innlogget person får gjøre i /admin. Speiler RLS i
   supabase/migrations/0002_roller_innhold.sql, men bare for å vise riktige menyer og knapper.
   Databasen avgjør uansett. */

export const ROLES = {
  psi_admin: { label: 'PSI-admin', short: 'Admin', desc: 'Alt: alle grupper, tekster, partnere og tilgang.' },
  group_leader: { label: 'Gruppeleder', short: 'Leder', desc: 'Egen gruppe: info, tider, nyheter, arrangementer, bilder og hvem som er med.' },
  group_member: { label: 'Gruppemedlem', short: 'Medlem', desc: 'Kan logge inn og se, men ikke endre.' },
};

export function accessFrom(raw) {
  const a = raw || {};
  const isAdmin = a.is_admin === true;
  const leaderOf = Array.isArray(a.leader_of) ? a.leader_of : [];
  const memberOf = Array.isArray(a.member_of) ? a.member_of : [];
  const canManage = (slug) => isAdmin || (slug ? leaderOf.includes(slug) : false);
  const canSee = (slug) => canManage(slug) || (slug ? memberOf.includes(slug) : false);
  return {
    email: a.email || '',
    name: a.name || null,
    isAdmin,
    leaderOf,
    memberOf,
    hasAccess: isAdmin || leaderOf.length > 0 || memberOf.length > 0,
    canEdit: isAdmin || leaderOf.length > 0,
    canManage,
    canSee,
    /* Gruppene som skal ligge i menyen, i den rekkefølgen sports har. */
    visibleSports: (sports) => (isAdmin ? sports : sports.filter((s) => canSee(s.slug))),
    /* Grupper man kan velge når man lager nyhet/arrangement. null = hele PSI. */
    scopeOptions: (sports) => [
      ...(isAdmin ? [{ value: '', label: 'Hele PSI' }] : []),
      ...sports.filter((s) => canManage(s.slug)).map((s) => ({ value: s.slug, label: s.name })),
    ],
    roleLabel: isAdmin ? ROLES.psi_admin.label : leaderOf.length ? ROLES.group_leader.label : memberOf.length ? ROLES.group_member.label : 'Ingen tilgang',
  };
}
