// Lossless support for LaTeX `\( ... \)` inline math and `\[ ... \]` display
// math delimiters alongside Milkdown's built-in `$...$` and `$$...$$` syntax.
//
// How it stays 100% lossless and safe:
//   * Registers proper micromark flow (`\[...\]`) and text (`\(...\)`) tokenizers
//     ahead of CommonMark `characterEscape`, so code fences, inline code spans,
//     URLs, and double-backslash escapes (`\\(`) are never touched, and unclosed
//     delimiters cleanly backtrack to normal Markdown.
//   * Tags parsed mdast nodes with `data.mdmeowMathDelimiter` (`"paren"`,
//     `"bracket"`, or `"bracket-line"`) and preserves that attribute on
//     ProseMirror `math_inline` and `code_block` nodes.
//   * Serializes tagged nodes back with their exact original delimiters while
//     delegating `$...$` and `$$...$$` untouched to `remark-math`'s handlers.

import { InitReady, remarkPluginsCtx, schemaCtx } from "@milkdown/kit/core";
import type { Crepe } from "@milkdown/crepe";
import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import { $remark } from "@milkdown/kit/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type LatexDelimiterKind = "dollar" | "paren" | "bracket" | "bracket-line";

const isLineEnding = (code: number | null): boolean =>
  code === -5 || code === -4 || code === -3;

const isSpaceOrTab = (code: number | null): boolean =>
  code === 32 || code === 9 || code === -2 || code === -1;

// --- micromark: inline \( ... \) -------------------------------------------

const closingParenConstruct = {
  partial: true,
  tokenize(effects: any, ok: any, nok: any) {
    return start;
    function start(code: number | null) {
      if (code !== 92) return nok(code);
      effects.enter("mdmeowParenMathClose");
      effects.consume(code);
      return afterBackslash;
    }
    function afterBackslash(code: number | null) {
      if (code !== 41) return nok(code);
      effects.consume(code);
      effects.exit("mdmeowParenMathClose");
      return ok;
    }
  },
};

const parenMathText = {
  name: "mdmeowParenMath",
  tokenize(effects: any, ok: any, nok: any) {
    let hasNonSpace = false;
    let inData = false;
    return start;

    function start(code: number | null) {
      if (code !== 92) return nok(code);
      effects.enter("mdmeowParenMath");
      effects.enter("mdmeowParenMathOpen");
      effects.consume(code);
      return afterOpenBackslash;
    }

    function afterOpenBackslash(code: number | null) {
      if (code !== 40) return nok(code);
      effects.consume(code);
      effects.exit("mdmeowParenMathOpen");
      return contentLoop;
    }

    function contentLoop(code: number | null): any {
      if (code === null) return nok(code);

      if (isLineEnding(code)) {
        if (inData) {
          effects.exit("mdmeowParenMathData");
          inData = false;
        }
        effects.enter("lineEnding");
        effects.consume(code);
        effects.exit("lineEnding");
        return contentLoop;
      }

      if (code === 92) {
        return effects.check(closingParenConstruct, beforeClose, consumeBackslash)(code);
      }

      if (!inData) {
        effects.enter("mdmeowParenMathData");
        inData = true;
      }
      if (!isSpaceOrTab(code)) hasNonSpace = true;
      effects.consume(code);
      return contentLoop;
    }

    function consumeBackslash(code: number | null) {
      if (!inData) {
        effects.enter("mdmeowParenMathData");
        inData = true;
      }
      hasNonSpace = true;
      effects.consume(code);
      return afterDataBackslash;
    }

    function afterDataBackslash(code: number | null): any {
      // Consume `\\` as a pair so `\\)` inside LaTeX never closes `\)`.
      if (code === 92) {
        effects.consume(code);
        return contentLoop;
      }
      return contentLoop(code);
    }

    function beforeClose(code: number | null) {
      if (!hasNonSpace) return nok(code);
      if (inData) {
        effects.exit("mdmeowParenMathData");
        inData = false;
      }
      return effects.attempt(closingParenConstruct, afterClose, nok)(code);
    }

    function afterClose(code: number | null) {
      effects.exit("mdmeowParenMath");
      return ok(code);
    }
  },
};

