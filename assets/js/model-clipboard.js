/* Copy a forest of registered model objects, without dropping group descendants. */
(function (global) {
  'use strict'
  function capture(shapes, selection) {
    const selected = new Set(selection)
    const byMesh = new Map(shapes.map(shape => [shape.mesh, shape]))
    const roots = shapes.filter(shape => {
      if (!selected.has(shape)) return false
      for (let p = shape.mesh.parent; p; p = p.parent) if (selected.has(byMesh.get(p))) return false
      return true
    })
    const entries = []
    function visit(shape, parentIndex) {
      shape.mesh.updateWorldMatrix(true, false)
      const object = shape.toSerializableJSON()
      if (parentIndex < 0) object.object.matrix = shape.mesh.matrixWorld.toArray()
      const index = entries.length
      entries.push({ object, parentIndex, shapeName: shape.shapeName, shapeType: shape.shapeType,
        isImported: shape.isImported, isGroup: shape.isGroup, locked: shape.locked })
      shapes.filter(child => child.mesh.parent === shape.mesh).forEach(child => visit(child, index))
    }
    roots.forEach(shape => visit(shape, -1))
    return entries
  }
  function paste(entries, THREE, create, scene, offset) {
    const loader = new THREE.ObjectLoader()
    const copies = entries.map(entry => {
      const object = loader.parse(entry.object)
      const shape = create(object, entry.shapeName + ' Copy')
      shape.shapeType = entry.shapeType
      shape.isImported = entry.isImported
      shape.isGroup = Boolean(entry.isGroup)
      shape.locked = Boolean(entry.locked)
      return shape
    })
    entries.forEach((entry, index) => {
      const shape = copies[index]
      if (entry.parentIndex >= 0) copies[entry.parentIndex].mesh.add(shape.mesh)
      else { scene.add(shape.mesh); shape.mesh.position.add(offset) }
    })
    copies.forEach(shape => shape.updateOutline())
    return { copies, roots: copies.filter((shape, index) => entries[index].parentIndex < 0) }
  }
  const api = { capture, paste }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  global.ModelClipboard = api
})(typeof window !== 'undefined' ? window : globalThis)
