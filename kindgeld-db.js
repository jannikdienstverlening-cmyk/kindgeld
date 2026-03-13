// ============================================================
// kindgeld-db.js — Supabase integratie voor Kindgeld
// Voeg toe aan elke pagina: <script src="kindgeld-db.js"></script>
// ============================================================

// ── CONFIG ── VERVANG MET JOUW SUPABASE WAARDEN ─────────────
// Vind je op: supabase.com → jouw project → Settings → API
const SUPABASE_URL  = 'https://JOUW_PROJECT_ID.supabase.co';
const SUPABASE_KEY  = 'JOUW_ANON_PUBLIC_KEY';
// ────────────────────────────────────────────────────────────

// Laad Supabase client (via CDN, geen installatie nodig)
// Zorg dat je dit script tag in je HTML hebt VOOR kindgeld-db.js:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);


// ============================================================
// 🔐 AUTHENTICATIE
// ============================================================

const Auth = {

  // Registreren
  async registreer(naam, email, wachtwoord) {
    const { data, error } = await db.auth.signUp({
      email,
      password: wachtwoord,
      options: { data: { naam } }
    });
    if (error) throw error;
    return data;
  },

  // Inloggen
  async inloggen(email, wachtwoord) {
    const { data, error } = await db.auth.signInWithPassword({ email, password: wachtwoord });
    if (error) throw error;
    return data;
  },

  // Google inloggen
  async googleInloggen() {
    const { error } = await db.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/dashboard.html' }
    });
    if (error) throw error;
  },

  // Uitloggen
  async uitloggen() {
    await db.auth.signOut();
    window.location.href = 'index.html';
  },

  // Huidige gebruiker ophalen
  async huidigeProfiel() {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return null;
    const { data } = await db.from('profielen').select('*').eq('id', user.id).single();
    return data;
  },

  // Wachtwoord vergeten
  async wachtwoordVergeten(email) {
    const { error } = await db.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/nieuw-wachtwoord.html'
    });
    if (error) throw error;
  },

  // Controleer of ingelogd, anders redirect naar login
  async vereistInloggen() {
    const { data: { user } } = await db.auth.getUser();
    if (!user) window.location.href = 'index.html';
    return user;
  }
};


// ============================================================
// 👧 KINDEREN
// ============================================================

