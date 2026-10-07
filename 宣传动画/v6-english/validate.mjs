import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const options = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i].replace(/^--/, '');
  if (key === 'help') options.help = true;
  else options[key] = process.argv[++i];
}
if (options.help) {
  console.log('node validate.mjs [--video MDmeow-v3-render-60s.mp4] [--fps 60] [--duration 60] [--times 0.5,6,10,18,26,34,42,50,59.9] [--out qa] [--audio required|optional]');
  process.exit(0);
}
const video = path.resolve(here, options.video ?? 'MDmeow-v3-render-60s.mp4');
if (!fs.existsSync(video)) throw new Error(`Video not yet exported: ${video}`);
const expectedFps = Number(options.fps ?? 60);
const expectedDuration = Number(options.duration ?? 60);
if (!(expectedFps > 0 && expectedDuration > 0)) throw new Error('Invalid expected fps or duration.');
const expectedFrames = Math.round(expectedDuration * expectedFps);
const output = path.resolve(here, options.out ?? 'qa');
const binaryFolder = path.join(here, '..', '.tools', 'imageio_ffmpeg', 'binaries');
const binaryName = fs.readdirSync(binaryFolder).find(name => /^ffmpeg.*\.exe$/i.test(name));
const ffmpeg = process.env.FFMPEG_PATH ?? path.join(binaryFolder, binaryName);
fs.mkdirSync(output, { recursive: true });
const result = spawnSync(ffmpeg, ['-hide_banner', '-nostdin', '-xerror', '-i', video, '-map', '0:v:0', '-map', '0:a:0?', '-f', 'null', '-'], { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
if (result.error) throw result.error;
const log = result.stderr ?? '';
fs.writeFileSync(path.join(output, 'decode.log'), log, 'utf8');
const durationMatch = log.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
const duration = durationMatch ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3]) : null;
const videoLine = log.split(/\r?\n/).find(line => line.includes('Stream #0:0') && line.includes('Video:')) ?? '';
const fpsMatch = videoLine.match(/\b(\d+(?:\.\d+)?) fps\b/);
const actualFps = fpsMatch ? Number(fpsMatch[1]) : null;
const audioLine = log.split(/\r?\n/).find(line => line.includes('Stream #0:1') && line.includes('Audio:')) ?? '';
const frameMatches = [...log.matchAll(/frame=\s*(\d+)/g)];
const decodedFrames = frameMatches.length ? Number(frameMatches.at(-1)[1]) : null;
const boxes = [];
const fileSize = fs.statSync(video).size;
const handle = fs.openSync(video, 'r');
try {
  let offset = 0;
  while (offset < fileSize) {
    const header = Buffer.alloc(16);
    fs.readSync(handle, header, 0, Math.min(16, fileSize - offset), offset);
    let size = header.readUInt32BE(0);
    const type = header.toString('ascii', 4, 8);
    if (size === 1) size = Number(header.readBigUInt64BE(8));
    else if (size === 0) size = fileSize - offset;
    if (size < 8 || offset + size > fileSize) throw new Error(`Invalid MP4 box ${type} at ${offset}`);
    boxes.push({ type, offset, size });
    offset += size;
  }
} finally { fs.closeSync(handle); }
const moov = boxes.find(box => box.type === 'moov');
const mdat = boxes.find(box => box.type === 'mdat');
const checks = {
  completeDecode: result.status === 0,
  durationMatchesExpected: duration !== null && Math.abs(duration - expectedDuration) <= 1 / expectedFps,
  framesMatchExpected: decodedFrames === expectedFrames,
  resolution1080p: videoLine.includes('1920x1080'),
  fpsMatchesExpected: actualFps === expectedFps,
  h264: /Video: h264\b/.test(videoLine),
  yuv420p: /\byuv420p\b/.test(videoLine),
  aacStereo48k: /Audio: aac\b/.test(audioLine) && audioLine.includes('48000 Hz, stereo'),
  faststart: Boolean(moov && mdat && moov.offset < mdat.offset)
};
const times = (options.times ?? '0.5,6,10,18,26,34,42,50,59.9').split(',').map(Number);
const extractedFrames = [];
for (const time of times) {
  if (!Number.isFinite(time) || time < 0 || time >= duration) throw new Error(`Invalid keyframe time ${time}`);
  const frame = path.join(output, `frame-${time}.jpg`);
  const extracted = spawnSync(ffmpeg, ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-ss', String(time), '-i', video, '-frames:v', '1', frame], { encoding: 'utf8', windowsHide: true });
  if (extracted.status !== 0 || !fs.existsSync(frame)) throw new Error(`Frame ${time} extraction failed: ${extracted.stderr}`);
  extractedFrames.push({ time, file: path.basename(frame), bytes: fs.statSync(frame).size });
}
const failed = Object.entries(checks).filter(([key, passed]) => !passed && !(key === 'aacStereo48k' && options.audio === 'optional')).map(([key]) => key);
const report = { video, bytes: fileSize, duration, decodedFrames, fps: actualFps, expected: { duration: expectedDuration, fps: expectedFps, frames: expectedFrames }, videoStream: videoLine.trim(), audioStream: audioLine.trim(), checks, boxes, extractedFrames, passed: failed.length === 0, failed, visualReviewRequired: true };
fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (failed.length) process.exitCode = 1;

