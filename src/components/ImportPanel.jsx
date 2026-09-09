import { useEffect, useState } from 'react'
import styles from './ImportPanel.module.css'
import { supabase } from '../supabase.js'
import { COURSE_TYPES } from '../courseTypes.js'
import { guessCourseType, wochentagLabel, endDateForTermine, datesForTermine } from '../importParser.js'
import { calculatePreis } from '../pricing.js'

export default function ImportPanel({ onImported }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [rows, setRows] = useState([]) // { key, gruppe, form }

  useEffect(() => {
    if (open) loadCandidates()
  }, [open])

  async function loadCandidates() {
    setLoading(true)
    setError(null)

    const [gruppenRes, kurseRes] = await Promise.all([
      fetch('/.netlify/functions/kursabfrage-gruppen').then((r) => r.json()),
      supabase.from('kurse').select('source_gruppen_key, termin_daten').not('source_gruppen_key', 'is', null),
    ])

    if (gruppenRes?.error) {
      setError('Kursabfrage konnte nicht geladen werden: ' + gruppenRes.error)
      setLoading(false)
      return
    }
    if (kurseRes.error) {
      setError(kurseRes.error.message)
      setLoading(false)
      return
    }

    // Eine Kursabfrage-"Gruppe" ist ein DAUERHAFTER wöchentlicher Termin
    // (die dates-Liste reicht oft jahrelang in die Zukunft) - keine
    // einmalige 5-Termine-Kurs-Runde. Ein Kurs aus dieser Gruppe zu
    // importieren darf die Gruppe deshalb NICHT für immer ausblenden,
    // sonst verschwindet jeder folgende Kurs-Durchlauf (z.B. die
    // nächsten 5 Termine nach den schon importierten) unwiderruflich aus
    // der Vorschlagsliste. Stattdessen: pro Gruppe alle bereits über
    // bestehende Kurse "verbrauchten" Einzeltermine sammeln (anhand von
    // source_gruppen_key mit dem Präfix "<gruppenId>_") und immer den
    // nächsten noch nicht verbrauchten Termin-Block vorschlagen.
    const kurse = kurseRes.data || []
    const candidates = Object.entries(gruppenRes || {})
      .map(([groupId, gruppe]) => {
        const praefix = groupId + '_'
        const verbraucht = new Set()
        kurse.forEach((k) => {
          if (!k.source_gruppen_key || !Array.isArray(k.termin_daten)) return
          // Ältere Importe (vor dieser Korrektur) haben den nackten
          // groupId als source_gruppen_key gespeichert (Alt-Format);
          // neue Importe hängen "_<Startdatum>" an (Neu-Format, siehe
          // unten). Beide müssen als "zu dieser Gruppe gehörig" erkannt
          // werden, sonst würden schon importierte Alt-Kurse fälschlich
          // nicht als verbraucht gelten und ihre Termine erneut
          // vorgeschlagen.
          const gehoertZurGruppe = k.source_gruppen_key === groupId || k.source_gruppen_key.indexOf(praefix) === 0
          if (gehoertZurGruppe) k.termin_daten.forEach((d) => verbraucht.add(d))
        })
        const freieDaten = (gruppe.dates || []).filter((d) => !verbraucht.has(d))
        if (freieDaten.length === 0) return null // komplett importiert, aktuell keine weiteren Termine übrig

        const defaultTermine = 5
        const courseTypeGuess = guessCourseType(gruppe.name)
        const startDatum = freieDaten[0]
        return {
          key: groupId + '_' + startDatum,
          groupId,
          gruppe,
          freieDaten,
          form: {
            course_type: courseTypeGuess,
            name: gruppe.name,
            termine: defaultTermine,
            preis: calculatePreis(courseTypeGuess, defaultTermine, []) ?? '',
            max_teilnehmerinnen: '',
            start_datum: startDatum,
            end_datum: endDateForTermine(freieDaten, defaultTermine),
            uhrzeit: gruppe.uhrzeit || '',
            zusatz_course_types: [],
            termin_daten: datesForTermine(freieDaten, defaultTermine),
          },
        }
      })
      .filter(Boolean)

    setRows(candidates)
    setLoading(false)
  }

  function updateForm(key, changes) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r
        const form = { ...r.form, ...changes }
        // Wenn sich die Anzahl Termine ändert, End-Datum und Einzeltermine aus den noch freien
        // Terminen dieser Gruppe neu berechnen (nicht aus der kompletten, oft jahrelangen Liste).
        if ('termine' in changes) {
          form.end_datum = endDateForTermine(r.freieDaten, changes.termine)
          form.termin_daten = datesForTermine(r.freieDaten, changes.termine)
        }
        // Preis automatisch nach Karos Preisformel neu berechnen, wenn Kursart/Termine/Kombikurs sich ändern.
        if ('termine' in changes || 'course_type' in changes || 'zusatz_course_types' in changes) {
          const neuerPreis = calculatePreis(form.course_type, form.termine, form.zusatz_course_types)
          if (neuerPreis !== null) form.preis = neuerPreis
        }
        return { ...r, form }
      })
    )
  }

  async function importRow(row) {
    const { course_type, name, termine, preis, max_teilnehmerinnen, start_datum, end_datum, uhrzeit, zusatz_course_types, termin_daten } = row.form

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
      uhrzeit: uhrzeit || null,
      zusatz_course_types: zusatz_course_types || [],
      termin_daten: termin_daten && termin_daten.length ? termin_daten : null,
      sichtbar_auf_website: false,
      source_gruppen_key: row.key,
    })

    if (error) {
      alert('Import fehlgeschlagen: ' + error.message)
      return
    }

    setRows((prev) => prev.filter((r) => r.key !== row.key))
    if (onImported) onImported()
  }

  return (
    <div className={styles.panel}>
      <button className={styles.toggle} onClick={() => setOpen((v) => !v)}>
        {open ? 'Import ausblenden' : 'Aus Kursabfrage importieren'}
      </button>

      {open && (
        <div className={styles.content}>
          <p className={styles.hint}>
            Termine (Wochentag, Uhrzeit, Datumsliste) kommen direkt aus der Kursabfrage-App — Kursart, Preis
            und maximale Teilnehmerinnenzahl bitte einmal ergänzen. Das End-Datum wird automatisch aus der
            gewählten Anzahl Termine berechnet.
          </p>

          {loading && <p className={styles.hint}>Lade …</p>}
          {error && <p className={styles.hint}>Fehler: {error}</p>}
          {!loading && !error && rows.length === 0 && (
            <p className={styles.hint}>Keine neuen Gruppen zum Importieren gefunden.</p>
          )}

          {rows.map((row) => (
            <div className={styles.card} key={row.key}>
              <div className={styles.original}>
                <strong>Aus Kursabfrage:</strong> {row.gruppe.name}
                <br />
                {wochentagLabel(row.gruppe.wochentag)}s, {row.gruppe.uhrzeit} Uhr — nächster freier Termin-Block ab: {row.freieDaten[0]}
              </div>

              <div className={styles.warning}>
                Falls Kombikurs: zusätzlich anzeigen auf
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
                          updateForm(row.key, { zusatz_course_types: next })
                        }}
                      />
                      {t.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className={styles.fields}>
                <div>
                  <label>Kursart</label>
                  <select
                    value={row.form.course_type}
                    onChange={(e) => updateForm(row.key, { course_type: e.target.value })}
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
                    onChange={(e) => updateForm(row.key, { name: e.target.value })}
                  />
                </div>
                <div>
                  <label>Anzahl Termine</label>
                  <input
                    type="number"
                    value={row.form.termine}
                    onChange={(e) => updateForm(row.key, { termine: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label>Preis (€, automatisch)</label>
                  <input
                    type="number"
                    value={row.form.preis}
                    onChange={(e) => updateForm(row.key, { preis: e.target.value })}
                  />
                </div>
                <div>
                  <label>Max. Teilnehmerinnen</label>
                  <input
                    type="number"
                    value={row.form.max_teilnehmerinnen}
                    onChange={(e) => updateForm(row.key, { max_teilnehmerinnen: e.target.value })}
                  />
                </div>
                <div>
                  <label>Erster Termin</label>
                  <input
                    type="date"
                    value={row.form.start_datum}
                    onChange={(e) => updateForm(row.key, { start_datum: e.target.value })}
                  />
                </div>
                <div>
                  <label>Letzter Termin (automatisch)</label>
                  <input
                    type="date"
                    value={row.form.end_datum}
                    onChange={(e) => updateForm(row.key, { end_datum: e.target.value })}
                  />
                </div>
              </div>

              {row.form.termin_daten && row.form.termin_daten.length > 0 && (
                <div className={styles.original}>
                  <strong>Einzeltermine ({row.form.termin_daten.length}):</strong>{' '}
                  {row.form.termin_daten.map((d) => d.split('-').reverse().join('.')).join(', ')}
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
