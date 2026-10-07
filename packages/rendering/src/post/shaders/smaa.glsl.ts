/**
 * PRD-03 §8.14 — SMAA 1x ("medium"): three passes ported verbatim from three
 * r185 `examples/jsm/shaders/SMAAShader.js` (MIT; WebGL port of SMAA v2.8 by
 * the three.js authors, algorithm by Jorge Jimenez et al.).
 *
 * Conventions matching the rest of `post/shaders/`: `#version 300 es`,
 * `in vec2 v_uv`, `out vec4 outColor`. three's vertex shaders only computed
 * the `vOffset`/`vPixcoord` varyings — they are pure functions of `v_uv` and
 * the texel-size uniform, so this port computes them in the fragment
 * preamble (`SMAAEdgeDetectionVS` → `smaaOffsets*` below), byte-identical
 * math. `texture2D(x, uv, 0.0)` → `texture(x, uv)` (LOD 0 = lod-0 chain
 * rules do not apply to full-screen post targets; the v2 targets carry a
 * single mip).
 *
 * `u_resolution` is the texel size `vec2(1/w, 1/h)` (three names it
 * `resolution` and feeds `Vector2(1/w, 1/h)` — same value, pipeline name).
 * AreaTex/SearchTex arrive from the `post/smaa/` lazy chunk.
 */

/** Pass 1 — `SMAAColorEdgeDetectionPS` (colour edges, threshold 0.1). */
export const SMAA_EDGES_GLSL = /* glsl */ `#version 300 es
precision highp float;
#define SMAA_THRESHOLD 0.1
uniform sampler2D u_color;
uniform vec2 u_resolution;
in vec2 v_uv;
out vec4 outColor;

vec4 SMAAColorEdgeDetectionPS( vec2 texcoord, vec4 offset[3], sampler2D colorTex ) {
	vec2 threshold = vec2( SMAA_THRESHOLD, SMAA_THRESHOLD );

	// Calculate color deltas:
	vec4 delta;
	vec3 C = texture( colorTex, texcoord ).rgb;

	vec3 Cleft = texture( colorTex, offset[0].xy ).rgb;
	vec3 t = abs( C - Cleft );
	delta.x = max( max( t.r, t.g ), t.b );

	vec3 Ctop = texture( colorTex, offset[0].zw ).rgb;
	t = abs( C - Ctop );
	delta.y = max( max( t.r, t.g ), t.b );

	// We do the usual threshold:
	vec2 edges = step( threshold, delta.xy );

	// Then discard if there is no edge:
	if ( dot( edges, vec2( 1.0, 1.0 ) ) == 0.0 )
		discard;

	// Calculate right and bottom deltas:
	vec3 Cright = texture( colorTex, offset[1].xy ).rgb;
	t = abs( C - Cright );
	delta.z = max( max( t.r, t.g ), t.b );

	vec3 Cbottom  = texture( colorTex, offset[1].zw ).rgb;
	t = abs( C - Cbottom );
	delta.w = max( max( t.r, t.g ), t.b );

	// Calculate the maximum delta in the direct neighborhood:
	float maxDelta = max( max( max( delta.x, delta.y ), delta.z ), delta.w );

	// Calculate left-left and top-top deltas:
	vec3 Cleftleft  = texture( colorTex, offset[2].xy ).rgb;
	t = abs( C - Cleftleft );
	delta.z = max( max( t.r, t.g ), t.b );

	vec3 Ctoptop = texture( colorTex, offset[2].zw ).rgb;
	t = abs( C - Ctoptop );
	delta.w = max( max( t.r, t.g ), t.b );

	// Calculate the final maximum delta:
	maxDelta = max( max( maxDelta, delta.z ), delta.w );

	// Local contrast adaptation in action:
	edges.xy *= step( 0.5 * maxDelta, delta.xy );

	return vec4( edges, 0.0, 0.0 );
}

void main() {
	// three's SMAAEdgeDetectionVS offsets, computed fragment-side (identical
	// values — the offsets are a pure function of texcoord + resolution).
	vec4 vOffset0 = v_uv.xyxy + u_resolution.xyxy * vec4( -1.0, 0.0, 0.0,  1.0 );
	vec4 vOffset1 = v_uv.xyxy + u_resolution.xyxy * vec4(  1.0, 0.0, 0.0, -1.0 );
	vec4 vOffset2 = v_uv.xyxy + u_resolution.xyxy * vec4( -2.0, 0.0, 0.0,  2.0 );
	vec4 vOffset[3] = vec4[3]( vOffset0, vOffset1, vOffset2 );
	outColor = SMAAColorEdgeDetectionPS( v_uv, vOffset, u_color );
}
`;

