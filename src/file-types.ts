export type DocumentMode = "markdown" | "code";
export type FileCategoryId = "markdown" | "config" | "web" | "code" | "text";

export interface FileTypeDefinition {
  id: string;
  category: FileCategoryId;
  extensions: readonly string[];
  mode: DocumentMode;
  defaultAssociated?: boolean;
}

export const FILE_TYPES: readonly FileTypeDefinition[] = [
  {
    id: "markdown",
    category: "markdown",
    extensions: ["md", "markdown", "mdx"],
    mode: "markdown",
    defaultAssociated: true,
  },
  {
    id: "config-data",
    category: "config",
    extensions: ["json", "yaml", "yml", "xml", "toml", "ini", "conf", "env", "jsonl", "csv"],
    mode: "code",
  },
  {
    id: "web",
    category: "web",
    extensions: ["html", "htm", "css", "scss", "less", "js", "mjs", "cjs", "ts", "jsx", "tsx", "vue"],
    mode: "code",
  },
  {
    id: "programming",
    category: "code",
    extensions: [
      "py", "rs", "c", "cpp", "cc", "h", "hpp", "java", "go", "php", "sql",
      "sh", "bash", "ps1", "rb", "swift", "kt", "kts", "cs",
    ],
    mode: "code",
  },
  {
    id: "text",
    category: "text",
    extensions: ["txt", "log"],
    mode: "code",
  },
];

export const FILE_CATEGORY_ORDER: readonly FileCategoryId[] = [
  "markdown",
  "config",
  "web",
  "code",
  "text",
];

export function extensionOf(path: string | null | undefined): string {
  if (!path) return "";
  const base = path.replace(/\\/g, "/").split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function findFileType(path: string | null | undefined): FileTypeDefinition | null {
  const ext = extensionOf(path);
  if (!ext) return null;
  return FILE_TYPES.find((type) => type.extensions.includes(ext)) ?? null;
}

export function documentModeFor(path: string | null | undefined): DocumentMode {
  if (!path) return "markdown";
  return findFileType(path)?.mode ?? "code";
}

export function isMarkdownPath(path: string | null | undefined): boolean {
  return documentModeFor(path) === "markdown";
}

export function knownExtensions(): string[] {
  return Array.from(new Set(FILE_TYPES.flatMap((type) => type.extensions)));
}

export function defaultAssociationExtensions(): string[] {
  return Array.from(
    new Set(
      FILE_TYPES.filter((type) => type.defaultAssociated).flatMap((type) =>
        type.extensions.map((ext) => `.${ext}`),
      ),
    ),
  );
}

export function allAssociationExtensions(): string[] {
  return knownExtensions().map((ext) => `.${ext}`);
}

export function associationExtensionsByCategory(category: FileCategoryId): string[] {
  return FILE_TYPES.filter((type) => type.category === category)
    .flatMap((type) => type.extensions)
    .map((ext) => `.${ext}`);
}
