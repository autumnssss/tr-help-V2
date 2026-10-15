import type { RecipeCard } from '../core/planner';
import { formatAmount, formatOz } from '../core/units';

/** A recipe scaled to this order. Mixed-in sub-recipes (broth) open inside it. */
export function Card({ card, cards }: { card: RecipeCard; cards?: Record<string, RecipeCard> }) {
  return (
    <div className="card-recipe">
      <div className="muted">× {card.batches} batches{card.finishedOz != null && <> → {formatOz(card.finishedOz)} cooked</>}</div>
      <ul>
        {card.lines.map((l, i) => (
          <li key={i}>
            <strong>{l.amount != null ? formatAmount(l.amount, l.unit) : l.oz != null ? formatOz(l.oz) : '—'}</strong> {l.name}
            {l.sub && <Card card={l.sub} cards={cards} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