/**
 * Pass 2 — `SMAABlendingWeightCalculationPS` (SMAA_MAX_SEARCH_STEPS 8,
 * AreaTex 160×560 RG, SearchTex 66×33 R, no diagonal search).
 */
export const SMAA_WEIGHTS_GLSL = /* glsl */ `#version 300 es
precision highp float;
#define SMAA_MAX_SEARCH_STEPS 8
#define SMAA_AREATEX_MAX_DISTANCE 16
#define SMAA_AREATEX_PIXEL_SIZE ( 1.0 / vec2( 160.0, 560.0 ) )
#define SMAA_AREATEX_SUBTEX_SIZE ( 1.0 / 7.0 )
#define SMAASampleLevelZeroOffset( tex, coord, offset ) texture( tex, coord + vec2( offset ) * u_resolution )

uniform sampler2D u_edges;   // the pass-1 edges surface (three tDiffuse)
uniform sampler2D u_area;
uniform sampler2D u_search;
uniform vec2 u_resolution;
in vec2 v_uv;
out vec4 outColor;

float SMAASearchLength( sampler2D searchTex, vec2 e, float bias, float scale ) {
	// Not required if searchTex accesses are set to point:
	// float2 SEARCH_TEX_PIXEL_SIZE = 1.0 / float2(66.0, 33.0);
	// e = float2(bias, 0.0) + 0.5 * SEARCH_TEX_PIXEL_SIZE +
	//     e * float2(scale, 1.0) * float2(64.0, 32.0) * SEARCH_TEX_PIXEL_SIZE;
	e.r = bias + e.r * scale;
	return 255.0 * texture( searchTex, e ).r;
}

float SMAASearchXLeft( sampler2D edgesTex, sampler2D searchTex, vec2 texcoord, float end ) {
	/**
		* @PSEUDO_GATHER4
		* This texcoord has been offset by (-0.25, -0.125) in the vertex shader to
		* sample between edge, thus fetching four edges in a row.
		* Sampling with different offsets in each direction allows to disambiguate
		* which edges are active from the four fetched ones.
		*/
	vec2 e = vec2( 0.0, 1.0 );

	for ( int i = 0; i < SMAA_MAX_SEARCH_STEPS; i ++ ) { // WebGL port note: Changed while to for
		e = texture( edgesTex, texcoord ).rg;
		texcoord -= vec2( 2.0, 0.0 ) * u_resolution;
		if ( ! ( texcoord.x > end && e.g > 0.8281 && e.r == 0.0 ) ) break;
	}

	// We correct the previous (-0.25, -0.125) offset we applied:
	texcoord.x += 0.25 * u_resolution.x;

	// The searches are bias by 1, so adjust the coords accordingly:
	texcoord.x += u_resolution.x;

	// Disambiguate the length added by the last step:
	texcoord.x += 2.0 * u_resolution.x; // Undo last step
	texcoord.x -= u_resolution.x * SMAASearchLength(searchTex, e, 0.0, 0.5);

	return texcoord.x;
}

float SMAASearchXRight( sampler2D edgesTex, sampler2D searchTex, vec2 texcoord, float end ) {
	vec2 e = vec2( 0.0, 1.0 );

	for ( int i = 0; i < SMAA_MAX_SEARCH_STEPS; i ++ ) {
		e = texture( edgesTex, texcoord ).rg;
		texcoord += vec2( 2.0, 0.0 ) * u_resolution;
		if ( ! ( texcoord.x < end && e.g > 0.8281 && e.r == 0.0 ) ) break;
	}

	texcoord.x -= 0.25 * u_resolution.x;
	texcoord.x -= u_resolution.x;
	texcoord.x -= 2.0 * u_resolution.x;
	texcoord.x += u_resolution.x * SMAASearchLength( searchTex, e, 0.5, 0.5 );

	return texcoord.x;
}

float SMAASearchYUp( sampler2D edgesTex, sampler2D searchTex, vec2 texcoord, float end ) {
	vec2 e = vec2( 1.0, 0.0 );

	for ( int i = 0; i < SMAA_MAX_SEARCH_STEPS; i ++ ) {
		e = texture( edgesTex, texcoord ).rg;
		texcoord += vec2( 0.0, 2.0 ) * u_resolution; // WebGL port note: Changed sign
		if ( ! ( texcoord.y > end && e.r > 0.8281 && e.g == 0.0 ) ) break;
	}

	texcoord.y -= 0.25 * u_resolution.y; // WebGL port note: Changed sign
	texcoord.y -= u_resolution.y; // WebGL port note: Changed sign
	texcoord.y -= 2.0 * u_resolution.y; // WebGL port note: Changed sign
	texcoord.y += u_resolution.y * SMAASearchLength( searchTex, e.gr, 0.0, 0.5 ); // WebGL port note: Changed sign

	return texcoord.y;
}

float SMAASearchYDown( sampler2D edgesTex, sampler2D searchTex, vec2 texcoord, float end ) {
	vec2 e = vec2( 1.0, 0.0 );

	for ( int i = 0; i < SMAA_MAX_SEARCH_STEPS; i ++ ) {
		e = texture( edgesTex, texcoord ).rg;
		texcoord -= vec2( 0.0, 2.0 ) * u_resolution; // WebGL port note: Changed sign
		if ( ! ( texcoord.y < end && e.r > 0.8281 && e.g == 0.0 ) ) break;
	}

	texcoord.y += 0.25 * u_resolution.y; // WebGL port note: Changed sign
	texcoord.y += u_resolution.y; // WebGL port note: Changed sign
	texcoord.y += 2.0 * u_resolution.y; // WebGL port note: Changed sign
	texcoord.y -= u_resolution.y * SMAASearchLength( searchTex, e.gr, 0.5, 0.5 ); // WebGL port note: Changed sign

	return texcoord.y;
}

vec2 SMAAArea( sampler2D areaTex, vec2 dist, float e1, float e2, float offset ) {
	// Rounding prevents precision errors of bilinear filtering:
	vec2 texcoord = float( SMAA_AREATEX_MAX_DISTANCE ) * round( 4.0 * vec2( e1, e2 ) ) + dist;

	// We do a scale and bias for mapping to texel space:
	texcoord = SMAA_AREATEX_PIXEL_SIZE * texcoord + ( 0.5 * SMAA_AREATEX_PIXEL_SIZE );

	// Move to proper place, according to the subpixel offset:
	texcoord.y += SMAA_AREATEX_SUBTEX_SIZE * offset;

	return texture( areaTex, texcoord ).rg;
}

vec4 SMAABlendingWeightCalculationPS( vec2 texcoord, vec2 pixcoord, vec4 offset[ 3 ], sampler2D edgesTex, sampler2D areaTex, sampler2D searchTex, ivec4 subsampleIndices ) {
	vec4 weights = vec4( 0.0, 0.0, 0.0, 0.0 );

	vec2 e = texture( edgesTex, texcoord ).rg;

	if ( e.g > 0.0 ) { // Edge at north
		vec2 d;

		// Find the distance to the left:
		vec2 coords;
		coords.x = SMAASearchXLeft( edgesTex, searchTex, offset[ 0 ].xy, offset[ 2 ].x );
		coords.y = offset[ 1 ].y; // offset[1].y = texcoord.y - 0.25 * resolution.y (@CROSSING_OFFSET)
		d.x = coords.x;

		// Now fetch the left crossing edges, two at a time using bilinear
		// filtering. Sampling at -0.25 (see @CROSSING_OFFSET) enables to
		// discern what value each edge has:
		float e1 = texture( edgesTex, coords ).r;

		// Find the distance to the right:
		coords.x = SMAASearchXRight( edgesTex, searchTex, offset[ 0 ].zw, offset[ 2 ].y );
		d.y = coords.x;

		// We want the distances to be in pixel units (doing this here allow to
		// better interleave arithmetic and memory accesses):
		d = d / u_resolution.x - pixcoord.x;

		// SMAAArea below needs a sqrt, as the areas texture is compressed
		// quadratically:
		vec2 sqrt_d = sqrt( abs( d ) );

		// Fetch the right crossing edges:
		coords.y -= 1.0 * u_resolution.y; // WebGL port note: Added
		float e2 = SMAASampleLevelZeroOffset( edgesTex, coords, ivec2( 1, 0 ) ).r;

		// Ok, we know how this pattern looks like, now it is time for getting
		// the actual area:
		weights.rg = SMAAArea( areaTex, sqrt_d, e1, e2, float( subsampleIndices.y ) );
	}

	if ( e.r > 0.0 ) { // Edge at west
		vec2 d;

		// Find the distance to the top:
		vec2 coords;

		coords.y = SMAASearchYUp( edgesTex, searchTex, offset[ 1 ].xy, offset[ 2 ].z );
		coords.x = offset[ 0 ].x; // offset[1].x = texcoord.x - 0.25 * resolution.x;
		d.x = coords.y;

		// Fetch the top crossing edges:
		float e1 = texture( edgesTex, coords ).g;

		// Find the distance to the bottom:
		coords.y = SMAASearchYDown( edgesTex, searchTex, offset[ 1 ].zw, offset[ 2 ].w );
		d.y = coords.y;

		// We want the distances to be in pixel units:
		d = d / u_resolution.y - pixcoord.y;

		// SMAAArea below needs a sqrt, as the areas texture is compressed
		// quadratically:
		vec2 sqrt_d = sqrt( abs( d ) );

		// Fetch the bottom crossing edges:
		coords.y -= 1.0 * u_resolution.y; // WebGL port note: Added
		float e2 = SMAASampleLevelZeroOffset( edgesTex, coords, ivec2( 0, 1 ) ).g;

		// Get the area for this direction:
		weights.ba = SMAAArea( areaTex, sqrt_d, e1, e2, float( subsampleIndices.x ) );
	}

	return weights;
}

void main() {
	// three's SMAABlendingWeightCalculationVS varyings, computed fragment-side.
	vec2 vPixcoord = v_uv / u_resolution;
	vec4 vOffset0 = v_uv.xyxy + u_resolution.xyxy * vec4( -0.25, 0.125, 1.25, 0.125 );
	vec4 vOffset1 = v_uv.xyxy + u_resolution.xyxy * vec4( -0.125, 0.25, -0.125, -1.25 );
	vec4 vOffset2 = vec4( vOffset0.xz, vOffset1.yw ) + vec4( -2.0, 2.0, -2.0, 2.0 ) * u_resolution.xxyy * float( SMAA_MAX_SEARCH_STEPS );
	vec4 vOffset[3] = vec4[3]( vOffset0, vOffset1, vOffset2 );
	outColor = SMAABlendingWeightCalculationPS( v_uv, vPixcoord, vOffset, u_edges, u_area, u_search, ivec4( 0 ) );
}
`;

