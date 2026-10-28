'use strict'
/*
 * Static checks that the repository is a valid, GitHub Pages-ready website.
 * Run with: node tests/test-site-structure.js
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const checks = []

function test(name, fn) {
  fn()
  checks.push(name)
  console.log('  ✓ ' + name)
}

const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8')
const exists = file => fs.existsSync(path.join(ROOT, file))
const html = read('index.html')

console.log('Website structure')

test('the site entry point is index.html at the repository root', () => {
  assert.ok(exists('index.html'))
  assert.ok(html.includes('<!DOCTYPE html>'))
  assert.ok(html.includes('<html lang="en">'))
})

test('every local asset referenced by index.html exists', () => {
  const references = Array.from(html.matchAll(/(?:src|href)="([^"]+)"/g), match => match[1])
  const local = references.filter(reference => !/^(https?:|#|data:|mailto:)/.test(reference))
  assert.ok(local.length > 20, 'expected the page to load many local assets')
  const missing = local.filter(reference => !exists(reference))
  assert.deepStrictEqual(missing, [])
})

test('asset URLs stay relative so project pages work from a sub-path', () => {
  const references = Array.from(html.matchAll(/(?:src|href)="([^"]+)"/g), match => match[1])
  const rooted = references.filter(reference => reference.startsWith('/'))
  assert.deepStrictEqual(rooted, [], 'root-relative URLs break https://user.github.io/repo/ hosting')
})

test('the website does not depend on any CDN', () => {
  const externalScripts = Array.from(html.matchAll(/<(?:script|link)[^>]+(?:src|href)="(https?:[^"]+)"/g), match => match[1])
  assert.deepStrictEqual(externalScripts, [], 'bundle dependencies locally instead of using a CDN')
})

test('GitHub Pages support files are present', () => {
  assert.ok(exists('.nojekyll'), '.nojekyll keeps every folder when deploying from a branch')
  const template = read('docs/templates/github-actions-pages.yml')
  assert.ok(template.includes('actions/deploy-pages'), 'the optional workflow must deploy with actions/deploy-pages')
  assert.ok(template.includes('actions/upload-pages-artifact'))
  assert.ok(template.includes('branches:'), 'the workflow must declare a push branch')
  assert.ok(template.includes('- main'), 'the workflow should publish the main branch')
  assert.ok(template.includes("--exclude='.git'"), 'the published artifact must not include .git')
  const readme = read('README.md')
  assert.ok(readme.includes('Deploy from a branch'), 'README documents the branch deployment')
  assert.ok(readme.includes('docs/templates/github-actions-pages.yml'), 'README links the Actions template')
})

test('documentation for hosting and the splitter exists', () => {
  const readme = read('README.md')
  assert.ok(/GitHub Pages/i.test(readme))
  assert.ok(readme.includes('docs/SPLITTER.md'))
  assert.ok(exists('docs/FEATURES.md'))
  assert.ok(exists('docs/SPLITTER.md'))
  assert.ok(read('docs/SPLITTER.md').includes('manifest.json'))
})

test('the splitter workspace markup is complete', () => {
  const required = [
    'schemSplitter', 'splitterCanvas', 'splitterFileInput', 'splitterImport', 'splitterDetect',
    'splitterDownload', 'splitterDownloadSide', 'splitterUnitList', 'splitterPrefix',
    'splitterStart', 'splitterZipName', 'splitterMode', 'splitterClose', 'openSchemSplitter'
  ]
  const missing = required.filter(id => !html.includes(`id="${id}"`))
  assert.deepStrictEqual(missing, [])
})

test('splitter scripts load in dependency order', () => {
  const three = html.indexOf('assets/js/vendor/three.min.js')
  const core = html.indexOf('assets/js/bloxd-schematic-splitter.js')
  const ui = html.indexOf('assets/js/bloxd-splitter-ui.js')
  const app = html.indexOf('assets/js/app.js')
  assert.ok(three >= 0 && core > three, 'splitter core loads after Three.js')
  assert.ok(ui > core, 'splitter UI loads after the core')
  assert.ok(app > ui, 'app.js loads last')
})

test('the splitter stylesheet is loaded', () => {
  assert.ok(html.includes('assets/css/bloxd-splitter.css'))
  const css = read('assets/css/bloxd-splitter.css')
  assert.ok(css.includes('.schem-splitter'))
  assert.ok(/z-index:\s*1600/.test(css), 'the workspace must sit above the editor dialogs')
})

test('the splitter core exposes its public API', () => {
  const Splitter = require('../assets/js/bloxd-schematic-splitter.js')
  for (const name of [
    'parseSchematic', 'VoxelSet', 'mergeSources', 'removePlatforms', 'detectUnits',
    'mergeSmallUnits', 'findParentUnit', 'mergeUnits', 'encodeUnit', 'encodeVoxels',
    'createZip', 'unitColor', 'unitSize', 'unitChunkCount'
  ]) {
    assert.strictEqual(typeof Splitter[name], 'function', name + ' must be exported')
  }
})

test('the bundled Bloxd asset library is complete', () => {
  const assets = fs.readdirSync(path.join(ROOT, 'assets/bloxd-assets'))
  const schematics = assets.filter(name => name.endsWith('.bloxdschem'))
  assert.strictEqual(schematics.length, 922, 'expected 922 bundled schematics')
})

test('no stale development paths remain', () => {
  const stale = ['Blockstudio-V4.7', '3d-cube-modeler/']
  const scan = ['index.html', 'README.md', 'init.py', 'THIRD_PARTY_NOTICES.md']
  for (const file of scan) {
    const content = read(file)
    for (const fragment of stale) {
      assert.ok(!content.includes(fragment), `${file} still references ${fragment}`)
    }
  }
})

test('the local launcher serves the new root layout', () => {
  const launcher = read('init.py')
  assert.ok(launcher.includes('PROJECT_DIR = Path(__file__).resolve().parent'))
  assert.ok(launcher.includes('VoxelForge'))
})

console.log(`  ${checks.length} structure checks passed`)
