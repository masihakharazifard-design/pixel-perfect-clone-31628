# Legenda zonder "Vrij" en openstaande projecten blijven zichtbaar

Twee kleine aanpassingen in `src/components/planning-app.tsx`, binnen Personeelsplanning. Geen databasewijziging, geen ontwerpwijziging, geen andere functies.

## 1. "Vrij" uit de legenda

De legenda onderaan Personeelsplanning toont de statussen uit één lijst. Alleen bij het tekenen van die legenda wordt "Vrij" (bolletje + label) overgeslagen. De overige items blijven staan: Stoffering, Schilderwerk, Zonwering, Beschikbaar, Ingepland, Bezet, Vakantie, Ziek.

De status "Vrij" blijft verder volledig bestaan: in bestaande gegevens, in de conflictcontrole, in het snelmenu, in de import en in Kleuren beheren.

## 2. Openstaande projecten blijven staan na inplannen

Nu is de lijst gefilterd op de zichtbare periode (project moet een geldige startdatum hebben en binnen de getoonde dag/week/maand/kwartaal vallen). Daardoor kan een project uit beeld raken.

Nieuw: zichtbaarheid hangt uitsluitend af van de projectstatus.

- Een project staat in de lijst zolang de status niet exact **Afgerond** of **Gefactureerd** is (vergelijking op kleine letters en zonder spaties, dus ook "afgerond " telt).
- Basis is de afdelingsgefilterde projectlijst (`visProjects`), dus het afdelingsfilter blijft gewoon werken.
- Geen enkele voorwaarde meer op ingeplande aantallen, "nog in te plannen", volledig ingepland of een toon-schakelaar.
- Projecten zonder startdatum of buiten de huidige periode blijven dus ook zichtbaar; dat is precies wat een planningslijst hoort te doen.

Na het inplannen (slepen of via "Inplannen") verandert alleen het aantal ingeplande medewerkers en de badge (Niet ingepland / Gedeeltelijk ingepland / Volledig ingepland). De bestaande volgorde blijft: nog in te plannen eerst, daarna op startdatum (projecten zonder startdatum sluiten achteraan aan).

Opslaan blijft ongewijzigd: opslaan in de database → bevestiging → data opnieuw laden → schermen verversen.

## Technische details

- Regel ~3223: `AVAIL_STATS.map(...)` in de legenda krijgt `.filter(s=>s!=="Vrij")`.
- Regel ~2999: `openProjects` wordt afgeleid van `visProjects` in plaats van `periodProjects`, met filter op genormaliseerde status (`!== "afgerond" && !== "gefactureerd"`). `periodProjects` blijft ongewijzigd voor de overige onderdelen die het gebruiken.
- Sorteervergelijking krijgt een veilige fallback voor lege `startdatum`.

## Test

Project bij één medewerker inplannen, daarna bij een tweede, daarna volledig inplannen — de regel blijft telkens staan en alleen teller en badge veranderen. Status op Afgerond zetten laat de regel verdwijnen; terugzetten laat hem weer verschijnen. Legenda onderaan toont geen "Vrij" meer.
