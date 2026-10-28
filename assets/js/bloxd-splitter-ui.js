/*
 * Bloxd schematic splitter — UI layer.
 * ---------------------------------------------------------------------------
 * Full-screen workspace backed by bloxd-schematic-splitter.js (core) and the
 * locally bundled Three.js build. No network access, no external libraries.
 *
 * Workflow: import .bloxdschem file(s) → remove ground platforms → detect
 * separate objects → preview / inspect / merge → download one .bloxdschem per
 * unit or a ZIP with a Bloxd manifest.json.
 */
(function (global) {
  'use strict'

  const Splitter = global.BloxdSchemSplitter
  const THREE = global.THREE
  if (!Splitter) {
    console.error('bloxd-schematic-splitter.js must load before bloxd-splitter-ui.js')
    return
  }

  const MAX_LISTED_UNITS = 500
  const FACE_SHADE = {
    top: 1,
    bottom: 0.52,
    sideX: 0.8,
    sideZ: 0.68
  }

  const ui = {}
  const state = {
    open: false,
    busy: false,
    name: '',
    sourceBlocks: 0,
    files: [],
    original: null,
    work: null,
    units: null,
    selectedId: null,
    colorMode: 'units',
    nextUnitId: 1,
    removedPlatforms: 0,
    mergedFragments: 0,
    mergeMode: '',
    statusKind: '',
    lastFocused: null
  }

  const view = {
    ready: false,
    renderer: null,
    scene: null,
    camera: null,
    mesh: null,
    geometry: null,
    material: null,
    raycaster: null,
    pointer: null,
    target: null,
    radius: 80,
    theta: 0.85,
    phi: 1.02,
    needsRender: true,
    faceCount: 0,
    faceUnits: null,
    faceBlockIds: null,
    faceColors: null,
    faceShades: null,
    job: null,
    dragging: null,
    unitColorCache: []
  }

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */

  const $ = id => document.getElementById(id)
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
  const nextFrame = () => new Promise(resolve => setTimeout(resolve, 16))
  const number = value => Number(value).toLocaleString('en-US')

  function safeName(text, fallback) {
    const cleaned = String(text || '')
      .trim()
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[^\w\-.]+/g, '_')
      .replace(/^[_.-]+|[_.-]+$/g, '')
      .slice(0, 48)
    return cleaned || fallback
  }

  function sourceBaseName(name) {
    return safeName(name, 'bloxd-units')
  }

  function setStatus(message, kind) {
    state.statusKind = kind || ''
    if (!ui.status) return
    ui.status.textContent = message
    ui.status.className = 'ss-status' + (kind ? ' is-' + kind : '')
  }

  function setProgress(ratio, label) {
    if (!ui.progress) return
    const active = ratio !== null
    ui.progress.classList.toggle('is-hidden', !active)
    if (!active) return
    ui.progressBar.style.width = Math.round(clamp(ratio, 0, 1) * 100) + '%'
    if (label) ui.progressLabel.textContent = label
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  function unitColorAt(index) {
    if (!view.unitColorCache[index]) view.unitColorCache[index] = Splitter.unitColor(index)
    return view.unitColorCache[index]
  }

  function blockColorAt(id) {
    if (global.BloxdBlockColors) {
      const hex = global.BloxdBlockColors.hex(id)
      return {
        r: ((hex >> 16) & 255) / 255,
        g: ((hex >> 8) & 255) / 255,
        b: (hex & 255) / 255
      }
    }
    const hash = (id * 2654435761) >>> 0
    return {
      r: 60 / 255 + ((hash >> 16) & 127) / 255,
      g: 60 / 255 + ((hash >> 8) & 127) / 255,
      b: 60 / 255 + (hash & 127) / 255
    }
  }

  /* ------------------------------------------------------------------ *
   * 3D preview
   * ------------------------------------------------------------------ */

  function initViewer() {
    if (view.ready) return
    if (!THREE) {
      setStatus('Three.js failed to load, so the 3D preview is unavailable. Detection and export still work.', 'error')
      return
    }
    view.renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true })
    view.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2))
    view.renderer.setClearColor(0x0a0f0c, 1)
    view.scene = new THREE.Scene()
    view.camera = new THREE.PerspectiveCamera(52, 1, 0.5, 400000)
    view.target = new THREE.Vector3(0, 0, 0)
    view.raycaster = new THREE.Raycaster()
    view.pointer = new THREE.Vector2()
    view.ready = true

    ui.canvas.addEventListener('contextmenu', event => event.preventDefault())
    ui.canvas.addEventListener('pointerdown', onPointerDown)
    ui.canvas.addEventListener('pointermove', onPointerMove)
    ui.canvas.addEventListener('pointerup', onPointerUp)
    ui.canvas.addEventListener('pointercancel', () => { view.dragging = null })
    ui.canvas.addEventListener('wheel', onWheel, { passive: false })
    global.addEventListener('resize', () => {
      if (state.open) {
        resizeViewer()
        view.needsRender = true
      }
    })
    updateCamera()
    requestAnimationFrame(renderLoop)
  }

  function resizeViewer() {
    if (!view.ready) return
    const width = ui.canvas.clientWidth || ui.canvas.parentElement.clientWidth
    const height = ui.canvas.clientHeight || ui.canvas.parentElement.clientHeight
    if (!width || !height) return
    view.renderer.setSize(width, height, false)
    view.camera.aspect = width / height
    view.camera.updateProjectionMatrix()
  }

  function renderLoop() {
    requestAnimationFrame(renderLoop)
    if (!state.open || !view.ready) return
    if (!view.needsRender) return
    view.needsRender = false
    view.renderer.render(view.scene, view.camera)
  }

  function updateCamera() {
    if (!view.ready) return
    const sinPhi = Math.sin(view.phi)
    view.camera.position.set(
      view.target.x + view.radius * sinPhi * Math.cos(view.theta),
      view.target.y + view.radius * Math.cos(view.phi),
      view.target.z + view.radius * sinPhi * Math.sin(view.theta)
    )
    view.camera.lookAt(view.target)
    view.needsRender = true
  }

  function onPointerDown(event) {
    if (event.button !== 0 && event.button !== 1 && event.button !== 2) return
    ui.canvas.setPointerCapture(event.pointerId)
    view.dragging = {
      mode: event.button === 2 || event.button === 1 || event.shiftKey ? 'pan' : 'orbit',
      x: event.clientX,
      y: event.clientY,
      moved: 0
    }
  }

  function onPointerMove(event) {
    const drag = view.dragging
    if (!drag) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    drag.x = event.clientX
    drag.y = event.clientY
    drag.moved += Math.abs(dx) + Math.abs(dy)
    if (drag.mode === 'orbit') {
      view.theta += dx * 0.0075
      view.phi = clamp(view.phi + dy * 0.0075, 0.08, Math.PI - 0.08)
    } else {
      const right = new THREE.Vector3().setFromMatrixColumn(view.camera.matrix, 0)
      const up = new THREE.Vector3().setFromMatrixColumn(view.camera.matrix, 1)
      const scale = view.radius * 0.0016
      view.target.addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale)
    }
    updateCamera()
  }

  function onPointerUp(event) {
    const drag = view.dragging
    view.dragging = null
    if (!drag || drag.mode !== 'orbit' || drag.moved >= 5) return
    pickUnit(event.clientX, event.clientY)
  }

  function onWheel(event) {
    event.preventDefault()
    view.radius = clamp(view.radius * Math.exp(event.deltaY * 0.0012), 2, 100000)
    updateCamera()
  }

  function fitView(extent) {
    if (!view.ready) return
    const box = extent || { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 }
    const sizeX = box.maxX - box.minX + 1
    const sizeY = box.maxY - box.minY + 1
    const sizeZ = box.maxZ - box.minZ + 1
    view.target.set(box.minX + sizeX / 2, box.minY + sizeY / 2, box.minZ + sizeZ / 2)
    const diagonal = Math.sqrt(sizeX * sizeX + sizeY * sizeY + sizeZ * sizeZ)
    view.radius = Math.max(8, diagonal * 1.15)
    view.theta = 0.85
    view.phi = 1.05
    updateCamera()
  }

  function disposeMesh() {
    if (view.mesh) {
      view.scene.remove(view.mesh)
      view.mesh.geometry.dispose()
      view.mesh.material.dispose()
      view.mesh = null
    }
    view.geometry = null
    view.material = null
    view.faceUnits = null
    view.faceBlockIds = null
    view.faceColors = null
    view.faceShades = null
    view.faceCount = 0
    view.job = null
  }

  function createJob(voxels, units) {
    const total = voxels.size
    const capacity = Math.max(1024, Math.min(total * 2 + 1024, 120000))
    const unitOfKey = new Map()
    units.forEach((unit, index) => {
      for (const key of unit.keys) unitOfKey.set(key, index)
    })
    return {
      voxels,
      unitOfKey,
      iterator: voxels.blocks.entries(),
      total,
      processed: 0,
      capacity,
      faceCount: 0,
      positions: new Float32Array(capacity * 12),
      indices: new Uint32Array(capacity * 6),
      faceUnits: new Int32Array(capacity),
      faceBlockIds: new Uint16Array(capacity),
      faceColors: new Float32Array(capacity * 3),
      faceShades: new Uint8Array(capacity)
    }
  }

  function growJob(job) {
    const capacity = job.capacity * 2
    const grow = (array, length) => {
      const next = new array.constructor(length)
      next.set(array)
      return next
    }
    job.positions = grow(job.positions, capacity * 12)
    job.indices = grow(job.indices, capacity * 6)
    job.faceUnits = grow(job.faceUnits, capacity)
    job.faceBlockIds = grow(job.faceBlockIds, capacity)
    job.faceColors = grow(job.faceColors, capacity * 3)
    job.faceShades = grow(job.faceShades, capacity)
    job.capacity = capacity
  }

  /** Append one quad (4 vertices / 2 triangles) for a visible block face. */
  function pushFace(job, x, y, z, direction, blockKey, blockId) {
    if (job.faceCount >= job.capacity) growJob(job)
    const face = job.faceCount
    const positions = job.positions
    let offset = face * 12
    let shade = 1
    switch (direction) {
      case 'px':
        positions[offset++] = x + 1; positions[offset++] = y; positions[offset++] = z + 1
        positions[offset++] = x + 1; positions[offset++] = y; positions[offset++] = z
        positions[offset++] = x + 1; positions[offset++] = y + 1; positions[offset++] = z
        positions[offset++] = x + 1; positions[offset++] = y + 1; positions[offset++] = z + 1
        shade = FACE_SHADE.sideX
        break
      case 'nx':
        positions[offset++] = x; positions[offset++] = y; positions[offset++] = z
        positions[offset++] = x; positions[offset++] = y; positions[offset++] = z + 1
        positions[offset++] = x; positions[offset++] = y + 1; positions[offset++] = z + 1
        positions[offset++] = x; positions[offset++] = y + 1; positions[offset++] = z
        shade = FACE_SHADE.sideX
        break
      case 'py':
        positions[offset++] = x; positions[offset++] = y + 1; positions[offset++] = z + 1
        positions[offset++] = x + 1; positions[offset++] = y + 1; positions[offset++] = z + 1
        positions[offset++] = x + 1; positions[offset++] = y + 1; positions[offset++] = z
        positions[offset++] = x; positions[offset++] = y + 1; positions[offset++] = z
        shade = FACE_SHADE.top
        break
      case 'ny':
        positions[offset++] = x; positions[offset++] = y; positions[offset++] = z
        positions[offset++] = x + 1; positions[offset++] = y; positions[offset++] = z
        positions[offset++] = x + 1; positions[offset++] = y; positions[offset++] = z + 1
        positions[offset++] = x; positions[offset++] = y; positions[offset++] = z + 1
        shade = FACE_SHADE.bottom
        break
      case 'pz':
        positions[offset++] = x; positions[offset++] = y; positions[offset++] = z + 1
        positions[offset++] = x + 1; positions[offset++] = y; positions[offset++] = z + 1
        positions[offset++] = x + 1; positions[offset++] = y + 1; positions[offset++] = z + 1
        positions[offset++] = x; positions[offset++] = y + 1; positions[offset++] = z + 1
        shade = FACE_SHADE.sideZ
        break
      default:
        positions[offset++] = x; positions[offset++] = y; positions[offset++] = z
        positions[offset++] = x; positions[offset++] = y + 1; positions[offset++] = z
        positions[offset++] = x + 1; positions[offset++] = y + 1; positions[offset++] = z
        positions[offset++] = x + 1; positions[offset++] = y; positions[offset++] = z
        shade = FACE_SHADE.sideZ
        break
    }
    const indexOffset = face * 6
    const base = face * 4
    job.indices[indexOffset] = base
    job.indices[indexOffset + 1] = base + 1
    job.indices[indexOffset + 2] = base + 2
    job.indices[indexOffset + 3] = base
    job.indices[indexOffset + 4] = base + 2
    job.indices[indexOffset + 5] = base + 3
    job.faceUnits[face] = job.unitOfKey.get(blockKey) || 0
    job.faceBlockIds[face] = blockId
    job.faceShades[face] = Math.round(shade * 255)
    job.faceCount++
  }

  function processJob(budgetMs) {
    const job = view.job
    if (!job) return
    const voxels = job.voxels
    const sx = voxels.sx
    const sy = voxels.sy
    const sz = voxels.sz
    const plane = voxels.plane
    const blocks = voxels.blocks
    const started = performance.now()
    for (;;) {
      const next = job.iterator.next()
      if (next.done) {
        finishJob()
        return
      }
      const key = next.value[0]
      const id = next.value[1]
      const z = Math.floor(key / plane)
      const rest = key - z * plane
      const y = Math.floor(rest / sx)
      const x = rest - y * sx
      if (x > 0 && !blocks.has(key - 1)) pushFace(job, x, y, z, 'nx', key, id)
      if (x < sx - 1 && !blocks.has(key + 1)) pushFace(job, x, y, z, 'px', key, id)
      if (y > 0 && !blocks.has(key - sx)) pushFace(job, x, y, z, 'ny', key, id)
      if (y < sy - 1 && !blocks.has(key + sx)) pushFace(job, x, y, z, 'py', key, id)
      if (z > 0 && !blocks.has(key - plane)) pushFace(job, x, y, z, 'nz', key, id)
      if (z < sz - 1 && !blocks.has(key + plane)) pushFace(job, x, y, z, 'pz', key, id)
      job.processed++
      if ((job.processed & 2047) === 0 && performance.now() - started > budgetMs) {
        const ratio = job.total ? job.processed / job.total : 1
        setProgress(ratio, `Building preview… ${Math.round(ratio * 100)}%`)
        requestAnimationFrame(() => processJob(budgetMs))
        return
      }
    }
  }

  function finishJob() {
    const job = view.job
    if (!job) return
    view.job = null
    const faceCount = job.faceCount
    job.unitOfKey = null
    if (!faceCount) {
      setProgress(null)
      setStatus('The schematic contains no visible faces.', 'error')
      return
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(job.positions.subarray(0, faceCount * 12), 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(faceCount * 12), 3))
    geometry.setIndex(new THREE.BufferAttribute(job.indices.subarray(0, faceCount * 6), 1))
    geometry.computeBoundingSphere()
    const material = new THREE.MeshBasicMaterial({ vertexColors: true })
    view.mesh = new THREE.Mesh(geometry, material)
    view.scene.add(view.mesh)
    view.geometry = geometry
    view.material = material
    view.faceCount = faceCount
    view.faceUnits = job.faceUnits.subarray(0, faceCount)
    view.faceBlockIds = job.faceBlockIds.subarray(0, faceCount)
    view.faceColors = job.faceColors.subarray(0, faceCount * 3)
    view.faceShades = job.faceShades.subarray(0, faceCount)
    buildFaceColors()
    applyVertexColors()
    setProgress(null)
    view.needsRender = true
    const unitCount = state.units ? state.units.length : 0
    if (state.statusKind !== 'error') {
      setStatus(`Preview ready · ${number(unitCount)} unit${unitCount === 1 ? '' : 's'} · ${number(job.total)} blocks · ${number(faceCount)} visible faces.`, 'ok')
    }
  }

  function buildFaceColors() {
    const faceCount = view.faceCount
    if (!faceCount) return
    const colors = view.faceColors
    if (state.colorMode === 'blocks') {
      const cache = new Map()
      for (let face = 0; face < faceCount; face++) {
        const id = view.faceBlockIds[face]
        let color = cache.get(id)
        if (!color) {
          color = blockColorAt(id)
          cache.set(id, color)
        }
        colors[face * 3] = color.r
        colors[face * 3 + 1] = color.g
        colors[face * 3 + 2] = color.b
      }
      return
    }
    for (let face = 0; face < faceCount; face++) {
      const color = unitColorAt(view.faceUnits[face])
      colors[face * 3] = color.r
      colors[face * 3 + 1] = color.g
      colors[face * 3 + 2] = color.b
    }
  }

  function applyVertexColors() {
    if (!view.geometry) return
    const faceCount = view.faceCount
    const attribute = view.geometry.getAttribute('color')
    const target = attribute.array
    const colors = view.faceColors
    const shades = view.faceShades
    const selected = selectedUnit()
    const selectedIndex = selected && state.units ? state.units.indexOf(selected) : -1
    for (let face = 0; face < faceCount; face++) {
      const shade = shades[face] / 255
      const dim = selectedIndex >= 0 && view.faceUnits[face] !== selectedIndex ? 0.14 : 1
      const r = colors[face * 3] * shade * dim
      const g = colors[face * 3 + 1] * shade * dim
      const b = colors[face * 3 + 2] * shade * dim
      const offset = face * 12
      for (let vertex = 0; vertex < 4; vertex++) {
        target[offset + vertex * 3] = r
        target[offset + vertex * 3 + 1] = g
        target[offset + vertex * 3 + 2] = b
      }
    }
    attribute.needsUpdate = true
    view.needsRender = true
  }

  function rebuildPreview() {
    if (!state.work || !state.units) return
    disposeMesh()
    if (!THREE) return
    initViewer()
    if (!view.ready) return
    view.unitColorCache = []
    view.job = createJob(state.work, state.units)
    fitView(state.work.extent)
    resizeViewer()
    setProgress(0, 'Building preview… 0%')
    requestAnimationFrame(() => processJob(12))
  }

  function pickUnit(clientX, clientY) {
    if (!view.ready || !view.mesh || !state.units || !state.units.length) return
    const rect = ui.canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    view.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    )
    view.raycaster.setFromCamera(view.pointer, view.camera)
    const hits = view.raycaster.intersectObject(view.mesh, false)
    if (!hits.length || hits[0].faceIndex == null) return
    const unitIndex = view.faceUnits[hits[0].faceIndex >> 1]
    const unit = state.units[unitIndex]
    if (!unit) return
    selectUnit(unit.id === state.selectedId ? null : unit.id)
  }

  /* ------------------------------------------------------------------ *
   * Splitter workflow
   * ------------------------------------------------------------------ */

  function selectedUnit() {
    if (!state.units || state.selectedId == null) return null
    return state.units.find(unit => unit.id === state.selectedId) || null
  }

  function selectUnit(id, options) {
    state.selectedId = id
    applyVertexColors()
    if (!ui.unitList) return
    ui.unitList.querySelectorAll('[data-unit-id]').forEach(row => {
      row.classList.toggle('is-selected', Number(row.dataset.unitId) === id)
    })
    const row = ui.unitList.querySelector(`[data-unit-id="${id}"]`)
    if (row && !(options && options.silent) && row.scrollIntoView) {
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }

  function updateFileInfo() {
    if (!ui.fileInfo) return
    if (!state.original) {
      ui.fileInfo.innerHTML = 'Nothing loaded yet. Import one or more <code>.bloxdschem</code> files.'
      return
    }
    const extent = state.original.extent
    const sizeX = extent.maxX + 1
    const sizeY = extent.maxY + 1
    const sizeZ = extent.maxZ + 1
    const parts = []
    parts.push(`<strong>${escapeHtml(state.name || 'Schematic')}</strong>`)
    parts.push(`<span>${number(state.original.size)} blocks · ${sizeX}×${sizeY}×${sizeZ}</span>`)
    if (state.files.length > 1) {
      const modeLabel = state.mergeMode === 'filename' ? 'placed by world offsets from file names' : 'packed side by side along X'
      parts.push(`<span>${state.files.length} files merged · ${modeLabel}</span>`)
    }
    if (state.work) {
      const removed = state.removedPlatforms ? `${number(state.removedPlatforms)} platform blocks removed` : 'platforms kept'
      const merged = state.mergedFragments ? ` · ${number(state.mergedFragments)} fragments merged` : ''
      parts.push(`<span class="ss-file__note">${removed}${merged}</span>`)
    }
    if (state.units) {
      parts.push(`<span class="ss-file__note">${number(state.units.length)} unit${state.units.length === 1 ? '' : 's'} ready to export</span>`)
    }
    ui.fileInfo.innerHTML = parts.join('')
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[character]))
  }

  function exportPrefix() {
    return safeName(ui.prefix.value, 'unit')
  }

  function exportStart() {
    return Math.max(0, Math.floor(Number(ui.start.value) || 0))
  }

  function exportZipName() {
    return safeName(ui.zipName.value, 'bloxd-units')
  }

  function exportNameFor(index) {
    const units = state.units || []
    const start = exportStart()
    const last = start + Math.max(0, units.length - 1)
    const pad = Math.max(3, String(last).length)
    return exportPrefix() + String(start + index).padStart(pad, '0')
  }

  function smallThreshold() {
    const value = Math.floor(Number(ui.smallThreshold.value) || 100)
    return clamp(value, 1, 1000000)
  }

  function updateButtons() {
    const hasVoxels = Boolean(state.original)
    const hasUnits = Boolean(state.units && state.units.length)
    if (ui.detect) ui.detect.disabled = state.busy || !hasVoxels
    if (ui.redetect) ui.redetect.disabled = state.busy || !hasVoxels
    if (ui.download) ui.download.disabled = state.busy || !hasUnits
    if (ui.downloadSide) ui.downloadSide.disabled = state.busy || !hasUnits
    if (ui.fit) ui.fit.disabled = !hasVoxels || state.busy
    if (ui.clear) ui.clear.disabled = state.busy
    if (ui.importButton) ui.importButton.disabled = state.busy
    if (ui.emptyImport) ui.emptyImport.disabled = state.busy
  }

  function setBusy(busy, label) {
    state.busy = busy
    document.body.classList.toggle('is-splitter-busy', busy)
    if (busy && label) setStatus(label, 'busy')
    updateButtons()
  }

  async function importFiles(fileList) {
    const inputs = Array.from(fileList || [])
    if (!inputs.length) return
    if (state.busy) return
    setBusy(true, 'Reading schematic…')
    setProgress(0.05, 'Reading files…')
    await nextFrame()
    const sources = []
    const errors = []
    for (const file of inputs) {
      try {
        if (file.size === 0) throw new Error('the file is empty')
        const buffer = await file.arrayBuffer()
        const schematic = Splitter.parseSchematic(buffer)
        if (!schematic.voxels.size) throw new Error('it contains no blocks')
        sources.push({ schematic, filename: file.name })
      } catch (error) {
        errors.push(`${file.name}: ${error.message}`)
      }
      await nextFrame()
    }
    if (!sources.length) {
      setProgress(null)
      setBusy(false)
      setStatus(errors.join(' · ') || 'No readable .bloxdschem files were selected.', 'error')
      return
    }
    const merged = Splitter.mergeSources(sources)
    state.files = sources.map(source => source.filename)
    state.name = sources.length === 1
      ? (sources[0].schematic.name || sourceBaseName(sources[0].filename))
      : `${sourceBaseName(sources[0].filename)} +${sources.length - 1}`
    state.original = merged.voxels
    state.work = null
    state.units = null
    state.selectedId = null
    state.removedPlatforms = 0
    state.mergedFragments = 0
    state.mergeMode = merged.mode
    state.sourceBlocks = merged.voxels.size
    ui.empty.classList.add('is-hidden')
    ui.prefix.value = sourceBaseName(sources[0].filename) === 'bloxd-units' ? 'unit' : sourceBaseName(sources[0].filename)
    ui.zipName.value = sourceBaseName(sources[0].filename) === 'bloxd-units' ? 'bloxd-units' : sourceBaseName(sources[0].filename) + '-units'
    updateFileInfo()
    setProgress(null)
    if (errors.length) {
      setStatus(`Loaded ${sources.length} file(s). Skipped: ${errors.join(' · ')}`, 'error')
    } else {
      setStatus(`Loaded ${sources.length} file(s) · ${number(merged.voxels.size)} blocks.`, 'ok')
    }
    setBusy(false)
    await detectUnits({ automatic: true })
  }

  async function detectUnits(options) {
    if (!state.original || state.busy) return
    const settings = options || {}
    setBusy(true, 'Detecting separate units…')
    setProgress(0.1, 'Detecting…')
    await nextFrame()
    try {
      const work = state.original.clone()
      let removed = 0
      if (ui.removePlatforms.checked) {
        removed = Splitter.removePlatforms(work)
        setProgress(0.35, 'Removing platforms…')
        await nextFrame()
      }
      const units = Splitter.detectUnits(work, { mode: ui.mode.value })
      setProgress(0.6, 'Merging fragments…')
      await nextFrame()
      let merged = 0
      if (ui.mergeSmall.checked) {
        merged = Splitter.mergeSmallUnits(units, { threshold: smallThreshold() })
      }
      units.forEach(unit => {
        unit.id = state.nextUnitId++
      })
      state.work = work
      state.units = units
      state.removedPlatforms = removed
      state.mergedFragments = merged
      state.selectedId = null
      updateUnitCount()
      renderUnitList()
      updateFileInfo()
      const oversized = units.filter(unit => Splitter.unitChunkCount(unit) > 160).length
      if (!units.length) {
        setStatus('No units found. Try the other detection mode or disable platform removal.', 'error')
      } else if (oversized) {
        setStatus(`${number(units.length)} unit(s) detected, but ${oversized} exceed Bloxd's 160-chunk limit. Use stricter detection or merge/split them manually.`, 'error')
      } else {
        setStatus(`${number(units.length)} unit(s) detected${removed ? ` · ${number(removed)} platform blocks removed` : ''}${merged ? ` · ${number(merged)} fragments merged` : ''}.`, 'ok')
      }
      rebuildPreview()
    } catch (error) {
      console.error(error)
      setStatus(`Detection failed: ${error.message}`, 'error')
    } finally {
      setProgress(null)
      setBusy(false)
    }
  }

  function updateUnitCount() {
    if (!ui.unitCount) return
    const count = state.units ? state.units.length : 0
    ui.unitCount.textContent = count ? `${number(count)} unit${count === 1 ? '' : 's'}` : '—'
  }

  function renderUnitList() {
    if (!ui.unitList) return
    const units = state.units || []
    ui.unitList.replaceChildren()
    if (!units.length) {
      const note = document.createElement('p')
      note.className = 'ss-note'
      note.textContent = state.original
        ? 'Press Detect & split to separate the objects in this schematic.'
        : 'Import a schematic, then run detection.'
      ui.unitList.append(note)
      updateUnitCount()
      return
    }
    const fragment = document.createDocumentFragment()
    const threshold = smallThreshold()
    const limit = Math.min(units.length, MAX_LISTED_UNITS)
    const suggestMerges = units.length <= 400
    for (let index = 0; index < limit; index++) {
      const unit = units[index]
      const size = Splitter.unitSize(unit)
      const chunks = Splitter.unitChunkCount(unit)
      const color = unitColorAt(index)
      const row = document.createElement('div')
      row.className = 'ss-unit' + (unit.id === state.selectedId ? ' is-selected' : '')
      row.dataset.unitId = String(unit.id)
      row.title = 'Click to highlight this unit'
      const label = exportNameFor(index)
      const mergeTarget = suggestMerges && unit.count < threshold
        ? Splitter.findParentUnit(units, index, threshold)
        : -1
      row.innerHTML =
        `<span class="ss-unit__swatch" style="background:${color.hex}"></span>` +
        `<div class="ss-unit__text"><strong>${escapeHtml(label)}</strong>` +
        `<small>${number(unit.count)} blocks · ${size.x}×${size.y}×${size.z}` +
        (chunks > 160 ? ` · <b class="ss-warn">${number(chunks)} chunks</b>` : '') +
        `</small></div>` +
        `<div class="ss-unit__actions">` +
        `<button type="button" data-action="download" title="Download this unit as .bloxdschem">⬇</button>` +
        (mergeTarget >= 0
          ? `<button type="button" data-action="merge" title="Merge into ${escapeHtml(exportNameFor(mergeTarget))}">🔗</button>`
          : '') +
        `<button type="button" data-action="remove" title="Hide this unit from the export">×</button>` +
        `</div>`
      fragment.append(row)
    }
    if (units.length > limit) {
      const note = document.createElement('p')
      note.className = 'ss-note'
      note.textContent = `Showing the first ${limit} of ${number(units.length)} units. The ZIP still contains every unit.`
      fragment.append(note)
    }
    ui.unitList.append(fragment)
    updateUnitCount()
  }

  function findUnitById(id) {
    return (state.units || []).find(unit => unit.id === id) || null
  }

  async function downloadUnit(unit) {
    if (!unit || !state.units) return
    const index = state.units.indexOf(unit)
    if (index < 0) return
    const name = exportNameFor(index)
    try {
      setBusy(true, `Encoding ${name}…`)
      await nextFrame()
      const bytes = Splitter.encodeUnit(unit, name)
      downloadBlob(new Blob([bytes], { type: 'application/octet-stream' }), `${name}.bloxdschem`)
      setStatus(`Downloaded ${name}.bloxdschem · ${number(unit.count)} blocks.`, 'ok')
    } catch (error) {
      console.error(error)
      setStatus(`Could not encode ${name}: ${error.message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function downloadAll() {
    if (!state.units || !state.units.length || state.busy) return
    const units = state.units.slice()
    setBusy(true, 'Encoding units…')
    const files = []
    try {
      for (let index = 0; index < units.length; index++) {
        const name = exportNameFor(index)
        setProgress((index + 1) / (units.length + 1), `Encoding ${index + 1} / ${units.length}…`)
        if (index % 4 === 0) await nextFrame()
        files.push({ name: `${name}.bloxdschem`, data: Splitter.encodeUnit(units[index], name) })
      }
      const manifest = {
        schematics: units.map((unit, index) => {
          const name = exportNameFor(index)
          return { file: `${name}.bloxdschem`, name, type: 'auto', biome: 'classic' }
        })
      }
      files.push({
        name: 'manifest.json',
        data: new TextEncoder().encode(JSON.stringify(manifest, null, 2))
      })
      setProgress(0.98, 'Building ZIP…')
      await nextFrame()
      const zip = Splitter.createZip(files)
      downloadBlob(new Blob([zip], { type: 'application/zip' }), `${exportZipName()}.zip`)
      setStatus(`Downloaded ${units.length} unit(s) plus manifest.json (${(zip.length / 1024).toFixed(1)} KB).`, 'ok')
    } catch (error) {
      console.error(error)
      setStatus(`ZIP export failed: ${error.message}`, 'error')
    } finally {
      setProgress(null)
      setBusy(false)
    }
  }

  function mergeUnit(unit) {
    if (!state.units) return
    const index = state.units.indexOf(unit)
    if (index < 0) return
    const parentIndex = Splitter.findParentUnit(state.units, index, smallThreshold())
    if (parentIndex < 0) {
      setStatus('No overlapping unit to merge into.', 'error')
      return
    }
    const parent = state.units[parentIndex]
    const parentName = exportNameFor(parentIndex)
    Splitter.mergeUnits(state.units, index, parentIndex)
    state.selectedId = parent.id
    renderUnitList()
    updateFileInfo()
    rebuildPreview()
    setStatus(`Merged into ${parentName} · ${number(parent.count)} blocks.`, 'ok')
  }

  function removeUnit(unit) {
    if (!state.units) return
    const index = state.units.indexOf(unit)
    if (index < 0) return
    const name = exportNameFor(index)
    state.units.splice(index, 1)
    if (state.selectedId === unit.id) state.selectedId = null
    renderUnitList()
    updateFileInfo()
    rebuildPreview()
    setStatus(`Removed ${name} from this export. Re-detect to bring it back.`, 'ok')
  }

  function clearAll() {
    if (state.busy) return
    disposeMesh()
    state.name = ''
    state.files = []
    state.original = null
    state.work = null
    state.units = null
    state.selectedId = null
    state.removedPlatforms = 0
    state.mergedFragments = 0
    state.mergeMode = ''
    state.sourceBlocks = 0
    view.unitColorCache = []
    if (ui.empty) ui.empty.classList.remove('is-hidden')
    if (ui.drop) ui.drop.classList.remove('is-active')
    setProgress(null)
    updateFileInfo()
    renderUnitList()
    updateButtons()
    setStatus('No schematic loaded.')
    if (view.ready) {
      view.target.set(0, 0, 0)
      view.radius = 80
      updateCamera()
      view.needsRender = true
    }
  }

  /* ------------------------------------------------------------------ *
   * Open / close + wiring
   * ------------------------------------------------------------------ */

  function openSplitter() {
    if (!ui.root) return
    state.lastFocused = document.activeElement
    state.open = true
    ui.root.classList.remove('is-hidden')
    ui.root.setAttribute('aria-hidden', 'false')
    document.body.classList.add('is-splitter-open')
    initViewer()
    resizeViewer()
    if (state.work) fitView(state.work.extent)
    view.needsRender = true
    if (ui.root.focus) ui.root.focus({ preventScroll: true })
    if (!state.original) setStatus('Import a .bloxdschem file to begin.')
  }

  function closeSplitter() {
    if (!ui.root || !state.open) return
    state.open = false
    ui.root.classList.add('is-hidden')
    ui.root.setAttribute('aria-hidden', 'true')
    document.body.classList.remove('is-splitter-open')
    if (state.lastFocused && state.lastFocused.focus) state.lastFocused.focus({ preventScroll: true })
  }

  function handleKeydown(event) {
    if (!state.open) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopImmediatePropagation()
      closeSplitter()
      return
    }
    if ((event.key === 'f' || event.key === 'F') && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (state.work) fitView(state.work.extent)
        return
      }
    }
    event.stopImmediatePropagation()
  }

  function wireEvents() {
    ui.importButton.addEventListener('click', () => ui.fileInput.click())
    ui.emptyImport.addEventListener('click', () => ui.fileInput.click())
    ui.fileInput.addEventListener('change', event => {
      const files = Array.from(event.target.files || [])
      event.target.value = ''
      importFiles(files)
    })
    ui.detect.addEventListener('click', () => detectUnits())
    ui.redetect.addEventListener('click', () => detectUnits())
    ui.download.addEventListener('click', downloadAll)
    ui.downloadSide.addEventListener('click', downloadAll)
    ui.fit.addEventListener('click', () => state.work && fitView(state.work.extent))
    ui.close.addEventListener('click', closeSplitter)
    ui.clear.addEventListener('click', clearAll)
    ui.openButton.addEventListener('click', openSplitter)
    ui.mode.addEventListener('change', () => {
      if (state.original && !state.busy) detectUnits({ automatic: true })
    })
    ui.removePlatforms.addEventListener('change', () => {
      if (state.original && !state.busy) detectUnits({ automatic: true })
    })
    ui.mergeSmall.addEventListener('change', () => {
      if (state.original && !state.busy) detectUnits({ automatic: true })
    })
    ui.smallThreshold.addEventListener('change', () => {
      ui.smallThreshold.value = smallThreshold()
      if (state.original && !state.busy) detectUnits({ automatic: true })
    })
    ui.colorMode.addEventListener('change', () => {
      state.colorMode = ui.colorMode.value
      buildFaceColors()
      applyVertexColors()
    })
    ui.prefix.addEventListener('input', renderUnitList)
    ui.start.addEventListener('input', renderUnitList)

    ui.unitList.addEventListener('click', event => {
      const row = event.target.closest('[data-unit-id]')
      if (!row) return
      const unit = findUnitById(Number(row.dataset.unitId))
      if (!unit) return
      const action = event.target.closest('[data-action]')
      if (!action) {
        selectUnit(unit.id === state.selectedId ? null : unit.id)
        return
      }
      event.stopPropagation()
      const kind = action.dataset.action
      if (kind === 'select') selectUnit(unit.id === state.selectedId ? null : unit.id)
      else if (kind === 'download') downloadUnit(unit)
      else if (kind === 'merge') mergeUnit(unit)
      else if (kind === 'remove') removeUnit(unit)
    })

    // Drag & drop anywhere inside the splitter workspace.
    let dragDepth = 0
    ui.root.addEventListener('dragenter', event => {
      if (!event.dataTransfer || !Array.from(event.dataTransfer.types || []).includes('Files')) return
      event.preventDefault()
      dragDepth++
      ui.drop.classList.add('is-active')
    })
    ui.root.addEventListener('dragover', event => {
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    })
    ui.root.addEventListener('dragleave', event => {
      event.preventDefault()
      dragDepth = Math.max(0, dragDepth - 1)
      if (!dragDepth) ui.drop.classList.remove('is-active')
    })
    ui.root.addEventListener('drop', event => {
      event.preventDefault()
      dragDepth = 0
      ui.drop.classList.remove('is-active')
      const files = Array.from(event.dataTransfer.files || [])
      if (files.length) importFiles(files)
    })
    document.addEventListener('keydown', handleKeydown, true)
    if (global.BloxdBlockColors && global.BLOXD_NAME_TO_ID) {
      global.BloxdBlockColors.init(global.BLOXD_NAME_TO_ID)
    }
  }

  function cacheElements() {
    ui.root = $('schemSplitter')
    if (!ui.root) return false
    ui.openButton = $('openSchemSplitter')
    ui.close = $('splitterClose')
    ui.clear = $('splitterClear')
    ui.importButton = $('splitterImport')
    ui.emptyImport = $('splitterEmptyImport')
    ui.fileInput = $('splitterFileInput')
    ui.detect = $('splitterDetect')
    ui.redetect = $('splitterRedetect')
    ui.download = $('splitterDownload')
    ui.downloadSide = $('splitterDownloadSide')
    ui.fit = $('splitterFit')
    ui.canvas = $('splitterCanvas')
    ui.empty = $('splitterEmpty')
    ui.drop = $('splitterDrop')
    ui.status = $('splitterStatus')
    ui.progress = $('splitterProgress')
    ui.progressBar = $('splitterProgressBar')
    ui.progressLabel = $('splitterProgressLabel')
    ui.fileInfo = $('splitterFileInfo')
    ui.unitList = $('splitterUnitList')
    ui.unitCount = $('splitterUnitCount')
    ui.mode = $('splitterMode')
    ui.removePlatforms = $('splitterRemovePlatforms')
    ui.mergeSmall = $('splitterMergeSmall')
    ui.smallThreshold = $('splitterSmallThreshold')
    ui.colorMode = $('splitterColorMode')
    ui.prefix = $('splitterPrefix')
    ui.start = $('splitterStart')
    ui.zipName = $('splitterZipName')
    return Boolean(ui.root && ui.canvas && ui.fileInput)
  }

  function init() {
    if (!cacheElements()) return
    wireEvents()
    updateFileInfo()
    renderUnitList()
    updateButtons()
    setStatus('No schematic loaded. Import a .bloxdschem to begin.')
    // Deep link: index.html#splitter opens the workspace directly.
    if (global.location && global.location.hash === '#splitter') {
      setTimeout(openSplitter, 0)
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()

  global.BloxdSchemSplitterUI = { open: openSplitter, close: closeSplitter, detect: detectUnits }
})(typeof window !== 'undefined' ? window : globalThis)
