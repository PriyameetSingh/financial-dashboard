import type { ReactNode } from "react";

/**
 * A data table with the design system's fading row rules.
 *
 * Columns are declared rather than hand-written as markup so three things stay
 * true without each caller remembering them:
 *
 *   - every header cell is a real `th` with `scope="col"`,
 *   - a sorted column carries `aria-sort`, not just a `↓` glyph,
 *   - the empty state replaces the body rather than rendering a table with no
 *     rows, which announces as an empty table and explains nothing.
 *
 * A caption is required. An unlabelled data table is the single most common
 * WCAG failure in a dashboard; `captionVisible={false}` keeps it in the
 * accessibility tree when the surrounding panel already has a visible title.
 */
export type SortDirection = "ascending" | "descending";

export type Column<Row> = {
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  /** Set on the column currently sorted. */
  sort?: SortDirection;
  /** Column width, e.g. "30%" or "8rem". */
  width?: string;
};

export type DataTableProps<Row> = {
  caption: ReactNode;
  captionVisible?: boolean;
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row, index: number) => string;
  /** Rendered in place of the body when `rows` is empty. */
  empty?: ReactNode;
  className?: string;
};

const HIDDEN_CAPTION = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
} as const;

export default function DataTable<Row>({
  caption,
  captionVisible = false,
  columns,
  rows,
  rowKey,
  empty,
  className,
}: DataTableProps<Row>) {
  if (rows.length === 0 && empty) {
    return <div className="ax-empty">{empty}</div>;
  }

  return (
    <table className={["table", className].filter(Boolean).join(" ")}>
      <caption
        style={
          captionVisible
            ? { textAlign: "left", fontSize: 12, marginBottom: 6 }
            : HIDDEN_CAPTION
        }
      >
        {caption}
      </caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key} scope="col" aria-sort={column.sort} style={column.width ? { width: column.width } : undefined}>
              {column.header}
              {column.sort ? (
                // Decoration: `aria-sort` already carries the direction.
                <span aria-hidden="true" style={{ color: "var(--color-accent)", marginInlineStart: 4 }}>
                  {column.sort === "ascending" ? "↑" : "↓"}
                </span>
              ) : null}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={rowKey(row, index)}>
            {columns.map((column) => (
              <td key={column.key}>{column.cell(row)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
