'use strict'
/*
 * Tests for the Bloxd schematic splitter core.
 * Run with: node tests/test-bloxd-splitter.js
 */
const assert = require('assert')
const zlib = require('zlib')
const Bloxd = require('../assets/js/bloxd-schematic.js')
const Splitter = require('../assets/js/bloxd-schematic-splitter.js')

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** Build a VoxelSet from a list of `[x, y, z, id]` blocks. */
function voxelsFrom(blocks) {
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (const [x, y, z] of blocks) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z)
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z)
  }
  const voxels = new Splitter.VoxelSet(maxX - minX + 1, maxY - minY + 1, maxZ - minZ + 1)
  for (const [x, y, z, id] of blocks) voxels.set(x - minX, y - minY, z - minZ, id)
  return voxels
}

/**
 * Two separate cross-shaped houses standing on one large stone platform,
 * plus a floating 2-block detail above one of them so merging can be tested.
 * Houses start at y = 4, above the four bottom layers scanned for platforms,
 * so only the 24 x 24 ground platform is removed.
 */
function buildScene() {
  const blocks = []
  // Solid 24 x 24 platform, two layers thick.
  for (let x = 0; x < 24; x++) {
    for (let z = 0; z < 24; z++) {
      blocks.push([x, 0, z, 28])
      blocks.push([x, 1, z, 28])
    }
  }
  const cross = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]
  const house = (centerX, centerZ, id) => {
    for (const [dx, dz] of cross) {
      for (let y = 4; y < 7; y++) blocks.push([centerX + dx, y, centerZ + dz, id])
    }
  }
  house(3, 3, 15)   // house A: 15 blocks over 5 columns
  house(17, 17, 128) // house B: 15 blocks over 5 columns
  // Tiny isolated detail floating above the centre column of house A.
  blocks.push([3, 9, 3, 47])
  blocks.push([3, 10, 3, 47])
  return voxelsFrom(blocks)
}

function sortedIds(voxels) {
  const ids = []
  voxels.blocks.forEach(id => ids.push(id))
  ids.sort((a, b) => a - b)
  return ids
}

function readU16(bytes, offset) { return bytes[offset] | (bytes[offset + 1] << 8) }
function readU32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
}

/** Minimal independent ZIP reader (store method) used to verify createZip. */
function readZip(bytes) {
  const files = []
  let offset = 0
  while (offset + 4 <= bytes.length && readU32(bytes, offset) === 0x04034b50) {
    const flags = readU16(bytes, offset + 6)
    const method = readU16(bytes, offset + 8)
    const crc = readU32(bytes, offset + 14)
    const size = readU32(bytes, offset + 18)
    const nameLength = readU16(bytes, offset + 26)
    const extraLength = readU16(bytes, offset + 28)
    const nameStart = offset + 30
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength))
    const dataStart = nameStart + nameLength + extraLength
    const data = bytes.subarray(dataStart, dataStart + size)
    files.push({ name, flags, method, crc, size, data })
    offset = dataStart + size
  }
  // End of central directory record.
  let eocd = -1
  for (let index = bytes.length - 22; index >= 0; index--) {
    if (readU32(bytes, index) === 0x06054b50) { eocd = index; break }
  }
  assert.notStrictEqual(eocd, -1, 'ZIP must contain an end-of-central-directory record')
  const entryCount = readU16(bytes, eocd + 10)
  const centralSize = readU32(bytes, eocd + 12)
  const centralOffset = readU32(bytes, eocd + 16)
  assert.strictEqual(entryCount, files.length, 'EOCD entry count must match local headers')
  assert.strictEqual(centralOffset + centralSize, eocd, 'central directory must end at the EOCD')
  assert.strictEqual(readU32(bytes, centralOffset), 0x02014b50, 'central directory must start with its signature')
  return files
}

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

let checks = 0
function test(name, fn) {
  fn()
  checks++
  console.log('  ✓ ' + name)
}

console.log('Bloxd schematic splitter')

