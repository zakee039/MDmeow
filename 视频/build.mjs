import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const dir=path.dirname(fileURLToPath(import.meta.url));
await build({configFile:false,define:{'process.env.NODE_ENV':'"production"'},root:path.dirname(dir),base:'./',publicDir:false,build:{outDir:path.join(dir,'assets/renderer'),emptyOutDir:true,lib:{entry:path.join(dir,'renderer.ts'),name:'MDmeowVideo',formats:['iife'],fileName:()=> 'renderer.js'},cssCodeSplit:false,assetsInlineLimit:1000000,chunkSizeWarningLimit:3000}});
