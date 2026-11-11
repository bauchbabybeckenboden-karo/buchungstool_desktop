// Verschickt nach einer Buchung zwei E-Mails über iCloud+ (kontakt@wunderwerk-frau.de):
// 1. Bestätigung an die Teilnehmerin
// 2. Benachrichtigung an Karo (im Setmore-"Neue Teilnehmerin"-Stil) inkl. Visitenkarte(n) zum Abspeichern

import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

// Versand über iCloud+ (eigene Domain wunderwerk-frau.de).
// Zugangsdaten NUR als Netlify-Umgebungsvariablen, nie im Code:
//   ICLOUD_SMTP_USER = Apple-ID-Mailadresse (Haupt-iCloud-Adresse)
//   ICLOUD_SMTP_PASS = app-spezifisches Passwort (account.apple.com)
const ICLOUD_SMTP_USER = process.env.ICLOUD_SMTP_USER;
const ICLOUD_SMTP_PASS = process.env.ICLOUD_SMTP_PASS;
const transporter =
  ICLOUD_SMTP_USER && ICLOUD_SMTP_PASS
    ? nodemailer.createTransport({
        host: "smtp.mail.me.com",
        port: 587,
        secure: false,
        requireTLS: true,
        auth: { user: ICLOUD_SMTP_USER, pass: ICLOUD_SMTP_PASS },
      })
    : null;

const KONTAKT_EMAIL = "kontakt@wunderwerk-frau.de";
const FROM = `"Karo · Wunderwerk Frau" <${KONTAKT_EMAIL}>`;
// Benachrichtigungen an Karo selbst
const ADMIN_EMAIL = "kontakt@bauch-baby-beckenboden.com";

// Für den Kombi-Wunsch-Namensabgleich (siehe findeBereitsAngemeldet unten)
// braucht es Lesezugriff auf "buchungen" - der öffentliche anon-Key darf das
// aus Datenschutzgründen nicht (siehe Booking.jsx). Deshalb hier bewusst der
// SUPABASE_SERVICE_ROLE_KEY, der NUR als Netlify-Umgebungsvariable existiert
// und niemals ins Frontend/den Browser gelangt (anders als die VITE_*-Werte).
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null;

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

