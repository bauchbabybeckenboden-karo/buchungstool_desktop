// Liefert alle Kurstermine als abonnierbaren iCalendar-Feed (.ics) - Karo
// trägt die URL dieser Funktion EINMAL in Google Kalender als "Kalender per
// URL abonnieren" ein, danach tauchen neu angelegte/importierte Kurse
// automatisch dort auf (Google fragt den Feed selbstständig alle paar
// Stunden neu ab - keine sofortige Aktualisierung, aber ohne dass Karo
// irgendetwas manuell nachpflegen muss).
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const COURSE_TYPE_LABELS = {
  mamafit: "Mamafit",
  schwangerfit: "Schwangerfit",
  "somatic-yoga": "Somatic Yoga",
  "koerpermitte-beckenboden": "Körpermitte & Beckenboden",
};

// Hessische Schulferien (Kultusministerium Hessen, bis 2030) - erscheinen als
// Ganztagestermine im Kalender (blocken keine Zeit).
const FERIEN = [
  ["2026-10-05", "2026-10-17", "Herbstferien"],
  ["2026-12-23", "2027-01-12", "Weihnachtsferien"],
  ["2027-03-22", "2027-04-02", "Osterferien"],
  ["2027-06-28", "2027-08-06", "Sommerferien"],
  ["2027-10-04", "2027-10-16", "Herbstferien"],
  ["2027-12-23", "2028-01-11", "Weihnachtsferien"],
  ["2028-04-03", "2028-04-14", "Osterferien"],
  ["2028-07-03", "2028-08-11", "Sommerferien"],
  ["2028-10-09", "2028-10-20", "Herbstferien"],
  ["2028-12-27", "2029-01-12", "Weihnachtsferien"],
  ["2029-03-29", "2029-04-13", "Osterferien"],
  ["2029-07-16", "2029-08-24", "Sommerferien"],
  ["2029-10-15", "2029-10-26", "Herbstferien"],
  ["2029-12-24", "2030-01-11", "Weihnachtsferien"],
  ["2030-04-08", "2030-04-22", "Osterferien"],
  ["2030-07-22", "2030-08-30", "Sommerferien"],
];

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

export default async (req) => {
  const { data: kurse, error } = await supabase
    .from("kurse")
    .select("*")
    .order("start_datum", { ascending: true });

  if (error) {
    return new Response("Kalender konnte nicht geladen werden: " + error.message, { status: 500 });
  }

  const events = [];
  // Vor-Ort- und Online-Version desselben Kurses (gleicher Name ohne "Online",
  // gleicher Kurstyp, gleicher Starttermin) werden zu EINEM Eintrag
  // zusammengefuehrt. Reine Online-Kurse bleiben mit "(Online)" erhalten.
  const gesehen = new Set();
  const sortiert = [...(kurse || [])].sort(
    (x, y) => Number(!!x.ist_online) - Number(!!y.ist_online) // Vor Ort zuerst
  );

  for (const kurs of sortiert) {
    const typLabel = COURSE_TYPE_LABELS[kurs.course_type] || kurs.course_type;
    const basisName = String(kurs.name || "").replace(/\s*\(?online\)?\s*$/i, "").trim();
    const dauer = kurs.dauer_min || 60;

    if (Array.isArray(kurs.termin_daten) && kurs.termin_daten.length > 0) {
      // Bevorzugter Fall: die echten Einzeltermine sind bekannt (aus der
      // Kursabfrage inkl. Pausenwochen) - ein Kalendereintrag pro Termin.
      kurs.termin_daten.forEach((datum, i) => {
        const key = `${kurs.course_type}|${basisName.toLowerCase()}|${toICSDateTime(datum, kurs.uhrzeit)}`;
        if (gesehen.has(key)) return; // Online-Doppelung zu einem Vor-Ort-Termin
        gesehen.add(key);
        const online = kurs.ist_online ? " (Online)" : "";
        events.push({
          uid: `${kurs.id}-${datum}@bauch-baby-beckenboden`,
          dtstart: toICSDateTime(datum, kurs.uhrzeit),
          dtend: addMinutesToICS(datum, kurs.uhrzeit, dauer),
          summary: `${basisName} · ${typLabel}${online} (${i + 1}/${kurs.termine})`,
        });
      });
    } else if (kurs.start_datum) {
      // Fallback fuer manuell angelegte Kurse ohne Einzeltermin-Liste:
      // woechentlich wiederkehrender Termin ab dem Start-Datum.
      const key = `${kurs.course_type}|${basisName.toLowerCase()}|serie|${toICSDateTime(kurs.start_datum, kurs.uhrzeit)}`;
      if (gesehen.has(key)) continue;
      gesehen.add(key);
      const online = kurs.ist_online ? " (Online)" : "";
      events.push({
        uid: `${kurs.id}-serie@bauch-baby-beckenboden`,
        dtstart: toICSDateTime(kurs.start_datum, kurs.uhrzeit),
        dtend: addMinutesToICS(kurs.start_datum, kurs.uhrzeit, dauer),
        summary: `${basisName} · ${typLabel}${online}`,
        rrule: `FREQ=WEEKLY;COUNT=${kurs.termine || 1}`,
      });
    }
  }

  // Hessische Schulferien als Ganztagestermine (Enddatum ist exklusiv)
  for (const [start, end, name] of FERIEN) {
    events.push({
      uid: `ferien-${start}@bauch-baby-beckenboden`,
      allDay: true,
      dtstart: start.replace(/-/g, ""),
      dtend: plusDaysISO(end, 1),
      summary: `Hessen: ${name}`,
    });
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bauch Baby Beckenboden//Kursplan//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Bauch · Baby · Beckenboden Kurse",
    "X-WR-TIMEZONE:Europe/Berlin",
  ];

  events.forEach((e) => {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.uid}`);
    lines.push(`DTSTAMP:${nowStamp()}`);
    if (e.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${e.dtstart}`);
      lines.push(`DTEND;VALUE=DATE:${e.dtend}`);
      lines.push("TRANSP:TRANSPARENT");
    } else {
      lines.push(`DTSTART:${e.dtstart}`);
      lines.push(`DTEND:${e.dtend}`);
    }
    if (e.rrule) lines.push(`RRULE:${e.rrule}`);
    lines.push(foldLine(`SUMMARY:${escapeICS(e.summary)}`));
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
