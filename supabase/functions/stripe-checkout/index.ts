import Stripe from 'https://esm.sh/stripe@14?target=deno&no-check';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://ysdwxbwfbayygujlshxi.supabase.co';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzZHd4YndmYmF5eWd1amxzaHhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTc5OTMsImV4cCI6MjA4ODk5Mzk5M30.qsxpi4ls-5pLzLMVxzwfuF1YenB4ZpML8KE8QOq1mek';

const PRICE_IDS: Record<string, string> = {
  gezin: 'price_1TAqAYBn5uqX2edBNZFtHVKI',
  jaar:  'price_1TAqAZBn5uqX2edBrmMtXu04',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Haal ingelogde gebruiker op via JWT
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Niet ingelogd' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { plan, billing } = await req.json() as { plan: string; billing: string };
    if (!plan || !billing) {
      return new Response(JSON.stringify({ error: 'plan en billing zijn verplicht' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const priceId = PRICE_IDS[plan];
    if (!priceId) {
      return new Response(JSON.stringify({ error: `Onbekend plan: ${plan}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!secretKey) {
      return new Response(JSON.stringify({ error: 'Stripe secret key niet geconfigureerd' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stripe = new Stripe(secretKey, { apiVersion: '2023-10-16' });
    const origin = req.headers.get('origin') || 'https://kindgeld.nl';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'ideal'],
      mode: 'subscription',
      locale: 'nl',
      allow_promotion_codes: true,
      customer_email: user.email,
      metadata: { user_id: user.id, plan },
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/dashboard.html?success=true&plan=${plan}`,
      cancel_url: `${origin}/abonnement.html`,
      subscription_data: {
        metadata: { user_id: user.id, plan },
        ...(plan === 'gezin' ? { trial_period_days: 14 } : {}),
      },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout';
    console.error('Stripe checkout fout:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
