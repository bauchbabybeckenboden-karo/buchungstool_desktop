// Kleine, gemeinsam genutzte Datums-Helfer für die Admin-Oberfläche (Auswahl-
// Dropdowns in PaketPanel/CourseCard) - damit Kursnamen dort immer mit Datum
// angezeigt werden können und man nicht aus mehreren gleichnamigen Kursen
// (z.B. "Mamafit Freitags" zu unterschiedlichen Terminen) den falschen wählt.

export function formatDatumDE(isoDatum) {
  if (!isoDatum) return ''
  const [jahr, monat, tag] = isoDatum.split('-')
  return `${tag}.${monat}.${jahr}`
}

// Erster Termin eines Kurses - aus den Einzelterminen (termin_daten), sonst
// aus dem Start-Datum.
export function ersterTermin(course) {
  return course?.termin_daten?.[0] || course?.start_datum || null
}
