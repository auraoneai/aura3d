import { describe, it, expect, beforeEach } from 'vitest';
import { Color } from '../../../math/Color';

describe('Color', () => {
  let red: Color;
  let green: Color;
  let blue: Color;

  beforeEach(() => {
    red = new Color(1, 0, 0, 1);
    green = new Color(0, 1, 0, 1);
    blue = new Color(0, 0, 1, 1);
  });

  describe('constructor', () => {
    it('should create white color by default', () => {
      const color = new Color();
      expect(color.r).toBe(1);
      expect(color.g).toBe(1);
      expect(color.b).toBe(1);
      expect(color.a).toBe(1);
    });

    it('should create color with given RGB components', () => {
      const color = new Color(0.5, 0.6, 0.7);
      expect(color.r).toBe(0.5);
      expect(color.g).toBe(0.6);
      expect(color.b).toBe(0.7);
      expect(color.a).toBe(1);
    });

    it('should create color with RGBA components', () => {
      const color = new Color(0.5, 0.6, 0.7, 0.8);
      expect(color.r).toBe(0.5);
      expect(color.g).toBe(0.6);
      expect(color.b).toBe(0.7);
      expect(color.a).toBe(0.8);
    });
  });

  describe('static named colors', () => {
    it('Color.white() creates white', () => {
      const white = Color.white();
      expect(white.r).toBe(1);
      expect(white.g).toBe(1);
      expect(white.b).toBe(1);
      expect(white.a).toBe(1);
    });

    it('Color.black() creates black', () => {
      const black = Color.black();
      expect(black.r).toBe(0);
      expect(black.g).toBe(0);
      expect(black.b).toBe(0);
      expect(black.a).toBe(1);
    });

    it('Color.red() creates red', () => {
      const red = Color.red();
      expect(red.r).toBe(1);
      expect(red.g).toBe(0);
      expect(red.b).toBe(0);
      expect(red.a).toBe(1);
    });

    it('Color.green() creates green', () => {
      const green = Color.green();
      expect(green.r).toBe(0);
      expect(green.g).toBe(1);
      expect(green.b).toBe(0);
      expect(green.a).toBe(1);
    });

    it('Color.blue() creates blue', () => {
      const blue = Color.blue();
      expect(blue.r).toBe(0);
      expect(blue.g).toBe(0);
      expect(blue.b).toBe(1);
      expect(blue.a).toBe(1);
    });

    it('Color.yellow() creates yellow', () => {
      const yellow = Color.yellow();
      expect(yellow.r).toBe(1);
      expect(yellow.g).toBe(1);
      expect(yellow.b).toBe(0);
      expect(yellow.a).toBe(1);
    });

    it('Color.cyan() creates cyan', () => {
      const cyan = Color.cyan();
      expect(cyan.r).toBe(0);
      expect(cyan.g).toBe(1);
      expect(cyan.b).toBe(1);
      expect(cyan.a).toBe(1);
    });

    it('Color.magenta() creates magenta', () => {
      const magenta = Color.magenta();
      expect(magenta.r).toBe(1);
      expect(magenta.g).toBe(0);
      expect(magenta.b).toBe(1);
      expect(magenta.a).toBe(1);
    });

    it('Color.transparent() creates transparent', () => {
      const transparent = Color.transparent();
      expect(transparent.r).toBe(0);
      expect(transparent.g).toBe(0);
      expect(transparent.b).toBe(0);
      expect(transparent.a).toBe(0);
    });
  });

  describe('arithmetic operations', () => {
    it('add() combines colors', () => {
      const result = red.add(green);
      expect(result.r).toBe(1);
      expect(result.g).toBe(1);
      expect(result.b).toBe(0);
      expect(result.a).toBe(2);
      expect(red.r).toBe(1);
    });

    it('sub() subtracts colors', () => {
      const white = new Color(1, 1, 1);
      const result = white.sub(red);
      expect(result.r).toBe(0);
      expect(result.g).toBe(1);
      expect(result.b).toBe(1);
    });

    it('multiply() multiplies colors component-wise', () => {
      const color1 = new Color(1, 0.5, 0.25);
      const color2 = new Color(0.5, 0.5, 0.5);
      const result = color1.multiply(color2);
      expect(result.r).toBe(0.5);
      expect(result.g).toBe(0.25);
      expect(result.b).toBe(0.125);
    });

    it('scale() multiplies by scalar (affects RGB only)', () => {
      const result = red.scale(0.5);
      expect(result.r).toBe(0.5);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
      expect(result.a).toBe(1);
      expect(red.r).toBe(1);
    });

    it('lerp() linearly interpolates', () => {
      const purple = red.lerp(blue, 0.5);
      expect(purple.r).toBe(0.5);
      expect(purple.g).toBe(0);
      expect(purple.b).toBe(0.5);
      expect(purple.a).toBe(1);
    });

    it('lerp() handles t=0', () => {
      const result = red.lerp(blue, 0);
      expect(result.r).toBe(1);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
    });

    it('lerp() handles t=1', () => {
      const result = red.lerp(blue, 1);
      expect(result.r).toBe(0);
      expect(result.g).toBe(0);
      expect(result.b).toBe(1);
    });
  });

  describe('in-place operations', () => {
    it('addInPlace() mutates original color', () => {
      const original = red;
      const result = red.addInPlace(green);
      expect(result).toBe(original);
      expect(red.r).toBe(1);
      expect(red.g).toBe(1);
      expect(red.b).toBe(0);
    });

    it('subInPlace() mutates original color', () => {
      const white = new Color(1, 1, 1);
      const original = white;
      const result = white.subInPlace(red);
      expect(result).toBe(original);
      expect(white.r).toBe(0);
      expect(white.g).toBe(1);
      expect(white.b).toBe(1);
    });

    it('multiplyInPlace() mutates original color', () => {
      const color = new Color(1, 0.5, 0.25);
      const original = color;
      const result = color.multiplyInPlace(new Color(0.5, 0.5, 0.5));
      expect(result).toBe(original);
      expect(color.r).toBe(0.5);
      expect(color.g).toBe(0.25);
      expect(color.b).toBe(0.125);
    });

    it('scaleInPlace() mutates original color', () => {
      const original = red;
      const result = red.scaleInPlace(0.5);
      expect(result).toBe(original);
      expect(red.r).toBe(0.5);
      expect(red.g).toBe(0);
      expect(red.b).toBe(0);
    });

    it('lerpInPlace() mutates original color', () => {
      const original = red;
      const result = red.lerpInPlace(blue, 0.5);
      expect(result).toBe(original);
      expect(red.r).toBe(0.5);
      expect(red.g).toBe(0);
      expect(red.b).toBe(0.5);
    });

    it('supports method chaining', () => {
      const color = new Color(1, 1, 1);
      color.scaleInPlace(0.5).addInPlace(new Color(0.1, 0.1, 0.1));
      expect(color.r).toBeCloseTo(0.6);
      expect(color.g).toBeCloseTo(0.6);
      expect(color.b).toBeCloseTo(0.6);
    });
  });

  describe('hex conversion', () => {
    it('Color.fromHex() creates from hex number', () => {
      const red = Color.fromHex(0xFF0000);
      expect(red.r).toBeCloseTo(1);
      expect(red.g).toBeCloseTo(0);
      expect(red.b).toBeCloseTo(0);
      expect(red.a).toBe(1);
    });

    it('Color.fromHex() handles RGBA format', () => {
      const semiRed = Color.fromHex(0xFF000080);
      expect(semiRed.r).toBeCloseTo(1);
      expect(semiRed.g).toBeCloseTo(0);
      expect(semiRed.b).toBeCloseTo(0);
      expect(semiRed.a).toBeCloseTo(0.5, 1);
    });

    it('setHex() sets from hex number', () => {
      const color = new Color();
      color.setHex(0x00FF00);
      expect(color.r).toBeCloseTo(0);
      expect(color.g).toBeCloseTo(1);
      expect(color.b).toBeCloseTo(0);
    });

    it('toHex() converts to hex number', () => {
      const hex = red.toHex();
      expect(hex).toBe(0xFF0000);
    });

    it('toHex() includes alpha if < 1', () => {
      const semiRed = new Color(1, 0, 0, 0.5);
      const hex = semiRed.toHex();
      expect(hex).toBe(0xFF000080);
    });

    it('Color.fromHexString() parses #RRGGBB', () => {
      const red = Color.fromHexString('#FF0000');
      expect(red.r).toBeCloseTo(1);
      expect(red.g).toBeCloseTo(0);
      expect(red.b).toBeCloseTo(0);
    });

    it('Color.fromHexString() parses #RGB', () => {
      const red = Color.fromHexString('#F00');
      expect(red.r).toBeCloseTo(1);
      expect(red.g).toBeCloseTo(0);
      expect(red.b).toBeCloseTo(0);
    });

    it('Color.fromHexString() parses #RRGGBBAA', () => {
      const semiRed = Color.fromHexString('#FF000080');
      expect(semiRed.r).toBeCloseTo(1);
      expect(semiRed.g).toBeCloseTo(0);
      expect(semiRed.b).toBeCloseTo(0);
      expect(semiRed.a).toBeCloseTo(0.5, 1);
    });

    it('Color.fromHexString() handles strings without #', () => {
      const red = Color.fromHexString('FF0000');
      expect(red.r).toBeCloseTo(1);
      expect(red.g).toBeCloseTo(0);
      expect(red.b).toBeCloseTo(0);
    });

    it('toHexString() converts to #RRGGBB', () => {
      const hex = red.toHexString();
      expect(hex).toBe('#FF0000');
    });

    it('toHexString() includes alpha if < 1', () => {
      const semiRed = new Color(1, 0, 0, 0.5);
      const hex = semiRed.toHexString();
      expect(hex).toBe('#FF000080');
    });
  });

  describe('HSL color space', () => {
    it('Color.fromHSL() creates from HSL', () => {
      const red = Color.fromHSL(0, 1, 0.5);
      expect(red.r).toBeCloseTo(1);
      expect(red.g).toBeCloseTo(0);
      expect(red.b).toBeCloseTo(0);
    });

    it('setHSL() sets from HSL values', () => {
      const color = new Color();
      color.setHSL(0, 1, 0.5);
      expect(color.r).toBeCloseTo(1);
      expect(color.g).toBeCloseTo(0);
      expect(color.b).toBeCloseTo(0);
    });

    it('setHSL() creates green', () => {
      const color = new Color();
      color.setHSL(0.333, 1, 0.5);
      expect(color.r).toBeCloseTo(0, 1);
      expect(color.g).toBeCloseTo(1, 1);
      expect(color.b).toBeCloseTo(0, 1);
    });

    it('setHSL() creates blue', () => {
      const color = new Color();
      color.setHSL(0.667, 1, 0.5);
      expect(color.r).toBeCloseTo(0, 1);
      expect(color.g).toBeCloseTo(0, 1);
      expect(color.b).toBeCloseTo(1, 1);
    });

    it('setHSL() handles saturation=0 (grayscale)', () => {
      const color = new Color();
      color.setHSL(0.5, 0, 0.5);
      expect(color.r).toBeCloseTo(0.5);
      expect(color.g).toBeCloseTo(0.5);
      expect(color.b).toBeCloseTo(0.5);
    });

    it('toHSL() converts to HSL', () => {
      const hsl = red.toHSL();
      expect(hsl.h).toBeCloseTo(0);
      expect(hsl.s).toBeCloseTo(1);
      expect(hsl.l).toBeCloseTo(0.5);
    });

    it('toHSL() converts green', () => {
      const hsl = green.toHSL();
      expect(hsl.h).toBeCloseTo(0.333, 2);
      expect(hsl.s).toBeCloseTo(1);
      expect(hsl.l).toBeCloseTo(0.5);
    });

    it('toHSL() converts blue', () => {
      const hsl = blue.toHSL();
      expect(hsl.h).toBeCloseTo(0.667, 2);
      expect(hsl.s).toBeCloseTo(1);
      expect(hsl.l).toBeCloseTo(0.5);
    });

    it('toHSL() converts grayscale', () => {
      const gray = new Color(0.5, 0.5, 0.5);
      const hsl = gray.toHSL();
      expect(hsl.h).toBe(0);
      expect(hsl.s).toBe(0);
      expect(hsl.l).toBeCloseTo(0.5);
    });

    it('HSL round-trip preserves color', () => {
      const original = new Color(0.7, 0.4, 0.2);
      const hsl = original.toHSL();
      const restored = Color.fromHSL(hsl.h, hsl.s, hsl.l);
      expect(restored.r).toBeCloseTo(original.r, 3);
      expect(restored.g).toBeCloseTo(original.g, 3);
      expect(restored.b).toBeCloseTo(original.b, 3);
    });
  });

  describe('HSV color space', () => {
    it('Color.fromHSV() creates from HSV', () => {
      const red = Color.fromHSV(0, 1, 1);
      expect(red.r).toBeCloseTo(1);
      expect(red.g).toBeCloseTo(0);
      expect(red.b).toBeCloseTo(0);
    });

    it('setHSV() sets from HSV values', () => {
      const color = new Color();
      color.setHSV(0, 1, 1);
      expect(color.r).toBeCloseTo(1);
      expect(color.g).toBeCloseTo(0);
      expect(color.b).toBeCloseTo(0);
    });

    it('setHSV() creates green', () => {
      const color = new Color();
      color.setHSV(0.333, 1, 1);
      expect(color.r).toBeCloseTo(0, 1);
      expect(color.g).toBeCloseTo(1, 1);
      expect(color.b).toBeCloseTo(0, 1);
    });

    it('setHSV() creates blue', () => {
      const color = new Color();
      color.setHSV(0.667, 1, 1);
      expect(color.r).toBeCloseTo(0, 1);
      expect(color.g).toBeCloseTo(0, 1);
      expect(color.b).toBeCloseTo(1, 1);
    });

    it('setHSV() handles saturation=0 (grayscale)', () => {
      const color = new Color();
      color.setHSV(0.5, 0, 0.5);
      expect(color.r).toBeCloseTo(0.5);
      expect(color.g).toBeCloseTo(0.5);
      expect(color.b).toBeCloseTo(0.5);
    });

    it('toHSV() converts to HSV', () => {
      const hsv = red.toHSV();
      expect(hsv.h).toBeCloseTo(0);
      expect(hsv.s).toBeCloseTo(1);
      expect(hsv.v).toBeCloseTo(1);
    });

    it('toHSV() converts grayscale', () => {
      const gray = new Color(0.5, 0.5, 0.5);
      const hsv = gray.toHSV();
      expect(hsv.h).toBe(0);
      expect(hsv.s).toBe(0);
      expect(hsv.v).toBeCloseTo(0.5);
    });

    it('HSV round-trip preserves color', () => {
      const original = new Color(0.7, 0.4, 0.2);
      const hsv = original.toHSV();
      const restored = Color.fromHSV(hsv.h, hsv.s, hsv.v);
      expect(restored.r).toBeCloseTo(original.r, 3);
      expect(restored.g).toBeCloseTo(original.g, 3);
      expect(restored.b).toBeCloseTo(original.b, 3);
    });
  });

  describe('gamma correction', () => {
    it('toLinear() converts from sRGB to linear', () => {
      const srgb = new Color(0.5, 0.5, 0.5);
      const linear = srgb.toLinear();
      expect(linear.r).toBeCloseTo(0.214, 2);
      expect(linear.g).toBeCloseTo(0.214, 2);
      expect(linear.b).toBeCloseTo(0.214, 2);
      expect(linear.a).toBe(1);
      expect(srgb.r).toBe(0.5);
    });

    it('toSRGB() converts from linear to sRGB', () => {
      const linear = new Color(0.214, 0.214, 0.214);
      const srgb = linear.toSRGB();
      expect(srgb.r).toBeCloseTo(0.5, 1);
      expect(srgb.g).toBeCloseTo(0.5, 1);
      expect(srgb.b).toBeCloseTo(0.5, 1);
      expect(srgb.a).toBe(1);
    });

    it('toLinearInPlace() mutates original color', () => {
      const color = new Color(0.5, 0.5, 0.5);
      const original = color;
      const result = color.toLinearInPlace();
      expect(result).toBe(original);
      expect(color.r).toBeCloseTo(0.214, 2);
      expect(color.g).toBeCloseTo(0.214, 2);
      expect(color.b).toBeCloseTo(0.214, 2);
    });

    it('toSRGBInPlace() mutates original color', () => {
      const color = new Color(0.214, 0.214, 0.214);
      const original = color;
      const result = color.toSRGBInPlace();
      expect(result).toBe(original);
      expect(color.r).toBeCloseTo(0.5, 1);
      expect(color.g).toBeCloseTo(0.5, 1);
      expect(color.b).toBeCloseTo(0.5, 1);
    });

    it('gamma correction round-trip preserves color', () => {
      const original = new Color(0.5, 0.6, 0.7);
      const linear = original.toLinear();
      const backToSRGB = linear.toSRGB();
      expect(backToSRGB.r).toBeCloseTo(original.r, 2);
      expect(backToSRGB.g).toBeCloseTo(original.g, 2);
      expect(backToSRGB.b).toBeCloseTo(original.b, 2);
    });
  });

  describe('alpha operations', () => {
    it('toPremultipliedAlpha() multiplies RGB by alpha', () => {
      const color = new Color(1, 0.5, 0.25, 0.5);
      const premul = color.toPremultipliedAlpha();
      expect(premul.r).toBe(0.5);
      expect(premul.g).toBe(0.25);
      expect(premul.b).toBe(0.125);
      expect(premul.a).toBe(0.5);
      expect(color.r).toBe(1);
    });

    it('toUnpremultipliedAlpha() divides RGB by alpha', () => {
      const premul = new Color(0.5, 0.25, 0.125, 0.5);
      const unpremul = premul.toUnpremultipliedAlpha();
      expect(unpremul.r).toBe(1);
      expect(unpremul.g).toBe(0.5);
      expect(unpremul.b).toBe(0.25);
      expect(unpremul.a).toBe(0.5);
    });

    it('toUnpremultipliedAlpha() handles zero alpha', () => {
      const color = new Color(0.5, 0.5, 0.5, 0);
      const unpremul = color.toUnpremultipliedAlpha();
      expect(unpremul.r).toBe(0.5);
      expect(unpremul.g).toBe(0.5);
      expect(unpremul.b).toBe(0.5);
      expect(unpremul.a).toBe(0);
    });

    it('premultiplied alpha round-trip preserves color', () => {
      const original = new Color(1, 0.5, 0.25, 0.5);
      const premul = original.toPremultipliedAlpha();
      const unpremul = premul.toUnpremultipliedAlpha();
      expect(unpremul.r).toBeCloseTo(original.r);
      expect(unpremul.g).toBeCloseTo(original.g);
      expect(unpremul.b).toBeCloseTo(original.b);
      expect(unpremul.a).toBeCloseTo(original.a);
    });
  });

  describe('CSS string conversion', () => {
    it('toCSSString() converts to rgb()', () => {
      const css = red.toCSSString();
      expect(css).toBe('rgb(255, 0, 0)');
    });

    it('toCSSString() converts to rgba() with alpha', () => {
      const semiRed = new Color(1, 0, 0, 0.5);
      const css = semiRed.toCSSString();
      expect(css).toBe('rgba(255, 0, 0, 0.5)');
    });

    it('Color.fromCSS() parses hex', () => {
      const color = Color.fromCSS('#FF0000');
      expect(color.r).toBeCloseTo(1);
      expect(color.g).toBeCloseTo(0);
      expect(color.b).toBeCloseTo(0);
    });

    it('Color.fromCSS() parses rgb()', () => {
      const color = Color.fromCSS('rgb(255, 0, 0)');
      expect(color.r).toBeCloseTo(1);
      expect(color.g).toBeCloseTo(0);
      expect(color.b).toBeCloseTo(0);
    });

    it('Color.fromCSS() parses rgba()', () => {
      const color = Color.fromCSS('rgba(255, 0, 0, 0.5)');
      expect(color.r).toBeCloseTo(1);
      expect(color.g).toBeCloseTo(0);
      expect(color.b).toBeCloseTo(0);
      expect(color.a).toBe(0.5);
    });

    it('Color.fromCSS() parses hsl()', () => {
      const color = Color.fromCSS('hsl(0, 100%, 50%)');
      expect(color.r).toBeCloseTo(1, 1);
      expect(color.g).toBeCloseTo(0, 1);
      expect(color.b).toBeCloseTo(0, 1);
    });

    it('Color.fromCSS() parses hsla()', () => {
      const color = Color.fromCSS('hsla(0, 100%, 50%, 0.5)');
      expect(color.r).toBeCloseTo(1, 1);
      expect(color.g).toBeCloseTo(0, 1);
      expect(color.b).toBeCloseTo(0, 1);
      expect(color.a).toBe(0.5);
    });

    it('Color.fromCSS() parses named colors', () => {
      const red = Color.fromCSS('red');
      expect(red.r).toBeCloseTo(1);
      expect(red.g).toBeCloseTo(0);
      expect(red.b).toBeCloseTo(0);
    });

    it('Color.fromCSS() handles case insensitivity', () => {
      const red = Color.fromCSS('RED');
      expect(red.r).toBeCloseTo(1);
    });

    it('Color.fromCSS() falls back to white for invalid input', () => {
      const color = Color.fromCSS('invalid-color');
      expect(color.r).toBe(1);
      expect(color.g).toBe(1);
      expect(color.b).toBe(1);
    });
  });

  describe('color temperature', () => {
    it('Color.fromTemperature() creates warm color', () => {
      const warm = Color.fromTemperature(2700);
      expect(warm.r).toBeGreaterThan(warm.b);
    });

    it('Color.fromTemperature() creates daylight color', () => {
      const daylight = Color.fromTemperature(6500);
      expect(daylight.r).toBeCloseTo(daylight.g, 0);
      expect(daylight.g).toBeCloseTo(daylight.b, 0);
    });

    it('Color.fromTemperature() creates cool color', () => {
      const cool = Color.fromTemperature(9000);
      expect(cool.b).toBeGreaterThan(cool.r);
    });

    it('setTemperature() clamps to valid range', () => {
      const color = new Color();
      color.setTemperature(100);
      expect(color.r).toBeGreaterThanOrEqual(0);
      expect(color.r).toBeLessThanOrEqual(1);

      color.setTemperature(100000);
      expect(color.b).toBeGreaterThanOrEqual(0);
      expect(color.b).toBeLessThanOrEqual(1);
    });
  });

  describe('luminance', () => {
    it('luminance() calculates perceptual brightness', () => {
      const white = Color.white();
      expect(white.luminance()).toBeCloseTo(1);

      const black = Color.black();
      expect(black.luminance()).toBeCloseTo(0);
    });

    it('luminance() weighs green most heavily', () => {
      const redLum = red.luminance();
      const greenLum = green.luminance();
      const blueLum = blue.luminance();

      expect(greenLum).toBeGreaterThan(redLum);
      expect(greenLum).toBeGreaterThan(blueLum);
    });

    it('luminance() uses correct coefficients', () => {
      const lum = red.luminance();
      expect(lum).toBeCloseTo(0.2126, 3);
    });
  });

  describe('utility methods', () => {
    it('clone() creates copy', () => {
      const clone = red.clone();
      expect(clone.r).toBe(red.r);
      expect(clone.g).toBe(red.g);
      expect(clone.b).toBe(red.b);
      expect(clone.a).toBe(red.a);
      expect(clone).not.toBe(red);

      clone.r = 0.5;
      expect(red.r).toBe(1);
    });

    it('copy() copies from another color', () => {
      const target = new Color(0, 0, 0, 0);
      const result = target.copy(red);
      expect(result).toBe(target);
      expect(target.r).toBe(1);
      expect(target.g).toBe(0);
      expect(target.b).toBe(0);
      expect(target.a).toBe(1);
    });

    it('set() sets all components', () => {
      const color = new Color();
      const result = color.set(0.5, 0.6, 0.7, 0.8);
      expect(result).toBe(color);
      expect(color.r).toBe(0.5);
      expect(color.g).toBe(0.6);
      expect(color.b).toBe(0.7);
      expect(color.a).toBe(0.8);
    });

    it('setRGB() sets RGB components', () => {
      const color = new Color();
      const result = color.setRGB(0.5, 0.6, 0.7);
      expect(result).toBe(color);
      expect(color.r).toBe(0.5);
      expect(color.g).toBe(0.6);
      expect(color.b).toBe(0.7);
      expect(color.a).toBe(1);
    });

    it('equals() compares colors with epsilon', () => {
      const c1 = new Color(1.0, 0.5, 0.25, 1.0);
      const c2 = new Color(1.0000001, 0.5000001, 0.25000001, 1.0);
      const c3 = new Color(0.9, 0.5, 0.25, 1.0);

      expect(c1.equals(c2)).toBe(true);
      expect(c1.equals(c3)).toBe(false);
    });

    it('toArray() returns array', () => {
      const arr = red.toArray();
      expect(arr).toEqual([1, 0, 0, 1]);
      expect(Array.isArray(arr)).toBe(true);
    });

    it('fromArray() sets from array', () => {
      const color = new Color();
      const result = color.fromArray([0.5, 0.6, 0.7, 0.8]);
      expect(result).toBe(color);
      expect(color.r).toBe(0.5);
      expect(color.g).toBe(0.6);
      expect(color.b).toBe(0.7);
      expect(color.a).toBe(0.8);
    });

    it('fromArray() defaults alpha to 1', () => {
      const color = new Color();
      color.fromArray([0.5, 0.6, 0.7]);
      expect(color.a).toBe(1);
    });

    it('fromArray() supports offset', () => {
      const color = new Color();
      color.fromArray([0, 0.5, 0.6, 0.7, 0.8], 1);
      expect(color.r).toBe(0.5);
      expect(color.g).toBe(0.6);
      expect(color.b).toBe(0.7);
      expect(color.a).toBe(0.8);
    });

    it('toJSON() converts to object', () => {
      const json = red.toJSON();
      expect(json).toEqual({ r: 1, g: 0, b: 0, a: 1 });
      expect(JSON.stringify(red)).toBe('{"r":1,"g":0,"b":0,"a":1}');
    });
  });

  describe('HDR support', () => {
    it('allows RGB values greater than 1', () => {
      const hdr = new Color(2, 3, 4);
      expect(hdr.r).toBe(2);
      expect(hdr.g).toBe(3);
      expect(hdr.b).toBe(4);
    });

    it('scale() preserves HDR values', () => {
      const hdr = new Color(2, 2, 2);
      const scaled = hdr.scale(0.5);
      expect(scaled.r).toBe(1);
      expect(scaled.g).toBe(1);
      expect(scaled.b).toBe(1);
    });

    it('toHex() clamps HDR values to [0,1]', () => {
      const hdr = new Color(2, 0, 0);
      const hex = hdr.toHex();
      expect(hex).toBe(0xFF0000);
    });
  });

  describe('edge cases', () => {
    it('handles negative RGB values in toHex', () => {
      const color = new Color(-1, -1, -1);
      const hex = color.toHex();
      expect(hex).toBe(0x000000);
    });

    it('handles values > 1 in toHex', () => {
      const color = new Color(2, 2, 2);
      const hex = color.toHex();
      expect(hex).toBe(0xFFFFFF);
    });

    it('handles NaN in equals()', () => {
      const c1 = new Color(NaN, NaN, NaN, NaN);
      const c2 = new Color(1, 0, 0, 1);
      expect(c1.equals(c2)).toBe(false);
      expect(c1.equals(c1)).toBe(false);
    });

    it('handles Infinity in operations', () => {
      const color = new Color(Infinity, Infinity, Infinity, Infinity);
      const finite = new Color(1, 1, 1, 1);
      const sum = finite.add(color);
      expect(sum.r).toBe(Infinity);
    });

    it('handles division by zero in alpha operations', () => {
      const color = new Color(0, 0, 0, 0);
      const unpremul = color.toUnpremultipliedAlpha();
      expect(isFinite(unpremul.r)).toBe(true);
    });
  });

  describe('immutability of operations', () => {
    it('add() does not mutate original colors', () => {
      const redOriginal = { r: red.r, g: red.g, b: red.b, a: red.a };
      red.add(green);
      expect(red.r).toBe(redOriginal.r);
      expect(red.g).toBe(redOriginal.g);
      expect(red.b).toBe(redOriginal.b);
      expect(red.a).toBe(redOriginal.a);
    });

    it('multiply() does not mutate original colors', () => {
      const redOriginal = { r: red.r, g: red.g, b: red.b, a: red.a };
      red.multiply(green);
      expect(red.r).toBe(redOriginal.r);
    });

    it('scale() does not mutate original color', () => {
      const redOriginal = { r: red.r, g: red.g, b: red.b, a: red.a };
      red.scale(0.5);
      expect(red.r).toBe(redOriginal.r);
    });

    it('lerp() does not mutate original colors', () => {
      const redOriginal = { r: red.r, g: red.g, b: red.b, a: red.a };
      red.lerp(blue, 0.5);
      expect(red.r).toBe(redOriginal.r);
    });

    it('toLinear() does not mutate original color', () => {
      const color = new Color(0.5, 0.5, 0.5);
      const original = { r: color.r, g: color.g, b: color.b };
      color.toLinear();
      expect(color.r).toBe(original.r);
    });

    it('toSRGB() does not mutate original color', () => {
      const color = new Color(0.214, 0.214, 0.214);
      const original = { r: color.r, g: color.g, b: color.b };
      color.toSRGB();
      expect(color.r).toBe(original.r);
    });

    it('toPremultipliedAlpha() does not mutate original color', () => {
      const color = new Color(1, 0.5, 0.25, 0.5);
      const original = { r: color.r, g: color.g, b: color.b, a: color.a };
      color.toPremultipliedAlpha();
      expect(color.r).toBe(original.r);
    });
  });
});
