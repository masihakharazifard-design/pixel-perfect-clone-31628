# Demo-modus: willekeurige login + volledig werkende app met lokale demo-data

Met `VITE_DEMO_AUTH_MODE=true` werkt de hele Maasmond Planning zonder Supabase: willekeurig e-mailadres en willekeurige code, klik Inloggen, app opent met demo-data die lokaal in de browser wordt opgeslagen. Met `false` (of afwezig) blijft alles exact zoals nu: echte login, echte database, RLS, rollen, auditlog en Realtime.

De productiedatabase en de beveiliging worden niet aangepast: geen RLS uit, geen anon-toegang, geen `USING (true)`, geen service-role key in de frontend.

## 1. Instelling

`.env` krijgt `VITE_DEMO_AUTH_MODE=true`. Eén gedeelde constante `DEMO_MODE` in een klein bestand (`src/lib/demo-mode.ts`) leest deze vlag, zodat er nergens verspreide checks nodig zijn.

## 2. Demo-login

In `src/components/auth-gate.tsx` wordt DEMO MODE als eerste gecontroleerd, vóór alle Supabase-logica:

- bestaande demosessie in `localStorage` (`maasmond-demo-session`) → app opent direct, ook na refresh;
- geen demosessie → hetzelfde inlogscherm met E-mailadres, Code en knop Inloggen (één stap, geen validatie);
- op Inloggen → demosessie opslaan → app opent meteen. Geen OTP, geen magic link, geen e-mail, geen Microsoft/tenantcontrole.
- de demo-gebruiker krijgt alleen in de frontend `roles: ["beheerder"]`; er wordt niets naar `user_roles` geschreven en `bootstrapMyRole()` wordt niet aangeroepen.
- uitloggen wist `maasmond-demo-session` en toont het inlogscherm; `maasmond-demo-data` blijft bewaard.

De bestaande echte inlogcode blijft ongewijzigd in het bestand staan voor later.

## 3. Lokale demo-datalaag

Nieuw bestand `src/lib/demo-planning-store.ts` met exact dezelfde functienamen en types als de huidige store, zodat de schermen niet hoeven te veranderen: `loadAll`, `upsertRow`, `upsertRows`, `deleteRow`, `deleteRows`, `savePlanningRows`, `setProjectStatusDb`, `archiveRecord`, `patchSettings`, `loadProjectMeta`, `saveProjectMeta`, `loadProjectDocuments`-equivalenten en de persoonlijke notities.

Alles leest en schrijft naar `localStorage` onder `maasmond-demo-data` (werken, medewerkers, planning/availability, instellingen, projectkleuren, vaste vrije dagen, projectmeta, notities). Documenten/uploads en auditlog doen in demo niets richting de server.

Nieuw bestand `src/lib/demo-seed.ts` bevat de startdataset, gebaseerd op de bestaande veilige voorbeelddata `INIT_PROJ`, `INIT_EMP` en `INIT_AVAIL` uit `planning-app.tsx` plus standaardinstellingen. Bij de eerste demo-login zonder bestaande `maasmond-demo-data` wordt hiermee geïnitialiseerd; bestaat de data al, dan wordt die geladen. Deze data gaat nooit naar Supabase.

## 4. Eén centrale keuze

Nieuw bestand `src/lib/store.ts` doet:

```
export const store = DEMO_MODE ? demoPlanningStore : supabasePlanningStore
```

`src/components/planning-app.tsx` importeert nu al alle datafuncties op één regel; die ene import gaat naar de facade. Verder blijft de schermcode ongewijzigd. In demo-modus worden de Supabase Realtime-abonnementen niet opgezet (er is geen tweede gebruiker); de UI werkt op de lokale state zoals nu.

## 5. Wijzigen tijdens de demo

Omdat alle bestaande mutaties door dezelfde functies lopen, blijven ze werken en worden ze lokaal bewaard: medewerker inplannen, project slepen, resizen, uit planning verwijderen, vaste vrije dag toevoegen, medewerkervolgorde wijzigen, werkstatus wijzigen, projectkleur wijzigen, medewerker toevoegen/wijzigen, werk toevoegen/wijzigen. Na refresh staat alles er nog.

## 6. Demo resetten

Alleen zichtbaar in demo-modus: onder Instellingen een knop **Demo resetten** met bevestiging. Die wist `maasmond-demo-data` en laadt de oorspronkelijke demo-dataset opnieuw.

## 7. Test in de browser

Ik loop het scenario door met een echte browser: inloggen met willekeurige gegevens, Werken/Medewerkers/Personeelsplanning/Agenda controleren, medewerker inplannen, project slepen, projectkleur wijzigen, refreshen, uitloggen, opnieuw inloggen, en Demo resetten. Ik controleer daarbij dat er geen enkele schrijfactie richting de echte database gaat.

## Technische notities

- `DEMO_MODE = import.meta.env.VITE_DEMO_AUTH_MODE === "true"`.
- Demo-store is synchroon van binnen maar biedt dezelfde `Promise`-signatuur aan, zodat aanroepende code identiek blijft.
- Schrijven naar `localStorage` gebeurt gebundeld per mutatie; lezen gebeurt één keer bij `loadAll`.
- Geen wijzigingen aan migraties, RLS-policies, RPC's of `src/integrations/supabase/*`.
