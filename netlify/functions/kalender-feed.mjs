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

  for (const kurs of kurse || []) {
    const typLabel = COURSE_TYPE_LABELS[kurs.course_type] || kurs.course_type;
    const online = kurs.ist_online ? " (Online)" : "";
    const titel = `${kurs.name} · ${typLabel}${online}`;
    const dauer = kurs.dauer_min || 60;

    if (Array.isArray(kurs.termin_daten) && kurs.termin_daten.length > 0) {
      // Bevorzugter Fall: die echten Einzeltermine sind bekannt (aus der
      // Kursabfrage inkl. Pausenwochen) - ein Kalendereintrag pro Termin.
      kurs.termin_daten.forEach((datum, i) => {
        events.push({
          uid: `${kurs.id}-${datum}@bauch-baby-beckenboden`,
          dtstart: toICSDateTime(datum, kurs.uhrzeit),
          dtend: addMinutesToICS(datum, kurs.uhrzeit, dauer),
          summary: `${titel} (${i + 1}/${kurs.termine})`,
        });
      });
    } else if (kurs.start_datum) {
      // Fallback für manuell angelegte Kurse ohne Einzeltermin-Liste:
      // wöchentlich wiederkehrender Termin ab dem Start-Datum.
      events.push({
        uid: `${kurs.id}-serie@bauch-baby-beckenboden`,
        dtstart: toICSDateTime(kurs.start_datum, kurs.uhrzeit),
        dtend: addMinutesToICS(kurs.start_datum, kurs.uhrzeit, dauer),
        summary: titel,
        rrule: `FREQ=WEEKLY;COUNT=${kurs.termine || 1}`,
      });
    }
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
    lines.push(`DTSTART:${e.dtstart}`);
    lines.push(`DTEND:${e.dtend}`);
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
