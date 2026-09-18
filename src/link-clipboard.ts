// Turn a text selection into a link using a URL from the clipboard:
//   * paste a URL while text is selected  -> selection becomes the link text,
//     the pasted URL becomes the target
//   * Ctrl/Cmd+K while text is selected    -> same, using the current clipboard;
//     if the clipboard holds no URL a blank link is created so the Crepe link
//     tooltip opens for editing.
import { linkSchema } from "@milkdown/kit/preset/commonmark";
import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { MarkType } from "@milkdown/kit/prose/model";

const SCHEME_RE = /^(https?|mailto|tel|ftp):/i;
const BARE_DOMAIN_RE = /^[\w-]+(\.[\w-]+)+(\/\S*)?$/;

function looksLikeUrl(raw: string): boolean {
  const text = raw.trim();
  if (!text || /\s/.test(text)) return false;
  if (SCHEME_RE.test(text)) return true;
  return BARE_DOMAIN_RE.test(text);
}

function normalizeUrl(raw: string): string {
  const text = raw.trim();
  return SCHEME_RE.test(text) ? text : `https://${text}`;
}

function linkSelection(view: EditorView, type: MarkType, href: string): boolean {
  const { from, to, empty } = view.state.selection;
  if (empty) return false;
  const tr = view.state.tr
    .removeMark(from, to, type)
    .addMark(from, to, type.create({ href }));
  view.dispatch(tr.scrollIntoView());
  return true;
}

export const linkFromClipboard = $prose((ctx) => {
  const type = linkSchema.type(ctx);

  return new Plugin({
    key: new PluginKey("mdmeow-link-from-clipboard"),

    // A capture-phase paste listener wins over Milkdown's own clipboard plugin,
    // which would otherwise consume the pasted URL as plain text.
    view: (view) => {
      const onPaste = (event: ClipboardEvent) => {
        if (view.state.selection.empty) return;
        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (!looksLikeUrl(text)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        linkSelection(view, type, normalizeUrl(text));
      };
      view.dom.addEventListener("paste", onPaste, true);
      return {
        destroy: () => view.dom.removeEventListener("paste", onPaste, true),
      };
    },

    props: {
      handleKeyDown: (view, event) => {
        const mod = event.ctrlKey || event.metaKey;
        if (!mod || event.altKey || event.shiftKey) return false;
        if (event.key.toLowerCase() !== "k") return false;
        if (view.state.selection.empty) return false;
        event.preventDefault();
        void navigator.clipboard
          .readText()
          .then((clip) => {
            linkSelection(view, type, looksLikeUrl(clip) ? normalizeUrl(clip) : "https://");
          })
          .catch(() => {
            linkSelection(view, type, "https://");
          });
        return true;
      },
    },
  });
});
