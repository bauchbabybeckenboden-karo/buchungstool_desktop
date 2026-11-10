// Liefert Kurstermine als abonnierbaren iCalendar-Feed (.ics).
// - Ohne Parameter: alle Kurse (Karos eigener Kalender).
// - Mit ?kurs=<id> (mehrfach möglich): nur diese Kurse plus deren Partnerkurs
//   (Kombikurs) - der Link für Teilnehmerinnen. Er enthält nur Kurstermine
//   (keine Ferien/Feiertage, keine personenbezogenen Daten); ausgefallene
//   Termine (kurse.ausgefallen_daten) erscheinen nicht. Kalender-Programme
//   fragen den Feed selbstständig neu ab, Änderungen kommen automatisch an.
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const COURSE_TYPE_LABELS = {
  mamafit: "Mamafit",
  schwangerfit: "Schwangerfit",
  "somatic-yoga": "Somatic Yoga",
  "koerpermitte-beckenboden": "Körpermitte & Beckenboden",
};

function plusDaysISO(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function pad(n) {
  return String(n).padStart(2, "0");
}

// "Floating" lokale Zeit (ohne Z-Suffix / Zeitzonen-Datenbank) - Google
// Kalender interpretiert das im Zeitzone des jeweiligen Kalenders, was für
// einen einzelnen, in Deutschland geführten Kalender ausreicht.
function toICSDateTime(dateStr, timeStr) {
  const [y, m, d] = dateStr.split("-");
  const [hh, mm] = (timeStr || "00:00").split(":");
  return `${y}${m}${d}T${pad(hh)}${pad(mm)}00`;
}

function addMinutesToICS(dateStr, timeStr, minutes) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = (timeStr || "00:00").split(":").map(Number);
  const dt = new Date(y, m - 1, d, hh, mm + Number(minutes || 60));
  return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
}

