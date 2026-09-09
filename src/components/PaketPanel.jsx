import { useEffect, useState } from 'react'
import styles from './PaketPanel.module.css'
import { supabase } from '../supabase.js'
import { getCourseTypeBySlug } from '../courseTypes.js'
import { calculatePaketPreis } from '../pricing.js'

// Verwaltung von Kombi-Paketen: zwei eigenständige, unabhängige Kurse
// (jeweils mit eigenem Zeitplan) werden zu EINER buchbaren Einheit mit
// gemeinsamem, vergünstigtem Preis gebündelt. Anders als der bestehende
// "Kombikurs"-Mechanismus in CourseCard (derselbe Kurs zusätzlich auf einer
// zweiten Kursseite anzeigen) sind hier zwei WIRKLICH verschiedene Kurse
// beteiligt, z.B. ein Mamafit- und ein Somatic-Yoga-Kurs im selben Zeitraum.
const leeresForm = { kursId1: '', kursId2: '', name: '', preis: '', sichtbar_auf_website: false }

export default function PaketPanel() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [alleKurse, setAlleKurse] = useState([])
  const [pakete, setPakete] = useState([])
  const [form, setForm] = useState(leeresForm)

  useEffect(() => {
    if (open) laden()
  }, [open])

  async function laden() {
    setLoading(true)
    setError(null)
    const [kurseRes, paketeRes] = await Promise.all([
      supabase.from('kurse').select('*').order('name', { ascending: true }),
      supabase.from('kurs_pakete').select('*').order('created_at', { ascending: true }),
    ])
    if (kurseRes.error) setError(kurseRes.error.message)
    else if (paketeRes.error) setError(paketeRes.error.message)
    else {
      setAlleKurse(kurseRes.data || [])
      setPakete(paketeRes.data || [])
    }
    setLoading(false)
  }

  function kursById(id) {
    return alleKurse.find((k) => k.id === id)
  }

  function kursLabel(kurs) {
    if (!kurs) return '(Kurs gelöscht)'
    const typLabel = getCourseTypeBySlug(kurs.course_type)?.label || kurs.course_type
    return `${kurs.name} (${typLabel}) — ${kurs.preis}€`
  }

  // Name & Preis automatisch vorschlagen, sobald beide Kurse gewählt sind -
  // beides bleibt jederzeit von Hand überschreibbar (z.B. bei krummen
  // Wunschpreisen), solange Karo den Vorschlag nicht selbst schon geändert hat.
  function updateForm(changes) {
    setForm((prev) => {
      const next = { ...prev, ...changes }
      if ('kursId1' in changes || 'kursId2' in changes) {
        const k1 = kursById(next.kursId1)
        const k2 = kursById(next.kursId2)
        const vorherigerNamensvorschlag = `${kursById(prev.kursId1)?.name || ''} + ${kursById(prev.kursId2)?.name || ''}`
        if (k1 && k2) {
          if (!prev.name || prev.name === vorherigerNamensvorschlag) {
            next.name = `${k1.name} + ${k2.name}`
          }
          const vorschlag = calculatePaketPreis(k1.preis, k2.preis)
          if (vorschlag !== null) next.preis = vorschlag
        }
      }
      return next
    })
  }

  function recalcPreis() {
    const k1 = kursById(form.kursId1)
    const k2 = kursById(form.kursId2)
    if (!k1 || !k2) return
    const vorschlag = calculatePaketPreis(k1.preis, k2.preis)
    if (vorschlag !== null) updateForm({ preis: vorschlag })
  }

  async function erstellen() {
    if (!form.kursId1 || !form.kursId2 || form.kursId1 === form.kursId2) {
      alert('Bitte zwei unterschiedliche Kurse auswählen.')
      return
    }
    if (!form.name || form.preis === '') {
      alert('Bitte Paketname und Preis angeben.')
      return
    }

    const { error } = await supabase.from('kurs_pakete').insert({
      name: form.name,
      kurs_id_1: form.kursId1,
      kurs_id_2: form.kursId2,
      preis: Number(form.preis),
      sichtbar_auf_website: form.sichtbar_auf_website,
    })

    if (error) {
      alert('Paket konnte nicht erstellt werden: ' + error.message)
      return
    }
    setForm(leeresForm)
    laden()
  }

  async function toggleSichtbar(paket) {
    const { error } = await supabase
      .from('kurs_pakete')
      .update({ sichtbar_auf_website: !paket.sichtbar_auf_website })
      .eq('id', paket.id)

    if (error) {
      alert('Speichern erfordert Admin-Login (noch einzurichten).')
      return
    }
    setPakete((prev) =>
      prev.map((p) => (p.id === paket.id ? { ...p, sichtbar_auf_website: !p.sichtbar_auf_website } : p))
    )
  }

  async function loeschen(paket) {
    const bestaetigt = window.confirm(
      `Kombi-Paket "${paket.name}" wirklich löschen? Bereits erfolgte Anmeldungen bleiben in den jeweiligen Einzelkursen erhalten, nur das Paket selbst verschwindet aus der Website-Auswahl.`
    )
    if (!bestaetigt) return

    const { error } = await supabase.from('kurs_pakete').delete().eq('id', paket.id)
    if (error) {
      alert('Löschen erfordert Admin-Login (noch einzurichten).')
      return
    }
    setPakete((prev) => prev.filter((p) => p.id !== paket.id))
  }

  const k1 = kursById(form.kursId1)
  const k2 = kursById(form.kursId2)

  return (
    <div className={styles.panel}>
      <button className={styles.toggle} onClick={() => setOpen((v) => !v)}>
        {open ? 'Kombi-Pakete ausblenden' : 'Kombi-Pakete verwalten'}
      </button>

      {open && (
        <div className={styles.content}>
          <p className={styles.hint}>
            Ein Kombi-Paket bündelt zwei eigenständige Kurse zu einer gemeinsamen Buchung — die Teilnehmerin
            meldet sich einmal an, zahlt einen gemeinsamen Preis und landet automatisch in beiden Kursen als
            Teilnehmerin (inkl. einer gemeinsamen Bestätigungsmail für beide Termine). Der Paketpreis wird
            automatisch mit 10–11% Rabatt (in 5€-Schritten) auf die Summe der beiden Einzelpreise
            vorgeschlagen, ist aber jederzeit frei änderbar.
          </p>

          {loading && <p className={styles.hint}>Lade …</p>}
          {error && <p className={styles.hint}>Fehler: {error}</p>}

          {pakete.length > 0 && (
            <div className={styles.list}>
              {pakete.map((p) => (
                <div className={styles.card} key={p.id}>
                  <strong>{p.name}</strong>
                  <span className={styles.original}>
                    {kursLabel(kursById(p.kurs_id_1))}
                    <br />
                    {kursLabel(kursById(p.kurs_id_2))}
                  </span>
                  <span>Paketpreis: {p.preis}€</span>
                  <label className={styles.comboOption}>
                    <input type="checkbox" checked={p.sichtbar_auf_website} onChange={() => toggleSichtbar(p)} />
                    Auf Website zeigen
                  </label>
                  <button type="button" className={styles.deleteButton} onClick={() => loeschen(p)}>
                    Paket löschen
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className={styles.card}>
            <strong>Neues Kombi-Paket</strong>
            <div className={styles.fields}>
              <div>
                <label>Kurs 1</label>
                <select value={form.kursId1} onChange={(e) => updateForm({ kursId1: e.target.value })}>
                  <option value="">-- wählen --</option>
                  {alleKurse.map((k) => (
                    <option key={k.id} value={k.id} disabled={k.id === form.kursId2}>
                      {kursLabel(k)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Kurs 2</label>
                <select value={form.kursId2} onChange={(e) => updateForm({ kursId2: e.target.value })}>
                  <option value="">-- wählen --</option>
                  {alleKurse.map((k) => (
                    <option key={k.id} value={k.id} disabled={k.id === form.kursId1}>
                      {kursLabel(k)}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.fieldFull}>
                <label>Paketname</label>
                <input type="text" value={form.name} onChange={(e) => updateForm({ name: e.target.value })} />
              </div>
              <div>
                <label>Paketpreis (€)</label>
                <div className={styles.preisRow}>
                  <input type="number" value={form.preis} onChange={(e) => updateForm({ preis: e.target.value })} />
                  <button
                    type="button"
                    className={styles.calcButton}
                    onClick={recalcPreis}
                    title="Automatisch berechnen (10-11% Rabatt)"
                  >
                    ↻
                  </button>
                </div>
              </div>
            </div>

            {k1 && k2 && (
              <span className={styles.original}>
                Einzelpreise: {k1.preis}€ + {k2.preis}€ = {(Number(k1.preis) + Number(k2.preis)).toFixed(2)}€ vor Rabatt
              </span>
            )}

            <label className={styles.comboOption}>
              <input
                type="checkbox"
                checked={form.sichtbar_auf_website}
                onChange={(e) => updateForm({ sichtbar_auf_website: e.target.checked })}
              />
              Auf Website zeigen
            </label>

            <button type="button" className={styles.importButton} onClick={erstellen}>
              Kombi-Paket erstellen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