const Kinderen = {

  // Alle kinderen van ingelogde ouder
  async ophalen() {
    const { data, error } = await db
      .from('kinderen')
      .select('*, spaardoelen(*), uitdagingen(*)')
      .order('aangemaakt_op');
    if (error) throw error;
    return data;
  },

  // Eén kind ophalen
  async ophalenById(id) {
    const { data, error } = await db
      .from('kinderen')
      .select('*, spaardoelen(*), uitdagingen(*), transacties(*), beloningen(*)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  // Kind aanmaken
  async aanmaken({ naam, leeftijd, avatar }) {
    const { data: { user } } = await db.auth.getUser();
    const { data, error } = await db
      .from('kinderen')
      .insert({ ouder_id: user.id, naam, leeftijd, avatar })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Saldo bijwerken
  async saldoBijwerken(kindId, bedrag, omschrijving, type = 'storting') {
    // Haal huidig saldo op
    const { data: kind } = await db.from('kinderen').select('saldo').eq('id', kindId).single();
    const nieuwSaldo = (kind.saldo || 0) + bedrag;

    // Update saldo
    await db.from('kinderen').update({ saldo: nieuwSaldo }).eq('id', kindId);

    // Sla transactie op
    await db.from('transacties').insert({
      kind_id: kindId, type, bedrag, omschrijving
    });

    return nieuwSaldo;
  },

  // Munten bijwerken
  async muntenToevoegen(kindId, munten) {
    const { data: kind } = await db.from('kinderen').select('munten').eq('id', kindId).single();
    await db.from('kinderen').update({ munten: (kind.munten || 0) + munten }).eq('id', kindId);
  }
};


// ============================================================
// 🎯 SPAARDOELEN
// ============================================================

const Spaardoelen = {

  async ophalen(kindId) {
    const { data, error } = await db
      .from('spaardoelen')
      .select('*')
      .eq('kind_id', kindId)
      .eq('actief', true)
      .order('aangemaakt_op');
    if (error) throw error;
    return data;
  },

  async aanmaken({ kindId, naam, emoji, doelbedrag }) {
    const { data, error } = await db
      .from('spaardoelen')
      .insert({ kind_id: kindId, naam, emoji, doelbedrag })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async bedragToevoegen(doelId, bedrag) {
    const { data: doel } = await db.from('spaardoelen').select('*').eq('id', doelId).single();
    const nieuw = Math.min(doel.huidig_bedrag + bedrag, doel.doelbedrag);
    const bereikt = nieuw >= doel.doelbedrag;
    await db.from('spaardoelen').update({ huidig_bedrag: nieuw, bereikt }).eq('id', doelId);
    return { nieuw, bereikt };
  }
};


// ============================================================
// ⚡ UITDAGINGEN
// ============================================================

const Uitdagingen = {

  async ophalen(kindId) {
    const { data, error } = await db
      .from('uitdagingen')
      .select('*')
      .eq('kind_id', kindId)
      .order('aangemaakt_op', { ascending: false });
    if (error) throw error;
    return data;
  },

  async aanmaken({ kindId, naam, emoji, beschrijving, beloningMunten, beloningEuro, herhaling }) {
    const { data: { user } } = await db.auth.getUser();
    const { data, error } = await db
      .from('uitdagingen')
      .insert({
        kind_id: kindId, naam, emoji, beschrijving,
        beloning_munten: beloningMunten || 5,
        beloning_euro: beloningEuro || 0,
        herhaling: herhaling || 'eenmalig',
        aangemaakt_door: user.id
      })
      .select().single();
    if (error) throw error;
    return data;
  },

  // Kind voltooit uitdaging → beloning uitkeren
  async voltooien(uitdagingId) {
    const { data: u } = await db.from('uitdagingen').select('*').eq('id', uitdagingId).single();
    if (u.voltooid && u.herhaling === 'eenmalig') throw new Error('Al voltooid');

    await db.from('uitdagingen').update({
      voltooid: true,
      voltooid_op: new Date().toISOString()
    }).eq('id', uitdagingId);

    // Uitbetalen
    if (u.beloning_euro > 0) {
      await Kinderen.saldoBijwerken(u.kind_id, u.beloning_euro, `Uitdaging: ${u.naam}`, 'uitdaging');
    }
    if (u.beloning_munten > 0) {
      await Kinderen.muntenToevoegen(u.kind_id, u.beloning_munten);
    }

    return u;
  }
};


// ============================================================
// 🏆 BELONINGEN
// ============================================================

const Beloningen = {

  async ophalen(kindId) {
    const { data, error } = await db
      .from('beloningen')
      .select('*')
      .eq('kind_id', kindId)
      .order('aangemaakt_op', { ascending: false });
    if (error) throw error;
    return data;
  },

  async aanvragen(kindId, { naam, emoji, kostenMunten }) {
    const { data, error } = await db
      .from('beloningen')
      .insert({
        kind_id: kindId, naam, emoji,
        kosten_munten: kostenMunten,
        status: 'aangevraagd',
        aangevraagd_op: new Date().toISOString()
      })
      .select().single();
    if (error) throw error;
    return data;
  },

  // Ouder keurt goed of af
  async beoordelen(beloningId, goedgekeurd) {
    const status = goedgekeurd ? 'goedgekeurd' : 'afgewezen';
    await db.from('beloningen').update({ status }).eq('id', beloningId);

    if (goedgekeurd) {
      const { data: b } = await db.from('beloningen').select('*').eq('id', beloningId).single();
      // Trek munten af
      const { data: kind } = await db.from('kinderen').select('munten').eq('id', b.kind_id).single();
      await db.from('kinderen').update({ munten: Math.max(0, kind.munten - b.kosten_munten) }).eq('id', b.kind_id);
    }
  }
};


// ============================================================
// 📊 TRANSACTIES
// ============================================================

const Transacties = {

  async ophalen(kindId, limiet = 20) {
    const { data, error } = await db
      .from('transacties')
      .select('*')
      .eq('kind_id', kindId)
      .order('aangemaakt_op', { ascending: false })
      .limit(limiet);
    if (error) throw error;
    return data;
  }
};


// ============================================================
// 🔔 REALTIME (live updates)
// ============================================================

const Realtime = {

  // Luister naar saldo wijzigingen van een kind
  saldoWijziging(kindId, callback) {
    return db
      .channel('kind-saldo-' + kindId)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'kinderen',
        filter: `id=eq.${kindId}`
      }, payload => callback(payload.new))
      .subscribe();
  },

  // Luister naar nieuwe beloningsaanvragen
  nieuweBeloningAanvraag(ouderCallback) {
    return db
      .channel('beloning-aanvragen')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'beloningen'
      }, payload => ouderCallback(payload.new))
      .subscribe();
  },

  stopListening(channel) {
    db.removeChannel(channel);
  }
};


// ============================================================
// 🛠️ HULPFUNCTIES
// ============================================================

function euro(bedrag) {
  return '€' + parseFloat(bedrag || 0).toFixed(2).replace('.', ',');
}

function dagGeleden(datum) {
  const diff = Math.floor((Date.now() - new Date(datum)) / 86400000);
  if (diff === 0) return 'Vandaag';
  if (diff === 1) return 'Gisteren';
  return diff + ' dagen geleden';
}

// Exporteer alles globaal (geen bundler nodig)
window.KG = { db, Auth, Kinderen, Spaardoelen, Uitdagingen, Beloningen, Transacties, Realtime, euro, dagGeleden };

console.log('✅ Kindgeld DB geladen');
