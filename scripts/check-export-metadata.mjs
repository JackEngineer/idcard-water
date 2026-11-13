import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {promisify} from 'node:util';
const run=promisify(execFile);
const manifest=JSON.parse(await readFile('.verification/fixture-manifest.json','utf8'));
const {stdout}=await run('exiftool',['-json','-G1','-EXIF:all','-XMP:all','-IPTC:all','-Comment','-ThumbnailImage','-PreviewImage',manifest.source]);
const [input]=JSON.parse(stdout);
assert.ok(Object.keys(input).some(key=>key.includes('GPSLatitude')),'Synthetic input must contain GPS');
assert.ok(Object.keys(input).some(key=>key.includes('ThumbnailImage')),'Synthetic input must contain an unwatermarked thumbnail');
assert.ok(Object.keys(input).some(key=>key.startsWith('XMP')),'Synthetic input must contain XMP');
assert.ok(input['IFD0:Orientation'],'Synthetic input must contain orientation');
for(const path of manifest.outputs){
  const {stdout}=await run('exiftool',['-json','-G1','-EXIF:all','-XMP:all','-IPTC:all','-Comment','-ThumbnailImage','-PreviewImage',path]);
  const [{SourceFile,...metadata}]=JSON.parse(stdout);
  assert.ok(SourceFile);assert.deepEqual(metadata,{},'Output must not carry source metadata');
}
console.log(`PASS: GPS, orientation, XMP and embedded thumbnail present in synthetic input; ${manifest.outputs.length} real exports contain no source metadata.`);
