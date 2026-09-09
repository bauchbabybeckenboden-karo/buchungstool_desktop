// Best-effort Vorschläge aus den Kurs-Gruppen der Kursabfrage-App
// (bauch-baby-beckenboden-kursabfrage.netlify.app). Liefert nur Vorschläge
// zur Kontrolle - nichts wird ungeprüft übernommen.

import { COURSE_TYPES } from './courseTypes.js'

const KEYWORDS = [
  { slug: 'somatic-yoga', patterns: [/soyo/i, /yoga/i] },
  { slug: 'koerpermitte-beckenboden', patterns: [/beckenboden/i, /k[oö]rpermitte/i] },
  { slug: 'schwangerfit', patterns: [/schwangerfit/i] },
  { slug: 'mamafit', patterns: [/mamafit/i] },
]

// Rät die Kursart anhand des Gruppennamens (z.B. "Mamafit Freitags").
export function guessCourseType(name) {
  const text = name || ''
  const matched = KEYWORDS.filter((k) => k.patterns.some((p) => p.test(text))).map((k) => k.slug)
  return matched.length === 1 ? matched[0] : ''
}

const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

export function wochentagLabel(wochentag) {
  return WOCHENTAGE[wochentag] ?? ''
}

// Ermittelt das End-Datum für eine gewählte Anzahl Termine anhand der
// vollständigen Terminliste der Gruppe (dates: ["YYYY-MM-DD", ...], sortiert).
export function endDateForTermine(dates, termine) {
  if (!Array.isArray(dates) || !termine || termine < 1) return ''
  const idx = Math.min(Number(termine), dates.length) - 1
  return dates[idx] || ''
}

// Liefert die tatsächlichen Einzeltermine (inkl. Pausenwochen, wie in der
// Kursabfrage hinterlegt) für die gewählte Anzahl Termine.
export function datesForTermine(dates, termine) {
  if (!Array.isArray(dates) || !termine || termine < 1) return []
  return dates.slice(0, Number(termine))
}

export function courseTypeLabel(slug) {
  return COURSE_TYPES.find((c) => c.slug === slug)?.label || slug
}
