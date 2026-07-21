'use client';
import { createBrowserClient } from '@supabase/ssr';

/*
  KURAL: client her zaman fonksiyon içinde oluşturulur, modül seviyesinde asla.
  createBrowserClient oturumu çereze yazar; böylece middleware ve sunucu
  bileşenleri aynı oturumu okuyabilir. (localStorage kullanılsaydı sunucu göremezdi.)
*/
export function getSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
