import { useEffect, useState } from 'react'
import styles from './ImportPanel.module.css'
import { supabase } from '../supabase.js'
import { COURSE_TYPES } from '../courseTypes.js'
import {
  guessCourseType,
  wochentagLabel,
  endDateForTermine,
  datesForTermine,
  ermittleDurchlaeufe,
  echteTermineFuerDurchlauf,
} from '../importParser.js'
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

    const [proxyRes, kurseRes] = await Promise.all([
      fetch('/.netlify/functions/kursabfrage-gruppen').then((r) => r.json()),
      supabase.from('kurse').select('source_gruppen_key, start_datum').not('source_gruppen_key', 'is', null),
    ])

    if (proxyRes?.error) {
      setError('Kursabfrage konnte nicht geladen werden: ' + proxyRes.error)
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
    // einmalige Kurs-Runde. Welche Termine tatsächlich EINEN Durchlauf
    // bilden, legt Karo manuell in der Kursabfrage-App per Notiz fest
    // ("voraussichtlicher Kursstart" / "voraussichtlich letzte
    // Kursstunde", siehe ermittleDurchlaeufe) - inkl. einzelner
    // Pausentermine, die innerhalb dieses Zeitraums NICHT stattfinden
    // (bbb_removed_v2). Eine einfache "nächste 5 freie Termine"-Annahme
    // ist falsch, weil Durchläufe unterschiedlich lang sein können und
    // Pausenwochen enthalten.
    const { gruppen, removed, notizen } = proxyRes || {}
    const kurse = kurseRes.data || []

    const candidates = Object.entries(gruppen || {})
      .map(([groupId, gruppe]) => {
        const praefix = groupId + '_'

        // Welche Durchlauf-Start-Daten dieser Gruppe wurden schon importiert?
        // Alt-Format (vor dieser Korrektur): source_gruppen_key = nackter groupId.
        // Neu-Format: source_gruppen_key = "<groupId>_<startDatum>".
        const importierteStarts = new Set()
        kurse.forEach((k) => {
          if (!k.source_gruppen_key) return
          if (k.source_gruppen_key === groupId) {
            if (k.start_datum) importierteStarts.add(k.start_datum)
          } else if (k.source_gruppen_key.indexOf(praefix) === 0) {
            importierteStarts.add(k.source_gruppen_key.slice(praefix.length))
          }
        })

        const durchlaeufe = ermittleDurchlaeufe(gruppe, groupId, notizen)
        const removedForGruppe = (removed || {})[groupId] || []

        // Ersten noch nicht importierten, vollständig markierten Durchlauf
        // (Start UND Ende gesetzt) mit mindestens einem echten Termin finden.
        let gewaehlterDurchlauf = null
        let termineDesDurchlaufs = null
        for (const dl of durchlaeufe) {
          if (!dl.ende || importierteStarts.has(dl.start)) continue
          const termine = echteTermineFuerDurchlauf(gruppe, dl, removedForGruppe)
          if (termine && termine.length > 0) {
            gewaehlterDurchlauf = dl
            termineDesDurchlaufs = termine
            break
          }
        }

        // Fallback nur für eine komplett neue Gruppe: noch nie importiert
        // UND noch keine einzige "Ende"-Notiz gesetzt -> ersten 5 Termine ab
        // Gruppenstart vorschlagen, damit die Gruppe nicht spurlos fehlt,
        // bevor Karo überhaupt eine Notiz gesetzt hat.
        if (!gewaehlterDurchlauf && importierteStarts.size === 0 && durchlaeufe.every((dl) => !dl.ende)) {
          const removedSet = new Set(removedForGruppe)
          const alleDaten = (gruppe.dates || []).filter((d) => !removedSet.has(d))
          const startDatum = gruppe.start || alleDaten[0]
          const abStart = alleDaten.filter((d) => d >= startDatum)
          if (abStart.length > 0) {
            gewaehlterDurchlauf = { start: startDatum, ende: null }
            termineDesDurchlaufs = abStart.slice(0, 5)
          }
        }

        if (!gewaehlterDurchlauf || !termineDesDurchlaufs || termineDesDurchlaufs.length === 0) return null

        const termineAnzahl = termineDesDurchlaufs.length
        const courseTypeGuess = guessCourseType(gruppe.name)
        const startDatum = termineDesDurchlaufs[0]
        const endDatum = termineDesDurchlaufs[termineDesDurchlaufs.length - 1]

        return {
          key: groupId + '_' + startDatum,
          groupId,
          gruppe,
          termineDesDurchlaufs,
          form: {
            course_type: courseTypeGuess,
            name: gruppe.name,
            termine: termineAnzahl,
            preis: calculatePreis(courseTypeGuess, termineAnzahl, []) ?? '',
            max_teilnehmerinnen: '',
            start_datum: startDatum,
            end_datum: endDatum,
            uhrzeit: gruppe.uhrzeit || '',
            zusatz_course_types: [],
            termin_daten: termineDesDurchlaufs,
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
          form.end_datum = endDateForTermine(r.termineDesDurchlaufs, changes.termine)
          form.termin_daten = datesForTermine(r.termineDesDurchlaufs, changes.termine)
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
                {wochentagLabel(row.gruppe.wochentag)}s, {row.gruppe.uhrzeit} Uhr — nächster Durchlauf: {row.termineDesDurchlaufs[0]} bis {row.termineDesDurchlaufs[row.termineDesDurchlaufs.length - 1]}
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
