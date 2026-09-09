import { useEffect, useState } from 'react'
import styles from './ImportPanel.module.css'
import { supabase } from '../supabase.js'
import { COURSE_TYPES } from '../courseTypes.js'
import { parseUmfrageTitel, parseTerminDates } from '../importParser.js'

export default function ImportPanel({ onImported }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [rows, setRows] = useState([]) // { umfrage, form }

  useEffect(() => {
    if (open) loadCandidates()
  }, [open])

  async function loadCandidates() {
    setLoading(true)
    setError(null)

    const [{ data: umfragen, error: umfragenError }, { data: kurse, error: kurseError }] = await Promise.all([
      supabase.from('umfragen').select('id, titel, ort, termine, created_at').order('created_at', { ascending: false }),
      supabase.from('kurse').select('source_umfrage_id').not('source_umfrage_id', 'is', null),
    ])

    if (umfragenError || kurseError) {
      setError((umfragenError || kurseError).message)
      setLoading(false)
      return
    }

    const alreadyImported = new Set((kurse || []).map((k) => k.source_umfrage_id))
    const candidates = (umfragen || [])
      .filter((u) => !alreadyImported.has(u.id))
      .map((u) => {
        const guess = parseUmfrageTitel(u.titel)
        const dates = parseTerminDates(u.ort, u.termine)
        return {
          umfrage: u,
          form: {
            course_type: guess.courseTypeGuess,
            name: guess.nameGuess,
            termine: guess.termineGuess || '',
            preis: guess.preisGuess || '',
            max_teilnehmerinnen: '',
            start_datum: dates.startDatumGuess,
            end_datum: dates.endDatumGuess,
            zusatz_course_types: [],
            isCombo: guess.isCombo,
          },
        }
      })

    setRows(candidates)
    setLoading(false)
  }

  function updateForm(umfrageId, changes) {
    setRows((prev) =>
      prev.map((r) => (r.umfrage.id === umfrageId ? { ...r, form: { ...r.form, ...changes } } : r))
    )
  }

  async function importRow(row) {
    const { course_type, name, termine, preis, max_teilnehmerinnen, start_datum, end_datum, zusatz_course_types } = row.form

    if (!course_type || !name || !termine || preis === '' || !max_teilnehmerinnen) {
      alert('Bitte alle Felder ausfüllen (Kursart, Name, Termine, Preis, max. Teilnehmerinnen) bevor du übernimmst.')
      return
    }

    const { error } = await supabase.from('kurse').insert({
      course_type,
      name,
      termine: Number(termine),
      preis: Number(preis),
      max_teilnehmerinnen: Number(max_teilnehmerinnen),
      start_datum: start_datum || null,
      end_datum: end_datum || null,
      zusatz_course_types: zusatz_course_types || [],
      sichtbar_auf_website: false,
      source_umfrage_id: row.umfrage.id,
    })

    if (error) {
      alert('Import fehlgeschlagen: ' + error.message)
      return
    }

    setRows((prev) => prev.filter((r) => r.umfrage.id !== row.umfrage.id))
    if (onImported) onImported()
  }

  return (
    <div className={styles.panel}>
      <button className={styles.toggle} onClick={() => setOpen((v) => !v)}>
        {open ? 'Import ausblenden' : 'Aus Terminumfrage importieren'}
      </button>

      {open && (
        <div className={styles.content}>
          <p className={styles.hint}>
            Vorschläge werden aus dem Titel der Terminumfrage abgeleitet (Kursart, Preis, Anzahl Termine) —
            bitte vor dem Übernehmen prüfen und ggf. korrigieren. Bei Kombikursen wird die Kursart nicht
            automatisch geraten.
          </p>

          {loading && <p className={styles.hint}>Lade …</p>}
          {error && <p className={styles.hint}>Fehler: {error}</p>}
          {!loading && !error && rows.length === 0 && (
            <p className={styles.hint}>Keine neuen Umfragen zum Importieren gefunden.</p>
          )}

          {rows.map((row) => (
            <div className={styles.card} key={row.umfrage.id}>
              <div className={styles.original}>
                <strong>Original-Titel:</strong> {row.umfrage.titel}
                <br />
                <strong>Termine (Feld "Ort"):</strong> {row.umfrage.ort}
              </div>

              {row.form.isCombo && (
                <div className={styles.warning}>
                  Kombikurs erkannt — enthält vermutlich mehrere Kursarten. Wähle unten die Haupt-Kursart und
                  hake zusätzlich an, auf welchen weiteren Seiten der Kurs ebenfalls erscheinen soll.
                  <div className={styles.comboOptions}>
                    {COURSE_TYPES.filter((t) => t.slug !== row.form.course_type).map((t) => (
                      <label key={t.slug} className={styles.comboOption}>
                        <input
                          type="checkbox"
                          checked={(row.form.zusatz_course_types || []).includes(t.slug)}
                          onChange={() => {
                            const current = row.form.zusatz_course_types || []
                            const next = current.includes(t.slug)
                              ? current.filter((s) => s !== t.slug)
                              : [...current, t.slug]
                            updateForm(row.umfrage.id, { zusatz_course_types: next })
                          }}
                        />
                        {t.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className={styles.fields}>
                <div>
                  <label>Kursart</label>
                  <select
                    value={row.form.course_type}
                    onChange={(e) => updateForm(row.umfrage.id, { course_type: e.target.value })}
                  >
                    <option value="">-- wählen --</option>
                    {COURSE_TYPES.map((t) => (
                      <option key={t.slug} value={t.slug}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.fieldFull}>
                  <label>Kursname</label>
                  <input
                    type="text"
                    value={row.form.name}
                    onChange={(e) => updateForm(row.umfrage.id, { name: e.target.value })}
                  />
                </div>
                <div>
                  <label>Anzahl Termine</label>
                  <input
                    type="number"
                    value={row.form.termine}
                    onChange={(e) => updateForm(row.umfrage.id, { termine: e.target.value })}
                  />
                </div>
                <div>
                  <label>Preis (€)</label>
                  <input
                    type="number"
                    value={row.form.preis}
                    onChange={(e) => updateForm(row.umfrage.id, { preis: e.target.value })}
                  />
                </div>
                <div>
                  <label>Max. Teilnehmerinnen</label>
                  <input
                    type="number"
                    value={row.form.max_teilnehmerinnen}
                    onChange={(e) => updateForm(row.umfrage.id, { max_teilnehmerinnen: e.target.value })}
                  />
                </div>
                <div>
                  <label>Erster Termin</label>
                  <input
                    type="date"
                    value={row.form.start_datum}
                    onChange={(e) => updateForm(row.umfrage.id, { start_datum: e.target.value })}
                  />
                </div>
                <div>
                  <label>Letzter Termin</label>
                  <input
                    type="date"
                    value={row.form.end_datum}
                    onChange={(e) => updateForm(row.umfrage.id, { end_datum: e.target.value })}
                  />
                </div>
              </div>

              {(!row.form.start_datum || !row.form.end_datum) && (
                <div className={styles.warning}>
                  Termine konnten nicht sicher aus dem Feld "Ort" erkannt werden — bitte oben von Hand eintragen.
                </div>
              )}

              <button className={styles.importButton} onClick={() => importRow(row)}>
                Als Kurs übernehmen
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
