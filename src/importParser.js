// Best-effort Vorschläge aus dem Titel/den Terminen einer Terminumfrage (umfragen.titel/ort/termine).
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

// Wandelt ein deutsches Datum (Tag.Monat.Jahr) in ISO (YYYY-MM-DD) um.
function toIso(day, month, year) {
  if (!year) return null
  const y = year < 100 ? year + 2000 : year
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${y}-${mm}-${dd}`
}

// Sucht alle "TT.MM." bzw. "TT.MM.JJJJ"-Angaben im Ort-Feld (dort werden bei
// Karo die Einzeltermine als Text hinterlegt, nicht der eigentliche Ort).
function extractDatesFromOrt(ort, fallbackYear) {
  if (!ort) return []
  const regex = /(\d{1,2})\.(\d{1,2})\.(\d{2,4})?/g
  const found = []
  let match
  while ((match = regex.exec(ort)) !== null) {
    found.push({
      day: Number(match[1]),
      month: Number(match[2]),
      year: match[3] ? Number(match[3]) : null,
    })
  }

  // Jahr fehlt meistens außer beim letzten Termin - das gefundene Jahr auf alle anwenden.
  const explicitYear = [...found].reverse().find((d) => d.year)?.year || fallbackYear

  return found
    .map((d) => toIso(d.day, d.month, d.year || explicitYear))
    .filter(Boolean)
}

// Ermittelt einen Vorschlag für ersten und letzten Termin.
// Quelle 1: das strukturierte "termine"-Feld (jsonb, enthält meist nur den ersten Termin zuverlässig).
// Quelle 2: das Textfeld "ort", in dem Karo alle Einzeltermine als Liste hinterlegt.
export function parseTerminDates(ort, termineJson) {
  const structuredStart =
    Array.isArray(termineJson) && termineJson[0]?.datum ? termineJson[0].datum : null
  const fallbackYear = structuredStart ? Number(structuredStart.slice(0, 4)) : new Date().getFullYear()

  const ortDates = extractDatesFromOrt(ort, fallbackYear)
  const allDates = structuredStart ? [...ortDates, structuredStart] : ortDates
  const unique = Array.from(new Set(allDates)).sort()

  return {
    startDatumGuess: unique[0] || '',
    endDatumGuess: unique[unique.length - 1] || '',
  }
}

export function courseTypeLabel(slug) {
  return COURSE_TYPES.find((c) => c.slug === slug)?.label || slug
}
