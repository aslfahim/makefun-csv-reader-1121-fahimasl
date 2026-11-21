// Fast csv-reader 1.0.0 drop-in: single-pass charCodeAt state machine.
//
// Design: one tight loop over the whole text, driven by charCodeAt codes
// (34 '"', 44 ',', 10 LF, 13 CR). No split, no regex. A field is only ever
// materialised once it is complete, with a single String slice when it
// contains nothing that needs rewriting; only fields that contain a doubled
// quote, a CR inside quotes, a stray CR, or quote junk are rebuilt from
// slices. Rows and fields use preallocated push-only arrays and the errors
// array is only touched when an error actually occurs, so the common clean
// case allocates almost nothing per character.
//
// Semantics match csv-reader 1.0.0 exactly:
//  - U+FEFF at the very start is dropped.
//  - A record ends at LF or CRLF; a line with no characters is no record.
//  - Outside quotes a CR not followed by LF is dropped (stray_cr).
//  - A field opening with a quote runs to the next non-doubled quote; ""
//    inside is one quote, CRLF and lone CR inside read as LF; text after
//    the closing quote up to the next comma or line break is appended as
//    it stands (quote_junk, when the field ends); a quote that never
//    closes is literal and the text after it is re-read as unquoted
//    (unterminated_quote).
//  - A quote inside an unquoted field is literal. Fields stay strings,
//    never trimmed or converted.
//  - columns is the first record when header is true, else null; rows are
//    padded with "" (short_row, with fields: its count) or cut (long_row,
//    with extra: the cut fields) to the first record's width.
//  - Each error is {code, line, row} in the order met; line is the
//    1-based line its record starts on, row its index in rows (null for
//    the header); short_row/long_row are raised when the record ends.

const QUOTE = 34;
const COMMA = 44;
const LF = 10;
const CR = 13;

