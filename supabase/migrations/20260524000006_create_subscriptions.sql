-- YuSay: RevenueCat 연동 구독 정보

CREATE TABLE public.subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan                    TEXT NOT NULL
                            CHECK (plan IN ('free', 'pro', 'team')),
  status                  TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'canceled', 'expired', 'trial')),
  revenuecat_customer_id  TEXT,
  revenuecat_entitlement  TEXT,
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  trial_end               TIMESTAMPTZ,
  cancel_at_period_end    BOOLEAN NOT NULL DEFAULT FALSE,
  region                  TEXT,         -- 'KR', 'US', 'JP', 'SEA'
  price_local             NUMERIC,
  currency                TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX idx_subscriptions_user ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_revenuecat ON public.subscriptions(revenuecat_customer_id);
