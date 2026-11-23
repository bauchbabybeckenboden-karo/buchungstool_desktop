// netlify/functions/_shared/kursabfrage-abgleich.mjs (NEUE Datei)
//
// Rechnet aus, wie die Kurse im Buchungstool laut Kursabfrage aussehen
// sollen. Schreibt selbst nichts - liefert nur die Liste der Aenderungen.
// Wird von kursabfrage-sync.mjs genutzt (und fuer den Probelauf).
//
// Gleiche Logik wie beim Anlegen (ImportPanel) und beim Knopf
// "Mit Kursabfrage abgleichen" (KursabfrageAbgleich.jsx):
// - Zuordnung ueber kurse.source_gruppen_key = "<gruppenId>_<startdatum>".
// - Ein Kurs-Durchlauf geht vom Startdatum bis zur Notiz "letzte Kursstunde"
//   (bbb_notizen_v2). Termine = alle Termine der Gruppe in diesem Zeitraum,
//   ohne die gestrichenen (bbb_removed_v2).
// - uhrzeit: Uhrzeit der Gruppe, die ab Kursstart gilt (zeitphasen).
// - ausgefallen_daten: alle gestrichenen Termine der Gruppe (wie bisher).
// - Online-Partner (Ziel von online_partner_id) uebernehmen Termine, Uhrzeit
//   und Ausfaelle ihres Praesenzkurses, auch ohne eigenen source_gruppen_key.
//
// Terminzahl, Start, Ende und Preis werden NICHT gesetzt: das macht der
// Supabase-Trigger kurse_abgeleitete_felder, sobald sich termin_daten aendert.
// Der Preis in der Vorschau wird mit derselben Formel (pricing.js) gerechnet.
//
// Sicherheitsregeln:
// - Beendete Kurse (end_datum vor heute) werden nicht angefasst.
// - Ohne Notiz "letzte Kursstunde" oder ohne Termine bleiben die Termine
//   unveraendert (nur Hinweis).
// - Buchungen werden nie angefasst.

import { ermittleDurchlaeufe, echteTermineFuerDurchlauf } from "../../../src/importParser.js";
import { calculatePreis } from "../../../src/pricing.js";

const DATUM_RE = /^\d{4}-\d{2}-\d{2}$/;
const ZEIT_RE = /^\d{2}:\d{2}$/;

export function heuteISOBerlin() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
}

// "<gruppenId>_<YYYY-MM-DD>" -> { gid, start } (oder null)
export function zerlegeKey(key) {
  const m = /^(.*)_(\d{4}-\d{2}-\d{2})$/.exec(key || "");
  return m ? { gid: m[1], start: m[2] } : null;
}

// Gleiche Regel wie uhrzeitFuer() in der Kursabfrage (src/App.jsx):
// Grund-Uhrzeit, ersetzt durch die letzte Zeitphase mit ab <= Datum.
export function uhrzeitFuer(gruppe, iso) {
  let z = gruppe.uhrzeit;
  const phasen = [...(gruppe.zeitphasen || [])]
    .filter((p) => p && typeof p.ab === "string")
    .sort((a, b) => a.ab.localeCompare(b.ab));
  for (const p of phasen) if (p.ab <= iso) z = p.uhrzeit;
  return ZEIT_RE.test(z || "") ? z : null;
}

function liste(a) {
  return Array.isArray(a) ? a : [];
}