test('encodes and decodes a schematic without losing blocks', () => {
  const voxels = buildScene()
  const bytes = Splitter.encodeVoxels(voxels, 'scene')
  assert.ok(bytes instanceof Uint8Array)
  const parsed = Splitter.parseSchematic(bytes)
  assert.strictEqual(parsed.name, 'scene')
  assert.strictEqual(parsed.voxels.size, voxels.size)
  assert.deepStrictEqual(sortedIds(parsed.voxels), sortedIds(voxels))
  assert.strictEqual(parsed.voxels.sx, voxels.sx)
  assert.strictEqual(parsed.voxels.sy, voxels.sy)
  assert.strictEqual(parsed.voxels.sz, voxels.sz)
})

test('units produced by the splitter decode with the app schematic decoder', () => {
  const voxels = buildScene()
  Splitter.removePlatforms(voxels)
  const units = Splitter.detectUnits(voxels)
  const bytes = Splitter.encodeUnit(units[0], 'unit001')
  const decoded = Bloxd.decodeSchematic(bytes)
  assert.strictEqual(decoded.name, 'unit001')
  assert.strictEqual(decoded.blockCount, units[0].count)
  assert.strictEqual(decoded.size.x, units[0].aabb.maxX - units[0].aabb.minX + 1)
  assert.strictEqual(decoded.size.y, units[0].aabb.maxY - units[0].aabb.minY + 1)
  assert.strictEqual(decoded.size.z, units[0].aabb.maxZ - units[0].aabb.minZ + 1)
})

test('removes full ground platforms from the bottom layers', () => {
  const voxels = buildScene()
  const before = voxels.size
  const removed = Splitter.removePlatforms(voxels)
  assert.strictEqual(removed, 24 * 24 * 2, 'both platform layers should be removed')
  assert.strictEqual(voxels.size, before - removed)
  // Two 15-block houses plus the two floating detail blocks remain.
  assert.strictEqual(voxels.size, 2 * 15 + 2)
})

test('platform removal never deletes an entire flat prop', () => {
  const rock = []
  for (let x = 0; x < 5; x++) {
    for (let z = 0; z < 5; z++) {
      for (let y = 0; y < 2; y++) rock.push([x, y, z, 28])
    }
  }
  const voxels = voxelsFrom(rock)
  const removed = Splitter.removePlatforms(voxels)
  assert.strictEqual(removed, 0, 'a schematic must never be emptied by the platform heuristic')
  assert.strictEqual(voxels.size, 50)
  assert.strictEqual(Splitter.detectUnits(voxels).length, 1)
})

test('column detection ignores Y and keeps a trunk with the canopy above it', () => {
  const voxels = buildScene()
  Splitter.removePlatforms(voxels)
  const units = Splitter.detectUnits(voxels, { mode: 'columns' })
  assert.strictEqual(units.length, 2)
  assert.deepStrictEqual(units.map(unit => unit.count), [17, 15], 'units are sorted largest first')
  const tallest = units[0].aabb
  assert.strictEqual(tallest.maxY - tallest.minY + 1, 7, 'floating detail extends the unit height')
})

test('3D cluster detection separates the floating detail from the house', () => {
  const voxels = buildScene()
  Splitter.removePlatforms(voxels)
  const units = Splitter.detectUnits(voxels, { mode: 'clusters' })
  assert.strictEqual(units.length, 3)
  assert.deepStrictEqual(units.map(unit => unit.count).sort((a, b) => a - b), [2, 15, 15])
})

test('mergeSmallUnits fuses the orphan detail into the overlapping house', () => {
  const voxels = buildScene()
  Splitter.removePlatforms(voxels)
  const units = Splitter.detectUnits(voxels, { mode: 'clusters' })
  const detailIndex = units.findIndex(unit => unit.count === 2)
  const parentIndex = Splitter.findParentUnit(units, detailIndex, 10)
  assert.ok(parentIndex >= 0, 'an overlapping parent should be suggested')
  const merged = Splitter.mergeSmallUnits(units, { threshold: 10 })
  assert.strictEqual(merged, 1)
  assert.strictEqual(units.length, 2)
  assert.ok(units.some(unit => unit.count === 17), 'detail must be absorbed by the 15-block house')
})

