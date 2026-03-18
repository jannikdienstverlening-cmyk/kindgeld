const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const readRawBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const signature = req.headers['stripe-signature'];
  if (!signature) return res.status(400).send('Missende stripe-signature header');

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('Stripe omgevingsvariabelen ontbreken');
    return res.status(500).send('Configuratiefout');
  }

  const rawBody = await readRawBody(req);
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verificatie mislukt:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.client_reference_id || session.metadata?.userId;

    if (!userId) {
      console.error('Missende userId in checkout session');
      return res.status(400).send('Missende userId');
    }

    // Bepaal plan op basis van price ID
    let plan;
    try {
      const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['line_items'],
      });
      const priceId = fullSession.line_items?.data?.[0]?.price?.id;

      const planByPrice = {
        [process.env.STRIPE_PRICE_GEZIN]: 'gezin',
        [process.env.STRIPE_PRICE_JAAR]:  'jaar',
      };

      plan = planByPrice[priceId] || session.metadata?.plan;
    } catch (err) {
      console.error('Kon line_items niet ophalen, val terug op metadata:', err.message);
      plan = session.metadata?.plan;
    }

    if (!plan || !['gezin', 'jaar'].includes(plan)) {
      console.error('Onbekend plan bepaald:', plan);
      return res.status(400).send('Onbekend plan');
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Supabase omgevingsvariabelen ontbreken');
      return res.status(500).send('Database configuratiefout');
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { error } = await supabase
      .from('profielen')
      .update({
        plan,
        plan_actief:     true,
        plan_gestart_op: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.error('Supabase update mislukt:', error.message);
      return res.status(500).send('Database fout');
    }

    console.log(`Plan bijgewerkt: user=${userId} plan=${plan}`);
  }

  return res.status(200).json({ received: true });
};
