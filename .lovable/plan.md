# Tijdelijke demo-login

Doel: met `VITE_DEMO_AUTH_MODE=true` geeft het inlogscherm altijd toegang, ongeacht wat er is ingevuld. De echte Supabase-login blijft volledig in de code staan voor later.

## Wat verandert

Alleen `src/components/auth-gate.tsx` (plus één regel in `.env`). Geen wijziging aan Werken, Personeelsplanning, Agenda, projectkleuren, auditlog, Realtime of de database.

1. `.env`: `VITE_DEMO_AUTH_MODE=true` toevoegen.
2. `AuthGate` controleert DEMO MODE vóór de normale authenticatie:
   - demosessie in `localStorage` onder sleutel `maasmond-demo-session` → app direct openen (blijft na refresh bestaan);
   - geen demosessie → het bestaande inlogscherm tonen.
3. Inlogscherm in demo-modus: dezelfde look, met velden E-mailadres en Code en knop Inloggen. Eén formulier (geen tweede stap), geen validatie, geen Supabase-aanroep, geen e-mail, geen OTP/magic link/Microsoft.
4. Klik op Inloggen → demosessie wegschrijven → app opent meteen.
5. Demo-gebruiker krijgt rol `beheerder`, maar uitsluitend in de frontend-state. Er wordt niets naar `user_roles` geschreven en `bootstrapMyRole()` wordt in demo-modus niet aangeroepen.
6. Uitloggen wist de demosessie en toont opnieuw het inlogscherm.
7. Met `VITE_DEMO_AUTH_MODE=false` (of afwezig) blijft het huidige gedrag exact zoals nu: Supabase OTP met @maasmond.nl-controle, rollen uit de database.

## Belangrijke waarschuwing over data

De databasebeveiliging blijft ongewijzigd: geen nieuwe `USING (true)`-policies, niets opengezet. Gevolg: een demosessie is geen echte Supabase-sessie, dus de bestaande regels blokkeren het laden en opslaan van projecten, medewerkers en planning. Het inloggen en de navigatie werken, maar de lijsten kunnen leeg blijven. Zeg het als je wilt dat ik daar apart een oplossing voor voorstel — ik verander de beveiliging niet zonder jouw expliciete opdracht.

## Technisch

- Vlag lezen via `import.meta.env.VITE_DEMO_AUTH_MODE === "true"`, als constante bovenaan `auth-gate.tsx`.
- Demosessie: JSON in `localStorage` (`maasmond-demo-session`) met ingevuld e-mailadres en tijdstip; state in `AuthGate` wordt hieruit gehydrateerd.
- De demo-context levert een pseudo-`user` en `roles: ["beheerder"]` aan de bestaande `Ctx.Provider`, zodat alle bestaande `useAuth()`-verbruikers ongewijzigd blijven.
- De bestaande OTP-functies (`vraagCode`, `bevestigCode`) blijven staan en worden alleen overgeslagen wanneer de demo-vlag aan staat.