test('mergeUnits fuses two units on demand and keeps the target', () => {
  const voxels = buildScene()
  Splitter.removePlatforms(voxels)
  const units = Splitter.detectUnits(voxels, { mode: 'columns' })
  const target = units[1]
  Splitter.mergeUnits(units, 0, 1)
  assert.strictEqual(units.length, 1)
  assert.strictEqual(units[0], target)
  assert.strictEqual(units[0].count, 32)
})

test('encoded units are normalised to their own origin', () => {
  const voxels = buildScene()
  Splitter.removePlatforms(voxels)
  const units = Splitter.detectUnits(voxels, { mode: 'columns' })
  for (const unit of units) {
    const decoded = Splitter.parseSchematic(Splitter.encodeUnit(unit, 'test')).voxels
    const origin = decoded.decode(decoded.blocks.keys().next().value)
    for (let axis = 0; axis < 3; axis++) {
      let min = Infinity
      decoded.blocks.forEach((_id, key) => {
        const coordinate = decoded.decode(key)[axis]
        if (coordinate < min) min = coordinate
      })
      assert.strictEqual(min, 0, 'unit coordinates must start at zero on every axis')
    }
    assert.ok(origin.every(value => value >= 0))
  }
})

test('multi-file merge honours world offsets in file names', () => {
  const left = Splitter.parseSchematic(Splitter.encodeVoxels(voxelsFrom([[0, 0, 0, 28], [1, 0, 0, 28]]), 'left'))
  const right = Splitter.parseSchematic(Splitter.encodeVoxels(voxelsFrom([[0, 0, 0, 15]]), 'right'))
  const merged = Splitter.mergeSources([
    { schematic: left, filename: 'house_x0_z0.bloxdschem' },
    { schematic: right, filename: 'house_x10_z4.bloxdschem' }
  ])
  assert.strictEqual(merged.mode, 'filename')
  assert.strictEqual(merged.voxels.size, 3)
  assert.strictEqual(merged.voxels.sx, 11)
  assert.strictEqual(merged.voxels.sz, 5)
  assert.ok(merged.voxels.has(10, 0, 4), 'second file must land at its named offset')
})

test('multi-file merge packs files side by side when names have no offsets', () => {
  const first = Splitter.parseSchematic(Splitter.encodeVoxels(voxelsFrom([[0, 0, 0, 28], [0, 1, 0, 28]]), 'a'))
  const second = Splitter.parseSchematic(Splitter.encodeVoxels(voxelsFrom([[0, 0, 0, 15]]), 'b'))
  const merged = Splitter.mergeSources([
    { schematic: first, filename: 'a.bloxdschem' },
    { schematic: second, filename: 'b.bloxdschem' }
  ])
  assert.strictEqual(merged.mode, 'packed')
  assert.strictEqual(merged.voxels.size, 3)
  assert.ok(merged.voxels.has(5, 0, 0), 'second file starts at x = first width + gap')
  // Detection must still separate the two files.
  assert.strictEqual(Splitter.detectUnits(merged.voxels).length, 2)
})

test('parse errors are explicit for non-Bloxd and compressed files', () => {
  assert.throws(() => Splitter.parseSchematic(new Uint8Array([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0])), /gzip/)
  assert.throws(() => Splitter.parseSchematic(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])), /header|\.bloxdschem/)
  assert.throws(() => Splitter.parseSchematic(new Uint8Array(0)), /empty/)
})