// Prüft per Namensabgleich (Vor- + Nachname, ohne Groß-/Kleinschreibung und
// führende/folgende Leerzeichen), ob bereits eine Buchung in IRGENDEINEM
// ANDEREN Kurs existiert (ausschlussKursId schließt nur den gerade neu
// gebuchten Kurs selbst aus, damit ein Treffer nicht fälschlich die eigene,
// soeben erst angelegte Buchung findet) - das ist die einzige Grundlage, auf
// der der "Kombi-Wunsch" automatisch bestätigt wird (statt dass Karo jede
// Anfrage von Hand mit ihren Kurslisten abgleichen muss). Ein Treffer wird
// bewusst nur bei exakter Namensübereinstimmung gewertet - Tippfehler/
// Spitznamen führen zu "nicht gefunden" und damit zur manuellen Prüfung durch
// Karo, nie zu einer fälschlich automatisch bestätigten Buchung.
//
// Ursprünglich nur auf die Kursarten "somatic-yoga"/"mamafit" beschränkt
// (galt nur für Körpermitte-Kombis) - jetzt bewusst kursartübergreifend, denn
// "ich bin schon woanders angemeldet" gilt genauso für zwei Kurse DERSELBEN
// Art (z.B. schon donnerstags Schwangerfit, jetzt zusätzlich montags).
async function findeBereitsAngemeldet(vorname, nachname, ausschlussKursId) {
  if (!supabaseAdmin) return { geprueft: false, gefunden: false, kursLabel: null };

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

// Schreibt das Ergebnis der automatischen Kombi-Wunsch-Pruefung dauerhaft in
// die Buchung zurueck (Spalte kombi_wunsch_bestaetigt) - sonst stuende das
// Ergebnis NUR einmalig in dieser Admin-Mail und waere danach nirgends mehr
// nachvollziehbar (Karo-Frage: "woher weiss meine HP, dass ich das akzeptiert
// habe"). Der Insert der Buchung selbst passiert VORHER im Browser (anon-Key,
// siehe Booking.jsx) - hier wird die frisch angelegte Zeile per
// kurs_id+vorname+nachname+email wiedergefunden (neueste zuerst, falls
// dieselbe Person zufaellig mehrfach im selben Kurs steht) und aktualisiert.
// Best-effort: schlaegt das UPDATE fehl, bleibt die Mail trotzdem die
// verlaessliche Quelle fuer diese eine Buchung, es wird nur kein Fehler nach
// aussen geworfen.
async function speichereKombiBestaetigung(kursId, vorname, nachname, email, bestaetigt) {
  if (!supabaseAdmin) return;
  const { data: zeilen } = await supabaseAdmin
    .from("buchungen")
    .select("id")
    .eq("kurs_id", kursId)
    .ilike("vorname", (vorname || "").trim())
    .ilike("nachname", (nachname || "").trim())
    .ilike("email", (email || "").trim())
    .order("created_at", { ascending: false })
    .limit(1);
  const zeile = (zeilen || [])[0];
  if (!zeile) return;
  await supabaseAdmin.from("buchungen").update({ kombi_wunsch_bestaetigt: bestaetigt }).eq("id", zeile.id);
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
  return String(str || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// vCard-TEXT-Werte (z.B. NOTE) müssen Backslash, Komma, Semikolon und
// Zeilenumbrüche escapen (RFC 6350) - sonst werden mehrzeilige Notizen beim
// Import in die Kontakte-App abgeschnitten oder falsch dargestellt.
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

// Fasst Geburtstermin/ET und Notfallkontakt in EINER Notiz für den
// Kontakt-Eintrag zusammen, statt (wie bisher beim Notfallkontakt) einen
// zweiten, separaten Kontakt anzulegen - so bleibt alles an einer Stelle,
// direkt im Kontakt der Teilnehmerin.
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
  const [y, m, d] = isoDatum.split("-");
  return `${d}.${m}.${y}`;
}

// Emoji + Monat/Jahr vor den Nachnamen im Kontakt, damit Karo auf einen
// Blick sieht, aus welchem Kurs (und Durchlauf) eine Teilnehmerin kommt,
// ohne den Kontakt extra öffnen zu müssen.
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

// Verschickt eine Mail über iCloud+. Anhänge kommen als Base64 (wie bisher).
async function sendMail({ from, to, subject, html, attachments }) {
  return transporter.sendMail({
    from,
    to,
    replyTo: KONTAKT_EMAIL,
    subject,
    html,
    attachments: (attachments || []).map((a) => ({
      filename: a.filename,
      content: a.content,
      encoding: "base64",
      contentType: a.filename.endsWith(".vcf") ? "text/vcard" : undefined,
    })),
  });
}

// Wird aufgerufen, wenn Karo im Admin-Bereich einen Kombi-Wunsch nachträglich
// manuell bestätigt (Button "manuell bestätigen" in CourseCard.jsx) - die
// automatische Prüfung beim Buchungseingang hat dann keinen Treffer gefunden,
// die Teilnehmerin wartet also noch auf die finale Bestätigung ("ich melde
// mich, sobald ich es geprüft habe", siehe Bestätigungsmail beim Buchen).
// Ohne diese Mail würde die manuelle Bestätigung NUR in der Admin-Ansicht
// landen - die Teilnehmerin selbst würde nie davon erfahren (Karo-Frage:
// "wie bekommen alle die Info, dass es ok ist").
async function sendeKombiBestaetigungsMail(buchungId) {
  if (!supabaseAdmin) return new Response(JSON.stringify({ error: "kein Admin-Zugriff konfiguriert" }), { status: 500 });

  const { data: buchung, error: buchungError } = await supabaseAdmin
    .from("buchungen")
    .select("*")
    .eq("id", buchungId)
    .maybeSingle();
  if (buchungError || !buchung) {
    return new Response(JSON.stringify({ error: "Buchung nicht gefunden" }), { status: 404 });
  }

  const { data: kurs } = await supabaseAdmin.from("kurse").select("*").eq("id", buchung.kurs_id).maybeSingle();
  const courseTypeLabel = kurs ? COURSE_TYPE_LABELS[kurs.course_type] || kurs.course_type : "";
  const preis = buchung.zusatzfelder?.kombiPreisGeschaetzt ?? kurs?.preis ?? "?";

  await sendMail({
    from: FROM,
    to: buchung.email,
    subject: `Bestätigt: Dein Zusatzkurs${courseTypeLabel ? ` ${courseTypeLabel}` : ""}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px 20px;color:#333;">
        <p>Liebe ${escapeHtml(buchung.vorname || "")},</p>
        <p>ich konnte Deinen Kombi-Wunsch jetzt bestätigen! Dein Preis für den Zusatzkurs${courseTypeLabel ? ` (${escapeHtml(courseTypeLabel)})` : ""} ist damit final: <strong>${preis} €</strong>. Du kannst jetzt gerne überweisen.</p>
        ${SIGNATUR_HTML}
        <p style="margin:16px 0 0;font-size:12px;color:#8B6464;">Wunderwerk Frau · Bauch · Baby · Beckenboden</p>
      </div>`,
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
}

export default async (req) => {
  if (req.method !== "POST") return new Response("POST erwartet", { status: 405 });
  if (!transporter) return new Response("ICLOUD_SMTP_USER / ICLOUD_SMTP_PASS fehlen", { status: 500 });

  try {
    const body = await req.json();

    // Separater, schlanker Pfad für die nachträgliche Kombi-Wunsch-Bestätigung
    // (siehe sendeKombiBestaetigungsMail oben) - kein Bezug zu einer frisch
    // eingehenden Buchung, deshalb eigenständig statt im Rest der Funktion
    // durchgeschleift.
    if (body.action === "kombiBestaetigung") {
      return await sendeKombiBestaetigungsMail(body.buchungId);
    }

    const { buchung, kurs, paket, gutschein } = body;
    const zusatz = buchung.zusatzfelder || {};

    // Gutschein-Hinweis für Karo - identisch für Einzelkurs- und
    // Kurs-Paket-Admin-Mail (siehe unten, jeweils oben in adminHtml).
    const gutscheinInfoHtml = gutschein
      ? `<div style="margin:16px 20px 0;padding:12px 14px;background:#fdf0d5;border:1px solid #e0c26a;border-radius:6px;font-size:13px;color:#6b4e1e;">🎟️ Gutschein angegeben: <strong>${gutschein.betrag} €</strong>${gutschein.fotoUrl ? ` – <a href="${gutschein.fotoUrl}" style="color:#6b4e1e;">Foto ansehen</a>` : " (kein Foto hochgeladen)"}</div>`
      : "";

    // --- Kombi-Paket: eine gemeinsame Bestätigungsmail für beide gebündelten Kurse ---
    if (paket) {
      const { name, preis, kurse } = paket;
      const bezeichnung = paket.bezeichnung || "Kurs-Paket";
      const adresse = `${buchung.strasse}, ${buchung.plz} ${buchung.ort}`;
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

      const teilnehmerinHtml = `
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

      await sendMail({
        from: FROM,
        to: buchung.email,
        subject: `Deine Anmeldung: ${name}`,
        html: teilnehmerinHtml,
      });

      const zeile = (label, value) =>
        value
          ? `<tr><td style="padding:4px 0;color:#8b93a1;font-size:12px;">${label}</td></tr><tr><td style="padding:0 0 12px 0;color:#111;font-size:14px;">${value}</td></tr>`
          : "";

      let notfallHtml = "";
      kurse.forEach((k) => {
        if (k.course_type === "schwangerfit" && (zusatz.notfallName || zusatz.notfallTel)) {
          notfallHtml =
            zeile("Notfallkontakt", escapeHtml(zusatz.notfallName || "")) +
            zeile("Notfallkontakt Telefon", `<a href="tel:${escapeHtml(zusatz.notfallTel || "")}">${escapeHtml(zusatz.notfallTel || "")}</a>`);
        }
      });

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
            ${zeile(bezeichnung, escapeHtml(name))}
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

      const namePrefixPaket = kontaktNamePrefix(kurse);
      const attachments = [
        {
          filename: `${buchung.vorname}-${buchung.nachname}.vcf`,
          content: base64(
            vCard({
              vorname: buchung.vorname,
              nachname: namePrefixPaket ? `${namePrefixPaket} ${buchung.nachname}` : buchung.nachname,
              telefon: buchung.telefon,
              email: buchung.email,
              strasse: buchung.strasse,
              plz: buchung.plz,
              ort: buchung.ort,
              note: kontaktNotizen(zusatz),
            })
          ),
        },
      ];

      await sendMail({
        from: FROM,
        to: ADMIN_EMAIL,
        subject: `${buchung.vorname} ${buchung.nachname} ${bezeichnung} ${name}`,
        html: adminHtml,
        attachments,
      });

      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const courseTypeLabel = COURSE_TYPE_LABELS[kurs.course_type] || kurs.course_type;
    const kursBezeichnung = `${courseTypeLabel} ${kurs.termine} Termine`;
    const adresse = `${buchung.strasse}, ${buchung.plz} ${buchung.ort}`;

    // "Ich buche zusätzlich zu einem laufenden Kurs" (Kombi-Wunsch, gilt für
    // jede Einzelkurs-Buchung, siehe Booking.jsx) - der Preis (10% Rabatt auf
    // den Zusatzkurs) wird im Buchungstool bereits fest berechnet
    // (kombiPreisGeschaetzt). Automatisch ENDGÜLTIG bestätigt wird er nur,
    // wenn sich der Name in einer anderen bestehenden Buchung findet
    // (findeBereitsAngemeldet) - sonst bleibt es vorläufig und Karo bekommt
    // eine auffällige Erinnerung.
    const kombiPreisGeschaetzt = zusatz.kombiWunsch && zusatz.kombiPreisGeschaetzt != null ? zusatz.kombiPreisGeschaetzt : null;
    const kombiCheck = zusatz.kombiWunsch
      ? await findeBereitsAngemeldet(buchung.vorname, buchung.nachname, kurs.id)
      : null;
    if (zusatz.kombiWunsch) {
      await speichereKombiBestaetigung(kurs.id, buchung.vorname, buchung.nachname, buchung.email, Boolean(kombiCheck?.gefunden));
    }

    const uhrzeitEnde = addMinutes(kurs.uhrzeit, kurs.dauer_min);
    const wochentagLang = kurs.start_datum ? WOCHENTAGE[new Date(kurs.start_datum + "T00:00:00").getDay()] : "";

    // Wenn die echten Einzeltermine bekannt sind (aus der Kursabfrage, inkl. Pausenwochen),
    // diese exakt auflisten statt "jede Woche" zu unterstellen (das stimmt bei Pausen nicht).
    const wannText =
      Array.isArray(kurs.termin_daten) && kurs.termin_daten.length > 0
        ? kurs.termin_daten.map((d) => formatDatumKurz(d)).join("<br/>")
        : `${formatDatumKurz(kurs.start_datum)}<br/>Jeder Woche am ${wochentagLang} für ${kurs.termine} Mal`;

    // --- 1. Bestätigung an die Teilnehmerin ---
    const terminZeilen =
      Array.isArray(kurs.termin_daten) && kurs.termin_daten.length > 0
        ? kurs.termin_daten.map((d) => formatDatumKurz(d)).join("<br/>")
        : [formatDatumKurz(kurs.start_datum), kurs.end_datum ? `bis ${formatDatumKurz(kurs.end_datum)}` : ""]
            .filter(Boolean)
            .join(" ");
    const verwendungszweck = `${buchung.vorname} ${buchung.nachname} – ${kursBezeichnung}`;

    const teilnehmerinHtml = `
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
            <p style="margin:0 0 14px;">Nachdem Du die Kursgebühr von <strong>${kurs.preis} €</strong> auf folgendes Konto:</p>
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
              Preis: ${kurs.preis} €<br/>
              <span style="font-size:12px;color:#8B6464;">Bitte beachte, dass es aufgrund von Krankheit o. Ä. zu Terminverschiebungen kommen kann.</span>
            </p>
            ${kalenderBlockHtml([kurs.id], true)}

            ${
              zusatz.kombiWunsch
                ? `<p style="margin:0 0 18px;background:#F6EBE8;border-radius:8px;padding:12px 16px;font-size:14px;">Du hast angegeben, zu einem anderen Kurs bei Wunderwerk Frau angemeldet zu sein, der im gleichen Zeitraum läuft, und diesen Kurs zusätzlich zu buchen. ${
                    kombiCheck?.gefunden
                      ? `Ich konnte Deine Anmeldung${kombiCheck.kursLabel ? ` bei <strong>${escapeHtml(kombiCheck.kursLabel)}</strong>` : ""} bestätigen – Dein Preis für diesen Zusatzkurs ist damit final: <strong>${kombiPreisGeschaetzt ?? kurs.preis} €</strong> statt ${kurs.preis} €. Du kannst direkt überweisen.`
                      : `Ich konnte das noch nicht automatisch bestätigen und prüfe das von Hand – Dein voraussichtlicher Preis liegt bei <strong>${kombiPreisGeschaetzt ?? kurs.preis} €</strong> statt ${kurs.preis} €. Bitte überweise noch nicht, ich melde mich bei Dir, sobald ich es geprüft habe.`
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

    await sendMail({
      from: FROM,
      to: buchung.email,
      subject: `Deine Anmeldung: ${kursBezeichnung}`,
      html: teilnehmerinHtml,
    });

    // --- 2. Benachrichtigung an Karo ---
    const zeile = (label, value) =>
      value ? `<tr><td style="padding:4px 0;color:#8b93a1;font-size:12px;">${label}</td></tr><tr><td style="padding:0 0 12px 0;color:#111;font-size:14px;">${value}</td></tr>` : "";

    let notfallHtml = "";
    if (kurs.course_type === "schwangerfit" && (zusatz.notfallName || zusatz.notfallTel)) {
      notfallHtml =
        zeile("Notfallkontakt", escapeHtml(zusatz.notfallName || "")) +
        zeile("Notfallkontakt Telefon", `<a href="tel:${escapeHtml(zusatz.notfallTel || "")}">${escapeHtml(zusatz.notfallTel || "")}</a>`);
    }

    // Bei einem automatisch gefundenen Namens-Treffer: ruhige Info, keine
    // Aktion nötig. Kein Treffer: auffällige Warnung - das ist der einzige
    // Fall, in dem Karo den Namen noch von Hand mit ihren Kurslisten
    // abgleichen muss.
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
          ${zeile("Uhrzeit", kurs.uhrzeit ? `${kurs.uhrzeit} - ${uhrzeitEnde} (CEST)` : "")}
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

    const namePrefixEinzel = kontaktNamePrefix([kurs]);
    const attachments = [
      {
        filename: `${buchung.vorname}-${buchung.nachname}.vcf`,
        content: base64(
          vCard({
            vorname: buchung.vorname,
            nachname: namePrefixEinzel ? `${namePrefixEinzel} ${buchung.nachname}` : buchung.nachname,
            telefon: buchung.telefon,
            email: buchung.email,
            strasse: buchung.strasse,
            plz: buchung.plz,
            ort: buchung.ort,
            note: kontaktNotizen(zusatz),
          })
        ),
      },
    ];

    await sendMail({
      from: FROM,
      to: ADMIN_EMAIL,
      subject: `${
        zusatz.kombiWunsch ? (kombiCheck?.gefunden ? "✅ Kombi-Wunsch bestätigt: " : "❗ Kombi-Wunsch prüfen: ") : ""
      }${buchung.vorname} ${buchung.nachname} Kurstermin ${kursBezeichnung}`,
      html: adminHtml,
      attachments,
    });

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
};

export const config = { path: "/.netlify/functions/send-booking-emails" };