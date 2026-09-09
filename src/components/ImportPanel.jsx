import { useEffect, useState } from 'react'
import styles from './ImportPanel.module.css'
import { supabase } from '../supabase.js'
import { COURSE_TYPES } from '../courseTypes.js'
import { parseUmfrageTitel } from '../importParser.js'

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
        return {
          umfrage: u,
          form: {
            course_type: guess.courseTypeGuess,
            name: guess.nameGuess,
            termine: guess.termineGuess || '',
            preis: guess.preisGuess || '',
            max_teilnehmerinnen: '',
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
    const { course_type, name, termine, preis, max_teilnehmerinnen } = row.form

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
                  Kombikurs erkannt — enthält vermutlich mehrere Kursarten. Bitte manuell prüfen, wie das
                  am besten abgebildet wird (z.B. zwei einzelne Kurse anlegen).
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
              </div>

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
