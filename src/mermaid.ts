// Lazily render ```mermaid blocks as diagrams without loading Mermaid for
// documents that contain no diagrams.
import type { Mermaid } from "mermaid";

let loading: Promise<Mermaid> | null = null;
let configuredTheme = "";
let counter = 0;

export function isMermaidLanguage(language: string): boolean {
  return language.toLowerCase() === "mermaid";
}

function errorBox(message: string): HTMLElement {
  const box = document.createElement("div");
  box.className = "mermaid-error";
  box.textContent = message;
  return box;
}

/** Pass the generated SVG or a safe error element back to Crepe's preview. */
export function renderMermaid(
  source: string,
  apply: (value: string | HTMLElement | null) => void,
): void {
  void (async () => {
    const id = `mdmeow-mermaid-${++counter}`;
    try {
      loading ??= import("mermaid").then((m) => m.default);
      const mermaid = await loading;
      const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "default";
      if (theme !== configuredTheme) {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme,
          htmlLabels: false,
          flowchart: { htmlLabels: false },
        });
        configuredTheme = theme;
      }
      const { svg } = await mermaid.render(id, source);
      apply(svg);
    } catch (error) {
      // Mermaid can leave an error illustration in the DOM after a failed render.
      document.getElementById(`d${id}`)?.remove();
      apply(errorBox(error instanceof Error ? error.message.split("\n")[0] : String(error)));
    }
  })();
}
