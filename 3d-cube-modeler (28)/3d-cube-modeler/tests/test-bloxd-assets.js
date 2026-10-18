const fs=require('fs'),path=require('path'),assert=require('assert'),schematic=require('../assets/js/bloxd-schematic.js')
global.window=global
require('../assets/js/bloxd-asset-catalog.js')
const root=path.join(__dirname,'..','assets','bloxd-assets'),catalog=global.BLOXD_ASSET_CATALOG
assert.equal(catalog.length,922)
let total=0,categories=new Set()
for(const asset of catalog){const file=path.join(root,asset.file);assert(fs.existsSync(file),`missing ${asset.file}`);const decoded=schematic.decodeSchematic(fs.readFileSync(file));assert.equal(decoded.blockCount,asset.blocks,`${asset.id} block metadata mismatch`);assert.deepEqual([decoded.size.x,decoded.size.y,decoded.size.z],asset.size,`${asset.id} size metadata mismatch`);for(const id of decoded.voxels.values())assert(Number.isInteger(id)&&id>0,`${asset.id} invalid block ID`);total+=decoded.blockCount;categories.add(asset.category)}
assert.deepEqual([...categories].sort(),['house','rock','stand','tree'])
const sample=schematic.decodeSchematic(fs.readFileSync(path.join(root,catalog[0].file))),roundtrip=schematic.decodeSchematic(schematic.encodeSchematic(sample.voxels,sample.name).bytes);assert.equal(roundtrip.blockCount,sample.blockCount)
console.log(`Bloxd asset library passed: ${catalog.length} assets, ${total.toLocaleString()} blocks, ${categories.size} categories`)
