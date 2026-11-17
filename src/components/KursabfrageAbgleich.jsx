import { useState } from 'react'
import styles from './CourseCard.module.css'
import { ermittleDurchlaeufe, echteTermineFuerDurchlauf } from '../importParser.js'
import { formatDatumDE } from '../dateUtils.js'

// Abgleich der Einzeltermine eines Kurses mit der Quelle:
// - Präsenzkurse aus der Kursabfrage: Durchlauf-Start (aus source_gruppen_key),
//   Ende-Notiz "letzte Kursstunde" und entfernte Pausentermine, wie beim Import.
// - Online-Kurse: übernehmen die Termine ihres Präsenz-Partnerkurses.
// Es wird erst etwas geändert, wenn Karo "Übernehmen" klickt. Terminzahl, Start,
// Ende und Preis rechnet danach der Datenbank-Trigger kurse_abgeleitete_felder.

function zerlegeKey(key, fallbackStart) {
  const m = /^(.*)_(\d{4}-\d{2}-\d{2})$/.exec(key || '')
  if (m) return { groupId: m[1], start: m[2] }
  return { groupId: key, start: fallbackStart }
}

async function sollTermine(course, alleKurse) {
  if (course.source_gruppen_key) {
    const { groupId, start } = zerlegeKey(course.source_gruppen_key, course.start_datum)
    const res = await fetch('/.netlify/functions/kursabfrage-gruppen').then((r) => r.json())
    if (res?.error) throw new Error('Kursabfrage nicht erreichbar: ' + res.error)
    const gruppe = (res.gruppen || {})[groupId]
    if (!gruppe) throw new Error('Die Gruppe wurde in der Kursabfrage nicht gefunden.')
    const dl = ermittleDurchlaeufe(gruppe, groupId, res.notizen).find((d) => d.start === start)
    if (!dl || !dl.ende) {
      throw new Error('In der Kursabfrage fehlt die Notiz "letzte Kursstunde" für diesen Durchlauf.')
    }
    const termine = echteTermineFuerDurchlauf(gruppe, dl, (res.removed || {})[groupId]) || []
    return { termine: [...termine].sort(), quelle: 'Kursabfrage' }
  }
  if (course.ist_online) {
    // Mehrere Präsenzkurse können auf denselben Online-Kurs zeigen (z.B. alter und neuer
    // Durchlauf): dann zählt nur der mit gleichem Start. Bleibt es mehrdeutig, wird nichts geändert.
    let kandidaten = alleKurse.filter((k) => k.online_partner_id === course.id)
    if (kandidaten.length > 1) kandidaten = kandidaten.filter((k) => k.start_datum === course.start_datum)
    if (kandidaten.length > 1) {
      throw new Error('Mehrere Präsenzkurse verweisen auf diesen Online-Kurs - bitte erst die Zuordnung prüfen.')
    }
    const partner = kandidaten[0]
    if (!partner || !Array.isArray(partner.termin_daten) || partner.termin_daten.length === 0) {
      throw new Error('Es wurde kein Präsenzkurs mit Terminen gefunden, der diesen Online-Kurs verwendet.')
    }
    return { termine: [...partner.termin_daten].sort(), quelle: 'Präsenzkurs "' + (partner.name || '').trim() + '"' }
  }
  throw new Error('Dieser Kurs hat keine Verbindung zur Kursabfrage.')
}

export default function KursabfrageAbgleich({ course, alleKurse = [], onSave, onUpdateLocal, onReload }) {
  const [status, setStatus] = useState('idle') // idle | laedt | fertig | fehler
  const [meldung, setMeldung] = useState(null)
  const [ergebnis, setErgebnis] = useState(null)

  if (!course.source_gruppen_key && !course.ist_online) return null

  async function abgleichen() {
    setStatus('laedt')
    setMeldung(null)
    try {
      const { termine, quelle } = await sollTermine(course, alleKurse)
      if (termine.length === 0) throw new Error('Die Quelle liefert keine Termine - es wird nichts geändert.')
      const ist = Array.isArray(course.termin_daten) ? course.termin_daten : []
      const hinzu = termine.filter((d) => !ist.includes(d))
      const weg = ist.filter((d) => !termine.includes(d))
      setErgebnis({ termine, quelle, hinzu, weg })
      setStatus('fertig')
    } catch (e) {
      setMeldung(e.message)
      setStatus('fehler')
    }
  }

  async function uebernehmen() {
    const error = await onSave(course.id, { termin_daten: ergebnis.termine })
    if (error) {
      setMeldung('Speichern erfordert Admin-Login.')
      setStatus('fehler')
      return
    }
    if (onReload) await onReload()
    else onUpdateLocal(course.id, { termin_daten: ergebnis.termine })
    setErgebnis(null)
    setStatus('idle')
    setMeldung('Termine übernommen. Anzahl, Ende und Preis wurden automatisch neu berechnet.')
  }

  const liste = (daten) => daten.map((d) => formatDatumDE(d)).join(', ')

  return (
    <div className={styles.terminDatenBox}>
      <button type="button" className={styles.link} onClick={abgleichen} disabled={status === 'laedt'}>
        {status === 'laedt' ? 'Prüfe …' : 'Mit Kursabfrage abgleichen'}
      </button>
      {meldung && <div style={{ fontSize: '12px', marginTop: '4px' }}>{meldung}</div>}
      {status === 'fertig' && ergebnis && (
        <div style={{ fontSize: '12px', marginTop: '6px' }}>
          {ergebnis.hinzu.length === 0 && ergebnis.weg.length === 0 ? (
            <span>Stimmt mit {ergebnis.quelle} überein ({ergebnis.termine.length} Termine).</span>
          ) : (
            <>
              <div>Abweichung zu {ergebnis.quelle} ({ergebnis.termine.length} Termine):</div>
              {ergebnis.weg.length > 0 && <div>Entfernen: {liste(ergebnis.weg)}</div>}
              {ergebnis.hinzu.length > 0 && <div>Hinzufügen: {liste(ergebnis.hinzu)}</div>}
              <button type="button" className={styles.calcButton} style={{ marginTop: '6px' }} onClick={uebernehmen}>
                Übernehmen
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