test('createZip writes a spec-compliant store archive with valid CRCs', () => {
  const first = Splitter.encodeVoxels(voxelsFrom([[0, 0, 0, 28]]), 'unit001')
  const second = Splitter.encodeVoxels(voxelsFrom([[0, 0, 0, 15], [1, 0, 0, 15]]), 'unit002')
  const manifest = new TextEncoder().encode(JSON.stringify({ schematics: [] }))
  const zip = Splitter.createZip([
    { name: 'unit001.bloxdschem', data: first },
    { name: 'unit002.bloxdschem', data: second },
    { name: 'manifest.json', data: manifest }
  ])
  const files = readZip(zip)
  assert.deepStrictEqual(files.map(file => file.name), ['unit001.bloxdschem', 'unit002.bloxdschem', 'manifest.json'])
  for (const file of files) {
    assert.strictEqual(file.method, 0, 'files must be stored')
    assert.strictEqual(file.flags & 0x0800, 0x0800, 'UTF-8 name flag must be set')
    assert.strictEqual(file.crc, zlib.crc32(file.data), 'CRC32 must match the payload')
  }
  assert.deepStrictEqual(Array.from(files[0].data), Array.from(first))
  // The stored schematic inside the archive must decode again.
  assert.strictEqual(Splitter.parseSchematic(files[0].data).voxels.size, 1)
})

test('createZip handles UTF-8 file names', () => {
  const zip = Splitter.createZip([{ name: 'maison-éà.bloxdschem', data: new Uint8Array([1, 2, 3]) }])
  const files = readZip(zip)
  assert.strictEqual(files[0].name, 'maison-éà.bloxdschem')
})

test('schematic parsing tolerates an empty result and rejects empty exports', () => {
  const empty = new Splitter.VoxelSet(0, 0, 0)
  assert.throws(() => Splitter.encodeVoxels(empty, 'empty'), /no blocks/)
})

/* ------------------------------------------------------------------ *
 * Chunk limiter (Bloxd's 160-chunk cap)
 * ------------------------------------------------------------------ */

/** Sparse build whose bounding box spans `size` blocks (few blocks, many chunks). */
function sparseBuild(size) {
  const blocks = []
  const stepX = Math.max(1, Math.floor(size.x / 6))
  const stepZ = Math.max(1, Math.floor(size.z / 6))
  for (let x = 0; x < size.x; x += stepX) {
    for (let z = 0; z < size.z; z += stepZ) {
      for (let y = 0; y < size.y; y += Math.max(1, Math.floor(size.y / 3))) {
        blocks.push([x, y, z, 28 + ((x + y + z) % 4)])
      }
    }
  }
  // Always keep the far corners so the bounds are exact.
  blocks.push([size.x - 1, size.y - 1, size.z - 1, 128])
  return voxelsFrom(blocks)
}

function blockIndex(voxels) {
  const map = new Map()
  voxels.blocks.forEach((id, key) => {
    const [x, y, z] = voxels.decode(key)
    map.set(x + ',' + y + ',' + z, id)
  })
  return map
}

test('planTiles leaves a small build in one file', () => {
  const plan = Splitter.planTiles({ x: 60, y: 40, z: 60 })
  assert.strictEqual(plan.single, true)
  assert.strictEqual(plan.parts, 1)
  assert.strictEqual(plan.totalChunks, 2 * 2 * 2)
  assert.strictEqual(plan.maxChunks, 160)
})

test('planTiles keeps every tile under the chunk limit', () => {
  for (const size of [
    { x: 400, y: 20, z: 400 },
    { x: 1024, y: 96, z: 320 },
    { x: 96, y: 64, z: 2048 },
    { x: 300, y: 300, z: 300 }
  ]) {
    const plan = Splitter.planTiles(size)
    assert.ok(plan.tileX * plan.tileY * plan.tileZ <= plan.maxChunks, 'tile must fit: ' + JSON.stringify(plan))
    assert.strictEqual(plan.cols, Math.ceil(plan.nx / plan.tileX))
    assert.strictEqual(plan.rows, Math.ceil(plan.nz / plan.tileZ))
    assert.strictEqual(plan.layers, Math.ceil(plan.ny / plan.tileY))
  }
})

test('planTiles honours a custom limit and clamps it to 160', () => {
  assert.strictEqual(Splitter.planTiles({ x: 64, y: 32, z: 64 }, { maxChunks: 4 }).maxChunks, 4)
  assert.strictEqual(Splitter.planTiles({ x: 64, y: 32, z: 64 }, { maxChunks: 999 }).maxChunks, 160)
  const plan = Splitter.planTiles({ x: 256, y: 32, z: 256 }, { maxChunks: 4 })
  assert.ok(plan.tileX * plan.tileY * plan.tileZ <= 4)
})

