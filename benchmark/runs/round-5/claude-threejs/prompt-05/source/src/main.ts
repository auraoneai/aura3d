import './style.css'
import { createScene } from './scene'

// Round 5 claude-threejs benchmark — prompt-05: 3D data visualization.
const app = document.getElementById('app')!
createScene(app)
