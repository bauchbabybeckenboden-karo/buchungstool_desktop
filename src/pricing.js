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

// Reduziert einen Kurs- oder Paketpreis anteilig um die bereits
// stattgefundenen Termine - pauschal 16€ pro Termin (NICHT die Terminrate der
// Kursart, die für den Grundpreis gilt - bei Schwangerfit z.B. bewusst
// abweichend). Manche Kurse weichen von den 16€ ab (z.B. Soyo Donnerstags:
// nur 15€), das ist pro Kurs über kurse.reduzierung_pro_termin einstellbar
// (Default 16, siehe Admin-Bereich). So zahlen späte Anmeldungen nur für die
// Termine, die noch stattfinden. Ein Kombi-Paket übergibt hier beide
// zugrundeliegenden Kurse, ein Einzelkurs nur sich selbst.
const STANDARD_REDUZIERUNG_CENTS = 1600

export function reduzierterPreis(basisPreis, ...courses) {
  const abzugCents = courses.reduce((summe, course) => {
    if (!course) return summe
    const rateCents =
      course.reduzierung_pro_termin != null
        ? Math.round(Number(course.reduzierung_pro_termin) * 100)
        : STANDARD_REDUZIERUNG_CENTS
    return summe + rateCents * vergangeneTermine(course)
  }, 0)
  if (abzugCents === 0) return Number(basisPreis)
  const preisCents = Math.round(Number(basisPreis) * 100) - abzugCents
  return Math.max(0, preisCents) / 100
}
