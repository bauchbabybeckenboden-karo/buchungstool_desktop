import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import styles from './Booking.module.css'
import { getCourseTypeBySlug } from '../courseTypes.js'
import { supabase } from '../supabase.js'

function formatDatumDE(isoDatum) {
  if (!isoDatum) return ''
  const [jahr, monat, tag] = isoDatum.split('-')
  return `${tag}.${monat}.${jahr}`
}

// Kurzformat ohne Jahr, z.B. "23.10." - fürs Aneinanderreihen mehrerer Termine.
function formatDatumKurz(isoDatum) {
  if (!isoDatum) return ''
  const [, monat, tag] = isoDatum.split('-')
  return `${tag}.${monat}.`
}

const WOCHENTAGE_PLURAL = [
  'Sonntags', 'Montags', 'Dienstags', 'Mittwochs', 'Donnerstags', 'Freitags', 'Samstags',
]

// Ermittelt den Wochentag (als "Freitags" o.ä.) aus dem ersten Einzeltermin
// bzw. dem Start-Datum eines Kurses, für die kleine Beschriftung über jeder
// Termin-Kachel.
function wochentagVonKurs(course) {
  const datum = (course.termin_daten && course.termin_daten[0]) || course.start_datum
  if (!datum) return ''
  const tag = new Date(datum + 'T00:00:00').getDay()
  return WOCHENTAGE_PLURAL[tag] || ''
}

// "23.10., 30.10., 13.11., 20.11. & 27.11.2026" - alle bis auf den letzten
// Termin kurz (ohne Jahr), der letzte mit vollem Jahr und "&" davor.
function formatTerminlisteKurz(dates) {
  if (!dates || dates.length === 0) return ''
  if (dates.length === 1) return formatDatumDE(dates[0])
  const vorherige = dates.slice(0, -1).map(formatDatumKurz).join(', ')
  const letzter = formatDatumDE(dates[dates.length - 1])
  return `${vorherige} & ${letzter}`
}

function terminDatenOderRange(course) {
  if (course.termin_daten && course.termin_daten.length > 0) return course.termin_daten
  if (course.start_datum && course.end_datum) return [course.start_datum, course.end_datum]
  return []
}

// Eine einzelne Termin-Kachel im Stil von Karos bisheriger, von Hand
// gepflegter Setmore-Einbindung (Tabler-Icons, "Wenige Plätze
// verfügbar"-Hinweis, Pin + Terminliste) - hier automatisch aus den
// Kursdaten erzeugt statt manuell im HTML-Block getippt.
function TerminBox({ course, label, comboLabel, spotsLeft, selected, onSelect }) {
  const datum = course.termin_daten?.[0] || course.start_datum
  const zeitpunkt = `${formatDatumDE(datum)} · ${course.uhrzeit || ''}`.trim()

  let titelText
  let istWarnung = false
  if (comboLabel) {
    titelText = `PLUS ${comboLabel} ab ${zeitpunkt}`
  } else if (spotsLeft !== null && spotsLeft <= 0) {
    titelText = `Ausgebucht ${zeitpunkt}`
    istWarnung = true
  } else if (spotsLeft !== null && spotsLeft <= 3) {
    titelText = `Wenige Plätze verfügbar ${zeitpunkt}`
    istWarnung = true
  } else {
    titelText = zeitpunkt
  }

  const ausgebucht = spotsLeft !== null && spotsLeft <= 0
  const terminliste = formatTerminlisteKurz(terminDatenOderRange(course))

  const klassen = [styles.termineBox]
  if (istWarnung) klassen.push(styles.termineBoxHighlight)
  if (selected) klassen.push(styles.termineBoxSelected)
  if (ausgebucht) klassen.push(styles.termineBoxDisabled)

  return (
    <div
      className={klassen.join(' ')}
      onClick={() => { if (!ausgebucht) onSelect(course.id) }}
      role="button"
      tabIndex={ausgebucht ? -1 : 0}
    >
      <i className={`ti ti-calendar ${styles.termineIcon}`} />
      <div className={styles.termineTextGroup}>
        <p className={styles.termineLabel}>{label}</p>
        <p className={`${styles.termineText} ${styles.termineTextBold}`}>{titelText}</p>
        <p className={styles.termineText}>{course.termine} Termine · {course.preis}€</p>
        {terminliste && <p className={styles.termineDatesLine}>📍 {terminliste}</p>}
      </div>
      {!ausgebucht && <i className={`ti ti-arrow-right ${styles.termineArrow}`} />}
    </div>
  )
}

