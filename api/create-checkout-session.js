const Stripe = require('stripe');

const PRICE_IDS = {
  gezin: process.env.STRIPE_PRICE_GEZIN,
  jaar:  process.env.STRIPE_PRICE_JAAR,
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://kindgeld.nl');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return res.status(400).json({ error: 'Ongeldige JSON' });
  }

  const { plan, userId } = body;

  if (!plan || !PRICE_IDS[plan]) {
    return res.status(400).json({ error: `Onbekend plan: ${plan}` });
  }
  if (!userId) {
    return res.status(400).json({ error: 'userId is verplicht' });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe niet geconfigureerd' });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'ideal'],
      mode: 'subscription',
      locale: 'nl',
      allow_promotion_codes: true,
      client_reference_id: userId,
      metadata: { userId, plan },
      line_items: [{ price: PRICE_IDS[plan], quantity: 1 }],
      success_url: 'https://kindgeld.nl/dashboard.html?betaling=gelukt',
      cancel_url: 'https://kindgeld.nl/abonnement.html',
      subscription_data: {
        metadata: { userId, plan },
        ...(plan === 'gezin' ? { trial_period_days: 14 } : {}),
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout fout:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
