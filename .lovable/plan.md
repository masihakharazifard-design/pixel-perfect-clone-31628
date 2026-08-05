# Rechtsklik in de Dagweergave van Personeelsplanning

## Probleem (bevestigd in de code)
In de dagweergave van Personeelsplanning zit op geen enkel element een `onContextMenu`-handler. De handler staat alleen op de cellen van de week-/maandtabel. Daardoor doet rechtsklikken in de dagweergave niets en verschijnt het browsermenu. Er is geen overlay of z-index die de klik blokkeert — de handler ontbreekt simpelweg.

## Oplossing
Het bestaande snelmenu (`cellMenu`) wordt hergebruikt; er komt geen nieuw menu bij.

1. **Lege medewerkerrij / "Geen tijdblokken"-regel** — rechtsklik opent het bestaande snelmenu met de aangeklikte medewerker en de getoonde datum als context.
2. **Bestaand planning- of afwezigheidsblok** — rechtsklik opent hetzelfde snelmenu, maar met de blokacties die er al zijn: bewerken (project- of afwezigheidsvenster) en verwijderen. De start- en eindtijd van het blok worden als context meegegeven, zodat "Project inplannen…" dat tijdvak overneemt.
3. Ook de kaartkop van de medewerker vangt rechtsklik af, zodat rechtsklikken ergens in de rij altijd werkt.

Het blok heeft altijd voorrang: bij rechtsklik op een planning- of afwezigheidsblok stopt het event daar (`stopPropagation()`), zodat de onderliggende medewerkerskaart zijn menu niet alsnog opent. Er verschijnt dus precies één menu, dat van het aangeklikte blok. In alle gevallen wordt het browsermenu onderdrukt.


## Menu-gedrag
- Verschijnt op de muispositie en blijft binnen het venster (bestaande begrenzing blijft, aangevuld met een correctie voor de menuhoogte).
- Sluit bij klikken buiten het menu (bestaande overlay), bij Escape (nieuw) en na het kiezen van een actie.

## Wat niet verandert
Linksklik, slepen en neerzetten, scrollen, mobiel gedrag en de week-, maand- en kwartaalweergave blijven ongewijzigd. Kleuren, statussen en conflictcontrole blijven zoals ze zijn.

## Technische details
In `src/components/planning-app.tsx`, binnen `PersoneelsplanningView`:
- `cellMenu`-state uitbreiden met optionele `startTime`, `endTime` en `block?: AvailEntry`.
- Hulpfunctie `openCellMenu(ev, empId, date, block?)` die `preventDefault()` + `stopPropagation()` doet en de positie uit `clientX`/`clientY` zet.
- In het blok `{view==="dag"&& …}`: `onContextMenu` toevoegen aan de medewerkerskaart, aan de knop "Geen tijdblokken — klik om in te plannen" en aan elke blokrij (`<div key={b.id} …>`).
- In de menurender: wanneer `cellMenu.block` gezet is, bovenaan "Bewerken" en "Verwijderen" tonen die de bestaande `openEditPlan` / `openEditAbsence` en de bestaande verwijderfunctie aanroepen; anders het huidige menu ongewijzigd.
- `useEffect` met een `keydown`-listener die op Escape `setCellMenu(null)` doet.
- Positieberekening `top` gebruikt de werkelijke menuhoogte via een ref in plaats van de vaste 260 px.

## Test
Personeelsplanning → Dag: rechtsklik op een lege medewerkerrij (menu opent), rechtsklik op een projectblok (bewerken/verwijderen), rechtsklik op een afwezigheidsblok, Escape en buitenklik sluiten het menu, en linksklik plus slepen werken nog steeds.
