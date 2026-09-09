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
