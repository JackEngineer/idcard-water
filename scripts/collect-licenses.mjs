import {execFileSync} from 'node:child_process';
import {readFile,readdir,writeFile,realpath} from 'node:fs/promises';
import path from 'node:path';
const chunks=['THIRD-PARTY LICENSES\nGenerated from the locked Rust workspace and installed npm packages.\nIncludes development and build dependencies. Review license expressions and notices before public distribution.\n'];
const metadata=JSON.parse(execFileSync('cargo',['metadata','--format-version','1','--all-features','--locked'],{encoding:'utf8',maxBuffer:32*1024*1024}));
async function notice(directory,title,license){
  const base=await realpath(directory);
  chunks.push(`\n\n===== ${title} =====\nSPDX/license declaration: ${license||'NOT DECLARED; REVIEW REQUIRED'}\n`);
  const files=(await readdir(base,{withFileTypes:true})).filter(entry=>entry.isFile()&&/^(licen[sc]e|copying|notice)([._-]|$)/i.test(entry.name));
  if(!files.length) chunks.push('No separate license text in package root. Consult the package source before distribution.\n');
  for(const file of files){
    const source=await realpath(path.join(base,file.name));
    if(!source.startsWith(base+path.sep))throw new Error('License path escaped package');
    chunks.push(`\n--- ${file.name} ---\n${await readFile(source,'utf8')}\n`);
  }
}
for(const pkg of metadata.packages.filter(pkg=>pkg.source).sort((a,b)=>(a.name+a.version).localeCompare(b.name+b.version))){
  await notice(path.dirname(pkg.manifest_path),`Rust: ${pkg.name} ${pkg.version}`,pkg.license);
}
const lock=JSON.parse(await readFile('package-lock.json','utf8'));
for(const [directory,pkg] of Object.entries(lock.packages).sort(([a],[b])=>a.localeCompare(b))){
  if(!directory||pkg.link)continue;
  try{await notice(directory,`npm: ${directory} ${pkg.version}`,pkg.license);}catch(error){if(error.code!=='ENOENT')throw error;}
}
await writeFile('assets/THIRD_PARTY_LICENSES.txt',chunks.join(''));
console.log('Generated dependency declarations and available license texts. Missing root texts remain explicitly marked for pre-release review.');
