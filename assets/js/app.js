// ==========================================
  // SCENE SETUP
  // ==========================================

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a0a0a)
  scene.fog = new THREE.Fog(0x0a0a0a, 500, 1000)

  const perspectiveCamera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    10000
  )
  perspectiveCamera.position.set(15, 15, 15)
  perspectiveCamera.lookAt(0, 0, 0)
  const orthographicCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, -10000, 10000)
  orthographicCamera.position.set(0, 0, 25)
  orthographicCamera.lookAt(0, 0, 0)
  let camera = perspectiveCamera

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.shadowMap.enabled = true
  document.body.appendChild(renderer.domElement)

  // Blender-style on-canvas transform gizmo.
  const transformGizmo = new THREE.TransformControls(camera, renderer.domElement)
  transformGizmo.setSize(0.85)
  scene.add(transformGizmo)

  let activeTool = 'select'
  let isTransforming = false

  transformGizmo.addEventListener('dragging-changed', (event) => {
    const wasTransforming = isTransforming
    isTransforming = event.value
    if (event.value && activeTool === 'edit') beginEditDrag()
    if (wasTransforming && !event.value) {
      if (activeTool === 'edit') {
        editDragState = null
        commitHistory(`Edit ${componentMode}`)
      } else {
        commitHistory('Transform shape')
      }
    }
  })

  transformGizmo.addEventListener('objectChange', () => {
    if (activeTool === 'edit') applyEditDrag()
  })

  transformGizmo.addEventListener('change', () => {
    if (!selectedCube) return
    updateUI()
    updateStatus()
    updateMeasurementDimensions()
  })

  // ==========================================
  // LIGHTS
  // ==========================================

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
  scene.add(ambientLight)

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
  directionalLight.position.set(20, 20, 20)
  directionalLight.castShadow = true
  directionalLight.shadow.mapSize.width = 2048
  directionalLight.shadow.mapSize.height = 2048
  scene.add(directionalLight)

  const pointLight = new THREE.PointLight(0x00ff00, 0.3)
  pointLight.position.set(-10, 10, 10)
  scene.add(pointLight)

  // ==========================================
  // GRID & FLOOR
  // ==========================================

  const gridHelper = new THREE.GridHelper(50, 50, 0x333333, 0x111111)
  scene.add(gridHelper)

  const floorGeometry = new THREE.PlaneGeometry(100, 100)
  const floorMaterial = new THREE.ShadowMaterial({ opacity: 0.2 })
  const floor = new THREE.Mesh(floorGeometry, floorMaterial)
  floor.position.y = -5
  floor.receiveShadow = true
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)

  // ==========================================
  // RAYCASTER FOR SELECTION
  // ==========================================

  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()

  // ==========================================
  // SHAPE LIBRARY
  // ==========================================

  function finishGeometry(geometry) {
    if (geometry.computeVertexNormals) geometry.computeVertexNormals()
    if (geometry.center) geometry.center()
    return geometry
  }

  function scaledGeometry(geometry, x = 1, y = 1, z = 1) {
    geometry.scale(x, y, z)
    return finishGeometry(geometry)
  }

  function polygonShape(points) {
    const shape = new THREE.Shape()
    points.forEach(([x, y], index) => {
      if (index === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    })
    shape.closePath()
    return shape
  }

  function radialPoints(count, outerRadius = 1, innerRadius = null, rotation = -Math.PI / 2) {
    const total = innerRadius === null ? count : count * 2
    return Array.from({ length: total }, (_, index) => {
      const radius = innerRadius === null || index % 2 === 0 ? outerRadius : innerRadius
      const angle = rotation + (index / total) * Math.PI * 2
      return [Math.cos(angle) * radius, Math.sin(angle) * radius]
    })
  }

  function flatShape(points) {
    return finishGeometry(new THREE.ShapeGeometry(polygonShape(points), 12))
  }

  function extrudedShape(points, depth = 0.38, bevel = true) {
    return finishGeometry(new THREE.ExtrudeGeometry(polygonShape(points), {
      depth,
      steps: 1,
      bevelEnabled: bevel,
      bevelSegments: bevel ? 2 : 0,
      bevelSize: bevel ? 0.05 : 0,
      bevelThickness: bevel ? 0.05 : 0
    }))
  }

  function heartPoints() {
    const points = []
    for (let index = 0; index < 64; index++) {
      const t = (index / 64) * Math.PI * 2
      const x = 16 * Math.pow(Math.sin(t), 3) / 17
      const y = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17
      points.push([x, y])
    }
    return points
  }

  function gearPoints(teeth, outer = 1, root = 0.72) {
    return radialPoints(teeth, outer, root)
  }

  function latheGeometry(profile, segments = 32) {
    const points = profile.map(([radius, y]) => new THREE.Vector2(radius, y))
    return finishGeometry(new THREE.LatheGeometry(points, segments))
  }

  function tubeFromPoints(points, radius = 0.12, segments = 96, radialSegments = 10, closed = false) {
    const curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', 0.45)
    return finishGeometry(new THREE.TubeGeometry(curve, segments, radius, radialSegments, closed))
  }

  function helixGeometry(turns = 3) {
    const points = []
    for (let index = 0; index <= 80; index++) {
      const t = index / 80
      const angle = t * Math.PI * 2 * turns
      points.push(new THREE.Vector3(Math.cos(angle) * 0.7, (t - 0.5) * 2, Math.sin(angle) * 0.7))
    }
    return tubeFromPoints(points, 0.1, 120, 8)
  }

  function waveGeometry() {
    const points = []
    for (let index = 0; index <= 50; index++) {
      const t = index / 50
      points.push(new THREE.Vector3((t - 0.5) * 2.5, Math.sin(t * Math.PI * 4) * 0.45, 0))
    }
    return tubeFromPoints(points, 0.11, 90, 8)
  }

  function makeDefinition(id, name, category, icon, createGeometry) {
    return { id, name, category, icon, createGeometry }
  }

  const SHAPE_DEFINITIONS = [
    // Basic and flat forms (16)
    makeDefinition('cube', 'Cube', 'Basic', '■', () => new THREE.BoxGeometry(1, 1, 1, 12, 12, 12)),
    makeDefinition('wide-box', 'Wide Box', 'Basic', '▬', () => new THREE.BoxGeometry(1.8, 1, 1, 16, 10, 10)),
    makeDefinition('tall-box', 'Tall Box', 'Basic', '▮', () => new THREE.BoxGeometry(1, 2, 1, 10, 18, 10)),
    makeDefinition('deep-box', 'Deep Box', 'Basic', '▰', () => new THREE.BoxGeometry(1, 1, 2, 10, 10, 18)),
    makeDefinition('slab', 'Slab', 'Basic', '▱', () => new THREE.BoxGeometry(2, 0.3, 1.5, 18, 4, 14)),
    makeDefinition('beam', 'Beam', 'Basic', '━', () => new THREE.BoxGeometry(2.6, 0.28, 0.28, 24, 4, 4)),
    makeDefinition('wall', 'Wall', 'Basic', '▤', () => new THREE.BoxGeometry(2.2, 1.5, 0.2, 20, 14, 3)),
    makeDefinition('plane', 'Square Plane', 'Basic', '□', () => new THREE.PlaneGeometry(1.6, 1.6, 24, 24)),
    makeDefinition('wide-plane', 'Wide Plane', 'Basic', '▭', () => new THREE.PlaneGeometry(2.4, 1.2, 30, 16)),
    makeDefinition('circle', 'Circle', 'Basic', '●', () => new THREE.CircleGeometry(1, 48)),
    makeDefinition('triangle-disc', 'Triangle', 'Basic', '▲', () => new THREE.CircleGeometry(1, 3)),
    makeDefinition('pentagon-disc', 'Pentagon', 'Basic', '⬟', () => new THREE.CircleGeometry(1, 5)),
    makeDefinition('hexagon-disc', 'Hexagon', 'Basic', '⬢', () => new THREE.CircleGeometry(1, 6)),
    makeDefinition('octagon-disc', 'Octagon', 'Basic', '⯃', () => new THREE.CircleGeometry(1, 8)),
    makeDefinition('flat-star', 'Flat Star', 'Basic', '★', () => flatShape(radialPoints(5, 1, 0.43))),
    makeDefinition('flat-cross', 'Flat Cross', 'Basic', '✚', () => flatShape([[-0.35,-1],[0.35,-1],[0.35,-0.35],[1,-0.35],[1,0.35],[0.35,0.35],[0.35,1],[-0.35,1],[-0.35,0.35],[-1,0.35],[-1,-0.35],[-0.35,-0.35]])),

    // Rounded and cylindrical forms (12)
    makeDefinition('sphere', 'Smooth Sphere', 'Round', '●', () => new THREE.SphereGeometry(1, 48, 32)),
    makeDefinition('sphere-medium', 'Medium Sphere', 'Round', '◉', () => new THREE.SphereGeometry(1, 20, 14)),
    makeDefinition('sphere-low', 'Low-poly Sphere', 'Round', '◍', () => new THREE.SphereGeometry(1, 8, 6)),
    makeDefinition('hemisphere', 'Hemisphere', 'Round', '◒', () => new THREE.SphereGeometry(1, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2)),
    makeDefinition('ellipsoid-wide', 'Wide Ellipsoid', 'Round', '⬭', () => scaledGeometry(new THREE.SphereGeometry(1, 36, 24), 1.5, 0.75, 0.85)),
    makeDefinition('ellipsoid-tall', 'Tall Ellipsoid', 'Round', '⬯', () => scaledGeometry(new THREE.SphereGeometry(1, 36, 24), 0.72, 1.5, 0.72)),
    makeDefinition('ellipsoid-deep', 'Deep Ellipsoid', 'Round', '◉', () => scaledGeometry(new THREE.SphereGeometry(1, 36, 24), 0.75, 0.75, 1.55)),
    makeDefinition('cylinder', 'Smooth Cylinder', 'Round', '⬤', () => new THREE.CylinderGeometry(0.8, 0.8, 1.8, 48, 12)),
    makeDefinition('cylinder-16', '16-side Cylinder', 'Round', '⬡', () => new THREE.CylinderGeometry(0.8, 0.8, 1.8, 16, 12)),
    makeDefinition('cylinder-8', 'Octagonal Cylinder', 'Round', '⯃', () => new THREE.CylinderGeometry(0.8, 0.8, 1.8, 8, 12)),
    makeDefinition('cylinder-6', 'Hexagonal Prism', 'Round', '⬢', () => new THREE.CylinderGeometry(0.8, 0.8, 1.8, 6, 12)),
    makeDefinition('cylinder-3', 'Triangular Prism', 'Round', '△', () => new THREE.CylinderGeometry(0.9, 0.9, 1.8, 3, 12)),

    // Cones, pyramids, and frustums (12)
    makeDefinition('cone', 'Smooth Cone', 'Cones', '▲', () => new THREE.ConeGeometry(1, 2, 48, 12)),
    makeDefinition('cone-16', '16-side Cone', 'Cones', '▲', () => new THREE.ConeGeometry(1, 2, 16, 12)),
    makeDefinition('cone-8', 'Octagonal Cone', 'Cones', '▲', () => new THREE.ConeGeometry(1, 2, 8, 12)),
    makeDefinition('cone-6', 'Hexagonal Cone', 'Cones', '▲', () => new THREE.ConeGeometry(1, 2, 6, 12)),
    makeDefinition('cone-5', 'Pentagonal Cone', 'Cones', '▲', () => new THREE.ConeGeometry(1, 2, 5, 12)),
    makeDefinition('pyramid', 'Square Pyramid', 'Cones', '◆', () => new THREE.ConeGeometry(1, 2, 4, 12)),
    makeDefinition('tetra-pyramid', 'Triangular Pyramid', 'Cones', '△', () => new THREE.ConeGeometry(1, 2, 3, 12)),
    makeDefinition('frustum', 'Round Frustum', 'Cones', '▱', () => new THREE.CylinderGeometry(0.62, 1, 1.8, 48, 12)),
    makeDefinition('frustum-8', 'Octagonal Frustum', 'Cones', '▱', () => new THREE.CylinderGeometry(0.62, 1, 1.8, 8, 12)),
    makeDefinition('frustum-4', 'Square Frustum', 'Cones', '▱', () => new THREE.CylinderGeometry(0.62, 1, 1.8, 4, 12)),
    makeDefinition('needle', 'Needle', 'Cones', '⏶', () => new THREE.ConeGeometry(0.45, 2.8, 24, 16)),
    makeDefinition('funnel', 'Open Funnel', 'Cones', '▽', () => new THREE.CylinderGeometry(0.25, 1, 1.6, 36, 1, true)),

    // Polyhedra and crystals (10)
    makeDefinition('tetrahedron', 'Tetrahedron', 'Polyhedra', '△', () => new THREE.TetrahedronGeometry(1)),
    makeDefinition('octahedron', 'Octahedron', 'Polyhedra', '◇', () => new THREE.OctahedronGeometry(1)),
    makeDefinition('icosahedron', 'Icosahedron', 'Polyhedra', '◈', () => new THREE.IcosahedronGeometry(1)),
    makeDefinition('dodecahedron', 'Dodecahedron', 'Polyhedra', '⬟', () => new THREE.DodecahedronGeometry(1)),
    makeDefinition('geodesic-1', 'Geodesic Sphere 1', 'Polyhedra', '◉', () => new THREE.IcosahedronGeometry(1, 1)),
    makeDefinition('geodesic-2', 'Geodesic Sphere 2', 'Polyhedra', '◉', () => new THREE.IcosahedronGeometry(1, 2)),
    makeDefinition('soft-tetra', 'Soft Tetrahedron', 'Polyhedra', '△', () => new THREE.TetrahedronGeometry(1, 2)),
    makeDefinition('soft-octa', 'Soft Octahedron', 'Polyhedra', '◇', () => new THREE.OctahedronGeometry(1, 2)),
    makeDefinition('diamond', 'Diamond', 'Polyhedra', '♦', () => scaledGeometry(new THREE.OctahedronGeometry(1), 0.8, 1.45, 0.8)),
    makeDefinition('crystal', 'Long Crystal', 'Polyhedra', '♢', () => scaledGeometry(new THREE.OctahedronGeometry(1), 0.62, 1.85, 0.62)),

    // Torus, rings, and knots (12)
    makeDefinition('torus', 'Classic Torus', 'Rings', '◯', () => new THREE.TorusGeometry(0.85, 0.28, 16, 64)),
    makeDefinition('torus-thin', 'Thin Torus', 'Rings', '○', () => new THREE.TorusGeometry(0.9, 0.12, 12, 64)),
    makeDefinition('torus-thick', 'Thick Torus', 'Rings', '⭕', () => new THREE.TorusGeometry(0.72, 0.42, 20, 64)),
    makeDefinition('torus-low', 'Low-poly Torus', 'Rings', '⬡', () => new THREE.TorusGeometry(0.85, 0.25, 6, 12)),
    makeDefinition('torus-square', 'Square-tube Torus', 'Rings', '▣', () => new THREE.TorusGeometry(0.85, 0.25, 4, 48)),
    makeDefinition('half-torus', 'Half Torus', 'Rings', '◠', () => new THREE.TorusGeometry(0.85, 0.22, 12, 36, Math.PI)),
    makeDefinition('three-quarter-torus', 'Three-quarter Torus', 'Rings', '◔', () => new THREE.TorusGeometry(0.85, 0.22, 12, 48, Math.PI * 1.5)),
    makeDefinition('flat-ring', 'Flat Ring', 'Rings', '◎', () => new THREE.RingGeometry(0.52, 1, 64)),
    makeDefinition('hex-ring', 'Hexagonal Ring', 'Rings', '⬡', () => new THREE.RingGeometry(0.5, 1, 6)),
    makeDefinition('knot-23', 'Torus Knot 2:3', 'Rings', '⌘', () => new THREE.TorusKnotGeometry(0.72, 0.2, 120, 14, 2, 3)),
    makeDefinition('knot-32', 'Torus Knot 3:2', 'Rings', '⌘', () => new THREE.TorusKnotGeometry(0.72, 0.18, 140, 12, 3, 2)),
    makeDefinition('knot-25', 'Torus Knot 2:5', 'Rings', '⌘', () => new THREE.TorusKnotGeometry(0.72, 0.16, 160, 12, 2, 5)),

    // Extruded symbols (12)
    makeDefinition('star-5', '3D Star 5', 'Extruded', '★', () => extrudedShape(radialPoints(5, 1, 0.43))),
    makeDefinition('star-6', '3D Star 6', 'Extruded', '✶', () => extrudedShape(radialPoints(6, 1, 0.48))),
    makeDefinition('star-8', '3D Star 8', 'Extruded', '✷', () => extrudedShape(radialPoints(8, 1, 0.5))),
    makeDefinition('heart', 'Heart', 'Extruded', '♥', () => extrudedShape(heartPoints(), 0.42)),
    makeDefinition('cross', 'Cross', 'Extruded', '✚', () => extrudedShape([[-0.35,-1],[0.35,-1],[0.35,-0.35],[1,-0.35],[1,0.35],[0.35,0.35],[0.35,1],[-0.35,1],[-0.35,0.35],[-1,0.35],[-1,-0.35],[-0.35,-0.35]])),
    makeDefinition('gear-8', 'Gear 8', 'Extruded', '⚙', () => extrudedShape(gearPoints(8), 0.35, false)),
    makeDefinition('gear-12', 'Gear 12', 'Extruded', '⚙', () => extrudedShape(gearPoints(12, 1, 0.78), 0.35, false)),
    makeDefinition('arrow', 'Arrow', 'Extruded', '➤', () => extrudedShape([[-1,-0.28],[0.2,-0.28],[0.2,-0.65],[1,0],[0.2,0.65],[0.2,0.28],[-1,0.28]])),
    makeDefinition('lightning', 'Lightning', 'Extruded', 'ϟ', () => extrudedShape([[-0.15,1],[-0.75,0.05],[-0.2,0.05],[-0.48,-1],[0.75,0.25],[0.18,0.25],[0.55,1]])),
    makeDefinition('shield', 'Shield', 'Extruded', '⬟', () => extrudedShape([[-0.9,0.85],[0.9,0.85],[0.78,-0.25],[0,-1],[-0.78,-0.25]])),
    makeDefinition('chevron', 'Chevron', 'Extruded', '⌄', () => extrudedShape([[-1,0.65],[-0.65,1],[0,0.35],[0.65,1],[1,0.65],[0,-0.4]])),
    makeDefinition('l-shape', 'L Shape', 'Extruded', '└', () => extrudedShape([[-0.8,-1],[-0.25,-1],[-0.25,0.45],[0.85,0.45],[0.85,1],[-0.8,1]])),

    // Lathed and curved forms (8)
    makeDefinition('vase', 'Vase', 'Sculpted', '♜', () => latheGeometry([[0,-1],[0.55,-0.92],[0.72,-0.35],[0.48,0.2],[0.62,0.72],[0.38,1],[0.25,1.02]])),
    makeDefinition('goblet', 'Goblet', 'Sculpted', '♕', () => latheGeometry([[0,-1],[0.55,-1],[0.58,-0.85],[0.13,-0.72],[0.13,0.15],[0.68,0.42],[0.78,0.95],[0.7,1]])),
    makeDefinition('hourglass', 'Hourglass', 'Sculpted', '⌛', () => latheGeometry([[0,-1],[0.75,-1],[0.7,-0.75],[0.18,0],[0.7,0.75],[0.75,1],[0,1]])),
    makeDefinition('bowl', 'Bowl', 'Sculpted', '◡', () => latheGeometry([[0,-0.65],[0.5,-0.6],[0.85,-0.1],[1,0.55],[0.92,0.62]])),
    makeDefinition('pawn', 'Pawn', 'Sculpted', '♟', () => latheGeometry([[0,-1],[0.65,-1],[0.7,-0.85],[0.42,-0.65],[0.25,0.1],[0.48,0.32],[0.42,0.48],[0.55,0.7],[0.45,0.95],[0,1.05]])),
    makeDefinition('bottle', 'Bottle', 'Sculpted', '♙', () => latheGeometry([[0,-1],[0.55,-1],[0.62,-0.75],[0.6,0.25],[0.48,0.55],[0.22,0.7],[0.22,1],[0,1]])),
    makeDefinition('helix', 'Helix', 'Sculpted', '∿', () => helixGeometry(3)),
    makeDefinition('wave', 'Wave', 'Sculpted', '〰', () => waveGeometry())
  ]

  const SHAPE_BY_ID = new Map(SHAPE_DEFINITIONS.map(definition => [definition.id, definition]))

  // ==========================================
  // MODEL SHAPE CLASS
  // ==========================================

  class ModelShape {
    constructor(
      shapeType = 'cube',
      position = new THREE.Vector3(0, 0, 0),
      importedObject = null,
      importedName = 'Imported Model'
    ) {
      this.isImported = Boolean(importedObject)

      if (this.isImported) {
        this.shapeType = 'imported'
        this.shapeName = importedName
        this.mesh = importedObject
      } else {
        const definition = SHAPE_BY_ID.get(shapeType) || SHAPE_BY_ID.get('cube')
        const geometry = finishGeometry(definition.createGeometry())
        const material = new THREE.MeshStandardMaterial({
          color: Math.random() * 0xffffff,
          metalness: 0.35,
          roughness: 0.62,
          side: THREE.DoubleSide
        })
        this.shapeType = definition.id
        this.shapeName = definition.name
        this.mesh = new THREE.Mesh(geometry, material)
      }

      this.id = THREE.MathUtils.generateUUID()
      this.isGroup = false
      this.locked = false
      this.mesh.userData.shapeStudioRootId = this.id
      this.mesh.position.copy(position)
      this.mesh.traverse((child) => {
        if (!child.isMesh) return
        child.castShadow = true
        child.receiveShadow = true
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        materials.filter(Boolean).forEach((material) => {
          if ('side' in material) material.side = THREE.DoubleSide
        })
      })

      scene.add(this.mesh)
      this.outline = new THREE.BoxHelper(this.mesh, 0x00ff00)
      this.outline.material.depthTest = false
      this.outline.material.transparent = true
      this.outline.material.opacity = 0.9
      this.outline.renderOrder = 999
      this.outline.visible = false
      scene.add(this.outline)
    }

    materials() {
      const materials = []
      const visit = (child) => {
        if (child !== this.mesh && child.userData && child.userData.shapeStudioRootId) return
        if (child.isMesh && child.material) {
          if (Array.isArray(child.material)) materials.push(...child.material)
          else materials.push(child.material)
        }
        child.children.forEach(visit)
      }
      visit(this.mesh)
      return materials.filter(Boolean)
    }

    colorHex() {
      const material = this.materials().find(item => item.color)
      return material ? material.color.getHexString() : 'ffffff'
    }

    setColor(color) {
      this.materials().forEach((material) => {
        if (!material.color) return
        material.color.set(color)
        material.needsUpdate = true
      })
    }

    select() {
      this.updateOutline()
      this.outline.visible = true
    }

    deselect() {
      this.outline.visible = false
    }

    updateOutline() {
      this.outline.setFromObject(this.mesh)
    }

    getState() {
      return {
        position: this.mesh.position.toArray(),
        rotation: [this.mesh.rotation.x, this.mesh.rotation.y, this.mesh.rotation.z],
        scale: this.mesh.scale.toArray(),
        color: this.colorHex(),
        shapeType: this.shapeType
      }
    }

    setState(state) {
      this.mesh.position.fromArray(state.position)
      this.mesh.rotation.order = 'XYZ'
      this.mesh.rotation.x = state.rotation[0]
      this.mesh.rotation.y = state.rotation[1]
      this.mesh.rotation.z = state.rotation[2]
      this.mesh.scale.fromArray(state.scale)
      this.setColor('#' + state.color)
      this.updateOutline()
    }

    cloneObjectWithResources(includeModelChildren = false) {
      const clone = this.mesh.clone(true)
      if (!includeModelChildren) {
        const nestedRoots = []
        clone.traverse((child) => {
          if (child !== clone && child.userData && child.userData.shapeStudioRootId) nestedRoots.push(child)
        })
        nestedRoots.forEach(child => child.parent && child.parent.remove(child))
      }
      clone.traverse((child) => {
        if (!child.isMesh) return
        if (child.geometry) child.geometry = child.geometry.clone()
        if (Array.isArray(child.material)) child.material = child.material.map(material => material.clone())
        else if (child.material) child.material = child.material.clone()
      })
      return clone
    }

    toSerializableJSON() {
      const clone = this.cloneObjectWithResources()
      clone.traverse((child) => {
        if (!child.isMesh || !child.geometry) return
        if (child.geometry.userData && child.geometry.userData.shapeStudioModified) {
          const originalClone = child.geometry
          child.geometry = new THREE.BufferGeometry().copy(originalClone)
          child.geometry.userData = { ...originalClone.userData }
          originalClone.dispose()
        }
      })
      clone.updateMatrixWorld(true)
      const json = clone.toJSON()
      clone.traverse((child) => {
        if (!child.isMesh) return
        if (child.geometry) child.geometry.dispose()
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        materials.filter(Boolean).forEach(material => material.dispose())
      })
      return json
    }

    clone(offset = new THREE.Vector3(1.5, 1.5, 1.5)) {
      const newShape = new ModelShape(
        'imported',
        new THREE.Vector3(),
        this.cloneObjectWithResources(),
        this.shapeName + ' Copy'
      )
      newShape.shapeType = this.shapeType
      newShape.isImported = this.isImported
      const state = this.getState()
      newShape.setState(state)
      newShape.mesh.position.add(offset)
      newShape.updateOutline()
      return newShape
    }

    remove() {
      scene.remove(this.mesh)
      scene.remove(this.outline)
      this.mesh.traverse((child) => {
        if (!child.isMesh) return
        if (child.geometry) child.geometry.dispose()
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        materials.filter(Boolean).forEach(material => material.dispose())
      })
      this.outline.geometry.dispose()
      this.outline.material.dispose()
    }
  }

  // ==========================================
  // CUBE MANAGER
  // ==========================================

  let cubes = []
  let selectedCube = null
  const selectedShapes = new Set()
  let editorMode = '3d'
  let voxelWorld = null
  let activeVoxelTool = 'place'
  let voxelToolAnchor = null
  let voxelPointerInstalled = false

  function createShape(shapeType) {
    const modelShape = new ModelShape(shapeType, new THREE.Vector3(0, 0.5, 0))
    cubes.push(modelShape)
    selectCube(modelShape)
    updateCubeCount()
    commitHistory(`Add ${modelShape.shapeName}`)
    return modelShape
  }

  function addCube() {
    showShapePicker()
  }

  function deleteCube() {
    const requestedTargets = selectedShapes.size ? [...selectedShapes] : (selectedCube ? [selectedCube] : [])
    const targets = requestedTargets.filter(shape => !shape.locked)
    if (!targets.length) { showProjectStatus('Selected objects are locked.', true); return }

    transformGizmo.detach()
    targets.forEach(detachModelChildren)
    targets.forEach((modelShape) => {
      const index = cubes.indexOf(modelShape)
      if (index < 0) return
      modelShape.remove()
      cubes.splice(index, 1)
    })
    selectedShapes.clear()
    selectedCube = null
    clearEditSelection()
    updateUI()
    updateStatus()
    updateCubeCount()
    commitHistory(targets.length > 1 ? 'Delete objects' : 'Delete shape')
  }

  function duplicateCube() {
    if (!selectedCube) return
    const sourceParent = selectedCube.mesh.parent
    const newCube = selectedCube.clone()
    if (sourceParent && sourceParent !== scene) sourceParent.add(newCube.mesh)
    cubes.push(newCube)
    selectCube(newCube)
    updateCubeCount()
    commitHistory('Duplicate shape')
  }

  function clearAll() {
    if (cubes.length === 0) return
    transformGizmo.detach()
    cubes.forEach(modelShape => {
      if (parentModelShape(modelShape)) scene.attach(modelShape.mesh)
    })
    cubes.forEach(cube => cube.remove())
    cubes = []
    selectedShapes.clear()
    selectedCube = null
    clearEditSelection()
    updateUI()
    updateStatus()
    updateCubeCount()
    commitHistory('Clear scene')
  }

  function updateCubeCount() {
    document.getElementById('cubeCount').textContent = `Shapes: ${cubes.length}`
    renderHierarchy()
    updateMeasurementDimensions()
    updateStatistics()
  }

  // ==========================================
  // SELECTION & RAYCASTING
  // ==========================================

  function modelShapeForObject(object) {
    let current = object
    while (current) {
      const match = cubes.find(candidate => candidate.mesh === current)
      if (match) return match
      current = current.parent
    }
    return null
  }

  function parentModelShape(modelShape) {
    return cubes.find(candidate => candidate.mesh === modelShape.mesh.parent) || null
  }

  function childModelShapes(modelShape) {
    return cubes.filter(candidate => candidate.mesh.parent === modelShape.mesh)
  }

  function detachModelChildren(modelShape) {
    childModelShapes(modelShape).forEach(child => scene.attach(child.mesh))
  }

  function raycastShapes(event, shapes = cubes) {
    const rect = renderer.domElement.getBoundingClientRect()
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(mouse, camera)

    const roots = shapes.map(shape => shape.mesh)
    const intersections = raycaster.intersectObjects(roots, true)
    const intersection = intersections.find(hit => hit.object && hit.object.isMesh)
    if (!intersection) return null

    return {
      intersection,
      modelShape: modelShapeForObject(intersection.object)
    }
  }

  function onCanvasClick(event) {
    const hit = raycastShapes(event)
    if (hit) selectCube(hit.modelShape, event.ctrlKey || event.metaKey)
    else deselectCube()
  }

  function selectCube(cube, additive = false) {
    if (!cube) return
    if (activeTool === 'edit' && editSelection && modelShapeForObject(editSelection.mesh) !== cube) clearEditSelection()

    if (!additive) {
      selectedShapes.forEach(shape => shape.deselect())
      selectedShapes.clear()
    }

    if (additive && selectedShapes.has(cube) && selectedCube !== cube) {
      cube.deselect()
      selectedShapes.delete(cube)
    } else {
      selectedShapes.add(cube)
      cube.select()
      selectedCube = cube
    }

    if (!selectedShapes.size) selectedCube = null

    if (selectedCube && ['translate', 'rotate', 'scale'].includes(activeTool)) {
      transformGizmo.setMode(activeTool)
      transformGizmo.attach(selectedCube.mesh)
    } else if (activeTool !== 'edit') {
      transformGizmo.detach()
    }

    updateUI()
    updateStatus()
    renderHierarchy()
    updateMeasurementDimensions()
    syncSelectedObjectControls()
    syncMaterialPanel()
  }

  function deselectCube() {
    selectedShapes.forEach(shape => shape.deselect())
    selectedShapes.clear()
    transformGizmo.detach()
    selectedCube = null
    clearEditSelection()
    updateUI()
    updateStatus()
    renderHierarchy()
    updateMeasurementDimensions()
    syncSelectedObjectControls()
    syncMaterialPanel()
  }

  function updateUI() {
    const controlsDiv = document.getElementById('selected-controls')
    if (selectedCube) {
      controlsDiv.style.display = 'block'
      const state = selectedCube.getState()
      document.getElementById('selectedShapeName').textContent = selectedCube.shapeName
      document.getElementById('posX').value = state.position[0].toFixed(2)
      document.getElementById('posY').value = state.position[1].toFixed(2)
      document.getElementById('posZ').value = state.position[2].toFixed(2)
      document.getElementById('rotX').value = (state.rotation[0] * 180 / Math.PI).toFixed(1)
      document.getElementById('rotY').value = (state.rotation[1] * 180 / Math.PI).toFixed(1)
      document.getElementById('rotZ').value = (state.rotation[2] * 180 / Math.PI).toFixed(1)
      document.getElementById('scaleX').value = state.scale[0].toFixed(2)
      document.getElementById('scaleY').value = state.scale[1].toFixed(2)
      document.getElementById('scaleZ').value = state.scale[2].toFixed(2)
      document.getElementById('cubeColor').value = '#' + state.color
    } else {
      controlsDiv.style.display = 'none'
    }
  }

  function updateStatus() {
    const statusContent = document.getElementById('status-content')
    if (selectedCube) {
      const state = selectedCube.getState()
      statusContent.innerHTML = `
        <span class="status-selected">${selectedCube.shapeName}</span><br>
        Pos: (${state.position[0].toFixed(1)}, ${state.position[1].toFixed(1)}, ${state.position[2].toFixed(1)})<br>
        Scale: (${state.scale[0].toFixed(2)}, ${state.scale[1].toFixed(2)}, ${state.scale[2].toFixed(2)})
      `
    } else {
      statusContent.textContent = 'No shape selected'
    }
  }

  // ==========================================
  // TRANSFORM CONTROLS
  // ==========================================

  function updateTransform() {
    if (!selectedCube) return

    const posX = parseFloat(document.getElementById('posX').value) || 0
    const posY = parseFloat(document.getElementById('posY').value) || 0
    const posZ = parseFloat(document.getElementById('posZ').value) || 0

    const rotX = (parseFloat(document.getElementById('rotX').value) || 0) * Math.PI / 180
    const rotY = (parseFloat(document.getElementById('rotY').value) || 0) * Math.PI / 180
    const rotZ = (parseFloat(document.getElementById('rotZ').value) || 0) * Math.PI / 180

    const scaleX = parseFloat(document.getElementById('scaleX').value) || 1
    const scaleY = parseFloat(document.getElementById('scaleY').value) || 1
    const scaleZ = parseFloat(document.getElementById('scaleZ').value) || 1

    selectedCube.mesh.position.set(posX, posY, posZ)
    selectedCube.mesh.rotation.order = 'XYZ'
    selectedCube.mesh.rotation.x = rotX
    selectedCube.mesh.rotation.y = rotY
    selectedCube.mesh.rotation.z = rotZ
    selectedCube.mesh.scale.set(scaleX, scaleY, scaleZ)

    updateStatus()
    commitHistory('Edit transform')
  }

  function updateColor() {
    if (!selectedCube) return
    const color = document.getElementById('cubeColor').value
    selectedCube.setColor(color)
    commitHistory('Change color')
  }

  function quickRotate(axis) {
    if (!selectedCube) return
    const deg90 = Math.PI / 2
    if (axis === 'x') selectedCube.mesh.rotation.x += deg90
    if (axis === 'y') selectedCube.mesh.rotation.y += deg90
    if (axis === 'z') selectedCube.mesh.rotation.z += deg90
    updateUI()
    updateStatus()
    commitHistory('Rotate shape')
  }

  function quickScale(factor) {
    if (!selectedCube) return
    selectedCube.mesh.scale.multiplyScalar(factor)
    updateUI()
    updateStatus()
    commitHistory('Scale shape')
  }

  // ==========================================
  // PROJECT SNAPSHOTS & GLOBAL HISTORY
  // ==========================================

  const HISTORY_LIMIT = 30
  let sceneHistory = []
  let sceneHistoryIndex = -1
  let historyRestoring = false
  let currentProjectName = 'shape-studio-project'
  let statusTimer = null

  function showProjectStatus(message, isError = false) {
    const status = document.getElementById('projectStatus')
    if (!status) return
    status.textContent = message
    status.classList.toggle('is-error', isError)
    status.classList.add('is-visible')
    clearTimeout(statusTimer)
    statusTimer = setTimeout(() => status.classList.remove('is-visible'), 2600)
  }

  function createSceneSnapshot() {
    return {
      version: 2,
      editorMode: voxelWorld ? 'bloxd' : editorMode,
      voxelWorld: voxelWorld ? voxelWorld.serialize() : null,
      selectedIndex: selectedCube ? cubes.indexOf(selectedCube) : -1,
      selectedIndices: cubes.map((shape, index) => selectedShapes.has(shape) ? index : -1).filter(index => index >= 0),
      objects: cubes.map((modelShape) => {
        modelShape.mesh.updateMatrixWorld(true)
        return {
          shapeName: modelShape.shapeName,
          shapeType: modelShape.shapeType,
          isImported: modelShape.isImported,
          isGroup: modelShape.isGroup,
          locked: modelShape.locked,
          parentIndex: cubes.findIndex(candidate => candidate.mesh === modelShape.mesh.parent),
          object: modelShape.toSerializableJSON()
        }
      })
    }
  }

  function disposeCurrentSceneObjects() {
    transformGizmo.detach()
    cubes.forEach(modelShape => {
      if (parentModelShape(modelShape)) scene.attach(modelShape.mesh)
    })
    cubes.forEach(modelShape => modelShape.remove())
    cubes = []
    selectedCube = null
    selectedShapes.clear()
  }

  function restoreSceneSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.objects)) {
      throw new Error('This project does not contain a valid scene.')
    }

    if (snapshot.editorMode === 'bloxd' && snapshot.voxelWorld) {
      historyRestoring = true
      try {
        disposeCurrentSceneObjects()
        if (voxelWorld) voxelWorld.dispose()
        voxelWorld = createVoxelWorld()
        voxelWorld.restore(snapshot.voxelWorld)
        setEditorMode('bloxd', true)
        updateCubeCount()
      } finally { historyRestoring = false }
      return
    }
    if (voxelWorld) { voxelWorld.dispose(); voxelWorld = null }
    setEditorMode('3d', true)
    const loader = new THREE.ObjectLoader()
    const parsedEntries = snapshot.objects.map((entry) => ({
      entry,
      object: loader.parse(entry.object)
    }))

    historyRestoring = true
    try {
      disposeCurrentSceneObjects()
      parsedEntries.forEach(({ entry, object }) => {
        const modelShape = new ModelShape(
          'imported',
          object.position.clone(),
          object,
          entry.shapeName || 'Loaded Shape'
        )
        modelShape.shapeType = entry.shapeType || 'imported'
        modelShape.isImported = Boolean(entry.isImported)
        modelShape.isGroup = Boolean(entry.isGroup)
        modelShape.locked = Boolean(entry.locked)
        cubes.push(modelShape)
      })

      snapshot.objects.forEach((entry, index) => {
        if (entry.parentIndex >= 0 && cubes[entry.parentIndex]) cubes[entry.parentIndex].mesh.add(cubes[index].mesh)
      })
      scene.updateMatrixWorld(true)

      selectedShapes.clear()
      const selectedIndices = Array.isArray(snapshot.selectedIndices) ? snapshot.selectedIndices : []
      const selectedIndex = Number.isInteger(snapshot.selectedIndex) ? snapshot.selectedIndex : -1
      selectedIndices.forEach((index) => {
        if (index !== selectedIndex && cubes[index]) {
          selectedShapes.add(cubes[index])
          cubes[index].select()
        }
      })
      if (selectedIndex >= 0 && selectedIndex < cubes.length) selectCube(cubes[selectedIndex], true)
      else {
        selectedCube = null
        updateUI()
        updateStatus()
      }
      updateCubeCount()
    } finally {
      historyRestoring = false
    }
  }

  function updateHistoryControls() {
    const undoButton = document.getElementById('undoButton')
    const redoButton = document.getElementById('redoButton')
    if (undoButton) {
      undoButton.disabled = sceneHistoryIndex <= 0
      const previous = sceneHistory[sceneHistoryIndex - 1]
      undoButton.title = previous ? `Undo: ${sceneHistory[sceneHistoryIndex].label} (Ctrl/Cmd+Z)` : 'Nothing to undo'
    }
    if (redoButton) {
      redoButton.disabled = sceneHistoryIndex >= sceneHistory.length - 1
      const next = sceneHistory[sceneHistoryIndex + 1]
      redoButton.title = next ? `Redo: ${next.label} (Ctrl/Cmd+Y)` : 'Nothing to redo'
    }
    if (typeof sculptUndo !== 'undefined' && sculptUndo) sculptUndo.disabled = sceneHistoryIndex <= 0
  }

  function commitHistory(label) {
    if (historyRestoring) return
    const entry = { label, snapshot: createSceneSnapshot() }
    sceneHistory.splice(sceneHistoryIndex + 1)
    sceneHistory.push(entry)
    if (sceneHistory.length > HISTORY_LIMIT) sceneHistory.shift()
    sceneHistoryIndex = sceneHistory.length - 1
    updateHistoryControls()
    updateStatistics()
    scheduleAutosave(label)
  }

  function undoScene() {
    if (editorMode === 'bloxd' && voxelWorld) { voxelWorld.undo(); syncVoxelUI(); return }
    if (sceneHistoryIndex <= 0) return
    sceneHistoryIndex--
    restoreSceneSnapshot(sceneHistory[sceneHistoryIndex].snapshot)
    updateHistoryControls()
    showProjectStatus(`Undid: ${sceneHistory[sceneHistoryIndex + 1].label}`)
  }

  function redoScene() {
    if (editorMode === 'bloxd' && voxelWorld) { voxelWorld.redo(); syncVoxelUI(); return }
    if (sceneHistoryIndex >= sceneHistory.length - 1) return
    sceneHistoryIndex++
    restoreSceneSnapshot(sceneHistory[sceneHistoryIndex].snapshot)
    updateHistoryControls()
    showProjectStatus(`Redid: ${sceneHistory[sceneHistoryIndex].label}`)
  }

  // ==========================================
  // TOOLBAR & DIRECT MANIPULATION
  // ==========================================

  const advancedPanel = document.getElementById('advancedPanel')
  const advancedToggle = document.getElementById('advancedToggle')
  const toolbarColor = document.getElementById('toolbarColor')
  const shapePicker = document.getElementById('shapePicker')
  const shapeGrid = document.getElementById('shapeGrid')
  const shapeSearch = document.getElementById('shapeSearch')
  const shapeCategories = document.getElementById('shapeCategories')
  const shapeResultCount = document.getElementById('shapeResultCount')
  const importModelButton = document.getElementById('importModelButton')
  const modelFileInput = document.getElementById('modelFileInput')
  const modelImportStatus = document.getElementById('modelImportStatus')
  const modelImportArea = document.querySelector('.model-import')
  const proceduralDialog = document.getElementById('proceduralDialog')
  const proceduralList = document.getElementById('proceduralList')
  const proceduralCategories = document.getElementById('proceduralCategories')
  const proceduralSearch = document.getElementById('proceduralSearch')
  const generateProceduralButton = document.getElementById('generateProcedural')
  const bakeProceduralButton = document.getElementById('bakeProcedural')
  const proceduralStats = document.getElementById('proceduralStats')
  const sculptPanel = document.getElementById('sculptPanel')
  const sculptCursor = document.getElementById('sculptCursor')
  const sculptRadius = document.getElementById('sculptRadius')
  const sculptRadiusValue = document.getElementById('sculptRadiusValue')
  const sculptStrength = document.getElementById('sculptStrength')
  const sculptStrengthValue = document.getElementById('sculptStrengthValue')
  const sculptUndo = document.getElementById('sculptUndo')
  const undoButton = document.getElementById('undoButton')
  const redoButton = document.getElementById('redoButton')
  const saveProjectButton = document.getElementById('saveProjectButton')
  const loadProjectButton = document.getElementById('loadProjectButton')
  const projectFileInput = document.getElementById('projectFileInput')
  const exportMenuButton = document.getElementById('exportMenuButton')
  const exportMenu = document.getElementById('exportMenu')
  const hierarchyPanel = document.getElementById('hierarchyPanel')
  const hierarchyList = document.getElementById('hierarchyList')
  const editPanel = document.getElementById('editPanel')
  const measurePanel = document.getElementById('measurePanel')
  const measureDimensions = document.getElementById('measureDimensions')
  const measureResult = document.getElementById('measureResult')
  const arrayDialog = document.getElementById('arrayDialog')
  const arrayType = document.getElementById('arrayType')
  const linearArrayOptions = document.getElementById('linearArrayOptions')
  const radialArrayOptions = document.getElementById('radialArrayOptions')
  const materialPanel = document.getElementById('materialPanel')
  const modifierPanel = document.getElementById('modifierPanel')
  const statisticsPanel = document.getElementById('statisticsPanel')
  const statisticsContent = document.getElementById('statisticsContent')
  const boxSelection = document.getElementById('boxSelection')
  const autosaveRecovery = document.getElementById('autosaveRecovery')
  const voxelPanel = document.getElementById('voxelPanel')
  const voxelConvertDialog = document.getElementById('voxelConvertDialog')
  const voxelBlockSearch = document.getElementById('voxelBlockSearch')
  const voxelBlockSelect = document.getElementById('voxelBlockSelect')
  const voxelBlockSwatch = document.getElementById('voxelBlockSwatch')
  const voxelToolHint = document.getElementById('voxelToolHint')
  const voxelSelectionCount = document.getElementById('voxelSelectionCount')
  const voxelBlockCount = document.getElementById('voxelBlockCount')
  const bloxdExportDialog = document.getElementById('bloxdExportDialog')
  const bloxdBlockType = document.getElementById('bloxdBlockType')
  const bloxdMaterialMode = document.getElementById('bloxdMaterialMode')
  const bloxdProgress = document.getElementById('bloxdProgress')
  const bloxdProgressBar = document.getElementById('bloxdProgressBar')
  const bloxdProgressText = document.getElementById('bloxdProgressText')
  const bloxdExportResult = document.getElementById('bloxdExportResult')
  const generateBloxdSchem = document.getElementById('generateBloxdSchem')
  let activeShapeCategory = 'All'
  let sculptMode = 'inflate'
  let sculptStroke = null
  const sculptWeldCache = new WeakMap()

  function normalizeImportedObject(object) {
    const wrapper = new THREE.Group()
    wrapper.add(object)
    wrapper.updateMatrixWorld(true)

    let bounds = new THREE.Box3().setFromObject(wrapper)
    if (bounds.isEmpty()) throw new Error('The model does not contain visible geometry.')

    const size = bounds.getSize(new THREE.Vector3())
    const maxDimension = Math.max(size.x, size.y, size.z)
    if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
      throw new Error('The model has invalid dimensions.')
    }

    object.scale.multiplyScalar(2 / maxDimension)
    wrapper.updateMatrixWorld(true)
    bounds = new THREE.Box3().setFromObject(wrapper)
    const center = bounds.getCenter(new THREE.Vector3())
    object.position.sub(center)
    wrapper.updateMatrixWorld(true)
    return wrapper
  }

  function loaderManagerForFiles(files) {
    const manager = new THREE.LoadingManager()
    const objectUrls = new Map()

    files.forEach((file) => {
      const objectUrl = URL.createObjectURL(file)
      objectUrls.set(file.name, objectUrl)
      objectUrls.set(file.name.split('/').pop(), objectUrl)
    })

    manager.setURLModifier((url) => {
      const cleanUrl = decodeURIComponent(url.split('?')[0])
      const fileName = cleanUrl.split('/').pop()
      return objectUrls.get(cleanUrl) || objectUrls.get(fileName) || url
    })

    return {
      manager,
      revoke: () => new Set(objectUrls.values()).forEach(url => URL.revokeObjectURL(url))
    }
  }

  async function parseImportedFile(primaryFile, allFiles) {
    const extension = primaryFile.name.split('.').pop().toLowerCase()
    const { manager, revoke } = loaderManagerForFiles(allFiles)

    try {
      if (extension === 'glb' || extension === 'gltf') {
        const loader = new THREE.GLTFLoader(manager)
        const data = extension === 'glb' ? await primaryFile.arrayBuffer() : await primaryFile.text()
        const gltf = await new Promise((resolve, reject) => loader.parse(data, '', resolve, reject))
        return gltf.scene
      }

      if (extension === 'obj') {
        const loader = new THREE.OBJLoader(manager)
        return loader.parse(await primaryFile.text())
      }

      if (extension === 'stl') {
        const loader = new THREE.STLLoader(manager)
        const geometry = loader.parse(await primaryFile.arrayBuffer())
        geometry.computeVertexNormals()
        const material = new THREE.MeshStandardMaterial({
          color: Math.random() * 0xffffff,
          metalness: 0.2,
          roughness: 0.7,
          side: THREE.DoubleSide
        })
        return new THREE.Mesh(geometry, material)
      }

      throw new Error('Choose a GLB, glTF, OBJ, or STL model file.')
    } finally {
      // Parsing and dependent-resource loading have completed when the loader resolves.
      setTimeout(revoke, 1000)
    }
  }

  async function importModelFiles(fileList) {
    const files = Array.from(fileList)
    const supportedExtensions = ['glb', 'gltf', 'obj', 'stl']
    const primaryFile = files.find((file) => {
      const extension = file.name.split('.').pop().toLowerCase()
      return supportedExtensions.includes(extension)
    })

    if (!primaryFile) {
      modelImportStatus.textContent = 'Choose a GLB, glTF, OBJ, or STL file.'
      modelImportStatus.classList.add('is-error')
      return
    }

    importModelButton.disabled = true
    modelImportStatus.classList.remove('is-error')
    modelImportStatus.textContent = `Importing ${primaryFile.name}…`

    try {
      const importedObject = await parseImportedFile(primaryFile, files)
      const normalizedObject = normalizeImportedObject(importedObject)
      const modelName = primaryFile.name.replace(/\.[^.]+$/, '') || 'Imported Model'
      if (voxelWorld) {
        normalizedObject.position.y = .5
        await voxelizeObjectIntoWorld(normalizedObject, `Import ${modelName} as blocks`, { materialMode: 'colors' })
        modelImportStatus.textContent = `${modelName} voxelized into the Bloxd world.`
        closeShapePicker()
        return
      }
      const modelShape = new ModelShape(
        'imported',
        new THREE.Vector3(0, 0.5, 0),
        normalizedObject,
        modelName
      )
      cubes.push(modelShape)
      selectCube(modelShape)
      updateCubeCount()
      setTool('translate')
      commitHistory(`Import ${modelName}`)
      modelImportStatus.textContent = `${modelName} imported successfully.`
      closeShapePicker()
    } catch (error) {
      console.error('Model import failed:', error)
      modelImportStatus.textContent = error.message || 'Could not import that model.'
      modelImportStatus.classList.add('is-error')
    } finally {
      importModelButton.disabled = false
      modelFileInput.value = ''
    }
  }

  importModelButton.addEventListener('click', () => modelFileInput.click())
  modelFileInput.addEventListener('change', () => {
    if (modelFileInput.files.length) importModelFiles(modelFileInput.files)
  })

  modelImportArea.addEventListener('dragover', (event) => {
    event.preventDefault()
  })

  modelImportArea.addEventListener('drop', (event) => {
    event.preventDefault()
    if (event.dataTransfer.files.length) importModelFiles(event.dataTransfer.files)
  })

  // ==========================================
  // SCULPTING
  // ==========================================

  function ensureEditablePosition(mesh) {
    const geometry = mesh.geometry
    const position = geometry && geometry.getAttribute('position')
    if (!position) return null

    if (position.isInterleavedBufferAttribute || !(position.array instanceof Float32Array)) {
      const values = new Float32Array(position.count * 3)
      for (let index = 0; index < position.count; index++) {
        values[index * 3] = position.getX(index)
        values[index * 3 + 1] = position.getY(index)
        values[index * 3 + 2] = position.getZ(index)
      }
      geometry.setAttribute('position', new THREE.BufferAttribute(values, 3))
      geometry.deleteAttribute('normal')
      geometry.computeVertexNormals()
      return geometry.getAttribute('position')
    }

    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
    return position
  }

  function weldedVertexGroups(geometry) {
    if (sculptWeldCache.has(geometry)) return sculptWeldCache.get(geometry)
    const position = geometry.getAttribute('position')
    const groups = new Map()
    for (let index = 0; index < position.count; index++) {
      const key = `${position.getX(index).toFixed(5)},${position.getY(index).toFixed(5)},${position.getZ(index).toFixed(5)}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(index)
    }
    const result = [...groups.values()]
    sculptWeldCache.set(geometry, result)
    return result
  }

  function weldedIndicesForVertex(geometry, vertexIndex) {
    return weldedVertexGroups(geometry).find(group => group.includes(vertexIndex)) || [vertexIndex]
  }

  function applySculptBrush(hit) {
    if (!sculptStroke || hit.intersection.object !== sculptStroke.mesh) return

    const mesh = sculptStroke.mesh
    const geometry = mesh.geometry
    const position = ensureEditablePosition(mesh)
    if (!position) return
    const normal = geometry.getAttribute('normal')
    const groups = weldedVertexGroups(geometry)
    const center = mesh.worldToLocal(hit.intersection.point.clone())
    const worldScale = mesh.getWorldScale(new THREE.Vector3())
    const averageScale = Math.max(0.0001, (Math.abs(worldScale.x) + Math.abs(worldScale.y) + Math.abs(worldScale.z)) / 3)
    const radius = parseFloat(sculptRadius.value) / averageScale
    const strength = parseFloat(sculptStrength.value) / averageScale
    const brushNormal = hit.intersection.face ? hit.intersection.face.normal.clone().normalize() : new THREE.Vector3(0, 1, 0)

    let centroid = null
    let affectedGroups = 0
    if (sculptMode === 'smooth') {
      centroid = new THREE.Vector3()
      groups.forEach((group) => {
        const vertex = new THREE.Vector3().fromBufferAttribute(position, group[0])
        if (vertex.distanceTo(center) <= radius) { centroid.add(vertex); affectedGroups++ }
      })
      if (affectedGroups) centroid.multiplyScalar(1 / affectedGroups)
    }

    let changed = false
    groups.forEach((group) => {
      const vertex = new THREE.Vector3().fromBufferAttribute(position, group[0])
      const distance = vertex.distanceTo(center)
      if (distance > radius) return
      const falloff = Math.pow(1 - distance / radius, 2)

      if (sculptMode === 'inflate' || sculptMode === 'deflate') {
        const averagedNormal = new THREE.Vector3()
        group.forEach(index => averagedNormal.add(new THREE.Vector3().fromBufferAttribute(normal, index)))
        averagedNormal.normalize()
        vertex.addScaledVector(averagedNormal, (sculptMode === 'deflate' ? -1 : 1) * strength * falloff)
      } else if (sculptMode === 'smooth' && centroid) {
        vertex.lerp(centroid, Math.min(1, strength * 8 * falloff))
      } else if (sculptMode === 'flatten') {
        const planeDistance = vertex.clone().sub(center).dot(brushNormal)
        vertex.addScaledVector(brushNormal, -planeDistance * Math.min(1, strength * 10 * falloff))
      }

      group.forEach(index => position.setXYZ(index, vertex.x, vertex.y, vertex.z))
      changed = true
    })

    if (!changed) return
    position.needsUpdate = true
    geometry.computeVertexNormals()
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    geometry.userData.shapeStudioModified = true
    sculptStroke.changed = true
    selectedCube.updateOutline()
  }

  function updateSculptCursor(event) {
    if (activeTool !== 'sculpt') {
      sculptCursor.style.display = 'none'
      return null
    }

    const targets = selectedCube ? [selectedCube] : cubes
    const hit = raycastShapes(event, targets)
    if (!hit) {
      sculptCursor.style.display = 'none'
      return null
    }

    const distance = Math.max(0.001, hit.intersection.distance)
    const canvasHeight = renderer.domElement.clientHeight
    const pixelsPerWorldUnit = camera.isPerspectiveCamera
      ? canvasHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distance)
      : canvasHeight * camera.zoom / (camera.top - camera.bottom)
    const diameter = Math.max(10, Math.min(500, parseFloat(sculptRadius.value) * pixelsPerWorldUnit * 2))
    sculptCursor.style.display = 'block'
    sculptCursor.style.left = `${event.clientX}px`
    sculptCursor.style.top = `${event.clientY}px`
    sculptCursor.style.width = `${diameter}px`
    sculptCursor.style.height = `${diameter}px`
    return hit
  }

  function beginSculptStroke(event) {
    if (activeTool !== 'sculpt' || event.button !== 0) return
    event.preventDefault()
    event.stopImmediatePropagation()

    const hit = raycastShapes(event)
    if (!hit) return
    if (selectedCube !== hit.modelShape) selectCube(hit.modelShape)
    if (hit.modelShape.locked) { showProjectStatus('Unlock this object before sculpting.', true); return }

    const mesh = hit.intersection.object
    const position = ensureEditablePosition(mesh)
    if (!position) return

    sculptStroke = {
      pointerId: event.pointerId,
      mesh,
      changed: false
    }
    renderer.domElement.setPointerCapture(event.pointerId)
    applySculptBrush(hit)
    updateSculptCursor(event)
  }

  function continueSculptStroke(event) {
    if (activeTool !== 'sculpt') return
    const hit = updateSculptCursor(event)
    if (!sculptStroke || event.pointerId !== sculptStroke.pointerId) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (hit) applySculptBrush(hit)
  }

  function finishSculptStroke(event) {
    if (!sculptStroke || event.pointerId !== sculptStroke.pointerId) return
    event.preventDefault()
    event.stopImmediatePropagation()

    if (renderer.domElement.hasPointerCapture(event.pointerId)) {
      renderer.domElement.releasePointerCapture(event.pointerId)
    }

    const changed = sculptStroke.changed
    sculptStroke = null
    if (changed) commitHistory('Sculpt shape')
  }

  function undoSculptStroke() {
    undoScene()
  }

  document.querySelectorAll('[data-sculpt-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      sculptMode = button.dataset.sculptMode
      document.querySelectorAll('[data-sculpt-mode]').forEach((item) => {
        item.classList.toggle('is-active', item === button)
      })
      if(voxelWorld){const mapping={inflate:'place',deflate:'remove',smooth:'smooth-brush',flatten:'flatten-brush'};setVoxelTool(mapping[sculptMode]);voxelToolHint.textContent=`Block sculpt ${sculptMode}: click or drag across blocks.`}
    })
  })

  sculptRadius.addEventListener('input', () => {
    if(voxelWorld){const radius=Math.max(1,Math.round(Number(sculptRadius.value)*3));document.getElementById('voxelBrushRadius').value=radius;sculptRadiusValue.value=`${radius} blocks`}
    else sculptRadiusValue.value = Number(sculptRadius.value).toFixed(2)
  })
  sculptStrength.addEventListener('input', () => {
    sculptStrengthValue.value = Number(sculptStrength.value).toFixed(3)
  })
  sculptUndo.addEventListener('click', () => voxelWorld ? voxelWorld.undo() : undoSculptStroke())

  renderer.domElement.addEventListener('pointerdown', beginSculptStroke)
  renderer.domElement.addEventListener('pointermove', continueSculptStroke)
  renderer.domElement.addEventListener('pointerup', finishSculptStroke)
  renderer.domElement.addEventListener('pointercancel', finishSculptStroke)
  renderer.domElement.addEventListener('pointerleave', () => {
    if (!sculptStroke) sculptCursor.style.display = 'none'
  })

  function renderShapeCategories() {
    const categories = ['All', ...new Set(SHAPE_DEFINITIONS.map(shape => shape.category))]
    shapeCategories.replaceChildren(...categories.map((category) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'category-chip' + (category === activeShapeCategory ? ' is-active' : '')
      button.textContent = category
      button.dataset.category = category
      return button
    }))
  }

  function renderShapeGrid() {
    const query = shapeSearch.value.trim().toLowerCase()
    const filteredShapes = SHAPE_DEFINITIONS.filter((shape) => {
      const categoryMatches = activeShapeCategory === 'All' || shape.category === activeShapeCategory
      const queryMatches = !query || `${shape.name} ${shape.category}`.toLowerCase().includes(query)
      return categoryMatches && queryMatches
    })

    shapeResultCount.textContent = `${filteredShapes.length} of ${SHAPE_DEFINITIONS.length} shapes`

    if (filteredShapes.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'shape-picker__empty'
      empty.textContent = 'No shapes match that search.'
      shapeGrid.replaceChildren(empty)
      return
    }

    shapeGrid.replaceChildren(...filteredShapes.map((shape) => {
      const card = document.createElement('button')
      card.type = 'button'
      card.className = 'shape-card'
      card.dataset.shapeId = shape.id
      card.title = `Add ${shape.name}`

      const icon = document.createElement('span')
      icon.className = 'shape-card__icon'
      icon.textContent = shape.icon

      const name = document.createElement('span')
      name.className = 'shape-card__name'
      name.textContent = shape.name

      const category = document.createElement('span')
      category.className = 'shape-card__category'
      category.textContent = shape.category

      card.append(icon, name, category)
      return card
    }))
  }

  // ==========================================
  // LIVE PROCEDURAL COMPOSER
  // ==========================================

  let activeProceduralType = 'terrain'
  let activeProceduralCategory = 'All'
  let proceduralLayers = []
  let activeProceduralLayer = 0
  let proceduralPreviewRenderer = null
  let proceduralPreviewScene = null
  let proceduralPreviewCamera = null
  let proceduralPreviewModel = null
  let proceduralPreviewTimer = null

  const proceduralInputs = {
    seed: document.getElementById('proceduralSeed'),
    size: document.getElementById('proceduralSize'),
    height: document.getElementById('proceduralHeight'),
    detail: document.getElementById('proceduralDetail'),
    density: document.getElementById('proceduralDensity'),
    variation: document.getElementById('proceduralVariation'),
    primary: document.getElementById('proceduralPrimary'),
    secondary: document.getElementById('proceduralSecondary')
  }
  const compositionInputs = {
    pattern: document.getElementById('proceduralPattern'),
    instances: document.getElementById('proceduralInstances'),
    spread: document.getElementById('proceduralSpread'),
    layerScale: document.getElementById('proceduralLayerScale'),
    offsetY: document.getElementById('proceduralOffsetY'),
    rotation: document.getElementById('proceduralRotation')
  }
  const islandInputs = {
    islandStyle: document.getElementById('islandStyle'), islandCount: document.getElementById('islandCount'), islandResolution: document.getElementById('islandResolution'),
    coastRoughness: document.getElementById('islandCoastRoughness'), mountainStrength: document.getElementById('islandMountainStrength'), peakSharpness: document.getElementById('islandPeakSharpness'),
    terracing: document.getElementById('islandTerracing'), erosion: document.getElementById('islandErosion'), crater: document.getElementById('islandCrater'),
    beachWidth: document.getElementById('islandBeachWidth'), oceanDepth: document.getElementById('islandOceanDepth'), riverCount: document.getElementById('islandRiverCount'), riverDepth: document.getElementById('islandRiverDepth'),
    reefDensity: document.getElementById('islandReefDensity'), waterEnabled: document.getElementById('islandWaterEnabled'), waterColor: document.getElementById('islandWaterColor'),
    biome: document.getElementById('islandBiome'), moisture: document.getElementById('islandMoisture'), temperature: document.getElementById('islandTemperature'), snowLine: document.getElementById('islandSnowLine'),
    vegetation: document.getElementById('islandVegetation'), rockDensity: document.getElementById('islandRockDensity'), settlementDensity: document.getElementById('islandSettlementDensity'),
    worldScale: document.getElementById('islandWorldScale'), chunkCount: document.getElementById('islandChunkCount'), chunkResolution: document.getElementById('islandChunkResolution'), lodDistance: document.getElementById('islandLodDistance'), lodEnabled: document.getElementById('islandLodEnabled'),
    treeSpecies: document.getElementById('islandTreeSpecies'), forestClustering: document.getElementById('islandForestClustering'), treeScale: document.getElementById('islandTreeScale'), canopyFullness: document.getElementById('islandCanopyFullness'), branchComplexity: document.getElementById('islandBranchComplexity'), deadTreeRatio: document.getElementById('islandDeadTreeRatio'),
    treeMaxCount: document.getElementById('islandTreeMaxCount'), treeAge: document.getElementById('islandTreeAge'), trunkTaper: document.getElementById('islandTrunkTaper'), trunkTwist: document.getElementById('islandTrunkTwist'), branchLevels: document.getElementById('islandBranchLevels'), branchSpread: document.getElementById('islandBranchSpread'), branchDroop: document.getElementById('islandBranchDroop'), rootSpread: document.getElementById('islandRootSpread'), canopyClusters: document.getElementById('islandCanopyClusters'), leafScale: document.getElementById('islandLeafScale'), leafColorVariation: document.getElementById('islandLeafColorVariation'), treeSeason: document.getElementById('islandTreeSeason'), leafMode: document.getElementById('islandLeafMode'), leafGeometry: document.getElementById('islandLeafGeometry'), leafShape: document.getElementById('islandLeafShape'), leavesPerTip: document.getElementById('islandLeavesPerTip'), leafCardSize: document.getElementById('islandLeafCardSize'), leafOpacity: document.getElementById('islandLeafOpacity'), leafVeins: document.getElementById('islandLeafVeins'), leafJitter: document.getElementById('islandLeafJitter'), leafTextureEnabled: document.getElementById('islandLeafTextureEnabled'), fruitDensity: document.getElementById('islandFruitDensity'), vineDensity: document.getElementById('islandVineDensity'), fallenLogDensity: document.getElementById('islandFallenLogDensity'), stumpDensity: document.getElementById('islandStumpDensity'), giantTreeChance: document.getElementById('islandGiantTreeChance'), giantTreeScale: document.getElementById('islandGiantTreeScale'),
    culture: document.getElementById('islandCulture'), settlementCount: document.getElementById('islandSettlementCount'), housesPerSettlement: document.getElementById('islandHousesPerSettlement'), houseStories: document.getElementById('islandHouseStories'), roofPitch: document.getElementById('islandRoofPitch'), roadDensity: document.getElementById('islandRoadDensity'), farmDensity: document.getElementById('islandFarmDensity'), dockDensity: document.getElementById('islandDockDensity'), defenseDensity: document.getElementById('islandDefenseDensity'), ruinDensity: document.getElementById('islandRuinDensity')
  }

  const bloxdMapCanvas=document.getElementById('bloxdIslandMapCanvas'),bloxdMapContext=bloxdMapCanvas.getContext('2d');let bloxdMapDraft=[],bloxdMapPointerDown=false
  BloxdIslandMap.BIOMES.forEach(biome=>{const option=new Option(biome.name,biome.id);option.style.backgroundColor=biome.color;document.getElementById('bloxdMapBiome').appendChild(option)})
  const smoothIslandBiomes=[['Tropical','tropical'],['Temperate','temperate'],['Arid','arid'],['Alpine','alpine'],['Alien','alien']]
  function syncIslandBiomeOptions(){const select=document.getElementById('islandBiome'),value=select.value,items=voxelWorld?[['Procedural biome mix (automatic)','auto'],...BloxdIslandMap.BIOMES.map(b=>[b.name,b.id])]:smoothIslandBiomes;select.replaceChildren(...items.map(item=>new Option(item[0],item[1])));if([...select.options].some(o=>o.value===value))select.value=value}
  function activeIslandMapDesign(){const layer=proceduralLayers[activeProceduralLayer];if(!layer)return{zones:[],paths:[],terrain:[]};layer.mapDesign=layer.mapDesign||{version:1,zones:[],paths:[],terrain:[]};return layer.mapDesign}
  function drawBloxdIslandMap(){const c=bloxdMapCanvas,ctx=bloxdMapContext,w=c.width,h=c.height,design=activeIslandMapDesign();ctx.clearRect(0,0,w,h);const ocean=ctx.createLinearGradient(0,0,0,h);ocean.addColorStop(0,'#173d54');ocean.addColorStop(1,'#0b293d');ctx.fillStyle=ocean;ctx.fillRect(0,0,w,h);const land=ctx.createRadialGradient(w*.46,h*.42,20,w*.5,h*.5,w*.47);land.addColorStop(0,'#78944e');land.addColorStop(.58,'#51713f');land.addColorStop(.82,'#b4a66a');land.addColorStop(.9,'#40728a');land.addColorStop(1,'#173d54');ctx.fillStyle=land;ctx.beginPath();ctx.ellipse(w/2,h/2,w*.44,h*.4,0,0,Math.PI*2);ctx.fill();ctx.save();ctx.beginPath();ctx.ellipse(w/2,h/2,w*.44,h*.4,0,0,Math.PI*2);ctx.clip();const cells=48,cw=w/cells,ch=h/cells,seed=(proceduralLayers[activeProceduralLayer]||{}).seed||'map';ctx.globalAlpha=.42;for(let gx=0;gx<cells;gx++)for(let gy=0;gy<cells;gy++){const u=(gx+.5)/cells,v=(gy+.5)/cells,terrain=BloxdIslandMap.terrainAt(design,u,v,seed,Math.max(0,1-Math.hypot((u-.5)/.48,(v-.5)/.43)),'auto');ctx.fillStyle=terrain.biome.color;ctx.fillRect(gx*cw,gy*ch,cw+1,ch+1)}ctx.restore();(design.terrain||[]).forEach(op=>{ctx.fillStyle=op.tool==='raise'?'#d9ba66aa':op.tool==='lower'?'#263e5caa':'#d5d5bf99';ctx.beginPath();ctx.arc(op.x*w,op.y*h,(op.radius||.08)*w,0,Math.PI*2);ctx.fill()});(design.zones||[]).forEach(zone=>{if(zone.points.length<3)return;const biome=BloxdIslandMap.BY_ID.get(zone.biome);ctx.fillStyle=`${biome?biome.color:'#888888'}aa`;ctx.strokeStyle=biome?biome.color:'#aaa';ctx.lineWidth=3;ctx.beginPath();zone.points.forEach((p,i)=>(i?ctx.lineTo(p[0]*w,p[1]*h):ctx.moveTo(p[0]*w,p[1]*h)));ctx.closePath();ctx.fill();ctx.stroke()});(design.paths||[]).forEach(path=>{ctx.strokeStyle=path.type==='river'?'#36aeea':path.type==='bridge'?'#e7aa55':'#403b38';ctx.lineWidth=Math.max(2,(path.width||.02)*w*2);ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();path.points.forEach((p,i)=>(i?ctx.lineTo(p[0]*w,p[1]*h):ctx.moveTo(p[0]*w,p[1]*h)));ctx.stroke()});if(bloxdMapDraft.length){ctx.strokeStyle='#fff36a';ctx.lineWidth=3;ctx.setLineDash([8,5]);ctx.beginPath();bloxdMapDraft.forEach((p,i)=>(i?ctx.lineTo(p[0]*w,p[1]*h):ctx.moveTo(p[0]*w,p[1]*h)));ctx.stroke();ctx.setLineDash([]);bloxdMapDraft.forEach(p=>{ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(p[0]*w,p[1]*h,5,0,Math.PI*2);ctx.fill()})}}
  function bloxdMapPoint(event){const r=bloxdMapCanvas.getBoundingClientRect();return[Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(event.clientY-r.top)/r.height))]}
  function applyBloxdMapPoint(point){const tool=document.getElementById('bloxdMapTool').value,design=activeIslandMapDesign(),size=Number(document.getElementById('bloxdMapBrushSize').value)/200,strength=Number(document.getElementById('bloxdMapStrength').value)/100;if(['biome','road','river','bridge'].includes(tool))bloxdMapDraft.push(point);else if(['raise','lower','flatten'].includes(tool)){const last=design.terrain[design.terrain.length-1];if(last&&last.tool===tool&&Math.hypot(last.x-point[0],last.y-point[1])<size*.22){last.x=point[0];last.y=point[1];last.strength=strength}else{design.terrain.push({tool,x:point[0],y:point[1],radius:size,strength,level:0});if(design.terrain.length>512)design.terrain.shift()}}else if(tool==='erase'){const all=[...(design.zones||[]).map(v=>({array:design.zones,value:v})),...(design.paths||[]).map(v=>({array:design.paths,value:v})),...(design.terrain||[]).map(v=>({array:design.terrain,value:v}))];let nearest=null,distance=Infinity;all.forEach(item=>{const points=item.value.points||[[item.value.x,item.value.y]],d=Math.min(...points.map(p=>Math.hypot(p[0]-point[0],p[1]-point[1])));if(d<distance){distance=d;nearest=item}});if(nearest&&distance<.12)nearest.array.splice(nearest.array.indexOf(nearest.value),1)}drawBloxdIslandMap();scheduleProceduralPreview()}
  bloxdMapCanvas.addEventListener('pointerdown',event=>{bloxdMapPointerDown=true;bloxdMapCanvas.setPointerCapture(event.pointerId);applyBloxdMapPoint(bloxdMapPoint(event))});bloxdMapCanvas.addEventListener('pointermove',event=>{if(!bloxdMapPointerDown||!['raise','lower','flatten'].includes(document.getElementById('bloxdMapTool').value))return;applyBloxdMapPoint(bloxdMapPoint(event))});bloxdMapCanvas.addEventListener('pointerup',()=>{bloxdMapPointerDown=false})
  document.getElementById('bloxdMapFinish').addEventListener('click',()=>{const tool=document.getElementById('bloxdMapTool').value,design=activeIslandMapDesign();if(tool==='biome'&&bloxdMapDraft.length>=3)design.zones.push({biome:document.getElementById('bloxdMapBiome').value,points:bloxdMapDraft.map(p=>p.slice())});else if(['road','river','bridge'].includes(tool)&&bloxdMapDraft.length>=2)design.paths.push({type:tool,width:Number(document.getElementById('bloxdMapBrushSize').value)/200,elevation:tool==='bridge'?Number(document.getElementById('bloxdMapStrength').value)/100:0,points:bloxdMapDraft.map(p=>p.slice())});else return showProjectStatus('Add more control points before finishing this map feature.',true);bloxdMapDraft=[];drawBloxdIslandMap();scheduleProceduralPreview();document.getElementById('bloxdMapStatus').textContent=`Added ${tool}. The generated island will follow this live map plan.`})
  document.getElementById('bloxdMapUndo').addEventListener('click',()=>{if(bloxdMapDraft.length)bloxdMapDraft.pop();else{const d=activeIslandMapDesign();if(d.paths.length)d.paths.pop();else if(d.zones.length)d.zones.pop();else if(d.terrain.length)d.terrain.pop()}drawBloxdIslandMap();scheduleProceduralPreview()});document.getElementById('bloxdMapClear').addEventListener('click',()=>{const d=activeIslandMapDesign();d.zones=[];d.paths=[];d.terrain=[];bloxdMapDraft=[];drawBloxdIslandMap();scheduleProceduralPreview()});document.getElementById('bloxdMapTool').addEventListener('change',()=>{bloxdMapDraft=[];drawBloxdIslandMap()});document.getElementById('bloxdFastTexturing').addEventListener('change',event=>{const layer=proceduralLayers[activeProceduralLayer];if(layer)layer.fastTexturing=event.target.checked;scheduleProceduralPreview()})

  function proceduralDefinition(type = activeProceduralType) {
    return ProceduralGenerators.BY_ID.get(type) || ProceduralGenerators.DEFINITIONS[0]
  }

  function defaultProceduralLayer(type = activeProceduralType, seed = Math.floor(Math.random() * 999999)) {
    const definition = proceduralDefinition(type)
    const layer={
      ...ProceduralGenerators.normalizedParams(type, { ...definition.defaults, seed }),
      ...(globalThis.BloxdProceduralAdvanced ? BloxdProceduralAdvanced.defaults(type) : {}),
      materialRules: {}, mapDesign: {version:1,zones:[],paths:[],terrain:[]}, fastTexturing:false,
      pattern: 'single', instances: 1, spread: 6, layerScale: 1, offsetY: 0, rotation: 0
    };if(voxelWorld&&type==='island')layer.biome='auto';return layer
  }

  function normalizedProceduralRecipe(data) {
    if (data && Array.isArray(data.layers)) {
      return {
        version: 2,
        layers: data.layers.slice(0, 8).map(layer => ({
          ...defaultProceduralLayer(layer.type, layer.seed),
          ...ProceduralGenerators.normalizedParams(layer.type, layer),
          mapDesign: JSON.parse(JSON.stringify(layer.mapDesign||{version:1,zones:[],paths:[],terrain:[]})), fastTexturing:Boolean(layer.fastTexturing), ...(voxelWorld&&layer.type==='island'?{biome:layer.biome||'temperate'}:{}),
          pattern: ['single', 'random', 'ring', 'grid'].includes(layer.pattern) ? layer.pattern : 'single',
          instances: Math.max(1, Math.min(25, Math.round(Number(layer.instances) || 1))),
          spread: Math.max(0, Math.min(30, Number(layer.spread) || 0)),
          layerScale: Math.max(0.05, Math.min(5, Number(layer.layerScale) || 1)),
          offsetY: Math.max(-20, Math.min(20, Number(layer.offsetY) || 0)),
          rotation: Number(layer.rotation) || 0
        }))
      }
    }
    const legacy = data && data.type ? { ...defaultProceduralLayer(data.type, data.seed), ...data } : defaultProceduralLayer(activeProceduralType)
    return { version: 2, layers: [legacy] }
  }

  function proceduralDataFromInputs() {
    const existing=proceduralLayers[activeProceduralLayer]||{}
    const source = {
      ...existing,
      seed: proceduralInputs.seed.value, size: proceduralInputs.size.value, height: proceduralInputs.height.value,
      detail: proceduralInputs.detail.value, density: proceduralInputs.density.value, variation: proceduralInputs.variation.value,
      primary: proceduralInputs.primary.value, secondary: proceduralInputs.secondary.value
    }
    if (activeProceduralType === 'island') {
      Object.entries(islandInputs).forEach(([key, input]) => { source[key] = input.type === 'checkbox' ? input.checked : input.value })
    }
    return {
      ...existing,
      ...ProceduralGenerators.normalizedParams(activeProceduralType, source),
      ...(voxelWorld&&activeProceduralType==='island'?{biome:source.biome,mapDesign:JSON.parse(JSON.stringify(existing.mapDesign||{version:1,zones:[],paths:[],terrain:[]})),fastTexturing:Boolean(existing.fastTexturing)}:{}),
      materialRules: JSON.parse(JSON.stringify(existing.materialRules||{})),
      pattern: compositionInputs.pattern.value,
      instances: Math.max(1, Math.min(25, parseInt(compositionInputs.instances.value, 10) || 1)),
      spread: Math.max(0, Math.min(30, parseFloat(compositionInputs.spread.value) || 0)),
      layerScale: Math.max(0.05, Math.min(5, parseFloat(compositionInputs.layerScale.value) || 1)),
      offsetY: Math.max(-20, Math.min(20, parseFloat(compositionInputs.offsetY.value) || 0)),
      rotation: parseFloat(compositionInputs.rotation.value) || 0
    }
  }

  function syncActiveProceduralLayer() {
    if (!proceduralLayers.length) return
    proceduralLayers[activeProceduralLayer] = proceduralDataFromInputs()
    renderProceduralLayerTabs()
  }

  function currentProceduralRecipe() {
    syncActiveProceduralLayer()
    return { version: 2, layers: proceduralLayers.map(layer => ({ ...layer })) }
  }

  function syncProceduralOutputs() {
    document.getElementById('proceduralDetailValue').value = proceduralInputs.detail.value
    document.getElementById('proceduralDensityValue').value = proceduralInputs.density.value
    document.getElementById('proceduralVariationValue').value = Number(proceduralInputs.variation.value).toFixed(2)
    document.querySelectorAll('#islandStudio input[type="range"]').forEach(input => {
      const output = input.parentElement.querySelector('output')
      if (output) output.value = Number(input.value).toFixed(2)
    })
  }

  function syncProceduralRawEditor(){const area=document.getElementById('proceduralRawParameters');if(area&&proceduralLayers[activeProceduralLayer])area.value=JSON.stringify(proceduralLayers[activeProceduralLayer],null,2)}
  function ensureBloxdBlockDatalist(){const list=document.getElementById('bloxdBlockNames');if(list&&list.options.length===0)Object.entries(BLOXD_NAME_TO_ID).forEach(([name,id])=>{const option=document.createElement('option');option.value=`${name} (#${id})`;list.appendChild(option)})}
  function resolveBlockText(value){const text=String(value||'').trim(),match=text.match(/#(\d+)/),numeric=match?Number(match[1]):Number(text);if(Number.isFinite(numeric)&&numeric>0)return numeric;return Number(BLOXD_NAME_TO_ID[text])||0}
  function renderProceduralAdvanced(source=proceduralLayers[activeProceduralLayer]||{}){
    const details=document.getElementById('proceduralAdvanced');details.classList.toggle('is-hidden',!voxelWorld);if(!voxelWorld)return
    ensureBloxdBlockDatalist();const type=source.type||activeProceduralType,schema=BloxdProceduralAdvanced.SCHEMAS[type]||{},parameters=document.getElementById('proceduralAdvancedParameters')
    parameters.replaceChildren(...Object.entries(schema).map(([key,item])=>{const label=document.createElement('label'),title=document.createElement('span');title.textContent=item.label;const input=document.createElement('input');input.dataset.advancedParameter=key;input.type=item.type==='checkbox'?'checkbox':'number';if(item.type==='checkbox')input.checked=source[key]==null?Boolean(item.value):Boolean(source[key]);else{input.min=item.min;input.max=item.max;input.step=item.step;input.value=source[key]==null?item.value:source[key]}input.addEventListener('input',()=>{const layer=proceduralLayers[activeProceduralLayer];layer[key]=item.type==='checkbox'?input.checked:Number(input.value);syncProceduralRawEditor();scheduleProceduralPreview()});label.append(title,input);if(item.help){const help=document.createElement('small');help.textContent=item.help;label.append(help)}return label}))
    const slots=document.getElementById('proceduralMaterialSlots'),roles=BloxdProceduralGenerators.MATERIAL_SLOTS[type]||['primary','secondary'];source.materialRules=source.materialRules||{}
    const defaults=BloxdProceduralGenerators.defaultMaterials(source)
    slots.replaceChildren(...roles.map(role=>{
      const rule=source.materialRules[role]||{mode:'default'},defaultId=defaults[role]||defaults.primary,card=document.createElement('div');card.className='procedural-material-slot';card.dataset.materialRole=role
      const head=document.createElement('div');head.className='procedural-material-slot__head'
      const identity=document.createElement('div');identity.className='procedural-material-identity';const defaultSwatch=document.createElement('span');defaultSwatch.className='procedural-material-default-swatch';defaultSwatch.style.background=`#${BloxdBlockColors.hex(defaultId).toString(16).padStart(6,'0')}`;const identityCopy=document.createElement('span'),name=document.createElement('strong'),original=document.createElement('small');name.textContent=BloxdProceduralGenerators.ROLE_LABELS[role]||role;original.textContent=`Normally: ${BLOXD_ID_TO_NAME[defaultId]||`Block #${defaultId}`} (#${defaultId})`;identityCopy.append(name,original);identity.append(defaultSwatch,identityCopy)
      const modeLabel=document.createElement('label');modeLabel.textContent='Generate this role as';const mode=document.createElement('select');mode.innerHTML='<option value="default">Keep original block</option><option value="block">Replace with one block</option><option value="palette">Vary with palette + noise</option>';mode.value=rule.mode||'default';modeLabel.append(mode);head.append(identity,modeLabel)
      const flow=document.createElement('div');flow.className='procedural-material-flow'
      const blockPanel=document.createElement('div');blockPanel.className='procedural-material-choice-panel';const blockIntro=document.createElement('p');blockIntro.textContent='Every generated block for this role becomes the exact block below.';const blockLine=document.createElement('div');blockLine.className='procedural-material-block-line';const block=document.createElement('input');block.setAttribute('list','bloxdBlockNames');block.placeholder='Search official block name or enter ID';if(rule.blockId)block.value=`${BLOXD_ID_TO_NAME[rule.blockId]||'Block'} (#${rule.blockId})`;const useActive=document.createElement('button');useActive.type='button';useActive.textContent='Use active editor block';blockLine.append(block,useActive);blockPanel.append(blockIntro,blockLine)
      const palettePanel=document.createElement('div');palettePanel.className='procedural-material-choice-panel procedural-material-palette-panel';const paletteIntro=document.createElement('p');paletteIntro.textContent='At each generated coordinate, noise chooses one block from this weighted palette. The generator shape does not change.'
      const paletteActions=document.createElement('div');paletteActions.className='procedural-material-palette-actions';const capture=document.createElement('button');capture.type='button';capture.textContent='1. Capture editor palette';const generate=document.createElement('button');generate.type='button';generate.textContent='1. Generate near layer color';const addActive=document.createElement('button');addActive.type='button';addActive.textContent='+ Add active block';paletteActions.append(capture,generate,addActive)
      const chips=document.createElement('div');chips.className='procedural-material-chips procedural-material-chips--detailed'
      const noiseHeading=document.createElement('strong');noiseHeading.className='procedural-material-step';noiseHeading.textContent='2. Choose how the palette is distributed'
      const noiseControls=document.createElement('div');noiseControls.className='procedural-material-slot__controls';const noiseLabel=document.createElement('label');noiseLabel.textContent='Noise pattern';const noise=document.createElement('select');noise.innerHTML='<option value="fbm">Fractal Perlin — natural patches</option><option value="perlin">Perlin — smooth variation</option><option value="ridged">Ridged — sharp veins</option><option value="cellular">Cellular — stone-like cells</option><option value="value">Value — soft blobs</option><option value="random">Random — speckles</option><option value="checker">Checker — regular alternation</option><option value="stripes">Stripes — layered bands</option><option value="gradient">Gradient — changes by height/axis</option>';noise.value=rule.noise||'fbm';noiseLabel.append(noise);const seedLabel=document.createElement('label');seedLabel.textContent='Pattern seed';const seed=document.createElement('input');seed.value=rule.seed||`${source.seed}:${role}`;seedLabel.append(seed);const scaleLabel=document.createElement('label');scaleLabel.textContent='Patch size (blocks)';const scale=document.createElement('input');scale.type='number';scale.min='.25';scale.max='128';scale.step='.25';scale.value=rule.scale||6;scaleLabel.append(scale);noiseControls.append(noiseLabel,seedLabel,scaleLabel);palettePanel.append(paletteIntro,paletteActions,chips,noiseHeading,noiseControls)
      const result=document.createElement('div');result.className='procedural-material-result'
      const renderResult=()=>{const roleName=BloxdProceduralGenerators.ROLE_LABELS[role]||role;if(mode.value==='default')result.innerHTML=`<b>${roleName}</b> → keep <b>${BLOXD_ID_TO_NAME[defaultId]||`Block #${defaultId}`}</b>`;else if(mode.value==='block'){const chosen=resolveBlockText(block.value);result.innerHTML=`<b>${roleName}</b> → always use <b>${BLOXD_ID_TO_NAME[chosen]||'choose a block above'}</b>`}else result.innerHTML=`<b>${roleName}</b> → choose among <b>${(rule.palette||[]).length} palette blocks</b> using <b>${noise.options[noise.selectedIndex].text.split(' — ')[0]}</b> noise`}
      const save=()=>{const layer=proceduralLayers[activeProceduralLayer];layer.materialRules=layer.materialRules||{};rule.mode=mode.value;rule.noise=noise.value;rule.seed=seed.value;rule.scale=Number(scale.value)||6;if(mode.value==='block')rule.blockId=resolveBlockText(block.value);layer.materialRules[role]=rule;renderResult();syncProceduralRawEditor();scheduleProceduralPreview()}
      const renderChips=()=>{if(!(rule.palette||[]).length){const empty=document.createElement('div');empty.className='procedural-material-empty';empty.textContent='No palette blocks yet. Capture, generate, or add the active block.';chips.replaceChildren(empty);return}chips.replaceChildren(...rule.palette.map((entry,index)=>{const chip=document.createElement('div');chip.className='procedural-material-chip-detail';const swatch=document.createElement('span');swatch.style.background=`#${BloxdBlockColors.hex(entry.id).toString(16).padStart(6,'0')}`;const chipName=document.createElement('b');chipName.textContent=BLOXD_ID_TO_NAME[entry.id]||`Block #${entry.id}`;const weight=document.createElement('label');weight.textContent='Weight';const weightInput=document.createElement('input');weightInput.type='number';weightInput.min='.01';weightInput.max='20';weightInput.step='.1';weightInput.value=entry.weight||1;weightInput.addEventListener('change',()=>{entry.weight=Math.max(.01,Number(weightInput.value)||1);save()});weight.append(weightInput);const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.title='Remove from this palette';remove.addEventListener('click',()=>{rule.palette.splice(index,1);renderChips();save()});chip.append(swatch,chipName,weight,remove);return chip}))}
      const updateVisibility=()=>{blockPanel.classList.toggle('is-hidden',mode.value!=='block');palettePanel.classList.toggle('is-hidden',mode.value!=='palette');renderResult()}
      mode.addEventListener('change',()=>{updateVisibility();save()});block.addEventListener('input',renderResult);block.addEventListener('change',save);useActive.addEventListener('click',()=>{block.value=`${BLOXD_ID_TO_NAME[voxelWorld.currentBlockId]||'Block'} (#${voxelWorld.currentBlockId})`;save()});noise.addEventListener('change',save);seed.addEventListener('change',save);scale.addEventListener('input',save)
      capture.addEventListener('click',()=>{rule.palette=(voxelWorld.texturePalette||[]).map(item=>({...item}));if(rule.palette.length<2){const near=BloxdTextureEngine.generateNearRgb(source.primary||'#668866',6,'safe',70);rule.palette=near.map(item=>({id:item.id,weight:item.weight}))}renderChips();save()})
      generate.addEventListener('click',()=>{const color=role==='secondary'?source.secondary:source.primary,near=BloxdTextureEngine.generateNearRgb(color||'#668866',6,'safe',70);rule.palette=near.map(item=>({id:item.id,weight:Number(item.weight.toFixed(2))}));renderChips();save()})
      addActive.addEventListener('click',()=>{rule.palette=rule.palette||[];const existing=rule.palette.find(item=>item.id===voxelWorld.currentBlockId);if(existing)existing.weight=(existing.weight||1)+1;else rule.palette.push({id:voxelWorld.currentBlockId,weight:1});renderChips();save()})
      card.append(head,flow,blockPanel,palettePanel,result);renderChips();updateVisibility();return card
    }))
    syncProceduralRawEditor()
  }
  document.getElementById('resetProceduralMaterials').addEventListener('click',()=>{const layer=proceduralLayers[activeProceduralLayer];if(!layer)return;layer.materialRules={};renderProceduralAdvanced(layer);scheduleProceduralPreview();showProjectStatus('All generated block roles reset to their original blocks')})
  document.getElementById('captureProceduralPaletteAll').addEventListener('click',()=>{const layer=proceduralLayers[activeProceduralLayer];if(!layer||!voxelWorld)return;if((voxelWorld.texturePalette||[]).length<2)return showProjectStatus('Build a palette with at least two blocks in Palette Texture Studio first.',true);layer.materialRules=layer.materialRules||{};(BloxdProceduralGenerators.MATERIAL_SLOTS[layer.type]||[]).forEach(role=>{layer.materialRules[role]={mode:'palette',palette:voxelWorld.texturePalette.map(item=>({...item})),noise:'fbm',seed:`${layer.seed}:${role}`,scale:6}});renderProceduralAdvanced(layer);scheduleProceduralPreview();showProjectStatus('Editor palette applied to every visible generator role')})
  document.querySelector('.procedural-advanced-tabs').addEventListener('click',event=>{const button=event.target.closest('[data-procedural-advanced-tab]');if(!button)return;document.querySelectorAll('[data-procedural-advanced-tab]').forEach(item=>item.classList.toggle('is-active',item===button));document.querySelectorAll('[data-procedural-advanced-page]').forEach(page=>page.classList.toggle('is-hidden',page.dataset.proceduralAdvancedPage!==button.dataset.proceduralAdvancedTab))})
  document.getElementById('applyProceduralRaw').addEventListener('click',()=>{try{const parsed=JSON.parse(document.getElementById('proceduralRawParameters').value);if(!parsed||parsed.type!==activeProceduralType)throw new Error(`Layer type must remain ${activeProceduralType}.`);proceduralLayers[activeProceduralLayer]={...defaultProceduralLayer(activeProceduralType),...parsed};loadProceduralControls(activeProceduralType,proceduralLayers[activeProceduralLayer],false);scheduleProceduralPreview();showProjectStatus('Advanced procedural JSON applied')}catch(error){showProjectStatus(`Invalid procedural JSON: ${error.message}`,true)}})

  function loadProceduralControls(type, data, updateLayer = true) {
    activeProceduralType = type
    const definition = proceduralDefinition(type)
    const source = { ...defaultProceduralLayer(type), ...(data || {}) }
    const values = ProceduralGenerators.normalizedParams(type, source)
    if(voxelWorld&&type==='island'&&source.biome)values.biome=source.biome
    Object.keys(proceduralInputs).forEach(key => { proceduralInputs[key].value = values[key] })
    compositionInputs.pattern.value = source.pattern || 'single'
    compositionInputs.instances.value = source.instances || 1
    compositionInputs.spread.value = source.spread == null ? 6 : source.spread
    compositionInputs.layerScale.value = source.layerScale || 1
    compositionInputs.offsetY.value = source.offsetY || 0
    compositionInputs.rotation.value = source.rotation || 0
    document.getElementById('islandStudio').classList.toggle('is-hidden', type !== 'island')
    if (type === 'island') {
      document.getElementById('bloxdFastTexturing').checked=Boolean(source.fastTexturing)
      Object.entries(islandInputs).forEach(([key, input]) => {
        if (!(key in values)) return
        if (input.type === 'checkbox') input.checked = Boolean(values[key])
        else input.value = values[key]
      })
      requestAnimationFrame(drawBloxdIslandMap)
    }
    document.getElementById('proceduralIcon').textContent = definition.icon
    document.getElementById('proceduralName').textContent = definition.name
    document.getElementById('proceduralDescription').textContent = definition.description
    syncProceduralOutputs()
    if (updateLayer && proceduralLayers.length) proceduralLayers[activeProceduralLayer] = proceduralDataFromInputs()
    renderProceduralList()
    renderProceduralLayerTabs()
    renderProceduralAdvanced(source)
  }

  function renderProceduralCategories() {
    const categories = ['All', ...new Set(ProceduralGenerators.DEFINITIONS.map(item => item.category))]
    proceduralCategories.replaceChildren(...categories.map(category => {
      const button = document.createElement('button')
      button.type = 'button'; button.textContent = category; button.dataset.proceduralCategory = category
      button.classList.toggle('is-active', category === activeProceduralCategory)
      return button
    }))
  }

  function renderProceduralList() {
    const query = proceduralSearch.value.trim().toLowerCase()
    const items = ProceduralGenerators.DEFINITIONS.filter(item => (!voxelWorld||!['tree','village'].includes(item.id))&&(activeProceduralCategory === 'All' || item.category === activeProceduralCategory) && (!query || `${item.name} ${item.category} ${item.description}`.toLowerCase().includes(query)))
    proceduralList.replaceChildren(...items.map(item => {
      const card = document.createElement('button')
      card.type = 'button'; card.className = 'procedural-card'; card.dataset.proceduralType = item.id
      card.classList.toggle('is-active', item.id === activeProceduralType)
      const icon = document.createElement('span'); icon.className = 'procedural-card__icon'; icon.textContent = item.icon
      const copy = document.createElement('span'); copy.innerHTML = `<strong>${item.name}</strong><small>${item.category}</small>`
      card.append(icon, copy); return card
    }))
  }

  function renderProceduralLayerTabs() {
    const container = document.getElementById('proceduralLayerTabs')
    container.replaceChildren(...proceduralLayers.map((layer, index) => {
      const definition = proceduralDefinition(layer.type)
      const button = document.createElement('button')
      button.type = 'button'; button.dataset.proceduralLayer = index
      button.textContent = `${index + 1}. ${definition.name}${layer.instances > 1 ? ` ×${layer.instances}` : ''}`
      button.classList.toggle('is-active', index === activeProceduralLayer)
      return button
    }))
    document.getElementById('removeProceduralLayer').disabled = proceduralLayers.length <= 1
  }

  function disposeObjectResources(root) {
    const geometries = new Set(), materials = new Set()
    root.traverse(child => {
      if (!child.isMesh) return
      if (child.geometry) geometries.add(child.geometry)
      const list = Array.isArray(child.material) ? child.material : [child.material]
      list.filter(Boolean).forEach(material => materials.add(material))
    })
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose())
  }

  function buildProceduralComposition(recipe, preview = false) {
    const root = new THREE.Group()
    let totalInstances = 0
    recipe.layers.forEach((layer, layerIndex) => {
      const count = preview ? Math.min(layer.instances, 8) : layer.instances
      totalInstances += count
      if (totalInstances > (preview ? 24 : 80)) throw new Error(`Composition has too many instances (${totalInstances}). Reduce layer instance counts.`)
      const random = ProceduralGenerators.randomFactory(`${layer.seed}:scatter`)
      const gridWidth = Math.ceil(Math.sqrt(count))
      for (let i = 0; i < count; i++) {
        const params = {
          ...layer,
          seed: count > 1 ? `${layer.seed}:${i}` : layer.seed,
          detail: preview ? Math.min(layer.detail, 6) : layer.detail,
          density: preview ? Math.min(layer.density, 7) : layer.density,
          islandResolution: preview ? Math.min(layer.islandResolution || 64, 52) : layer.islandResolution,
          vegetation: preview ? Math.min(layer.vegetation == null ? 0.68 : layer.vegetation, 0.32) : layer.vegetation,
          rockDensity: preview ? Math.min(layer.rockDensity == null ? 0.3 : layer.rockDensity, 0.24) : layer.rockDensity,
          reefDensity: preview ? Math.min(layer.reefDensity == null ? 0.35 : layer.reefDensity, 0.25) : layer.reefDensity,
          settlementDensity: preview ? Math.min(layer.settlementDensity == null ? 0.12 : layer.settlementDensity, 0.2) : layer.settlementDensity,
          chunkCount: preview ? Math.min(layer.chunkCount || 1, 2) : layer.chunkCount,
          chunkResolution: preview ? Math.min(layer.chunkResolution || 28, 18) : layer.chunkResolution,
          settlementCount: preview ? Math.min(layer.settlementCount || 0, 2) : layer.settlementCount,
          housesPerSettlement: preview ? Math.min(layer.housesPerSettlement || 8, 4) : layer.housesPerSettlement,
          treeMaxCount: preview ? Math.min(layer.treeMaxCount || 6000, 60) : layer.treeMaxCount,
          branchLevels: preview ? 1 : layer.branchLevels,
          canopyClusters: preview ? Math.min(layer.canopyClusters || 4, 2) : layer.canopyClusters,
          leavesPerTip: preview ? Math.min(layer.leavesPerTip || 12, 2) : layer.leavesPerTip
        }
        const object = layer.type === 'island' && globalThis.IslandWorldSystem
          ? IslandWorldSystem.generate(THREE, params)
          : ProceduralGenerators.generate(THREE, layer.type, params)
        delete object.userData.procedural
        let x = 0, z = 0
        if (layer.pattern === 'ring' && count > 1) { const angle = i / count * Math.PI * 2; x = Math.cos(angle) * layer.spread; z = Math.sin(angle) * layer.spread; object.rotation.y = -angle }
        if (layer.pattern === 'grid' && count > 1) { const spacing = layer.spread / Math.max(1, gridWidth - 1); x = (i % gridWidth - (gridWidth - 1) / 2) * spacing; z = (Math.floor(i / gridWidth) - (Math.ceil(count / gridWidth) - 1) / 2) * spacing }
        if (layer.pattern === 'random' && count > 1) { const angle = random() * Math.PI * 2, radius = Math.sqrt(random()) * layer.spread; x = Math.cos(angle) * radius; z = Math.sin(angle) * radius; object.rotation.y = random() * Math.PI * 2 }
        const jitter = count > 1 ? 0.82 + random() * 0.36 * layer.variation : 1
        object.position.set(x, layer.offsetY, z)
        object.rotation.y += layer.rotation * Math.PI / 180
        object.scale.setScalar(layer.layerScale * jitter)
        object.userData.proceduralLayer = layerIndex
        root.add(object)
      }
    })
    root.userData.procedural = JSON.parse(JSON.stringify(recipe))
    root.name = recipe.layers.length > 1 ? `Procedural Composition (${recipe.layers.length} layers)` : `${proceduralDefinition(recipe.layers[0].type).name} (Procedural)`
    return root
  }

  function initProceduralPreview() {
    if (proceduralPreviewRenderer) return
    const host = document.getElementById('proceduralPreview')
    proceduralPreviewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    proceduralPreviewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    proceduralPreviewRenderer.outputEncoding = THREE.sRGBEncoding
    proceduralPreviewRenderer.shadowMap.enabled = true
    host.appendChild(proceduralPreviewRenderer.domElement)
    proceduralPreviewScene = new THREE.Scene()
    proceduralPreviewCamera = new THREE.PerspectiveCamera(40, 2, 0.01, 1000)
    proceduralPreviewScene.add(new THREE.HemisphereLight(0xc8e8c8, 0x182018, 1.25))
    const light = new THREE.DirectionalLight(0xffffff, 1.1); light.position.set(5, 9, 7); proceduralPreviewScene.add(light)
    const grid = new THREE.GridHelper(30, 30, 0x315031, 0x1d2a1d); grid.position.y = -0.01; proceduralPreviewScene.add(grid)
  }

  function buildNativeBloxdPreview(blocks) {
    const root=new THREE.Group(),grouped=new Map(),limit=30000;let count=0
    blocks.forEach((id,key)=>{if(count++>=limit)return;if(!grouped.has(id))grouped.set(id,[]);grouped.get(id).push(BloxdVoxelEditor.parseKey(key))})
    const matrix=new THREE.Matrix4()
    grouped.forEach((points,id)=>{const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(.96,.96,.96),new THREE.MeshStandardMaterial({color:BloxdBlockColors.hex(id),roughness:.8}),points.length);points.forEach((point,index)=>{matrix.makeTranslation(point[0]+.5,point[1]+.5,point[2]+.5);mesh.setMatrixAt(index,matrix)});mesh.instanceMatrix.needsUpdate=true;root.add(mesh)})
    root.userData.nativeBloxdPreview=true;return root
  }

  function updateProceduralPreview() {
    if (!proceduralDialog.classList.contains('is-open')) return
    initProceduralPreview()
    if (proceduralPreviewModel) { proceduralPreviewScene.remove(proceduralPreviewModel); disposeObjectResources(proceduralPreviewModel) }
    try {
      if(voxelWorld){const result=BloxdProceduralGenerators.generateRecipeSync(currentProceduralRecipe(),{preview:true,blocksPerUnit:1,maxBlocks:30000});proceduralPreviewModel=buildNativeBloxdPreview(result.blocks);proceduralStats.textContent=`Native Bloxd preview · ${result.blockCount.toLocaleString()} direct blocks · no mesh conversion`}
      else proceduralPreviewModel = buildProceduralComposition(currentProceduralRecipe(), true)
      proceduralPreviewScene.add(proceduralPreviewModel)
      const bounds = new THREE.Box3().setFromObject(proceduralPreviewModel), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3()), radius = Math.max(size.x, size.y, size.z, 1)
      proceduralPreviewCamera.position.set(center.x + radius * 1.25, center.y + radius * 0.9, center.z + radius * 1.45)
      proceduralPreviewCamera.near = Math.max(0.01, radius / 100); proceduralPreviewCamera.far = radius * 20; proceduralPreviewCamera.lookAt(center); proceduralPreviewCamera.updateProjectionMatrix()
      renderProceduralPreview()
    } catch (error) { proceduralStats.textContent = `Preview: ${error.message}` }
  }

  function renderProceduralPreview() {
    if (!proceduralPreviewRenderer || !proceduralDialog.classList.contains('is-open')) return
    const host = document.getElementById('proceduralPreview'), width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight)
    proceduralPreviewRenderer.setSize(width, height, false); proceduralPreviewCamera.aspect = width / height; proceduralPreviewCamera.updateProjectionMatrix()
    proceduralPreviewRenderer.render(proceduralPreviewScene, proceduralPreviewCamera)
  }

  function scheduleProceduralPreview() {
    clearTimeout(proceduralPreviewTimer)
    proceduralPreviewTimer = setTimeout(updateProceduralPreview, 450)
  }

  function updateSavedProceduralPresets() {
    const select = document.getElementById('proceduralPresetSelect')
    let presets = {}
    try { presets = JSON.parse(localStorage.getItem('shapeStudioProceduralPresets') || '{}') } catch (error) {}
    select.replaceChildren(new Option('Saved presets…', ''), ...Object.keys(presets).sort().map(name => new Option(name, name)))
  }

  function setProceduralDialog(open) {
    proceduralDialog.classList.toggle('is-open', open); proceduralDialog.setAttribute('aria-hidden', String(!open))
    if (!open) {
      clearTimeout(proceduralPreviewTimer)
      if (proceduralPreviewModel && proceduralPreviewScene) {
        proceduralPreviewScene.remove(proceduralPreviewModel)
        disposeObjectResources(proceduralPreviewModel)
        proceduralPreviewModel = null
      }
      return
    }
    const liveData = selectedCube && selectedCube.mesh.userData && selectedCube.mesh.userData.procedural
    syncIslandBiomeOptions();proceduralSearch.placeholder=voxelWorld?'Search 14 native generators…':'Search 16 generators…'
    activeProceduralCategory = 'All'; proceduralSearch.value = ''; renderProceduralCategories()
    const recipe = normalizedProceduralRecipe(liveData)
    if(voxelWorld){recipe.layers=recipe.layers.filter(layer=>!['tree','village'].includes(layer.type));if(!recipe.layers.length)recipe.layers=[defaultProceduralLayer('island')]}
    proceduralLayers = recipe.layers; activeProceduralLayer = 0
    loadProceduralControls(proceduralLayers[0].type, proceduralLayers[0], false)
    if (liveData) {
      generateProceduralButton.textContent = 'Apply composition'; bakeProceduralButton.classList.remove('is-hidden')
      document.getElementById('proceduralNote').textContent = 'Live composition: edit layers, scattering, seeds, or generator families. Apply replaces generated geometry while preserving transform and hierarchy.'
    } else {
      generateProceduralButton.textContent = voxelWorld ? 'Generate directly as Bloxd blocks' : 'Generate composition'; bakeProceduralButton.classList.add('is-hidden')
      document.getElementById('proceduralNote').textContent = voxelWorld
        ? 'Native Bloxd engine: this recipe writes official block IDs directly into a sparse block map. It creates no triangle meshes and performs no voxel-conversion pass.'
        : 'Build a layered composition, scatter instances, inspect the live preview, then generate it as one selectable procedural object.'
    }
    document.querySelector('.procedural-preview__badge').textContent = voxelWorld ? 'NATIVE BLOXD BLOCK PREVIEW' : 'LIVE PREVIEW'
    proceduralStats.textContent = voxelWorld ? 'Native block preview uses a performance-limited block count.' : 'Live preview uses a performance-limited quality level.'
    updateSavedProceduralPresets()
    requestAnimationFrame(updateProceduralPreview)
  }

  function proceduralObjectStats(root) {
    let meshes = 0, vertices = 0, triangles = 0
    const features = {}
    let forestDetail = null
    root.traverse(child => {
      if (child.userData && child.userData.forestDetail) forestDetail = child.userData.forestDetail
      if (!child.isMesh || !child.geometry) return
      meshes++; const positions = child.geometry.getAttribute('position'); if (positions) vertices += positions.count
      triangles += child.geometry.index ? child.geometry.index.count / 3 : (positions ? positions.count / 3 : 0)
      const feature = child.userData && child.userData.islandFeature
      if (feature) features[feature] = (features[feature] || 0) + 1
    })
    return { meshes, vertices: Math.round(vertices), triangles: Math.round(triangles), features, forestDetail }
  }

  function regenerateProceduralShape(modelShape, generated, recipe) {
    const root = modelShape.mesh
    while (root.children.length) { const child = root.children.pop(); disposeObjectResources(child); child.parent = null }
    while (generated.children.length) root.add(generated.children[0])
    root.userData.procedural = JSON.parse(JSON.stringify(recipe)); root.name = generated.name
    modelShape.shapeType = recipe.layers.length > 1 ? 'procedural:composition' : `procedural:${recipe.layers[0].type}`
    modelShape.shapeName = generated.name; modelShape.isImported = true; modelShape.updateOutline()
  }

  function generateProceduralObject() {
    const recipe = currentProceduralRecipe()
    generateProceduralButton.disabled = true; proceduralStats.textContent = 'Building full-quality composition…'
    requestAnimationFrame(async () => {
      try {
        if (voxelWorld) {
          const started=performance.now(),remaining=Math.max(1000,2000000-voxelWorld.size)
          const result=await BloxdProceduralGenerators.generateRecipe(recipe,{blocksPerUnit:voxelWorld.globalBlocksPerUnit,maxBlocks:remaining},(progress,stats)=>{proceduralStats.textContent=`Native Bloxd generation… ${Math.round(progress*100)}% · ${stats.blocks.toLocaleString()} blocks`})
          result.blocks.forEach((id,key)=>voxelWorld.blocks.set(key,id));voxelWorld.render();voxelWorld.commit('Native Bloxd procedural generation');syncVoxelUI();scheduleAutosave('Native Bloxd procedural generation')
          const elapsed=performance.now()-started,clipped=result.clipped?' · limit reached':''
          proceduralStats.textContent=`${result.blockCount.toLocaleString()} direct blocks · ${result.instances} instance${result.instances===1?'':'s'} · ${elapsed.toFixed(0)} ms · native engine${clipped}`
          generateProceduralButton.textContent = 'Generate directly as Bloxd blocks'
          showProjectStatus(`Native engine added ${result.blockCount.toLocaleString()} blocks in ${elapsed.toFixed(0)} ms`)
          return
        }
        const generated = buildProceduralComposition(recipe, false)
        const liveTarget = selectedCube && selectedCube.mesh.userData && selectedCube.mesh.userData.procedural ? selectedCube : null
        if (liveTarget) { regenerateProceduralShape(liveTarget, generated, recipe); selectCube(liveTarget) }
        else {
          const modelShape = new ModelShape('imported', new THREE.Vector3(), generated, generated.name)
          modelShape.shapeType = recipe.layers.length > 1 ? 'procedural:composition' : `procedural:${recipe.layers[0].type}`
          modelShape.isImported = true; cubes.push(modelShape); selectCube(modelShape); updateCubeCount()
        }
        const stats = proceduralObjectStats(selectedCube.mesh), instances = recipe.layers.reduce((sum, layer) => sum + layer.instances, 0)
        const islandSummary = stats.features.terrain ? ` · ${stats.features.river || 0} rivers · ${stats.features.rock || 0} rocks · ${stats.features.settlement || 0} settlement pieces` : ''
        const forestSummary = stats.forestDetail ? ` · ${stats.forestDetail.trees.toLocaleString()} trees · ${stats.forestDetail.recursiveBranches.toLocaleString()} branches · ${stats.forestDetail.texturedLeaves.toLocaleString()} textured branch leaves · ${stats.forestDetail.leafClusters.toLocaleString()} canopy clusters · ${stats.forestDetail.fruit.toLocaleString()} fruit/blossoms · ${stats.forestDetail.vines.toLocaleString()} vines` : ''
        proceduralStats.textContent = `${recipe.layers.length} layer${recipe.layers.length === 1 ? '' : 's'} · ${instances} instance${instances === 1 ? '' : 's'} · ${stats.meshes.toLocaleString()} meshes · ${stats.vertices.toLocaleString()} vertices · ${stats.triangles.toLocaleString()} triangles${islandSummary}${forestSummary}`
        generateProceduralButton.textContent = 'Apply composition'; bakeProceduralButton.classList.remove('is-hidden')
        renderHierarchy(); updateStatistics(); commitHistory(liveTarget ? 'Update procedural composition' : 'Generate procedural composition'); showProjectStatus('Procedural composition generated')
      } catch (error) { console.error('Procedural generation failed:', error); proceduralStats.textContent = `Generation failed: ${error.message}` }
      finally { generateProceduralButton.disabled = false }
    })
  }

  ;[...Object.values(proceduralInputs), ...Object.values(compositionInputs), ...Object.values(islandInputs)].forEach(input => input.addEventListener('input', () => { syncProceduralOutputs(); scheduleProceduralPreview() }))
  proceduralSearch.addEventListener('input', renderProceduralList)
  proceduralCategories.addEventListener('click', event => { const button = event.target.closest('[data-procedural-category]'); if (!button) return; activeProceduralCategory = button.dataset.proceduralCategory; renderProceduralCategories(); renderProceduralList() })
  proceduralList.addEventListener('click', event => {
    const card = event.target.closest('[data-procedural-type]'); if (!card) return
    loadProceduralControls(card.dataset.proceduralType, defaultProceduralLayer(card.dataset.proceduralType)); scheduleProceduralPreview()
  })
  document.getElementById('proceduralLayerTabs').addEventListener('click', event => {
    const button = event.target.closest('[data-procedural-layer]'); if (!button) return
    syncActiveProceduralLayer(); activeProceduralLayer = Number(button.dataset.proceduralLayer)
    const layer = proceduralLayers[activeProceduralLayer]; loadProceduralControls(layer.type, layer, false)
  })
  document.getElementById('addProceduralLayer').addEventListener('click', () => {
    syncActiveProceduralLayer(); if (proceduralLayers.length >= 8) return showProjectStatus('A composition supports up to 8 layers.', true)
    proceduralLayers.push(defaultProceduralLayer(activeProceduralType)); activeProceduralLayer = proceduralLayers.length - 1
    loadProceduralControls(proceduralLayers[activeProceduralLayer].type, proceduralLayers[activeProceduralLayer], false); scheduleProceduralPreview()
  })
  document.getElementById('duplicateProceduralLayer').addEventListener('click', () => {
    syncActiveProceduralLayer(); if (proceduralLayers.length >= 8) return showProjectStatus('A composition supports up to 8 layers.', true)
    proceduralLayers.splice(activeProceduralLayer + 1, 0, { ...proceduralLayers[activeProceduralLayer], seed: `${proceduralLayers[activeProceduralLayer].seed}-copy` }); activeProceduralLayer++
    loadProceduralControls(proceduralLayers[activeProceduralLayer].type, proceduralLayers[activeProceduralLayer], false); scheduleProceduralPreview()
  })
  document.getElementById('removeProceduralLayer').addEventListener('click', () => {
    if (proceduralLayers.length <= 1) return
    proceduralLayers.splice(activeProceduralLayer, 1); activeProceduralLayer = Math.max(0, activeProceduralLayer - 1)
    loadProceduralControls(proceduralLayers[activeProceduralLayer].type, proceduralLayers[activeProceduralLayer], false); scheduleProceduralPreview()
  })
  document.getElementById('randomizeProceduralSeed').addEventListener('click', () => { proceduralInputs.seed.value = String(Math.floor(Math.random() * 1000000000)); scheduleProceduralPreview() })
  document.getElementById('randomProceduralType').addEventListener('click', () => { const d = ProceduralGenerators.DEFINITIONS.filter(item=>!voxelWorld||!['tree','village'].includes(item.id)); const type = d[Math.floor(Math.random() * d.length)].id; loadProceduralControls(type, defaultProceduralLayer(type)); scheduleProceduralPreview() })
  document.querySelectorAll('[data-seed-mutation]').forEach(button => button.addEventListener('click', () => { proceduralInputs.seed.value = `${proceduralInputs.seed.value.split('~')[0]}~${button.dataset.seedMutation}`; scheduleProceduralPreview() }))
  const islandWorldPresets = {
    tropical: { islandStyle: 'archipelago', islandCount: 4, coastRoughness: .72, mountainStrength: .58, peakSharpness: .5, terracing: .02, erosion: .55, crater: 0, beachWidth: .13, oceanDepth: .55, riverCount: 4, riverDepth: .12, reefDensity: .72, waterEnabled: true, waterColor: '#1d9fc3', biome: 'tropical', moisture: .86, temperature: .88, snowLine: .95, vegetation: .9, rockDensity: .2, settlementDensity: .2, primary: '#438746', secondary: '#e3cf83' },
    volcanic: { islandStyle: 'volcanic', islandCount: 2, coastRoughness: .82, mountainStrength: .96, peakSharpness: .78, terracing: .12, erosion: .42, crater: .82, beachWidth: .035, oceanDepth: .72, riverCount: 1, riverDepth: .08, reefDensity: .05, waterEnabled: true, waterColor: '#174b67', biome: 'arid', moisture: .2, temperature: .92, snowLine: .98, vegetation: .08, rockDensity: .92, settlementDensity: .03, primary: '#4d463e', secondary: '#b65a34' },
    atoll: { islandStyle: 'atoll', islandCount: 6, coastRoughness: .62, mountainStrength: .08, peakSharpness: .2, terracing: 0, erosion: .3, crater: 0, beachWidth: .18, oceanDepth: .38, riverCount: 0, riverDepth: 0, reefDensity: 1, waterEnabled: true, waterColor: '#25a9c8', biome: 'tropical', moisture: .78, temperature: .92, snowLine: 1, vegetation: .62, rockDensity: .08, settlementDensity: .22, primary: '#55a44f', secondary: '#ead996' },
    alpine: { islandStyle: 'cliffs', islandCount: 2, coastRoughness: .7, mountainStrength: .92, peakSharpness: .86, terracing: .08, erosion: .72, crater: .05, beachWidth: .035, oceanDepth: .8, riverCount: 6, riverDepth: .18, reefDensity: .03, waterEnabled: true, waterColor: '#315f83', biome: 'alpine', moisture: .7, temperature: .2, snowLine: .48, vegetation: .35, rockDensity: .78, settlementDensity: .04, primary: '#426847', secondary: '#8f9295' },
    alien: { islandStyle: 'natural', islandCount: 5, coastRoughness: .95, mountainStrength: .82, peakSharpness: .72, terracing: .55, erosion: .25, crater: .42, beachWidth: .08, oceanDepth: .7, riverCount: 5, riverDepth: .16, reefDensity: .8, waterEnabled: true, waterColor: '#6d35c7', biome: 'alien', moisture: .62, temperature: .55, snowLine: .72, vegetation: .76, rockDensity: .62, settlementDensity: .15, primary: '#32b38e', secondary: '#c461d5' }
  }
  function applyIslandWorldValues(values) {
    Object.entries(values).forEach(([key, value]) => {
      if (proceduralInputs[key]) proceduralInputs[key].value = value
      const input = islandInputs[key]
      if (!input) return
      if (input.type === 'checkbox') input.checked = Boolean(value)
      else input.value = value
    })
    syncProceduralOutputs(); scheduleProceduralPreview()
  }
  document.querySelectorAll('[data-island-preset]').forEach(button => button.addEventListener('click', () => applyIslandWorldValues(islandWorldPresets[button.dataset.islandPreset])))
  const treeSystemPresets = {
    oldgrowth: { treeSpecies: 'mixed', forestClustering: .72, treeScale: 1.35, treeAge: 1.55, trunkTaper: .78, trunkTwist: .42, branchComplexity: .85, branchLevels: 4, branchSpread: 1.05, branchDroop: .12, rootSpread: 1.65, canopyClusters: 6, canopyFullness: 1.3, leafScale: 1.15, leafColorVariation: .32, treeSeason: 'summer', leafMode: 'both', leafGeometry: 'sphere', leafShape: 'oval', leavesPerTip: 14, leafCardSize: .85, leafOpacity: .95, leafVeins: .65, leafJitter: .7, leafTextureEnabled: true, fruitDensity: .08, vineDensity: .15, fallenLogDensity: .16, stumpDensity: .08, giantTreeChance: .025, giantTreeScale: 3.2 },
    jungle: { treeSpecies: 'mixed', forestClustering: .9, treeScale: 1.2, treeAge: 1.15, trunkTaper: .62, trunkTwist: .5, branchComplexity: .95, branchLevels: 4, branchSpread: 1.25, branchDroop: .28, rootSpread: 2.1, canopyClusters: 8, canopyFullness: 1.65, leafScale: 1.2, leafColorVariation: .22, treeSeason: 'summer', leafMode: 'cards', leafGeometry: 'sphere', leafShape: 'round', leavesPerTip: 24, leafCardSize: 1, leafOpacity: .92, leafVeins: .8, leafJitter: .9, leafTextureEnabled: true, fruitDensity: .2, vineDensity: .85, fallenLogDensity: .09, stumpDensity: .03, giantTreeChance: .018, giantTreeScale: 3.8 },
    orchard: { treeSpecies: 'oak', forestClustering: .3, treeScale: .8, treeAge: .85, trunkTaper: .7, trunkTwist: .1, branchComplexity: .58, branchLevels: 3, branchSpread: 1.1, branchDroop: .1, rootSpread: .65, canopyClusters: 5, canopyFullness: 1.15, leafScale: .85, leafColorVariation: .15, treeSeason: 'spring', leafMode: 'cards', leafGeometry: 'sphere', leafShape: 'round', leavesPerTip: 18, leafCardSize: .75, leafOpacity: .95, leafVeins: .5, leafJitter: .55, leafTextureEnabled: true, fruitDensity: 1, vineDensity: 0, fallenLogDensity: 0, stumpDensity: 0, giantTreeChance: 0, giantTreeScale: 1 },
    haunted: { treeSpecies: 'deadwood', forestClustering: .68, treeScale: 1.25, treeAge: 1.5, trunkTaper: .85, trunkTwist: .9, branchComplexity: .9, branchLevels: 5, branchSpread: 1.35, branchDroop: .65, rootSpread: 1.7, canopyClusters: 1, canopyFullness: .1, leafScale: .35, leafColorVariation: .7, treeSeason: 'winter', leafMode: 'none', leafGeometry: 'sphere', leafShape: 'serrated', leavesPerTip: 1, leafCardSize: .3, leafOpacity: .8, leafVeins: .8, leafJitter: 1, leafTextureEnabled: true, fruitDensity: 0, vineDensity: .38, fallenLogDensity: .35, stumpDensity: .24, deadTreeRatio: .5, giantTreeChance: .035, giantTreeScale: 3 },
    giants: { treeSpecies: 'cedar', forestClustering: .55, treeScale: 1.8, treeAge: 2.2, trunkTaper: .9, trunkTwist: .58, branchComplexity: 1, branchLevels: 5, branchSpread: 1.45, branchDroop: -.05, rootSpread: 2.5, canopyClusters: 9, canopyFullness: 1.75, leafScale: 1.6, leafColorVariation: .8, treeSeason: 'fantasy', leafMode: 'both', leafGeometry: 'sphere', leafShape: 'round', leavesPerTip: 28, leafCardSize: 1.25, leafOpacity: .9, leafVeins: 1, leafJitter: 1, leafTextureEnabled: true, fruitDensity: .5, vineDensity: .5, fallenLogDensity: .04, stumpDensity: .01, giantTreeChance: .16, giantTreeScale: 6 }
  }
  document.querySelectorAll('[data-tree-preset]').forEach(button => button.addEventListener('click', () => applyIslandWorldValues(treeSystemPresets[button.dataset.treePreset])))
  document.getElementById('randomizeIslandWorld').addEventListener('click', () => {
    const styles = ['natural','archipelago','volcanic','atoll','cliffs'], biomes = ['tropical','temperate','arid','alpine','alien']
    applyIslandWorldValues({
      islandStyle: styles[Math.floor(Math.random() * styles.length)], biome: biomes[Math.floor(Math.random() * biomes.length)], islandCount: 1 + Math.floor(Math.random() * 8),
      coastRoughness: Math.random(), mountainStrength: Math.random(), peakSharpness: Math.random(), terracing: Math.random() * .7, erosion: Math.random(), crater: Math.random(),
      beachWidth: Math.random() * .2, oceanDepth: .25 + Math.random() * .7, riverCount: Math.floor(Math.random() * 9), riverDepth: Math.random() * .25,
      reefDensity: Math.random(), moisture: Math.random(), temperature: Math.random(), snowLine: .4 + Math.random() * .58,
      vegetation: Math.random(), rockDensity: Math.random(), settlementDensity: Math.random() * .65,
      waterColor: `#${Math.floor(Math.random() * 0x7777ff + 0x113355).toString(16).slice(-6).padStart(6,'0')}`
    })
    proceduralInputs.seed.value = String(Math.floor(Math.random() * 1000000000)); scheduleProceduralPreview()
  })
  document.querySelectorAll('[data-procedural-preset]').forEach(button => button.addEventListener('click', () => {
    const preset = button.dataset.proceduralPreset
    if (preset === 'draft') { proceduralInputs.detail.value = 2; proceduralInputs.density.value = 3 }
    if (preset === 'balanced') { proceduralInputs.detail.value = 6; proceduralInputs.density.value = 6 }
    if (preset === 'detailed') { proceduralInputs.detail.value = 9; proceduralInputs.density.value = 9 }
    syncProceduralOutputs(); scheduleProceduralPreview()
  }))
  document.getElementById('saveProceduralPreset').addEventListener('click', () => {
    const name = document.getElementById('proceduralPresetName').value.trim(); if (!name) return showProjectStatus('Enter a preset name.', true)
    let presets = {}; try { presets = JSON.parse(localStorage.getItem('shapeStudioProceduralPresets') || '{}') } catch (error) {}
    presets[name] = currentProceduralRecipe(); localStorage.setItem('shapeStudioProceduralPresets', JSON.stringify(presets)); updateSavedProceduralPresets(); document.getElementById('proceduralPresetSelect').value = name; showProjectStatus(`Saved preset: ${name}`)
  })
  document.getElementById('proceduralPresetSelect').addEventListener('change', event => {
    if (!event.target.value) return
    let presets = {}; try { presets = JSON.parse(localStorage.getItem('shapeStudioProceduralPresets') || '{}') } catch (error) {}
    if (!presets[event.target.value]) return
    const recipe = normalizedProceduralRecipe(presets[event.target.value]); proceduralLayers = recipe.layers; activeProceduralLayer = 0
    loadProceduralControls(proceduralLayers[0].type, proceduralLayers[0], false); scheduleProceduralPreview()
  })
  document.getElementById('deleteProceduralPreset').addEventListener('click', () => {
    const select = document.getElementById('proceduralPresetSelect'), name = select.value; if (!name) return
    let presets = {}; try { presets = JSON.parse(localStorage.getItem('shapeStudioProceduralPresets') || '{}') } catch (error) {}
    delete presets[name]; localStorage.setItem('shapeStudioProceduralPresets', JSON.stringify(presets)); updateSavedProceduralPresets(); showProjectStatus(`Deleted preset: ${name}`)
  })
  document.querySelectorAll('[data-close-procedural]').forEach(button => button.addEventListener('click', () => setProceduralDialog(false)))
  generateProceduralButton.addEventListener('click', generateProceduralObject)
  bakeProceduralButton.addEventListener('click', () => {
    if (!selectedCube || !selectedCube.mesh.userData.procedural) return
    const recipe = selectedCube.mesh.userData.procedural
    if (globalThis.IslandWorldSystem && recipe.layers && recipe.layers.some(layer => layer.type === 'island')) {
      const expanded = IslandWorldSystem.bakeToMeshes(THREE, selectedCube.mesh)
      showProjectStatus(`Baked island: ${expanded.expandedInstances.toLocaleString()} ecosystem instances expanded`)
    }
    delete selectedCube.mesh.userData.procedural; selectedCube.shapeType = 'procedural-baked'; selectedCube.shapeName = selectedCube.shapeName.replace(' (Procedural)', ' (Baked)')
    renderHierarchy(); commitHistory('Bake procedural composition'); showProjectStatus('Composition baked to editable meshes'); setProceduralDialog(false)
  })


  function showShapePicker() {
    modelImportStatus.textContent = ''
    modelImportStatus.classList.remove('is-error')
    activeShapeCategory = 'All'
    shapeSearch.value = ''
    renderShapeCategories()
    renderShapeGrid()
    shapePicker.classList.add('is-open')
    shapePicker.setAttribute('aria-hidden', 'false')
    requestAnimationFrame(() => shapeSearch.focus())
  }

  function closeShapePicker() {
    shapePicker.classList.remove('is-open')
    shapePicker.setAttribute('aria-hidden', 'true')
  }

  shapeSearch.addEventListener('input', renderShapeGrid)

  shapeCategories.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-category]')
    if (!chip) return
    activeShapeCategory = chip.dataset.category
    renderShapeCategories()
    renderShapeGrid()
  })

  shapeGrid.addEventListener('click', async (event) => {
    const card = event.target.closest('[data-shape-id]')
    if (!card) return
    if (voxelWorld) {
      const temporary = new ModelShape(card.dataset.shapeId, new THREE.Vector3(0, .5, 0))
      try { await voxelizeObjectIntoWorld(temporary.mesh, `Add ${temporary.shapeName} blocks`, { materialMode: 'single' }) }
      finally { temporary.remove() }
      closeShapePicker(); return
    }
    createShape(card.dataset.shapeId)
    closeShapePicker()
    setTool('translate')
  })

  document.querySelectorAll('[data-close-picker]').forEach((element) => {
    element.addEventListener('click', closeShapePicker)
  })

  // ==========================================
  // OBJECT HIERARCHY, GROUPING & PARENTING
  // ==========================================

  function renderHierarchy() {
    if (!hierarchyList) return
    if (voxelWorld) {
      const counts = new Map()
      voxelWorld.blocks.forEach(id => counts.set(id, (counts.get(id) || 0) + 1))
      const groupRows=voxelWorld.groups.map(group=>{const row=document.createElement('button');row.type='button';row.className=`hierarchy-row ${voxelWorld.activeGroupId===group.id?'is-active':''}`;row.style.paddingLeft=`${10+(group.parentId?14:0)}px`;const icon=document.createElement('span');icon.textContent=group.hidden?'◌':group.locked?'▣':'⬡';const name=document.createElement('span');name.className='hierarchy-row__name';name.textContent=group.name;const amount=document.createElement('small');amount.textContent=`${group.keys.filter(key=>voxelWorld.blocks.has(key)).length}`;row.append(icon,name,amount);row.addEventListener('click',()=>{voxelWorld.activeGroupId=group.id;voxelWorld.selection=new Set(group.keys.filter(key=>voxelWorld.blocks.has(key)));voxelWorld.renderSelection();document.getElementById('objectName').value=group.name;renderHierarchy();syncVoxelUI()});return row})
      const typeRows=[...counts].sort((a,b)=>b[1]-a[1]).map(([id,count]) => {
        const row = document.createElement('button'); row.type='button'; row.className='hierarchy-row'
        const swatch=document.createElement('span');swatch.style.cssText=`width:12px;height:12px;border-radius:2px;background:#${BloxdBlockColors.hex(id).toString(16).padStart(6,'0')}`
        const name=document.createElement('span');name.className='hierarchy-row__name';name.textContent=BLOXD_ID_TO_NAME[id]||`Block ${id}`
        const amount=document.createElement('small');amount.textContent=count.toLocaleString();row.append(swatch,name,amount)
        row.addEventListener('click',()=>{voxelWorld.selection.clear();voxelWorld.blocks.forEach((value,key)=>{if(value===id)voxelWorld.selection.add(key)});voxelWorld.renderSelection();syncVoxelUI()})
        return row
      })
      hierarchyList.replaceChildren(...groupRows,...typeRows)
      if(!voxelWorld.activeGroupId)document.getElementById('objectName').value = 'Bloxd block groups & types'
      document.getElementById('groupObjects').textContent='Group blocks';document.getElementById('ungroupObjects').textContent='Delete group';document.getElementById('parentObjects').textContent='Parent group';document.getElementById('unparentObjects').textContent='Unparent'
      return
    }
    if (!cubes.length) {
      const empty = document.createElement('div')
      empty.className = 'hierarchy-empty'
      empty.textContent = 'No objects in the scene.'
      hierarchyList.replaceChildren(empty)
      return
    }

    const fragment = document.createDocumentFragment()
    const appendBranch = (modelShape, depth) => {
      const row = document.createElement('button')
      row.type = 'button'
      row.className = 'hierarchy-row'
      if (selectedShapes.has(modelShape)) row.classList.add('is-selected')
      if (selectedCube === modelShape) row.classList.add('is-active')
      if (modelShape.locked) row.classList.add('is-locked')
      if (!modelShape.mesh.visible) row.classList.add('is-hidden-object')
      row.dataset.shapeId = modelShape.id

      const indent = document.createElement('span')
      indent.className = 'hierarchy-row__indent'
      indent.style.width = `${depth * 14}px`
      const icon = document.createElement('span')
      icon.className = 'hierarchy-row__icon'
      icon.textContent = modelShape.isGroup ? '▾' : '◆'
      const name = document.createElement('span')
      name.className = 'hierarchy-row__name'
      name.textContent = modelShape.shapeName
      const type = document.createElement('span')
      type.className = 'hierarchy-row__type'
      type.textContent = modelShape.isGroup ? 'GROUP' : modelShape.shapeType.toUpperCase()
      const visibility = document.createElement('span')
      visibility.className = 'hierarchy-row__utility'; visibility.dataset.rowAction = 'visibility'; visibility.textContent = modelShape.mesh.visible ? '◉' : '○'; visibility.title = 'Toggle visibility'
      const lock = document.createElement('span')
      lock.className = 'hierarchy-row__utility'; lock.dataset.rowAction = 'lock'; lock.textContent = modelShape.locked ? '▣' : '□'; lock.title = 'Toggle lock'
      row.append(indent, icon, name, type, visibility, lock)
      fragment.appendChild(row)
      childModelShapes(modelShape).forEach(child => appendBranch(child, depth + 1))
    }

    cubes.filter(shape => !parentModelShape(shape)).forEach(shape => appendBranch(shape, 0))
    hierarchyList.replaceChildren(fragment)
  }

  function groupSelectedObjects() {
    const items = [...selectedShapes]
    if (items.length < 2) {
      showProjectStatus('Select at least two objects to group.', true)
      return
    }

    const center = new THREE.Vector3()
    items.forEach(item => center.add(new THREE.Box3().setFromObject(item.mesh).getCenter(new THREE.Vector3())))
    center.multiplyScalar(1 / items.length)

    const groupObject = new THREE.Group()
    const group = new ModelShape('imported', center, groupObject, `Group ${cubes.filter(item => item.isGroup).length + 1}`)
    group.shapeType = 'group'
    group.isImported = false
    group.isGroup = true
    cubes.push(group)
    items.forEach(item => group.mesh.attach(item.mesh))
    selectCube(group)
    updateCubeCount()
    commitHistory('Group objects')
  }

  function ungroupSelectedObject() {
    if (!selectedCube || !selectedCube.isGroup) {
      showProjectStatus('Select a group to ungroup.', true)
      return
    }
    const group = selectedCube
    const children = childModelShapes(group)
    const parent = parentModelShape(group)
    const destination = parent ? parent.mesh : scene
    children.forEach(child => destination.attach(child.mesh))
    const index = cubes.indexOf(group)
    group.remove()
    if (index >= 0) cubes.splice(index, 1)
    selectedShapes.clear()
    selectedCube = null
    children.forEach((child, childIndex) => selectCube(child, childIndex > 0))
    updateCubeCount()
    commitHistory('Ungroup objects')
  }

  function isModelAncestor(possibleAncestor, modelShape) {
    let current = parentModelShape(modelShape)
    while (current) {
      if (current === possibleAncestor) return true
      current = parentModelShape(current)
    }
    return false
  }

  function parentSelectedObjects() {
    if (!selectedCube || selectedShapes.size < 2) {
      showProjectStatus('Multi-select objects; the last selected becomes the parent.', true)
      return
    }
    const parent = selectedCube
    const children = [...selectedShapes].filter(item => item !== parent)
    let changed = false
    children.forEach((child) => {
      if (child === parent || isModelAncestor(child, parent)) return
      parent.mesh.attach(child.mesh)
      changed = true
    })
    if (!changed) {
      showProjectStatus('That parenting operation would create a cycle.', true)
      return
    }
    renderHierarchy()
    commitHistory('Parent objects')
  }

  function unparentSelectedObjects() {
    const children = [...selectedShapes].filter(item => parentModelShape(item))
    if (!children.length) {
      showProjectStatus('Select one or more parented objects.', true)
      return
    }
    children.forEach(child => scene.attach(child.mesh))
    renderHierarchy()
    commitHistory('Unparent objects')
  }

  hierarchyList.addEventListener('click', (event) => {
    const row = event.target.closest('[data-shape-id]')
    if (!row) return
    const modelShape = cubes.find(item => item.id === row.dataset.shapeId)
    if (!modelShape) return
    if (event.target.dataset.rowAction === 'visibility') {
      modelShape.mesh.visible = !modelShape.mesh.visible; modelShape.outline.visible = modelShape.mesh.visible && selectedShapes.has(modelShape); renderHierarchy(); commitHistory(modelShape.mesh.visible ? 'Show object' : 'Hide object'); return
    }
    if (event.target.dataset.rowAction === 'lock') {
      modelShape.locked = !modelShape.locked; renderHierarchy(); commitHistory(modelShape.locked ? 'Lock object' : 'Unlock object'); return
    }
    selectCube(modelShape, event.ctrlKey || event.metaKey)
  })
  document.getElementById('closeHierarchy').addEventListener('click', () => hierarchyPanel.classList.add('is-hidden'))
  document.getElementById('groupObjects').addEventListener('click',()=>{
    if(voxelWorld){if(!voxelWorld.selection.size)return showProjectStatus('Select blocks to create a block group.',true);const group={id:`group-${Date.now()}`,name:`Block Group ${voxelWorld.groups.length+1}`,keys:[...voxelWorld.selection],parentId:null,locked:false,hidden:false};voxelWorld.groups.push(group);voxelWorld.activeGroupId=group.id;renderHierarchy();scheduleAutosave('Create block group');return}groupSelectedObjects()
  })
  document.getElementById('ungroupObjects').addEventListener('click',()=>{if(voxelWorld){voxelWorld.groups=voxelWorld.groups.filter(group=>group.id!==voxelWorld.activeGroupId);voxelWorld.activeGroupId=null;voxelWorld.render();renderHierarchy();return}ungroupSelectedObject()})
  document.getElementById('parentObjects').addEventListener('click',()=>{if(voxelWorld){const active=voxelWorld.groups.find(group=>group.id===voxelWorld.activeGroupId),choices=voxelWorld.groups.filter(group=>group!==active);if(!active||!choices.length)return showProjectStatus('Create and select at least two block groups.',true);const name=prompt(`Parent group name:\n${choices.map(group=>group.name).join('\n')}`,choices[0].name),parent=choices.find(group=>group.name===name);if(parent){active.parentId=parent.id;renderHierarchy();scheduleAutosave('Parent block group')}return}parentSelectedObjects()})
  document.getElementById('unparentObjects').addEventListener('click',()=>{if(voxelWorld){const active=voxelWorld.groups.find(group=>group.id===voxelWorld.activeGroupId);if(active){active.parentId=null;renderHierarchy();scheduleAutosave('Unparent block group')}return}unparentSelectedObjects()})

  // ==========================================
  // VERTEX, EDGE & FACE EDITING
  // ==========================================

  const editHandle = new THREE.Object3D()
  scene.add(editHandle)
  const editHighlight = new THREE.Group()
  scene.add(editHighlight)
  let componentMode = 'vertex'
  let editSelection = null
  let editDragState = null

  function disposeObjectVisual(object) {
    object.traverse((child) => {
      if (child.geometry) child.geometry.dispose()
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        materials.forEach(material => material.dispose())
      }
    })
  }

  function clearEditHighlight() {
    while (editHighlight.children.length) {
      const child = editHighlight.children.pop()
      disposeObjectVisual(child)
    }
  }

  function clearEditSelection() {
    editSelection = null
    editDragState = null
    clearEditHighlight()
    if (activeTool === 'edit') transformGizmo.detach()
  }

  function componentWorldPoints() {
    if (!editSelection) return []
    const position = editSelection.mesh.geometry.getAttribute('position')
    return (editSelection.highlightIndices || editSelection.indices).map((index) => editSelection.mesh.localToWorld(
      new THREE.Vector3().fromBufferAttribute(position, index)
    ))
  }

  function updateEditHighlight() {
    clearEditHighlight()
    const points = componentWorldPoints()
    if (!points.length) return

    if (componentMode === 'vertex') {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xffcc00, depthTest: false })
      )
      marker.position.copy(points[0])
      marker.renderOrder = 1000
      editHighlight.add(marker)
    } else if (componentMode === 'edge') {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: 0xffcc00, depthTest: false })
      )
      line.renderOrder = 1000
      editHighlight.add(line)
    } else {
      const geometry = new THREE.BufferGeometry().setFromPoints(points)
      geometry.setIndex([0, 1, 2])
      geometry.computeVertexNormals()
      const face = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.48, side: THREE.DoubleSide, depthTest: false })
      )
      face.renderOrder = 1000
      editHighlight.add(face)
    }
  }

  function pointToSegmentDistance(point, a, b) {
    const segment = b.clone().sub(a)
    const lengthSquared = segment.lengthSq()
    if (!lengthSquared) return point.distanceTo(a)
    const t = THREE.MathUtils.clamp(point.clone().sub(a).dot(segment) / lengthSquared, 0, 1)
    return point.distanceTo(a.clone().addScaledVector(segment, t))
  }

  function selectGeometryComponent(hit) {
    if (!hit.intersection.face || !hit.intersection.object.isMesh) return
    const mesh = hit.intersection.object
    const position = ensureEditablePosition(mesh)
    if (!position) return
    const faceIndices = [hit.intersection.face.a, hit.intersection.face.b, hit.intersection.face.c]
    const localPoint = mesh.worldToLocal(hit.intersection.point.clone())
    let indices

    let highlightIndices
    if (componentMode === 'vertex') {
      const nearest = faceIndices.reduce((nearestIndex, index) => {
        const candidate = new THREE.Vector3().fromBufferAttribute(position, index)
        const nearestPoint = new THREE.Vector3().fromBufferAttribute(position, nearestIndex)
        return candidate.distanceTo(localPoint) < nearestPoint.distanceTo(localPoint) ? index : nearestIndex
      }, faceIndices[0])
      highlightIndices = [nearest]
      indices = weldedIndicesForVertex(mesh.geometry, nearest)
    } else if (componentMode === 'edge') {
      const edges = [[faceIndices[0], faceIndices[1]], [faceIndices[1], faceIndices[2]], [faceIndices[2], faceIndices[0]]]
      highlightIndices = edges.reduce((nearest, edge) => {
        const a = new THREE.Vector3().fromBufferAttribute(position, edge[0])
        const b = new THREE.Vector3().fromBufferAttribute(position, edge[1])
        const na = new THREE.Vector3().fromBufferAttribute(position, nearest[0])
        const nb = new THREE.Vector3().fromBufferAttribute(position, nearest[1])
        return pointToSegmentDistance(localPoint, a, b) < pointToSegmentDistance(localPoint, na, nb) ? edge : nearest
      }, edges[0])
      indices = [...weldedIndicesForVertex(mesh.geometry, highlightIndices[0]), ...weldedIndicesForVertex(mesh.geometry, highlightIndices[1])]
    } else {
      indices = faceIndices
      highlightIndices = faceIndices
    }

    editSelection = { mesh, indices: [...new Set(indices)], highlightIndices, faceIndex: hit.intersection.faceIndex }
    const points = componentWorldPoints()
    editHandle.position.copy(points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length))
    editHandle.rotation.set(0, 0, 0)
    editHandle.scale.set(1, 1, 1)
    editHandle.updateMatrixWorld(true)
    transformGizmo.setMode('translate')
    transformGizmo.attach(editHandle)
    updateEditHighlight()
  }

  function beginEditDrag() {
    if (!editSelection) return
    const position = editSelection.mesh.geometry.getAttribute('position')
    editDragState = {
      handleStart: editHandle.position.clone(),
      positions: editSelection.indices.map(index => new THREE.Vector3().fromBufferAttribute(position, index))
    }
  }

  function applyEditDrag() {
    if (!editSelection || !editDragState) return
    const mesh = editSelection.mesh
    const position = mesh.geometry.getAttribute('position')
    const delta = editHandle.position.clone().sub(editDragState.handleStart)
    editSelection.indices.forEach((index, itemIndex) => {
      const world = mesh.localToWorld(editDragState.positions[itemIndex].clone()).add(delta)
      const local = mesh.worldToLocal(world)
      position.setXYZ(index, local.x, local.y, local.z)
    })
    position.needsUpdate = true
    mesh.geometry.computeVertexNormals()
    mesh.geometry.computeBoundingBox()
    mesh.geometry.computeBoundingSphere()
    mesh.geometry.userData.shapeStudioModified = true
    if (selectedCube) selectedCube.updateOutline()
    updateEditHighlight()
  }

  function extrudeSelectedFace() {
    if (!editSelection || componentMode !== 'face') {
      showProjectStatus('Select a face in Face mode first.', true)
      return
    }
    const mesh = editSelection.mesh
    const oldGeometry = mesh.geometry
    const oldPosition = oldGeometry.getAttribute('position')
    const base = editSelection.highlightIndices.map(index => new THREE.Vector3().fromBufferAttribute(oldPosition, index))
    const amount = parseFloat(document.getElementById('extrudeAmount').value) || 0.35
    const normal = base[1].clone().sub(base[0]).cross(base[2].clone().sub(base[0])).normalize()
    const top = base.map(point => point.clone().addScaledVector(normal, amount))
    const source = oldGeometry.index ? oldGeometry.toNonIndexed() : oldGeometry.clone()
    const sourcePosition = source.getAttribute('position')
    const values = Array.from(sourcePosition.array)
    const addTriangle = (a, b, c) => [a, b, c].forEach(point => values.push(point.x, point.y, point.z))
    const topStart = values.length / 3
    addTriangle(top[0], top[1], top[2])
    addTriangle(base[0], base[1], top[1]); addTriangle(base[0], top[1], top[0])
    addTriangle(base[1], base[2], top[2]); addTriangle(base[1], top[2], top[1])
    addTriangle(base[2], base[0], top[0]); addTriangle(base[2], top[0], top[2])

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(values, 3))
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere()
    geometry.userData.shapeStudioModified = true
    mesh.geometry = geometry
    oldGeometry.dispose(); source.dispose()
    editSelection = { mesh, indices: [topStart, topStart + 1, topStart + 2], highlightIndices: [topStart, topStart + 1, topStart + 2] }
    const points = componentWorldPoints()
    editHandle.position.copy(points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length))
    editHandle.updateMatrixWorld(true)
    updateEditHighlight(); selectedCube.updateOutline(); updateStatistics()
    commitHistory('Extrude face')
  }

  function handleEditPointerDown(event) {
    if (activeTool !== 'edit' || event.button !== 0) return
    if (transformGizmo.dragging) {
      event.stopImmediatePropagation()
      return
    }
    event.preventDefault()
    event.stopImmediatePropagation()
    const hit = raycastShapes(event)
    if (!hit) return
    if (hit.modelShape.locked) { showProjectStatus('Unlock this object before editing geometry.', true); return }
    if (selectedCube !== hit.modelShape) {
      clearEditSelection()
      selectCube(hit.modelShape)
    }
    selectGeometryComponent(hit)
  }

  document.querySelectorAll('[data-component-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      componentMode = button.dataset.componentMode
      document.querySelectorAll('[data-component-mode]').forEach(item => item.classList.toggle('is-active', item === button))
      clearEditSelection()
      if(voxelWorld){const mapping={vertex:'paint',edge:'line',face:'select'};setVoxelTool(mapping[componentMode]);document.getElementById('editHint').textContent=componentMode==='vertex'?'Block vertex: paint individual blocks.':componentMode==='edge'?'Block edge: click two points to draw an edge.':'Block face: select a rectangular region, then extrude it.'}
      else document.getElementById('editHint').textContent = `Click a ${componentMode} on the selected model, then drag the XYZ arrows.`
    })
  })
  renderer.domElement.addEventListener('pointerdown', handleEditPointerDown)
  document.getElementById('extrudeFace').addEventListener('click', () => {if(voxelWorld){const amount=Math.round(Number(document.getElementById('extrudeAmount').value)||1);voxelWorld.extrudeSelection(0,amount||1,0);syncVoxelUI()}else extrudeSelectedFace()})

  // ==========================================
  // ARRAY TOOL
  // ==========================================

  function setArrayDialog(open) {
    arrayDialog.classList.toggle('is-open', open)
    arrayDialog.setAttribute('aria-hidden', String(!open))
  }

  arrayType.addEventListener('change', () => {
    const radial = arrayType.value === 'radial'
    linearArrayOptions.classList.toggle('is-hidden', radial)
    radialArrayOptions.classList.toggle('is-hidden', !radial)
  })
  document.querySelectorAll('[data-close-array]').forEach(element => element.addEventListener('click', () => setArrayDialog(false)))

  document.getElementById('applyArray').addEventListener('click', () => {
    if (editorMode === 'bloxd' && voxelWorld) {
      if (!voxelWorld.selection.size) { showProjectStatus('Select blocks before using Array.', true); return }
      const source=[...voxelWorld.selection].map(key=>({p:BloxdVoxelEditor.parseKey(key),id:voxelWorld.blocks.get(key)})),count=THREE.MathUtils.clamp(parseInt(document.getElementById('arrayCount').value,10)||2,2,50),created=[]
      if(arrayType.value==='linear'){
        const offset=[document.getElementById('arrayOffsetX').value,document.getElementById('arrayOffsetY').value,document.getElementById('arrayOffsetZ').value].map(value=>Math.round(Number(value)||0))
        for(let index=1;index<count;index++)source.forEach(item=>{const p=item.p.map((v,i)=>v+offset[i]*index);created.push(voxelWorld.set(...p,item.id))})
      }else{
        const radius=Math.max(1,Math.round(Number(document.getElementById('arrayRadius').value)||3)),axis=document.getElementById('arrayAxis').value,center=[0,1,2].map(i=>(Math.min(...source.map(item=>item.p[i]))+Math.max(...source.map(item=>item.p[i])))/2)
        for(let index=1;index<count;index++){const angle=index/count*Math.PI*2,offset=axis==='y'?[Math.round(Math.cos(angle)*radius),0,Math.round(Math.sin(angle)*radius)]:axis==='x'?[0,Math.round(Math.cos(angle)*radius),Math.round(Math.sin(angle)*radius)]:[Math.round(Math.cos(angle)*radius),Math.round(Math.sin(angle)*radius),0];source.forEach(item=>{const p=item.p.map((v,i)=>v+offset[i]);created.push(voxelWorld.set(...p,item.id))})}
      }
      created.forEach(key=>voxelWorld.selection.add(key));voxelWorld.render();voxelWorld.commit(`${arrayType.value} block array`);setArrayDialog(false);syncVoxelUI();return
    }
    if (!selectedCube || selectedCube.isGroup) {
      showProjectStatus('Select a non-group object before using Array.', true)
      return
    }
    const source = selectedCube
    const count = THREE.MathUtils.clamp(parseInt(document.getElementById('arrayCount').value, 10) || 2, 2, 50)
    const parent = source.mesh.parent || scene
    const basePosition = source.mesh.position.clone()
    const created = []

    for (let index = 1; index < count; index++) {
      const copy = source.clone(new THREE.Vector3(0, 0, 0))
      copy.shapeName = `${source.shapeName} ${index + 1}`
      parent.add(copy.mesh)
      if (arrayType.value === 'linear') {
        copy.mesh.position.copy(basePosition).add(new THREE.Vector3(
          parseFloat(document.getElementById('arrayOffsetX').value) || 0,
          parseFloat(document.getElementById('arrayOffsetY').value) || 0,
          parseFloat(document.getElementById('arrayOffsetZ').value) || 0
        ).multiplyScalar(index))
      } else {
        const angle = (index / count) * Math.PI * 2
        const radius = Math.max(0.1, parseFloat(document.getElementById('arrayRadius').value) || 3)
        const axis = document.getElementById('arrayAxis').value
        copy.mesh.position.copy(basePosition)
        if (axis === 'y') {
          copy.mesh.position.x += Math.cos(angle) * radius
          copy.mesh.position.z += Math.sin(angle) * radius
          copy.mesh.rotation.y += angle
        } else if (axis === 'x') {
          copy.mesh.position.y += Math.cos(angle) * radius
          copy.mesh.position.z += Math.sin(angle) * radius
          copy.mesh.rotation.x += angle
        } else {
          copy.mesh.position.x += Math.cos(angle) * radius
          copy.mesh.position.y += Math.sin(angle) * radius
          copy.mesh.rotation.z += angle
        }
      }
      cubes.push(copy)
      created.push(copy)
    }

    selectedShapes.forEach(shape => shape.deselect())
    selectedShapes.clear()
    source.select()
    selectedShapes.add(source)
    created.slice(0, -1).forEach(copy => { copy.select(); selectedShapes.add(copy) })
    selectCube(created[created.length - 1] || source, true)
    updateCubeCount()
    setArrayDialog(false)
    commitHistory(`${arrayType.value === 'linear' ? 'Linear' : 'Radial'} array`)
  })

  // ==========================================
  // MEASUREMENT TOOLS
  // ==========================================

  let measureMode = 'distance'
  let measurePoints = []
  const measurementVisuals = []
  const measurementLabels = []

  function addMeasureMarker(point) {
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), new THREE.MeshBasicMaterial({ color: 0x00ffff, depthTest: false }))
    marker.position.copy(point)
    marker.renderOrder = 900
    scene.add(marker)
    measurementVisuals.push(marker)
  }

  function addMeasureLine(points) {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x00ffff, depthTest: false }))
    line.renderOrder = 900
    scene.add(line)
    measurementVisuals.push(line)
  }

  function addMeasurementLabel(text, anchor) {
    const label = document.createElement('div')
    label.className = 'measure-label'
    label.textContent = text
    document.body.appendChild(label)
    measurementLabels.push({ element: label, anchor: anchor.clone() })
  }

  function clearMeasurementVisuals() {
    measurementVisuals.splice(0).forEach((object) => {
      scene.remove(object)
      disposeObjectVisual(object)
    })
    measurementLabels.splice(0).forEach(item => item.element.remove())
    measurePoints = []
    measureResult.textContent = measureMode === 'distance' ? 'Click two surface points.' : 'Click three surface points.'
  }

  function updateMeasurementDimensions() {
    if (!measureDimensions) return
    if (voxelWorld) {
      const keys=voxelWorld.selection.size?[...voxelWorld.selection]:[...voxelWorld.blocks.keys()]
      if(!keys.length){measureDimensions.textContent='The block world is empty.';return}
      const points=keys.map(BloxdVoxelEditor.parseKey),size=[0,1,2].map(i=>Math.max(...points.map(p=>p[i]))-Math.min(...points.map(p=>p[i]))+1)
      measureDimensions.textContent=`${voxelWorld.selection.size?'Selection':'World'} dimensions\nX ${size[0]} · Y ${size[1]} · Z ${size[2]} blocks`;return
    }
    if (!selectedCube) {
      measureDimensions.textContent = 'Select an object to view dimensions.'
      return
    }
    const size = new THREE.Box3().setFromObject(selectedCube.mesh).getSize(new THREE.Vector3())
    measureDimensions.textContent = `Dimensions\nX ${size.x.toFixed(3)} · Y ${size.y.toFixed(3)} · Z ${size.z.toFixed(3)}`
  }

  function completeMeasurementIfReady() {
    if (measureMode === 'distance' && measurePoints.length === 2) {
      const distance = measurePoints[0].distanceTo(measurePoints[1])
      addMeasureLine(measurePoints)
      addMeasurementLabel(`${distance.toFixed(3)} units`, measurePoints[0].clone().add(measurePoints[1]).multiplyScalar(0.5))
      measureResult.textContent = `Distance: ${distance.toFixed(4)} ${voxelWorld ? 'blocks' : 'units'}`
      measurePoints = []
    } else if (measureMode === 'angle' && measurePoints.length === 3) {
      const a = measurePoints[0].clone().sub(measurePoints[1]).normalize()
      const b = measurePoints[2].clone().sub(measurePoints[1]).normalize()
      const degrees = THREE.MathUtils.radToDeg(a.angleTo(b))
      addMeasureLine([measurePoints[0], measurePoints[1], measurePoints[2]])
      addMeasurementLabel(`${degrees.toFixed(2)}°`, measurePoints[1])
      measureResult.textContent = `Angle: ${degrees.toFixed(3)}°`
      measurePoints = []
    }
  }

  function handleMeasurePointerDown(event) {
    if (activeTool !== 'measure' || event.button !== 0) return
    event.preventDefault()
    event.stopImmediatePropagation()
    const hit = raycastShapes(event)
    if (!hit) return
    measurePoints.push(hit.intersection.point.clone())
    addMeasureMarker(hit.intersection.point)
    completeMeasurementIfReady()
  }

  document.querySelectorAll('[data-measure-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      measureMode = button.dataset.measureMode
      document.querySelectorAll('[data-measure-mode]').forEach(item => item.classList.toggle('is-active', item === button))
      clearMeasurementVisuals()
      if(voxelWorld)setVoxelTool('measure-blocks')
    })
  })
  document.getElementById('clearMeasurements').addEventListener('click', clearMeasurementVisuals)
  renderer.domElement.addEventListener('pointerdown', handleMeasurePointerDown)

  // ==========================================
  // OBJECT PROPERTIES: NAME, LOCK & VISIBILITY
  // ==========================================

  function syncSelectedObjectControls() {
    const nameInput = document.getElementById('objectName')
    if (!nameInput) return
    nameInput.value = selectedCube ? selectedCube.shapeName : ''
    nameInput.disabled = !selectedCube
    document.getElementById('toggleObjectLock').textContent = selectedCube && selectedCube.locked ? 'Unlock' : 'Lock'
    document.getElementById('toggleObjectVisibility').textContent = selectedCube && !selectedCube.mesh.visible ? 'Show' : 'Hide'
  }

  document.getElementById('renameObject').addEventListener('click', () => {
    if(voxelWorld){const group=voxelWorld.groups.find(item=>item.id===voxelWorld.activeGroupId),name=document.getElementById('objectName').value.trim();if(group&&name){group.name=name;renderHierarchy();scheduleAutosave('Rename block group')}return}
    if (!selectedCube) return
    const name = document.getElementById('objectName').value.trim()
    if (!name) return
    selectedCube.shapeName = name
    renderHierarchy(); updateUI(); commitHistory('Rename object')
  })
  document.getElementById('toggleObjectLock').addEventListener('click', () => {
    if(voxelWorld){const group=voxelWorld.groups.find(item=>item.id===voxelWorld.activeGroupId);if(group){group.locked=!group.locked;document.getElementById('toggleObjectLock').textContent=group.locked?'Unlock':'Lock';renderHierarchy();scheduleAutosave('Toggle block group lock')}return}
    if (!selectedCube) return
    selectedCube.locked = !selectedCube.locked
    if (selectedCube.locked) transformGizmo.detach()
    syncSelectedObjectControls(); renderHierarchy(); commitHistory(selectedCube.locked ? 'Lock object' : 'Unlock object')
  })
  document.getElementById('toggleObjectVisibility').addEventListener('click', () => {
    if(voxelWorld){const group=voxelWorld.groups.find(item=>item.id===voxelWorld.activeGroupId);if(group){group.hidden=!group.hidden;document.getElementById('toggleObjectVisibility').textContent=group.hidden?'Show':'Hide';voxelWorld.render();renderHierarchy();scheduleAutosave('Toggle block group visibility')}return}
    if (!selectedCube) return
    selectedCube.mesh.visible = !selectedCube.mesh.visible
    selectedCube.outline.visible = selectedCube.mesh.visible && selectedShapes.has(selectedCube)
    syncSelectedObjectControls(); renderHierarchy(); commitHistory(selectedCube.mesh.visible ? 'Show object' : 'Hide object')
  })

  // ==========================================
  // MATERIALS & TEXTURES
  // ==========================================

  function selectedMaterials() {
    const materials = []
    const seen = new Set()
    ;[...selectedShapes].forEach(shape => shape.materials().forEach(material => {
      if (!seen.has(material)) { seen.add(material); materials.push(material) }
    }))
    return materials
  }

  function syncMaterialPanel() {
    if (!document.getElementById('materialColor')) return
    const material = selectedCube && selectedCube.materials().find(item => item.color)
    if (!material) return
    document.getElementById('materialColor').value = '#' + material.color.getHexString()
    document.getElementById('materialMetalness').value = material.metalness === undefined ? 0 : material.metalness
    document.getElementById('materialRoughness').value = material.roughness === undefined ? 1 : material.roughness
    document.getElementById('materialOpacity').value = material.opacity === undefined ? 1 : material.opacity
    document.getElementById('materialWireframe').checked = Boolean(material.wireframe)
    updateMaterialOutputs()
  }

  function updateMaterialOutputs() {
    document.getElementById('materialMetalnessValue').value = Number(document.getElementById('materialMetalness').value).toFixed(2)
    document.getElementById('materialRoughnessValue').value = Number(document.getElementById('materialRoughness').value).toFixed(2)
    document.getElementById('materialOpacityValue').value = Number(document.getElementById('materialOpacity').value).toFixed(2)
  }

  function applyMaterialInputs(commit = false) {
    const materials = selectedMaterials()
    materials.forEach((material) => {
      if (material.color) material.color.set(document.getElementById('materialColor').value)
      if ('metalness' in material) material.metalness = parseFloat(document.getElementById('materialMetalness').value)
      if ('roughness' in material) material.roughness = parseFloat(document.getElementById('materialRoughness').value)
      material.opacity = parseFloat(document.getElementById('materialOpacity').value)
      material.transparent = material.opacity < 1
      material.wireframe = document.getElementById('materialWireframe').checked
      material.needsUpdate = true
    })
    updateMaterialOutputs()
    if (commit && materials.length) commitHistory('Edit material')
  }

  ;['materialColor','materialMetalness','materialRoughness','materialOpacity','materialWireframe'].forEach((id) => {
    const input = document.getElementById(id)
    input.addEventListener('input', () => applyMaterialInputs(false))
    input.addEventListener('change', () => applyMaterialInputs(true))
  })
  document.getElementById('uploadTexture').addEventListener('click', () => document.getElementById('textureFileInput').click())
  document.getElementById('voxelMaterialTexture').addEventListener('click',()=>document.getElementById('textureFileInput').click())
  document.getElementById('textureFileInput').addEventListener('change', (event) => {
    const file = event.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => new THREE.TextureLoader().load(reader.result, (texture) => {
      if(voxelWorld){const hex=BloxdColorMatcher.textureAverage(texture);if(hex!=null){const id=BloxdColorMatcher.nearest(hex,{family:'safe'}).best.id;voxelWorld.currentBlockId=id;document.getElementById('voxelMaterialColor').value=`#${hex.toString(16).padStart(6,'0')}`;renderVoxelBlockOptions(BLOXD_ID_TO_NAME[id]);updateVoxelBlockSwatch();showProjectStatus(`Texture sampled as ${blockLabel(id)}`)}texture.dispose();return}
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      texture.encoding = THREE.sRGBEncoding
      selectedMaterials().forEach((material) => { material.map = texture; material.needsUpdate = true })
      commitHistory('Apply texture'); showProjectStatus('Texture applied')
    })
    reader.readAsDataURL(file)
    event.target.value = ''
  })
  document.getElementById('clearTexture').addEventListener('click', () => {
    const materials = selectedMaterials()
    materials.forEach(material => { material.map = null; material.needsUpdate = true })
    if (materials.length) commitHistory('Clear texture')
  })

  // ==========================================
  // MIRROR, SUBDIVISION & BOOLEAN OPERATIONS
  // ==========================================

  function primaryEditableMesh(modelShape) {
    if (!modelShape) return null
    let found = null
    const visit = (object) => {
      if (found || (object !== modelShape.mesh && object.userData && object.userData.shapeStudioRootId)) return
      if (object.isMesh && object.geometry && object.geometry.getAttribute('position')) { found = object; return }
      object.children.forEach(visit)
    }
    visit(modelShape.mesh)
    return found
  }

  function replaceMeshGeometry(mesh, positions) {
    const old = mesh.geometry
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere()
    geometry.userData.shapeStudioModified = true
    mesh.geometry = geometry
    old.dispose()
    sculptWeldCache.delete(old)
  }

  function applyMirror(axis) {
    if (!selectedCube || selectedCube.locked) { showProjectStatus('Select an unlocked mesh.', true); return }
    const mesh = primaryEditableMesh(selectedCube)
    if (!mesh) return
    const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
    const p = source.getAttribute('position')
    const values = Array.from(p.array)
    const axisIndex = { x: 0, y: 1, z: 2 }[axis]
    for (let index = 0; index < p.count; index += 3) {
      ;[0, 2, 1].forEach((offset) => {
        const vertex = [p.getX(index + offset), p.getY(index + offset), p.getZ(index + offset)]
        vertex[axisIndex] *= -1
        values.push(...vertex)
      })
    }
    source.dispose(); replaceMeshGeometry(mesh, values); selectedCube.updateOutline(); commitHistory(`Mirror ${axis.toUpperCase()}`); updateStatistics()
  }

  function subdivideGeometryOnce(geometry) {
    const source = geometry.index ? geometry.toNonIndexed() : geometry
    const p = source.getAttribute('position')
    const out = []
    const add = (...vertices) => vertices.forEach(v => out.push(v.x, v.y, v.z))
    for (let index = 0; index < p.count; index += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(p, index)
      const b = new THREE.Vector3().fromBufferAttribute(p, index + 1)
      const c = new THREE.Vector3().fromBufferAttribute(p, index + 2)
      const ab = a.clone().add(b).multiplyScalar(.5), bc = b.clone().add(c).multiplyScalar(.5), ca = c.clone().add(a).multiplyScalar(.5)
      add(a, ab, ca); add(ab, b, bc); add(ca, bc, c); add(ab, bc, ca)
    }
    return out
  }

  document.querySelectorAll('[data-mirror-axis]').forEach(button => button.addEventListener('click', () => applyMirror(button.dataset.mirrorAxis)))
  document.getElementById('applySubdivision').addEventListener('click', () => {
    if (!selectedCube || selectedCube.locked) { showProjectStatus('Select an unlocked mesh.', true); return }
    const mesh = primaryEditableMesh(selectedCube)
    if (!mesh) return
    const levels = parseInt(document.getElementById('subdivisionLevels').value, 10)
    for (let level = 0; level < levels; level++) replaceMeshGeometry(mesh, subdivideGeometryOnce(mesh.geometry))
    selectedCube.updateOutline(); commitHistory(`Subdivision level ${levels}`); updateStatistics()
  })

  function performBoolean(operation) {
    const shapes = [...selectedShapes]
    if (shapes.length !== 2 || shapes.some(shape => shape.isGroup || shape.locked || childModelShapes(shape).length || parentModelShape(shape))) {
      showProjectStatus('Select exactly 2 unlocked, unparented mesh objects.', true); return
    }
    const meshA = primaryEditableMesh(selectedCube)
    const otherShape = shapes.find(shape => shape !== selectedCube)
    const meshB = primaryEditableMesh(otherShape)
    if (!meshA || !meshB) return
    try {
      meshA.updateMatrixWorld(true); meshB.updateMatrixWorld(true)
      const makeWorldMesh = (mesh) => {
        const geometry = mesh.geometry.clone(); if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
        const temp = new THREE.Mesh(geometry, mesh.material); temp.matrixAutoUpdate = false; temp.matrix.copy(mesh.matrixWorld); return temp
      }
      const a = makeWorldMesh(meshA), b = makeWorldMesh(meshB)
      const csgA = ShapeCSG.fromMesh(a), csgB = ShapeCSG.fromMesh(b)
      const result = operation === 'union' ? csgA.union(csgB) : operation === 'subtract' ? csgA.subtract(csgB) : csgA.intersect(csgB)
      const geometry = ShapeCSG.toGeometry(result, new THREE.Matrix4())
      geometry.computeVertexNormals(); geometry.userData.shapeStudioModified = true
      const resultMesh = new THREE.Mesh(geometry, (Array.isArray(meshA.material) ? meshA.material[0] : meshA.material).clone())
      const resultShape = new ModelShape('imported', new THREE.Vector3(), resultMesh, `Boolean ${operation}`)
      resultShape.shapeType = 'boolean'
      shapes.forEach(shape => { shape.remove(); cubes.splice(cubes.indexOf(shape), 1) })
      selectedShapes.clear(); cubes.push(resultShape); selectCube(resultShape); updateCubeCount(); commitHistory(`Boolean ${operation}`); updateStatistics()
      a.geometry.dispose(); b.geometry.dispose()
    } catch (error) {
      console.error('Boolean failed', error); showProjectStatus('Boolean failed. Use closed solid meshes that overlap.', true)
    }
  }
  document.querySelectorAll('[data-boolean]').forEach(button => button.addEventListener('click', () => performBoolean(button.dataset.boolean)))

  // ==========================================
  // ORTHOGRAPHIC VIEWS & BOX SELECTION
  // ==========================================

  function setCameraView(view) {
    document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('is-active', button.dataset.view === view))
    if (view === 'perspective') {
      camera = perspectiveCamera
      updateCameraPosition()
    } else {
      camera = orthographicCamera
      const aspect = window.innerWidth / window.innerHeight
      camera.left = -10 * aspect; camera.right = 10 * aspect; camera.top = 10; camera.bottom = -10
      const distance = Math.max(5, cameraControls.radius)
      if (view === 'front') camera.position.copy(cameraTarget).add(new THREE.Vector3(0, 0, distance))
      if (view === 'right') camera.position.copy(cameraTarget).add(new THREE.Vector3(distance, 0, 0))
      if (view === 'top') camera.position.copy(cameraTarget).add(new THREE.Vector3(0, distance, 0.001))
      camera.up.set(0, view === 'top' ? 0 : 1, view === 'top' ? -1 : 0)
      camera.lookAt(cameraTarget); camera.updateProjectionMatrix()
    }
    transformGizmo.camera = camera
    transformGizmo.updateMatrixWorld(true)
  }
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setCameraView(button.dataset.view)))

  let boxDrag = null
  function beginBoxSelection(event) {
    if (activeTool !== 'boxselect' || event.button !== 0) return
    event.preventDefault(); event.stopImmediatePropagation()
    boxDrag = { x: event.clientX, y: event.clientY, additive: event.ctrlKey || event.metaKey }
    Object.assign(boxSelection.style, { display: 'block', left: `${event.clientX}px`, top: `${event.clientY}px`, width: '0px', height: '0px' })
    renderer.domElement.setPointerCapture(event.pointerId)
  }
  function moveBoxSelection(event) {
    if (!boxDrag) return
    event.preventDefault(); event.stopImmediatePropagation()
    const left = Math.min(boxDrag.x, event.clientX), top = Math.min(boxDrag.y, event.clientY)
    Object.assign(boxSelection.style, { left: `${left}px`, top: `${top}px`, width: `${Math.abs(event.clientX-boxDrag.x)}px`, height: `${Math.abs(event.clientY-boxDrag.y)}px` })
  }
  function finishBoxSelection(event) {
    if (!boxDrag) return
    event.preventDefault(); event.stopImmediatePropagation()
    const left = Math.min(boxDrag.x, event.clientX), right = Math.max(boxDrag.x, event.clientX), top = Math.min(boxDrag.y, event.clientY), bottom = Math.max(boxDrag.y, event.clientY)
    if (!boxDrag.additive) { selectedShapes.forEach(shape => shape.deselect()); selectedShapes.clear(); selectedCube = null }
    cubes.forEach((shape) => {
      if (!shape.mesh.visible) return
      const center = new THREE.Box3().setFromObject(shape.mesh).getCenter(new THREE.Vector3()).project(camera)
      const x = (center.x*.5+.5)*window.innerWidth, y=(-center.y*.5+.5)*window.innerHeight
      if (x>=left && x<=right && y>=top && y<=bottom) selectCube(shape, true)
    })
    boxSelection.style.display = 'none'; boxDrag = null
  }
  renderer.domElement.addEventListener('pointerdown', beginBoxSelection)
  renderer.domElement.addEventListener('pointermove', moveBoxSelection)
  renderer.domElement.addEventListener('pointerup', finishBoxSelection)
  renderer.domElement.addEventListener('pointercancel', finishBoxSelection)

  // ==========================================
  // PROJECT STATISTICS & AUTOSAVE
  // ==========================================

  function updateStatistics() {
    if (!statisticsContent) return
    if (voxelWorld) {
      const bounds = voxelWorld.bounds()
      const typeCount = new Set(voxelWorld.blocks.values()).size
      const dimensions = bounds ? bounds.max.map((value,index)=>value-bounds.min[index]+1).join(' × ') : '0 × 0 × 0'
      const rows = [['Mode','Bloxd blocks'],['Blocks',voxelWorld.size.toLocaleString()],['Block types',typeCount],['Dimensions',dimensions],['Selected',voxelWorld.selection.size.toLocaleString()],['Blocks / unit',voxelWorld.globalBlocksPerUnit],['Chunks',voxelWorld.chunkIndex.size.toLocaleString()],['Chunk size',`${voxelWorld.chunkSize}³`],['Render mode',voxelWorld.renderMode],['History states',voxelWorld.history.length]]
      statisticsContent.replaceChildren(...rows.flatMap(([label,value]) => { const a=document.createElement('span');a.textContent=label;const b=document.createElement('strong');b.textContent=value;return[a,b] }))
      return
    }
    let meshes=0, vertices=0, triangles=0
    const materials = new Set()
    cubes.forEach((shape) => {
      const visit = (object) => {
        if (object !== shape.mesh && object.userData && object.userData.shapeStudioRootId) return
        if (object.isMesh && object.geometry) {
          meshes++; const p=object.geometry.getAttribute('position'); if (p) vertices += p.count
          triangles += object.geometry.index ? object.geometry.index.count/3 : (p ? p.count/3 : 0)
          const list=Array.isArray(object.material)?object.material:[object.material]; list.filter(Boolean).forEach(m=>materials.add(m))
        }
        object.children.forEach(visit)
      }
      visit(shape.mesh)
    })
    const rows = [['Objects',cubes.length],['Groups',cubes.filter(s=>s.isGroup).length],['Meshes',meshes],['Vertices',Math.round(vertices).toLocaleString()],['Triangles',Math.round(triangles).toLocaleString()],['Materials',materials.size],['Selected',selectedShapes.size],['Hidden',cubes.filter(s=>!s.mesh.visible).length],['Locked',cubes.filter(s=>s.locked).length]]
    statisticsContent.replaceChildren(...rows.flatMap(([label,value]) => { const a=document.createElement('span');a.textContent=label;const b=document.createElement('strong');b.textContent=value;return[a,b] }))
  }

  let autosaveTimer = null
  function scheduleAutosave(label) {
    if (label === 'Initial scene') return
    clearTimeout(autosaveTimer)
    autosaveTimer = setTimeout(() => {
      try { localStorage.setItem('shapeStudioAutosave', JSON.stringify({ format:'shape-studio-project', version:1, savedAt:new Date().toISOString(), scene:createSceneSnapshot() })) }
      catch (error) { console.warn('Autosave unavailable:', error) }
    }, 900)
  }
  function offerAutosaveRecovery() {
    try { if (localStorage.getItem('shapeStudioAutosave')) autosaveRecovery.classList.remove('is-hidden') } catch (error) {}
  }
  document.getElementById('restoreAutosave').addEventListener('click', () => {
    try {
      const project=JSON.parse(localStorage.getItem('shapeStudioAutosave')); restoreSceneSnapshot(project.scene)
      sceneHistory=[{label:'Recovered autosave',snapshot:createSceneSnapshot()}];sceneHistoryIndex=0;updateHistoryControls();fitAll();showProjectStatus('Autosave restored')
    } catch(error){showProjectStatus('Could not restore autosave.',true)}
    autosaveRecovery.classList.add('is-hidden')
  })
  document.getElementById('discardAutosave').addEventListener('click', () => { localStorage.removeItem('shapeStudioAutosave');autosaveRecovery.classList.add('is-hidden') })
  window.addEventListener('beforeunload', () => { if (sceneHistoryIndex>0) try { localStorage.setItem('shapeStudioAutosave', JSON.stringify({format:'shape-studio-project',version:1,savedAt:new Date().toISOString(),scene:createSceneSnapshot()})) } catch(error){} })

  document.querySelectorAll('[data-close-floating]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.closeFloating).classList.add('is-hidden')))
  // ==========================================
  // PROJECT FILES & 3D EXPORT
  // ==========================================

  function safeFileName(name) {
    return (name || 'shape-studio-project')
      .trim()
      .replace(/[^a-z0-9-_]+/gi, '-')
      .replace(/^-+|-+$/g, '') || 'shape-studio-project'
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1500)
  }

  function saveProject() {
    try {
      const project = {
        format: 'shape-studio-project',
        version: 1,
        savedAt: new Date().toISOString(),
        scene: createSceneSnapshot()
      }
      const json = JSON.stringify(project, null, 2)
      downloadBlob(
        new Blob([json], { type: 'application/json' }),
        `${safeFileName(currentProjectName)}.shapeproject`
      )
      showProjectStatus(`Saved ${cubes.length} shape${cubes.length === 1 ? '' : 's'}`)
    } catch (error) {
      console.error('Project save failed:', error)
      showProjectStatus('Could not save this project.', true)
    }
  }

  async function openProjectFile(file) {
    try {
      const project = JSON.parse(await file.text())
      if (project.format !== 'shape-studio-project' || !project.scene) {
        throw new Error('Not a Shape Studio project file.')
      }

      restoreSceneSnapshot(project.scene)
      currentProjectName = file.name.replace(/\.(shapeproject|json)$/i, '') || 'shape-studio-project'
      sceneHistory = [{ label: 'Open project', snapshot: createSceneSnapshot() }]
      sceneHistoryIndex = 0
      updateHistoryControls()
      fitAll()
      showProjectStatus(`Opened ${file.name}`)
    } catch (error) {
      console.error('Project open failed:', error)
      showProjectStatus(error.message || 'Could not open that project.', true)
    } finally {
      projectFileInput.value = ''
    }
  }

  function createExportGroup() {
    const group = new THREE.Group()
    group.name = 'Shape_Studio_Export'
    const clones = cubes.map((modelShape, index) => {
      const clone = modelShape.cloneObjectWithResources()
      clone.name = modelShape.shapeName || `Shape_${index + 1}`
      return clone
    })
    clones.forEach((clone, index) => {
      const parentIndex = cubes.findIndex(candidate => candidate.mesh === cubes[index].mesh.parent)
      if (parentIndex >= 0) clones[parentIndex].add(clone)
      else group.add(clone)
    })
    group.updateMatrixWorld(true)
    if (globalThis.IslandWorldSystem) IslandWorldSystem.prepareForExport(THREE, group)
    group.updateMatrixWorld(true)
    return group
  }

  function disposeExportGroup(group) {
    group.traverse((child) => {
      if (!child.isMesh) return
      if (child.geometry) child.geometry.dispose()
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.filter(Boolean).forEach(material => material.dispose())
    })
  }

  // ==========================================
  // PERMANENT BLOXD VOXEL EDITOR MODE
  // ==========================================

  BloxdBlockColors.init(BLOXD_NAME_TO_ID)

  function createVoxelWorld() {
    const world = new BloxdVoxelEditor.BloxdVoxelWorld(THREE, scene, {
      blockId: 28,
      blocksPerUnit: parseFloat(document.getElementById('voxelGlobalResolution').value) || 2,
      chunkSize: Number(document.getElementById('voxelChunkSize').value) || 16
    })
    if (!world.texturePalette.length) world.texturePalette = BloxdTextureEngine.generateNearRgb(`#${BloxdBlockColors.hex(world.currentBlockId).toString(16).padStart(6,'0')}`, 5, 'safe', 55).map(item=>({id:item.id,weight:item.weight}))
    world.onChange = (label) => {
      syncVoxelUI()
      if (label !== 'render' && label !== 'selection') showProjectStatus(label)
    }
    return world
  }

  async function voxelizeObjectIntoWorld(object, label = 'Add voxelized object', options = {}) {
    if (!voxelWorld) throw new Error('Bloxd mode is not active.')
    object.updateMatrixWorld(true)
    if (globalThis.IslandWorldSystem) IslandWorldSystem.prepareForExport(THREE, object)
    const voxels = await BloxdSchematic.voxelizeObject(object, {
      THREE,
      blocksPerUnit: voxelWorld.globalBlocksPerUnit,
      fillMode: options.fillMode || 'shell',
      materialMode: options.materialMode || 'single',
      blockId: options.blockId || voxelWorld.currentBlockId,
      paletteFamily: options.paletteFamily || 'safe',
      textureColors: options.textureColors !== false,
      dither: options.dither !== false,
      maxCandidateChecks: options.maxCandidateChecks || 25000000
    }, value => { voxelToolHint.textContent = `${label}… ${Math.round(value * 100)}%` })
    voxels.forEach((id, key) => voxelWorld.blocks.set(key, options.materialMode === 'single' ? voxelWorld.currentBlockId : id))
    voxelWorld.render(); voxelWorld.commit(label); disposeObjectResources(object); syncVoxelUI(); scheduleAutosave(label)
    voxelToolHint.textContent = voxelToolHints[activeVoxelTool] || 'Edit blocks.'
    return voxels.size
  }

  function blockLabel(id) { return `${BLOXD_ID_TO_NAME[id] || `Block ${id}`} (#${id})` }

  function renderVoxelBlockOptions(query = '') {
    const search = query.trim().toLowerCase()
    const previous = voxelWorld ? voxelWorld.currentBlockId : Number(voxelBlockSelect.value) || 28
    const entries = Object.entries(BLOXD_NAME_TO_ID)
      .filter(([name, id]) => id !== 0 && (!search || name.toLowerCase().includes(search) || String(id) === search))
      .slice(0, 300)
    if (!entries.some(([, id]) => id === previous) && BLOXD_ID_TO_NAME[previous]) entries.unshift([BLOXD_ID_TO_NAME[previous], previous])
    voxelBlockSelect.replaceChildren(...entries.map(([name, id]) => {
      const option = document.createElement('option'); option.value = id; option.textContent = `${name} (#${id})`; return option
    }))
    voxelBlockSelect.value = String(previous)
    updateVoxelBlockSwatch()
  }

  function updateVoxelBlockSwatch() {
    const id = Number(voxelBlockSelect.value) || 28
    if (voxelWorld) voxelWorld.currentBlockId = id
    voxelBlockSwatch.style.background = `#${BloxdBlockColors.hex(id).toString(16).padStart(6, '0')}`
    voxelBlockSwatch.title = blockLabel(id)
  }

  function syncVoxelUI() {
    if (!voxelWorld) return
    voxelBlockCount.textContent = `${voxelWorld.size.toLocaleString()} blocks · ${voxelWorld.chunkIndex.size.toLocaleString()} chunks${voxelWorld.renderedBlockCount < voxelWorld.size ? ` · ${voxelWorld.renderedBlockCount.toLocaleString()} exposed shown` : ''}`
    if (voxelWorld.selection.size) {
      const points=[...voxelWorld.selection].map(BloxdVoxelEditor.parseKey),dimensions=[0,1,2].map(i=>Math.max(...points.map(p=>p[i]))-Math.min(...points.map(p=>p[i]))+1)
      voxelSelectionCount.textContent = `${voxelWorld.selection.size.toLocaleString()} blocks selected · ${dimensions.join(' × ')}`
    } else voxelSelectionCount.textContent = 'No blocks selected'
    const advancedSummary=document.getElementById('voxelAdvancedSummary')
    if(advancedSummary){
      if(voxelWorld.selection.size){const points=[...voxelWorld.selection].map(BloxdVoxelEditor.parseKey),min=[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),max=[0,1,2].map(i=>Math.max(...points.map(p=>p[i]))),counts=new Map();voxelWorld.selection.forEach(key=>{const id=voxelWorld.blocks.get(key);counts.set(id,(counts.get(id)||0)+1)});const dominant=[...counts].sort((a,b)=>b[1]-a[1])[0];advancedSummary.textContent=`${voxelWorld.selection.size.toLocaleString()} blocks · bounds ${min.join(', ')} to ${max.join(', ')} · ${max.map((v,i)=>v-min[i]+1).join(' × ')} · dominant ${dominant?blockLabel(dominant[0]):'—'}`}
      else advancedSummary.textContent=`No selection · ${voxelWorld.size.toLocaleString()} blocks in world`
    }
    document.getElementById('voxelGlobalResolution').value = voxelWorld.globalBlocksPerUnit
    document.getElementById('voxelChunkSize').value = String(voxelWorld.chunkSize)
    restoreVoxelTextureControls();renderVoxelTexturePalette();renderVoxelPathList()
    undoButton.disabled = voxelWorld.historyIndex <= 0
    redoButton.disabled = voxelWorld.historyIndex >= voxelWorld.history.length - 1
  }

  function setEditorMode(mode, restoring = false) {
    if (mode === 'bloxd' && !voxelWorld) {
      if (!restoring) setVoxelConvertOpen(true)
      return
    }
    editorMode = mode
    document.body.classList.toggle('is-bloxd-mode', mode === 'bloxd')
    const bloxdLabels={select:'Select block',boxselect:'Select block box',translate:'Move selected blocks',rotate:'Rotate selected blocks 90°',scale:'Discrete block scale',sculpt:'Spherical block sculpt',edit:'Block vertex / edge / face edit',measure:'Measure blocks',add:'Add shape as blocks',duplicate:'Copy selection for paste',color:'Choose official block',delete:'Delete selected blocks',array:'Block array',procedural:'Generate as blocks',hierarchy:'Block groups & types',materials:'Official block materials & texture sampling',modifiers:'Block modifiers & booleans',statistics:'Block-world statistics',advanced:'Advanced block inspector'}
    document.querySelectorAll('.tool-palette [data-tool],.tool-palette [data-action]').forEach(button=>{if(!button.dataset.meshTooltip)button.dataset.meshTooltip=button.dataset.tooltip||button.title||'';const key=button.dataset.tool||button.dataset.action;button.dataset.tooltip=mode==='bloxd'?(bloxdLabels[key]||button.dataset.meshTooltip):button.dataset.meshTooltip})
    voxelPanel.classList.toggle('is-hidden', mode !== 'bloxd')
    document.querySelectorAll('[data-editor-mode]').forEach(button => button.classList.toggle('is-active', button.dataset.editorMode === mode))
    if (voxelWorld) voxelWorld.root.visible = true
    if (mode === 'bloxd') {
      transformGizmo.detach(); clearEditSelection(); setTool('select'); syncVoxelUI()
      showProjectStatus('Bloxd block editing mode')
    } else if (voxelWorld) showProjectStatus('3D view — project remains permanently voxelized')
  }

  function setVoxelConvertOpen(open) {
    voxelConvertDialog.classList.toggle('is-open', open)
    voxelConvertDialog.setAttribute('aria-hidden', String(!open))
    if (open) {
      document.getElementById('voxelPermanentConfirm').checked = false
      document.getElementById('confirmVoxelConvert').disabled = true
      document.getElementById('voxelConvertProgress').classList.add('is-hidden')
    }
  }

  Object.entries(BLOXD_NAME_TO_ID).forEach(([name, id]) => {
    if (id === 0) return
    const option = new Option(`${name} (#${id})`, id)
    if (id === 28) option.selected = true
    document.getElementById('voxelConvertBlock').appendChild(option)
  })
  renderVoxelBlockOptions()

  document.querySelectorAll('[data-editor-mode]').forEach(button => button.addEventListener('click', () => setEditorMode(button.dataset.editorMode)))
  document.querySelectorAll('[data-close-voxel-convert]').forEach(button => button.addEventListener('click', () => {
    if (!document.getElementById('confirmVoxelConvert').disabled || document.getElementById('voxelConvertProgress').classList.contains('is-hidden')) setVoxelConvertOpen(false)
  }))
  document.getElementById('voxelPermanentConfirm').addEventListener('change', event => { document.getElementById('confirmVoxelConvert').disabled = !event.target.checked })
  document.getElementById('voxelConvertMaterials').addEventListener('change', event => { document.getElementById('voxelConvertBlockRow').style.display = event.target.value === 'single' ? 'grid' : 'none' })

  document.getElementById('confirmVoxelConvert').addEventListener('click', async () => {
    if (!cubes.length) { showProjectStatus('Add geometry before entering Bloxd mode.', true); return }
    const button = document.getElementById('confirmVoxelConvert'), progress = document.getElementById('voxelConvertProgress')
    button.disabled = true; progress.classList.remove('is-hidden')
    const progressBar = document.getElementById('voxelConvertProgressBar'), progressText = document.getElementById('voxelConvertProgressText')
    const exportGroup = createExportGroup()
    try {
      const blocksPerUnit = parseFloat(document.getElementById('voxelConvertResolution').value) || 2
      const voxels = await BloxdSchematic.voxelizeObject(exportGroup, {
        THREE, blocksPerUnit,
        fillMode: document.getElementById('voxelConvertFill').value,
        materialMode: document.getElementById('voxelConvertMaterials').value,
        blockId: Number(document.getElementById('voxelConvertBlock').value) || 28,
        paletteFamily: document.getElementById('voxelConvertPalette').value,
        textureColors: document.getElementById('voxelTextureColors').checked,
        dither: document.getElementById('voxelColorDither').checked,
        maxCandidateChecks: 35000000
      }, value => {
        progressBar.style.width = `${Math.round(value * 100)}%`
        progressText.textContent = `Voxelizing permanent scene… ${Math.round(value * 100)}%`
      })
      historyRestoring = true
      try { disposeCurrentSceneObjects() } finally { historyRestoring = false }
      if (voxelWorld) voxelWorld.dispose()
      voxelWorld = createVoxelWorld(); voxelWorld.globalBlocksPerUnit = blocksPerUnit; voxelWorld.load(voxels); voxelWorld.commit('Converted scene to Bloxd blocks', true)
      document.getElementById('voxelGlobalResolution').value = blocksPerUnit
      setVoxelConvertOpen(false); setEditorMode('bloxd'); updateCubeCount()
      sceneHistory = []; sceneHistoryIndex = -1; commitHistory('Permanent Bloxd conversion')
      scheduleAutosave('Bloxd conversion')
      showProjectStatus(`Permanent conversion complete: ${voxels.size.toLocaleString()} blocks`)
    } catch (error) {
      console.error('Permanent voxel conversion failed:', error)
      progressText.textContent = error.message || 'Conversion failed'; showProjectStatus(error.message || 'Conversion failed', true)
      button.disabled = false
    } finally { disposeExportGroup(exportGroup) }
  })

  const voxelToolHints = {
    place: 'Click a block face to place the selected block.', remove: 'Click a block to remove it.', paint: 'Click an existing block to paint it.', eyedropper: 'Click a block to make its type active.',
    box: 'Click two block-face corners to create a filled box.', 'hollow-box': 'Click two corners to create a hollow shell.', line: 'Click two block-face positions to create a line.', fill: 'Click a connected block region to flood-fill it.',
    select: 'Click two existing blocks to select a rectangular region.', 'single-select': 'Click a block to select it; Shift-click toggles blocks.', connected: 'Click a block to select its connected same-type region.', paste: 'Click a block face to paste the clipboard.',
    move: 'Click a source block, then a destination block to move the selection by that offset.', 'rotate-select': 'Click a block to select its connected region; use Rotate again or the axis controls.',
    'measure-blocks': 'Click two blocks for distance or three blocks for an angle.', texture: 'Paint the composed block palette through the selected procedural noise.', asset: 'Move the ghost with the cursor, use the wheel for height, and click to place.', terrain: 'Drag over terrain with the selected terrain or biome operation.', scatter: 'Configure biome rules, spacing, and weighted assets, then scatter.', path: 'Click terrain to add control points; Shift-click moves the nearest point.', 'smooth-brush': 'Click a block to smooth its local voxel surface.', 'flatten-brush': 'Click a block to flatten the brush area.'
  }
  function setVoxelTool(tool) {
    activeVoxelTool = tool; voxelToolAnchor = null
    document.querySelectorAll('[data-voxel-tool]').forEach(button => button.classList.toggle('is-active', button.dataset.voxelTool === tool))
    voxelToolHint.textContent = voxelToolHints[tool] || 'Edit blocks.'
    if(tool==='texture'){document.getElementById('voxelTextureStudio').open=true;renderVoxelTexturePalette()}
    if(tool==='asset'){document.getElementById('voxelAssetLibrary').open=true;renderVoxelAssetLibrary()}
    if(tool==='terrain'){document.getElementById('voxelTerrainStudio').open=true}
    if(tool==='scatter'){document.getElementById('voxelScatterStudio').open=true}
    if(tool==='path'){document.getElementById('voxelPathStudio').open=true}
    const assetModeButton=document.getElementById('voxelAssetPlaceMode');if(assetModeButton)assetModeButton.textContent=tool==='asset'&&selectedVoxelAsset?'Ghost placement active':'Activate ghost placement'
    setVoxelAssetGhostVisible(tool==='asset')
  }
  let voxelTextureControlsWorld = null
  function restoreVoxelTextureControls(){if(!voxelWorld||voxelTextureControlsWorld===voxelWorld)return;voxelTextureControlsWorld=voxelWorld;const settings=voxelWorld.textureSettings||{},map={mode:'voxelTextureMode',seed:'voxelTextureSeed',scale:'voxelTextureScale',octaves:'voxelTextureOctaves',contrast:'voxelTextureContrast',bias:'voxelTextureBias',axis:'voxelTextureAxis',target:'voxelTextureTarget'};Object.entries(map).forEach(([key,id])=>{if(settings[key]!=null)document.getElementById(id).value=settings[key]});if(settings.invert!=null)document.getElementById('voxelTextureInvert').checked=Boolean(settings.invert);if(settings.onlyId)document.getElementById('voxelTextureOnlyCurrent').checked=true;const terrain=voxelWorld.terrainSettings||{},terrainMap={biome:'voxelTerrainBiome',radius:'voxelTerrainRadius',strength:'voxelTerrainStrength',depth:'voxelTerrainDepth',falloff:'voxelTerrainFalloff',seed:'voxelTerrainSeed',density:'voxelTerrainDensity'};Object.entries(terrainMap).forEach(([key,id])=>{if(terrain[key]!=null)document.getElementById(id).value=terrain[key]});if(terrain.water!=null)document.getElementById('voxelTerrainWater').checked=Boolean(terrain.water);if(terrain.materials&&terrain.materials.surface)voxelTerrainSurfacePalette=(terrain.materials.surface.palette||[]).map(item=>({...item}));const scatter=voxelWorld.scatterSettings||{},scatterMap={kind:'voxelScatterKind',biome:'voxelScatterBiome',count:'voxelScatterCount',spacing:'voxelScatterSpacing',density:'voxelScatterDensity',seed:'voxelScatterSeed',minAltitude:'voxelScatterMinAltitude',maxAltitude:'voxelScatterMaxAltitude',minMoisture:'voxelScatterMoisture',maxSlope:'voxelScatterSlope'};Object.entries(scatterMap).forEach(([key,id])=>{if(scatter[key]!=null)document.getElementById(id).value=scatter[key]});if(scatter.rotate!=null)document.getElementById('voxelScatterRotate').checked=Boolean(scatter.rotate);if(scatter.mirror!=null)document.getElementById('voxelScatterMirror').checked=Boolean(scatter.mirror);if(scatter.collection)document.getElementById('voxelScatterCollection').value=scatter.collection.map(v=>`${v.id}:${v.weight}`).join(', ');renderVoxelTerrainPalette();renderVoxelPathList()}
  function voxelTextureOptions(keys=[]) {
    const axis=document.getElementById('voxelTextureAxis').value,index={x:0,y:1,z:2}[axis];let min=Infinity,max=-Infinity;keys.forEach(key=>{const value=BloxdVoxelEditor.parseKey(key)[index];if(value<min)min=value;if(value>max)max=value});if(!Number.isFinite(min)){min=0;max=1}
    const options={mode:document.getElementById('voxelTextureMode').value,seed:document.getElementById('voxelTextureSeed').value,scale:Number(document.getElementById('voxelTextureScale').value)||6,octaves:Number(document.getElementById('voxelTextureOctaves').value)||4,contrast:Number(document.getElementById('voxelTextureContrast').value)||1,bias:Number(document.getElementById('voxelTextureBias').value)||0,axis,invert:document.getElementById('voxelTextureInvert').checked,onlyId:document.getElementById('voxelTextureOnlyCurrent').checked&&voxelWorld?voxelWorld.currentBlockId:0,min,max}
    if(voxelWorld)voxelWorld.textureSettings={...options,target:document.getElementById('voxelTextureTarget').value}
    return options
  }
  function renderVoxelTexturePalette(){
    const host=document.getElementById('voxelTexturePalette');if(!host||!voxelWorld)return
    if(!voxelWorld.texturePalette.length){const empty=document.createElement('div');empty.className='voxel-texture-empty';empty.textContent='No blocks yet. Add the current block or generate a palette near an RGB color.';host.replaceChildren(empty);return}
    host.replaceChildren(...voxelWorld.texturePalette.map((entry,index)=>{const row=document.createElement('div');row.className='voxel-texture-row';const swatch=document.createElement('span');swatch.className='voxel-texture-row__swatch';swatch.style.background=`#${BloxdBlockColors.hex(entry.id).toString(16).padStart(6,'0')}`;const name=document.createElement('span');name.className='voxel-texture-row__name';name.textContent=BLOXD_ID_TO_NAME[entry.id]||`Block ${entry.id}`;const weight=document.createElement('input');weight.type='number';weight.min='.01';weight.max='20';weight.step='.1';weight.value=entry.weight||1;weight.title='Palette weight';weight.addEventListener('change',()=>{entry.weight=Math.max(.01,Number(weight.value)||1);scheduleAutosave('Texture palette')});const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.title='Remove block';remove.addEventListener('click',()=>{voxelWorld.texturePalette.splice(index,1);renderVoxelTexturePalette();scheduleAutosave('Texture palette')});row.append(swatch,name,weight,remove);return row}))
  }
  function applyVoxelTexture(keys,label='Apply block texture'){
    if(!voxelWorld)return 0;if(voxelWorld.texturePalette.length<2){const status=document.getElementById('voxelTextureStatus');status.textContent='Add at least two different blocks to the texture palette.';status.classList.add('is-error');return 0}
    const result=BloxdTextureEngine.apply(voxelWorld.blocks,keys,voxelWorld.texturePalette,voxelTextureOptions(keys));voxelWorld.render();voxelWorld.commit(label);syncVoxelUI();const status=document.getElementById('voxelTextureStatus');status.classList.remove('is-error');status.textContent=`Textured ${result.changed.toLocaleString()} blocks with ${voxelWorld.texturePalette.length} palette blocks.`;scheduleAutosave(label);return result.changed
  }
  function textureTargetKeys(){if(!voxelWorld)return[];const target=document.getElementById('voxelTextureTarget').value;if(target==='selection')return[...voxelWorld.selection];if(target==='selection-surface')return BloxdTextureEngine.surfaceKeys(voxelWorld.blocks,voxelWorld.selection);if(target==='world-surface')return BloxdTextureEngine.surfaceKeys(voxelWorld.blocks);return[...voxelWorld.blocks.keys()]}
  document.getElementById('voxelTextureAddCurrent').addEventListener('click',()=>{if(!voxelWorld)return;const entry=voxelWorld.texturePalette.find(item=>item.id===voxelWorld.currentBlockId);if(entry)entry.weight+=1;else voxelWorld.texturePalette.push({id:voxelWorld.currentBlockId,weight:1});renderVoxelTexturePalette();scheduleAutosave('Texture palette')})
  document.getElementById('voxelTextureClear').addEventListener('click',()=>{if(voxelWorld){voxelWorld.texturePalette=[];renderVoxelTexturePalette();scheduleAutosave('Texture palette')}})
  document.getElementById('voxelTextureGenerate').addEventListener('click',()=>{if(!voxelWorld)return;voxelWorld.texturePalette=BloxdTextureEngine.generateNearRgb(document.getElementById('voxelTextureColor').value,Number(document.getElementById('voxelTextureCount').value)||6,document.getElementById('voxelTextureFamily').value,Number(document.getElementById('voxelTextureSpread').value)||65).map(item=>({id:item.id,weight:Number(item.weight.toFixed(2))}));renderVoxelTexturePalette();document.getElementById('voxelTextureStatus').textContent=`Generated ${voxelWorld.texturePalette.length} official blocks near ${document.getElementById('voxelTextureColor').value}.`;scheduleAutosave('Generate texture palette')})
  document.getElementById('voxelTextureApply').addEventListener('click',()=>{const keys=textureTargetKeys();if(!keys.length){const status=document.getElementById('voxelTextureStatus');status.textContent='The chosen target contains no blocks.';status.classList.add('is-error');return}applyVoxelTexture(keys,'Apply procedural block texture')})
  document.getElementById('voxelTextureRandomize').addEventListener('click',()=>{document.getElementById('voxelTextureSeed').value=`texture-${Math.floor(Math.random()*1e9)}`})
  document.getElementById('voxelTextureSpread').addEventListener('input',event=>document.getElementById('voxelTextureSpreadValue').value=event.target.value)
  document.getElementById('voxelTextureContrast').addEventListener('input',event=>document.getElementById('voxelTextureContrastValue').value=Number(event.target.value).toFixed(1))
  document.getElementById('voxelTextureBias').addEventListener('input',event=>document.getElementById('voxelTextureBiasValue').value=Number(event.target.value).toFixed(2))

  let selectedVoxelAsset=null,voxelAssetPage=0,voxelAssetGhost=null,voxelAssetGhostTarget=null
  const voxelAssetPageSize=40,voxelAssetFavorites=new Set(JSON.parse(localStorage.getItem('shapeStudioAssetFavorites')||'[]')),voxelAssetCache=new Map();let voxelAssetRecent=JSON.parse(localStorage.getItem('shapeStudioAssetRecent')||'[]')
  async function fetchVoxelAsset(asset){if(voxelAssetCache.has(asset.id))return voxelAssetCache.get(asset.id);const response=await fetch(`assets/bloxd-assets/${asset.file}`);if(!response.ok)throw new Error(`HTTP ${response.status}`);const parsed=BloxdSchematic.decodeSchematic(await response.arrayBuffer()),result={...asset,name:parsed.name||asset.name,voxels:parsed.voxels,size:[parsed.size.x,parsed.size.y,parsed.size.z]};voxelAssetCache.set(asset.id,result);return result}
  function filteredVoxelAssets(){const query=document.getElementById('voxelAssetSearch').value.trim().toLowerCase(),category=document.getElementById('voxelAssetCategory').value;return (globalThis.BLOXD_ASSET_CATALOG||[]).filter(asset=>{const categoryMatch=category==='all'||asset.category===category||(category==='favorites'&&voxelAssetFavorites.has(asset.id))||(category==='recent'&&voxelAssetRecent.includes(asset.id));return categoryMatch&&(!query||`${asset.name} ${asset.id}`.toLowerCase().includes(query))}).sort((a,b)=>category==='recent'?voxelAssetRecent.indexOf(a.id)-voxelAssetRecent.indexOf(b.id):0)}
  function renderVoxelAssetLibrary(){const host=document.getElementById('voxelAssetList');if(!host)return;const assets=filteredVoxelAssets(),pages=Math.max(1,Math.ceil(assets.length/voxelAssetPageSize));voxelAssetPage=Math.max(0,Math.min(pages-1,voxelAssetPage));const visible=assets.slice(voxelAssetPage*voxelAssetPageSize,(voxelAssetPage+1)*voxelAssetPageSize),icons={house:'🏠',tree:'🌳',rock:'🪨',stand:'🏛'};host.replaceChildren(...visible.map(asset=>{const card=document.createElement('div');card.tabIndex=0;card.setAttribute('role','button');card.className='voxel-asset-card';card.classList.toggle('is-active',selectedVoxelAsset&&selectedVoxelAsset.id===asset.id);const icon=document.createElement('span');icon.className='voxel-asset-card__icon';icon.textContent=icons[asset.category]||'⬡';const copy=document.createElement('span'),name=document.createElement('strong'),info=document.createElement('small');name.textContent=asset.name;info.textContent=`${asset.blocks.toLocaleString()} blocks · ${asset.size.join('×')}`;copy.append(name,info);const favorite=document.createElement('button');favorite.type='button';favorite.className='voxel-asset-favorite';favorite.textContent=voxelAssetFavorites.has(asset.id)?'★':'☆';favorite.title='Toggle favorite';favorite.addEventListener('click',event=>{event.stopPropagation();if(voxelAssetFavorites.has(asset.id))voxelAssetFavorites.delete(asset.id);else voxelAssetFavorites.add(asset.id);localStorage.setItem('shapeStudioAssetFavorites',JSON.stringify([...voxelAssetFavorites]));renderVoxelAssetLibrary()});card.append(icon,copy,favorite);card.addEventListener('click',()=>loadVoxelAsset(asset));return card}));document.getElementById('voxelAssetPage').textContent=`${assets.length.toLocaleString()} assets · ${voxelAssetPage+1}/${pages}`;document.getElementById('voxelAssetPrevious').disabled=voxelAssetPage===0;document.getElementById('voxelAssetNext').disabled=voxelAssetPage>=pages-1}
  async function loadVoxelAsset(asset){voxelAssetRecent=[asset.id,...voxelAssetRecent.filter(id=>id!==asset.id)].slice(0,24);localStorage.setItem('shapeStudioAssetRecent',JSON.stringify(voxelAssetRecent));const status=document.getElementById('voxelAssetSelected');status.textContent=`Loading ${asset.name}…`;try{selectedVoxelAsset=await fetchVoxelAsset(asset);const parsed={blockCount:selectedVoxelAsset.voxels.size};status.textContent=`${selectedVoxelAsset.name} · ${parsed.blockCount.toLocaleString()} blocks · ${selectedVoxelAsset.size.join(' × ')} · asset placement is active`;document.getElementById('voxelAssetPlaceMode').disabled=false;buildVoxelAssetGhost();setVoxelTool('asset');renderVoxelAssetLibrary();showProjectStatus(`${selectedVoxelAsset.name} loaded · move over the world and click to place`)}catch(error){status.textContent=`Could not load asset: ${error.message}`;showProjectStatus(status.textContent,true)}}
  function transformVoxelAsset(kind,axis){if(!selectedVoxelAsset)return;const entries=[...selectedVoxelAsset.voxels].map(([key,id])=>({p:BloxdVoxelEditor.parseKey(key),id})),max=[0,1,2].map(i=>Math.max(...entries.map(item=>item.p[i]))),next=new Map();entries.forEach(item=>{let[x,y,z]=item.p;if(kind==='rotate'&&axis==='y')[x,z]=[max[2]-z,x];else if(kind==='mirror'){const i={x:0,y:1,z:2}[axis],p=[x,y,z];p[i]=max[i]-p[i];[x,y,z]=p}next.set(BloxdVoxelEditor.keyOf(x,y,z),item.id)});selectedVoxelAsset.voxels=next;const points=[...next.keys()].map(BloxdVoxelEditor.parseKey);selectedVoxelAsset.size=[0,1,2].map(i=>Math.max(...points.map(point=>point[i]))+1);document.getElementById('voxelAssetSelected').textContent=`${selectedVoxelAsset.name} · ${next.size.toLocaleString()} blocks · ${selectedVoxelAsset.size.join(' × ')}`;buildVoxelAssetGhost();if(voxelAssetGhostTarget)updateVoxelAssetGhost(voxelAssetGhostTarget)}
  function assetAnchorOffset(){if(!selectedVoxelAsset)return[0,0,0];const[sx,sy,sz]=selectedVoxelAsset.size,anchor=document.getElementById('voxelAssetAnchor').value,y=Number(document.getElementById('voxelAssetYOffset').value)||0;if(anchor==='corner')return[0,y,0];if(anchor==='center')return[-Math.floor(sx/2),y-Math.floor(sy/2),-Math.floor(sz/2)];if(anchor==='top-center')return[-Math.floor(sx/2),y-sy+1,-Math.floor(sz/2)];return[-Math.floor(sx/2),y,-Math.floor(sz/2)]}
  function disposeVoxelAssetGhost(){if(!voxelAssetGhost)return;scene.remove(voxelAssetGhost);voxelAssetGhost.traverse(child=>{if(child.geometry)child.geometry.dispose();if(child.material)child.material.dispose()});voxelAssetGhost=null}
  function buildVoxelAssetGhost(){disposeVoxelAssetGhost();if(!selectedVoxelAsset)return;const grouped=new Map();selectedVoxelAsset.voxels.forEach((id,key)=>{if(!grouped.has(id))grouped.set(id,[]);grouped.get(id).push(BloxdVoxelEditor.parseKey(key))});voxelAssetGhost=new THREE.Group();voxelAssetGhost.name='Bloxd Asset Ghost';const matrix=new THREE.Matrix4();grouped.forEach((points,id)=>{const material=new THREE.MeshStandardMaterial({color:BloxdBlockColors.hex(id),transparent:true,opacity:.42,depthWrite:false,emissive:0x082c10,emissiveIntensity:.25}),mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material,points.length);points.forEach((point,index)=>{matrix.makeTranslation(point[0]+.5,point[1]+.5,point[2]+.5);mesh.setMatrixAt(index,matrix)});mesh.instanceMatrix.needsUpdate=true;mesh.userData.assetGhost=true;voxelAssetGhost.add(mesh)});scene.add(voxelAssetGhost);voxelAssetGhost.visible=activeVoxelTool==='asset'}
  function setVoxelAssetGhostVisible(visible){if(voxelAssetGhost)voxelAssetGhost.visible=visible}
  function updateVoxelAssetGhost(target){if(!selectedVoxelAsset||!voxelAssetGhost)return;voxelAssetGhostTarget=[...target];const offset=assetAnchorOffset(),origin=target.map((value,index)=>value+offset[index]);voxelAssetGhost.position.set(...origin);let collisions=0;selectedVoxelAsset.voxels.forEach((id,key)=>{const p=BloxdVoxelEditor.parseKey(key).map((value,index)=>value+origin[index]);if(voxelWorld&&voxelWorld.has(...p))collisions++});const collision=collisions>0;voxelAssetGhost.traverse(child=>{if(child.material){child.material.emissive.setHex(collision?0x7a0909:0x082c10);child.material.opacity=collision?.32:.48}});const status=document.getElementById('voxelAssetGhostStatus');status.classList.toggle('is-collision',collision);status.classList.toggle('is-ready',!collision);status.textContent=collision?`${collisions.toLocaleString()} destination blocks overlap · placement mode decides the result`:`Ready at ${origin.join(', ')} · mouse wheel adjusts height`}
  function placeVoxelAsset(position){if(!voxelWorld||!selectedVoxelAsset)return 0;const offset=assetAnchorOffset(),origin=position.map((value,index)=>value+offset[index]),placed=[],mode=document.getElementById('voxelAssetPasteMode').value,foundation=document.getElementById('voxelAssetFoundation').checked,lowest=new Map()
    if(mode==='replace-volume'){const[sx,sy,sz]=selectedVoxelAsset.size;for(let x=0;x<sx;x++)for(let y=0;y<sy;y++)for(let z=0;z<sz;z++)voxelWorld.delete(origin[0]+x,origin[1]+y,origin[2]+z)}
    selectedVoxelAsset.voxels.forEach((id,key)=>{const p=BloxdVoxelEditor.parseKey(key).map((value,index)=>value+origin[index]);if(mode==='subtract'){voxelWorld.delete(...p);return}if(mode==='air-only'&&voxelWorld.has(...p))return;const worldKey=voxelWorld.set(...p,id);placed.push(worldKey);const column=`${p[0]},${p[2]}`,current=lowest.get(column);if(current==null||p[1]<current)lowest.set(column,p[1])})
    if(foundation&&mode!=='subtract')lowest.forEach((bottom,column)=>{const[x,z]=column.split(',').map(Number);for(let y=bottom-1;y>=bottom-64;y--){if(voxelWorld.has(x,y,z))break;voxelWorld.set(x,y,z,voxelWorld.currentBlockId)}})
    voxelWorld.selection=new Set(placed);voxelWorld.render();voxelWorld.commit(`${mode} asset ${selectedVoxelAsset.name}`);syncVoxelUI();scheduleAutosave('Place Bloxd asset');showProjectStatus(`${mode==='subtract'?'Subtracted':'Placed'} ${selectedVoxelAsset.name} · ${placed.length.toLocaleString()} blocks`);return placed.length}
  document.getElementById('voxelAssetSearch').addEventListener('input',()=>{voxelAssetPage=0;renderVoxelAssetLibrary()});document.getElementById('voxelAssetCategory').addEventListener('change',()=>{voxelAssetPage=0;renderVoxelAssetLibrary()});document.getElementById('voxelAssetPrevious').addEventListener('click',()=>{voxelAssetPage--;renderVoxelAssetLibrary()});document.getElementById('voxelAssetNext').addEventListener('click',()=>{voxelAssetPage++;renderVoxelAssetLibrary()});document.getElementById('voxelAssetPlaceMode').addEventListener('click',()=>setVoxelTool('asset'));document.querySelectorAll('[data-voxel-asset-rotate]').forEach(button=>button.addEventListener('click',()=>transformVoxelAsset('rotate',button.dataset.voxelAssetRotate)));document.querySelectorAll('[data-voxel-asset-mirror]').forEach(button=>button.addEventListener('click',()=>transformVoxelAsset('mirror',button.dataset.voxelAssetMirror)));document.getElementById('voxelAssetUpload').addEventListener('click',()=>document.getElementById('voxelAssetFile').click());document.getElementById('voxelAssetFile').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{const parsed=BloxdSchematic.decodeSchematic(await file.arrayBuffer());selectedVoxelAsset={id:`custom-${Date.now()}`,name:parsed.name||file.name,file:null,category:'custom',voxels:parsed.voxels,size:[parsed.size.x,parsed.size.y,parsed.size.z]};document.getElementById('voxelAssetSelected').textContent=`Custom ${selectedVoxelAsset.name} · ${parsed.blockCount.toLocaleString()} blocks · ${selectedVoxelAsset.size.join(' × ')}`;document.getElementById('voxelAssetPlaceMode').disabled=false;buildVoxelAssetGhost();setVoxelTool('asset')}catch(error){showProjectStatus(`Could not import asset: ${error.message}`,true)}finally{event.target.value=''}})
  ;['voxelAssetAnchor','voxelAssetPasteMode','voxelAssetYOffset'].forEach(id=>document.getElementById(id).addEventListener('change',()=>{if(voxelAssetGhostTarget)updateVoxelAssetGhost(voxelAssetGhostTarget)}))
  renderVoxelAssetLibrary()

  let activeVoxelTerrainTool='raise',voxelTerrainStrokeChanged=false,voxelTerrainStrokeTargetY=null,voxelTerrainSurfacePalette=null
  const terrainHelp={raise:'Drag to add natural terrain layers.',lower:'Drag to remove terrain height.',flatten:'Uses the first touched height as a leveling plane.',smooth:'Averages each column with neighboring columns.',erode:'Removes exposed high points using seeded erosion.',terrace:'Quantizes elevations into stepped levels.',river:'Carves a shallow channel and adds water.',road:'Flattens and paints a road strip.',cliff:'Raises steep stone-backed terrain.',beach:'Levels and paints sand or biome beach blocks.',biome:'Paints surface, subsurface, and rock layers together.',vegetation:'Scatters direct-block trees using seed and density.',snow:'Paints biome snow on the exposed surface.'}
  function renderVoxelTerrainPalette(){const preset=BloxdTerrainBrush.PRESETS[document.getElementById('voxelTerrainBiome').value]||BloxdTerrainBrush.PRESETS.temperate,host=document.getElementById('voxelTerrainPalette'),roles=['surface','subsurface','stone','water','beach','road','snow','log','leaves'];host.replaceChildren(...roles.map(role=>{const swatch=document.createElement('span'),blockId=preset[role];swatch.style.background=`#${BloxdBlockColors.hex(blockId).toString(16).padStart(6,'0')}`;swatch.title=`${role}: ${BLOXD_ID_TO_NAME[blockId]||blockId}`;return swatch}))}
  function voxelTerrainOptions(targetY){const materials=voxelTerrainSurfacePalette&&voxelTerrainSurfacePalette.length>1?{surface:{mode:'palette',palette:voxelTerrainSurfacePalette,noise:'fbm',seed:document.getElementById('voxelTerrainSeed').value,scale:6}}:{};const settings={tool:activeVoxelTerrainTool,biome:document.getElementById('voxelTerrainBiome').value,radius:Number(document.getElementById('voxelTerrainRadius').value)||6,strength:Number(document.getElementById('voxelTerrainStrength').value)||2,depth:Number(document.getElementById('voxelTerrainDepth').value)||3,falloff:document.getElementById('voxelTerrainFalloff').value,seed:document.getElementById('voxelTerrainSeed').value,density:Number(document.getElementById('voxelTerrainDensity').value)||.08,water:document.getElementById('voxelTerrainWater').checked,targetY,materials};if(voxelWorld)voxelWorld.terrainSettings={...settings};return settings}
  function applyVoxelTerrainBrush(center,start=false){if(!voxelWorld)return 0;if(start||voxelTerrainStrokeTargetY==null)voxelTerrainStrokeTargetY=center[1];const target=['flatten','road','beach'].includes(activeVoxelTerrainTool)?voxelTerrainStrokeTargetY:undefined,changed=BloxdTerrainBrush.apply(voxelWorld,center,voxelTerrainOptions(target));if(changed.size){voxelTerrainStrokeChanged=true;voxelWorld.render();syncVoxelUI()}return changed.size}
  document.getElementById('voxelTerrainTools').addEventListener('click',event=>{const button=event.target.closest('[data-terrain-tool]');if(!button)return;activeVoxelTerrainTool=button.dataset.terrainTool;document.querySelectorAll('[data-terrain-tool]').forEach(item=>item.classList.toggle('is-active',item===button));document.getElementById('voxelTerrainHelp').textContent=terrainHelp[activeVoxelTerrainTool];setVoxelTool('terrain')})
  document.getElementById('voxelTerrainBiome').addEventListener('change',renderVoxelTerrainPalette);document.getElementById('voxelTerrainRadius').addEventListener('input',event=>document.getElementById('voxelTerrainRadiusValue').value=event.target.value);document.getElementById('voxelTerrainStrength').addEventListener('input',event=>document.getElementById('voxelTerrainStrengthValue').value=event.target.value);document.getElementById('voxelTerrainCapturePalette').addEventListener('click',()=>{if(!voxelWorld||voxelWorld.texturePalette.length<2)return showProjectStatus('Create a Texture Studio palette with at least two blocks first.',true);voxelTerrainSurfacePalette=voxelWorld.texturePalette.map(item=>({...item}));showProjectStatus(`Terrain surface now uses ${voxelTerrainSurfacePalette.length} palette blocks`)})
  renderVoxelTerrainPalette()

  function parseScatterCollection(){const catalog=new Map((globalThis.BLOXD_ASSET_CATALOG||[]).map(a=>[a.id,a]));return document.getElementById('voxelScatterCollection').value.split(/[\n,]+/).map(v=>v.trim()).filter(Boolean).map(value=>{const[id,weight]=value.split(':');return catalog.has(id)?{id,weight:Math.max(.01,Number(weight)||1)}:null}).filter(Boolean)}
  function voxelScatterOptions(){return{kind:document.getElementById('voxelScatterKind').value,biome:document.getElementById('voxelScatterBiome').value,count:Number(document.getElementById('voxelScatterCount').value)||40,spacing:Number(document.getElementById('voxelScatterSpacing').value)||12,density:Number(document.getElementById('voxelScatterDensity').value)||.3,seed:document.getElementById('voxelScatterSeed').value,minAltitude:Number(document.getElementById('voxelScatterMinAltitude').value)||0,maxAltitude:Number(document.getElementById('voxelScatterMaxAltitude').value)||1,minMoisture:Number(document.getElementById('voxelScatterMoisture').value)||0,maxSlope:Number(document.getElementById('voxelScatterSlope').value)||8,rotate:document.getElementById('voxelScatterRotate').checked,mirror:document.getElementById('voxelScatterMirror').checked,collection:parseScatterCollection()}}
  document.getElementById('voxelScatterApply').addEventListener('click',async()=>{if(!voxelWorld||!voxelWorld.size)return showProjectStatus('Create terrain before scattering assets.',true);const button=document.getElementById('voxelScatterApply'),status=document.getElementById('voxelScatterStatus'),options=voxelScatterOptions(),catalog=globalThis.BLOXD_ASSET_CATALOG||[],byId=new Map(catalog.map(a=>[a.id,a])),collection=BloxdAssetScatter.collection(catalog,options.kind,options.biome,options.collection),candidates=BloxdAssetScatter.candidates(voxelWorld,options,voxelWorld.proceduralPaths);if(!collection.length||!candidates.length){status.textContent='No valid assets or terrain candidates matched these rules.';status.classList.add('is-error');return}button.disabled=true;status.className='voxel-world-status is-working';status.textContent=`Analyzed terrain · placing up to ${candidates.length} collision-free assets…`;let placed=0,blocks=0,rejected=0;try{for(let i=0;i<candidates.length;i++){const c=candidates[i],assetId=BloxdAssetScatter.choose(collection,options.seed,c.x,c.z),meta=byId.get(assetId);if(!meta){rejected++;continue}const asset=await fetchVoxelAsset(meta),rotation=options.rotate?Math.floor(BloxdAssetScatter.hash(`${options.seed}:rot`,c.x,c.z)*4):0,mirror=options.mirror&&BloxdAssetScatter.hash(`${options.seed}:mirror`,c.x,c.z)>.5,transformed=BloxdAssetScatter.transform(asset.voxels,asset.size,rotation,mirror),result=BloxdAssetScatter.place(voxelWorld,transformed,c.y,c.x,c.z);if(result){placed++;blocks+=result.keys.length}else rejected++;if(i%5===0)status.textContent=`Placed ${placed}/${i+1} candidates · ${blocks.toLocaleString()} blocks…`}if(placed){voxelWorld.scatterSettings={...options,collection};voxelWorld.render();voxelWorld.commit(`Scatter ${options.kind}`);syncVoxelUI();scheduleAutosave('Procedural asset scatter')}status.className='voxel-world-status';status.textContent=`Placed ${placed} ${options.kind} (${blocks.toLocaleString()} blocks) · ${rejected} collision/rule rejections.`;showProjectStatus(status.textContent,!placed)}catch(error){status.className='voxel-world-status is-error';status.textContent=`Scatter failed: ${error.message}`;showProjectStatus(status.textContent,true)}finally{button.disabled=false}})

  let activeVoxelPathId=null,voxelPathSurfacePalette=null,voxelPathPreviewGroup=new THREE.Group();voxelPathPreviewGroup.name='Live path previews';scene.add(voxelPathPreviewGroup)
  function currentVoxelPath(){return voxelWorld&&voxelWorld.proceduralPaths.find(path=>path.id===activeVoxelPathId)}
  function pathSettings(){const type=document.getElementById('voxelPathType').value;return{type,width:Number(document.getElementById('voxelPathWidth').value)||5,elevation:Number(document.getElementById('voxelPathElevation').value)||0,height:Number(document.getElementById('voxelPathHeight').value)||4,smoothness:Number(document.getElementById('voxelPathSmoothness').value)||6,conform:document.getElementById('voxelPathConform').checked,seed:document.getElementById('voxelPathSeed').value,palettes:{surface:voxelPathSurfacePalette&&voxelPathSurfacePalette.length?voxelPathSurfacePalette.map(v=>({...v})):[{id:Number(document.getElementById('voxelPathSurface').value)||28,weight:1}],edge:[{id:Number(document.getElementById('voxelPathEdge').value)||5,weight:1}],fill:[{id:Number(document.getElementById('voxelPathFill').value)||(type==='river'?126:28),weight:1}]}}}
  function restoreVoxelPath(path){(path.generated||[]).forEach(k=>{const p=BloxdVoxelEditor.parseKey(k);voxelWorld.delete(...p)});(path.previous||[]).forEach(([k,id])=>{const p=BloxdVoxelEditor.parseKey(k);if(id)voxelWorld.set(...p,id);else voxelWorld.delete(...p)})}
  function renderVoxelPathPreviews(){voxelPathPreviewGroup.traverse(child=>{if(child!==voxelPathPreviewGroup){if(child.geometry)child.geometry.dispose();if(child.material)child.material.dispose()}});voxelPathPreviewGroup.clear();if(!voxelWorld)return;voxelWorld.proceduralPaths.forEach(path=>{const samples=BloxdPathEngine.sample(path.points||[],path.smoothness||6);if(samples.length<2)return;const geometry=new THREE.BufferGeometry().setFromPoints(samples.map(p=>new THREE.Vector3(p[0]+.5,p[1]+1.15,p[2]+.5))),material=new THREE.LineBasicMaterial({color:path.id===activeVoxelPathId?0xffda63:0x5ccfff,transparent:true,opacity:.9}),line=new THREE.Line(geometry,material);line.className='voxel-path-preview';voxelPathPreviewGroup.add(line);(path.points||[]).forEach(p=>{const marker=new THREE.Mesh(new THREE.SphereGeometry(.38,10,8),new THREE.MeshBasicMaterial({color:path.id===activeVoxelPathId?0xffa928:0x2383bb}));marker.position.set(p[0]+.5,p[1]+1.15,p[2]+.5);voxelPathPreviewGroup.add(marker)})})}
  function renderVoxelPathList(){const list=document.getElementById('voxelPathList');if(!voxelWorld){list.replaceChildren();return}list.replaceChildren(...voxelWorld.proceduralPaths.map((path,index)=>{const option=new Option(`${index+1}. ${path.type} · ${(path.points||[]).length} points`,path.id);option.selected=path.id===activeVoxelPathId;return option}));renderVoxelPathPreviews()}
  function loadVoxelPathControls(path){if(!path)return;['type','width','elevation','height','smoothness','seed'].forEach(key=>{const el=document.getElementById(`voxelPath${key[0].toUpperCase()}${key.slice(1)}`);if(el&&path[key]!=null)el.value=path[key]});document.getElementById('voxelPathConform').checked=path.conform!==false;voxelPathSurfacePalette=path.palettes&&path.palettes.surface&&path.palettes.surface.length>1?path.palettes.surface.map(v=>({...v})):null;document.getElementById('voxelPathSurface').value=path.palettes&&path.palettes.surface&&path.palettes.surface[0]?path.palettes.surface[0].id:28;document.getElementById('voxelPathEdge').value=path.palettes&&path.palettes.edge&&path.palettes.edge[0]?path.palettes.edge[0].id:5;document.getElementById('voxelPathFill').value=path.palettes&&path.palettes.fill&&path.palettes.fill[0]?path.palettes.fill[0].id:(path.type==='river'?126:28)}
  function applyVoxelPathPlan(path){if(!path||path.points.length<2){path.generated=[];path.previous=[];path.samples=[];return 0}const plan=BloxdPathEngine.plan(voxelWorld,path),affected=new Set([...plan.remove,...plan.set.keys()]);path.previous=[...affected].map(k=>[k,voxelWorld.blocks.get(k)||0]);plan.remove.forEach(k=>{const p=BloxdVoxelEditor.parseKey(k);voxelWorld.delete(...p)});plan.set.forEach((id,k)=>{const p=BloxdVoxelEditor.parseKey(k);voxelWorld.set(...p,id)});path.generated=[...affected];path.samples=plan.samples.map(p=>p.map(n=>Math.round(n*100)/100));return affected.size}
  function rebuildVoxelPath(path,commit=true){if(!voxelWorld||!path||path.points.length<2)return 0;Object.assign(path,pathSettings());[...voxelWorld.proceduralPaths].reverse().forEach(restoreVoxelPath);let count=0;voxelWorld.proceduralPaths.forEach(item=>{const n=applyVoxelPathPlan(item);if(item===path)count=n});voxelWorld.render();if(commit)voxelWorld.commit(`Rebuild live ${path.type}`);syncVoxelUI();renderVoxelPathList();scheduleAutosave('Live procedural path');return count}
  document.getElementById('voxelPathNew').addEventListener('click',()=>{if(!voxelWorld)return;const path={id:`path-${Date.now()}-${Math.floor(Math.random()*1e5)}`,name:'Live path',points:[],generated:[],previous:[],...pathSettings()};voxelWorld.proceduralPaths.push(path);activeVoxelPathId=path.id;setVoxelTool('path');renderVoxelPathList();document.getElementById('voxelPathStatus').textContent='Click terrain to add control points. Shift-click moves the nearest existing point.'})
  document.getElementById('voxelPathFinish').addEventListener('click',()=>{const path=currentVoxelPath();if(!path||path.points.length<2)return showProjectStatus('Add at least two path control points.',true);const count=rebuildVoxelPath(path);document.getElementById('voxelPathStatus').textContent=`Live ${path.type} rebuilt from ${path.points.length} points · ${count.toLocaleString()} affected blocks.`})
  document.getElementById('voxelPathUndoPoint').addEventListener('click',()=>{const path=currentVoxelPath();if(path&&path.points.length){path.points.pop();renderVoxelPathList();scheduleAutosave('Edit path points')}})
  document.getElementById('voxelPathDelete').addEventListener('click',()=>{const path=currentVoxelPath();if(!path)return;[...voxelWorld.proceduralPaths].reverse().forEach(restoreVoxelPath);voxelWorld.proceduralPaths=voxelWorld.proceduralPaths.filter(p=>p!==path);voxelWorld.proceduralPaths.forEach(applyVoxelPathPlan);activeVoxelPathId=null;voxelWorld.render();voxelWorld.commit(`Delete live ${path.type}`);syncVoxelUI();renderVoxelPathList();scheduleAutosave('Delete path')})
  document.getElementById('voxelPathList').addEventListener('change',event=>{activeVoxelPathId=event.target.value;loadVoxelPathControls(currentVoxelPath());setVoxelTool('path');renderVoxelPathList()})
  document.getElementById('voxelPathCapturePalette').addEventListener('click',()=>{if(!voxelWorld||voxelWorld.texturePalette.length<2)return showProjectStatus('Create a Texture Studio palette with at least two blocks first.',true);voxelPathSurfacePalette=voxelWorld.texturePalette.map(v=>({...v}));showProjectStatus(`Path surface role now uses ${voxelPathSurfacePalette.length} weighted blocks`)})
  document.getElementById('voxelPathType').addEventListener('change',event=>{const type=event.target.value;if(type==='bridge'){document.getElementById('voxelPathConform').checked=false;document.getElementById('voxelPathElevation').value=5;document.getElementById('voxelPathHeight').value=6}if(type==='road'||type==='river'||type==='wall'||type==='fence')document.getElementById('voxelPathConform').checked=true;if(type==='river')document.getElementById('voxelPathFill').value=BLOXD_NAME_TO_ID.Water||126;else document.getElementById('voxelPathFill').value=BLOXD_NAME_TO_ID.Stone||28})

  document.getElementById('voxelToolGrid').addEventListener('click', event => { const button = event.target.closest('[data-voxel-tool]'); if (button) setVoxelTool(button.dataset.voxelTool) })

  voxelBlockSearch.addEventListener('input', () => renderVoxelBlockOptions(voxelBlockSearch.value))
  voxelBlockSelect.addEventListener('change', updateVoxelBlockSwatch)
  document.getElementById('voxelGlobalResolution').addEventListener('change', event => { if (voxelWorld) { voxelWorld.globalBlocksPerUnit = Math.max(.5, Math.min(12, Number(event.target.value) || 2)); scheduleAutosave('Voxel resolution') } })
  document.getElementById('voxelChunkSize').addEventListener('change',event=>{if(voxelWorld){voxelWorld.chunkSize=Math.max(8,Math.min(32,Number(event.target.value)||16));voxelWorld.rebuildChunkIndex();voxelWorld.render();syncVoxelUI();scheduleAutosave('Voxel chunk size');showProjectStatus(`Renderer now uses ${voxelWorld.chunkSize}³ dirty chunks`)}})
  document.getElementById('voxelCopy').addEventListener('click', () => { if (voxelWorld) showProjectStatus(`Copied ${voxelWorld.copySelection().toLocaleString()} blocks`) })
  document.getElementById('voxelCut').addEventListener('click', () => { if (voxelWorld) voxelWorld.cutSelection() })
  document.getElementById('voxelDeleteSelection').addEventListener('click', () => { if (voxelWorld) voxelWorld.deleteSelection() })
  document.getElementById('voxelClearSelection').addEventListener('click', () => { if (voxelWorld) voxelWorld.clearSelection() })
  document.querySelectorAll('[data-voxel-move]').forEach(button => button.addEventListener('click', () => { if (voxelWorld) voxelWorld.moveSelection(...button.dataset.voxelMove.split(',').map(Number)) }))
  document.querySelectorAll('[data-voxel-rotate]').forEach(button => button.addEventListener('click', () => { if (voxelWorld) voxelWorld.rotateSelection(button.dataset.voxelRotate) }))
  document.querySelectorAll('[data-voxel-mirror]').forEach(button => button.addEventListener('click', () => { if (voxelWorld) voxelWorld.mirrorSelection(button.dataset.voxelMirror) }))
  document.getElementById('voxelReplaceAll').addEventListener('click', () => {
    if (!voxelWorld) return
    const sourceName = prompt('Replace which block ID or exact block name?', String(voxelWorld.currentBlockId)); if (sourceName == null) return
    const sourceId = BLOXD_NAME_TO_ID[sourceName] != null ? BLOXD_NAME_TO_ID[sourceName] : Number(sourceName)
    if (!Number.isFinite(sourceId)) return showProjectStatus('Unknown source block.', true)
    showProjectStatus(`Replaced ${voxelWorld.replace(sourceId, voxelWorld.currentBlockId, voxelWorld.selection.size > 0).toLocaleString()} blocks`)
  })

  // Block-native Advanced, Materials, and Modifier panel adaptations.
  document.getElementById('voxelAdvancedApplyMove').addEventListener('click',()=>{if(!voxelWorld)return;voxelWorld.moveSelection(...['X','Y','Z'].map(axis=>Math.round(Number(document.getElementById(`voxelAdvancedMove${axis}`).value)||0)));syncVoxelUI()})
  document.getElementById('voxelAdvancedApplyScale').addEventListener('click',()=>{if(!voxelWorld)return;voxelWorld.scaleSelection(...['X','Y','Z'].map(axis=>Number(document.getElementById(`voxelAdvancedScale${axis}`).value)||1));syncVoxelUI()})
  document.querySelectorAll('[data-voxel-advanced-rotate]').forEach(button=>button.addEventListener('click',()=>{if(voxelWorld){voxelWorld.rotateSelection(button.dataset.voxelAdvancedRotate);syncVoxelUI()}}))
  document.querySelectorAll('[data-voxel-advanced-mirror]').forEach(button=>button.addEventListener('click',()=>{if(voxelWorld){voxelWorld.mirrorSelection(button.dataset.voxelAdvancedMirror);syncVoxelUI()}}))
  document.getElementById('voxelAdvancedDuplicate').addEventListener('click',()=>{if(voxelWorld){voxelWorld.copySelection();setVoxelTool('paste');showProjectStatus(`Copied ${voxelWorld.clipboard.length.toLocaleString()} blocks; click to paste`)}})
  document.getElementById('voxelAdvancedDelete').addEventListener('click',()=>{if(voxelWorld){voxelWorld.deleteSelection();syncVoxelUI()}})
  document.getElementById('voxelAdvancedClearWorld').addEventListener('click',()=>{if(voxelWorld&&confirm('Delete every block in this world?')){voxelWorld.blocks.clear();voxelWorld.selection.clear();voxelWorld.render();voxelWorld.commit('Clear block world');syncVoxelUI()}})

  function blockIdFromMaterialColor(){const hex=parseInt(document.getElementById('voxelMaterialColor').value.slice(1),16);return BloxdColorMatcher.nearest(hex,{family:'safe'}).best.id}
  document.getElementById('voxelMaterialUse').addEventListener('click',()=>{if(!voxelWorld)return;voxelWorld.currentBlockId=blockIdFromMaterialColor();renderVoxelBlockOptions(BLOXD_ID_TO_NAME[voxelWorld.currentBlockId]);updateVoxelBlockSwatch();showProjectStatus(`Using ${blockLabel(voxelWorld.currentBlockId)}`)})
  document.getElementById('voxelMaterialPaintSelection').addEventListener('click',()=>{if(!voxelWorld||!voxelWorld.selection.size)return;const id=blockIdFromMaterialColor();voxelWorld.selection.forEach(key=>voxelWorld.blocks.set(key,id));voxelWorld.currentBlockId=id;voxelWorld.render();voxelWorld.commit('Paint block selection');syncVoxelUI()})
  document.getElementById('voxelMaterialPickFromSelection').addEventListener('click',()=>{if(!voxelWorld||!voxelWorld.selection.size)return;const counts=new Map();voxelWorld.selection.forEach(key=>{const id=voxelWorld.blocks.get(key);counts.set(id,(counts.get(id)||0)+1)});voxelWorld.currentBlockId=[...counts].sort((a,b)=>b[1]-a[1])[0][0];renderVoxelBlockOptions(BLOXD_ID_TO_NAME[voxelWorld.currentBlockId]);updateVoxelBlockSwatch()})

  document.querySelectorAll('[data-voxel-modifier]').forEach(button=>button.addEventListener('click',()=>{if(!voxelWorld)return;const op=button.dataset.voxelModifier;if(op==='hollow')voxelWorld.hollowSelection();else if(op==='dilate')voxelWorld.dilateSelection();else if(op==='erode')voxelWorld.erodeSelection();else if(op==='smooth')voxelWorld.smoothSelection();else if(op==='subdivide')voxelWorld.scaleSelection(2,2,2);syncVoxelUI()}))
  document.querySelectorAll('[data-voxel-boolean]').forEach(button=>button.addEventListener('click',()=>{if(voxelWorld){voxelWorld.booleanClipboard(button.dataset.voxelBoolean);syncVoxelUI()}}))
  document.querySelectorAll('[data-voxel-modifier-mirror]').forEach(button=>button.addEventListener('click',()=>{if(voxelWorld){voxelWorld.mirrorSelection(button.dataset.voxelModifierMirror);syncVoxelUI()}}))

  function voxelPointerPosition(event) {
    const rect = renderer.domElement.getBoundingClientRect()
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(mouse, camera)
    const hit=voxelWorld.pick(raycaster.intersectObjects(voxelWorld.meshes, false));if(hit)return hit
    if(['place','asset','paste','box','hollow-box','line'].includes(activeVoxelTool)){const point=new THREE.Vector3();if(raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),point))return{position:[Math.floor(point.x),-1,Math.floor(point.z)],normal:new THREE.Vector3(0,1,0),id:0}}
    return null
  }

  function handleVoxelPointer(event) {
    if (editorMode !== 'bloxd' || !voxelWorld || event.button !== 0 || event.target !== renderer.domElement) return
    const hit = voxelPointerPosition(event); if (!hit) return
    event.preventDefault(); event.stopImmediatePropagation()
    const existing = hit.position
    const adjacent = existing.map((value, index) => value + Math.round(hit.normal.getComponent(index)))
    const brushRadius = Math.max(0, Math.min(8, Number(document.getElementById('voxelBrushRadius').value) || 0))
    if (activeVoxelTool === 'place') brushRadius ? voxelWorld.sphere(adjacent, brushRadius, 'place') : voxelWorld.place(adjacent)
    else if (activeVoxelTool === 'remove') brushRadius ? voxelWorld.sphere(existing, brushRadius, 'remove') : voxelWorld.remove(existing)
    else if (activeVoxelTool === 'paint') brushRadius ? voxelWorld.sphere(existing, brushRadius, 'paint') : voxelWorld.paint(existing)
    else if (activeVoxelTool === 'eyedropper') { voxelWorld.currentBlockId = hit.id; renderVoxelBlockOptions(BLOXD_ID_TO_NAME[hit.id] || String(hit.id)); voxelBlockSearch.value = ''; showProjectStatus(`Picked ${blockLabel(hit.id)}`) }
    else if (activeVoxelTool === 'fill') voxelWorld.floodFill(existing)
    else if (activeVoxelTool === 'connected') voxelWorld.selectConnected(existing, event.shiftKey)
    else if (activeVoxelTool === 'paste') voxelWorld.paste(adjacent)
    else if (activeVoxelTool === 'asset') {placeVoxelAsset(adjacent);updateVoxelAssetGhost(adjacent)}
    else if (activeVoxelTool === 'terrain') applyVoxelTerrainBrush(existing,true)
    else if (activeVoxelTool === 'scatter') showProjectStatus('Configure the scatter rules, then use “Scatter collision-free assets”.')
    else if (activeVoxelTool === 'path') {let path=currentVoxelPath();if(!path){path={id:`path-${Date.now()}`,name:'Live path',points:[],generated:[],previous:[],...pathSettings()};voxelWorld.proceduralPaths.push(path);activeVoxelPathId=path.id}const point=[existing[0],existing[1],existing[2]];if(event.shiftKey&&path.points.length){let nearest=0,distance=Infinity;path.points.forEach((p,i)=>{const d=Math.hypot(p[0]-point[0],p[2]-point[2]);if(d<distance){distance=d;nearest=i}});path.points[nearest]=point}else path.points.push(point);if(path.points.length>=2){const affected=rebuildVoxelPath(path);document.getElementById('voxelPathStatus').textContent=`Live ${path.type} rebuilt immediately · ${path.points.length} points · ${affected.toLocaleString()} blocks`}else{renderVoxelPathList();document.getElementById('voxelPathStatus').textContent='First control point added · click a second point to build';scheduleAutosave('Edit path control points')}}
    else if (activeVoxelTool === 'texture') {const radius=brushRadius,keys=[];for(let x=-radius;x<=radius;x++)for(let y=-radius;y<=radius;y++)for(let z=-radius;z<=radius;z++){if(x*x+y*y+z*z>radius*radius)continue;const key=BloxdVoxelEditor.keyOf(existing[0]+x,existing[1]+y,existing[2]+z);if(voxelWorld.blocks.has(key))keys.push(key)}applyVoxelTexture(keys,'Texture brush')}
    else if (activeVoxelTool === 'single-select') {
      const key=BloxdVoxelEditor.keyOf(...existing);if(!event.shiftKey)voxelWorld.selection.clear();if(event.shiftKey&&voxelWorld.selection.has(key))voxelWorld.selection.delete(key);else voxelWorld.selection.add(key);voxelWorld.renderSelection()
    }
    else if (activeVoxelTool === 'rotate-select') { voxelWorld.selectConnected(existing, event.shiftKey); voxelWorld.rotateSelection('y') }
    else if (activeVoxelTool === 'smooth-brush') voxelWorld.smoothSphere(existing, brushRadius || 2)
    else if (activeVoxelTool === 'flatten-brush') voxelWorld.flattenSphere(existing, brushRadius || 2)
    else if (activeVoxelTool === 'measure-blocks') {
      const point=new THREE.Vector3(existing[0]+.5,existing[1]+.5,existing[2]+.5);measurePoints.push(point);addMeasureMarker(point);completeMeasurementIfReady()
    }
    else if (activeVoxelTool === 'move') {
      if (!voxelWorld.selection.size) { const key=BloxdVoxelEditor.keyOf(...existing);voxelWorld.selection.add(key);voxelWorld.renderSelection() }
      if (!voxelToolAnchor) { voxelToolAnchor=existing;voxelToolHint.textContent='Move origin set. Click the destination block.' }
      else { voxelWorld.moveSelection(existing[0]-voxelToolAnchor[0],existing[1]-voxelToolAnchor[1],existing[2]-voxelToolAnchor[2]);voxelToolAnchor=null;voxelToolHint.textContent=voxelToolHints.move }
    }
    else {
      const position = activeVoxelTool === 'select' ? existing : adjacent
      if (!voxelToolAnchor) { voxelToolAnchor = position; voxelToolHint.textContent = 'First point set. Click the second point.' }
      else {
        if (activeVoxelTool === 'box') voxelWorld.box(voxelToolAnchor, position)
        if (activeVoxelTool === 'hollow-box') voxelWorld.box(voxelToolAnchor, position, voxelWorld.currentBlockId, true)
        if (activeVoxelTool === 'line') voxelWorld.line(voxelToolAnchor, position)
        if (activeVoxelTool === 'select') voxelWorld.selectBox(voxelToolAnchor, position, event.shiftKey)
        voxelToolAnchor = null; voxelToolHint.textContent = voxelToolHints[activeVoxelTool]
      }
    }
    syncVoxelUI(); scheduleAutosave('Voxel edit')
  }
  let lastVoxelBrushKey = null
  renderer.domElement.addEventListener('pointerdown', event=>{lastVoxelBrushKey=null;handleVoxelPointer(event)}, true)
  renderer.domElement.addEventListener('pointermove', event=>{
    if(editorMode!=='bloxd'||!voxelWorld)return
    if(activeVoxelTool==='asset'&&event.buttons===0){const hit=voxelPointerPosition(event);if(hit){const target=hit.position.map((value,index)=>value+Math.round(hit.normal.getComponent(index)));updateVoxelAssetGhost(target)}return}
    if(activeVoxelTool==='terrain'&&event.buttons===1){const hit=voxelPointerPosition(event);if(hit)applyVoxelTerrainBrush(hit.position);return}
    if(event.buttons!==1||!['place','remove','paint','texture','smooth-brush','flatten-brush'].includes(activeVoxelTool))return
    const radius=Number(document.getElementById('voxelBrushRadius').value)||0;if(!radius)return
    const hit=voxelPointerPosition(event);if(!hit)return;const key=hit.position.join(',');if(key===lastVoxelBrushKey)return;lastVoxelBrushKey=key;handleVoxelPointer(event)
  },true)
  renderer.domElement.addEventListener('pointerup',()=>{lastVoxelBrushKey=null;if(voxelTerrainStrokeChanged&&voxelWorld){voxelWorld.commit(`${activeVoxelTerrainTool} terrain stroke`);scheduleAutosave('Terrain brush');voxelTerrainStrokeChanged=false;voxelTerrainStrokeTargetY=null}},true)
  renderer.domElement.addEventListener('wheel',event=>{if(editorMode!=='bloxd'||activeVoxelTool!=='asset'||!selectedVoxelAsset)return;event.preventDefault();const input=document.getElementById('voxelAssetYOffset');input.value=(Number(input.value)||0)+(event.deltaY<0?1:-1);if(voxelAssetGhostTarget)updateVoxelAssetGhost(voxelAssetGhostTarget)},{passive:false})

  function exportVoxelWorld(format) {
    if (!voxelWorld || !voxelWorld.size) return showProjectStatus('The voxel world is empty.', true)
    const baseName = safeFileName(currentProjectName)
    if (format === 'bloxdschem') {
      try {
        const result = BloxdSchematic.encodeSchematic(voxelWorld.toVoxelMap(), currentProjectName || 'Bloxd World')
        downloadBlob(new Blob([result.bytes], { type: 'application/octet-stream' }), `${baseName}.bloxdschem`)
        showProjectStatus(`Exported ${result.blockCount.toLocaleString()} Bloxd blocks`)
      } catch (error) { showProjectStatus(error.message, true) }
      return
    }
    const group = voxelWorld.toObject3D(format !== 'glb', 100000)
    try {
      if (format === 'glb') {
        new THREE.GLTFExporter().parse(group, result => { downloadBlob(new Blob([result], { type: 'model/gltf-binary' }), `${baseName}.glb`); showProjectStatus('Voxel GLB export complete') }, { binary: true, onlyVisible: true })
      } else if (format === 'obj') downloadBlob(new Blob([new THREE.OBJExporter().parse(group)], { type: 'text/plain' }), `${baseName}.obj`)
      else if (format === 'stl') downloadBlob(new Blob([new THREE.STLExporter().parse(group, { binary: true })], { type: 'model/stl' }), `${baseName}.stl`)
    } catch (error) { console.error(error); showProjectStatus(`Voxel ${format.toUpperCase()} export failed`, true) }
  }

  function updateBloxdEstimate() {
    scene.updateMatrixWorld(true)
    const scale = Math.max(0.5, Math.min(12, parseFloat(document.getElementById('bloxdResolution').value) || 2))
    const bounds = new THREE.Box3()
    const seen = new Set()
    cubes.forEach((modelShape) => modelShape.mesh.traverse((mesh) => {
      if (!mesh.isMesh || seen.has(mesh.uuid) || !mesh.geometry) return
      seen.add(mesh.uuid)
      let node = mesh
      while (node && node !== scene) {
        if (!node.visible) return
        node = node.parent
      }
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
      if (mesh.geometry.boundingBox) bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld))
    }))
    const estimate = document.getElementById('bloxdEstimate')
    if (bounds.isEmpty()) {
      estimate.textContent = 'No visible mesh geometry to convert.'
      estimate.classList.add('is-warning')
      return
    }
    const size = bounds.getSize(new THREE.Vector3())
    const dimensions = [size.x, size.y, size.z].map(value => Math.max(1, Math.ceil(value * scale) + 2))
    const chunks = dimensions.map(value => Math.ceil(value / 32)).reduce((total, value) => total * value, 1)
    const volume = dimensions.reduce((total, value) => total * value, 1)
    estimate.textContent = `Estimated bounds: ${dimensions.join(' × ')} blocks · up to ${volume.toLocaleString()} bounding-volume blocks · ${chunks} chunk${chunks === 1 ? '' : 's'}`
    estimate.classList.toggle('is-warning', chunks > BloxdSchematic.MAX_CHUNKS || volume > 2000000)
  }

  function setBloxdExportOpen(open) {
    bloxdExportDialog.classList.toggle('is-open', open)
    bloxdExportDialog.setAttribute('aria-hidden', String(!open))
    if (open) {
      document.getElementById('bloxdSchemName').value = currentProjectName === 'shape-studio-project' ? '3D Model' : currentProjectName
      bloxdProgress.classList.add('is-hidden')
      bloxdExportResult.classList.add('is-hidden')
      bloxdExportResult.classList.remove('is-error')
      updateBloxdEstimate()
    }
  }

  document.getElementById('bloxdResolution').addEventListener('input', updateBloxdEstimate)
  BloxdSchematic.BLOCK_PALETTE.forEach((block) => {
    const option = document.createElement('option')
    option.value = block.id
    option.textContent = `${block.name} (#${block.id})`
    if (block.id === 28) option.selected = true
    bloxdBlockType.appendChild(option)
  })

  bloxdMaterialMode.addEventListener('change', () => {
    document.getElementById('bloxdBlockRow').style.display = bloxdMaterialMode.value === 'single' ? 'grid' : 'none'
  })
  document.querySelectorAll('[data-close-bloxd-export]').forEach(element => element.addEventListener('click', () => {
    if (!generateBloxdSchem.disabled) setBloxdExportOpen(false)
  }))

  generateBloxdSchem.addEventListener('click', async () => {
    if (!cubes.length) return
    generateBloxdSchem.disabled = true
    bloxdProgress.classList.remove('is-hidden')
    bloxdExportResult.classList.add('is-hidden')
    bloxdProgressBar.style.width = '0%'
    bloxdProgressText.textContent = 'Preparing visible meshes…'
    const exportGroup = createExportGroup()
    try {
      const voxels = await BloxdSchematic.voxelizeObject(exportGroup, {
        THREE,
        blocksPerUnit: parseFloat(document.getElementById('bloxdResolution').value) || 2,
        fillMode: document.getElementById('bloxdFillMode').value,
        materialMode: bloxdMaterialMode.value,
        blockId: parseInt(bloxdBlockType.value, 10) || 28,
        paletteFamily: document.getElementById('bloxdPaletteFamily').value,
        textureColors: document.getElementById('bloxdTextureColors').checked,
        dither: document.getElementById('bloxdColorDither').checked
      }, (progress) => {
        bloxdProgressBar.style.width = `${Math.round(progress * 82)}%`
        bloxdProgressText.textContent = `Voxelizing geometry… ${Math.round(progress * 100)}%`
      })
      bloxdProgressBar.style.width = '90%'
      bloxdProgressText.textContent = 'Encoding Bloxd chunks and RLE…'
      const name = document.getElementById('bloxdSchemName').value.trim() || '3D Model'
      const result = BloxdSchematic.encodeSchematic(voxels, name)
      bloxdProgressBar.style.width = '100%'
      bloxdProgressText.textContent = 'Download ready'
      downloadBlob(new Blob([result.bytes], { type: 'application/octet-stream' }), `${safeFileName(name)}.bloxdschem`)
      bloxdExportResult.classList.remove('is-hidden', 'is-error')
      bloxdExportResult.textContent = `${result.blockCount.toLocaleString()} blocks · ${result.actualSize.x}×${result.actualSize.y}×${result.actualSize.z} · ${result.totalChunks} chunk${result.totalChunks === 1 ? '' : 's'}`
      showProjectStatus('Bloxd schematic downloaded')
    } catch (error) {
      console.error('Bloxd schematic export failed:', error)
      bloxdExportResult.classList.remove('is-hidden')
      bloxdExportResult.classList.add('is-error')
      bloxdExportResult.textContent = error.message || 'Could not create the Bloxd schematic.'
      bloxdProgressText.textContent = 'Conversion stopped'
    } finally {
      disposeExportGroup(exportGroup)
      generateBloxdSchem.disabled = false
    }
  })

  function exportScene(format) {
    if (voxelWorld && (editorMode === 'bloxd' || cubes.length === 0)) { exportVoxelWorld(format); return }
    if (cubes.length === 0) {
      showProjectStatus('Add at least one shape before exporting.', true)
      return
    }
    if (format === 'bloxdschem') {
      exportMenu.classList.add('is-hidden')
      exportMenuButton.setAttribute('aria-expanded', 'false')
      setBloxdExportOpen(true)
      return
    }

    const exportGroup = createExportGroup()
    const baseName = safeFileName(currentProjectName)
    exportMenu.classList.add('is-hidden')
    exportMenuButton.setAttribute('aria-expanded', 'false')
    showProjectStatus(`Preparing ${format.toUpperCase()} export…`)

    try {
      if (format === 'glb') {
        const exporter = new THREE.GLTFExporter()
        exporter.parse(exportGroup, (result) => {
          downloadBlob(new Blob([result], { type: 'model/gltf-binary' }), `${baseName}.glb`)
          disposeExportGroup(exportGroup)
          showProjectStatus('GLB export complete')
        }, {
          binary: true,
          onlyVisible: true,
          truncateDrawRange: true
        })
        return
      }

      if (format === 'obj') {
        const result = new THREE.OBJExporter().parse(exportGroup)
        downloadBlob(new Blob([result], { type: 'text/plain' }), `${baseName}.obj`)
        showProjectStatus('OBJ export complete')
      } else if (format === 'stl') {
        const result = new THREE.STLExporter().parse(exportGroup, { binary: true })
        downloadBlob(new Blob([result], { type: 'model/stl' }), `${baseName}.stl`)
        showProjectStatus('STL export complete')
      }
      disposeExportGroup(exportGroup)
    } catch (error) {
      disposeExportGroup(exportGroup)
      console.error(`${format} export failed:`, error)
      showProjectStatus(`Could not export ${format.toUpperCase()}.`, true)
    }
  }

  undoButton.addEventListener('click', undoScene)
  redoButton.addEventListener('click', redoScene)
  saveProjectButton.addEventListener('click', saveProject)
  loadProjectButton.addEventListener('click', () => projectFileInput.click())
  projectFileInput.addEventListener('change', () => {
    if (projectFileInput.files.length) openProjectFile(projectFileInput.files[0])
  })

  exportMenuButton.addEventListener('click', () => {
    const open = exportMenu.classList.toggle('is-hidden') === false
    exportMenuButton.setAttribute('aria-expanded', String(open))
  })

  exportMenu.addEventListener('click', (event) => {
    const button = event.target.closest('[data-export-format]')
    if (button) exportScene(button.dataset.exportFormat)
  })

  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.export-control')) {
      exportMenu.classList.add('is-hidden')
      exportMenuButton.setAttribute('aria-expanded', 'false')
    }
  })

  function setTool(tool) {
    const previousTool = activeTool
    activeTool = tool
    const isSculptTool = tool === 'sculpt'
    const isEditTool = tool === 'edit'
    const isMeasureTool = tool === 'measure'

    if (previousTool === 'edit' && !isEditTool) clearEditSelection()
    document.querySelectorAll('[data-tool]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.tool === tool)
    })
    sculptPanel.classList.toggle('is-hidden', !isSculptTool)
    editPanel.classList.toggle('is-hidden', !isEditTool)
    measurePanel.classList.toggle('is-hidden', !isMeasureTool)
    document.body.classList.toggle('is-sculpting', isSculptTool)
    if (!isSculptTool) sculptCursor.style.display = 'none'
    if (isMeasureTool) updateMeasurementDimensions()

    if (!selectedCube || selectedCube.locked || !['translate', 'rotate', 'scale'].includes(tool)) {
      transformGizmo.detach()
      return
    }

    transformGizmo.setMode(tool)
    transformGizmo.attach(selectedCube.mesh)
  }

  function toggleFloatingPanel(panel) {
    const shouldOpen = panel.classList.contains('is-hidden')
    ;[materialPanel, modifierPanel, statisticsPanel].forEach(item => item.classList.add('is-hidden'))
    if (shouldOpen) panel.classList.remove('is-hidden')
  }

  function setAdvancedPanel(open) {
    advancedPanel.classList.toggle('is-hidden', !open)
    advancedToggle.setAttribute('aria-pressed', String(open))
  }

  document.querySelector('.tool-palette').addEventListener('click', (event) => {
    const button = event.target.closest('button')
    if (!button) return

    if (button.dataset.tool) {
      if (editorMode === 'bloxd' && voxelWorld) {
        const tool=button.dataset.tool
        const mapping = { select:'single-select', boxselect:'select', translate:'move', rotate:'rotate-select', scale:'select', sculpt:'place', edit:'paint', measure:'measure-blocks' }
        if(tool==='rotate'&&voxelWorld.selection.size){voxelWorld.rotateSelection('y');showProjectStatus('Rotated selected blocks 90° around Y')}
        setVoxelTool(mapping[tool] || 'place')
        document.querySelectorAll('[data-tool]').forEach(item=>item.classList.toggle('is-active',item===button))
        sculptPanel.classList.toggle('is-hidden',tool!=='sculpt');editPanel.classList.toggle('is-hidden',tool!=='edit');measurePanel.classList.toggle('is-hidden',tool!=='measure')
        if(tool==='sculpt'){if(Number(document.getElementById('voxelBrushRadius').value)===0)document.getElementById('voxelBrushRadius').value=2;sculptRadiusValue.value=`${document.getElementById('voxelBrushRadius').value} blocks`}
        if(tool==='scale'){setAdvancedPanel(true);document.getElementById('voxelAdvancedScaleX').focus()}
        if(tool==='measure'){clearMeasurementVisuals();updateMeasurementDimensions()}
      } else setTool(button.dataset.tool)
      return
    }

    switch (button.dataset.action) {
      case 'add':
        showShapePicker()
        break
      case 'duplicate':
        if (editorMode === 'bloxd' && voxelWorld) { voxelWorld.copySelection(); setVoxelTool('paste') }
        else duplicateCube()
        break
      case 'color':
        if (editorMode === 'bloxd' && voxelWorld) { voxelBlockSearch.focus(); return }
        if (!selectedCube) return
        toolbarColor.value = '#' + selectedCube.getState().color
        toolbarColor.click()
        break
      case 'delete':
        if (editorMode === 'bloxd' && voxelWorld) voxelWorld.deleteSelection()
        else deleteCube()
        break
      case 'reset-view':
        resetView()
        break
      case 'fit-all':
        if (editorMode === 'bloxd' && voxelWorld && voxelWorld.bounds()) {
          const bounds = voxelWorld.bounds(), center = new THREE.Vector3((bounds.min[0]+bounds.max[0]+1)/2,(bounds.min[1]+bounds.max[1]+1)/2,(bounds.min[2]+bounds.max[2]+1)/2)
          const span = Math.max(...bounds.max.map((value,index)=>value-bounds.min[index]+1)); cameraTarget.copy(center); cameraControls.radius = Math.max(4, span * 1.45); updateCameraPosition()
        } else fitAll()
        break
      case 'array':
        if (editorMode === 'bloxd' && voxelWorld && !voxelWorld.selection.size) showProjectStatus('Select blocks before creating a block array.', true)
        else if (editorMode !== 'bloxd' && !selectedCube) showProjectStatus('Select an object before using Array.', true)
        else { document.getElementById('arrayTitle').textContent=editorMode==='bloxd'?'Block array':'Array tool';setArrayDialog(true) }
        break
      case 'procedural':
        setProceduralDialog(true)
        break
      case 'hierarchy':
        hierarchyPanel.classList.toggle('is-hidden')
        renderHierarchy()
        break
      case 'materials':
        toggleFloatingPanel(materialPanel)
        if (editorMode === 'bloxd' && voxelWorld) document.getElementById('voxelMaterialColor').focus()
        else syncMaterialPanel()
        break
      case 'modifiers':
        toggleFloatingPanel(modifierPanel)
        break
      case 'statistics':
        toggleFloatingPanel(statisticsPanel); updateStatistics()
        break
      case 'advanced':
        setAdvancedPanel(advancedPanel.classList.contains('is-hidden'))
        break
    }
  })

  document.getElementById('closeAdvanced').addEventListener('click', () => {
    setAdvancedPanel(false)
  })

  toolbarColor.addEventListener('input', () => {
    if (!selectedCube) return
    selectedCube.setColor(toolbarColor.value)
    document.getElementById('cubeColor').value = toolbarColor.value
  })
  toolbarColor.addEventListener('change', () => {
    if (selectedCube) commitHistory('Change color')
  })

  // ==========================================
  // CAMERA CONTROLS
  // ==========================================

  const cameraTarget = new THREE.Vector3(0, 0, 0)
  const cameraControls = {
    isRotating: false,
    pointerId: null,
    prevX: 0,
    prevY: 0,
    startX: 0,
    startY: 0,
    moved: false,
    theta: Math.PI / 4,
    phi: Math.acos(15 / Math.sqrt(675)),
    radius: Math.sqrt(675),
    minRadius: 5,
    maxRadius: 200
  }

  function resetView() {
    if (camera !== perspectiveCamera) setCameraView('perspective')
    cameraTarget.set(0, 0, 0)
    cameraControls.theta = Math.PI / 4
    cameraControls.phi = Math.PI / 4
    cameraControls.radius = 25
    updateCameraPosition()
  }

  function fitAll() {
    if (camera !== perspectiveCamera) setCameraView('perspective')
    if (voxelWorld && voxelWorld.bounds()) {
      const bounds = voxelWorld.bounds()
      cameraTarget.set((bounds.min[0]+bounds.max[0]+1)/2,(bounds.min[1]+bounds.max[1]+1)/2,(bounds.min[2]+bounds.max[2]+1)/2)
      const span = Math.max(...bounds.max.map((value,index)=>value-bounds.min[index]+1))
      cameraControls.radius = Math.max(4, span * 1.6); updateCameraPosition(); return
    }
    if (cubes.length === 0) {
      resetView()
      return
    }

    const box = new THREE.Box3()
    cubes.forEach(cube => box.expandByObject(cube.mesh))

    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const fov = perspectiveCamera.fov * (Math.PI / 180)
    const distance = (maxDim / 2) / Math.tan(fov / 2)

    box.getCenter(cameraTarget)
    cameraControls.radius = Math.max(cameraControls.minRadius, distance * 1.8)
    updateCameraPosition()
  }

  function updateCameraPosition() {
    const x = cameraControls.radius * Math.sin(cameraControls.phi) * Math.cos(cameraControls.theta)
    const y = cameraControls.radius * Math.cos(cameraControls.phi)
    const z = cameraControls.radius * Math.sin(cameraControls.phi) * Math.sin(cameraControls.theta)
    perspectiveCamera.position.set(
      cameraTarget.x + x,
      cameraTarget.y + y,
      cameraTarget.z + z
    )
    perspectiveCamera.lookAt(cameraTarget)
  }

  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (isTransforming || transformGizmo.dragging) return
    if (event.button !== 0 && event.button !== 2) return
    if (camera !== perspectiveCamera) setCameraView('perspective')

    cameraControls.isRotating = true
    cameraControls.pointerId = event.pointerId
    cameraControls.prevX = event.clientX
    cameraControls.prevY = event.clientY
    cameraControls.startX = event.clientX
    cameraControls.startY = event.clientY
    cameraControls.moved = false
    renderer.domElement.setPointerCapture(event.pointerId)
  })

  renderer.domElement.addEventListener('pointermove', (event) => {
    if (isTransforming || transformGizmo.dragging) return
    if (!cameraControls.isRotating || event.pointerId !== cameraControls.pointerId) return

    const deltaX = event.clientX - cameraControls.prevX
    const deltaY = event.clientY - cameraControls.prevY

    const dragDistance = Math.hypot(
      event.clientX - cameraControls.startX,
      event.clientY - cameraControls.startY
    )
    if (dragDistance > 3) cameraControls.moved = true

    cameraControls.theta -= deltaX * 0.005
    cameraControls.phi += deltaY * 0.005
    cameraControls.phi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraControls.phi))

    cameraControls.prevX = event.clientX
    cameraControls.prevY = event.clientY
    updateCameraPosition()
  })

  function finishCameraDrag(event) {
    if (!cameraControls.isRotating || event.pointerId !== cameraControls.pointerId) return

    const shouldSelect = event.button === 0 && !cameraControls.moved
    cameraControls.isRotating = false
    cameraControls.pointerId = null

    if (renderer.domElement.hasPointerCapture(event.pointerId)) {
      renderer.domElement.releasePointerCapture(event.pointerId)
    }

    if (shouldSelect) onCanvasClick(event)
  }

  renderer.domElement.addEventListener('pointerup', finishCameraDrag)
  renderer.domElement.addEventListener('pointercancel', finishCameraDrag)

  renderer.domElement.addEventListener('wheel', (event) => {
    if (isTransforming) return
    event.preventDefault()
    if (camera.isOrthographicCamera) {
      camera.zoom = THREE.MathUtils.clamp(camera.zoom * (event.deltaY > 0 ? 0.9 : 1.1), 0.1, 20)
      camera.updateProjectionMatrix()
      return
    }
    cameraControls.radius += event.deltaY * 0.05
    cameraControls.radius = Math.max(
      cameraControls.minRadius,
      Math.min(cameraControls.maxRadius, cameraControls.radius)
    )
    updateCameraPosition()
  }, { passive: false })

  // ==========================================
  // EVENT LISTENERS
  // ==========================================

  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault())

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && shapePicker.classList.contains('is-open')) {
      closeShapePicker()
      return
    }
    if (event.key === 'Escape' && proceduralDialog.classList.contains('is-open')) {
      setProceduralDialog(false)
      return
    }

    const tagName = event.target.tagName
    if (tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA') return

    const key = event.key.toLowerCase()
    const commandKey = event.ctrlKey || event.metaKey
    if (commandKey && key === 'z') {
      event.preventDefault()
      if (event.shiftKey) redoScene()
      else undoScene()
      return
    }
    if (commandKey && key === 'y') {
      event.preventDefault()
      redoScene()
      return
    }
    if (commandKey && key === 's') {
      event.preventDefault()
      saveProject()
      return
    }
    if (commandKey && key === 'o') {
      event.preventDefault()
      projectFileInput.click()
      return
    }

    if (editorMode === 'bloxd' && voxelWorld) {
      const tools = { '1': 'place', '2': 'remove', '3': 'paint', '4': 'box', '5': 'line', '6': 'fill', '7': 'select', '8': 'eyedropper', '9': 'texture' }
      if (tools[key]) setVoxelTool(tools[key])
      if(key==='q')setVoxelTool('single-select')
      if(key==='x'&&!commandKey)setVoxelTool('select')
      if(key==='g')setVoxelTool('move')
      if(key==='r'){if(voxelWorld.selection.size)voxelWorld.rotateSelection('y');setVoxelTool('rotate-select')}
      if(key==='s'&&!commandKey){setAdvancedPanel(true);document.getElementById('voxelAdvancedScaleX').focus()}
      if(key==='b'){setVoxelTool('place');sculptPanel.classList.remove('is-hidden')}
      if(key==='e'){setVoxelTool('paint');editPanel.classList.remove('is-hidden')}
      if(key==='m'){setVoxelTool('measure-blocks');measurePanel.classList.remove('is-hidden');clearMeasurementVisuals();updateMeasurementDimensions()}
      if(key==='n')showShapePicker()
      if(key==='p')setProceduralDialog(true)
      if(key==='d'&&!commandKey){voxelWorld.copySelection();setVoxelTool('paste')}
      if (key === 'c' && commandKey) voxelWorld.copySelection()
      if (key === 'x' && commandKey) voxelWorld.cutSelection()
      if (key === 'v' && commandKey) setVoxelTool('paste')
      if (event.key === 'Delete') voxelWorld.deleteSelection()
      if (event.key === 'Escape') { voxelToolAnchor = null; voxelWorld.clearSelection() }
      return
    }

    if (key === 'q') setTool('select')
    if (key === 'x') setTool('boxselect')
    if (key === 'g') setTool('translate')
    if (key === 'r') setTool('rotate')
    if (key === 's') setTool('scale')
    if (key === 'b') setTool('sculpt')
    if (key === 'e') setTool('edit')
    if (key === 'm') setTool('measure')
    if (key === 'n') showShapePicker()
    if (key === 'p') setProceduralDialog(true)
    if (key === 'd') duplicateCube()
    if (event.key === 'Delete') deleteCube()
    if (event.key === 'Escape') deselectCube()
  })

  window.addEventListener('resize', () => {
    perspectiveCamera.aspect = window.innerWidth / window.innerHeight
    perspectiveCamera.updateProjectionMatrix()
    const aspect = window.innerWidth / window.innerHeight
    orthographicCamera.left = -10 * aspect
    orthographicCamera.right = 10 * aspect
    orthographicCamera.top = 10
    orthographicCamera.bottom = -10
    orthographicCamera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  // Start global undo/redo from the empty scene.
  renderHierarchy()
  updateMeasurementDimensions()
  updateStatistics()
  commitHistory('Initial scene')
  offerAutosaveRecovery()

  // ==========================================
  // ANIMATION LOOP
  // ==========================================

  function animate() {
    requestAnimationFrame(animate)
    if (proceduralPreviewModel && proceduralDialog.classList.contains('is-open')) {
      proceduralPreviewModel.rotation.y += 0.0025
      renderProceduralPreview()
    }
    selectedShapes.forEach(shape => shape.updateOutline())
    measurementLabels.forEach(({ element, anchor }) => {
      const projected = anchor.clone().project(camera)
      const visible = projected.z > -1 && projected.z < 1
      element.style.display = visible ? 'block' : 'none'
      element.style.left = `${(projected.x * 0.5 + 0.5) * window.innerWidth}px`
      element.style.top = `${(-projected.y * 0.5 + 0.5) * window.innerHeight}px`
    })
    renderer.render(scene, camera)
  }

  animate()
