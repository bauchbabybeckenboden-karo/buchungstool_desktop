import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import styles from './Booking.module.css'
import { getCourseTypeBySlug } from '../courseTypes.js'
import { supabase } from '../supabase.js'
import { reduzierterPreis, effektiverGrundpreis, vergangeneTermine } from '../pricing.js'

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
  // Der Kursname wird mit in die kleine Beschriftungszeile aufgenommen, damit
  // z.B. Online-Termine (Karo benennt diese selbst entsprechend, etwa
  // "Mamafit Online") für Teilnehmerinnen auch auf der Kachel erkennbar sind -
  // ohne ein zusätzliches, separates "ONLINE"-Badge auf der Liste.
  // "Quereinstieg": Kurse, die schon laufen (mind. ein Termin bereits
  // stattgefunden), aber noch buchbar sind, werden direkt in der ersten
  // Zeile neben dem Namen entsprechend beschriftet - so ist auf einen Blick
  // klar, dass man hier später einsteigt statt von Anfang an dabei zu sein.
  const bereitsGestartet = vergangeneTermine(course) > 0
  const beschriftung = label ? `${label} · ${course.name}` : course.name

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

  // Grundpreis: entweder Karos manuell gesetzter Rabattpreis (falls für den
  // Kurs aktiviert) oder der normale Listenpreis. Wer erst nach Kursbeginn
  // bucht, zahlt zusätzlich nur noch für die verbleibenden Termine (siehe
  // pricing.js) - beides wird unten getrennt angezeigt, damit ein echter
  // Rabatt nicht mit der automatischen Späte-Anmeldung-Reduzierung verwechselt
  // wird.
  const grundpreis = effektiverGrundpreis(course)
  const effektivPreis = reduzierterPreis(grundpreis, course)
  const rabattiert = grundpreis < Number(course.preis)
  const spaeterReduziert = effektivPreis < grundpreis

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
        <p className={styles.termineLabel}>
          {beschriftung}
          {bereitsGestartet && ' · Quereinstieg'}
        </p>
        <p className={`${styles.termineText} ${styles.termineTextBold}`}>{titelText}</p>
        <p className={styles.termineText}>
          {course.termine} Termine ·{' '}
          {comboLabel ? (
            'Preis siehe Anmeldung'
          ) : (
            <>
              {effektivPreis}€
              {rabattiert && ` statt ${course.preis}€`}
              {rabattiert && course.rabatt_hinweis && ` (rabattiert ${course.rabatt_hinweis})`}
              {spaeterReduziert && ' – Preis passt sich der Anzahl verbleibender Stunden an'}
            </>
          )}
        </p>
        {terminliste && <p className={styles.termineDatesLine}>📍 {terminliste}</p>}
      </div>
      {!ausgebucht && <i className={`ti ti-arrow-right ${styles.termineArrow}`} />}
    </div>
  )
}

