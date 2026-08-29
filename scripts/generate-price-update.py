#!/usr/bin/env python3
"""Genererer 20260830090300_receipt_price_update.sql fra kvitterings-regnearkene.

Kjøres én gang mot de tre arbeidsbøkene fra Claude Design (kvitteringsanalyse
Coop/MENY/REMA, mars–august 2026):
  - coop_kvitteringer_produkter_priser_claude_design.xlsx   (21 kvitteringer)
  - familie_produkter_priser_fra_coop_kvitteringer_claude.xlsx (Keep + 6 kvitteringer)
  - kvitteringer_meny_coop_rema_claude_design.xlsx          (51 kvitteringer)

Sammenslåing per produktnavn (case-insensitivt):
  - snittpris vektes med antall varelinjer, laveste/høyeste blir min/maks
  - kvitterings- og linjetellere: maks på tvers (filene overlapper delvis)
  - frekvenssignal: sterkeste («Svært ofte» > «Ofte» > tomt)
  - samleposter (navn med «/», f.eks. «Brød/bakervarer») hoppes over

Resultatet er en idempotent upsert: eksisterende varer får oppdatert pris,
tellere og signal — kategori og navn røres ikke. Nye varer settes inn med
kategori mappet til hovedkategoriene fra generate-seed.mjs.
Normaliserings-arkene blir norm_rules (on conflict do nothing).

Avhengigheter: pandas, openpyxl.
"""
import math
import re
import sys
import unicodedata
from pathlib import Path

import pandas as pd

BASE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(
    '/root/.claude/uploads/fe9e7d02-3b9e-598e-bf00-c74580d017ce')
OUT = Path(__file__).resolve().parent.parent / 'supabase' / 'migrations' / \
    '20260830090300_receipt_price_update.sql'

FILES = {
    'coop21': 'a1fe1d3b-coop_kvitteringer_produkter_priser_claude_design.xlsx',
    'keep': '16e1fd87-familie_produkter_priser_fra_coop_kvitteringer_claude.xlsx',
    'tre_kjeder': 'f2f2301f-kvitteringer_meny_coop_rema_claude_design.xlsx',
}

# Samme hovedkategori-kart som scripts/generate-seed.mjs.
MAJOR = {
    'Meieri': 'Meieri', 'Melkefritt': 'Meieri', 'Ost': 'Ost og pålegg', 'Pålegg': 'Ost og pålegg',
    'Syltetøy': 'Ost og pålegg', 'Kjøtt': 'Kjøtt', 'Kylling': 'Kjøtt', 'Pølser': 'Kjøtt', 'Fisk': 'Fisk',
    'Grønnsaker': 'Frukt og grønt', 'Frysegrønt': 'Frukt og grønt', 'Frukt': 'Frukt og grønt',
    'Salat': 'Frukt og grønt', 'Bær': 'Frukt og grønt', 'Tørket frukt': 'Frukt og grønt',
    'Brød': 'Brød og korn', 'Brød og korn': 'Brød og korn', 'Knekkebrød': 'Brød og korn',
    'Frokost': 'Brød og korn', 'Pasta': 'Tørrvarer', 'Tørrvarer': 'Tørrvarer', 'Mel': 'Tørrvarer',
    'Baking': 'Tørrvarer', 'Frø': 'Tørrvarer', 'Hermetikk': 'Tørrvarer', 'Belgvekster': 'Tørrvarer',
    'Buljong': 'Tørrvarer', 'Søtning': 'Tørrvarer', 'Taco': 'Tørrvarer', 'Gryterett': 'Tørrvarer',
    'Suppe': 'Tørrvarer', 'Tilbehør': 'Tørrvarer', 'Krydder': 'Krydder og saus', 'Saus': 'Krydder og saus',
    'Olje': 'Krydder og saus', 'Nøtter': 'Snacks', 'Snacks': 'Snacks', 'Kjeks': 'Snacks',
    'Godteri': 'Snacks', 'Sjokolade': 'Snacks', 'Dessert': 'Snacks', 'Is': 'Frysevarer',
    'Pizza': 'Frysevarer', 'Ferdigmat': 'Frysevarer', 'Drikke': 'Drikke', 'Kaffe': 'Drikke',
    'Husholdning': 'Hus og hjem', 'Hygiene': 'Hus og hjem', 'Apotek': 'Hus og hjem',
    'Dyremat': 'Hus og hjem', 'Brød og bakervarer': 'Brød og korn', 'Egg': 'Meieri',
    'Ferdigmiddag': 'Frysevarer', 'Frysevare': 'Frysevarer', 'Hermetisk': 'Tørrvarer',
    'Sauser': 'Krydder og saus', 'Asiatisk': 'Tørrvarer', 'Tex-Mex': 'Tørrvarer',
    'Personlig hygiene': 'Hus og hjem', 'Helse': 'Hus og hjem', 'Non-food': 'Hus og hjem',
    'Ukjent': 'Annet', 'Frukt og grønt': 'Frukt og grønt', 'Ost og pålegg': 'Ost og pålegg',
    'Krydder og saus': 'Krydder og saus', 'Frysevarer': 'Frysevarer', 'Hus og hjem': 'Hus og hjem',
    'Annet': 'Annet',
}