/** Pass 3 — `SMAANeighborhoodBlendingPS` (`u_weights` = three `tDiffuse`, `u_color` = three `tColor`). */
export const SMAA_BLEND_GLSL = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_weights;  // three tDiffuse — the blend-weights surface
uniform sampler2D u_color;    // three tColor — the colour surface
uniform vec2 u_resolution;
in vec2 v_uv;
out vec4 outColor;

vec4 SMAANeighborhoodBlendingPS( vec2 texcoord, vec4 offset[ 2 ], sampler2D colorTex, sampler2D blendTex ) {
	// Fetch the blending weights for current pixel:
	vec4 a;
	a.xz = texture( blendTex, texcoord ).xz;
	a.y = texture( blendTex, offset[ 1 ].zw ).g;
	a.w = texture( blendTex, offset[ 1 ].xy ).a;

	// Is there any blending weight with a value greater than 0.0?
	if ( dot(a, vec4( 1.0, 1.0, 1.0, 1.0 )) < 1e-5 ) {
		return texture( colorTex, texcoord );
	} else {
		// Up to 4 lines can be crossing a pixel (one through each edge). We
		// favor blending by choosing the line with the maximum weight for each
		// direction:
		vec2 offset;
		offset.x = a.a > a.b ? a.a : -a.b; // left vs. right
		offset.y = a.g > a.r ? -a.g : a.r; // top vs. bottom // WebGL port note: Changed signs

		// Then we go in the direction that has the maximum weight:
		if ( abs( offset.x ) > abs( offset.y )) { // horizontal vs. vertical
			offset.y = 0.0;
		} else {
			offset.x = 0.0;
		}

		// Fetch the opposite color and lerp by hand:
		vec4 C = texture( colorTex, texcoord );
		texcoord += sign( offset ) * u_resolution;
		vec4 Cop = texture( colorTex, texcoord );
		float s = abs( offset.x ) > abs( offset.y ) ? abs( offset.x ) : abs( offset.y );

		// WebGL port note: Added gamma correction
		C.xyz = pow(C.xyz, vec3(2.2));
		Cop.xyz = pow(Cop.xyz, vec3(2.2));
		vec4 mixed = mix(C, Cop, s);
		mixed.xyz = pow(mixed.xyz, vec3(1.0 / 2.2));

		return mixed;
	}
}

void main() {
	// three's SMAANeighborhoodBlendingVS varyings, computed fragment-side.
	vec4 vOffset0 = v_uv.xyxy + u_resolution.xyxy * vec4( -1.0, 0.0, 0.0, 1.0 );
	vec4 vOffset1 = v_uv.xyxy + u_resolution.xyxy * vec4( 1.0, 0.0, 0.0, -1.0 );
	vec4 vOffset[2] = vec4[2]( vOffset0, vOffset1 );
	outColor = SMAANeighborhoodBlendingPS( v_uv, vOffset, u_color, u_weights );
}
`;