function ExtraFields({ courseTypeSlug, values, onChange }) {
  if (courseTypeSlug === 'schwangerfit') {
    return (
      <div className={styles.section}>
        <h3>Schwangerfit</h3>
        <div className={styles.checkboxGroup}>
          <input
            type="checkbox"
            id="sportverbot"
            required
            checked={values.sportverbot || false}
            onChange={(e) => onChange('sportverbot', e.target.checked)}
          />
          <label htmlFor="sportverbot">Ich habe kein Sportverbot *</label>
        </div>
        <div className={`${styles.row} ${styles.rowFull}`}>
          <div className={styles.group}>
            <label>Entbindungstermin (ET) *</label>
            <input type="date" required value={values.et || ''} onChange={(e) => onChange('et', e.target.value)} />
          </div>
        </div>
        <div className={`${styles.row} ${styles.rowFull}`}>
          <div className={styles.group}>
            <label>Notfallkontakt - Name *</label>
            <input type="text" required value={values.notfallName || ''} onChange={(e) => onChange('notfallName', e.target.value)} />
          </div>
        </div>
        <div className={`${styles.row} ${styles.rowFull}`}>
          <div className={styles.group}>
            <label>Notfallkontakt - Telefon *</label>
            <input type="tel" required value={values.notfallTel || ''} onChange={(e) => onChange('notfallTel', e.target.value)} />
          </div>
        </div>
      </div>
    )
  }

  if (courseTypeSlug === 'somatic-yoga') {
    return (
      <div className={styles.section}>
        <h3>Somatic Yoga</h3>
        <div className={styles.checkboxGroup}>
          <input
            type="checkbox"
            id="yoga-therapie"
            required
            checked={values.yogaTherapie || false}
            onChange={(e) => onChange('yogaTherapie', e.target.checked)}
          />
          <label htmlFor="yoga-therapie">Mir ist bewusst, dass diese Kurse keine Therapie ersetzen *</label>
        </div>
        <div className={styles.checkboxGroup}>
          <input
            type="checkbox"
            id="yoga-raum"
            required
            checked={values.yogaRaum || false}
            onChange={(e) => onChange('yogaRaum', e.target.checked)}
          />
          <label htmlFor="yoga-raum">Ich respektiere den Raum anderer Kursteilnehmerinnen *</label>
        </div>
      </div>
    )
  }

  if (courseTypeSlug === 'koerpermitte-beckenboden') {
    return (
      <div className={styles.section}>
        <h3>Körpermitte & Beckenboden</h3>
        <div className={styles.checkboxGroup}>
          <input
            type="checkbox"
            id="koerpergrenzen"
            required
            checked={values.koerpergrenzen || false}
            onChange={(e) => onChange('koerpergrenzen', e.target.checked)}
          />
          <label htmlFor="koerpergrenzen">Ich höre gut auf meinen Körper und respektiere meine eigenen Grenzen *</label>
        </div>
        <div className={`${styles.row} ${styles.rowFull}`}>
          <div className={styles.group}>
            <label>Entbindungstermin (ET) - falls zutreffend</label>
            <input type="date" value={values.et || ''} onChange={(e) => onChange('et', e.target.value)} />
          </div>
        </div>
        <div className={styles.infoBox}>
          Info für Mütter: Die Babys sollten mindestens 6 Wochen alt sein, besser 8 Wochen. Der Kurs ist
          aber für alle Frauen offen, die sich mit ihrer Körpermitte beschäftigen mögen – ganz egal ob
          Mutter oder Alter.
        </div>
      </div>
    )
  }

  return null
}

const initialGeneral = {
  vorname: '', nachname: '', email: '', telefon: '', strasse: '', plz: '', ort: '',
  dsgvo: false, antirassismus: false,
}

