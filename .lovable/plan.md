# Agenda: projectkleur altijd op afdeling

Alleen de kleurweergave van projectblokken in Agenda verandert. Geen databasewijziging, geen aanpassing aan Personeelsplanning of andere pagina's.

## Oorzaak

Projectblokken in Agenda krijgen wél al de afdelingskleur zolang er geen andere kleur is meegegeven. Maar bij een projectplanning met meer dan één medewerker wordt in Agenda een teamkleur (een kleur uit een vast teampalet, gekoppeld aan de combinatie medewerkers) op het blok gezet. Die teamkleur wint van de afdelingskleur, waardoor hetzelfde project ineens blauw, paars of oranje wordt in plaats van de kleur van zijn afdeling.

## Wat er verandert

- Projectblokken in Agenda krijgen altijd de kleur van de afdeling van het project: Stoffering, Schilderwerk of Zonwering, uit de centrale kleurinstellingen.
- Projecten met meerdere afdelingen (Turnkey) houden de bestaande gecombineerde weergave: bij twee afdelingen de diagonale tweekleurenverdeling, bij drie de driedeling.
- Offertes houden hun bestaande grijs-gestreepte weergave.
- Planningsstatus (Ingepland, Bezet, Vakantie, Ziek) en teamkleuren bepalen in Agenda nooit meer de kleur van een projectblok.
- Kleuren komen uit de instellingen, dus een wijziging via Kleuren beheren is direct zichtbaar in Agenda en blijft na refresh behouden.

## Wat niet verandert

Teamkleuren blijven gewoon werken in Personeelsplanning. Landelijke feestdagen, schoolvakanties, weeknummers en de overige Agenda-opmaak blijven ongewijzigd.

## Technisch

- In `AgendaView` in `src/components/planning-app.tsx` vervalt bij het opbouwen van de agendablokken uit planningregels de toekenning `teamKleur: ids.length>1 ? teamColor(...) : undefined`. De afgeleide blokken erven verder alle projectvelden, inclusief `afdeling`/`afdelingen`.
- Daardoor valt `projStyle` terug op de bestaande afdelingslogica (`getAllAfds` + `dc` uit de `DeptColorCtx`, gevoed door `settings.deptColors`), inclusief de bestaande split-weergave bij meerdere afdelingen en de offerte-stijl.
- De prop `teamColors` en de imports/aanroepen van `teamColor`/`teamKey` worden in `AgendaView` verwijderd voor zover ze daar nergens anders gebruikt worden; elders blijven ze intact.
- Geen hardcoded kleuren; er wordt niets aan `app_settings` of de database gewijzigd.
- Controle in een echte browser: project per afdeling, een meerafdelingenproject, een kleurwijziging via Kleuren beheren, en een statuswijziging die de kleur niet mag beïnvloeden — ook na refresh.
