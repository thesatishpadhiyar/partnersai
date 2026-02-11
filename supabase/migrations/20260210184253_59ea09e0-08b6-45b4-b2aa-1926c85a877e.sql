
-- Create promo_codes table
CREATE TABLE public.promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  discount_type TEXT NOT NULL DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC NOT NULL DEFAULT 0,
  max_uses INTEGER DEFAULT NULL,
  times_used INTEGER NOT NULL DEFAULT 0,
  valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  valid_until TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  plan_duration TEXT NOT NULL DEFAULT 'month' CHECK (plan_duration IN ('week', 'month', 'year')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

-- Only admins can manage promo codes
CREATE POLICY "Admins can manage promo codes"
ON public.promo_codes
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Anyone authenticated can read active promo codes (for validation)
CREATE POLICY "Users can read active promo codes"
ON public.promo_codes
FOR SELECT
USING (is_active = true AND auth.uid() IS NOT NULL);

-- Create promo_redemptions table to track usage
CREATE TABLE public.promo_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id UUID REFERENCES public.promo_codes(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (promo_code_id, user_id)
);

ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own redemptions"
ON public.promo_redemptions
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own redemptions"
ON public.promo_redemptions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage redemptions"
ON public.promo_redemptions
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add plan_duration to user_subscriptions
ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS plan_duration TEXT DEFAULT 'month';

-- Trigger for updated_at
CREATE TRIGGER update_promo_codes_updated_at
BEFORE UPDATE ON public.promo_codes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
