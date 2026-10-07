import { Editor } from '../../src/editor';
import { SettingsPanel } from '../../src/settings-panel';
import { DEFAULT_SHORTCUTS } from '../../src/shortcuts';
import { installMikuCreamRendering } from '../../src/miku-cream';
import { setLang } from '../../src/i18n';
import '../../src/styles.css';
setLang('en'); installMikuCreamRendering();
const samples = {
table: `## 10. Tables\n\n### Ideas, clearly organized\n\n| Feature | What it does | Status |\n|---|---|---|\n| Markdown | Edit visually | Ready |\n| Code files | Read and make quick edits | Ready |\n| Images | Align and resize | Ready |\n| Equations | Render with KaTeX | Ready |\n\n### Project notes\n\n| Task | Owner | Progress |\n|---|---|---|\n| Draft a guide | You | Done |\n| Review a script | Team | In progress |\n| Share your work | Everyone | Next |\n`,
code: '## 12. Code that is easy to read\n\n```python\nimport numpy as np\n\ndef softmax(x):\n    exp_x = np.exp(x - np.max(x))\n    return exp_x / np.sum(exp_x)\n\nx = np.array([1.0, 2.0, 3.0])\nprint(softmax(x))\n```\n\n### JavaScript\n\n```javascript\nfunction greet(name) {\n  console.log(`Hello, ${name}!`);\n}\ngreet("Markdown");\n```\n',
math: '## 20. Equations\n\n$$\nE=mc^2\n$$\n\nThe quadratic formula:\n\n$$\nx=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}\n$$\n\n### Matrices\n\n$$\nA=\\begin{bmatrix}1&2&3\\\\4&5&6\\\\7&8&9\\end{bmatrix}\n$$\n\nMatrix multiplication:\n\n$$\nC_{ij}=\\sum_{k=1}^n A_{ik}B_{kj}\n$$\n',
image: '## 9. Images\n\nMake every picture fit your story.\n\n<img src="assets/document-image.png" data-align="left" style="zoom:50%;" alt="Miku illustration">\n',
};
const mode=new URLSearchParams(location.search).get('sample');
if(mode==='settings') {
  const panel=new SettingsPanel(()=>({language:'en',spellcheck:true,always_show_tabbar:true,open_last_session:true,show_path:false,list_marker:'*',editor_font:'',editor_font_size:16,source_font:'',source_font_size:15,code_alternate_rows:true,code_alternate_row_color:'#FAFFFF',remember_window_position:true,file_associations:[],accent:'#39C5BB',proxy_enabled:false,proxy_url:'',auto_check_updates:true,shortcuts:DEFAULT_SHORTCUTS}));
  panel.open();(window as any).rendererReady=true;
} else {
  const editor=new Editor(document.querySelector('#editor')!);
  const markdown=mode && mode in samples ? samples[mode as keyof typeof samples] : Object.values(samples).join('\n\n');
  editor.init(markdown).then(()=>{(window as any).rendererReady=true;});
}
