import { useEffect, useState } from 'react'
import styles from './CourseCard.module.css'
import { getCourseTypeBySlug, COURSE_TYPES } from '../courseTypes.js'
import { supabase } from '../supabase.js'
import { calculatePreis } from '../pricing.js'

export default function CourseCard({ course, siblingCourses, onUpdateLocal, onSave, onReload }) {
  const [showParticipants, setShowParticipants] = useState(false)
  const [participants, setParticipants] = useState([])
  const [participantsError, setParticipantsError] = useState(null)
  const [participantsLoading, setParticipantsLoading] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const courseType = getCourseTypeBySlug(course.course_type)

  useEffect(() => {
    if (showParticipants) loadParticipants()
  }, [showParticipants])

  async function loadParticipants() {
    setParticipantsLoading(true)
    const { data, error } = await supabase.from('buchungen').select('*').eq('kurs_id', course.id)
    if (error) setParticipantsError('Anmeldeliste erfordert Admin-Login (noch einzurichten).')
    else {
      setParticipants(data || [])
      setParticipantsError(null)
    }
    setParticipantsLoading(false)
  }

  async function handleField(field, value) {
    onUpdateLocal(course.id, { [field]: value })
    const error = await onSave(course.id, { [field]: value })
    setSaveError(error ? 'Speichern erfordert Admin-Login (noch einzurichten).' : null)
  }

  function toggleZusatzType(slug) {
    const current = course.zusatz_course_types || []
    const next = current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug]
    handleField('zusatz_course_types', next)
  }

  function recalcPreis() {
    const neuerPreis = calculatePreis(course.course_type, course.termine, course.zusatz_course_types || [])
    if (neuerPreis !== null) handleField('preis', neuerPreis)
  }

  async function removeParticipant(id) {
    const { error } = await supabase.from('buchungen').delete().eq('id', id)
    if (error) {
      alert('Entfernen erfordert Admin-Login (noch einzurichten).')
      return
    }
    loadParticipants()
  }

  async function moveParticipant(id, toCourseId) {
    const { error } = await supabase.from('buchungen').update({ kurs_id: toCourseId }).eq('id', id)
    if (error) {
      alert('Verschieben erfordert Admin-Login (noch einzurichten).')
      return
    }
    loadParticipants()
    if (onReload) onReload()
  }

  async function duplicateCourse() {
    // Kopiert alle Kursdaten in einen neuen, noch unsichtbaren Kurs - praktisch
    // z.B. um aus einem Präsenzkurs schnell die Online-Variante abzuleiten
    // (danach nur noch "Online-Kurs" ankreuzen und ggf. Uhrzeit anpassen).
    const {
      id, created_at, ...kopierbareFelder
    } = course

    const { error } = await supabase.from('kurse').insert({
      ...kopierbareFelder,
      name: `${course.name} (Kopie)`,
      sichtbar_auf_website: false,
      source_gruppen_key: null,
    })

    if (error) {
      alert('Duplizieren erfordert Admin-Login (noch einzurichten).')
      return
    }
    if (onReload) onReload()
  }

  async function deleteCourse() {
    // Vorher zählen, wie viele Anmeldungen betroffen wären - beim Löschen
    // eines Kurses werden über die Datenbank-Verknüpfung automatisch auch
    // ALLE dazugehörigen Anmeldungen mitgelöscht (unwiderruflich).
    const { count, error: countError } = await supabase
      .from('buchungen')
      .select('id', { count: 'exact', head: true })
      .eq('kurs_id', course.id)

    if (countError) {
      alert('Löschen erfordert Admin-Login (noch einzurichten).')
      return
    }

    const warnung =
      count > 0
        ? `Dieser Kurs hat noch ${count} Anmeldung(en). Beim Löschen werden diese Anmeldungen unwiderruflich mitgelöscht. Kurs "${course.name}" trotzdem löschen?`
        : `Kurs "${course.name}" wirklich löschen? Das kann nicht rückgängig gemacht werden.`

    if (!window.confirm(warnung)) return

    const { error } = await supabase.from('kurse').delete().eq('id', course.id)
    if (error) {
      alert('Löschen erfordert Admin-Login (noch einzurichten).')
      return
    }
    if (onReload) onReload()
  }

  return (
    <div className={styles.card}>
      <div className={styles.editFields}>
        <div className={styles.fieldFull}>
          <label>Kursname</label>
          <input value={course.name} onChange={(e) => handleField('name', e.target.value)} />
        </div>
        <div>
          <label>Anzahl Termine</label>
          <input type="number" value={course.termine} onChange={(e) => handleField('termine', Number(e.target.value))} />
        </div>
        <div>
          <label>Dauer (min)</label>
          <input type="number" value={course.dauer_min} onChange={(e) => handleField('dauer_min', Number(e.target.value))} />
        </div>
        <div>
          <label>Preis (€)</label>
          <div className={styles.preisRow}>
            <input type="number" value={course.preis} onChange={(e) => handleField('preis', Number(e.target.value))} />
            <button type="button" className={styles.calcButton} onClick={recalcPreis} title="Nach Preisliste berechnen">
              ↻
            </button>
          </div>
        </div>
        <div>
          <label>Max. Teilnehmerinnen</label>
          <input type="number" value={course.max_teilnehmerinnen} onChange={(e) => handleField('max_teilnehmerinnen', Number(e.target.value))} />
        </div>
        <div>
          <label>Erster Termin</label>
          <input type="date" value={course.start_datum || ''} onChange={(e) => handleField('start_datum', e.target.value || null)} />
        </div>
        <div>
          <label>Letzter Termin</label>
          <input type="date" value={course.end_datum || ''} onChange={(e) => handleField('end_datum', e.target.value || null)} />
        </div>
        <div>
          <label>Uhrzeit (Start)</label>
          <input type="time" value={course.uhrzeit || ''} onChange={(e) => handleField('uhrzeit', e.target.value || null)} />
        </div>
      </div>

      {saveError && <span style={{ fontSize: '11px', color: '#8b6464' }}>{saveError}</span>}

      {course.termin_daten && course.termin_daten.length > 0 && (
        <div className={styles.terminDatenBox}>
          <span className={styles.terminDatenLabel}>Einzeltermine (aus Kursabfrage, inkl. Pausenwochen):</span>
          <div className={styles.terminDatenList}>
            {course.termin_daten.map((d) => (
              <span key={d} className={styles.terminDatenChip}>{d.split('-').reverse().join('.')}</span>
            ))}
          </div>
        </div>
      )}

      <div className={styles.participantsRow}>
        <span className={styles.badge}>
          {showParticipants && !participantsError ? `${participants.length} / ${course.max_teilnehmerinnen} Plätze belegt` : 'Belegung ansehen'}
        </span>
        <button className={styles.link} onClick={() => setShowParticipants((v) => !v)}>
          {showParticipants ? 'Teilnehmerinnen ausblenden' : 'Teilnehmerinnen anzeigen'}
        </button>
      </div>

      {showParticipants && (
        <div className={styles.participantsList}>
          {participantsLoading && <span>Lade …</span>}
          {participantsError && <span>{participantsError}</span>}
          {!participantsLoading && !participantsError && participants.length === 0 && <span>Noch keine Anmeldungen.</span>}
          {!participantsError && participants.map((p) => (
            <div className={styles.participantEntry} key={p.id}>
              <span>{p.vorname} {p.nachname}</span>
              <div className={styles.participantActions}>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) moveParticipant(p.id, e.target.value)
                  }}
                >
                  <option value="">In diesem Kurs</option>
                  {siblingCourses
                    .filter((c) => c.id !== course.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>→ {c.name}</option>
                    ))}
                </select>
                <button className={styles.removeBtn} onClick={() => removeParticipant(p.id)}>
                  Entfernen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.urlHint}>
        Wird angezeigt auf: bauch-baby-beckenboden.de{courseType?.websitePath}
      </div>

      <div className={styles.comboBox}>
        <span className={styles.comboLabel}>Kombikurs — zusätzlich anzeigen auf:</span>
        <div className={styles.comboOptions}>
          {COURSE_TYPES.filter((t) => t.slug !== course.course_type).map((t) => (
            <label key={t.slug} className={styles.comboOption}>
              <input
                type="checkbox"
                checked={(course.zusatz_course_types || []).includes(t.slug)}
                onChange={() => toggleZusatzType(t.slug)}
              />
              {t.label}
            </label>
          ))}
        </div>
      </div>

      <div className={styles.checkboxRow}>
        <input
          type="checkbox"
          id={`online-${course.id}`}
          checked={course.ist_online || false}
          onChange={(e) => handleField('ist_online', e.target.checked)}
        />
        <label htmlFor={`online-${course.id}`}>Online-Kurs (zeigt "ONLINE" auf der Kachel)</label>
      </div>

      <div className={styles.checkboxRow}>
        <input
          type="checkbox"
          id={`visible-${course.id}`}
          checked={course.sichtbar_auf_website}
          onChange={(e) => handleField('sichtbar_auf_website', e.target.checked)}
        />
        <label htmlFor={`visible-${course.id}`}>Auf Website zeigen</label>
      </div>

      <div className={styles.cardActions}>
        <button type="button" className={styles.duplicateButton} onClick={duplicateCourse}>
          Duplizieren
        </button>
        <button type="button" className={styles.deleteButton} onClick={deleteCourse}>
          Kurs löschen
        </button>
      </div>
    </div>
  )
}
