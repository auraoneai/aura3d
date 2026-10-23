import{$ as e,At as t,B as n,Ct as r,E as i,Et as a,F as o,Ft as s,J as c,K as l,Mt as u,N as d,Nt as f,O as p,Ot as m,P as h,Pt as g,R as _,St as v,U as y,V as b,W as x,X as S,Z as C,_ as w,_t as T,at as E,b as D,bt as O,ct as k,dt as A,et as j,h as M,it as N,jt as P,lt as F,m as I,mt as ee,nt as te,p as L,pt as ne,rt as R,st as z,tt as B,ut as V,vt as re,w as ie}from"./world-BJq13QzJ.js";(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var H={name:`CopyShader`,uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;


		}`},ae={name:`LuminosityHighPassShader`,uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new _(0)},defaultOpacity:{value:0}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

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

		}`},oe=class e extends M{constructor(e,n=1,r,i){super(),this.strength=n,this.radius=r,this.threshold=i,this.resolution=e===void 0?new f(256,256):new f(e.x,e.y),this.clearColor=new _(0,0,0),this.needsSwap=!1,this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let o=Math.round(this.resolution.x/2),c=Math.round(this.resolution.y/2);this.renderTargetBright=new s(o,c,{type:C}),this.renderTargetBright.texture.name=`UnrealBloomPass.bright`,this.renderTargetBright.texture.generateMipmaps=!1;for(let e=0;e<this.nMips;e++){let t=new s(o,c,{type:C});t.texture.name=`UnrealBloomPass.h`+e,t.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(t);let n=new s(o,c,{type:C});n.texture.name=`UnrealBloomPass.v`+e,n.texture.generateMipmaps=!1,this.renderTargetsVertical.push(n),o=Math.round(o/2),c=Math.round(c/2)}let l=ae;this.highPassUniforms=t.clone(l.uniforms),this.highPassUniforms.luminosityThreshold.value=i,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new a({uniforms:this.highPassUniforms,vertexShader:l.vertexShader,fragmentShader:l.fragmentShader}),this.separableBlurMaterials=[];let u=[6,10,14,18,22];o=Math.round(this.resolution.x/2),c=Math.round(this.resolution.y/2);for(let e=0;e<this.nMips;e++)this.separableBlurMaterials.push(this._getSeparableBlurMaterial(u[e])),this.separableBlurMaterials[e].uniforms.invSize.value=new f(1/o,1/c),o=Math.round(o/2),c=Math.round(c/2);this.compositeMaterial=this._getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=n,this.compositeMaterial.uniforms.bloomRadius.value=.1;let d=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=d,this.bloomTintColors=[new g(1,1,1),new g(1,1,1),new g(1,1,1),new g(1,1,1),new g(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,this.copyUniforms=t.clone(H.uniforms),this.blendMaterial=new a({uniforms:this.copyUniforms,vertexShader:H.vertexShader,fragmentShader:H.fragmentShader,premultipliedAlpha:!0,blending:2,depthTest:!1,depthWrite:!1,transparent:!0}),this._oldClearColor=new _,this._oldClearAlpha=1,this._basic=new V,this._fsQuad=new I(null)}dispose(){for(let e=0;e<this.renderTargetsHorizontal.length;e++)this.renderTargetsHorizontal[e].dispose();for(let e=0;e<this.renderTargetsVertical.length;e++)this.renderTargetsVertical[e].dispose();this.renderTargetBright.dispose();for(let e=0;e<this.separableBlurMaterials.length;e++)this.separableBlurMaterials[e].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this._basic.dispose(),this._fsQuad.dispose()}setSize(e,t){let n=Math.round(e/2),r=Math.round(t/2);this.renderTargetBright.setSize(n,r);for(let e=0;e<this.nMips;e++)this.renderTargetsHorizontal[e].setSize(n,r),this.renderTargetsVertical[e].setSize(n,r),this.separableBlurMaterials[e].uniforms.invSize.value=new f(1/n,1/r),n=Math.round(n/2),r=Math.round(r/2)}render(t,n,r,i,a){t.getClearColor(this._oldClearColor),this._oldClearAlpha=t.getClearAlpha();let o=t.autoClear;t.autoClear=!1,t.setClearColor(this.clearColor,0),a&&t.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this._fsQuad.material=this._basic,this._basic.map=r.texture,t.setRenderTarget(null),t.clear(),this._fsQuad.render(t)),this.highPassUniforms.tDiffuse.value=r.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this._fsQuad.material=this.materialHighPassFilter,t.setRenderTarget(this.renderTargetBright),t.clear(),this._fsQuad.render(t);let s=this.renderTargetBright;for(let n=0;n<this.nMips;n++)this._fsQuad.material=this.separableBlurMaterials[n],this.separableBlurMaterials[n].uniforms.colorTexture.value=s.texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionX,t.setRenderTarget(this.renderTargetsHorizontal[n]),t.clear(),this._fsQuad.render(t),this.separableBlurMaterials[n].uniforms.colorTexture.value=this.renderTargetsHorizontal[n].texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionY,t.setRenderTarget(this.renderTargetsVertical[n]),t.clear(),this._fsQuad.render(t),s=this.renderTargetsVertical[n];this._fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,t.setRenderTarget(this.renderTargetsHorizontal[0]),t.clear(),this._fsQuad.render(t),this._fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,a&&t.state.buffers.stencil.setTest(!0),this.renderToScreen?(t.setRenderTarget(null),this._fsQuad.render(t)):(t.setRenderTarget(r),this._fsQuad.render(t)),t.setClearColor(this._oldClearColor,this._oldClearAlpha),t.autoClear=o}_getSeparableBlurMaterial(e){let t=[],n=e/3;for(let r=0;r<e;r++)t.push(.39894*Math.exp(-.5*r*r/(n*n))/n);return new a({defines:{KERNEL_RADIUS:e},uniforms:{colorTexture:{value:null},invSize:{value:new f(.5,.5)},direction:{value:new f(.5,.5)},gaussianCoefficients:{value:t}},vertexShader:`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,fragmentShader:`

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

				}`})}_getCompositeMaterial(e){return new a({defines:{NUM_MIPS:e},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,fragmentShader:`

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

				}`})}};oe.BlurDirectionX=new f(1,0),oe.BlurDirectionY=new f(0,1);var se=class extends M{constructor(e,n=`tDiffuse`){super(),this.textureID=n,this.uniforms=null,this.material=null,e instanceof a?(this.uniforms=e.uniforms,this.material=e):e&&(this.uniforms=t.clone(e.uniforms),this.material=new a({name:e.name===void 0?`unspecified`:e.name,defines:Object.assign({},e.defines),uniforms:this.uniforms,vertexShader:e.vertexShader,fragmentShader:e.fragmentShader})),this._fsQuad=new I(this.material)}render(e,t,n){this.uniforms[this.textureID]&&(this.uniforms[this.textureID].value=n.texture),this._fsQuad.material=this.material,this.renderToScreen?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}},U={name:`GTAOShader`,defines:{PERSPECTIVE_CAMERA:1,SAMPLES:16,NORMAL_VECTOR_TYPE:1,DEPTH_SWIZZLING:`x`,SCREEN_SPACE_RADIUS:0,SCREEN_SPACE_RADIUS_SCALE:100,SCENE_CLIP_BOX:0},uniforms:{tNormal:{value:null},tDepth:{value:null},tNoise:{value:null},resolution:{value:new f},cameraNear:{value:null},cameraFar:{value:null},cameraProjectionMatrix:{value:new k},cameraProjectionMatrixInverse:{value:new k},cameraWorldMatrix:{value:new k},radius:{value:.25},distanceExponent:{value:1},thickness:{value:1},distanceFallOff:{value:1},scale:{value:1},sceneBoxMin:{value:new g(-1,-1,-1)},sceneBoxMax:{value:new g(1,1,1)}},vertexShader:`

		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,fragmentShader:`
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
		}`},ce={name:`GTAODepthShader`,defines:{PERSPECTIVE_CAMERA:1},uniforms:{tDepth:{value:null},cameraNear:{value:null},cameraFar:{value:null}},vertexShader:`
		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,fragmentShader:`
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

		}`},le={name:`GTAOBlendShader`,uniforms:{tDiffuse:{value:null},intensity:{value:1}},vertexShader:`
		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,fragmentShader:`
		uniform float intensity;
		uniform sampler2D tDiffuse;
		varying vec2 vUv;

		void main() {
			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = vec4(mix(vec3(1.), texel.rgb, intensity), texel.a);
		}`};function ue(e=5){let t=Math.floor(e)%2==0?Math.floor(e)+1:Math.floor(e),r=de(t),i=r.length,a=new Uint8Array(i*4);for(let e=0;e<i;++e){let t=r[e],n=2*Math.PI*t/i,o=new g(Math.cos(n),Math.sin(n),0).normalize();a[e*4]=(o.x*.5+.5)*255,a[e*4+1]=(o.y*.5+.5)*255,a[e*4+2]=127,a[e*4+3]=255}let o=new n(a,t,t);return o.wrapS=v,o.wrapT=v,o.needsUpdate=!0,o}function de(e){let t=Math.floor(e)%2==0?Math.floor(e)+1:Math.floor(e),n=t*t,r=Array(n).fill(0),i=Math.floor(t/2),a=t-1;for(let e=1;e<=n;){if(i===-1&&a===t?(a=t-2,i=0):(a===t&&(a=0),i<0&&(i=t-1)),r[i*t+a]!==0){a-=2,i++;continue}else r[i*t+a]=e++;a++,i--}return r}var fe={name:`PoissonDenoiseShader`,defines:{SAMPLES:16,SAMPLE_VECTORS:pe(16,2,1),NORMAL_VECTOR_TYPE:1,DEPTH_VALUE_SOURCE:0},uniforms:{tDiffuse:{value:null},tNormal:{value:null},tDepth:{value:null},tNoise:{value:null},resolution:{value:new f},cameraProjectionMatrixInverse:{value:new k},lumaPhi:{value:5},depthPhi:{value:5},normalPhi:{value:5},radius:{value:4},index:{value:0}},vertexShader:`

		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,fragmentShader:`

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
		}`};function pe(e,t,n){let r=me(e,t,n),i=`vec3[SAMPLES](`;for(let t=0;t<e;t++){let n=r[t];i+=`vec3(${n.x}, ${n.y}, ${n.z})${t<e-1?`,`:`)`}`}return i}function me(e,t,n){let r=[];for(let i=0;i<e;i++){let a=2*Math.PI*t*i/e,o=(i/(e-1))**n;r.push(new g(Math.cos(a),Math.sin(a),o))}return r}var he=class{constructor(e=Math){this.grad3=[[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]],this.grad4=[[0,1,1,1],[0,1,1,-1],[0,1,-1,1],[0,1,-1,-1],[0,-1,1,1],[0,-1,1,-1],[0,-1,-1,1],[0,-1,-1,-1],[1,0,1,1],[1,0,1,-1],[1,0,-1,1],[1,0,-1,-1],[-1,0,1,1],[-1,0,1,-1],[-1,0,-1,1],[-1,0,-1,-1],[1,1,0,1],[1,1,0,-1],[1,-1,0,1],[1,-1,0,-1],[-1,1,0,1],[-1,1,0,-1],[-1,-1,0,1],[-1,-1,0,-1],[1,1,1,0],[1,1,-1,0],[1,-1,1,0],[1,-1,-1,0],[-1,1,1,0],[-1,1,-1,0],[-1,-1,1,0],[-1,-1,-1,0]],this.p=[];for(let t=0;t<256;t++)this.p[t]=Math.floor(e.random()*256);this.perm=[];for(let e=0;e<512;e++)this.perm[e]=this.p[e&255];this.simplex=[[0,1,2,3],[0,1,3,2],[0,0,0,0],[0,2,3,1],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,2,3,0],[0,2,1,3],[0,0,0,0],[0,3,1,2],[0,3,2,1],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,3,2,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,2,0,3],[0,0,0,0],[1,3,0,2],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,3,0,1],[2,3,1,0],[1,0,2,3],[1,0,3,2],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,0,3,1],[0,0,0,0],[2,1,3,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,0,1,3],[0,0,0,0],[0,0,0,0],[0,0,0,0],[3,0,1,2],[3,0,2,1],[0,0,0,0],[3,1,2,0],[2,1,0,3],[0,0,0,0],[0,0,0,0],[0,0,0,0],[3,1,0,2],[0,0,0,0],[3,2,0,1],[3,2,1,0]]}noise(e,t){let n,r,i,a=.5*(Math.sqrt(3)-1),o=(e+t)*a,s=Math.floor(e+o),c=Math.floor(t+o),l=(3-Math.sqrt(3))/6,u=(s+c)*l,d=s-u,f=c-u,p=e-d,m=t-f,h,g;p>m?(h=1,g=0):(h=0,g=1);let _=p-h+l,v=m-g+l,y=p-1+2*l,b=m-1+2*l,x=s&255,S=c&255,C=this.perm[x+this.perm[S]]%12,w=this.perm[x+h+this.perm[S+g]]%12,T=this.perm[x+1+this.perm[S+1]]%12,E=.5-p*p-m*m;E<0?n=0:(E*=E,n=E*E*this._dot(this.grad3[C],p,m));let D=.5-_*_-v*v;D<0?r=0:(D*=D,r=D*D*this._dot(this.grad3[w],_,v));let O=.5-y*y-b*b;return O<0?i=0:(O*=O,i=O*O*this._dot(this.grad3[T],y,b)),70*(n+r+i)}noise3d(e,t,n){let r,i,a,o,s=(e+t+n)*(1/3),c=Math.floor(e+s),l=Math.floor(t+s),u=Math.floor(n+s),d=1/6,f=(c+l+u)*d,p=c-f,m=l-f,h=u-f,g=e-p,_=t-m,v=n-h,y,b,x,S,C,w;g>=_?_>=v?(y=1,b=0,x=0,S=1,C=1,w=0):g>=v?(y=1,b=0,x=0,S=1,C=0,w=1):(y=0,b=0,x=1,S=1,C=0,w=1):_<v?(y=0,b=0,x=1,S=0,C=1,w=1):g<v?(y=0,b=1,x=0,S=0,C=1,w=1):(y=0,b=1,x=0,S=1,C=1,w=0);let T=g-y+d,E=_-b+d,D=v-x+d,O=g-S+2*d,k=_-C+2*d,A=v-w+2*d,j=g-1+3*d,M=_-1+3*d,N=v-1+3*d,P=c&255,F=l&255,I=u&255,ee=this.perm[P+this.perm[F+this.perm[I]]]%12,te=this.perm[P+y+this.perm[F+b+this.perm[I+x]]]%12,L=this.perm[P+S+this.perm[F+C+this.perm[I+w]]]%12,ne=this.perm[P+1+this.perm[F+1+this.perm[I+1]]]%12,R=.6-g*g-_*_-v*v;R<0?r=0:(R*=R,r=R*R*this._dot3(this.grad3[ee],g,_,v));let z=.6-T*T-E*E-D*D;z<0?i=0:(z*=z,i=z*z*this._dot3(this.grad3[te],T,E,D));let B=.6-O*O-k*k-A*A;B<0?a=0:(B*=B,a=B*B*this._dot3(this.grad3[L],O,k,A));let V=.6-j*j-M*M-N*N;return V<0?o=0:(V*=V,o=V*V*this._dot3(this.grad3[ne],j,M,N)),32*(r+i+a+o)}noise4d(e,t,n,r){let i=this.grad4,a=this.simplex,o=this.perm,s=(Math.sqrt(5)-1)/4,c=(5-Math.sqrt(5))/20,l,u,d,f,p,m=(e+t+n+r)*s,h=Math.floor(e+m),g=Math.floor(t+m),_=Math.floor(n+m),v=Math.floor(r+m),y=(h+g+_+v)*c,b=h-y,x=g-y,S=_-y,C=v-y,w=e-b,T=t-x,E=n-S,D=r-C,O=w>T?32:0,k=w>E?16:0,A=T>E?8:0,j=w>D?4:0,M=T>D?2:0,N=+(E>D),P=O+k+A+j+M+N,F=+(a[P][0]>=3),I=+(a[P][1]>=3),ee=+(a[P][2]>=3),te=+(a[P][3]>=3),L=+(a[P][0]>=2),ne=+(a[P][1]>=2),R=+(a[P][2]>=2),z=+(a[P][3]>=2),B=+(a[P][0]>=1),V=+(a[P][1]>=1),re=+(a[P][2]>=1),ie=+(a[P][3]>=1),H=w-F+c,ae=T-I+c,oe=E-ee+c,se=D-te+c,U=w-L+2*c,ce=T-ne+2*c,le=E-R+2*c,ue=D-z+2*c,de=w-B+3*c,fe=T-V+3*c,pe=E-re+3*c,me=D-ie+3*c,he=w-1+4*c,ge=T-1+4*c,_e=E-1+4*c,ve=D-1+4*c,ye=h&255,be=g&255,xe=_&255,Se=v&255,W=o[ye+o[be+o[xe+o[Se]]]]%32,G=o[ye+F+o[be+I+o[xe+ee+o[Se+te]]]]%32,Ce=o[ye+L+o[be+ne+o[xe+R+o[Se+z]]]]%32,K=o[ye+B+o[be+V+o[xe+re+o[Se+ie]]]]%32,we=o[ye+1+o[be+1+o[xe+1+o[Se+1]]]]%32,Te=.6-w*w-T*T-E*E-D*D;Te<0?l=0:(Te*=Te,l=Te*Te*this._dot4(i[W],w,T,E,D));let Ee=.6-H*H-ae*ae-oe*oe-se*se;Ee<0?u=0:(Ee*=Ee,u=Ee*Ee*this._dot4(i[G],H,ae,oe,se));let De=.6-U*U-ce*ce-le*le-ue*ue;De<0?d=0:(De*=De,d=De*De*this._dot4(i[Ce],U,ce,le,ue));let Oe=.6-de*de-fe*fe-pe*pe-me*me;Oe<0?f=0:(Oe*=Oe,f=Oe*Oe*this._dot4(i[K],de,fe,pe,me));let ke=.6-he*he-ge*ge-_e*_e-ve*ve;return ke<0?p=0:(ke*=ke,p=ke*ke*this._dot4(i[we],he,ge,_e,ve)),27*(l+u+d+f+p)}_dot(e,t,n){return e[0]*t+e[1]*n}_dot3(e,t,n,r){return e[0]*t+e[1]*n+e[2]*r}_dot4(e,t,n,r,i){return e[0]*t+e[1]*n+e[2]*r+e[3]*i}},ge=class e extends M{constructor(e,n,r=512,i=512,o,c,l){super(),this.width=r,this.height=i,this.clear=!0,this.camera=n,this.scene=e,this.output=0,this._renderGBuffer=!0,this._visibilityCache=[],this.blendIntensity=1,this.pdRings=2,this.pdRadiusExponent=2,this.pdSamples=16,this.gtaoNoiseTexture=ue(),this.pdNoiseTexture=this._generateNoise(),this.gtaoRenderTarget=new s(this.width,this.height,{type:C}),this.pdRenderTarget=this.gtaoRenderTarget.clone(),this.gtaoMaterial=new a({defines:Object.assign({},U.defines),uniforms:t.clone(U.uniforms),vertexShader:U.vertexShader,fragmentShader:U.fragmentShader,blending:0,depthTest:!1,depthWrite:!1}),this.gtaoMaterial.defines.PERSPECTIVE_CAMERA=+!!this.camera.isPerspectiveCamera,this.gtaoMaterial.uniforms.tNoise.value=this.gtaoNoiseTexture,this.gtaoMaterial.uniforms.resolution.value.set(this.width,this.height),this.gtaoMaterial.uniforms.cameraNear.value=this.camera.near,this.gtaoMaterial.uniforms.cameraFar.value=this.camera.far,this.normalMaterial=new A,this.normalMaterial.blending=0,this.pdMaterial=new a({defines:Object.assign({},fe.defines),uniforms:t.clone(fe.uniforms),vertexShader:fe.vertexShader,fragmentShader:fe.fragmentShader,depthTest:!1,depthWrite:!1}),this.pdMaterial.uniforms.tDiffuse.value=this.gtaoRenderTarget.texture,this.pdMaterial.uniforms.tNoise.value=this.pdNoiseTexture,this.pdMaterial.uniforms.resolution.value.set(this.width,this.height),this.pdMaterial.uniforms.lumaPhi.value=10,this.pdMaterial.uniforms.depthPhi.value=2,this.pdMaterial.uniforms.normalPhi.value=3,this.pdMaterial.uniforms.radius.value=8,this.depthRenderMaterial=new a({defines:Object.assign({},ce.defines),uniforms:t.clone(ce.uniforms),vertexShader:ce.vertexShader,fragmentShader:ce.fragmentShader,blending:0}),this.depthRenderMaterial.uniforms.cameraNear.value=this.camera.near,this.depthRenderMaterial.uniforms.cameraFar.value=this.camera.far,this.copyMaterial=new a({uniforms:t.clone(H.uniforms),vertexShader:H.vertexShader,fragmentShader:H.fragmentShader,transparent:!0,depthTest:!1,depthWrite:!1,blendSrc:208,blendDst:200,blendEquation:100,blendSrcAlpha:206,blendDstAlpha:200,blendEquationAlpha:100}),this.blendMaterial=new a({uniforms:t.clone(le.uniforms),vertexShader:le.vertexShader,fragmentShader:le.fragmentShader,transparent:!0,depthTest:!1,depthWrite:!1,blending:5,blendSrc:208,blendDst:200,blendEquation:100,blendSrcAlpha:206,blendDstAlpha:200,blendEquationAlpha:100}),this._fsQuad=new I(null),this._originalClearColor=new _,this.setGBuffer(o?o.depthTexture:void 0,o?o.normalTexture:void 0),c!==void 0&&this.updateGtaoMaterial(c),l!==void 0&&this.updatePdMaterial(l)}setSize(e,t){this.width=e,this.height=t,this.gtaoRenderTarget.setSize(e,t),this.normalRenderTarget.setSize(e,t),this.pdRenderTarget.setSize(e,t),this.gtaoMaterial.uniforms.resolution.value.set(e,t),this.gtaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix),this.gtaoMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse),this.pdMaterial.uniforms.resolution.value.set(e,t),this.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse)}dispose(){this.gtaoNoiseTexture.dispose(),this.pdNoiseTexture.dispose(),this.normalRenderTarget.dispose(),this.gtaoRenderTarget.dispose(),this.pdRenderTarget.dispose(),this.normalMaterial.dispose(),this.pdMaterial.dispose(),this.copyMaterial.dispose(),this.depthRenderMaterial.dispose(),this._fsQuad.dispose()}get gtaoMap(){return this.pdRenderTarget.texture}setGBuffer(e,t){e===void 0?(this.depthTexture=new x,this.depthTexture.format=y,this.depthTexture.type=u,this.normalRenderTarget=new s(this.width,this.height,{minFilter:ne,magFilter:ne,type:C,depthTexture:this.depthTexture}),this.normalTexture=this.normalRenderTarget.texture,this._renderGBuffer=!0):(this.depthTexture=e,this.normalTexture=t,this._renderGBuffer=!1);let n=+!!this.normalTexture,r=this.depthTexture===this.normalTexture?`w`:`x`;this.gtaoMaterial.defines.NORMAL_VECTOR_TYPE=n,this.gtaoMaterial.defines.DEPTH_SWIZZLING=r,this.gtaoMaterial.uniforms.tNormal.value=this.normalTexture,this.gtaoMaterial.uniforms.tDepth.value=this.depthTexture,this.pdMaterial.defines.NORMAL_VECTOR_TYPE=n,this.pdMaterial.defines.DEPTH_SWIZZLING=r,this.pdMaterial.uniforms.tNormal.value=this.normalTexture,this.pdMaterial.uniforms.tDepth.value=this.depthTexture,this.depthRenderMaterial.uniforms.tDepth.value=this.normalRenderTarget.depthTexture}setSceneClipBox(e){e?(this.gtaoMaterial.needsUpdate=this.gtaoMaterial.defines.SCENE_CLIP_BOX!==1,this.gtaoMaterial.defines.SCENE_CLIP_BOX=1,this.gtaoMaterial.uniforms.sceneBoxMin.value.copy(e.min),this.gtaoMaterial.uniforms.sceneBoxMax.value.copy(e.max)):(this.gtaoMaterial.needsUpdate=this.gtaoMaterial.defines.SCENE_CLIP_BOX===0,this.gtaoMaterial.defines.SCENE_CLIP_BOX=0)}updateGtaoMaterial(e){e.radius!==void 0&&(this.gtaoMaterial.uniforms.radius.value=e.radius),e.distanceExponent!==void 0&&(this.gtaoMaterial.uniforms.distanceExponent.value=e.distanceExponent),e.thickness!==void 0&&(this.gtaoMaterial.uniforms.thickness.value=e.thickness),e.distanceFallOff!==void 0&&(this.gtaoMaterial.uniforms.distanceFallOff.value=e.distanceFallOff,this.gtaoMaterial.needsUpdate=!0),e.scale!==void 0&&(this.gtaoMaterial.uniforms.scale.value=e.scale),e.samples!==void 0&&e.samples!==this.gtaoMaterial.defines.SAMPLES&&(this.gtaoMaterial.defines.SAMPLES=e.samples,this.gtaoMaterial.needsUpdate=!0),e.screenSpaceRadius!==void 0&&+!!e.screenSpaceRadius!==this.gtaoMaterial.defines.SCREEN_SPACE_RADIUS&&(this.gtaoMaterial.defines.SCREEN_SPACE_RADIUS=+!!e.screenSpaceRadius,this.gtaoMaterial.needsUpdate=!0)}updatePdMaterial(e){let t=!1;e.lumaPhi!==void 0&&(this.pdMaterial.uniforms.lumaPhi.value=e.lumaPhi),e.depthPhi!==void 0&&(this.pdMaterial.uniforms.depthPhi.value=e.depthPhi),e.normalPhi!==void 0&&(this.pdMaterial.uniforms.normalPhi.value=e.normalPhi),e.radius!==void 0&&e.radius!==this.radius&&(this.pdMaterial.uniforms.radius.value=e.radius),e.radiusExponent!==void 0&&e.radiusExponent!==this.pdRadiusExponent&&(this.pdRadiusExponent=e.radiusExponent,t=!0),e.rings!==void 0&&e.rings!==this.pdRings&&(this.pdRings=e.rings,t=!0),e.samples!==void 0&&e.samples!==this.pdSamples&&(this.pdSamples=e.samples,t=!0),t&&(this.pdMaterial.defines.SAMPLES=this.pdSamples,this.pdMaterial.defines.SAMPLE_VECTORS=pe(this.pdSamples,this.pdRings,this.pdRadiusExponent),this.pdMaterial.needsUpdate=!0)}render(t,n,r){switch(this._renderGBuffer&&(this._overrideVisibility(),this._renderOverride(t,this.normalMaterial,this.normalRenderTarget,7829503,1),this._restoreVisibility()),this.gtaoMaterial.uniforms.cameraNear.value=this.camera.near,this.gtaoMaterial.uniforms.cameraFar.value=this.camera.far,this.gtaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix),this.gtaoMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse),this.gtaoMaterial.uniforms.cameraWorldMatrix.value.copy(this.camera.matrixWorld),this._renderPass(t,this.gtaoMaterial,this.gtaoRenderTarget,16777215,1),this.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse),this._renderPass(t,this.pdMaterial,this.pdRenderTarget,16777215,1),this.output){case e.OUTPUT.Off:break;case e.OUTPUT.Diffuse:this.copyMaterial.uniforms.tDiffuse.value=r.texture,this.copyMaterial.blending=0,this._renderPass(t,this.copyMaterial,this.renderToScreen?null:n);break;case e.OUTPUT.AO:this.copyMaterial.uniforms.tDiffuse.value=this.gtaoRenderTarget.texture,this.copyMaterial.blending=0,this._renderPass(t,this.copyMaterial,this.renderToScreen?null:n);break;case e.OUTPUT.Denoise:this.copyMaterial.uniforms.tDiffuse.value=this.pdRenderTarget.texture,this.copyMaterial.blending=0,this._renderPass(t,this.copyMaterial,this.renderToScreen?null:n);break;case e.OUTPUT.Depth:this.depthRenderMaterial.uniforms.cameraNear.value=this.camera.near,this.depthRenderMaterial.uniforms.cameraFar.value=this.camera.far,this._renderPass(t,this.depthRenderMaterial,this.renderToScreen?null:n);break;case e.OUTPUT.Normal:this.copyMaterial.uniforms.tDiffuse.value=this.normalRenderTarget.texture,this.copyMaterial.blending=0,this._renderPass(t,this.copyMaterial,this.renderToScreen?null:n);break;case e.OUTPUT.Default:this.copyMaterial.uniforms.tDiffuse.value=r.texture,this.copyMaterial.blending=0,this._renderPass(t,this.copyMaterial,this.renderToScreen?null:n),this.blendMaterial.uniforms.intensity.value=this.blendIntensity,this.blendMaterial.uniforms.tDiffuse.value=this.pdRenderTarget.texture,this._renderPass(t,this.blendMaterial,this.renderToScreen?null:n);break;default:console.warn(`THREE.GTAOPass: Unknown output type.`)}}_renderPass(e,t,n,r,i){e.getClearColor(this._originalClearColor);let a=e.getClearAlpha(),o=e.autoClear;e.setRenderTarget(n),e.autoClear=!1,r!=null&&(e.setClearColor(r),e.setClearAlpha(i||0),e.clear()),this._fsQuad.material=t,this._fsQuad.render(e),e.autoClear=o,e.setClearColor(this._originalClearColor),e.setClearAlpha(a)}_renderOverride(e,t,n,r,i){e.getClearColor(this._originalClearColor);let a=e.getClearAlpha(),o=e.autoClear;e.setRenderTarget(n),e.autoClear=!1,r=t.clearColor||r,i=t.clearAlpha||i,r!=null&&(e.setClearColor(r),e.setClearAlpha(i||0),e.clear()),this.scene.overrideMaterial=t,e.render(this.scene,this.camera),this.scene.overrideMaterial=null,e.autoClear=o,e.setClearColor(this._originalClearColor),e.setClearAlpha(a)}_overrideVisibility(){let e=this.scene,t=this._visibilityCache;e.traverse(function(e){(e.isPoints||e.isLine||e.isLine2)&&e.visible&&(e.visible=!1,t.push(e))})}_restoreVisibility(){let e=this._visibilityCache;for(let t=0;t<e.length;t++)e[t].visible=!0;e.length=0}_generateNoise(e=64){let t=new he,r=e*e*4,i=new Uint8Array(r);for(let n=0;n<e;n++)for(let r=0;r<e;r++){let a=n,o=r;i[(n*e+r)*4]=(t.noise(a,o)*.5+.5)*255,i[(n*e+r)*4+1]=(t.noise(a+e,o)*.5+.5)*255,i[(n*e+r)*4+2]=(t.noise(a,o+e)*.5+.5)*255,i[(n*e+r)*4+3]=(t.noise(a+e,o+e)*.5+.5)*255}let a=new n(i,e,e,O,P);return a.wrapS=v,a.wrapT=v,a.needsUpdate=!0,a}};ge.OUTPUT={Off:-1,Default:0,Diffuse:1,Depth:2,Normal:3,AO:4,Denoise:5};var _e=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,ve=`
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
}`,ye=new WeakMap;function be(e){let t=ye.get(e);if(t)return t;let n=new s(1024,1024,{depthBuffer:!1,generateMipmaps:!0,minFilter:E,magFilter:N}),r=new F(new T(2,2),new a({vertexShader:_e,fragmentShader:ve,depthTest:!1,depthWrite:!1,toneMapped:!1}));r.frustumCulled=!1;let i=e.getRenderTarget(),c=e.autoClear;try{e.setRenderTarget(n),e.autoClear=!0,e.render(r,new o)}finally{e.setRenderTarget(i),e.autoClear=c,r.geometry.dispose(),r.material.dispose()}return t=n.texture,t.anisotropy=4,ye.set(e,t),t}var xe=`
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
}`,Se=`
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
}`,W=24,G=12,Ce=44,K=1.5,we=class{constructor({max:t=1600,quality:n=`high`}={}){this.max=t,this.enabled=!0,this.live=0,this.visible=0,this.cursor=0,this.time=0,this.scale=1,this.limit=t,this.attached=null;let r=()=>new Float32Array(t);Object.assign(this,{px:r(),py:r(),pz:r(),vx:r(),vy:r(),vz:r(),dx:r(),dz:r(),age:r(),life:r(),s0:r(),s1:r(),grow:r(),rot:r(),spin:r(),op:r(),drag:r(),buoy:r(),turb:r(),dust:r(),variant:r(),seed:r(),sunT:r(),skyT:r(),size:r(),alpha:r(),cell:new Int32Array(t)}),this.life.fill(-1),this.sunT.fill(1),this.skyT.fill(1),this.keys=new Uint32Array(t),this.grid=new Float32Array(W*G*Ce),this.origin=new g,this.instances=new Float32Array(t*12);let i=new T(1,1),o=new e;o.index=i.index,o.setAttribute(`position`,i.attributes.position),o.setAttribute(`uv`,i.attributes.uv);let s=new j(this.instances,12,1).setUsage(l);this.buffer=s,o.setAttribute(`iA`,new B(s,4,0)),o.setAttribute(`iB`,new B(s,4,4)),o.setAttribute(`iC`,new B(s,4,8)),o.instanceCount=0,this.uniforms={uAtlas:{value:null},uDepth:{value:null},uDepthScale:{value:new f(2,2)},uDepthMax:{value:new f(1,1)},uCameraNear:{value:.1},uCameraFar:{value:1e3},uShadow:{value:null},uShadowMatrix:{value:new k},uHasShadow:{value:0},uShadowBias:{value:-6e-4},uNearFade:{value:.9},uCarRadius:{value:2.5},uCarView:{value:new g(0,0,-8)},uTailPos:{value:new g(0,-1e4,0)},uTailColor:{value:new _(0,0,0)},uSunDir:{value:new g(.4,.8,.3).normalize()},uSunColor:{value:new _(1,1,1)},uSkyColor:{value:new _(.35,.4,.48)},uGroundColor:{value:new _(.25,.24,.22)},uDustColor:{value:new _(.5,.46,.4)}},this.material=new a({uniforms:this.uniforms,vertexShader:xe,fragmentShader:Se,defines:{SOFT:1},transparent:!0,depthTest:!0,depthWrite:!1,blending:1,premultipliedAlpha:!0,toneMapped:!1}),this.mesh=new F(o,this.material),this.mesh.frustumCulled=!1,this.mesh.userData.noAO=!0,this.root=new S,this.root.add(this.mesh),this.root.matrixAutoUpdate=!1,this.right=new g(1,0,0),this.setQuality(n)}attach(e,t){this.uniforms.uAtlas.value=be(e),this.uniforms.uDepth.value=t,this.attached=e}useSunShadow(e){if(!e?.castShadow)return;let t=this.uniforms;this.material.defines.SUN_SHADOW=1,this.material.needsUpdate=!0,this.mesh.onBeforeRender=()=>{let n=e.shadow.map?.depthTexture||null;t.uShadow.value=n,t.uHasShadow.value=+!!n,t.uShadowMatrix.value=e.shadow.matrix}}setQuality(e){this.quality=e===`balanced`?`balanced`:`high`,this.scale=this.quality===`balanced`?.6:1,this.limit=this.quality===`balanced`?Math.min(this.max,1e3):this.max}setLighting(e){let t=this.uniforms,n=e?.sun,r=Math.PI;e?.sunOffset&&t.uSunDir.value.copy(e.sunOffset).normalize(),n?t.uSunColor.value.copy(n.color).multiplyScalar(n.intensity/r*1.08):t.uSunColor.value.setRGB(.95,.93,.9);let i=new _,a=new _,o=e?.scene?.environmentIntensity??0,s=e?.scene?.background;if(s?.isDataTexture&&s.image?.data&&o>0){let{data:e,width:t,height:n}=s.image,c=e instanceof Uint16Array,l=t=>c?b.fromHalfFloat(e[t]):e[t],u=0,d=0,f=[0,0,0],p=[0,0,0];for(let e=0;e<n;e+=Math.max(1,n>>5)){let i=(.5-(e+.5)/n)*r,a=Math.abs(Math.sin(i)*Math.cos(i));if(!(a<1e-4))for(let n=0;n<t;n+=Math.max(1,t>>6)){let r=(n+e*t)*4,o=l(r),s=l(r+1),c=l(r+2);if(o+s+c>24)continue;let m=i>0?f:p;m[0]+=o*a,m[1]+=s*a,m[2]+=c*a,i>0?u+=a:d+=a}}u>0&&i.setRGB(f[0]/u*o,f[1]/u*o,f[2]/u*o),d>0&&a.setRGB(p[0]/d*o,p[1]/d*o,p[2]/d*o)}else i.setRGB(.3,.35,.42),a.setRGB(.16,.15,.14);let c=e?.hemi;c&&(i.add(c.color.clone().multiplyScalar(c.intensity/r)),a.add(c.groundColor.clone().multiplyScalar(c.intensity/r)));let l=e?.bounce;l&&a.add(l.color.clone().multiplyScalar(l.intensity/r*.7)),t.uSkyColor.value.copy(i).multiplyScalar(1.3),t.uGroundColor.value.copy(a).multiplyScalar(1.15);let u=e?.lighting?.hero?.gas;if(u)for(let[e,n]of[[t.uSunColor.value,u.key],[t.uSkyColor.value,u.fill],[t.uGroundColor.value,u.fill]]){let t=e.r*.2126+e.g*.7152+e.b*.0722;e.lerp(new _(t,t,t),u.white).multiplyScalar(n)}}spawn(e,t,n,r,i,a,o,s,c,l,u,d,f,p,m,h,g,_){let v=this.cursor,y=this.limit;for(let e=0;e<6;e++){let t=(this.cursor+e)%y;if(this.life[t]<0||this.age[t]>=this.life[t]){v=t;break}(e===0||this.age[t]/this.life[t]>this.age[v]/this.life[v])&&(v=t)}this.cursor=(v+1)%y,this.px[v]=e,this.py[v]=t,this.pz[v]=n,this.vx[v]=r,this.vy[v]=i,this.vz[v]=a,this.dx[v]=h,this.dz[v]=g,this.age[v]=0,this.life[v]=l,this.s0[v]=o,this.s1[v]=s,this.grow[v]=c,this.op[v]=u,this.drag[v]=d,this.buoy[v]=f,this.turb[v]=p,this.dust[v]=m,this.rot[v]=Math.random()*6.2832,this.spin[v]=_,this.variant[v]=Math.floor(Math.random()*16),this.seed[v]=Math.random(),this.size[v]=o,this.cell[v]=-1}clear(){this.life.fill(-1),this.age.fill(0),this.live=0,this.visible=0,this.mesh.geometry.instanceCount=0,this.grid.fill(0)}room(e,t,n){let r=this.origin,i=(e-r.x)/K|0,a=(t-r.y)/K|0,o=(n-r.z)/K|0;if(i<0||i>=W||a<0||a>=G||o<0||o>=Ce)return 1;let s=this.grid[i+W*(a+G*o)]+(a+1<G?this.grid[i+W*(a+1+G*o)]*.5:0);return Math.max(.1,Math.min(1,1-(s-3)/6))}update(e,t,n,r){this.time+=e;let i=this.time,a=this.max,o=0,s=this,c=this.grid,l=this.origin.set(Math.floor(n.x/K)*K-W*K*.5,Math.floor((n.y-5)/K)*K,Math.floor(n.z/K)*K-Ce*K*.3);c.fill(0);for(let t=0;t<a;t++){if(s.life[t]<0)continue;s.age[t]+=e;let n=s.age[t],a=s.life[t];if(n>=a){s.life[t]=-1;continue}let u=Math.exp(-s.drag[t]*e),d=s.seed[t]*6.2832,f=s.turb[t]*e,p=s.vx[t]*u,m=s.vy[t]*u+s.buoy[t]*e,h=s.vz[t]*u,g=s.px[t],_=s.py[t],v=s.pz[t];p+=f*Math.sin(v*.45+i*1.7+d),h+=f*Math.sin(g*.45+i*1.3+d*1.3),m+=f*.55*Math.sin((g+v)*.35+i*2.1+d*.7);let y=g+p*e,b=_+m*e,x=v+h*e,S=1-Math.exp(-s.grow[t]*n),C=s.s0[t]+(s.s1[t]-s.s0[t])*S,w=(r?r.at(y,b,x):-1/0)+C*.28;if(b<w){if(b=w,m<0){let e=-m*.62;p+=s.dx[t]*e,h+=s.dz[t]*e,m*=-.05}let n=Math.exp(-e*.9);p*=n,h*=n}s.px[t]=y,s.py[t]=b,s.pz[t]=x,s.vx[t]=p,s.vy[t]=m,s.vz[t]=h,s.rot[t]+=s.spin[t]*e,s.size[t]=C;let T=n/a,E=Math.min(1,n/.07),D=1-(T<.42?0:(T-.42)/.58)**1.6;s.alpha[t]=s.op[t]*E*D*(.5+.5*Math.sqrt(s.s0[t]/C));let O=(y-l.x)/K|0,k=(b-l.y)/K|0,A=(x-l.z)/K|0;if(O>=0&&O<W&&k>=0&&k<G&&A>=0&&A<Ce){let e=O+W*(k+G*A);s.cell[t]=e,c[e]+=s.alpha[t]*Math.min(4,C*C/(K*K))}else s.cell[t]=-1;o++}this.live=o;let u=this.uniforms.uSunDir.value,d=u.x*K,f=u.y*K,p=u.z*K,m=1-Math.exp(-e*10);for(let e=0;e<a;e++){if(s.life[e]<0)continue;let t=0,n=0;if(s.cell[e]>=0){let r=s.cell[e],i=s.px[e]-l.x,a=s.py[e]-l.y,o=s.pz[e]-l.z;for(let e=0;e<5;e++){i+=d,a+=f,o+=p;let e=i/K|0,n=a/K|0,s=o/K|0;if(e<0||e>=W||n<0||n>=G||s<0||s>=Ce)break;let l=e+W*(n+G*s);l!==r&&(t+=c[l])}i=s.px[e]-l.x,a=s.py[e]-l.y,o=s.pz[e]-l.z;let u=i/K|0,m=o/K|0;for(let e=1;e<4;e++){let t=(a/K|0)+e;if(t>=G)break;n+=c[u+W*(t+G*m)]}}s.sunT[e]+=(Math.exp(-t*.42)-s.sunT[e])*m,s.skyT[e]+=(.45+.55*Math.exp(-n*.5)-s.skyT[e])*m}t.updateMatrixWorld();let h=t.matrixWorld.elements,g=h[12],_=h[13],v=h[14],y=-h[8],b=-h[9],x=-h[10];this.right.set(h[0],h[1],h[2]);let S=this.keys,C=0;for(let e=0;e<a;e++){if(s.life[e]<0||s.alpha[e]<.004){S[e]=4294967295;continue}let t=(s.px[e]-g)*y+(s.py[e]-_)*b+(s.pz[e]-v)*x;if(t<-s.size[e]){S[e]=4294967295;continue}S[e]=(65535-Math.max(0,Math.min(65535,(t+8)*48|0)))*65536+e,C++}S.sort();let w=this.instances;for(let e=0;e<C;e++){let t=S[e]&65535,n=e*12;w[n]=s.px[t],w[n+1]=s.py[t],w[n+2]=s.pz[t],w[n+3]=s.size[t],w[n+4]=s.rot[t],w[n+5]=s.alpha[t],w[n+6]=s.variant[t]+16*Math.round(s.dust[t]*15),w[n+7]=s.seed[t]*20+s.age[t],w[n+8]=s.sunT[t],w[n+9]=s.skyT[t],w[n+10]=0,w[n+11]=0}this.visible=C,this.mesh.geometry.instanceCount=C,C&&(this.buffer.clearUpdateRanges(),this.buffer.addUpdateRange(0,C*12),this.buffer.needsUpdate=!0)}dispose(){this.mesh.geometry.dispose(),this.material.dispose()}},Te=`attribute vec3 aColor;attribute float aSize,aAlpha;uniform float uScale;varying vec3 vColor;varying float vAlpha;
void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;float px=aSize*uScale/max(.1,-mv.z);gl_PointSize=clamp(px,1.,7.);vColor=aColor;vAlpha=aAlpha*clamp(px,.15,1.);}`,Ee=`varying vec3 vColor;varying float vAlpha;void main(){vec2 p=gl_PointCoord*2.-1.;float d=dot(p,p);if(d>1.)discard;gl_FragColor=vec4(vColor,vAlpha*(1.-d*d));}`,De=[`position`,`aColor`,`aSize`,`aAlpha`],Oe=class{constructor(e,t=420){this.max=t,this.cursor=0,this.live=0;let n=e=>new Float32Array(t*e);this.p=n(3),this.v=n(3),this.age=n(1),this.life=n(1).fill(-1),this.s=n(1),this.c=n(3),this.pos=n(3),this.col=n(3),this.sz=n(1),this.al=n(1);let r=new h;for(let[e,t,n]of[[`position`,this.pos,3],[`aColor`,this.col,3],[`aSize`,this.sz,1],[`aAlpha`,this.al,1]])r.setAttribute(e,new d(t,n).setUsage(l));r.setDrawRange(0,0),this.material=new a({uniforms:{uScale:{value:800}},vertexShader:Te,fragmentShader:Ee,transparent:!0,depthWrite:!1,toneMapped:!1}),this.points=new re(r,this.material),this.points.frustumCulled=!1,this.points.userData.noAO=!0,this.points.renderOrder=3,e.add(this.points)}emit(e,t,n,r,i,a,o,s,c,l,u){let d=this.cursor;this.cursor=(d+1)%this.max;let f=d*3;this.p[f]=e,this.p[f+1]=t,this.p[f+2]=n,this.v[f]=r,this.v[f+1]=i,this.v[f+2]=a,this.age[d]=0,this.life[d]=s,this.s[d]=o,this.c[f]=c,this.c[f+1]=l,this.c[f+2]=u}clear(){this.life.fill(-1),this.live=0,this.points.geometry.setDrawRange(0,0)}update(e,t,n,r){let i=0,a=Math.exp(-e*.8);for(let t=0;t<this.max;t++){if(this.life[t]<0)continue;if(this.age[t]+=e,this.age[t]>=this.life[t]){this.life[t]=-1;continue}let n=t*3;this.v[n+1]-=9.8*e,this.v[n]*=a,this.v[n+1]*=a,this.v[n+2]*=a,this.p[n]+=this.v[n]*e,this.p[n+1]+=this.v[n+1]*e,this.p[n+2]+=this.v[n+2]*e;let o=r?r.at(this.p[n],this.p[n+1],this.p[n+2]):-1/0;this.p[n+1]<o+.02&&(this.p[n+1]=o+.02,this.v[n+1]=Math.abs(this.v[n+1])*.25,this.v[n]*=.6,this.v[n+2]*=.6);let s=i*3,c=this.age[t]/this.life[t];this.pos[s]=this.p[n],this.pos[s+1]=this.p[n+1],this.pos[s+2]=this.p[n+2],this.col[s]=this.c[n],this.col[s+1]=this.c[n+1],this.col[s+2]=this.c[n+2],this.sz[i]=this.s[t],this.al[i]=.9*(1-c*c),i++}let o=this.points.geometry;if(o.setDrawRange(0,i),i)for(let e=0;e<4;e++){let t=o.attributes[De[e]];t.clearUpdateRanges(),t.addUpdateRange(0,i*t.itemSize),t.needsUpdate=!0}this.live=i,this.material.uniforms.uScale.value=n/(2*Math.tan(t.fov*Math.PI/360))}dispose(){this.points.geometry.dispose(),this.material.dispose()}},ke=class{constructor(){this.N=512,this.key=new Int32Array(this.N).fill(-2147483647),this.x=new Float32Array(this.N),this.y=new Float32Array(this.N),this.dx=new Float32Array(this.N),this.bank=new Float32Array(this.N),this.none=new Uint8Array(this.N),this.level=null,this.plane=-1/0,this.flat=!1}prepare(e,t,n){e!==this.level&&(this.level=e,this.key.fill(-2147483647)),this.flat=t||!e,this.plane=n}entry(e){let t=e&this.N-1;if(this.key[t]!==e){let n=this.level,r=p(n,e);this.key[t]=e,this.x[t]=r.x,this.y[t]=r.y,this.dx[t]=r.dx,this.bank[t]=r.bank;let i=+(e<0||e>n.length+80||Math.abs(r.bank)>.35);for(let t=0;t<n.gaps.length;t++)e>n.gaps[t][0]&&e<n.gaps[t][1]&&(i=1);this.none[t]=i}return t}at(e,t,n){if(this.flat)return this.plane;let r=this.entry(Math.floor(-n)),i=-n+(e-this.x[r])*this.dx[r],a=Math.floor(i),o=i-a,s=this.entry(a),c=this.entry(a+1);if(this.none[o<.5?s:c])return-1/0;let l=this.level,u=this.x[s]+(this.x[c]-this.x[s])*o,d=this.y[s]+(this.y[c]-this.y[s])*o,f=this.bank[s],p=this.dx[s],m=(e-u)*Math.sqrt(1+p*p)/Math.cos(f),h=d+m*Math.sin(f);for(let e=0;e<l.shortcuts.length;e++){let n=l.shortcuts[e];if(i>=n.start&&i<=n.end&&Math.abs(m-n.l)<5.5&&t>h+n.height-1.4)return h+n.height}return Math.abs(m)>l.width+.35?-1/0:h}},Ae={snow:{dust:[.84,.93,.98],grit:[.7,.84,.91]},asphalt:{dust:[.42,.41,.39],grit:[.16,.155,.15]},limestone:{dust:[.66,.62,.53],grit:[.46,.43,.37]},concrete:{dust:[.6,.58,.54],grit:[.36,.35,.33]},sand:{dust:[.62,.4,.26],grit:[.4,.24,.14]},rock:{dust:[.55,.38,.27],grit:[.3,.19,.12]}},je=`
 float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
 float noise3(vec3 x){vec3 p=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(hash(p),hash(p+vec3(1,0,0)),f.x),mix(hash(p+vec3(0,1,0)),hash(p+vec3(1,1,0)),f.x),f.y),mix(mix(hash(p+vec3(0,0,1)),hash(p+vec3(1,0,1)),f.x),mix(hash(p+vec3(0,1,1)),hash(p+vec3(1,1,1)),f.x),f.y),f.z);}
