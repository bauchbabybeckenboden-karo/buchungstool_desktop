# Bauch · Baby · Beckenboden – Buchungstool

Ersatz für Setmore. React + Vite, angelehnt an das bestehende [Terminumfragen](https://github.com/bauchbabybeckenboden-karo/Terminumfragen)-Projekt.

## Struktur

- `/admin` – Kursverwaltung, nach Kurstyp (Reiter). Pro Kurs: Name, Termine, Dauer, Preis,
  max. Teilnehmerinnen, Teilnehmerinnen-Liste (verschieben/entfernen), Sichtbarkeit auf Website.
- `/kurse/:courseTypeSlug` – Öffentliche Anmeldeseite, wird pro Website-Seite eingebettet
  (z.B. `/kurse/mamafit` für bauch-baby-beckenboden.de/mamafit/). Zeigt nur Kurse des jeweiligen
  Typs, die als "sichtbar" markiert sind.

Kurstypen sind zentral in `src/courseTypes.js` definiert (Slug, Label, Website-Pfad, Zusatzfelder).

## Datenbank

Nutzt das bestehende Supabase-Projekt "Umfrage/ WA Invites" (gleiche Organisation wie die
Terminumfragen-App – bietet sich an, da die Kurse später von dort automatisch importiert werden
sollen). Zwei neue Tabellen, unabhängig von den bestehenden Umfragen-Tabellen:

- `kurse` – Kursdaten. Öffentlich lesbar (nicht sensibel), Schreiben nur für eingeloggte Admins.
- `buchungen` – Anmeldungen mit personenbezogenen Daten (DSGVO!). Öffentlich einreichbar
  (Formular-Absenden), aber nur für eingeloggte Admins einsehbar/änderbar/löschbar.

## Wichtig – noch offen: Admin-Login

Die Buchungsseite (`/kurse/...`) funktioniert bereits vollständig mit echten Daten.

Die Admin-Seite kann Kurse zwar anzeigen (öffentlich lesbar), aber **Speichern, neue Kurse
anlegen und die Teilnehmerinnen-Liste sehen/verschieben/entfernen funktioniert erst, wenn ein
Admin-Login eingerichtet ist** – aus Datenschutzgründen (Anmeldungen enthalten Namen, Adressen
etc.) bewusst so gesperrt.

So richtest du das ein:
1. Im Supabase-Dashboard des Projekts "Umfrage/ WA Invites" → **Authentication → Users** → **Add User**
   mit deiner E-Mail und einem selbst gewählten Passwort.
2. Bescheid geben – dann baue ich eine Login-Maske für `/admin` (Supabase Auth), danach
   funktionieren alle Admin-Funktionen live.

## Lokal starten

```
npm install
npm run dev
```

`.env` ist bereits mit den Supabase-Zugangsdaten befüllt (Projekt "Umfrage/ WA Invites").

## Nächste Schritte (offen)

- Admin-Login (siehe oben)
- Auto-Import der Termine aus bauch-baby-beckenboden-kursabfrage.netlify.app
- E-Mail-Bestätigung (Resend) inkl. .ics-Kalendereintrag
- Trageberatung/Services (aktuell entfernt, Namen in Setmore stimmten nicht)
- Einbettung in WordPress (iFrame pro Kurstyp-Seite)
- Deployment auf Netlify (macht Karo selbst)
