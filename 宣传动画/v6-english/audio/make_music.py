"""Create an original, deterministic 60-second MDmeow promotional score.

No samples or third-party music. Requires Python + numpy + scipy.
Usage: python make_music.py
"""
from pathlib import Path
import json
import numpy as np
from scipy.io.wavfile import write

ROOT = Path(__file__).resolve().parent
SR = 48000
DURATION = json.loads((ROOT.parent / 'timing.json').read_text(encoding='utf8'))['duration']
BPM = 96
BEAT = 60 / BPM
ROOT = Path(__file__).resolve().parent
RNG = np.random.default_rng(310930)
MIX = np.zeros((round(SR * DURATION), 2), dtype=np.float64)


def hz(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def add(signal, start, gain=1, pan=0):
    offset = round(start * SR)
    if offset < 0 or offset >= len(MIX):
        return
    n = min(len(signal), len(MIX) - offset)
    angle = (pan + 1) * np.pi / 4
    MIX[offset:offset+n, 0] += signal[:n] * gain * np.cos(angle)
    MIX[offset:offset+n, 1] += signal[:n] * gain * np.sin(angle)


def keys(midi, duration=1.5):
    t = np.arange(round(SR * duration)) / SR
    f = hz(midi)
    # A soft struck tine: sine fundamentals with quiet decaying harmonics.
    sig = np.sin(2*np.pi*f*t) * np.exp(-t/0.65)
    sig += .28*np.sin(2*np.pi*f*2*t) * np.exp(-t/0.29)
    sig += .09*np.sin(2*np.pi*f*3*t) * np.exp(-t/0.13)
    env = np.minimum(t/.007, 1) * np.minimum((duration-t)/.18, 1)
    return sig*env


def pad(midi, duration):
    t = np.arange(round(SR * duration)) / SR
    f = hz(midi)
    sig = .64*np.sin(2*np.pi*f*t) + .18*np.sin(2*np.pi*f*1.002*t)
    sig += .1*np.sin(2*np.pi*2*f*t)
    env = np.minimum(t/.55, 1) * np.minimum((duration-t)/.8, 1)
    return sig * env * (.94+.06*np.sin(2*np.pi*.3*t))


def bass(midi, duration):
    t = np.arange(round(SR * duration)) / SR
    f = hz(midi)
    sig = np.sin(2*np.pi*f*t)+.16*np.sin(2*np.pi*2*f*t)
    env = np.minimum(t/.014, 1)*np.exp(-t/.9)*np.minimum((duration-t)/.08, 1)
    return sig*env


def kick():
    t = np.arange(round(SR*.34))/SR
    phase = 2*np.pi*(45*t+40*.022*(1-np.exp(-t/.022)))
    sig = np.sin(phase)*np.exp(-t/.085)
    return sig*np.minimum(t/.0015,1)


def hat(open_hat=False):
    duration = .15 if open_hat else .06
    t = np.arange(round(SR*duration))/SR
    noise = RNG.normal(size=len(t))
    # High-pass by differencing; delicate, sample-free shaker.
    noise = np.diff(noise, prepend=noise[0])
    return noise*np.exp(-t/(.029 if open_hat else .012))*.25


def brush():
    t = np.arange(round(SR*.18))/SR
    noise = RNG.normal(size=len(t))
    noise = (noise + np.roll(noise, 1) + np.roll(noise, 2))/3
    sig = noise*np.exp(-t/.025)*.35 + np.sin(2*np.pi*175*t)*np.exp(-t/.026)*.11
    return sig*np.minimum(t/.0015,1)


# Am9 — Fmaj9 — Cmaj9 — G6/9. Each chord lasts one 2.5-second bar.
CHORDS = [([57,60,64,67,71],33), ([53,57,60,64,67],29),
          ([52,55,59,62,67],36), ([55,59,62,64,69],31)]
# A deliberately restrained 8-bar phrase, in A minor / C major.
MELODY = [(0,76),(1.5,79),(3,81),(5,79),(6.5,76),(8,74),
          (10,76),(11.5,72),(13,71),(15,69),(17,72),(18.5,76),
          (20,79),(22,76),(24,74),(26,71),(28,72),(30,74)]

for bar in range(int(np.ceil(DURATION/(4*BEAT)))):
    start = bar*4*BEAT
    chord, root = CHORDS[bar % 4]
    # Pads persist across the cut; the outro thins out naturally.
    intensity = .72 if bar < 4 else 1.0
    if bar*4*BEAT >= DURATION-7.5:
        intensity *= .8
    for i, note in enumerate(chord):
        add(pad(note, 4*BEAT+.7), start, .023*intensity, -.6+.3*i)
    for i in range(4):
        note = chord[[1,3,2,4][i]]+12
        add(keys(note, 1.7), start+i*BEAT, .026*intensity, [-.3,.22,-.16,.35][i])
        # Quiet cross-channel echoes add spaciousness without reverb assets.
        add(keys(note, 1.7), start+i*BEAT+BEAT*.75, .007*intensity, [-.3,.22,-.16,.35][i]*-1)
    if 3 <= bar and bar*4*BEAT < DURATION-7.5:
        add(bass(root, 1.3), start, .115)
        add(bass(root+7, .75), start+2.5*BEAT, .071)
        for beat in [0, 2, 3.5] if bar % 2 else [0, 2]:
            add(kick(), start+beat*BEAT, .17)
        for beat in [1, 3]:
            add(brush(), start+beat*BEAT, .135, .10)
        for i in range(8):
            swing = .045 if i%2 else 0
            add(hat(i==7), start+i*.5*BEAT+swing, .028 if i%2 else .045, -.25 if i%2 else .25)

for phrase_start in np.arange(10, DURATION-7, 20):
    for beat, note in MELODY:
        start = phrase_start+beat*BEAT
        if start < DURATION-7:
            add(keys(note, 2.0), start, .032, -.08)
            add(keys(note, 2.0), start+.46875, .008, .25)

# A tiny warm texture avoids an unnaturally sterile synthesizer bed.
texture = RNG.normal(size=len(MIX))*.00019
texture = np.convolve(texture, np.ones(6)/6, mode='same')
MIX[:, 0] += texture
MIX[:, 1] += np.roll(texture, 23)
time = np.arange(len(MIX))/SR
fade = np.minimum(time/1.7,1) * np.minimum((DURATION-time)/3.0,1)
MIX *= fade[:,None]
MIX = np.tanh(MIX*1.05)
MIX *= 10**(-6/20) / np.max(np.abs(MIX))
pcm = np.int16(np.clip(MIX,-1,1)*32767)
write(ROOT/'music.wav',SR,pcm)
write(ROOT/'music_preview_12s.wav',SR,pcm[10*SR:22*SR])
metadata = {
    'title':'MDmeow — Soft Focus', 'original':True,
    'duration_seconds':DURATION, 'sample_rate':SR, 'channels':2,
    'bpm':BPM, 'key':'A minor / C major', 'bars':24,
    'peak_dbfs':round(20*np.log10(np.max(np.abs(MIX))),2),
    'rms_dbfs':round(20*np.log10(np.sqrt(np.mean(MIX**2))),2),
    'license_note':'Original procedural composition, no external samples or recordings.',
    'regenerate':'python make_music.py',
}
(ROOT/'music_metadata.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(metadata,ensure_ascii=False))
