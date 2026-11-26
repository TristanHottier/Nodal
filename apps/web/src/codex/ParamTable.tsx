// One parameter table: inspector fields or a model card. Numbers and keys are mono.
export interface ParamTableRow {
  key: string;
  name?: string;
  unit: string;
  default: string;
  meaning: string;
  /** When the row applies, e.g. "Waveform = pulse". */
  when?: string;
}

export function ParamTable({
  caption,
  firstColumn,
  rows,
}: {
  caption: string;
  firstColumn: string;
  rows: readonly ParamTableRow[];
}) {
  return (
    <div className="nodal-codex-table-wrap" tabIndex={0} role="region" aria-label={caption}>
      <table className="nodal-codex-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{firstColumn}</th>
            <th scope="col">Unit</th>
            <th scope="col">Default</th>
            <th scope="col">Meaning</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row" className="nodal-num">
                {row.key}
                {row.name !== undefined && row.name !== row.key ? (
                  <span className="nodal-codex-field-name">{row.name}</span>
                ) : null}
              </th>
              <td className="nodal-num">{row.unit}</td>
              <td className="nodal-num">{row.default}</td>
              <td>
                {row.meaning}
                {row.when !== undefined ? (
                  <span className="nodal-codex-when"> ({row.when})</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