`,Me=`attribute float aDisc;varying vec2 vUv;varying float vHeight,vFacing,vDisc;uniform float uTime,uSeed;
void main(){vUv=uv;vDisc=aDisc;vec3 p=position;p.x+=sin(uv.y*21.-uTime*41.+uSeed)*.016*uv.y*(1.-aDisc);
 vec4 w=modelMatrix*vec4(p,1.);vHeight=w.y;vec3 n=normalize(mat3(modelMatrix)*normal);vFacing=abs(dot(n,normalize(cameraPosition-w.xyz)));
 gl_Position=projectionMatrix*viewMatrix*w;}`,Ne=`
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
 }`,Pe={rear:28,lift:72,yaw:96,sheet:128},q=new g,J=new g;new g;var Y=new g,X=new g,Z=new g,Q=new g;new k;var $=(e,t)=>e+Math.random()*(t-e);function Fe(e){let t=[];for(let n=0;n<3;n++){let r=new T(e,1,1,8);r.translate(0,.5,0),r.rotateY(n*Math.PI/3),r.setAttribute(`aDisc`,new c(new Float32Array(r.attributes.position.count),1)),t.push(r)}let n=new T(e*.62,e*.62);n.rotateX(-Math.PI/2),n.translate(0,.04,0),n.setAttribute(`aDisc`,new c(new Float32Array(4).fill(1),1)),t.push(n);let r=w(t,!1);for(let e of t)e.dispose();return r}var Ie=class{constructor(e,t,n,r){this.car=t,this.camera=n,this.world=r,this.scene=e,this.time=0,this.power=0,this.lastPosition=t.position.clone(),this.velocity=new g,this.delta=new g,this.wasOn=!1,this.visiblePuffs=0,this.flash=0,this.tail=1.3,this.field=new we({max:2400,quality:r.quality||`high`}),this.field.setLighting(r),this.field.useSunShadow(r.sun),e.userData.vapour=this.field,r.renderer&&this.field.attach(r.renderer,null),this.grit=new Oe(e),this.ground=new ke,this.floor=-1/0;let i=!!r.canyon;this.surface=i?`sand`:`asphalt`,this.dust=new _,this.gritColor=new _,this.setSurface(this.surface);let o=this.field.uniforms;this.lit=new _().copy(o.uSunColor.value).multiplyScalar(.62).add(o.uSkyColor.value).multiplyScalar(.9),this.emitters=[],this.cores=new S,t.add(this.cores);let s=t.userData.propulsion,c=(s.lift||[]).filter(e=>e.z>0).map(e=>e.clone().add(new g((Math.sign(e.x)||1)*.12,.2,0))),l=[[`rear`,s.rear,()=>new g(0,0,1)],[`lift`,s.lift,()=>new g(0,-1,0)],[`yaw`,s.yaw||[],e=>new g(Math.sign(e.x)||1,0,0)],[`yawRear`,s.yaw?.length?c:[],e=>new g(Math.sign(e.x)||1,0,0)]],u={rear:Fe(.62),lift:Fe(.82),yaw:Fe(.78)};u.yawRear=u.yaw,this.geometries=u;for(let[e,t,n]of l)for(let r=0;r<t.length;r++){let i=n(t[r]),o=new S;o.userData.noAO=!0,o.position.copy(t[r]).addScaledVector(i,.015),o.quaternion.setFromUnitVectors(new g(0,1,0),i);let s=new a({uniforms:{uTime:{value:0},uPower:{value:0},uFlash:{value:0},uFloor:{value:-1e4},uSeed:{value:r*7.31+({rear:4,yaw:9,yawRear:13}[e]||0)},uLit:{value:this.lit}},vertexShader:Me,fragmentShader:Ne,transparent:!0,depthWrite:!1,side:2,blending:1,toneMapped:!1}),c=new F(u[e],s);c.renderOrder=4,c.frustumCulled=!1,o.add(c),this.cores.add(o),this.emitters.push({kind:e,anchor:o.position.clone(),direction:i,root:o,mat:s,index:r,power:0,pulse:0,acc:0,sheet:0,flash:0,base:0,cool:0,burst:0,len:1})}this.attitude={ready:!1,roll:0,pitch:0,yaw:0,rates:new g,accel:new g,source:`euler`},this.trimTimer=0,this.flare=0,this.wingDeploy=0}setSurface(e){let t=Ae[e]||Ae.asphalt;this.surface=e,this.dust.setRGB(...t.dust),this.gritColor.setRGB(...t.grit),this.field.uniforms.uDustColor.value.copy(this.dust)}sampleSurface(e){let t=this.world.gasSurface?.(e),n=this.car.position,r=!1,i=-1/0;if(t?.road)if(i=t.surface===!1?-1/0:t.road.y,!e.level)r=!0;else{let t=ie(e.level,e.s||0,e.l||0,e.h||0);r=Math.abs(t.x-n.x)+Math.abs(t.y-n.y)+Math.abs(t.z-n.z)>4}this.ground.prepare(e.level||null,r,i);let a=t?.material||(this.world.canyon?`sand`:`asphalt`);if(!t?.material&&e.level)for(let t of e.level.shortcuts)e.s>=t.start&&e.s<=t.end&&Math.abs((e.l||0)-t.l)<5.5&&(a=`concrete`);a!==this.surface&&this.setSurface(a),this.floor=this.ground.at(n.x,n.y,n.z)}jetPuffs(e,t,n,r,i,a,o,s,c,l,u,d,f=0){let p=this.field,m=this.delta,h=this.velocity,g=e.len;for(let e=0;e<t;e++){let e=$(n,1),t=Math.random(),_=q.x+J.x*g*e-m.x*t,v=q.y+J.y*g*e-m.y*t,y=q.z+J.z*g*e-m.z*t,b=r*$(.75,1.2),x=Math.random()*6.2832,S=Math.cos(x),C=Math.sin(x),w=J.x*b+h.x*i+$(-3,3),T=J.y*b+h.y*i+$(-1.5,1.5),E=J.z*b+h.z*i+$(-3,3);p.spawn(_+$(-.25,.25),v,y+$(-.25,.25),w,T,E,a*$(.8,1.2),o*$(.8,1.2),f?f*$(.85,1.15):$(1.6,2.6),s*$(.75,1.25),c*$(.85,1.1),l,u,d,0,S,C,this.spinFor(w,E))}}spinFor(e,t){let n=this.field.right;return-Math.sign(e*n.x+t*n.z||1)*$(.25,.9)}ring(e,t,n,r,i,a,o,s,c,l,u){let d=this.field,f=this.velocity,p=d.scale,m=Z,h=Q,g=Math.round(i*p*1.2);for(let i=0;i<g;i++){let u=(i+Math.random()*.6)/g*6.2832,p=Math.cos(u),_=Math.sin(u),v=h.x*p*1.7+m.x*_*2.3,y=h.z*p*1.7+m.z*_*2.3,b=Math.hypot(v,y)||1,x=v/b,S=y/b,C=$(.45,1),w=Math.abs(p),T=a*$(.7,1.25)*r*(.75+.55*w),E=+(i<g*l),D=s*$(.6,1.15);d.spawn(e+v*C,t+$(.2,.6),n+y*C,x*T+f.x*D,o*$(.2,1.1)+f.y*D*.2,S*T+f.z*D,$(1.1,1.6),(E?$(3,4.2):$(5,7.6))*(.75+.4*r),$(.75,1.25),c*$(.75,1.3)*(E?.75:1),E?$(.24,.34):$(.34,.48),$(1.9,2.6),E?.1:$(.15,.4),1.3,E,x,S,this.spinFor(x*T,S*T))}for(let a=0;a<Math.round(i*.24*p);a++){let i=Math.random()*6.2832,a=$(0,1.6);d.spawn(e+Math.cos(i)*a,t+$(.3,1),n+Math.sin(i)*a,Math.cos(i)*$(1,3.5)+f.x*s,$(1.5,5)*r,Math.sin(i)*$(1,3.5)+f.z*s,$(1,1.4),$(3.4,5)*(.8+.3*r),$(.6,1),c*$(.8,1.2),$(.38,.52),1.3,$(.3,.7),1.6,0,Math.cos(i),Math.sin(i),$(-.6,.6))}let _=this.gritColor,v=this.grit;for(let i=0;i<Math.round(u*p);i++){let i=Math.random()*6.2832,a=$(5,17)*r,o=$(.7,1.35);v.emit(e+Math.cos(i)*$(.4,1.6),t+.05,n+Math.sin(i)*$(.4,1.6),Math.cos(i)*a+f.x*s*$(.5,1),$(1.5,7)*r,Math.sin(i)*a+f.z*s*$(.5,1),$(.025,.07),$(.5,1.3),_.r*o,_.g*o,_.b*o)}}groundUnder(){let e=this.car.position,t=this.ground.at(e.x,e.y,e.z);if(X.copy(e),!Number.isFinite(t)){let n=Y.copy(this.velocity).setY(0),r=n.length();if(r>.5){n.multiplyScalar(-1/r);for(let r=1;r<=12&&(X.copy(e).addScaledVector(n,r),t=this.ground.at(X.x,X.y,X.z),!Number.isFinite(t));r++);}}return t}launch(e){let t=this.groundUnder();this.flash=1;for(let e of this.emitters)e.flash=1,(e.kind===`yaw`||e.kind===`yawRear`)&&(e.pulse=Math.max(e.pulse,.95));let n=e.boosting;Number.isFinite(t)&&this.car.position.y-t<8&&this.ring(X.x,t,X.z,n?1.1:.8,n?150:96,n?16:11,n?2.4:1.6,n?.45:.35,n?4.2:3.2,n?.18:.4,n?170:90);for(let e of this.emitters)e.kind===`lift`&&(this.nozzle(e),this.jetPuffs(e,Math.round((n?8:5)*this.field.scale),0,26,.85,.3,1.8,.6,.75,2.4,0,.7))}landing(e,t,n,r){let i=this.groundUnder();if(!Number.isFinite(i))return;let a=D(t??.4,0,1),o=(r?1.15:.6+.45*a)+(n?.12:0);this.ring(X.x,i,X.z,o,(r?130:70)+70*a,(r?14:10)+6*a,1.2+1.5*a,.42,3.2+1.4*a,.26,60+100*a)}nitroKick(e){let t=this.field.scale;for(let n of this.emitters)n.kind===`rear`&&(n.flash=Math.max(n.flash,e>=3?1:e>=2?.75:.45),this.nozzle(n),this.jetPuffs(n,Math.round((e>=3?12:e>=2?7:4)*t),0,e>=3?40:30,.85,.5,3.4,1.1,.5,1.3,.08,1.2,3.4));if(e>=3){let e=this.groundUnder();Number.isFinite(e)&&this.car.position.y-e<4&&this.ring(X.x,e,X.z,1,80,22,.8,.85,1.7,.15,40)}}scrape(e){let t=this.car.position,n=(e.l||0)>=0?1:-1,r=this.grit,i=this.velocity;for(let e=0;e<10;e++){let e=$(.7,1.4);r.emit(t.x+Q.x*n*.95+Z.x*$(-1.6,1.6),t.y+$(.2,.6),t.z+Q.z*n*.95+Z.z*$(-1.6,1.6),i.x*.7+Q.x*n*$(1,4)+$(-1.5,1.5),$(1,4),i.z*.7+Q.z*n*$(1,4)+$(-1.5,1.5),$(.03,.06),$(.18,.45),1.7*e,1.05*e,.42*e)}}nozzle(e){q.copy(e.anchor).applyMatrix4(this.car.matrixWorld),J.copy(e.direction).transformDirection(this.car.matrixWorld)}update(e,t){this.time+=e;let n=t.phase===`running`&&t.boosting,r=this.car,i=t.phase===`running`?t.nitro|0:0;r.updateMatrixWorld(!0),this.camera.updateMatrixWorld(),this.delta.copy(r.position).sub(this.lastPosition),e>0&&this.delta.lengthSq()<144?this.velocity.copy(this.delta).divideScalar(e):(this.velocity.set(0,0,0),this.delta.lengthSq()>=144&&this.delta.set(0,0,0)),this.lastPosition.copy(r.position),this.sampleSurface(t);let a=this.floor;this.reactionControl(e,t),Z.set(0,0,-1).transformDirection(r.matrixWorld).setY(0),Z.lengthSq()<1e-4&&Z.set(0,0,-1),Z.normalize(),Q.set(-Z.z,0,Z.x),this.flash=Math.max(0,this.flash-e*6);for(let n of this.emitters){n.flash=Math.max(0,n.flash-e*6.5);let r=n.mat.uniforms;r.uFloor.value=Number.isFinite(a)?a:-1e4,r.uTime.value=this.time,r.uPower.value=n.power,r.uFlash.value=n.flash;let o=n.kind===`yaw`||n.kind===`yawRear`;n.len=n.kind===`rear`?(1.7+t.v*.012)*(.45+.55*n.power)*(i>=2?1.5:i?1.2:1)*(1+n.flash*.35):o?(1.1+3.1*n.power)*(1+n.flash*.3):(1.6+2.4*n.power)*(1+n.flash*.25),n.root.scale.set(1+n.flash*.35,n.len,1+n.flash*.35),n.root.visible=n.power>.008}let o=t.events.some(e=>e.type===`landingFlare`);for(let e of t.events)e.type===`launch`?this.launch(t):e.type===`land`?this.landing(t,e.strength,e.clean,o):e.type===`recover`?this.clear():e.type===`nitro`?this.nitroKick(e.level|0):e.type===`scrape`&&this.scrape(t);let s=this.field,c=s.scale;for(let t of this.emitters){if(t.power<.02&&!t.burst){t.acc=0,t.sheet=0;continue}this.nozzle(t);let n=t.kind===`yaw`||t.kind===`yawRear`;t.burst&&=(this.jetPuffs(t,Math.round((n?9:10)*c),.25,n?26:24,.86,.24,n?1.8:1.4,.85,.6,n?1.4:2.2,.1,.9),0),t.acc+=e*t.power*Pe[n?`yaw`:t.kind]*(t.kind===`rear`&&i?1.7:1)*c*s.room(q.x+J.x*t.len,q.y+J.y*t.len,q.z+J.z*t.len);let r=Math.floor(t.acc);if(t.acc-=r,r&&(t.kind===`lift`?this.jetPuffs(t,r,.3,17,.8,.55,4.4,2.2,.36,.9,.2,2.2,3.2):t.kind===`rear`?i?this.jetPuffs(t,r,.3,i>=2?30:24,.86,.45,3.3,1.35,.38,1.15,.1,1.5,3):this.jetPuffs(t,r,.6,17,.88,.42,2.9,1.2,.32,1.35,.12,2):this.jetPuffs(t,r,.05,30,.92,.5,3.4,1.7,.4,.95,.1,.8,3.6)),t.kind===`lift`&&J.y<-.3&&Number.isFinite(a)){let n=(a-q.y)/J.y,r=2+8*t.power;if(n>0&&n<r){let i=(1-n/r)**.6,o=q.x+J.x*n,l=q.z+J.z*n,u=this.velocity,d=Math.hypot(u.x,u.z);t.sheet+=e*t.power*i*Pe.sheet*c*(1+d/45)*s.room(o,a+1,l);let f=Math.floor(t.sheet);t.sheet-=f;let p=Math.sign(t.anchor.x)||1;for(let e=0;e<f;e++){let e=Math.atan2(Q.z*p,Q.x*p)+$(-1.25,1.25),t=Math.cos(e),n=Math.sin(e),r=$(7,16)*(.5+.5*i),c=Math.random(),d=$(.3,.5);s.spawn(o+t*$(.3,1.4)-this.delta.x*c,a+$(.15,.5),l+n*$(.3,1.4)-this.delta.z*c,t*r+u.x*d,$(.2,1.2),n*r+u.z*d,$(1.4,1.9),$(4.4,6.6),$(.8,1.3),$(2.6,4.2),$(.28,.38),1.7,$(.06,.25),1.5,+(Math.random()<.18),t,n,this.spinFor(t,n))}if(Math.random()<e*t.power*i*40*c){let e=Math.random()*6.2832,t=$(4,12),n=this.gritColor,r=$(.7,1.3);this.grit.emit(o,a+.04,l,Math.cos(e)*t+u.x*.4,$(1,4),Math.sin(e)*t+u.z*.4,$(.02,.05),$(.4,1),n.r*r,n.g*r,n.b*r)}}}}this.power=0;for(let e of this.emitters)(e.kind===`rear`||e.kind===`lift`)&&(this.power=Math.max(this.power,e.power));let l=s.uniforms;l.uCarView.value.copy(r.position).applyMatrix4(this.camera.matrixWorldInverse),l.uTailPos.value.set(0,.93,2.36).applyMatrix4(r.matrixWorld),l.uTailColor.value.setRGB(.9,.04,.02).multiplyScalar(.05*this.tail),l.uCameraNear.value=this.camera.near,l.uCameraFar.value=this.camera.far,s.update(e,this.camera,r.position,this.ground),this.visiblePuffs=s.live;let u=s.attached?.domElement?.height||900;this.grit.update(e,this.camera,u,this.ground),this.wasOn=n}reactionControl(e,t){let n=this.car,r=this.attitude,i=!t.grounded&&t.phase===`running`,a=t.phase===`running`&&t.boosting,o=t.phase===`running`?t.nitro|0:0,s=Number.isFinite(t.rollRate)||Number.isFinite(t.flipRate)||Number.isFinite(t.spinRate);if(r.source=s?`run`:`euler`,e>0){if(s)Y.set(t.rollRate||0,-(t.flipRate||0),-(t.spinRate||0)),i||Y.set(0,0,0),r.ready=!0;else{let t=n.rotation;Y.set(t.z-r.roll,t.x-r.pitch,t.y-r.yaw).divideScalar(e),(!r.ready||!i)&&(Y.set(0,0,0),r.ready=!0),r.roll=t.z,r.pitch=t.x,r.yaw=t.y}X.copy(r.rates),r.rates.lerp(Y.clampScalar(-12,12),1-Math.exp(-e*25)),Y.copy(r.rates).sub(X).divideScalar(e),r.accel.lerp(Y,1-Math.exp(-e*18))}this.trimTimer-=e;let c=i&&this.trimTimer<=0;c&&(this.trimTimer=.35+Math.random()*.6),this.flare=Math.max(0,this.flare-e*2.2);for(let e of t.events)e.type===`land`&&(this.flare=Math.max(this.flare,.6)),e.type===`landingFlare`&&(this.flare=1);let l=i?D(r.accel.x/14,-1,1):0,u=i?D(r.accel.y/8,-1,1):0,d=i?D(r.accel.z/5,-1,1):0,f=s&&i?D(r.rates.x/7,-1,1)*.3:0,p=s&&i?D(r.rates.y/6,-1,1)*.3:0,m=s&&i?D(r.rates.z/6,-1,1)*.3:0,h=s&&i?D((Math.abs(r.rates.z)-.6)/3.4,0,1)*.95:0;for(let n of this.emitters){let s=0;if(n.kind===`rear`)s=Math.max(a?.62+D(t.v/80,0,.38):0,o===1?.92:o>=2?1.15:0);else if(n.kind===`lift`){let e=Math.sign(n.anchor.x)||1,r=n.anchor.z<0?1:-1,i=e*r;s=(a?t.grounded?.6:.85:0)+Math.max(0,e*(l+f))*.9+Math.max(0,r*(u+p))*.6+Math.max(0,i*(d+m))*.45+this.flare,c&&Math.random()<.4&&(n.pulse=Math.max(n.pulse,.25+Math.random()*.2))}else{let e=(Math.sign(n.anchor.x)||1)*(n.kind===`yawRear`?-1:1);s=Math.max(0,e*(d+m))*.9+(e*r.rates.z>0?h:0),c&&Math.random()<.15&&(n.pulse=Math.max(n.pulse,.3))}n.pulse=Math.max(0,n.pulse-e*3.5),s=Math.min(1.15,s+n.pulse),n.cool-=e,i&&n.kind!==`rear`&&s-n.base>.32&&n.cool<=0&&(n.burst=1,n.flash=Math.max(n.flash,.6),n.cool=.24),n.base=z.damp(n.base,s,5,e),n.power=z.damp(n.power,s,s>n.power?20:9,e)}let g=n.userData.wing;if(g){let n=t.phase===`running`?i||a?1:t.v>45?.3:0:0;this.wingDeploy=z.damp(this.wingDeploy,n,n>this.wingDeploy?5:3,e);let r=g.userData.deployHeight??.065,o=g.userData.deployPitch??0;g.position.y=g.userData.baseHeight+this.wingDeploy*r,g.rotation.x=this.wingDeploy*o}}clear(){this.field.clear(),this.grit.clear();for(let e of this.emitters)e.power=0,e.pulse=0,e.acc=0,e.sheet=0,e.flash=0,e.base=0,e.burst=0;this.flare=0,this.flash=0,this.attitude.ready=!1,this.visiblePuffs=0,this.power=0,this.velocity.set(0,0,0),this.delta.set(0,0,0),this.lastPosition.copy(this.car.position)}snapshot(){return{rearNozzles:this.emitters.filter(e=>e.kind===`rear`).length,liftNozzles:this.emitters.filter(e=>e.kind===`lift`).length,yawPorts:this.emitters.filter(e=>e.kind===`yaw`).length,sideVents:this.emitters.filter(e=>e.kind===`yawRear`).length,power:this.power,jets:this.emitters.map(e=>+e.power.toFixed(2)),wing:+this.wingDeploy.toFixed(2),puffs:this.visiblePuffs,drawn:this.field.visible,grit:this.grit.live,surface:this.surface,attitude:this.attitude.source,combustionLight:!1}}},Le={sunbreak:{white:[1.05,1,.94],exposure:1.07,contrastLow:1.14,contrastHigh:1.05,pivot:.19,saturation:1.12,vibrance:.4,warm:1.08,cool:1.24,warmHue:.06,coolHue:.16,shadow:[.9,.99,1.08],highlight:[1.1,1,.86],split:0,highlightSat:.55,vignette:.26,bloom:{strength:.3,radius:.5,threshold:1.45},lines:[1,.95,.86]},redline:{white:[1.04,.99,.95],exposure:1.1,contrastLow:1.14,contrastHigh:1.06,pivot:.19,saturation:1.1,vibrance:.3,warm:1.07,cool:1.28,warmHue:.22,coolHue:.45,shadow:[.92,.98,1.08],highlight:[1.1,.97,.88],split:.1,highlightSat:.5,vignette:.26,bloom:{strength:.32,radius:.52,threshold:1.4},lines:[1,.9,.78]},halo:{white:[.98,1,1.04],exposure:1,contrastLow:1.18,contrastHigh:1.04,pivot:.16,saturation:1.14,vibrance:.38,warm:1.12,cool:1.18,warmHue:.08,coolHue:.22,shadow:[.88,.97,1.14],highlight:[1.08,.99,.9],split:-.1,highlightSat:.45,vignette:.3,bloom:{strength:.42,radius:.6,threshold:1.2},lines:[.72,.88,1]}},Re={high:{taps:10,bloom:1},balanced:{taps:6,bloom:.8}},ze=class{constructor(e,t=140){this.count=t,this.data=[];let n=new h;n.setAttribute(`position`,new d(new Float32Array(t*6),3)),n.setAttribute(`color`,new d(new Float32Array(t*6),3)),this.material=new te({vertexColors:!0,transparent:!0,opacity:0,blending:2,depthWrite:!1,fog:!1}),this.lines=new R(n,this.material),this.lines.frustumCulled=!1,this.lines.matrixAutoUpdate=!1,this.lines.renderOrder=4,this.lines.userData.noAO=!0,e.add(this.lines),this.tint=new _(1,1,1);for(let e=0;e<t;e++)this.data.push(this.spawn({},!0))}spawn(e,t){let n=Math.random()*Math.PI*2,r=3.4+Math.random()*15;return e.x=Math.cos(n)*r,e.y=Math.sin(n)*r*.6+.6,e.z=t?-8-Math.random()*140:-120-Math.random()*35,e.k=.55+Math.random()*.9,e.b=.5+Math.random()*.5,e}update(e,t,n,r){if(r.updateMatrixWorld(),this.lines.matrix.copy(r.matrixWorld),this.lines.matrixWorldNeedsUpdate=!0,this.material.opacity=n,this.lines.visible=n>.004,!this.lines.visible)return;let i=this.lines.geometry.attributes.position.array,a=this.lines.geometry.attributes.color.array,o=this.tint;for(let n=0;n<this.count;n++){let r=this.data[n];r.z+=e*t*1.2,r.z>1.5&&this.spawn(r,!1);let s=1+t*.075*r.k,c=n*6;i[c]=r.x,i[c+1]=r.y,i[c+2]=r.z,i[c+3]=r.x,i[c+4]=r.y,i[c+5]=r.z-s;let l=D((r.z+120)/30,0,1)*r.b*1.25;a[c]=o.r*l,a[c+1]=o.g*l,a[c+2]=o.b*l,a[c+3]=a[c+4]=a[c+5]=0}this.lines.geometry.attributes.position.needsUpdate=!0,this.lines.geometry.attributes.color.needsUpdate=!0}},Be=class{constructor(e,t,n,i){this.scene=e,this.car=t,this.camera=n,this.time=0,this.pool=1500,this.cursor=0,this.p=[],this.pos=new Float32Array(this.pool*3),this.col=new Float32Array(this.pool*3),this.sz=new Float32Array(this.pool),this.alpha=new Float32Array(this.pool);for(let e=0;e<this.pool;e++)this.p.push({v:new g,life:0,max:1,pos:new g,size:1,color:new _});let o=new h;o.setAttribute(`position`,new d(this.pos,3)),o.setAttribute(`aColor`,new d(this.col,3)),o.setAttribute(`aSize`,new d(this.sz,1)),o.setAttribute(`aAlpha`,new d(this.alpha,1)),this.particles=new re(o,new a({transparent:!0,depthWrite:!1,blending:2,vertexShader:`attribute vec3 aColor;attribute float aSize;attribute float aAlpha;varying vec3 vColor;varying float vAlpha;void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=min(80.,aSize*420./max(1.,-p.z));vColor=aColor;vAlpha=aAlpha;}`,fragmentShader:`varying vec3 vColor;varying float vAlpha;void main(){float d=length(gl_PointCoord-.5)*2.;float wisps=.65+.35*sin(gl_PointCoord.x*32.+sin(gl_PointCoord.y*23.)*3.);float a=pow(max(0.,1.-d),2.)*vAlpha*wisps;gl_FragColor=vec4(vColor,a);}`})),this.particles.frustumCulled=!1,this.particles.userData.noAO=!0,e.add(this.particles),this.gas=new Ie(e,t,n,i),e.userData.coldGas=this.gas;let s=Math.min(1,i?.lighting?.windows??1);this.headlights=[];for(let e of[-1,1]){let n=new m(14478079,60+270*s,62,.31,.55,2);n.position.set(e*.69,.47,-2.4),n.target.position.set(e*.85,-.03,-32),t.add(n,n.target),this.headlights.push(n)}this.brakes=[],t.traverse(e=>{e.isMesh&&e.material.name===`Rear red lamp`&&(e.material=e.material.clone(),this.brakes.push(e.material))}),this.lastSpeed=0,this.rings=[];for(let t=0;t<9;t++){let t=new F(new r(.9,1.07,56),new V({color:11652040,transparent:!0,opacity:0,side:2,depthWrite:!1,blending:2}));t.rotation.x=-Math.PI/2,t.userData.noAO=!0,e.add(t),this.rings.push({ring:t,life:0})}this.trailN=110,this.trailWritten=0,this.trailPositions=new Float32Array(this.trailN*2*3*2),this.trailColors=new Float32Array(this.trailPositions.length),this.history=[];let c=new h;c.setAttribute(`position`,new d(this.trailPositions,3)),c.setAttribute(`color`,new d(this.trailColors,3)),this.trails=new R(c,new te({vertexColors:!0,transparent:!0,opacity:.1,blending:1,depthWrite:!1})),this.trails.frustumCulled=!1,this.trails.userData.noAO=!0,e.add(this.trails),this.wind=new ze(e),this.windKick=0,this.lastBoost=!1;let l=Le[i?.level?.id]||Le.sunbreak;this.wind.tint.setRGB(...l.lines)}emit(e,t,n,r,i){let a=this.p[this.cursor++%this.pool];a.pos.copy(e),a.v.copy(t),a.color.set(n),a.size=r,a.life=a.max=i}burst(e,t,n=11924460,r=7){for(let i=0;i<t;i++)this.emit(e,new g((Math.random()-.5)*r,Math.random()*r*.65,(Math.random()-.5)*r),n,.15+Math.random()*.5,.4+Math.random()*.8)}ring(e,t=1){let n=this.rings.find(e=>e.life<=0)||this.rings[0];n.life=1,n.power=t,n.ring.position.copy(e),n.ring.position.y+=.08}update(e,t,n={}){this.time+=e;let r=e>0&&(t.v-this.lastSpeed)/e<-2;this.lastSpeed=t.v;for(let t of this.brakes)t.emissiveIntensity=z.damp(t.emissiveIntensity,r?3.4:1.3,10,e);this.gas.tail=this.brakes[0]?.emissiveIntensity??1.3,this.gas.update(e,t);let a=t.phase===`running`;if(this.car.updateWorldMatrix(!0,!1),a&&t.drifting)for(let e of[-.98,.98]){let t=this.car.localToWorld(new g(e,.08,1.45));this.emit(t,new g((Math.random()-.5)*2,.7,2),13089697,.55,.65)}if(a&&t.v>25&&Math.random()<.2){let e=this.car.localToWorld(new g((Math.random()-.5)*18,Math.random()*7,-15));this.emit(e,new g(0,0,5),11912641,.035,.7)}for(let e of t.events){let t=this.car.position.clone();e.type===`launch`&&(this.windKick=1),e.type===`checkpoint`&&(this.ring(t,3),this.burst(t,70,7464922,12)),e.type===`cell`&&this.burst(t,38,16765048,9),(e.type===`impact`||e.type===`recover`)&&this.burst(t,60,16753500,11),e.type===`roll`&&this.burst(t,50,8968437,8)}let o=0;for(let t=0;t<this.pool;t++){let n=this.p[t];if(n.life<=0){this.sz[t]!==0&&(this.alpha[t]=0,this.sz[t]=0,o++);continue}if(n.life-=e,n.life>0){n.pos.addScaledVector(n.v,e),n.v.multiplyScalar(1-e*.5);let r=t*3;this.pos[r]=n.pos.x,this.pos[r+1]=n.pos.y,this.pos[r+2]=n.pos.z,this.col[r]=n.color.r,this.col[r+1]=n.color.g,this.col[r+2]=n.color.b,this.sz[t]=n.size*(1+(1-n.life/n.max)*1.3),this.alpha[t]=Math.min(1,n.life*3)*.45}else this.alpha[t]=0,this.sz[t]=0;o++}if(o)for(let e of Object.values(this.particles.geometry.attributes))e.needsUpdate=!0;for(let t of this.rings)if(t.life>0){t.life-=e*1.5;let n=(1-t.life)*t.power*9+1;t.ring.scale.setScalar(n),t.ring.material.opacity=Math.max(0,t.life*.15)}if(a&&t.v>12?(this.history.unshift({a:this.car.localToWorld(new g(-.7,.4,2.3)),b:this.car.localToWorld(new g(.7,.4,2.3)),on:t.boosting||!t.grounded}),this.history.length>this.trailN&&this.history.pop()):this.history.length&&this.history.pop(),this.history.length||this.trailWritten){let e=this.trailPositions,t=this.trailColors,n=0;for(let r=1;r<this.history.length;r++){let i=this.history[r-1],a=this.history[r],o=i.on?(1-r/this.trailN)**2:0;for(let r of[`a`,`b`]){let s=i[r],c=a[r];e[n]=s.x,e[n+1]=s.y,e[n+2]=s.z,e[n+3]=c.x,e[n+4]=c.y,e[n+5]=c.z,t[n]=t[n+3]=.64*o,t[n+1]=t[n+4]=.73*o,t[n+2]=t[n+5]=.81*o,n+=6}}n<this.trailWritten&&(e.fill(0,n,this.trailWritten),t.fill(0,n,this.trailWritten));let r=Math.max(n,this.trailWritten);this.trailWritten=n;for(let e of[this.trails.geometry.attributes.position,this.trails.geometry.attributes.color])e.clearUpdateRanges(),e.addUpdateRange(0,r),e.needsUpdate=!0}let s=t.boosting||t.nitro>0;s&&!this.lastBoost&&(this.windKick=Math.max(this.windKick,.7)),this.lastBoost=s,this.windKick=Math.max(0,this.windKick-e*1.6);let c=a?t.v:0,l=a?Math.min(.6,i(.58,1,t.v/74)*.38+(s?.16:0)+this.windKick*.2)*(1-(n.slow||0)*.6)*(n.motion===!1?.6:1)*(1-(n.cine||0)):0;this.wind.update(e,c,l,this.camera)}clear(){this.gas.clear(),this.history=[];for(let e of this.p)e.life=0;this.windKick=0;for(let e of this.rings)e.life=0,e.ring.material.opacity=0;this.lastSpeed=0,this.lastBoost=!1}},Ve={defines:{TAPS:10},uniforms:{tDiffuse:{value:null},uTime:{value:0},uAspect:{value:1},uExposure:{value:1},uCenter:{value:new f(.5,.43)},uBlur:{value:0},uAberr:{value:0},uVignette:{value:.26},uSlow:{value:0},uLetterbox:{value:0},uFlash:{value:0},uFlashColor:{value:new _(1,.85,.6)},uHeat:{value:0},uGrain:{value:.012},uWhite:{value:new g(1,1,1)},uShadowTint:{value:new g(1,1,1)},uHighTint:{value:new g(1,1,1)},uContrastLow:{value:1},uContrastHigh:{value:1},uPivot:{value:.18},uSaturation:{value:1},uVibrance:{value:0},uSatWarm:{value:1},uSatCool:{value:1},uWarmHue:{value:0},uCoolHue:{value:0},uSplit:{value:0},uHighlightSat:{value:.5}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`
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
 }`};function He(e,t){for(let[n,r]of Object.entries(L))if(Math.abs(t.backgroundIntensity-r.background)<1e-6&&Math.abs(e.toneMappingExposure-r.exposure)<1e-6)return n;return`sunbreak`}var Ue={uniforms:{tDiffuse:{value:null},tAO:{value:null},intensity:{value:1}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`uniform sampler2D tDiffuse,tAO;uniform float intensity;varying vec2 vUv;void main(){vec4 b=texture2D(tDiffuse,vUv),a=texture2D(tAO,vUv);gl_FragColor=vec4(b.rgb*mix(vec3(1.),a.rgb,intensity),b.a*a.a);}`},We=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,Ge={uniforms:{tDepth:{value:null},uFull:{value:new f(1,1)}},vertexShader:We,fragmentShader:`uniform sampler2D tDepth;uniform vec2 uFull;void main(){ivec2 p=ivec2(gl_FragCoord.xy)*2,m=ivec2(uFull)-1;
  gl_FragDepth=min(min(texelFetch(tDepth,min(p,m),0).r,texelFetch(tDepth,min(p+ivec2(1,0),m),0).r),min(texelFetch(tDepth,min(p+ivec2(0,1),m),0).r,texelFetch(tDepth,min(p+ivec2(1,1),m),0).r));gl_FragColor=vec4(0.);}`},Ke={uniforms:{tDiffuse:{value:null},tAO:{value:null},intensity:{value:1},tVapour:{value:null},tVapourDepth:{value:null},tDepth:{value:null},uLow:{value:new f(1,1)},uNear:{value:.1},uFar:{value:1e3}},vertexShader:We,fragmentShader:`uniform sampler2D tDiffuse,tAO,tVapour,tVapourDepth,tDepth;uniform float intensity,uNear,uFar;uniform vec2 uLow;varying vec2 vUv;
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
 }`};function qe(e,r,i,o){let c=o.depthTexture,l=new x(1,1),u=new s(1,1,{type:C,depthTexture:l}),d=new ee(-1,1,1,-1,0,1),f=new T(2,2),p=new a({...Ge,uniforms:t.clone(Ge.uniforms),depthTest:!0,depthWrite:!0,depthFunc:1,colorWrite:!1,toneMapped:!1}),m=new a({...Ke,uniforms:t.clone(Ke.uniforms),depthTest:!1,depthWrite:!1,toneMapped:!1}),h=new F(f,p),g=new F(f,m);h.frustumCulled=g.frustumCulled=!1;let v=new n(new Uint8Array([255,255,255,255]),1,1);v.needsUpdate=!0,p.uniforms.tDepth.value=c;let y=m.uniforms;y.tVapour.value=u.texture,y.tVapourDepth.value=l,y.tDepth.value=c,i.attach(e,c);let b=new _;return{compile(t){let n=e.getRenderTarget();try{e.setRenderTarget(u),e.compile(i.root,r),e.compile(h,d),e.setRenderTarget(t),e.compile(g,d)}finally{e.setRenderTarget(n)}},setSize(e,t){e=Math.floor(e),t=Math.floor(t);let n=Math.ceil(e/2),r=Math.ceil(t/2);u.setSize(n,r),p.uniforms.uFull.value.set(e,t),y.uLow.value.set(n,r);let a=i.uniforms;a.uDepthScale.value.set(e/n,t/r),a.uDepthMax.value.set(e-1,t-1)},get live(){return i.enabled&&i.visible>0&&!!i.attached},draw(){let t=e.autoClear,n=e.getClearAlpha();e.getClearColor(b);try{e.setRenderTarget(u),e.setClearColor(0,0),e.clear(!0,!0,!1),e.autoClear=!1,e.render(h,d),e.render(i.root,r)}finally{e.autoClear=t,e.setClearColor(b,n)}},composite(t,n,i,a){y.tDiffuse.value=n,y.tAO.value=i||v,y.intensity.value=i?a:0,y.uNear.value=r.near,y.uFar.value=r.far,e.setRenderTarget(t),e.render(g,d)},dispose(){u.dispose(),l.dispose(),f.dispose(),p.dispose(),m.dispose(),v.dispose(),i.dispose()}}}function Je(e,n,r,o,c){let l=n.userData.vapour||null,u=new s(1,1,{type:C,samples:4,...l?{depthTexture:new x(1,1)}:{}}),d=new s(1,1,{type:C,depthBuffer:!1}),p=new I(new a({...Ue,uniforms:t.clone(Ue.uniforms),depthTest:!1,depthWrite:!1})),m=l?qe(e,r,l,u):null,h=new ge(n,r,512,512,void 0,{radius:2,thickness:1.3,distanceFallOff:.6,scale:1,samples:12},{radius:4,lumaPhi:8,depthPhi:2,normalPhi:3.5});h.blendIntensity=.42,h.enabled=o===`high`,h.output=ge.OUTPUT.Off;let g=[],v=[],y=!1;n.traverse(e=>{e.userData.noAO&&g.push(e),e.isBatchedMesh&&!e.material.transparent&&v.push(e)});for(let e of v){let t=e.onBeforeRender;e.onBeforeRender=function(...e){if(!(y&&!this._visibilityChanged))return t.apply(this,e)}}let b=new Map,S=e=>{let t=e.geometry,n=(e.isBatchedMesh?`b`+(e.colorTexture?`c`:``):``)+(e.isInstancedMesh?`i`+(e.instanceColor?`c`:``):``)+(t?.attributes?.color?`v`+t.attributes.color.itemSize:``)+(t?.attributes?.tangent?`t`:``),r=b.get(n);return r||(r=h.normalMaterial.clone(),b.set(n,r)),r},w=h._renderOverride.bind(h);h._renderOverride=(e,t,i,a,o)=>{if(t!==h.normalMaterial)return w(e,t,i,a,o);let s=[];n.traverseVisible(e=>{let t=e.material;if(!e.isMesh||!t||(Array.isArray(t)?t:[t]).some(e=>e.allowOverride===!1||e.visible===!1))return;let n=S(e);s.push(e,t),e.material=Array.isArray(t)?t.map(()=>n):n});let c=e.getClearColor(new _),l=e.getClearAlpha(),u=e.autoClear;try{e.setRenderTarget(i),e.autoClear=!1,e.setClearColor(a),e.setClearAlpha(o||0),e.clear(),e.render(n,r)}finally{for(let e=0;e<s.length;e+=2)s[e].material=s[e+1];e.autoClear=u,e.setClearColor(c),e.setClearAlpha(l)}};let T=h.render.bind(h);h.render=(...t)=>{let n=g.map(e=>e.visible),r=e.shadowMap.autoUpdate;g.forEach(e=>e.visible=!1),e.shadowMap.autoUpdate=!1,y=!0;try{T(...t)}finally{y=!1,e.shadowMap.autoUpdate=r,g.forEach((e,t)=>e.visible=n[t])}};let E=h.setSize.bind(h);h.setSize=(e,t)=>E(Math.ceil(e*.5),Math.ceil(t*.5));let O=Le[c]||null,k=O?c:null,A=new oe(new f(1,1),.3,.5,1.45);A.highPassUniforms.smoothWidth.value=.5;let j=new se(Ve);j.renderToScreen=!0;let M={pixelRatio:e.getPixelRatio(),width:1,height:1,passes:[h,A,j],setPixelRatio(e){this.pixelRatio=e,this.setSize(this.width,this.height)},setSize(e,t){this.width=e,this.height=t;let n=e*this.pixelRatio,r=t*this.pixelRatio;u.setSize(n,r),d.setSize(n,r),h.setSize(n,r),A.setSize(n,r),m?.setSize(n,r)},render(){let t=!!m?.live;m&&(u.resolveDepthBuffer=t),e.setRenderTarget(u),e.render(n,r);let i=u;if(t&&m.draw(),h.enabled){if(h.render(e,null,u),t)m.composite(d,u.texture,h.pdRenderTarget.texture,h.blendIntensity);else{let t=p.material.uniforms;t.tDiffuse.value=u.texture,t.tAO.value=h.pdRenderTarget.texture,t.intensity.value=h.blendIntensity,e.setRenderTarget(d),p.render(e)}i=d}else t&&(m.composite(d,u.texture,null,0),i=d);A.enabled&&A.render(e,null,i,0,!1),j.render(e,null,i)},dispose(){u.dispose(),u.depthTexture?.dispose(),d.dispose(),p.dispose(),p.material.dispose(),m?.dispose()}};m?.compile(d);let N=j.uniforms,P={blur:0,boost:0,kick:0,impact:0,flash:0,lastBoost:!1,bloom:.3,quality:o};function F(e){O=e,N.uWhite.value.set(...e.white),N.uShadowTint.value.set(...e.shadow),N.uHighTint.value.set(...e.highlight),N.uContrastLow.value=e.contrastLow,N.uContrastHigh.value=e.contrastHigh,N.uPivot.value=e.pivot,N.uSaturation.value=e.saturation,N.uVibrance.value=e.vibrance,N.uSatWarm.value=e.warm,N.uSatCool.value=e.cool,N.uWarmHue.value=e.warmHue,N.uCoolHue.value=e.coolHue,N.uSplit.value=e.split,N.uHighlightSat.value=e.highlightSat,N.uVignette.value=e.vignette,A.radius=e.bloom.radius,A.threshold=e.bloom.threshold,ee(P.quality)}function ee(e){P.quality=Re[e]?e:`high`;let t=Re[P.quality];h.enabled=P.quality===`high`,l?.setQuality(P.quality),P.bloom=(O?.bloom.strength??.3)*t.bloom,A.strength=P.bloom,j.material.defines.TAPS!==t.taps&&(j.material.defines.TAPS=t.taps,j.material.needsUpdate=!0)}O?F(O):ee(o);let te=j.render.bind(j);j.render=(e,...t)=>(O||(k=He(e,n),F(Le[k])),N.uExposure.value=e.toneMappingExposure*O.exposure,te(e,...t));let L=(e,t,n,r)=>{e>=P.flash*.8&&N.uFlashColor.value.setRGB(t,n,r),P.flash=Math.max(P.flash,e)};return n.userData.post={composer:M,bloom:A,grading:j,ao:h,setQuality:ee,get grade(){return O},get route(){return k},get state(){return P},resize(e,t){M.setSize(e,t),N.uAspect.value=e/t},update(e,t,n={}){let r=n.motion!==!1,a=n.slow||0,o=t.phase===`running`,s=D(t.v/74,0,1);N.uTime.value+=e;let c=t.boosting||t.nitro>0;o&&c&&!P.lastBoost&&(P.kick=Math.max(P.kick,1)),P.lastBoost=c;for(let e of t.events){if(e.type===`launch`&&(P.kick=Math.max(P.kick,1.25),L(.05,1,.86,.62)),e.type===`land`){let t=D(e.strength??.4,0,1);P.impact=Math.max(P.impact,.5+.5*t),e.clean&&L(.04+.05*t,1,.82,.5)}e.type===`landingFlare`&&(P.impact=Math.max(P.impact,.6)),e.type===`checkpoint`&&L(.07,.62,1,.92),e.type===`roll`&&L(.06,.6,.88,1),e.type===`cell`&&L(.05,1,.8,.4),(e.type===`impact`||e.type===`recover`)&&(P.impact=1,L(.08,1,.5,.3))}P.kick=Math.max(0,P.kick-e*2.4),P.impact=Math.max(0,P.impact-e*2.6),P.flash=Math.max(0,P.flash-e*2.8),P.boost=z.damp(P.boost,o&&c?1:0,7,e);let l=o?Math.min(.12,(i(.5,1,s)*.05+P.boost*.03+P.kick*.035)*(r?1:.45)):0;P.blur=z.damp(P.blur,l,9,e),N.uBlur.value=P.blur*(1-a*.85)*(1-(n.cine||0)*.85),N.uAberr.value=(P.boost*.0022*s+P.impact*.0022)*(r?1:.4)*(1-(n.cine||0)*.7),N.uVignette.value=O?O.vignette+P.boost*.1+a*.3:.26,N.uSlow.value=a,N.uLetterbox.value=a*.06,N.uFlash.value=P.flash,N.uHeat.value=t.heat/100,A.strength=P.bloom*(1+P.boost*.22+a*.3)},reset(){Object.assign(P,{blur:0,boost:0,kick:0,impact:0,flash:0,lastBoost:!1})},dispose(){M.dispose(),A.dispose(),h.dispose(),j.dispose();for(let e of b.values())e.dispose()}}}export{Je as n,Ie as r,Be as t};