test('splitUnitIntoParts cuts an oversized build into valid parts', () => {
  const voxels = sparseBuild({ x: 400, y: 20, z: 400 })
  const unit = Splitter.unitFromVoxels(voxels)
  const total = Splitter.unitChunkCount(unit)
  assert.ok(total > 160, 'fixture must exceed the Bloxd limit, got ' + total)
  const { plan, parts } = Splitter.splitUnitIntoParts(unit, { maxChunks: 160 })
  assert.strictEqual(plan.single, false)
  assert.ok(parts.length > 1)
  assert.strictEqual(parts.length, plan.parts, 'empty tiles are skipped only after planning')
  let blocks = 0
  for (const part of parts) {
    assert.ok(part.chunks <= 160, 'part above limit: ' + part.chunks)
    assert.strictEqual(part.chunks, Splitter.unitChunkCount(part.unit))
    assert.ok(part.unit.count > 0)
    assert.ok(part.offset.x >= 0 && part.offset.y >= 0 && part.offset.z >= 0)
    blocks += part.unit.count
  }
  assert.strictEqual(blocks, unit.count, 'no block may be lost or duplicated')
})

test('parts reassemble into the original build through their file names', () => {
  const voxels = sparseBuild({ x: 400, y: 20, z: 400 })
  const unit = Splitter.unitFromVoxels(voxels)
  const { parts } = Splitter.splitUnitIntoParts(unit, { maxChunks: 160 })
  const sources = parts.map(part => ({
    filename: Splitter.partFileName('build', part.number, part.offset),
    schematic: Splitter.parseSchematic(Splitter.encodeUnit(part.unit, 'part'))
  }))
  const merged = Splitter.mergeSources(sources)
  assert.strictEqual(merged.mode, 'filename')
  assert.deepStrictEqual(blockIndex(merged.voxels), blockIndex(voxels))
})

test('a build taller than the chunk limit is split vertically too', () => {
  const size = { x: 4, y: 32 * 163, z: 4 }
  const voxels = sparseBuild(size)
  const unit = Splitter.unitFromVoxels(voxels)
  assert.ok(Splitter.chunkCounts(Splitter.unitSize(unit)).y > 160)
  const { plan, parts } = Splitter.splitUnitIntoParts(unit, { maxChunks: 160 })
  assert.strictEqual(plan.splitY, true)
  assert.ok(parts.length >= 2)
  for (const part of parts) assert.ok(part.chunks <= 160)
  assert.ok(parts.some(part => part.offset.y > 0), 'stacked parts must carry a Y offset')
  const names = parts.map(part => Splitter.partFileName('tall', part.number, part.offset))
  assert.ok(names.some(name => /_y\d+/.test(name)), 'Y offset must appear in the file name')
  for (const name of names) {
    const parsed = Splitter.parseOffsetsFromName(name)
    assert.ok(parsed, 'part name must parse: ' + name)
  }
  const sources = parts.map((part, index) => ({
    filename: names[index],
    schematic: Splitter.parseSchematic(Splitter.encodeUnit(part.unit, 'p'))
  }))
  assert.deepStrictEqual(blockIndex(Splitter.mergeSources(sources).voxels), blockIndex(voxels))
})

test('part names follow the upstream _x…_z… convention', () => {
  assert.strictEqual(Splitter.partFileName('house', 1, { x: 0, y: 0, z: 0 }), 'house_part001_x0_z0.bloxdschem')
  assert.strictEqual(Splitter.partFileName('house', 12, { x: 128, y: 0, z: -64 }), 'house_part012_x128_z-64.bloxdschem')
  assert.strictEqual(Splitter.partFileName('house.bloxdschem', 3, { x: 32, y: 64, z: 96 }), 'house_part003_x32_z96_y64.bloxdschem')
  assert.deepStrictEqual(Splitter.parseOffsetsFromName('house_part003_x32_z96_y64.bloxdschem'), { x: 32, y: 64, z: 96 })
})

