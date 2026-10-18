const assert=require('assert')
require('../assets/js/bloxd-block-catalog.js')
const colors=require('../assets/js/bloxd-block-colors.js');colors.init(global.BLOXD_NAME_TO_ID)
require('../assets/js/bloxd-color-matcher.js')
const texture=require('../assets/js/bloxd-texture-engine.js')
const modes=['fbm','perlin','ridged','value','cellular','random','checker','stripes','gradient']
for(const mode of modes){const a=[],b=[];for(let i=0;i<25;i++){a.push(texture.sample(i,i%4,i%7,{mode,seed:'same',scale:4,octaves:4,min:0,max:24}));b.push(texture.sample(i,i%4,i%7,{mode,seed:'same',scale:4,octaves:4,min:0,max:24}))}assert.deepEqual(a,b,`${mode} is not deterministic`);assert(a.every(v=>v>=0&&v<=1),`${mode} left normalized range`)}
const palette=texture.generateNearRgb('#4f8050',8,'natural',80);assert(palette.length>=2);assert(palette.every(item=>Number.isInteger(item.id)&&item.id>0));
const blocks=new Map();for(let x=0;x<8;x++)for(let y=0;y<8;y++)for(let z=0;z<8;z++)blocks.set(`${x},${y},${z}`,4)
const surface=texture.surfaceKeys(blocks);assert.equal(surface.length,296)
const result=texture.apply(blocks,surface,palette,{mode:'fbm',seed:'forest',scale:3,octaves:4,contrast:1.3});assert(result.changed>0);assert(new Set(surface.map(key=>blocks.get(key))).size>=2)
const first=[...blocks];const copy=new Map();for(let x=0;x<8;x++)for(let y=0;y<8;y++)for(let z=0;z<8;z++)copy.set(`${x},${y},${z}`,4);texture.apply(copy,surface,palette,{mode:'fbm',seed:'forest',scale:3,octaves:4,contrast:1.3});assert.deepEqual([...copy],first)
console.log(`Bloxd texture engine passed: ${modes.length} patterns, ${palette.length} RGB-near blocks, ${result.changed} surface changes`)
