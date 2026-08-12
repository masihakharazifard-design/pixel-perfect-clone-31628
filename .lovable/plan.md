# Demo-modus: willekeurige login + volledig werkende app met lokale demo-data

Met `VITE_DEMO_AUTH_MODE=true` werkt de hele Maasmond Planning zonder Supabase: willekeurig e-mailadres en willekeurige code, klik Inloggen, app opent met demo-data die lokaal in de browser wordt opgeslagen. Met `false` (of afwezig) blijft alles exact zoals nu: echte login, echte database, RLS, rollen, auditlog en Realtime.

De productiedatabase en de beveiliging worden niet aangepast: geen RLS uit, geen anon-toegang, geen `USING (true)`, geen service-role key in de frontend.

## 0. Resultaat van de controle op directe database-aanroepen

Ik heb de hele appcode doorzocht op `supabase.from`, `supabase.rpc`, `supabase.storage` en `supabase.channel`. Uitkomst:

- `planning-app.tsx` doet nog maar één directe aanroep: het Realtime-kanaal (`supabase.channel("planning-sync")`). Alle overige datatoegang loopt al via één import uit `planning-store.ts`: `loadAll`, `upsertRow`, `upsertRows`, `deleteRow`, `savePlanningRows`, `setProjectStatusDb`, `patchSettings`, `loadProjectMeta`, `saveProjectMeta`, `loadPersonalNotes`, `savePersonalNote`, `deletePersonalNote`.
- `auth-gate.tsx` gebruikt Supabase alleen voor login/sessie en het lezen van `user_roles`.
- Documentupload/-verwijdering (`uploadProjectDocument`, `listProjectDocuments`, `projectDocumentUrl`, `deleteProjectDocument`) en `archiveRecord`/`deleteRows` bestaan wel in de store maar worden op dit moment nergens vanuit de UI aangeroepen.
- De MCP-tools (`src/lib/mcp/tools/*`) lezen rechtstreeks uit Supabase, maar dat is server/agent-code buiten de app-UI; die blijft ongewijzigd.

Er is dus geen verspreide database-code die eerst opgeschoond moet worden: de facade kan de volledige bestaande API één-op-één overnemen.

## 1. Instelling

`.env` krijgt `VITE_DEMO_AUTH_MODE=true`. Eén gedeelde constante `DEMO_MODE` in `src/lib/demo-mode.ts` leest deze vlag, zodat er nergens verspreide checks nodig zijn.

## 2. Demo-login

In `src/components/auth-gate.tsx` wordt DEMO MODE als eerste gecontroleerd, vóór alle Supabase-logica:

- bestaande demosessie in `localStorage` (`maasmond-demo-session`) → app opent direct, ook na refresh;
- geen demosessie → hetzelfde inlogscherm met E-mailadres, Code en knop Inloggen (één stap, geen validatie);
- op Inloggen → demosessie opslaan → app opent meteen. Geen OTP, geen magic link, geen e-mail, geen Microsoft/tenantcontrole, geen enkele Supabase-auth-aanroep;
- de demo-gebruiker krijgt alleen in de frontend `roles: ["beheerder"]`; er wordt niets naar `user_roles` geschreven en `bootstrapMyRole()` wordt niet aangeroepen;
- uitloggen wist `maasmond-demo-session` en toont het inlogscherm; `maasmond-demo-data` blijft bewaard.

De demo-branch komt vóór elke Supabase-aanroep, ook bij het opstarten: met `DEMO_MODE === true` worden `getSession()`, `getUser()`, `onAuthStateChange`, `bootstrapMyRole()` en de `user_roles`-query niet uitgevoerd — die staan achter een vroege return, niet in een effect dat toch al draait. Er ontstaat dus geen enkel verborgen auth-request. Met `DEMO_MODE === false` gebeurt uitsluitend het bestaande Supabase-authpad.

De bestaande echte inlogcode blijft ongewijzigd in het bestand staan voor later.

## 3. Centrale store-facade met volledige API

Nieuw bestand `src/lib/store.ts` kiest één keer de actieve store en exporteert daarnaast exact dezelfde named exports als `planning-store.ts` nu heeft, zodat de schermcode niet herschreven hoeft te worden:

```
const activeStore = DEMO_MODE ? demoPlanningStore : supabasePlanningStore
export const store = activeStore
export const loadAll = (...a) => activeStore.loadAll(...a)
export const upsertRow = (...a) => activeStore.upsertRow(...a)
// ... idem voor elke bestaande publieke storefunctie
```

Ook `EMPTY_META` en de gedeelde types (`PersonalNote`, `SettingsPathPatch`, `ProjectMeta`, `ProjectDocument`) worden doorgegeven, zodat de import in `planning-app.tsx` alleen van pad verandert.

