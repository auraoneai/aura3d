import { $ as e, At as t, B as n, Ct as r, E as i, Et as a, F as o, Ft as s, J as c, K as l, Mt as u, N as d, Nt as f, O as p, Ot as m, P as h, Pt as g, R as _, St as v, U as y, V as b, W as x, X as S, Z as C, _ as w, _t as T, at as E, b as D, bt as O, ct as k, dt as A, et as j, h as M, it as N, jt as P, lt as F, m as I, mt as ee, nt as te, p as L, pt as ne, rt as R, st as z, tt as B, ut as V, vt as re, w as ie } from "./world-BJq13QzJ.js";
(function() {
  let e4 = document.createElement(`link`).relList;
  if (e4 && e4.supports && e4.supports(`modulepreload`)) return;
  for (let e5 of document.querySelectorAll(`link[rel="modulepreload"]`)) n2(e5);
  new MutationObserver((e5) => {
    for (let t3 of e5) if (t3.type === `childList`) for (let e6 of t3.addedNodes) e6.tagName === `LINK` && e6.rel === `modulepreload` && n2(e6);
  }).observe(document, { childList: true, subtree: true });
  function t2(e5) {
    let t3 = {};
    return e5.integrity && (t3.integrity = e5.integrity), e5.referrerPolicy && (t3.referrerPolicy = e5.referrerPolicy), e5.crossOrigin === `use-credentials` ? t3.credentials = `include` : e5.crossOrigin === `anonymous` ? t3.credentials = `omit` : t3.credentials = `same-origin`, t3;
  }
  function n2(e5) {
    if (e5.ep) return;
    e5.ep = true;
    let n3 = t2(e5);
    fetch(e5.href, n3);
  }
})();
var H = { name: `CopyShader`, uniforms: { tDiffuse: { value: null }, opacity: { value: 1 } }, vertexShader: `

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`, fragmentShader: `

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;


		}` }, ae = { name: `LuminosityHighPassShader`, uniforms: { tDiffuse: { value: null }, luminosityThreshold: { value: 1 }, smoothWidth: { value: 1 }, defaultColor: { value: new _(0) }, defaultOpacity: { value: 0 } }, vertexShader: `

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`, fragmentShader: `

		uniform sampler2D tDiffuse;
		uniform vec3 defaultColor;
		uniform float defaultOpacity;
		uniform float luminosityThreshold;
		uniform float smoothWidth;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );

			float v = luminance( texel.xyz );

			vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );

			float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );

			gl_FragColor = mix( outputColor, texel, alpha );

		}` }, oe = class e2 extends M {
  constructor(e4, n2 = 1, r2, i2) {
    super(), this.strength = n2, this.radius = r2, this.threshold = i2, this.resolution = e4 === void 0 ? new f(256, 256) : new f(e4.x, e4.y), this.clearColor = new _(0, 0, 0), this.needsSwap = false, this.renderTargetsHorizontal = [], this.renderTargetsVertical = [], this.nMips = 5;
    let o2 = Math.round(this.resolution.x / 2), c2 = Math.round(this.resolution.y / 2);
    this.renderTargetBright = new s(o2, c2, { type: C }), this.renderTargetBright.texture.name = `UnrealBloomPass.bright`, this.renderTargetBright.texture.generateMipmaps = false;
    for (let e5 = 0; e5 < this.nMips; e5++) {
      let t2 = new s(o2, c2, { type: C });
      t2.texture.name = `UnrealBloomPass.h` + e5, t2.texture.generateMipmaps = false, this.renderTargetsHorizontal.push(t2);
      let n3 = new s(o2, c2, { type: C });
      n3.texture.name = `UnrealBloomPass.v` + e5, n3.texture.generateMipmaps = false, this.renderTargetsVertical.push(n3), o2 = Math.round(o2 / 2), c2 = Math.round(c2 / 2);
    }
    let l2 = ae;
    this.highPassUniforms = t.clone(l2.uniforms), this.highPassUniforms.luminosityThreshold.value = i2, this.highPassUniforms.smoothWidth.value = 0.01, this.materialHighPassFilter = new a({ uniforms: this.highPassUniforms, vertexShader: l2.vertexShader, fragmentShader: l2.fragmentShader }), this.separableBlurMaterials = [];
    let u2 = [6, 10, 14, 18, 22];
    o2 = Math.round(this.resolution.x / 2), c2 = Math.round(this.resolution.y / 2);
    for (let e5 = 0; e5 < this.nMips; e5++) this.separableBlurMaterials.push(this._getSeparableBlurMaterial(u2[e5])), this.separableBlurMaterials[e5].uniforms.invSize.value = new f(1 / o2, 1 / c2), o2 = Math.round(o2 / 2), c2 = Math.round(c2 / 2);
    this.compositeMaterial = this._getCompositeMaterial(this.nMips), this.compositeMaterial.uniforms.blurTexture1.value = this.renderTargetsVertical[0].texture, this.compositeMaterial.uniforms.blurTexture2.value = this.renderTargetsVertical[1].texture, this.compositeMaterial.uniforms.blurTexture3.value = this.renderTargetsVertical[2].texture, this.compositeMaterial.uniforms.blurTexture4.value = this.renderTargetsVertical[3].texture, this.compositeMaterial.uniforms.blurTexture5.value = this.renderTargetsVertical[4].texture, this.compositeMaterial.uniforms.bloomStrength.value = n2, this.compositeMaterial.uniforms.bloomRadius.value = 0.1;
    let d2 = [1, 0.8, 0.6, 0.4, 0.2];
    this.compositeMaterial.uniforms.bloomFactors.value = d2, this.bloomTintColors = [new g(1, 1, 1), new g(1, 1, 1), new g(1, 1, 1), new g(1, 1, 1), new g(1, 1, 1)], this.compositeMaterial.uniforms.bloomTintColors.value = this.bloomTintColors, this.copyUniforms = t.clone(H.uniforms), this.blendMaterial = new a({ uniforms: this.copyUniforms, vertexShader: H.vertexShader, fragmentShader: H.fragmentShader, premultipliedAlpha: true, blending: 2, depthTest: false, depthWrite: false, transparent: true }), this._oldClearColor = new _(), this._oldClearAlpha = 1, this._basic = new V(), this._fsQuad = new I(null);
  }
  dispose() {
    for (let e4 = 0; e4 < this.renderTargetsHorizontal.length; e4++) this.renderTargetsHorizontal[e4].dispose();
    for (let e4 = 0; e4 < this.renderTargetsVertical.length; e4++) this.renderTargetsVertical[e4].dispose();
    this.renderTargetBright.dispose();
    for (let e4 = 0; e4 < this.separableBlurMaterials.length; e4++) this.separableBlurMaterials[e4].dispose();
    this.compositeMaterial.dispose(), this.blendMaterial.dispose(), this._basic.dispose(), this._fsQuad.dispose();
  }
  setSize(e4, t2) {
    let n2 = Math.round(e4 / 2), r2 = Math.round(t2 / 2);
    this.renderTargetBright.setSize(n2, r2);
    for (let e5 = 0; e5 < this.nMips; e5++) this.renderTargetsHorizontal[e5].setSize(n2, r2), this.renderTargetsVertical[e5].setSize(n2, r2), this.separableBlurMaterials[e5].uniforms.invSize.value = new f(1 / n2, 1 / r2), n2 = Math.round(n2 / 2), r2 = Math.round(r2 / 2);
  }
  render(t2, n2, r2, i2, a2) {
    t2.getClearColor(this._oldClearColor), this._oldClearAlpha = t2.getClearAlpha();
    let o2 = t2.autoClear;
    t2.autoClear = false, t2.setClearColor(this.clearColor, 0), a2 && t2.state.buffers.stencil.setTest(false), this.renderToScreen && (this._fsQuad.material = this._basic, this._basic.map = r2.texture, t2.setRenderTarget(null), t2.clear(), this._fsQuad.render(t2)), this.highPassUniforms.tDiffuse.value = r2.texture, this.highPassUniforms.luminosityThreshold.value = this.threshold, this._fsQuad.material = this.materialHighPassFilter, t2.setRenderTarget(this.renderTargetBright), t2.clear(), this._fsQuad.render(t2);
    let s2 = this.renderTargetBright;
    for (let n3 = 0; n3 < this.nMips; n3++) this._fsQuad.material = this.separableBlurMaterials[n3], this.separableBlurMaterials[n3].uniforms.colorTexture.value = s2.texture, this.separableBlurMaterials[n3].uniforms.direction.value = e2.BlurDirectionX, t2.setRenderTarget(this.renderTargetsHorizontal[n3]), t2.clear(), this._fsQuad.render(t2), this.separableBlurMaterials[n3].uniforms.colorTexture.value = this.renderTargetsHorizontal[n3].texture, this.separableBlurMaterials[n3].uniforms.direction.value = e2.BlurDirectionY, t2.setRenderTarget(this.renderTargetsVertical[n3]), t2.clear(), this._fsQuad.render(t2), s2 = this.renderTargetsVertical[n3];
    this._fsQuad.material = this.compositeMaterial, this.compositeMaterial.uniforms.bloomStrength.value = this.strength, this.compositeMaterial.uniforms.bloomRadius.value = this.radius, this.compositeMaterial.uniforms.bloomTintColors.value = this.bloomTintColors, t2.setRenderTarget(this.renderTargetsHorizontal[0]), t2.clear(), this._fsQuad.render(t2), this._fsQuad.material = this.blendMaterial, this.copyUniforms.tDiffuse.value = this.renderTargetsHorizontal[0].texture, a2 && t2.state.buffers.stencil.setTest(true), this.renderToScreen ? (t2.setRenderTarget(null), this._fsQuad.render(t2)) : (t2.setRenderTarget(r2), this._fsQuad.render(t2)), t2.setClearColor(this._oldClearColor, this._oldClearAlpha), t2.autoClear = o2;
  }
  _getSeparableBlurMaterial(e4) {
    let t2 = [], n2 = e4 / 3;
    for (let r2 = 0; r2 < e4; r2++) t2.push(0.39894 * Math.exp(-0.5 * r2 * r2 / (n2 * n2)) / n2);
    return new a({ defines: { KERNEL_RADIUS: e4 }, uniforms: { colorTexture: { value: null }, invSize: { value: new f(0.5, 0.5) }, direction: { value: new f(0.5, 0.5) }, gaussianCoefficients: { value: t2 } }, vertexShader: `

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`, fragmentShader: `

				#include <common>

				varying vec2 vUv;

				uniform sampler2D colorTexture;
				uniform vec2 invSize;
				uniform vec2 direction;
				uniform float gaussianCoefficients[KERNEL_RADIUS];

				void main() {

					float weightSum = gaussianCoefficients[0];
					vec3 diffuseSum = texture2D( colorTexture, vUv ).rgb * weightSum;

					for ( int i = 1; i < KERNEL_RADIUS; i ++ ) {

						float x = float( i );
						float w = gaussianCoefficients[i];
						vec2 uvOffset = direction * invSize * x;
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset ).rgb;
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset ).rgb;
						diffuseSum += ( sample1 + sample2 ) * w;

					}

					gl_FragColor = vec4( diffuseSum, 1.0 );

				}` });
  }
  _getCompositeMaterial(e4) {
    return new a({ defines: { NUM_MIPS: e4 }, uniforms: { blurTexture1: { value: null }, blurTexture2: { value: null }, blurTexture3: { value: null }, blurTexture4: { value: null }, blurTexture5: { value: null }, bloomStrength: { value: 1 }, bloomFactors: { value: null }, bloomTintColors: { value: null }, bloomRadius: { value: 0 } }, vertexShader: `

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`, fragmentShader: `

				varying vec2 vUv;

				uniform sampler2D blurTexture1;
				uniform sampler2D blurTexture2;
				uniform sampler2D blurTexture3;
				uniform sampler2D blurTexture4;
				uniform sampler2D blurTexture5;
				uniform float bloomStrength;
				uniform float bloomRadius;
				uniform float bloomFactors[NUM_MIPS];
				uniform vec3 bloomTintColors[NUM_MIPS];

				float lerpBloomFactor( const in float factor ) {

					float mirrorFactor = 1.2 - factor;
					return mix( factor, mirrorFactor, bloomRadius );

				}

				void main() {

					// 3.0 for backwards compatibility with previous alpha-based intensity
					vec3 bloom = 3.0 * bloomStrength * (
						lerpBloomFactor( bloomFactors[ 0 ] ) * bloomTintColors[ 0 ] * texture2D( blurTexture1, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 1 ] ) * bloomTintColors[ 1 ] * texture2D( blurTexture2, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 2 ] ) * bloomTintColors[ 2 ] * texture2D( blurTexture3, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 3 ] ) * bloomTintColors[ 3 ] * texture2D( blurTexture4, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 4 ] ) * bloomTintColors[ 4 ] * texture2D( blurTexture5, vUv ).rgb
					);

					float bloomAlpha = max( bloom.r, max( bloom.g, bloom.b ) );
					gl_FragColor = vec4( bloom, bloomAlpha );

				}` });
  }
};
oe.BlurDirectionX = new f(1, 0), oe.BlurDirectionY = new f(0, 1);
var se = class extends M {
  constructor(e4, n2 = `tDiffuse`) {
    super(), this.textureID = n2, this.uniforms = null, this.material = null, e4 instanceof a ? (this.uniforms = e4.uniforms, this.material = e4) : e4 && (this.uniforms = t.clone(e4.uniforms), this.material = new a({ name: e4.name === void 0 ? `unspecified` : e4.name, defines: Object.assign({}, e4.defines), uniforms: this.uniforms, vertexShader: e4.vertexShader, fragmentShader: e4.fragmentShader })), this._fsQuad = new I(this.material);
  }
  render(e4, t2, n2) {
    this.uniforms[this.textureID] && (this.uniforms[this.textureID].value = n2.texture), this._fsQuad.material = this.material, this.renderToScreen ? (e4.setRenderTarget(null), this._fsQuad.render(e4)) : (e4.setRenderTarget(t2), this.clear && e4.clear(e4.autoClearColor, e4.autoClearDepth, e4.autoClearStencil), this._fsQuad.render(e4));
  }
  dispose() {
    this.material.dispose(), this._fsQuad.dispose();
  }
}, U = { name: `GTAOShader`, defines: { PERSPECTIVE_CAMERA: 1, SAMPLES: 16, NORMAL_VECTOR_TYPE: 1, DEPTH_SWIZZLING: `x`, SCREEN_SPACE_RADIUS: 0, SCREEN_SPACE_RADIUS_SCALE: 100, SCENE_CLIP_BOX: 0 }, uniforms: { tNormal: { value: null }, tDepth: { value: null }, tNoise: { value: null }, resolution: { value: new f() }, cameraNear: { value: null }, cameraFar: { value: null }, cameraProjectionMatrix: { value: new k() }, cameraProjectionMatrixInverse: { value: new k() }, cameraWorldMatrix: { value: new k() }, radius: { value: 0.25 }, distanceExponent: { value: 1 }, thickness: { value: 1 }, distanceFallOff: { value: 1 }, scale: { value: 1 }, sceneBoxMin: { value: new g(-1, -1, -1) }, sceneBoxMax: { value: new g(1, 1, 1) } }, vertexShader: `

		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`, fragmentShader: `
		varying vec2 vUv;
		uniform highp sampler2D tNormal;
		uniform highp sampler2D tDepth;
		uniform sampler2D tNoise;
		uniform vec2 resolution;
		uniform float cameraNear;
		uniform float cameraFar;
		uniform mat4 cameraProjectionMatrix;
		uniform mat4 cameraProjectionMatrixInverse;
		uniform mat4 cameraWorldMatrix;
		uniform float radius;
		uniform float distanceExponent;
		uniform float thickness;
		uniform float distanceFallOff;
		uniform float scale;
		#if SCENE_CLIP_BOX == 1
			uniform vec3 sceneBoxMin;
			uniform vec3 sceneBoxMax;
		#endif

		#include <common>
		#include <packing>

		#ifndef FRAGMENT_OUTPUT
		#define FRAGMENT_OUTPUT vec4(vec3(ao), 1.)
		#endif

		vec3 getViewPosition( const in vec2 screenPosition, const in float depth ) {
			#ifdef USE_REVERSED_DEPTH_BUFFER
				vec4 clipSpacePosition = vec4( vec2( screenPosition ) * 2.0 - 1.0, depth, 1.0 );
			#else
				vec4 clipSpacePosition = vec4( vec3( screenPosition, depth ) * 2.0 - 1.0, 1.0 );
			#endif
			vec4 viewSpacePosition = cameraProjectionMatrixInverse * clipSpacePosition;
			return viewSpacePosition.xyz / viewSpacePosition.w;
		}

		float getDepth(const vec2 uv) {
			return textureLod(tDepth, uv.xy, 0.0).DEPTH_SWIZZLING;
		}

		float fetchDepth(const ivec2 uv) {
			return texelFetch(tDepth, uv.xy, 0).DEPTH_SWIZZLING;
		}

		float getViewZ(const in float depth) {
			#if PERSPECTIVE_CAMERA == 1
				return perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
			#else
				return orthographicDepthToViewZ(depth, cameraNear, cameraFar);
			#endif
		}

		vec3 computeNormalFromDepth(const vec2 uv) {
			vec2 size = vec2(textureSize(tDepth, 0));
			ivec2 p = ivec2(uv * size);
			float c0 = fetchDepth(p);
			float l2 = fetchDepth(p - ivec2(2, 0));
			float l1 = fetchDepth(p - ivec2(1, 0));
			float r1 = fetchDepth(p + ivec2(1, 0));
			float r2 = fetchDepth(p + ivec2(2, 0));
			float b2 = fetchDepth(p - ivec2(0, 2));
			float b1 = fetchDepth(p - ivec2(0, 1));
			float t1 = fetchDepth(p + ivec2(0, 1));
			float t2 = fetchDepth(p + ivec2(0, 2));
			float dl = abs((2.0 * l1 - l2) - c0);
			float dr = abs((2.0 * r1 - r2) - c0);
			float db = abs((2.0 * b1 - b2) - c0);
			float dt = abs((2.0 * t1 - t2) - c0);
			vec3 ce = getViewPosition(uv, c0).xyz;
			vec3 dpdx = (dl < dr) ? ce - getViewPosition((uv - vec2(1.0 / size.x, 0.0)), l1).xyz : -ce + getViewPosition((uv + vec2(1.0 / size.x, 0.0)), r1).xyz;
			vec3 dpdy = (db < dt) ? ce - getViewPosition((uv - vec2(0.0, 1.0 / size.y)), b1).xyz : -ce + getViewPosition((uv + vec2(0.0, 1.0 / size.y)), t1).xyz;
			return normalize(cross(dpdx, dpdy));
		}

		vec3 getViewNormal(const vec2 uv) {
			#if NORMAL_VECTOR_TYPE == 2
				return normalize(textureLod(tNormal, uv, 0.).rgb);
			#elif NORMAL_VECTOR_TYPE == 1
				return unpackRGBToNormal(textureLod(tNormal, uv, 0.).rgb);
			#else
				return computeNormalFromDepth(uv);
			#endif
		}

		vec3 getSceneUvAndDepth(vec3 sampleViewPos) {
			vec4 sampleClipPos = cameraProjectionMatrix * vec4(sampleViewPos, 1.);
			vec2 sampleUv = sampleClipPos.xy / sampleClipPos.w * 0.5 + 0.5;
			float sampleSceneDepth = getDepth(sampleUv);
			return vec3(sampleUv, sampleSceneDepth);
		}

		void main() {
			float depth = getDepth(vUv.xy);

			#ifdef USE_REVERSED_DEPTH_BUFFER
				if (depth <= 0.0) {
					discard;
					return;
				}
			#else
				if (depth >= 1.0) {
					discard;
					return;
				}
			#endif
			
			vec3 viewPos = getViewPosition(vUv, depth);
			vec3 viewNormal = getViewNormal(vUv);

			float radiusToUse = radius;
			float distanceFalloffToUse = thickness;
			#if SCREEN_SPACE_RADIUS == 1
				float radiusScale = getViewPosition(vec2(0.5 + float(SCREEN_SPACE_RADIUS_SCALE) / resolution.x, 0.0), depth).x;
				radiusToUse *= radiusScale;
				distanceFalloffToUse *= radiusScale;
			#endif

			#if SCENE_CLIP_BOX == 1
				vec3 worldPos = (cameraWorldMatrix * vec4(viewPos, 1.0)).xyz;
				float boxDistance = length(max(vec3(0.0), max(sceneBoxMin - worldPos, worldPos - sceneBoxMax)));
				if (boxDistance > radiusToUse) {
					discard;
					return;
				}
			#endif

			vec2 noiseResolution = vec2(textureSize(tNoise, 0));
			vec2 noiseUv = vUv * resolution / noiseResolution;
			vec4 noiseTexel = textureLod(tNoise, noiseUv, 0.0);
			vec3 randomVec = noiseTexel.xyz * 2.0 - 1.0;
			vec3 tangent = normalize(vec3(randomVec.xy, 0.));
			vec3 bitangent = vec3(-tangent.y, tangent.x, 0.);
			mat3 kernelMatrix = mat3(tangent, bitangent, vec3(0., 0., 1.));

			const int DIRECTIONS = SAMPLES < 30 ? 3 : 5;
			const int STEPS = (SAMPLES + DIRECTIONS - 1) / DIRECTIONS;
			float ao = 0.0;
			for (int i = 0; i < DIRECTIONS; ++i) {

				float angle = float(i) / float(DIRECTIONS) * PI;
				vec4 sampleDir = vec4(cos(angle), sin(angle), 0., 0.5 + 0.5 * noiseTexel.w);
				sampleDir.xyz = normalize(kernelMatrix * sampleDir.xyz);

				vec3 viewDir = normalize(-viewPos.xyz);
				vec3 sliceBitangent = normalize(cross(sampleDir.xyz, viewDir));
				vec3 sliceTangent = cross(sliceBitangent, viewDir);
				vec3 normalInSlice = normalize(viewNormal - sliceBitangent * dot(viewNormal, sliceBitangent));

				vec3 tangentToNormalInSlice = cross(normalInSlice, sliceBitangent);
				vec2 cosHorizons = vec2(dot(viewDir, tangentToNormalInSlice), dot(viewDir, -tangentToNormalInSlice));

				for (int j = 0; j < STEPS; ++j) {
					vec3 sampleViewOffset = sampleDir.xyz * radiusToUse * sampleDir.w * pow(float(j + 1) / float(STEPS), distanceExponent);

					vec3 sampleSceneUvDepth = getSceneUvAndDepth(viewPos + sampleViewOffset);
					vec3 sampleSceneViewPos = getViewPosition(sampleSceneUvDepth.xy, sampleSceneUvDepth.z);
					vec3 viewDelta = sampleSceneViewPos - viewPos;
					if (abs(viewDelta.z) < thickness) {
						float sampleCosHorizon = dot(viewDir, normalize(viewDelta));
						cosHorizons.x += max(0., (sampleCosHorizon - cosHorizons.x) * mix(1., 2. / float(j + 2), distanceFallOff));
					}

					sampleSceneUvDepth = getSceneUvAndDepth(viewPos - sampleViewOffset);
					sampleSceneViewPos = getViewPosition(sampleSceneUvDepth.xy, sampleSceneUvDepth.z);
					viewDelta = sampleSceneViewPos - viewPos;
					if (abs(viewDelta.z) < thickness) {
						float sampleCosHorizon = dot(viewDir, normalize(viewDelta));
						cosHorizons.y += max(0., (sampleCosHorizon - cosHorizons.y) * mix(1., 2. / float(j + 2), distanceFallOff));
					}
				}

				vec2 sinHorizons = sqrt(1. - cosHorizons * cosHorizons);
				float nx = dot(normalInSlice, sliceTangent);
				float ny = dot(normalInSlice, viewDir);
				float nxb = 1. / 2. * (acos(cosHorizons.y) - acos(cosHorizons.x) + sinHorizons.x * cosHorizons.x - sinHorizons.y * cosHorizons.y);
				float nyb = 1. / 2. * (2. - cosHorizons.x * cosHorizons.x - cosHorizons.y * cosHorizons.y);
				float occlusion = nx * nxb + ny * nyb;
				ao += occlusion;
			}

			ao = clamp(ao / float(DIRECTIONS), 0., 1.);
		#if SCENE_CLIP_BOX == 1
			ao = mix(ao, 1., smoothstep(0., radiusToUse, boxDistance));
		#endif
			ao = pow(ao, scale);

			gl_FragColor = FRAGMENT_OUTPUT;
		}` }, ce = { name: `GTAODepthShader`, defines: { PERSPECTIVE_CAMERA: 1 }, uniforms: { tDepth: { value: null }, cameraNear: { value: null }, cameraFar: { value: null } }, vertexShader: `
		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`, fragmentShader: `
		uniform sampler2D tDepth;
		uniform float cameraNear;
		uniform float cameraFar;
		varying vec2 vUv;

		#include <packing>

		float getLinearDepth( const in vec2 screenPosition ) {
			#if PERSPECTIVE_CAMERA == 1
				float fragCoordZ = texture2D( tDepth, screenPosition ).x;
				float viewZ = perspectiveDepthToViewZ( fragCoordZ, cameraNear, cameraFar );
				return viewZToOrthographicDepth( viewZ, cameraNear, cameraFar );
			#else
				return texture2D( tDepth, screenPosition ).x;
			#endif
		}

		void main() {
			float depth = getLinearDepth( vUv );
			gl_FragColor = vec4( vec3( 1.0 - depth ), 1.0 );

		}` }, le = { name: `GTAOBlendShader`, uniforms: { tDiffuse: { value: null }, intensity: { value: 1 } }, vertexShader: `
		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`, fragmentShader: `
		uniform float intensity;
		uniform sampler2D tDiffuse;
		varying vec2 vUv;

		void main() {
			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = vec4(mix(vec3(1.), texel.rgb, intensity), texel.a);
		}` };
