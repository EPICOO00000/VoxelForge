const assert = require('assert')
require('../assets/js/bloxd-block-catalog.js')
const colors = require('../assets/js/bloxd-block-colors.js')
colors.init(global.BLOXD_NAME_TO_ID)
require('../assets/js/bloxd-color-matcher.js')
global.BloxdTextureEngine=require('../assets/js/bloxd-texture-engine.js')
const engine = require('../assets/js/bloxd-procedural-generators.js')

const types = Object.keys(engine.GENERATORS)
assert.equal(types.length, 14)
assert(!types.includes('tree')&&!types.includes('village'),'Bloxd-only tree/house generators must stay removed')
const started = Date.now()
for (const type of types) {
  const layer = {
    type, seed: 'native-validation', size: 8, height: 6, detail: 5, density: 5,
    variation: .6, primary: '#4f7f45', secondary: '#d9c47a', instances: 1,
    pattern: 'single', spread: 0, layerScale: 1, offsetY: 0, rotation: 0,
    waterEnabled: true, islandCount: 2, vegetation: .25, rockDensity: .15,
    settlementDensity: .1, snowLine: .82, beachWidth: .09, coastRoughness: .65
  }
  const first = engine.generateRecipeSync({ version: 2, layers: [layer] }, { blocksPerUnit: 1, maxBlocks: 100000 })
  const second = engine.generateRecipeSync({ version: 2, layers: [layer] }, { blocksPerUnit: 1, maxBlocks: 100000 })
  assert.equal(first.engine, 'native-bloxd')
  assert(first.blocks instanceof Map)
  assert(first.blockCount > 0, `${type} generated no blocks`)
  assert.equal(first.blockCount, second.blockCount, `${type} is not deterministic`)
  assert.deepEqual([...first.blocks].slice(0, 100), [...second.blocks].slice(0, 100), `${type} changed for the same seed`)
  for (const id of first.blocks.values()) assert(Number.isInteger(id) && id > 0, `${type} emitted an invalid block ID`)
}
const composition = engine.generateRecipeSync({ layers: [
  { type: 'tower', seed: 'a', size: 6, height: 10, detail: 5, density: 5, variation: .4, primary: '#6788aa', secondary: '#d2ae62', instances: 4, pattern: 'ring', spread: 14, layerScale: 1, offsetY: 0, rotation: 20 },
  { type: 'rocks', seed: 'b', size: 5, height: 8, detail: 4, density: 4, variation: .5, primary: '#686868', secondary: '#343434', instances: 3, pattern: 'grid', spread: 10, layerScale: .8, offsetY: 1, rotation: 0 }
] }, { blocksPerUnit: 1, maxBlocks: 100000 })
assert.equal(composition.instances, 7)
assert(composition.blockCount > 100)
// Rivers must carve shallow block channels, never erase mountain columns to sea level or lay beach sand through peaks.
const riverIsland=engine.generateRecipeSync({layers:[{type:'island',seed:'river-regression',size:24,height:12,detail:7,density:6,variation:.7,primary:'#4f7f45',secondary:'#d9c47a',instances:1,pattern:'single',spread:0,layerScale:1,offsetY:0,rotation:0,islandStyle:'natural',islandCount:1,coastRoughness:.65,peakSharpness:.62,terracing:.08,crater:.2,beachWidth:.09,riverCount:6,riverDepth:.3,reefDensity:.2,waterEnabled:true,biome:'tropical',snowLine:.82,vegetation:0,rockDensity:0,settlementDensity:0}]},{blocksPerUnit:2,maxBlocks:300000})
const columns=new Map();for(const [key,id] of riverIsland.blocks){const[x,y,z]=key.split(',').map(Number),k=`${x},${z}`,column=columns.get(k)||{top:-Infinity,topId:0};if(y>column.top){column.top=y;column.topId=id}columns.set(k,column)}
const interior=[...columns].filter(([key])=>{const[x,z]=key.split(',').map(Number);return Math.hypot(x,z)<8});assert(interior.length>0);assert(interior.every(([,column])=>column.top>=1),'river erased an interior mountain column to sea level')
const textured=engine.generateRecipeSync({layers:[{type:'crystals',seed:'role-texture',size:10,height:10,detail:5,density:7,variation:.4,primary:'#8844cc',secondary:'#44ccdd',instances:1,pattern:'single',spread:0,layerScale:1,offsetY:0,rotation:0,crystalCount:18,materialRules:{primary:{mode:'palette',palette:[{id:65,weight:1},{id:96,weight:1}],noise:'checker',scale:2,seed:'role'},secondary:{mode:'block',blockId:120}}}]},{blocksPerUnit:1,maxBlocks:100000})
const texturedIds=new Set(textured.blocks.values());assert(texturedIds.has(65)&&texturedIds.has(96),'role palette did not apply both checker blocks');assert(texturedIds.has(120),'single-block role override did not apply')
console.log(`Native Bloxd procedural engine passed: ${types.length}/14 generators, ${composition.blockCount} composition blocks, river regression ${riverIsland.blockCount} blocks, ${Date.now() - started} ms`)
