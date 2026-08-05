# Uitbreiding planning: volgorde, openstaande projecten, teams en notities

Alles gaat verder op de bestaande database en de bestaande planningregels (tabel `availability`). Er komt geen tweede agenda, geen tweede projecttabel en geen dubbele medewerkerslijst. Alleen voor persoonlijke notities komt er één nieuwe tabel.

Wat er al staat en blijft zoals het is: meerdaagse afwezigheid via een periode-ID, de knop "Kleuren beheren", het bewerken/verwijderen van een hele afwezigheidsperiode, en het feit dat de aparte pagina Beschikbaarheid al in Personeelsplanning is opgegaan. Die punten worden aangevuld, niet opnieuw gebouwd.

## 1. Handmatige volgorde van ingeplande projecten

Geen prioriteitensysteem. Alleen een eigen uitvoervolgorde per medewerker per dag.

- Elk ingepland blok krijgt een klein volgordenummer (1, 2, 3 …) linksboven in het blok.
- De volgorde is op twee manieren aan te passen: het nummer aanpassen, of de blokken binnen dezelfde dagcel onderling verslepen.
- Na een wijziging worden de blokken van die medewerker/dag automatisch hernummerd (1 t/m n, zonder gaten) en opnieuw gesorteerd.
- De volgorde wordt opgeslagen en blijft na verversen behouden. Dezelfde volgorde wordt aangehouden in de agenda en in Openstaande projecten.
- Blokken met een expliciete tijd blijven ook op tijd sorteerbaar; de handmatige volgorde is leidend binnen dezelfde dag.

## 2. Conflictcontrole alleen bij blokkerende statussen

- Projecten mogen naast elkaar staan zolang de tijden niet overlappen. Twee projecten die elkaar overlappen geven **geen** conflict meer.
- Een conflict ontstaat alleen wanneer de medewerker op dat tijdstip Bezet, Vakantie, Ziek of Vrij is.
- In dat geval wordt de planning geblokkeerd en verschijnt een duidelijke melding met: de reden, welke status het blokkeert, en de datum en tijd van dat blok. Bijvoorbeeld: "Kan niet inplannen: Jan de Vries is Vakantie op 12-08-2026, 08:00–17:00."
- Beschikbaar veroorzaakt nooit een conflict. De conflictcontrole slaat altijd het record over dat op dat moment bewerkt wordt.

## 3. Hele dag geblokkeerd zichtbaar maken

- Is een medewerker een volledige werkdag geblokkeerd, dan krijgt de hele dagcel een duidelijke gekleurde rand: rood voor Bezet, oranje voor Vakantie, blauw voor Ziek, grijs voor Vrij.
- Is slechts een deel van de dag geblokkeerd, dan krijgt alleen dat tijdblok de kleur en niet de hele cel.
- Zichtbaar in dag-, week- en maandweergave (in de maandweergave als randkleur op de dag).
- Bij wijzigen of verwijderen verdwijnt of verandert de rand direct; na verversen blijft alles behouden.

## 4. Openstaande projecten

Vast blok onderaan Personeelsplanning, los van de zichtbare dag/week/maand/kwartaal.

- Toont alles wat nog gepland moet worden, ook zonder startdatum, zonder medewerker, met status Offerte of buiten de huidige periode.
- Toont niet: Afgerond, Geannuleerd en volledig ingeplande projecten.
- Per regel: werknummer, projectnaam, werkzaamheden, calculator, afdeling, status, startdatum, benodigde medewerkers, ingeplande medewerkers en planningsstatus (Niet ingepland / Gedeeltelijk ingepland / Volledig ingepland).
- Zoeken op werknummer, projectnaam, werkzaamheden en calculator. Sorteren op werknummer, afdeling, status en startdatum.
- Een regel is klikbaar (opent projectdetails), heeft een knop "Inplannen" en kan naar een medewerkerscel in de planning gesleept worden. Direct na plannen verandert de planningsstatus.

## 5. Meerdere projecten op één dag

Onbeperkt aantal tijdblokken per medewerker per dag, onder elkaar in dezelfde cel, in de handmatige volgorde uit punt 1. Ze blijven afzonderlijk zichtbaar en blokkeren elkaar niet.

## 6. Snelmenu op een dagcel

Klikken op een cel opent een menu met: Project inplannen, Bezet, Vakantie, Ziek, Vrij, Beschikbaar, Verwijderen. Staat er al een blok, dan opent hetzelfde menu met wijzigen en verwijderen voor dat blok. Staat er niets, dan wordt de gekozen status direct toegevoegd.

## 7. Teams

- Medewerkers op hetzelfde project, dezelfde dag en hetzelfde tijdvak vormen één team met gedeeld team-ID en teamkleur.
- Bij het slepen van een teamblok verschijnt een keuze: Hele team verplaatsen (standaard), Alleen deze medewerker verplaatsen, Alleen deze medewerker loskoppelen.
- Hele team verplaatsen neemt alle medewerkers mee met dezelfde tijden, hetzelfde project, dezelfde teamkleur en hetzelfde team-ID.
- De conflictcontrole uit punt 2 draait voor alle betrokken medewerkers tegelijk; blokkeert er één, dan gaat de hele verplaatsing niet door.

## 8. Beschikbaarheid

Personeelsplanning blijft de centrale planning met de statussen Ingepland, Beschikbaar, Bezet, Vakantie, Ziek en Vrij. "Beschikbaar" kiezen verwijdert Bezet/Vrij/Ziek/Vakantie binnen dat tijdvak.

## 9. Projecten verslepen

