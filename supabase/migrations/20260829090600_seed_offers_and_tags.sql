-- AUTOGENERERT av scripts/generate-seed.mjs — ikke rediger for hånd.

-- Merkelapper: 6 faste husholdningsvarer, 6 melkefrie
insert into public.item_tags (item_name, tag) values
  ('Toalettpapir', 'staple'),
  ('Vaskemiddel', 'staple'),
  ('Bleier', 'staple'),
  ('Tannkrem', 'staple'),
  ('Såpe', 'staple'),
  ('Tørkerull', 'staple'),
  ('Gryr fløte', 'dairy_free'),
  ('Soyamelk uten sukker', 'dairy_free'),
  ('Havremelk', 'dairy_free'),
  ('Vegansk revet ost', 'dairy_free'),
  ('Rømme uten melk', 'dairy_free'),
  ('Melkefri yoghurt', 'dairy_free')
on conflict (item_name, tag) do nothing;

-- Eksempeltilbud: 20 stk (is_sample = true)
insert into public.offers
  (store_code, store_name, product_name, brand, category, match_name,
   price, original_price, unit, unit_price, valid_from, valid_to,
   source, source_type, source_url, is_sample)
values
  ('KIWI', 'KIWI', 'Norvegia Original 1kg', 'Tine', 'Ost', 'Gulost', 89, 119.9, 'kg', 89, current_date, current_date + 7, 'KIWI kundeavis', 'customer_flyer', 'https://kiwi.no/tilbudsavis/', true),
  ('COOP_EXTRA', 'Coop Extra', 'Kjøttdeig 14% 400g', 'Xtra', 'Kjøtt', 'Kjøttdeig', 39.9, 54.9, 'stk', 99.8, current_date, current_date + 7, 'Coop Extra tilbud', 'customer_flyer', 'https://coop.no/butikker/extra/medlemskupp/', true),
  ('MENY_NO', 'Meny', 'Tortilla 8-pk', 'Old El Paso', 'Tex-Mex', 'Tacolefser', 24.9, 32.9, 'stk', 24.9, current_date, current_date + 7, 'Meny kundeavis', 'customer_flyer', 'https://meny.no/tilbud/', true),
  ('COOP_EXTRA', 'Coop Extra', 'Laksefilet 4x125g', 'Lerøy', 'Fisk', 'Laks', 99, 129.9, 'stk', 198, current_date, current_date + 7, 'Coop Extra tilbud', 'customer_flyer', 'https://coop.no/butikker/extra/medlemskupp/', true),
  ('MENY_NO', 'Meny', 'Gryr Fløte kokos/raps 250ml', 'Gryr', 'Plantebasert', 'Gryr fløte', 24.9, 30.9, 'stk', 99.6, current_date, current_date + 7, 'Meny kundeavis', 'customer_flyer', 'https://meny.no/tilbud/', true),
  ('COOP_EXTRA', 'Coop Extra', 'Toalettpapir 16 ruller', 'Lambi', 'Husholdning', 'Toalettpapir', 69.9, 99.9, 'stk', 4.4, current_date, current_date + 14, 'Coop Extra tilbud', 'customer_flyer', 'https://coop.no/butikker/extra/medlemskupp/', true),
  ('KIWI', 'KIWI', 'Soyadrikk usøtet 1l', 'Alpro', 'Plantebasert drikke', 'Soyamelk uten sukker', 24.9, 31.9, 'stk', 24.9, current_date, current_date + 7, 'KIWI kundeavis', 'customer_flyer', 'https://kiwi.no/tilbudsavis/', true),
  ('MENY_NO', 'Meny', 'Coca-Cola Zero 8x1,5l', 'Coca-Cola', 'Drikke', 'Cola zero', 199, 271.2, 'pk', 16.6, current_date, current_date + 7, 'Meny kundeavis', 'customer_flyer', 'https://meny.no/tilbud/', true),
  ('KIWI', 'KIWI', 'Coca-Cola Zero 1,5l', 'Coca-Cola', 'Drikke', 'Cola zero', 22.9, 32.9, 'stk', 15.3, current_date, current_date + 7, 'KIWI kundeavis', 'customer_flyer', 'https://kiwi.no/tilbudsavis/', true),
  ('COOP_EXTRA', 'Coop Extra', 'Coca-Cola Zero 4x1,5l', 'Coca-Cola', 'Drikke', 'Cola zero', 79, 119.6, 'pk', 13.2, current_date, current_date + 14, 'Coop Extra tilbud', 'customer_flyer', 'https://coop.no/butikker/extra/medlemskupp/', true),
  ('REMA_1000', 'Rema 1000', 'Coca-Cola Zero 0,5l', 'Coca-Cola', 'Drikke', 'Cola zero', 14.9, 19.9, 'stk', 29.8, current_date, current_date + 7, 'Rema 1000', 'customer_flyer', 'https://www.rema.no/tilbud/', true),
  ('MENY_NO', 'Meny', 'Pepsi Max 6x1,5l', 'Pepsi', 'Drikke', 'Cola zero', 129, 179.4, 'pk', 14.3, current_date, current_date + 7, 'Meny kundeavis', 'customer_flyer', 'https://meny.no/tilbud/', true),
  ('COOP_EXTRA', 'Coop Extra', 'Evergood filtermalt 500g', 'Evergood', 'Kaffe', 'Kaffe', 59.9, 89.9, 'stk', 119.8, current_date, current_date + 7, 'Coop Extra tilbud', 'customer_flyer', 'https://coop.no/butikker/extra/medlemskupp/', true),
  ('KIWI', 'KIWI', 'Friele Frokost filtermalt 450g', 'Friele', 'Kaffe', 'Kaffe', 49.9, 74.9, 'stk', 110.9, current_date, current_date + 7, 'KIWI kundeavis', 'customer_flyer', 'https://kiwi.no/tilbudsavis/', true),
  ('COOP_EXTRA', 'Coop Extra', 'Kneippbrød 750g', 'Bakehuset', 'Brød', 'Brød', 25, 34.9, 'stk', 33.3, current_date, current_date + 7, 'Coop Extra tilbud', 'customer_flyer', 'https://coop.no/butikker/extra/medlemskupp/', true),
  ('REMA_1000', 'Rema 1000', 'Lettmelk 1,75l', 'Q-Meieriene', 'Melk', 'Lettmelk', 36.9, 42.9, 'stk', 21.1, current_date, current_date + 7, 'Rema 1000', 'customer_flyer', 'https://www.rema.no/tilbud/', true),
  ('MENY_NO', 'Meny', 'Havremelk Original 1l', 'Oatly', 'Plantebasert drikke', 'Havremelk', 22.9, 29.9, 'stk', 22.9, current_date, current_date + 7, 'Meny kundeavis', 'customer_flyer', 'https://meny.no/tilbud/', true),
  ('KIWI', 'KIWI', 'Grandiosa Original 575g', 'Stabburet', 'Frysevarer', 'Pizza', 39.9, 52.9, 'stk', 69.4, current_date, current_date + 7, 'KIWI kundeavis', 'customer_flyer', 'https://kiwi.no/tilbudsavis/', true),
  ('MENY_NO', 'Meny', 'Energidrikk 4-pk', 'Monster', 'Drikke', NULL, 79, 99, 'stk', 19.8, current_date, current_date + 7, 'Meny kundeavis', 'customer_flyer', 'https://meny.no/tilbud/', true),
  ('COOP_EXTRA', 'Coop Extra', 'Kattemat 12-pk', 'Whiskas', 'Dyremat', NULL, 89, 109, 'stk', 7.4, current_date, current_date + 7, 'Coop Extra tilbud', 'customer_flyer', 'https://coop.no/butikker/extra/medlemskupp/', true)
;
