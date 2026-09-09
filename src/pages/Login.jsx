import { useState } from 'react'
import styles from './Login.module.css'
import { supabase } from '../supabase.js'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setError('Login fehlgeschlagen. E-Mail oder Passwort falsch.')
  }

  return (
    <div className={styles.container}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <h2>Admin-Login</h2>
        <div className={styles.group}>
          <label>E-Mail</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className={styles.group}>
          <label>Passwort</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <button type="submit" className={styles.submitButton} disabled={loading}>
          {loading ? 'Wird geprüft …' : 'Einloggen'}
        </button>
      </form>
    </div>
  )
}
