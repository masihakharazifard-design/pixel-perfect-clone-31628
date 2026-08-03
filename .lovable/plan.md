# Excel-import: bestaande projecten bijwerken op Projectnr.

De parser leest kolom J (Werkzaamheden) en kolom K (Calculator) al correct. Het probleem zit in de importstap: rijen waarvan het Projectnr. al bestaat worden overgeslagen, dus oude foutieve Calculator-waarden (zoals "Maria Bakker") blijven staan.

## Wat er verandert

1. **Herkenning van bestaande projecten** gebeurt alleen nog op Projectnr. (exacte tekst, spaties weggetrimd). Werknummer telt niet meer mee, zodat rijen niet onterecht als duplicaat gelden.

2. **Import werkt nu als bijwerken + toevoegen** in plaats van alleen toevoegen:
   - rij met bestaand Projectnr. → het bestaande project wordt bijgewerkt: Calculator (kolom K) en Werkzaamheden (kolom J) krijgen de exacte celtekst uit Excel; alle overige gegevens van dat project blijven ongewijzigd;
   - rij met onbekend Projectnr. → nieuw project, zoals nu.

3. **Calculator blijft platte tekst.** Geen vergelijking met Medewerkers, geen omzetting naar een medewerker-ID, geen standaardwaarde, geen "Maria Bakker".

4. **Importvenster**: de sectie die nu "Overgeslagen — al bestaand" heet wordt "Wordt bijgewerkt", en de knop telt nieuw + bij te werken rijen samen. De knop is alleen uitgeschakeld als er niets te importeren valt.

5. **Opslaan**: na de import gaat de volledige projectlijst naar de database en worden de projecten opnieuw uit de database geladen, zodat Projecten, Projectdetails en Agenda dezelfde opgeslagen waarde tonen; de waarde blijft na een refresh staan.

## Test

Een testbestand met minimaal één bestaand Projectnr. en een andere naam in kolom K dan de huidige waarde, plus een nieuwe rij. Controle: bestaand project krijgt de nieuwe Calculator-waarde, nieuwe rij wordt aangemaakt, exacte tekst zichtbaar in de Projecten-tabel en Projectdetails, en behouden na browser-refresh.

## Technische details

Alles in `src/components/planning-app.tsx`:

- `ExcelImportModal` (regel ~468): `existingNrs` (nu Projectnr. + Werknummer) wordt vervangen door een set met alleen getrimde `projectnr`-waarden; `nieuw`/`bestaand` worden op basis daarvan gesplitst.
- `handleImport` in de modal (regel ~546): geeft `[...preview.nieuw, ...preview.bestaand]` door aan `onImport`.
- Parent `handleImport` (regel ~2705): upsert per rij — `findIndex` op getrimd `projectnr`; gevonden → `{...bestaand, projectleider: row.projectleider, werkzaamheden: row.werkzaamheden}`; niet gevonden → nieuw project via de bestaande mapping.
- Na `setProjects` wordt de lijst gesynchroniseerd via de bestaande `syncTable("projects", ...)`-flow en daarna herladen met `loadAll`.
- Opslagveld blijft `projects.data.projectleider`; het label in de UI blijft "Calculator".
