import { supabase } from '../lib/supabase.js';

/* Bildeopplasting. Originalen lagres urørt (til trykk og SoMe), og en
   nedskalert WebP lages i nettleseren til nettsiden. Maks 30 per gruppe,
   håndhevet i databasen. */

export const MAX_WEB = 1600;
export const MAX_BYTES = 25 * 1024 * 1024;
export const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

export function imageError(file) {
  if (!file) return 'Ingen fil.';
  if (file.size > MAX_BYTES) return `Fila er ${(file.size / 1048576).toFixed(0)} MB. Maks er 25 MB.`;
  if (!/^image\//.test(file.type) && !/\.(heic|heif)$/i.test(file.name)) return 'Bare bilder (JPG, PNG, WebP, HEIC).';
  return null;
}

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file); } catch { /* HEIC o.l. */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Kunne ikke lese bildet')); };
    img.src = url;
  });
}

/* → { blob, width, height } eller null hvis nettleseren ikke kan dekode. */
export async function makeWeb(file, max = MAX_WEB) {
  let img;
  try { img = await decode(file); } catch { return null; }
  const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
  const scale = Math.min(1, max / Math.max(w, h));
  const cw = Math.round(w * scale), ch = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.84));
  return blob ? { blob, width: cw, height: ch, originalWidth: w, originalHeight: h } : null;
}

/* Laster opp én fil til <scope>/<id>/… og lager media-raden. */
export async function uploadImage(file, { sportSlug, createdBy, onProgress }) {
  const scope = sportSlug || 'psi';
  const id = crypto.randomUUID();
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${scope}/${id}/original.${ext}`;
  onProgress?.('Klargjør …');
  const web = await makeWeb(file);
  const webPath = web ? `${scope}/${id}/web.webp` : path;

  onProgress?.('Laster opp original …');
  const a = await supabase.storage.from('media').upload(path, file, { contentType: file.type || 'application/octet-stream', cacheControl: '31536000', upsert: false });
  if (a.error) return { error: a.error };
  if (web) {
    onProgress?.('Laster opp nettversjon …');
    const b = await supabase.storage.from('media').upload(webPath, web.blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
    if (b.error) { await supabase.storage.from('media').remove([path]); return { error: b.error }; }
  }
  const row = {
    id, sport_slug: sportSlug || null, path, web_path: webPath,
    width: web?.originalWidth ?? null, height: web?.originalHeight ?? null, bytes: file.size,
    caption: { nb: '', en: '' }, credit: '', show_in_gallery: false, show_on_home: false, is_cover: false, sort_order: 100, created_by: createdBy,
  };
  const c = await supabase.from('media').insert(row);
  if (c.error) { await supabase.storage.from('media').remove([path, webPath]); return { error: c.error }; }
  return { data: row };
}

export const fmtBytes = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} kB`);
