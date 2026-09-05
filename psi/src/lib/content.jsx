import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as file from '../data/psi.js';
import { supabase, hasBackend } from './supabase.js';

/* Ett sted alle sider henter innhold fra.

   Start: innholdet i src/data/psi.js, så siden tegnes umiddelbart.
   Med Supabase: tabellene `content` (site, organization, stats, partners)
   og `sports` leses og legges over. Har databasen ingen rader ennå,
   brukes fila. Sidene bryr seg ikke om hvilken kilde det er. */

export function fileContent() {
  return {
    site: file.site,
    organization: file.organization,
    stats: file.stats,
    partners: file.partners,
    sports: file.sports,
  };
}

/* Ren funksjon, testet for seg: databaserader over filinnhold. */
export function mergeContent(base, rows) {
  const out = { ...base };
  for (const row of rows.content || []) {
    if (row.key in out && row.value != null) out[row.key] = row.value;
  }
  if (rows.sports && rows.sports.length > 0) {
    out.sports = [...rows.sports]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((r) => ({ ...r.data, slug: r.slug, active: r.active, sort_order: r.sort_order }));
  }
  return out;
}

export function derive(content) {
  const activeSports = content.sports.filter((s) => s.active);
  const findSport = (slug) => activeSports.find((s) => s.slug === slug) || null;
  const weeklySchedule = () => {
    const rows = [];
    for (const s of activeSports) for (const slot of s.schedule || []) rows.push({ ...slot, sport: s });
    return rows.sort((a, b) => a.day - b.day || a.from.localeCompare(b.from));
  };
  return { ...content, activeSports, findSport, weeklySchedule };
}

export async function fetchContent() {
  const [c, s] = await Promise.all([
    supabase.from('content').select('key, value'),
    supabase.from('sports').select('slug, sort_order, active, data'),
  ]);
  if (c.error) throw c.error;
  if (s.error) throw s.error;
  return { content: c.data, sports: s.data };
}

const Ctx = createContext(derive(fileContent()));

export function ContentProvider({ children }) {
  const [content, setContent] = useState(fileContent);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!hasBackend) return;
    let alive = true;
    fetchContent()
      .then((rows) => alive && setContent(mergeContent(fileContent(), rows)))
      .catch(() => { /* databasen nede: fila står */ });
    return () => { alive = false; };
  }, [version]);

  const value = useMemo(() => ({ ...derive(content), reload: () => setVersion((v) => v + 1) }), [content]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useContent() {
  return useContext(Ctx);
}
