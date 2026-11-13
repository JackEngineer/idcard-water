import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
const config=JSON.parse(await readFile('src-tauri/tauri.conf.json','utf8'));
const csp=config.app.security.csp;
assert.ok(csp.includes('http://ipc.localhost')&&csp.includes('ipc:'));
assert.ok(!csp.includes("'unsafe-eval'")&&!csp.includes('*'));
assert.ok(!/https:|https?:\/\/(?!ipc\.localhost)/.test(csp));
assert.ok(csp.includes("object-src 'none'")&&csp.includes("frame-src 'none'"));
for(const capability of config.app.security.capabilities) assert.deepEqual(capability.permissions,[],'Generic event, file and network IPC permissions must remain disabled');
assert.equal(config.bundle.windows.webviewInstallMode.type,'offlineInstaller');
const pkg=JSON.parse(await readFile('package.json','utf8'));
assert.deepEqual(Object.keys(pkg.dependencies).filter(name=>name.startsWith('@tauri-apps/')),['@tauri-apps/api']);
async function scan(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name);
    if(entry.isDirectory()){await scan(file);continue;}
    if(!/\.(ts|tsx|css)$/.test(file)||/\.test\./.test(file)||file.includes(`${path.sep}test${path.sep}`))continue;
    const code=await readFile(file,'utf8');
    assert.ok(!/\b(fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB)\b|sendBeacon|serviceWorker|console\.(log|error|warn)/.test(code),`Unexpected network, persistence or logging API in ${file}`);
    assert.ok(!/@import\s+url|url\(["']?https?:/.test(code),`Remote asset in ${file}`);
    assert.ok(!/plugin-(fs|http|shell|opener|updater)|@tauri-apps\/api\/event/.test(code),`Broad native capability in ${file}`);
  }
}
await scan('src');
const commands=await readFile('src-tauri/src/commands.rs','utf8');
assert.ok(!/plugin_(http|shell|updater|fs)::init/.test(commands));
assert.ok(!/#\[tauri::command\][\s\S]*?fn\s+(read_file|write_file|open_path)/.test(commands));
const dist=await readFile('dist/index.html','utf8');
assert.ok(!/tests\/browser|__verification|https?:\/\//.test(dist));
console.log('PASS: bundled assets, production CSP, narrow native commands, no frontend network or persistence API, offline WebView2 packaging. Runtime network capture still requires a packaged-app check.');
