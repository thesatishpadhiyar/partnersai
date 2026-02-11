import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function getDurationEnd(duration: string): Date {
  const now = new Date();
  switch (duration) {
    case 'week': now.setDate(now.getDate() + 7); break;
    case 'month': now.setMonth(now.getMonth() + 1); break;
    case 'year': now.setFullYear(now.getFullYear() + 1); break;
    default: now.setMonth(now.getMonth() + 1);
  }
  return now;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No auth token');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    // Actions that don't require admin
    const userActions = ['validate-promo', 'redeem-promo'];
    const isUserAction = userActions.includes(action || '');

    if (!isUserAction) {
      const { data: roleData } = await adminSupabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (!roleData) throw new Error('Forbidden: Admin access required');
    }

    // GET actions
    if (req.method === 'GET') {
      if (action === 'users') {
        const { data: users } = await adminSupabase.auth.admin.listUsers();
        const { data: subs } = await adminSupabase.from('user_subscriptions').select('*');
        const { data: roles } = await adminSupabase.from('user_roles').select('*');
        
        const enriched = users?.users?.map(u => {
          const sub = subs?.find(s => s.user_id === u.id);
          const userRoles = roles?.filter(r => r.user_id === u.id).map(r => r.role) || [];
          return {
            id: u.id,
            email: u.email,
            created_at: u.created_at,
            last_sign_in_at: u.last_sign_in_at,
            plan: sub?.plan || 'free',
            plan_duration: sub?.plan_duration || 'month',
            subscription_status: sub?.status || 'none',
            current_period_end: sub?.current_period_end,
            roles: userRoles,
          };
        }) || [];

        return new Response(JSON.stringify({ users: enriched }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'stats') {
        const { data: users } = await adminSupabase.auth.admin.listUsers();
        const { data: subs } = await adminSupabase.from('user_subscriptions').select('*');
        const totalUsers = users?.users?.length || 0;
        const proUsers = subs?.filter(s => s.plan === 'pro' && s.status === 'active').length || 0;
        const { count: totalMessages } = await adminSupabase.from('chat_messages').select('*', { count: 'exact', head: true });
        const { count: totalPromos } = await adminSupabase.from('promo_codes').select('*', { count: 'exact', head: true });

        return new Response(JSON.stringify({
          totalUsers,
          proUsers,
          freeUsers: totalUsers - proUsers,
          totalMessages: totalMessages || 0,
          totalPromos: totalPromos || 0,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'promo-codes') {
        const { data: promos } = await adminSupabase
          .from('promo_codes')
          .select('*')
          .order('created_at', { ascending: false });

        return new Response(JSON.stringify({ promos: promos || [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // POST actions
    if (req.method === 'POST') {
      const body = await req.json();

      if (action === 'update-subscription') {
        const { userId, plan, status, duration } = body;
        const periodEnd = plan === 'pro' ? getDurationEnd(duration || 'month') : null;

        await adminSupabase.from('user_subscriptions').upsert({
          user_id: userId,
          plan,
          status,
          plan_duration: duration || 'month',
          current_period_start: new Date().toISOString(),
          current_period_end: periodEnd?.toISOString() || null,
        }, { onConflict: 'user_id' });

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'delete-subscription') {
        const { userId } = body;
        await adminSupabase.from('user_subscriptions').delete().eq('user_id', userId);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'add-admin') {
        const { userId } = body;
        await adminSupabase.from('user_roles').upsert({ user_id: userId, role: 'admin' }, { onConflict: 'user_id,role' });
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'remove-admin') {
        const { userId } = body;
        await adminSupabase.from('user_roles').delete().eq('user_id', userId).eq('role', 'admin');
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'delete-user-data') {
        const { userId } = body;
        await adminSupabase.from('chat_messages').delete().eq('user_id', userId);
        await adminSupabase.from('imported_chats').delete().eq('user_id', userId);
        await adminSupabase.from('chat_sessions').delete().eq('user_id', userId);
        await adminSupabase.from('daily_usage').delete().eq('user_id', userId);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Promo code actions
      if (action === 'create-promo') {
        const { code, discount_type, discount_value, max_uses, valid_from, valid_until, plan_duration, is_active } = body;
        const { error } = await adminSupabase.from('promo_codes').insert({
          code: code.toUpperCase(),
          discount_type,
          discount_value,
          max_uses: max_uses || null,
          valid_from: valid_from || new Date().toISOString(),
          valid_until: valid_until || null,
          plan_duration: plan_duration || 'month',
          is_active: is_active !== false,
          created_by: user.id,
        });
        if (error) throw new Error(error.message);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'update-promo') {
        const { promoId, ...updates } = body;
        if (updates.code) updates.code = updates.code.toUpperCase();
        const { error } = await adminSupabase.from('promo_codes').update(updates).eq('id', promoId);
        if (error) throw new Error(error.message);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'delete-promo') {
        const { promoId } = body;
        await adminSupabase.from('promo_codes').delete().eq('id', promoId);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Validate promo code (for users)
      if (action === 'validate-promo') {
        const { code } = body;
        const { data: promo } = await adminSupabase
          .from('promo_codes')
          .select('*')
          .eq('code', code.toUpperCase())
          .eq('is_active', true)
          .maybeSingle();

        if (!promo) {
          return new Response(JSON.stringify({ valid: false, error: 'Invalid promo code' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Check expiry
        if (promo.valid_until && new Date(promo.valid_until) < new Date()) {
          return new Response(JSON.stringify({ valid: false, error: 'Promo code expired' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Check max uses
        if (promo.max_uses && promo.times_used >= promo.max_uses) {
          return new Response(JSON.stringify({ valid: false, error: 'Promo code fully redeemed' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Check if user already used
        const { data: existing } = await adminSupabase
          .from('promo_redemptions')
          .select('id')
          .eq('promo_code_id', promo.id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (existing) {
          return new Response(JSON.stringify({ valid: false, error: 'Already used this promo code' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({
          valid: true,
          discount_type: promo.discount_type,
          discount_value: promo.discount_value,
          plan_duration: promo.plan_duration,
          promo_id: promo.id,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Redeem promo code (only 100% discount codes can be redeemed directly)
      if (action === 'redeem-promo') {
        const { promoId } = body;
        const { data: promo } = await adminSupabase
          .from('promo_codes')
          .select('*')
          .eq('id', promoId)
          .eq('is_active', true)
          .maybeSingle();

        if (!promo) throw new Error('Invalid promo code');

        // Only allow direct redemption for 100% off or full-amount fixed discounts
        const baseAmountINR = 499;
        const isFreePromo = (promo.discount_type === 'percentage' && promo.discount_value >= 100) ||
          (promo.discount_type === 'fixed' && promo.discount_value >= baseAmountINR);

        if (!isFreePromo) {
          throw new Error('This promo code gives a discount. Please proceed with payment.');
        }

        // Record redemption
        await adminSupabase.from('promo_redemptions').insert({
          promo_code_id: promoId,
          user_id: user.id,
        });

        // Increment times_used
        await adminSupabase.from('promo_codes').update({
          times_used: promo.times_used + 1,
        }).eq('id', promoId);

        // Activate subscription
        const periodEnd = getDurationEnd(promo.plan_duration);
        await adminSupabase.from('user_subscriptions').upsert({
          user_id: user.id,
          plan: 'pro',
          status: 'active',
          plan_duration: promo.plan_duration,
          current_period_start: new Date().toISOString(),
          current_period_end: periodEnd.toISOString(),
        }, { onConflict: 'user_id' });

        return new Response(JSON.stringify({ success: true, plan_duration: promo.plan_duration }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    throw new Error('Invalid action');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg.includes('Forbidden') ? 403 : msg.includes('Unauthorized') ? 401 : 400;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
