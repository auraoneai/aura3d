/**
 * threejs-parity AD-03 (docs/workflows/threejs-parity-gaps.md §6 lane L4):
 * real OpenEXR decode — the scanline/tile pipeline is a faithful port of
 * three.js r185 `examples/jsm/loaders/EXRLoader.js` (itself a port of the
 * TinyEXR/OpenEXR reference implementation), trimmed to the compression
 * family this lane requires: NO_COMPRESSION, RLE, ZIPS, ZIP and PIZ, with
 * HALF and FLOAT channel pixel types. PXR24, B44/A, DWA/B and deep data
 * throw `unsupported-format` rather than silently mis-decoding.
 *
 * Output mirrors three's `EXRLoader` result shape: `RGBAFormat` RGBA pixels
 * as `Uint16Array` half floats (default) or `Float32Array`, `flipY: false`,
 * `generateMipmaps: false` — feedable straight into `texture.data`.
 */

import { AssetLoadError, type AssetLoader, type AssetLoadRequest } from "./AssetLoader";
import type { LoadContext } from "./LoadContext";

export type AuraEXRDataType = "half" | "float";
export type AuraEXROutputFormat = "rgba" | "rg" | "r";

export interface AuraEXRParseOptions {
  /** Output pixel type — three's `HalfFloatType` (default) vs `FloatType`. */
  readonly type?: AuraEXRDataType;
  /** Channel layout — three's `RGBAFormat` (default), `RGFormat`, `RedFormat`. */
  readonly outputFormat?: AuraEXROutputFormat;
  /** Part index for multi-part files (three's `setPart`). */
  readonly part?: number;
}

export interface AuraEXRTextureData {
  readonly width: number;
  readonly height: number;
  /** RGBA/RG/R interleaved pixels — `Uint16Array` half bits or `Float32Array`. */
  readonly data: Uint16Array | Float32Array;
  /** Pixel channel count — 4 (rgba), 2 (rg) or 1 (r). */
  readonly channels: 4 | 2 | 1;
  readonly type: AuraEXRDataType;
  readonly format: AuraEXROutputFormat;
  readonly colorSpace: "linear";
  /** three parity: decoded EXR data is already device-row ordered. */
  readonly flipY: false;
  readonly generateMipmaps: false;
  /** The parsed EXR header attributes (channels, dataWindow, ...). */
  readonly header: Record<string, unknown>;
}

const warn = (message: string): void => {
  if (typeof console !== "undefined" && typeof console.warn === "function") console.warn(message);
};

/** IEEE-754 half encode (three's `DataUtils.toHalfFloat`, round-to-nearest). */
function toHalfFloat(value: number): number {
  if (Number.isNaN(value)) return 0x7c00 | 1;
  if (value === 0) return value === -Infinity || Object.is(value, -0) ? 0x8000 : 0;
  const sign = value < 0 ? 0x8000 : 0;
  const abs = Math.abs(value);
  if (abs === Infinity) return sign | 0x7c00;
  if (abs >= 65520) return sign | 0x7bff;
  if (abs < 6.103515625e-5) {
    return sign | Math.round(abs / 5.9604644775390625e-8);
  }
  const exponent = Math.floor(Math.log2(abs));
  const mantissa = Math.round((abs / Math.pow(2, exponent) - 1) * 1024);
  return sign | ((exponent + 15) << 10) | (mantissa & 0x3ff);
}

/**
 * zlib inflate for ZIP/ZIPS blocks. `DecompressionStream("deflate")` covers
 * browsers and Node >= 18; the `node:zlib` fallback keeps older Node test
 * environments working. Three vendors fflate's `unzlibSync` — identical zlib
 * semantics either way.
 */