function ue(e4 = 5) {
  let t2 = Math.floor(e4) % 2 == 0 ? Math.floor(e4) + 1 : Math.floor(e4), r2 = de(t2), i2 = r2.length, a2 = new Uint8Array(i2 * 4);
  for (let e5 = 0; e5 < i2; ++e5) {
    let t3 = r2[e5], n2 = 2 * Math.PI * t3 / i2, o3 = new g(Math.cos(n2), Math.sin(n2), 0).normalize();
    a2[e5 * 4] = (o3.x * 0.5 + 0.5) * 255, a2[e5 * 4 + 1] = (o3.y * 0.5 + 0.5) * 255, a2[e5 * 4 + 2] = 127, a2[e5 * 4 + 3] = 255;
  }
  let o2 = new n(a2, t2, t2);
  return o2.wrapS = v, o2.wrapT = v, o2.needsUpdate = true, o2;
}
function de(e4) {
  let t2 = Math.floor(e4) % 2 == 0 ? Math.floor(e4) + 1 : Math.floor(e4), n2 = t2 * t2, r2 = Array(n2).fill(0), i2 = Math.floor(t2 / 2), a2 = t2 - 1;
  for (let e5 = 1; e5 <= n2; ) {
    if (i2 === -1 && a2 === t2 ? (a2 = t2 - 2, i2 = 0) : (a2 === t2 && (a2 = 0), i2 < 0 && (i2 = t2 - 1)), r2[i2 * t2 + a2] !== 0) {
      a2 -= 2, i2++;
      continue;
    } else r2[i2 * t2 + a2] = e5++;
    a2++, i2--;
  }
  return r2;
}
var fe = { name: `PoissonDenoiseShader`, defines: { SAMPLES: 16, SAMPLE_VECTORS: pe(16, 2, 1), NORMAL_VECTOR_TYPE: 1, DEPTH_VALUE_SOURCE: 0 }, uniforms: { tDiffuse: { value: null }, tNormal: { value: null }, tDepth: { value: null }, tNoise: { value: null }, resolution: { value: new f() }, cameraProjectionMatrixInverse: { value: new k() }, lumaPhi: { value: 5 }, depthPhi: { value: 5 }, normalPhi: { value: 5 }, radius: { value: 4 }, index: { value: 0 } }, vertexShader: `

		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`, fragmentShader: `

		varying vec2 vUv;

		uniform sampler2D tDiffuse;
		uniform sampler2D tNormal;
		uniform sampler2D tDepth;
		uniform sampler2D tNoise;
		uniform vec2 resolution;
		uniform mat4 cameraProjectionMatrixInverse;
		uniform float lumaPhi;
		uniform float depthPhi;
		uniform float normalPhi;
		uniform float radius;
		uniform int index;

		#include <common>
		#include <packing>

		#ifndef SAMPLE_LUMINANCE
		#define SAMPLE_LUMINANCE dot(vec3(0.2125, 0.7154, 0.0721), a)
		#endif

		#ifndef FRAGMENT_OUTPUT
		#define FRAGMENT_OUTPUT vec4(denoised, 1.)
		#endif

		float getLuminance(const in vec3 a) {
			return SAMPLE_LUMINANCE;
		}

		const vec3 poissonDisk[SAMPLES] = SAMPLE_VECTORS;

		vec3 getViewPosition( const in vec2 screenPosition, const in float depth ) {
			#ifdef USE_REVERSED_DEPTH_BUFFER
				vec4 clipSpacePosition = vec4( vec2( screenPosition ) * 2.0 - 1.0, depth, 1.0 );
			#else
				vec4 clipSpacePosition = vec4( vec3( screenPosition, depth ) * 2.0 - 1.0, 1.0 );
			#endif
			vec4 viewSpacePosition = cameraProjectionMatrixInverse * clipSpacePosition;
			return viewSpacePosition.xyz / viewSpacePosition.w;
		}

		float getDepth(const vec2 uv) {
		#if DEPTH_VALUE_SOURCE == 1
			return textureLod(tDepth, uv.xy, 0.0).a;
		#else
			return textureLod(tDepth, uv.xy, 0.0).r;
		#endif
		}

		float fetchDepth(const ivec2 uv) {
			#if DEPTH_VALUE_SOURCE == 1
				return texelFetch(tDepth, uv.xy, 0).a;
			#else
				return texelFetch(tDepth, uv.xy, 0).r;
			#endif
		}

		vec3 computeNormalFromDepth(const vec2 uv) {
			vec2 size = vec2(textureSize(tDepth, 0));
			ivec2 p = ivec2(uv * size);
			float c0 = fetchDepth(p);
			float l2 = fetchDepth(p - ivec2(2, 0));
			float l1 = fetchDepth(p - ivec2(1, 0));
			float r1 = fetchDepth(p + ivec2(1, 0));
			float r2 = fetchDepth(p + ivec2(2, 0));
			float b2 = fetchDepth(p - ivec2(0, 2));
			float b1 = fetchDepth(p - ivec2(0, 1));
			float t1 = fetchDepth(p + ivec2(0, 1));
			float t2 = fetchDepth(p + ivec2(0, 2));
			float dl = abs((2.0 * l1 - l2) - c0);
			float dr = abs((2.0 * r1 - r2) - c0);
			float db = abs((2.0 * b1 - b2) - c0);
			float dt = abs((2.0 * t1 - t2) - c0);
			vec3 ce = getViewPosition(uv, c0).xyz;
			vec3 dpdx = (dl < dr) ?  ce - getViewPosition((uv - vec2(1.0 / size.x, 0.0)), l1).xyz
									: -ce + getViewPosition((uv + vec2(1.0 / size.x, 0.0)), r1).xyz;
			vec3 dpdy = (db < dt) ?  ce - getViewPosition((uv - vec2(0.0, 1.0 / size.y)), b1).xyz
									: -ce + getViewPosition((uv + vec2(0.0, 1.0 / size.y)), t1).xyz;
			return normalize(cross(dpdx, dpdy));
		}

		vec3 getViewNormal(const vec2 uv) {
		#if NORMAL_VECTOR_TYPE == 2
			return normalize(textureLod(tNormal, uv, 0.).rgb);
		#elif NORMAL_VECTOR_TYPE == 1
			return unpackRGBToNormal(textureLod(tNormal, uv, 0.).rgb);
		#else
			return computeNormalFromDepth(uv);
		#endif
		}

		void denoiseSample(in vec3 center, in vec3 viewNormal, in vec3 viewPos, in vec2 sampleUv, inout vec3 denoised, inout float totalWeight) {
			vec4 sampleTexel = textureLod(tDiffuse, sampleUv, 0.0);
			float sampleDepth = getDepth(sampleUv);
			vec3 sampleNormal = getViewNormal(sampleUv);
			vec3 neighborColor = sampleTexel.rgb;
			vec3 viewPosSample = getViewPosition(sampleUv, sampleDepth);

			float normalDiff = dot(viewNormal, sampleNormal);
			float normalSimilarity = pow(max(normalDiff, 0.), normalPhi);
			float lumaDiff = abs(getLuminance(neighborColor) - getLuminance(center));
			float lumaSimilarity = max(1.0 - lumaDiff / lumaPhi, 0.0);
			float depthDiff = abs(dot(viewPos - viewPosSample, viewNormal));
			float depthSimilarity = max(1. - depthDiff / depthPhi, 0.);
			float w = lumaSimilarity * depthSimilarity * normalSimilarity;

			denoised += w * neighborColor;
			totalWeight += w;
		}

		void main() {
			float depth = getDepth(vUv.xy);
			vec3 viewNormal = getViewNormal(vUv);
			if (depth == 1. || dot(viewNormal, viewNormal) == 0.) {
				discard;
				return;
			}
			vec4 texel = textureLod(tDiffuse, vUv, 0.0);
			vec3 center = texel.rgb;
			vec3 viewPos = getViewPosition(vUv, depth);

			vec2 noiseResolution = vec2(textureSize(tNoise, 0));
			vec2 noiseUv = vUv * resolution / noiseResolution;
			vec4 noiseTexel = textureLod(tNoise, noiseUv, 0.0);
      		vec2 noiseVec = vec2(sin(noiseTexel[index % 4] * 2. * PI), cos(noiseTexel[index % 4] * 2. * PI));
    		mat2 rotationMatrix = mat2(noiseVec.x, -noiseVec.y, noiseVec.x, noiseVec.y);

			float totalWeight = 1.0;
			vec3 denoised = texel.rgb;
			for (int i = 0; i < SAMPLES; i++) {
				vec3 sampleDir = poissonDisk[i];
				vec2 offset = rotationMatrix * (sampleDir.xy * (1. + sampleDir.z * (radius - 1.)) / resolution);
				vec2 sampleUv = vUv + offset;
				denoiseSample(center, viewNormal, viewPos, sampleUv, denoised, totalWeight);
			}

			if (totalWeight > 0.) {
				denoised /= totalWeight;
			}
			gl_FragColor = FRAGMENT_OUTPUT;
		}` };
