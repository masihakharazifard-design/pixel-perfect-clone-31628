# Personeelsplanning als centrale planning (incl. beschikbaarheid)

Bestaand ontwerp blijft. Geen tweede agenda, geen nieuwe database-tabellen. Alles blijft draaien op de bestaande beschikbaarheidsregels als enige bron.

## 1. Beschikbaarheid samenvoegen met Personeelsplanning

- Menu-item en pagina "Beschikbaarheid" verdwijnen (ook de snelkoppeling op het dashboard).
- Alle functies uit die pagina (blokken per medewerker per dag toevoegen, wijzigen, verwijderen, vakantie-import) verhuizen naar Personeelsplanning.
- Statussen op één plek: Ingepland, Beschikbaar, Bezet, Vakantie, Ziek, Vrij.
- Bestaande gegevens blijven ongewijzigd staan; alleen de pagina en navigatie verdwijnen.

## 2. Projectblokken verslepen

- Een bestaand planningblok kan naar een andere dag, een ander tijdvak en een andere medewerker worden gesleept.
- Bij loslaten wordt hetzelfde planningrecord aangepast (nooit een nieuw of dubbel record): nieuwe medewerker, datum, begin- en eindtijd.
- Vooraf conflictcontrole; bij conflict of mislukte opslag springt het blok terug naar de oorspronkelijke plek met een melding.
- Na opslaan volgen Agenda, Projectdetails en projectdatums direct; ook na refresh.
- Afwezigheidsblokken (vakantie, ziek, vrij, bezet) zijn niet versleepbaar als project.

## 3. Vakantie en afwezigheid over meerdere dagen

- In Personeelsplanning is een reeks dagen te selecteren (slepen over dagcellen, op mobiel via "Periode selecteren").
- De selectie opent een venster met: medewerker, startdatum, einddatum, starttijd, eindtijd, status (Vakantie / Ziek / Vrij / Bezet) en notitie.
- Zonder tijden geldt de hele dag voor de volledige periode.
- Vakantie wordt getoond als één doorlopende balk over de dagen.

## 4. Bezet

- Handmatig "Bezet" toevoegen op een datum of tijdvak, bijvoorbeeld 13:00–17:00.
- Meerdere blokken per dag naast elkaar mogelijk (Ingepland 08:00–12:00 en Bezet 13:00–17:00).
- Binnen zo'n blok kan de medewerker niet opnieuw worden ingepland.
- Bezet is zichtbaar in Personeelsplanning, Agenda, Medewerkerdetails en in de conflictmelding.

## 5. Synchronisatie met de Agenda

- Agenda en Personeelsplanning lezen dezelfde planninggegevens.
- Agenda toont projectplanningen én vakantie, ziekte, vrij en bezet, met duidelijk onderscheid (projectblokken gekleurd, afwezigheid met eigen stijl/streepjespatroon en label).
- Toevoegen, wijzigen, verplaatsen of verwijderen in Personeelsplanning verandert de Agenda meteen.

## 6. Kleuren beheren

- Nieuwe knop "Kleuren beheren" in Personeelsplanning.
- Instelbaar: projecten, teams/koppels, Ingepland, Vakantie, Ziek, Vrij, Bezet, afdelingen en zelf toegevoegde filters.
- Per instelling: naam, kleurkiezer, voorbeeld, opslaan en standaardkleur herstellen.
- Kleuren worden permanent bewaard bij de bestaande instellingen en werken direct door in Personeelsplanning, Agenda, legenda, projectblokken en afwezigheidsblokken.

## 7. Conflictcontrole

Inplannen wordt geblokkeerd wanneer de medewerker in dat tijdvak al ingepland is of vakantie, ziek, vrij of bezet heeft. De melding toont medewerker, status, datum, begintijd, eindtijd en eventueel het conflicterende project.

## 8. Mobiel en desktop

Blokken blijven klikbaar, perioden selecteerbaar. Waar slepen op mobiel onbetrouwbaar is, komt een knop "Verplaatsen" in het blokmenu met dezelfde mogelijkheden. Geen enkele functie verdwijnt op mobiel.

## 9. Opslag

