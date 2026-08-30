// Edge Function: nattlig gjennomgang av «Meld feil»-meldinger.
//
// To pass, i denne rekkefølgen:
//  1. Deterministisk: entydige meldinger fikses uten KI — riktig pris med
//     tall i forslaget, nytt navn med forslag (navnebytte + norm_rule så
//     gamle kvitteringsnavn vasker riktig), duplikat der forslaget matcher
//     en eksisterende vare (norm_rule + sammenslåing av tellere).
//  2. Claude: meldinger uten entydig fasit (kryptiske navn uten forslag,
//     «annet», kategorier) sendes samlet til Claude API — KUN når
//     ANTHROPIC_API_KEY er satt som secret. Uten nøkkel merkes de
//     trenger_menneske i stedet. Claude får varedatabase-kontekst og må
//     svare med strukturerte handlinger; alt Claude gjør logges i
//     resolution og er begrenset til rename/repris/rekategorisering/
//     duplikat/avvis — aldri frie SQL-operasjoner.
//
// Tidsplan (Supabase SQL editor, én gang):
//   select cron.schedule(
//     'review-item-reports', '30 3 * * *',
//     $$ select net.http_post(
//          url := 'https://<ref>.supabase.co/functions/v1/review-item-reports',
//          headers := '{"Authorization":"Bearer <service_role_key>"}'::jsonb
//        ) $$);

import { createClient } from 'jsr:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.65.0';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

type Report = {
  id: string;
  item_name: string;
  catalog_id: number | null;
  report_type: string;
  suggestion: string | null;
  comment: string | null;
};

type CatalogRow = {
  id: number;
  name: string;
  category: string | null;
  major_category: string | null;
  avg_price: number | null;
  line_count: number;
  receipt_count: number;
  score: number;
};

const parsePrice = (s: string | null): number | null => {
  if (!s) return null;
  const n = parseFloat(s.replace(/kr/i, '').replace(',', '.').trim());
  return Number.isFinite(n) && n > 0 && n < 10000 ? Math.round(n * 100) / 100 : null;
};

