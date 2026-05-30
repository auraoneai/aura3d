import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

// The only permitted asset. It is the provided benchmark/assets/sneaker.glb,
// served from this app's public/ folder at the same relative path.
const SNEAKER_URL = '/benchmark/assets/sneaker.glb'

// Largest bounding-box dimension the model is auto-scaled to (world units).
const TARGET_SIZE = 2.4
const PLINTH_HEIGHT = 0.45
const PLINTH_RADIUS = 1.7

// ---------------------------------------------------------------------------
// Mount point + page chrome
// ---------------------------------------------------------------------------
const mount = (document.getElementById('app') as HTMLElement | null) ?? document.body
document.documentElement.style.height = '100%'
document.body.style.margin = '0'
document.body.style.height = '100%'
document.body.style.overflow = 'hidden'
document.body.style.background = '#0c0d10'
document.body.style.fontFamily =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.domElement.style.display = 'block'
mount.appendChild(renderer.domElement)

// ---------------------------------------------------------------------------
// Scene + studio environment (IBL)
// ---------------------------------------------------------------------------
const scene = new THREE.Scene()
scene.background = new THREE.Color('#15171c')

const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
const camera = new THREE.PerspectiveCamera(
  40,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
)
const CAMERA_START = new THREE.Vector3(3.2, 2.0, 4.6)
camera.position.copy(CAMERA_START)

// ---------------------------------------------------------------------------
// Orbit controls
// ---------------------------------------------------------------------------
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.06
controls.minDistance = 2
controls.maxDistance = 14
controls.maxPolarAngle = Math.PI * 0.495 // stay above the plinth
controls.target.set(0, 0.9, 0)

// ---------------------------------------------------------------------------
// Studio lighting (key / fill / rim) + soft shadow
// ---------------------------------------------------------------------------
const keyLight = new THREE.DirectionalLight(0xffffff, 2.6)
keyLight.position.set(4, 7, 5)
keyLight.castShadow = true
keyLight.shadow.mapSize.set(2048, 2048)
keyLight.shadow.camera.near = 1
keyLight.shadow.camera.far = 30
keyLight.shadow.camera.left = -6
keyLight.shadow.camera.right = 6
keyLight.shadow.camera.top = 6
keyLight.shadow.camera.bottom = -6
keyLight.shadow.bias = -0.0004
keyLight.shadow.radius = 6
scene.add(keyLight)

const fillLight = new THREE.DirectionalLight(0xbfd2ff, 0.8)
fillLight.position.set(-6, 3, 2)
scene.add(fillLight)

const rimLight = new THREE.DirectionalLight(0xffffff, 1.4)
rimLight.position.set(-3, 5, -6)
scene.add(rimLight)

scene.add(new THREE.AmbientLight(0xffffff, 0.25))

const softbox = new THREE.PointLight(0xffffff, 12, 20, 2)
softbox.position.set(0, 6, 0)
scene.add(softbox)

// ---------------------------------------------------------------------------
// Turntable + plinth (product base)
// ---------------------------------------------------------------------------
const turntable = new THREE.Group()
scene.add(turntable)

const plinth = new THREE.Mesh(
  new THREE.CylinderGeometry(PLINTH_RADIUS, PLINTH_RADIUS * 1.04, PLINTH_HEIGHT, 64),
  new THREE.MeshStandardMaterial({ color: 0x2a2d34, roughness: 0.55, metalness: 0.1 }),
)
plinth.position.y = PLINTH_HEIGHT / 2
plinth.castShadow = true
plinth.receiveShadow = true
turntable.add(plinth)

const plinthTop = new THREE.Mesh(
  new THREE.CylinderGeometry(PLINTH_RADIUS * 0.97, PLINTH_RADIUS * 0.97, 0.04, 64),
  new THREE.MeshStandardMaterial({ color: 0x40444d, roughness: 0.4, metalness: 0.2 }),
)
plinthTop.position.y = PLINTH_HEIGHT + 0.01
plinthTop.receiveShadow = true
turntable.add(plinthTop)

// Studio floor that catches the contact shadow
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(40, 64),
  new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 1.0, metalness: 0 }),
)
floor.rotation.x = -Math.PI / 2
floor.receiveShadow = true
scene.add(floor)

// Holds the centered + auto-scaled model, seated on the plinth.
const productPivot = new THREE.Group()
turntable.add(productPivot)

