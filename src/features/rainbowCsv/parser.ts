// Splits CSV lines into fields. Quoting follows RFC 4180: a field that starts
// with " ends at the next lone " ("" inside is an escaped quote), so it may
// contain the delimiter and may continue on the following lines.

/** Where a line starts: in which field, and whether inside a quoted field. */
export interface LineState {
  readonly column: number;
  readonly inQuotes: boolean;
}

/** A line that starts a new record. */
export const RECORD_START: LineState = { column: 0, inQuotes: false };

/** Delimiters tried by detectDelimiter; on a tie the earlier one wins. */
const CANDIDATES = ["\t", ";", "|", ","];

/**
 * Parses one line that starts in `state`. Calls `onField` with the character
 * range and column index of every non-empty field (or part of a multi-line
 * field) on the line. Returns where the line ends: the column of its last
 * field and whether a quoted field is still open.
 */
export function parseLine(
  text: string,
  delimiter: string,
  state: LineState,
  onField?: (start: number, end: number, column: number) => void
): LineState {
  let column = state.column;
  let inQuotes = state.inQuotes;
  let fieldStart = 0;
  let i = 0;
  if (!inQuotes && text.startsWith('"')) {
    inQuotes = true;
    i = 1;
  }

  for (;;) {
    if (inQuotes) {
      const quote = text.indexOf('"', i);
      if (quote < 0) {
        break; // the quoted field goes on in the next line
      }
      if (text[quote + 1] === '"') {
        i = quote + 2; // escaped quote
        continue;
      }
      inQuotes = false;
      i = quote + 1;
    }
    const delim = text.indexOf(delimiter, i);
    if (delim < 0) {
      break;
    }
    if (delim > fieldStart) {
      onField?.(fieldStart, delim, column);
    }
    column++;
    fieldStart = i = delim + 1;
    if (text[i] === '"') {
      inQuotes = true;
      i++;
    }
  }

  if (text.length > fieldStart) {
    onField?.(fieldStart, text.length, column);
  }
  return { column, inQuotes };
}

/** Where the line after a line that ended in `end` starts. */
export function nextLineState(end: LineState): LineState {
  return end.inQuotes ? end : RECORD_START;
}

/**
 * Guesses the delimiter from sample lines: the one that splits the most lines
 * into the same number (2 or more) of fields. Defaults to a comma.
 */
export function detectDelimiter(lines: readonly string[]): string {
  let best = ",";
  let bestLines = 0;
  for (const delimiter of CANDIDATES) {
    const linesByFieldCount = new Map<number, number>();
    for (const line of lines) {
      const fields = parseLine(line, delimiter, RECORD_START).column + 1;
      if (fields > 1) {
        linesByFieldCount.set(fields, (linesByFieldCount.get(fields) ?? 0) + 1);
      }
    }
    for (const count of linesByFieldCount.values()) {
      if (count > bestLines) {
        best = delimiter;
        bestLines = count;
      }
    }
  }
  return best;
}
