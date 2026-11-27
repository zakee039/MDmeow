//! Standalone HTML export. Markdown -> GFM HTML (comrak) wrapped in a
//! self-contained page: all CSS/JS/fonts are embedded, no network needed.
//! KaTeX renders `$...$` / `$$...$$` on load; highlight.js colours code blocks.

use comrak::{markdown_to_html, Options};
use dom_query::Document;

use crate::assets;

const TEMPLATE: &str = include_str!("../assets/export/template.html");
const DOC_CSS: &str = include_str!("../assets/export/doc.css");
const KATEX_CSS: &str = include_str!("../assets/export/katex.min.css");
const HLJS_CSS: &str = include_str!("../assets/export/hljs.css");
const KATEX_JS: &str = include_str!("../assets/export/katex.min.js");
const AUTO_RENDER_JS: &str = include_str!("../assets/export/auto-render.min.js");
const HLJS_JS: &str = include_str!("../assets/export/highlight.min.js");

fn markdown_options() -> Options<'static> {
    let mut opts = Options::default();
    opts.extension.table = true;
    opts.extension.strikethrough = true;
    opts.extension.tasklist = true;
    opts.extension.autolink = true;
    opts.extension.footnotes = true;
    opts.extension.superscript = true;
    opts.extension.math_dollars = true;
    opts.extension.math_latex = true;
    opts.render.r#unsafe = true;
    opts
}

