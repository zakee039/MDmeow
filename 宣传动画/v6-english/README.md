# MDmeow English promotional film

Final film and covers: [`docs/media/english.html`](../../docs/media/english.html).

62.3 seconds, 1920 × 1080, 30 fps. English interface captures, English narration (en-US-JennyNeural), and one baked-in caption layer. The reference SRT deliberately has a different basename so players do not automatically add a second subtitle layer.

The memory scene uses a crop of the original process rows with English labels outside the crop; the readings are unchanged. Usage depends on the document and environment.

Editable sources: `film.html`, `film.css`, `film.js`, `renderer.ts`, and `cover/`. Native MDmeow components produce the interface captures. Music is an original procedural composition with no external samples.

Build the renderer with `node build.mjs` after installing the repository dependencies. `capture-native.mjs` refreshes the English interface screenshots. These render scripts require Chrome and Playwright; adjust the local runtime paths to your environment. The export and validation scripts accept `FFMPEG_PATH`; their fallback is the existing local `宣传动画/.tools/imageio_ffmpeg/binaries` tool folder.

Audio regeneration requires Python, numpy, scipy, soundfile and edge-tts:

```sh
python audio/make_narration.py
python audio/make_music.py
python audio/make_narration.py --mix
node render-dom.mjs --fps 30 --duration 62.3 --audio audio/mix.wav --out MDmeow-English.mp4 --preset fast
node validate.mjs --video MDmeow-English.mp4 --fps 30 --duration 62.3
node cover/render-cover.mjs
```

`timing.json` contains the final timing. Read its duration if regenerating speech changes clip lengths. `check-site.mjs` checks both website languages at desktop/mobile sizes and verifies that switching languages preserves the section.
