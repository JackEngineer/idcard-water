import {spawnSync} from 'node:child_process';
const result=spawnSync('cargo',['run','--quiet','-p','idcard-water','--example','verify_images','--','--metadata'],{stdio:'inherit'});
process.exit(result.status ?? 1);
