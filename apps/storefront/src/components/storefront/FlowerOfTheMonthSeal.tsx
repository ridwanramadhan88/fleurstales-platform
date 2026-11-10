import type { FC } from 'react'

/** Ten-petal rosette outline, drawn once. */
const PETALS = Array.from({ length: 10 }, (_, index) => {
  const angle = (index / 10) * Math.PI * 2
  return { cx: 50 + Math.cos(angle) * 33, cy: 50 + Math.sin(angle) * 33 }
})

/**
 * The "Flower of the Month" mark on a product card: a bright rosette, larger
 * and louder than the small purple Featured star it replaces.
 */
export const FlowerOfTheMonthSeal: FC<{ className?: string }> = ({ className = '' }) => (
  <span
    data-no-translate
    role="img"
    aria-label="Flower of the Month"
    className={`sf-month-seal pointer-events-none ${className}`}
  >
    <svg viewBox="0 0 100 100" aria-hidden="true" className="h-full w-full">
      <g className="sf-month-seal__shadow">
        {PETALS.map((petal, index) => <circle key={index} cx={petal.cx} cy={petal.cy + 3} r="17" />)}
        <circle cx="50" cy="53" r="36" />
      </g>
      <g className="sf-month-seal__body">
        {PETALS.map((petal, index) => <circle key={index} cx={petal.cx} cy={petal.cy} r="17" />)}
        <circle cx="50" cy="50" r="36" />
      </g>
      <circle cx="50" cy="50" r="40" className="sf-month-seal__ring" />
      <text x="50" y="43" textAnchor="middle" className="sf-month-seal__word">FLOWER</text>
      <text x="50" y="54" textAnchor="middle" className="sf-month-seal__small">OF THE</text>
      <text x="50" y="72" textAnchor="middle" className="sf-month-seal__word">MONTH</text>
    </svg>
  </span>
)