// --- micromark: display \[ ... \] ------------------------------------------

const nonLazyContinuation = {
  partial: true,
  tokenize(this: any, effects: any, ok: any, nok: any) {
    const self = this;
    return start;
    function start(code: number | null) {
      if (code === null) return nok(code);
      effects.enter("lineEnding");
      effects.consume(code);
      effects.exit("lineEnding");
      return lineStart;
    }
    function lineStart(code: number | null) {
      return self.parser.lazy[self.now().line] ? nok(code) : ok(code);
    }
  },
};

const trailingSpacesBeforeEol = {
  partial: true,
  tokenize(effects: any, ok: any, nok: any) {
    return loop;
    function loop(code: number | null): any {
      if (isSpaceOrTab(code)) {
        effects.consume(code);
        return loop;
      }
      return isLineEnding(code) ? ok(code) : nok(code);
    }
  },
};

const closingBracketLineEnd = {
  partial: true,
  tokenize(effects: any, ok: any, nok: any) {
    return start;
    function start(code: number | null) {
      if (code !== 92) return nok(code);
      effects.enter("mdmeowBracketMathClose");
      effects.consume(code);
      return afterBackslash;
    }
    function afterBackslash(code: number | null) {
      if (code !== 93) return nok(code);
      effects.consume(code);
      return trailing;
    }
    function trailing(code: number | null): any {
      if (isSpaceOrTab(code)) {
        effects.consume(code);
        return trailing;
      }
      if (code === null || isLineEnding(code)) {
        effects.exit("mdmeowBracketMathClose");
        return ok(code);
      }
      return nok(code);
    }
  },
};

const closingBracketOwnLine = {
  partial: true,
  tokenize(effects: any, ok: any, nok: any) {
    return leadingSpaces;
    function leadingSpaces(code: number | null): any {
      if (isSpaceOrTab(code)) {
        effects.consume(code);
        return leadingSpaces;
      }
      return effects.attempt(closingBracketLineEnd, ok, nok)(code);
    }
  },
};

const bracketMathFlow = {
  name: "mdmeowBracketMathFlow",
  concrete: true,
  tokenize(this: any, effects: any, ok: any, nok: any) {
    const self = this;
    let hasNonSpace = false;
    let inValue = false;
    return start;

    function start(code: number | null) {
      if (code !== 92) return nok(code);
      effects.enter("mdmeowBracketMathFlow");
      effects.enter("mdmeowBracketMathOpen");
      effects.consume(code);
      return afterOpenBackslash;
    }

    function afterOpenBackslash(code: number | null) {
      if (code !== 91) return nok(code);
      effects.consume(code);
      return afterOpenBracket;
    }

    function afterOpenBracket(code: number | null) {
      return effects.attempt(
        trailingSpacesBeforeEol,
        afterOpenLineOnly,
        afterOpenInlineStart,
      )(code);
    }

    function afterOpenLineOnly(code: number | null) {
      effects.exit("mdmeowBracketMathOpen");
      if (self.interrupt) {
        effects.exit("mdmeowBracketMathFlow");
        return ok(code);
      }
      return effects.attempt(nonLazyContinuation, afterLineBreak, nok)(code);
    }

    function afterOpenInlineStart(code: number | null) {
      effects.exit("mdmeowBracketMathOpen");
      if (code === null) return nok(code);
      return lineContent(code);
    }

    function afterLineBreak(code: number | null) {
      if (code === null) return nok(code);
      return effects.attempt(
        closingBracketOwnLine,
        onOwnLineClose,
        lineContentStart,
      )(code);
    }

    function onOwnLineClose(code: number | null) {
      if (!hasNonSpace) return nok(code);
      effects.exit("mdmeowBracketMathFlow");
      return ok(code);
    }

    function lineContentStart(code: number | null) {
      if (code === null) return nok(code);
      if (isLineEnding(code)) {
        return effects.attempt(nonLazyContinuation, afterLineBreak, nok)(code);
      }
      return lineContent(code);
    }

    function lineContent(code: number | null): any {
      if (code === null) return nok(code);

      if (isLineEnding(code)) {
        if (inValue) {
          effects.exit("mdmeowBracketMathValue");
          inValue = false;
        }
        if (self.interrupt) return nok(code);
        return effects.attempt(nonLazyContinuation, afterLineBreak, nok)(code);
      }

      if (code === 92) {
        return effects.check(
          closingBracketLineEnd,
          onInlineClose,
          consumeBackslash,
        )(code);
      }

      if (!inValue) {
        effects.enter("mdmeowBracketMathValue");
        inValue = true;
      }
      if (!isSpaceOrTab(code)) hasNonSpace = true;
      effects.consume(code);
      return lineContent;
    }

    function consumeBackslash(code: number | null) {
      if (!inValue) {
        effects.enter("mdmeowBracketMathValue");
        inValue = true;
      }
      hasNonSpace = true;
      effects.consume(code);
      return afterValueBackslash;
    }

    function afterValueBackslash(code: number | null): any {
      // Consume `\\` as a pair so `\\]` inside LaTeX never closes `\]`.
      if (code === 92) {
        effects.consume(code);
        return lineContent;
      }
      return lineContent(code);
    }

    function onInlineClose(code: number | null) {
      if (!hasNonSpace) return nok(code);
      if (inValue) {
        effects.exit("mdmeowBracketMathValue");
        inValue = false;
      }
      return effects.attempt(closingBracketLineEnd, afterInlineClose, nok)(code);
    }

    function afterInlineClose(code: number | null) {
      effects.exit("mdmeowBracketMathFlow");
      return ok(code);
    }
  },
};

