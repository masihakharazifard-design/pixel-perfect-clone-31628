# Vakanties en feestdagen bijwerken t/m 2027 + waarschuwing in Instellingen

De agenda kent nu alleen feestdagen t/m 26 december 2026 en schoolvakanties t/m 23 augustus 2026. Daarna zou de agenda stilzwijgend geen vakanties meer markeren.

Let op: in de code heet de feestdagenlijst `DUTCH_HOL` (niet `NATIONAL_HOL`); de schoolvakanties staan in `SCHOOL_HOL`. Bestaande regels voor 2025 en 2026 blijven exact zoals ze zijn — er wordt alleen aan de lijsten toegevoegd.

## 1. Feestdagen 2027 toevoegen

Nieuwjaarsdag 1 jan, Goede Vrijdag 26 mrt, Eerste/Tweede Paasdag 28/29 mrt, Koningsdag 27 apr, Bevrijdingsdag 5 mei, Hemelvaartsdag 6 mei, Eerste/Tweede Pinksterdag 16/17 mei, Eerste/Tweede Kerstdag 25/26 dec.

## 2. Schoolvakanties schooljaar 2026/2027 toevoegen (officiële data Rijksoverheid)

| Vakantie | Noord | Midden | Zuid |
| --- | --- | --- | --- |
| Herfst | 10–18 okt 2026 | 17–25 okt 2026 | 17–25 okt 2026 |
| Kerst | 19 dec 2026 – 3 jan 2027 | idem | idem |
| Voorjaar | 20–28 feb 2027 | 20–28 feb 2027 | 13–21 feb 2027 |
| Mei | 24 apr – 2 mei 2027 | idem | idem |
| Zomer | 10 jul – 22 aug 2027 | 17 jul – 29 aug 2027 | 24 jul – 5 sep 2027 |

Zelfde formaat als bestaande regels (`{start,end,name,regions}`), gelijke regio's samengevoegd in één regel.

## 3. Waarschuwing in Instellingen

Een blok bovenaan de Instellingen-pagina dat alleen verschijnt zodra de laatst bekende datum uit de vakantie- of feestdagenlijst binnen 3 maanden ligt (of al verstreken is):

"Schoolvakanties/feestdagen zijn bijgewerkt tot [laatste datum]. Vraag een ontwikkelaar om nieuwe data toe te voegen."

Opvallend gestyled (amber waarschuwingsvlak met waarschuwingsicoon), datum in Nederlandse notatie.

## Technisch

- `src/components/planning-app.tsx`: entries toevoegen aan `DUTCH_HOL` en `SCHOOL_HOL`; geen bestaande entries wijzigen.
- Nieuwe helper `holidayDataUntil()` = max van alle `DUTCH_HOL.date` en `SCHOOL_HOL.end`; `holidayDataExpiringSoon()` vergelijkt met nu + 90 dagen.
- Waarschuwing renderen in `InstellingenView` (regel 3678) direct onder de paginatitel.
- Na de wijziging: typecheck met `bunx tsgo --noEmit`.