// How a field ended: 0 = comma (record goes on), 1 = line break, 2 = end.
const END_COMMA = 0;
const END_BREAK = 1;
const END_TEXT = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0;
  let line = 1;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === LF) {
        pos += 1;
        line += 1;
      } else if (c === CR && pos + 1 < n && text.charCodeAt(pos + 1) === LF) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    let ended = END_TEXT;

    // ---- one record: parse fields until a field ends at a break or EOF.
    while (true) {
      let value;
      if (pos < n && text.charCodeAt(pos) === QUOTE) {
        quoted = true;
        const open = pos;
        const openLine = line;
        let i = pos + 1;
        let seg = i; // start of the current clean slice inside the quotes
        let parts = null; // slice pieces, only built when rewriting is needed
        let closed = -1;
        while (i < n) {
          const c = text.charCodeAt(i);
          if (c === QUOTE) {
            if (i + 1 < n && text.charCodeAt(i + 1) === QUOTE) {
              if (parts === null) parts = [];
              if (i > seg) parts.push(text.slice(seg, i));
              parts.push('"');
              i += 2;
              seg = i;
              continue;
            }
            closed = i;
            break;
          }
          if (c === CR) {
            // CRLF and a lone CR inside quotes are each one LF.
            if (parts === null) parts = [];
            if (i > seg) parts.push(text.slice(seg, i));
            parts.push('\n');
            line += 1;
            i += i + 1 < n && text.charCodeAt(i + 1) === LF ? 2 : 1;
            seg = i;
            continue;
          }
          if (c === LF) line += 1;
          i += 1;
        }
        if (closed < 0) {
          // The quote never closes: it is a literal character, and the
          // text after it is read again as unquoted.
          pos = open + 1;
          line = openLine;
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          // Fall through to the unquoted read below, seeded with '"'.
          value = '"';
          let j = pos;
          let s2 = j;
          let p2 = null;
          let end2 = END_TEXT;
          while (j < n) {
            const c = text.charCodeAt(j);
            if (c === COMMA) {
              end2 = END_COMMA;
              break;
            }
            if (c === LF) {
              end2 = END_BREAK;
              break;
            }
            if (c === CR) {
              if (j + 1 < n && text.charCodeAt(j + 1) === LF) {
                end2 = END_BREAK;
                break;
              }
              errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
              if (p2 === null) p2 = [];
              p2.push(text.slice(s2, j));
              j += 1;
              s2 = j;
              continue;
            }
            j += 1;
          }
          if (p2 !== null) {
            p2.push(text.slice(s2, j));
            value += p2.join('');
          } else {
            value += text.slice(pos, j);
          }
          pos = j;
          if (end2 === END_COMMA) {
            pos += 1;
            ended = END_COMMA;
          } else if (end2 === END_BREAK) {
            pos += text.charCodeAt(j) === CR ? 2 : 1;
            line += 1;
            ended = END_BREAK;
          } else {
            ended = END_TEXT;
          }
          fields.push(value);
          if (ended !== END_COMMA) break;
          continue;
        }
        // Closed quoted field.
        if (parts === null) {
          value = text.slice(open + 1, closed);
        } else {
          parts.push(text.slice(seg, closed));
          value = parts.join('');
        }
        pos = closed + 1;
        if (pos >= n) {
          ended = END_TEXT;
        } else {
          const c = text.charCodeAt(pos);
          if (c === COMMA) {
            pos += 1;
            ended = END_COMMA;
          } else if (c === LF) {
            pos += 1;
            line += 1;
            ended = END_BREAK;
          } else if (c === CR && pos + 1 < n && text.charCodeAt(pos + 1) === LF) {
            pos += 2;
            line += 1;
            ended = END_BREAK;
          } else {
            // Quote junk: what follows the closing quote, up to the next
            // comma or line break, is appended as it stands.
            let j = pos;
            let s2 = j;
            let p2 = null;
            let added = 0;
            let end2 = END_TEXT;
            while (j < n) {
              const c2 = text.charCodeAt(j);
              if (c2 === COMMA) {
                end2 = END_COMMA;
                break;
              }
              if (c2 === LF) {
                end2 = END_BREAK;
                break;
              }
              if (c2 === CR) {
                if (j + 1 < n && text.charCodeAt(j + 1) === LF) {
                  end2 = END_BREAK;
                  break;
                }
                errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
                if (p2 === null) p2 = [];
                p2.push(text.slice(s2, j));
                j += 1;
                s2 = j;
                continue;
              }
              added += 1;
              j += 1;
            }
            if (p2 !== null) {
              p2.push(text.slice(s2, j));
              value += p2.join('');
            } else if (j > pos) {
              value += text.slice(pos, j);
            }
            if (added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
            pos = j;
            if (end2 === END_COMMA) {
              pos += 1;
              ended = END_COMMA;
            } else if (end2 === END_BREAK) {
              pos += text.charCodeAt(j) === CR ? 2 : 1;
              line += 1;
              ended = END_BREAK;
            } else {
              ended = END_TEXT;
            }
          }
        }
      } else {
        // ---- unquoted field (a quote inside it is a literal character).
        quoted = false;
        let j = pos;
        let s2 = j;
        let p2 = null;
        let end2 = END_TEXT;
        while (j < n) {
          const c = text.charCodeAt(j);
          if (c === COMMA) {
            end2 = END_COMMA;
            break;
          }
          if (c === LF) {
            end2 = END_BREAK;
            break;
          }
          if (c === CR) {
            if (j + 1 < n && text.charCodeAt(j + 1) === LF) {
              end2 = END_BREAK;
              break;
            }
            errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            if (p2 === null) p2 = [];
            p2.push(text.slice(s2, j));
            j += 1;
            s2 = j;
            continue;
          }
          j += 1;
        }
        if (p2 !== null) {
          p2.push(text.slice(s2, j));
          value = p2.join('');
        } else {
          value = text.slice(pos, j);
        }
        pos = j;
        if (end2 === END_COMMA) {
          pos += 1;
          ended = END_COMMA;
        } else if (end2 === END_BREAK) {
          pos += text.charCodeAt(j) === CR ? 2 : 1;
          line += 1;
          ended = END_BREAK;
        } else {
          ended = END_TEXT;
        }
      }
      fields.push(value);
      if (ended !== END_COMMA) break;
    }

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? columns ?? [] : null, rows, errors };
}