fn escape_html(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn render_template(pairs: &[(&str, &str)]) -> String {
    let mut out = String::with_capacity(TEMPLATE.len() + 4096);
    let mut rest = TEMPLATE;
    while let Some(open) = rest.find("{{") {
        out.push_str(&rest[..open]);
        let after_open = &rest[open + 2..];
        if let Some(close) = after_open.find("}}") {
            let token = &rest[open..open + 2 + close + 2];
            if let Some(&(_, replacement)) = pairs.iter().find(|&&(k, _)| k == token) {
                out.push_str(replacement);
                rest = &after_open[close + 2..];
                continue;
            }
        }
        out.push_str("{{");
        rest = after_open;
    }
    out.push_str(rest);
    out
}

/// Render `markdown` to a complete HTML document titled `title`.
/// `doc_path`, when given, is the base for resolving relative image paths —
/// they are read and inlined as `data:` URLs so the output stands alone
/// (needed for HTML export and printing).
pub fn render_html(markdown: &str, title: &str, doc_path: Option<&str>, for_print: bool) -> String {
    let doc = Document::fragment(markdown_to_html(markdown, &markdown_options()));
    if for_print {
        doc.select("script, iframe, frame, object, embed, meta, base, link")
            .remove();
    }
    for img in doc.select("img").nodes() {
        if let Some(src) = img.attr("src") {
            if !assets::is_external(&src) {
                if let Ok(url) = assets::to_data_url(doc_path, &src) {
                    img.set_attr("src", &url);
                }
            }
        }
        apply_mdmeow_image_meta(img);
    }
    let body = doc.html_root().inner_html();
    let nonce = uuid::Uuid::new_v4().simple().to_string();
    let print_csp = if for_print {
        format!(
            r#"<meta http-equiv="Content-Security-Policy" content="script-src 'nonce-{nonce}'; script-src-attr 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'">"#
        )
    } else {
        String::new()
    };
    let escaped_title = escape_html(title);

    render_template(&[
        ("{{TITLE}}", &escaped_title),
        ("{{NONCE}}", &nonce),
        ("{{PRINT_CSP}}", &print_csp),
        ("{{FOR_PRINT}}", if for_print { "true" } else { "false" }),
        ("{{DOC_CSS}}", DOC_CSS),
        ("{{KATEX_CSS}}", KATEX_CSS),
        ("{{HLJS_CSS}}", HLJS_CSS),
        ("{{KATEX_JS}}", KATEX_JS),
        ("{{AUTO_RENDER_JS}}", AUTO_RENDER_JS),
        ("{{HLJS_JS}}", HLJS_JS),
        ("{{BODY}}", &body),
    ])
}

fn apply_mdmeow_image_meta(img: &dom_query::NodeRef<'_>) {
    let Some(title) = img.attr("title") else {
        return;
    };
    let Some(rest_meta) = title.strip_prefix("mdmeow:image;") else {
        return;
    };
    let mut ratio: Option<f64> = None;
    let mut align: Option<&str> = None;
    for part in rest_meta.split(';') {
        if let Some(r) = part.strip_prefix("ratio=") {
            ratio = r.parse::<f64>().ok().filter(|&v| v.is_finite() && v > 0.0);
        } else if let Some(a) = part.strip_prefix("align=") {
            if matches!(a, "left" | "center" | "right") {
                align = Some(a);
            }
        }
    }
    let (Some(r), Some(a)) = (ratio, align) else {
        return;
    };
    img.remove_attr("title");
    img.set_attr("data-align", a);
    if (r - 1.0).abs() >= 0.0001 {
        let pct = (r * 10000.0).round() / 100.0;
        let style = img.attr_or("style", "");
        let prefix = if style.is_empty() {
            String::new()
        } else {
            format!("{style};")
        };
        img.set_attr("style", &format!("{prefix}zoom:{pct}%"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_basic_markdown() {
        let out = render_html("# Hello\n\n- a\n- b\n", "Doc", None, false);
        assert!(out.contains("<h1>Hello</h1>"));
        assert!(out.contains("<title>Doc</title>"));
        assert!(out.contains("data:font/woff2;base64"));
    }

    #[test]
    fn exposes_parsed_math_and_code_language_to_the_renderer() {
        let out = render_html(
            "Euler: $x^2$\n\n$$\na+b\n$$\n\n~~~js\nconst n = 1;\n~~~",
            "Doc",
            None,
            false,
        );
        assert!(out.contains("<span data-math-style=\"inline\">x^2</span>"));
        assert!(out.contains("data-math-style=\"display\""));
        assert!(out.contains("<code class=\"language-js\">"));
    }

    #[test]
    fn exposes_latex_paren_and_bracket_math_delimiters() {
        let out = render_html(
            "Inline: \\( E=mc^2 \\)\n\n\\[\n\\operatorname{softmax}([0,\\ln2])\n\\]\n",
            "Doc",
            None,
            false,
        );
        assert!(out.contains("data-math-style=\"inline\""));
        assert!(out.contains("E=mc^2"));
        assert!(out.contains("data-math-style=\"display\""));
        assert!(out.contains("\\operatorname{softmax}"));
    }

    #[test]
    fn print_page_restricts_active_content_and_preserves_document_text() {
        let md = "<iframe title='embedded'></iframe>\n\n**Printable**";
        let html = render_html(md, "Doc", None, true);
        assert!(html.contains("http-equiv=\"Content-Security-Policy\""));
        assert!(!html.contains("<iframe title="));
        assert!(html.contains("<strong>Printable</strong>"));
        assert!(html.contains("script-src 'nonce-"));
    }

    #[test]
    fn table_extension_active() {
        let md = "| a | b |\n|---|---|\n| 1 | 2 |\n";
        assert!(render_html(md, "t", None, false).contains("<table>"));
    }

    #[test]
    fn converts_mdmeow_image_metadata_title_for_export() {
        let md = "![Alt](https://example.com/x.png \"mdmeow:image;ratio=0.5;align=left\")\n";
        let out = render_html(md, "{{BODY}}", None, false);
        assert!(out.contains("data-align=\"left\""));
        assert!(out.contains("style=\"zoom:50%\""));
        assert!(!out.contains("mdmeow:image;"));
        assert!(out.contains("<title>{{BODY}}</title>"));
    }

    #[test]
    fn inlines_a_local_image_and_leaves_remote_ones() {
        let dir = std::env::temp_dir().join("mdmeow-export-test");
        std::fs::create_dir_all(&dir).unwrap();
        let img = dir.join("pic.png");
        std::fs::write(&img, [1u8, 2, 3, 4]).unwrap();
        let doc = dir.join("doc.md");

        let md = "<img data-src='other.png' alt='a > b' SRC = 'pic.png'>\n\n![local](pic.png)\n\n![remote](https://example.com/x.png)\n";
        let out = render_html(md, "t", doc.to_str(), false);

        assert!(out.contains("src=\"data:image/png;base64,"));
        assert!(out.contains("src=\"https://example.com/x.png\""));
        assert!(!out.contains("src=\"pic.png\""));
        assert_eq!(out.matches("src=\"data:image/png;base64,").count(), 2);
        assert!(out.contains("data-src=\"other.png\""));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
