import { useState, type FormEvent } from 'react';
import { db } from '../lib/supabase';

/** Email magic-link login. Sign-ups are off: only invited emails get a link. */
export function Login() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState('sending');
    setError(null);
    const { error } = await db.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
    });
    if (error) {
      setState('idle');
      setError(/signups not allowed|not found/i.test(error.message)
        ? 'That email isn’t set up for this kitchen. Ask the owner to invite you.'
        : error.message);
    } else setState('sent');
  }

  return (
    <main className="login">
      <h1>TR Help</h1>
      {state === 'sent' ? (
        <p>Check <strong>{email}</strong> for a login link. You can close this tab.</p>
      ) : (
        <form onSubmit={submit}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
          <button className="btn" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Email me a login link'}</button>
          {error && <p className="error">{error}</p>}
        </form>
      )}
    </main>
  );
}
