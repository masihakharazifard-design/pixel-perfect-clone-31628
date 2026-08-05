# Uitbreiding planning: prioriteit, openstaande projecten, teams en notities

Alles gaat verder op de bestaande database en de bestaande planningregels (tabel `availability`). Er komt geen tweede agenda, geen tweede projecttabel en geen dubbele medewerkerslijst. Alleen voor persoonlijke notities komt er één nieuwe tabel.

Wat er al staat en blijft zoals het is: meerdaagse afwezigheid via een periode-ID, de knop "Kleuren beheren", het bewerken/verwijderen van een hele afwezigheidsperiode, en het feit dat de aparte pagina Beschikbaarheid al in Personeelsplanning is opgegaan. Die punten worden aangevuld, niet opnieuw gebouwd.

## 1. Projectprioriteit

- Nieuw veld **Prioriteit** per project: Normaal, Hoog, Spoed, Eerst uitvoeren. Standaard Normaal.
- Aanpasbaar in het projectformulier én direct in de tabel (zelfde snelle keuzemenu als de bestaande statuskolom).
- Zichtbaar als gekleurde badge in Projecten, Projectdetails, Personeelsplanning, Openstaande projecten en in de agenda bij een ingepland project.
- Standaard sortering: Eerst uitvoeren, Spoed, Hoog, Normaal. Binnen dezelfde prioriteit op startdatum, daarna op werknummer.
- Binnen dezelfde prioriteit handmatig omhoog/omlaag schuiven en verslepen; de volgorde wordt bewaard.

## 2. Openstaande projecten

Vast blok onderaan Personeelsplanning, los van de zichtbare dag/week/maand/kwartaal.

- Toont alles wat nog gepland moet worden, ook zonder startdatum, zonder medewerker, met status Offerte of buiten de huidige periode.
- Toont niet: Afgerond, Geannuleerd en volledig ingeplande projecten.
- Per regel: prioriteit, werknummer, projectnaam, werkzaamheden, calculator, afdeling, status, startdatum, benodigde medewerkers, ingeplande medewerkers en planningsstatus (Niet ingepland / Gedeeltelijk ingepland / Volledig ingepland).
- Zoeken op werknummer, projectnaam, werkzaamheden en calculator. Sorteren op prioriteit, werknummer, afdeling, status en startdatum.
- Een regel is klikbaar (opent projectdetails), heeft een knop "Inplannen" en kan naar een medewerkerscel in de planning gesleept worden. Direct na plannen verandert de planningsstatus.

## 3. Meerdere projecten op één dag

- Onbeperkt aantal tijdblokken per medewerker per dag, onder elkaar in dezelfde cel, gesorteerd op starttijd.
- Alleen echt overlappende tijden geven een conflict; aansluitende blokken (10:00–10:30) niet.

## 4. Snelmenu op een dagcel

Klikken op een cel opent een menu met: Project inplannen, Bezet, Vakantie, Ziek, Vrij, Beschikbaar, Verwijderen. Staat er al een blok, dan opent hetzelfde menu met wijzigen en verwijderen voor dat blok. Staat er niets, dan wordt de gekozen status direct toegevoegd.

## 5. Teams

- Medewerkers op hetzelfde project, dezelfde dag en hetzelfde tijdvak vormen één team met gedeeld team-ID en teamkleur.
- Bij het slepen van een teamblok verschijnt een keuze: Hele team verplaatsen (standaard), Alleen deze medewerker verplaatsen, Alleen deze medewerker loskoppelen.
- Hele team verplaatsen neemt alle medewerkers mee met dezelfde tijden, hetzelfde project, dezelfde teamkleur en hetzelfde team-ID.
- Conflictcontrole draait voor alle betrokken medewerkers tegelijk; bij een conflict gaat de hele verplaatsing niet door.

## 6. Beschikbaarheid

Personeelsplanning blijft de centrale planning met de statussen Ingepland, Beschikbaar, Bezet, Vakantie, Ziek en Vrij. "Beschikbaar" kiezen verwijdert Bezet/Vrij/Ziek/Vakantie binnen dat tijdvak. Beschikbaar veroorzaakt nooit een conflict.

## 7. Projecten verslepen

Blokken kunnen naar een andere dag, een andere tijd of een andere medewerker. Na loslaten: eerst opslaan, dan verversen, waarna agenda, projectdetails en beschikbaarheid meelopen. Mislukt het opslaan, dan springt het blok terug naar de oude plek met een foutmelding.

## 8. Meerdaagse afwezigheid

Meerdere dagen selecteren en daarna Vakantie, Ziek, Vrij of Bezet kiezen. Zonder tijden wordt het een hele dag. Een vakantieperiode wordt als één doorlopende balk getoond in plaats van losse dagblokjes.