function gleicheListe(a, b) {
  const x = liste(a);
  const y = liste(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

function istBeendet(kurs, heute) {
  return !!kurs.end_datum && kurs.end_datum < heute;
}

// Soll-Werte fuer einen Kurs mit source_gruppen_key.
function sollAusKursabfrage(kurs, quelle, hinweise) {
  const teile = zerlegeKey(kurs.source_gruppen_key);
  if (!teile) {
    hinweise.push({ kurs: kurs.id, name: kurs.name, hinweis: "source_gruppen_key hat kein gueltiges Format" });
    return null;
  }
  const gruppe = quelle.gruppen[teile.gid];
  if (!gruppe) {
    hinweise.push({ kurs: kurs.id, name: kurs.name, hinweis: "Gruppe nicht (mehr) in der Kursabfrage" });
    return null;
  }

  const gestrichen = [...new Set(liste(quelle.removed[teile.gid]))].filter((d) => DATUM_RE.test(d)).sort();
  const soll = {
    uhrzeit: uhrzeitFuer(gruppe, teile.start),
    ausgefallen_daten: gestrichen,
    termin_daten: null, // null = Termine nicht aendern
  };

  const durchlauf = ermittleDurchlaeufe(gruppe, teile.gid, quelle.notizen).find((d) => d.start === teile.start);
  const termine = echteTermineFuerDurchlauf(gruppe, durchlauf, gestrichen);
  if (!termine) {
    hinweise.push({ kurs: kurs.id, name: kurs.name, hinweis: 'Notiz "letzte Kursstunde" fehlt - Termine bleiben unveraendert' });
  } else if (termine.length === 0) {
    hinweise.push({ kurs: kurs.id, name: kurs.name, hinweis: "Keine Termine im Zeitraum - Termine bleiben unveraendert" });
  } else {
    soll.termin_daten = [...new Set(termine)].sort();
  }
  return soll;
}

// Vergleicht Ist und Soll und liefert nur die echten Aenderungen.
function aenderungen(kurs, soll) {
  const update = {};
  const anzeige = {};
  if (soll.termin_daten && !gleicheListe(kurs.termin_daten, soll.termin_daten)) {
    update.termin_daten = soll.termin_daten;
    const alt = liste(kurs.termin_daten);
    anzeige.termine = {
      alt: alt.length,
      neu: soll.termin_daten.length,
      wegfallend: alt.filter((d) => !soll.termin_daten.includes(d)),
      neu_dazu: soll.termin_daten.filter((d) => !alt.includes(d)),
    };
    anzeige.start_ende = {
      alt: `${kurs.start_datum || "-"} bis ${kurs.end_datum || "-"}`,
      neu: `${soll.termin_daten[0]} bis ${soll.termin_daten[soll.termin_daten.length - 1]}`,
    };
    // Vorschau: gleiche Formel wie der Supabase-Trigger
    const preisNeu = calculatePreis(kurs.course_type, soll.termin_daten.length, []);
    if (preisNeu !== null && Number(kurs.preis) !== preisNeu) {
      anzeige.preis = { alt: Number(kurs.preis), neu: preisNeu };
    }
  }
  if (soll.uhrzeit && kurs.uhrzeit !== soll.uhrzeit) {
    update.uhrzeit = soll.uhrzeit;
    anzeige.uhrzeit = { alt: kurs.uhrzeit, neu: soll.uhrzeit };
  }
  if (!gleicheListe(kurs.ausgefallen_daten, soll.ausgefallen_daten)) {
    update.ausgefallen_daten = soll.ausgefallen_daten;
    const alt = liste(kurs.ausgefallen_daten);
    anzeige.ausgefallen = {
      hinzu: soll.ausgefallen_daten.filter((d) => !alt.includes(d)),
      weg: alt.filter((d) => !soll.ausgefallen_daten.includes(d)),
    };
  }
  return Object.keys(update).length ? { update, anzeige } : null;
}

// Hauptfunktion: kurse = alle Zeilen aus Supabase, quelle = { gruppen, removed, notizen }
export function berechneAbgleich(kurse, quelle, heute = heuteISOBerlin()) {
  const hinweise = [];
  const sollProKurs = new Map();

  // 1) Kurse mit eigenem source_gruppen_key
  for (const kurs of kurse) {
    if (!kurs.source_gruppen_key || istBeendet(kurs, heute)) continue;
    const soll = sollAusKursabfrage(kurs, quelle, hinweise);
    if (soll) sollProKurs.set(kurs.id, soll);
  }

  // 2) Online-Partner ohne eigenen Key: Werte vom Praesenzkurs uebernehmen
  const nachId = new Map(kurse.map((k) => [k.id, k]));
  const partnerVon = new Map(); // partnerId -> [Praesenzkurse]
  for (const kurs of kurse) {
    if (!kurs.online_partner_id || !sollProKurs.has(kurs.id)) continue;
    const arr = partnerVon.get(kurs.online_partner_id) || [];
    arr.push(kurs);
    partnerVon.set(kurs.online_partner_id, arr);
  }
  for (const [partnerId, praesenz] of partnerVon) {
    const partner = nachId.get(partnerId);
    if (!partner || partner.source_gruppen_key || istBeendet(partner, heute)) continue;
    let kandidaten = praesenz;
    if (kandidaten.length > 1) kandidaten = kandidaten.filter((k) => k.start_datum === partner.start_datum);
    if (kandidaten.length !== 1) {
      hinweise.push({ kurs: partner.id, name: partner.name, hinweis: "Online-Kurs ist mehreren Praesenzkursen zugeordnet - nicht geaendert" });
      continue;
    }
    sollProKurs.set(partner.id, { ...sollProKurs.get(kandidaten[0].id), partnerVon: kandidaten[0].id });
  }

  // 3) Unterschiede ermitteln
  const ergebnis = [];
  for (const [id, soll] of sollProKurs) {
    const kurs = nachId.get(id);
    const diff = aenderungen(kurs, soll);
    if (!diff) continue;
    ergebnis.push({
      id,
      name: (kurs.name || "").trim(),
      ist_online: !!kurs.ist_online,
      start_datum: kurs.start_datum,
      quelle: soll.partnerVon ? "Praesenzkurs " + soll.partnerVon : "Kursabfrage",
      ...diff,
    });
  }
  ergebnis.sort((a, b) => (a.start_datum || "").localeCompare(b.start_datum || "") || a.name.localeCompare(b.name));
  return { geprueft: sollProKurs.size, aenderungen: ergebnis, hinweise };
}
