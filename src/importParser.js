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

// Eine Kursabfrage-"Gruppe" ist ein DAUERHAFTER wöchentlicher Termin (dates
// reicht oft jahrelang in die Zukunft), kein einzelner Kurs-Durchlauf. Karo
// markiert die tatsächlichen Durchläufe manuell in der Kursabfrage-App per
// Notiz an einem Termin ("voraussichtlicher Kursstart" / "voraussichtlich
// letzte Kursstunde") - genau wie in ihren bestehenden Google-Apps-Scripten
// (kv2FindeDurchlauf / keFindeDurchlauf). Diese Funktion bildet dieselbe
// Logik nach: sie liest alle Notizen dieser Gruppe, erkennt Start- und
// Ende-Marker am Text und paart sie chronologisch zu Durchläufen.
//
// notizen: das komplette bbb_notizen_v2-Objekt, Keys im Format
// "<gruppenId>_<datumISO>" -> freier Text.
export function ermittleDurchlaeufe(gruppe, gruppenId, notizen) {
  const praefix = gruppenId + '_'
  const marker = []

  Object.entries(notizen || {}).forEach(([key, text]) => {
    if (key.indexOf(praefix) !== 0) return
    const datum = key.slice(praefix.length)
    const t = (text || '').toLowerCase()
    const istEnde = t.includes('letzte') && (t.includes('kursstunde') || t.includes('kurses'))
    const istStart = !istEnde && (t.includes('erste') || t.includes('kursstart'))
    if (istEnde) marker.push({ datum, typ: 'ende' })
    else if (istStart) marker.push({ datum, typ: 'start' })
  })

  const starts = new Set(marker.filter((m) => m.typ === 'start').map((m) => m.datum))
  // Der Gruppen-eigene Start dient als impliziter Start des allerersten
  // Durchlaufs, falls dafür noch keine eigene Notiz gesetzt wurde.
  if (gruppe.start) starts.add(gruppe.start)

  const endes = marker.filter((m) => m.typ === 'ende').map((m) => m.datum).sort()
  const sortedStarts = Array.from(starts).sort()

  return sortedStarts.map((start, i) => {
    const naechsterStart = sortedStarts[i + 1] || null
    const ende = endes.find((e) => e >= start && (!naechsterStart || e < naechsterStart)) || null
    return { start, ende }
  })
}

// Liefert die echten Einzeltermine eines Durchlaufs: alle Termine der
// Gruppe zwischen Start und Ende, abzüglich manuell entfernter Pausentermine
// (bbb_removed_v2). Gibt null zurück, solange kein Ende markiert ist -
// ein Durchlauf ohne markiertes Ende ist noch nicht sicher abgegrenzt.
export function echteTermineFuerDurchlauf(gruppe, durchlauf, removedForGruppe) {
  if (!durchlauf || !durchlauf.ende) return null
  const removedSet = new Set(removedForGruppe || [])
  return (gruppe.dates || []).filter(
    (d) => d >= durchlauf.start && d <= durchlauf.ende && !removedSet.has(d)
  )
}