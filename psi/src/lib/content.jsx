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
    // Bare i databasen. Uten Supabase er de tomme, og sidene skjuler seksjonene.
    news: [],
    events: [],
    media: [],
    board: [],
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
  out.news = (rows.news || []).filter((n) => n.status === 'published');
  out.events = (rows.events || []).filter((e) => e.status !== 'draft' && !e.hidden_by_admin);
  out.media = rows.media || [];
  out.board = rows.board || [];
  // Gruppebilde fra opplastede bilder: is_cover vinner over image i fila.
  const covers = out.media.filter((m) => m.is_cover && m.web_url);
  if (covers.length) {
    out.sports = out.sports.map((sp) => {
      const cover = covers.find((m) => m.sport_slug === sp.slug);
      return cover ? { ...sp, image: cover.web_url, imageAlt: cover.caption || sp.imageAlt, imageCredit: cover.credit || sp.imageCredit } : sp;
    });
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
  const news = content.news || [];
  const events = content.events || [];
  const media = content.media || [];
  const newsFor = (slug) => news.filter((n) => (slug ? n.sport_slug === slug || n.sport_slug == null : true));
  const eventsFor = (slug) => events.filter((e) => (slug ? e.sport_slug === slug || e.sport_slug == null : true));
  const galleryFor = (slug) => media.filter((m) => m.show_in_gallery && (slug ? m.sport_slug === slug : true));
  const findNews = (slugOrId) => news.find((n) => n.slug === slugOrId || n.id === slugOrId) || null;
  return { ...content, news, events, media, board: content.board || [], activeSports, findSport, weeklySchedule, newsFor, eventsFor, galleryFor, findNews };
}

export function mediaUrl(path) {
  if (!path || !supabase) return null;
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
}

export async function fetchContent() {
  const since = new Date(Date.now() - 2 * 86400e3).toISOString();
  const [c, s, n, e, m, b] = await Promise.all([
    supabase.from('content').select('key, value'),
    supabase.from('sports').select('slug, sort_order, active, data'),
    supabase.from('news').select('id, slug, sport_slug, title, lead, body, image_id, link_url, status, published_at, show_on_home').eq('status', 'published').order('published_at', { ascending: false }).limit(60),
    supabase.from('events').select('*').neq('status', 'draft').gte('starts_at', since).order('starts_at').limit(200),
    supabase.from('media').select('id, sport_slug, web_path, path, width, height, caption, credit, show_in_gallery, show_on_home, is_cover, sort_order').or('show_in_gallery.eq.true,show_on_home.eq.true,is_cover.eq.true').order('sort_order'),
    supabase.from('public_board').select('*').order('sort_order'),
  ]);
  // De tre første må virke. Resten er nytt (schema-v2) og kan mangle.
  if (c.error) throw c.error;
  if (s.error) throw s.error;
  const media = (m.data || []).map((row) => ({ ...row, web_url: mediaUrl(row.web_path), url: mediaUrl(row.path) }));
  return { content: c.data, sports: s.data, news: n.data || [], events: e.data || [], media, board: b.data || [] };
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
