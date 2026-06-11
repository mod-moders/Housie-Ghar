/** 3×9 Housie ticket grid with colour-blind-safe marking. */

export type TicketMatrix = (number | null)[][];

/** Convert the backend's grid_data {row1,row2,row3} into a 3×9 matrix. */
export function gridToMatrix(grid: { row1: (number | null)[]; row2: (number | null)[]; row3: (number | null)[] }): TicketMatrix {
  return [grid.row1, grid.row2, grid.row3];
}

export function HousieTicket({ matrix, drawn, compact, label }: {
  matrix: TicketMatrix;
  drawn?: Set<number> | number[];
  compact?: boolean;
  label?: string;
}) {
  const drawnSet = drawn instanceof Set ? drawn : new Set(drawn || []);
  return (
    <div className={`hg-ticket${compact ? " hg-ticket-compact" : ""}`}>
      {label && <div className="hg-ticket-tag">{label}</div>}
      <div className="hg-ticket-grid">
        {matrix.map((row, r) =>
          row.map((cell, c) => {
            const marked = cell != null && drawnSet.has(cell);
            return (
              <div
                key={`${r}-${c}`}
                className={`hg-cell${cell == null ? " hg-cell-empty" : ""}${marked ? " hg-cell-marked" : ""}`}
              >
                {cell != null && <span>{cell}</span>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
