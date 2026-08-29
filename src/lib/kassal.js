// Kassalapp-klient. Kaller VÅR Edge Function, aldri Kassalapp direkte —
// API-nøkkelen finnes kun server-side.
import { supabase } from './supabase.js';

export async function searchProducts(query, store = '', size = 10) {
  const q = (query || '').trim();
  if (!q) return { products: [], error: null };

  const params = new URLSearchParams({ search: q, size: String(size) });
  // Tomt = alle butikker. Butikkfilter gir ofte 0 treff hos Kassalapp.
  if (store) params.set('store', store);

  const { data, error } = await supabase.functions.invoke(
    `kassal-products?${params.toString()}`,
    { method: 'GET' }
  );

  if (error) {
    return { products: [], error: 'Kunne ikke hente priser akkurat nå.' };
  }
  if (data?.error) {
    return { products: [], error: data.error };
  }
  const products = data?.products ?? [];
  return {
    products,
    error: products.length ? null : 'Ingen produkter funnet. Prøv et annet søk.',
  };
}
