//! Pretty-print GFM tables in a Markdown string: trim cells, pad every column
//! to a common width, keep per-column alignment. Everything else is untouched.

#[derive(Clone, Copy, PartialEq)]
enum Align {
    None,
    Left,
    Right,
    Center,
}

fn split_lines_preserving_eol(md: &str) -> Vec<(&str, &str)> {
    let mut result = Vec::new();
    let mut start = 0;
    let bytes = md.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if matches!(bytes[i], b'\r' | b'\n') {
            let end = i;
            if bytes[i] == b'\r' && bytes.get(i + 1) == Some(&b'\n') {
                i += 1;
            }
            result.push((&md[start..end], &md[end..i + 1]));
            start = i + 1;
        }
        i += 1;
    }
    if start <= md.len() {
        result.push((&md[start..], ""));
    }
    result
}

/// Format only top-level tables recognized by the same GFM parser as export.
pub fn format_tables(md: &str) -> String {
    if !md.contains('|') {
        return md.to_owned();
    }
    let arena = comrak::Arena::new();
    let mut options = comrak::Options::default();
    options.extension.table = true;
    options.extension.math_dollars = true;
    let root = comrak::parse_document(&arena, md, &options);
    let lines = split_lines_preserving_eol(md);
    let mut out = String::with_capacity(md.len());
    let mut cursor = 0;
    for node in root.children() {
        let data = node.data.borrow();
        if !matches!(data.value, comrak::nodes::NodeValue::Table(_)) {
            continue;
        }
        let start = data.sourcepos.start.line - 1;
        let end = data.sourcepos.end.line;
        let Some(rows) = lines.get(start..end) else {
            continue;
        };
        if rows.len() < 2 {
            continue;
        }
        let raw: Vec<_> = rows.iter().map(|(line, _)| *line).collect();
        let cols = split_row(raw[0]).len();
        // GFM ignores excess cells. Widening the header would make them visible.
        if raw[2..].iter().any(|row| split_row(row).len() > cols) {
            continue;
        }
        for (line, eol) in &lines[cursor..start] {
            out.push_str(line);
            out.push_str(eol);
        }
        for (row, (_, eol)) in format_block(&raw).iter().zip(rows) {
            out.push_str(row);
            out.push_str(eol);
        }
        cursor = end;
    }
    for (line, eol) in &lines[cursor..] {
        out.push_str(line);
        out.push_str(eol);
    }
    out
}

fn ends_with_unescaped_pipe(s: &str) -> bool {
    if !s.ends_with('|') {
        return false;
    }
    let before = &s[..s.len() - 1];
    let backslashes = before.chars().rev().take_while(|&c| c == '\\').count();
    backslashes % 2 == 0
}

/// Split a table row into raw (untrimmed) cell strings, honouring escaped pipes
/// and dropping the empty leading/trailing segment created *only* by an actual
/// bordering `|` (so pipe-less rows starting with an empty cell are preserved).
fn split_row(line: &str) -> Vec<String> {
    let t = line.trim();
    let has_leading_pipe = t.starts_with('|');
    let has_trailing_pipe = t.len() > usize::from(has_leading_pipe) && ends_with_unescaped_pipe(t);

    let mut cells = Vec::new();
    let mut cur = String::new();
    let mut chars = t.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            '\\' => {
                cur.push('\\');
                if let Some(&next) = chars.peek() {
                    cur.push(next);
                    chars.next();
                }
            }
            '|' => {
                cells.push(cur.clone());
                cur.clear();
            }
            _ => cur.push(ch),
        }
    }
    cells.push(cur);

    if has_leading_pipe && !cells.is_empty() {
        cells.remove(0);
    }
    if has_trailing_pipe && !cells.is_empty() {
        cells.pop();
    }
    cells
}

fn parse_align(cell: &str) -> Align {
    let c = cell.trim();
    let left = c.starts_with(':');
    let right = c.ends_with(':');
    match (left, right) {
        (true, true) => Align::Center,
        (true, false) => Align::Left,
        (false, true) => Align::Right,
        (false, false) => Align::None,
    }
}

fn width(s: &str) -> usize {
    s.chars().count()
}

fn pad(cell: &str, w: usize, align: Align) -> String {
    let len = width(cell);
    if len >= w {
        return cell.to_string();
    }
    let extra = w - len;
    match align {
        Align::Right => format!("{}{}", " ".repeat(extra), cell),
        Align::Center => {
            let l = extra / 2;
            let r = extra - l;
            format!("{}{}{}", " ".repeat(l), cell, " ".repeat(r))
        }
        _ => format!("{}{}", cell, " ".repeat(extra)),
    }
}

