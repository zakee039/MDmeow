import { $prose } from "@milkdown/kit/utils";
import { NodeSelection, Plugin } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import { t } from "./i18n";

type Align = "left" | "center" | "right";

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

class ImageToolbarView {
  private view: EditorView;
  private readonly toolbar: HTMLDivElement;
  private readonly scaleMenu: HTMLDivElement;
  private readonly alignButtons = new Map<Align, HTMLButtonElement>();
  private readonly scaleItems = new Map<number, HTMLButtonElement>();
  private scaleButton: HTMLButtonElement;
  private currentBlock: HTMLElement | null = null;
  private currentImage: HTMLImageElement | null = null;
  private openScale = false;
  private scrollHost: HTMLElement | null = null;

  constructor(view: EditorView) {
    this.view = view;

    this.toolbar = document.createElement("div");
    this.toolbar.className = "mdmeow-image-toolbar";
    this.toolbar.hidden = true;
    this.toolbar.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    this.toolbar.addEventListener("click", (event) => event.stopPropagation());

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
    const selection = view.state.selection;
    if (
      !(selection instanceof NodeSelection) ||
      selection.node.type.name !== "image-block"
    ) {
      this.hide();
      return;
    }

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

    this.currentBlock = block;
    this.currentImage = image;
    this.toolbar.hidden = false;

    const align = (block.dataset.mdmeowImageAlign as Align | undefined) ?? "center";
    this.setAlignVisual(align);
    this.refreshScaleVisual();
    requestAnimationFrame(this.position);
  };

  private hide(): void {
    this.currentBlock = null;
    this.currentImage = null;
    this.openScale = false;
    this.scaleMenu.hidden = true;
    this.toolbar.hidden = true;
  }

  private setAlignVisual(align: Align): void {
    if (!this.currentBlock) return;
    this.currentBlock.dataset.mdmeowImageAlign = align;
    for (const [key, button] of this.alignButtons) {
      const active = key === align;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  private applyAlign(align: Align): void {
    this.setAlignVisual(align);
    requestAnimationFrame(this.position);
    this.view.focus();
  }

  private currentRatio(): number {
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
    this.openScale = !this.openScale;
    this.scaleMenu.hidden = !this.openScale;
    this.scaleButton.classList.toggle("active", this.openScale);
  }

  private applyScale(percent: number): void {
    const selection = this.view.state.selection;
    const image = this.currentImage;
    if (
      !(selection instanceof NodeSelection) ||
      selection.node.type.name !== "image-block" ||
      !image
    ) {
      return;
    }

    const currentRatio = this.currentRatio();
    const rectHeight = image.getBoundingClientRect().height;
    let originHeight = Number(image.dataset.origin);
    if (!Number.isFinite(originHeight) || originHeight <= 0) {
      originHeight =
        currentRatio > 0 && rectHeight > 0 ? rectHeight / currentRatio : rectHeight;
    }
    if (!Number.isFinite(originHeight) || originHeight <= 0) return;

    const ratio = percent / 100;
    const height = originHeight * ratio;
    image.dataset.origin = originHeight.toFixed(2);
    image.dataset.height = height.toFixed(2);
    image.style.height = `${height.toFixed(2)}px`;

    this.view.dispatch(
      this.view.state.tr.setNodeAttribute(selection.from, "ratio", ratio),
    );

    this.openScale = false;
    this.scaleMenu.hidden = true;
    this.scaleButton.classList.remove("active");
    this.refreshScaleVisual();
    requestAnimationFrame(this.position);
    this.view.focus();
  }

  private deleteImage(): void {
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
  };

  destroy(): void {
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