Blokken kunnen naar een andere dag, een andere tijd, een andere medewerker of een andere plek in de volgorde. Na loslaten: eerst opslaan, dan verversen, waarna agenda, projectdetails en beschikbaarheid meelopen. Mislukt het opslaan, dan springt het blok terug naar de oude plek met een foutmelding.

## 10. Meerdaagse afwezigheid

Meerdere dagen selecteren en daarna Vakantie, Ziek, Vrij of Bezet kiezen. Zonder tijden wordt het een hele dag. Een vakantieperiode wordt als één doorlopende balk getoond in plaats van losse dagblokjes.

## 11. Kleuren

De knop "Kleuren beheren" wordt uitgebreid met kleuren voor projecten, teams, Ingepland, Vakantie, Ziek, Vrij, Bezet, afdelingen en filters. Dezelfde kleuren worden gebruikt voor de dagranden uit punt 3. Opslaan gebeurt in de bestaande instellingen en is direct zichtbaar.

## 12. Persoonlijke notities

- Nieuw menu **Notities** met datum, titel, tekst, kleur en een markering "belangrijk"; toevoegen, wijzigen, verwijderen en opslaan.
- In de agenda verschijnt op een dag met een notitie een klein notitie-icoon; klikken opent de notitie.
- Notities hebben geen enkele invloed op planning of projecten.
- Notities worden vastgelegd op `owner_id = auth.uid()` met beveiligingsregels waardoor alleen de eigenaar zijn eigen notities kan lezen, toevoegen, wijzigen en verwijderen.

**Belangrijk punt:** de app gebruikt op dit moment nog de demo-login (elk `@maasmond.nl`-adres mag naar binnen zonder echt account). Zo'n demo-gebruiker heeft geen `auth.uid()`, dus notities kunnen daar niet beveiligd worden opgeslagen. De opzet wordt daarom: notities werken volledig voor iemand die echt via Microsoft is ingelogd; een demo-gebruiker ziet het menu met de melding dat aanmelden met een Microsoft-account nodig is. Zodra Microsoft-inloggen aanstaat, werkt het zonder verdere wijzigingen.

## 13. Database

- Planningregels blijven de enige bron. Elke wijziging: opslaan, bevestiging uit de database, herladen, scherm verversen; bij fout een rollback naar de oude situatie.
- Medewerkers van een project worden altijd afgeleid uit de planningregels, nooit los opgeslagen.
- Projectdatums worden uitsluitend berekend uit planningregels met status "Ingepland". Vakantie, Vrij, Ziek, Bezet en Beschikbaar wijzigen nooit projectdatums. Verdwijnt de laatste planning, dan blijven de bestaande projectdatums staan.

### Technische details

- Migratie: tabel `personal_notes` met `id`, `owner_id uuid` (default `auth.uid()`), `data jsonb` (datum, titel, tekst, kleur, belangrijk) en tijdstempels, plus GRANTs voor `authenticated`/`service_role` en RLS-policies `owner_id = auth.uid()` voor lezen, toevoegen, wijzigen en verwijderen.
- `src/lib/planning-store.ts`: laad-/opslag-/verwijderfuncties voor notities via de ingelogde client; bestaande sync-functies blijven ongewijzigd.
- `src/components/planning-app.tsx`:
  - `AvailEntry` uitbreiden met `volgorde:number` en `teamId:string` in `availability.data`; `periodeId` blijft bestaan. Ontbrekende `volgorde` valt terug op sortering op starttijd, en wordt bij de eerstvolgende wijziging genormaliseerd naar 1..n per medewerker/dag.
  - `reorderDayPlans(employeeId, date, ...)` als centrale hernummerfunctie, aangeroepen na nummerwijziging, drop binnen dezelfde cel, en verplaatsing naar een andere cel; één gebundelde opslag.
  - `checkConflicts` beperken tot blokkerende statussen (Bezet/Vakantie/Ziek/Vrij), overlap tussen twee "Ingepland"-regels toestaan, en een gestructureerd conflictobject teruggeven (status, datum, tijden, medewerker) voor de foutmelding.
  - `dayBlockState(employeeId, date)` bepaalt of de werkdag volledig gedekt is door één blokkerende status; levert een randkleur voor de dagcel in `PersoneelsplanningView` en de agendaweergaven, uit de kleureninstellingen.
  - Nieuwe `OpenProjectsPanel` onder `PersoneelsplanningView`, gevoed door de bestaande afgeleide `projectPlans`; sleepbron voor drag naar een medewerkerscel.
  - `CellMenu` (snelmenu) en `TeamDropChoice` (keuze bij slepen) met meervoudige opslag in één handeling en rollback.
  - `setAvailableFor` verwijdert afwezigheidsblokken binnen het gekozen tijdvak.
  - `ColorManagerModal` uitbreiden met afdelingen en filters.
  - Nieuwe `NotitiesView` plus nav-item `notities`, en een notitie-icoon in de agendaweergaven.
- `src/components/auth-gate.tsx` levert `user.id` (echte Supabase-gebruiker) en een vlag of het om een demo-sessie gaat.

## Test

Volgorde wijzigen via nummer en via slepen, meerdere projecten op één dag zonder conflict, plannen op een Bezet/Vakantie-dag wordt geblokkeerd met duidelijke melding, hele dag Bezet toont de juiste rand in dag/week/maand, deel van de dag alleen op het blok, project verslepen, team verslepen, één medewerker uit het team halen, meerdaagse vakantie, Beschikbaar maken, status verwijderen, openstaande projecten, kleuren wijzigen, notitie toevoegen en terugvinden, verversen en controleren dat alles behouden blijft.
