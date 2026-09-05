import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { fileContent, mediaUrl } from '../lib/content.jsx';
import { accessFrom } from './access.js';

/* Alle data /admin trenger, lastet én gang og delt. refresh() etter skriving. */

const Ctx = createContext(null);

export async function loadAdminData() {
  const [sports, members, news, events, media, content, access, sync] = await Promise.all([
    supabase.from('sports').select('slug, sort_order, active, data, updated_at, updated_by').order('sort_order'),
    supabase.from('members').select('*').order('sort_order').order('created_at'),
    supabase.from('news').select('*').order('published_at', { ascending: false }),
    supabase.from('events').select('*').order('starts_at'),
    supabase.from('media').select('*').order('sort_order').order('created_at'),
    supabase.from('content').select('key, value, updated_at, updated_by'),
    supabase.rpc('my_access'),
    supabase.from('sync_runs').select('*').eq('source', 'spond').order('created_at', { ascending: false }).limit(1),
  ]);
  const first = [sports, content, access].find((r) => r.error);
  if (first) throw first.error;
  // Tabellene fra schema-v2 kan mangle om bare schema.sql er kjørt.
  const v2Missing = [members, news, events, media].some((r) => r.error && /relation|does not exist|schema cache/i.test(r.error.message));
  return {
    v2Missing,
    sports: sports.data.map((r) => ({ ...r.data, slug: r.slug, active: r.active, sort_order: r.sort_order, updated_at: r.updated_at, updated_by: r.updated_by })),
    members: members.data || [],
    news: news.data || [],
    events: events.data || [],
    media: (media.data || []).map((m) => ({ ...m, web_url: mediaUrl(m.web_path), url: mediaUrl(m.path) })),
    content: Object.fromEntries((content.data || []).map((r) => [r.key, r])),
    access: accessFrom(access.data),
    // Finnes først etter schema-v3. Uten den er Spond-synken bare ikke satt opp.
    lastSync: (sync.data || [])[0] || null,
    syncReady: !sync.error,
  };
}

export function AdminDataProvider({ children }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const refresh = useCallback(async () => {
    try {
      const data = await loadAdminData();
      setState({ loading: false, error: null, data });
    } catch (error) {
      setState((s) => ({ loading: false, error, data: s.data }));
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const value = useMemo(() => ({ ...state, refresh }), [state, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminData() {
  return useContext(Ctx);
}

/* ---------- Skriving. Alle returnerer { error } som Supabase. ---------- */
export const db = {
  saveSport: (row) => {
    const { slug, active, sort_order, updated_at, updated_by, ...data } = row;
    return supabase.from('sports').upsert({ slug, active: Boolean(active), sort_order: sort_order ?? 10, data });
  },
  deleteSport: (slug) => supabase.from('sports').delete().eq('slug', slug),
  saveContent: (key, value) => supabase.from('content').upsert({ key, value }),
  saveNews: (row) => supabase.from('news').upsert(clean(row)).select().single(),
  deleteNews: (id) => supabase.from('news').delete().eq('id', id),
  saveEvent: (row) => supabase.from('events').upsert(clean(row)).select().single(),
  deleteEvent: (id) => supabase.from('events').delete().eq('id', id),
  saveMember: (row) => supabase.from('members').upsert(clean(row)),
  deleteMember: (id) => supabase.from('members').delete().eq('id', id),
  updateMedia: (id, patch) => supabase.from('media').update(patch).eq('id', id),
  hideEvent: (id, hidden) => supabase.from('events').update({ hidden_by_admin: hidden }).eq('id', id),
  hideNews: (id, hidden) => supabase.from('news').update({ hidden_by_admin: hidden }).eq('id', id),
  setNewsStatus: (id, status) => supabase.from('news').update({ status }).eq('id', id),
  deleteMedia: async (row) => {
    const files = [row.path, row.web_path].filter(Boolean);
    const a = await supabase.storage.from('media').remove(files);
    if (a.error) return a;
    return supabase.from('media').delete().eq('id', row.id);
  },
};

function clean(row) {
  const out = { ...row };
  for (const k of ['updated_at', 'updated_by', 'created_by', 'created_at']) delete out[k];
  if (!out.id) delete out.id;
  return out;
}

export { fileContent };

/* Slug fra en tittel: «Kamp mot Bø!» → kamp-mot-bo */
export function slugify(s) {
  return String(s || '').toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

/* datetime-local <-> ISO (Oslo-tid i skjemaet) */
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return p.replace(' ', 'T');
}
export function fromLocalInput(v) {
  if (!v) return null;
  const [date, time] = v.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = (time || '00:00').split(':').map(Number);
  // Finn UTC-tidspunktet som gir denne Oslo-tida (offset 1 eller 2 timer).
  for (const off of [1, 2]) {
    const cand = new Date(Date.UTC(y, m - 1, d, h - off, mi));
    if (toLocalInput(cand.toISOString()) === `${date}T${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`) return cand.toISOString();
  }
  return new Date(Date.UTC(y, m - 1, d, h - 1, mi)).toISOString();
}
