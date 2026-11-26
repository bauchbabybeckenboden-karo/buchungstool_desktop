# Arbeitsregeln für Claude (Karo, BBB Kassel)

## Sprache und Ton
- Deutsch, kurz und klar, keine Emojis.
- Immer nur der nächste Schritt, mit Angabe von Programm und Datei.
- Ansprachen in Texten für Teilnehmerinnen groß: Du, Dir, Dein. Signatur: "Deine Karo ♦".

## Änderungen und Git
- Claude darf Dateien direkt im Repo ändern und lokal committen, am liebsten in einem eigenen Branch.
- Claude pusht und deployt nie selbst. Karo prüft die Änderungen mehrfach (GitHub Desktop) und pusht selbst.
- Vor dem Commit kurz zeigen, was geändert wurde.
- Nach jedem Push erinnern: In Netlify "Publish deploy" im richtigen Projekt mit dem richtigen Account freigeben (Projekt und Account nennen).
- Deploys bündeln, nur deployen wenn wirklich nötig (Netlify-Credits sparen).

## Qualität
- Sicherheit von Anfang an: Zugriffe absichern, Schreibrechte minimal, Admin-Funktionen nur serverseitig prüfen.
- Nichts endgültig löschen, Dateien in den Papierkorb verschieben.
- Bei Codeänderungen die komplette Datei liefern, nicht nur Teile.
- Keine Pop-ups, Weiterleitungen mit window.location.href im selben Fenster.
- Ressourcenschonend arbeiten, keine unnötigen Tool-Aufrufe.
- Am Ende nachfragen, ob etwas fehlt.

## Kurse und Termine (nur dieses Repo)
- Terminzahl, Start, Ende und Preis nie von Hand pflegen. Quelle sind die Einzeltermine (termin_daten) in Supabase.
- Der Trigger kurse_abgeleitete_felder in Supabase leitet Terminzahl, Start, Ende und Preis daraus ab.
- Jeder buchbare Präsenzkurs hat IMMER einen Online-Partner (kurse.online_partner_id). Neue Funktionen und Änderungen müssen das berücksichtigen.
- Der Trigger kurse_online_partner_anlegen legt ihn automatisch an, sobald ein Präsenzkurs sichtbar ist (Name + " Online", gleiche Termine/Uhrzeit/Preis, 10 Plätze, nicht sichtbar), oder verknüpft einen vorhandenen gleichnamigen Online-Kurs.
- Der Trigger kurse_online_partner_preis überträgt Preis und Rabatt des Präsenzkurses auf den Online-Partner. Termine, Uhrzeit und Ausfälle gleicht kursabfrage-sync ab.
- Zu jedem Präsenz-Paket (kurs_pakete) gibt es automatisch das Online-Paket aus den beiden Online-Partnern (Trigger kurs_pakete_online_anlegen, Name + " Online"). Preis und "Auf Website anzeigen" überträgt kurs_pakete_online_angleichen.
