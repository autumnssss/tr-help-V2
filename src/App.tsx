import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Catalog } from './core/planner';
import { loadCatalog } from './lib/catalog';
import { configError, db, myKitchen } from './lib/supabase';
import { Login } from './screens/Login';
import { Upload } from './screens/Upload';

type KitchenState =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'error'; message: string }
  | { status: 'ready'; name: string; catalog: Catalog };

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [kitchen, setKitchen] = useState<KitchenState>({ status: 'loading' });

  useEffect(() => {
    void db.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = db.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    setKitchen({ status: 'loading' });
    (async () => {
      const k = await myKitchen();
      if (!k) return setKitchen({ status: 'none' });
      setKitchen({ status: 'ready', name: k.name, catalog: await loadCatalog(db, k.id) });
    })().catch(e => setKitchen({ status: 'error', message: e instanceof Error ? e.message : String(e) }));
  }, [userId]);

  if (configError) return <main className="login"><p className="error">{configError}</p></main>;
  if (session === undefined) return null;
  if (!session) return <Login />;

  return (
    <>
      <header className="no-print">
        <strong>TR Help</strong>
        {kitchen.status === 'ready' && <span className="muted">{kitchen.name}</span>}
        <span className="spacer" />
        <span className="muted email">{session.user.email}</span>
        <button className="btn link" onClick={() => void db.auth.signOut()}>Log out</button>
      </header>
      {kitchen.status === 'loading' && <main><p className="muted">Loading kitchen…</p></main>}
      {kitchen.status === 'none' && <main><p>Your login isn’t linked to a kitchen yet. Ask the owner to invite this email.</p></main>}
      {kitchen.status === 'error' && <main><p className="error">{kitchen.message}</p></main>}
      {kitchen.status === 'ready' && <Upload catalog={kitchen.catalog} />}
    </>
  );
}