function latexDelimitersSyntax() {
  return {
    flow: {
      92: bracketMathFlow,
    },
    text: {
      92: parenMathText,
    },
  };
}

// --- mdast-util-from-markdown ----------------------------------------------

function latexDelimitersFromMarkdown() {
  return {
    enter: {
      mdmeowParenMath(this: any, token: any) {
        this.enter(
          {
            type: "inlineMath",
            value: "",
            data: {
              mdmeowMathDelimiter: "paren" as LatexDelimiterKind,
              hName: "code",
              hProperties: { className: ["language-math", "math-inline"] },
              hChildren: [],
            },
          },
          token,
        );
      },
      mdmeowBracketMathFlow(this: any, token: any) {
        const code = {
          type: "element",
          tagName: "code",
          properties: { className: ["language-math", "math-display"] },
          children: [],
        };
        this.enter(
          {
            type: "math",
            meta: null,
            value: "",
            data: {
              mdmeowMathDelimiter: "bracket" as LatexDelimiterKind,
              hName: "pre",
              hChildren: [code],
            },
          },
          token,
        );
      },
    },
    exit: {
      mdmeowParenMathOpen(this: any) {
        this.buffer();
      },
      mdmeowParenMathData(this: any, token: any) {
        this.config.enter.data.call(this, token);
        this.config.exit.data.call(this, token);
      },
      mdmeowParenMath(this: any, token: any) {
        const data = this.resume();
        const node = this.stack[this.stack.length - 1];
        this.exit(token);
        node.value = data;
        node.data.hChildren.push({ type: "text", value: data });
      },
      mdmeowBracketMathOpen(this: any) {
        this.buffer();
      },
      mdmeowBracketMathValue(this: any, token: any) {
        this.config.enter.data.call(this, token);
        this.config.exit.data.call(this, token);
      },
      mdmeowBracketMathFlow(this: any, token: any) {
        const raw: string = this.resume();
        const node = this.stack[this.stack.length - 1];
        this.exit(token);

        const hasOuterNewlines =
          /^(?:\r?\n|\r)/.test(raw) && /(?:\r?\n|\r)$/.test(raw);
        if (hasOuterNewlines) {
          node.value = raw.replace(/^(?:\r?\n|\r)|(?:\r?\n|\r)$/g, "");
          node.data.mdmeowMathDelimiter = "bracket" as LatexDelimiterKind;
        } else {
          node.value = raw;
          node.data.mdmeowMathDelimiter = "bracket-line" as LatexDelimiterKind;
        }
        node.data.hChildren[0].children.push({ type: "text", value: node.value });
      },
    },
  };
}

