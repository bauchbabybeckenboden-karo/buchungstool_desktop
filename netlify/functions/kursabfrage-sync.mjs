// netlify/functions/kursabfrage-sync.mjs (NEUE Datei)
//
// Automatischer Abgleich Kursabfrage -> Buchungstool.
// Wird von der Kursabfrage nach jedem Speichern im Admin aufgerufen
// (kein Zeitplan, kein Polling).
//
// Aufruf: POST, Header "x-sync-token" = Netlify-Umgebungsvariable
// KURSABFRAGE_SYNC_TOKEN. Body (optional): { "dryRun": true } -> nur anzeigen,
// was sich aendern wuerde, nichts schreiben.
//
// Die Funktion nimmt KEINE Kursdaten vom Aufrufer an: sie liest die
// Kursabfrage (Gruppen, gestrichene Termine, Notizen) und die Kurse selbst.
// Geschrieben wird nur serverseitig mit SUPABASE_SERVICE_ROLE_KEY, nur in
// der Tabelle kurse und nur die Felder termin_daten, uhrzeit,
// ausgefallen_daten. Terminzahl, Start, Ende und Preis rechnet danach der
// Supabase-Trigger kurse_abgeleitete_felder. Buchungen werden nie geaendert.

import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { berechneAbgleich, heuteISOBerlin } from "./_shared/kursabfrage-abgleich.mjs";

const KURSABFRAGE_BLOB_URL =
  "https://bauch-baby-beckenboden-kursabfrage.netlify.app/.netlify/functions/blob-get";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SYNC_TOKEN = (process.env.KURSABFRAGE_SYNC_TOKEN || "").trim();

const KURS_FELDER =
  "id,name,course_type,ist_online,source_gruppen_key,online_partner_id,uhrzeit,termine,preis,start_datum,end_datum,termin_daten,ausgefallen_daten";

function antwort(status, daten) {
  return new Response(JSON.stringify(daten, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function tokenStimmt(gesendet) {
  if (!SYNC_TOKEN || !gesendet) return false;
  const a = Buffer.from(gesendet);
  const b = Buffer.from(SYNC_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Liest einen Blob der Kursabfrage. Fehler -> Exception (dann wird nichts geschrieben).
async function holeBlob(key, pflicht) {
  const res = await fetch(`${KURSABFRAGE_BLOB_URL}?key=${encodeURIComponent(key)}`, {
    headers: { "Cache-Control": "no-cache" },
  });
  if (res.status === 404) {
    if (pflicht) throw new Error(`Kursabfrage: ${key} nicht gefunden`);
    return {};
  }
  if (!res.ok) throw new Error(`Kursabfrage antwortete mit ${res.status} fuer ${key}`);
  const daten = await res.json();
  if (!daten || typeof daten !== "object" || Array.isArray(daten)) {
    throw new Error(`Kursabfrage: ${key} hat ein unerwartetes Format`);
  }
  return daten;
}

export default async (req) => {
  if (req.method !== "POST") return antwort(405, { ok: false, fehler: "POST erwartet" });
  if (!SYNC_TOKEN) return antwort(500, { ok: false, fehler: "KURSABFRAGE_SYNC_TOKEN ist nicht gesetzt" });
  if (!tokenStimmt((req.headers.get("x-sync-token") || "").trim())) {
    return antwort(401, { ok: false, fehler: "Nicht autorisiert" });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return antwort(500, { ok: false, fehler: "Supabase-Zugang auf dem Server nicht gesetzt" });
  }

  let dryRun = false;
  try {
    const body = await req.json();
    dryRun = body?.dryRun === true;
  } catch {
    // leerer Body = echter Abgleich
  }

  try {
    const [gruppen, removed, notizen] = await Promise.all([
      holeBlob("bbb_gruppen_v2", true),
      holeBlob("bbb_removed_v2", false),
      holeBlob("bbb_notizen_v2", false),
    ]);
    if (Object.keys(gruppen).length === 0) throw new Error("Kursabfrage liefert keine Gruppen - Abbruch");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: kurse, error } = await supabase.from("kurse").select(KURS_FELDER);
    if (error) throw new Error("Kurse laden: " + error.message);

    const heute = heuteISOBerlin();
    const { geprueft, aenderungen, hinweise } = berechneAbgleich(kurse, { gruppen, removed, notizen }, heute);

    const fehler = [];
    let geschrieben = 0;
    if (!dryRun) {
      for (const a of aenderungen) {
        const { error: e } = await supabase
          .from("kurse")
          .update({ ...a.update, updated_at: new Date().toISOString() })
          .eq("id", a.id);
        if (e) fehler.push({ kurs: a.id, name: a.name, fehler: e.message });
        else geschrieben++;
      }
      if (fehler.length) console.error("[kursabfrage-sync] Fehler:", JSON.stringify(fehler));
    }

    return antwort(fehler.length ? 500 : 200, {
      ok: fehler.length === 0,
      dryRun,
      heute,
      geprueft,
      zu_aendern: aenderungen.length,
      geschrieben,
      aenderungen: aenderungen.map(({ update, ...rest }) => rest),
      hinweise,
      fehler,
    });
  } catch (e) {
    console.error("[kursabfrage-sync]", e.message);
    return antwort(500, { ok: false, dryRun, fehler: e.message });
  }
};

export const config = { path: "/.netlify/functions/kursabfrage-sync" };
