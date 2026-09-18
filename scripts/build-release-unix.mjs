import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const tauriDir = join(root, "src-tauri");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = pkg.version;
const releaseDir = join(root, "release");
const requested = process.argv[2];

if (requested !== "linux" && requested !== "macos") {
  throw new Error("Usage: node scripts/build-release-unix.mjs <linux|macos>");
}
if (requested === "linux" && process.platform !== "linux") {
  throw new Error(`Linux release builds must run on Linux (current platform: ${process.platform}).`);
}
if (requested === "macos" && process.platform !== "darwin") {
  throw new Error(`macOS release builds must run on macOS (current platform: ${process.platform}).`);
}

function run(command, args) {
  console.log(`[release] ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with code ${result.status}`);
  }
}

function filesUnder(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...filesUnder(path));
    else if (stat.isFile()) out.push(path);
  }
  return out;
}

function singleArtifact(dir, predicate, label) {
  const matches = filesUnder(dir).filter(predicate);
  if (matches.length !== 1) {
    const found = matches.map((p) => basename(p)).join(", ") || "<none>";
    throw new Error(`Expected exactly one ${label} artifact under ${dir}; found: ${found}`);
  }
  return matches[0];
}

function copyArtifact(source, name) {
  const destination = join(releaseDir, name);
  cpSync(source, destination);
  const data = readFileSync(destination);
  const sha256 = createHash("sha256").update(data).digest("hex").toUpperCase();
  console.log(`[release] ${name} | ${data.length} bytes | SHA256 ${sha256}`);
}

function ensureExact(expected) {
  const actual = readdirSync(releaseDir).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(
      `release/ contract mismatch. Expected: ${wanted.join(", ")}; actual: ${actual.join(", ")}`,
    );
  }
}

rmSync(releaseDir, { recursive: true, force: true });
mkdirSync(releaseDir, { recursive: true });

if (requested === "linux") {
  const arch = process.arch === "x64" ? "x86_64" : process.arch === "arm64" ? "aarch64" : null;
  if (!arch) throw new Error(`Unsupported Linux architecture: ${process.arch}`);

  const bundleRoot = join(tauriDir, "target", "release", "bundle");
  rmSync(bundleRoot, { recursive: true, force: true });

  run("pnpm", ["tauri", "build", "--ci", "--bundles", "appimage,deb,rpm"]);

  const prefix = `MDmeow-${version}-linux-${arch}`;
  const artifacts = [
    [singleArtifact(join(bundleRoot, "appimage"), (p) => p.endsWith(".AppImage"), "AppImage"), `${prefix}.AppImage`],
    [singleArtifact(join(bundleRoot, "deb"), (p) => p.endsWith(".deb"), "deb"), `${prefix}.deb`],
    [singleArtifact(join(bundleRoot, "rpm"), (p) => p.endsWith(".rpm"), "rpm"), `${prefix}.rpm`],
  ];
  for (const [source, name] of artifacts) copyArtifact(source, name);
  ensureExact(artifacts.map(([, name]) => name));
} else {
  const target = "universal-apple-darwin";
  const bundleRoot = join(tauriDir, "target", target, "release", "bundle");
  rmSync(bundleRoot, { recursive: true, force: true });

  run("pnpm", ["tauri", "build", "--ci", "--target", target, "--bundles", "dmg", "--no-sign"]);

  const name = `MDmeow-${version}-macOS-universal.dmg`;
  const source = singleArtifact(join(bundleRoot, "dmg"), (p) => p.endsWith(".dmg"), "dmg");
  copyArtifact(source, name);
  ensureExact([name]);
}