// --- remark plugin (parser + serializer) -----------------------------------

function remarkLatexDelimiters(this: any) {
  const data = this.data();
  const micromarkExtensions = (data.micromarkExtensions ??= []);
  const fromMarkdownExtensions = (data.fromMarkdownExtensions ??= []);
  const toMarkdownExtensions = (data.toMarkdownExtensions ??= []);

  let baseMath: any = null;
  let baseInlineMath: any = null;
  for (const ext of toMarkdownExtensions) {
    if (ext?.handlers?.math) baseMath = ext.handlers.math;
    if (ext?.handlers?.inlineMath) baseInlineMath = ext.handlers.inlineMath;
  }

  const mathHandler: any = (node: any, parent: any, state: any, info: any) => {
    const delim = node?.data?.mdmeowMathDelimiter as LatexDelimiterKind | undefined;
    const raw = node.value || "";
    if (delim === "bracket") {
      return raw ? `\\[\n${raw}\n\\]` : "\\[\n\\]";
    }
    if (delim === "bracket-line") {
      return `\\[${raw}\\]`;
    }
    if (baseMath) return baseMath(node, parent, state, info);
    return raw ? `$$\n${raw}\n$$` : "$$\n$$";
  };

  const inlineMathHandler: any = (node: any, parent: any, state: any, info: any) => {
    const delim = node?.data?.mdmeowMathDelimiter as LatexDelimiterKind | undefined;
    if (delim === "paren") {
      return `\\(${node.value || ""}\\)`;
    }
    if (baseInlineMath) return baseInlineMath(node, parent, state, info);
    return `$${node.value || ""}$`;
  };
  inlineMathHandler.peek = (node: any) =>
    node?.data?.mdmeowMathDelimiter === "paren" ? "\\" : "$";

  micromarkExtensions.push(latexDelimitersSyntax());
  fromMarkdownExtensions.push(latexDelimitersFromMarkdown());
  toMarkdownExtensions.push({
    handlers: {
      math: mathHandler,
      inlineMath: inlineMathHandler,
    },
  });
}

export const remarkLatexDelimitersPlugin = $remark(
  "mdmeowLatexDelimiters",
  () => remarkLatexDelimiters,
);

function transformBracketMathNodes(node: any): void {
  if (!node || typeof node !== "object" || !Array.isArray(node.children)) return;
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (
      child?.type === "math" &&
      (child.data?.mdmeowMathDelimiter === "bracket" ||
        child.data?.mdmeowMathDelimiter === "bracket-line")
    ) {
      node.children[i] = {
        type: "code",
        lang: "LaTeX",
        value: child.value,
        data: { mdmeowMathDelimiter: child.data.mdmeowMathDelimiter },
      };
    } else {
      transformBracketMathNodes(child);
    }
  }
}

/** Prepend ahead of Crepe's `remarkMathBlockPlugin` so `\[...\]` display math
 *  retains `data.mdmeowMathDelimiter` when converted into a `LaTeX` code_block. */
export const preserveBracketMathPlugin: MilkdownPlugin = (ctx) => async () => {
  await ctx.wait(InitReady);
  const entry = {
    plugin: () => (ast: any) => {
      transformBracketMathNodes(ast);
    },
    options: {},
  };
  ctx.update(remarkPluginsCtx, (rp) => [entry, ...rp]);
  return () => {
    ctx.update(remarkPluginsCtx, (rp) => rp.filter((item) => item !== entry));
  };
};

function addStringAttr(nodeType: any, spec: any, attrName: string, defaultValue: string): void {
  if (nodeType.attrs?.[attrName]) return;
  spec.attrs = {
    ...(spec.attrs ?? {}),
    [attrName]: { default: defaultValue, validate: "string" },
  };
  nodeType.attrs[attrName] = {
    hasDefault: true,
    default: defaultValue,
    validate: (v: unknown) => {
      if (typeof v !== "string") throw new RangeError(`Invalid ${attrName}`);
    },
  };
  nodeType.defaultAttrs = {
    ...(nodeType.defaultAttrs ?? {}),
    [attrName]: defaultValue,
  };
}