export default function Booking() {
  const { courseTypeSlug } = useParams()
  const courseType = getCourseTypeBySlug(courseTypeSlug)

  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [bookingCounts, setBookingCounts] = useState({})
  const [selectedId, setSelectedId] = useState('')
  const [general, setGeneral] = useState(initialGeneral)
  const [extra, setExtra] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [submitted, setSubmitted] = useState(false)

  // Meldet die tatsächliche Seitenhöhe an ein einbettendes iFrame auf der
  // Homepage, damit dieses sich automatisch anpasst (die Buchungsseite
  // wird länger, sobald ein Kurs ausgewählt ist oder ein Fehler
  // erscheint - ein fest eingestelltes iFrame würde sonst abschneiden
  // oder unnötig scrollen).
  useEffect(() => {
    if (window.parent === window) return // nicht eingebettet, kein iFrame vorhanden
    function sendeHoehe() {
      window.parent.postMessage(
        { type: 'bbb-booking-resize', height: document.documentElement.scrollHeight },
        '*'
      )
    }
    sendeHoehe()
    const observer = new ResizeObserver(sendeHoehe)
    observer.observe(document.documentElement)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!courseType) return
    let active = true
    setLoading(true)
    supabase
      .from('kurse')
      .select('*')
      .or(`course_type.eq.${courseTypeSlug},zusatz_course_types.cs.{${courseTypeSlug}}`)
      .eq('sichtbar_auf_website', true)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!active) return
        if (error) setLoadError(error.message)
        else setCourses(data || [])
        setLoading(false)
      })
    return () => { active = false }
  }, [courseTypeSlug, courseType])

  // Belegungszahlen pro Kurs laden, um "Wenige Plätze verfügbar" / "Ausgebucht"
  // auf den Termin-Kacheln anzuzeigen.
  useEffect(() => {
    if (courses.length === 0) {
      setBookingCounts({})
      return
    }
    let active = true
    supabase
      .from('buchungen')
      .select('kurs_id')
      .in('kurs_id', courses.map((c) => c.id))
      .then(({ data }) => {
        if (!active) return
        const counts = {}
        ;(data || []).forEach((b) => { counts[b.kurs_id] = (counts[b.kurs_id] || 0) + 1 })
        setBookingCounts(counts)
      })
    return () => { active = false }
  }, [courses])

  const selectedCourse = courses.find((c) => c.id === selectedId)

  // Hauptkurse (diese Seite ist ihr eigentlicher Kurstyp) und Kombi-Kurse
  // (dieser Kurstyp ist hier nur als Zusatzoption angehängt) getrennt
  // aufbereiten - je eine eigene Kachel mit passender Beschriftung.
  const primaerKurse = courses.filter((c) => c.course_type === courseTypeSlug)
  const komboKurse = courses.filter((c) => c.course_type !== courseTypeSlug)

  function spotsLeftFuer(course) {
    if (!course.max_teilnehmerinnen) return null
    return course.max_teilnehmerinnen - (bookingCounts[course.id] || 0)
  }

  if (!courseType) {
    return <div className={styles.container}>Unbekannter Kurstyp.</div>
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)

    const { error } = await supabase.from('buchungen').insert({
      kurs_id: selectedCourse.id,
      vorname: general.vorname,
      nachname: general.nachname,
      email: general.email,
      telefon: general.telefon,
      strasse: general.strasse,
      plz: general.plz,
      ort: general.ort,
      dsgvo_akzeptiert: general.dsgvo,
      antirassismus_akzeptiert: general.antirassismus,
      zusatzfelder: extra,
    })

    setSubmitting(false)
    if (error) {
      setSubmitError('Die Anmeldung konnte nicht gesendet werden. Bitte versuch es erneut.')
      return
    }
    setSubmitted(true)

    // E-Mails verschicken (Bestätigung an Teilnehmerin + Benachrichtigung an Karo).
    // Ein Fehler hier soll die bereits erfolgreiche Anmeldung nicht mehr beeinflussen.
    fetch('/.netlify/functions/send-booking-emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buchung: { ...general, zusatzfelder: extra },
        kurs: selectedCourse,
      }),
    }).catch(() => {})
  }

  if (submitted) {
    return (
      <div className={styles.container}>
        <div className={styles.details}>
          <h3>Vielen Dank für deine Anmeldung!</h3>
          <p>Du erhältst in Kürze eine Bestätigungsemail.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.logoHeader}>
        <img src="/logo.png" alt="Bauch · Baby · Beckenboden" className={styles.logo} />
      </div>

      <div className={styles.termineSection}>
        {loading && <p className={styles.emptyLight}>Lade Kurse …</p>}
        {loadError && <p className={styles.emptyLight}>Kurse konnten nicht geladen werden.</p>}
        {!loading && !loadError && courses.length === 0 && (
          <p className={styles.emptyLight}>Aktuell sind keine {courseType.label}-Kurse zur Anmeldung freigegeben.</p>
        )}
        {primaerKurse.map((c) => (
          <TerminBox
            key={c.id}
            course={c}
            label={wochentagVonKurs(c)}
            spotsLeft={spotsLeftFuer(c)}
            selected={selectedId === c.id}
            onSelect={setSelectedId}
          />
        ))}
        {komboKurse.map((c) => (
          <TerminBox
            key={c.id}
            course={c}
            label="Kombi-Kurse"
            comboLabel={getCourseTypeBySlug(c.course_type)?.label || c.course_type}
            spotsLeft={spotsLeftFuer(c)}
            selected={selectedId === c.id}
            onSelect={setSelectedId}
          />
        ))}
      </div>

      {selectedCourse && (
        <>
          <div className={styles.details}>
            <h3>{selectedCourse.name}</h3>
            <span className={styles.datesBig}>{selectedCourse.termine} Termine à {selectedCourse.dauer_min} mins</span>
            {selectedCourse.termin_daten && selectedCourse.termin_daten.length > 0 ? (
              <div className={styles.terminListe}>
                {selectedCourse.termin_daten.map((datum) => (
                  <span key={datum} className={styles.terminDatum}>{formatDatumDE(datum)}</span>
                ))}
              </div>
            ) : (
              selectedCourse.start_datum && selectedCourse.end_datum && (
                <span className={styles.datesBig}>
                  {new Date(selectedCourse.start_datum).toLocaleDateString('de-DE')} – {new Date(selectedCourse.end_datum).toLocaleDateString('de-DE')}
                </span>
              )
            )}
            <span className={styles.price}>€{selectedCourse.preis}</span>
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.section}>
              <h3>Deine Angaben</h3>
              <div className={styles.row}>
                <div className={styles.group}>
                  <label>Vorname *</label>
                  <input type="text" required value={general.vorname} onChange={(e) => setGeneral({ ...general, vorname: e.target.value })} />
                </div>
                <div className={styles.group}>
                  <label>Nachname *</label>
                  <input type="text" required value={general.nachname} onChange={(e) => setGeneral({ ...general, nachname: e.target.value })} />
                </div>
              </div>
              <div className={styles.row}>
                <div className={styles.group}>
                  <label>Email-Adresse *</label>
                  <input type="email" required value={general.email} onChange={(e) => setGeneral({ ...general, email: e.target.value })} />
                </div>
                <div className={styles.group}>
                  <label>Telefonnummer *</label>
                  <input type="tel" required value={general.telefon} onChange={(e) => setGeneral({ ...general, telefon: e.target.value })} />
                </div>
              </div>
              <div className={`${styles.row} ${styles.rowFull}`}>
                <div className={styles.group}>
                  <label>Straße & Hausnummer *</label>
                  <input type="text" required value={general.strasse} onChange={(e) => setGeneral({ ...general, strasse: e.target.value })} />
                </div>
              </div>
              <div className={styles.row}>
                <div className={styles.group}>
                  <label>PLZ *</label>
                  <input type="text" required value={general.plz} onChange={(e) => setGeneral({ ...general, plz: e.target.value })} />
                </div>
                <div className={styles.group}>
                  <label>Ort *</label>
                  <input type="text" required value={general.ort} onChange={(e) => setGeneral({ ...general, ort: e.target.value })} />
                </div>
              </div>
              <div className={styles.checkboxGroup}>
                <input type="checkbox" id="dsgvo" required checked={general.dsgvo} onChange={(e) => setGeneral({ ...general, dsgvo: e.target.checked })} />
                <label htmlFor="dsgvo">Ich habe die Datenschutzerklärung gelesen und akzeptiert *</label>
              </div>
              <div className={styles.checkboxGroup}>
                <input type="checkbox" id="antirassismus" required checked={general.antirassismus} onChange={(e) => setGeneral({ ...general, antirassismus: e.target.checked })} />
                <label htmlFor="antirassismus">
                  Ich bekenne mich zu einem respektvollen, diskriminierungsfreien Miteinander und lehne
                  Rassismus in jeder Form ab *
                </label>
              </div>
            </div>

            <ExtraFields
              courseTypeSlug={selectedCourse.course_type}
              values={extra}
              onChange={(field, value) => setExtra({ ...extra, [field]: value })}
            />

            {submitError && <p className={styles.empty}>{submitError}</p>}

            <button type="submit" className={styles.submitButton} disabled={submitting}>
              {submitting ? 'Wird gesendet …' : 'Anmeldung absenden'}
            </button>
          </form>
        </>
      )}
    </div>
  )
}
