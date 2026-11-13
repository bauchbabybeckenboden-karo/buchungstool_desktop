// Verschickt nach einer Buchung zwei E-Mails über Resend (Absender kontakt@wunderwerk-frau.de):
// 1. Bestätigung an die Teilnehmerin
// 2. Benachrichtigung an Karo (im Setmore-"Neue Teilnehmerin"-Stil) inkl. Visitenkarte zum Abspeichern
//
// SICHERHEIT (Stand 13.11.2026):
// - Die Funktion übernimmt aus dem Browser nur noch E-Mail-Adresse und Kurs-IDs.
//   Name, Adresse, Kursdaten, Gutschein und Preis werden serverseitig aus der
//   Datenbank geladen bzw. berechnet. So kann niemand über diese Funktion Mails
//   mit eigenem Inhalt an fremde Adressen verschicken.
// - Mails gehen nur raus, wenn es eine passende Buchung gibt, die höchstens
//   30 Minuten alt ist und noch keine Bestätigung bekommen hat
//   (Spalte buchungen.bestaetigung_gesendet_at). Jede Buchung also genau einmal.
// - Admin-Aktionen ("kombiBestaetigung", "nachsenden") nur mit gültigem
//   Admin-Login (Supabase-Token), geprüft hier auf dem Server.
//
// Netlify-Umgebungsvariablen (nie im Code):
//   RESEND_API_KEY            = API-Key des Resend-Accounts "Wunderwerk Frau"
//   ADMIN_LOGIN_EMAIL         = E-Mail, mit der Karo sich im Admin-Bereich anmeldet
//   VITE_SUPABASE_URL         = (vorhanden)
//   SUPABASE_SERVICE_ROLE_KEY = (vorhanden)

import { createClient } from "@supabase/supabase-js";
import { reduzierterPreis, effektiverGrundpreis, einzelPreis, kombiPreis } from "../../src/pricing.js";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ADMIN_LOGIN_EMAIL = (process.env.ADMIN_LOGIN_EMAIL || "").trim().toLowerCase();

const KONTAKT_EMAIL = "kontakt@wunderwerk-frau.de";
const FROM = `"Karo · Wunderwerk Frau" <${KONTAKT_EMAIL}>`;
// Benachrichtigungen an Karo selbst
const ADMIN_EMAIL = "kontakt@bauch-baby-beckenboden.com";

// Wie lange nach dem Speichern einer Buchung die Bestätigung noch über den
// öffentlichen Aufruf (Buchungsseite) ausgelöst werden darf.
const MAX_ALTER_MINUTEN = 30;

// Service-Role-Key NUR als Netlify-Umgebungsvariable, gelangt nie in den Browser.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : null;

// Feste Angaben für die Bestätigungsmail (aktuell für alle Kurse gleich).
const BANK = {
  kontoinhaber: "Karoline Hartwig",
  iban: "DE08 5009 0500 0005 5859 14",
  bic: "GENODEF1S12",
};
const FRAGEBOGEN_URL = "https://bauch-baby-beckenboden-weiterleitung.netlify.app";

// Karos Visitenkarte (Kontakt speichern, damit Mails nicht im Spam landen)
const VISITENKARTE_URL = "https://bauch-baby-beckenboden.de/wp-content/uploads/2026/11/karo_4.vcf";

// Gemeinsame Bausteine für alle Mails an Teilnehmerinnen (Wunderwerk Frau)
const VISITENKARTE_HTML = `
              <p style="margin:0 0 12px;font-size:14px;">PS: Speichere Dir bitte meine Visitenkarte, um sicherzustellen, dass nichts im Spam landet.</p>
              <p style="margin:0 0 24px;"><a href="${VISITENKARTE_URL}" style="display:inline-block;background:#8B6464;color:#F3E9E5;text-decoration:none;padding:10px 22px;border-radius:22px;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Kontakt speichern</a></p>`;

const SIGNATUR_HTML = `<p style="margin:0;">Ich freue mich doll!<br/>Deine Karo <span style="color:#C0392B;">&#9830;</span></p>`;

const FOOTER_HTML = `
            <div style="background:#8B6464;padding:22px 36px;color:#F3E9E5;text-align:center;line-height:1.6;">
              <div style="font-family:Georgia,serif;font-size:20px;letter-spacing:1px;">Wunderwerk Frau</div>
              <div style="width:140px;height:1px;background:#F3E9E5;margin:6px auto;"></div>
              <div style="font-size:11px;letter-spacing:3px;margin-bottom:10px;">BAUCH · BABY · BECKENBODEN</div>
              <a href="https://bauch-baby-beckenboden.de" style="color:#F3E9E5;font-size:12px;">bauch-baby-beckenboden.de</a>
            </div>`;

// Abo-Link für die Kurstermine der Teilnehmerin (Funktion kalender-feed):
// aktualisiert sich im Kalender automatisch, auch bei Ausfällen/Verschiebungen.
const SITE_URL = "https://bauch-baby-beckenboden-buchungen.netlify.app";
function kalenderBlockHtml(kursIds, nurEinzeln = false) {
  const ids = [...new Set((kursIds || []).filter(Boolean))];
  if (ids.length === 0) return "";
  const url = `${SITE_URL}/.netlify/functions/kalender-feed?${ids.map((id) => `kurs=${id}`).join("&")}${nurEinzeln ? "&nur=1" : ""}`;
  const webcal = url.replace(/^https?:/, "webcal:");
  return `
            <p style="margin:0 0 18px;font-size:14px;">
              📅 <strong>Deine Termine im Kalender:</strong>
              <a href="${webcal}" style="color:#8b6464;">Kurstermine abonnieren</a> (iPhone, Apple Kalender, Outlook). Die Termine aktualisieren sich automatisch, falls sich etwas ändert.<br/>
              <span style="font-size:12px;color:#8B6464;">Google Kalender: Link kopieren und unter „Weitere Kalender“ – „Per URL“ einfügen:<br/>${url}</span>
            </p>`;
}

