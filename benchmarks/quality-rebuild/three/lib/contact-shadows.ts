/**
 * Contact shadows — port of the three.js r185 `webgl_shadow_contact` example
 * (PRD-12 §9.1). There is no `ContactShadows` addon class: an orthographic
 * camera looking up from the ground renders a MeshDepthMaterial silhouette
 * into a render target; HorizontalBlurShader/VerticalBlurShader passes blur
 * it; a plane displays the result with `opacity = darkness`.
 */
import * as THREE from "three";
import { HorizontalBlurShader } from "three/examples/jsm/shaders/HorizontalBlurShader.js";
import { VerticalBlurShader } from "three/examples/jsm/shaders/VerticalBlurShader.js";

export interface ContactShadowsOptions {
  /** Shadow camera half-extent + target resolution (512², per the example). */
  readonly size: number;
  /** Blur passes: shader `h`/`v` in texel units. */
  readonly blur: number;
  /** Plane opacity. */
  readonly darkness: number;
  /** Ground plane edge length (world units). */
  readonly planeSize?: number;
}

const TARGET_RESOLUTION = 512;

export class ContactShadows {
  readonly group = new THREE.Group();
  private readonly depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  private readonly shadowCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 3);
  private readonly target: THREE.WebGLRenderTarget;
  private readonly blurTargetA: THREE.WebGLRenderTarget;
  private readonly blurTargetB: THREE.WebGLRenderTarget;
  private readonly blurPlane: THREE.Mesh;
  private readonly hMaterial: THREE.ShaderMaterial;
  private readonly vMaterial: THREE.ShaderMaterial;
  private readonly fsScene = new THREE.Scene();
  private readonly fsCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly blur: number;
  private readonly size: number;

  constructor(opts: ContactShadowsOptions) {
    this.size = opts.size;
    this.blur = opts.blur;
    const planeSize = opts.planeSize ?? this.size * 2;
    const rtOpts: THREE.RenderTargetOptions = { type: THREE.HalfFloatType };
    this.target = new THREE.WebGLRenderTarget(TARGET_RESOLUTION, TARGET_RESOLUTION, rtOpts);
    this.blurTargetA = new THREE.WebGLRenderTarget(TARGET_RESOLUTION, TARGET_RESOLUTION, rtOpts);
    this.blurTargetB = new THREE.WebGLRenderTarget(TARGET_RESOLUTION, TARGET_RESOLUTION, rtOpts);
    this.shadowCamera.left = -this.size;
    this.shadowCamera.right = this.size;
    this.shadowCamera.top = this.size;
    this.shadowCamera.bottom = -this.size;
    // Camera looks up from below the ground: mesh undersides form the silhouette.
    this.shadowCamera.position.set(0, -0.05, 0);
    this.shadowCamera.up.set(0, 0, -1);
    this.shadowCamera.lookAt(0, 1, 0);
    this.shadowCamera.updateProjectionMatrix();

    this.hMaterial = new THREE.ShaderMaterial({ ...HorizontalBlurShader, uniforms: THREE.UniformsUtils.clone(HorizontalBlurShader.uniforms) });
    this.vMaterial = new THREE.ShaderMaterial({ ...VerticalBlurShader, uniforms: THREE.UniformsUtils.clone(VerticalBlurShader.uniforms) });
    this.blurPlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.hMaterial);
    this.fsScene.add(this.blurPlane);

    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(planeSize, planeSize),
      new THREE.MeshBasicMaterial({
        map: this.blurTargetB.texture,
        transparent: true,
        opacity: opts.darkness,
        depthWrite: false
      })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0.001;
    plane.renderOrder = 1;
    this.group.add(plane);
  }

  /** Render the silhouette depth pass, then the two blur passes, into blurTargetB. */
  update(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    const prevTarget = renderer.getRenderTarget();
    const prevOverride = scene.overrideMaterial;
    const prevBackground = scene.background;
    scene.overrideMaterial = this.depthMaterial;
    scene.background = null;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, this.shadowCamera);
    scene.overrideMaterial = prevOverride;
    scene.background = prevBackground;

    // blurTarget -> blurTarget ping-pong, `blur` iterations of H then V (example uses one pair).
    let read = this.target, write = this.blurTargetA;
    const texel = 1 / TARGET_RESOLUTION;
    for (let i = 0; i < Math.max(1, Math.round(this.blur)); i += 1) {
      this.blurPlane.material = this.hMaterial;
      this.hMaterial.uniforms.tDiffuse.value = read.texture;
      this.hMaterial.uniforms.h.value = texel * this.blur;
      renderer.setRenderTarget(write);
      renderer.clear();
      renderer.render(this.fsScene, this.fsCamera);
      [read, write] = [write, read === this.blurTargetA ? this.blurTargetB : this.blurTargetA];

      this.blurPlane.material = this.vMaterial;
      this.vMaterial.uniforms.tDiffuse.value = read.texture;
      this.vMaterial.uniforms.v.value = texel * this.blur;
      renderer.setRenderTarget(this.blurTargetB);
      renderer.clear();
      renderer.render(this.fsScene, this.fsCamera);
      read = this.blurTargetB;
    }
    renderer.setRenderTarget(prevTarget);
  }
}
