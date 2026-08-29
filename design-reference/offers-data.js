// offers-data.js — «Ukens relevante tilbud».
// PROTOTYPE: denne filen spiller rollen til Offers-tabellen som backend-jobben
// weeklyOfferScan() (cron: mandag 06:00) skal fylle — se kassalapp-handoff.md.
// Frontend leser kun ferdig normaliserte tilbud; ingen scraping skjer i nettleseren.

export const WEEK = '2026-W35';

// Normaliserte tilbud (som etter parsing av Meny/Coop Extra/KIWI-kilder)
export const OFFERS = [
  {id: 'o1', store_code: 'KIWI', store_name: 'KIWI', product_name: 'Norvegia Original 1kg', brand: 'Tine',
   match: 'Gulost', category: 'Ost', price: 89, original_price: 119.9, unit: 'kg', unit_price: 89,
   valid_to: '2026-08-30', source: 'KIWI kundeavis', source_url: 'https://kiwi.no/tilbudsavis/'},
  {id: 'o2', store_code: 'COOP_EXTRA', store_name: 'Coop Extra', product_name: 'Kjøttdeig 14% 400g', brand: 'Xtra',
   match: 'Kjøttdeig', category: 'Kjøtt', price: 39.9, original_price: 54.9, unit: 'stk', unit_price: 99.8,
   valid_to: '2026-08-30', source: 'Coop Extra tilbud', source_url: 'https://coop.no/butikker/extra/medlemskupp/'},
  {id: 'o3', store_code: 'MENY_NO', store_name: 'Meny', product_name: 'Tortilla 8-pk', brand: 'Old El Paso',
   match: 'Tacolefser', category: 'Tex-Mex', price: 24.9, original_price: 32.9, unit: 'stk', unit_price: 24.9,
   valid_to: '2026-08-30', source: 'Meny kundeavis', source_url: 'https://meny.no/tilbud/'},
  {id: 'o4', store_code: 'COOP_EXTRA', store_name: 'Coop Extra', product_name: 'Laksefilet 4x125g', brand: 'Lerøy',
   match: 'Laks', category: 'Fisk', price: 99, original_price: 129.9, unit: 'stk', unit_price: 198,
   valid_to: '2026-08-30', source: 'Coop Extra tilbud', source_url: 'https://coop.no/butikker/extra/medlemskupp/'},
  {id: 'o5', store_code: 'MENY_NO', store_name: 'Meny', product_name: 'Gryr Fløte kokos/raps 250ml', brand: 'Gryr',
   match: 'Gryr fløte', category: 'Plantebasert', price: 24.9, original_price: 30.9, unit: 'stk', unit_price: 99.6,
   valid_to: '2026-08-30', source: 'Meny kundeavis', source_url: 'https://meny.no/tilbud/'},
  {id: 'o6', store_code: 'COOP_EXTRA', store_name: 'Coop Extra', product_name: 'Toalettpapir 16 ruller', brand: 'Lambi',
   match: 'Toalettpapir', category: 'Husholdning', price: 69.9, original_price: 99.9, unit: 'stk', unit_price: 4.4,
   valid_to: '2026-09-06', source: 'Coop Extra tilbud', source_url: 'https://coop.no/butikker/extra/medlemskupp/'},
  {id: 'o7', store_code: 'KIWI', store_name: 'KIWI', product_name: 'Soyadrikk usøtet 1l', brand: 'Alpro',
   match: 'Soyamelk uten sukker', category: 'Plantebasert drikke', price: 24.9, original_price: 31.9, unit: 'stk', unit_price: 24.9,
   valid_to: '2026-08-30', source: 'KIWI kundeavis', source_url: 'https://kiwi.no/tilbudsavis/'},
  // Eksempler som IKKE skal vises (lav relevans — filtreres av scoringen):
  {id: 'o13', store_code: 'MENY_NO', store_name: 'Meny', product_name: 'Coca-Cola Zero 8x1,5l', brand: 'Coca-Cola',
   match: 'Cola zero', category: 'Drikke', price: 199, original_price: 271.2, unit: 'pk', unit_price: 16.6, unit_price_unit: 'l',
   valid_to: '2026-08-30', source: 'Meny kundeavis', source_url: 'https://meny.no/tilbud/'},
  {id: 'o10', store_code: 'KIWI', store_name: 'KIWI', product_name: 'Coca-Cola Zero 1,5l', brand: 'Coca-Cola',
   match: 'Cola zero', category: 'Drikke', price: 22.9, original_price: 32.9, unit: 'stk', unit_price: 15.3, unit_price_unit: 'l',
   valid_to: '2026-08-30', source: 'KIWI kundeavis', source_url: 'https://kiwi.no/tilbudsavis/'},
  {id: 'o11', store_code: 'COOP_EXTRA', store_name: 'Coop Extra', product_name: 'Coca-Cola Zero 4x1,5l', brand: 'Coca-Cola',
   match: 'Cola zero', category: 'Drikke', price: 79, original_price: 119.6, unit: 'pk', unit_price: 13.2, unit_price_unit: 'l',
   valid_to: '2026-09-06', source: 'Coop Extra tilbud', source_url: 'https://coop.no/butikker/extra/medlemskupp/'},
  {id: 'o12', store_code: 'REMA_1000', store_name: 'Rema 1000', product_name: 'Coca-Cola Zero 0,5l', brand: 'Coca-Cola',
   match: 'Cola zero', category: 'Drikke', price: 14.9, original_price: 19.9, unit: 'stk', unit_price: 29.8, unit_price_unit: 'l',
   valid_to: '2026-08-30', source: 'Rema 1000', source_url: 'https://www.rema.no/tilbud/'},
  {id: 'o13', store_code: 'MENY_NO', store_name: 'Meny', product_name: 'Pepsi Max 6x1,5l', brand: 'Pepsi',
   match: 'Cola zero', category: 'Drikke', price: 129, original_price: 179.4, unit: 'pk', unit_price: 14.3, unit_price_unit: 'l',
   valid_to: '2026-08-30', source: 'Meny kundeavis', source_url: 'https://meny.no/tilbud/'},
  {id: 'o14', store_code: 'COOP_EXTRA', store_name: 'Coop Extra', product_name: 'Evergood filtermalt 500g', brand: 'Evergood',
   match: 'Kaffe', category: 'Kaffe', price: 59.9, original_price: 89.9, unit: 'stk', unit_price: 119.8, unit_price_unit: 'kg',
   valid_to: '2026-08-30', source: 'Coop Extra tilbud', source_url: 'https://coop.no/butikker/extra/medlemskupp/'},
  {id: 'o15', store_code: 'KIWI', store_name: 'KIWI', product_name: 'Friele Frokost filtermalt 450g', brand: 'Friele',
   match: 'Kaffe', category: 'Kaffe', price: 49.9, original_price: 74.9, unit: 'stk', unit_price: 110.9, unit_price_unit: 'kg',
   valid_to: '2026-08-30', source: 'KIWI kundeavis', source_url: 'https://kiwi.no/tilbudsavis/'},
  {id: 'o16', store_code: 'COOP_EXTRA', store_name: 'Coop Extra', product_name: 'Kneippbrød 750g', brand: 'Bakehuset',
   match: 'Brød', category: 'Brød', price: 25, original_price: 34.9, unit: 'stk', unit_price: 33.3, unit_price_unit: 'kg',
   valid_to: '2026-08-30', source: 'Coop Extra tilbud', source_url: 'https://coop.no/butikker/extra/medlemskupp/'},
  {id: 'o17', store_code: 'REMA_1000', store_name: 'Rema 1000', product_name: 'Lettmelk 1,75l', brand: 'Q-Meieriene',
   match: 'Lettmelk', category: 'Melk', price: 36.9, original_price: 42.9, unit: 'stk', unit_price: 21.1, unit_price_unit: 'l',
   valid_to: '2026-08-30', source: 'Rema 1000', source_url: 'https://www.rema.no/tilbud/'},
  {id: 'o18', store_code: 'MENY_NO', store_name: 'Meny', product_name: 'Havremelk Original 1l', brand: 'Oatly',
   match: 'Havremelk', category: 'Plantebasert drikke', price: 22.9, original_price: 29.9, unit: 'stk', unit_price: 22.9, unit_price_unit: 'l',
   valid_to: '2026-08-30', source: 'Meny kundeavis', source_url: 'https://meny.no/tilbud/'},
  {id: 'o19', store_code: 'KIWI', store_name: 'KIWI', product_name: 'Grandiosa Original 575g', brand: 'Stabburet',
   match: 'Pizza', category: 'Frysevarer', price: 39.9, original_price: 52.9, unit: 'stk', unit_price: 69.4, unit_price_unit: 'kg',
   valid_to: '2026-08-30', source: 'KIWI kundeavis', source_url: 'https://kiwi.no/tilbudsavis/'},
  {id: 'o8', store_code: 'MENY_NO', store_name: 'Meny', product_name: 'Energidrikk 4-pk', brand: 'Monster',
   match: '', category: 'Drikke', price: 79, original_price: 99, unit: 'stk', unit_price: 19.8,
   valid_to: '2026-08-30', source: 'Meny kundeavis', source_url: 'https://meny.no/tilbud/'},
  {id: 'o9', store_code: 'COOP_EXTRA', store_name: 'Coop Extra', product_name: 'Kattemat 12-pk', brand: 'Whiskas',
   match: '', category: 'Dyremat', price: 89, original_price: 109, unit: 'stk', unit_price: 7.4,
   valid_to: '2026-08-30', source: 'Coop Extra tilbud', source_url: 'https://coop.no/butikker/extra/medlemskupp/'}
];

// Husholdnings-stifter (staples) — gir +20 i relevans
export const STAPLES = ['Toalettpapir', 'Vaskemiddel', 'Bleier', 'Tannkrem', 'Såpe', 'Tørkerull'];
// Melkefrie/veganske preferanser — gir +15
export const DAIRYFREE = ['Gryr fløte', 'Soyamelk uten sukker', 'Havremelk', 'Vegansk revet ost', 'Rømme uten melk', 'Melkefri yoghurt'];