function pe(e4, t2, n2) {
  let r2 = me(e4, t2, n2), i2 = `vec3[SAMPLES](`;
  for (let t3 = 0; t3 < e4; t3++) {
    let n3 = r2[t3];
    i2 += `vec3(${n3.x}, ${n3.y}, ${n3.z})${t3 < e4 - 1 ? `,` : `)`}`;
  }
  return i2;
}
function me(e4, t2, n2) {
  let r2 = [];
  for (let i2 = 0; i2 < e4; i2++) {
    let a2 = 2 * Math.PI * t2 * i2 / e4, o2 = (i2 / (e4 - 1)) ** n2;
    r2.push(new g(Math.cos(a2), Math.sin(a2), o2));
  }
  return r2;
}
var he = class {
  constructor(e4 = Math) {
    this.grad3 = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]], this.grad4 = [[0, 1, 1, 1], [0, 1, 1, -1], [0, 1, -1, 1], [0, 1, -1, -1], [0, -1, 1, 1], [0, -1, 1, -1], [0, -1, -1, 1], [0, -1, -1, -1], [1, 0, 1, 1], [1, 0, 1, -1], [1, 0, -1, 1], [1, 0, -1, -1], [-1, 0, 1, 1], [-1, 0, 1, -1], [-1, 0, -1, 1], [-1, 0, -1, -1], [1, 1, 0, 1], [1, 1, 0, -1], [1, -1, 0, 1], [1, -1, 0, -1], [-1, 1, 0, 1], [-1, 1, 0, -1], [-1, -1, 0, 1], [-1, -1, 0, -1], [1, 1, 1, 0], [1, 1, -1, 0], [1, -1, 1, 0], [1, -1, -1, 0], [-1, 1, 1, 0], [-1, 1, -1, 0], [-1, -1, 1, 0], [-1, -1, -1, 0]], this.p = [];
    for (let t2 = 0; t2 < 256; t2++) this.p[t2] = Math.floor(e4.random() * 256);
    this.perm = [];
    for (let e5 = 0; e5 < 512; e5++) this.perm[e5] = this.p[e5 & 255];
    this.simplex = [[0, 1, 2, 3], [0, 1, 3, 2], [0, 0, 0, 0], [0, 2, 3, 1], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [1, 2, 3, 0], [0, 2, 1, 3], [0, 0, 0, 0], [0, 3, 1, 2], [0, 3, 2, 1], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [1, 3, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [1, 2, 0, 3], [0, 0, 0, 0], [1, 3, 0, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [2, 3, 0, 1], [2, 3, 1, 0], [1, 0, 2, 3], [1, 0, 3, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [2, 0, 3, 1], [0, 0, 0, 0], [2, 1, 3, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [2, 0, 1, 3], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [3, 0, 1, 2], [3, 0, 2, 1], [0, 0, 0, 0], [3, 1, 2, 0], [2, 1, 0, 3], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [3, 1, 0, 2], [0, 0, 0, 0], [3, 2, 0, 1], [3, 2, 1, 0]];
  }
  noise(e4, t2) {
    let n2, r2, i2, a2 = 0.5 * (Math.sqrt(3) - 1), o2 = (e4 + t2) * a2, s2 = Math.floor(e4 + o2), c2 = Math.floor(t2 + o2), l2 = (3 - Math.sqrt(3)) / 6, u2 = (s2 + c2) * l2, d2 = s2 - u2, f2 = c2 - u2, p2 = e4 - d2, m2 = t2 - f2, h2, g2;
    p2 > m2 ? (h2 = 1, g2 = 0) : (h2 = 0, g2 = 1);
    let _2 = p2 - h2 + l2, v2 = m2 - g2 + l2, y2 = p2 - 1 + 2 * l2, b2 = m2 - 1 + 2 * l2, x2 = s2 & 255, S2 = c2 & 255, C2 = this.perm[x2 + this.perm[S2]] % 12, w2 = this.perm[x2 + h2 + this.perm[S2 + g2]] % 12, T2 = this.perm[x2 + 1 + this.perm[S2 + 1]] % 12, E2 = 0.5 - p2 * p2 - m2 * m2;
    E2 < 0 ? n2 = 0 : (E2 *= E2, n2 = E2 * E2 * this._dot(this.grad3[C2], p2, m2));
    let D2 = 0.5 - _2 * _2 - v2 * v2;
    D2 < 0 ? r2 = 0 : (D2 *= D2, r2 = D2 * D2 * this._dot(this.grad3[w2], _2, v2));
    let O2 = 0.5 - y2 * y2 - b2 * b2;
    return O2 < 0 ? i2 = 0 : (O2 *= O2, i2 = O2 * O2 * this._dot(this.grad3[T2], y2, b2)), 70 * (n2 + r2 + i2);
  }
  noise3d(e4, t2, n2) {
    let r2, i2, a2, o2, s2 = (e4 + t2 + n2) * (1 / 3), c2 = Math.floor(e4 + s2), l2 = Math.floor(t2 + s2), u2 = Math.floor(n2 + s2), d2 = 1 / 6, f2 = (c2 + l2 + u2) * d2, p2 = c2 - f2, m2 = l2 - f2, h2 = u2 - f2, g2 = e4 - p2, _2 = t2 - m2, v2 = n2 - h2, y2, b2, x2, S2, C2, w2;
    g2 >= _2 ? _2 >= v2 ? (y2 = 1, b2 = 0, x2 = 0, S2 = 1, C2 = 1, w2 = 0) : g2 >= v2 ? (y2 = 1, b2 = 0, x2 = 0, S2 = 1, C2 = 0, w2 = 1) : (y2 = 0, b2 = 0, x2 = 1, S2 = 1, C2 = 0, w2 = 1) : _2 < v2 ? (y2 = 0, b2 = 0, x2 = 1, S2 = 0, C2 = 1, w2 = 1) : g2 < v2 ? (y2 = 0, b2 = 1, x2 = 0, S2 = 0, C2 = 1, w2 = 1) : (y2 = 0, b2 = 1, x2 = 0, S2 = 1, C2 = 1, w2 = 0);
    let T2 = g2 - y2 + d2, E2 = _2 - b2 + d2, D2 = v2 - x2 + d2, O2 = g2 - S2 + 2 * d2, k2 = _2 - C2 + 2 * d2, A2 = v2 - w2 + 2 * d2, j2 = g2 - 1 + 3 * d2, M2 = _2 - 1 + 3 * d2, N2 = v2 - 1 + 3 * d2, P2 = c2 & 255, F2 = l2 & 255, I2 = u2 & 255, ee2 = this.perm[P2 + this.perm[F2 + this.perm[I2]]] % 12, te2 = this.perm[P2 + y2 + this.perm[F2 + b2 + this.perm[I2 + x2]]] % 12, L2 = this.perm[P2 + S2 + this.perm[F2 + C2 + this.perm[I2 + w2]]] % 12, ne2 = this.perm[P2 + 1 + this.perm[F2 + 1 + this.perm[I2 + 1]]] % 12, R2 = 0.6 - g2 * g2 - _2 * _2 - v2 * v2;
    R2 < 0 ? r2 = 0 : (R2 *= R2, r2 = R2 * R2 * this._dot3(this.grad3[ee2], g2, _2, v2));
    let z2 = 0.6 - T2 * T2 - E2 * E2 - D2 * D2;
    z2 < 0 ? i2 = 0 : (z2 *= z2, i2 = z2 * z2 * this._dot3(this.grad3[te2], T2, E2, D2));
    let B2 = 0.6 - O2 * O2 - k2 * k2 - A2 * A2;
    B2 < 0 ? a2 = 0 : (B2 *= B2, a2 = B2 * B2 * this._dot3(this.grad3[L2], O2, k2, A2));
    let V2 = 0.6 - j2 * j2 - M2 * M2 - N2 * N2;
    return V2 < 0 ? o2 = 0 : (V2 *= V2, o2 = V2 * V2 * this._dot3(this.grad3[ne2], j2, M2, N2)), 32 * (r2 + i2 + a2 + o2);
  }
  noise4d(e4, t2, n2, r2) {
    let i2 = this.grad4, a2 = this.simplex, o2 = this.perm, s2 = (Math.sqrt(5) - 1) / 4, c2 = (5 - Math.sqrt(5)) / 20, l2, u2, d2, f2, p2, m2 = (e4 + t2 + n2 + r2) * s2, h2 = Math.floor(e4 + m2), g2 = Math.floor(t2 + m2), _2 = Math.floor(n2 + m2), v2 = Math.floor(r2 + m2), y2 = (h2 + g2 + _2 + v2) * c2, b2 = h2 - y2, x2 = g2 - y2, S2 = _2 - y2, C2 = v2 - y2, w2 = e4 - b2, T2 = t2 - x2, E2 = n2 - S2, D2 = r2 - C2, O2 = w2 > T2 ? 32 : 0, k2 = w2 > E2 ? 16 : 0, A2 = T2 > E2 ? 8 : 0, j2 = w2 > D2 ? 4 : 0, M2 = T2 > D2 ? 2 : 0, N2 = +(E2 > D2), P2 = O2 + k2 + A2 + j2 + M2 + N2, F2 = +(a2[P2][0] >= 3), I2 = +(a2[P2][1] >= 3), ee2 = +(a2[P2][2] >= 3), te2 = +(a2[P2][3] >= 3), L2 = +(a2[P2][0] >= 2), ne2 = +(a2[P2][1] >= 2), R2 = +(a2[P2][2] >= 2), z2 = +(a2[P2][3] >= 2), B2 = +(a2[P2][0] >= 1), V2 = +(a2[P2][1] >= 1), re2 = +(a2[P2][2] >= 1), ie2 = +(a2[P2][3] >= 1), H2 = w2 - F2 + c2, ae2 = T2 - I2 + c2, oe2 = E2 - ee2 + c2, se2 = D2 - te2 + c2, U2 = w2 - L2 + 2 * c2, ce2 = T2 - ne2 + 2 * c2, le2 = E2 - R2 + 2 * c2, ue2 = D2 - z2 + 2 * c2, de2 = w2 - B2 + 3 * c2, fe2 = T2 - V2 + 3 * c2, pe2 = E2 - re2 + 3 * c2, me2 = D2 - ie2 + 3 * c2, he2 = w2 - 1 + 4 * c2, ge2 = T2 - 1 + 4 * c2, _e2 = E2 - 1 + 4 * c2, ve2 = D2 - 1 + 4 * c2, ye2 = h2 & 255, be2 = g2 & 255, xe2 = _2 & 255, Se2 = v2 & 255, W2 = o2[ye2 + o2[be2 + o2[xe2 + o2[Se2]]]] % 32, G2 = o2[ye2 + F2 + o2[be2 + I2 + o2[xe2 + ee2 + o2[Se2 + te2]]]] % 32, Ce2 = o2[ye2 + L2 + o2[be2 + ne2 + o2[xe2 + R2 + o2[Se2 + z2]]]] % 32, K2 = o2[ye2 + B2 + o2[be2 + V2 + o2[xe2 + re2 + o2[Se2 + ie2]]]] % 32, we2 = o2[ye2 + 1 + o2[be2 + 1 + o2[xe2 + 1 + o2[Se2 + 1]]]] % 32, Te2 = 0.6 - w2 * w2 - T2 * T2 - E2 * E2 - D2 * D2;
    Te2 < 0 ? l2 = 0 : (Te2 *= Te2, l2 = Te2 * Te2 * this._dot4(i2[W2], w2, T2, E2, D2));
    let Ee2 = 0.6 - H2 * H2 - ae2 * ae2 - oe2 * oe2 - se2 * se2;
    Ee2 < 0 ? u2 = 0 : (Ee2 *= Ee2, u2 = Ee2 * Ee2 * this._dot4(i2[G2], H2, ae2, oe2, se2));
    let De2 = 0.6 - U2 * U2 - ce2 * ce2 - le2 * le2 - ue2 * ue2;
    De2 < 0 ? d2 = 0 : (De2 *= De2, d2 = De2 * De2 * this._dot4(i2[Ce2], U2, ce2, le2, ue2));
    let Oe2 = 0.6 - de2 * de2 - fe2 * fe2 - pe2 * pe2 - me2 * me2;
    Oe2 < 0 ? f2 = 0 : (Oe2 *= Oe2, f2 = Oe2 * Oe2 * this._dot4(i2[K2], de2, fe2, pe2, me2));
    let ke2 = 0.6 - he2 * he2 - ge2 * ge2 - _e2 * _e2 - ve2 * ve2;
    return ke2 < 0 ? p2 = 0 : (ke2 *= ke2, p2 = ke2 * ke2 * this._dot4(i2[we2], he2, ge2, _e2, ve2)), 27 * (l2 + u2 + d2 + f2 + p2);
  }
  _dot(e4, t2, n2) {
    return e4[0] * t2 + e4[1] * n2;
  }
  _dot3(e4, t2, n2, r2) {
    return e4[0] * t2 + e4[1] * n2 + e4[2] * r2;
  }
  _dot4(e4, t2, n2, r2, i2) {
    return e4[0] * t2 + e4[1] * n2 + e4[2] * r2 + e4[3] * i2;
  }
}, ge = class e3 extends M {
  constructor(e4, n2, r2 = 512, i2 = 512, o2, c2, l2) {
    super(), this.width = r2, this.height = i2, this.clear = true, this.camera = n2, this.scene = e4, this.output = 0, this._renderGBuffer = true, this._visibilityCache = [], this.blendIntensity = 1, this.pdRings = 2, this.pdRadiusExponent = 2, this.pdSamples = 16, this.gtaoNoiseTexture = ue(), this.pdNoiseTexture = this._generateNoise(), this.gtaoRenderTarget = new s(this.width, this.height, { type: C }), this.pdRenderTarget = this.gtaoRenderTarget.clone(), this.gtaoMaterial = new a({ defines: Object.assign({}, U.defines), uniforms: t.clone(U.uniforms), vertexShader: U.vertexShader, fragmentShader: U.fragmentShader, blending: 0, depthTest: false, depthWrite: false }), this.gtaoMaterial.defines.PERSPECTIVE_CAMERA = +!!this.camera.isPerspectiveCamera, this.gtaoMaterial.uniforms.tNoise.value = this.gtaoNoiseTexture, this.gtaoMaterial.uniforms.resolution.value.set(this.width, this.height), this.gtaoMaterial.uniforms.cameraNear.value = this.camera.near, this.gtaoMaterial.uniforms.cameraFar.value = this.camera.far, this.normalMaterial = new A(), this.normalMaterial.blending = 0, this.pdMaterial = new a({ defines: Object.assign({}, fe.defines), uniforms: t.clone(fe.uniforms), vertexShader: fe.vertexShader, fragmentShader: fe.fragmentShader, depthTest: false, depthWrite: false }), this.pdMaterial.uniforms.tDiffuse.value = this.gtaoRenderTarget.texture, this.pdMaterial.uniforms.tNoise.value = this.pdNoiseTexture, this.pdMaterial.uniforms.resolution.value.set(this.width, this.height), this.pdMaterial.uniforms.lumaPhi.value = 10, this.pdMaterial.uniforms.depthPhi.value = 2, this.pdMaterial.uniforms.normalPhi.value = 3, this.pdMaterial.uniforms.radius.value = 8, this.depthRenderMaterial = new a({ defines: Object.assign({}, ce.defines), uniforms: t.clone(ce.uniforms), vertexShader: ce.vertexShader, fragmentShader: ce.fragmentShader, blending: 0 }), this.depthRenderMaterial.uniforms.cameraNear.value = this.camera.near, this.depthRenderMaterial.uniforms.cameraFar.value = this.camera.far, this.copyMaterial = new a({ uniforms: t.clone(H.uniforms), vertexShader: H.vertexShader, fragmentShader: H.fragmentShader, transparent: true, depthTest: false, depthWrite: false, blendSrc: 208, blendDst: 200, blendEquation: 100, blendSrcAlpha: 206, blendDstAlpha: 200, blendEquationAlpha: 100 }), this.blendMaterial = new a({ uniforms: t.clone(le.uniforms), vertexShader: le.vertexShader, fragmentShader: le.fragmentShader, transparent: true, depthTest: false, depthWrite: false, blending: 5, blendSrc: 208, blendDst: 200, blendEquation: 100, blendSrcAlpha: 206, blendDstAlpha: 200, blendEquationAlpha: 100 }), this._fsQuad = new I(null), this._originalClearColor = new _(), this.setGBuffer(o2 ? o2.depthTexture : void 0, o2 ? o2.normalTexture : void 0), c2 !== void 0 && this.updateGtaoMaterial(c2), l2 !== void 0 && this.updatePdMaterial(l2);
  }
  setSize(e4, t2) {
    this.width = e4, this.height = t2, this.gtaoRenderTarget.setSize(e4, t2), this.normalRenderTarget.setSize(e4, t2), this.pdRenderTarget.setSize(e4, t2), this.gtaoMaterial.uniforms.resolution.value.set(e4, t2), this.gtaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix), this.gtaoMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse), this.pdMaterial.uniforms.resolution.value.set(e4, t2), this.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse);
  }
  dispose() {
    this.gtaoNoiseTexture.dispose(), this.pdNoiseTexture.dispose(), this.normalRenderTarget.dispose(), this.gtaoRenderTarget.dispose(), this.pdRenderTarget.dispose(), this.normalMaterial.dispose(), this.pdMaterial.dispose(), this.copyMaterial.dispose(), this.depthRenderMaterial.dispose(), this._fsQuad.dispose();
  }
  get gtaoMap() {
    return this.pdRenderTarget.texture;
  }
  setGBuffer(e4, t2) {
    e4 === void 0 ? (this.depthTexture = new x(), this.depthTexture.format = y, this.depthTexture.type = u, this.normalRenderTarget = new s(this.width, this.height, { minFilter: ne, magFilter: ne, type: C, depthTexture: this.depthTexture }), this.normalTexture = this.normalRenderTarget.texture, this._renderGBuffer = true) : (this.depthTexture = e4, this.normalTexture = t2, this._renderGBuffer = false);
    let n2 = +!!this.normalTexture, r2 = this.depthTexture === this.normalTexture ? `w` : `x`;
    this.gtaoMaterial.defines.NORMAL_VECTOR_TYPE = n2, this.gtaoMaterial.defines.DEPTH_SWIZZLING = r2, this.gtaoMaterial.uniforms.tNormal.value = this.normalTexture, this.gtaoMaterial.uniforms.tDepth.value = this.depthTexture, this.pdMaterial.defines.NORMAL_VECTOR_TYPE = n2, this.pdMaterial.defines.DEPTH_SWIZZLING = r2, this.pdMaterial.uniforms.tNormal.value = this.normalTexture, this.pdMaterial.uniforms.tDepth.value = this.depthTexture, this.depthRenderMaterial.uniforms.tDepth.value = this.normalRenderTarget.depthTexture;
  }
  setSceneClipBox(e4) {
    e4 ? (this.gtaoMaterial.needsUpdate = this.gtaoMaterial.defines.SCENE_CLIP_BOX !== 1, this.gtaoMaterial.defines.SCENE_CLIP_BOX = 1, this.gtaoMaterial.uniforms.sceneBoxMin.value.copy(e4.min), this.gtaoMaterial.uniforms.sceneBoxMax.value.copy(e4.max)) : (this.gtaoMaterial.needsUpdate = this.gtaoMaterial.defines.SCENE_CLIP_BOX === 0, this.gtaoMaterial.defines.SCENE_CLIP_BOX = 0);
  }
  updateGtaoMaterial(e4) {
    e4.radius !== void 0 && (this.gtaoMaterial.uniforms.radius.value = e4.radius), e4.distanceExponent !== void 0 && (this.gtaoMaterial.uniforms.distanceExponent.value = e4.distanceExponent), e4.thickness !== void 0 && (this.gtaoMaterial.uniforms.thickness.value = e4.thickness), e4.distanceFallOff !== void 0 && (this.gtaoMaterial.uniforms.distanceFallOff.value = e4.distanceFallOff, this.gtaoMaterial.needsUpdate = true), e4.scale !== void 0 && (this.gtaoMaterial.uniforms.scale.value = e4.scale), e4.samples !== void 0 && e4.samples !== this.gtaoMaterial.defines.SAMPLES && (this.gtaoMaterial.defines.SAMPLES = e4.samples, this.gtaoMaterial.needsUpdate = true), e4.screenSpaceRadius !== void 0 && +!!e4.screenSpaceRadius !== this.gtaoMaterial.defines.SCREEN_SPACE_RADIUS && (this.gtaoMaterial.defines.SCREEN_SPACE_RADIUS = +!!e4.screenSpaceRadius, this.gtaoMaterial.needsUpdate = true);
  }
  updatePdMaterial(e4) {
    let t2 = false;
    e4.lumaPhi !== void 0 && (this.pdMaterial.uniforms.lumaPhi.value = e4.lumaPhi), e4.depthPhi !== void 0 && (this.pdMaterial.uniforms.depthPhi.value = e4.depthPhi), e4.normalPhi !== void 0 && (this.pdMaterial.uniforms.normalPhi.value = e4.normalPhi), e4.radius !== void 0 && e4.radius !== this.radius && (this.pdMaterial.uniforms.radius.value = e4.radius), e4.radiusExponent !== void 0 && e4.radiusExponent !== this.pdRadiusExponent && (this.pdRadiusExponent = e4.radiusExponent, t2 = true), e4.rings !== void 0 && e4.rings !== this.pdRings && (this.pdRings = e4.rings, t2 = true), e4.samples !== void 0 && e4.samples !== this.pdSamples && (this.pdSamples = e4.samples, t2 = true), t2 && (this.pdMaterial.defines.SAMPLES = this.pdSamples, this.pdMaterial.defines.SAMPLE_VECTORS = pe(this.pdSamples, this.pdRings, this.pdRadiusExponent), this.pdMaterial.needsUpdate = true);
  }
  render(t2, n2, r2) {
    switch (this._renderGBuffer && (this._overrideVisibility(), this._renderOverride(t2, this.normalMaterial, this.normalRenderTarget, 7829503, 1), this._restoreVisibility()), this.gtaoMaterial.uniforms.cameraNear.value = this.camera.near, this.gtaoMaterial.uniforms.cameraFar.value = this.camera.far, this.gtaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix), this.gtaoMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse), this.gtaoMaterial.uniforms.cameraWorldMatrix.value.copy(this.camera.matrixWorld), this._renderPass(t2, this.gtaoMaterial, this.gtaoRenderTarget, 16777215, 1), this.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse), this._renderPass(t2, this.pdMaterial, this.pdRenderTarget, 16777215, 1), this.output) {
      case e3.OUTPUT.Off:
        break;
      case e3.OUTPUT.Diffuse:
        this.copyMaterial.uniforms.tDiffuse.value = r2.texture, this.copyMaterial.blending = 0, this._renderPass(t2, this.copyMaterial, this.renderToScreen ? null : n2);
        break;
      case e3.OUTPUT.AO:
        this.copyMaterial.uniforms.tDiffuse.value = this.gtaoRenderTarget.texture, this.copyMaterial.blending = 0, this._renderPass(t2, this.copyMaterial, this.renderToScreen ? null : n2);
        break;
      case e3.OUTPUT.Denoise:
        this.copyMaterial.uniforms.tDiffuse.value = this.pdRenderTarget.texture, this.copyMaterial.blending = 0, this._renderPass(t2, this.copyMaterial, this.renderToScreen ? null : n2);
        break;
      case e3.OUTPUT.Depth:
        this.depthRenderMaterial.uniforms.cameraNear.value = this.camera.near, this.depthRenderMaterial.uniforms.cameraFar.value = this.camera.far, this._renderPass(t2, this.depthRenderMaterial, this.renderToScreen ? null : n2);
        break;
      case e3.OUTPUT.Normal:
        this.copyMaterial.uniforms.tDiffuse.value = this.normalRenderTarget.texture, this.copyMaterial.blending = 0, this._renderPass(t2, this.copyMaterial, this.renderToScreen ? null : n2);
        break;
      case e3.OUTPUT.Default:
        this.copyMaterial.uniforms.tDiffuse.value = r2.texture, this.copyMaterial.blending = 0, this._renderPass(t2, this.copyMaterial, this.renderToScreen ? null : n2), this.blendMaterial.uniforms.intensity.value = this.blendIntensity, this.blendMaterial.uniforms.tDiffuse.value = this.pdRenderTarget.texture, this._renderPass(t2, this.blendMaterial, this.renderToScreen ? null : n2);
        break;
      default:
        console.warn(`THREE.GTAOPass: Unknown output type.`);
    }
  }
  _renderPass(e4, t2, n2, r2, i2) {
    e4.getClearColor(this._originalClearColor);
    let a2 = e4.getClearAlpha(), o2 = e4.autoClear;
    e4.setRenderTarget(n2), e4.autoClear = false, r2 != null && (e4.setClearColor(r2), e4.setClearAlpha(i2 || 0), e4.clear()), this._fsQuad.material = t2, this._fsQuad.render(e4), e4.autoClear = o2, e4.setClearColor(this._originalClearColor), e4.setClearAlpha(a2);
  }
  _renderOverride(e4, t2, n2, r2, i2) {
    e4.getClearColor(this._originalClearColor);
    let a2 = e4.getClearAlpha(), o2 = e4.autoClear;
    e4.setRenderTarget(n2), e4.autoClear = false, r2 = t2.clearColor || r2, i2 = t2.clearAlpha || i2, r2 != null && (e4.setClearColor(r2), e4.setClearAlpha(i2 || 0), e4.clear()), this.scene.overrideMaterial = t2, e4.render(this.scene, this.camera), this.scene.overrideMaterial = null, e4.autoClear = o2, e4.setClearColor(this._originalClearColor), e4.setClearAlpha(a2);
  }
  _overrideVisibility() {
    let e4 = this.scene, t2 = this._visibilityCache;
    e4.traverse(function(e5) {
      (e5.isPoints || e5.isLine || e5.isLine2) && e5.visible && (e5.visible = false, t2.push(e5));
    });
  }
  _restoreVisibility() {
    let e4 = this._visibilityCache;
    for (let t2 = 0; t2 < e4.length; t2++) e4[t2].visible = true;
    e4.length = 0;
  }
  _generateNoise(e4 = 64) {
    let t2 = new he(), r2 = e4 * e4 * 4, i2 = new Uint8Array(r2);
    for (let n2 = 0; n2 < e4; n2++) for (let r3 = 0; r3 < e4; r3++) {
      let a3 = n2, o2 = r3;
      i2[(n2 * e4 + r3) * 4] = (t2.noise(a3, o2) * 0.5 + 0.5) * 255, i2[(n2 * e4 + r3) * 4 + 1] = (t2.noise(a3 + e4, o2) * 0.5 + 0.5) * 255, i2[(n2 * e4 + r3) * 4 + 2] = (t2.noise(a3, o2 + e4) * 0.5 + 0.5) * 255, i2[(n2 * e4 + r3) * 4 + 3] = (t2.noise(a3 + e4, o2 + e4) * 0.5 + 0.5) * 255;
    }
    let a2 = new n(i2, e4, e4, O, P);
    return a2.wrapS = v, a2.wrapT = v, a2.needsUpdate = true, a2;
  }
};
ge.OUTPUT = { Off: -1, Default: 0, Diffuse: 1, Depth: 2, Normal: 3, AO: 4, Denoise: 5 };
var _e = `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`, ve = `
varying vec2 vUv;
float h1(float n){return fract(sin(n*12.9898)*43758.5453);}
float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise3(vec3 x){vec3 p=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(hash(p),hash(p+vec3(1,0,0)),f.x),mix(hash(p+vec3(0,1,0)),hash(p+vec3(1,1,0)),f.x),f.y),mix(mix(hash(p+vec3(0,0,1)),hash(p+vec3(1,0,1)),f.x),mix(hash(p+vec3(0,1,1)),hash(p+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*noise3(p);p=p*2.07+vec3(3.1,1.7,5.3);a*=.5;}return s;}
float smax(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(a,b,h)+k*h*(1.-h);}
// Height of one billow: a smooth union of spherical lobes, eroded by noise.
float height(vec2 p,float seed){
 float h=0.;
 for(int i=0;i<11;i++){float fi=float(i),a=h1(seed*7.13+fi*1.31)*6.2831853,d=i==0?0.:sqrt(h1(seed*3.71+fi*2.17))*.5;
  vec2 c=vec2(cos(a),sin(a)*.85+.08)*d;float r=i==0?.48:mix(.2,.38,h1(seed*5.3+fi*.77))*(1.-d*.3);
  vec2 q=p-c;h=smax(h,sqrt(max(r*r-dot(q,q),0.)),.07);}
 float n=fbm(vec3(p*3.,seed*1.93)),m=fbm(vec3(p*7.5,seed*2.71+5.));
 return h+(n-.5)*.26+(m-.5)*.1-.05;
}
void main(){
 vec2 tile=floor(vUv*4.),p=(fract(vUv*4.)*2.-1.)*1.1;float seed=tile.x+tile.y*4.+1.,e=.01;
 float h=height(p,seed),hx=height(p+vec2(e,0.),seed)-height(p-vec2(e,0.),seed),hy=height(p+vec2(0.,e),seed)-height(p-vec2(0.,e),seed);
 vec3 n=normalize(vec3(-hx,-hy,e*2.5));
 float wisp=fbm(vec3(p*13.,seed*3.1+9.));
 // Soft, wispy rims and a dense heart, so overlapping puffs merge into one body of gas.
 float density=smoothstep(-.08,.42,h)*(.64+.36*wisp)*(1.-smoothstep(.56,1.02,length(p)));
 gl_FragColor=vec4(n.xy*.5+.5,clamp(h/.5,0.,1.),density);
}`, ye = /* @__PURE__ */ new WeakMap();
function be(e4) {
  let t2 = ye.get(e4);
  if (t2) return t2;
  let n2 = new s(1024, 1024, { depthBuffer: false, generateMipmaps: true, minFilter: E, magFilter: N }), r2 = new F(new T(2, 2), new a({ vertexShader: _e, fragmentShader: ve, depthTest: false, depthWrite: false, toneMapped: false }));
  r2.frustumCulled = false;
  let i2 = e4.getRenderTarget(), c2 = e4.autoClear;
  try {
    e4.setRenderTarget(n2), e4.autoClear = true, e4.render(r2, new o());
  } finally {
    e4.setRenderTarget(i2), e4.autoClear = c2, r2.geometry.dispose(), r2.material.dispose();
  }
  return t2 = n2.texture, t2.anisotropy = 4, ye.set(e4, t2), t2;
}
var xe = `
attribute vec4 iA;attribute vec4 iB;attribute vec4 iC;
#ifdef SUN_SHADOW
uniform sampler2DShadow uShadow;
#endif
uniform mat4 uShadowMatrix;uniform float uHasShadow,uShadowBias,uNearFade,uCarRadius;uniform vec3 uCarView,uTailPos,uTailColor;
varying vec2 vUv;varying vec4 vA;varying vec4 vB;varying vec3 vWorld;varying vec3 vToward;varying vec2 vDepth;varying vec3 vTail;
void main(){
 vec4 c=viewMatrix*vec4(iA.xyz,1.);float size=iA.w,depth=-c.z,cr=cos(iB.x),sr=sin(iB.x);
 vec2 q=position.xy*size,r=vec2(cr*q.x-sr*q.y,sr*q.x+cr*q.y);
 vec4 mv=c;mv.xy+=r;gl_Position=projectionMatrix*mv;
 vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]),up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
 vWorld=iA.xyz+right*r.x+up*r.y;vToward=normalize(cameraPosition-iA.xyz);
 // The car's and the world's sun shadows fall across the gas (sampled at each corner).
 float sun=1.;
 #ifdef SUN_SHADOW
 if(uHasShadow>.5){vec4 sc=uShadowMatrix*vec4(iA.xyz+(right*r.x+up*r.y)*.45,1.);vec3 s=sc.xyz/sc.w;
  if(s.x>0.&&s.x<1.&&s.y>0.&&s.y<1.&&s.z<1.)sun=mix(.18,1.,texture(uShadow,vec3(s.xy,s.z+uShadowBias)));}
 #endif
 // Gas never sits on the lens, and thins where it would cover the car.
 float fade=smoothstep(uNearFade,uNearFade+1.8+size*.55,depth),carDepth=-uCarView.z;
 if(depth<carDepth-.2){vec2 a=c.xy/depth-uCarView.xy/carDepth;float reach=uCarRadius/carDepth+size*.32/depth;
  fade*=1.-(1.-smoothstep(reach*.55,reach,length(a)))*.93*smoothstep(.2,1.6,carDepth-depth);}
 // The red light bar tints nearby gas, like the dusty haze in the night photographs.
 vec3 tl=vWorld-uTailPos;vTail=uTailColor/(1.+dot(tl,tl)*.9);
 vA=vec4(iB.y*fade,iB.z,iB.w,size);vB=vec4(cr,sr,sun*iC.x,iC.y);vUv=uv;vDepth=vec2(-mv.z,size);
}`, Se = `
uniform sampler2D uAtlas;uniform sampler2D uDepth;uniform vec2 uDepthScale,uDepthMax;uniform float uCameraNear,uCameraFar;
uniform vec3 uSunDir,uSunColor,uSkyColor,uGroundColor,uDustColor;
varying vec2 vUv;varying vec4 vA;varying vec4 vB;varying vec3 vWorld;varying vec3 vToward;varying vec2 vDepth;varying vec3 vTail;
void main(){
 float variant=mod(vA.y,16.),dust=floor(vA.y/16.+.001)/15.;
 // A slow warp keeps every billow churning as it grows.
 vec2 uv=vUv+vec2(sin(vUv.y*7.+vA.z*1.9),cos(vUv.x*6.+vA.z*1.3))*.022;
 vec4 t=texture2D(uAtlas,(vec2(mod(variant,4.),floor(variant/4.))+clamp(uv,.004,.996))*.25);
 float a=t.a*vA.x;
 #ifdef SOFT
 float d=texelFetch(uDepth,ivec2(min(gl_FragCoord.xy*uDepthScale,uDepthMax)),0).r;
 float scene=uCameraNear*uCameraFar/(uCameraFar-(uCameraFar-uCameraNear)*d);
 a*=clamp((scene-vDepth.x)/(.12+vDepth.y*.3),0.,1.);
 #endif
 if(a<.003)discard;
 vec2 n2=t.xy*2.-1.;n2=vec2(vB.x*n2.x-vB.y*n2.y,vB.y*n2.x+vB.x*n2.y);
 vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]),up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
 vec3 N=normalize(right*n2.x+up*n2.y+vToward*sqrt(max(.04,1.-dot(n2,n2))));
 float sun=vB.z,thin=1.-t.z;
 // Sunlit lobes (wrapped), light diffusing through the billow, and forward
 // scattering that lines thin edges with sun when the gas is backlit.
 float diffuse=pow(clamp(dot(N,uSunDir)*.5+.5,0.,1.),1.7),trans=.08+.24*thin;
 float g=.5,cosT=dot(normalize(vWorld-cameraPosition),uSunDir),phase=(1.-g*g)/pow(1.+g*g-2.*g*cosT,1.5)*(.15+.5*thin)*.6*(1.-dust*.7);
 vec3 albedo=mix(vec3(.93,.94,.95),uDustColor,dust);
 // Shade inside a cloud is lit by sky and by sunlight scattered many times.
 vec3 sky=mix(vec3(dot(uSkyColor,vec3(.2126,.7152,.0722))),uSkyColor,.7);
 vec3 ambient=mix(uGroundColor,sky,clamp(N.y*.5+.5,0.,1.))*vB.w*(.5+.5*t.z)+uSunColor*(sun*.06+.03);
 vec3 col=albedo*(uSunColor*(sun*(diffuse+trans+phase))*.85+ambient+vTail*(.5+.5*thin));
 col=min(col,vec3(1.5));
 gl_FragColor=vec4(col*a,a);
}`, W = 24, G = 12, Ce = 44, K = 1.5, we = class {
  constructor({ max: t2 = 1600, quality: n2 = `high` } = {}) {
    this.max = t2, this.enabled = true, this.live = 0, this.visible = 0, this.cursor = 0, this.time = 0, this.scale = 1, this.limit = t2, this.attached = null;
    let r2 = () => new Float32Array(t2);
    Object.assign(this, { px: r2(), py: r2(), pz: r2(), vx: r2(), vy: r2(), vz: r2(), dx: r2(), dz: r2(), age: r2(), life: r2(), s0: r2(), s1: r2(), grow: r2(), rot: r2(), spin: r2(), op: r2(), drag: r2(), buoy: r2(), turb: r2(), dust: r2(), variant: r2(), seed: r2(), sunT: r2(), skyT: r2(), size: r2(), alpha: r2(), cell: new Int32Array(t2) }), this.life.fill(-1), this.sunT.fill(1), this.skyT.fill(1), this.keys = new Uint32Array(t2), this.grid = new Float32Array(W * G * Ce), this.origin = new g(), this.instances = new Float32Array(t2 * 12);
    let i2 = new T(1, 1), o2 = new e();
    o2.index = i2.index, o2.setAttribute(`position`, i2.attributes.position), o2.setAttribute(`uv`, i2.attributes.uv);
    let s2 = new j(this.instances, 12, 1).setUsage(l);
    this.buffer = s2, o2.setAttribute(`iA`, new B(s2, 4, 0)), o2.setAttribute(`iB`, new B(s2, 4, 4)), o2.setAttribute(`iC`, new B(s2, 4, 8)), o2.instanceCount = 0, this.uniforms = { uAtlas: { value: null }, uDepth: { value: null }, uDepthScale: { value: new f(2, 2) }, uDepthMax: { value: new f(1, 1) }, uCameraNear: { value: 0.1 }, uCameraFar: { value: 1e3 }, uShadow: { value: null }, uShadowMatrix: { value: new k() }, uHasShadow: { value: 0 }, uShadowBias: { value: -6e-4 }, uNearFade: { value: 0.9 }, uCarRadius: { value: 2.5 }, uCarView: { value: new g(0, 0, -8) }, uTailPos: { value: new g(0, -1e4, 0) }, uTailColor: { value: new _(0, 0, 0) }, uSunDir: { value: new g(0.4, 0.8, 0.3).normalize() }, uSunColor: { value: new _(1, 1, 1) }, uSkyColor: { value: new _(0.35, 0.4, 0.48) }, uGroundColor: { value: new _(0.25, 0.24, 0.22) }, uDustColor: { value: new _(0.5, 0.46, 0.4) } }, this.material = new a({ uniforms: this.uniforms, vertexShader: xe, fragmentShader: Se, defines: { SOFT: 1 }, transparent: true, depthTest: true, depthWrite: false, blending: 1, premultipliedAlpha: true, toneMapped: false }), this.mesh = new F(o2, this.material), this.mesh.frustumCulled = false, this.mesh.userData.noAO = true, this.root = new S(), this.root.add(this.mesh), this.root.matrixAutoUpdate = false, this.right = new g(1, 0, 0), this.setQuality(n2);
  }
  attach(e4, t2) {
    this.uniforms.uAtlas.value = be(e4), this.uniforms.uDepth.value = t2, this.attached = e4;
  }
  useSunShadow(e4) {
    if (!e4?.castShadow) return;
    let t2 = this.uniforms;
    this.material.defines.SUN_SHADOW = 1, this.material.needsUpdate = true, this.mesh.onBeforeRender = () => {
      let n2 = e4.shadow.map?.depthTexture || null;
      t2.uShadow.value = n2, t2.uHasShadow.value = +!!n2, t2.uShadowMatrix.value = e4.shadow.matrix;
    };
  }
  setQuality(e4) {
    this.quality = e4 === `balanced` ? `balanced` : `high`, this.scale = this.quality === `balanced` ? 0.6 : 1, this.limit = this.quality === `balanced` ? Math.min(this.max, 1e3) : this.max;
  }
  setLighting(e4) {
    let t2 = this.uniforms, n2 = e4?.sun, r2 = Math.PI;
    e4?.sunOffset && t2.uSunDir.value.copy(e4.sunOffset).normalize(), n2 ? t2.uSunColor.value.copy(n2.color).multiplyScalar(n2.intensity / r2 * 1.08) : t2.uSunColor.value.setRGB(0.95, 0.93, 0.9);
    let i2 = new _(), a2 = new _(), o2 = e4?.scene?.environmentIntensity ?? 0, s2 = e4?.scene?.background;
    if (s2?.isDataTexture && s2.image?.data && o2 > 0) {
      let { data: e5, width: t3, height: n3 } = s2.image, c3 = e5 instanceof Uint16Array, l3 = (t4) => c3 ? b.fromHalfFloat(e5[t4]) : e5[t4], u3 = 0, d2 = 0, f2 = [0, 0, 0], p2 = [0, 0, 0];
      for (let e6 = 0; e6 < n3; e6 += Math.max(1, n3 >> 5)) {
        let i3 = (0.5 - (e6 + 0.5) / n3) * r2, a3 = Math.abs(Math.sin(i3) * Math.cos(i3));
        if (!(a3 < 1e-4)) for (let n4 = 0; n4 < t3; n4 += Math.max(1, t3 >> 6)) {
          let r3 = (n4 + e6 * t3) * 4, o3 = l3(r3), s3 = l3(r3 + 1), c4 = l3(r3 + 2);
          if (o3 + s3 + c4 > 24) continue;
          let m2 = i3 > 0 ? f2 : p2;
          m2[0] += o3 * a3, m2[1] += s3 * a3, m2[2] += c4 * a3, i3 > 0 ? u3 += a3 : d2 += a3;
        }
      }
      u3 > 0 && i2.setRGB(f2[0] / u3 * o2, f2[1] / u3 * o2, f2[2] / u3 * o2), d2 > 0 && a2.setRGB(p2[0] / d2 * o2, p2[1] / d2 * o2, p2[2] / d2 * o2);
    } else i2.setRGB(0.3, 0.35, 0.42), a2.setRGB(0.16, 0.15, 0.14);
    let c2 = e4?.hemi;
    c2 && (i2.add(c2.color.clone().multiplyScalar(c2.intensity / r2)), a2.add(c2.groundColor.clone().multiplyScalar(c2.intensity / r2)));
    let l2 = e4?.bounce;
    l2 && a2.add(l2.color.clone().multiplyScalar(l2.intensity / r2 * 0.7)), t2.uSkyColor.value.copy(i2).multiplyScalar(1.3), t2.uGroundColor.value.copy(a2).multiplyScalar(1.15);
    let u2 = e4?.lighting?.hero?.gas;
    if (u2) for (let [e5, n3] of [[t2.uSunColor.value, u2.key], [t2.uSkyColor.value, u2.fill], [t2.uGroundColor.value, u2.fill]]) {
      let t3 = e5.r * 0.2126 + e5.g * 0.7152 + e5.b * 0.0722;
      e5.lerp(new _(t3, t3, t3), u2.white).multiplyScalar(n3);
    }
  }
  spawn(e4, t2, n2, r2, i2, a2, o2, s2, c2, l2, u2, d2, f2, p2, m2, h2, g2, _2) {
    let v2 = this.cursor, y2 = this.limit;
    for (let e5 = 0; e5 < 6; e5++) {
      let t3 = (this.cursor + e5) % y2;
      if (this.life[t3] < 0 || this.age[t3] >= this.life[t3]) {
        v2 = t3;
        break;
      }
      (e5 === 0 || this.age[t3] / this.life[t3] > this.age[v2] / this.life[v2]) && (v2 = t3);
    }
    this.cursor = (v2 + 1) % y2, this.px[v2] = e4, this.py[v2] = t2, this.pz[v2] = n2, this.vx[v2] = r2, this.vy[v2] = i2, this.vz[v2] = a2, this.dx[v2] = h2, this.dz[v2] = g2, this.age[v2] = 0, this.life[v2] = l2, this.s0[v2] = o2, this.s1[v2] = s2, this.grow[v2] = c2, this.op[v2] = u2, this.drag[v2] = d2, this.buoy[v2] = f2, this.turb[v2] = p2, this.dust[v2] = m2, this.rot[v2] = Math.random() * 6.2832, this.spin[v2] = _2, this.variant[v2] = Math.floor(Math.random() * 16), this.seed[v2] = Math.random(), this.size[v2] = o2, this.cell[v2] = -1;
  }
  clear() {
    this.life.fill(-1), this.age.fill(0), this.live = 0, this.visible = 0, this.mesh.geometry.instanceCount = 0, this.grid.fill(0);
  }
  room(e4, t2, n2) {
    let r2 = this.origin, i2 = (e4 - r2.x) / K | 0, a2 = (t2 - r2.y) / K | 0, o2 = (n2 - r2.z) / K | 0;
    if (i2 < 0 || i2 >= W || a2 < 0 || a2 >= G || o2 < 0 || o2 >= Ce) return 1;
    let s2 = this.grid[i2 + W * (a2 + G * o2)] + (a2 + 1 < G ? this.grid[i2 + W * (a2 + 1 + G * o2)] * 0.5 : 0);
    return Math.max(0.1, Math.min(1, 1 - (s2 - 3) / 6));
  }
  update(e4, t2, n2, r2) {
    this.time += e4;
    let i2 = this.time, a2 = this.max, o2 = 0, s2 = this, c2 = this.grid, l2 = this.origin.set(Math.floor(n2.x / K) * K - W * K * 0.5, Math.floor((n2.y - 5) / K) * K, Math.floor(n2.z / K) * K - Ce * K * 0.3);
    c2.fill(0);
    for (let t3 = 0; t3 < a2; t3++) {
      if (s2.life[t3] < 0) continue;
      s2.age[t3] += e4;
      let n3 = s2.age[t3], a3 = s2.life[t3];
      if (n3 >= a3) {
        s2.life[t3] = -1;
        continue;
      }
      let u3 = Math.exp(-s2.drag[t3] * e4), d3 = s2.seed[t3] * 6.2832, f3 = s2.turb[t3] * e4, p3 = s2.vx[t3] * u3, m3 = s2.vy[t3] * u3 + s2.buoy[t3] * e4, h3 = s2.vz[t3] * u3, g3 = s2.px[t3], _3 = s2.py[t3], v3 = s2.pz[t3];
      p3 += f3 * Math.sin(v3 * 0.45 + i2 * 1.7 + d3), h3 += f3 * Math.sin(g3 * 0.45 + i2 * 1.3 + d3 * 1.3), m3 += f3 * 0.55 * Math.sin((g3 + v3) * 0.35 + i2 * 2.1 + d3 * 0.7);
      let y3 = g3 + p3 * e4, b3 = _3 + m3 * e4, x3 = v3 + h3 * e4, S3 = 1 - Math.exp(-s2.grow[t3] * n3), C3 = s2.s0[t3] + (s2.s1[t3] - s2.s0[t3]) * S3, w3 = (r2 ? r2.at(y3, b3, x3) : -1 / 0) + C3 * 0.28;
      if (b3 < w3) {
        if (b3 = w3, m3 < 0) {
          let e5 = -m3 * 0.62;
          p3 += s2.dx[t3] * e5, h3 += s2.dz[t3] * e5, m3 *= -0.05;
        }
        let n4 = Math.exp(-e4 * 0.9);
        p3 *= n4, h3 *= n4;
      }
      s2.px[t3] = y3, s2.py[t3] = b3, s2.pz[t3] = x3, s2.vx[t3] = p3, s2.vy[t3] = m3, s2.vz[t3] = h3, s2.rot[t3] += s2.spin[t3] * e4, s2.size[t3] = C3;
      let T2 = n3 / a3, E2 = Math.min(1, n3 / 0.07), D2 = 1 - (T2 < 0.42 ? 0 : (T2 - 0.42) / 0.58) ** 1.6;
      s2.alpha[t3] = s2.op[t3] * E2 * D2 * (0.5 + 0.5 * Math.sqrt(s2.s0[t3] / C3));
      let O2 = (y3 - l2.x) / K | 0, k2 = (b3 - l2.y) / K | 0, A2 = (x3 - l2.z) / K | 0;
      if (O2 >= 0 && O2 < W && k2 >= 0 && k2 < G && A2 >= 0 && A2 < Ce) {
        let e5 = O2 + W * (k2 + G * A2);
        s2.cell[t3] = e5, c2[e5] += s2.alpha[t3] * Math.min(4, C3 * C3 / (K * K));
      } else s2.cell[t3] = -1;
      o2++;
    }
    this.live = o2;
    let u2 = this.uniforms.uSunDir.value, d2 = u2.x * K, f2 = u2.y * K, p2 = u2.z * K, m2 = 1 - Math.exp(-e4 * 10);
    for (let e5 = 0; e5 < a2; e5++) {
      if (s2.life[e5] < 0) continue;
      let t3 = 0, n3 = 0;
      if (s2.cell[e5] >= 0) {
        let r3 = s2.cell[e5], i3 = s2.px[e5] - l2.x, a3 = s2.py[e5] - l2.y, o3 = s2.pz[e5] - l2.z;
        for (let e6 = 0; e6 < 5; e6++) {
          i3 += d2, a3 += f2, o3 += p2;
          let e7 = i3 / K | 0, n4 = a3 / K | 0, s3 = o3 / K | 0;
          if (e7 < 0 || e7 >= W || n4 < 0 || n4 >= G || s3 < 0 || s3 >= Ce) break;
          let l3 = e7 + W * (n4 + G * s3);
          l3 !== r3 && (t3 += c2[l3]);
        }
        i3 = s2.px[e5] - l2.x, a3 = s2.py[e5] - l2.y, o3 = s2.pz[e5] - l2.z;
        let u3 = i3 / K | 0, m3 = o3 / K | 0;
        for (let e6 = 1; e6 < 4; e6++) {
          let t4 = (a3 / K | 0) + e6;
          if (t4 >= G) break;
          n3 += c2[u3 + W * (t4 + G * m3)];
        }
      }
      s2.sunT[e5] += (Math.exp(-t3 * 0.42) - s2.sunT[e5]) * m2, s2.skyT[e5] += (0.45 + 0.55 * Math.exp(-n3 * 0.5) - s2.skyT[e5]) * m2;
    }
    t2.updateMatrixWorld();
    let h2 = t2.matrixWorld.elements, g2 = h2[12], _2 = h2[13], v2 = h2[14], y2 = -h2[8], b2 = -h2[9], x2 = -h2[10];
    this.right.set(h2[0], h2[1], h2[2]);
    let S2 = this.keys, C2 = 0;
    for (let e5 = 0; e5 < a2; e5++) {
      if (s2.life[e5] < 0 || s2.alpha[e5] < 4e-3) {
        S2[e5] = 4294967295;
        continue;
      }
      let t3 = (s2.px[e5] - g2) * y2 + (s2.py[e5] - _2) * b2 + (s2.pz[e5] - v2) * x2;
      if (t3 < -s2.size[e5]) {
        S2[e5] = 4294967295;
        continue;
      }
      S2[e5] = (65535 - Math.max(0, Math.min(65535, (t3 + 8) * 48 | 0))) * 65536 + e5, C2++;
    }
    S2.sort();
    let w2 = this.instances;
    for (let e5 = 0; e5 < C2; e5++) {
      let t3 = S2[e5] & 65535, n3 = e5 * 12;
      w2[n3] = s2.px[t3], w2[n3 + 1] = s2.py[t3], w2[n3 + 2] = s2.pz[t3], w2[n3 + 3] = s2.size[t3], w2[n3 + 4] = s2.rot[t3], w2[n3 + 5] = s2.alpha[t3], w2[n3 + 6] = s2.variant[t3] + 16 * Math.round(s2.dust[t3] * 15), w2[n3 + 7] = s2.seed[t3] * 20 + s2.age[t3], w2[n3 + 8] = s2.sunT[t3], w2[n3 + 9] = s2.skyT[t3], w2[n3 + 10] = 0, w2[n3 + 11] = 0;
    }
    this.visible = C2, this.mesh.geometry.instanceCount = C2, C2 && (this.buffer.clearUpdateRanges(), this.buffer.addUpdateRange(0, C2 * 12), this.buffer.needsUpdate = true);
  }
  dispose() {
    this.mesh.geometry.dispose(), this.material.dispose();
  }
}, Te = `attribute vec3 aColor;attribute float aSize,aAlpha;uniform float uScale;varying vec3 vColor;varying float vAlpha;
void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;float px=aSize*uScale/max(.1,-mv.z);gl_PointSize=clamp(px,1.,7.);vColor=aColor;vAlpha=aAlpha*clamp(px,.15,1.);}`, Ee = `varying vec3 vColor;varying float vAlpha;void main(){vec2 p=gl_PointCoord*2.-1.;float d=dot(p,p);if(d>1.)discard;gl_FragColor=vec4(vColor,vAlpha*(1.-d*d));}`, De = [`position`, `aColor`, `aSize`, `aAlpha`], Oe = class {
  constructor(e4, t2 = 420) {
    this.max = t2, this.cursor = 0, this.live = 0;
    let n2 = (e5) => new Float32Array(t2 * e5);
    this.p = n2(3), this.v = n2(3), this.age = n2(1), this.life = n2(1).fill(-1), this.s = n2(1), this.c = n2(3), this.pos = n2(3), this.col = n2(3), this.sz = n2(1), this.al = n2(1);
    let r2 = new h();
    for (let [e5, t3, n3] of [[`position`, this.pos, 3], [`aColor`, this.col, 3], [`aSize`, this.sz, 1], [`aAlpha`, this.al, 1]]) r2.setAttribute(e5, new d(t3, n3).setUsage(l));
    r2.setDrawRange(0, 0), this.material = new a({ uniforms: { uScale: { value: 800 } }, vertexShader: Te, fragmentShader: Ee, transparent: true, depthWrite: false, toneMapped: false }), this.points = new re(r2, this.material), this.points.frustumCulled = false, this.points.userData.noAO = true, this.points.renderOrder = 3, e4.add(this.points);
  }
  emit(e4, t2, n2, r2, i2, a2, o2, s2, c2, l2, u2) {
    let d2 = this.cursor;
    this.cursor = (d2 + 1) % this.max;
    let f2 = d2 * 3;
    this.p[f2] = e4, this.p[f2 + 1] = t2, this.p[f2 + 2] = n2, this.v[f2] = r2, this.v[f2 + 1] = i2, this.v[f2 + 2] = a2, this.age[d2] = 0, this.life[d2] = s2, this.s[d2] = o2, this.c[f2] = c2, this.c[f2 + 1] = l2, this.c[f2 + 2] = u2;
  }
  clear() {
    this.life.fill(-1), this.live = 0, this.points.geometry.setDrawRange(0, 0);
  }
  update(e4, t2, n2, r2) {
    let i2 = 0, a2 = Math.exp(-e4 * 0.8);
    for (let t3 = 0; t3 < this.max; t3++) {
      if (this.life[t3] < 0) continue;
      if (this.age[t3] += e4, this.age[t3] >= this.life[t3]) {
        this.life[t3] = -1;
        continue;
      }
      let n3 = t3 * 3;
      this.v[n3 + 1] -= 9.8 * e4, this.v[n3] *= a2, this.v[n3 + 1] *= a2, this.v[n3 + 2] *= a2, this.p[n3] += this.v[n3] * e4, this.p[n3 + 1] += this.v[n3 + 1] * e4, this.p[n3 + 2] += this.v[n3 + 2] * e4;
      let o3 = r2 ? r2.at(this.p[n3], this.p[n3 + 1], this.p[n3 + 2]) : -1 / 0;
      this.p[n3 + 1] < o3 + 0.02 && (this.p[n3 + 1] = o3 + 0.02, this.v[n3 + 1] = Math.abs(this.v[n3 + 1]) * 0.25, this.v[n3] *= 0.6, this.v[n3 + 2] *= 0.6);
      let s2 = i2 * 3, c2 = this.age[t3] / this.life[t3];
      this.pos[s2] = this.p[n3], this.pos[s2 + 1] = this.p[n3 + 1], this.pos[s2 + 2] = this.p[n3 + 2], this.col[s2] = this.c[n3], this.col[s2 + 1] = this.c[n3 + 1], this.col[s2 + 2] = this.c[n3 + 2], this.sz[i2] = this.s[t3], this.al[i2] = 0.9 * (1 - c2 * c2), i2++;
    }
    let o2 = this.points.geometry;
    if (o2.setDrawRange(0, i2), i2) for (let e5 = 0; e5 < 4; e5++) {
      let t3 = o2.attributes[De[e5]];
      t3.clearUpdateRanges(), t3.addUpdateRange(0, i2 * t3.itemSize), t3.needsUpdate = true;
    }
    this.live = i2, this.material.uniforms.uScale.value = n2 / (2 * Math.tan(t2.fov * Math.PI / 360));
  }
  dispose() {
    this.points.geometry.dispose(), this.material.dispose();
  }
}, ke = class {
  constructor() {
    this.N = 512, this.key = new Int32Array(this.N).fill(-2147483647), this.x = new Float32Array(this.N), this.y = new Float32Array(this.N), this.dx = new Float32Array(this.N), this.bank = new Float32Array(this.N), this.none = new Uint8Array(this.N), this.level = null, this.plane = -1 / 0, this.flat = false;
  }
  prepare(e4, t2, n2) {
    e4 !== this.level && (this.level = e4, this.key.fill(-2147483647)), this.flat = t2 || !e4, this.plane = n2;
  }
  entry(e4) {
    let t2 = e4 & this.N - 1;
    if (this.key[t2] !== e4) {
      let n2 = this.level, r2 = p(n2, e4);
      this.key[t2] = e4, this.x[t2] = r2.x, this.y[t2] = r2.y, this.dx[t2] = r2.dx, this.bank[t2] = r2.bank;
      let i2 = +(e4 < 0 || e4 > n2.length + 80 || Math.abs(r2.bank) > 0.35);
      for (let t3 = 0; t3 < n2.gaps.length; t3++) e4 > n2.gaps[t3][0] && e4 < n2.gaps[t3][1] && (i2 = 1);
      this.none[t2] = i2;
    }
    return t2;
  }
  at(e4, t2, n2) {
    if (this.flat) return this.plane;
    let r2 = this.entry(Math.floor(-n2)), i2 = -n2 + (e4 - this.x[r2]) * this.dx[r2], a2 = Math.floor(i2), o2 = i2 - a2, s2 = this.entry(a2), c2 = this.entry(a2 + 1);
    if (this.none[o2 < 0.5 ? s2 : c2]) return -1 / 0;
    let l2 = this.level, u2 = this.x[s2] + (this.x[c2] - this.x[s2]) * o2, d2 = this.y[s2] + (this.y[c2] - this.y[s2]) * o2, f2 = this.bank[s2], p2 = this.dx[s2], m2 = (e4 - u2) * Math.sqrt(1 + p2 * p2) / Math.cos(f2), h2 = d2 + m2 * Math.sin(f2);
    for (let e5 = 0; e5 < l2.shortcuts.length; e5++) {
      let n3 = l2.shortcuts[e5];
      if (i2 >= n3.start && i2 <= n3.end && Math.abs(m2 - n3.l) < 5.5 && t2 > h2 + n3.height - 1.4) return h2 + n3.height;
    }
    return Math.abs(m2) > l2.width + 0.35 ? -1 / 0 : h2;
  }
}, Ae = { snow: { dust: [0.84, 0.93, 0.98], grit: [0.7, 0.84, 0.91] }, asphalt: { dust: [0.42, 0.41, 0.39], grit: [0.16, 0.155, 0.15] }, limestone: { dust: [0.66, 0.62, 0.53], grit: [0.46, 0.43, 0.37] }, concrete: { dust: [0.6, 0.58, 0.54], grit: [0.36, 0.35, 0.33] }, sand: { dust: [0.62, 0.4, 0.26], grit: [0.4, 0.24, 0.14] }, rock: { dust: [0.55, 0.38, 0.27], grit: [0.3, 0.19, 0.12] } }, je = `
 float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
 float noise3(vec3 x){vec3 p=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(hash(p),hash(p+vec3(1,0,0)),f.x),mix(hash(p+vec3(0,1,0)),hash(p+vec3(1,1,0)),f.x),f.y),mix(mix(hash(p+vec3(0,0,1)),hash(p+vec3(1,0,1)),f.x),mix(hash(p+vec3(0,1,1)),hash(p+vec3(1,1,1)),f.x),f.y),f.z);}
`, Me = `attribute float aDisc;varying vec2 vUv;varying float vHeight,vFacing,vDisc;uniform float uTime,uSeed;
void main(){vUv=uv;vDisc=aDisc;vec3 p=position;p.x+=sin(uv.y*21.-uTime*41.+uSeed)*.016*uv.y*(1.-aDisc);
 vec4 w=modelMatrix*vec4(p,1.);vHeight=w.y;vec3 n=normalize(mat3(modelMatrix)*normal);vFacing=abs(dot(n,normalize(cameraPosition-w.xyz)));
 gl_Position=projectionMatrix*viewMatrix*w;}`, Ne = `
 varying vec2 vUv;varying float vHeight,vFacing,vDisc;uniform float uTime,uPower,uSeed,uFloor,uFlash;uniform vec3 uLit;
 ${je}
 void main(){
  float a;float core;
  if(vDisc>.5){float r=length(vUv-.5)*2.;core=exp(-r*r*7.);a=core*smoothstep(.25,.85,vFacing)*.95;}
  else{float t=clamp(vUv.y,0.,1.),x=(vUv.x-.5)*2.,radius=.1+.9*pow(t,.7);
   float n=noise3(vec3(x*5.+uSeed,t*9.-uTime*26.,uSeed)),n2=noise3(vec3(x*11.,t*23.-uTime*49.,uSeed+3.));
   core=exp(-pow(x/(radius*.38+.03),2.))*(1.-smoothstep(.2,.8,t));
   float body=(1.-smoothstep(radius*.45,radius,abs(x)+(n-.5)*.34*t))*(1.-smoothstep(.3,1.,t));
   float knots=.8+.2*sin(t*36.-uTime*63.+uSeed)*(1.-t);
   a=(core*.9+body*(.22+.5*n2))*knots*smoothstep(.1,.45,vFacing);}
  a*=uPower*(1.+uFlash*.5)*smoothstep(uFloor+.02,uFloor+.32,vHeight);
  // Dense condensate is lit white; a launch pressure pulse briefly brightens the core.
  vec3 col=uLit*(1.+core*(.3+uFlash*1.7));
  gl_FragColor=vec4(col,clamp(a,0.,.95));
 }`, Pe = { rear: 28, lift: 72, yaw: 96, sheet: 128 }, q = new g(), J = new g();
