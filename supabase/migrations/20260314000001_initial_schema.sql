-- ============================================================
-- Kindgeld — initieel databaseschema
-- ============================================================

-- ── PROFIELEN ────────────────────────────────────────────────
-- Ouder-profielen (uitbreiding op auth.users)
CREATE TABLE IF NOT EXISTS public.profielen (
  id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  naam        text        NOT NULL DEFAULT '',
  email       text,
  plan        text        NOT NULL DEFAULT 'gratis'   -- 'gratis' | 'gezin' | 'jaar'
                          CHECK (plan IN ('gratis', 'gezin', 'jaar')),
  pin         text,                                   -- 4-cijferige PIN als tekst
  aangemaakt_op timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profielen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Eigen profiel lezen"
  ON public.profielen FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Eigen profiel aanmaken"
  ON public.profielen FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Eigen profiel bijwerken"
  ON public.profielen FOR UPDATE
  USING (auth.uid() = id);


-- ── KINDEREN ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kinderen (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ouder_id        uuid        NOT NULL REFERENCES public.profielen(id) ON DELETE CASCADE,
  naam            text        NOT NULL,
  leeftijd        int,
  avatar          text        DEFAULT '🐷',
  saldo           numeric(10,2) NOT NULL DEFAULT 0,
  munten          int         NOT NULL DEFAULT 0,
  streak          int         NOT NULL DEFAULT 0,
  laatste_activiteit date,
  zakgeld_bedrag  numeric(10,2),
  zakgeld_dag     text,       -- 'ma' | 'di' | ... | 'zo'
  zakgeld_actief  boolean     DEFAULT false,
  aangemaakt_op   timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kinderen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Eigen kinderen beheren"
  ON public.kinderen FOR ALL
  USING (auth.uid() = ouder_id);


-- ── SPAARDOELEN ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.spaardoelen (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind_id         uuid        NOT NULL REFERENCES public.kinderen(id) ON DELETE CASCADE,
  naam            text        NOT NULL,
  emoji           text        DEFAULT '🎯',
  doelbedrag      numeric(10,2) NOT NULL DEFAULT 0,
  huidig_bedrag   numeric(10,2) NOT NULL DEFAULT 0,
  actief          boolean     NOT NULL DEFAULT true,
  bereikt         boolean     NOT NULL DEFAULT false,
  bereikt_op      timestamptz,
  aangemaakt_op   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.spaardoelen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ouder beheert spaardoelen kind"
  ON public.spaardoelen FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.kinderen
      WHERE id = spaardoelen.kind_id
        AND ouder_id = auth.uid()
    )
  );


-- ── UITDAGINGEN ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.uitdagingen (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind_id         uuid        NOT NULL REFERENCES public.kinderen(id) ON DELETE CASCADE,
  aangemaakt_door uuid        REFERENCES auth.users(id),
  naam            text        NOT NULL,
  emoji           text        DEFAULT '⚡',
  beschrijving    text,
  beloning_munten int         NOT NULL DEFAULT 5,
  beloning_euro   numeric(10,2) NOT NULL DEFAULT 0,
  herhaling       text        NOT NULL DEFAULT 'dagelijks'
                              CHECK (herhaling IN ('dagelijks', 'wekelijks', 'eenmalig')),
  voltooid        boolean     NOT NULL DEFAULT false,
  voltooid_op     timestamptz,
  aangemaakt_op   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.uitdagingen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ouder beheert uitdagingen kind"
  ON public.uitdagingen FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.kinderen
      WHERE id = uitdagingen.kind_id
        AND ouder_id = auth.uid()
    )
  );


-- ── BELONINGEN ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.beloningen (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind_id         uuid        NOT NULL REFERENCES public.kinderen(id) ON DELETE CASCADE,
  naam            text        NOT NULL,
  emoji           text        DEFAULT '🏆',
  kosten_munten   int         NOT NULL DEFAULT 0,
  status          text        NOT NULL DEFAULT 'beschikbaar'
                              CHECK (status IN ('beschikbaar', 'aangevraagd', 'goedgekeurd', 'afgewezen')),
  aangevraagd_op  timestamptz,
  beoordeeld_op   timestamptz,
  aangemaakt_op   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.beloningen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ouder beheert beloningen kind"
  ON public.beloningen FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.kinderen
      WHERE id = beloningen.kind_id
        AND ouder_id = auth.uid()
    )
  );


-- ── TRANSACTIES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transacties (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind_id         uuid        NOT NULL REFERENCES public.kinderen(id) ON DELETE CASCADE,
  type            text        NOT NULL DEFAULT 'storting'
                              CHECK (type IN ('storting', 'opname', 'uitdaging', 'zakgeld', 'spaardoel')),
  bedrag          numeric(10,2) NOT NULL,
  omschrijving    text,
  aangemaakt_op   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transacties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ouder ziet transacties kind"
  ON public.transacties FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.kinderen
      WHERE id = transacties.kind_id
        AND ouder_id = auth.uid()
    )
  );


-- ── REALTIME ─────────────────────────────────────────────────
-- Zet realtime aan voor live updates in het kindscherm
ALTER PUBLICATION supabase_realtime ADD TABLE public.kinderen;
ALTER PUBLICATION supabase_realtime ADD TABLE public.beloningen;


-- ── TRIGGER: profiel aanmaken bij registratie ────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profielen (id, naam, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'naam', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ── TRIGGER: bijgewerkt_op automatisch bijhouden ─────────────
CREATE OR REPLACE FUNCTION public.set_bijgewerkt_op()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.bijgewerkt_op = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profielen_bijgewerkt
  BEFORE UPDATE ON public.profielen
  FOR EACH ROW EXECUTE FUNCTION public.set_bijgewerkt_op();

CREATE TRIGGER trg_kinderen_bijgewerkt
  BEFORE UPDATE ON public.kinderen
  FOR EACH ROW EXECUTE FUNCTION public.set_bijgewerkt_op();


-- ── INDEXEN ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_kinderen_ouder_id      ON public.kinderen(ouder_id);
CREATE INDEX IF NOT EXISTS idx_spaardoelen_kind_id    ON public.spaardoelen(kind_id);
CREATE INDEX IF NOT EXISTS idx_uitdagingen_kind_id    ON public.uitdagingen(kind_id);
CREATE INDEX IF NOT EXISTS idx_beloningen_kind_id     ON public.beloningen(kind_id);
CREATE INDEX IF NOT EXISTS idx_transacties_kind_id    ON public.transacties(kind_id);
CREATE INDEX IF NOT EXISTS idx_transacties_aangemaakt ON public.transacties(aangemaakt_op DESC);
