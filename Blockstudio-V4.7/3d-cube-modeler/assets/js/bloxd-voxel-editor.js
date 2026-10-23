/* Permanent Bloxd voxel-world data model, renderer, history, selection and editing operations. */
(function (global) {
  'use strict'
  const keyOf = (x, y, z) => `${Math.round(x)},${Math.round(y)},${Math.round(z)}`
  const parseKey = key => key.split(',').map(Number)

  class BloxdVoxelWorld {
    constructor(THREE, scene, options = {}) {
      this.THREE = THREE
      this.scene = scene
      this.blocks = new Map()
      this.selection = new Set()
      this.clipboard = []
      this.groups = []
      this.activeGroupId = null
      this.texturePalette = Array.isArray(options.texturePalette) ? options.texturePalette.map(item=>({...item})) : []
      this.textureSettings = { ...(options.textureSettings || {}) }
      this.terrainSettings = { ...(options.terrainSettings || {}) }
      this.scatterSettings = { ...(options.scatterSettings || {}) }
      this.proceduralPaths = JSON.parse(JSON.stringify(options.proceduralPaths || []))
      this.root = new THREE.Group()
      this.root.name = 'Bloxd Voxel World'
      this.scene.add(this.root)
      this.meshes = []
      this.history = []
      this.historyIndex = -1
      this.currentBlockId = Number(options.blockId) || 28
      this.globalBlocksPerUnit = Number(options.blocksPerUnit) || 2
      this.overrides = { ...(options.overrides || {}) }
      this.maxRenderedBlocks = options.maxRenderedBlocks || 750000
      this.chunkSize = Math.max(8, Math.min(32, Number(options.chunkSize) || 16))
      this.chunkIndex = new Map()
      this.chunkVisuals = new Map()
      this.dirtyChunks = new Set()
      this.indexedBlockCount = 0
      this.allChunksDirty = true
      this.renderMode = 'chunks'
      this.grid = new THREE.GridHelper(256, 256, 0x4aa84a, 0x254025)
      this.grid.name = 'Bloxd Grid'
      this.grid.position.y = -0.501
      this.grid.material.transparent = true
      this.grid.material.opacity = 0.38
      this.root.add(this.grid)
      this.selectionHelper = new THREE.Group()
      this.selectionHelper.name = 'Block Selection'
      this.root.add(this.selectionHelper)
      this.onChange = null
    }

    dispose() {
      this.scene.remove(this.root)
      this.clearRenderMeshes()
      this.selectionHelper.traverse(child => {
        if (child.geometry) child.geometry.dispose()
        if (child.material) child.material.dispose()
      })
      this.grid.geometry.dispose()
      this.grid.material.dispose()
    }

    chunkKeyForPosition(x,y,z){const size=this.chunkSize;return `${Math.floor(x/size)},${Math.floor(y/size)},${Math.floor(z/size)}`}
    chunkKeyForBlockKey(key){return this.chunkKeyForPosition(...parseKey(key))}
    markDirtyKey(key){this.dirtyChunks.add(this.chunkKeyForBlockKey(key))}
    markAllDirty(){this.allChunksDirty=true;this.dirtyChunks.clear()}
    _indexAdd(key){const chunk=this.chunkKeyForBlockKey(key);if(!this.chunkIndex.has(chunk))this.chunkIndex.set(chunk,new Set());const set=this.chunkIndex.get(chunk);if(!set.has(key)){set.add(key);this.indexedBlockCount++}this.dirtyChunks.add(chunk)}
    _indexDelete(key){const chunk=this.chunkKeyForBlockKey(key),set=this.chunkIndex.get(chunk);if(set&&set.delete(key)){this.indexedBlockCount--;if(!set.size)this.chunkIndex.delete(chunk)}this.dirtyChunks.add(chunk)}
    rebuildChunkIndex(){this.chunkIndex.clear();this.indexedBlockCount=0;this.blocks.forEach((id,key)=>{const chunk=this.chunkKeyForBlockKey(key);if(!this.chunkIndex.has(chunk))this.chunkIndex.set(chunk,new Set());this.chunkIndex.get(chunk).add(key);this.indexedBlockCount++});this.markAllDirty()}
    _disposeChunkVisual(chunk){const visual=this.chunkVisuals.get(chunk);if(!visual)return;this.root.remove(visual.group);visual.meshes.forEach(mesh=>{if(mesh.geometry)mesh.geometry.dispose();if(mesh.material)mesh.material.dispose()});this.chunkVisuals.delete(chunk)}
    clearRenderMeshes(){this.chunkVisuals.forEach((value,key)=>this._disposeChunkVisual(key));this.chunkVisuals.clear();this.meshes=[];this.renderedBlockCount=0}

    get size() { return this.blocks.size }
    has(x, y, z) { return this.blocks.has(keyOf(x, y, z)) }
    get(x, y, z) { return this.blocks.get(keyOf(x, y, z)) || 0 }
    isLockedKey(key){return this.groups.some(group=>group.locked&&(group.keys||[]).includes(key))}
    set(x, y, z, id = this.currentBlockId) {
      const key = keyOf(x, y, z)
      if(this.isLockedKey(key))return key
      const existed=this.blocks.has(key),previous=this.blocks.get(key)
      if(Number(id)===0){if(existed){this.blocks.delete(key);this._indexDelete(key)}}
      else if(previous!==Number(id)){this.blocks.set(key,Number(id));if(!existed)this._indexAdd(key);else this.markDirtyKey(key)}
      return key
    }
    delete(x,y,z){const key=keyOf(x,y,z);if(this.isLockedKey(key)||!this.blocks.has(key))return false;this.blocks.delete(key);this._indexDelete(key);return true}

    load(input) {
      this.blocks.clear()
      if (input instanceof Map) input.forEach((id, key) => { if (Number(id)) this.blocks.set(key, Number(id)) })
      else if (Array.isArray(input)) input.forEach(entry => {
        if (Array.isArray(entry) && entry.length >= 4 && Number(entry[3])) this.blocks.set(keyOf(entry[0], entry[1], entry[2]), Number(entry[3]))
      })
      this.selection.clear()
      this.rebuildChunkIndex()
      this.render()
    }

    serialize() {
      return {
        version: 1,
        globalBlocksPerUnit: this.globalBlocksPerUnit,
        chunkSize: this.chunkSize,
        currentBlockId: this.currentBlockId,
        overrides: { ...this.overrides },
        groups: this.groups.map(group=>({...group,keys:[...group.keys].filter(key=>this.blocks.has(key))})),
        texturePalette: this.texturePalette.map(item=>({...item})),
        textureSettings: { ...this.textureSettings },
        terrainSettings: { ...this.terrainSettings },
        scatterSettings: { ...this.scatterSettings },
        proceduralPaths: JSON.parse(JSON.stringify(this.proceduralPaths)),
        blocks: [...this.blocks].map(([key, id]) => [...parseKey(key), id])
      }
    }

    restore(data) {
      this.globalBlocksPerUnit = Number(data.globalBlocksPerUnit) || 2
      this.chunkSize = Math.max(8,Math.min(32,Number(data.chunkSize)||this.chunkSize||16))
      this.currentBlockId = Number(data.currentBlockId) || 28
      this.overrides = { ...(data.overrides || {}) }
      this.groups = (data.groups || []).map(group=>({...group,keys:[...(group.keys||[])]}))
      this.texturePalette = (data.texturePalette || []).map(item=>({...item}))
      this.textureSettings = { ...(data.textureSettings || {}) }
      this.terrainSettings = { ...(data.terrainSettings || {}) }
      this.scatterSettings = { ...(data.scatterSettings || {}) }
      this.proceduralPaths = JSON.parse(JSON.stringify(data.proceduralPaths || []))
      this.load(data.blocks || [])
      this.commit('Loaded voxel world', true)
    }

    snapshot() { return new Map(this.blocks) }
    commit(label = 'Edit blocks', reset = false) {
      if (reset) { this.history = []; this.historyIndex = -1 }
      this.history.splice(this.historyIndex + 1)
      this.history.push({ label, blocks: this.snapshot(), selection: new Set(this.selection), proceduralPaths: JSON.parse(JSON.stringify(this.proceduralPaths)) })
      if (this.history.length > 24) this.history.shift()
      this.historyIndex = this.history.length - 1
      if (this.onChange) this.onChange(label)
    }
    undo() {
      if (this.historyIndex <= 0) return false
      this.historyIndex--
      const state = this.history[this.historyIndex]
      this.blocks = new Map(state.blocks); this.selection = new Set(state.selection); this.proceduralPaths=JSON.parse(JSON.stringify(state.proceduralPaths||[])); this.rebuildChunkIndex(); this.render()
      if (this.onChange) this.onChange(`Undo: ${state.label}`)
      return true
    }
    redo() {
      if (this.historyIndex >= this.history.length - 1) return false
      this.historyIndex++
      const state = this.history[this.historyIndex]
      this.blocks = new Map(state.blocks); this.selection = new Set(state.selection); this.proceduralPaths=JSON.parse(JSON.stringify(state.proceduralPaths||[])); this.rebuildChunkIndex(); this.render()
      if (this.onChange) this.onChange(`Redo: ${state.label}`)
      return true
    }

    colorFor(id) {
      return global.BloxdBlockColors ? global.BloxdBlockColors.hex(Number(id)) : ((Number(id) * 2654435761) & 0xffffff)
    }

    _buildChunkVisual(chunk,keys,hidden){
      this._disposeChunkVisual(chunk)
      if(!keys||!keys.size)return
      const grouped=new Map();let count=0
      keys.forEach(key=>{if(hidden.has(key)||!this.blocks.has(key))return;const id=this.blocks.get(key);if(!grouped.has(id))grouped.set(id,[]);grouped.get(id).push(key);count++})
      if(!count)return
      const group=new this.THREE.Group();group.name=`Voxel chunk ${chunk}`;group.userData.voxelChunk=chunk;const meshes=[],matrix=new this.THREE.Matrix4()
      grouped.forEach((blockKeys,id)=>{const geometry=new this.THREE.BoxGeometry(1,1,1),material=new this.THREE.MeshStandardMaterial({color:this.colorFor(id),roughness:.78,metalness:.05}),mesh=new this.THREE.InstancedMesh(geometry,material,blockKeys.length);mesh.name=global.BLOXD_ID_TO_NAME&&global.BLOXD_ID_TO_NAME[id]?global.BLOXD_ID_TO_NAME[id]:`Block ${id}`;mesh.userData.voxelKeys=blockKeys;mesh.userData.blockId=Number(id);mesh.userData.voxelChunk=chunk;blockKeys.forEach((key,index)=>{const[x,y,z]=parseKey(key);matrix.makeTranslation(x+.5,y+.5,z+.5);mesh.setMatrixAt(index,matrix)});mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);meshes.push(mesh)})
      this.root.add(group);this.chunkVisuals.set(chunk,{group,meshes,count})
    }
    render(){
      if(this.indexedBlockCount!==this.blocks.size)this.rebuildChunkIndex()
      const hidden=new Set(this.groups.filter(group=>group.hidden).flatMap(group=>group.keys||[]))
      if(this.blocks.size>this.maxRenderedBlocks){
        this.clearRenderMeshes();this.renderMode='surface-lod';const dirs=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],surfaceByChunk=new Map();let accepted=0
        this.blocks.forEach((id,key)=>{if(accepted>=this.maxRenderedBlocks||hidden.has(key))return;const p=parseKey(key);if(!dirs.some(d=>!this.blocks.has(keyOf(p[0]+d[0],p[1]+d[1],p[2]+d[2]))))return;const chunk=this.chunkKeyForBlockKey(key);if(!surfaceByChunk.has(chunk))surfaceByChunk.set(chunk,new Set());surfaceByChunk.get(chunk).add(key);accepted++})
        surfaceByChunk.forEach((keys,chunk)=>this._buildChunkVisual(chunk,keys,hidden));this.allChunksDirty=false;this.dirtyChunks.clear()
      }else{
        this.renderMode='chunks'
        if(this.allChunksDirty||!this.chunkVisuals.size){this.chunkVisuals.forEach((value,key)=>this._disposeChunkVisual(key));this.chunkIndex.forEach((keys,chunk)=>this.dirtyChunks.add(chunk));this.allChunksDirty=false}
        else if(!this.dirtyChunks.size)this.chunkIndex.forEach((keys,chunk)=>this.dirtyChunks.add(chunk))
        ;[...this.dirtyChunks].forEach(chunk=>this._buildChunkVisual(chunk,this.chunkIndex.get(chunk),hidden));this.dirtyChunks.clear()
      }
      this.meshes=[...this.chunkVisuals.values()].flatMap(visual=>visual.meshes);this.renderedBlockCount=[...this.chunkVisuals.values()].reduce((sum,visual)=>sum+visual.count,0);this.renderSelection();if(this.onChange)this.onChange('render')
    }

    renderSelection() {
      while (this.selectionHelper.children.length) {
        const child = this.selectionHelper.children.pop()
        if (child.geometry) child.geometry.dispose()
        if (child.material) child.material.dispose()
      }
      if (!this.selection.size) return
      const geometry = new this.THREE.BoxGeometry(1.04, 1.04, 1.04)
      const material = new this.THREE.MeshBasicMaterial({ color: 0x00ff66, wireframe: true, depthTest: false, transparent: true, opacity: 0.85 })
      const helper = new this.THREE.InstancedMesh(geometry, material, this.selection.size)
      const matrix = new this.THREE.Matrix4()
      ;[...this.selection].forEach((key, index) => {
        const [x, y, z] = parseKey(key)
        matrix.makeTranslation(x + 0.5, y + 0.5, z + 0.5)
        helper.setMatrixAt(index, matrix)
      })
      helper.instanceMatrix.needsUpdate = true
      helper.renderOrder = 1000
      helper.userData.isVoxelSelectionHelper = true
      this.selectionHelper.add(helper)
    }

    pick(intersections) {
      for (const hit of intersections) {
        const object = hit.object
        if (!object || !object.isInstancedMesh || !object.userData.voxelKeys || hit.instanceId == null) continue
        const key = object.userData.voxelKeys[hit.instanceId]
        if (!key) continue
        const normal = hit.face && hit.face.normal ? hit.face.normal.clone() : new this.THREE.Vector3(0, 1, 0)
        return { key, position: parseKey(key), id: this.blocks.get(key), normal, point: hit.point }
      }
      return null
    }

    place(position, id = this.currentBlockId) { this.set(...position, id); this.render(); this.commit('Place block') }
    remove(position) { this.delete(...position); this.selection.delete(keyOf(...position)); this.render(); this.commit('Remove block') }
    paint(position, id = this.currentBlockId) { if (this.has(...position)) { this.set(...position, id); this.render(); this.commit('Paint block') } }
    sphere(center, radius, operation = 'place', id = this.currentBlockId) {
      radius = Math.max(0, Math.min(8, Math.round(radius)))
      let count = 0
      for(let x=-radius;x<=radius;x++) for(let y=-radius;y<=radius;y++) for(let z=-radius;z<=radius;z++) {
        if(x*x+y*y+z*z>radius*radius)continue
        const p=[center[0]+x,center[1]+y,center[2]+z]
        if(operation==='remove'){if(this.delete(...p))count++}
        else if(operation==='paint'){if(this.has(...p)){this.set(...p,id);count++}}
        else{this.set(...p,id);count++}
      }
      this.render();this.commit(`${operation} sphere brush`);return count
    }
    smoothSphere(center,radius=2){
      radius=Math.max(1,Math.min(8,Math.round(radius)));const dirs=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],changes=[]
      for(let x=-radius;x<=radius;x++)for(let y=-radius;y<=radius;y++)for(let z=-radius;z<=radius;z++){
        if(x*x+y*y+z*z>radius*radius)continue;const p=[center[0]+x,center[1]+y,center[2]+z],key=keyOf(...p),ids=dirs.map(d=>this.get(p[0]+d[0],p[1]+d[1],p[2]+d[2])).filter(id=>id!=null)
        if(this.blocks.has(key)&&ids.length<=1)changes.push([key,null]);else if(!this.blocks.has(key)&&ids.length>=5){const counts=new Map();ids.forEach(id=>counts.set(id,(counts.get(id)||0)+1));changes.push([key,[...counts].sort((a,b)=>b[1]-a[1])[0][0]])}
      }
      changes.forEach(([key,id])=>id==null?this.blocks.delete(key):this.blocks.set(key,id));this.render();this.commit('Smooth block sculpt');return changes.length
    }
    flattenSphere(center,radius=2,id=this.currentBlockId){
      radius=Math.max(1,Math.min(8,Math.round(radius)));let count=0
      for(let x=-radius;x<=radius;x++)for(let z=-radius;z<=radius;z++){if(x*x+z*z>radius*radius)continue;for(let y=-radius;y<=radius;y++)this.blocks.delete(keyOf(center[0]+x,center[1]+y,center[2]+z));this.set(center[0]+x,center[1],center[2]+z,id);count++}
      this.render();this.commit('Flatten block sculpt');return count
    }

    floodFill(position, id = this.currentBlockId, limit = 100000) {
      const source = this.get(...position)
      if (!source || source === id) return 0
      const queue = [position], visited = new Set(), changed = []
      const directions = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]
      while (queue.length && changed.length < limit) {
        const current = queue.shift(), key = keyOf(...current)
        if (visited.has(key)) continue
        visited.add(key)
        if (this.blocks.get(key) !== source) continue
        this.blocks.set(key, id); changed.push(key)
        directions.forEach(d => queue.push([current[0]+d[0], current[1]+d[1], current[2]+d[2]]))
      }
      this.render(); this.commit('Flood fill blocks'); return changed.length
    }

    box(a, b, id = this.currentBlockId, hollow = false) {
      const min = a.map((v, i) => Math.min(v, b[i])), max = a.map((v, i) => Math.max(v, b[i]))
      let count = 0
      for (let x=min[0];x<=max[0];x++) for(let y=min[1];y<=max[1];y++) for(let z=min[2];z<=max[2];z++) {
        if (hollow && x>min[0]&&x<max[0]&&y>min[1]&&y<max[1]&&z>min[2]&&z<max[2]) continue
        this.set(x,y,z,id); count++
      }
      this.render(); this.commit(hollow ? 'Hollow block box' : 'Block box'); return count
    }

    line(a, b, id = this.currentBlockId) {
      const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],steps=Math.max(Math.abs(dx),Math.abs(dy),Math.abs(dz),1)
      for(let i=0;i<=steps;i++) this.set(Math.round(a[0]+dx*i/steps),Math.round(a[1]+dy*i/steps),Math.round(a[2]+dz*i/steps),id)
      this.render(); this.commit('Block line')
    }

    selectBox(a, b, additive = false) {
      if (!additive) this.selection.clear()
      const min=a.map((v,i)=>Math.min(v,b[i])),max=a.map((v,i)=>Math.max(v,b[i]))
      this.blocks.forEach((id,key)=>{const p=parseKey(key);if(p.every((v,i)=>v>=min[i]&&v<=max[i]))this.selection.add(key)})
      this.renderSelection(); if(this.onChange)this.onChange('selection')
    }
    selectConnected(position, additive = false, limit = 100000) {
      const source=this.get(...position);if(!source)return
      if(!additive)this.selection.clear()
      const q=[position],seen=new Set(),dirs=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]
      while(q.length&&seen.size<limit){const p=q.shift(),k=keyOf(...p);if(seen.has(k)||this.blocks.get(k)!==source)continue;seen.add(k);this.selection.add(k);dirs.forEach(d=>q.push([p[0]+d[0],p[1]+d[1],p[2]+d[2]]))}
      this.renderSelection(); if(this.onChange)this.onChange('selection')
    }
    clearSelection() { this.selection.clear(); this.renderSelection(); if(this.onChange)this.onChange('selection') }
    copySelection() {
      if (!this.selection.size) return 0
      const points=[...this.selection].map(key=>({position:parseKey(key),id:this.blocks.get(key)}))
      const min=[Math.min(...points.map(p=>p.position[0])),Math.min(...points.map(p=>p.position[1])),Math.min(...points.map(p=>p.position[2]))]
      this.clipboard=points.map(item=>({offset:item.position.map((v,i)=>v-min[i]),id:item.id}));return this.clipboard.length
    }
    cutSelection() { const count=this.copySelection();this.selection.forEach(key=>{if(!this.isLockedKey(key))this.blocks.delete(key)});this.selection=new Set([...this.selection].filter(key=>this.blocks.has(key)));this.render();this.commit('Cut blocks');return count }
    paste(position) { this.clipboard.forEach(item=>this.set(...item.offset.map((v,i)=>v+position[i]),item.id));this.render();this.commit('Paste blocks');return this.clipboard.length }
    deleteSelection() { let count=0;this.selection.forEach(key=>{if(!this.isLockedKey(key)&&this.blocks.delete(key))count++});this.selection=new Set([...this.selection].filter(key=>this.blocks.has(key)));this.render();this.commit('Delete selected blocks');return count }

    transformSelection(mapper, label) {
      if (!this.selection.size) return 0
      const locked=[...this.selection].filter(key=>this.isLockedKey(key)),items=[...this.selection].filter(key=>!this.isLockedKey(key)).map(key=>({position:parseKey(key),id:this.blocks.get(key)}))
      items.forEach(item=>this.blocks.delete(keyOf(...item.position)));this.selection=new Set(locked)
      items.forEach(item=>{const p=mapper(item.position);const key=this.set(...p,item.id);this.selection.add(key)})
      const active=this.groups.find(group=>group.id===this.activeGroupId);if(active&&!active.locked)active.keys=[...this.selection]
      this.render();this.commit(label);return items.length
    }
    moveSelection(dx,dy,dz){return this.transformSelection(p=>[p[0]+dx,p[1]+dy,p[2]+dz],'Move selected blocks')}
    rotateSelection(axis='y',clockwise=true){
      if(!this.selection.size)return 0
      const points=[...this.selection].map(parseKey),center=[0,1,2].map(i=>(Math.min(...points.map(p=>p[i]))+Math.max(...points.map(p=>p[i])))/2)
      return this.transformSelection(p=>{const q=p.map((v,i)=>v-center[i]);let r
        if(axis==='x')r=[q[0],clockwise?-q[2]:q[2],clockwise?q[1]:-q[1]]
        else if(axis==='z')r=[clockwise?-q[1]:q[1],clockwise?q[0]:-q[0],q[2]]
        else r=[clockwise?-q[2]:q[2],q[1],clockwise?q[0]:-q[0]]
        return r.map((v,i)=>Math.round(v+center[i]))},`Rotate blocks ${axis.toUpperCase()}`)
    }
    mirrorSelection(axis='x'){
      if(!this.selection.size)return 0
      const points=[...this.selection].map(parseKey),i={x:0,y:1,z:2}[axis],center=(Math.min(...points.map(p=>p[i]))+Math.max(...points.map(p=>p[i])))/2
      return this.transformSelection(p=>p.map((v,j)=>j===i?Math.round(center-(v-center)):v),`Mirror blocks ${axis.toUpperCase()}`)
    }
    replace(sourceId,targetId,selectionOnly=false){let count=0;(selectionOnly?this.selection:this.blocks).forEach((value,key)=>{const id=selectionOnly?this.blocks.get(value):value,k=selectionOnly?value:key;if(id===sourceId){this.blocks.set(k,targetId);count++}});this.render();this.commit('Replace blocks');return count}

    scaleSelection(fx=1,fy=1,fz=1){
      if(!this.selection.size)return 0
      const factors=[fx,fy,fz].map(value=>Math.max(.1,Math.min(10,Number(value)||1)))
      const old=new Map([...this.selection].map(key=>[key,this.blocks.get(key)])),points=[...old.keys()].map(parseKey)
      const min=[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),max=[0,1,2].map(i=>Math.max(...points.map(p=>p[i]))),size=max.map((v,i)=>v-min[i]+1),next=size.map((v,i)=>Math.max(1,Math.round(v*factors[i])))
      this.selection.forEach(key=>this.blocks.delete(key));this.selection.clear()
      for(let x=0;x<next[0];x++)for(let y=0;y<next[1];y++)for(let z=0;z<next[2];z++){
        const source=[x,y,z].map((v,i)=>min[i]+Math.min(size[i]-1,Math.floor(v*size[i]/next[i]))),id=old.get(keyOf(...source));if(id==null)continue
        const p=[min[0]+x,min[1]+y,min[2]+z],key=this.set(...p,id);this.selection.add(key)
      }
      this.render();this.commit('Scale selected blocks');return this.selection.size
    }
    extrudeSelection(dx=0,dy=1,dz=0){
      if(!this.selection.size)return 0
      const source=[...this.selection].map(key=>({p:parseKey(key),id:this.blocks.get(key)})),created=[]
      const steps=Math.max(Math.abs(dx),Math.abs(dy),Math.abs(dz),1)
      for(let n=1;n<=steps;n++)source.forEach(item=>{const p=[item.p[0]+Math.round(dx*n/steps),item.p[1]+Math.round(dy*n/steps),item.p[2]+Math.round(dz*n/steps)];created.push(this.set(...p,item.id))})
      this.selection=new Set(created);this.render();this.commit('Extrude selected blocks');return created.length
    }
    hollowSelection(){
      if(!this.selection.size)return 0
      const selected=new Set(this.selection),dirs=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],remove=[]
      selected.forEach(key=>{const p=parseKey(key);if(dirs.every(d=>selected.has(keyOf(p[0]+d[0],p[1]+d[1],p[2]+d[2]))))remove.push(key)})
      remove.forEach(key=>{this.blocks.delete(key);this.selection.delete(key)});this.render();this.commit('Hollow selected blocks');return remove.length
    }
    dilateSelection(){
      if(!this.selection.size)return 0
      const dirs=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],add=new Map()
      this.selection.forEach(key=>{const p=parseKey(key),id=this.blocks.get(key);dirs.forEach(d=>{const k=keyOf(p[0]+d[0],p[1]+d[1],p[2]+d[2]);if(!this.blocks.has(k))add.set(k,id)})})
      add.forEach((id,key)=>{this.blocks.set(key,id);this.selection.add(key)});this.render();this.commit('Dilate selected blocks');return add.size
    }
    erodeSelection(){
      if(!this.selection.size)return 0
      const selected=new Set(this.selection),dirs=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],remove=[]
      selected.forEach(key=>{const p=parseKey(key);if(dirs.some(d=>!selected.has(keyOf(p[0]+d[0],p[1]+d[1],p[2]+d[2]))))remove.push(key)})
      remove.forEach(key=>{this.blocks.delete(key);this.selection.delete(key)});this.render();this.commit('Erode selected blocks');return remove.length
    }
    smoothSelection(){
      if(!this.selection.size)return 0
      const dirs=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],changes=[]
      this.selection.forEach(key=>{const p=parseKey(key),counts=new Map();dirs.forEach(d=>{const id=this.get(p[0]+d[0],p[1]+d[1],p[2]+d[2]);if(id!=null)counts.set(id,(counts.get(id)||0)+1)});const best=[...counts].sort((a,b)=>b[1]-a[1])[0];if(best&&best[1]>=3)changes.push([key,best[0]])})
      changes.forEach(([key,id])=>this.blocks.set(key,id));this.render();this.commit('Smooth block materials');return changes.length
    }
    booleanClipboard(operation='union'){
      if(!this.selection.size||!this.clipboard.length)return 0
      const points=[...this.selection].map(parseKey),min=[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),clip=new Map(this.clipboard.map(item=>[keyOf(...item.offset.map((v,i)=>v+min[i])),item.id]))
      if(operation==='union')clip.forEach((id,key)=>{this.blocks.set(key,id);this.selection.add(key)})
      else if(operation==='subtract')clip.forEach((id,key)=>{this.blocks.delete(key);this.selection.delete(key)})
      else [...this.selection].forEach(key=>{if(!clip.has(key)){this.blocks.delete(key);this.selection.delete(key)}})
      this.render();this.commit(`Block boolean ${operation}`);return this.selection.size
    }

    bounds() {
      if(!this.blocks.size)return null
      const points=[...this.blocks.keys()].map(parseKey)
      return {min:[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...points.map(p=>p[i])))}
    }

    toVoxelMap(){return new Map(this.blocks)}
    toObject3D(expand=false,limit=100000){
      const group=new this.THREE.Group();group.name='Bloxd Voxel Export'
      if(expand&&this.blocks.size<=limit){const geometry=new this.THREE.BoxGeometry(1,1,1),materials=new Map();this.blocks.forEach((id,key)=>{if(!materials.has(id))materials.set(id,new this.THREE.MeshStandardMaterial({color:this.colorFor(id)}));const mesh=new this.THREE.Mesh(geometry.clone(),materials.get(id));const p=parseKey(key);mesh.position.set(p[0]+.5,p[1]+.5,p[2]+.5);group.add(mesh)});geometry.dispose()}
      else this.meshes.forEach(mesh=>group.add(mesh.clone()))
      return group
    }
  }

  const api={BloxdVoxelWorld,keyOf,parseKey}
  if(typeof module!=='undefined'&&module.exports)module.exports=api
  global.BloxdVoxelEditor=api
})(typeof window!=='undefined'?window:globalThis)