new g();
var Y = new g(), X = new g(), Z = new g(), Q = new g();
new k();
var $ = (e4, t2) => e4 + Math.random() * (t2 - e4);
function Fe(e4) {
  let t2 = [];
  for (let n3 = 0; n3 < 3; n3++) {
    let r3 = new T(e4, 1, 1, 8);
    r3.translate(0, 0.5, 0), r3.rotateY(n3 * Math.PI / 3), r3.setAttribute(`aDisc`, new c(new Float32Array(r3.attributes.position.count), 1)), t2.push(r3);
  }
  let n2 = new T(e4 * 0.62, e4 * 0.62);
  n2.rotateX(-Math.PI / 2), n2.translate(0, 0.04, 0), n2.setAttribute(`aDisc`, new c(new Float32Array(4).fill(1), 1)), t2.push(n2);
  let r2 = w(t2, false);
  for (let e5 of t2) e5.dispose();
  return r2;
}
var Ie = class {
  constructor(e4, t2, n2, r2) {
    this.car = t2, this.camera = n2, this.world = r2, this.scene = e4, this.time = 0, this.power = 0, this.lastPosition = t2.position.clone(), this.velocity = new g(), this.delta = new g(), this.wasOn = false, this.visiblePuffs = 0, this.flash = 0, this.tail = 1.3, this.field = new we({ max: 2400, quality: r2.quality || `high` }), this.field.setLighting(r2), this.field.useSunShadow(r2.sun), e4.userData.vapour = this.field, r2.renderer && this.field.attach(r2.renderer, null), this.grit = new Oe(e4), this.ground = new ke(), this.floor = -1 / 0;
    let i2 = !!r2.canyon;
    this.surface = i2 ? `sand` : `asphalt`, this.dust = new _(), this.gritColor = new _(), this.setSurface(this.surface);
    let o2 = this.field.uniforms;
    this.lit = new _().copy(o2.uSunColor.value).multiplyScalar(0.62).add(o2.uSkyColor.value).multiplyScalar(0.9), this.emitters = [], this.cores = new S(), t2.add(this.cores);
    let s2 = t2.userData.propulsion, c2 = (s2.lift || []).filter((e5) => e5.z > 0).map((e5) => e5.clone().add(new g((Math.sign(e5.x) || 1) * 0.12, 0.2, 0))), l2 = [[`rear`, s2.rear, () => new g(0, 0, 1)], [`lift`, s2.lift, () => new g(0, -1, 0)], [`yaw`, s2.yaw || [], (e5) => new g(Math.sign(e5.x) || 1, 0, 0)], [`yawRear`, s2.yaw?.length ? c2 : [], (e5) => new g(Math.sign(e5.x) || 1, 0, 0)]], u2 = { rear: Fe(0.62), lift: Fe(0.82), yaw: Fe(0.78) };
    u2.yawRear = u2.yaw, this.geometries = u2;
    for (let [e5, t3, n3] of l2) for (let r3 = 0; r3 < t3.length; r3++) {
      let i3 = n3(t3[r3]), o3 = new S();
      o3.userData.noAO = true, o3.position.copy(t3[r3]).addScaledVector(i3, 0.015), o3.quaternion.setFromUnitVectors(new g(0, 1, 0), i3);
      let s3 = new a({ uniforms: { uTime: { value: 0 }, uPower: { value: 0 }, uFlash: { value: 0 }, uFloor: { value: -1e4 }, uSeed: { value: r3 * 7.31 + ({ rear: 4, yaw: 9, yawRear: 13 }[e5] || 0) }, uLit: { value: this.lit } }, vertexShader: Me, fragmentShader: Ne, transparent: true, depthWrite: false, side: 2, blending: 1, toneMapped: false }), c3 = new F(u2[e5], s3);
      c3.renderOrder = 4, c3.frustumCulled = false, o3.add(c3), this.cores.add(o3), this.emitters.push({ kind: e5, anchor: o3.position.clone(), direction: i3, root: o3, mat: s3, index: r3, power: 0, pulse: 0, acc: 0, sheet: 0, flash: 0, base: 0, cool: 0, burst: 0, len: 1 });
    }
    this.attitude = { ready: false, roll: 0, pitch: 0, yaw: 0, rates: new g(), accel: new g(), source: `euler` }, this.trimTimer = 0, this.flare = 0, this.wingDeploy = 0;
  }
  setSurface(e4) {
    let t2 = Ae[e4] || Ae.asphalt;
    this.surface = e4, this.dust.setRGB(...t2.dust), this.gritColor.setRGB(...t2.grit), this.field.uniforms.uDustColor.value.copy(this.dust);
  }
  sampleSurface(e4) {
    let t2 = this.world.gasSurface?.(e4), n2 = this.car.position, r2 = false, i2 = -1 / 0;
    if (t2?.road) if (i2 = t2.surface === false ? -1 / 0 : t2.road.y, !e4.level) r2 = true;
    else {
      let t3 = ie(e4.level, e4.s || 0, e4.l || 0, e4.h || 0);
      r2 = Math.abs(t3.x - n2.x) + Math.abs(t3.y - n2.y) + Math.abs(t3.z - n2.z) > 4;
    }
    this.ground.prepare(e4.level || null, r2, i2);
    let a2 = t2?.material || (this.world.canyon ? `sand` : `asphalt`);
    if (!t2?.material && e4.level) for (let t3 of e4.level.shortcuts) e4.s >= t3.start && e4.s <= t3.end && Math.abs((e4.l || 0) - t3.l) < 5.5 && (a2 = `concrete`);
    a2 !== this.surface && this.setSurface(a2), this.floor = this.ground.at(n2.x, n2.y, n2.z);
  }
  jetPuffs(e4, t2, n2, r2, i2, a2, o2, s2, c2, l2, u2, d2, f2 = 0) {
    let p2 = this.field, m2 = this.delta, h2 = this.velocity, g2 = e4.len;
    for (let e5 = 0; e5 < t2; e5++) {
      let e6 = $(n2, 1), t3 = Math.random(), _2 = q.x + J.x * g2 * e6 - m2.x * t3, v2 = q.y + J.y * g2 * e6 - m2.y * t3, y2 = q.z + J.z * g2 * e6 - m2.z * t3, b2 = r2 * $(0.75, 1.2), x2 = Math.random() * 6.2832, S2 = Math.cos(x2), C2 = Math.sin(x2), w2 = J.x * b2 + h2.x * i2 + $(-3, 3), T2 = J.y * b2 + h2.y * i2 + $(-1.5, 1.5), E2 = J.z * b2 + h2.z * i2 + $(-3, 3);
      p2.spawn(_2 + $(-0.25, 0.25), v2, y2 + $(-0.25, 0.25), w2, T2, E2, a2 * $(0.8, 1.2), o2 * $(0.8, 1.2), f2 ? f2 * $(0.85, 1.15) : $(1.6, 2.6), s2 * $(0.75, 1.25), c2 * $(0.85, 1.1), l2, u2, d2, 0, S2, C2, this.spinFor(w2, E2));
    }
  }
  spinFor(e4, t2) {
    let n2 = this.field.right;
    return -Math.sign(e4 * n2.x + t2 * n2.z || 1) * $(0.25, 0.9);
  }
  ring(e4, t2, n2, r2, i2, a2, o2, s2, c2, l2, u2) {
    let d2 = this.field, f2 = this.velocity, p2 = d2.scale, m2 = Z, h2 = Q, g2 = Math.round(i2 * p2 * 1.2);
    for (let i3 = 0; i3 < g2; i3++) {
      let u3 = (i3 + Math.random() * 0.6) / g2 * 6.2832, p3 = Math.cos(u3), _3 = Math.sin(u3), v3 = h2.x * p3 * 1.7 + m2.x * _3 * 2.3, y2 = h2.z * p3 * 1.7 + m2.z * _3 * 2.3, b2 = Math.hypot(v3, y2) || 1, x2 = v3 / b2, S2 = y2 / b2, C2 = $(0.45, 1), w2 = Math.abs(p3), T2 = a2 * $(0.7, 1.25) * r2 * (0.75 + 0.55 * w2), E2 = +(i3 < g2 * l2), D2 = s2 * $(0.6, 1.15);
      d2.spawn(e4 + v3 * C2, t2 + $(0.2, 0.6), n2 + y2 * C2, x2 * T2 + f2.x * D2, o2 * $(0.2, 1.1) + f2.y * D2 * 0.2, S2 * T2 + f2.z * D2, $(1.1, 1.6), (E2 ? $(3, 4.2) : $(5, 7.6)) * (0.75 + 0.4 * r2), $(0.75, 1.25), c2 * $(0.75, 1.3) * (E2 ? 0.75 : 1), E2 ? $(0.24, 0.34) : $(0.34, 0.48), $(1.9, 2.6), E2 ? 0.1 : $(0.15, 0.4), 1.3, E2, x2, S2, this.spinFor(x2 * T2, S2 * T2));
    }
    for (let a3 = 0; a3 < Math.round(i2 * 0.24 * p2); a3++) {
      let i3 = Math.random() * 6.2832, a4 = $(0, 1.6);
      d2.spawn(e4 + Math.cos(i3) * a4, t2 + $(0.3, 1), n2 + Math.sin(i3) * a4, Math.cos(i3) * $(1, 3.5) + f2.x * s2, $(1.5, 5) * r2, Math.sin(i3) * $(1, 3.5) + f2.z * s2, $(1, 1.4), $(3.4, 5) * (0.8 + 0.3 * r2), $(0.6, 1), c2 * $(0.8, 1.2), $(0.38, 0.52), 1.3, $(0.3, 0.7), 1.6, 0, Math.cos(i3), Math.sin(i3), $(-0.6, 0.6));
    }
    let _2 = this.gritColor, v2 = this.grit;
    for (let i3 = 0; i3 < Math.round(u2 * p2); i3++) {
      let i4 = Math.random() * 6.2832, a3 = $(5, 17) * r2, o3 = $(0.7, 1.35);
      v2.emit(e4 + Math.cos(i4) * $(0.4, 1.6), t2 + 0.05, n2 + Math.sin(i4) * $(0.4, 1.6), Math.cos(i4) * a3 + f2.x * s2 * $(0.5, 1), $(1.5, 7) * r2, Math.sin(i4) * a3 + f2.z * s2 * $(0.5, 1), $(0.025, 0.07), $(0.5, 1.3), _2.r * o3, _2.g * o3, _2.b * o3);
    }
  }
  groundUnder() {
    let e4 = this.car.position, t2 = this.ground.at(e4.x, e4.y, e4.z);
    if (X.copy(e4), !Number.isFinite(t2)) {
      let n2 = Y.copy(this.velocity).setY(0), r2 = n2.length();
      if (r2 > 0.5) {
        n2.multiplyScalar(-1 / r2);
        for (let r3 = 1; r3 <= 12 && (X.copy(e4).addScaledVector(n2, r3), t2 = this.ground.at(X.x, X.y, X.z), !Number.isFinite(t2)); r3++) ;
      }
    }
    return t2;
  }
  launch(e4) {
    let t2 = this.groundUnder();
    this.flash = 1;
    for (let e5 of this.emitters) e5.flash = 1, (e5.kind === `yaw` || e5.kind === `yawRear`) && (e5.pulse = Math.max(e5.pulse, 0.95));
    let n2 = e4.boosting;
    Number.isFinite(t2) && this.car.position.y - t2 < 8 && this.ring(X.x, t2, X.z, n2 ? 1.1 : 0.8, n2 ? 150 : 96, n2 ? 16 : 11, n2 ? 2.4 : 1.6, n2 ? 0.45 : 0.35, n2 ? 4.2 : 3.2, n2 ? 0.18 : 0.4, n2 ? 170 : 90);
    for (let e5 of this.emitters) e5.kind === `lift` && (this.nozzle(e5), this.jetPuffs(e5, Math.round((n2 ? 8 : 5) * this.field.scale), 0, 26, 0.85, 0.3, 1.8, 0.6, 0.75, 2.4, 0, 0.7));
  }
  landing(e4, t2, n2, r2) {
    let i2 = this.groundUnder();
    if (!Number.isFinite(i2)) return;
    let a2 = D(t2 ?? 0.4, 0, 1), o2 = (r2 ? 1.15 : 0.6 + 0.45 * a2) + (n2 ? 0.12 : 0);
    this.ring(X.x, i2, X.z, o2, (r2 ? 130 : 70) + 70 * a2, (r2 ? 14 : 10) + 6 * a2, 1.2 + 1.5 * a2, 0.42, 3.2 + 1.4 * a2, 0.26, 60 + 100 * a2);
  }
  nitroKick(e4) {
    let t2 = this.field.scale;
    for (let n2 of this.emitters) n2.kind === `rear` && (n2.flash = Math.max(n2.flash, e4 >= 3 ? 1 : e4 >= 2 ? 0.75 : 0.45), this.nozzle(n2), this.jetPuffs(n2, Math.round((e4 >= 3 ? 12 : e4 >= 2 ? 7 : 4) * t2), 0, e4 >= 3 ? 40 : 30, 0.85, 0.5, 3.4, 1.1, 0.5, 1.3, 0.08, 1.2, 3.4));
    if (e4 >= 3) {
      let e5 = this.groundUnder();
      Number.isFinite(e5) && this.car.position.y - e5 < 4 && this.ring(X.x, e5, X.z, 1, 80, 22, 0.8, 0.85, 1.7, 0.15, 40);
    }
  }
  scrape(e4) {
    let t2 = this.car.position, n2 = (e4.l || 0) >= 0 ? 1 : -1, r2 = this.grit, i2 = this.velocity;
    for (let e5 = 0; e5 < 10; e5++) {
      let e6 = $(0.7, 1.4);
      r2.emit(t2.x + Q.x * n2 * 0.95 + Z.x * $(-1.6, 1.6), t2.y + $(0.2, 0.6), t2.z + Q.z * n2 * 0.95 + Z.z * $(-1.6, 1.6), i2.x * 0.7 + Q.x * n2 * $(1, 4) + $(-1.5, 1.5), $(1, 4), i2.z * 0.7 + Q.z * n2 * $(1, 4) + $(-1.5, 1.5), $(0.03, 0.06), $(0.18, 0.45), 1.7 * e6, 1.05 * e6, 0.42 * e6);
    }
  }
  nozzle(e4) {
    q.copy(e4.anchor).applyMatrix4(this.car.matrixWorld), J.copy(e4.direction).transformDirection(this.car.matrixWorld);
  }
  update(e4, t2) {
    this.time += e4;
    let n2 = t2.phase === `running` && t2.boosting, r2 = this.car, i2 = t2.phase === `running` ? t2.nitro | 0 : 0;
    r2.updateMatrixWorld(true), this.camera.updateMatrixWorld(), this.delta.copy(r2.position).sub(this.lastPosition), e4 > 0 && this.delta.lengthSq() < 144 ? this.velocity.copy(this.delta).divideScalar(e4) : (this.velocity.set(0, 0, 0), this.delta.lengthSq() >= 144 && this.delta.set(0, 0, 0)), this.lastPosition.copy(r2.position), this.sampleSurface(t2);
    let a2 = this.floor;
    this.reactionControl(e4, t2), Z.set(0, 0, -1).transformDirection(r2.matrixWorld).setY(0), Z.lengthSq() < 1e-4 && Z.set(0, 0, -1), Z.normalize(), Q.set(-Z.z, 0, Z.x), this.flash = Math.max(0, this.flash - e4 * 6);
    for (let n3 of this.emitters) {
      n3.flash = Math.max(0, n3.flash - e4 * 6.5);
      let r3 = n3.mat.uniforms;
      r3.uFloor.value = Number.isFinite(a2) ? a2 : -1e4, r3.uTime.value = this.time, r3.uPower.value = n3.power, r3.uFlash.value = n3.flash;
      let o3 = n3.kind === `yaw` || n3.kind === `yawRear`;
      n3.len = n3.kind === `rear` ? (1.7 + t2.v * 0.012) * (0.45 + 0.55 * n3.power) * (i2 >= 2 ? 1.5 : i2 ? 1.2 : 1) * (1 + n3.flash * 0.35) : o3 ? (1.1 + 3.1 * n3.power) * (1 + n3.flash * 0.3) : (1.6 + 2.4 * n3.power) * (1 + n3.flash * 0.25), n3.root.scale.set(1 + n3.flash * 0.35, n3.len, 1 + n3.flash * 0.35), n3.root.visible = n3.power > 8e-3;
    }
    let o2 = t2.events.some((e5) => e5.type === `landingFlare`);
    for (let e5 of t2.events) e5.type === `launch` ? this.launch(t2) : e5.type === `land` ? this.landing(t2, e5.strength, e5.clean, o2) : e5.type === `recover` ? this.clear() : e5.type === `nitro` ? this.nitroKick(e5.level | 0) : e5.type === `scrape` && this.scrape(t2);
    let s2 = this.field, c2 = s2.scale;
    for (let t3 of this.emitters) {
      if (t3.power < 0.02 && !t3.burst) {
        t3.acc = 0, t3.sheet = 0;
        continue;
      }
      this.nozzle(t3);
      let n3 = t3.kind === `yaw` || t3.kind === `yawRear`;
      t3.burst &&= (this.jetPuffs(t3, Math.round((n3 ? 9 : 10) * c2), 0.25, n3 ? 26 : 24, 0.86, 0.24, n3 ? 1.8 : 1.4, 0.85, 0.6, n3 ? 1.4 : 2.2, 0.1, 0.9), 0), t3.acc += e4 * t3.power * Pe[n3 ? `yaw` : t3.kind] * (t3.kind === `rear` && i2 ? 1.7 : 1) * c2 * s2.room(q.x + J.x * t3.len, q.y + J.y * t3.len, q.z + J.z * t3.len);
      let r3 = Math.floor(t3.acc);
      if (t3.acc -= r3, r3 && (t3.kind === `lift` ? this.jetPuffs(t3, r3, 0.3, 17, 0.8, 0.55, 4.4, 2.2, 0.36, 0.9, 0.2, 2.2, 3.2) : t3.kind === `rear` ? i2 ? this.jetPuffs(t3, r3, 0.3, i2 >= 2 ? 30 : 24, 0.86, 0.45, 3.3, 1.35, 0.38, 1.15, 0.1, 1.5, 3) : this.jetPuffs(t3, r3, 0.6, 17, 0.88, 0.42, 2.9, 1.2, 0.32, 1.35, 0.12, 2) : this.jetPuffs(t3, r3, 0.05, 30, 0.92, 0.5, 3.4, 1.7, 0.4, 0.95, 0.1, 0.8, 3.6)), t3.kind === `lift` && J.y < -0.3 && Number.isFinite(a2)) {
        let n4 = (a2 - q.y) / J.y, r4 = 2 + 8 * t3.power;
        if (n4 > 0 && n4 < r4) {
          let i3 = (1 - n4 / r4) ** 0.6, o3 = q.x + J.x * n4, l3 = q.z + J.z * n4, u3 = this.velocity, d2 = Math.hypot(u3.x, u3.z);
          t3.sheet += e4 * t3.power * i3 * Pe.sheet * c2 * (1 + d2 / 45) * s2.room(o3, a2 + 1, l3);
          let f2 = Math.floor(t3.sheet);
          t3.sheet -= f2;
          let p2 = Math.sign(t3.anchor.x) || 1;
          for (let e5 = 0; e5 < f2; e5++) {
            let e6 = Math.atan2(Q.z * p2, Q.x * p2) + $(-1.25, 1.25), t4 = Math.cos(e6), n5 = Math.sin(e6), r5 = $(7, 16) * (0.5 + 0.5 * i3), c3 = Math.random(), d3 = $(0.3, 0.5);
            s2.spawn(o3 + t4 * $(0.3, 1.4) - this.delta.x * c3, a2 + $(0.15, 0.5), l3 + n5 * $(0.3, 1.4) - this.delta.z * c3, t4 * r5 + u3.x * d3, $(0.2, 1.2), n5 * r5 + u3.z * d3, $(1.4, 1.9), $(4.4, 6.6), $(0.8, 1.3), $(2.6, 4.2), $(0.28, 0.38), 1.7, $(0.06, 0.25), 1.5, +(Math.random() < 0.18), t4, n5, this.spinFor(t4, n5));
          }
          if (Math.random() < e4 * t3.power * i3 * 40 * c2) {
            let e5 = Math.random() * 6.2832, t4 = $(4, 12), n5 = this.gritColor, r5 = $(0.7, 1.3);
            this.grit.emit(o3, a2 + 0.04, l3, Math.cos(e5) * t4 + u3.x * 0.4, $(1, 4), Math.sin(e5) * t4 + u3.z * 0.4, $(0.02, 0.05), $(0.4, 1), n5.r * r5, n5.g * r5, n5.b * r5);
          }
        }
      }
    }
    this.power = 0;
    for (let e5 of this.emitters) (e5.kind === `rear` || e5.kind === `lift`) && (this.power = Math.max(this.power, e5.power));
    let l2 = s2.uniforms;
    l2.uCarView.value.copy(r2.position).applyMatrix4(this.camera.matrixWorldInverse), l2.uTailPos.value.set(0, 0.93, 2.36).applyMatrix4(r2.matrixWorld), l2.uTailColor.value.setRGB(0.9, 0.04, 0.02).multiplyScalar(0.05 * this.tail), l2.uCameraNear.value = this.camera.near, l2.uCameraFar.value = this.camera.far, s2.update(e4, this.camera, r2.position, this.ground), this.visiblePuffs = s2.live;
    let u2 = s2.attached?.domElement?.height || 900;
    this.grit.update(e4, this.camera, u2, this.ground), this.wasOn = n2;
  }
  reactionControl(e4, t2) {
    let n2 = this.car, r2 = this.attitude, i2 = !t2.grounded && t2.phase === `running`, a2 = t2.phase === `running` && t2.boosting, o2 = t2.phase === `running` ? t2.nitro | 0 : 0, s2 = Number.isFinite(t2.rollRate) || Number.isFinite(t2.flipRate) || Number.isFinite(t2.spinRate);
    if (r2.source = s2 ? `run` : `euler`, e4 > 0) {
      if (s2) Y.set(t2.rollRate || 0, -(t2.flipRate || 0), -(t2.spinRate || 0)), i2 || Y.set(0, 0, 0), r2.ready = true;
      else {
        let t3 = n2.rotation;
        Y.set(t3.z - r2.roll, t3.x - r2.pitch, t3.y - r2.yaw).divideScalar(e4), (!r2.ready || !i2) && (Y.set(0, 0, 0), r2.ready = true), r2.roll = t3.z, r2.pitch = t3.x, r2.yaw = t3.y;
      }
      X.copy(r2.rates), r2.rates.lerp(Y.clampScalar(-12, 12), 1 - Math.exp(-e4 * 25)), Y.copy(r2.rates).sub(X).divideScalar(e4), r2.accel.lerp(Y, 1 - Math.exp(-e4 * 18));
    }
    this.trimTimer -= e4;
    let c2 = i2 && this.trimTimer <= 0;
    c2 && (this.trimTimer = 0.35 + Math.random() * 0.6), this.flare = Math.max(0, this.flare - e4 * 2.2);
    for (let e5 of t2.events) e5.type === `land` && (this.flare = Math.max(this.flare, 0.6)), e5.type === `landingFlare` && (this.flare = 1);
    let l2 = i2 ? D(r2.accel.x / 14, -1, 1) : 0, u2 = i2 ? D(r2.accel.y / 8, -1, 1) : 0, d2 = i2 ? D(r2.accel.z / 5, -1, 1) : 0, f2 = s2 && i2 ? D(r2.rates.x / 7, -1, 1) * 0.3 : 0, p2 = s2 && i2 ? D(r2.rates.y / 6, -1, 1) * 0.3 : 0, m2 = s2 && i2 ? D(r2.rates.z / 6, -1, 1) * 0.3 : 0, h2 = s2 && i2 ? D((Math.abs(r2.rates.z) - 0.6) / 3.4, 0, 1) * 0.95 : 0;
    for (let n3 of this.emitters) {
      let s3 = 0;
      if (n3.kind === `rear`) s3 = Math.max(a2 ? 0.62 + D(t2.v / 80, 0, 0.38) : 0, o2 === 1 ? 0.92 : o2 >= 2 ? 1.15 : 0);
      else if (n3.kind === `lift`) {
        let e5 = Math.sign(n3.anchor.x) || 1, r3 = n3.anchor.z < 0 ? 1 : -1, i3 = e5 * r3;
        s3 = (a2 ? t2.grounded ? 0.6 : 0.85 : 0) + Math.max(0, e5 * (l2 + f2)) * 0.9 + Math.max(0, r3 * (u2 + p2)) * 0.6 + Math.max(0, i3 * (d2 + m2)) * 0.45 + this.flare, c2 && Math.random() < 0.4 && (n3.pulse = Math.max(n3.pulse, 0.25 + Math.random() * 0.2));
      } else {
        let e5 = (Math.sign(n3.anchor.x) || 1) * (n3.kind === `yawRear` ? -1 : 1);
        s3 = Math.max(0, e5 * (d2 + m2)) * 0.9 + (e5 * r2.rates.z > 0 ? h2 : 0), c2 && Math.random() < 0.15 && (n3.pulse = Math.max(n3.pulse, 0.3));
      }
      n3.pulse = Math.max(0, n3.pulse - e4 * 3.5), s3 = Math.min(1.15, s3 + n3.pulse), n3.cool -= e4, i2 && n3.kind !== `rear` && s3 - n3.base > 0.32 && n3.cool <= 0 && (n3.burst = 1, n3.flash = Math.max(n3.flash, 0.6), n3.cool = 0.24), n3.base = z.damp(n3.base, s3, 5, e4), n3.power = z.damp(n3.power, s3, s3 > n3.power ? 20 : 9, e4);
    }
    let g2 = n2.userData.wing;
    if (g2) {
      let n3 = t2.phase === `running` ? i2 || a2 ? 1 : t2.v > 45 ? 0.3 : 0 : 0;
      this.wingDeploy = z.damp(this.wingDeploy, n3, n3 > this.wingDeploy ? 5 : 3, e4);
      let r3 = g2.userData.deployHeight ?? 0.065, o3 = g2.userData.deployPitch ?? 0;
      g2.position.y = g2.userData.baseHeight + this.wingDeploy * r3, g2.rotation.x = this.wingDeploy * o3;
    }
  }
  clear() {
    this.field.clear(), this.grit.clear();
    for (let e4 of this.emitters) e4.power = 0, e4.pulse = 0, e4.acc = 0, e4.sheet = 0, e4.flash = 0, e4.base = 0, e4.burst = 0;
    this.flare = 0, this.flash = 0, this.attitude.ready = false, this.visiblePuffs = 0, this.power = 0, this.velocity.set(0, 0, 0), this.delta.set(0, 0, 0), this.lastPosition.copy(this.car.position);
  }
  snapshot() {
    return { rearNozzles: this.emitters.filter((e4) => e4.kind === `rear`).length, liftNozzles: this.emitters.filter((e4) => e4.kind === `lift`).length, yawPorts: this.emitters.filter((e4) => e4.kind === `yaw`).length, sideVents: this.emitters.filter((e4) => e4.kind === `yawRear`).length, power: this.power, jets: this.emitters.map((e4) => +e4.power.toFixed(2)), wing: +this.wingDeploy.toFixed(2), puffs: this.visiblePuffs, drawn: this.field.visible, grit: this.grit.live, surface: this.surface, attitude: this.attitude.source, combustionLight: false };
  }
}, Le = { sunbreak: { white: [1.05, 1, 0.94], exposure: 1.07, contrastLow: 1.14, contrastHigh: 1.05, pivot: 0.19, saturation: 1.12, vibrance: 0.4, warm: 1.08, cool: 1.24, warmHue: 0.06, coolHue: 0.16, shadow: [0.9, 0.99, 1.08], highlight: [1.1, 1, 0.86], split: 0, highlightSat: 0.55, vignette: 0.26, bloom: { strength: 0.3, radius: 0.5, threshold: 1.45 }, lines: [1, 0.95, 0.86] }, redline: { white: [1.04, 0.99, 0.95], exposure: 1.1, contrastLow: 1.14, contrastHigh: 1.06, pivot: 0.19, saturation: 1.1, vibrance: 0.3, warm: 1.07, cool: 1.28, warmHue: 0.22, coolHue: 0.45, shadow: [0.92, 0.98, 1.08], highlight: [1.1, 0.97, 0.88], split: 0.1, highlightSat: 0.5, vignette: 0.26, bloom: { strength: 0.32, radius: 0.52, threshold: 1.4 }, lines: [1, 0.9, 0.78] }, halo: { white: [0.98, 1, 1.04], exposure: 1, contrastLow: 1.18, contrastHigh: 1.04, pivot: 0.16, saturation: 1.14, vibrance: 0.38, warm: 1.12, cool: 1.18, warmHue: 0.08, coolHue: 0.22, shadow: [0.88, 0.97, 1.14], highlight: [1.08, 0.99, 0.9], split: -0.1, highlightSat: 0.45, vignette: 0.3, bloom: { strength: 0.42, radius: 0.6, threshold: 1.2 }, lines: [0.72, 0.88, 1] } }, Re = { high: { taps: 10, bloom: 1 }, balanced: { taps: 6, bloom: 0.8 } }, ze = class {
  constructor(e4, t2 = 140) {
    this.count = t2, this.data = [];
    let n2 = new h();
    n2.setAttribute(`position`, new d(new Float32Array(t2 * 6), 3)), n2.setAttribute(`color`, new d(new Float32Array(t2 * 6), 3)), this.material = new te({ vertexColors: true, transparent: true, opacity: 0, blending: 2, depthWrite: false, fog: false }), this.lines = new R(n2, this.material), this.lines.frustumCulled = false, this.lines.matrixAutoUpdate = false, this.lines.renderOrder = 4, this.lines.userData.noAO = true, e4.add(this.lines), this.tint = new _(1, 1, 1);
    for (let e5 = 0; e5 < t2; e5++) this.data.push(this.spawn({}, true));
  }
  spawn(e4, t2) {
    let n2 = Math.random() * Math.PI * 2, r2 = 3.4 + Math.random() * 15;
    return e4.x = Math.cos(n2) * r2, e4.y = Math.sin(n2) * r2 * 0.6 + 0.6, e4.z = t2 ? -8 - Math.random() * 140 : -120 - Math.random() * 35, e4.k = 0.55 + Math.random() * 0.9, e4.b = 0.5 + Math.random() * 0.5, e4;
  }
  update(e4, t2, n2, r2) {
    if (r2.updateMatrixWorld(), this.lines.matrix.copy(r2.matrixWorld), this.lines.matrixWorldNeedsUpdate = true, this.material.opacity = n2, this.lines.visible = n2 > 4e-3, !this.lines.visible) return;
    let i2 = this.lines.geometry.attributes.position.array, a2 = this.lines.geometry.attributes.color.array, o2 = this.tint;
    for (let n3 = 0; n3 < this.count; n3++) {
      let r3 = this.data[n3];
      r3.z += e4 * t2 * 1.2, r3.z > 1.5 && this.spawn(r3, false);
      let s2 = 1 + t2 * 0.075 * r3.k, c2 = n3 * 6;
      i2[c2] = r3.x, i2[c2 + 1] = r3.y, i2[c2 + 2] = r3.z, i2[c2 + 3] = r3.x, i2[c2 + 4] = r3.y, i2[c2 + 5] = r3.z - s2;
      let l2 = D((r3.z + 120) / 30, 0, 1) * r3.b * 1.25;
      a2[c2] = o2.r * l2, a2[c2 + 1] = o2.g * l2, a2[c2 + 2] = o2.b * l2, a2[c2 + 3] = a2[c2 + 4] = a2[c2 + 5] = 0;
    }
    this.lines.geometry.attributes.position.needsUpdate = true, this.lines.geometry.attributes.color.needsUpdate = true;
  }
}, Be = class {
  constructor(e4, t2, n2, i2) {
    this.scene = e4, this.car = t2, this.camera = n2, this.time = 0, this.pool = 1500, this.cursor = 0, this.p = [], this.pos = new Float32Array(this.pool * 3), this.col = new Float32Array(this.pool * 3), this.sz = new Float32Array(this.pool), this.alpha = new Float32Array(this.pool);
    for (let e5 = 0; e5 < this.pool; e5++) this.p.push({ v: new g(), life: 0, max: 1, pos: new g(), size: 1, color: new _() });
    let o2 = new h();
    o2.setAttribute(`position`, new d(this.pos, 3)), o2.setAttribute(`aColor`, new d(this.col, 3)), o2.setAttribute(`aSize`, new d(this.sz, 1)), o2.setAttribute(`aAlpha`, new d(this.alpha, 1)), this.particles = new re(o2, new a({ transparent: true, depthWrite: false, blending: 2, vertexShader: `attribute vec3 aColor;attribute float aSize;attribute float aAlpha;varying vec3 vColor;varying float vAlpha;void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=min(80.,aSize*420./max(1.,-p.z));vColor=aColor;vAlpha=aAlpha;}`, fragmentShader: `varying vec3 vColor;varying float vAlpha;void main(){float d=length(gl_PointCoord-.5)*2.;float wisps=.65+.35*sin(gl_PointCoord.x*32.+sin(gl_PointCoord.y*23.)*3.);float a=pow(max(0.,1.-d),2.)*vAlpha*wisps;gl_FragColor=vec4(vColor,a);}` })), this.particles.frustumCulled = false, this.particles.userData.noAO = true, e4.add(this.particles), this.gas = new Ie(e4, t2, n2, i2), e4.userData.coldGas = this.gas;
    let s2 = Math.min(1, i2?.lighting?.windows ?? 1);
    this.headlights = [];
    for (let e5 of [-1, 1]) {
      let n3 = new m(14478079, 60 + 270 * s2, 62, 0.31, 0.55, 2);
      n3.position.set(e5 * 0.69, 0.47, -2.4), n3.target.position.set(e5 * 0.85, -0.03, -32), t2.add(n3, n3.target), this.headlights.push(n3);
    }
    this.brakes = [], t2.traverse((e5) => {
      e5.isMesh && e5.material.name === `Rear red lamp` && (e5.material = e5.material.clone(), this.brakes.push(e5.material));
    }), this.lastSpeed = 0, this.rings = [];
    for (let t3 = 0; t3 < 9; t3++) {
      let t4 = new F(new r(0.9, 1.07, 56), new V({ color: 11652040, transparent: true, opacity: 0, side: 2, depthWrite: false, blending: 2 }));
      t4.rotation.x = -Math.PI / 2, t4.userData.noAO = true, e4.add(t4), this.rings.push({ ring: t4, life: 0 });
    }
    this.trailN = 110, this.trailWritten = 0, this.trailPositions = new Float32Array(this.trailN * 2 * 3 * 2), this.trailColors = new Float32Array(this.trailPositions.length), this.history = [];
    let c2 = new h();
    c2.setAttribute(`position`, new d(this.trailPositions, 3)), c2.setAttribute(`color`, new d(this.trailColors, 3)), this.trails = new R(c2, new te({ vertexColors: true, transparent: true, opacity: 0.1, blending: 1, depthWrite: false })), this.trails.frustumCulled = false, this.trails.userData.noAO = true, e4.add(this.trails), this.wind = new ze(e4), this.windKick = 0, this.lastBoost = false;
    let l2 = Le[i2?.level?.id] || Le.sunbreak;
    this.wind.tint.setRGB(...l2.lines);
  }
  emit(e4, t2, n2, r2, i2) {
    let a2 = this.p[this.cursor++ % this.pool];
    a2.pos.copy(e4), a2.v.copy(t2), a2.color.set(n2), a2.size = r2, a2.life = a2.max = i2;
  }
  burst(e4, t2, n2 = 11924460, r2 = 7) {
    for (let i2 = 0; i2 < t2; i2++) this.emit(e4, new g((Math.random() - 0.5) * r2, Math.random() * r2 * 0.65, (Math.random() - 0.5) * r2), n2, 0.15 + Math.random() * 0.5, 0.4 + Math.random() * 0.8);
  }
  ring(e4, t2 = 1) {
    let n2 = this.rings.find((e5) => e5.life <= 0) || this.rings[0];
    n2.life = 1, n2.power = t2, n2.ring.position.copy(e4), n2.ring.position.y += 0.08;
  }
  update(e4, t2, n2 = {}) {
    this.time += e4;
    let r2 = e4 > 0 && (t2.v - this.lastSpeed) / e4 < -2;
    this.lastSpeed = t2.v;
    for (let t3 of this.brakes) t3.emissiveIntensity = z.damp(t3.emissiveIntensity, r2 ? 3.4 : 1.3, 10, e4);
    this.gas.tail = this.brakes[0]?.emissiveIntensity ?? 1.3, this.gas.update(e4, t2);
    let a2 = t2.phase === `running`;
    if (this.car.updateWorldMatrix(true, false), a2 && t2.drifting) for (let e5 of [-0.98, 0.98]) {
      let t3 = this.car.localToWorld(new g(e5, 0.08, 1.45));
      this.emit(t3, new g((Math.random() - 0.5) * 2, 0.7, 2), 13089697, 0.55, 0.65);
    }
    if (a2 && t2.v > 25 && Math.random() < 0.2) {
      let e5 = this.car.localToWorld(new g((Math.random() - 0.5) * 18, Math.random() * 7, -15));
      this.emit(e5, new g(0, 0, 5), 11912641, 0.035, 0.7);
    }
    for (let e5 of t2.events) {
      let t3 = this.car.position.clone();
      e5.type === `launch` && (this.windKick = 1), e5.type === `checkpoint` && (this.ring(t3, 3), this.burst(t3, 70, 7464922, 12)), e5.type === `cell` && this.burst(t3, 38, 16765048, 9), (e5.type === `impact` || e5.type === `recover`) && this.burst(t3, 60, 16753500, 11), e5.type === `roll` && this.burst(t3, 50, 8968437, 8);
    }
    let o2 = 0;
    for (let t3 = 0; t3 < this.pool; t3++) {
      let n3 = this.p[t3];
      if (n3.life <= 0) {
        this.sz[t3] !== 0 && (this.alpha[t3] = 0, this.sz[t3] = 0, o2++);
        continue;
      }
      if (n3.life -= e4, n3.life > 0) {
        n3.pos.addScaledVector(n3.v, e4), n3.v.multiplyScalar(1 - e4 * 0.5);
        let r3 = t3 * 3;
        this.pos[r3] = n3.pos.x, this.pos[r3 + 1] = n3.pos.y, this.pos[r3 + 2] = n3.pos.z, this.col[r3] = n3.color.r, this.col[r3 + 1] = n3.color.g, this.col[r3 + 2] = n3.color.b, this.sz[t3] = n3.size * (1 + (1 - n3.life / n3.max) * 1.3), this.alpha[t3] = Math.min(1, n3.life * 3) * 0.45;
      } else this.alpha[t3] = 0, this.sz[t3] = 0;
      o2++;
    }
    if (o2) for (let e5 of Object.values(this.particles.geometry.attributes)) e5.needsUpdate = true;
    for (let t3 of this.rings) if (t3.life > 0) {
      t3.life -= e4 * 1.5;
      let n3 = (1 - t3.life) * t3.power * 9 + 1;
      t3.ring.scale.setScalar(n3), t3.ring.material.opacity = Math.max(0, t3.life * 0.15);
    }
    if (a2 && t2.v > 12 ? (this.history.unshift({ a: this.car.localToWorld(new g(-0.7, 0.4, 2.3)), b: this.car.localToWorld(new g(0.7, 0.4, 2.3)), on: t2.boosting || !t2.grounded }), this.history.length > this.trailN && this.history.pop()) : this.history.length && this.history.pop(), this.history.length || this.trailWritten) {
      let e5 = this.trailPositions, t3 = this.trailColors, n3 = 0;
      for (let r4 = 1; r4 < this.history.length; r4++) {
        let i2 = this.history[r4 - 1], a3 = this.history[r4], o3 = i2.on ? (1 - r4 / this.trailN) ** 2 : 0;
        for (let r5 of [`a`, `b`]) {
          let s3 = i2[r5], c3 = a3[r5];
          e5[n3] = s3.x, e5[n3 + 1] = s3.y, e5[n3 + 2] = s3.z, e5[n3 + 3] = c3.x, e5[n3 + 4] = c3.y, e5[n3 + 5] = c3.z, t3[n3] = t3[n3 + 3] = 0.64 * o3, t3[n3 + 1] = t3[n3 + 4] = 0.73 * o3, t3[n3 + 2] = t3[n3 + 5] = 0.81 * o3, n3 += 6;
        }
      }
      n3 < this.trailWritten && (e5.fill(0, n3, this.trailWritten), t3.fill(0, n3, this.trailWritten));
      let r3 = Math.max(n3, this.trailWritten);
      this.trailWritten = n3;
      for (let e6 of [this.trails.geometry.attributes.position, this.trails.geometry.attributes.color]) e6.clearUpdateRanges(), e6.addUpdateRange(0, r3), e6.needsUpdate = true;
    }
    let s2 = t2.boosting || t2.nitro > 0;
    s2 && !this.lastBoost && (this.windKick = Math.max(this.windKick, 0.7)), this.lastBoost = s2, this.windKick = Math.max(0, this.windKick - e4 * 1.6);
    let c2 = a2 ? t2.v : 0, l2 = a2 ? Math.min(0.6, i(0.58, 1, t2.v / 74) * 0.38 + (s2 ? 0.16 : 0) + this.windKick * 0.2) * (1 - (n2.slow || 0) * 0.6) * (n2.motion === false ? 0.6 : 1) * (1 - (n2.cine || 0)) : 0;
    this.wind.update(e4, c2, l2, this.camera);
  }
  clear() {
    this.gas.clear(), this.history = [];
    for (let e4 of this.p) e4.life = 0;
    this.windKick = 0;
    for (let e4 of this.rings) e4.life = 0, e4.ring.material.opacity = 0;
    this.lastSpeed = 0, this.lastBoost = false;
  }
}, Ve = { defines: { TAPS: 10 }, uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAspect: { value: 1 }, uExposure: { value: 1 }, uCenter: { value: new f(0.5, 0.43) }, uBlur: { value: 0 }, uAberr: { value: 0 }, uVignette: { value: 0.26 }, uSlow: { value: 0 }, uLetterbox: { value: 0 }, uFlash: { value: 0 }, uFlashColor: { value: new _(1, 0.85, 0.6) }, uHeat: { value: 0 }, uGrain: { value: 0.012 }, uWhite: { value: new g(1, 1, 1) }, uShadowTint: { value: new g(1, 1, 1) }, uHighTint: { value: new g(1, 1, 1) }, uContrastLow: { value: 1 }, uContrastHigh: { value: 1 }, uPivot: { value: 0.18 }, uSaturation: { value: 1 }, uVibrance: { value: 0 }, uSatWarm: { value: 1 }, uSatCool: { value: 1 }, uWarmHue: { value: 0 }, uCoolHue: { value: 0 }, uSplit: { value: 0 }, uHighlightSat: { value: 0.5 } }, vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`, fragmentShader: `
 uniform sampler2D tDiffuse;uniform float uTime,uAspect,uExposure,uBlur,uAberr,uVignette,uSlow,uLetterbox,uFlash,uHeat,uGrain;uniform vec2 uCenter;uniform vec3 uFlashColor;
 uniform vec3 uWhite,uShadowTint,uHighTint;uniform float uContrastLow,uContrastHigh,uPivot,uSaturation,uVibrance,uSatWarm,uSatCool,uWarmHue,uCoolHue,uSplit,uHighlightSat;varying vec2 vUv;
 const vec3 LUMA=vec3(.2126,.7152,.0722);
 float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
 vec3 rrtOdt(vec3 v){vec3 a=v*(v+.0245786)-.000090537;vec3 b=v*(.983729*v+.4329510)+.238081;return a/b;}
 // The same filmic ACES fit three.js uses, so highlight roll-off is unchanged.
 vec3 filmic(vec3 c){c/=.6;c=mat3(.59719,.07600,.02840,.35458,.90834,.13383,.04823,.01566,.83777)*c;c=rrtOdt(c);c=mat3(1.60475,-.10208,-.00327,-.53108,1.10813,-.07276,-.07367,-.00605,1.07602)*c;return clamp(c,0.,1.);}
 void main(){
  vec2 d=vUv-uCenter;float r=length(d*vec2(uAspect,1.)*.75);
  // Speed blur streaks outward from a low focal point. The car and the road
  // ahead stay sharp; the edges carry the motion.
  float edge=smoothstep(.2,.78,r)*smoothstep(.55,1.05,length((vUv-vec2(.5,.62))/vec2(.24,.22)));
  vec3 base=texture2D(tDiffuse,vUv).rgb,c=base;
  // Where the edge mask is zero every tap reads the centre pixel, so the loop is skipped.
  if(uBlur>.0004&&edge>0.){vec3 acc=vec3(0.);float wsum=0.;for(int i=0;i<TAPS;i++){float t=float(i)/float(TAPS-1);float w=1.-t*.55;acc+=texture2D(tDiffuse,clamp(vUv-d*uBlur*edge*t,vec2(.001),vec2(.999))).rgb*w;wsum+=w;}c=acc/wsum;}
  if(uAberr>.00001&&edge>0.){vec2 o=d*uAberr*edge;c.r+=texture2D(tDiffuse,clamp(vUv+o,vec2(.001),vec2(.999))).r-base.r;c.b+=texture2D(tDiffuse,clamp(vUv-o,vec2(.001),vec2(.999))).b-base.b;}
  c=max(c,vec3(0.))*uExposure*uWhite;
  // Contrast in stops around mid grey: deeper shadows, gentler highlights.
  // The toe tapers back to neutral so deep shade keeps its detail.
  float L=max(dot(c,LUMA),1e-6),x=log2(L/uPivot),k=x<0.?mix(uContrastLow,1.,smoothstep(-2.,-5.5,x)):uContrastHigh,L2=uPivot*exp2(x*k);c*=L2/L;L=L2;
  // Split toning that preserves luminance.
  float hi=smoothstep(-3.,2.2,log2(L/uPivot)+uSplit);vec3 tint=mix(uShadowTint,uHighTint,hi);c*=tint/dot(tint,LUMA);
  // Saturation and vibrance, weighted by warm or cool hue, easing off in highlights.
  L=max(dot(c,LUMA),1e-6);float mx=max(c.r,max(c.g,c.b)),mn=min(c.r,min(c.g,c.b)),sat=(mx-mn)/max(mx,1e-6);
  float warm=smoothstep(-.12,.38,(c.r-c.b)/max(mx,1e-6));
  // Hue bias, like a polariser and warm film stock: cyan sky leans to blue,
  // yellow ochre leans to orange-red. Half the lost luminance is restored.
  float wH=smoothstep(.05,.4,(c.r-c.b)/max(mx,1e-6))*uWarmHue,cH=smoothstep(.05,.35,(c.b-c.r)/max(mx,1e-6))*uCoolHue;
  c.g-=wH*max(c.g-c.b,0.)+cH*max(c.g-c.r,0.)*.6;float Lh=max(dot(c,LUMA),1e-6);c*=mix(1.,L/Lh,.5);L=max(dot(c,LUMA),1e-6);
  float s=uSaturation*mix(uSatCool,uSatWarm,warm)*(1.+uVibrance*(1.-sat)*(1.-sat));
  s=mix(s,1.,smoothstep(.9,5.,L)*uHighlightSat);s*=1.-uSlow*.32;
  c=max(vec3(L)+(c-vec3(L))*s,vec3(0.));
  c=filmic(c);
  // Slow motion: a cooler, denser frame with a held breath at the edges.
  float dl=dot(c,LUMA);c=mix(c,c*vec3(.94,1.,1.07)*(1.+.06*(1.-dl)),uSlow*.6*(1.-dl));
  vec2 vd=(vUv-vec2(.5,.48))*vec2(1.18,.92);c*=1.-uVignette*smoothstep(.3,.95,length(vd)*1.25);
  c+=uFlashColor*uFlash*(.35+.65*smoothstep(.05,.7,r));
  c=mix(c,c*vec3(1.05,.97,.92),uHeat*.05);
  float bar=smoothstep(uLetterbox-.002,uLetterbox,vUv.y)*smoothstep(uLetterbox-.002,uLetterbox,1.-vUv.y);c*=mix(1.,bar,step(.0005,uLetterbox));
  c+=(hash(gl_FragCoord.xy+fract(uTime*7.3)*91.)-.5)*uGrain;
  // The grade is the last pass: it writes the display colour space directly.
  gl_FragColor=sRGBTransferOETF(vec4(clamp(c,0.,1.),1.));
 }` };
function He(e4, t2) {
  for (let [n2, r2] of Object.entries(L)) if (Math.abs(t2.backgroundIntensity - r2.background) < 1e-6 && Math.abs(e4.toneMappingExposure - r2.exposure) < 1e-6) return n2;
  return `sunbreak`;
}
var Ue = { uniforms: { tDiffuse: { value: null }, tAO: { value: null }, intensity: { value: 1 } }, vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`, fragmentShader: `uniform sampler2D tDiffuse,tAO;uniform float intensity;varying vec2 vUv;void main(){vec4 b=texture2D(tDiffuse,vUv),a=texture2D(tAO,vUv);gl_FragColor=vec4(b.rgb*mix(vec3(1.),a.rgb,intensity),b.a*a.a);}` }, We = `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`, Ge = { uniforms: { tDepth: { value: null }, uFull: { value: new f(1, 1) } }, vertexShader: We, fragmentShader: `uniform sampler2D tDepth;uniform vec2 uFull;void main(){ivec2 p=ivec2(gl_FragCoord.xy)*2,m=ivec2(uFull)-1;
  gl_FragDepth=min(min(texelFetch(tDepth,min(p,m),0).r,texelFetch(tDepth,min(p+ivec2(1,0),m),0).r),min(texelFetch(tDepth,min(p+ivec2(0,1),m),0).r,texelFetch(tDepth,min(p+ivec2(1,1),m),0).r));gl_FragColor=vec4(0.);}` }, Ke = { uniforms: { tDiffuse: { value: null }, tAO: { value: null }, intensity: { value: 1 }, tVapour: { value: null }, tVapourDepth: { value: null }, tDepth: { value: null }, uLow: { value: new f(1, 1) }, uNear: { value: 0.1 }, uFar: { value: 1e3 } }, vertexShader: We, fragmentShader: `uniform sampler2D tDiffuse,tAO,tVapour,tVapourDepth,tDepth;uniform float intensity,uNear,uFar;uniform vec2 uLow;varying vec2 vUv;
 float lin(float d){return uNear*uFar/(uFar-(uFar-uNear)*d);}
 void main(){
  vec4 b=texture2D(tDiffuse,vUv),a=texture2D(tAO,vUv),v=texture2D(tVapour,vUv);vec3 c=b.rgb*mix(vec3(1.),a.rgb,intensity);
  if(v.a>.002){
   float z=lin(texture2D(tDepth,vUv).r);vec2 p=vUv*uLow-.5,f=fract(p);ivec2 i=ivec2(floor(p)),m=ivec2(uLow)-1;
   ivec2 i00=clamp(i,ivec2(0),m),i10=clamp(i+ivec2(1,0),ivec2(0),m),i01=clamp(i+ivec2(0,1),ivec2(0),m),i11=clamp(i+ivec2(1,1),ivec2(0),m);
   vec4 rel=abs(vec4(lin(texelFetch(tVapourDepth,i00,0).r),lin(texelFetch(tVapourDepth,i10,0).r),lin(texelFetch(tVapourDepth,i01,0).r),lin(texelFetch(tVapourDepth,i11,0).r))-z)/z;
   if(max(max(rel.x,rel.y),max(rel.z,rel.w))>.03){vec4 w=vec4((1.-f.x)*(1.-f.y),f.x*(1.-f.y),(1.-f.x)*f.y,f.x*f.y)/(rel*40.+.02);
    v=(texelFetch(tVapour,i00,0)*w.x+texelFetch(tVapour,i10,0)*w.y+texelFetch(tVapour,i01,0)*w.z+texelFetch(tVapour,i11,0)*w.w)/dot(w,vec4(1.));}
  }
  gl_FragColor=vec4(c*(1.-v.a)+v.rgb,b.a*a.a);
 }` };
