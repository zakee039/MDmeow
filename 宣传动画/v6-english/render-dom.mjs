import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Only a new hidden Chrome instance renders local animation files. The user's
// existing browser and tabs are never read or controlled by this exporter.
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const options = {};
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
  const key = arg.slice(2);
  if (key === 'help') options.help = true;
  else options[key] = process.argv[++i];
}
if (options.help) {
  console.log('node render-dom.mjs [--html film.html] [--out MDmeow-v3-render-60s.mp4] [--fps 60] [--duration 60] [--start 0] [--audio audio/mix.wav] [--stage #stage] [--snapshot 12] [--snapshot-out frame.jpg] [--preset medium] [--crf 18]');
  process.exit(0);
}
const fps = Number(options.fps ?? 60);
const duration = Number(options.duration ?? 60);
const start = Number(options.start ?? 0);
if (!(fps > 0 && duration > 0 && start >= 0)) throw new Error('Invalid fps, duration, or start.');
const input = path.resolve(here, options.html ?? 'film.html');
const output = path.resolve(here, options.out ?? 'MDmeow-v3-render-60s.mp4');
const selector = options.stage ?? '#stage';
if (!fs.existsSync(input)) throw new Error(`Animation HTML not found: ${input}`);
fs.mkdirSync(path.dirname(output), { recursive: true });

function findPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_DIR, 'C:/Users/mamin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright', 'playwright'].filter(Boolean);
  for (const candidate of candidates) {
    try { return require(candidate); } catch {}
  }
  throw new Error('Playwright unavailable. Set PLAYWRIGHT_DIR.');
}
function findFfmpeg() {
  if (options.ffmpeg || process.env.FFMPEG_PATH) return options.ffmpeg || process.env.FFMPEG_PATH;
  const folder = path.join(here, '..', '.tools', 'imageio_ffmpeg', 'binaries');
  if (fs.existsSync(folder)) {
    const match = fs.readdirSync(folder).find(name => /^ffmpeg.*\.exe$/i.test(name));
    if (match) return path.join(folder, match);
  }
  return 'ffmpeg';
}
const { chromium } = findPlaywright();
const chromeCandidates = [options.browser, process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', chromium.executablePath()].filter(Boolean);
const executablePath = chromeCandidates.find(candidate => fs.existsSync(candidate));
if (!executablePath) throw new Error('Headless Chrome unavailable. Set CHROME_PATH.');
const servedRoot = path.dirname(input);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const server = http.createServer((req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const requested = path.resolve(servedRoot, `.${pathname}`);
    const relative = path.relative(servedRoot, requested);
    if (relative.startsWith('..') || path.isAbsolute(relative)) { res.writeHead(403).end(); return; }
    if (!fs.existsSync(requested) || !fs.statSync(requested).isFile()) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', mime[path.extname(requested)] ?? 'application/octet-stream');
    fs.createReadStream(requested).pipe(res);
  } catch { res.writeHead(400).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
let browser, encoder;
let stderr = '';
const started = Date.now();
try {
  browser = await chromium.launch({ headless: true, executablePath, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--hide-scrollbars'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => { window.__OFFLINE_RENDER__ = true; window.__EXPORT_MODE__ = true; });
  page.on('pageerror', error => console.error(`DOM error: ${error.message}`));
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(`http://127.0.0.1:${address.port}/`) || url.startsWith('data:') || url.startsWith('blob:')) route.continue();
    else route.abort();
  });
  await page.goto(`http://127.0.0.1:${address.port}/${encodeURIComponent(path.basename(input))}?export=1`, { waitUntil: 'load' });
  await page.evaluate(async () => {
    await window.filmReady;
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.complete ? Promise.resolve() : new Promise(resolve => { image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', resolve, { once: true }); })));
    if (typeof window.renderAt !== 'function') throw new Error('window.renderAt(seconds) is required.');
  });
  // renderAt owns every animation's time. Disable native wall-clock animation,
  // transitions and text caret blinking only inside this temporary export page.
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}html,body{scroll-behavior:auto!important}' });
  const session = await page.context().newCDPSession(page);
  async function captureAt(time) {
    const clip = await page.evaluate(async ({ time, selector }) => {
      await window.renderAt(time);
      // The first rAF schedules the browser's paint; the second confirms a
      // completed rendering opportunity before the CDP screenshot is requested.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const stage = document.querySelector(selector);
      if (!stage) throw new Error(`Export stage missing: ${selector}`);
      const rect = stage.getBoundingClientRect();
      if (Math.abs(rect.width - 1920) > 0.1 || Math.abs(rect.height - 1080) > 0.1) throw new Error(`Export stage must measure 1920x1080 CSS pixels; found ${rect.width}x${rect.height}. Use ?export=1 or window.__EXPORT_MODE__ to disable preview scaling.`);
      return { x: rect.left + scrollX, y: rect.top + scrollY, width: 1920, height: 1080, scale: 1 };
    }, { time, selector });
    const captured = await session.send('Page.captureScreenshot', { format: 'jpeg', quality: 94, fromSurface: true, captureBeyondViewport: true, optimizeForSpeed: true, clip });
    return Buffer.from(captured.data, 'base64');
  }
  if (options.qa) {
    const timing = JSON.parse(fs.readFileSync(path.join(here, 'timing.json'), 'utf8'));
    const reports = [];
    for (const [index, cut] of timing.scenes.entries()) {
      const caption = timing.captions.find(c => c.start > cut.start + 2 && c.end < cut.end) || timing.captions.find(c => c.start >= cut.start);
      const time = (caption.start + caption.end)/2;
      const jpeg = await captureAt(time);
      fs.writeFileSync(path.join(here, 'qa', `scene-${index+1}.jpg`), jpeg);
      reports.push(await page.evaluate(() => {
        const caption = document.querySelector('#caption');
        const range = document.createRange(); range.selectNodeContents(caption);
        const rect = range.getBoundingClientRect();
        return {
          scene: document.querySelector('.scene.active').dataset.index,
          caption: caption.textContent,
          captionLayers: document.querySelectorAll('#caption').length,
          captionFits: rect.left >= 70 && rect.right <= 1850 && rect.bottom <= 1042,
          brokenImages: [...document.querySelectorAll('.scene.active img')].filter(i => i.getAttribute('src') && (!i.complete || !i.naturalWidth)).map(i => i.src),
        };
      }));
    }
    fs.writeFileSync(path.join(here, 'qa', 'layout.json'), JSON.stringify(reports, null, 2));
    if (reports.some(r => !r.captionFits || r.captionLayers !== 1 || r.brokenImages.length)) throw new Error('Visual layout validation failed.');
    console.log('All nine scenes passed caption and image validation.');
  } else if (options.snapshot !== undefined) {
    const time = Number(options.snapshot);
    if (!Number.isFinite(time) || time < 0) throw new Error('Invalid snapshot time.');
    const snapshot = path.resolve(here, options['snapshot-out'] ?? 'frame.jpg');
    fs.mkdirSync(path.dirname(snapshot), { recursive: true });
    fs.writeFileSync(snapshot, await captureAt(time));
    console.log(`Saved stage snapshot: ${snapshot}`);
  } else {
    const total = Math.round(duration * fps);
    const args = ['-hide_banner', '-loglevel', 'warning', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-vcodec', 'mjpeg', '-i', 'pipe:0'];
    if (options.audio) args.push('-i', path.resolve(here, options.audio));
    args.push('-map', '0:v:0', '-vf', 'scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p', '-c:v', 'libx264', '-preset', options.preset ?? 'medium', '-crf', options.crf ?? '18', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-threads', options.threads ?? '6');
    if (options.audio) args.push('-map', '1:a:0', '-c:a', 'aac', '-b:a', '192k');
    else args.push('-an');
    args.push('-t', String(total / fps), '-movflags', '+faststart', output);
    encoder = spawn(findFfmpeg(), args, { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    encoder.stderr.on('data', chunk => { stderr += chunk.toString(); });
    encoder.stdin.on('error', () => {});
    const encoderDone = new Promise((resolve, reject) => {
      encoder.once('error', reject);
      encoder.once('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg exited with ${code}: ${stderr}`)));
    });
    encoderDone.catch(() => {});
    for (let frame = 0; frame < total; frame++) {
      const jpeg = await captureAt(start + frame / fps);
      if (encoder.exitCode !== null) await encoderDone;
      if (!encoder.stdin.write(jpeg)) await Promise.race([once(encoder.stdin, 'drain'), encoderDone.then(() => { throw new Error('Encoder closed before all frames were written.'); })]);
      const done = frame + 1;
      if (frame === 0 || done === total || done % Math.round(fps) === 0) {
        console.log(`Rendered ${done}/${total} DOM frames (${(done / total * 100).toFixed(1)}%), elapsed ${((Date.now() - started) / 1000).toFixed(1)}s`);
      }
    }
    encoder.stdin.end();
    await encoderDone;
    const elapsed = (Date.now() - started) / 1000;
    console.log(`Saved video: ${output} (${(fs.statSync(output).size / 1024 / 1024).toFixed(1)} MiB), total ${elapsed.toFixed(1)}s, ${(total / elapsed).toFixed(1)} export frames/s`);
  }
} finally {
  if (encoder && encoder.exitCode === null) encoder.kill();
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
