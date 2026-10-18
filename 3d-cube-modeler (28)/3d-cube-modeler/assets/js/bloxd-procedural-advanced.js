/* Friendly schema for every tunable native Bloxd procedural parameter. */
(function(global){
'use strict'
const n=(label,min,max,step,value,help='')=>({type:'number',label,min,max,step,value,help})
const b=(label,value,help='')=>({type:'checkbox',label,value,help})
const COMMON={surfaceDepth:n('Generated surface depth',1,32,1,4,'Number of solid layers under height-field surfaces.')}
const SCHEMAS={
 terrain:{noiseScale:n('Mountain noise scale',.25,12,.25,3),detailScale:n('Detail noise scale',.5,20,.25,5),noiseOctaves:n('Noise octaves',1,8,1,5),baseHeight:n('Base height',0,.8,.01,.16),ridgeWeight:n('Ridge strength',0,1.5,.01,.58),noiseWeight:n('Roughness strength',0,1,.01,.26),...COMMON},
 island:{islandFalloff:n('Land falloff',.5,4,.05,1.15),islandNoiseScale:n('Mountain noise scale',.5,12,.25,4),islandNoiseOctaves:n('Mountain octaves',1,8,1,5),riverWidth:n('River width multiplier',.25,4,.05,1),riverDepthScale:n('River depth multiplier',0,4,.05,1),ecologyCap:n('Maximum ecology features',0,10000,10,800),...COMMON},
 canyon:{meander:n('Gorge meander',0,10,.1,3),gorgeWidth:n('Gorge width',.02,.48,.01,.18),baseHeight:n('Canyon floor height',0,.7,.01,.15),wallHeight:n('Cliff height',.1,1.5,.01,.7),wallNoise:n('Wall roughness',0,.8,.01,.15),terraceCount:n('Terrace count',1,32,1,7),...COMMON},
 tunnel:{pathTurns:n('Vertical path turns',.1,12,.1,3),sideTurns:n('Horizontal path turns',.1,16,.1,4),pathAmplitude:n('Path amplitude',0,.8,.01,.22),radiusBase:n('Base radius',.25,8,.25,1),radiusDensity:n('Density radius influence',0,.5,.01,.125),branchChance:n('Branch probability',0,1,.01,.06),branchLength:n('Branch length',.05,1,.01,.5)},
 city:{cellSize:n('City cell size',2,24,1,6),roadEvery:n('Road every N cells',1,10,1,3),roadWidth:n('Road half-width',0,6,1,2),minBuildingHeight:n('Minimum tower height',.05,1,.01,.2),maxBuildingHeight:n('Maximum tower height',.1,2,.01,1),accentChance:n('Accent building chance',0,1,.01,.25),windowSpacing:n('Window spacing',1,12,1,3),hollowBuildings:b('Hollow buildings',false)},
 tower:{radiusRatio:n('Base radius ratio',.05,.8,.01,.34),taper:n('Top taper',0,.9,.01,.45),tierCount:n('Tier count',1,20,1,5),crownRadius:n('Crown radius ratio',.1,1,.01,.45),crownHeight:n('Crown height ratio',.02,.5,.01,.12),supportCount:n('Support count',0,32,1,7),hollow:b('Hollow shell',true)},
 castle:{wallHeight:n('Wall height ratio',.1,1,.01,.55),wallThickness:n('Wall thickness',1,8,1,1),towerHeight:n('Tower height ratio',.2,1.5,.01,.8),towerRadius:n('Tower radius',1,12,1,3),keepScale:n('Keep footprint ratio',.1,.8,.01,.28),battlementSpacing:n('Battlement spacing',1,8,1,2),gateWidth:n('Gate width',1,15,2,3),gateHeight:n('Gate height ratio',.05,.8,.01,.28)},
 village:{houseCount:n('House count',1,100,1,12),houseMinSize:n('Minimum house half-size',1,8,1,2),houseMaxSize:n('Maximum house half-size',1,12,1,4),houseHeight:n('House height ratio',.1,1.5,.01,.5),roadWidth:n('Road half-width',0,6,1,1),roofLayers:n('Roof layers',1,12,1,3)},
 tree:{trunkRadius:n('Trunk radius',1,8,1,1),branchCount:n('Branch count',0,100,1,15),branchStart:n('Branch start height',0,1,.01,.35),branchEnd:n('Branch end height',0,1,.01,.93),branchLengthMin:n('Minimum branch length',.02,1,.01,.18),branchLengthMax:n('Maximum branch length',.02,1.5,.01,.4),canopyRadius:n('Top canopy ratio',.05,.8,.01,.24),clusterRadius:n('Branch canopy ratio',.02,.5,.01,.1)},
 coral:{recursion:n('Recursion levels',1,7,1,3),branchesPerTip:n('Branches per tip',1,6,1,3),branchLength:n('Branch length multiplier',.2,3,.05,1),thickness:n('Branch thickness',0,4,1,1),polypRadius:n('Terminal polyp radius',1,5,1,1)},
 crystals:{crystalCount:n('Crystal count',1,100,1,14),minCrystalHeight:n('Minimum height ratio',.05,1,.01,.25),maxCrystalHeight:n('Maximum height ratio',.1,2,.01,1),minCrystalRadius:n('Minimum radius',1,8,1,1),maxCrystalRadius:n('Maximum radius',1,12,1,3),baseRadius:n('Cluster base ratio',.05,.8,.01,.3)},
 rocks:{rockCount:n('Rock count',1,200,1,15),minRockRadius:n('Minimum radius',.25,10,.25,1),maxRockRadius:n('Maximum radius ratio',.01,.5,.01,.09),verticalScale:n('Vertical scale',.1,3,.05,1),secondaryChance:n('Accent rock chance',0,1,.01,.3)},
 maze:{mazeCells:n('Maze cells per axis',5,101,2,21),wallHeight:n('Wall height',1,32,1,5),wallThickness:n('Wall thickness',1,5,1,1),braidChance:n('Extra passage chance',0,.5,.01,0)},
 pipes:{walkerCount:n('Network walkers',1,32,1,3),segments:n('Segments per walker',1,100,1,15),minSegment:n('Minimum segment length',1,20,1,2),maxSegmentRatio:n('Maximum segment ratio',.02,.8,.01,.16),pipeRadius:n('Pipe radius',0,5,1,1),hubRadius:n('Hub radius',1,8,1,2)},
 fractal:{recursion:n('Recursion depth',1,7,1,3),minimumModule:n('Minimum module size',1,8,1,2),accentAlternation:b('Alternate accent blocks',true)},
 station:{ringRadius:n('Outer ring ratio',.1,.8,.01,.42),ringThickness:n('Ring thickness',1,8,1,2),innerRingRatio:n('Inner ring ratio',.1,.95,.01,.65),spokeCount:n('Spokes',3,48,1,7),moduleSize:n('Module half-size',1,8,1,2),coreRadius:n('Core radius',1,12,1,3),antennaHeight:n('Antenna height ratio',.1,2,.01,1)}
}
function defaults(type){const out={};Object.entries(SCHEMAS[type]||{}).forEach(([key,item])=>out[key]=item.value);return out}
const api={SCHEMAS,defaults}
if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.BloxdProceduralAdvanced=api
})(typeof window!=='undefined'?window:globalThis)
