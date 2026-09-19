import { $prose } from "@milkdown/kit/utils";
import { NodeSelection, Plugin } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import {
  buildRawHtmlImage,
  rawHtmlImagePresentation,
  updateRawHtmlImagePresentation,
} from "./html-markdown";
import { t } from "./i18n";

type Align = "left" | "center" | "right";
type ImageKind = "markdown" | "html";

const SCALES = [25, 33, 50, 67, 80, 100, 150, 200] as const;

const ICONS = {
  left: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M4 9h10M4 13h16M4 17h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  center: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M7 9h10M4 13h16M7 17h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  right: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M10 9h10M4 13h16M10 17h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  scale: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3m2 0-1 13H8L7 7m3 4v5m4-5v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

function makeButton(
  className: string,
  icon: string,
  title: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.innerHTML = icon;
  button.addEventListener("click", onClick);
  return button;
}

function normalizeAlign(value: unknown): Align {
  const align = String(value ?? "").toLowerCase();
  return align === "left" || align === "right" ? align : "center";
}

function syncImageAlignDom(view: EditorView): void {
  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== "image-block") return;
    const dom = view.nodeDOM(pos);
    const block =
      dom instanceof HTMLElement
        ? dom.closest<HTMLElement>(".milkdown-image-block") ?? dom
        : null;
    if (!block) return;
    block.dataset.mdmeowImageAlign = normalizeAlign(node.attrs.align);
  });
}

function imageBlockPosFromTarget(
  view: EditorView,
  target: EventTarget | null,
): number | null {
  const element = target instanceof Element ? target : null;
  const block = element?.closest<HTMLElement>(".milkdown-image-block");
  const image = block?.querySelector<HTMLImageElement>('img[data-type="image-block"]');
  if (!image || !block) return null;

  let pos: number;
  try {
    pos = view.posAtDOM(block, 0);
  } catch {
    return null;
  }

  for (const candidate of [pos, pos - 1, pos + 1]) {
    if (candidate < 0 || candidate >= view.state.doc.content.size) continue;
    if (view.state.doc.nodeAt(candidate)?.type.name === "image-block") {
      return candidate;
    }
  }
  return null;
}

function htmlImagePosFromTarget(
  view: EditorView,
  target: EventTarget | null,
): number | null {
  const element = target instanceof Element ? target : null;
  const image = element?.closest<HTMLImageElement>(
    'img[data-mdmeow-html-img="true"]',
  );
  if (!image) return null;

  let pos = -1;
  try {
    pos = view.posAtDOM(image, 0);
  } catch {
    // Leaf/atom HTML nodes may not expose a DOM offset that posAtDOM accepts.
    // Fall through to the nodeDOM identity lookup below.
  }

  if (pos >= 0) {
    for (const candidate of [pos, pos - 1, pos + 1]) {
      if (candidate < 0 || candidate >= view.state.doc.content.size) continue;
      const node = view.state.doc.nodeAt(candidate);
      if (
        node?.type.name === "html" &&
        rawHtmlImagePresentation(String(node.attrs?.value ?? ""))
      ) {
        return candidate;
      }
    }
  }

  // Raw HTML images are simple atom-like DOM nodes, but keep a DOM identity
  // fallback for browser/ProseMirror mapping differences.
  let found: number | null = null;
  view.state.doc.descendants((node, candidate) => {
    if (found !== null || node.type.name !== "html") return;
    if (!rawHtmlImagePresentation(String(node.attrs?.value ?? ""))) return;
    const dom = view.nodeDOM(candidate);
    if (dom === image || (dom instanceof HTMLElement && dom.contains(image))) {
      found = candidate;
    }
  });
  return found;
}

class ImageToolbarView {
  private view: EditorView;
  private readonly toolbar: HTMLDivElement;
  private readonly titlePopover: HTMLDivElement;
  private readonly titleInput: HTMLInputElement;
  private readonly scaleMenu: HTMLDivElement;
  private readonly alignButtons = new Map<Align, HTMLButtonElement>();
  private readonly scaleItems = new Map<number, HTMLButtonElement>();
  private scaleButton: HTMLButtonElement;
  private titleButton: HTMLButtonElement;
  private currentKind: ImageKind | null = null;
  private currentPos: number | null = null;
  private currentBlock: HTMLElement | null = null;
  private currentImage: HTMLImageElement | null = null;
  private openScale = false;
  private openTitle = false;
  private scrollHost: HTMLElement | null = null;

