
-- Create a safe view excluding payment gateway IDs
CREATE VIEW public.user_subscriptions_safe
WITH (security_invoker=on) AS
  SELECT id, user_id, plan, status, plan_duration, current_period_start, current_period_end, created_at, updated_at
  FROM public.user_subscriptions;

-- Drop the existing user SELECT policy
DROP POLICY IF EXISTS "Users can view own subscription" ON public.user_subscriptions;

-- Deny direct SELECT on the base table for regular users
CREATE POLICY "Users cannot directly select subscriptions"
  ON public.user_subscriptions FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR auth.uid() = user_id
  );
