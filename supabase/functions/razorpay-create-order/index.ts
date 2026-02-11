import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID');
    const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET');
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay credentials not configured');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No auth token');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    const { plan, currency: reqCurrency, promoId } = await req.json();
    if (plan !== 'pro') throw new Error('Invalid plan');

    const currency = reqCurrency === 'USD' ? 'USD' : 'INR';
    let amount = currency === 'INR' ? 49900 : 900; // ₹499 or $9

    // Apply promo discount if provided
    if (promoId) {
      const adminSupabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const { data: promo } = await adminSupabase
        .from('promo_codes')
        .select('*')
        .eq('id', promoId)
        .eq('is_active', true)
        .maybeSingle();

      if (promo) {
        if (promo.discount_type === 'percentage') {
          amount = Math.round(amount * (1 - promo.discount_value / 100));
        } else if (promo.discount_type === 'fixed') {
          const fixedPaise = currency === 'INR' ? promo.discount_value * 100 : promo.discount_value * 100;
          amount = Math.max(100, amount - fixedPaise); // Razorpay min ₹1
        }
      }
    }

    const credentials = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const orderRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amount,
        currency,
        receipt: `pro_${user.id.slice(0, 8)}`,
        notes: { user_id: user.id, plan: 'pro' },
      }),
    });

    if (!orderRes.ok) {
      const err = await orderRes.text();
      throw new Error(`Razorpay order failed [${orderRes.status}]: ${err}`);
    }

    const order = await orderRes.json();

    return new Response(JSON.stringify({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: RAZORPAY_KEY_ID,
    }), {
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