// ---------------------------------------------------------------------------
// Loading overlay
// ---------------------------------------------------------------------------
const overlay = document.createElement('div')
overlay.style.cssText =
  'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
  'color:#c9ccd2;background:#0c0d10;z-index:10;font-size:14px;letter-spacing:.04em;' +
  'transition:opacity .6s ease'
overlay.textContent = 'Loading sneaker…'
document.body.appendChild(overlay)

// ---------------------------------------------------------------------------
// On-screen controls (turntable toggle + reset view)
// ---------------------------------------------------------------------------
let turntableOn = true

const bar = document.createElement('div')
bar.style.cssText =
  'position:fixed;left:0;right:0;bottom:0;display:flex;justify-content:space-between;' +
  'align-items:center;gap:16px;padding:18px 22px;pointer-events:none;' +
  'background:linear-gradient(to top,rgba(0,0,0,.45),rgba(0,0,0,0))'

const label = document.createElement('div')
label.style.cssText = 'color:#f2f3f5;text-shadow:0 1px 3px rgba(0,0,0,.6)'
label.innerHTML =
  '<div style="font-size:15px;font-weight:600">Sneaker</div>' +
  '<div style="margin-top:2px;font-size:12px;color:#a7acb5">Drag to orbit · scroll to zoom</div>'

const btns = document.createElement('div')
btns.style.cssText = 'display:flex;gap:10px;pointer-events:auto'

function makeButton(text: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.textContent = text
  b.style.cssText =
    'border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#e9eaed;' +
    'font:inherit;font-size:13px;font-weight:500;padding:9px 16px;border-radius:999px;' +
    'cursor:pointer;backdrop-filter:blur(8px)'
  return b
}

const toggleBtn = makeButton('Pause turntable')
toggleBtn.addEventListener('click', () => {
  turntableOn = !turntableOn
  toggleBtn.textContent = turntableOn ? 'Pause turntable' : 'Play turntable'
})

const resetBtn = makeButton('Reset view')
resetBtn.addEventListener('click', () => {
  camera.position.copy(CAMERA_START)
  controls.update()
})

btns.appendChild(toggleBtn)
btns.appendChild(resetBtn)
bar.appendChild(label)
bar.appendChild(btns)
document.body.appendChild(bar)

// ---------------------------------------------------------------------------
// Load + frame the sneaker
// ---------------------------------------------------------------------------
const loader = new GLTFLoader()
loader.load(
  SNEAKER_URL,
  (gltf: GLTF) => {
    const model = gltf.scene

    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = true
        const mat = mesh.material as THREE.MeshStandardMaterial | undefined
        if (mat && 'envMapIntensity' in mat) mat.envMapIntensity = 1.0
      }
    })

    // Auto-center: move the model so its bounding-box center sits at the origin.
    const box = new THREE.Box3().setFromObject(model)
    const center = box.getCenter(new THREE.Vector3())
    model.position.sub(center)

    // Auto-scale: fit the largest dimension to TARGET_SIZE.
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    model.scale.setScalar(TARGET_SIZE / maxDim)

    productPivot.add(model)

    // Seat the scaled model on top of the plinth.
    const seated = new THREE.Box3().setFromObject(productPivot)
    productPivot.position.y = PLINTH_HEIGHT + 0.04 - seated.min.y

    // Aim the controls at the product's vertical middle.
    const framed = new THREE.Box3().setFromObject(productPivot)
    const framedCenter = framed.getCenter(new THREE.Vector3())
    controls.target.set(0, framedCenter.y, 0)
    controls.update()

    overlay.style.opacity = '0'
    setTimeout(() => overlay.remove(), 700)
  },
  (evt: ProgressEvent) => {
    if (evt.lengthComputable && evt.total > 0) {
      overlay.textContent = `Loading sneaker… ${Math.round((evt.loaded / evt.total) * 100)}%`
    }
  },
  (err: unknown) => {
    console.error('Failed to load sneaker.glb', err)
    overlay.textContent = 'Failed to load model'
  },
)

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

// ---------------------------------------------------------------------------
// Render loop (rotating turntable)
// ---------------------------------------------------------------------------
const TURN_SPEED = 0.35 // radians / second
const clock = new THREE.Clock()

function animate(): void {
  requestAnimationFrame(animate)
  const dt = clock.getDelta()
  if (turntableOn) turntable.rotation.y += TURN_SPEED * dt
  controls.update()
  renderer.render(scene, camera)
}
animate()
