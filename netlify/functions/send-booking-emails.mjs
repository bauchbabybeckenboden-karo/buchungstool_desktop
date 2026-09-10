// Verschickt nach einer Buchung zwei E-Mails über Resend:
// 1. Bestätigung an die Teilnehmerin
// 2. Benachrichtigung an Karo (im Setmore-"Neuer Teilnehmer"-Stil) inkl. Visitenkarte(n) zum Abspeichern

import { createClient } from "@supabase/supabase-js";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = "Bauch Baby Beckenboden <kontakt@bauch-baby-beckenboden.com>";
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

const COURSE_TYPE_LABELS = {
  mamafit: "Mamafit",
  schwangerfit: "Schwangerfit",
  "somatic-yoga": "Somatic Yoga",
  "koerpermitte-beckenboden": "Körpermitte & Beckenboden",
};

// Kursarten, mit denen sich "Körpermitte & Beckenboden" kombinieren lässt
// (siehe Booking.jsx, KombiWunschSection) - nur dort wird beim Kombi-Wunsch
// nach einem Namens-Treffer gesucht.
const KOMBI_PARTNER_COURSE_TYPES = ["somatic-yoga", "mamafit"];

// Prüft per Namensabgleich (Vor- + Nachname, ohne Groß-/Kleinschreibung und
// führende/folgende Leerzeichen), ob bereits eine Buchung in einem der beiden
// Kombi-Partnerkurse existiert - das ist die einzige Grundlage, auf der der
// "Kombi-Wunsch" automatisch bestätigt wird (statt dass Karo jede Anfrage von
// Hand mit ihren Kurslisten abgleichen muss). Ein Treffer wird bewusst nur
// bei exakter Namensübereinstimmung gewertet - Tippfehler/Spitznamen führen
// zu "nicht gefunden" und damit zur manuellen Prüfung durch Karo, nie zu
// einer fälschlich automatisch bestätigten Buchung.
async function findeBereitsAngemeldet(vorname, nachname) {
  if (!supabaseAdmin) return { geprueft: false, gefunden: false, kursLabel: null };

  const vornameTrim = (vorname || "").trim();
  const nachnameTrim = (nachname || "").trim();
  if (!vornameTrim || !nachnameTrim) return { geprueft: true, gefunden: false, kursLabel: null };

  const { data: kurse, error: kurseError } = await supabaseAdmin
    .from("kurse")
    .select("id, course_type")
    .in("course_type", KOMBI_PARTNER_COURSE_TYPES);
  if (kurseError || !kurse || kurse.length === 0) return { geprueft: true, gefunden: false, kursLabel: null };

  const kursIds = kurse.map((k) => k.id);
  const { data: treffer, error: buchungenError } = await supabaseAdmin
    .from("buchungen")
    .select("kurs_id")
    .in("kurs_id", kursIds)
    .ilike("vorname", vornameTrim)
    .ilike("nachname", nachnameTrim)
    .limit(1);
  if (buchungenError) return { geprueft: true, gefunden: false, kursLabel: null };

  const passenderTreffer = (treffer || [])[0];
  if (!passenderTreffer) return { geprueft: true, gefunden: false, kursLabel: null };

  const passenderKurs = kurse.find((k) => k.id === passenderTreffer.kurs_id);
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
  return String(str || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
    note ? `NOTE:${note}` : null,
    "END:VCARD",
  ].filter(Boolean);
  return lines.join("\r\n");
}

function base64(str) {
  return Buffer.from(str, "utf-8").toString("base64");
}

