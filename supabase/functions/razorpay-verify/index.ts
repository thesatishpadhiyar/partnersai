import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function verifySignature(orderId: string, paymentId: string, signature: string, secret: string): Promise<boolean> {
  const data = `${orderId}|${paymentId}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === signature;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET');
    if (!RAZORPAY_KEY_SECRET) throw new Error('Razorpay secret not configured');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No auth token');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();

    const valid = await verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature, RAZORPAY_KEY_SECRET);
    if (!valid) throw new Error('Invalid payment signature');

    // Use service role to upsert subscription
    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await adminSupabase.from('user_subscriptions').upsert({
      user_id: user.id,
      plan: 'pro',
      status: 'active',
      razorpay_payment_id,
      razorpay_subscription_id: razorpay_order_id,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
    }, { onConflict: 'user_id' });

    return new Response(JSON.stringify({ success: true, plan: 'pro' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
