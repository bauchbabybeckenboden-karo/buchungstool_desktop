import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import styles from './Booking.module.css'
import { COURSE_TYPES } from '../courseTypes.js'

const BESCHREIBUNGEN = {
  mamafit: 'Rückbildung & Fitness nach der Geburt',
  schwangerfit: 'Fitness in der Schwangerschaft',
  'somatic-yoga': 'Sanftes, körperorientiertes Yoga',
  'koerpermitte-beckenboden': 'Rumpfstabilität & Beckenbodentraining',
}

// Allgemeine Übersichtsseite über alle Kursarten - gedacht zum Einbetten auf
// einer eigenen, allgemeinen "Kurse"-Seite (z.B. für bessere Auffindbarkeit
// über Google), im Unterschied zu den einzelnen Kursart-Seiten
// (/kurse/mamafit etc.), die auf den jeweiligen Themen-Seiten eingebettet
// sind. Von hier aus wählt man eine Kursart aus und landet auf der
// entsprechenden Buchungsseite.
export default function AlleKurse() {
  // Gleiche Höhen-Meldung ans einbettende iFrame wie auf den einzelnen
  // Buchungsseiten (siehe Booking.jsx) - ohne das würde ein fest
  // eingestelltes iFrame die Kachel-Liste abschneiden.
  useEffect(() => {
    if (window.parent === window) return
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

  return (
    <div className={styles.container}>
      <div className={styles.logoHeader}>
        <img src="/logo.png" alt="Bauch · Baby · Beckenboden" className={styles.logo} />
      </div>

      <div className={styles.termineSection}>
        {COURSE_TYPES.map((type) => (
          <Link key={type.slug} to={`/kurse/${type.slug}`} className={styles.termineBox} style={{ textDecoration: 'none' }}>
            <i className={`ti ti-calendar ${styles.termineIcon}`} />
            <div className={styles.termineTextGroup}>
              <p className={`${styles.termineText} ${styles.termineTextBold}`}>{type.label}</p>
              {BESCHREIBUNGEN[type.slug] && <p className={styles.termineText}>{BESCHREIBUNGEN[type.slug]}</p>}
            </div>
            <i className={`ti ti-arrow-right ${styles.termineArrow}`} />
          </Link>
        ))}
      </div>
    </div>
  )
}
