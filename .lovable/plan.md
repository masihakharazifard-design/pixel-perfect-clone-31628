# Excel-import op kolomkoppen + Werkzaamheden verwijderen

## Wat er verandert

**1. Kolommen worden herkend op de tekst in de kopregel**
De import kijkt niet langer naar een vaste kolompositie, maar naar de naam van de kolom in de eerste regel van het Excel-bestand (hoofdletters maken niet uit, punten/spaties worden genegeerd):

| Kolomkop | Wordt opgeslagen als |
| --- | --- |
| S | Status |
| A/R | A/R (ruwe tekst) |
| Type | Type / afdeling (bestaande herkenning Turnkey/Combinatie) |
| Werknr. | Werknummer — dit is voortaan het unieke nummer van het werk |
| Calculatie.Code | Calculatiecode |
| Projectl. | Calculator |
| Vestiging | Vestiging (wordt bewaard, niet getoond in de Werken-tabel) |
| Omschrijving | wordt genegeerd |
| Naam opdrachtgever | Opdrachtgever |
| Straat object | Adres (het bestaande adresveld dat overal in de app gebruikt wordt) |
| Plaats object | Plaats (het bestaande plaatsveld) |
| Opmerkingen | Opmerkingen |

Ontbreekt een verwachte kolom, dan blijft dat veld gewoon leeg; de import gaat door. In de voorbeeldstap verschijnt dan een gele waarschuwing met de lijst kolomkoppen die niet gevonden zijn. Alleen als "Werknr." helemaal ontbreekt kan er niets ingelezen worden en volgt een duidelijke foutmelding.

**2. Werknr. is de sleutel**
Bestaat een werknummer al in de app, dan wordt die regel overgeslagen (nooit bijgewerkt of verwijderd) — precies zoals nu, maar op Werknr. in plaats van Projectnr.

**3. Naam van het werk**
Omdat Omschrijving niet meer wordt ingelezen, krijgt een geïmporteerd werk als naam "Straat object – Plaats object" (bijv. "Weena 90 – Rotterdam"). Ontbreken beide, dan wordt het werknummer getoond. De gebruiker kan de naam altijd zelf aanpassen.

**4. Werkzaamheden verdwijnt volledig**
Het veld Werkzaamheden wordt echt verwijderd: uit het gegevensmodel, uit de Werken-tabel (kolom + filter), uit het aanmaak-/bewerkformulier en uit alle plekken waar het nu als omschrijving wordt getoond (Agenda-tooltips, Personeelsplanning, zoekfunctie, inplanscherm). In de werkdetails wordt de tab "Werkzaamheden" vervangen door "Opmerkingen", die de geïmporteerde opmerkingen toont. Waar nu Werkzaamheden als omschrijving getoond werd, komt de naam van het werk (of de opmerking) in de plaats.

**5. Kolomtabel in het importscherm**
De tabel "Verwachte kolommen" in het uploadscherm wordt bijgewerkt naar bovenstaande lijst, zonder Omschrijving en zonder Werkzaamheden.

Er verandert niets aan de regel dat import géén start- of einddatum overneemt: werken verschijnen pas in Agenda en Personeelsplanning zodra de gebruiker zelf een startdatum invult.

## Technisch

- `src/lib/excel-parse.ts`: `ImportRow` uitbreiden met `status`/`statusRaw`, `ar`, `calculatiecode`, `vestiging`, `opmerkingen`; `werkzaamheden` verwijderen; `COL_WERKZAAMHEDEN`, `COL_PROJECTLEIDER` en `COL_STATUS` verwijderen. Gedeelde helper `matchHeaders(headerRow)` die genormaliseerde koppen (lowercase, punten/spaties weg) op veldnamen mapt en `{ index, missing[] }` teruggeeft. Workerrespons uitbreiden met `missingColumns: string[]`.
- `src/workers/excel-import.worker.ts`: headerrij zoeken op "werknr" i.p.v. "projectnr"; alle vaste indices vervangen door de header-map; rijen zonder werknummer als ongeldig markeren; dedupe op werknummer; `missingColumns` meesturen.
- `src/components/planning-app.tsx`:
  - `Project`: `werkzaamheden` verwijderen, `vestiging?:string` toevoegen; `straatObject`/`plaatsObject` blijven bestaan maar worden door de import niet meer apart gevuld (adres/plaats worden gevuld).
  - `ColFilters`/`TextFilterKey`: geen werkzaamheden-filter; `projStraat`/`projPlaatsObj` blijven werken via adres/plaats.
  - `createProjectFromImportRow`: `adres=r.straat`, `plaats=r.plaatsobject`, `vestiging`, `projectnaam` = "straat – plaats" met fallback werknummer; geen start-/afloopdatum.
  - Importmodal: waarschuwingsblok voor `missingColumns` in de previewstap; tabel "Verwachte kolommen" bijwerken.
  - Detailtabs: `werkzaamheden` → `opmerkingen`.
  - Formulier: Textarea "Werkzaamheden" verwijderen.
- `src/lib/project-index.ts`: `werkzaamheden` uit de zoekindex halen (zoeken op werknummer, naam, calculator, opdrachtgever).
- `src/lib/demo-seed.ts`: `werkzaamheden` uit de demowerken halen.
- Afsluitend: grep op "werkzaamheden" en `bunx tsgo --noEmit`.
