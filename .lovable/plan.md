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

- Nieuwe helper `normalizeProjectnr(v) => String(v ?? "").trim()`, gebruikt op elke plek waar projectnummers worden vergeleken.
- `ExcelImportModal` (regel ~468): `existingNrs` (nu Projectnr. + Werknummer) wordt vervangen door `existingProjectNumbers` — uitsluitend genormaliseerde `projectnr`-waarden; `nieuw` en `bestaand` (regels ~532-533) vergelijken via dezelfde helper.
- `handleImport` in de modal (regel ~546): geeft `[...preview.nieuw, ...preview.bestaand]` door aan `onImport`; de knop is `disabled` wanneer `nieuw.length + bestaand.length === 0` en de kop "Overgeslagen — al bestaand" wordt "Wordt bijgewerkt".
- Parent `handleImport` (regel ~2705): geen `rows.map` + append meer, maar een upsert-lus over de bestaande lijst — `findIndex` op genormaliseerd `projectnr`; gevonden → alleen `projectleider` en `werkzaamheden` overschrijven met de exacte celtekst uit kolom K en J; niet gevonden → nieuw project via de bestaande mapping.
- Database: de nieuwe volledige lijst gaat via `syncTable("projects", next)` naar de database. `loadAll` draait pas nadat de sync klaar is (of wordt overgelaten aan de bestaande sync-`useEffect`), zodat een te vroege herlaadactie de oude databasewaarden niet terugzet.
- Opslagveld blijft `projects.data.projectleider`; het label in de UI blijft "Calculator".
