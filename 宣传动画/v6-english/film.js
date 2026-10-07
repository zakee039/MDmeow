(() => {
  const timing = window.FILM_TIMING;
  const scenes = [...document.querySelectorAll('.scene')];
  const clamp = x => Math.max(0, Math.min(1, x));
  const ease = x => 1 - Math.pow(1 - clamp(x), 3);
  const copy = {
    '10': ['Write it.<br>See it.', 'From headings to tables,<br>give your ideas structure.'],
    '12': ['Code, in<br>full color.', 'Syntax highlighting. Line numbers.<br>Read every line with clarity.'],
    '20': ['Complex math.<br>Clear results.', 'Equations and matrices,<br>beautifully arranged.'],
    '9': ['Image tools.<br>Instant control.', 'Caption, align and resize.<br>Just one click.'],
  };
  function fit() {
    document.documentElement.style.setProperty('--scale', Math.min(innerWidth/1920, innerHeight/1080));
  }
  addEventListener('resize', fit); fit();
  window.filmReady = new Promise((resolve, reject) => {
    const begin = Date.now();
    const poll = () => {
      if (window.rendererReady) resolve();
      else if (Date.now()-begin > 30000) reject(new Error('Document renderer failed to initialize'));
      else setTimeout(poll, 50);
    };
    poll();
  });
  window.renderAt = async t => {
    const cut = timing.scenes.find(c => t >= c.start && t < c.end) || timing.scenes.at(-1);
    const local = t-cut.start;
    const entrance = ease((local+.1)/.35);
    scenes.forEach(s => {
      const active = Number(s.dataset.index) === cut.scene;
      s.classList.toggle('active', active);
      s.style.opacity = active ? entrance : 0;
      s.style.transform = `translateY(${12*(1-entrance)}px) scale(.98)`;
    });
    const active = scenes.find(s => Number(s.dataset.index) === cut.scene);
    document.querySelector('.render-scene').classList.toggle('show-image-tools', cut.section==='9');
    document.querySelector('.document-window .frame-top span').textContent = cut.section==='9' ? 'MDmeow / Image toolbar' : 'Markdown_showcase.md';
    document.querySelector('#render-status').textContent = cut.section==='9' ? 'App interface' : 'Miku Cream · Live rendering';
    active.querySelectorAll('.miku').forEach(img => { img.style.translate = `0 ${Math.sin(local*1.5)*5}px`; });
    if(cut.scene===5) {
      const reveal = (selector, delay) => {
        const element = active.querySelector(selector);
        const p = ease((local-delay)/.35);
        element.style.opacity = p;
        element.style.translate = `0 ${24*(1-p)}px`;
      };
      reveal('.opening-tools article:first-child', .05);
      reveal('.tool-plus', .15);
      reveal('.opening-tools article:nth-of-type(2)', .25);
      reveal('.opening-answer', .45);
      reveal('.opening-sign', .45);
    }
    if(cut.section) {
      const [title, description] = copy[cut.section];
      document.querySelector('#render-title').innerHTML = title;
      document.querySelector('#render-description').innerHTML = description;
      document.querySelectorAll('[data-section]').forEach(b => b.classList.toggle('selected', b.dataset.section===cut.section));
      const scroller = document.querySelector('#document-scroll');
      const target = [...document.querySelectorAll('#editor h2')].find(h => h.textContent.startsWith(cut.section+'.'));
      if(target) {
        const scale = (parseFloat(document.documentElement.style.getPropertyValue('--scale'))||1)*.98;
        const top = (target.getBoundingClientRect().top-scroller.getBoundingClientRect().top)/scale+scroller.scrollTop-24;
        const drift = cut.section==='9'? 65 : cut.section==='20'? 210 : cut.section==='12'? 165 : 110;
        scroller.scrollTop = top + drift*ease((local-.7)/(cut.end-cut.start-1.2));
      }
    }
    const caption = timing.captions.find(c => t>=c.start && t<c.end);
    document.querySelector('#caption').textContent = caption ? caption.text : '';
    document.querySelector('#film-progress').style.width = `${clamp(t/timing.duration)*100}%`;
  };
  if(!window.__EXPORT_MODE__) {
    window.filmReady.then(() => {
      const audio = new Audio('audio/mix.wav');
      const button = document.createElement('button');
      button.textContent = '▶ Play / Pause';
      button.style.cssText='position:fixed;bottom:12px;right:15px;z-index:100;padding:10px 18px;border:0;border-radius:8px;background:#39c5bb;color:white';
      document.body.append(button);
      button.onclick = () => audio.paused ? audio.play() : audio.pause();
      const tick = () => { window.renderAt(audio.currentTime); requestAnimationFrame(tick); }; tick();
    });
  }
})();
