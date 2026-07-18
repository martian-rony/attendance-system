/**
 * Minimal dependency-free CSV utilities.
 * - parseCSV: RFC-4180-ish parser (handles quoted fields, embedded commas,
 *   escaped double-quotes, CRLF/LF). Returns an array of row objects keyed by
 *   the (trimmed, lower-cased) header row.
 * - toCSV: serialize an array of objects to a CSV string, quoting every field
 *   and escaping embedded quotes.
 */

export function parseCSV(text) {
  if (typeof text !== 'string') return [];
  // Strip a UTF-8 BOM if present (Excel loves adding one).
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\r') {
      // ignore; handled by \n
    } else {
      field += ch;
    }
  }
  // Flush the last field/row (no trailing newline).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim() !== '')) // drop blank lines
    .map((r) => {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = (r[idx] ?? '').trim();
      });
      return obj;
    });
}

export function toCSV(records, fields) {
  const cols = fields || (records.length ? Object.keys(records[0]) : []);
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = cols.map(escape).join(',');
  const body = records.map((rec) => cols.map((c) => escape(rec[c])).join(',')).join('\n');
  return header + '\n' + body;
}
