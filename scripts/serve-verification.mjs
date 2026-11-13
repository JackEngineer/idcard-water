import {execFileSync,spawn} from 'node:child_process';
import path from 'node:path';
const cargo=execFileSync('rustup',['which','--toolchain','stable','cargo'],{encoding:'utf8'}).trim();
const child=spawn(cargo,['run','--quiet','-p','idcard-water','--example','verify_images','--','--serve'],{stdio:'inherit',env:{...process.env,PATH:`${path.dirname(cargo)}${path.delimiter}${process.env.PATH}`}});
child.on('exit',code=>process.exit(code??1));
process.on('SIGTERM',()=>child.kill('SIGTERM'));
process.on('SIGINT',()=>child.kill('SIGINT'));