test('a build at the limit stays a single file', () => {
  const voxels = sparseBuild({ x: 32 * 10, y: 32, z: 32 * 16 })
  const unit = Splitter.unitFromVoxels(voxels)
  assert.strictEqual(Splitter.unitChunkCount(unit), 160)
  const { plan, parts } = Splitter.splitUnitIntoParts(unit, { maxChunks: 160 })
  assert.strictEqual(plan.single, true)
  assert.strictEqual(parts.length, 1)
  assert.strictEqual(parts[0].unit, unit)
  assert.deepStrictEqual(parts[0].offset, { x: 0, y: 0, z: 0 })
})

test('the placement guide lists every part with its coordinates', () => {
  const parts = [
    { file: 'house_part001_x0_z0.bloxdschem', offset: { x: 0, y: 0, z: 0 }, chunks: 156 },
    { file: 'house_part002_x384_z0.bloxdschem', offset: { x: 384, y: 0, z: 0 }, chunks: 13 }
  ]
  const guide = Splitter.buildPartsGuide({
    name: 'house',
    blocks: 12000,
    size: { x: 400, y: 20, z: 400 },
    chunks: 169,
    maxChunks: 160,
    parts
  })
  assert.ok(guide.includes('house_part001_x0_z0.bloxdschem'))
  assert.ok(guide.includes('house_part002_x384_z0.bloxdschem'))
  assert.ok(guide.includes('x=384'))
  assert.ok(guide.includes('160'))
  assert.ok(/FR/.test(guide), 'guide is bilingual')
})

test('encodeVoxelMapForBloxd exports a small build as one file', () => {
  const map = new Map([['0,0,0', 28], ['1,0,0', 28], ['2,0,0', 28]])
  const result = Splitter.encodeVoxelMapForBloxd(map, { name: 'tiny', maxChunks: 160 })
  assert.strictEqual(result.mode, 'single')
  assert.strictEqual(result.blockCount, 3)
  assert.strictEqual(result.chunks, 1)
  assert.strictEqual(result.overLimit, false)
  const parsed = Splitter.parseSchematic(result.bytes)
  assert.strictEqual(parsed.voxels.size, 3)
  assert.strictEqual(parsed.name, 'tiny')
})

test('encodeVoxelMapForBloxd splits an oversized build instead of failing', () => {
  const map = new Map()
  for (let x = 0; x < 400; x++) map.set(`${x},5,0`, 28)
  for (let z = 1; z < 400; z++) map.set(`0,5,${z}`, 15)
  const result = Splitter.encodeVoxelMapForBloxd(map, { name: 'My Castle', maxChunks: 160 })
  assert.strictEqual(result.mode, 'split')
  assert.ok(result.parts > 1)
  assert.strictEqual(result.overLimit, true)
  assert.ok(result.largestPart <= 160)
  assert.strictEqual(result.blockCount, map.size)
  assert.deepStrictEqual(result.files.map(file => file.name), [
    'My_Castle_part001_x0_z0.bloxdschem',
    'My_Castle_part002_x384_z0.bloxdschem',
    'manifest.json',
    'GUIDE_IMPORTATION.txt'
  ])
  // The archive must be readable and contain every part plus metadata.
  const zipFiles = readZip(result.zip)
  assert.strictEqual(zipFiles.length, 4)
  for (const file of zipFiles.filter(entry => entry.name.endsWith('.bloxdschem'))) {
    assert.strictEqual(file.crc, zlib.crc32(file.data))
    const part = Splitter.parseSchematic(file.data)
    assert.ok(part.voxels.size > 0)
    const chunks = Splitter.chunkCounts({ x: part.voxels.sx, y: part.voxels.sy, z: part.voxels.sz }).total
    assert.ok(chunks <= 160, `${file.name} needs ${chunks} chunks`)
  }
  const manifest = JSON.parse(new TextDecoder().decode(zipFiles.find(file => file.name === 'manifest.json').data))
  assert.strictEqual(manifest.schematics.length, 2)
  assert.strictEqual(manifest.schematics[1].x, 384)
  // Every block survives the split.
  const total = zipFiles.filter(file => file.name.endsWith('.bloxdschem'))
    .reduce((sum, file) => sum + Splitter.parseSchematic(file.data).voxels.size, 0)
  assert.strictEqual(total, map.size)
})