## 9. Kleuren

De knop "Kleuren beheren" wordt uitgebreid met kleuren voor projecten, teams, Ingepland, Vakantie, Ziek, Vrij, Bezet, afdelingen en filters. Opslaan gebeurt in de bestaande instellingen en is direct zichtbaar.

## 10. Persoonlijke notities

- Nieuw menu **Notities** met datum, titel, tekst, kleur en een markering "belangrijk"; toevoegen, wijzigen, verwijderen en opslaan.
- In de agenda verschijnt op een dag met een notitie een klein notitie-icoon; klikken opent de notitie.
- Notities hebben geen enkele invloed op planning of projecten.
- Notities worden vastgelegd op `owner_id = auth.uid()` met beveiligingsregels waardoor alleen de eigenaar zijn eigen notities kan lezen, toevoegen, wijzigen en verwijderen.

**Belangrijk punt:** de app gebruikt op dit moment nog de demo-login (elk `@maasmond.nl`-adres mag naar binnen zonder echt account). Zo'n demo-gebruiker heeft geen `auth.uid()`, dus notities kunnen daar niet beveiligd worden opgeslagen. De opzet wordt daarom: notities werken volledig voor iemand die echt via Microsoft is ingelogd; een demo-gebruiker ziet het menu met de melding dat aanmelden met een Microsoft-account nodig is. Zodra Microsoft-inloggen aanstaat, werkt het zonder verdere wijzigingen.

## 11 & 12. Database en techniek

- Planningregels blijven de enige bron. Elke wijziging: opslaan, bevestiging uit de database, herladen, scherm verversen; bij fout een rollback naar de oude situatie.
- `teamId` en `periodeId` in `availability.data`; `prioriteit`, `sorteerpositie` en `benodigdeMedewerkers` in `projects.data`.
- Medewerkers van een project worden altijd afgeleid uit de planningregels, nooit los opgeslagen in `projects.data.medewerkers`.
- Projectdatums worden uitsluitend berekend uit planningregels met status "Ingepland". Vakantie, Vrij, Ziek, Bezet en Beschikbaar wijzigen nooit projectdatums. Verdwijnt de laatste planning, dan blijven de bestaande projectdatums staan.
- Conflictcontrole sluit altijd het record uit dat op dat moment bewerkt wordt.

### Technische details

- Migratie: tabel `personal_notes` met `id`, `owner_id uuid` (default `auth.uid()`), `data jsonb` (datum, titel, tekst, kleur, belangrijk) en tijdstempels, plus GRANTs voor `authenticated`/`service_role` en RLS-policies `owner_id = auth.uid()` voor lezen, toevoegen, wijzigen en verwijderen.
- `src/lib/planning-store.ts`: laad-/opslag-/verwijderfuncties voor notities via de ingelogde client; bestaande sync-functies blijven ongewijzigd.
- `src/components/planning-app.tsx`:
  - `Project` uitbreiden met `prioriteit` en `sorteerpositie`; `PRIORITEIT_ORDER` + `sortProjects` als centrale sorteerfunctie voor Projecten en Openstaande projecten.
  - `PriorityBadge` en `PriorityCell` (snelle keuze in de tabel, optimistisch met sync).
  - Nieuwe `OpenProjectsPanel` onder `PersoneelsplanningView`, gevoed door de bestaande afgeleide `projectPlans` voor ingeplande medewerkers en planningsstatus; sleepbron voor drag naar een medewerkerscel.
  - `CellMenu` (snelmenu) en `TeamDropChoice` (keuze bij slepen); `teamId` toevoegen aan planningregels met de bestaande afgeleide groepering als fallback voor oude regels.
  - Meervoudige opslag in één handeling voor teamverplaatsing, met gezamenlijke conflictcontrole en rollback.
  - `setAvailableFor` verwijdert afwezigheidsblokken binnen het gekozen tijdvak.
  - `ColorManagerModal` uitbreiden met afdelingen en filters.
  - Nieuwe `NotitiesView` plus nav-item `notities`, en een notitie-icoon in de agendaweergaven.
- `src/components/auth-gate.tsx` levert `user.id` (echte Supabase-gebruiker) en een vlag of het om een demo-sessie gaat.

## Test

Meerdere projecten op één dag, project verslepen, team verslepen, één medewerker uit het team halen, meerdaagse vakantie, Bezet toevoegen, Beschikbaar maken, status verwijderen, prioriteit wijzigen, openstaande projecten controleren, kleuren wijzigen, notitie toevoegen en terugvinden, verversen en controleren dat alles behouden blijft.
