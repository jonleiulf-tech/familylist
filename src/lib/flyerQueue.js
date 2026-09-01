/**
 * Køen bak «Skann kundeaviser»: flere aviser i én omgang.
 *
 * Sju aviser er sju ulike butikker, og det er den egentlige jobben her —
 * ikke å laste opp flere filer, men å holde orden på hvilke varer som
 * hører til hvilken butikk hele veien fram til importen.
 */

/** Maks antall filer i én omgang. Hver PDF er ett tungt kall. */
export const MAX_FILES = 12;

/** Samme grense som før per PDF — porten inn til funksjonen tar ikke mer. */
export const MAX_PDF_BYTES = 9 * 1024 * 1024;

/** Grovt anslag på lesetid, brukt til fremdriftsvisningen. */
export const MS_PER_PDF = 55000;
export const MS_PER_IMAGE = 16000;

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-zæøå0-9]+/g, '');

/**
 * Gjett butikken ut fra filnavnet.
 *
 * «kiwi-uke36.pdf» er butikken sin egen merking, og den treffer nesten
 * alltid. Bommer den, står nedtrekkslisten rett ved siden av — gjetningen
 * skal spare klikk, ikke bestemme noe.
 */
export function guessStore(fileName, stores = []) {
  const hay = norm(fileName);
  if (!hay) return null;

  // Lengste butikknavn først: «coopextra» skal vinne over «coop», og
  // «rema1000» over «rema».
  const candidates = stores
    .flatMap((s) => [
      { code: s.code, key: norm(s.name) },
      { code: s.code, key: norm(s.code) },
    ])
    .filter((c) => c.key.length >= 3)
    .sort((a, b) => b.key.length - a.key.length);

  return candidates.find((c) => hay.includes(c.key))?.code ?? null;
}

/** Lag køen av valgte filer. Returnerer også det som ble avvist, og hvorfor. */
export function buildQueue(files, { stores = [], fallbackStore = null } = {}) {
  const items = [];
  const rejected = [];

  for (const file of Array.from(files ?? [])) {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? '');
    if (isPdf && file.size > MAX_PDF_BYTES) {
      rejected.push({ name: file.name, reason: 'PDF-en er over 9 MB' });
      continue;
    }
    if (items.length >= MAX_FILES) {
      rejected.push({ name: file.name, reason: `flere enn ${MAX_FILES} filer` });
      continue;
    }
    items.push({
      id: `${file.name}-${file.size}-${items.length}`,
      file,
      name: file.name || (isPdf ? 'avis.pdf' : 'bilde.jpg'),
      isPdf,
      store: guessStore(file.name, stores) ?? fallbackStore,
      status: 'venter',          // venter | leser | klar | feil
      rows: [],
      error: null,
    });
  }
  return { items, rejected };
}

/** Hvor langt er vi, og hva sitter vi igjen med. */
export function queueSummary(queue = []) {
  const done = queue.filter((q) => q.status === 'klar' || q.status === 'feil').length;
  const ok = queue.filter((q) => q.status === 'klar');
  return {
    total: queue.length,
    done,
    finished: done === queue.length && queue.length > 0,
    failed: queue.filter((q) => q.status === 'feil').length,
    files: ok.length,
    rows: ok.reduce((n, q) => n + q.rows.length, 0),
  };
}

/** Forventet lesetid for én fil — driver fremdriftslinjen. */
export const expectedMs = (item) => (item?.isPdf ? MS_PER_PDF : MS_PER_IMAGE);

/**
 * Radene ut av køen, klare for gjennomgang — med butikken sin på slep.
 *
 * Butikken bæres på HVER rad, ikke på gruppa, slik at en rad ikke kan
 * miste opphavet sitt om lista sorteres eller filtreres senere.
 */
export function reviewRows(queue = []) {
  return queue
    .filter((q) => q.status === 'klar')
    .flatMap((q) => q.rows.map((r) => ({
      ...r,
      checked: r.checked !== false,
      fileId: q.id,
      fileName: q.name,
      store: q.store,
    })));
}

/** Antall varer som faktisk vil bli importert. */
export function importable(rows = []) {
  return rows.filter((r) => r.checked
    && String(r.name ?? '').trim()
    && Number(String(r.price ?? '').replace(',', '.')) > 0
    && r.store);
}
