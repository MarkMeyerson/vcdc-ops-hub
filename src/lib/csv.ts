// RFC 4180 CSV, one definition for the whole app. Club data arrives from
// Excel and Google Sheets, so quoted fields, embedded commas, doubled
// quotes, and CRLF all have to survive the trip.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  // Excel writes a BOM on UTF-8 CSVs and it would otherwise become part of
  // the first header name.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  // A trailing newline leaves one empty row; so do the blank rows Excel
  // likes to append when a sheet has been scrolled.
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''))
}

export function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

export function toCsv(headers: readonly string[], rows: string[][]): string {
  const lines = [
    headers.map(csvField).join(','),
    ...rows.map((row) => row.map(csvField).join(',')),
  ]
  // The BOM is what makes Excel on Windows read this as UTF-8 rather than
  // mangling every accented name.
  return `﻿${lines.join('\r\n')}\r\n`
}
