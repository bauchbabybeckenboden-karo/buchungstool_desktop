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
