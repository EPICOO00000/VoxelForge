/* Retained 3D sources, rasterized in block-world coordinates after each transform. */
(function (global) {
  'use strict'
  const copy = value => JSON.parse(JSON.stringify(value))
  function dispose(object) {
    object.traverse(child => {
      if (child.geometry) child.geometry.dispose()
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.filter(Boolean).forEach(material => material.dispose())
    })
  }
  function sourceObject(THREE, form) {
    const object = new THREE.ObjectLoader().parse(form.source)
    object.position.fromArray(form.position)
    object.rotation.set(...form.rotation)
    object.scale.fromArray(form.scale)
    object.updateMatrixWorld(true)
    return object
  }
  function createForm(THREE, object, name, resolution = 1, blockId = 28) {
    const wrapper = new THREE.Group(), child = object.clone(true)
    child.position.multiplyScalar(resolution)
    child.scale.multiplyScalar(resolution)
    wrapper.add(child)
    wrapper.updateMatrixWorld(true)
    const center = new THREE.Box3().setFromObject(wrapper).getCenter(new THREE.Vector3())
    child.position.sub(center)
    // Parametric geometries otherwise serialize constructor parameters, losing sculpt edits.
    const temporary = []
    child.traverse(mesh => {
      if (!mesh.isMesh || !mesh.geometry) return
      if (mesh.geometry.userData && mesh.geometry.userData.shapeStudioModified) {
        mesh.geometry = new THREE.BufferGeometry().copy(mesh.geometry)
        temporary.push(mesh.geometry)
      }
    })
    wrapper.updateMatrixWorld(true)
    const source = wrapper.toJSON()
    temporary.forEach(geometry => geometry.dispose())
    return { id: THREE.MathUtils.generateUUID(), name, source,
      position: center.toArray(), rotation: [0, 0, 0], scale: [1, 1, 1], blockId,
      fillMode: 'solid', generated: [], previous: [] }
  }
  class LiveForms {
    constructor(world, voxelize) {
      this.world = world
      this.THREE = world.THREE
      this.voxelize = voxelize || global.BloxdSchematic.voxelizeObject
      this.busy = false
    }
    async rebuild(next, label) {
      if (this.busy) throw new Error('Wait for the current form rebuild to finish.')
      this.busy = true
      try {
        const world = this.world, originalForms = world.liveForms, before = new Map(world.blocks), plans = []
        const forms = copy(next)
        // Calculate everything before modifying the world: failure is atomic.
        for (const form of forms) {
          if (![...form.position, ...form.rotation, ...form.scale].every(Number.isFinite) || form.scale.some(n => Math.abs(n) < .01 || Math.abs(n) > 128)) {
            throw new Error('Use finite transforms and scale magnitudes between 0.01 and 128.')
          }
          const object = sourceObject(this.THREE, form)
          try {
            plans.push(await this.voxelize(object, { THREE: this.THREE, blocksPerUnit: 1,
              blockId: form.blockId, materialMode: form.materialMode || 'single', fillMode: form.fillMode || 'solid',
              paletteFamily: form.paletteFamily || 'safe', textureColors: form.textureColors !== false, dither: form.dither !== false,
              maxCandidateChecks: 35000000 }))
          } finally { dispose(object) }
        }
        if (world.disposed || world.liveForms !== originalForms || world.blocks.size !== before.size || [...before].some(([key, id]) => world.blocks.get(key) !== id)) {
          throw new Error('The block world changed during calculation. Please retry the form edit.')
        }
        const result = new Map(before)
        // Unwind in reverse order so overlapping forms restore the correct underlay.
        ;[...world.liveForms].reverse().forEach(form => {
          const generated = new Map(form.generated || [])
          ;(form.previous || []).forEach(([key, id]) => {
            if (result.get(key) !== generated.get(key)) return // retain manual edits
            if (id) result.set(key, id)
            else result.delete(key)
          })
        })
        forms.forEach((form, index) => {
          form.previous = [...plans[index].keys()].map(key => [key, result.get(key) || 0])
          form.generated = [...plans[index]]
          plans[index].forEach((id, key) => result.set(key, id))
        })
        if (result.size > 2000000) throw new Error('Live forms exceed the safe 2,000,000-block world limit.')
        const changed = new Set([...before.keys(), ...result.keys()])
        for (const key of changed) {
          if (before.get(key) !== result.get(key) && world.isLockedKey(key)) throw new Error('A live form intersects locked blocks. Unlock that group first.')
        }
        world.blocks = result
        world.liveForms = forms
        world.selection.clear()
        world.rebuildChunkIndex()
        world.render()
        world.commit(label || 'Rebuild live forms')
        return forms
      } finally { this.busy = false }
    }
    async add(object, name, resolution = 1, blockId = this.world.currentBlockId) {
      const form = createForm(this.THREE, object, name, resolution, blockId)
      await this.rebuild([...this.world.liveForms, form], `Add live ${name}`)
      return form.id
    }
    async transform(id, patch) {
      return this.rebuild(this.world.liveForms.map(form => form.id === id ? { ...form, ...copy(patch) } : form), 'Transform live form')
    }
    async duplicate(id) {
      const original = this.world.liveForms.find(form => form.id === id)
      if (!original) return null
      const form = { ...copy(original), id: this.THREE.MathUtils.generateUUID(), name: original.name + ' Copy',
        position: original.position.map(n => n + 2), generated: [], previous: [] }
      await this.rebuild([...this.world.liveForms, form], 'Duplicate live form')
      return form.id
    }
    async remove(id) { return this.rebuild(this.world.liveForms.filter(form => form.id !== id), 'Delete live form') }
    bakeAll() {
      if (this.busy) throw new Error('Wait for the current form rebuild to finish.')
      this.world.liveForms = []
      this.world.commit('Bake live forms into blocks')
    }
  }
  const api = { LiveForms, createForm, sourceObject, dispose }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  global.BloxdLiveForms = api
})(typeof window !== 'undefined' ? window : globalThis)
