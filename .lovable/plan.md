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

## 2. Demo-login, strikt gescheiden van Supabase

`src/components/auth-gate.tsx` wordt gesplitst:

- `DemoAuthGate` — importeert of initialiseert geen enkele Supabase-module. Werkt puur op `localStorage`.
- `SupabaseAuthGate` — bevat de bestaande echte authenticatie, ongewijzigd, in een apart bestand.
- `AuthGate` kiest alleen: `DEMO_MODE ? <DemoAuthGate/> : <SupabaseAuthGate/>`, waarbij `SupabaseAuthGate` via `React.lazy`/dynamische import pas geladen wordt als demo uit staat. In demo-modus wordt de Supabase-client dus nooit geïnitialiseerd. Types worden met `import type` gedeeld, wat geen runtime-code laadt.

Gedrag van `DemoAuthGate`:

- bestaande demosessie in `localStorage` (`maasmond-demo-session`) → app opent direct, ook na refresh;
- geen demosessie → hetzelfde inlogscherm met E-mailadres, Code en knop Inloggen (één stap, geen validatie);
- op Inloggen → demosessie opslaan → app opent meteen. Geen OTP, magic link, e-mail, Microsoft/tenantcontrole;
- de demo-gebruiker krijgt alleen in de frontend `roles: ["beheerder"]`; niets naar `user_roles`, geen `bootstrapMyRole()`;
- uitloggen wist `maasmond-demo-session` en toont het inlogscherm; `maasmond-demo-data` blijft bewaard.

Er draait in demo-modus dus geen `getSession()`, `getUser()`, `onAuthStateChange` of `user_roles`-query — die code wordt niet eens geladen.

## 3. Store-facade die alleen de actieve implementatie laadt

Nieuw bestand `src/lib/store.ts` exporteert exact dezelfde named exports als `planning-store.ts` nu heeft, zodat de schermcode niet herschreven hoeft te worden. De actieve implementatie wordt lazy geladen:

```
const impl = () => DEMO_MODE
  ? import("./demo-planning-store")
  : import("./planning-store")   // alleen geladen als DEMO_MODE === false

export const loadAll = async (...a) => (await impl()).loadAll(...a)
export const upsertRow = async (...a) => (await impl()).upsertRow(...a)
// ... idem voor elke bestaande publieke storefunctie
```

De module-promise wordt één keer gecachet. Zo wordt `planning-store.ts` (en daarmee de Supabase-client) in demo-modus nooit geïmporteerd of geïnitialiseerd. Types en constanten zoals `EMPTY_META`, `PersonalNote`, `SettingsPathPatch`, `ProjectMeta` en `ProjectDocument` komen uit een klein, Supabase-vrij typebestand met `import type`, zodat de import in `planning-app.tsx` alleen van pad verandert.

De facade dekt de volledige publieke API: planning toevoegen/wijzigen/verwijderen, meerdere planningregels tegelijk (teamverplaatsing, resize, vaste vrije reeksen lopen allemaal via `savePlanningRows`/`upsertRows`/`deleteRow`), projectstatus, werken en medewerkers toevoegen/wijzigen, instellingen patchen, projectmeta, persoonlijke notities, archiveren/herstellen en de documentfuncties.

`planning-app.tsx` importeert al alles op één regel; die import gaat naar de facade. Het Realtime-kanaal en de `supabase`-import in dat bestand worden achter dezelfde vlag gezet, zodat er in demo geen kanaal wordt geopend. Geen verborgen fallback naar Supabase.

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

Alleen zichtbaar in demo-modus: onder Instellingen een knop **Demo resetten** met bevestiging. Die wist `maasmond-demo-data` en schrijft de actuele seed uit `demo-seed.ts` opnieuw weg, inclusief de huidige `DEMO_DATA_VERSION`.

## 7. Test in de browser

Ik loop het scenario door met een echte browser: inloggen met willekeurige gegevens, Werken/Medewerkers/Personeelsplanning/Agenda controleren, medewerker inplannen, project slepen, projectkleur wijzigen, refreshen, uitloggen, opnieuw inloggen, en Demo resetten. Daarbij lees ik het volledige netwerkverkeer uit en controleer ik dat er tijdens de hele demosessie geen enkel verzoek naar het backendproject gaat — niet voor auth, niet voor database/REST, niet voor RPC's, niet voor opslag en ook geen realtime-websocket. De demo draait dus volledig standalone in de browser.

## Technische notities

- `DEMO_MODE = import.meta.env.VITE_DEMO_AUTH_MODE === "true"`.
- Demo-store is synchroon van binnen maar biedt dezelfde `Promise`-signatuur, zodat aanroepende code identiek blijft.
- Geen wijzigingen aan migraties, RLS-policies, RPC's of `src/integrations/supabase/*`.
