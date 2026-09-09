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
