# Twee fixes in Personeelsplanning

## 1. Openstaande projecten: alleen weg bij status "Afgerond"

Wat ik in de code heb gecontroleerd:

- De lijst wordt nu berekend in `PersoneelsplanningView` (rond regel 2992) als
  `visProjects.filter(p => status !== "afgerond" && status !== "gefactureerd")`.
  Er zit dus **geen** `rest > 0`, `periodProjects`, `showPlanned` of datumvoorwaarde meer in.
- In de drop-/planhandlers (`dropOnCell`, `tryCommit`, `commitPlanning`, `savePlanningMany`)
  staat geen enkele regel die het project uit de lijst haalt: er is geen `setOpenProjects`,
  geen `filter(p => p.id !== draggedProjectId)` en geen optimistische verwijdering.

Dat betekent dat ik de oorzaak nog niet met zekerheid kan aanwijzen. Wat wél nog kan
verklaren dat een project verdwijnt:

1. de resterende voorwaarde `!== "gefactureerd"`;
2. het afdelingsfilter (`visProjects`): valt het project buiten de actief gekozen
   afdelingen, dan staat het niet in de lijst;
3. na inplannen worden de projectdatums afgeleid uit de planningregels
   (`applyDerivedDates`) — als dat ergens ook de status of afdeling aanraakt.

Aanpak:
- Eerst reproduceren in een echte browser: open project naar een medewerker slepen en
  kijken of het verdwijnt, met het afdelingsfilter uit. Zo weet ik precies welke van de
  drie het is en meld ik dat exact terug.
- Daarna de filter definitief terugbrengen tot uitsluitend:
  `status !== "afgerond"` (Gefactureerd blijft dus zichtbaar).
- Als de reproductie een andere oorzaak aanwijst (bijv. filter of afgeleide data), wordt
  precies die ene oorzaak weggenomen — verder niets.

Na inplannen: alleen de planningregel opslaan, het projectrecord ongewijzigd laten,
opnieuw laden uit de database, en enkel badge (Niet/Gedeeltelijk/Volledig ingepland) en
aantallen herberekenen.

## 2. Doorgetrokken project houdt dezelfde kleur en wordt één balk

Bevestigde oorzaak van de kleurwissel: de kleurhelper `rowColor` (regel 2745) bepaalt de
kleur via `teamKey(projectId, a.date, teamleden)` — de **datum** zit in de sleutel. Elke
extra dag krijgt daardoor een andere sleutel en dus een andere kleur.

Fix:
- `rowColor` wordt datum-onafhankelijk: eerst de opgeslagen teamkleur (`teamId`), anders de
  opgeslagen projectkleur, anders een kleur afgeleid van uitsluitend `projectId`.
- Nooit kleur afleiden uit datum, rij-index of het id van een nieuw availability-record.
- Resizen/doortrekken raakt de kleur niet aan; `projectId`, `reeksId` en `teamId` blijven
  behouden op alle gekoppelde dagregels.
- Projecten met meerdere afdelingen houden dezelfde split/gestreepte weergave over de hele
  periode.

Doorlopende balk in de weekweergave:
- Dagregels met dezelfde `projectId` + `reeksId` + medewerker worden per rij gegroepeerd tot
  één aaneengesloten reeks.
- Eerste dag: ronding links; tussenliggende dagen: rechte, aansluitende randen; laatste dag:
  ronding rechts; geen zichtbare tussenruimte (celpadding/gap valt weg binnen een reeks).
- Zelfde hoogte, achtergrond, rand en teksstijl over de hele reeks; de projectnaam staat
  alleen op de eerste dag.
- De resize-handle blijft staan waar hij nu staat (laatste dag van de reeks).

## Technische details

Alles in `src/components/planning-app.tsx`:

- `openProjects` (~2992): conditie terug naar alleen `status !== "afgerond"`.
- `rowColor` (~2745): teamkleur via `teamId`/opgeslagen team-override, dan
  `projectColors[projectId]`, dan een stabiele kleur op basis van `projectId` alleen.
- Weekweergave-cellen (~3130): per medewerker eerst een reeksberekening
  (`projectId+reeksId`) over de zichtbare dagen; per dag wordt `first`/`middle`/`last`
  bepaald en vertaald naar rounding, negatieve horizontale marges en het weglaten van het
  label op vervolgdagen.
- Geen wijzigingen aan database, agenda, projectenpagina of overige functies.

## Test

Slepen naar medewerker, tweede medewerker toevoegen, volledig inplannen, naar andere datum
verplaatsen: project blijft steeds in Openstaande projecten. Status op Afgerond: verdwijnt.
Project van één naar vier dagen doortrekken: identieke kleur, één doorlopende balk zonder
gaten; na refresh onveranderd.
