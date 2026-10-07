import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// A fresh hidden Chrome renders only this local cover. All outputs are native
// browser captures of one ready DOM, with no image generation or repainting.
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const options = {};
for (let i = 2; i < process.argv.length; i++) {
  const argument = process.argv[i];
  if (!argument.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
  const key = argument.slice(2);
  if (key === 'help') options.help = true;
  else {
    const value = process.argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    options[key] = value;
  }
}
if (options.help) {
  console.log('node render-cover.mjs [--html cover-design.html] [--out-dir .] [--stage #cover-stage] [--browser ChromePath]');
  process.exit(0);
}
const input = path.resolve(here, options.html ?? 'cover-design.html');
const outputDirectory = path.resolve(here, options['out-dir'] ?? '.');
const selector = options.stage ?? '#cover-stage';
const centerCrop = { x: 320, y: 0, width: 1920, height: 1440 };
const textSafetyMargin = 20;
if (!fs.existsSync(input)) throw new Error(`Cover HTML not found: ${input}`);
fs.mkdirSync(outputDirectory, { recursive: true });
const existingCover = path.join(here, 'cover.jpg');
const coverBackup = path.join(here, 'cover-before-poster.jpg');
if (fs.existsSync(existingCover) && !fs.existsSync(coverBackup)) {
  fs.copyFileSync(existingCover, coverBackup, fs.constants.COPYFILE_EXCL);
  console.log(`Preserved existing cover: ${coverBackup}`);
}

function findPlaywright() {
  for (const candidate of [process.env.PLAYWRIGHT_DIR, 'C:/Users/mamin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright', 'playwright'].filter(Boolean)) {
    try { return require(candidate); } catch {}
  }
  throw new Error('Playwright unavailable. Set PLAYWRIGHT_DIR.');
}
const { chromium } = findPlaywright();
const executablePath = [options.browser, process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', chromium.executablePath()].filter(Boolean).find(candidate => fs.existsSync(candidate));
if (!executablePath) throw new Error('Hidden Chrome unavailable. Set CHROME_PATH.');
const servedRoot = path.dirname(input);
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};
const server = http.createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const requested = path.resolve(servedRoot, `.${pathname}`);
    const relative = path.relative(servedRoot, requested);
    if (relative.startsWith('..') || path.isAbsolute(relative)) { response.writeHead(403).end(); return; }
    if (!fs.existsSync(requested) || !fs.statSync(requested).isFile()) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', mime[path.extname(requested).toLowerCase()] ?? 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-store');
    const stream = fs.createReadStream(requested);
    stream.on('error', () => response.destroy());
    stream.pipe(response);
  } catch { response.writeHead(400).end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const origin = `http://127.0.0.1:${server.address().port}`;
const errors = [];
const failedRequests = [];
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--hide-scrollbars', '--force-color-profile=srgb'] });
  const page = await browser.newPage({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1.5, colorScheme: 'light' });
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  await page.addInitScript(() => { window.__OFFLINE_RENDER__ = true; window.__EXPORT_MODE__ = true; });
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(`${origin}/`) || url.startsWith('data:') || url.startsWith('blob:')) route.continue();
    else route.abort();
  });
  await page.goto(`${origin}/${encodeURIComponent(path.basename(input))}?export=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.coverReady !== undefined, { timeout: 30000 });
  await page.evaluate(async () => {
    await window.coverReady;
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.complete ? Promise.resolve() : new Promise(resolve => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', resolve, { once: true });
    })));
  });
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}html,body{scroll-behavior:auto!important}' });
  const coverInfo = await page.evaluate(async ({ selector, centerCrop, textSafetyMargin }) => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Cover stage not found: ${selector}`);
    const rect = element.getBoundingClientRect();
    if (Math.abs(rect.width - 2560) > .1 || Math.abs(rect.height - 1440) > .1) throw new Error(`Cover stage must measure 2560x1440 CSS pixels, found ${rect.width}x${rect.height}.`);
    // The project's native image editor also owns empty <img> placeholders.
    // Validate actual image resources; an unset src is not a failed download.
    const brokenImages = [...element.querySelectorAll('img')].filter(image => image.getAttribute('src')?.trim() && image.complete && image.naturalWidth === 0).map(image => image.src);
    if (brokenImages.length) throw new Error(`Cover has broken image resources: ${brokenImages.join(', ')}`);
    const textBounds = ['headline', 'subheadline', 'smallprint'].map(id => {
      const textElement = document.getElementById(id);
      if (!textElement) return { id, missing: true, safeForCenterCrop: false };
      const range = document.createRange();
      range.selectNodeContents(textElement);
      const textRect = range.getBoundingClientRect();
      const left = textRect.left - rect.left;
      const top = textRect.top - rect.top;
      const right = textRect.right - rect.left;
      const bottom = textRect.bottom - rect.top;
      const rangeRect = { x: left, y: top, left, top, right, bottom, width: textRect.width, height: textRect.height };
      const safeRect = { left: left - textSafetyMargin, right: right + textSafetyMargin, top: top - textSafetyMargin, bottom: bottom + textSafetyMargin };
      const cropRight = centerCrop.x + centerCrop.width;
      const cropBottom = centerCrop.y + centerCrop.height;
      const font = getComputedStyle(textElement);
      return {
        id, text: textElement.textContent.trim(), rangeRect, safetyMargin: textSafetyMargin, safeRect,
        leftClearance: safeRect.left - centerCrop.x, rightClearance: cropRight - safeRect.right,
        withinHorizontalCrop: safeRect.left >= centerCrop.x && safeRect.right <= cropRight,
        safeForCenterCrop: safeRect.left >= centerCrop.x && safeRect.right <= cropRight && safeRect.top >= centerCrop.y && safeRect.bottom <= cropBottom,
        fontFamily: font.fontFamily, fontSize: font.fontSize, fontWeight: font.fontWeight, fontStyle: font.fontStyle,
      };
    });
    return { stage: { x: rect.x + scrollX, y: rect.y + scrollY, width: 2560, height: 1440 }, textBounds };
  }, { selector, centerCrop, textSafetyMargin });
  const { stage, textBounds } = coverInfo;
  if (errors.length) throw new Error(`Cover page errors: ${errors.join('; ')}`);
  const png = path.join(outputDirectory, 'MDmeow-cover-4K.png');
  const jpg = path.join(outputDirectory, 'MDmeow-cover-4K.jpg');
  const preview = path.join(outputDirectory, 'MDmeow-cover-1080p.jpg');
  const cropPng = path.join(outputDirectory, 'MDmeow-cover-4x3.png');
  const cropJpg = path.join(outputDirectory, 'MDmeow-cover-4x3.jpg');
  const cropPreview = path.join(outputDirectory, 'MDmeow-cover-4x3-preview.jpg');
  const cropClip = { x: stage.x + centerCrop.x, y: stage.y + centerCrop.y, width: centerCrop.width, height: centerCrop.height };
  await page.screenshot({ path: png, type: 'png', clip: stage, scale: 'device' });
  await page.screenshot({ path: jpg, type: 'jpeg', quality: 95, clip: stage, scale: 'device' });
  // CDP clip.scale addresses CSS pixels directly: 2560x1440 at .75 gives
  // 1920x1080 from this same page, without a new layout or DOM reload.
  const session = await page.context().newCDPSession(page);
  const capture = await session.send('Page.captureScreenshot', { format: 'jpeg', quality: 95, fromSurface: true, captureBeyondViewport: true, clip: { ...stage, scale: .75 } });
  fs.writeFileSync(preview, Buffer.from(capture.data, 'base64'));
  // Native stage clipping preserves the same rendered DOM and typography.
  // 1920x1440 CSS pixels at 1.5x produce the 2880x2160 center crop.
  await page.screenshot({ path: cropPng, type: 'png', clip: cropClip, scale: 'device' });
  await page.screenshot({ path: cropJpg, type: 'jpeg', quality: 95, clip: cropClip, scale: 'device' });
  const croppedCapture = await session.send('Page.captureScreenshot', { format: 'jpeg', quality: 95, fromSurface: true, captureBeyondViewport: true, clip: { ...cropClip, scale: .75 } });
  fs.writeFileSync(cropPreview, Buffer.from(croppedCapture.data, 'base64'));
  function dimensions(file) {
    const buffer = fs.readFileSync(file);
    if (path.extname(file) === '.png') return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    for (let index = 2; index + 9 < buffer.length;) {
      if (buffer[index] !== 0xff) throw new Error(`Invalid JPEG marker at ${index}: ${file}`);
      while (buffer[index] === 0xff) index++;
      const marker = buffer[index++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
      const length = buffer.readUInt16BE(index);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return { width: buffer.readUInt16BE(index + 5), height: buffer.readUInt16BE(index + 3) };
      index += length;
    }
    throw new Error(`Cannot read JPEG dimensions: ${file}`);
  }
  const outputs = [png, jpg, preview, cropPng, cropJpg, cropPreview].map(file => ({ file, ...dimensions(file), bytes: fs.statSync(file).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') }));
  const expectedSizes = [[3840, 2160], [3840, 2160], [1920, 1080], [2880, 2160], [2880, 2160], [1440, 1080]];
  for (const [index, output] of outputs.entries()) {
    const expected = expectedSizes[index];
    if (output.width !== expected[0] || output.height !== expected[1]) throw new Error(`Wrong output dimensions: ${JSON.stringify(output)}`);
  }
  const textSafety = { coordinateSpace: 'stage CSS pixels', margin: textSafetyMargin, horizontalLimit: [centerCrop.x, centerCrop.x + centerCrop.width], allTextSafe: textBounds.every(text => text.safeForCenterCrop), textBounds };
  const warnings = textBounds.filter(text => !text.safeForCenterCrop).map(text => `${text.id}: text plus ${textSafetyMargin}px margin exceeds the center crop or is missing.`);
  const metadata = { source: input, stage, cssSize: [2560, 1440], centerCrop, textSafety, deviceScaleFactor: 1.5, sameRenderedDOM: true, jpegQuality: 95, colorProfile: 'sRGB', errors, failedRequests, warnings, coverBackup: fs.existsSync(coverBackup) ? coverBackup : null, outputs };
  fs.writeFileSync(path.join(outputDirectory, 'MDmeow-cover-metadata.json'), JSON.stringify(metadata, null, 2) + '\n');
  console.log(JSON.stringify(metadata, null, 2));
  for (const warning of warnings) console.warn(`Cover layout warning: ${warning}`);
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