// Kachel für ein Kombi-Paket (zwei eigenständige Kurse zu einer Buchung
// gebündelt) - im selben Kachel-Stil wie TerminBox, listet aber beide
// zugrundeliegenden Kurstermine untereinander auf.
function PaketBox({ paket, spotsLeft, selected, onSelect }) {
  const ausgebucht = spotsLeft !== null && spotsLeft <= 0
  const wenigePlaetze = !ausgebucht && spotsLeft !== null && spotsLeft <= 3

  // Reduzierung gilt für beide gebündelten Kurse einzeln - wer erst nach
  // Beginn eines oder beider Kurse bucht, zahlt entsprechend weniger.
  const effektivPreis = reduzierterPreis(paket.preis, paket.kurs1, paket.kurs2)
  const reduziert = effektivPreis < Number(paket.preis)

  let titelText = paket.name
  if (ausgebucht) titelText = `Ausgebucht — ${paket.name}`
  else if (wenigePlaetze) titelText = `Wenige Plätze verfügbar — ${paket.name}`

  const klassen = [styles.termineBox]
  if (wenigePlaetze) klassen.push(styles.termineBoxHighlight)
  if (selected) klassen.push(styles.termineBoxSelected)
  if (ausgebucht) klassen.push(styles.termineBoxDisabled)

  function kursZeile(kurs) {
    const datum = kurs.termin_daten?.[0] || kurs.start_datum
    const terminliste = formatTerminlisteKurz(terminDatenOderRange(kurs))
    const typLabel = getCourseTypeBySlug(kurs.course_type)?.label || kurs.course_type
    return (
      <p className={styles.termineText} key={kurs.id}>
        {typLabel} ab {formatDatumDE(datum)}{kurs.uhrzeit ? ` · ${kurs.uhrzeit}` : ''}
        {terminliste ? <><br />📍 {terminliste}</> : null}
      </p>
    )
  }

  return (
    <div
      className={klassen.join(' ')}
      onClick={() => { if (!ausgebucht) onSelect(paket.id) }}
      role="button"
      tabIndex={ausgebucht ? -1 : 0}
    >
      <i className={`ti ti-box ${styles.termineIcon}`} />
      <div className={styles.termineTextGroup}>
        <p className={styles.termineLabel}>Kurs-Paket</p>
        <p className={`${styles.termineText} ${styles.termineTextBold}`}>{titelText}</p>
        {kursZeile(paket.kurs1)}
        {kursZeile(paket.kurs2)}
        <p className={styles.termineText}>
          Paketpreis: {effektivPreis}€{reduziert ? ' – Preis passt sich der Anzahl verbleibender Stunden an' : ''}
        </p>
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

// Wird nur angezeigt, wenn ein Kurs auf einer "fremden" Seite (als
// Kombi-Kurs-Kachel, z.B. "PLUS Körpermitte & Beckenboden" auf der
// Donnerstags-Seite) ausgewählt wurde - siehe zeigeKombiWunsch in Booking().
// Bewusst als eigene, klar beschriftete Sektion GANZ OBEN im Formular (vor
// "Deine Angaben") statt versteckt in den kursart-spezifischen Feldern, damit
// sofort klar ist, dass es hier um eine Zusatzbuchung zu einem bereits
// laufenden Kurs geht.
function KombiWunschSection({ values, onChange, kombiWunschPreis, normalPreis }) {
  return (
    <div className={styles.section}>
      <h3>Zusätzliche Buchung zum bereits laufenden Kurs</h3>
      <div className={styles.checkboxGroup}>
        <input
          type="checkbox"
          id="kombiWunsch"
          checked={values.kombiWunsch || false}
          onChange={(e) => onChange('kombiWunsch', e.target.checked)}
        />
        <label htmlFor="kombiWunsch">
          Ich bin bereits bei einem laufenden Kurs (Soyo Donnerstags oder Mamafit) angemeldet und buche diesen
          Kurs zusätzlich dazu.
        </label>
      </div>
      {values.kombiWunsch && (
        <div className={styles.infoBox}>
          Wie schön! 💕 Der Preis für den zusätzlichen Kurs ist <strong>{kombiWunschPreis}€</strong> (10 % Rabatt
          auf den Originalpreis). Warte mit der Überweisung bitte auf meine Bestätigungsmail. 🌿 Vielen Dank, dass
          Du dabei bist!
        </div>
      )}
    </div>
  )
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
  const [pakete, setPakete] = useState([])
  const [bookingCounts, setBookingCounts] = useState({})
  const [selectedId, setSelectedId] = useState('')
  const [selectedPaketId, setSelectedPaketId] = useState('')
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

  // Kombi-Pakete laden, die diese Kursseite betreffen (einer der beiden
  // gebündelten Kurse gehört zu diesem Kurstyp). Da kurs_id_1/kurs_id_2 auf
  // beliebige, unabhängige Kurse verweisen können (auch auf einen anderen
  // Kurstyp als diese Seite), werden die referenzierten Kurse separat
  // nachgeladen statt sich auf die oben geladene `courses`-Liste zu verlassen.
  useEffect(() => {
    if (!courseTypeSlug) return
    let active = true
    supabase
      .from('kurs_pakete')
      .select('*')
      .eq('sichtbar_auf_website', true)
      .then(async ({ data: paketeData, error }) => {
        if (!active) return
        if (error || !paketeData || paketeData.length === 0) {
          setPakete([])
          return
        }
        const kursIds = [...new Set(paketeData.flatMap((p) => [p.kurs_id_1, p.kurs_id_2]))]
        const { data: kurseData } = await supabase.from('kurse').select('*').in('id', kursIds)
        if (!active) return
        const kursMap = {}
        ;(kurseData || []).forEach((k) => { kursMap[k.id] = k })
        const angereichert = paketeData
          .map((p) => ({ ...p, kurs1: kursMap[p.kurs_id_1], kurs2: kursMap[p.kurs_id_2] }))
          .filter(
            (p) =>
              p.kurs1 &&
              p.kurs2 &&
              (p.kurs1.course_type === courseTypeSlug || p.kurs2.course_type === courseTypeSlug)
          )
        setPakete(angereichert)
      })
    return () => { active = false }
  }, [courseTypeSlug])

  // Belegungszahlen laden, um "Wenige Plätze verfügbar" / "Ausgebucht" auf
  // den Termin- und Paket-Kacheln anzuzeigen. Bei Kombi-Paketen zählt der
  // jeweils knappere der beiden zugrundeliegenden Kurse.
  useEffect(() => {
    const relevanteIds = new Set(courses.map((c) => c.id))
    pakete.forEach((p) => { relevanteIds.add(p.kurs1.id); relevanteIds.add(p.kurs2.id) })
    if (relevanteIds.size === 0) {
      setBookingCounts({})
      return
    }
    let active = true
    supabase
      .from('buchungen')
      .select('kurs_id')
      .in('kurs_id', [...relevanteIds])
      .then(({ data }) => {
        if (!active) return
        const counts = {}
        ;(data || []).forEach((b) => { counts[b.kurs_id] = (counts[b.kurs_id] || 0) + 1 })
        setBookingCounts(counts)
      })
    return () => { active = false }
  }, [courses, pakete])

  const selectedCourse = courses.find((c) => c.id === selectedId)
  const selectedPaket = pakete.find((p) => p.id === selectedPaketId)

  // Effektiver (ggf. rabattierter und/oder reduzierter) Preis für die aktuelle
  // Auswahl - wird für Anzeige UND die verschickte Bestätigungsmail verwendet,
  // damit beide übereinstimmen (siehe pricing.js: effektiverGrundpreis,
  // reduzierterPreis).
  const grundpreisKurs = selectedCourse ? effektiverGrundpreis(selectedCourse) : null
  const effektivPreisKurs = selectedCourse ? reduzierterPreis(grundpreisKurs, selectedCourse) : null
  const rabattiertKurs = selectedCourse ? grundpreisKurs < Number(selectedCourse.preis) : false
  const effektivPreisPaket = selectedPaket
    ? reduzierterPreis(selectedPaket.preis, selectedPaket.kurs1, selectedPaket.kurs2)
    : null

  // Der ausgewählte Kurs ist hier nur als Zusatzoption auf einer "fremden"
  // Seite gelistet (z.B. "PLUS Körpermitte & Beckenboden" auf der
  // Donnerstags-Seite) - nur dann macht die Kombi-Wunsch-Option Sinn (siehe
  // KombiWunschSection oben).
  const zeigeKombiWunsch = Boolean(selectedCourse) && selectedCourse.course_type !== courseTypeSlug

  // Kombi-Wunsch-Preis: pauschal 10% auf den ohnehin angezeigten Preis des
  // PLUS-Kurses, aufgerundet auf den vollen Euro - NICHT auf den bereits
  // laufenden Kurs, den bekommt die Teilnehmerin ja schon zum normalen Preis.
  // Anders als beim "echten" Kombi-Paket (zwei gleichzeitig gebuchte Kurse)
  // ist hier sofort ein fester Preis bekannt, ohne Datenbank-Abfrage - die
  // Bestätigung, ob die Teilnehmerin tatsächlich im anderen Kurs angemeldet
  // ist, passiert serverseitig beim Mailversand (send-booking-emails.mjs).
  const kombiWunschPreis = zeigeKombiWunsch ? Math.ceil(effektivPreisKurs * 0.9) : null

  // Hauptkurse (diese Seite ist ihr eigentlicher Kurstyp) und Kombi-Kurse
  // (dieser Kurstyp ist hier nur als Zusatzoption angehängt) getrennt
  // aufbereiten - je eine eigene Kachel mit passender Beschriftung.
  const primaerKurse = courses.filter((c) => c.course_type === courseTypeSlug)
  const komboKurse = courses.filter((c) => c.course_type !== courseTypeSlug)

  function spotsLeftFuer(course) {
    if (!course.max_teilnehmerinnen) return null
    return course.max_teilnehmerinnen - (bookingCounts[course.id] || 0)
  }

  // Ein Kombi-Paket ist so lange buchbar, wie in BEIDEN zugrundeliegenden
  // Kursen noch ein Platz frei ist - eine Anmeldung belegt ja in jedem der
  // beiden Kurse einen Platz.
  function spotsLeftFuerPaket(paket) {
    const links = spotsLeftFuer(paket.kurs1)
    const rechts = spotsLeftFuer(paket.kurs2)
    if (links === null && rechts === null) return null
    if (links === null) return rechts
    if (rechts === null) return links
    return Math.min(links, rechts)
  }

  if (!courseType) {
    return <div className={styles.container}>Unbekannter Kurstyp.</div>
  }

  // Auf dem Handy (v.a. mobiles Netz) kann eine einzelne Anfrage mal kurz
  // hängen bleiben - bevor wir der Nutzerin einen Fehler anzeigen, probieren
  // wir es nach einer kurzen Pause automatisch noch einmal. Fehler werden
  // zusätzlich geloggt und ihre Meldung wird der Nutzerin mit angezeigt,
  // damit ein evtl. wiederkehrendes Problem sich anhand eines Screenshots
  // genauer diagnostizieren lässt.
  // WICHTIG: kein .select() nach dem Insert - die Buchungsseite läuft mit dem
  // öffentlichen anon-Key, der (aus Datenschutzgründen) keine Buchungen
  // AUSLESEN darf. Mit .select() würde Postgres die neue Zeile nach dem
  // Einfügen zurückgeben wollen, das schlägt an der RLS-Regel fehl und die
  // ganze Anmeldung wird abgelehnt ("new row violates row-level security
  // policy for table buchungen") - obwohl der Insert an sich erlaubt ist.
  async function insertBuchungMitRetry(daten) {
    let { error } = await supabase.from('buchungen').insert(daten)
    if (error) {
      console.error('Buchung fehlgeschlagen, versuche erneut:', error)
      await new Promise((resolve) => setTimeout(resolve, 1200))
      ;({ error } = await supabase.from('buchungen').insert(daten))
      if (error) console.error('Buchung auch beim zweiten Versuch fehlgeschlagen:', error)
    }
    return { error }
  }

  function fehlermeldung(error) {
    return `Die Anmeldung konnte nicht gesendet werden. Bitte versuch es erneut. (${error?.message || 'unbekannter Fehler'})`
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)

    const basisDaten = {
      vorname: general.vorname,
      nachname: general.nachname,
      email: general.email,
      telefon: general.telefon,
      strasse: general.strasse,
      plz: general.plz,
      ort: general.ort,
      dsgvo_akzeptiert: general.dsgvo,
      antirassismus_akzeptiert: general.antirassismus,
      zusatzfelder: extra.kombiWunsch ? { ...extra, kombiPreisGeschaetzt: kombiWunschPreis ?? null } : extra,
    }

    // Ein Kombi-Paket erzeugt EINE Anmeldung, landet aber technisch als
    // zwei verknüpfte Zeilen in "buchungen" (eine pro zugrundeliegendem
    // Kurs) - dadurch taucht die Teilnehmerin ganz normal in beiden
    // Kurs-Teilnehmerinnenlisten im Adminbereich auf. Beide Zeilen werden in
    // EINEM Insert-Aufruf geschrieben, damit Postgres sie als eine
    // Transaktion behandelt: schlägt eine der beiden Zeilen fehl (z.B. weil
    // der Kurs inzwischen gelöscht wurde), wird auch die andere gar nicht
    // erst gespeichert - es kann also keine "halbe" Kombi-Buchung entstehen
    // (vorher: zwei einzelne Inserts + manuelles Aufräumen per Delete, was
    // am anon-Key ohnehin an der RLS-Regel gescheitert wäre).
    if (selectedPaket) {
      const { error } = await insertBuchungMitRetry([
        { ...basisDaten, kurs_id: selectedPaket.kurs1.id, paket_id: selectedPaket.id },
        { ...basisDaten, kurs_id: selectedPaket.kurs2.id, paket_id: selectedPaket.id },
      ])

      if (error) {
        setSubmitting(false)
        setSubmitError(fehlermeldung(error))
        return
      }

      setSubmitting(false)
      setSubmitted(true)

      fetch('/.netlify/functions/send-booking-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buchung: { ...general, zusatzfelder: extra },
          paket: { name: selectedPaket.name, preis: effektivPreisPaket, kurse: [selectedPaket.kurs1, selectedPaket.kurs2] },
        }),
      }).catch(() => {})
      return
    }

    const { error } = await insertBuchungMitRetry({ ...basisDaten, kurs_id: selectedCourse.id })

    setSubmitting(false)
    if (error) {
      setSubmitError(fehlermeldung(error))
      return
    }
    setSubmitted(true)

    // E-Mails verschicken (Bestätigung an Teilnehmerin + Benachrichtigung an Karo).
    // Ein Fehler hier soll die bereits erfolgreiche Anmeldung nicht mehr beeinflussen.
    fetch('/.netlify/functions/send-booking-emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buchung: { ...general, zusatzfelder: basisDaten.zusatzfelder },
        kurs: { ...selectedCourse, preis: effektivPreisKurs },
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
            onSelect={(id) => { setSelectedId(id); setSelectedPaketId('') }}
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
            onSelect={(id) => { setSelectedId(id); setSelectedPaketId('') }}
          />
        ))}
        {pakete.map((p) => (
          <PaketBox
            key={p.id}
            paket={p}
            spotsLeft={spotsLeftFuerPaket(p)}
            selected={selectedPaketId === p.id}
            onSelect={(id) => { setSelectedPaketId(id); setSelectedId('') }}
          />
        ))}
      </div>

      {(selectedCourse || selectedPaket) && (
        <>
          <div className={styles.details}>
            <h3>{selectedPaket ? selectedPaket.name : selectedCourse.name}</h3>
            {selectedPaket ? (
              <>
                {[selectedPaket.kurs1, selectedPaket.kurs2].map((k) => (
                  <div key={k.id} style={{ marginBottom: '10px' }}>
                    <span className={styles.datesBig}>
                      {getCourseTypeBySlug(k.course_type)?.label || k.course_type} — {k.termine} Termine à {k.dauer_min} mins
                    </span>
                    {k.termin_daten && k.termin_daten.length > 0 && (
                      <div className={styles.terminListe}>
                        {k.termin_daten.map((datum) => (
                          <span key={datum} className={styles.terminDatum}>{formatDatumDE(datum)}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <span className={styles.price}>
                  €{effektivPreisPaket} (Paketpreis)
                  {effektivPreisPaket < Number(selectedPaket.preis) && (
                    <span className={styles.termineText}>
                      {' '}– Preis passt sich der Anzahl verbleibender Stunden an
                    </span>
                  )}
                </span>
              </>
            ) : (
              <>
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
                <span className={styles.price}>
                  {zeigeKombiWunsch ? (
                    'Preis siehe Anmeldung'
                  ) : (
                    <>
                      €{effektivPreisKurs}
                      {rabattiertKurs && (
                        <span className={styles.termineText}>{' '}statt €{selectedCourse.preis}</span>
                      )}
                      {rabattiertKurs && selectedCourse.rabatt_hinweis && (
                        <span className={styles.termineText}>{' '}(rabattiert {selectedCourse.rabatt_hinweis})</span>
                      )}
                      {effektivPreisKurs < grundpreisKurs && (
                        <span className={styles.termineText}>
                          {' '}– Preis passt sich der Anzahl verbleibender Stunden an
                        </span>
                      )}
                    </>
                  )}
                </span>
              </>
            )}
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
            {zeigeKombiWunsch && (
              <KombiWunschSection
                values={extra}
                onChange={(field, value) => setExtra({ ...extra, [field]: value })}
                kombiWunschPreis={kombiWunschPreis}
                normalPreis={effektivPreisKurs}
              />
            )}

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

            {selectedPaket ? (
              <>
                <ExtraFields
                  courseTypeSlug={selectedPaket.kurs1.course_type}
                  values={extra}
                  onChange={(field, value) => setExtra({ ...extra, [field]: value })}
                />
                {selectedPaket.kurs2.course_type !== selectedPaket.kurs1.course_type && (
                  <ExtraFields
                    courseTypeSlug={selectedPaket.kurs2.course_type}
                    values={extra}
                    onChange={(field, value) => setExtra({ ...extra, [field]: value })}
                  />
                )}
              </>
            ) : (
              <ExtraFields
                courseTypeSlug={selectedCourse.course_type}
                values={extra}
                onChange={(field, value) => setExtra({ ...extra, [field]: value })}
              />
            )}

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
