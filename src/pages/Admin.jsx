import { useEffect, useState } from 'react'
import styles from './Admin.module.css'
import { COURSE_TYPES, getCourseTypeBySlug } from '../courseTypes.js'
import { supabase } from '../supabase.js'
import CourseCard from '../components/CourseCard.jsx'
import { useImportCandidates, ImportCandidateCard } from '../components/ImportPanel.jsx'
import PaketPanel from '../components/PaketPanel.jsx'

// Datum, nach dem ein Kurs chronologisch einsortiert wird - der erste
// bekannte Einzeltermin, sonst das Start-Datum. Kurse ganz ohne Datum
// landen in einer eigenen "Ohne Termin"-Gruppe ganz unten.
function kursSortDatum(course) {
  return (course.termin_daten && course.termin_daten[0]) || course.start_datum || null
}

const OHNE_TERMIN = 'Ohne Termin'
const BEKANNTE_KURSARTEN = COURSE_TYPES.map((t) => t.slug)

export default function Admin() {
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [activeType, setActiveType] = useState(COURSE_TYPES[0].slug)
  // Manuelle Auf-/Zuklapp-Entscheidungen pro Jahr-Karteikarte (überschreibt
  // die Standardvorgabe: nur das nächste anstehende Jahr ist offen, weiter
  // in der Zukunft liegende Jahre sind eingeklappt - bei weit im Voraus
  // geplanten Kursen sonst eine sehr lange, unübersichtliche Liste).
  const [jahrOverrides, setJahrOverrides] = useState({})

  useEffect(() => {
    loadCourses()
  }, [])

  // Noch nicht importierte Kursabfrage-Kandidaten - werden weiter unten direkt
  // zusammen mit den schon echten Kursen in derselben Kursart-/Jahres-Gliederung
  // angezeigt (statt in einer separaten, immer neu aufzuklappenden Liste).
  const { rows: importRows, loading: importLoading, error: importError, updateForm: updateImportForm, importRow } =
    useImportCandidates(loadCourses)

  async function loadCourses() {
    setLoading(true)
    const { data, error } = await supabase.from('kurse').select('*').order('created_at', { ascending: true })
    if (error) setLoadError(error.message)
    else {
      setCourses(data || [])
      setLoadError(null)
    }
    setLoading(false)
  }

  function updateCourseLocal(id, changes) {
    setCourses((prev) => prev.map((c) => (c.id === id ? { ...c, ...changes } : c)))
  }

  async function saveCourse(id, changes) {
    const { error } = await supabase.from('kurse').update(changes).eq('id', id)
    return error
  }

  async function addCourse(courseTypeSlug) {
    // Manche Kursarten haben eine abweichende Standarddauer (z.B. Schwangerfit
    // immer 75 statt 60 Minuten) - siehe defaultDauerMin in courseTypes.js.
    const dauerMin = getCourseTypeBySlug(courseTypeSlug)?.defaultDauerMin || 60

    const { data, error } = await supabase
      .from('kurse')
      .insert({
        course_type: courseTypeSlug,
        name: 'Neuer Kurs',
        termine: 5,
        dauer_min: dauerMin,
        preis: 80,
        max_teilnehmerinnen: 10,
        sichtbar_auf_website: false,
      })
      .select()
      .single()

    if (error) {
      alert('Kurs konnte nicht angelegt werden: ' + error.message)
      return
    }
    setCourses((prev) => [...prev, data])
  }

  const coursesForActiveType = courses.filter((c) => c.course_type === activeType)
  const activeTypeConfig = COURSE_TYPES.find((t) => t.slug === activeType)

  // Kurse chronologisch sortieren und in Karteikarten pro Jahr gruppieren.
  // Online-Kurse stehen dabei innerhalb ihres Jahres immer ganz unten, hinter
  // den Präsenzterminen.
  const coursesSortiert = [...coursesForActiveType].sort((a, b) => {
    const aOnline = a.ist_online ? 1 : 0
    const bOnline = b.ist_online ? 1 : 0
    if (aOnline !== bOnline) return aOnline - bOnline
    const da = kursSortDatum(a)
    const db = kursSortDatum(b)
    if (!da && !db) return 0
    if (!da) return 1
    if (!db) return -1
    return da < db ? -1 : da > db ? 1 : 0
  })

  const jahresGruppen = new Map()
  coursesSortiert.forEach((course) => {
    const datum = kursSortDatum(course)
    const jahr = datum ? datum.slice(0, 4) : OHNE_TERMIN
    if (!jahresGruppen.has(jahr)) jahresGruppen.set(jahr, [])
    jahresGruppen.get(jahr).push(course)
  })

  // Kursabfrage-Kandidaten für diese Kursart (plus solche mit noch
  // unbekannter/falscher Kursart-Erkennung - die sollen nicht in keinem Tab
  // untergehen, deshalb erscheinen sie auf jedem Tab, bis die Kursart
  // korrigiert wurde) nach Jahr gruppieren.
  const importRowsFuerTab = importRows.filter(
    (r) => r.form.course_type === activeType || !BEKANNTE_KURSARTEN.includes(r.form.course_type)
  )
  const importJahresGruppen = new Map()
  importRowsFuerTab.forEach((row) => {
    const jahr = row.form.start_datum ? row.form.start_datum.slice(0, 4) : OHNE_TERMIN
    if (!importJahresGruppen.has(jahr)) importJahresGruppen.set(jahr, [])
    importJahresGruppen.get(jahr).push(row)
  })

  const jahre = [...new Set([...jahresGruppen.keys(), ...importJahresGruppen.keys()])].sort((a, b) => {
    if (a === OHNE_TERMIN) return 1
    if (b === OHNE_TERMIN) return -1
    return a.localeCompare(b)
  })
  // Standardmäßig ist nur das nächste Jahr mit anstehenden Kursen (kein
  // vergangenes) aufgeklappt.
  const heuteJahr = String(new Date().getFullYear())
  const naechstesJahrMitKursen = jahre.find((j) => j !== OHNE_TERMIN && j >= heuteJahr) || jahre[0]

  function istJahrOffen(jahr) {
    return jahr in jahrOverrides ? jahrOverrides[jahr] : jahr === naechstesJahrMitKursen
  }

  function toggleJahr(jahr) {
    setJahrOverrides((prev) => ({ ...prev, [jahr]: !istJahrOffen(jahr) }))
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <img src="/logo.png" alt="Bauch · Baby · Beckenboden" className={styles.logo} />
        <h1>Bauch · Baby · Beckenboden</h1>
        <p>Kursverwaltung</p>
        <button className={styles.logoutButton} onClick={() => supabase.auth.signOut()}>
          Ausloggen
        </button>
      </div>

      <p className={styles.hint}>
        Kursdaten bearbeiten, Teilnehmerinnen verwalten und festlegen, ob der Kurs auf der jeweiligen Website-Seite
        angezeigt wird.
      </p>

      <p className={styles.hint}>
        📅 Alle Kurstermine als Google-Kalender-Feed: In Google Kalender einmalig unter "Weitere Kalender" → "Per
        URL" folgende Adresse eintragen (funktioniert nur am Desktop-Browser, danach erscheint der Kalender auch in
        der App) —{' '}
        <code>https://bauch-baby-beckenboden-buchungen.netlify.app/.netlify/functions/kalender-feed</code>. Neu
        angelegte Kurse tauchen dann automatisch auf, sobald Google den Feed das nächste Mal abruft (kann ein paar
        Stunden dauern, nicht sofort).
      </p>

      {loading && <p className={styles.hint}>Lade Kurse …</p>}
      {loadError && <p className={styles.hint}>Kurse konnten nicht geladen werden: {loadError}</p>}
      {importLoading && <p className={styles.hint}>Lade Kursabfrage-Kandidaten …</p>}
      {importError && <p className={styles.hint}>Kursabfrage konnte nicht geladen werden: {importError}</p>}

      <PaketPanel />

      <div className={styles.typeTabs}>
        {COURSE_TYPES.map((type) => (
          <button
            key={type.slug}
            className={`${styles.typeTab} ${activeType === type.slug ? styles.active : ''}`}
            onClick={() => setActiveType(type.slug)}
          >
            {type.label}
          </button>
        ))}
      </div>

      {jahre.map((jahr) => {
        const kurseDesJahres = jahresGruppen.get(jahr) || []
        const importsDesJahres = importJahresGruppen.get(jahr) || []
        const offen = istJahrOffen(jahr)
        return (
          <div className={styles.jahrGruppe} key={jahr}>
            <button
              type="button"
              className={styles.jahrHeader}
              onClick={() => toggleJahr(jahr)}
            >
              <span className={styles.jahrPfeil}>{offen ? '▾' : '▸'}</span>
              {jahr}{' '}
              <span className={styles.jahrAnzahl}>
                ({kurseDesJahres.length + importsDesJahres.length}
                {importsDesJahres.length > 0 ? `, davon ${importsDesJahres.length} aus Kursabfrage` : ''})
              </span>
            </button>
            {offen && (
              <>
                {importsDesJahres.length > 0 && (
                  <div className={styles.importList}>
                    {importsDesJahres.map((row) => (
                      <ImportCandidateCard
                        key={row.key}
                        row={row}
                        onUpdateForm={updateImportForm}
                        onImport={importRow}
                      />
                    ))}
                  </div>
                )}
                {kurseDesJahres.length > 0 && (
                  <div className={styles.courseList}>
                    {kurseDesJahres.map((course) => (
                      <CourseCard
                        key={course.id}
                        course={course}
                        siblingCourses={coursesForActiveType}
                        onUpdateLocal={updateCourseLocal}
                        onSave={saveCourse}
                        onReload={loadCourses}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}

      <button className={styles.addButton} onClick={() => addCourse(activeType)}>
        + Neuen {activeTypeConfig?.label}-Kurs anlegen
      </button>
    </div>
  )
}
