'use strict'
const assert = require('assert')
const fs = require('fs')
const vm = require('vm')
const THREE = require('../assets/js/vendor/three.min.js')
const Clipboard = require('../assets/js/model-clipboard.js')
// Exercise the actual editor ModelShape serialization/resource cloning code.
const app = fs.readFileSync(require.resolve('../assets/js/app.js'), 'utf8')
const scene = new THREE.Scene()
const context = vm.createContext({ THREE, scene, finishGeometry: g => g,
  SHAPE_BY_ID: new Map([['cube', { id: 'cube', name: 'Cube', createGeometry: () => new THREE.BoxGeometry(1, 1, 1) }]]) })
vm.runInContext(app.slice(app.indexOf('  class ModelShape {'), app.indexOf('  // CUBE MANAGER')) + '\nthis.ModelShape = ModelShape', context)
const Shape = context.ModelShape
const group = new Shape('imported', new THREE.Vector3(3, 2, 1), new THREE.Group(), 'Group')
group.isGroup = true; group.shapeType = 'group'; group.isImported = false
group.mesh.rotation.y = .4
const nested = new Shape('imported', new THREE.Vector3(1, 0, 0), new THREE.Group(), 'Nested')
nested.isGroup = true
const a = new Shape('cube'), b = new Shape('cube'), other = new Shape('cube', new THREE.Vector3(20, 1, 2))
group.mesh.add(a.mesh, nested.mesh); nested.mesh.add(b.mesh)
b.mesh.position.set(0, 3, 0)
const shapes = [group, nested, a, b, other]
const offset = new THREE.Vector3(1.5, 1.5, 1.5)
const originalPosition = b.mesh.getWorldPosition(new THREE.Vector3())
const entries = Clipboard.capture(shapes, [group, b, other])
assert.equal(entries.length, 5, 'selected descendants must not be copied twice')
assert.equal(entries.filter(entry => entry.parentIndex < 0).length, 2)
const create = (object, name) => new Shape('imported', object.position.clone(), object, name)
const { copies, roots } = Clipboard.paste(entries, THREE, create, scene, offset)
assert.equal(roots.length, 2)
assert.equal(copies.filter(shape => shape.isGroup).length, 2)
const copiedB = copies.find(shape => shape.shapeName === 'Cube Copy' && shape.mesh.parent === copies.find(shape => shape.shapeName === 'Nested Copy').mesh)
assert(copiedB.mesh.getWorldPosition(new THREE.Vector3()).distanceTo(originalPosition.clone().add(offset)) < 1e-6)
assert.notEqual(copiedB.mesh.geometry, b.mesh.geometry)
assert.notEqual(copiedB.mesh.material, b.mesh.material)
assert.notEqual(copiedB.id, b.id)
copiedB.mesh.geometry.attributes.position.setX(0, 999)
assert.notEqual(b.mesh.geometry.attributes.position.getX(0), 999)
// Clipboard is a snapshot, not a reference to subsequently edited/deleted shapes.
group.mesh.position.set(100, 100, 100)
const again = Clipboard.paste(entries, THREE, create, scene, offset)
assert(again.roots[0].mesh.position.distanceTo(new THREE.Vector3(4.5, 3.5, 2.5)) < 1e-6)
// Copying a child alone preserves its world position even under a rotated parent.
const childPosition = b.mesh.getWorldPosition(new THREE.Vector3())
const childOnly = Clipboard.paste(Clipboard.capture(shapes, [b]), THREE, create, scene, offset)
assert(childOnly.roots[0].mesh.getWorldPosition(new THREE.Vector3()).distanceTo(childPosition.add(offset)) < 1e-6)
assert.deepEqual(Clipboard.capture(shapes, []), [])
console.log('Model clipboard passed: nested groups, multi-selection, ancestor deduplication, world transforms, immutable clipboard, independent resources')
