import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/', request.url), { status: 302 });
}
