import { useEffect, useState } from 'react'
import styles from './Admin.module.css'
import { COURSE_TYPES } from '../courseTypes.js'
import { supabase } from '../supabase.js'
import CourseCard from '../components/CourseCard.jsx'

export default function Admin() {
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [activeType, setActiveType] = useState(COURSE_TYPES[0].slug)

  useEffect(() => {
    loadCourses()
  }, [])

  async function loadCourses() {
    setLoading(true)
    const { data, error } = await supabase.from('kurse').select('*').order('created_at', { ascending: true })
    if (error) setLoadError(error.message)
    else {
      setCourses(data || [])
      setLoadError(null)
    }
    setLoading(false)
  }

  function updateCourseLocal(id, changes) {
    setCourses((prev) => prev.map((c) => (c.id === id ? { ...c, ...changes } : c)))
  }

  async function saveCourse(id, changes) {
    const { error } = await supabase.from('kurse').update(changes).eq('id', id)
    return error
  }

  async function addCourse(courseTypeSlug) {
    const { data, error } = await supabase
      .from('kurse')
      .insert({
        course_type: courseTypeSlug,
        name: 'Neuer Kurs',
        termine: 5,
        dauer_min: 60,
        preis: 80,
        max_teilnehmerinnen: 10,
        sichtbar_auf_website: false,
      })
      .select()
      .single()

    if (error) {
      alert('Kurs konnte nicht angelegt werden: ' + error.message)
      return
    }
    setCourses((prev) => [...prev, data])
  }

  const coursesForActiveType = courses.filter((c) => c.course_type === activeType)
  const activeTypeConfig = COURSE_TYPES.find((t) => t.slug === activeType)

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Bauch · Baby · Beckenboden</h1>
        <p>Kursverwaltung</p>
        <button className={styles.logoutButton} onClick={() => supabase.auth.signOut()}>
          Ausloggen
        </button>
      </div>

      <p className={styles.hint}>
        Kursdaten bearbeiten, Teilnehmerinnen verwalten und festlegen, ob der Kurs auf der jeweiligen Website-Seite
        angezeigt wird.
      </p>

      {loading && <p className={styles.hint}>Lade Kurse …</p>}
      {loadError && <p className={styles.hint}>Kurse konnten nicht geladen werden: {loadError}</p>}

      <div className={styles.typeTabs}>
        {COURSE_TYPES.map((type) => (
          <button
            key={type.slug}
            className={`${styles.typeTab} ${activeType === type.slug ? styles.active : ''}`}
            onClick={() => setActiveType(type.slug)}
          >
            {type.label}
          </button>
        ))}
      </div>

      <div className={styles.courseList}>
        {coursesForActiveType.map((course) => (
          <CourseCard
            key={course.id}
            course={course}
            siblingCourses={coursesForActiveType}
            onUpdateLocal={updateCourseLocal}
            onSave={saveCourse}
            onReload={loadCourses}
          />
        ))}
      </div>

      <button className={styles.addButton} onClick={() => addCourse(activeType)}>
        + Neuen {activeTypeConfig?.label}-Kurs anlegen
      </button>
    </div>
  )
}
