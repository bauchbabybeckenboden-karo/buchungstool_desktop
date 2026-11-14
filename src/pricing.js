// Preisformel laut Karos Preisliste:
// - Schwangerfit: 16,40 € je Termin, aufgerundet auf den nächsten vollen Euro (nur wenn nicht schon rund)
// - Mamafit, Somatic Yoga, Somatic Körpermitte & Beckenboden: 16 € je Termin
// - Kombikurse: (Kurspreis + Kurspreis) - 10 €
//
// Rechnung in Cent (ganzzahlig), um Fließkomma-Rundungsfehler zu vermeiden.

const RATE_CENTS = {
  schwangerfit: 1640,
  mamafit: 1600,
  'somatic-yoga': 1600,
  'koerpermitte-beckenboden': 1600,
}

// Preis (in Cent) für einen einzelnen Kursbestandteil, aufgerundet auf den vollen Euro.
function komponentenPreisCents(courseTypeSlug, termine) {
  const rate = RATE_CENTS[courseTypeSlug]
  if (!rate || !termine) return null
  const rawCents = rate * Number(termine)
  return Math.ceil(rawCents / 100) * 100
}

// Gesamtpreis inkl. Kombikurs-Rabatt (10 € Abzug, wenn zusätzliche Kursarten angegeben sind).
export function calculatePreis(courseTypeSlug, termine, zusatzCourseTypes = []) {
  const alleTypen = [courseTypeSlug, ...zusatzCourseTypes].filter(Boolean)
  if (alleTypen.length === 0) return null

  const teilpreiseCents = alleTypen.map((slug) => komponentenPreisCents(slug, termine))
  if (teilpreiseCents.some((p) => p === null)) return null

  const summeCents = teilpreiseCents.reduce((a, b) => a + b, 0)
  const preisCents = alleTypen.length > 1 ? summeCents - 1000 : summeCents
  return preisCents / 100
}

// Einzelpreis eines Kurses ohne Kombi (nach der Regel oben aus der Terminzahl) -
// für die Kachel "nur dieser Kurs" bei Kursen mit Partnerkurs.
export function einzelPreis(course) {
  const p = calculatePreis(course.course_type, course.termine, [])
  return p !== null ? p : Number(course.preis)
}

// Preis eines Kombikurses mit Partnerkurs (z.B. Körpermitte + Mamafit): beide
// Teilpreise nach der jeweiligen Terminzahl, abzüglich 10 € Kombi-Rabatt.
export function calculateKombiPartnerPreis(slug1, termine1, slug2, termine2) {
  const p1 = komponentenPreisCents(slug1, termine1)
  const p2 = komponentenPreisCents(slug2, termine2)
  if (p1 === null || p2 === null) return null
  return (p1 + p2 - 1000) / 100
}

// Kombi-Preis zweier Kurse live aus deren Terminzahlen (Einzelpreise werden nicht
// kombiniert gespeichert).
export function kombiPreis(course, partner) {
  const p = calculateKombiPartnerPreis(course.course_type, course.termine, partner.course_type, partner.termine)
  return p !== null ? p : Number(course.preis) + Number(partner.preis) - 10
}

// Preisformel für Kombi-Pakete (zwei eigenständige, unabhängige Kurse zu einer
// gemeinsamen Buchung gebündelt - anders als der Kombikurs-Rabatt oben, der
// denselben Kurs nur auf einer zweiten Kursseite zusätzlich anzeigt).
//
// Vorgabe von Karo: Der Paketpreis liegt IMMER 10-11% unter der Summe der
// beiden Einzelpreise, gerundet auf 5€-Schritte. Da nicht jede Summe exakt
// einen 5€-Wert in diesem schmalen Korridor hat, wird unter allen 5€-Schritten
// derjenige gewählt, dessen Rabatt am nächsten an (oder innerhalb) 10-11% liegt.
export function calculatePaketPreis(preis1, preis2) {
  const p1 = Number(preis1)
  const p2 = Number(preis2)
  if (!p1 || !p2) return null
  const summe = p1 + p2

  let bester = null
  let besteAbweichung = Infinity
  for (let preis = 0; preis <= summe; preis += 5) {
    const rabattProzent = ((summe - preis) / summe) * 100
    const abweichung =
      rabattProzent >= 10 && rabattProzent <= 11
        ? 0
        : Math.min(Math.abs(rabattProzent - 10), Math.abs(rabattProzent - 11))
    if (abweichung < besteAbweichung) {
      besteAbweichung = abweichung
      bester = preis
    }
  }
  return bester
}

// Von Karo manuell gesetzter Rabattpreis (z.B. um einen Kurs attraktiver zu
// machen), falls für den Kurs aktiviert - sonst der normale Listenpreis.
// Unabhängig von der automatischen Reduzierung für späte Anmeldungen unten,
// die zusätzlich (weiter) auf diesen Grundpreis angewendet wird.
export function effektiverGrundpreis(course) {
  if (!course) return null
  if (course.rabatt_aktiv && course.rabatt_preis != null) return Number(course.rabatt_preis)
  return Number(course.preis)
}

// Heutiges Datum als "YYYY-MM-DD" in der Zeitzone Europe/Berlin - gleiches
// Format wie die Einträge in termin_daten, damit ein einfacher String-
// Vergleich reicht (kein Date-Parsing/Zeitzonen-Ärger).
function heuteISOBerlin() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
}

// Anzahl der Einzeltermine eines Kurses, die bereits in der Vergangenheit
// liegen (heutiger Termin zählt noch nicht als "vergangen"). Ohne einzelne
// Termindaten (termin_daten, z.B. bei von Hand angelegten Kursen ohne
// Kursabfrage-Import) kann das nicht ermittelt werden - dann sicherheitshalber
// 0, also kein Abzug.
export function vergangeneTermine(course) {
  if (!course || !Array.isArray(course.termin_daten) || course.termin_daten.length === 0) return 0
  const heute = heuteISOBerlin()
  return course.termin_daten.filter((d) => d < heute).length
}

// Quereinstieg (Stand 14.11.2026, Vorgabe Karo): Hat ein Kurs schon begonnen
// (mind. ein Termin vorbei), kostet jede noch offene Stunde pauschal 17 € -
// wie eine Schnupperstunde. Teilbuchungen sollen bewusst nicht günstiger sein
// als der ganze Kurs. Bei Kombikurs/Paket zählen die offenen Stunden beider
// Kurse. Nie teurer als der normale Preis. Solange noch kein Termin vorbei
// ist, gilt der normale Preis.
// (Die Spalte kurse.reduzierung_pro_termin wird dafür nicht mehr verwendet.)
export const QUEREINSTIEG_PREIS_PRO_STUNDE = 17

export function offeneTermine(course) {
  if (!course || !Array.isArray(course.termin_daten) || course.termin_daten.length === 0) return 0
  return Math.max(0, course.termin_daten.length - vergangeneTermine(course))
}

export function istQuereinstieg(...courses) {
  return courses.some((course) => course && vergangeneTermine(course) > 0)
}

export function reduzierterPreis(basisPreis, ...courses) {
  if (!istQuereinstieg(...courses)) return Number(basisPreis)
  const offen = courses.reduce((summe, course) => summe + offeneTermine(course), 0)
  return Math.min(Number(basisPreis), offen * QUEREINSTIEG_PREIS_PRO_STUNDE)
}
