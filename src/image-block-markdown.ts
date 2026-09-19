// Crepe's block-image component stores resize ratio in Markdown alt text,
// which destroys ordinary alt text and cannot store alignment. MDmeow keeps the
// image itself as standard Markdown and stores its presentation metadata in the
// optional image-title slot. This is deliberately boring: the image remains a
// real Markdown image in source mode, so changing alignment/scale can never
// make the image disappear from serialization.
//
// Example:
//   ![Alt](pic.png "mdmeow:image;ratio=0.5;align=left")
//
// The title is parsed back into the editable image-block node on reopen.

import { schemaCtx } from "@milkdown/kit/core";
import type { Crepe } from "@milkdown/crepe";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Exactly what `Number.parseFloat(r).toFixed(2)` produces, e.g. "1.00". */
const CREPE_RATIO = /^\d+\.\d{2}$/;
const META_PREFIX = "mdmeow:image;";
const META_RE =
  /^mdmeow:image;ratio=([0-9]+(?:\.[0-9]+)?);align=(left|center|right)$/;
const IMAGE_ALIGN = new Set(["left", "center", "right"]);

export type ImageAlign = "left" | "center" | "right";

function normalizeAlign(value: unknown): ImageAlign {
  const align = String(value ?? "").trim().toLowerCase();
  return IMAGE_ALIGN.has(align) ? (align as ImageAlign) : "center";
}

function normalizeRatio(value: unknown): number {
  const ratio = Number(value);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

function metadataTitle(ratio: unknown, align: unknown): string {
  return [
    META_PREFIX,
    `ratio=${Number(normalizeRatio(ratio).toFixed(4))};`,
    `align=${normalizeAlign(align)}`,
  ].join("");
}

function parseMetadataTitle(
  value: unknown,
): { ratio: number; align: ImageAlign } | null {
  const title = String(value ?? "").trim();
  const match = title.match(META_RE);
  if (!match) return null;
  return {
    ratio: normalizeRatio(match[1]),
    align: normalizeAlign(match[2]),
  };
}

function parseRunner(state: any, node: any, type: any): void {
  const src = typeof node.url === "string" ? node.url : "";
  const alt = typeof node.alt === "string" ? node.alt : "";
  const title = typeof node.title === "string" ? node.title : "";

  const metadata = parseMetadataTitle(title);
  if (metadata) {
    state.addNode(type, {
      src,
      caption: alt,
      title: "",
      ratio: metadata.ratio,
      align: metadata.align,
    });
    return;
  }

  // Migrate files written by unpatched Crepe: ratio in alt, caption in title.
  // Preserve the old resize ratio instead of throwing it away.
  if (CREPE_RATIO.test(alt)) {
    state.addNode(type, {
      src,
      caption: title,
      title: "",
      ratio: normalizeRatio(alt),
      align: "center",
    });
    return;
  }

  state.addNode(type, {
    src,
    caption: alt,
    title,
    ratio: 1,
    align: "center",
  });
}

function toMarkdownRunner(state: any, node: any): void {
  const ratio = normalizeRatio(node.attrs.ratio);
  const align = normalizeAlign(node.attrs.align);
  const userTitle =
    typeof node.attrs.title === "string" ? node.attrs.title : "";

  state.openNode("paragraph");
  state.addNode("image", undefined, undefined, {
    url: String(node.attrs.src ?? ""),
    alt: typeof node.attrs.caption === "string" ? node.attrs.caption : "",
    title:
      Math.abs(ratio - 1) >= 0.0001 || align !== "center"
        ? metadataTitle(ratio, align)
        : userTitle || undefined,
  });
  state.closeNode();
}

/** Extend the live image-block schema and install lossless Markdown runners. */
export function patchImageBlockMarkdown(crepe: Crepe): void {
  crepe.editor.action((ctx) => {
    const imageType = (ctx.get(schemaCtx) as any).nodes?.["image-block"];
    const spec = imageType?.spec;
    if (!imageType || !spec?.parseMarkdown || !spec?.toMarkdown) return;

    // ProseMirror has already compiled the schema by the time Crepe is created.
    // Add one defaulted attribute to both the public spec and compiled NodeType
    // so alignment is document state rather than temporary DOM state.
    if (!imageType.attrs?.align) {
      spec.attrs = {
        ...(spec.attrs ?? {}),
        align: { default: "center", validate: "string" },
      };
      imageType.attrs.align = {
        hasDefault: true,
        default: "center",
        validate: (value: unknown) => {
          if (!IMAGE_ALIGN.has(String(value))) {
            throw new RangeError(`Invalid image alignment: ${String(value)}`);
          }
        },
      };
      imageType.defaultAttrs = {
        ...(imageType.defaultAttrs ?? {}),
        align: "center",
      };
    }

    if (!imageType.attrs?.title) {
      spec.attrs = {
        ...(spec.attrs ?? {}),
        title: { default: "", validate: "string" },
      };
      imageType.attrs.title = {
        hasDefault: true,
        default: "",
        validate: (value: unknown) => {
          if (typeof value !== "string") {
            throw new RangeError("Invalid image title");
          }
        },
      };
      imageType.defaultAttrs = {
        ...(imageType.defaultAttrs ?? {}),
        title: "",
      };
    }

    spec.parseMarkdown.runner = parseRunner;
    spec.toMarkdown.runner = toMarkdownRunner;
  });
}
