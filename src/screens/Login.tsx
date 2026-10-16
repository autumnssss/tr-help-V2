import { useState, type FormEvent } from 'react';
import { db } from '../lib/supabase';

/**
 * Email login. Sign-ups are off: only invited emails can log in.
 * The email has a link and a code. On an iPhone home-screen app, links open in Safari (separate
 * storage), so the code is typed here instead and the login stays with the app.
 */
export function Login() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'checking'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function send(e: FormEvent) {
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

  async function verify(e: FormEvent) {
    e.preventDefault();
    setState('checking');
    setError(null);
    const { error } = await db.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    if (error) {
      setState('sent');
      setError(/expired|invalid/i.test(error.message) ? 'That code didn’t work or has expired. Check it, or send a new one.' : error.message);
    }
    // On success the app's auth listener switches to the kitchen.
  }

  return (
    <main className="login">
      <h1>TR Help</h1>
      {state === 'sent' || state === 'checking' ? (
        <form onSubmit={verify}>
          <p>We emailed <strong>{email}</strong>. Type the code from the email here.</p>
          <label htmlFor="code">Code</label>
          <input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={10} required
            value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} />
          <button className="btn" disabled={state === 'checking' || code.length < 6}>{state === 'checking' ? 'Checking…' : 'Log in'}</button>
          {error && <p className="error">{error}</p>}
          <button type="button" className="btn link" onClick={() => { setState('idle'); setCode(''); setError(null); }}>Use a different email or send again</button>
          <p className="muted">On a computer you can also just click the link in the email.</p>
        </form>
      ) : (
        <form onSubmit={send}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
          <button className="btn" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Email me a login code'}</button>
          {error && <p className="error">{error}</p>}
        </form>
      )}
    </main>
  );
}
