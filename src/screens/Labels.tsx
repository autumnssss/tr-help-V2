import { useState } from 'react';
import { labelsByDestination, FAMILY_LABELS, type LabelsByDestination } from '../core/labels';
import { parseTickets } from '../core/tickets';
import type { Catalog } from '../core/planner';
import { pdfTextItems } from '../lib/pdf';

/**
 * Label count and destination sort straight from the Hotplate ticket PDF (kitchen 2026-11-09): every ticket line is
 * counted, whether the item is on the app's menu or not. No prep-list CSV needed.
 */
export function Labels({ catalog }: { catalog?: Catalog }) {
  const [loaded, setLoaded] = useState<{ fileName: string; labels: LabelsByDestination } | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function read(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const tickets = parseTickets(await pdfTextItems(file));
      if (!tickets.length) throw new Error('No Hotplate tickets found in that PDF.');
      setLoaded({ fileName: file.name, labels: labelsByDestination(tickets, catalog) });
    } catch (e) {
      setLoaded(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <main>
      <section className={`drop no-print${loaded ? ' compact' : ''}`}>
        {!loaded && <p><strong>Drop the Hotplate ticket PDF here</strong></p>}
        <label className={loaded ? 'btn link small' : 'btn'}>
          {loaded ? 'Load another PDF' : 'Choose ticket PDF'}
          <input type="file" accept=".pdf,application/pdf" hidden onChange={e => { void read(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {error && <p className="error">{error}</p>}
      </section>
      {loaded && (
        <>
          <section className="summary">
            <h2>{loaded.fileName}</h2>
            <p className="muted">
              Labels: {loaded.labels.totals.reduce((s, t) => s + t.total, 0)} · {loaded.labels.totals.map(t => `${t.destination} ${t.total}`).join(' · ')}
            </p>
            <button className="btn no-print" onClick={() => window.print()}>Print</button>
          </section>
          <section className="card">
            <DestinationTable labels={loaded.labels} />
          </section>
        </>
      )}
    </main>
  );
}

/** Sizes count orders; Total counts labels (a Family order takes the menu's label count, 3 if it isn't on the menu). */
export function DestinationTable({ labels }: { labels: LabelsByDestination }) {
  const offMenu = labels.meals.filter(m => !m.onMenu);
  const cell = (n: number | undefined) => (n ? n : '');
  return (
    <>
      <p className="muted">Size columns are orders. Total is labels to print (a Family order is {FAMILY_LABELS} labels).</p>
      <table className="dest">
        <thead>
          <tr><th />{labels.columns.map(c => <th key={c} className="num">{c}</th>)}<th className="num">Labels</th></tr>
        </thead>
        <tbody>
          {labels.meals.flatMap(m => [
            <tr key={m.title} className="aisle"><td colSpan={labels.columns.length + 1}>{m.title}</td><td className="num">{m.total}</td></tr>,
            ...m.byDestination.map(d => (
              <tr key={`${m.title}|${d.destination}`}>
                <td>{d.destination}</td>
                {labels.columns.map(c => <td key={c} className="num">{cell(d.counts[c])}</td>)}
                <td className="num">{d.total}</td>
              </tr>
            )),
          ])}
        </tbody>
      </table>
      {offMenu.length > 0 && (
        <p className="raw no-print">Not set up in the app yet (counted from the ticket): {offMenu.map(m => m.title).join(', ')}</p>
      )}
    </>
  );
}
