import { useState } from 'react'
import styles from './Login.module.css'
import { supabase } from '../supabase.js'

export default function SetNewPassword({ onDone }) {
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('Das Passwort muss mindestens 6 Zeichen lang sein.')
      return
    }
    if (password !== password2) {
      setError('Die beiden Passwörter stimmen nicht überein.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError('Passwort konnte nicht gespeichert werden: ' + error.message)
      return
    }

    onDone()
  }

  return (
    <div className={styles.container}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <h2>Neues Passwort setzen</h2>
        <div className={styles.group}>
          <label>Neues Passwort</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div className={styles.group}>
          <label>Neues Passwort wiederholen</label>
          <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <button type="submit" className={styles.submitButton} disabled={loading}>
          {loading ? 'Wird gespeichert …' : 'Passwort speichern'}
        </button>
      </form>
    </div>
  )
}
