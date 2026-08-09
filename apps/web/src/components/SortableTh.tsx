type SortDir = 'asc' | 'desc';

type Props<K extends string> = {
  label: string;
  column: K;
  sortKey: K;
  sortDir: SortDir;
  onSort: (column: K) => void;
  className?: string;
};

function ariaSort(
  activeKey: string,
  dir: SortDir,
  column: string,
): 'ascending' | 'descending' | 'none' {
  if (activeKey !== column) return 'none';
  return dir === 'asc' ? 'ascending' : 'descending';
}

export function SortableTh<K extends string>({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  className,
}: Props<K>) {
  const active = sortKey === column;
  return (
    <th aria-sort={ariaSort(sortKey, sortDir, column)} className={className}>
      <button
        type="button"
        className={`th-sort${active ? ' is-active' : ''}`}
        onClick={() => onSort(column)}
      >
        <span>{label}</span>
        <span className="th-sort-ind" aria-hidden>
          {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  );
}