Deno.serve(async (req: Request) => {
  const auth = req.headers.get('Authorization') ?? '';
  // Godtar både ny hemmelig nøkkel (sb_secret_… via secrets) og gammel
  // service_role i overgangen; databaseklienten foretrekker den nye.
  const keys = [Deno.env.get('SB_SECRET_KEY'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')]
    .filter((k): k is string => Boolean(k));
  const serviceKey = keys[0] ?? '';
  if (!serviceKey || !keys.some((k) => auth.includes(k))) {
    return json({ error: 'Ikke autorisert.' }, 401);
  }

  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);

  const { data: reports, error: repErr } = await db
    .from('item_reports')
    .select('id, item_name, catalog_id, report_type, suggestion, comment')
    .eq('status', 'ny')
    .limit(100);
  if (repErr) return json({ error: repErr.message }, 500);
  if (!reports?.length) return json({ ok: true, handled: 0, note: 'Ingen nye meldinger.' });

  const { data: catalog, error: catErr } = await db
    .from('item_catalog')
    .select('id, name, category, major_category, avg_price, line_count, receipt_count, score');
  if (catErr) return json({ error: catErr.message }, 500);
  const byName = new Map((catalog as CatalogRow[]).map((c) => [c.name.toLowerCase(), c]));
  const findItem = (r: Report) =>
    (r.catalog_id != null ? (catalog as CatalogRow[]).find((c) => c.id === r.catalog_id) : undefined)
    ?? byName.get(r.item_name.toLowerCase());

  const resolve = async (id: string, status: string, resolution: string) => {
    await db.from('item_reports')
      .update({ status, resolution, resolved_at: new Date().toISOString() })
      .eq('id', id);
  };

  // ---- Handlinger, delt mellom deterministisk pass og Claude-passet ----
  const rename = async (item: CatalogRow, newName: string) => {
    const clash = byName.get(newName.toLowerCase());
    if (clash && clash.id !== item.id) return mergeInto(item, clash);
    await db.from('item_catalog').update({ name: newName }).eq('id', item.id);
    // Gammelt navn vasker til nytt — kvitteringsimport og Keep-import
    // treffer riktig neste gang.
    await db.from('norm_rules').upsert(
      { from_text: item.name, to_text: newName },
      { onConflict: 'from_text' },
    );
    return `Endret navn «${item.name}» → «${newName}» og la til vaskeregel.`;
  };

  const mergeInto = async (dup: CatalogRow, keep: CatalogRow) => {
    await db.from('norm_rules').upsert(
      { from_text: dup.name, to_text: keep.name },
      { onConflict: 'from_text' },
    );
    await db.from('item_catalog').update({
      line_count: keep.line_count + dup.line_count,
      receipt_count: keep.receipt_count + dup.receipt_count,
      score: Math.max(keep.score, dup.score),
    }).eq('id', keep.id);
    await db.from('item_catalog').delete().eq('id', dup.id);
    return `Slo sammen duplikatet «${dup.name}» inn i «${keep.name}» (vaskeregel + tellere).`;
  };

  const reprice = async (item: CatalogRow, price: number) => {
    await db.from('item_catalog').update({ avg_price: price }).eq('id', item.id);
    return `Satte pris ${price} kr på «${item.name}».`;
  };

  const recategorize = async (item: CatalogRow, category: string) => {
    await db.from('item_catalog').update({ major_category: category }).eq('id', item.id);
    return `Flyttet «${item.name}» til kategorien ${category}.`;
  };

  // ---- Pass 1: deterministiske fikser ----
  const needsAI: Report[] = [];
  let deterministic = 0;

  for (const r of reports as Report[]) {
    const item = findItem(r);
    if (!item) {
      await resolve(r.id, 'avvist', 'Varen finnes ikke lenger i varedatabasen.');
      continue;
    }
    const price = r.report_type === 'pris' ? parsePrice(r.suggestion) : null;
    const target = r.suggestion ? byName.get(r.suggestion.toLowerCase()) : undefined;

    if (r.report_type === 'pris' && price != null) {
      await resolve(r.id, 'fikset', await reprice(item, price));
      deterministic += 1;
    } else if (r.report_type === 'duplikat' && target && target.id !== item.id) {
      await resolve(r.id, 'fikset', await mergeInto(item, target));
      deterministic += 1;
    } else if (r.report_type === 'navn' && r.suggestion && r.suggestion.trim().length >= 3) {
      await resolve(r.id, 'fikset', await rename(item, r.suggestion.trim()));
      deterministic += 1;
    } else {
      needsAI.push(r);
    }
  }

  // ---- Pass 2: Claude vurderer resten (kun med API-nøkkel) ----
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  let aiHandled = 0;

  if (needsAI.length && apiKey) {
    const categories = [...new Set((catalog as CatalogRow[]).map((c) => c.major_category).filter(Boolean))];
    const client = new Anthropic({ apiKey });

    const reportLines = needsAI.map((r) => {
      const item = findItem(r);
      return JSON.stringify({
        report_id: r.id,
        item_name: r.item_name,
        current_category: item?.major_category ?? null,
        current_price: item?.avg_price ?? null,
        report_type: r.report_type,
        suggestion: r.suggestion,
        comment: r.comment,
      });
    }).join('\n');

    // Et utvalg av databasen som duplikat-/navnekontekst (de mest kjøpte).
    const catalogSample = (catalog as CatalogRow[])
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, 300)
      .map((c) => c.name)
      .join('; ');

    try {
      const response = await client.messages.create({
        model: 'claude-opus-5',
        max_tokens: 16000,
        system: [
          'Du rydder i varedatabasen til en norsk handleliste-app.',
          'Brukere har meldt feil på varer (kryptiske kvitteringsnavn, feil pris/kategori, duplikater).',
          'Svar KUN med JSON: en array av handlinger, én per report_id:',
          '{"report_id": "...", "action": "rename"|"reprice"|"recategorize"|"merge"|"dismiss", "value": "...", "reason": "kort norsk begrunnelse"}',
          '- rename: value = nytt, klart norsk varenavn (f.eks. «Coop Ha.Tom.Urt.390G» → «Hakkede tomater med urter»).',
          '- reprice: value = pris i kr som desimaltall, kun når meldingen gjør riktig pris tydelig.',
          `- recategorize: value = en av kategoriene [${categories.join(', ')}].`,
          '- merge: value = navnet på den eksisterende varen duplikatet skal slås inn i (må finnes i utvalget).',
          '- dismiss: bruk når meldingen er uklar, tom eller ikke kan avgjøres trygt — heller dismiss enn å gjette.',
          'Aldri finn på priser. Aldri nye kategorier. Norsk bokmål i navn.',
        ].join('\n'),
        messages: [{
          role: 'user',
          content: `Eksisterende varer (utvalg): ${catalogSample}\n\nMeldinger (én JSON per linje):\n${reportLines}`,
        }],
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      const match = text.match(/\[[\s\S]*\]/);
      const actions: Array<{ report_id: string; action: string; value?: string; reason?: string }> =
        match ? JSON.parse(match[0]) : [];

      for (const a of actions) {
        const r = needsAI.find((x) => x.id === a.report_id);
        if (!r) continue;
        const item = findItem(r);
        const why = a.reason ? ` (${a.reason})` : '';
        try {
          if (!item) {
            await resolve(r.id, 'avvist', 'Varen finnes ikke lenger.');
          } else if (a.action === 'rename' && a.value && a.value.trim().length >= 3) {
            await resolve(r.id, 'fikset', `${await rename(item, a.value.trim())}${why}`);
          } else if (a.action === 'reprice' && parsePrice(a.value ?? null) != null) {
            await resolve(r.id, 'fikset', `${await reprice(item, parsePrice(a.value ?? null)!)}${why}`);
          } else if (a.action === 'recategorize' && a.value && categories.includes(a.value)) {
            await resolve(r.id, 'fikset', `${await recategorize(item, a.value)}${why}`);
          } else if (a.action === 'merge' && a.value && byName.get(a.value.toLowerCase())) {
            await resolve(r.id, 'fikset', `${await mergeInto(item, byName.get(a.value.toLowerCase())!)}${why}`);
          } else {
            await resolve(r.id, 'trenger_menneske', `Claude foreslo ingen trygg fiks${why}.`);
          }
          aiHandled += 1;
        } catch (e) {
          await resolve(r.id, 'trenger_menneske', `Feil under fiks: ${(e as Error).message}`);
        }
      }
      // Meldinger Claude ikke svarte på
      for (const r of needsAI) {
        const handled = actions.some((a) => a.report_id === r.id);
        if (!handled) await resolve(r.id, 'trenger_menneske', 'Fikk ikke svar fra gjennomgangen.');
      }
    } catch (e) {
      for (const r of needsAI) {
        await resolve(r.id, 'trenger_menneske', `Claude-kall feilet: ${(e as Error).message}`);
      }
    }
  } else if (needsAI.length) {
    for (const r of needsAI) {
      await resolve(
        r.id,
        'trenger_menneske',
        'Ikke entydig nok for automatisk fiks, og ANTHROPIC_API_KEY er ikke satt.',
      );
    }
  }

  return json({ ok: true, total: reports.length, deterministic, ai: aiHandled });
});
