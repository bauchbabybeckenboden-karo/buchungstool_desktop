// Best-effort Vorschläge aus dem Titel einer Terminumfrage (umfragen.titel).
// Liefert nur Vorschläge zur Kontrolle - nichts wird ungeprueft übernommen.

import { COURSE_TYPES } from './courseTypes.js'

const KEYWORDS = [
  { slug: 'somatic-yoga', patterns: [/yoga/i] },
  { slug: 'koerpermitte-beckenboden', patterns: [/beckenboden/i, /k[oö]rpermitte/i] },
  { slug: 'schwangerfit', patterns: [/schwangerfit/i] },
  { slug: 'mamafit', patterns: [/mamafit/i] },
]

export function parseUmfrageTitel(titel) {
  const text = titel || ''
  const isCombo = /kombikurs/i.test(text)

  const matchedTypes = KEYWORDS.filter((k) => k.patterns.some((p) => p.test(text))).map((k) => k.slug)
  // Bei Kombikursen oder mehreren erkannten Typen: keinen Typ vorschlagen, manuell waehlen lassen
  const courseTypeGuess = !isCombo && matchedTypes.length === 1 ? matchedTypes[0] : ''

  const priceMatch = text.match(/(\d+)\s*€/)
  const preisGuess = priceMatch ? Number(priceMatch[1]) : ''

  const termineMatch = text.match(/(\d+)\s*Termine/i)
  const termineGuess = termineMatch ? Number(termineMatch[1]) : ''

  return {
    isCombo,
    courseTypeGuess,
    preisGuess,
    termineGuess,
    nameGuess: text.trim(),
  }
}

export function courseTypeLabel(slug) {
  return COURSE_TYPES.find((c) => c.slug === slug)?.label || slug
}
