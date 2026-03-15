import Stripe from 'https://esm.sh/stripe@14?target=deno&no-check';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno';

Deno.serve(async (req: Request) => {
  const signature = req.headers.get('stripe-signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!signature || !webhookSecret || !stripeSecret) {
    return new Response('Configuratiefout', { status: 500 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    const stripe = new Stripe(stripeSecret, { apiVersion: '2023-10-16' });
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verificatie mislukt:', err);
    return new Response('Ongeldige signature', { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.user_id;
    const plan = session.metadata?.plan as string;

    if (!userId || !plan) {
      console.error('Missende metadata: user_id of plan ontbreekt');
      return new Response('Missende metadata', { status: 400 });
    }

    // Bereken verloopdatum
    let planVerlooptOp: string | null = null;
    if (session.subscription) {
      const stripe = new Stripe(stripeSecret, { apiVersion: '2023-10-16' });
      const sub = await stripe.subscriptions.retrieve(session.subscription as string);
      planVerlooptOp = new Date(sub.current_period_end * 1000).toISOString();
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { error } = await supabase
      .from('profielen')
      .update({ plan, plan_verloopt_op: planVerlooptOp })
      .eq('id', userId);

    if (error) {
      console.error('Supabase update mislukt:', error.message);
      return new Response('Database fout', { status: 500 });
    }

    console.log(`Plan bijgewerkt: user=${userId} plan=${plan}`);
  }

  return new Response('OK', { status: 200 });
});