De facade biedt de volledige publieke API die de app gebruikt of kan gebruiken: planning toevoegen/wijzigen/verwijderen, meerdere planningregels tegelijk (teamverplaatsing, resize, vaste vrije reeksen lopen allemaal via `savePlanningRows`/`upsertRows`/`deleteRow`), projectstatus, werken en medewerkers toevoegen/wijzigen, instellingen patchen, projectmeta, persoonlijke notities, archiveren/herstellen en de documentfuncties.

`planning-app.tsx` importeert al alles op één regel; die import gaat naar de facade. Verder blijft de schermcode ongewijzigd. Het Realtime-kanaal wordt in demo-modus volledig overgeslagen (de `useEffect` doet niets als `DEMO_MODE` aan staat). Geen verborgen fallback naar Supabase: de demo-store raakt de netwerklaag nooit aan.

## 4. Lokale demo-datalaag

Nieuw bestand `src/lib/demo-planning-store.ts` met exact dezelfde functienamen, signaturen en types als de Supabase-store. Alles leest en schrijft naar `localStorage` onder `maasmond-demo-data`: werken, medewerkers, planning/availability, instellingen, projectkleuren, vaste vrije dagen, projectmeta, persoonlijke notities en een lokaal demo-auditlog (voor "Recente wijzigingen", mocht de UI dat tonen).

Documenten in demo: upload wordt zichtbaar uitgeschakeld. Bij een poging verschijnt de melding "Documentupload is niet beschikbaar in de demo-omgeving." Er gaat geen bestand naar de server, er wordt geen base64/data-URL in `localStorage` gezet en er verschijnt nooit een geslaagd-melding. Eventuele demo-documentnamen worden alleen als voorbeeldmetadata getoond. `localStorage` blijft uitsluitend voor lichte JSON: werken, medewerkers, availability, instellingen, projectmeta, notities en het demo-auditlog. Echte demo-bestandsopslag (bijvoorbeeld via IndexedDB) valt buiten dit plan en kan later toegevoegd worden als het nodig blijkt.

Nieuw bestand `src/lib/demo-seed.ts` bevat de startdataset, gebaseerd op de bestaande voorbeelddata `INIT_PROJ`, `INIT_EMP` en `INIT_AVAIL` uit `planning-app.tsx` plus standaardinstellingen, en exporteert `DEMO_DATA_VERSION = 1`. Deze data gaat nooit naar Supabase.

De opgeslagen `maasmond-demo-data` bevat altijd een `version`-veld. `loadAll()` in demo-modus:

- geen demo-data aanwezig → nieuwe seed aanmaken en opslaan;
- JSON beschadigd of onleesbaar → veilig terugvallen op de seed in plaats van crashen;
- `version` wijkt af van `DEMO_DATA_VERSION` → opnieuw initialiseren vanuit de actuele seed;
- verder → bestaande demo-data laden.

Een ongeldige localStorage-state kan de app dus nooit laten crashen. Bij een toekomstige structuurwijziging volstaat het verhogen van `DEMO_DATA_VERSION`.

## 5. Wijzigen tijdens de demo

Omdat alle mutaties door dezelfde functies lopen, blijven ze werken en worden ze lokaal bewaard: medewerker inplannen, project slepen, resizen, uit planning verwijderen, vaste vrije dag toevoegen, medewerkervolgorde wijzigen, werkstatus wijzigen, projectkleur wijzigen, medewerker toevoegen/wijzigen, werk toevoegen/wijzigen. Na refresh staat alles er nog.

## 6. Demo resetten

Alleen zichtbaar in demo-modus: onder Instellingen een knop **Demo resetten** met bevestiging. Die wist `maasmond-demo-data` en laadt de oorspronkelijke demo-dataset opnieuw.

## 7. Test in de browser

Ik loop het scenario door met een echte browser: inloggen met willekeurige gegevens, Werken/Medewerkers/Personeelsplanning/Agenda controleren, medewerker inplannen, project slepen, projectkleur wijzigen, refreshen, uitloggen, opnieuw inloggen, en Demo resetten. Daarbij lees ik het netwerkverkeer uit en controleer ik dat er tijdens de hele demosessie geen enkel verzoek naar de database gaat voor werken, medewerkers, planning, instellingen, RPC's, opslag of auditlog.

## Technische notities

- `DEMO_MODE = import.meta.env.VITE_DEMO_AUTH_MODE === "true"`.
- Demo-store is synchroon van binnen maar biedt dezelfde `Promise`-signatuur, zodat aanroepende code identiek blijft.
- Geen wijzigingen aan migraties, RLS-policies, RPC's of `src/integrations/supabase/*`.
