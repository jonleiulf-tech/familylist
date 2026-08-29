-- Kassalapp som tilbudskilde.
--
-- Handoff-en peker ut Kassalapp som første MVP-kilde, før kundeaviser.
-- Fordelen er at nøkkelen alt er i drift: ingen ny tilgang å vente på.
-- «Tilbud» her betyr pris markant under husholdningens egen snittpris fra
-- kvitteringene, ikke en annonsert kampanje.

insert into public.offer_sources (name, source_type, store_code, fetch_frequency, notes)
values (
  'Kassalapp – prisfall',
  'api',
  null,
  'daily',
  'Sammenligner dagens Kassalapp-pris mot item_catalog.avg_price. Bruker KASSALAPP_API_KEY.'
)
on conflict (name) do nothing;