function nowStamp() {
  const dt = new Date();
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}${pad(dt.getUTCSeconds())}Z`;
}

function escapeICS(str) {
  return String(str || "")
    .replace(/\\/g, "\\\\")
    .replace(/[;,]/g, (c) => "\\" + c)
    .replace(/\n/g, "\\n");
}

function foldLine(line) {
  // iCalendar-Zeilen sollen nach 75 Oktetten umgebrochen werden (mit
  // führendem Leerzeichen auf der Folgezeile) - ohne das lehnen manche
  // Kalender-Clients sehr lange SUMMARY-Zeilen ab.
  if (line.length <= 75) return line;
  let result = "";
  let rest = line;
  while (rest.length > 75) {
    result += rest.slice(0, 75) + "\r\n ";
    rest = rest.slice(75);
  }
  return result + rest;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORT = "Heinrich-Bertelmann-Str. 12, Kassel";

export default async (req) => {
  const url = new URL(req.url);
  const kursIds = url.searchParams.getAll("kurs");
  const gefiltert = kursIds.length > 0;
  const nurEinzeln = url.searchParams.get("nur") === "1"; // Einzelkurs ohne Partnerkurs

  let kurse = [];
  let error = null;

  if (gefiltert) {
    const gueltig = [...new Set(kursIds.filter((id) => UUID_RE.test(id)))].slice(0, 6);
    if (gueltig.length === 0) return new Response("Ungültiger Kalender-Link.", { status: 400 });
    const erste = await supabase.from("kurse").select("*").in("id", gueltig);
    error = erste.error;
    kurse = erste.data || [];
    const partnerIds = nurEinzeln ? [] : [...new Set(kurse.map((k) => k.kombi_partner_id).filter(Boolean))].filter(
      (id) => !kurse.some((k) => k.id === id)
    );
    if (!error && partnerIds.length > 0) {
      const zweite = await supabase.from("kurse").select("*").in("id", partnerIds);
      error = zweite.error;
      kurse = kurse.concat(zweite.data || []);
    }
    if (!error && kurse.length === 0) return new Response("Kurs nicht gefunden.", { status: 404 });
  } else {
    const alle = await supabase.from("kurse").select("*").order("start_datum", { ascending: true });
    error = alle.error;
    kurse = alle.data || [];
  }

  if (error) {
    return new Response("Kalender konnte nicht geladen werden: " + error.message, { status: 500 });
  }

  const events = [];
  // Vor-Ort- und Online-Version desselben Kurses (gleicher Name ohne "Online",
  // gleicher Kurstyp, gleicher Starttermin) werden zu EINEM Eintrag
  // zusammengefuehrt. Reine Online-Kurse bleiben mit "(Online)" erhalten.
  const gesehen = new Set();
  const sortiert = [...kurse].sort(
    (x, y) => Number(!!x.ist_online) - Number(!!y.ist_online) // Vor Ort zuerst
  );

  for (const kurs of sortiert) {
    const basisName = String(kurs.name || "").replace(/\s*\(?online\)?\s*$/i, "").trim();
    const dauer = kurs.dauer_min || 60;
    const online = kurs.ist_online ? " (Online)" : "";
    const ort = kurs.ist_online ? "Online (Zoom)" : ORT;
    const ausgefallen = new Set(Array.isArray(kurs.ausgefallen_daten) ? kurs.ausgefallen_daten : []);

    if (Array.isArray(kurs.termin_daten) && kurs.termin_daten.length > 0) {
      // Die echten Einzeltermine (aus der Kursabfrage inkl. Pausenwochen) -
      // ein Kalendereintrag pro Termin, ausgefallene Termine entfallen.
      const termine = kurs.termin_daten.filter((d) => !ausgefallen.has(d));
      termine.forEach((datum, i) => {
        const key = `${kurs.course_type}|${basisName.toLowerCase()}|${toICSDateTime(datum, kurs.uhrzeit)}`;
        if (gesehen.has(key)) return; // Online-Doppelung zu einem Vor-Ort-Termin
        gesehen.add(key);
        events.push({
          uid: `${kurs.id}-${datum}@bauch-baby-beckenboden`,
          dtstart: toICSDateTime(datum, kurs.uhrzeit),
          dtend: addMinutesToICS(datum, kurs.uhrzeit, dauer),
          summary: `${basisName}${online} (${i + 1}/${termine.length})`,
          location: ort,
        });
      });
    } else if (kurs.start_datum) {
      // Fallback fuer manuell angelegte Kurse ohne Einzeltermin-Liste:
      // woechentlich wiederkehrender Termin ab dem Start-Datum.
      const key = `${kurs.course_type}|${basisName.toLowerCase()}|serie|${toICSDateTime(kurs.start_datum, kurs.uhrzeit)}`;
      if (gesehen.has(key)) continue;
      gesehen.add(key);
      events.push({
        uid: `${kurs.id}-serie@bauch-baby-beckenboden`,
        dtstart: toICSDateTime(kurs.start_datum, kurs.uhrzeit),
        dtend: addMinutesToICS(kurs.start_datum, kurs.uhrzeit, dauer),
        summary: `${basisName}${online}`,
        location: ort,
        rrule: `FREQ=WEEKLY;COUNT=${kurs.termine || 1}`,
      });
    }
  }

  const kalenderName = gefiltert
    ? `${[...new Set(sortiert.map((k) => String(k.name || "").replace(/\s*\(?online\)?\s*$/i, "").trim()))].join(" + ")} · Bauch · Baby · Beckenboden`
    : "Bauch · Baby · Beckenboden Kurse";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bauch Baby Beckenboden//Kursplan//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldLine(`X-WR-CALNAME:${escapeICS(kalenderName)}`),
    "X-WR-TIMEZONE:Europe/Berlin",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];

  events.forEach((e) => {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.uid}`);
    lines.push(`DTSTAMP:${nowStamp()}`);
    lines.push(`DTSTART:${e.dtstart}`);
    lines.push(`DTEND:${e.dtend}`);
    if (e.rrule) lines.push(`RRULE:${e.rrule}`);
    lines.push(foldLine(`SUMMARY:${escapeICS(e.summary)}`));
    if (e.location) lines.push(foldLine(`LOCATION:${escapeICS(e.location)}`));
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n") + "\r\n", {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="bbb-kurse.ics"',
      "Cache-Control": "no-cache",
    },
  });
};

export const config = { path: "/.netlify/functions/kalender-feed" };
