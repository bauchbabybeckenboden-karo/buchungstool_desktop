import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import styles from './Booking.module.css'
import { getCourseTypeBySlug } from '../courseTypes.js'
import { supabase } from '../supabase.js'

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
  const [selectedId, setSelectedId] = useState('')
  const [general, setGeneral] = useState(initialGeneral)
  const [extra, setExtra] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!courseType) return
    let active = true
    setLoading(true)
    supabase
      .from('kurse')
      .select('*')
      .eq('course_type', courseTypeSlug)
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

  const selectedCourse = courses.find((c) => c.id === selectedId)

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
      <div className={styles.selector}>
        <label htmlFor="course-select">Wähle deinen Kurstermin:</label>
        <select id="course-select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">-- Bitte wählen --</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} (€{c.preis})
            </option>
          ))}
        </select>
        {loading && <p className={styles.empty}>Lade Kurse …</p>}
        {loadError && <p className={styles.empty}>Kurse konnten nicht geladen werden.</p>}
        {!loading && !loadError && courses.length === 0 && (
          <p className={styles.empty}>Aktuell sind keine {courseType.label}-Kurse zur Anmeldung freigegeben.</p>
        )}
      </div>

      {selectedCourse && (
        <>
          <div className={styles.details}>
            <h3>{selectedCourse.name}</h3>
            <span className={styles.datesBig}>{selectedCourse.termine} Termine à {selectedCourse.dauer_min} mins</span>
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
              courseTypeSlug={courseTypeSlug}
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