/** Patch `math_inline` and `code_block` schemas after Crepe initialization so
 *  `\(...\)` and `\[...\]` round-trip without rewriting delimiters to `$`/`$$`. */
export function patchLatexDelimitersMarkdown(crepe: Crepe): void {
  crepe.editor.action((ctx) => {
    const nodes = (ctx.get(schemaCtx) as any).nodes;

    const inlineType = nodes?.math_inline;
    const inlineSpec = inlineType?.spec;
    if (inlineType && inlineSpec?.parseMarkdown && inlineSpec?.toMarkdown) {
      addStringAttr(inlineType, inlineSpec, "mdmeowMathDelimiter", "dollar");

      const origToDom = inlineSpec.toDOM;
      if (origToDom) {
        inlineSpec.toDOM = (node: any) => {
          const dom = origToDom(node);
          if (dom instanceof HTMLElement && node.attrs?.mdmeowMathDelimiter === "paren") {
            dom.dataset.mdmeowDelimiter = "paren";
          }
          return dom;
        };
      }
      if (Array.isArray(inlineSpec.parseDOM)) {
        inlineSpec.parseDOM = inlineSpec.parseDOM.map((rule: any) => {
          if (!rule.getAttrs) return rule;
          const origGetAttrs = rule.getAttrs;
          return {
            ...rule,
            getAttrs: (dom: HTMLElement) => {
              const base = origGetAttrs(dom);
              if (base === false) return false;
              const delim = dom.dataset?.mdmeowDelimiter === "paren" ? "paren" : "dollar";
              return { ...(base ?? {}), mdmeowMathDelimiter: delim };
            },
          };
        });
      }

      const origParse = inlineSpec.parseMarkdown.runner;
      inlineSpec.parseMarkdown.runner = (state: any, node: any, type: any) => {
        if (node.data?.mdmeowMathDelimiter === "paren") {
          state.addNode(type, { value: node.value, mdmeowMathDelimiter: "paren" });
          return;
        }
        origParse(state, node, type);
      };

      const origSerialize = inlineSpec.toMarkdown.runner;
      inlineSpec.toMarkdown.runner = (state: any, node: any) => {
        if (node.attrs?.mdmeowMathDelimiter === "paren") {
          state.addNode("inlineMath", undefined, node.attrs.value, {
            data: { mdmeowMathDelimiter: "paren" },
          });
          return;
        }
        origSerialize(state, node);
      };
    }

    const cbType = nodes?.code_block;
    const cbSpec = cbType?.spec;
    if (cbType && cbSpec?.parseMarkdown && cbSpec?.toMarkdown) {
      addStringAttr(cbType, cbSpec, "mdmeowMathDelimiter", "dollar");

      const origParse = cbSpec.parseMarkdown.runner;
      cbSpec.parseMarkdown.runner = (state: any, node: any, type: any) => {
        const delim = node.data?.mdmeowMathDelimiter;
        if (delim === "bracket" || delim === "bracket-line") {
          state.openNode(type, {
            language: "LaTeX",
            mdmeowMathDelimiter: delim,
          });
          if (node.value) state.addText(node.value);
          state.closeNode();
          return;
        }
        origParse(state, node, type);
      };

      const origSerialize = cbSpec.toMarkdown.runner;
      cbSpec.toMarkdown.runner = (state: any, node: any) => {
        const delim = node.attrs?.mdmeowMathDelimiter;
        if (
          !node.attrs?.mdmeowFencedLatex &&
          (delim === "bracket" || delim === "bracket-line")
        ) {
          state.addNode("math", undefined, node.content.firstChild?.text || "", {
            data: { mdmeowMathDelimiter: delim },
          });
          return;
        }
        origSerialize(state, node);
      };
    }
  });
}