def major_of(cat):
    return MAJOR.get(str(cat or '').split('/')[0].strip(), 'Annet')


STORE_MAP = [
    (re.compile(r'coop\s*extra', re.I), 'Coop Extra'),
    (re.compile(r'\bobs\b', re.I), 'Coop Obs'),
    (re.compile(r'coop', re.I), 'Coop Extra'),
    (re.compile(r'meny', re.I), 'Meny'),
    (re.compile(r'rema', re.I), 'Rema 1000'),
    (re.compile(r'kiwi', re.I), 'KIWI'),
    (re.compile(r'spar', re.I), 'Spar'),
    (re.compile(r'joker', re.I), 'Joker'),
]


def norm_store(raw):
    s = str(raw or '').strip()
    for rx, name in STORE_MAP:
        if rx.search(s):
            return name
    return None


def clean(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    s = unicodedata.normalize('NFC', str(v)).strip()
    return s or None


def num(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    try:
        n = float(v)
        return n if math.isfinite(n) and 0 < n < 10000 else None
    except (TypeError, ValueError):
        return None


def sig_rank(s):
    s = str(s or '').lower()
    if 'svært' in s:
        return 2
    if 'ofte' in s:
        return 1
    return 0


records = []


def add(name, category, lines, receipts, sig, avg, low, high, store, is_food, name_en):
    name = clean(name)
    if not name or '/' in name:          # samleposter («Brød/bakervarer») hoppes over
        return
    # Uklassifiserte rå kvitteringsnavn («24 Smoot.Bendit», «2 Stk A») er
    # nettopp den typen støy brukeren melder feil på — de importeres ikke.
    if str(category or '').lower().startswith('ukjent'):
        return
    records.append({
        'name': name, 'category': clean(category), 'lines': int(lines or 0),
        'receipts': int(receipts or 0), 'sig': sig_rank(sig), 'avg': num(avg),
        'low': num(low), 'high': num(high), 'store': norm_store(store),
        'is_food': is_food, 'name_en': clean(name_en),
    })


f1 = pd.read_excel(BASE / FILES['coop21'], sheet_name='Produktmaster')
for _, r in f1.iterrows():
    # For stykkvarer er enhetsprisen (kr/stk) riktig listepris; linjepris
    # kan dekke flere pakker og blåser opp snittet.
    stk = str(r.get('Typisk enhet', '')).strip().lower() == 'stk'
    avg1 = r['Snitt enhetspris'] if stk and num(r['Snitt enhetspris']) else r['Snittpris per linje']
    add(r['Produkt'], r['Kategori'], r['Antall kjøpstilfeller'], r['Antall kvitteringer'],
        r['Frekvenssignal'], avg1, r['Laveste linjepris'],
        r['Høyeste linjepris'], r['Hovedbutikk observert'],
        str(r.get('Matvare?', 'Ja')).strip().lower().startswith('j'), r['Engelsk variant'])

f2 = pd.read_excel(BASE / FILES['keep'], sheet_name='Oppdatert produktmaster')
for _, r in f2.iterrows():
    add(r['Norsk navn'], r['Kategori'], r['Antall varelinjer'], r['Antall kvitteringer'],
        r['Kvitteringssignal'] if sig_rank(r['Kvitteringssignal']) else r['Tidligere frekvenssignal'],
        r['Snitt kr/stk'] if num(r['Snitt kr/stk']) else r['Siste pris'],
        r['Min linjesum'], r['Maks linjesum'], None,
        str(r.get('Type', 'Matvare')).strip().lower().startswith('mat'), r['Engelsk variant'])

f3 = pd.read_excel(BASE / FILES['tre_kjeder'], sheet_name='Produktmaster')
for _, r in f3.iterrows():
    add(r['Norsk produkt'], r['Kategori'], r['Antall varelinjer'], r['Antall kvitteringer'],
        r['Frekvenssignal'], r['Snitt linjepris'], r['Laveste linjepris'],
        r['Høyeste linjepris'], r['Primær butikk i data'],
        str(r.get('Mat/ikke-mat', 'Matvare')).strip().lower().startswith('mat'), r['English variant'])

# ---- Slå sammen per navn ----
merged = {}
for rec in records:
    key = rec['name'].lower()
    if key not in merged:
        merged[key] = rec | {'wsum': (rec['avg'] or 0) * max(rec['lines'], 1),
                             'w': max(rec['lines'], 1) if rec['avg'] else 0}
        continue
    m = merged[key]
    if rec['avg']:
        m['wsum'] += rec['avg'] * max(rec['lines'], 1)
        m['w'] += max(rec['lines'], 1)
    m['low'] = min([x for x in (m['low'], rec['low']) if x is not None], default=None)
    m['high'] = max([x for x in (m['high'], rec['high']) if x is not None], default=None)
    m['lines'] = max(m['lines'], rec['lines'])
    m['receipts'] = max(m['receipts'], rec['receipts'])
    m['sig'] = max(m['sig'], rec['sig'])
    m['store'] = m['store'] or rec['store']
    m['category'] = m['category'] or rec['category']
    m['name_en'] = m['name_en'] or rec['name_en']

rows = []
for m in merged.values():
    avg = round(m['wsum'] / m['w'], 2) if m['w'] else None
    if avg is None and m['low'] is None:
        continue                          # ingenting å oppdatere med
    # Linjesum-baserte min/maks som ikke omslutter snittprisen (flerpakk-
    # forvirring) er verre enn ingenting — da droppes de.
    if avg is not None:
        if m['low'] is not None and m['low'] > avg * 1.1:
            m['low'] = None
        if m['high'] is not None and m['high'] < avg * 0.9:
            m['high'] = None
    sig = {2: 'Svært ofte', 1: 'Ofte', 0: ''}[m['sig']]
    score = min(60, m['lines'] * 2 + m['receipts'])
    rows.append((m['name'], m['name_en'], m['category'], major_of(m['category']),
                 m['is_food'], m['lines'], m['receipts'], avg, m['low'], m['high'],
                 sig, m['store'], score))
rows.sort(key=lambda r: r[0].lower())

# ---- Normaliseringsregler ----
norm = {}
for fname, sheet, col_from, col_to in [
    (FILES['coop21'], 'Normalisering', 'Eksempel råvare/kvitteringstekst', 'Normalisert produkt'),
    (FILES['keep'], 'Normalisering', 'Rå tekst / nøkkelord', 'Normalisert til'),
]:
    df = pd.read_excel(BASE / fname, sheet_name=sheet)
    for _, r in df.iterrows():
        ft, tt = clean(r[col_from]), clean(r[col_to])
        if ft and tt and ft.lower() != tt.lower() and len(ft) <= 80 and len(tt) <= 60:
            norm.setdefault(ft.lower(), (ft, tt))

def q(s):
    return "'" + str(s).replace("'", "''") + "'" if s is not None else 'null'


def qn(v):
    return str(v) if v is not None else 'null'


out = [
    '-- Prisoppdatering fra kvitteringsanalysene (Claude Design, mars–august 2026).',
    f'-- Generert av scripts/generate-price-update.py fra tre arbeidsbøker: {len(rows)} produkter,',
    f'-- {len(norm)} normaliseringsregler. Eksisterende varer får oppdatert pris/tellere/signal;',
    '-- navn og kategori på eksisterende varer røres ikke. Kjøres trygt flere ganger.',
    '',
    'insert into public.item_catalog',
    '  (name, name_en, category, major_category, is_food, line_count, receipt_count,',
    '   avg_price, price_low, price_high, frequency_sig, primary_store, score)',
    'values',
]
vals = []
for (name, name_en, cat, major, food, lines, receipts, avg, low, high, sig, store, score) in rows:
    vals.append(f'  ({q(name)}, {q(name_en)}, {q(cat)}, {q(major)}, {str(food).lower()}, '
                f'{lines}, {receipts}, {qn(avg)}, {qn(low)}, {qn(high)}, {q(sig)}, {q(store)}, {score})')
out.append(',\n'.join(vals))
out.append('''on conflict (name) do update set
  -- Ferske kvitteringspriser vinner over gamle seed-priser, men en ny pris
  -- langt utenfor den gamle (enhets-/mengdeforvirring) forkastes.
  avg_price     = case
                    when excluded.avg_price is null then item_catalog.avg_price
                    when item_catalog.avg_price is null then excluded.avg_price
                    when excluded.avg_price between item_catalog.avg_price * 0.4 and item_catalog.avg_price * 2.5
                      then excluded.avg_price
                    else item_catalog.avg_price
                  end,
  price_low     = least(coalesce(nullif(item_catalog.price_low, 0), excluded.price_low), coalesce(excluded.price_low, item_catalog.price_low)),
  price_high    = greatest(coalesce(item_catalog.price_high, excluded.price_high), coalesce(excluded.price_high, item_catalog.price_high)),
  line_count    = greatest(item_catalog.line_count, excluded.line_count),
  receipt_count = greatest(item_catalog.receipt_count, excluded.receipt_count),
  score         = greatest(item_catalog.score, excluded.score),
  frequency_sig = case when excluded.frequency_sig <> '' then excluded.frequency_sig else item_catalog.frequency_sig end,
  primary_store = coalesce(excluded.primary_store, item_catalog.primary_store),
  name_en       = coalesce(item_catalog.name_en, excluded.name_en);
''')

out.append('''-- Rydd opp gamle inkonsistenser i hele katalogen: lav ≤ snitt ≤ høy,
-- og 0-priser behandles som ukjente.
update public.item_catalog set
  price_low  = least(coalesce(nullif(price_low, 0), avg_price), avg_price),
  price_high = greatest(coalesce(nullif(price_high, 0), avg_price), avg_price)
where avg_price is not null;
''')

out.append('insert into public.norm_rules (from_text, to_text) values')
out.append(',\n'.join(f'  ({q(ft)}, {q(tt)})' for ft, tt in sorted(norm.values(), key=lambda x: x[0].lower())))
out.append('on conflict (from_text) do nothing;')
out.append('')

OUT.write_text('\n'.join(out), encoding='utf-8')
print(f'Skrev {OUT.name}: {len(rows)} produkter, {len(norm)} normaliseringsregler')
