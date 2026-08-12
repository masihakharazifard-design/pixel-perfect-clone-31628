# Inloggen met Maasmond e-mailadres (echte sessie)

Alleen de manier van inloggen verandert. Planning, werken, medewerkers, beschikbaarheid, rollen, auditlog en de databasebeveiliging blijven precies zoals ze nu zijn.

## Hoe het straks werkt

1. Inlogscherm toont één veld `E-mailadres` en één knop `Inloggen`.
2. Alleen adressen die eindigen op `@maasmond.nl` worden geaccepteerd, anders: "Gebruik je Maasmond e-mailadres om in te loggen."
3. De backend stuurt een inlogcode/-link naar dat adres: "We hebben een inloglink naar je Maasmond e-mailadres gestuurd."
4. Het scherm toont daarna een veld voor de 6-cijferige code (de link in de mail werkt ook). Code invullen = echte sessie.
5. De app opent; na verversen blijft de gebruiker ingelogd.
6. Uitloggen werkt zoals nu en brengt de gebruiker terug naar het inlogscherm zonder planningdata.

Geen Microsoft-knop als verplichte eerste stap, geen tenant-foutmeldingen, geen demo-login meer.

Wie wel inlogt maar (nog) geen rol heeft, ziet: "Je account is aangemeld, maar heeft nog geen toegang tot Maasmond Planning. Neem contact op met de beheerder."

## Rollen

- Nieuwe Maasmond-gebruikers krijgen automatisch de standaardrol `planner`.
- Niemand wordt nog automatisch Beheerder; bestaande beheerders behouden hun rol.
- Bestaande gebruikers loggen in op hetzelfde e-mailadres en houden hun bestaande account, rol en auditgeschiedenis. Er wordt geen tweede gebruiker gemaakt.

## Technische uitvoering

- `src/components/auth-gate.tsx`:
  - Login via `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: window.location.origin } })` na clientcontrole `email.trim().toLowerCase().endsWith("@maasmond.nl")`.
  - Tweede stap: `supabase.auth.verifyOtp({ email, token, type: "email" })`.
  - Sessie bepalen via `getSession()` + `onAuthStateChange`; geen redirects, dus geen loop.
  - Alle demo-logica en de `maasmond-demo-user`-sleutel verwijderen; oude sleutel bij starten opruimen.
  - Geen Azure-`tid`-controle meer in het toegangspad; toegang = geldige sessie (+ rol voor data).
  - Ruwe Supabase-foutmeldingen worden vervangen door de vier vaste Nederlandse teksten.
- Databasemigratie: `bootstrap_my_role()` past zich aan zodat de "eerste gebruiker wordt beheerder"-tak vervalt en `@maasmond.nl` de rol `planner` krijgt. Verder geen schemawijzigingen.
- Auth-instelling: e-mail-signups blijven aan, bevestiging via de OTP-mail zelf; geen anonieme login.
- RLS, GRANTs, rollen-RPC's, auditlog en Realtime blijven ongewijzigd. Geen `USING (true)`, geen anon-toegang.

## Controle

Browsertest: uitloggen, verversen, inloggen met een `@maasmond.nl`-adres + code, controleren dat de planning laadt en opslaan werkt, verversen (blijft ingelogd), afwijzing van een niet-Maasmond-adres, en na uitloggen geen toegang meer.

Let op: het versturen van de inlogmail vereist actieve e-mailbezorging op de backend. Werkt dat nog niet, dan meld ik welke stap daarvoor nodig is.
