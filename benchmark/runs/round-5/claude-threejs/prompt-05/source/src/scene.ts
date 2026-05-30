import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/**
 * 3D Data Visualization — 6x6 grid of bars (prompt 05).
 *
 * Built directly against three.js (the engine bundled in ./context).
 *
 * Behavior implemented:
 *  - 36 bars (6x6) laid out on a grid.
 *  - Heights start at 0 and animate up to seeded random target values.
 *  - Bar color corresponds to its normalized height (low -> high color ramp).
 *  - Hover highlight: the bar under the pointer brightens (color + emissive).
 *  - Orbit camera (OrbitControls: drag to rotate, scroll to zoom).
 *  - Readable axis labels (X / Z / Value) rendered as camera-facing sprites.
 */

const ROWS = 6
const COLS = 6
const SEED = 7
const SPACING = 1.6
const BAR_SIZE = 0.9
const MAX_HEIGHT = 6
const ANIM_DURATION = 1.8 // seconds for the grow-in animation

/** Deterministic seeded PRNG (mulberry32) so the dataset is stable per load. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Color ramp from cool (low) to warm (high) given a normalized height 0..1. */
function colorByHeight(t: number): THREE.Color {
  const hue = 0.62 * (1 - t) // blue (low) -> red (high)
  return new THREE.Color().setHSL(hue, 0.75, 0.5)
}

/** Build a readable text label as a camera-facing sprite. */
function textLabel(text: string, position: [number, number, number]): THREE.Sprite {
  const padding = 16
  const fontSize = 64
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  ctx.font = `bold ${fontSize}px system-ui, sans-serif`
  const metrics = ctx.measureText(text)
  canvas.width = Math.ceil(metrics.width) + padding * 2
  canvas.height = fontSize + padding * 2

  // Resize clears state; re-apply.
  ctx.font = `bold ${fontSize}px system-ui, sans-serif`
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.shadowColor = 'rgba(0,0,0,0.9)'
  ctx.shadowBlur = 6
  ctx.fillText(text, canvas.width / 2, canvas.height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.anisotropy = 4
  texture.needsUpdate = true

  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
  const sprite = new THREE.Sprite(material)
  sprite.position.set(...position)
  const scale = 0.012
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1)
  return sprite
}

interface Bar {
  mesh: THREE.Mesh
  target: number
  baseColor: THREE.Color
}

export interface SceneHandle {
  dispose: () => void
}

export function createScene(container: HTMLElement): SceneHandle {
  const width = () => container.clientWidth || window.innerWidth
  const height = () => container.clientHeight || window.innerHeight

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(width(), height())
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#0b0e14')

  const camera = new THREE.PerspectiveCamera(50, width() / height(), 0.1, 1000)
  camera.position.set(12, 11, 14)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.target.set(0, 2, 0)

  // Lighting.
  scene.add(new THREE.AmbientLight(0xffffff, 0.55))
  const key = new THREE.DirectionalLight(0xffffff, 1.0)
  key.position.set(8, 14, 6)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0x88aaff, 0.35)
  fill.position.set(-8, 6, -6)
  scene.add(fill)

  // Ground grid for spatial context.
  const gridExtent = Math.max(ROWS, COLS) * SPACING + 2
  scene.add(new THREE.GridHelper(gridExtent, Math.max(ROWS, COLS) + 2, 0x33415a, 0x1c2533))

  // Build the 6x6 bars.
  const rand = seededRandom(SEED)
  const bars: Bar[] = []
  const group = new THREE.Group()
  const offsetX = ((COLS - 1) * SPACING) / 2
  const offsetZ = ((ROWS - 1) * SPACING) / 2

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const target = 0.5 + rand() * (MAX_HEIGHT - 0.5)
      const normalized = (target - 0.5) / (MAX_HEIGHT - 0.5)
      const baseColor = colorByHeight(normalized)

      const geometry = new THREE.BoxGeometry(BAR_SIZE, 1, BAR_SIZE)
      geometry.translate(0, 0.5, 0) // pivot at the base so scale.y grows upward
      const material = new THREE.MeshStandardMaterial({
        color: baseColor.clone(),
        roughness: 0.45,
        metalness: 0.1,
        emissive: new THREE.Color(0x000000),
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(c * SPACING - offsetX, 0, r * SPACING - offsetZ)
      mesh.scale.y = 0.0001
      group.add(mesh)
      bars.push({ mesh, target, baseColor })
    }
  }
  scene.add(group)

  // Axes helper + readable axis labels.
  scene.add(new THREE.AxesHelper(gridExtent / 2 + 1))
  const labelDist = gridExtent / 2 + 1.5
  scene.add(textLabel('X', [labelDist, 0.2, 0]))
  scene.add(textLabel('Z', [0, 0.2, labelDist]))
  scene.add(textLabel('Value', [0, MAX_HEIGHT + 1, 0]))

  // Hover highlighting via raycaster.
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let hovered: Bar | null = null

  function onPointerMove(event: PointerEvent) {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }
  renderer.domElement.addEventListener('pointermove', onPointerMove)

  function onResize() {
    camera.aspect = width() / height()
    camera.updateProjectionMatrix()
    renderer.setSize(width(), height())
  }
  window.addEventListener('resize', onResize)

  function applyHover() {
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(bars.map((b) => b.mesh), false)
    const hitMesh = hits.length > 0 ? (hits[0].object as THREE.Mesh) : null
    const next = hitMesh ? bars.find((b) => b.mesh === hitMesh) ?? null : null
    if (next === hovered) return

    if (hovered) {
      const mat = hovered.mesh.material as THREE.MeshStandardMaterial
      mat.color.copy(hovered.baseColor)
      mat.emissive.setHex(0x000000)
    }
    if (next) {
      const mat = next.mesh.material as THREE.MeshStandardMaterial
      mat.color.copy(next.baseColor).offsetHSL(0, 0, 0.18)
      mat.emissive.copy(next.baseColor).multiplyScalar(0.6)
      renderer.domElement.style.cursor = 'pointer'
    } else {
      renderer.domElement.style.cursor = 'default'
    }
    hovered = next
  }

  // Animation loop.
  const clock = new THREE.Clock()
  let elapsed = 0
  let frame = 0

  function animate() {
    frame = requestAnimationFrame(animate)
    elapsed += clock.getDelta()

    const t = Math.min(elapsed / ANIM_DURATION, 1)
    const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
    for (const bar of bars) {
      bar.mesh.scale.y = Math.max(bar.target * eased, 0.0001)
    }

    applyHover()
    controls.update()
    renderer.render(scene, camera)
  }
  animate()

  return {
    dispose() {
      cancelAnimationFrame(frame)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('resize', onResize)
      controls.dispose()
      renderer.dispose()
    },
  }
}