const COURSE_TYPE_LABELS = {
  mamafit: "Mamafit",
  schwangerfit: "Schwangerfit",
  "somatic-yoga": "Somatic Yoga",
  "koerpermitte-beckenboden": "Körpermitte & Beckenboden",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(daten, status = 200) {
  return new Response(JSON.stringify(daten), { status, headers: { "Content-Type": "application/json" } });
}

// Prüft per Namensabgleich (Vor- + Nachname, ohne Groß-/Kleinschreibung und
// führende/folgende Leerzeichen), ob bereits eine Buchung in IRGENDEINEM
// ANDEREN Kurs existiert. Nur bei exakter Namensübereinstimmung ein Treffer -
// Tippfehler/Spitznamen führen zur manuellen Prüfung durch Karo, nie zu einer
// fälschlich automatisch bestätigten Buchung.
async function findeBereitsAngemeldet(vorname, nachname, ausschlussKursId) {
  const vornameTrim = (vorname || "").trim();
  const nachnameTrim = (nachname || "").trim();
  if (!vornameTrim || !nachnameTrim) return { geprueft: true, gefunden: false, kursLabel: null };

  let query = supabaseAdmin
    .from("buchungen")
    .select("kurs_id")
    .ilike("vorname", vornameTrim)
    .ilike("nachname", nachnameTrim)
    .limit(5);
  if (ausschlussKursId) query = query.neq("kurs_id", ausschlussKursId);
  const { data: treffer, error: buchungenError } = await query;
  if (buchungenError) return { geprueft: true, gefunden: false, kursLabel: null };

  const passenderTreffer = (treffer || [])[0];
  if (!passenderTreffer) return { geprueft: true, gefunden: false, kursLabel: null };

  const { data: passenderKurs } = await supabaseAdmin
    .from("kurse")
    .select("course_type")
    .eq("id", passenderTreffer.kurs_id)
    .maybeSingle();
  return {
    geprueft: true,
    gefunden: true,
    kursLabel: passenderKurs ? COURSE_TYPE_LABELS[passenderKurs.course_type] || passenderKurs.course_type : null,
  };
}

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const WOCHENTAGE_KURZ = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MONATE_KURZ = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function formatDatumKurz(isoDatum) {
  if (!isoDatum) return "";
  const d = new Date(isoDatum + "T00:00:00");
  return `${WOCHENTAGE_KURZ[d.getDay()]}. ${d.getDate()}. ${MONATE_KURZ[d.getMonth()]} ${d.getFullYear()}`;
}

function addMinutes(uhrzeit, minuten) {
  if (!uhrzeit) return "";
  const [h, m] = uhrzeit.split(":").map(Number);
  const total = h * 60 + m + Number(minuten || 0);
  const hh = String(Math.floor(total / 60) % 24).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Preise immer mit Komma und ggf. zwei Nachkommastellen (182 -> "182", 96.5 -> "96,50").
function formatPreis(preis) {
  const n = Number(preis);
  if (!Number.isFinite(n)) return "?";
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");
}

// vCard-TEXT-Werte (z.B. NOTE) müssen Backslash, Komma, Semikolon und
// Zeilenumbrüche escapen (RFC 6350).
function vCardEscapeText(str) {
  return String(str || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function vCard({ vorname, nachname, telefon, email, strasse, plz, ort, note }) {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${nachname};${vorname};;;`,
    `FN:${vorname} ${nachname}`,
    telefon ? `TEL;TYPE=CELL:${telefon}` : null,
    email ? `EMAIL:${email}` : null,
    strasse ? `ADR;TYPE=HOME:;;${strasse};${ort || ""};;${plz || ""};Deutschland` : null,
    note ? `NOTE:${vCardEscapeText(note)}` : null,
    "END:VCARD",
  ].filter(Boolean);
  return lines.join("\r\n");
}

// Geburtstermin/ET und Notfallkontakt in EINER Notiz im Kontakt der Teilnehmerin.
function kontaktNotizen(zusatz) {
  const zeilen = [];
  if (zusatz.et) zeilen.push(`Geburtstermin: ${formatDatumEinfach(zusatz.et)}`);
  if (zusatz.notfallName || zusatz.notfallTel) {
    zeilen.push(`Notfallkontakt: ${[zusatz.notfallName, zusatz.notfallTel].filter(Boolean).join(", ")}`);
  }
  return zeilen.length ? zeilen.join("\n") : null;
}
function formatDatumEinfach(isoDatum) {
  if (!isoDatum) return "";
  const [y, m, d] = String(isoDatum).split("-");
  return `${d}.${m}.${y}`;
}

// Emoji + Monat/Jahr vor den Nachnamen im Kontakt, damit Karo auf einen
// Blick sieht, aus welchem Kurs (und Durchlauf) eine Teilnehmerin kommt.
const KURS_KONTAKT_EMOJI = {
  mamafit: "👶🏼",
  schwangerfit: "🤰",
  "somatic-yoga": "🌿 🧘🏻‍♀️",
  "koerpermitte-beckenboden": "🌿♾️",
};
function formatMonatJahr(isoDatum) {
  if (!isoDatum) return "";
  const [y, m] = isoDatum.split("-");
  return `${m}/${y}`;
}
function kontaktNamePrefix(kurse) {
  return kurse
    .map((k) => {
      const emoji = KURS_KONTAKT_EMOJI[k.course_type];
      const monatJahr = formatMonatJahr(k.start_datum);
      return emoji && monatJahr ? `${emoji} ${monatJahr}` : null;
    })
    .filter(Boolean)
    .join(" ");
}

function base64(str) {
  return Buffer.from(str, "utf-8").toString("base64");
}

// Verschickt eine Mail über Resend. Wirft bei jedem Fehler (inkl. Antwort von
// Resend), damit nichts mehr stillschweigend verloren geht. Der
// Idempotency-Key verhindert, dass dieselbe Mail doppelt rausgeht, falls die
// Funktion zweimal ausgelöst wird.
async function sendMail({ to, subject, html, attachments, idempotencyKey }) {
  const headers = {
    Authorization: `Bearer ${RESEND_API_KEY}`,
    "Content-Type": "application/json",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers,
    body: JSON.stringify({
      from: FROM,
      to: [to],
      reply_to: KONTAKT_EMAIL,
      subject,
      html,
      attachments: (attachments || []).map((a) => ({ filename: a.filename, content: a.content })),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend ${res.status}: ${text}`);
  }
  return res.json();
}

// Prüft serverseitig, ob der Aufruf von Karo (eingeloggt im Admin-Bereich) kommt.
async function istAdmin(req) {
  if (!ADMIN_LOGIN_EMAIL) return false;
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return false;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user?.email) return false;
  return data.user.email.trim().toLowerCase() === ADMIN_LOGIN_EMAIL;
}

// Lädt die Kurse zu den Buchungszeilen (Reihenfolge wie die Zeilen).
async function ladeKurse(zeilen) {
  const ids = [...new Set(zeilen.map((z) => z.kurs_id))];
  const { data, error } = await supabaseAdmin.from("kurse").select("*").in("id", ids);
  if (error) throw new Error(`Kurse laden: ${error.message}`);
  const map = Object.fromEntries((data || []).map((k) => [k.id, k]));
  const kurse = zeilen.map((z) => map[z.kurs_id]);
  if (kurse.some((k) => !k)) throw new Error("Kurs zur Buchung nicht gefunden");
  return kurse;
}

// Ermittelt aus den Buchungszeilen (1 = Einzelkurs, 2 = Kombikurs oder
// Kurs-Paket) alles, was die Mails brauchen. Preise werden hier auf dem
// Server berechnet - genau wie auf der Buchungsseite (pricing.js).
// preisVorschlag: beim Einzelkurs der Preis von der Buchungsseite bzw. von
// Karo (Admin). Von der Buchungsseite wird er nur übernommen, wenn er einem
// der beiden möglichen Preise entspricht (normal oder "nur dieser Kurs").
async function bereiteBuchungAuf(zeilen, { preisVorschlag = null, preisVertrauen = false } = {}) {
  let kurse = await ladeKurse(zeilen);
  const erste = zeilen[0];
  const buchung = {
    vorname: (erste.vorname || "").trim(),
    nachname: (erste.nachname || "").trim(),
    email: (erste.email || "").trim(),
    telefon: (erste.telefon || "").trim(),
    strasse: (erste.strasse || "").trim(),
    plz: (erste.plz || "").trim(),
    ort: (erste.ort || "").trim(),
    zusatzfelder: erste.zusatzfelder || {},
  };
  const gutschein = erste.hat_gutschein
    ? { betrag: erste.gutschein_betrag, fotoUrl: erste.gutschein_foto_url || null }
    : null;

  if (zeilen.length === 2) {
    if (erste.paket_id) {
      const { data: paketRow } = await supabaseAdmin.from("kurs_pakete").select("*").eq("id", erste.paket_id).maybeSingle();
      if (!paketRow) throw new Error("Kurs-Paket nicht gefunden");
      const nachId = Object.fromEntries(kurse.map((k) => [k.id, k]));
      kurse = [nachId[paketRow.kurs_id_1], nachId[paketRow.kurs_id_2]].filter(Boolean);
      if (kurse.length !== 2) throw new Error("Kurse des Pakets passen nicht zur Buchung");
      const preis = reduzierterPreis(paketRow.preis, kurse[0], kurse[1]);
      return { art: "paket", buchung, gutschein, kurse, paket: { name: paketRow.name, bezeichnung: "Kurs-Paket", preis } };
    }
    kurse = [...kurse].sort((a, b) => (a.start_datum || "").localeCompare(b.start_datum || ""));
    const preis = reduzierterPreis(kombiPreis(kurse[0], kurse[1]), kurse[0], kurse[1]);
    return {
      art: "paket",
      buchung,
      gutschein,
      kurse,
      paket: { name: `${kurse[0].name} + ${kurse[1].name}`, bezeichnung: "Kombikurs", preis },
    };
  }

  const kurs = kurse[0];
  const normal = reduzierterPreis(effektiverGrundpreis(kurs), kurs);
  const solo = reduzierterPreis(einzelPreis(kurs), kurs);
  const vorschlag = preisVorschlag != null && preisVorschlag !== "" ? Number(preisVorschlag) : null;
  let preis = normal;
  if (vorschlag != null && Number.isFinite(vorschlag) && vorschlag >= 0) {
    if (preisVertrauen || vorschlag === normal || vorschlag === solo) preis = vorschlag;
  }
  return { art: "einzel", buchung, gutschein, kurse, kurs: { ...kurs, preis }, buchungId: erste.id };
}

// Baut und verschickt beide Mails. empfaenger: "beide" | "teilnehmerin" | "karo".
// Beide Mails werden unabhängig verschickt - scheitert eine, geht die andere
// trotzdem raus. Gibt zurück, was geklappt hat.
async function sendeBuchungsMails(daten, { empfaenger = "beide", schluessel }) {
  const { buchung, gutschein } = daten;
  const zusatz = buchung.zusatzfelder || {};
  const adresse = `${buchung.strasse}, ${buchung.plz} ${buchung.ort}`;

  const zeile = (label, value) =>
    value
      ? `<tr><td style="padding:4px 0;color:#8b93a1;font-size:12px;">${label}</td></tr><tr><td style="padding:0 0 12px 0;color:#111;font-size:14px;">${value}</td></tr>`
      : "";

  // Gutschein-Hinweis für Karo - identisch für Einzelkurs und Kombikurs/Paket.
  const gutscheinInfoHtml = gutschein
    ? `<div style="margin:16px 20px 0;padding:12px 14px;background:#fdf0d5;border:1px solid #e0c26a;border-radius:6px;font-size:13px;color:#6b4e1e;">🎟️ Gutschein angegeben: <strong>${escapeHtml(formatPreis(gutschein.betrag))} €</strong>${gutschein.fotoUrl ? ` – <a href="${escapeHtml(gutschein.fotoUrl)}" style="color:#6b4e1e;">Foto ansehen</a>` : " (kein Foto hochgeladen)"}</div>`
    : "";

  let teilnehmerin; // { subject, html }
  let admin; // { subject, html, attachments }

  if (daten.art === "paket") {
    const { kurse } = daten;
    const { name, bezeichnung } = daten.paket;
    const preis = formatPreis(daten.paket.preis);
    const verwendungszweck = `${buchung.vorname} ${buchung.nachname} – ${name}`;

    const kursBlockHtml = (k) => {
      const label = COURSE_TYPE_LABELS[k.course_type] || k.course_type;
      const uhrzeitEndeK = addMinutes(k.uhrzeit, k.dauer_min);
      const terminZeilenK =
        Array.isArray(k.termin_daten) && k.termin_daten.length > 0
          ? k.termin_daten.map((d) => formatDatumKurz(d)).join("<br/>")
          : [formatDatumKurz(k.start_datum), k.end_datum ? `bis ${formatDatumKurz(k.end_datum)}` : ""]
              .filter(Boolean)
              .join(" ");
      return `
          <p style="margin:0 0 4px;font-size:12px;color:#8b6464;font-weight:600;letter-spacing:1px;text-transform:uppercase;">${escapeHtml(label)}</p>
          <p style="margin:0 0 18px;font-size:14px;">
            ${terminZeilenK}<br/>
            ${k.uhrzeit ? `${k.uhrzeit}${uhrzeitEndeK ? " - " + uhrzeitEndeK : ""} Uhr<br/>` : ""}
          </p>`;
    };

    const html = `
        <div style="font-family:'Helvetica Neue',Arial,sans-serif;background:#F6EBE8;padding:32px 12px;">
          <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #F6EBE8;">
            <div style="background:linear-gradient(135deg,#8b6464,#8B6464);padding:32px 36px;color:#F6EBE8;">
              <p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#e3cfcf;">Deine Anmeldung im Überblick</p>
              <h1 style="margin:0;font-size:22px;font-weight:300;letter-spacing:.5px;">🌿 Liebe ${escapeHtml(buchung.vorname)},</h1>
            </div>
            <div style="padding:32px 36px;color:#3d2b2b;font-size:15px;line-height:1.8;font-weight:300;">
              <p style="margin:0 0 18px;">vielen Dank für Deine Anmeldung zum ${escapeHtml(bezeichnung)} <strong style="font-weight:600;">${escapeHtml(name)}</strong>!</p>

              <hr style="border:none;border-top:1px solid #F6EBE8;margin:24px 0;"/>

              <p style="margin:0 0 6px;font-size:12px;color:#8b6464;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Wie es weitergeht</p>
              <p style="margin:0 0 14px;">Nachdem Du die Kursgebühr von <strong>${preis} €</strong> auf folgendes Konto:</p>
              <table style="width:100%;font-size:13px;margin:0 0 18px;border-collapse:collapse;">
                <tr><td style="padding:2px 0;color:#8B6464;">Kontoinhaber</td><td style="padding:2px 0;text-align:right;">${BANK.kontoinhaber}</td></tr>
                <tr><td style="padding:2px 0;color:#8B6464;">IBAN</td><td style="padding:2px 0;text-align:right;">${BANK.iban}</td></tr>
                <tr><td style="padding:2px 0;color:#8B6464;">BIC</td><td style="padding:2px 0;text-align:right;">${BANK.bic}</td></tr>
                <tr><td style="padding:2px 0;color:#8B6464;">Verwendungszweck</td><td style="padding:2px 0;text-align:right;">${escapeHtml(verwendungszweck)}</td></tr>
              </table>
              <p style="margin:0 0 18px;">überwiesen hast, fülle bitte unbedingt <a href="${FRAGEBOGEN_URL}" style="color:#8b6464;">diesen Fragebogen</a> aus (einmal reicht für beide Kurse).</p>

              <p style="margin:0 0 18px;">Ca. 10 Tage vor Kursstart erhältst Du die Einladung zur WhatsApp-Gruppe (<a href="mailto:${KONTAKT_EMAIL}?subject=${encodeURIComponent("Ich nutze kein WhatsApp")}" style="color:#8b6464;">ich nutze kein WhatsApp</a>). Außerdem wirst Du wöchentlich daran erinnert, Dich in unser Teilnahmeformular einzutragen – das hilft, den Raum optimal vorzubereiten.</p>

              <p style="margin:0 0 6px;font-size:12px;color:#8b6464;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Deine Kurstermine</p>
              ${kurse.map(kursBlockHtml).join("")}
              ${kalenderBlockHtml(kurse.map((k) => k.id))}
              <p style="margin:0 0 18px;font-size:14px;">
                Gesamtpreis: ${preis} €<br/>
                <span style="font-size:12px;color:#8B6464;">Bitte beachte, dass es aufgrund von Krankheit o. Ä. zu Terminverschiebungen kommen kann.</span>
              </p>

              <p style="margin:0 0 24px;">💕 Solltest Du Fragen haben, melde Dich gern – die FAQ auf der Homepage beantwortet ggf. ebenfalls die ein- oder andere Frage! Vielen Dank für Dein Vertrauen 💕</p>

              ${SIGNATUR_HTML}
              <div style="height:24px;"></div>
              ${VISITENKARTE_HTML}
            </div>
            ${FOOTER_HTML}
          </div>
        </div>`;
    teilnehmerin = { subject: `Deine Anmeldung: ${name}`, html };

    let notfallHtml = "";
    if (kurse.some((k) => k.course_type === "schwangerfit") && (zusatz.notfallName || zusatz.notfallTel)) {
      notfallHtml =
        zeile("Notfallkontakt", escapeHtml(zusatz.notfallName || "")) +
        zeile("Notfallkontakt Telefon", `<a href="tel:${escapeHtml(zusatz.notfallTel || "")}">${escapeHtml(zusatz.notfallTel || "")}</a>`);
    }

    const wannTextPaket = kurse
      .map((k) => {
        const label = COURSE_TYPE_LABELS[k.course_type] || k.course_type;
        const terminZeilenK =
          Array.isArray(k.termin_daten) && k.termin_daten.length > 0
            ? k.termin_daten.map((d) => formatDatumKurz(d)).join("<br/>")
            : formatDatumKurz(k.start_datum);
        return `<strong>${escapeHtml(label)}</strong><br/>${terminZeilenK}`;
      })
      .join("<br/><br/>");

    const adminHtml = `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:white;border:1px solid #eee;">
          <div style="padding:20px 20px 0 20px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="display:inline-block;width:28px;height:28px;border-radius:50%;background:#f0d9d9;"></span>
              <strong style="font-size:15px;">Bauch Baby Beckenboden</strong>
            </div>
            <h2 style="margin:20px 0 16px 0;font-size:20px;">Neue Teilnehmerin (${escapeHtml(bezeichnung)})</h2>
          </div>
          ${gutscheinInfoHtml}
          <table style="width:100%;padding:0 20px;border-collapse:collapse;">
            ${zeile(escapeHtml(bezeichnung), escapeHtml(name))}
            ${zeile("Wann", wannTextPaket)}
            ${zeile("Preis", `${preis} €`)}
            ${zeile("Mit", "Karoline Hartwig")}
          </table>
          <hr style="border:none;border-top:1px solid #eee;margin:8px 20px;"/>
          <table style="width:100%;padding:0 20px 20px 20px;border-collapse:collapse;">
            ${zeile("Kunde", escapeHtml(buchung.vorname + " " + buchung.nachname))}
            ${zeile("E-Mail", `<a href="mailto:${escapeHtml(buchung.email)}">${escapeHtml(buchung.email)}</a>`)}
            ${zeile("Telefon", `<a href="tel:${escapeHtml(buchung.telefon)}">${escapeHtml(buchung.telefon)}</a>`)}
            ${zeile("Adresse", escapeHtml(adresse))}
            ${notfallHtml}
          </table>
        </div>`;

    const namePrefix = kontaktNamePrefix(kurse);
    admin = {
      subject: `${buchung.vorname} ${buchung.nachname} ${bezeichnung} ${name}`,
      html: adminHtml,
      attachments: [
        {
          filename: `${buchung.vorname}-${buchung.nachname}.vcf`,
          content: base64(
            vCard({
              vorname: buchung.vorname,
              nachname: namePrefix ? `${namePrefix} ${buchung.nachname}` : buchung.nachname,
              telefon: buchung.telefon,
              email: buchung.email,
              strasse: buchung.strasse,
              plz: buchung.plz,
              ort: buchung.ort,
              note: kontaktNotizen(zusatz),
            })
          ),
        },
      ],
    };
  } else {
    const { kurs } = daten;
    const preis = formatPreis(kurs.preis);
    const courseTypeLabel = COURSE_TYPE_LABELS[kurs.course_type] || kurs.course_type;
    const kursBezeichnung = `${courseTypeLabel} ${kurs.termine} Termine`;

    // "Ich buche zusätzlich zu einem laufenden Kurs" (Kombi-Wunsch). Der
    // vorgesehene Preis steht in der Buchung (kombiPreisGeschaetzt).
    // Automatisch ENDGÜLTIG bestätigt wird er nur, wenn sich der Name in einer
    // anderen bestehenden Buchung findet - sonst prüft Karo von Hand.
    const kombiPreisGeschaetzt =
      zusatz.kombiWunsch && zusatz.kombiPreisGeschaetzt != null ? formatPreis(zusatz.kombiPreisGeschaetzt) : null;
    const kombiCheck = zusatz.kombiWunsch ? await findeBereitsAngemeldet(buchung.vorname, buchung.nachname, kurs.id) : null;
    if (zusatz.kombiWunsch && daten.buchungId) {
      // Ergebnis dauerhaft in der Buchung speichern (best effort).
      await supabaseAdmin
        .from("buchungen")
        .update({ kombi_wunsch_bestaetigt: Boolean(kombiCheck?.gefunden) })
        .eq("id", daten.buchungId)
        .is("kombi_wunsch_bestaetigt", null);
    }

    const uhrzeitEnde = addMinutes(kurs.uhrzeit, kurs.dauer_min);
    const wochentagLang = kurs.start_datum ? WOCHENTAGE[new Date(kurs.start_datum + "T00:00:00").getDay()] : "";

    // Wenn die echten Einzeltermine bekannt sind, diese exakt auflisten.
    const wannText =
      Array.isArray(kurs.termin_daten) && kurs.termin_daten.length > 0
        ? kurs.termin_daten.map((d) => formatDatumKurz(d)).join("<br/>")
        : `${formatDatumKurz(kurs.start_datum)}<br/>Jeder Woche am ${wochentagLang} für ${kurs.termine} Mal`;

    const terminZeilen =
      Array.isArray(kurs.termin_daten) && kurs.termin_daten.length > 0
        ? kurs.termin_daten.map((d) => formatDatumKurz(d)).join("<br/>")
        : [formatDatumKurz(kurs.start_datum), kurs.end_datum ? `bis ${formatDatumKurz(kurs.end_datum)}` : ""]
            .filter(Boolean)
            .join(" ");
    const verwendungszweck = `${buchung.vorname} ${buchung.nachname} – ${kursBezeichnung}`;

    const html = `
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;background:#F6EBE8;padding:32px 12px;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #F6EBE8;">
          <div style="background:linear-gradient(135deg,#8b6464,#8B6464);padding:32px 36px;color:#F6EBE8;">
            <p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#e3cfcf;">Deine Anmeldung im Überblick</p>
            <h1 style="margin:0;font-size:22px;font-weight:300;letter-spacing:.5px;">🌿 Liebe ${escapeHtml(buchung.vorname)},</h1>
          </div>
          <div style="padding:32px 36px;color:#3d2b2b;font-size:15px;line-height:1.8;font-weight:300;">
            <p style="margin:0 0 18px;">vielen Dank für Deine Anmeldung zu <strong style="font-weight:600;">${escapeHtml(courseTypeLabel)}</strong>!</p>

            <hr style="border:none;border-top:1px solid #F6EBE8;margin:24px 0;"/>

            <p style="margin:0 0 6px;font-size:12px;color:#8b6464;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Wie es weitergeht</p>
            <p style="margin:0 0 14px;">Nachdem Du die Kursgebühr von <strong>${preis} €</strong> auf folgendes Konto:</p>
            <table style="width:100%;font-size:13px;margin:0 0 18px;border-collapse:collapse;">
              <tr><td style="padding:2px 0;color:#8B6464;">Kontoinhaber</td><td style="padding:2px 0;text-align:right;">${BANK.kontoinhaber}</td></tr>
              <tr><td style="padding:2px 0;color:#8B6464;">IBAN</td><td style="padding:2px 0;text-align:right;">${BANK.iban}</td></tr>
              <tr><td style="padding:2px 0;color:#8B6464;">BIC</td><td style="padding:2px 0;text-align:right;">${BANK.bic}</td></tr>
              <tr><td style="padding:2px 0;color:#8B6464;">Verwendungszweck</td><td style="padding:2px 0;text-align:right;">${escapeHtml(verwendungszweck)}</td></tr>
            </table>
            <p style="margin:0 0 18px;">überwiesen hast, fülle bitte unbedingt <a href="${FRAGEBOGEN_URL}" style="color:#8b6464;">diesen Fragebogen</a> aus.</p>

            <p style="margin:0 0 18px;">Ca. 10 Tage vor Kursstart erhältst Du die Einladung zur WhatsApp-Gruppe (<a href="mailto:${KONTAKT_EMAIL}?subject=${encodeURIComponent("Ich nutze kein WhatsApp")}" style="color:#8b6464;">ich nutze kein WhatsApp</a>). Außerdem wirst Du wöchentlich daran erinnert, Dich in unser Teilnahmeformular einzutragen – das hilft, den Raum optimal vorzubereiten.</p>

            <p style="margin:0 0 6px;font-size:12px;color:#8b6464;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Deine Kurstermine</p>
            <p style="margin:0 0 18px;font-size:14px;">
              ${terminZeilen}<br/>
              ${kurs.uhrzeit ? `${kurs.uhrzeit}${uhrzeitEnde ? " - " + uhrzeitEnde : ""} Uhr<br/>` : ""}
              Preis: ${preis} €<br/>
              <span style="font-size:12px;color:#8B6464;">Bitte beachte, dass es aufgrund von Krankheit o. Ä. zu Terminverschiebungen kommen kann.</span>
            </p>
            ${kalenderBlockHtml([kurs.id], true)}

            ${
              zusatz.kombiWunsch
                ? `<p style="margin:0 0 18px;background:#F6EBE8;border-radius:8px;padding:12px 16px;font-size:14px;">Du hast angegeben, zu einem anderen Kurs bei Wunderwerk Frau angemeldet zu sein, der im gleichen Zeitraum läuft, und diesen Kurs zusätzlich zu buchen. ${
                    kombiCheck?.gefunden
                      ? `Ich konnte Deine Anmeldung${kombiCheck.kursLabel ? ` bei <strong>${escapeHtml(kombiCheck.kursLabel)}</strong>` : ""} bestätigen – Dein Preis für diesen Zusatzkurs ist damit final: <strong>${kombiPreisGeschaetzt ?? preis} €</strong> statt ${preis} €. Du kannst direkt überweisen.`
                      : `Ich konnte das noch nicht automatisch bestätigen und prüfe das von Hand – Dein voraussichtlicher Preis liegt bei <strong>${kombiPreisGeschaetzt ?? preis} €</strong> statt ${preis} €. Bitte überweise noch nicht, ich melde mich bei Dir, sobald ich es geprüft habe.`
                  }</p>`
                : ""
            }

            <p style="margin:0 0 24px;">💕 Solltest Du Fragen haben, melde Dich gern – die FAQ auf der Homepage beantwortet ggf. ebenfalls die ein- oder andere Frage! Vielen Dank für Dein Vertrauen 💕</p>

            ${SIGNATUR_HTML}
            <div style="height:24px;"></div>
            ${VISITENKARTE_HTML}
          </div>
          ${FOOTER_HTML}
        </div>
      </div>`;
    teilnehmerin = { subject: `Deine Anmeldung: ${kursBezeichnung}`, html };

    let notfallHtml = "";
    if (kurs.course_type === "schwangerfit" && (zusatz.notfallName || zusatz.notfallTel)) {
      notfallHtml =
        zeile("Notfallkontakt", escapeHtml(zusatz.notfallName || "")) +
        zeile("Notfallkontakt Telefon", `<a href="tel:${escapeHtml(zusatz.notfallTel || "")}">${escapeHtml(zusatz.notfallTel || "")}</a>`);
    }

    const kombiWunschInfoHtml = zusatz.kombiWunsch
      ? kombiCheck?.gefunden
        ? `<div style="margin:16px 20px 0;padding:12px 14px;background:#e6f2e9;border:1px solid #a9d4b5;border-radius:6px;font-size:13px;color:#2f5c3d;">✅ Kombi-Wunsch automatisch bestätigt: Name wurde in einer Buchung${kombiCheck.kursLabel ? ` von <strong>${escapeHtml(kombiCheck.kursLabel)}</strong>` : ""} gefunden. Preis für den Zusatzkurs (10 € Rabatt bereits eingerechnet): <strong>${kombiPreisGeschaetzt ?? "?"} €</strong>. Keine weitere Prüfung nötig, Teilnehmerin wurde bereits informiert.</div>`
        : `<div style="margin:16px 20px 0;padding:12px 14px;background:#fdf0d5;border:2px solid #e05d5d;border-radius:6px;font-size:13px;color:#6b1e1e;">❗ Kombi-Wunsch NICHT automatisch bestätigt: Der Name wurde in keiner anderen bestehenden Buchung gefunden. Bitte manuell prüfen (Tippfehler? anderer Name? tatsächlich nicht angemeldet?) und der Teilnehmerin Bescheid geben. Vorgesehener Preis: <strong>${kombiPreisGeschaetzt ?? "?"} €</strong>.</div>`
      : "";

    const adminHtml = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:white;border:1px solid #eee;">
        <div style="padding:20px 20px 0 20px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="display:inline-block;width:28px;height:28px;border-radius:50%;background:#f0d9d9;"></span>
            <strong style="font-size:15px;">Bauch Baby Beckenboden</strong>
          </div>
          <h2 style="margin:20px 0 16px 0;font-size:20px;">Neue Teilnehmerin</h2>
        </div>
        ${kombiWunschInfoHtml}
        ${gutscheinInfoHtml}
        <table style="width:100%;padding:0 20px;border-collapse:collapse;">
          ${zeile("Was", `${formatDatumKurz(kurs.start_datum)} ${escapeHtml(kursBezeichnung)}`)}
          ${zeile("Wann", wannText)}
          ${zeile("Uhrzeit", kurs.uhrzeit ? `${kurs.uhrzeit} - ${uhrzeitEnde}` : "")}
          ${zeile("Preis", `${preis} €`)}
          ${zeile("Mit", "Karoline Hartwig")}
        </table>
        <hr style="border:none;border-top:1px solid #eee;margin:8px 20px;"/>
        <table style="width:100%;padding:0 20px 20px 20px;border-collapse:collapse;">
          ${zeile("Kunde", escapeHtml(buchung.vorname + " " + buchung.nachname))}
          ${zeile("E-Mail", `<a href="mailto:${escapeHtml(buchung.email)}">${escapeHtml(buchung.email)}</a>`)}
          ${zeile("Telefon", `<a href="tel:${escapeHtml(buchung.telefon)}">${escapeHtml(buchung.telefon)}</a>`)}
          ${zeile("Adresse", escapeHtml(adresse))}
          ${notfallHtml}
        </table>
      </div>`;

    const namePrefix = kontaktNamePrefix([kurs]);
    admin = {
      subject: `${
        zusatz.kombiWunsch ? (kombiCheck?.gefunden ? "✅ Kombi-Wunsch bestätigt: " : "❗ Kombi-Wunsch prüfen: ") : ""
      }${buchung.vorname} ${buchung.nachname} Kurstermin ${kursBezeichnung}`,
      html: adminHtml,
      attachments: [
        {
          filename: `${buchung.vorname}-${buchung.nachname}.vcf`,
          content: base64(
            vCard({
              vorname: buchung.vorname,
              nachname: namePrefix ? `${namePrefix} ${buchung.nachname}` : buchung.nachname,
              telefon: buchung.telefon,
              email: buchung.email,
              strasse: buchung.strasse,
              plz: buchung.plz,
              ort: buchung.ort,
              note: kontaktNotizen(zusatz),
            })
          ),
        },
      ],
    };
  }

  const auftraege = [];
  if (empfaenger !== "karo") {
    auftraege.push(
      sendMail({ to: buchung.email, ...teilnehmerin, idempotencyKey: schluessel ? `${schluessel}-teilnehmerin` : undefined }).then(
        () => "teilnehmerin"
      )
    );
  }
  if (empfaenger !== "teilnehmerin") {
    auftraege.push(
      sendMail({ to: ADMIN_EMAIL, ...admin, idempotencyKey: schluessel ? `${schluessel}-karo` : undefined }).then(() => "karo")
    );
  }
  const ergebnisse = await Promise.allSettled(auftraege);
  const gesendet = ergebnisse.filter((e) => e.status === "fulfilled").map((e) => e.value);
  const fehler = ergebnisse.filter((e) => e.status === "rejected").map((e) => String(e.reason?.message || e.reason));
  fehler.forEach((f) => console.error("[send-booking-emails] Versand fehlgeschlagen:", f));
  return { gesendet, fehler };
}

// Alle Zeilen, die zu derselben Anmeldung gehören wie die angegebene Buchung
// (Kombikurs über zusatzfelder.kombiGruppe, Paket über paket_id).
async function ladeAnmeldung(buchungId) {
  const { data: zeile } = await supabaseAdmin.from("buchungen").select("*").eq("id", buchungId).maybeSingle();
  if (!zeile) return null;
  const gruppe = zeile.zusatzfelder?.kombiGruppe;
  let query = null;
  if (gruppe) {
    query = supabaseAdmin.from("buchungen").select("*").eq("zusatzfelder->>kombiGruppe", gruppe);
  } else if (zeile.paket_id) {
    query = supabaseAdmin
      .from("buchungen")
      .select("*")
      .eq("paket_id", zeile.paket_id)
      .eq("email", zeile.email)
      .eq("created_at", zeile.created_at);
  }
  if (!query) return [zeile];
  const { data: zeilen } = await query.order("created_at", { ascending: true });
  return zeilen && zeilen.length > 0 ? zeilen.slice(0, 2) : [zeile];
}

// Wird aufgerufen, wenn Karo im Admin-Bereich einen Kombi-Wunsch nachträglich
// manuell bestätigt (Button "manuell bestätigen" in CourseCard.jsx).
async function sendeKombiBestaetigungsMail(buchungId) {
  const { data: buchung, error: buchungError } = await supabaseAdmin
    .from("buchungen")
    .select("*")
    .eq("id", buchungId)
    .maybeSingle();
  if (buchungError || !buchung) return json({ error: "Buchung nicht gefunden" }, 404);
  if (buchung.kombi_wunsch_bestaetigt !== true) return json({ error: "Kombi-Wunsch ist nicht bestätigt" }, 409);

  const { data: kurs } = await supabaseAdmin.from("kurse").select("*").eq("id", buchung.kurs_id).maybeSingle();
  const courseTypeLabel = kurs ? COURSE_TYPE_LABELS[kurs.course_type] || kurs.course_type : "";
  const preis = formatPreis(buchung.zusatzfelder?.kombiPreisGeschaetzt ?? kurs?.preis);

  await sendMail({
    to: buchung.email.trim(),
    subject: `Bestätigt: Dein Zusatzkurs${courseTypeLabel ? ` ${courseTypeLabel}` : ""}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px 20px;color:#333;">
        <p>Liebe ${escapeHtml((buchung.vorname || "").trim())},</p>
        <p>ich konnte Deinen Kombi-Wunsch jetzt bestätigen! Dein Preis für den Zusatzkurs${courseTypeLabel ? ` (${escapeHtml(courseTypeLabel)})` : ""} ist damit final: <strong>${preis} €</strong>. Du kannst jetzt gerne überweisen.</p>
        ${SIGNATUR_HTML}
        <p style="margin:16px 0 0;font-size:12px;color:#8B6464;">Wunderwerk Frau · Bauch · Baby · Beckenboden</p>
      </div>`,
    idempotencyKey: `kombi-bestaetigt-${buchung.id}`,
  });

  return json({ ok: true });
}

export default async (req) => {
  if (req.method !== "POST") return new Response("POST erwartet", { status: 405 });
  if (!RESEND_API_KEY || !supabaseAdmin) {
    console.error("[send-booking-emails] RESEND_API_KEY oder Supabase-Zugang fehlt");
    return json({ error: "Mailversand nicht eingerichtet" }, 500);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Ungültige Anfrage" }, 400);
  }

  try {
    // --- Admin-Aktionen: nur mit gültigem Login von Karo ---
    if (body?.action === "kombiBestaetigung" || body?.action === "nachsenden") {
      if (!(await istAdmin(req))) return json({ error: "Nicht erlaubt" }, 403);
      if (!UUID_RE.test(String(body.buchungId || ""))) return json({ error: "Ungültige Buchung" }, 400);

      if (body.action === "kombiBestaetigung") return await sendeKombiBestaetigungsMail(body.buchungId);

      // Bestätigung nachträglich (erneut) verschicken, z.B. wenn der Versand
      // beim Buchen gescheitert ist. empfaenger: "beide" (Standard),
      // "teilnehmerin" oder "karo". preis: optional, nur bei Einzelkursen.
      const zeilen = await ladeAnmeldung(body.buchungId);
      if (!zeilen) return json({ error: "Buchung nicht gefunden" }, 404);
      const empfaenger = ["beide", "teilnehmerin", "karo"].includes(body.empfaenger) ? body.empfaenger : "beide";
      const daten = await bereiteBuchungAuf(zeilen, { preisVorschlag: body.preis ?? null, preisVertrauen: true });
      const ergebnis = await sendeBuchungsMails(daten, { empfaenger });
      if (ergebnis.gesendet.length > 0) {
        await supabaseAdmin
          .from("buchungen")
          .update({ bestaetigung_gesendet_at: new Date().toISOString() })
          .in("id", zeilen.map((z) => z.id))
          .is("bestaetigung_gesendet_at", null);
      }
      return json({ ok: ergebnis.fehler.length === 0, ...ergebnis }, ergebnis.fehler.length === 0 ? 200 : 502);
    }

    // --- Öffentlicher Aufruf direkt nach der Buchung (Booking.jsx) ---
    // Aus dem Browser werden nur E-Mail-Adresse und Kurs-IDs verwendet.
    const email = typeof body?.buchung?.email === "string" ? body.buchung.email : "";
    const kursIds = body?.paket ? (body.paket.kurse || []).map((k) => k?.id) : [body?.kurs?.id];
    if (!email || email.length > 320) return json({ error: "Ungültige Anfrage" }, 400);
    if (kursIds.length < 1 || kursIds.length > 2 || !kursIds.every((id) => UUID_RE.test(String(id || "")))) {
      return json({ error: "Ungültige Anfrage" }, 400);
    }

    const seit = new Date(Date.now() - MAX_ALTER_MINUTEN * 60 * 1000).toISOString();
    const { data: kandidaten, error: suchFehler } = await supabaseAdmin
      .from("buchungen")
      .select("*")
      .eq("email", email)
      .in("kurs_id", kursIds)
      .gte("created_at", seit)
      .is("bestaetigung_gesendet_at", null)
      .order("created_at", { ascending: false });
    if (suchFehler) throw new Error(`Buchung suchen: ${suchFehler.message}`);

    // Je Kurs die neueste passende Zeile; bei zwei Kursen müssen beide aus
    // EINER Anmeldung stammen (gleicher Zeitstempel, ein gemeinsamer Insert).
    const zeilen = kursIds.map((id) => (kandidaten || []).find((z) => z.kurs_id === id));
    if (zeilen.some((z) => !z)) return json({ error: "Keine passende Buchung" }, 404);
    if (zeilen.length === 2 && zeilen[0].created_at !== zeilen[1].created_at) {
      return json({ error: "Keine passende Buchung" }, 404);
    }

    // Buchung als "Bestätigung verschickt" markieren, BEVOR versendet wird -
    // so kann ein zweiter Aufruf nicht doppelt verschicken.
    const ids = zeilen.map((z) => z.id);
    const { data: markiert, error: markierFehler } = await supabaseAdmin
      .from("buchungen")
      .update({ bestaetigung_gesendet_at: new Date().toISOString() })
      .in("id", ids)
      .is("bestaetigung_gesendet_at", null)
      .select("id");
    if (markierFehler) throw new Error(`Buchung markieren: ${markierFehler.message}`);
    if ((markiert || []).length !== ids.length) return json({ error: "Bereits verschickt" }, 409);

    const preisVorschlag = body?.paket ? null : body?.kurs?.preis ?? null;
    const daten = await bereiteBuchungAuf(zeilen, { preisVorschlag, preisVertrauen: false });
    const ergebnis = await sendeBuchungsMails(daten, { empfaenger: "beide", schluessel: `buchung-${ids.join("-")}` });

    // Ging gar nichts raus, Markierung zurücksetzen - dann taucht die Buchung
    // als "ohne Bestätigung" auf und kann von Karo nachgesendet werden.
    if (ergebnis.gesendet.length === 0) {
      await supabaseAdmin.from("buchungen").update({ bestaetigung_gesendet_at: null }).in("id", ids);
    }
    return json({ ok: ergebnis.fehler.length === 0 }, ergebnis.fehler.length === 0 ? 200 : 502);
  } catch (e) {
    console.error("[send-booking-emails] Fehler:", e);
    return json({ error: "Interner Fehler" }, 500);
  }
};

export const config = { path: "/.netlify/functions/send-booking-emails" };
