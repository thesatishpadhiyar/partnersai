import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface SubscriptionState {
  plan: 'free' | 'pro';
  messagesUsedToday: number;
  maxMessages: number;
  canSendMessage: boolean;
  loading: boolean;
  refreshUsage: () => Promise<void>;
  incrementUsage: () => Promise<boolean>;
}

const FREE_MSG_LIMIT = 10;

export function useSubscription(): SubscriptionState {
  const { user } = useAuth();
  const [plan, setPlan] = useState<'free' | 'pro'>('free');
  const [messagesUsedToday, setMessagesUsedToday] = useState(0);
  const [loading, setLoading] = useState(true);

  const maxMessages = plan === 'pro' ? Infinity : FREE_MSG_LIMIT;
  const canSendMessage = plan === 'pro' || messagesUsedToday < FREE_MSG_LIMIT;

  const refreshUsage = useCallback(async () => {
    if (!user) return;

    // Get subscription
    const { data: sub } = await supabase
      .from('user_subscriptions_safe' as any)
      .select('plan, status, current_period_end')
      .eq('user_id', user.id)
      .maybeSingle() as { data: { plan: string; status: string; current_period_end: string | null } | null };

    if (sub && sub.plan === 'pro' && sub.status === 'active') {
      // Check if still within period
      if (!sub.current_period_end || new Date(sub.current_period_end) > new Date()) {
        setPlan('pro');
      } else {
        setPlan('free');
      }
    } else {
      setPlan('free');
    }

    // Get today's usage
    const today = new Date().toISOString().split('T')[0];
    const { data: usage } = await supabase
      .from('daily_usage')
      .select('messages_sent')
      .eq('user_id', user.id)
      .eq('usage_date', today)
      .maybeSingle();

    setMessagesUsedToday(usage?.messages_sent ?? 0);
    setLoading(false);
  }, [user]);

  const incrementUsage = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    if (plan === 'pro') return true;
    if (messagesUsedToday >= FREE_MSG_LIMIT) return false;

    const today = new Date().toISOString().split('T')[0];
    const newCount = messagesUsedToday + 1;

    const { error } = await supabase
      .from('daily_usage')
      .upsert({
        user_id: user.id,
        usage_date: today,
        messages_sent: newCount,
      }, { onConflict: 'user_id,usage_date' });

    if (!error) {
      setMessagesUsedToday(newCount);
      return true;
    }
    return false;
  }, [user, plan, messagesUsedToday]);

  useEffect(() => {
    refreshUsage();
  }, [refreshUsage]);

  return { plan, messagesUsedToday, maxMessages, canSendMessage, loading, refreshUsage, incrementUsage };
}
