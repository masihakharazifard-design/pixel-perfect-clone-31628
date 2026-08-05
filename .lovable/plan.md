# Agenda: alleen projecten, feestdagen en schoolvakanties

Alleen het Agenda-tabblad verandert. Geen databasewijziging, geen tweede agenda, geen aanpassing aan Personeelsplanning, Beschikbaarheid of Medewerkerdetails.

## Wat er verandert

- Persoonlijke regels van medewerkers (Vakantie, Vrij, Ziek, Bezet, Beschikbaar en overige beschikbaarheidsblokken zonder project) worden niet meer in Agenda getoond.
- Projecten blijven zichtbaar, inclusief projectplanningen die uit de planningregels worden opgebouwd. Die hebben een geldig project en blijven dus gewoon staan, ook met status "Ingepland".
- Landelijke feestdagen en schoolvakanties blijven ongewijzigd zichtbaar in maand- en kwartaalweergave.
- De Agenda-filters blijven beperkt tot projecten (afdeling, weeknummers). Er staan in Agenda verder geen persoonlijke-statuslabels; die blijven alleen in Personeelsplanning.

## Wat er niet verandert

Er wordt niets verwijderd of gewijzigd in de gegevens: availability-regels, vakanties, ziekmeldingen en planning blijven volledig intact en zichtbaar in Personeelsplanning, Beschikbaarheid en Medewerkerdetails.

## Technisch

- In `AgendaView` in `src/components/planning-app.tsx` vervalt het blok dat `availability`-regels zonder `projectId` met een `ABSENCE_STATS`-status als pseudo-project (`abs::…`) aan `agendaProjects` toevoegt. Alleen regels met een geldig `projectId` blijven meedoen via `projectPlans`.
- De nu overbodige `abs::`-uitzonderingen in `openReal`, `handleDropProject`, `handleDropProjectTime` en `handleResize` vervallen.
- `statusColors` wordt in `AgendaView` niet meer gebruikt en verdwijnt uit de props en de aanroep; `SCHOOL_HOL`/`DUTCH_HOL`-logica (`getSHols`, `getDHol`) blijft ongewijzigd.
- Na de wijziging: controle in een echte browser dat een ingepland project in Agenda staat, dat vakantie/ziek/vrij/bezet er niet meer staat, dat feestdag en schoolvakantie zichtbaar blijven, en dat Personeelsplanning ongewijzigd is — ook na refresh.