fn delimiter(w: usize, align: Align) -> String {
    let w = w.max(3);
    match align {
        Align::None => "-".repeat(w),
        Align::Left => format!(":{}", "-".repeat(w - 1)),
        Align::Right => format!("{}:", "-".repeat(w - 1)),
        Align::Center => format!(":{}:", "-".repeat(w - 2)),
    }
}

fn format_block(block: &[&str]) -> Vec<String> {
    let header = split_row(block[0]);
    let delim = split_row(block[1]);
    let body: Vec<Vec<String>> = block[2..].iter().map(|l| split_row(l)).collect();

    let cols = header
        .len()
        .max(delim.len())
        .max(body.iter().map(|r| r.len()).max().unwrap_or(0));

    let aligns: Vec<Align> = (0..cols)
        .map(|c| delim.get(c).map(|s| parse_align(s)).unwrap_or(Align::None))
        .collect();

    let cell = |row: &[String], c: usize| row.get(c).map(|s| s.trim()).unwrap_or("").to_string();

    let mut widths = vec![3usize; cols];
    for c in 0..cols {
        widths[c] = widths[c].max(width(&cell(&header, c)));
        for row in &body {
            widths[c] = widths[c].max(width(&cell(row, c)));
        }
    }

    let render_row = |row: &[String]| -> String {
        let mut s = String::from("|");
        for c in 0..cols {
            s.push(' ');
            s.push_str(&pad(&cell(row, c), widths[c], aligns[c]));
            s.push_str(" |");
        }
        s
    };

    let mut out = Vec::with_capacity(block.len());
    out.push(render_row(&header));
    let mut d = String::from("|");
    for c in 0..cols {
        d.push(' ');
        d.push_str(&delimiter(widths[c], aligns[c]));
        d.push_str(" |");
    }
    out.push(d);
    for row in &body {
        out.push(render_row(row));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aligns_a_messy_table() {
        let input = "| a |bb|\n|:-|--:|\n|1|2222|\n";
        let want = "| a   |   bb |\n| :-- | ---: |\n| 1   | 2222 |\n";
        assert_eq!(format_tables(input), want);
    }

    #[test]
    fn preserves_headings_and_table_boundaries() {
        let heading = "alpha | beta\n---\n";
        assert_eq!(format_tables(heading), heading);
        let md = "| A | B |\n|---|---|\n# Heading | next\n";
        assert!(format_tables(md).ends_with("\n# Heading | next\n"));
        let extra = "| A | B |\n|---|---|\n| a | b | c |\n";
        assert_eq!(format_tables(extra), extra);
    }

    #[test]
    fn leaves_prose_untouched() {
        let md = "# Title\n\nSome text with a | pipe.\n\nMore.";
        assert_eq!(format_tables(md), md);
    }

    #[test]
    fn keeps_surrounding_content() {
        let md = "before\n\n| x | y |\n|---|---|\n| 1 | 2 |\n\nafter";
        let out = format_tables(md);
        assert!(out.starts_with("before\n\n|"));
        assert!(out.ends_with("\n\nafter"));
        assert!(out.contains("| x   | y   |"));
        assert!(out.contains("| --- | --- |"));
    }

    #[test]
    fn handles_escaped_pipe() {
        let input = "| a | b |\n|---|---|\n| x \\| y | z |\n";
        let out = format_tables(input);
        assert!(out.contains("x \\| y"));
    }

    #[test]
    fn skips_tables_inside_fenced_and_indented_code_blocks() {
        let fenced = "```markdown\n| a |bb|\n|---|---|\n|1|2|\n```\n";
        assert_eq!(format_tables(fenced), fenced);

        let tilde = "~~~text\n| a |bb|\n|---|---|\n|1|2|\n~~~\n";
        assert_eq!(format_tables(tilde), tilde);

        let indented = "    | a |bb|\n    |---|---|\n    |1|2|\n";
        assert_eq!(format_tables(indented), indented);
    }

    #[test]
    fn preserves_crlf_and_empty_leading_cells() {
        let crlf = "|  | Word-Context |\r\n|---|---|\r\n| 行 | 中心词 |\r\n";
        let out = format_tables(crlf);
        assert!(out.contains("\r\n"));
        assert!(!out
            .bytes()
            .zip(out.bytes().skip(1))
            .any(|(a, b)| a != b'\r' && b == b'\n'));
        assert!(out.starts_with("|     | Word-Context |\r\n"));

        let no_trailing_pipe = "| | B | C\n---|---|---\n1 | 2 | 3\n";
        let out_pipeless = format_tables(no_trailing_pipe);
        assert!(out_pipeless.starts_with("|     | B   | C   |\n"));
    }
}