async function sendResend(payload) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend ${res.status}: ${text}`);
  }
  return res.json();
}

export default async (req) => {
  if (req.method !== "POST") return new Response("POST erwartet", { status: 405 });
  if (!RESEND_API_KEY) return new Response("RESEND_API_KEY fehlt", { status: 500 });

  try {
    const { buchung, kurs, paket } = await req.json();
    const zusatz = buchung.zusatzfelder || {};

    // --- Kombi-Paket: eine gemeinsame Bestätigungsmail für beide gebündelten Kurse ---
    if (paket) {
      const { name, preis, kurse } = paket;
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
        <div style="font-family:'Helvetica Neue',Arial,sans-serif;background:#f5ede8;padding:32px 12px;">
          <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #ece1da;">
            <div style="background:linear-gradient(135deg,#8b6464,#7d5858);padding:32px 36px;color:#f7f2ee;">
              <p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#e3cfcf;">Deine Anmeldung im Überblick</p>
              <h1 style="margin:0;font-size:22px;font-weight:300;letter-spacing:.5px;">🌿 Liebe ${escapeHtml(buchung.vorname)},</h1>
            </div>
            <div style="padding:32px 36px;color:#3d2b2b;font-size:15px;line-height:1.8;font-weight:300;">
              <p style="margin:0 0 18px;">vielen Dank für deine Anmeldung zum Kombi-Paket <strong style="font-weight:600;">${escapeHtml(name)}</strong>!</p>

              <hr style="border:none;border-top:1px solid #ece1da;margin:24px 0;"/>

              <p style="margin:0 0 6px;font-size:12px;color:#8b6464;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Wie es weitergeht</p>
              <p style="margin:0 0 14px;">Nachdem Du die Kursgebühr von <strong>${preis} €</strong> auf folgendes Konto:</p>
              <table style="width:100%;font-size:13px;margin:0 0 18px;border-collapse:collapse;">
                <tr><td style="padding:2px 0;color:#8a7060;">Kontoinhaber</td><td style="padding:2px 0;text-align:right;">${BANK.kontoinhaber}</td></tr>
                <tr><td style="padding:2px 0;color:#8a7060;">IBAN</td><td style="padding:2px 0;text-align:right;">${BANK.iban}</td></tr>
                <tr><td style="padding:2px 0;color:#8a7060;">BIC</td><td style="padding:2px 0;text-align:right;">${BANK.bic}</td></tr>
                <tr><td style="padding:2px 0;color:#8a7060;">Verwendungszweck</td><td style="padding:2px 0;text-align:right;">${escapeHtml(verwendungszweck)}</td></tr>
              </table>
              <p style="margin:0 0 18px;">überwiesen hast, fülle bitte unbedingt <a href="${FRAGEBOGEN_URL}" style="color:#8b6464;">diesen Fragebogen</a> aus (einmal reicht für beide Kurse).</p>

              <p style="margin:0 0 18px;">Ca. 10 Tage vor Kursstart erhältst du die Einladung zur WhatsApp-Gruppe (<a href="mailto:${ADMIN_EMAIL}?subject=${encodeURIComponent("Ich nutze kein WhatsApp")}" style="color:#8b6464;">ich nutze kein WhatsApp</a>). Außerdem wirst du wöchentlich daran erinnert, dich in unser Teilnahmeformular einzutragen – das hilft, den Raum optimal vorzubereiten.</p>

              <p style="margin:0 0 6px;font-size:12px;color:#8b6464;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Deine Kurstermine</p>
              ${kurse.map(kursBlockHtml).join("")}
              <p style="margin:0 0 18px;font-size:14px;">
                Paketpreis gesamt: ${preis} €<br/>
                <span style="font-size:12px;color:#8a7060;">Bitte beachte, dass es aufgrund von Krankheit o. Ä. zu Terminverschiebungen kommen kann.</span>
              </p>

              <p style="margin:0 0 24px;">💕 Solltest du Fragen haben, melde dich gern – die FAQ auf der Homepage beantwortet ggf. ebenfalls die ein- oder andere Frage! Vielen Dank für dein Vertrauen 💕</p>

              <p style="margin:0;">Ich freue mich doll!<br/>Deine 🌿 Karo ♦️<br/>Bauch · Baby · Beckenboden</p>
            </div>
            <div style="background:#f5ede8;padding:20px 36px;font-size:12px;color:#8a7060;text-align:center;line-height:1.6;">
              Bauch · Baby · Beckenboden · <a href="https://bauch-baby-beckenboden.de" style="color:#8a7060;">bauch-baby-beckenboden.de</a>
            </div>
          </div>
        </div>`;

      await sendResend({
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
            <h2 style="margin:20px 0 16px 0;font-size:20px;">Neuer Teilnehmer (Kombi-Paket)</h2>
          </div>
          <table style="width:100%;padding:0 20px;border-collapse:collapse;">
            ${zeile("Paket", escapeHtml(name))}
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

      const attachments = [
        {
          filename: `${buchung.vorname}-${buchung.nachname}.vcf`,
          content: base64(
            vCard({
              vorname: buchung.vorname,
              nachname: buchung.nachname,
              telefon: buchung.telefon,
              email: buchung.email,
              strasse: buchung.strasse,
              plz: buchung.plz,
              ort: buchung.ort,
            })
          ),
        },
      ];

      const notfallKurs = kurse.find((k) => k.course_type === "schwangerfit");
      if (notfallKurs && zusatz.notfallTel) {
        attachments.push({
          filename: `Notfallkontakt-${buchung.vorname}-${buchung.nachname}.vcf`,
          content: base64(
            vCard({
              vorname: "Teilnehmerin – Notfallkontakt",
              nachname: `(${zusatz.notfallName || buchung.vorname + " " + buchung.nachname})`,
              telefon: zusatz.notfallTel,
            })
          ),
        });
      }

      await sendResend({
        from: FROM,
        to: ADMIN_EMAIL,
        subject: `${buchung.vorname} ${buchung.nachname} Kombi-Paket ${name}`,
        html: adminHtml,
        attachments,
      });

      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const courseTypeLabel = COURSE_TYPE_LABELS[kurs.course_type] || kurs.course_type;
    const kursBezeichnung = `${courseTypeLabel} ${kurs.termine} Termine`;
    const adresse = `${buchung.strasse}, ${buchung.plz} ${buchung.ort}`;

    // Körpermitte & Beckenboden: "Ich buche zusätzlich zu einem laufenden Kurs"
    // - der Preis (10% Rabatt auf den Zusatzkurs) wird im Buchungstool bereits
    // fest berechnet (Booking.jsx, kombiPreisGeschaetzt). Automatisch ENDGÜLTIG
    // bestätigt wird er nur, wenn sich der Name in einer bestehenden Buchung
    // von Soyo Donnerstags oder Mamafit findet (findeBereitsAngemeldet) - sonst
    // bleibt es vorläufig und Karo bekommt eine auffällige Erinnerung.
    const kombiPreisGeschaetzt = zusatz.kombiWunsch && zusatz.kombiPreisGeschaetzt != null ? zusatz.kombiPreisGeschaetzt : null;
    const kombiCheck = zusatz.kombiWunsch
      ? await findeBereitsAngemeldet(buchung.vorname, buchung.nachname)
      : null;

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
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;background:#f5ede8;padding:32px 12px;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #ece1da;">
          <div style="background:linear-gradient(135deg,#8b6464,#7d5858);padding:32px 36px;color:#f7f2ee;">
            <p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#e3cfcf;">Deine Anmeldung im Überblick</p>
            <h1 style="margin:0;font-size:22px;font-weight:300;letter-spacing:.5px;">🌿 Liebe ${escapeHtml(buchung.vorname)},</h1>
          </div>
          <div style="padding:32px 36px;color:#3d2b2b;font-size:15px;line-height:1.8;font-weight:300;">
            <p style="margin:0 0 18px;">vielen Dank für deine Anmeldung zu <strong style="font-weight:600;">${escapeHtml(courseTypeLabel)}</strong>!</p>

            <hr style="border:none;border-top:1px solid #ece1da;margin:24px 0;"/>

            <p style="margin:0 0 6px;font-size:12px;color:#8b6464;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Wie es weitergeht</p>
            <p style="margin:0 0 14px;">Nachdem Du die Kursgebühr von <strong>${kurs.preis} €</strong> auf folgendes Konto:</p>
            <table style="width:100%;font-size:13px;margin:0 0 18px;border-collapse:collapse;">
              <tr><td style="padding:2px 0;color:#8a7060;">Kontoinhaber</td><td style="padding:2px 0;text-align:right;">${BANK.kontoinhaber}</td></tr>
              <tr><td style="padding:2px 0;color:#8a7060;">IBAN</td><td style="padding:2px 0;text-align:right;">${BANK.iban}</td></tr>
              <tr><td style="padding:2px 0;color:#8a7060;">BIC</td><td style="padding:2px 0;text-align:right;">${BANK.bic}</td></tr>
              <tr><td style="padding:2px 0;color:#8a7060;">Verwendungszweck</td><td style="padding:2px 0;text-align:right;">${escapeHtml(verwendungszweck)}</td></tr>
            </table>
            <p style="margin:0 0 18px;">überwiesen hast, fülle bitte unbedingt <a href="${FRAGEBOGEN_URL}" style="color:#8b6464;">diesen Fragebogen</a> aus.</p>

            <p style="margin:0 0 18px;">Ca. 10 Tage vor Kursstart erhältst du die Einladung zur WhatsApp-Gruppe (<a href="mailto:${ADMIN_EMAIL}?subject=${encodeURIComponent("Ich nutze kein WhatsApp")}" style="color:#8b6464;">ich nutze kein WhatsApp</a>). Außerdem wirst du wöchentlich daran erinnert, dich in unser Teilnahmeformular einzutragen – das hilft, den Raum optimal vorzubereiten.</p>

            <p style="margin:0 0 6px;font-size:12px;color:#8b6464;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Deine Kurstermine</p>
            <p style="margin:0 0 18px;font-size:14px;">
              ${terminZeilen}<br/>
              ${kurs.uhrzeit ? `${kurs.uhrzeit}${uhrzeitEnde ? " - " + uhrzeitEnde : ""} Uhr<br/>` : ""}
              Preis: ${kurs.preis} €<br/>
              <span style="font-size:12px;color:#8a7060;">Bitte beachte, dass es aufgrund von Krankheit o. Ä. zu Terminverschiebungen kommen kann.</span>
            </p>

            ${
              zusatz.kombiWunsch
                ? `<p style="margin:0 0 18px;background:#f5ede8;border-radius:8px;padding:12px 16px;font-size:14px;">Du hast angegeben, bereits bei Soyo Donnerstags oder Mamafit angemeldet zu sein und diesen Kurs zusätzlich zu buchen. ${
                    kombiCheck?.gefunden
                      ? `Ich konnte deine Anmeldung${kombiCheck.kursLabel ? ` bei <strong>${escapeHtml(kombiCheck.kursLabel)}</strong>` : ""} bestätigen – dein Preis für diesen Zusatzkurs ist damit final: <strong>${kombiPreisGeschaetzt ?? kurs.preis} €</strong> statt ${kurs.preis} €. Du kannst direkt überweisen.`
                      : `Ich konnte das noch nicht automatisch bestätigen und prüfe das von Hand – dein voraussichtlicher Preis liegt bei <strong>${kombiPreisGeschaetzt ?? kurs.preis} €</strong> statt ${kurs.preis} €. Bitte überweise noch nicht, ich melde mich bei dir, sobald ich es geprüft habe.`
                  }</p>`
                : ""
            }

            <p style="margin:0 0 24px;">💕 Solltest du Fragen haben, melde dich gern – die FAQ auf der Homepage beantwortet ggf. ebenfalls die ein- oder andere Frage! Vielen Dank für dein Vertrauen 💕</p>

            <p style="margin:0;">Ich freue mich doll!<br/>Deine 🌿 Karo ♦️<br/>Bauch · Baby · Beckenboden</p>
          </div>
          <div style="background:#f5ede8;padding:20px 36px;font-size:12px;color:#8a7060;text-align:center;line-height:1.6;">
            Bauch · Baby · Beckenboden · <a href="https://bauch-baby-beckenboden.de" style="color:#8a7060;">bauch-baby-beckenboden.de</a>
          </div>
        </div>
      </div>`;

    await sendResend({
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
        ? `<div style="margin:16px 20px 0;padding:12px 14px;background:#e6f2e9;border:1px solid #a9d4b5;border-radius:6px;font-size:13px;color:#2f5c3d;">✅ Kombi-Wunsch automatisch bestätigt: Name wurde in den Buchungen von <strong>${escapeHtml(kombiCheck.kursLabel || "Soyo Donnerstags/Mamafit")}</strong> gefunden. Preis für den Zusatzkurs (10 % Rabatt bereits eingerechnet): <strong>${kombiPreisGeschaetzt ?? "?"} €</strong>. Keine weitere Prüfung nötig, Teilnehmerin wurde bereits informiert.</div>`
        : `<div style="margin:16px 20px 0;padding:12px 14px;background:#fdf0d5;border:2px solid #e05d5d;border-radius:6px;font-size:13px;color:#6b1e1e;">❗ Kombi-Wunsch NICHT automatisch bestätigt: Der Name wurde in keiner Buchung von Soyo Donnerstags oder Mamafit gefunden. Bitte manuell prüfen (Tippfehler? anderer Name? tatsächlich nicht angemeldet?) und der Teilnehmerin Bescheid geben. Vorgesehener Preis: <strong>${kombiPreisGeschaetzt ?? "?"} €</strong>.</div>`
      : "";

    const adminHtml = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:white;border:1px solid #eee;">
        <div style="padding:20px 20px 0 20px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="display:inline-block;width:28px;height:28px;border-radius:50%;background:#f0d9d9;"></span>
            <strong style="font-size:15px;">Bauch Baby Beckenboden</strong>
          </div>
          <h2 style="margin:20px 0 16px 0;font-size:20px;">Neuer Teilnehmer</h2>
        </div>
        ${kombiWunschInfoHtml}
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

    const attachments = [
      {
        filename: `${buchung.vorname}-${buchung.nachname}.vcf`,
        content: base64(
          vCard({
            vorname: buchung.vorname,
            nachname: buchung.nachname,
            telefon: buchung.telefon,
            email: buchung.email,
            strasse: buchung.strasse,
            plz: buchung.plz,
            ort: buchung.ort,
          })
        ),
      },
    ];

    if (kurs.course_type === "schwangerfit" && zusatz.notfallTel) {
      attachments.push({
        filename: `Notfallkontakt-${buchung.vorname}-${buchung.nachname}.vcf`,
        content: base64(
          vCard({
            vorname: "Teilnehmerin – Notfallkontakt",
            nachname: `(${zusatz.notfallName || buchung.vorname + " " + buchung.nachname})`,
            telefon: zusatz.notfallTel,
          })
        ),
      });
    }

    await sendResend({
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