  constructor(view: EditorView) {
    this.view = view;
    // Crepe renders image-block through a custom Vue NodeView, which may
    // consume pointer events before ProseMirror's normal node-selection logic.
    // Capture a click on the image itself so the toolbar always has a
    // NodeSelection to follow.
    view.dom.addEventListener("pointerdown", this.handleImagePointerDown, true);

    this.toolbar = document.createElement("div");
    this.toolbar.className = "mdmeow-image-toolbar";
    this.toolbar.hidden = true;
    this.toolbar.addEventListener("pointerdown", (event) => {
      if (event.target instanceof Element && event.target.closest("input")) {
        event.stopPropagation();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    });
    this.toolbar.addEventListener("click", (event) => event.stopPropagation());

    this.titleButton = document.createElement("button");
    this.titleButton.type = "button";
    this.titleButton.className =
      "mdmeow-image-toolbar-button mdmeow-image-title-button";
    this.titleButton.textContent = t("image.title");
    this.titleButton.title = t("image.title");
    this.titleButton.setAttribute("aria-label", t("image.title"));
    this.titleButton.addEventListener("click", () => this.toggleTitlePopover());
    this.toolbar.appendChild(this.titleButton);

    const titleDivider = document.createElement("span");
    titleDivider.className = "mdmeow-image-toolbar-divider";
    this.toolbar.appendChild(titleDivider);

    this.addAlignButton("left", ICONS.left, t("image.alignLeft"));
    this.addAlignButton("center", ICONS.center, t("image.alignCenter"));
    this.addAlignButton("right", ICONS.right, t("image.alignRight"));

    const divider = document.createElement("span");
    divider.className = "mdmeow-image-toolbar-divider";
    this.toolbar.appendChild(divider);

    this.scaleButton = makeButton(
      "mdmeow-image-toolbar-button mdmeow-image-scale-button",
      ICONS.scale,
      t("image.scale"),
      () => this.toggleScaleMenu(),
    );
    this.toolbar.appendChild(this.scaleButton);

    this.scaleMenu = document.createElement("div");
    this.scaleMenu.className = "mdmeow-image-scale-menu";
    this.scaleMenu.hidden = true;
    for (const value of SCALES) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "mdmeow-image-scale-item";
      item.textContent = `${value}%`;
      item.addEventListener("click", () => this.applyScale(value));
      this.scaleMenu.appendChild(item);
      this.scaleItems.set(value, item);
    }
    this.toolbar.appendChild(this.scaleMenu);

    this.titlePopover = document.createElement("div");
    this.titlePopover.className = "mdmeow-image-title-popover";
    this.titlePopover.hidden = true;
    this.titleInput = document.createElement("input");
    this.titleInput.type = "text";
    this.titleInput.className = "mdmeow-image-title-input";
    this.titleInput.placeholder = t("image.titlePlaceholder");
    this.titleInput.spellcheck = false;
    this.titleInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.applyTitle(this.titleInput.value);
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.closeTitlePopover();
        this.view.focus();
      }
    });
    this.titleInput.addEventListener("blur", () => {
      if (this.openTitle) this.applyTitle(this.titleInput.value);
    });
    this.titlePopover.appendChild(this.titleInput);
    this.toolbar.appendChild(this.titlePopover);

    const divider2 = document.createElement("span");
    divider2.className = "mdmeow-image-toolbar-divider";
    this.toolbar.appendChild(divider2);

    this.toolbar.appendChild(
      makeButton(
        "mdmeow-image-toolbar-button mdmeow-image-delete-button",
        ICONS.trash,
        t("image.delete"),
        () => this.deleteImage(),
      ),
    );

    document.body.appendChild(this.toolbar);

    this.scrollHost = view.dom.closest<HTMLElement>("#editor");
    this.scrollHost?.addEventListener("scroll", this.position, { passive: true });
    window.addEventListener("resize", this.position, { passive: true });
    this.update(view);
  }

  private handleImagePointerDown = (event: PointerEvent): void => {
    const element = event.target instanceof Element ? event.target : null;
    const htmlImage = element?.closest<HTMLImageElement>(
      'img[data-mdmeow-html-img="true"]',
    );
    if (htmlImage) {
      const pos = htmlImagePosFromTarget(this.view, event.target);
      if (pos === null) return;
      event.preventDefault();
      event.stopPropagation();
      this.view.dispatch(
        this.view.state.tr
          .setSelection(NodeSelection.create(this.view.state.doc, pos))
          .scrollIntoView(),
      );
      this.currentKind = "html";
      this.currentPos = pos;
      this.currentBlock = htmlImage;
      this.currentImage = htmlImage;
      this.toolbar.hidden = false;
      const presentation = rawHtmlImagePresentation(
        String(this.view.state.doc.nodeAt(pos)?.attrs?.value ?? ""),
      );
      this.setAlignVisual(presentation?.align ?? "center");
      this.refreshScaleVisual();
      requestAnimationFrame(this.position);
      this.view.focus();
      return;
    }

    const block = element?.closest<HTMLElement>(".milkdown-image-block");
    const image = block?.querySelector<HTMLImageElement>('img[data-type="image-block"]');
    if (
      element?.closest(".image-resize-handle, .operation, .caption-input")
    ) {
      return;
    }
    const pos = imageBlockPosFromTarget(this.view, event.target);
    if (pos === null || !image || !block) return;
    event.preventDefault();
    event.stopPropagation();
    this.view.dispatch(
      this.view.state.tr
        .setSelection(NodeSelection.create(this.view.state.doc, pos))
        .scrollIntoView(),
    );
    // Keep the toolbar display independent from Crepe's NodeView selection
    // decoration. The document selection above remains authoritative for all
    // edits, but the clicked DOM nodes are the most reliable positioning anchor.
    this.currentKind = "markdown";
    this.currentPos = pos;
    this.currentBlock = block;
    this.currentImage = image;
    this.toolbar.hidden = false;
    this.setAlignVisual(normalizeAlign(this.view.state.doc.nodeAt(pos)?.attrs.align));
    this.refreshScaleVisual();
    requestAnimationFrame(this.position);
    this.view.focus();
  };

  private addAlignButton(align: Align, icon: string, title: string): void {
    const button = makeButton(
      "mdmeow-image-toolbar-button",
      icon,
      title,
      () => this.applyAlign(align),
    );
    button.dataset.align = align;
    this.alignButtons.set(align, button);
    this.toolbar.appendChild(button);
  }

  update = (view: EditorView): void => {
    this.view = view;
    syncImageAlignDom(view);
    const selection = view.state.selection;
    if (!(selection instanceof NodeSelection)) {
      this.hide();
      return;
    }

    if (selection.node.type.name === "image-block") {
      const dom = view.nodeDOM(selection.from);
      const block =
        dom instanceof HTMLElement
          ? dom.closest<HTMLElement>(".milkdown-image-block") ?? dom
          : null;
      const image = block?.querySelector<HTMLImageElement>(
        'img[data-type="image-block"]',
      );
      if (!block || !image) {
        this.hide();
        return;
      }

      this.currentKind = "markdown";
      this.currentPos = selection.from;
      this.currentBlock = block;
      this.currentImage = image;
      this.toolbar.hidden = false;
      this.setAlignVisual(normalizeAlign(selection.node.attrs.align));
      this.refreshScaleVisual();
      requestAnimationFrame(this.position);
      return;
    }

    if (selection.node.type.name === "html") {
      const presentation = rawHtmlImagePresentation(
        String(selection.node.attrs?.value ?? ""),
      );
      const dom = view.nodeDOM(selection.from);
      const image =
        dom instanceof HTMLImageElement &&
        dom.matches('img[data-mdmeow-html-img="true"]')
          ? dom
          : dom instanceof HTMLElement
            ? dom.querySelector<HTMLImageElement>(
                'img[data-mdmeow-html-img="true"]',
              )
            : null;
      if (!presentation || !image) {
        this.hide();
        return;
      }

      this.currentKind = "html";
      this.currentPos = selection.from;
      this.currentBlock = image;
      this.currentImage = image;
      this.toolbar.hidden = false;
      this.setAlignVisual(presentation.align);
      this.refreshScaleVisual();
      requestAnimationFrame(this.position);
      return;
    }

    this.hide();
  };

  private hide(): void {
    this.currentKind = null;
    this.currentPos = null;
    this.currentBlock = null;
    this.currentImage = null;
    this.openScale = false;
    this.openTitle = false;
    this.scaleMenu.hidden = true;
    this.scaleMenu.classList.remove("open-up");
    this.titlePopover.hidden = true;
    this.titlePopover.classList.remove("open-up");
    this.titleButton.classList.remove("active");
    this.toolbar.hidden = true;
  }

  private setAlignVisual(align: Align): void {
    if (!this.currentBlock) return;
    if (this.currentKind === "markdown") {
      this.currentBlock.dataset.mdmeowImageAlign = align;
    }
    for (const [key, button] of this.alignButtons) {
      const active = key === align;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  private currentTitle(): string {
    if (this.currentKind === "html" && this.currentPos !== null) {
      const node = this.view.state.doc.nodeAt(this.currentPos);
      return (
        rawHtmlImagePresentation(String(node?.attrs?.value ?? ""))?.title ?? ""
      );
    }

    const selection = this.view.state.selection;
    if (
      selection instanceof NodeSelection &&
      selection.node.type.name === "image-block"
    ) {
      return typeof selection.node.attrs.title === "string"
        ? selection.node.attrs.title
        : "";
    }
    return "";
  }

  private convertMarkdownToHtml(
    patch: Partial<{ align: Align; ratio: number; title: string }>,
  ): void {
    const selection = this.view.state.selection;
    if (
      !(selection instanceof NodeSelection) ||
      selection.node.type.name !== "image-block"
    ) {
      return;
    }

    const htmlType = this.view.state.schema.nodes.html;
    const paragraphType = this.view.state.schema.nodes.paragraph;
    if (!htmlType || !paragraphType) return;

    const node = selection.node;
    const value = buildRawHtmlImage({
      src: String(node.attrs.src ?? ""),
      alt: typeof node.attrs.caption === "string" ? node.attrs.caption : "",
      title:
        patch.title ??
        (typeof node.attrs.title === "string" ? node.attrs.title : ""),
      ratio: patch.ratio ?? this.currentRatio(),
      align: patch.align ?? normalizeAlign(node.attrs.align),
    });
    const replacement = paragraphType.create(
      null,
      htmlType.create({ value }),
    );
    const htmlPos = selection.from + 1;
    let tr = this.view.state.tr.replaceWith(
      selection.from,
      selection.to,
      replacement,
    );
    tr = tr.setSelection(NodeSelection.create(tr.doc, htmlPos));
    this.view.dispatch(tr.scrollIntoView());
    this.view.focus();
  }

  private toggleTitlePopover(): void {
    if (this.openTitle) {
      this.applyTitle(this.titleInput.value);
      return;
    }

    this.openScale = false;
    this.scaleMenu.hidden = true;
    this.scaleMenu.classList.remove("open-up");
    this.scaleButton.classList.remove("active");

    this.titleInput.value = this.currentTitle();
    this.openTitle = true;
    this.titlePopover.hidden = false;
    this.titleButton.classList.add("active");
    requestAnimationFrame(() => {
      this.positionTitlePopover();
      this.titleInput.focus();
      this.titleInput.select();
    });
  }

  private closeTitlePopover(): void {
    this.openTitle = false;
    this.titlePopover.hidden = true;
    this.titlePopover.classList.remove("open-up");
    this.titleButton.classList.remove("active");
  }

  private applyTitle(title: string): void {
    if (!this.openTitle) return;
    this.closeTitlePopover();

    if (this.currentKind === "html" && this.currentPos !== null) {
      const node = this.view.state.doc.nodeAt(this.currentPos);
      const updated = updateRawHtmlImagePresentation(
        String(node?.attrs?.value ?? ""),
        { title },
      );
      if (!node || node.type.name !== "html" || !updated) return;
      const tr = this.view.state.tr.setNodeAttribute(
        this.currentPos,
        "value",
        updated,
      );
      tr.setSelection(NodeSelection.create(tr.doc, this.currentPos));
      this.view.dispatch(tr);
      this.view.focus();
      return;
    }

    if (this.currentKind === "markdown") {
      this.convertMarkdownToHtml({ title });
    }
  }

  private applyAlign(align: Align): void {
    if (this.currentKind === "html" && this.currentPos !== null) {
      const node = this.view.state.doc.nodeAt(this.currentPos);
      const updated = updateRawHtmlImagePresentation(
        String(node?.attrs?.value ?? ""),
        { align },
      );
      if (!node || node.type.name !== "html" || !updated) return;
      const tr = this.view.state.tr.setNodeAttribute(
        this.currentPos,
        "value",
        updated,
      );
      tr.setSelection(NodeSelection.create(tr.doc, this.currentPos));
      this.view.dispatch(tr);
      this.view.focus();
      return;
    }

    if (this.currentKind === "markdown") {
      this.convertMarkdownToHtml({ align });
    }
  }

  private currentRatio(): number {
    if (this.currentKind === "html" && this.currentPos !== null) {
      const node = this.view.state.doc.nodeAt(this.currentPos);
      if (node?.type.name === "html") {
        return (
          rawHtmlImagePresentation(String(node.attrs?.value ?? ""))?.ratio ?? 1
        );
      }
    }

    const selection = this.view.state.selection;
    if (
      selection instanceof NodeSelection &&
      selection.node.type.name === "image-block"
    ) {
      const ratio = Number(selection.node.attrs.ratio ?? 1);
      if (Number.isFinite(ratio) && ratio > 0) return ratio;
    }
    return 1;
  }

  private refreshScaleVisual(): void {
    const pct = Math.round(this.currentRatio() * 100);
    let closest: number = SCALES[0];
    for (const value of SCALES) {
      if (Math.abs(value - pct) < Math.abs(closest - pct)) closest = value;
    }
    for (const [value, item] of this.scaleItems) {
      item.classList.toggle("active", value === closest);
    }
    this.scaleButton.dataset.scale = String(pct);
  }

  private toggleScaleMenu(): void {
    if (this.openScale) {
      this.closeScaleMenu();
      return;
    }

    this.closeTitlePopover();
    this.openScale = true;
    this.scaleMenu.hidden = false;
    this.scaleButton.classList.add("active");
    requestAnimationFrame(() => this.positionScaleMenu());
  }

  private closeScaleMenu(): void {
    this.openScale = false;
    this.scaleMenu.hidden = true;
    this.scaleMenu.classList.remove("open-up");
    this.scaleButton.classList.remove("active");
  }

  private positionScaleMenu(): void {
    if (!this.openScale || this.scaleMenu.hidden) return;
    const toolbarRect = this.toolbar.getBoundingClientRect();
    const menuHeight = this.scaleMenu.offsetHeight;
    const below = window.innerHeight - toolbarRect.bottom;
    const above = toolbarRect.top;
    this.scaleMenu.classList.toggle(
      "open-up",
      below < menuHeight + 12 && above > below,
    );
  }

  private positionTitlePopover(): void {
    if (!this.openTitle || this.titlePopover.hidden) return;
    const toolbarRect = this.toolbar.getBoundingClientRect();
    const popoverHeight = this.titlePopover.offsetHeight;
    const below = window.innerHeight - toolbarRect.bottom;
    const above = toolbarRect.top;
    this.titlePopover.classList.toggle(
      "open-up",
      below < popoverHeight + 12 && above > below,
    );
  }

  private applyScale(percent: number): void {
    if (this.currentKind === "html" && this.currentPos !== null) {
      const node = this.view.state.doc.nodeAt(this.currentPos);
      const updated = updateRawHtmlImagePresentation(
        String(node?.attrs?.value ?? ""),
        { ratio: percent / 100 },
      );
      if (!node || node.type.name !== "html" || !updated) return;
      const tr = this.view.state.tr.setNodeAttribute(
        this.currentPos,
        "value",
        updated,
      );
      tr.setSelection(NodeSelection.create(tr.doc, this.currentPos));
      this.view.dispatch(tr);
      this.closeScaleMenu();
      this.view.focus();
      return;
    }

    if (this.currentKind === "markdown") {
      this.closeScaleMenu();
      this.convertMarkdownToHtml({ ratio: percent / 100 });
    }
  }

  private deleteImage(): void {
    if (this.currentKind === "html" && this.currentPos !== null) {
      const node = this.view.state.doc.nodeAt(this.currentPos);
      if (!node || node.type.name !== "html") return;
      const from = this.currentPos;
      const to = from + node.nodeSize;
      this.hide();
      this.view.dispatch(this.view.state.tr.delete(from, to).scrollIntoView());
      this.view.focus();
      return;
    }

    const selection = this.view.state.selection;
    if (
      !(selection instanceof NodeSelection) ||
      selection.node.type.name !== "image-block"
    ) {
      return;
    }
    this.hide();
    this.view.dispatch(
      this.view.state.tr.delete(selection.from, selection.to).scrollIntoView(),
    );
    this.view.focus();
  }

  private position = (): void => {
    if (this.toolbar.hidden || !this.currentImage?.isConnected) return;
    const rect = this.currentImage.getBoundingClientRect();
    const width = this.toolbar.offsetWidth;
    const height = this.toolbar.offsetHeight;
    const gap = 10;

    let left = rect.left + (rect.width - width) / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));

    let top = rect.bottom + gap;
    if (top + height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - height - gap);
    }

    this.toolbar.style.left = `${Math.round(left)}px`;
    this.toolbar.style.top = `${Math.round(top)}px`;
    if (this.openScale) this.positionScaleMenu();
    if (this.openTitle) this.positionTitlePopover();
  };

  destroy(): void {
    this.view.dom.removeEventListener(
      "pointerdown",
      this.handleImagePointerDown,
      true,
    );
    this.scrollHost?.removeEventListener("scroll", this.position);
    window.removeEventListener("resize", this.position);
    this.toolbar.remove();
  }
}

export const imageToolbarPlugin = $prose(
  () =>
    new Plugin({
      view: (view) => {
        const toolbar = new ImageToolbarView(view);
        return {
          update: (nextView) => toolbar.update(nextView),
          destroy: () => toolbar.destroy(),
        };
      },
    }),
);
