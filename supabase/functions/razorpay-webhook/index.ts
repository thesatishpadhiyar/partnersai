import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-razorpay-signature, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function verifyWebhookSignature(body: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === signature;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET');
    if (!RAZORPAY_KEY_SECRET) throw new Error('Razorpay secret not configured');

    const body = await req.text();
    const signature = req.headers.get('x-razorpay-signature') || '';

    const valid = await verifyWebhookSignature(body, signature, RAZORPAY_KEY_SECRET);
    if (!valid) {
      console.error('Invalid webhook signature');
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const event = JSON.parse(body);
    const eventType = event.event;

    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    if (eventType === 'payment.captured') {
      const payment = event.payload.payment.entity;
      const userId = payment.notes?.user_id;

      if (userId) {
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);

        await adminSupabase.from('user_subscriptions').upsert({
          user_id: userId,
          plan: 'pro',
          status: 'active',
          razorpay_payment_id: payment.id,
          razorpay_subscription_id: payment.order_id,
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
        }, { onConflict: 'user_id' });

        console.log(`Subscription activated for user: ${userId}`);
      }
    } else if (eventType === 'payment.failed') {
      const payment = event.payload.payment.entity;
      const userId = payment.notes?.user_id;
      if (userId) {
        console.log(`Payment failed for user: ${userId}`);
      }
    }

    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('Webhook error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
