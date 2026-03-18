import Stripe from 'https://esm.sh/stripe@14?target=deno&no-check';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno';

const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY        = Deno.env.get('STRIPE_SECRET_KEY')!;
const STRIPE_WEBHOOK_SECRET    = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

Deno.serve(async (req: Request) => {
  // Stripe stuurt alleen POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missende stripe-signature header', { status: 400 });
  }

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    console.error('Stripe omgevingsvariabelen ontbreken');
    return new Response('Configuratiefout', { status: 500 });
  }

  const body = await req.text();
  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verificatie mislukt:', err);
    return new Response('Ongeldige signature', { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ── Betaling geslaagd / abonnement gestart ──────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId  = session.metadata?.user_id;
    const plan    = session.metadata?.plan;

    if (!userId || !plan) {
      console.error('Missende metadata: user_id of plan ontbreekt', session.metadata);
      return new Response('Missende metadata', { status: 400 });
    }

    // Haal de subscription op om de verloopdatum te weten
    let planVerlooptOp: string | null = null;
    let stripeSubscriptionId: string | null = null;
    let stripeCustomerId: string | null = null;

    if (session.subscription) {
      try {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string);
        planVerlooptOp       = new Date(sub.current_period_end * 1000).toISOString();
        stripeSubscriptionId = sub.id;
        stripeCustomerId     = sub.customer as string;
      } catch (err) {
        console.error('Kon subscription niet ophalen:', err);
      }
    }

    const { error } = await supabase
      .from('profielen')
      .update({
        plan,
        plan_actief:             true,
        plan_gestart_op:         new Date().toISOString(),
        plan_verloopt_op:        planVerlooptOp,
        stripe_subscription_id:  stripeSubscriptionId,
        stripe_customer_id:      stripeCustomerId,
      })
      .eq('id', userId);

    if (error) {
      console.error('Supabase update mislukt (checkout.session.completed):', error.message);
      return new Response('Database fout', { status: 500 });
    }

    console.log(`Abonnement geactiveerd: user=${userId} plan=${plan}`);
  }

  // ── Abonnement opgezegd / verlopen ──────────────────────────────────────
  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription;
    const userId = subscription.metadata?.user_id;

    if (!userId) {
      // Fallback: zoek gebruiker op via stripe_customer_id
      const customerId = subscription.customer as string;
      const { data: profiel, error: zoekFout } = await supabase
        .from('profielen')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .single();

      if (zoekFout || !profiel) {
        console.error('Gebruiker niet gevonden voor customer:', customerId);
        // Toch 200 teruggeven zodat Stripe niet blijft retryën
        return new Response('OK', { status: 200 });
      }

      const { error } = await supabase
        .from('profielen')
        .update({
          plan:                    'gratis',
          plan_actief:             false,
          plan_verloopt_op:        new Date(subscription.current_period_end * 1000).toISOString(),
          stripe_subscription_id:  null,
        })
        .eq('id', profiel.id);

      if (error) {
        console.error('Supabase update mislukt (subscription.deleted via customer):', error.message);
        return new Response('Database fout', { status: 500 });
      }

      console.log(`Abonnement opgezegd via customer: user=${profiel.id}`);
      return new Response('OK', { status: 200 });
    }

    const { error } = await supabase
      .from('profielen')
      .update({
        plan:                    'gratis',
        plan_actief:             false,
        plan_verloopt_op:        new Date(subscription.current_period_end * 1000).toISOString(),
        stripe_subscription_id:  null,
      })
      .eq('id', userId);

    if (error) {
      console.error('Supabase update mislukt (subscription.deleted):', error.message);
      return new Response('Database fout', { status: 500 });
    }

    console.log(`Abonnement opgezegd: user=${userId}`);
  }

  return new Response('OK', { status: 200 });
});
