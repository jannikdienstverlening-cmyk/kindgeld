import Stripe from 'https://esm.sh/stripe@14?target=deno&no-check';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { plan, billing } = await req.json() as { plan: string; billing: string };

    if (!plan || !billing) {
      return new Response(JSON.stringify({ error: 'plan en billing zijn verplicht' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Bepaal Price ID op basis van plan
    const PRICE_IDS: Record<string, string> = {
      gezin: 'price_1TAqAYBn5uqX2edBNZFtHVKI',
      jaar:  'price_1TAqAZBn5uqX2edBrmMtXu04',
    };

    const priceId = PRICE_IDS[plan];
    if (!priceId) {
      return new Response(JSON.stringify({ error: `Onbekend plan: ${plan}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!secretKey) {
      return new Response(JSON.stringify({ error: 'Stripe secret key niet geconfigureerd' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stripe = new Stripe(secretKey, {
      apiVersion: '2023-10-16',
    });

    // Bepaal origin voor success/cancel URLs
    const origin = req.headers.get('origin') || 'https://kindgeld.nl';

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card', 'ideal'],
      mode: 'subscription',
      locale: 'nl',
      allow_promotion_codes: true,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${origin}/succes.html?plan=${plan}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/annuleer.html`,
    };

    // Eerste maand gratis trial voor Gezin plan
    if (plan === 'gezin') {
      sessionParams.subscription_data = {
        trial_period_days: 30,
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout';
    console.error('Stripe checkout fout:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