test('encodeVoxelMapForBloxd honours a disabled split with an explicit flag', () => {
  const map = new Map()
  for (let x = 0; x < 400; x++) map.set(`${x},5,0`, 28)
  for (let z = 1; z < 400; z++) map.set(`0,5,${z}`, 15)
  const result = Splitter.encodeVoxelMapForBloxd(map, { name: 'raw', allowSplit: false })
  assert.strictEqual(result.mode, 'single')
  assert.strictEqual(result.overLimit, true, 'the caller can propose splitting without losing the single file')
  assert.ok(result.bytes.length > 0)
})

test('encodeVoxelMapForBloxd respects a custom chunk limit', () => {
  const map = new Map()
  for (let x = 0; x < 200; x++) map.set(`${x},0,0`, 28)
  const result = Splitter.encodeVoxelMapForBloxd(map, { name: 'long', maxChunks: 3 })
  assert.strictEqual(result.mode, 'split')
  for (const file of result.files.filter(entry => entry.name.endsWith('.bloxdschem'))) {
    const part = Splitter.parseSchematic(file.data)
    assert.ok(Splitter.chunkCounts({ x: part.voxels.sx, y: part.voxels.sy, z: part.voxels.sz }).total <= 3)
  }
})

test('adoptStringMap normalises negative voxel coordinates', () => {
  // The 3D voxelizer produces world-space coordinates that can be negative.
  const map = new Map([['-5,-3,-8', 28], ['-4,-3,-8', 15], ['0,0,0', 28]])
  const voxels = new Splitter.VoxelSet(0, 0, 0).adoptStringMap(map)
  assert.deepStrictEqual([voxels.sx, voxels.sy, voxels.sz], [6, 4, 9])
  assert.strictEqual(voxels.size, 3)
  assert.ok(voxels.has(0, 0, 0) && voxels.has(1, 0, 0) && voxels.has(5, 3, 8))
  const result = Splitter.encodeVoxelMapForBloxd(map, { name: 'negative' })
  assert.strictEqual(result.mode, 'single')
  assert.strictEqual(Splitter.parseSchematic(result.bytes).voxels.size, 3)
})

test('encodeVoxelMapForBloxd rejects an empty build', () => {
  assert.throws(() => Splitter.encodeVoxelMapForBloxd(new Map(), { name: 'x' }), /no visible blocks/i)
})

test('parseOffsetsFromName understands Bloxd and Mapslicer names', () => {
  assert.deepStrictEqual(Splitter.parseOffsetsFromName('house_x128_z-64.bloxdschem'), { x: 128, z: -64, y: 0 })
  assert.deepStrictEqual(Splitter.parseOffsetsFromName('house-x0-z12.bloxdschem'), { x: 0, z: 12, y: 0 })
  assert.deepStrictEqual(Splitter.parseOffsetsFromName('plot_x_64_z_128.bloxdschem'), { x: 64, z: 128, y: 0 })
  assert.strictEqual(Splitter.parseOffsetsFromName('house001.bloxdschem'), null)
})

test('unit colors are stable and distinct', () => {
  const first = Splitter.unitColor(0)
  assert.strictEqual(first.hex, Splitter.unitColor(0).hex)
  assert.notStrictEqual(first.hex, Splitter.unitColor(1).hex)
  assert.ok(first.r >= 0 && first.r <= 1 && first.g <= 1 && first.b <= 1)
})

test('chunk counts follow the 32-block Bloxd chunk grid', () => {
  const blocks = []
  for (let x = 0; x < 40; x++) blocks.push([x, 0, 0, 28])
  const units = Splitter.detectUnits(voxelsFrom(blocks))
  assert.strictEqual(units.length, 1)
  assert.strictEqual(Splitter.unitChunkCount(units[0]), 2, '40 blocks wide needs two chunks')
  assert.deepStrictEqual(Splitter.describeUnit(units[0]).size, { x: 40, y: 1, z: 1 })
})

console.log(`  ${checks} splitter checks passed`)