async function inflateZlib(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "function") {
    const stream = new Blob([compressed as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const zlib = await import("node:zlib");
  const out = zlib.inflateSync(compressed);
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

/**
 * Parse an EXR `ArrayBuffer` into interleaved pixel data — the async sibling
 * of three's `EXRLoader.parse` (async only because ZIP/ZIPS inflate via
 * `DecompressionStream` is async).
 */
export async function parseEXR(buffer: ArrayBuffer, options: AuraEXRParseOptions = {}): Promise<AuraEXRTextureData> {

  const outputType: AuraEXRDataType = options.type ?? "half";
  const outputFormat: AuraEXROutputFormat = options.outputFormat ?? "rgba";
  const partIndex = Math.max(0, options.part ?? 0);

  const USHORT_RANGE = ( 1 << 16 );
  const BITMAP_SIZE = ( USHORT_RANGE >> 3 );

  const HUF_ENCBITS = 16; // literal (value) bit length
  const HUF_DECBITS = 14; // decoding bit size (>= 8)

  const HUF_ENCSIZE = ( 1 << HUF_ENCBITS ) + 1; // encoding table size
  const HUF_DECSIZE = 1 << HUF_DECBITS; // decoding table size
  const HUF_DECMASK = HUF_DECSIZE - 1;

  const NBITS = 16;
  const A_OFFSET = 1 << ( NBITS - 1 );
  const MOD_MASK = ( 1 << NBITS ) - 1;

  const SHORT_ZEROCODE_RUN = 59;
  const LONG_ZEROCODE_RUN = 63;
  const SHORTEST_LONG_RUN = 2 + LONG_ZEROCODE_RUN - SHORT_ZEROCODE_RUN;

  const ULONG_SIZE = 8;
  const FLOAT32_SIZE = 4;
  const INT32_SIZE = 4;
  const INT16_SIZE = 2;
  const INT8_SIZE = 1;

  const STATIC_HUFFMAN = 0;
  const DEFLATE = 1;

  const UNKNOWN = 0;
  const LOSSY_DCT = 1;
  const RLE = 2;

  void HUF_DECMASK; void NBITS; void A_OFFSET; void MOD_MASK;
  void ULONG_SIZE; void FLOAT32_SIZE; void STATIC_HUFFMAN; void DEFLATE;
  void UNKNOWN; void LOSSY_DCT; void RLE;

  const logBase = Math.pow( 2.7182818, 2.2 );
  void logBase;

		function parseNullTerminatedString( buffer: any, offset: any ) {

			const uintBuffer = new Uint8Array( buffer );
			let endOffset = 0;

			while ( uintBuffer[ offset.value + endOffset ] != 0 ) {

				endOffset += 1;

			}

			const stringValue = new TextDecoder().decode(
				uintBuffer.slice( offset.value, offset.value + endOffset )
			);

			offset.value = offset.value + endOffset + 1;

			return stringValue;

		}

		function parseFixedLengthString( buffer: any, offset: any, size: any ) {

			const stringValue = new TextDecoder().decode(
				new Uint8Array( buffer ).slice( offset.value, offset.value + size )
			);

			offset.value = offset.value + size;

			return stringValue;

		}

		function parseRational( dataView: any, offset: any ) {

			const x = parseInt32( dataView, offset );
			const y = parseUint32( dataView, offset );

			return [ x, y ];

		}

		function parseTimecode( dataView: any, offset: any ) {

			const x = parseUint32( dataView, offset );
			const y = parseUint32( dataView, offset );

			return [ x, y ];

		}

		function parseInt32( dataView: any, offset: any ) {

			const Int32 = dataView.getInt32( offset.value, true );

			offset.value = offset.value + INT32_SIZE;

			return Int32;

		}

		function parseUint32( dataView: any, offset: any ) {

			const Uint32 = dataView.getUint32( offset.value, true );

			offset.value = offset.value + INT32_SIZE;

			return Uint32;

		}

		function parseUint8Array( uInt8Array: any, offset: any ) {

			const Uint8 = uInt8Array[ offset.value ];

			offset.value = offset.value + INT8_SIZE;

			return Uint8;

		}

		function parseUint8( dataView: any, offset: any ) {

			const Uint8 = dataView.getUint8( offset.value );

			offset.value = offset.value + INT8_SIZE;

			return Uint8;

		}

		const parseInt64 = function ( dataView: any, offset: any ) {

			const int = Number( dataView.getBigInt64( offset.value, true ) );

			offset.value += ULONG_SIZE;

			return int;

		};

		function parseFloat32( dataView: any, offset: any ) {

			const float = dataView.getFloat32( offset.value, true );

			offset.value += FLOAT32_SIZE;

			return float;

		}

		function decodeFloat32( dataView: any, offset: any ) {

			return toHalfFloat( parseFloat32( dataView, offset ) );

		}

		// https://stackoverflow.com/questions/5678432/decompressing-half-precision-floats-in-javascript
		function decodeFloat16( binary: any ) {

			const exponent = ( binary & 0x7C00 ) >> 10,
				fraction = binary & 0x03FF;

			return ( binary >> 15 ? - 1 : 1 ) * (
				exponent ?
					(
						exponent === 0x1F ?
							fraction ? NaN : Infinity :
							Math.pow( 2, exponent - 15 ) * ( 1 + fraction / 0x400 )
					) :
					6.103515625e-5 * ( fraction / 0x400 )
			);

		}

		function parseUint16( dataView: any, offset: any ) {

			const Uint16 = dataView.getUint16( offset.value, true );

			offset.value += INT16_SIZE;

			return Uint16;

		}

		function parseFloat16( buffer: any, offset: any ) {

			return decodeFloat16( parseUint16( buffer, offset ) );

		}

		function parseChlist( dataView: any, buffer: any, offset: any, size: any ) {

			const startOffset = offset.value;
			const channels = [];

			while ( offset.value < ( startOffset + size - 1 ) ) {

				const name = parseNullTerminatedString( buffer, offset );
				const pixelType = parseInt32( dataView, offset );
				const pLinear = parseUint8( dataView, offset );
				offset.value += 3; // reserved, three chars
				const xSampling = parseInt32( dataView, offset );
				const ySampling = parseInt32( dataView, offset );

				channels.push( {
					name: name,
					pixelType: pixelType,
					pLinear: pLinear,
					xSampling: xSampling,
					ySampling: ySampling
				} );

			}

			offset.value += 1;

			return channels;

		}

		function parseChromaticities( dataView: any, offset: any ) {

			const redX = parseFloat32( dataView, offset );
			const redY = parseFloat32( dataView, offset );
			const greenX = parseFloat32( dataView, offset );
			const greenY = parseFloat32( dataView, offset );
			const blueX = parseFloat32( dataView, offset );
			const blueY = parseFloat32( dataView, offset );
			const whiteX = parseFloat32( dataView, offset );
			const whiteY = parseFloat32( dataView, offset );

			return { redX: redX, redY: redY, greenX: greenX, greenY: greenY, blueX: blueX, blueY: blueY, whiteX: whiteX, whiteY: whiteY };

		}

		function parseCompression( dataView: any, offset: any ) {

			const compressionCodes = [
				'NO_COMPRESSION',
				'RLE_COMPRESSION',
				'ZIPS_COMPRESSION',
				'ZIP_COMPRESSION',
				'PIZ_COMPRESSION',
				'PXR24_COMPRESSION',
				'B44_COMPRESSION',
				'B44A_COMPRESSION',
				'DWAA_COMPRESSION',
				'DWAB_COMPRESSION'
			];

			const compression = parseUint8( dataView, offset );

			return compressionCodes[ compression ];

		}

		function parseBox2i( dataView: any, offset: any ) {

			const xMin = parseInt32( dataView, offset );
			const yMin = parseInt32( dataView, offset );
			const xMax = parseInt32( dataView, offset );
			const yMax = parseInt32( dataView, offset );

			return { xMin: xMin, yMin: yMin, xMax: xMax, yMax: yMax };

		}

		function parseLineOrder( dataView: any, offset: any ) {

			const lineOrders = [
				'INCREASING_Y',
				'DECREASING_Y',
				'RANDOM_Y',
			];

			const lineOrder = parseUint8( dataView, offset );

			return lineOrders[ lineOrder ];

		}

		function parseEnvmap( dataView: any, offset: any ) {

			const envmaps = [
				'ENVMAP_LATLONG',
				'ENVMAP_CUBE'
			];

			const envmap = parseUint8( dataView, offset );

			return envmaps[ envmap ];

		}

		function parseTiledesc( dataView: any, offset: any ) {

			const levelModes = [
				'ONE_LEVEL',
				'MIPMAP_LEVELS',
				'RIPMAP_LEVELS',
			];

			const roundingModes = [
				'ROUND_DOWN',
				'ROUND_UP',
			];

			const xSize = parseUint32( dataView, offset );
			const ySize = parseUint32( dataView, offset );
			const modes = parseUint8( dataView, offset );

			return {
				xSize: xSize,
				ySize: ySize,
				levelMode: levelModes[ modes & 0xf ],
				roundingMode: roundingModes[ modes >> 4 ]
			};

		}

		function parseV2f( dataView: any, offset: any ) {

			const x = parseFloat32( dataView, offset );
			const y = parseFloat32( dataView, offset );

			return [ x, y ];

		}

		function parseV3f( dataView: any, offset: any ) {

			const x = parseFloat32( dataView, offset );
			const y = parseFloat32( dataView, offset );
			const z = parseFloat32( dataView, offset );

			return [ x, y, z ];

		}

		function parseValue( dataView: any, buffer: any, offset: any, type: any, size: any ) {

			if ( type === 'string' || type === 'stringvector' || type === 'iccProfile' ) {

				return parseFixedLengthString( buffer, offset, size );

			} else if ( type === 'chlist' ) {

				return parseChlist( dataView, buffer, offset, size );

			} else if ( type === 'chromaticities' ) {

				return parseChromaticities( dataView, offset );

			} else if ( type === 'compression' ) {

				return parseCompression( dataView, offset );

			} else if ( type === 'box2i' ) {

				return parseBox2i( dataView, offset );

			} else if ( type === 'envmap' ) {

				return parseEnvmap( dataView, offset );

			} else if ( type === 'tiledesc' ) {

				return parseTiledesc( dataView, offset );

			} else if ( type === 'lineOrder' ) {

				return parseLineOrder( dataView, offset );

			} else if ( type === 'float' ) {

				return parseFloat32( dataView, offset );

			} else if ( type === 'v2f' ) {

				return parseV2f( dataView, offset );

			} else if ( type === 'v3f' ) {

				return parseV3f( dataView, offset );

			} else if ( type === 'int' ) {

				return parseInt32( dataView, offset );

			} else if ( type === 'rational' ) {

				return parseRational( dataView, offset );

			} else if ( type === 'timecode' ) {

				return parseTimecode( dataView, offset );

			} else if ( type === 'preview' || type === 'deepImageState' || type === 'idmanifest' ) {

				// Known metadata-only types: silently skip, they carry no pixel data.
				offset.value += size;
				return 'skipped';

			} else {

				offset.value += size;
				return undefined;

			}

		}

		function roundLog2( x: any, mode: any ) {

			const log2 = Math.log2( x );
			return mode == 'ROUND_DOWN' ? Math.floor( log2 ) : Math.ceil( log2 );

		}

		function calculateTileLevels( tiledesc: any, w: any, h: any ) {

			let num = 0;

			switch ( tiledesc.levelMode ) {

				case 'ONE_LEVEL':
					num = 1;
					break;

				case 'MIPMAP_LEVELS':
					num = roundLog2( Math.max( w, h ), tiledesc.roundingMode ) + 1;
					break;

				case 'RIPMAP_LEVELS':
					throw new Error( 'EXRLoader: RIPMAP_LEVELS tiles currently unsupported.' );

			}

			return num;

		}

		function calculateTiles( count: any, dataSize: any, size: any, roundingMode: any ) {

			const tiles = new Array( count );

			for ( let i = 0; i < count; i ++ ) {

				const b = ( 1 << i );
				let s = ( dataSize / b ) | 0;

				if ( roundingMode == 'ROUND_UP' && s * b < dataSize ) s += 1;

				const l = Math.max( s, 1 );

				tiles[ i ] = ( ( l + size - 1 ) / size ) | 0;

			}

			return tiles;

		}

		async function parseTiles( this: any ) {

			const EXRDecoder = this;
			const offset = EXRDecoder.offset;
			const tmpOffset = { value: 0 };

			for ( let tile = 0; tile < EXRDecoder.tileCount; tile ++ ) {

				const tileX = parseInt32( EXRDecoder.viewer, offset );
				const tileY = parseInt32( EXRDecoder.viewer, offset );
				offset.value += 8; // skip levels - only parsing top-level
				EXRDecoder.size = parseUint32( EXRDecoder.viewer, offset );

				const startX = tileX * EXRDecoder.blockWidth;
				const startY = tileY * EXRDecoder.blockHeight;
				EXRDecoder.columns = ( startX + EXRDecoder.blockWidth > EXRDecoder.width ) ? EXRDecoder.width - startX : EXRDecoder.blockWidth;
				EXRDecoder.lines = ( startY + EXRDecoder.blockHeight > EXRDecoder.height ) ? EXRDecoder.height - startY : EXRDecoder.blockHeight;

				const bytesBlockLine = EXRDecoder.columns * EXRDecoder.totalBytes;
				const isCompressed = EXRDecoder.size < EXRDecoder.lines * bytesBlockLine;
				const viewer = isCompressed ? await EXRDecoder.uncompress( EXRDecoder ) : uncompressRAW( EXRDecoder );

				offset.value += EXRDecoder.size;

				for ( let line = 0; line < EXRDecoder.lines; line ++ ) {

					const lineOffset = line * EXRDecoder.columns * EXRDecoder.totalBytes;

					for ( let channelID = 0; channelID < EXRDecoder.inputChannels.length; channelID ++ ) {

						const name = EXRHeader.channels[ channelID ].name;
						const lOff = EXRDecoder.channelByteOffsets[ name ] * EXRDecoder.columns;
						const cOff = EXRDecoder.decodeChannels[ name ];

						if ( cOff === undefined ) continue;

						tmpOffset.value = lineOffset + lOff;
						const outLineOffset = ( EXRDecoder.height - ( 1 + startY + line ) ) * EXRDecoder.outLineWidth;

						for ( let x = 0; x < EXRDecoder.columns; x ++ ) {

							const outIndex = outLineOffset + ( x + startX ) * EXRDecoder.outputChannels + cOff;
							EXRDecoder.byteArray[ outIndex ] = EXRDecoder.getter( viewer, tmpOffset );

						}

					}

				}

			}

		}
		function reverseLutFromBitmap( bitmap: any, lut: any ) {

			let k = 0;

			for ( let i = 0; i < USHORT_RANGE; ++ i ) {

				if ( ( i == 0 ) || ( bitmap[ i >> 3 ] & ( 1 << ( i & 7 ) ) ) ) {

					lut[ k ++ ] = i;

				}

			}

			const n = k - 1;

			while ( k < USHORT_RANGE ) lut[ k ++ ] = 0;

			return n;

		}

		function hufClearDecTable( hdec: any ) {

			for ( let i = 0; i < HUF_DECSIZE; i ++ ) {

				hdec[ i ] = {};
				hdec[ i ].len = 0;
				hdec[ i ].lit = 0;
				hdec[ i ].p = null;

			}

		}

		const getBitsReturn = { l: 0, c: 0, lc: 0 };

		function getBits( nBits: any, c: any, lc: any, uInt8Array: any, inOffset: any ) {

			while ( lc < nBits ) {

				c = ( c << 8 ) | parseUint8Array( uInt8Array, inOffset );
				lc += 8;

			}

			lc -= nBits;

			getBitsReturn.l = ( c >> lc ) & ( ( 1 << nBits ) - 1 );
			getBitsReturn.c = c;
			getBitsReturn.lc = lc;

		}

		const hufTableBuffer = new Array( 59 );

		function hufCanonicalCodeTable( hcode: any ) {

			for ( let i = 0; i <= 58; ++ i ) hufTableBuffer[ i ] = 0;
			for ( let i = 0; i < HUF_ENCSIZE; ++ i ) hufTableBuffer[ hcode[ i ] ] += 1;

			let c = 0;

			for ( let i = 58; i > 0; -- i ) {

				const nc = ( ( c + hufTableBuffer[ i ] ) >> 1 );
				hufTableBuffer[ i ] = c;
				c = nc;

			}

			for ( let i = 0; i < HUF_ENCSIZE; ++ i ) {

				const l = hcode[ i ];
				if ( l > 0 ) hcode[ i ] = l | ( hufTableBuffer[ l ] ++ << 6 );

			}

		}

		function hufUnpackEncTable( uInt8Array: any, inOffset: any, ni: any, im: any, iM: any, hcode: any ) {

			const p = inOffset;
			let c = 0;
			let lc = 0;

			for ( ; im <= iM; im ++ ) {

				if ( p.value - inOffset.value > ni ) return false;

				getBits( 6, c, lc, uInt8Array, p );

				const l = getBitsReturn.l;
				c = getBitsReturn.c;
				lc = getBitsReturn.lc;

				hcode[ im ] = l;

				if ( l == LONG_ZEROCODE_RUN ) {

					if ( p.value - inOffset.value > ni ) {

						throw new Error( 'EXRLoader: Something wrong with hufUnpackEncTable' );

					}

					getBits( 8, c, lc, uInt8Array, p );

					let zerun = getBitsReturn.l + SHORTEST_LONG_RUN;
					c = getBitsReturn.c;
					lc = getBitsReturn.lc;

					if ( im + zerun > iM + 1 ) {

						throw new Error( 'EXRLoader: Something wrong with hufUnpackEncTable' );

					}

					while ( zerun -- ) hcode[ im ++ ] = 0;

					im --;

				} else if ( l >= SHORT_ZEROCODE_RUN ) {

					let zerun = l - SHORT_ZEROCODE_RUN + 2;

					if ( im + zerun > iM + 1 ) {

						throw new Error( 'EXRLoader: Something wrong with hufUnpackEncTable' );

					}

					while ( zerun -- ) hcode[ im ++ ] = 0;

					im --;

				}

			}

			hufCanonicalCodeTable( hcode );

		}

		function hufLength( code: any ) {

			return code & 63;

		}

		function hufCode( code: any ) {

			return code >> 6;

		}

		function hufBuildDecTable( hcode: any, im: any, iM: any, hdecod: any ) {

			for ( ; im <= iM; im ++ ) {

				const c = hufCode( hcode[ im ] );
				const l = hufLength( hcode[ im ] );

				if ( c >> l ) {

					throw new Error( 'EXRLoader: Invalid table entry' );

				}

				if ( l > HUF_DECBITS ) {

					const pl = hdecod[ ( c >> ( l - HUF_DECBITS ) ) ];

					if ( pl.len ) {

						throw new Error( 'EXRLoader: Invalid table entry' );

					}

					pl.lit ++;

					if ( pl.p ) {

						const p = pl.p;
						pl.p = new Array( pl.lit );

						for ( let i = 0; i < pl.lit - 1; ++ i ) {

							pl.p[ i ] = p[ i ];

						}

					} else {

						pl.p = new Array( 1 );

					}

					pl.p[ pl.lit - 1 ] = im;

				} else if ( l ) {

					let plOffset = 0;

					for ( let i = 1 << ( HUF_DECBITS - l ); i > 0; i -- ) {

						const pl = hdecod[ ( c << ( HUF_DECBITS - l ) ) + plOffset ];

						if ( pl.len || pl.p ) {

							throw new Error( 'EXRLoader: Invalid table entry' );

						}

						pl.len = l;
						pl.lit = im;

						plOffset ++;

					}

				}

			}

			return true;

		}

		const getCharReturn = { c: 0, lc: 0 };


		function getChar( c: any, lc: any, uInt8Array: any, inOffset: any ) {

			c = ( c << 8 ) | parseUint8Array( uInt8Array, inOffset );
			lc += 8;

			getCharReturn.c = c;
			getCharReturn.lc = lc;

		}

		const getCodeReturn = { c: 0, lc: 0 };

		function getCode( po: any, rlc: any, c: any, lc: any, uInt8Array: any, inOffset: any, outBuffer: any, outBufferOffset: any, outBufferEndOffset: any ) {

			if ( po == rlc ) {

				if ( lc < 8 ) {

					getChar( c, lc, uInt8Array, inOffset );
					c = getCharReturn.c;
					lc = getCharReturn.lc;

				}

				lc -= 8;

				let cs = ( c >> lc );
				cs = new Uint8Array( [ cs ] )[ 0 ];

				if ( outBufferOffset.value + cs > outBufferEndOffset ) {

					return false;

				}

				const s = outBuffer[ outBufferOffset.value - 1 ];

				while ( cs -- > 0 ) {

					outBuffer[ outBufferOffset.value ++ ] = s;

				}

			} else if ( outBufferOffset.value < outBufferEndOffset ) {

				outBuffer[ outBufferOffset.value ++ ] = po;

			} else {

				return false;

			}

			getCodeReturn.c = c;
			getCodeReturn.lc = lc;

		}


		function UInt16( value: any ) {

			return ( value & 0xFFFF );

		}

		function Int16( value: any ) {

			const ref = UInt16( value );
			return ( ref > 0x7FFF ) ? ref - 0x10000 : ref;

		}

		const wdec14Return = { a: 0, b: 0 };

		function wdec14( l: any, h: any ) {

			const ls = Int16( l );
			const hs = Int16( h );

			const hi = hs;
			const ai = ls + ( hi & 1 ) + ( hi >> 1 );

			const as = ai;
			const bs = ai - hi;

			wdec14Return.a = as;
			wdec14Return.b = bs;

		}

		function wdec16( l: any, h: any ) {

			const m = UInt16( l );
			const d = UInt16( h );

			const bb = ( m - ( d >> 1 ) ) & MOD_MASK;
			const aa = ( d + bb - A_OFFSET ) & MOD_MASK;

			wdec14Return.a = aa;
			wdec14Return.b = bb;

		}

		function wav2Decode( buffer: any, j: any, nx: any, ox: any, ny: any, oy: any, mx: any ) {

			const w14 = mx < ( 1 << 14 );
			const n = ( nx > ny ) ? ny : nx;
			let p = 1;
			let p2;
			let py;

			while ( p <= n ) p <<= 1;

			p >>= 1;
			p2 = p;
			p >>= 1;

			while ( p >= 1 ) {

				py = 0;
				const ey = py + oy * ( ny - p2 );
				const oy1 = oy * p;
				const oy2 = oy * p2;
				const ox1 = ox * p;
				const ox2 = ox * p2;
				let i00, i01, i10, i11;

				for ( ; py <= ey; py += oy2 ) {

					let px = py;
					const ex = py + ox * ( nx - p2 );

					for ( ; px <= ex; px += ox2 ) {

						const p01 = px + ox1;
						const p10 = px + oy1;
						const p11 = p10 + ox1;

						if ( w14 ) {

							wdec14( buffer[ px + j ], buffer[ p10 + j ] );

							i00 = wdec14Return.a;
							i10 = wdec14Return.b;

							wdec14( buffer[ p01 + j ], buffer[ p11 + j ] );

							i01 = wdec14Return.a;
							i11 = wdec14Return.b;

							wdec14( i00, i01 );

							buffer[ px + j ] = wdec14Return.a;
							buffer[ p01 + j ] = wdec14Return.b;

							wdec14( i10, i11 );

							buffer[ p10 + j ] = wdec14Return.a;
							buffer[ p11 + j ] = wdec14Return.b;

						} else {

							wdec16( buffer[ px + j ], buffer[ p10 + j ] );

							i00 = wdec14Return.a;
							i10 = wdec14Return.b;

							wdec16( buffer[ p01 + j ], buffer[ p11 + j ] );

							i01 = wdec14Return.a;
							i11 = wdec14Return.b;

							wdec16( i00, i01 );

							buffer[ px + j ] = wdec14Return.a;
							buffer[ p01 + j ] = wdec14Return.b;

							wdec16( i10, i11 );

							buffer[ p10 + j ] = wdec14Return.a;
							buffer[ p11 + j ] = wdec14Return.b;


						}

					}

					if ( nx & p ) {

						const p10 = px + oy1;

						if ( w14 )
							wdec14( buffer[ px + j ], buffer[ p10 + j ] );
						else
							wdec16( buffer[ px + j ], buffer[ p10 + j ] );

						i00 = wdec14Return.a;
						buffer[ p10 + j ] = wdec14Return.b;

						buffer[ px + j ] = i00;

					}

				}

				if ( ny & p ) {

					let px = py;
					const ex = py + ox * ( nx - p2 );

					for ( ; px <= ex; px += ox2 ) {

						const p01 = px + ox1;

						if ( w14 )
							wdec14( buffer[ px + j ], buffer[ p01 + j ] );
						else
							wdec16( buffer[ px + j ], buffer[ p01 + j ] );

						i00 = wdec14Return.a;
						buffer[ p01 + j ] = wdec14Return.b;

						buffer[ px + j ] = i00;

					}

				}

				p2 = p;
				p >>= 1;

			}

			return py;

		}


		function hufDecode( encodingTable: any, decodingTable: any, uInt8Array: any, inOffset: any, ni: any, rlc: any, no: any, outBuffer: any, outOffset: any ) {

			let c = 0;
			let lc = 0;
			const outBufferEndOffset = no;
			const inOffsetEnd = Math.trunc( inOffset.value + ( ni + 7 ) / 8 );

			while ( inOffset.value < inOffsetEnd ) {

				getChar( c, lc, uInt8Array, inOffset );

				c = getCharReturn.c;
				lc = getCharReturn.lc;

				while ( lc >= HUF_DECBITS ) {

					const index = ( c >> ( lc - HUF_DECBITS ) ) & HUF_DECMASK;
					const pl = decodingTable[ index ];

					if ( pl.len ) {

						lc -= pl.len;

						getCode( pl.lit, rlc, c, lc, uInt8Array, inOffset, outBuffer, outOffset, outBufferEndOffset );

						c = getCodeReturn.c;
						lc = getCodeReturn.lc;

					} else {

						if ( ! pl.p ) {

							throw new Error( 'EXRLoader: hufDecode issues' );

						}

						let j;

						for ( j = 0; j < pl.lit; j ++ ) {

							const l = hufLength( encodingTable[ pl.p[ j ] ] );

							while ( lc < l && inOffset.value < inOffsetEnd ) {

								getChar( c, lc, uInt8Array, inOffset );

								c = getCharReturn.c;
								lc = getCharReturn.lc;

							}

							if ( lc >= l ) {

								if ( hufCode( encodingTable[ pl.p[ j ] ] ) == ( ( c >> ( lc - l ) ) & ( ( 1 << l ) - 1 ) ) ) {

									lc -= l;

									getCode( pl.p[ j ], rlc, c, lc, uInt8Array, inOffset, outBuffer, outOffset, outBufferEndOffset );

									c = getCodeReturn.c;
									lc = getCodeReturn.lc;

									break;

								}

							}

						}

						if ( j == pl.lit ) {

							throw new Error( 'EXRLoader: hufDecode issues' );

						}

					}

				}

			}

			const i = ( 8 - ni ) & 7;

			c >>= i;
			lc -= i;

			while ( lc > 0 ) {

				const pl = decodingTable[ ( c << ( HUF_DECBITS - lc ) ) & HUF_DECMASK ];

				if ( pl.len ) {

					lc -= pl.len;

					getCode( pl.lit, rlc, c, lc, uInt8Array, inOffset, outBuffer, outOffset, outBufferEndOffset );

					c = getCodeReturn.c;
					lc = getCodeReturn.lc;

				} else {

					throw new Error( 'EXRLoader: hufDecode issues' );

				}

			}

			return true;

		}

		function hufUncompress( uInt8Array: any, inDataView: any, inOffset: any, nCompressed: any, outBuffer: any, nRaw: any ) {

			const outOffset = { value: 0 };
			const initialInOffset = inOffset.value;

			const im = parseUint32( inDataView, inOffset );
			const iM = parseUint32( inDataView, inOffset );

			inOffset.value += 4;

			const nBits = parseUint32( inDataView, inOffset );

			inOffset.value += 4;

			if ( im < 0 || im >= HUF_ENCSIZE || iM < 0 || iM >= HUF_ENCSIZE ) {

				throw new Error( 'EXRLoader: Something wrong with HUF_ENCSIZE' );

			}

			const freq = new Array( HUF_ENCSIZE );
			const hdec = new Array( HUF_DECSIZE );

			hufClearDecTable( hdec );

			const ni = nCompressed - ( inOffset.value - initialInOffset );

			hufUnpackEncTable( uInt8Array, inOffset, ni, im, iM, freq );

			if ( nBits > 8 * ( nCompressed - ( inOffset.value - initialInOffset ) ) ) {

				throw new Error( 'EXRLoader: Something wrong with hufUncompress' );

			}

			hufBuildDecTable( freq, im, iM, hdec );

			hufDecode( freq, hdec, uInt8Array, inOffset, nBits, iM, nRaw, outBuffer, outOffset );

		}

		function applyLut( lut: any, data: any, nData: any ) {

			for ( let i = 0; i < nData; ++ i ) {

				data[ i ] = lut[ data[ i ] ];

			}

		}


		function predictor( source: any ) {

			for ( let t = 1; t < source.length; t ++ ) {

				const d = source[ t - 1 ] + source[ t ] - 128;
				source[ t ] = d;

			}

		}

		function interleaveScalar( source: any, out: any ) {

			let t1 = 0;
			let t2 = Math.floor( ( source.length + 1 ) / 2 );
			let s = 0;
			const stop = source.length - 1;

			while ( true ) {

				if ( s > stop ) break;
				out[ s ++ ] = source[ t1 ++ ];

				if ( s > stop ) break;
				out[ s ++ ] = source[ t2 ++ ];

			}

		}

		function decodeRunLength( source: any ) {

			let size = source.byteLength;
			const out = new Array();
			let p = 0;

			const reader = new DataView( source );

			while ( size > 0 ) {

				const l = reader.getInt8( p ++ );

				if ( l < 0 ) {

					const count = - l;
					size -= count + 1;

					for ( let i = 0; i < count; i ++ ) {

						out.push( reader.getUint8( p ++ ) );

					}


				} else {

					const count = l;
					size -= 2;

					const value = reader.getUint8( p ++ );

					for ( let i = 0; i < count + 1; i ++ ) {

						out.push( value );

					}

				}

			}

			return out;

		}

		function uncompressRAW( info: any ) {

			return new DataView( info.array.buffer, info.offset.value, info.size );

		}

		function uncompressRLE( info: any ) {

			const compressed = info.viewer.buffer.slice( info.offset.value, info.offset.value + info.size );

			const rawBuffer = new Uint8Array( decodeRunLength( compressed ) );
			const tmpBuffer = new Uint8Array( rawBuffer.length );

			predictor( rawBuffer ); // revert predictor

			interleaveScalar( rawBuffer, tmpBuffer ); // interleave pixels

			return new DataView( tmpBuffer.buffer );

		}

		async function uncompressZIP( info: any ) {

			const compressed = info.array.slice( info.offset.value, info.offset.value + info.size );

			const rawBuffer = await inflateZlib( compressed );
			const tmpBuffer = new Uint8Array( rawBuffer.length );

			predictor( rawBuffer ); // revert predictor

			interleaveScalar( rawBuffer, tmpBuffer ); // interleave pixels

			return new DataView( tmpBuffer.buffer );

		}

		function uncompressPIZ( info: any ) {

			const inDataView = info.viewer;
			const inOffset = { value: info.offset.value };

			const outBuffer = new Uint16Array( info.columns * info.lines * ( info.inputChannels.length * info.type ) );
			const bitmap = new Uint8Array( BITMAP_SIZE );

			// Setup channel info
			let outBufferEnd = 0;
			const pizChannelData = new Array( info.inputChannels.length );
			for ( let i = 0, il = info.inputChannels.length; i < il; i ++ ) {

				pizChannelData[ i ] = {};
				pizChannelData[ i ][ 'start' ] = outBufferEnd;
				pizChannelData[ i ][ 'end' ] = pizChannelData[ i ][ 'start' ];
				pizChannelData[ i ][ 'nx' ] = info.columns;
				pizChannelData[ i ][ 'ny' ] = info.lines;
				pizChannelData[ i ][ 'size' ] = info.type;

				outBufferEnd += pizChannelData[ i ].nx * pizChannelData[ i ].ny * pizChannelData[ i ].size;

			}

			// Read range compression data

			const minNonZero = parseUint16( inDataView, inOffset );
			const maxNonZero = parseUint16( inDataView, inOffset );

			if ( maxNonZero >= BITMAP_SIZE ) {

				throw new Error( 'EXRLoader: Something is wrong with PIZ_COMPRESSION BITMAP_SIZE' );

			}

			if ( minNonZero <= maxNonZero ) {

				for ( let i = 0; i < maxNonZero - minNonZero + 1; i ++ ) {

					bitmap[ i + minNonZero ] = parseUint8( inDataView, inOffset );

				}

			}

			// Reverse LUT
			const lut = new Uint16Array( USHORT_RANGE );
			const maxValue = reverseLutFromBitmap( bitmap, lut );

			const length = parseUint32( inDataView, inOffset );

			// Huffman decoding
			hufUncompress( info.array, inDataView, inOffset, length, outBuffer, outBufferEnd );

			// Wavelet decoding
			for ( let i = 0; i < info.inputChannels.length; ++ i ) {

				const cd = pizChannelData[ i ];

				for ( let j = 0; j < pizChannelData[ i ].size; ++ j ) {

					wav2Decode(
						outBuffer,
						cd.start + j,
						cd.nx,
						cd.size,
						cd.ny,
						cd.nx * cd.size,
						maxValue
					);

				}

			}

			// Expand the pixel data to their original range
			applyLut( lut, outBuffer, outBufferEnd );

			// Rearrange the pixel data into the format expected by the caller.
			let tmpOffset = 0;
			const tmpBuffer = new Uint8Array( outBuffer.buffer.byteLength );
			for ( let y = 0; y < info.lines; y ++ ) {

				for ( let c = 0; c < info.inputChannels.length; c ++ ) {

					const cd = pizChannelData[ c ];

					const n = cd.nx * cd.size;
					const cp = new Uint8Array( outBuffer.buffer, cd.end * INT16_SIZE, n * INT16_SIZE );

					tmpBuffer.set( cp, tmpOffset );
					tmpOffset += n * INT16_SIZE;
					cd.end += n;

				}

			}

			return new DataView( tmpBuffer.buffer );

		}


		async function parseScanline( this: any ) {

			const EXRDecoder = this;
			const offset = EXRDecoder.offset;
			const tmpOffset = { value: 0 };

			for ( let scanlineBlockIdx = 0; scanlineBlockIdx < EXRDecoder.height / EXRDecoder.blockHeight; scanlineBlockIdx ++ ) {

				const line = parseInt32( EXRDecoder.viewer, offset ) - EXRHeader.dataWindow.yMin; // line_no
				EXRDecoder.size = parseUint32( EXRDecoder.viewer, offset ); // data_len
				EXRDecoder.lines = ( ( line + EXRDecoder.blockHeight > EXRDecoder.height ) ? ( EXRDecoder.height - line ) : EXRDecoder.blockHeight );

				const bytesPerLine = EXRDecoder.columns * EXRDecoder.totalBytes;
				const isCompressed = EXRDecoder.size < EXRDecoder.lines * bytesPerLine;
				const viewer = isCompressed ? await EXRDecoder.uncompress( EXRDecoder ) : uncompressRAW( EXRDecoder );

				offset.value += EXRDecoder.size;

				for ( let line_y = 0; line_y < EXRDecoder.lines; line_y ++ ) {

					const true_y = line + line_y;

					const lineOffset = line_y * bytesPerLine;
					const outLineOffset = ( EXRDecoder.height - 1 - true_y ) * EXRDecoder.outLineWidth;

					for ( let channelID = 0; channelID < EXRDecoder.inputChannels.length; channelID ++ ) {

						const name = EXRHeader.channels[ channelID ].name;
						const lOff = EXRDecoder.channelByteOffsets[ name ] * EXRDecoder.columns;
						const cOff = EXRDecoder.decodeChannels[ name ];

						if ( cOff === undefined ) continue;

						tmpOffset.value = lineOffset + lOff;

						for ( let x = 0; x < EXRDecoder.columns; x ++ ) {

							const outIndex = outLineOffset + x * EXRDecoder.outputChannels + cOff;
							EXRDecoder.byteArray[ outIndex ] = EXRDecoder.getter( viewer, tmpOffset );

						}

					}

				}

			}

		}
		async function parseMultiPartScanline( this: any ) {

			const EXRDecoder = this;
			const chunkOffsets = EXRDecoder.chunkOffsets;
			const tmpOffset = { value: 0 };

			for ( let chunkIdx = 0; chunkIdx < chunkOffsets.length; chunkIdx ++ ) {

				const offset = { value: chunkOffsets[ chunkIdx ] };

				offset.value += INT32_SIZE; // skip part number

				const line = parseInt32( EXRDecoder.viewer, offset ) - EXRHeader.dataWindow.yMin;
				EXRDecoder.size = parseUint32( EXRDecoder.viewer, offset );
				EXRDecoder.lines = ( ( line + EXRDecoder.blockHeight > EXRDecoder.height ) ? ( EXRDecoder.height - line ) : EXRDecoder.blockHeight );

				const bytesPerLine = EXRDecoder.columns * EXRDecoder.totalBytes;
				const isCompressed = EXRDecoder.size < EXRDecoder.lines * bytesPerLine;

				const savedOffset = EXRDecoder.offset;
				EXRDecoder.offset = offset;
				const viewer = isCompressed ? await EXRDecoder.uncompress( EXRDecoder ) : uncompressRAW( EXRDecoder );
				EXRDecoder.offset = savedOffset;

				for ( let line_y = 0; line_y < EXRDecoder.lines; line_y ++ ) {

					const true_y = line + line_y;

					const lineOffset = line_y * bytesPerLine;
					const outLineOffset = ( EXRDecoder.height - 1 - true_y ) * EXRDecoder.outLineWidth;

					for ( let channelID = 0; channelID < EXRDecoder.inputChannels.length; channelID ++ ) {

						const name = EXRHeader.channels[ channelID ].name;
						const lOff = EXRDecoder.channelByteOffsets[ name ] * EXRDecoder.columns;
						const cOff = EXRDecoder.decodeChannels[ name ];

						if ( cOff === undefined ) continue;

						tmpOffset.value = lineOffset + lOff;

						for ( let x = 0; x < EXRDecoder.columns; x ++ ) {

							const outIndex = outLineOffset + x * EXRDecoder.outputChannels + cOff;
							EXRDecoder.byteArray[ outIndex ] = EXRDecoder.getter( viewer, tmpOffset );

						}

					}

				}

			}

		}


  function parsePartHeader( dataView: any, buffer: any, offset: any ): any {
    const header: Record<string, unknown> = {};
    let hasAttributes = false;

    while ( true ) {
      const attributeName = parseNullTerminatedString( buffer, offset );
      if ( attributeName === '' ) break;
      hasAttributes = true;

      const attributeType = parseNullTerminatedString( buffer, offset );
      const attributeSize = parseUint32( dataView, offset );
      const attributeValue = parseValue( dataView, buffer, offset, attributeType, attributeSize );

      if ( attributeValue === undefined ) {
        warn( `EXRLoader: Skipped unknown header attribute type '${attributeType}'.` );
      } else {
        header[ attributeName ] = attributeValue;
      }
    }

    return hasAttributes ? header : null;
  }

  function parseHeader( dataView: any, buffer: any, offset: any ): any[] {
    if ( dataView.getUint32( 0, true ) != 20000630 ) {
      throw new AssetLoadError( "EXRLoader: Provided file doesn't appear to be in OpenEXR format.", "exr" );
    }

    const version = dataView.getUint8( 4 );
    const spec = dataView.getUint8( 5 );

    const flags = {
      singleTile: !! ( spec & 2 ),
      longName: !! ( spec & 4 ),
      deepFormat: !! ( spec & 8 ),
      multiPart: !! ( spec & 16 ),
    };

    // start of header
    offset.value = 8; // start at 8 - after pre-amble
    const headers = [];

    if ( flags.multiPart ) {
      while ( true ) {
        const header = parsePartHeader( dataView, buffer, offset );
        if ( header === null ) break;
        header.version = version;
        header.spec = flags;
        headers.push( header );
      }
      if ( headers.length === 0 ) {
        throw new AssetLoadError( "EXRLoader: No valid part headers found.", "exr" );
      }
    } else {
      const header = parsePartHeader( dataView, buffer, offset );
      if ( header === null ) {
        throw new AssetLoadError( "EXRLoader: Missing EXR header attributes.", "exr" );
      }
      header.version = version;
      header.spec = flags;
      headers.push( header );
    }

    return headers;
  }

  function setupDecoder( EXRHeader: any, dataView: any, uInt8Array: any, offset: any ): any {
    const EXRDecoder: Record<string, any> = {
      size: 0,
      viewer: dataView,
      array: uInt8Array,
      offset: offset,
      width: EXRHeader.dataWindow.xMax - EXRHeader.dataWindow.xMin + 1,
      height: EXRHeader.dataWindow.yMax - EXRHeader.dataWindow.yMin + 1,
      inputChannels: EXRHeader.channels,
      channelByteOffsets: {},
      shouldExpand: false,
      yCbCr: false,
      totalBytes: null,
      columns: null,
      lines: null,
      type: null,
      uncompress: null,
      getter: null,
      format: null,
    };

    switch ( EXRHeader.compression ) {
      case 'NO_COMPRESSION':
        EXRDecoder.blockHeight = 1;
        EXRDecoder.uncompress = uncompressRAW;
        break;
      case 'RLE_COMPRESSION':
        EXRDecoder.blockHeight = 1;
        EXRDecoder.uncompress = uncompressRLE;
        break;
      case 'ZIPS_COMPRESSION':
        EXRDecoder.blockHeight = 1;
        EXRDecoder.uncompress = uncompressZIP;
        break;
      case 'ZIP_COMPRESSION':
        EXRDecoder.blockHeight = 16;
        EXRDecoder.uncompress = uncompressZIP;
        break;
      case 'PIZ_COMPRESSION':
        EXRDecoder.blockHeight = 32;
        EXRDecoder.uncompress = uncompressPIZ;
        break;
      default:
        // AD-03 scope: PXR24, B44/A, DWA/B and deep data are out of the lane's
        // required compression family — fail loudly rather than mis-decoding.
        throw new AssetLoadError( `EXRLoader: ${EXRHeader.compression} is unsupported (supported: none, RLE, ZIPS, ZIP, PIZ).`, "exr" );
    }

    const channels: Record<string, unknown> = {};
    for ( const channel of EXRHeader.channels ) {
      switch ( channel.name ) {
        case 'Y': case 'R': case 'G': case 'B': case 'A':
          channels[ channel.name ] = true;
          EXRDecoder.type = channel.pixelType;
          break;
        case 'RY': case 'BY':
          channels[ channel.name ] = true;
          EXRDecoder.yCbCr = true;
          EXRDecoder.type = channel.pixelType;
          break;
        default:
          EXRDecoder.type = channel.pixelType;
          warn( `EXRLoader: unsupported channel ${channel.name}; decoding anyway (pixelType ${channel.pixelType}).` );
      }
    }

    if ( ! ( 'A' in channels ) && ! ( 'R' in channels ) && ! ( 'Y' in channels ) ) {
      throw new AssetLoadError( 'EXRLoader: no recognizable channels found (expected R/G/B/A, Y or RY/BY).', "exr" );
    }

    let fillAlpha = false;
    const channelCount = EXRDecoder.inputChannels.length;
    let invalidOutput = false;

    switch ( channelCount ) {
      case 4:
        if ( outputFormat === "rgba" ) {
          EXRDecoder.format = "rgba";
          EXRDecoder.outputChannels = 4;
          EXRDecoder.decodeChannels = { R: 0, G: 1, B: 2, A: 3 };
        } else if ( outputFormat === "rg" ) {
          EXRDecoder.format = "rg";
          EXRDecoder.outputChannels = 2;
          EXRDecoder.decodeChannels = { R: 0, G: 1 };
        } else if ( outputFormat === "r" ) {
          EXRDecoder.format = "r";
          EXRDecoder.outputChannels = 1;
          EXRDecoder.decodeChannels = { R: 0 };
        } else invalidOutput = true;
        break;
      case 3:
        if ( outputFormat === "rgba" ) {
          fillAlpha = ! channels.A;
          EXRDecoder.format = "rgba";
          EXRDecoder.outputChannels = 4;
          EXRDecoder.decodeChannels = { R: 0, G: 1, B: 2, A: 3 };
        } else if ( outputFormat === "rg" ) {
          EXRDecoder.format = "rg";
          EXRDecoder.outputChannels = 2;
          EXRDecoder.decodeChannels = { R: 0, G: 1 };
        } else if ( outputFormat === "r" ) {
          EXRDecoder.format = "r";
          EXRDecoder.outputChannels = 1;
          EXRDecoder.decodeChannels = { R: 0 };
        } else invalidOutput = true;
        break;
      case 2:
        if ( outputFormat === "rgba" ) {
          fillAlpha = ! channels.A;
          EXRDecoder.format = "rgba";
          EXRDecoder.outputChannels = 4;
          EXRDecoder.decodeChannels = { R: 0, G: 1, B: 2, A: 3 };
        } else if ( outputFormat === "rg" ) {
          EXRDecoder.format = "rg";
          EXRDecoder.outputChannels = 2;
          EXRDecoder.decodeChannels = { R: 0, G: 1 };
        } else if ( outputFormat === "r" ) {
          EXRDecoder.format = "r";
          EXRDecoder.outputChannels = 1;
          EXRDecoder.decodeChannels = { R: 0 };
        } else invalidOutput = true;
        break;
      case 1:
        if ( outputFormat === "rgba" ) {
          fillAlpha = true;
          EXRDecoder.format = "rgba";
          EXRDecoder.outputChannels = 4;
          EXRDecoder.shouldExpand = true;
          EXRDecoder.decodeChannels = { Y: 0 };
        } else if ( outputFormat === "rg" ) {
          EXRDecoder.format = "rg";
          EXRDecoder.outputChannels = 2;
          EXRDecoder.shouldExpand = true;
          EXRDecoder.decodeChannels = { Y: 0 };
        } else if ( outputFormat === "r" ) {
          EXRDecoder.format = "r";
          EXRDecoder.outputChannels = 1;
          EXRDecoder.decodeChannels = { Y: 0 };
        } else invalidOutput = true;
        break;
      default:
        invalidOutput = true;
    }

    if ( invalidOutput ) {
      throw new AssetLoadError( 'EXRLoader: invalid output format for specified file.', "exr" );
    }

    // Luminance/chroma images always decode to RGBA.
    if ( EXRDecoder.yCbCr ) {
      EXRDecoder.format = "rgba";
      EXRDecoder.outputChannels = 4;
      EXRDecoder.decodeChannels = { Y: 0, RY: 1, BY: 2 };
      fillAlpha = true;
    }

    if ( EXRDecoder.type == 1 ) {
      // half
      EXRDecoder.getter = outputType === "float" ? parseFloat16 : parseUint16;
    } else if ( EXRDecoder.type == 2 ) {
      // float
      EXRDecoder.getter = outputType === "float" ? parseFloat32 : decodeFloat32;
    } else {
      throw new AssetLoadError( `EXRLoader: unsupported pixelType ${EXRDecoder.type} for ${EXRHeader.compression}.`, "exr" );
    }

    EXRDecoder.columns = EXRDecoder.width;
    const size = EXRDecoder.width * EXRDecoder.height * EXRDecoder.outputChannels;

    if ( outputType === "float" ) {
      EXRDecoder.byteArray = new Float32Array( size );
      if ( fillAlpha ) EXRDecoder.byteArray.fill( 1, 0, size );
    } else {
      EXRDecoder.byteArray = new Uint16Array( size );
      if ( fillAlpha ) EXRDecoder.byteArray.fill( 0x3C00, 0, size ); // half 1.0
    }

    let byteOffset = 0;
    for ( const channel of EXRHeader.channels ) {
      if ( EXRDecoder.decodeChannels[ channel.name ] !== undefined ) {
        EXRDecoder.channelByteOffsets[ channel.name ] = byteOffset;
      }
      byteOffset += channel.pixelType * 2;
    }

    EXRDecoder.totalBytes = byteOffset;
    EXRDecoder.outLineWidth = EXRDecoder.width * EXRDecoder.outputChannels;

    if ( EXRHeader.spec.deepFormat ) {
      throw new AssetLoadError( 'EXRLoader: deep image data is unsupported.', "exr" );
    } else if ( EXRHeader.spec.singleTile ) {
      EXRDecoder.blockHeight = EXRHeader.tiles.ySize;
      EXRDecoder.blockWidth = EXRHeader.tiles.xSize;

      const numXLevels = calculateTileLevels( EXRHeader.tiles, EXRDecoder.width, EXRDecoder.height );
      const numXTiles = calculateTiles( numXLevels, EXRDecoder.width, EXRHeader.tiles.xSize, EXRHeader.tiles.roundingMode );
      const numYTiles = calculateTiles( numXLevels, EXRDecoder.height, EXRHeader.tiles.ySize, EXRHeader.tiles.roundingMode );
      EXRDecoder.tileCount = numXTiles[ 0 ] * numYTiles[ 0 ];

      for ( let l = 0; l < numXLevels; l ++ )
        for ( let y = 0; y < numYTiles[ l ]; y ++ )
          for ( let x = 0; x < numXTiles[ l ]; x ++ )
            parseInt64( dataView, offset ); // tileOffset

      EXRDecoder.decode = parseTiles.bind( EXRDecoder );
    } else if ( EXRHeader.spec.multiPart ) {
      EXRDecoder.blockWidth = EXRDecoder.width;
      EXRDecoder.chunkOffsets = EXRHeader._chunkOffsets;
      EXRDecoder.decode = parseMultiPartScanline.bind( EXRDecoder );
    } else {
      EXRDecoder.blockWidth = EXRDecoder.width;
      const blockCount = Math.ceil( EXRDecoder.height / EXRDecoder.blockHeight );
      for ( let i = 0; i < blockCount; i ++ )
        parseInt64( dataView, offset ); // scanlineOffset
      EXRDecoder.decode = parseScanline.bind( EXRDecoder );
    }

    return EXRDecoder;
  }

  // start parsing file
  const offset = { value: 0 };
  const bufferDataView = new DataView( buffer );
  const uInt8Array = new Uint8Array( buffer );

  const EXRHeaders = parseHeader( bufferDataView, buffer, offset );
  const EXRHeader = EXRHeaders[ Math.min( partIndex, EXRHeaders.length - 1 ) ];
  if ( ! EXRHeader ) {
    throw new AssetLoadError( "EXRLoader: No EXR headers found.", "exr" );
  }

  // Multi-part files interleave all parts' chunk-offset tables before the
  // pixel data; read the selected part's table and skip the rest.
  if ( EXRHeader.spec.multiPart || EXRHeader.spec.deepFormat ) {
    for ( let p = 0; p < EXRHeaders.length; p ++ ) {
      const chunkCount = EXRHeaders[ p ].chunkCount;
      if ( p === Math.min( partIndex, EXRHeaders.length - 1 ) ) {
        EXRHeader._chunkOffsets = [];
        for ( let i = 0; i < chunkCount; i ++ )
          EXRHeader._chunkOffsets.push( parseInt64( bufferDataView, offset ) );
      } else {
        for ( let i = 0; i < chunkCount; i ++ )
          parseInt64( bufferDataView, offset );
      }
    }
  }

  const EXRDecoder = setupDecoder( EXRHeader, bufferDataView, uInt8Array, offset );

  // parse input data
  await EXRDecoder.decode();

  // output texture post-processing
  if ( EXRDecoder.shouldExpand ) {
    const byteArray = EXRDecoder.byteArray;
    if ( outputFormat === "rgba" ) {
      for ( let i = 0; i < byteArray.length; i += 4 )
        byteArray[ i + 2 ] = ( byteArray[ i + 1 ] = byteArray[ i ] );
    } else if ( outputFormat === "rg" ) {
      for ( let i = 0; i < byteArray.length; i += 2 )
        byteArray[ i + 1 ] = byteArray[ i ];
    }
  }

  // Luminance/chroma → RGB (Rec.709): R = (1+RY)·Y, B = (1+BY)·Y,
  // G = (Y − R·0.2126 − B·0.0722) / 0.7152 — same as three's second pass.
  if ( EXRDecoder.yCbCr ) {
    const byteArray = EXRDecoder.byteArray;
    const nPixels = EXRDecoder.width * EXRDecoder.height;
    if ( outputType === "half" ) {
      for ( let i = 0; i < nPixels; i ++ ) {
        const base = i * 4;
        const Y = decodeFloat16( byteArray[ base ] );
        const RY = decodeFloat16( byteArray[ base + 1 ] );
        const BY = decodeFloat16( byteArray[ base + 2 ] );
        const R = ( 1 + RY ) * Y;
        const B = ( 1 + BY ) * Y;
        const G = ( Y - R * 0.2126 - B * 0.0722 ) / 0.7152;
        byteArray[ base ] = toHalfFloat( Math.max( 0, R ) );
        byteArray[ base + 1 ] = toHalfFloat( Math.max( 0, G ) );
        byteArray[ base + 2 ] = toHalfFloat( Math.max( 0, B ) );
      }
    } else {
      for ( let i = 0; i < nPixels; i ++ ) {
        const base = i * 4;
        const Y = byteArray[ base ];
        const RY = byteArray[ base + 1 ];
        const BY = byteArray[ base + 2 ];
        const R = ( 1 + RY ) * Y;
        const B = ( 1 + BY ) * Y;
        byteArray[ base ] = Math.max( 0, R );
        byteArray[ base + 1 ] = Math.max( 0, ( Y - R * 0.2126 - B * 0.0722 ) / 0.7152 );
        byteArray[ base + 2 ] = Math.max( 0, B );
      }
    }
  }

  return {
    width: EXRDecoder.width,
    height: EXRDecoder.height,
    data: EXRDecoder.byteArray,
    channels: EXRDecoder.outputChannels,
    type: outputType,
    format: EXRDecoder.format,
    colorSpace: "linear",
    flipY: false,
    generateMipmaps: false,
    header: EXRHeader,
  };
}

/**
 * `new THREE.EXRLoader()` — real async decode. Works standalone
 * (`load(url, onLoad?, onProgress?, onError?)` → `Promise<AuraEXRTextureData>`)
 * and as an `AssetManager` loader (`type: "exr"`).
 *
 * `type`/`outputFormat`/`part` mirror three's `setDataType`/`setOutputFormat`/
 * `setPart` builder methods.
 */
export class EXRLoader implements AssetLoader<AuraEXRTextureData> {
  readonly type = "exr";
  outputType: AuraEXRDataType = "half";
  outputFormat: AuraEXROutputFormat = "rgba";
  part = 0;

  setDataType( value: AuraEXRDataType ): this {
    this.outputType = value;
    return this;
  }

  setOutputFormat( value: AuraEXROutputFormat ): this {
    this.outputFormat = value;
    return this;
  }

  setPart( value: number ): this {
    this.part = value;
    return this;
  }

  canLoad( request: AssetLoadRequest ): boolean {
    return ( request.type === this.type || request.type === undefined ) && /\.exr(?:\?.*)?$/i.test( request.url );
  }

  /** AssetManager entry — fetches bytes, then `parseEXR`. */
  async load( request: AssetLoadRequest, context: LoadContext ): Promise<AuraEXRTextureData>;
  /** three signature — `load(url, onLoad?, onProgress?, onError?)`. */
  load( url: string, onLoad?: ( data: AuraEXRTextureData ) => void, onProgress?: ( event: { readonly loaded?: number; readonly total?: number } ) => void, onError?: ( error: unknown ) => void ): Promise<AuraEXRTextureData>;
  load(
    requestOrUrl: AssetLoadRequest | string,
    contextOrOnLoad?: LoadContext | ( ( data: AuraEXRTextureData ) => void ),
    onProgress?: ( event: { readonly loaded?: number; readonly total?: number } ) => void,
    onError?: ( error: unknown ) => void
  ): Promise<AuraEXRTextureData> {
    if ( typeof requestOrUrl === "string" ) {
      const url = requestOrUrl;
      const onLoad = typeof contextOrOnLoad === "function" ? contextOrOnLoad : undefined;
      const pending = this.loadBytes( url )
        .then( ( data ) => { onLoad?.( data ); return data; });
      if ( onError ) pending.catch( onError );
      return pending;
    }

    const request = requestOrUrl;
    const context = contextOrOnLoad as LoadContext;
    context.throwIfAborted( request.url );
    return this.loadBytes( request.url, request.signal );
  }

  /** `parse(buffer)` — three's synchronous-looking parse; async here for zlib. */
  parse( buffer: ArrayBuffer ): Promise<AuraEXRTextureData> {
    return parseEXR( buffer, { type: this.outputType, outputFormat: this.outputFormat, part: this.part } );
  }

  private async loadBytes( url: string, signal?: AbortSignal ): Promise<AuraEXRTextureData> {
    if ( typeof fetch !== "function" ) {
      throw new AssetLoadError( "EXRLoader requires fetch for non-buffer input", url );
    }
    const response = await fetch( url, { signal } );
    if ( ! response.ok ) {
      throw new AssetLoadError( `EXR request failed with ${response.status}`, url );
    }
    const buffer = await response.arrayBuffer();
    try {
      return await parseEXR( buffer, { type: this.outputType, outputFormat: this.outputFormat, part: this.part } );
    } catch ( error ) {
      throw new AssetLoadError(
        error instanceof Error ? error.message : String( error ),
        url,
        [],
        error
      );
    }
  }
}

/** Alias matching three's export name where an explicit class is wanted. */
export { EXRLoader as EXRLoaderThreeCompat };