Elke wijziging gaat eerst naar de database en daarna pas naar het scherm; bij een fout wordt teruggedraaid. Na refresh blijven projectplanning, vakantie, ziekte, vrij, bezet, kleuren en verplaatste projecten behouden.

## 10. Test

In een echte browser: project naar andere dag en andere medewerker slepen, tijd wijzigen, vakantie over meerdere dagen, bezet-blok toevoegen, conflict met bezet blokkeren, kleuren wijzigen, Agenda direct controleren, refreshen en alles opnieuw nakijken.

## Technische details

- Alles gebeurt in `src/components/planning-app.tsx`; geen migraties.
- `BeschikbaarheidView` en het nav-item `beschikbaarheid` worden verwijderd; de functionaliteit (inclusief vakantie-import) gaat naar `PersoneelsplanningView`. Het dashboard-knopje verwijst voortaan naar Personeelsplanning.
- Planningregels blijven `availability`-rijen: medewerkerId, datum, begintijd, eindtijd, status (`Ingepland`/`Vakantie`/`Ziek`/`Vrij`/`Bezet`/`Beschikbaar`), optioneel projectId en notitie. Meerdaagse afwezigheid wordt weggeschreven als één regel per dag met een gedeelde `periodeId`, zodat de balk doorloopt en in één keer te wijzigen/verwijderen is.
- Nieuw: sleep-state voor bestaande blokken in `PersoneelsplanningView` (HTML5 drag op blokniveau) plus een `MoveBlockModal` als mobiel alternatief; beide roepen dezelfde `savePlanning`-update aan met het bestaande record-id.
- Conflictcontrole wordt één gedeelde functie (overlap op medewerker + datum + tijdvak, alle niet-`Beschikbaar` statussen) en wordt gebruikt door het inplanvenster, drag & drop en het periodevenster.
- `AgendaView` krijgt naast projectevents ook afwezigheidsevents uit dezelfde `availability`-regels, met eigen stijl; project- en afwezigheidsblokken houden aparte, unieke keys.
- Kleuren: uitbreiding van de bestaande instellingen (`app_settings`) met `statusColors`, `afdelingColors`, `projectColors` naast de bestaande `teamColors` en filterkleuren; nieuw `ColorManagerModal` met kleurkiezer, voorbeeld en reset per item. Alle views lezen kleuren via één helper met fallback op de huidige standaardkleuren.
- Opslaan verloopt via de bestaande `syncTable`/`syncSettings`: eerst opslaan, dan herladen; bij fout terugdraaien naar de vorige state.

## Aanvullende voorwaarden

- **periodeId zonder migratie**: gecontroleerd — de tabel `availability` bestaat uit `id`, een JSON-veld `data` en `updated_at`; alle planningvelden zitten al in dat JSON-object. `periodeId` komt daar gewoon bij, dus geen nieuwe kolom en geen migratie.
- **Conflictcontrole bij bewerken**: de gedeelde controle sluit het eigen record uit (`other.id !== currentPlanningId`) en vergelijkt alleen andere regels van dezelfde medewerker. `Beschikbaar` geeft nooit conflict; Ingepland, Vakantie, Ziek, Vrij en Bezet blokkeren alleen bij echte tijdoverlap.
- **Projectdatums veilig herberekenen**: alleen regels met status `Ingepland` en hetzelfde projectId tellen mee — start = vroegste begin, einde = laatste eind. Vakantie, Ziek, Vrij, Bezet en Beschikbaar raken projectdatums nooit. Bij het verwijderen van de laatste ingeplande regel blijven de bestaande projectdatums staan en worden ze niet leeggemaakt.
- **Meerdaagse afwezigheid**: opgeslagen als één regel per dag met dezelfde `periodeId`, maar in de interface beheerd als één periode — wijzigen of verwijderen verwerkt alle regels met die `periodeId` tegelijk. De vakantie-import ontdubbelt op medewerker + datum + status (en bestaande `periodeId`), zodat dezelfde periode niet dubbel binnenkomt.
- Wanneer een meerdaagse periode gedeeltelijk wordt aangepast, moet de bestaande volledige periode eerst worden vervangen: verwijder alle oude regels met dezelfde periodeId en maak daarna de nieuwe dagregels opnieuw aan. Zo blijven geen oude losse dagen achter.