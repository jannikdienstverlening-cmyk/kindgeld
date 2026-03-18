-- Voeg Stripe-gerelateerde kolommen toe aan profielen
ALTER TABLE public.profielen
  ADD COLUMN IF NOT EXISTS plan                   text        NOT NULL DEFAULT 'gratis',
  ADD COLUMN IF NOT EXISTS plan_actief            boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plan_gestart_op        timestamptz,
  ADD COLUMN IF NOT EXISTS plan_verloopt_op       timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_customer_id     text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
