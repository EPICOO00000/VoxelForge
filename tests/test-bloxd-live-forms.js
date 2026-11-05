'use strict'
const assert = require('assert')
const THREE = require('../assets/js/vendor/three.min.js')
const Schematic = require('../assets/js/bloxd-schematic.js')
const { BloxdVoxelWorld } = require('../assets/js/bloxd-voxel-editor.js')
const { LiveForms, createForm, sourceObject, dispose } = require('../assets/js/bloxd-live-forms.js')
function world() {
  const w = new BloxdVoxelWorld(THREE, new THREE.Scene())
  w.render = () => {}; w.renderSelection = () => {}
  w.commit('Initial', true)
  return w
}
const sorted = map => [...map].sort(([a], [b]) => a.localeCompare(b))
async function main() {
  const w = world(), engine = new LiveForms(w, Schematic.voxelizeObject)
  w.set(0, 0, 0, 5); w.set(50, 0, 0, 7); w.commit('Terrain')
  const source = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 1), new THREE.MeshStandardMaterial())
  source.position.y = 2
  const id = await engine.add(source, 'Box', 2, 28)
  const original = sorted(w.blocks), sourceJSON = JSON.stringify(w.liveForms[0].source)
  assert(w.liveForms[0].generated.length > 0)
  const originalPosition = [...w.liveForms[0].position]
  await engine.transform(id, { position: originalPosition.map((n, i) => n + (i === 0 ? 20 : 0)), rotation: [0, Math.PI / 4, 0], scale: [1.5, 1, .75] })
  assert.notDeepEqual(sorted(w.blocks), original)
  assert.equal(w.get(0, 0, 0), 5, 'moving a form restores terrain')
  assert.equal(w.get(50, 0, 0), 7)
  assert.equal(JSON.stringify(w.liveForms[0].source), sourceJSON, 'transforms must never resample the previous blocks')
  await engine.transform(id, { position: originalPosition, rotation: [0, 0, 0], scale: [1, 1, 1] })
  assert.deepEqual(sorted(w.blocks), original, 'round trip must not degrade the form')
  const movedState = JSON.stringify(w.serialize())
  w.undo(); assert.equal(w.liveForms[0].rotation[1], Math.PI / 4)
  w.redo(); assert.equal(JSON.stringify(w.serialize()), movedState)
  const restored = world(); restored.restore(JSON.parse(JSON.stringify(w.serialize())))
  assert.equal(restored.liveForms.length, 1)
  assert.equal(JSON.stringify(restored.liveForms[0].source), sourceJSON)
  const restoredEngine = new LiveForms(restored, Schematic.voxelizeObject)
  const secondId = await restoredEngine.duplicate(id)
  assert.equal(restored.liveForms.length, 2)
  assert.notEqual(secondId, id)
  await restoredEngine.remove(id)
  assert.equal(restored.liveForms.length, 1)
  await restoredEngine.remove(secondId)
  assert.deepEqual(sorted(restored.blocks), [['0,0,0',5], ['50,0,0',7]], 'overlap/delete restores the base exactly')
  // Conversion retention reproduces the initial voxel footprint and keeps sculpted vertices.
  const sculpted = source.clone()
  sculpted.geometry = source.geometry.clone()
  sculpted.geometry.attributes.position.setX(0, 2.3)
  sculpted.geometry.userData.shapeStudioModified = true
  const converted = createForm(THREE, sculpted, 'Converted', 2)
  const parsed = sourceObject(THREE, converted)
  const options = { THREE, blocksPerUnit: 2, blockId: 28, materialMode: 'single', fillMode: 'solid' }
  assert.deepEqual(sorted(await Schematic.voxelizeObject(parsed, { ...options, blocksPerUnit: 1 })), sorted(await Schematic.voxelizeObject(sculpted, options)))
  dispose(parsed)
  // Changes made while an asynchronous calculation yields must never be overwritten.
  const concurrent = world()
  const concurrentEngine = new LiveForms(concurrent, async () => { concurrent.set(99, 0, 0, 9); return new Map([['0,0,0',28]]) })
  await assert.rejects(concurrentEngine.add(source, 'Concurrent'), /changed/)
  assert.equal(concurrent.get(99, 0, 0), 9)
  assert.equal(concurrent.liveForms.length, 0)
  // Failure leaves both block data and source descriptors untouched.
  const before = JSON.stringify(w.serialize())
  await assert.rejects(engine.transform(id, { scale: [0, 1, 1] }), /scale/)
  assert.equal(JSON.stringify(w.serialize()), before)
  const failing = new LiveForms(w, async () => { throw new Error('conversion limit') })
  await assert.rejects(failing.transform(id, { position: [9, 0, 0] }), /conversion limit/)
  assert.equal(JSON.stringify(w.serialize()), before)
  const lockedKey = w.liveForms[0].generated[0][0]
  w.groups = [{ id: 'locked', keys: [lockedKey], locked: true }]
  await assert.rejects(engine.remove(id), /locked/)
  w.groups = []
  const baked = sorted(w.blocks)
  engine.bakeAll(); assert.equal(w.liveForms.length, 0); assert.deepEqual(sorted(w.blocks), baked)
  w.undo(); assert.equal(w.liveForms.length, 1)
  await engine.remove(id)
  assert.deepEqual(sorted(w.blocks), [['0,0,0',5], ['50,0,0',7]])
  // Group clipboard metadata and contents are remapped together, and are undoable.
  const g = world()
  g.set(0, 0, 0, 5); g.set(1, 0, 0, 28)
  g.groups = [{ id:'parent', name:'Group', keys:['0,0,0','1,0,0'], parentId:null }, { id:'child', name:'Child', keys:['1,0,0'], parentId:'parent' }]
  g.selection = new Set(['0,0,0','1,0,0']); g.commit('Group')
  assert.equal(g.copySelection(), 2)
  assert.equal(g.paste([10, 0, 0]), 2)
  assert.equal(g.groups.length, 4)
  assert.deepEqual(g.groups[2].keys, ['10,0,0','11,0,0'])
  assert.equal(g.groups[3].parentId, g.groups[2].id)
  assert.equal(g.selection.size, 2)
  g.undo(); assert.equal(g.groups.length, 2); assert.equal(g.size, 2)
  g.redo(); assert.equal(g.groups.length, 4); assert.equal(g.size, 4)
  g.selection.clear(); assert.equal(g.copySelection(), 0); assert.equal(g.paste([30, 0, 0]), 0)
  console.log('Bloxd live forms passed: arbitrary transforms, no degradation, terrain/overlap restoration, save/load, undo/redo, bake, atomic failures, locks, group clipboard')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
