"""Synthesize short caption-aligned clips and create the film's audio/timeline."""
import asyncio
import json
import math
import sys
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent.parent / 'audio/.deps'))
SR = 48000
VOICE = 'en-US-JennyNeural'
SCENES = [(5, None, 0, ['In the AI era, work smarter.', 'A fast, visual Markdown editor.', 'A lightweight document and code reviewer.', 'Open almost any common code file.', 'Python, C, Java, and more.', 'One app. MDmeow.']), (0, None, 0, ['A small footprint. Ready anytime.', 'Just 4.3 megabytes in this captured session.', 'More room for your ideas.']), (1, None, 0, ['Your color. Your workspace.', 'Choose your language, accent, and session settings.']), (2, None, 0, ['Customize shortcuts, fonts, and text size.', 'Find your writing rhythm.']), (3, '10', 0, ['Write it. See it take shape.', 'From headings to tables, keep every idea clear.']), (3, '12', 0, ['Syntax highlighting makes code easy to read.', 'Open code and config files for quick edits.']), (3, '20', 0, ['Complex math. Clear results.', 'Equations and matrices, beautifully arranged.']), (3, '9', 0, ['The image toolbar puts you in control.', 'Add a caption. Align. Resize. One click.']), (4, None, 0, ['MDmeow. See it. Edit it. Get to work.', 'Visit our website and write your first line.'])]

def read_clip(file):
    x, sr = sf.read(file, always_2d=True)
    x = x.mean(axis=1)
    if sr != SR:
        gcd = math.gcd(sr, SR)
        x = resample_poly(x, SR // gcd, sr // gcd)
    active = np.flatnonzero(np.abs(x) > .0025)
    if len(active):
        x = x[max(0, active[0] - round(.04 * SR)):min(len(x), active[-1] + round(.12 * SR))]
    return x

async def generate():
    import edge_tts
    semaphore = asyncio.Semaphore(2)
    async def one(i, j, text):
        file = ROOT / f'voice_en_{i+1:02d}_{j+1:02d}.mp3'
        async with semaphore:
            if not file.exists():
                for attempt in range(3):
                    try:
                        spoken = text.replace('MDmeow', 'M D meow')
                        await edge_tts.Communicate(spoken, VOICE, rate='+15%', connect_timeout=15, receive_timeout=40).save(str(file))
                        break
                    except Exception:
                        if attempt == 2:
                            raise
            x = read_clip(file)
            print(f'{file.name}: {len(x)/SR:.2f}s', flush=True)
    await asyncio.gather(*(one(i, j, text) for i, scene in enumerate(SCENES) for j, text in enumerate(scene[3])))

def timeline():
    scenes, captions, tracks = [], [], []
    cursor = 0.0
    for i, (scene, section, minimum, lines) in enumerate(SCENES):
        onset = cursor + .2
        for j, text in enumerate(lines):
            file = ROOT / f'voice_en_{i+1:02d}_{j+1:02d}.mp3'
            x = read_clip(file)
            end = onset + len(x) / SR
            captions.append({'start': round(onset, 4), 'end': round(end + .09, 4), 'text': text, 'file': file.name})
            tracks.append((onset, x))
            onset = end + .12
        end = math.ceil((onset + (.75 if scene == 4 else .18)) * 30) / 30
        scenes.append({'scene': scene, 'section': section, 'start': cursor, 'end': end})
        cursor = end
    data = {'duration': cursor, 'fps': 30, 'voice': VOICE, 'scenes': scenes, 'captions': captions}
    (ROOT.parent / 'timing.json').write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf8')
    (ROOT.parent / 'timing.js').write_text('window.FILM_TIMING=' + json.dumps(data, ensure_ascii=False) + ';', encoding='utf8')
    narration = np.zeros(round(cursor * SR))
    for onset, x in tracks:
        x = x * (10 ** (-5 / 20) / max(np.max(np.abs(x)), 1e-7))
        start = round(onset * SR)
        narration[start:start+len(x)] += x
    sf.write(ROOT / 'narration.wav', np.column_stack([narration, narration]), SR, subtype='PCM_16')
    def stamp(t):
        ms = round(t * 1000)
        return f'{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}'
    srt = '\n\n'.join(f'{i+1}\n{stamp(c["start"])} --> {stamp(c["end"])}\n{c["text"]}' for i, c in enumerate(captions))
    (ROOT.parent / 'captions-reference.srt').write_text(srt+'\n', encoding='utf8')
    print(f'DURATION={cursor:.4f}', flush=True)

def mix():
    data = json.loads((ROOT.parent / 'timing.json').read_text(encoding='utf8'))
    narration, sr = sf.read(ROOT / 'narration.wav', always_2d=True)
    music, music_sr = sf.read(ROOT / 'music.wav', always_2d=True)
    assert sr == music_sr == SR and music.shape == narration.shape
    gain = np.full(len(narration), .42)
    for c in data['captions']:
        a, b, cend, d = [max(0, min(len(gain), round(t * SR))) for t in (c['start']-.25, c['start'], c['end'], c['end']+.45)]
        gain[a:b] = np.minimum(gain[a:b], np.linspace(.42, .16, b-a))
        gain[b:cend] = np.minimum(gain[b:cend], .16)
        gain[cend:d] = np.minimum(gain[cend:d], np.linspace(.16, .42, d-cend))
    master = narration + music * gain[:, None]
    peak = float(np.max(np.abs(master)))
    if peak > .89:
        master *= .89 / peak
    sf.write(ROOT / 'mix.wav', master, SR, subtype='PCM_16')
    (ROOT / 'verification.json').write_text(json.dumps({'duration': len(master)/SR, 'peak_dbfs': float(20*np.log10(np.max(np.abs(master)))), 'voice': VOICE, 'captions': len(data['captions']), 'caption_layers': 1, 'sample_rate': SR}, indent=2), encoding='utf8')

if __name__ == '__main__':
    if '--mix' in sys.argv:
        mix()
    else:
        asyncio.run(generate())
        timeline()