function qe(e4, r2, i2, o2) {
  let c2 = o2.depthTexture, l2 = new x(1, 1), u2 = new s(1, 1, { type: C, depthTexture: l2 }), d2 = new ee(-1, 1, 1, -1, 0, 1), f2 = new T(2, 2), p2 = new a({ ...Ge, uniforms: t.clone(Ge.uniforms), depthTest: true, depthWrite: true, depthFunc: 1, colorWrite: false, toneMapped: false }), m2 = new a({ ...Ke, uniforms: t.clone(Ke.uniforms), depthTest: false, depthWrite: false, toneMapped: false }), h2 = new F(f2, p2), g2 = new F(f2, m2);
  h2.frustumCulled = g2.frustumCulled = false;
  let v2 = new n(new Uint8Array([255, 255, 255, 255]), 1, 1);
  v2.needsUpdate = true, p2.uniforms.tDepth.value = c2;
  let y2 = m2.uniforms;
  y2.tVapour.value = u2.texture, y2.tVapourDepth.value = l2, y2.tDepth.value = c2, i2.attach(e4, c2);
  let b2 = new _();
  return { compile(t2) {
    let n2 = e4.getRenderTarget();
    try {
      e4.setRenderTarget(u2), e4.compile(i2.root, r2), e4.compile(h2, d2), e4.setRenderTarget(t2), e4.compile(g2, d2);
    } finally {
      e4.setRenderTarget(n2);
    }
  }, setSize(e5, t2) {
    e5 = Math.floor(e5), t2 = Math.floor(t2);
    let n2 = Math.ceil(e5 / 2), r3 = Math.ceil(t2 / 2);
    u2.setSize(n2, r3), p2.uniforms.uFull.value.set(e5, t2), y2.uLow.value.set(n2, r3);
    let a2 = i2.uniforms;
    a2.uDepthScale.value.set(e5 / n2, t2 / r3), a2.uDepthMax.value.set(e5 - 1, t2 - 1);
  }, get live() {
    return i2.enabled && i2.visible > 0 && !!i2.attached;
  }, draw() {
    let t2 = e4.autoClear, n2 = e4.getClearAlpha();
    e4.getClearColor(b2);
    try {
      e4.setRenderTarget(u2), e4.setClearColor(0, 0), e4.clear(true, true, false), e4.autoClear = false, e4.render(h2, d2), e4.render(i2.root, r2);
    } finally {
      e4.autoClear = t2, e4.setClearColor(b2, n2);
    }
  }, composite(t2, n2, i3, a2) {
    y2.tDiffuse.value = n2, y2.tAO.value = i3 || v2, y2.intensity.value = i3 ? a2 : 0, y2.uNear.value = r2.near, y2.uFar.value = r2.far, e4.setRenderTarget(t2), e4.render(g2, d2);
  }, dispose() {
    u2.dispose(), l2.dispose(), f2.dispose(), p2.dispose(), m2.dispose(), v2.dispose(), i2.dispose();
  } };
}
function Je(e4, n2, r2, o2, c2) {
  let l2 = n2.userData.vapour || null, u2 = new s(1, 1, { type: C, samples: 4, ...l2 ? { depthTexture: new x(1, 1) } : {} }), d2 = new s(1, 1, { type: C, depthBuffer: false }), p2 = new I(new a({ ...Ue, uniforms: t.clone(Ue.uniforms), depthTest: false, depthWrite: false })), m2 = l2 ? qe(e4, r2, l2, u2) : null, h2 = new ge(n2, r2, 512, 512, void 0, { radius: 2, thickness: 1.3, distanceFallOff: 0.6, scale: 1, samples: 12 }, { radius: 4, lumaPhi: 8, depthPhi: 2, normalPhi: 3.5 });
  h2.blendIntensity = 0.42, h2.enabled = o2 === `high`, h2.output = ge.OUTPUT.Off;
  let g2 = [], v2 = [], y2 = false;
  n2.traverse((e5) => {
    e5.userData.noAO && g2.push(e5), e5.isBatchedMesh && !e5.material.transparent && v2.push(e5);
  });
  for (let e5 of v2) {
    let t2 = e5.onBeforeRender;
    e5.onBeforeRender = function(...e6) {
      if (!(y2 && !this._visibilityChanged)) return t2.apply(this, e6);
    };
  }
  let b2 = /* @__PURE__ */ new Map(), S2 = (e5) => {
    let t2 = e5.geometry, n3 = (e5.isBatchedMesh ? `b` + (e5.colorTexture ? `c` : ``) : ``) + (e5.isInstancedMesh ? `i` + (e5.instanceColor ? `c` : ``) : ``) + (t2?.attributes?.color ? `v` + t2.attributes.color.itemSize : ``) + (t2?.attributes?.tangent ? `t` : ``), r3 = b2.get(n3);
    return r3 || (r3 = h2.normalMaterial.clone(), b2.set(n3, r3)), r3;
  }, w2 = h2._renderOverride.bind(h2);
  h2._renderOverride = (e5, t2, i2, a2, o3) => {
    if (t2 !== h2.normalMaterial) return w2(e5, t2, i2, a2, o3);
    let s2 = [];
    n2.traverseVisible((e6) => {
      let t3 = e6.material;
      if (!e6.isMesh || !t3 || (Array.isArray(t3) ? t3 : [t3]).some((e7) => e7.allowOverride === false || e7.visible === false)) return;
      let n3 = S2(e6);
      s2.push(e6, t3), e6.material = Array.isArray(t3) ? t3.map(() => n3) : n3;
    });
    let c3 = e5.getClearColor(new _()), l3 = e5.getClearAlpha(), u3 = e5.autoClear;
    try {
      e5.setRenderTarget(i2), e5.autoClear = false, e5.setClearColor(a2), e5.setClearAlpha(o3 || 0), e5.clear(), e5.render(n2, r2);
    } finally {
      for (let e6 = 0; e6 < s2.length; e6 += 2) s2[e6].material = s2[e6 + 1];
      e5.autoClear = u3, e5.setClearColor(c3), e5.setClearAlpha(l3);
    }
  };
  let T2 = h2.render.bind(h2);
  h2.render = (...t2) => {
    let n3 = g2.map((e5) => e5.visible), r3 = e4.shadowMap.autoUpdate;
    g2.forEach((e5) => e5.visible = false), e4.shadowMap.autoUpdate = false, y2 = true;
    try {
      T2(...t2);
    } finally {
      y2 = false, e4.shadowMap.autoUpdate = r3, g2.forEach((e5, t3) => e5.visible = n3[t3]);
    }
  };
  let E2 = h2.setSize.bind(h2);
  h2.setSize = (e5, t2) => E2(Math.ceil(e5 * 0.5), Math.ceil(t2 * 0.5));
  let O2 = Le[c2] || null, k2 = O2 ? c2 : null, A2 = new oe(new f(1, 1), 0.3, 0.5, 1.45);
  A2.highPassUniforms.smoothWidth.value = 0.5;
  let j2 = new se(Ve);
  j2.renderToScreen = true;
  let M2 = { pixelRatio: e4.getPixelRatio(), width: 1, height: 1, passes: [h2, A2, j2], setPixelRatio(e5) {
    this.pixelRatio = e5, this.setSize(this.width, this.height);
  }, setSize(e5, t2) {
    this.width = e5, this.height = t2;
    let n3 = e5 * this.pixelRatio, r3 = t2 * this.pixelRatio;
    u2.setSize(n3, r3), d2.setSize(n3, r3), h2.setSize(n3, r3), A2.setSize(n3, r3), m2?.setSize(n3, r3);
  }, render() {
    let t2 = !!m2?.live;
    m2 && (u2.resolveDepthBuffer = t2), e4.setRenderTarget(u2), e4.render(n2, r2);
    let i2 = u2;
    if (t2 && m2.draw(), h2.enabled) {
      if (h2.render(e4, null, u2), t2) m2.composite(d2, u2.texture, h2.pdRenderTarget.texture, h2.blendIntensity);
      else {
        let t3 = p2.material.uniforms;
        t3.tDiffuse.value = u2.texture, t3.tAO.value = h2.pdRenderTarget.texture, t3.intensity.value = h2.blendIntensity, e4.setRenderTarget(d2), p2.render(e4);
      }
      i2 = d2;
    } else t2 && (m2.composite(d2, u2.texture, null, 0), i2 = d2);
    A2.enabled && A2.render(e4, null, i2, 0, false), j2.render(e4, null, i2);
  }, dispose() {
    u2.dispose(), u2.depthTexture?.dispose(), d2.dispose(), p2.dispose(), p2.material.dispose(), m2?.dispose();
  } };
  m2?.compile(d2);
  let N2 = j2.uniforms, P2 = { blur: 0, boost: 0, kick: 0, impact: 0, flash: 0, lastBoost: false, bloom: 0.3, quality: o2 };
  function F2(e5) {
    O2 = e5, N2.uWhite.value.set(...e5.white), N2.uShadowTint.value.set(...e5.shadow), N2.uHighTint.value.set(...e5.highlight), N2.uContrastLow.value = e5.contrastLow, N2.uContrastHigh.value = e5.contrastHigh, N2.uPivot.value = e5.pivot, N2.uSaturation.value = e5.saturation, N2.uVibrance.value = e5.vibrance, N2.uSatWarm.value = e5.warm, N2.uSatCool.value = e5.cool, N2.uWarmHue.value = e5.warmHue, N2.uCoolHue.value = e5.coolHue, N2.uSplit.value = e5.split, N2.uHighlightSat.value = e5.highlightSat, N2.uVignette.value = e5.vignette, A2.radius = e5.bloom.radius, A2.threshold = e5.bloom.threshold, ee2(P2.quality);
  }
  function ee2(e5) {
    P2.quality = Re[e5] ? e5 : `high`;
    let t2 = Re[P2.quality];
    h2.enabled = P2.quality === `high`, l2?.setQuality(P2.quality), P2.bloom = (O2?.bloom.strength ?? 0.3) * t2.bloom, A2.strength = P2.bloom, j2.material.defines.TAPS !== t2.taps && (j2.material.defines.TAPS = t2.taps, j2.material.needsUpdate = true);
  }
  O2 ? F2(O2) : ee2(o2);
  let te2 = j2.render.bind(j2);
  j2.render = (e5, ...t2) => (O2 || (k2 = He(e5, n2), F2(Le[k2])), N2.uExposure.value = e5.toneMappingExposure * O2.exposure, te2(e5, ...t2));
  let L2 = (e5, t2, n3, r3) => {
    e5 >= P2.flash * 0.8 && N2.uFlashColor.value.setRGB(t2, n3, r3), P2.flash = Math.max(P2.flash, e5);
  };
  return n2.userData.post = { composer: M2, bloom: A2, grading: j2, ao: h2, setQuality: ee2, get grade() {
    return O2;
  }, get route() {
    return k2;
  }, get state() {
    return P2;
  }, resize(e5, t2) {
    M2.setSize(e5, t2), N2.uAspect.value = e5 / t2;
  }, update(e5, t2, n3 = {}) {
    let r3 = n3.motion !== false, a2 = n3.slow || 0, o3 = t2.phase === `running`, s2 = D(t2.v / 74, 0, 1);
    N2.uTime.value += e5;
    let c3 = t2.boosting || t2.nitro > 0;
    o3 && c3 && !P2.lastBoost && (P2.kick = Math.max(P2.kick, 1)), P2.lastBoost = c3;
    for (let e6 of t2.events) {
      if (e6.type === `launch` && (P2.kick = Math.max(P2.kick, 1.25), L2(0.05, 1, 0.86, 0.62)), e6.type === `land`) {
        let t3 = D(e6.strength ?? 0.4, 0, 1);
        P2.impact = Math.max(P2.impact, 0.5 + 0.5 * t3), e6.clean && L2(0.04 + 0.05 * t3, 1, 0.82, 0.5);
      }
      e6.type === `landingFlare` && (P2.impact = Math.max(P2.impact, 0.6)), e6.type === `checkpoint` && L2(0.07, 0.62, 1, 0.92), e6.type === `roll` && L2(0.06, 0.6, 0.88, 1), e6.type === `cell` && L2(0.05, 1, 0.8, 0.4), (e6.type === `impact` || e6.type === `recover`) && (P2.impact = 1, L2(0.08, 1, 0.5, 0.3));
    }
    P2.kick = Math.max(0, P2.kick - e5 * 2.4), P2.impact = Math.max(0, P2.impact - e5 * 2.6), P2.flash = Math.max(0, P2.flash - e5 * 2.8), P2.boost = z.damp(P2.boost, o3 && c3 ? 1 : 0, 7, e5);
    let l3 = o3 ? Math.min(0.12, (i(0.5, 1, s2) * 0.05 + P2.boost * 0.03 + P2.kick * 0.035) * (r3 ? 1 : 0.45)) : 0;
    P2.blur = z.damp(P2.blur, l3, 9, e5), N2.uBlur.value = P2.blur * (1 - a2 * 0.85) * (1 - (n3.cine || 0) * 0.85), N2.uAberr.value = (P2.boost * 22e-4 * s2 + P2.impact * 22e-4) * (r3 ? 1 : 0.4) * (1 - (n3.cine || 0) * 0.7), N2.uVignette.value = O2 ? O2.vignette + P2.boost * 0.1 + a2 * 0.3 : 0.26, N2.uSlow.value = a2, N2.uLetterbox.value = a2 * 0.06, N2.uFlash.value = P2.flash, N2.uHeat.value = t2.heat / 100, A2.strength = P2.bloom * (1 + P2.boost * 0.22 + a2 * 0.3);
  }, reset() {
    Object.assign(P2, { blur: 0, boost: 0, kick: 0, impact: 0, flash: 0, lastBoost: false });
  }, dispose() {
    M2.dispose(), A2.dispose(), h2.dispose(), j2.dispose();
    for (let e5 of b2.values()) e5.dispose();
  } };
}
export {
  Je as n,
  Ie as r,
  Be as t
};
