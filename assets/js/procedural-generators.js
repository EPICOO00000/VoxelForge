/* Seeded procedural geometry suite for Shape Studio. */
(function (global) {
  'use strict'

  const ISLAND_DEFAULTS = {
    islandStyle: 'natural', islandCount: 3, islandResolution: 64,
    coastRoughness: 0.65, mountainStrength: 0.7, peakSharpness: 0.62,
    terracing: 0.08, erosion: 0.5, crater: 0.2,
    beachWidth: 0.09, oceanDepth: 0.55, riverCount: 3, riverDepth: 0.12,
    reefDensity: 0.35, waterEnabled: true, waterColor: '#238fb5',
    biome: 'tropical', moisture: 0.72, temperature: 0.78, snowLine: 0.82,
    vegetation: 0.68, rockDensity: 0.3, settlementDensity: 0.12
  }

  const DEFINITIONS = [
    { id: 'terrain', name: 'Mountain Terrain', category: 'Worlds', icon: '⛰', description: 'Layered noise heightfield with ridges and a ground skirt.', defaults: { size: 12, height: 4, detail: 6, density: 5, variation: 0.65, primary: '#557a45', secondary: '#76644b' } },
    { id: 'island', name: 'Island World Studio', category: 'Worlds', icon: '🏝', description: 'Highly customizable island worlds with sculpted coastlines, biomes, rivers, reefs, vegetation, rocks, and settlements.', defaults: { size: 15, height: 6, detail: 7, density: 6, variation: 0.72, primary: '#4f7f45', secondary: '#d9c47a', ...ISLAND_DEFAULTS } },
    { id: 'canyon', name: 'Canyon Landscape', category: 'Worlds', icon: '≋', description: 'Terraced cliffs carved by a winding procedural gorge.', defaults: { size: 14, height: 6, detail: 7, density: 5, variation: 0.55, primary: '#a8633f', secondary: '#d49a62' } },
    { id: 'tunnel', name: 'Organic Tunnel', category: 'Worlds', icon: '⌁', description: 'A twisting, branching tubular cave or tunnel formation.', defaults: { size: 11, height: 5, detail: 6, density: 5, variation: 0.7, primary: '#58545b', secondary: '#826b55' } },
    { id: 'city', name: 'City District', category: 'Architecture', icon: '▥', description: 'Seeded street grid with varied towers, setbacks, and plazas.', defaults: { size: 14, height: 9, detail: 6, density: 7, variation: 0.65, primary: '#52718a', secondary: '#d6b66a' } },
    { id: 'tower', name: 'Parametric Tower', category: 'Architecture', icon: '▤', description: 'A tapered multi-tier tower with crown, supports, and radial details.', defaults: { size: 7, height: 14, detail: 7, density: 6, variation: 0.4, primary: '#69889c', secondary: '#d2ae62' } },
    { id: 'castle', name: 'Fortified Castle', category: 'Architecture', icon: '♜', description: 'Walls, battlements, corner towers, gate, and central keep.', defaults: { size: 13, height: 8, detail: 7, density: 6, variation: 0.35, primary: '#777a75', secondary: '#4d555d' } },
    { id: 'village', name: 'Procedural Village', category: 'Architecture', icon: '⌂', description: 'Road-oriented houses with varied footprints, roofs, and a plaza.', defaults: { size: 14, height: 5, detail: 5, density: 6, variation: 0.7, primary: '#b38a5a', secondary: '#743f35' } },
    { id: 'tree', name: 'Branching Tree', category: 'Organic', icon: '♧', description: 'Recursive trunk, branches, and clustered canopy growth.', defaults: { size: 7, height: 11, detail: 6, density: 7, variation: 0.62, primary: '#3e7d42', secondary: '#68452c' } },
    { id: 'coral', name: 'Coral Colony', category: 'Organic', icon: 'ψ', description: 'Recursive undersea branching with colorful terminal polyps.', defaults: { size: 8, height: 8, detail: 6, density: 7, variation: 0.8, primary: '#df635f', secondary: '#f0b077' } },
    { id: 'crystals', name: 'Crystal Cluster', category: 'Organic', icon: '♦', description: 'Faceted crystals grown with seeded height, lean, and clustering.', defaults: { size: 8, height: 9, detail: 6, density: 7, variation: 0.72, primary: '#6c6bd6', secondary: '#7fe0df' } },
    { id: 'rocks', name: 'Rock Formation', category: 'Organic', icon: '●', description: 'A field of irregular low-poly boulders and stone spires.', defaults: { size: 11, height: 5, detail: 5, density: 7, variation: 0.85, primary: '#686761', secondary: '#958b78' } },
    { id: 'maze', name: 'Perfect Maze', category: 'Systems', icon: '▦', description: 'Deterministic depth-first maze with entrance and exit.', defaults: { size: 12, height: 2.6, detail: 6, density: 5, variation: 0.4, primary: '#6f7880', secondary: '#39444a' } },
    { id: 'pipes', name: 'Pipe Network', category: 'Systems', icon: '┼', description: 'Connected industrial pipes, hubs, risers, and branching runs.', defaults: { size: 11, height: 8, detail: 6, density: 7, variation: 0.7, primary: '#4c8790', secondary: '#c37a38' } },
    { id: 'fractal', name: 'Sierpiński Structure', category: 'Abstract', icon: '△', description: 'Recursive tetrahedral architecture with adjustable depth.', defaults: { size: 10, height: 10, detail: 6, density: 5, variation: 0.25, primary: '#5b83d7', secondary: '#d45b9c' } },
    { id: 'station', name: 'Orbital Ring', category: 'Abstract', icon: '⊙', description: 'Sci-fi ring station with radial modules, spokes, and antennae.', defaults: { size: 12, height: 5, detail: 7, density: 7, variation: 0.45, primary: '#697682', secondary: '#d4a84f' } }
  ]
  const BY_ID = new Map(DEFINITIONS.map(item => [item.id, item]))

  function hashSeed(value) {
    const string = String(value == null ? 1 : value)
    let hash = 2166136261
    for (let i = 0; i < string.length; i++) { hash ^= string.charCodeAt(i); hash = Math.imul(hash, 16777619) }
    return hash >>> 0
  }
  function randomFactory(seed) {
    let state = hashSeed(seed) || 1
    return function () {
      state += 0x6D2B79F5
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  function noise2(x, z, seed) {
    const xi = Math.floor(x), zi = Math.floor(z), tx = x - xi, tz = z - zi
    const smooth = t => t * t * (3 - 2 * t)
    const h = (a, b) => {
      let n = Math.imul(a + seed * 17, 374761393) ^ Math.imul(b - seed * 13, 668265263)
      n = Math.imul(n ^ (n >>> 13), 1274126177)
      return ((n ^ (n >>> 16)) >>> 0) / 4294967295
    }
    const a = h(xi, zi), b = h(xi + 1, zi), c = h(xi, zi + 1), d = h(xi + 1, zi + 1)
    const sx = smooth(tx), sz = smooth(tz)
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sz
  }
  function fbm(x, z, seed, octaves) {
    let value = 0, amplitude = 0.55, frequency = 1, total = 0
    for (let i = 0; i < octaves; i++) { value += noise2(x * frequency, z * frequency, seed + i * 101) * amplitude; total += amplitude; amplitude *= 0.5; frequency *= 2 }
    return value / total
  }

  function normalizedParams(type, input) {
    const definition = BY_ID.get(type) || DEFINITIONS[0]
    const merged = { ...definition.defaults, ...(input || {}) }
    const result = {
      type: definition.id,
      seed: String(merged.seed == null ? 1 : merged.seed),
      size: Math.max(2, Math.min(24, Number(merged.size) || 10)),
      height: Math.max(1, Math.min(24, Number(merged.height) || 6)),
      detail: Math.max(1, Math.min(10, Math.round(Number(merged.detail) || 5))),
      density: Math.max(1, Math.min(10, Math.round(Number(merged.density) || 5))),
      variation: Math.max(0, Math.min(1, Number(merged.variation) || 0)),
      primary: merged.primary || '#668866',
      secondary: merged.secondary || '#886644'
    }
    if (definition.id === 'island') {
      const v = { ...ISLAND_DEFAULTS, ...merged }, clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)))
      Object.assign(result, {
        islandStyle: ['natural','archipelago','volcanic','atoll','cliffs'].includes(v.islandStyle) ? v.islandStyle : 'natural',
        islandCount: Math.round(clamp(v.islandCount, 1, 9)), islandResolution: Math.round(clamp(v.islandResolution, 24, 112)),
        coastRoughness: clamp(v.coastRoughness, 0, 1), mountainStrength: clamp(v.mountainStrength, 0, 1), peakSharpness: clamp(v.peakSharpness, 0, 1),
        terracing: clamp(v.terracing, 0, 1), erosion: clamp(v.erosion, 0, 1), crater: clamp(v.crater, 0, 1),
        beachWidth: clamp(v.beachWidth, 0, 0.3), oceanDepth: clamp(v.oceanDepth, 0.1, 1), riverCount: Math.round(clamp(v.riverCount, 0, 10)), riverDepth: clamp(v.riverDepth, 0, 0.3),
        reefDensity: clamp(v.reefDensity, 0, 1), waterEnabled: v.waterEnabled !== false && v.waterEnabled !== 'false', waterColor: v.waterColor || '#238fb5',
        biome: ['tropical','temperate','arid','alpine','alien'].includes(v.biome) ? v.biome : 'tropical',
        moisture: clamp(v.moisture, 0, 1), temperature: clamp(v.temperature, 0, 1), snowLine: clamp(v.snowLine, 0.35, 1),
        vegetation: clamp(v.vegetation, 0, 1), rockDensity: clamp(v.rockDensity, 0, 1), settlementDensity: clamp(v.settlementDensity, 0, 1)
      })
      if (global.IslandWorldSystem) Object.assign(result, global.IslandWorldSystem.normalize(v))
    }
    return result
  }

  function context(THREE, p) {
    const primary = new THREE.MeshStandardMaterial({ color: p.primary, roughness: 0.72, metalness: 0.12, side: THREE.DoubleSide })
    const secondary = new THREE.MeshStandardMaterial({ color: p.secondary, roughness: 0.64, metalness: 0.18, side: THREE.DoubleSide })
    return { THREE, p, rand: randomFactory(p.seed), group: new THREE.Group(), primary, secondary }
  }
  function mesh(ctx, geometry, material, position, rotation, scale) {
    const object = new ctx.THREE.Mesh(geometry, material || ctx.primary)
    if (position) object.position.copy(position)
    if (rotation) object.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0)
    if (scale) object.scale.copy(scale)
    object.castShadow = object.receiveShadow = true
    ctx.group.add(object)
    return object
  }
  function box(ctx, x, y, z, sx, sy, sz, material, ry) {
    return mesh(ctx, new ctx.THREE.BoxGeometry(sx, sy, sz), material, new ctx.THREE.Vector3(x, y + sy / 2, z), new ctx.THREE.Vector3(0, ry || 0, 0))
  }
  function cylinderBetween(ctx, a, b, radius, material, sides) {
    const direction = b.clone().sub(a), length = direction.length()
    const object = mesh(ctx, new ctx.THREE.CylinderGeometry(radius, radius * 1.08, length, sides || 7), material, a.clone().add(b).multiplyScalar(0.5))
    object.quaternion.setFromUnitVectors(new ctx.THREE.Vector3(0, 1, 0), direction.normalize())
    return object
  }
  function heightfield(ctx, evaluator, addSkirt) {
    const { THREE, p } = ctx
    const segments = 12 + p.detail * 4
    const vertices = [], indices = []
    for (let z = 0; z <= segments; z++) {
      for (let x = 0; x <= segments; x++) {
        const nx = x / segments - 0.5, nz = z / segments - 0.5
        vertices.push(nx * p.size, evaluator(nx, nz), nz * p.size)
      }
    }
    for (let z = 0; z < segments; z++) for (let x = 0; x < segments; x++) {
      const a = z * (segments + 1) + x, b = a + 1, c = a + segments + 1, d = c + 1
      indices.push(a, c, b, b, c, d)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals()
    const heights = vertices.filter((value, index) => index % 3 === 1), minHeight = Math.min(...heights), maxHeight = Math.max(...heights)
    const low = new THREE.Color(p.secondary), high = new THREE.Color(p.primary), colors = []
    heights.forEach(height => {
      const t = Math.max(0, Math.min(1, (height - minHeight) / Math.max(0.001, maxHeight - minHeight)))
      const color = low.clone().lerp(high, Math.pow(t, 0.72)); colors.push(color.r, color.g, color.b)
    })
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    const terrainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.84, metalness: 0.02, side: THREE.DoubleSide })
    mesh(ctx, geometry, terrainMaterial)
    if (addSkirt) box(ctx, 0, -0.35, 0, p.size, 0.4, p.size, ctx.secondary)
  }

  function terrain(ctx) {
    const { p } = ctx, seed = hashSeed(p.seed)
    heightfield(ctx, (x, z) => {
      const n = fbm(x * 2.2 + 3, z * 2.2 - 2, seed, 3 + Math.floor(p.detail / 3))
      const ridge = 1 - Math.abs(2 * fbm(x * 1.1, z * 1.1, seed + 78, 3) - 1)
      return Math.max(0, (n * (1 - p.variation * 0.35) + ridge * p.variation - 0.3) * p.height)
    }, true)
  }
  function island(ctx) {
    const { THREE, p, rand } = ctx
    const seed = hashSeed(p.seed), resolution = p.islandResolution
    const worldSize = p.size * 1.2, waterSize = p.size * 1.55
    const centers = []
    const mainRadius = p.islandStyle === 'archipelago' ? 0.27 : (p.islandStyle === 'atoll' ? 0.42 : 0.39)
    centers.push({ x: 0, z: 0, r: mainRadius, strength: 1 })
    for (let i = 1; i < p.islandCount; i++) {
      const angle = rand() * Math.PI * 2, distance = p.islandStyle === 'archipelago' ? 0.16 + rand() * 0.25 : 0.25 + rand() * 0.18
      centers.push({ x: Math.cos(angle) * distance, z: Math.sin(angle) * distance, r: (0.07 + rand() * 0.1) * (p.islandStyle === 'archipelago' ? 1.35 : 1), strength: 0.5 + rand() * 0.42 })
    }

    const rivers = []
    for (let river = 0; river < p.riverCount; river++) {
      const angle = river / Math.max(1, p.riverCount) * Math.PI * 2 + (rand() - 0.5) * 1.2
      const points = []
      for (let step = 0; step < 24; step++) {
        const t = step / 23, radial = 0.035 + t * mainRadius * 1.14
        const bend = Math.sin(t * Math.PI * (2 + rand() * 2) + river) * p.coastRoughness * 0.035 + (fbm(t * 2, river, seed + river * 91, 2) - 0.5) * 0.04
        points.push({ x: Math.cos(angle + bend) * radial, z: Math.sin(angle + bend) * radial })
      }
      rivers.push(points)
    }

    function segmentDistance(px, pz, a, b) {
      const dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz
      const t = length2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / length2)) : 0
      return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t))
    }

    function baseInfluence(x, z) {
      if (p.islandStyle === 'atoll') {
        const distance = Math.hypot(x, z), ring = Math.exp(-Math.pow((distance - mainRadius * 0.62) / (mainRadius * 0.22), 2))
        let satellites = 0
        for (let i = 1; i < centers.length; i++) { const c = centers[i], d = Math.hypot(x - c.x, z - c.z) / c.r; satellites = Math.max(satellites, Math.max(0, 1 - d) * c.strength) }
        return Math.max(ring * 0.72, satellites)
      }
      let influence = 0
      centers.forEach(center => {
        const distance = Math.hypot(x - center.x, z - center.z) / center.r
        const shape = Math.pow(Math.max(0, 1 - distance), p.islandStyle === 'cliffs' ? 0.38 : 0.68)
        influence = Math.max(influence, shape * center.strength)
      })
      return influence
    }

    function elevation(x, z, carveRivers = true) {
      const warpX = x + (fbm(x * 3 + 4, z * 3, seed + 22, 3) - 0.5) * p.coastRoughness * 0.13
      const warpZ = z + (fbm(x * 3, z * 3 - 5, seed + 43, 3) - 0.5) * p.coastRoughness * 0.13
      const influence = baseInfluence(warpX, warpZ)
      const coastNoise = (fbm(warpX * 7, warpZ * 7, seed, 4) - 0.5) * p.coastRoughness * 0.48
      let land = influence - 0.18 + coastNoise * Math.min(1, influence * 3)
      const mountainNoise = fbm(x * 3.2 + 8, z * 3.2 - 4, seed + 701, 5)
      const sharpExponent = 1.2 + p.peakSharpness * 5.5
      let mountain = Math.pow(Math.max(0, mountainNoise * 1.18 - 0.33), sharpExponent) * p.mountainStrength * 2.4 * Math.pow(Math.max(0, influence), 1.3)
      if (p.islandStyle === 'volcanic') {
        const distance = Math.hypot(x, z) / mainRadius
        mountain += Math.max(0, 1 - distance) * p.mountainStrength * 0.95
        const craterRadius = 0.045 + p.crater * 0.1
        mountain -= Math.exp(-Math.pow(Math.hypot(x, z) / craterRadius, 2)) * p.crater * 0.75
      }
      if (p.islandStyle === 'cliffs') land = Math.pow(Math.max(0, land), 0.58) - (land < 0 ? Math.abs(land) : 0)
      const erosionChannels = Math.abs(2 * fbm(x * 9, z * 9, seed + 903, 3) - 1)
      mountain -= Math.max(0, 0.24 - erosionChannels) * p.erosion * influence * 1.1
      let value = (land * 0.55 + mountain) * p.height
      if (carveRivers && p.riverDepth > 0 && value > 0) {
        let nearest = Infinity
        rivers.forEach(path => { for (let i = 1; i < path.length; i++) nearest = Math.min(nearest, segmentDistance(x, z, path[i - 1], path[i])) })
        const riverWidth = 0.0035 + p.riverDepth * 0.025
        if (nearest < riverWidth * 3) value -= Math.exp(-Math.pow(nearest / riverWidth, 2)) * p.riverDepth * p.height
      }
      if (value > 0 && p.terracing > 0) {
        const steps = 5 + Math.round(p.detail * 1.3), terraced = Math.floor(value / p.height * steps) / steps * p.height
        value = value * (1 - p.terracing) + terraced * p.terracing
      }
      return Math.max(-p.oceanDepth * p.height, value)
    }

    const vertices = [], indices = [], heights = []
    for (let z = 0; z <= resolution; z++) for (let x = 0; x <= resolution; x++) {
      const nx = x / resolution - 0.5, nz = z / resolution - 0.5, y = elevation(nx, nz)
      vertices.push(nx * worldSize, y, nz * worldSize); heights.push(y)
    }
    for (let z = 0; z < resolution; z++) for (let x = 0; x < resolution; x++) {
      const a = z * (resolution + 1) + x, b = a + 1, c = a + resolution + 1, d = c + 1
      indices.push(a, c, b, b, c, d)
    }

    const palettes = {
      tropical: { deep: 0x786c54, beach: 0xe2d28b, low: 0x55964b, high: 0x245c38, rock: 0x696961, snow: 0xf1f4ed },
      temperate: { deep: 0x5d655b, beach: 0xbcae7e, low: 0x5f8549, high: 0x355b35, rock: 0x72736d, snow: 0xe8ece8 },
      arid: { deep: 0x8a6748, beach: 0xe0bd72, low: 0xba7a42, high: 0x79462f, rock: 0x735a4b, snow: 0xd7c3a2 },
      alpine: { deep: 0x66645f, beach: 0xb4a983, low: 0x50764c, high: 0x394d3e, rock: 0x676b70, snow: 0xf5f7f8 },
      alien: { deep: 0x37245b, beach: 0x9a59b8, low: 0x3ea884, high: 0x205d6e, rock: 0x574777, snow: 0xe0a9ff }
    }
    const palette = palettes[p.biome], colors = [], color = new THREE.Color()
    for (let z = 0; z <= resolution; z++) for (let x = 0; x <= resolution; x++) {
      const index = z * (resolution + 1) + x, y = heights[index]
      const left = heights[z * (resolution + 1) + Math.max(0, x - 1)], right = heights[z * (resolution + 1) + Math.min(resolution, x + 1)]
      const down = heights[Math.max(0, z - 1) * (resolution + 1) + x], up = heights[Math.min(resolution, z + 1) * (resolution + 1) + x]
      const slope = Math.hypot(right - left, up - down) / Math.max(0.01, worldSize / resolution * 2)
      const normalized = Math.max(0, y / Math.max(0.01, p.height))
      let hex = palette.low
      if (y < -p.beachWidth * p.height * 0.5) hex = palette.deep
      else if (y < p.beachWidth * p.height) hex = palette.beach
      else if (slope > 1.35 - p.erosion * 0.3) hex = palette.rock
      else if (normalized > p.snowLine && (p.temperature < 0.68 || p.biome === 'alpine')) hex = palette.snow
      else if (normalized > 0.48) hex = palette.high
      color.setHex(hex)
      const shade = 0.86 + noise2(x * 0.37, z * 0.37, seed + 812) * 0.2
      colors.push(color.r * shade, color.g * shade, color.b * shade)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices); geometry.computeVertexNormals()
    const terrainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.01, side: THREE.DoubleSide })
    const terrainMesh = mesh(ctx, geometry, terrainMaterial); terrainMesh.name = 'Island Terrain'; terrainMesh.userData.islandFeature = 'terrain'

    box(ctx, 0, -p.oceanDepth * p.height - 0.28, 0, worldSize, 0.32, worldSize, ctx.secondary).name = 'Island Seabed Base'
    if (p.waterEnabled) {
      const waterMaterial = new THREE.MeshStandardMaterial({ color: p.waterColor, transparent: true, opacity: 0.62, roughness: 0.18, metalness: 0.12, depthWrite: false, side: THREE.DoubleSide })
      const water = mesh(ctx, new THREE.PlaneGeometry(waterSize, waterSize, 1, 1), waterMaterial, new THREE.Vector3(0, 0.025, 0), new THREE.Vector3(-Math.PI / 2, 0, 0))
      water.name = 'Ocean Surface'; water.userData.islandFeature = 'water'; water.renderOrder = 3
    }

    if (p.riverCount) {
      const riverMaterial = new THREE.MeshStandardMaterial({ color: p.waterColor, transparent: true, opacity: 0.82, roughness: 0.12, depthWrite: false })
      rivers.forEach((path, riverIndex) => {
        const points = path.map(point => new THREE.Vector3(point.x * worldSize, Math.max(0.04, elevation(point.x, point.z, false) - p.riverDepth * p.height * 0.45), point.z * worldSize))
        const riverMesh = mesh(ctx, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 28, worldSize * (0.0018 + p.riverDepth * 0.0025), 5, false), riverMaterial)
        riverMesh.name = `River ${riverIndex + 1}`; riverMesh.userData.islandFeature = 'river'; riverMesh.renderOrder = 4
      })
    }

    const vegetationMaterial = new THREE.MeshStandardMaterial({ color: p.biome === 'alien' ? 0x62e0bd : (p.biome === 'arid' ? 0x7d8744 : 0x2f743c), roughness: 0.8 })
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: p.biome === 'alien' ? 0x5d417f : 0x65452f, roughness: 0.9 })
    const trunkGeometry = new THREE.CylinderGeometry(p.size * 0.008, p.size * 0.012, p.height * 0.12, 5)
    const crownGeometry = p.biome === 'tropical' ? new THREE.ConeGeometry(p.size * 0.055, p.height * 0.18, 7) : new THREE.IcosahedronGeometry(p.size * 0.055, 1)
    const vegetationCount = Math.round(p.vegetation * (30 + p.density * 16))
    for (let i = 0, attempts = 0; i < vegetationCount && attempts < vegetationCount * 12; attempts++) {
      const x = (rand() - 0.5) * 0.78, z = (rand() - 0.5) * 0.78, y = elevation(x, z)
      if (y < p.beachWidth * p.height * 1.25 || y > p.snowLine * p.height || rand() > p.moisture * 0.7 + 0.3) continue
      const wx = x * worldSize, wz = z * worldSize, treeHeight = p.height * (0.08 + rand() * 0.09)
      const trunk = mesh(ctx, trunkGeometry, trunkMaterial, new THREE.Vector3(wx, y + treeHeight * 0.42, wz)); trunk.scale.y = treeHeight / (p.height * 0.12); trunk.name = 'Vegetation Trunk'; trunk.userData.islandFeature = 'vegetation'
      const crown = mesh(ctx, crownGeometry, vegetationMaterial, new THREE.Vector3(wx, y + treeHeight, wz)); crown.scale.setScalar(0.72 + rand() * 0.55); crown.name = 'Vegetation Crown'; crown.userData.islandFeature = 'vegetation'; i++
    }

    const rockGeometry = new THREE.DodecahedronGeometry(p.size * 0.025, 0), rockMaterial = new THREE.MeshStandardMaterial({ color: palette.rock, roughness: 0.92 })
    const rockCount = Math.round(p.rockDensity * (18 + p.density * 11))
    for (let i = 0, attempts = 0; i < rockCount && attempts < rockCount * 10; attempts++) {
      const x = (rand() - 0.5) * 0.84, z = (rand() - 0.5) * 0.84, y = elevation(x, z)
      if (y < p.beachWidth * p.height * 0.7) continue
      const rock = mesh(ctx, rockGeometry, rockMaterial, new THREE.Vector3(x * worldSize, y + p.size * 0.018, z * worldSize))
      rock.scale.set(0.5 + rand() * 1.5, 0.45 + rand() * 1.6, 0.5 + rand() * 1.5); rock.rotation.set(rand() * 2, rand() * 2, rand() * 2); rock.name = 'Rock Outcrop'; rock.userData.islandFeature = 'rock'; i++
    }

    const settlementCount = Math.round(p.settlementDensity * 12)
    for (let i = 0, attempts = 0; i < settlementCount && attempts < 120; attempts++) {
      const angle = rand() * Math.PI * 2, radial = mainRadius * (0.55 + rand() * 0.3), x = Math.cos(angle) * radial, z = Math.sin(angle) * radial, y = elevation(x, z)
      if (y < p.beachWidth * p.height || y > p.height * 0.32) continue
      const houseSize = p.size * 0.035, house = box(ctx, x * worldSize, y, z * worldSize, houseSize, houseSize * 0.7, houseSize, trunkMaterial, -angle)
      house.name = 'Island Settlement'; house.userData.islandFeature = 'settlement'
      const roof = mesh(ctx, new THREE.ConeGeometry(houseSize * 0.78, houseSize * 0.48, 4), ctx.secondary, new THREE.Vector3(x * worldSize, y + houseSize * 0.94, z * worldSize), new THREE.Vector3(0, Math.PI / 4 - angle, 0)); roof.name = 'Settlement Roof'; roof.userData.islandFeature = 'settlement'; i++
    }

    const reefMaterial = new THREE.MeshStandardMaterial({ color: p.biome === 'alien' ? 0xff65d7 : 0x58c6a7, roughness: 0.72 })
    const reefCount = Math.round(p.reefDensity * 55)
    for (let i = 0; i < reefCount; i++) {
      const angle = rand() * Math.PI * 2, radial = mainRadius * (0.94 + rand() * 0.3), x = Math.cos(angle) * radial, z = Math.sin(angle) * radial, y = elevation(x, z)
      if (y > 0 || y < -p.height * 0.22) continue
      const reef = mesh(ctx, new THREE.CylinderGeometry(p.size * (0.008 + rand() * 0.009), p.size * 0.012, p.height * 0.025, 6), reefMaterial, new THREE.Vector3(x * worldSize, y + p.height * 0.02, z * worldSize))
      reef.name = 'Coastal Reef'; reef.userData.islandFeature = 'reef'
    }
    ctx.group.userData.islandWorld = { centers, rivers: rivers.length, resolution, biome: p.biome, style: p.islandStyle }
  }
  function canyon(ctx) {
    const { p } = ctx, seed = hashSeed(p.seed)
    heightfield(ctx, (x, z) => {
      const river = Math.abs(x + Math.sin(z * 8 + fbm(x, z, seed, 2) * 4) * 0.11)
      const cliff = Math.min(1, Math.pow(river * 5.2, 0.48))
      const terraces = Math.floor((cliff * 0.8 + fbm(x * 2, z * 2, seed + 4, 3) * 0.2) * (4 + p.detail / 2)) / (4 + p.detail / 2)
      return terraces * p.height
    }, true)
  }
  function tunnel(ctx) {
    const { THREE, p, rand } = ctx
    const points = [], count = 6 + p.detail * 2
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1)
      points.push(new THREE.Vector3((t - 0.5) * p.size, p.height * 0.35 + Math.sin(t * 8) * p.height * 0.18 * p.variation, Math.sin(t * 5 + 1) * p.size * 0.22 + (rand() - 0.5) * p.variation))
    }
    const curve = new THREE.CatmullRomCurve3(points)
    mesh(ctx, new THREE.TubeGeometry(curve, count * 3, p.size * 0.035 + 0.18, 7 + p.detail, false), ctx.primary)
    const branches = 2 + Math.floor(p.density / 2)
    for (let b = 0; b < branches; b++) {
      const origin = curve.getPoint(0.18 + rand() * 0.64), branchPoints = [origin]
      const direction = new THREE.Vector3((rand() - 0.5) * p.size * 0.35, (rand() - 0.2) * p.height * 0.35, (rand() - 0.5) * p.size * 0.55)
      branchPoints.push(origin.clone().addScaledVector(direction, 0.45), origin.clone().add(direction))
      mesh(ctx, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(branchPoints), 12, p.size * 0.022 + 0.1, 7, false), ctx.secondary)
    }
  }

  function city(ctx) {
    const { p, rand } = ctx, grid = 3 + p.density, cell = p.size / grid, road = cell * 0.2
    box(ctx, 0, -0.18, 0, p.size, 0.18, p.size, ctx.secondary)
    for (let x = 0; x < grid; x++) for (let z = 0; z < grid; z++) {
      if (rand() < 0.12 + (10 - p.density) * 0.01) continue
      const px = (x + 0.5) * cell - p.size / 2, pz = (z + 0.5) * cell - p.size / 2
      const h = p.height * (0.18 + Math.pow(rand(), 1.6) * 0.82)
      const width = cell - road, tiers = 1 + Math.floor(rand() * Math.min(4, 1 + p.detail / 3))
      for (let tier = 0; tier < tiers; tier++) {
        const y0 = h * tier / tiers, scale = 1 - tier * (0.1 + p.variation * 0.06)
        box(ctx, px, y0, pz, width * scale, h / tiers + 0.03, width * scale, tier % 2 ? ctx.secondary : ctx.primary, (rand() - 0.5) * 0.12 * p.variation)
      }
      if (p.detail >= 4 && h > cell * 0.5) {
        const windowH = Math.max(0.04, h * 0.18), windowW = width * 0.38
        box(ctx, px, h * 0.38, pz + width * 0.505, windowW, windowH, cell * 0.012, ctx.secondary)
        box(ctx, px + width * 0.505, h * 0.62, pz, cell * 0.012, windowH, windowW, ctx.secondary)
      }
      if (rand() < p.variation * 0.35) cylinderBetween(ctx, new ctx.THREE.Vector3(px, h, pz), new ctx.THREE.Vector3(px, h + cell * 0.5, pz), cell * 0.035, ctx.secondary, 6)
    }
  }
  function tower(ctx) {
    const { THREE, p, rand } = ctx, levels = 4 + p.detail
    for (let i = 0; i < levels; i++) {
      const y = p.height * i / levels, taper = 1 - i / levels * (0.35 + p.variation * 0.35), radius = p.size * 0.34 * taper
      const geometry = i % 3 === 0 ? new THREE.CylinderGeometry(radius, radius * 1.05, p.height / levels * 0.94, 6 + Math.min(10, p.density)) : new THREE.BoxGeometry(radius * 1.55, p.height / levels * 0.94, radius * 1.55)
      const part = mesh(ctx, geometry, i % 2 ? ctx.primary : ctx.secondary, new THREE.Vector3(0, y + p.height / levels / 2, 0), new THREE.Vector3(0, i * p.variation * 0.16, 0))
      part.scale.x *= 0.96 + rand() * 0.08; part.scale.z *= 0.96 + rand() * 0.08
    }
    const crownY = p.height + p.size * 0.18
    mesh(ctx, new THREE.ConeGeometry(p.size * 0.22, p.size * 0.55, 5 + p.density), ctx.secondary, new THREE.Vector3(0, crownY, 0))
    const supports = 3 + Math.floor(p.density / 2)
    for (let i = 0; i < supports; i++) {
      const a = i / supports * Math.PI * 2, r = p.size * 0.4
      cylinderBetween(ctx, new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), new THREE.Vector3(Math.cos(a) * r * 0.5, p.height * 0.32, Math.sin(a) * r * 0.5), p.size * 0.025, ctx.secondary, 6)
    }
  }
  function castle(ctx) {
    const { THREE, p } = ctx, s = p.size, wallH = p.height * 0.42, thick = s * 0.07
    box(ctx, 0, 0, -s * 0.42, s * 0.85, wallH, thick, ctx.primary)
    box(ctx, 0, 0, s * 0.42, s * 0.85, wallH, thick, ctx.primary)
    box(ctx, -s * 0.42, 0, 0, thick, wallH, s * 0.85, ctx.primary)
    box(ctx, s * 0.42, 0, 0, thick, wallH, s * 0.85, ctx.primary)
    const towerR = s * 0.1
    for (const x of [-s * 0.42, s * 0.42]) for (const z of [-s * 0.42, s * 0.42]) {
      mesh(ctx, new THREE.CylinderGeometry(towerR, towerR * 1.08, p.height * 0.72, 8), ctx.primary, new THREE.Vector3(x, p.height * 0.36, z))
      mesh(ctx, new THREE.ConeGeometry(towerR * 1.28, p.height * 0.25, 8), ctx.secondary, new THREE.Vector3(x, p.height * 0.84, z))
    }
    box(ctx, 0, 0, 0, s * 0.32, p.height, s * 0.3, ctx.primary)
    box(ctx, 0, 0, -s * 0.455, s * 0.14, wallH * 0.62, thick * 1.2, ctx.secondary)
    const crenels = 5 + p.detail
    for (let i = 0; i < crenels; i++) {
      const t = (i + 0.5) / crenels - 0.5
      for (const side of [-1, 1]) {
        box(ctx, t * s * 0.8, wallH, side * s * 0.42, s * 0.8 / crenels * 0.55, wallH * 0.13, thick, ctx.secondary)
        box(ctx, side * s * 0.42, wallH, t * s * 0.8, thick, wallH * 0.13, s * 0.8 / crenels * 0.55, ctx.secondary)
      }
    }
  }
  function village(ctx) {
    const { THREE, p, rand } = ctx, count = 5 + p.density * 2
    box(ctx, 0, -0.08, 0, p.size, 0.08, p.size, ctx.secondary)
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? 1 : -1, z = (rand() - 0.5) * p.size * 0.82, x = side * (p.size * (0.18 + rand() * 0.25))
      const w = p.size * (0.09 + rand() * 0.06), d = p.size * (0.1 + rand() * 0.06), h = p.height * (0.28 + rand() * 0.25)
      box(ctx, x, 0, z, w, h, d, ctx.primary, (rand() - 0.5) * p.variation * 0.25)
      const roof = mesh(ctx, new THREE.ConeGeometry(Math.max(w, d) * 0.72, h * 0.45, 4), ctx.secondary, new THREE.Vector3(x, h * 1.2, z), new THREE.Vector3(0, Math.PI / 4, 0))
      roof.rotation.y += (rand() - 0.5) * p.variation * 0.25
      box(ctx, x, 0, z + d * 0.505, w * 0.22, h * 0.48, d * 0.018, ctx.secondary)
      if (p.detail > 4) box(ctx, x + w * 0.28, h * 0.45, z + d * 0.51, w * 0.18, h * 0.18, d * 0.02, ctx.secondary)
      if (rand() < 0.45) box(ctx, x + w * 0.25, h, z, w * 0.1, h * 0.55, d * 0.1, ctx.secondary)
    }
    box(ctx, 0, 0.01, 0, p.size * 0.12, 0.04, p.size, ctx.secondary)
  }

  function tree(ctx) {
    const { THREE, p, rand } = ctx
    const maxDepth = Math.min(5, 2 + Math.floor(p.detail / 2)), branchBudget = 160 + p.density * 35
    let branches = 0
    function grow(start, direction, length, radius, depth) {
      if (branches++ > branchBudget || depth > maxDepth || length < 0.18) return
      const end = start.clone().add(direction.clone().multiplyScalar(length))
      cylinderBetween(ctx, start, end, radius, ctx.secondary, 6)
      if (depth === maxDepth) {
        mesh(ctx, new THREE.IcosahedronGeometry(radius * (3 + p.density * 0.18), 1), ctx.primary, end)
        return
      }
      const children = depth < 2 ? 3 : 2
      for (let i = 0; i < children; i++) {
        const angle = i / children * Math.PI * 2 + rand() * 1.2
        const spread = 0.25 + p.variation * 0.55
        const next = new THREE.Vector3(Math.cos(angle) * spread, 0.72 + rand() * 0.25, Math.sin(angle) * spread).normalize()
        grow(end, next, length * (0.64 + rand() * 0.1), radius * 0.67, depth + 1)
      }
    }
    const rootCount = 4 + Math.floor(p.density / 2)
    for (let i = 0; i < rootCount; i++) {
      const angle = i / rootCount * Math.PI * 2 + rand() * 0.3
      cylinderBetween(ctx, new THREE.Vector3(0, p.size * 0.025, 0), new THREE.Vector3(Math.cos(angle) * p.size * (0.18 + rand() * 0.12), 0, Math.sin(angle) * p.size * (0.18 + rand() * 0.12)), p.size * 0.025, ctx.secondary, 6)
    }
    grow(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), p.height * 0.28, p.size * 0.08, 0)
  }
  function coral(ctx) {
    const { THREE, p, rand } = ctx, bases = 2 + Math.floor(p.density / 3)
    function branch(start, dir, length, radius, depth) {
      const end = start.clone().addScaledVector(dir, length); cylinderBetween(ctx, start, end, radius, depth % 2 ? ctx.primary : ctx.secondary, 7)
      if (depth >= Math.min(4, 2 + Math.floor(p.detail / 3))) {
        mesh(ctx, new THREE.SphereGeometry(radius * 1.6, 7, 5), ctx.secondary, end); return
      }
      const count = 2 + (rand() < p.variation * 0.5 ? 1 : 0)
      for (let i = 0; i < count; i++) {
        const next = dir.clone().add(new THREE.Vector3((rand() - 0.5) * 1.3, 0.2 + rand() * 0.5, (rand() - 0.5) * 1.3)).normalize()
        branch(end, next, length * (0.58 + rand() * 0.12), radius * 0.7, depth + 1)
      }
    }
    for (let i = 0; i < bases; i++) branch(new THREE.Vector3((rand() - 0.5) * p.size * 0.35, 0, (rand() - 0.5) * p.size * 0.35), new THREE.Vector3((rand() - 0.5) * 0.25, 1, (rand() - 0.5) * 0.25).normalize(), p.height * 0.23, p.size * 0.045, 0)
  }
  function crystals(ctx) {
    const { THREE, p, rand } = ctx, count = 5 + p.density * 3
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2, radius = Math.pow(rand(), 1.7) * p.size * 0.38
      const h = p.height * (0.18 + rand() * 0.82) * (1 - radius / p.size * 0.8), r = p.size * (0.025 + rand() * 0.045)
      const crystal = mesh(ctx, new THREE.CylinderGeometry(r * 0.72, r, h, 6), i % 3 ? ctx.primary : ctx.secondary, new THREE.Vector3(Math.cos(angle) * radius, h / 2, Math.sin(angle) * radius))
      crystal.rotation.x = (rand() - 0.5) * p.variation * 0.42; crystal.rotation.z = (rand() - 0.5) * p.variation * 0.42
      const tip = mesh(ctx, new THREE.ConeGeometry(r * 0.72, r * 2.4, 6), crystal.material, new THREE.Vector3(crystal.position.x, h + r * 1.2, crystal.position.z))
      tip.rotation.copy(crystal.rotation)
    }
  }
  function rocks(ctx) {
    const { THREE, p, rand } = ctx, count = 4 + p.density * 3
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * p.size * 0.38, r = p.size * (0.04 + rand() * 0.09)
      const rockGeometry = new THREE.IcosahedronGeometry(r, p.detail > 6 ? 1 : 0)
      const rockPosition = rockGeometry.getAttribute('position')
      for (let vertex = 0; vertex < rockPosition.count; vertex++) {
        const factor = 0.78 + rand() * (0.25 + p.variation * 0.28)
        rockPosition.setXYZ(vertex, rockPosition.getX(vertex) * factor, rockPosition.getY(vertex) * factor, rockPosition.getZ(vertex) * factor)
      }
      rockPosition.needsUpdate = true; rockGeometry.computeVertexNormals()
      const rock = mesh(ctx, rockGeometry, i % 4 ? ctx.primary : ctx.secondary, new THREE.Vector3(Math.cos(a) * d, r * (0.55 + rand() * 0.25), Math.sin(a) * d))
      rock.scale.set(0.7 + rand() * p.variation, 0.55 + rand() * (0.7 + p.variation), 0.7 + rand() * p.variation)
      rock.rotation.set(rand() * 2, rand() * 2, rand() * 2)
    }
  }

  function maze(ctx) {
    const { p, rand } = ctx, n = 5 + p.detail, visited = Array.from({ length: n }, () => Array(n).fill(false)), walls = new Set()
    const key = (x, z, d) => `${x},${z},${d}`
    for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) for (const d of ['N', 'E', 'S', 'W']) walls.add(key(x, z, d))
    const opposite = { N: 'S', S: 'N', E: 'W', W: 'E' }, moves = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }
    const stack = [[0, 0]]; visited[0][0] = true
    while (stack.length) {
      const [x, z] = stack[stack.length - 1], choices = Object.keys(moves).map(d => [d, x + moves[d][0], z + moves[d][1]]).filter(item => item[1] >= 0 && item[2] >= 0 && item[1] < n && item[2] < n && !visited[item[1]][item[2]])
      if (!choices.length) { stack.pop(); continue }
      const [d, nx, nz] = choices[Math.floor(rand() * choices.length)]
      walls.delete(key(x, z, d)); walls.delete(key(nx, nz, opposite[d])); visited[nx][nz] = true; stack.push([nx, nz])
    }
    walls.delete(key(0, 0, 'W')); walls.delete(key(n - 1, n - 1, 'E'))
    const cell = p.size / n, thick = cell * 0.11, h = p.height
    box(ctx, 0, -0.08, 0, p.size + thick, 0.08, p.size + thick, ctx.secondary)
    for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) {
      const px = (x + 0.5) * cell - p.size / 2, pz = (z + 0.5) * cell - p.size / 2
      if (walls.has(key(x, z, 'N'))) box(ctx, px, 0, pz - cell / 2, cell + thick, h, thick, ctx.primary)
      if (walls.has(key(x, z, 'W'))) box(ctx, px - cell / 2, 0, pz, thick, h, cell + thick, ctx.primary)
      if (z === n - 1 && walls.has(key(x, z, 'S'))) box(ctx, px, 0, pz + cell / 2, cell + thick, h, thick, ctx.primary)
      if (x === n - 1 && walls.has(key(x, z, 'E'))) box(ctx, px + cell / 2, 0, pz, thick, h, cell + thick, ctx.primary)
    }
  }
  function pipes(ctx) {
    const { THREE, p, rand } = ctx, nodes = [new THREE.Vector3(0, p.height * 0.3, 0)], count = 7 + p.density * 3, radius = p.size * 0.022
    for (let i = 1; i < count; i++) {
      const parent = nodes[Math.floor(rand() * nodes.length)], axis = Math.floor(rand() * 3), direction = rand() < 0.5 ? -1 : 1, next = parent.clone()
      next.setComponent(axis, next.getComponent(axis) + direction * p.size * (0.1 + rand() * 0.2))
      next.x = Math.max(-p.size / 2, Math.min(p.size / 2, next.x)); next.y = Math.max(radius, Math.min(p.height, next.y)); next.z = Math.max(-p.size / 2, Math.min(p.size / 2, next.z))
      cylinderBetween(ctx, parent, next, radius * (0.7 + rand() * 0.6), i % 3 ? ctx.primary : ctx.secondary, 8)
      mesh(ctx, new THREE.SphereGeometry(radius * 1.5, 8, 6), ctx.secondary, next); nodes.push(next)
    }
  }
  function fractal(ctx) {
    const { THREE, p } = ctx, depth = Math.min(5, 1 + Math.floor(p.detail / 2)), geometry = new THREE.TetrahedronGeometry(1, 0), max = 1400
    let count = 0
    function place(center, size, level) {
      if (count++ > max) return
      if (level === 0) { const part = mesh(ctx, geometry.clone(), count % 2 ? ctx.primary : ctx.secondary, center); part.scale.setScalar(size); return }
      const offset = size * 0.55, next = size * 0.5
      place(center.clone().add(new THREE.Vector3(-offset, -offset * 0.55, offset)), next, level - 1)
      place(center.clone().add(new THREE.Vector3(offset, -offset * 0.55, offset)), next, level - 1)
      place(center.clone().add(new THREE.Vector3(0, -offset * 0.55, -offset)), next, level - 1)
      place(center.clone().add(new THREE.Vector3(0, offset, 0)), next, level - 1)
    }
    place(new THREE.Vector3(0, p.height * 0.45, 0), p.size * 0.28, depth)
    geometry.dispose()
  }
  function station(ctx) {
    const { THREE, p } = ctx, ring = p.size * 0.35, tube = p.size * 0.045
    mesh(ctx, new THREE.TorusGeometry(ring, tube, 8 + p.detail, 24 + p.detail * 3), ctx.primary, new THREE.Vector3(0, p.height * 0.5, 0), new THREE.Vector3(Math.PI / 2, 0, 0))
    const modules = 5 + p.density
    for (let i = 0; i < modules; i++) {
      const a = i / modules * Math.PI * 2, point = new THREE.Vector3(Math.cos(a) * ring, p.height * 0.5, Math.sin(a) * ring)
      cylinderBetween(ctx, new THREE.Vector3(0, p.height * 0.5, 0), point, tube * 0.32, ctx.secondary, 6)
      const pod = mesh(ctx, new THREE.BoxGeometry(tube * 2.8, tube * 1.8, tube * 4.5), i % 2 ? ctx.primary : ctx.secondary, point, new THREE.Vector3(0, -a, 0))
      pod.rotation.y = -a
    }
    mesh(ctx, new THREE.SphereGeometry(p.size * 0.09, 12, 8), ctx.secondary, new THREE.Vector3(0, p.height * 0.5, 0))
    cylinderBetween(ctx, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, p.height, 0), tube * 0.35, ctx.primary, 8)
  }

  const GENERATORS = { terrain, island, canyon, tunnel, city, tower, castle, village, tree, coral, crystals, rocks, maze, pipes, fractal, station }

  function generate(THREE, type, input) {
    const p = normalizedParams(type, input), ctx = context(THREE, p), generator = GENERATORS[p.type] || terrain
    generator(ctx)
    ctx.group.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(ctx.group), center = bounds.getCenter(new THREE.Vector3())
    const wrapper = new THREE.Group(), content = ctx.group
    content.position.set(-center.x, -bounds.min.y, -center.z)
    wrapper.add(content)
    wrapper.userData.procedural = { ...p, version: 1 }
    wrapper.name = `${BY_ID.get(p.type).name} (Procedural)`
    wrapper.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true } })
    return wrapper
  }

  const api = { DEFINITIONS, BY_ID, normalizedParams, generate, randomFactory }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  global.ProceduralGenerators = api
})(typeof window !== 'undefined' ? window : globalThis)
