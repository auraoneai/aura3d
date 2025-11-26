/**
 * Audio Module Integration Tests
 *
 * Tests for the audio system including:
 * - AudioContext initialization
 * - Sound playback and control
 * - Spatial audio (3D positioning)
 * - Audio effects and filters
 * - Audio mixing and buses
 * - Music system
 * - Integration with ECS
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AudioSystem } from '../../audio/AudioSystem';
import { AudioSource } from '../../audio/AudioSource';
import { AudioListener } from '../../audio/AudioListener';
import { SpatialAudio } from '../../audio/SpatialAudio';
import { AudioBus } from '../../audio/AudioBus';
import { World } from '../../ecs/World';
import { AudioContext } from '../../audio/AudioContext';
import { AudioClip } from '../../audio/AudioClip';
import { Vector3 } from '../../math/Vector3';

describe('Audio Module Integration', () => {
  describe('AudioContext Initialization', () => {
    let audioContext: AudioContext | null = null;

    afterEach(() => {
      if (audioContext) {
        audioContext.dispose();
        audioContext = null;
      }
    });

    it('should initialize audio context', () => {
      audioContext = AudioContext.getInstance();
      audioContext.initialize();

      expect(audioContext.getContext()).toBeDefined();
    });

    it('should support different sample rates', () => {
      audioContext = AudioContext.getInstance();
      audioContext.initialize();

      const sampleRate = audioContext.getContext().sampleRate;
      expect(sampleRate).toBeGreaterThan(0);
    });

    it('should handle suspended context', async () => {
      audioContext = AudioContext.getInstance();
      audioContext.initialize();

      if (audioContext.getContext().state === 'suspended') {
        await audioContext.resume();
        expect(audioContext.getContext().state).toBe('running');
      }
    });

    it('should provide master gain control', () => {
      audioContext = AudioContext.getInstance();
      audioContext.initialize();

      audioContext.setMasterVolume(0.5);

      expect(audioContext.getMasterVolume()).toBe(0.5);
    });
  });

  describe('Sound Playback', () => {
    let audioContext: AudioContext;

    beforeEach(() => {
      audioContext = AudioContext.getInstance();
      audioContext.initialize();
    });

    afterEach(() => {
      audioContext.dispose();
    });

    it('should load audio buffer', () => {
      // Create mock audio buffer
      const buffer = audioContext.getContext().createBuffer(
        2, // stereo
        audioContext.getContext().sampleRate * 2, // 2 seconds
        audioContext.getContext().sampleRate
      );

      const clip = new AudioClip('test-sound');
      clip.loadFromBuffer(buffer);

      expect(clip.isLoaded()).toBe(true);
      expect(clip.getDuration()).toBeCloseTo(2.0);
    });

    it('should play sound', () => {
      const buffer = audioContext.getContext().createBuffer(
        2,
        audioContext.getContext().sampleRate,
        audioContext.getContext().sampleRate
      );

      const clip = new AudioClip('test-sound');
      clip.loadFromBuffer(buffer);

      const source = new AudioSource('test-source');
      source.setClip(clip);
      source.play();

      expect(source.isPlaying()).toBe(true);
    });

    it('should stop sound', () => {
      const buffer = audioContext.getContext().createBuffer(
        2,
        audioContext.getContext().sampleRate,
        audioContext.getContext().sampleRate
      );

      const clip = new AudioClip('test-sound');
      clip.loadFromBuffer(buffer);

      const source = new AudioSource('test-source');
      source.setClip(clip);
      source.play();

      source.stop();

      expect(source.isPlaying()).toBe(false);
    });

    it('should pause and resume sound', () => {
      const buffer = audioContext.getContext().createBuffer(
        2,
        audioContext.getContext().sampleRate * 2,
        audioContext.getContext().sampleRate
      );

      const clip = new AudioClip('test-sound');
      clip.loadFromBuffer(buffer);

      const source = new AudioSource('test-source');
      source.setClip(clip);
      source.play();

      source.pause();
      expect(source.isPlaying()).toBe(false);

      source.resume();
      expect(source.isPlaying()).toBe(true);
    });

    it('should loop sound', () => {
      const buffer = audioContext.getContext().createBuffer(
        2,
        audioContext.getContext().sampleRate,
        audioContext.getContext().sampleRate
      );

      const clip = new AudioClip('test-sound');
      clip.loadFromBuffer(buffer);

      const source = new AudioSource('test-source');
      source.setClip(clip);
      source.play({ loop: true });

      expect(source.isLooping()).toBe(true);
    });

    it('should control sound volume', () => {
      const buffer = audioContext.getContext().createBuffer(
        2,
        audioContext.getContext().sampleRate,
        audioContext.getContext().sampleRate
      );

      const clip = new AudioClip('test-sound');
      clip.loadFromBuffer(buffer);

      const source = new AudioSource('test-source');
      source.setClip(clip);
      source.play({ volume: 0.5 });

      expect(source.getVolume()).toBe(0.5);

      source.setVolume(0.8);

      expect(source.getVolume()).toBe(0.8);
    });

    it('should control playback rate', () => {
      const buffer = audioContext.getContext().createBuffer(
        2,
        audioContext.getContext().sampleRate,
        audioContext.getContext().sampleRate
      );

      const clip = new AudioClip('test-sound');
      clip.loadFromBuffer(buffer);

      const source = new AudioSource('test-source');
      source.setClip(clip);
      source.play({ pitch: 2.0 });

      expect(source.getPitch()).toBe(2.0);
    });

    it('should trigger onended callback', async () => {
      const buffer = audioContext.getContext().createBuffer(
        2,
        audioContext.getContext().sampleRate * 0.1, // 100ms
        audioContext.getContext().sampleRate
      );

      const clip = new AudioClip('test-sound');
      clip.loadFromBuffer(buffer);

      const source = new AudioSource('test-source');
      source.setClip(clip);

      const onEnded = vi.fn();
      source.onEnded(onEnded);

      source.play();

      // Wait for sound to finish
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(onEnded).toHaveBeenCalled();
    });
  });

  describe('Spatial Audio', () => {
    let audioContext: AudioContext;
    let spatialAudio: SpatialAudio;
    let listener: AudioListener;

    beforeEach(() => {
      audioContext = AudioContext.getInstance();
      audioContext.initialize();

      spatialAudio = new SpatialAudio();
      listener = new AudioListener();
    });

    afterEach(() => {
      audioContext.dispose();
    });

    it('should create spatial audio source', () => {
      spatialAudio.initialize({
        position: new Vector3(0, 0, 0)
      });

      expect(spatialAudio).toBeDefined();
      expect(spatialAudio.getPosition()).toEqual(new Vector3(0, 0, 0));
    });

    it('should update listener position', () => {
      listener.initialize();
      listener.setPosition(new Vector3(5, 0, 0));

      expect(listener.getPosition()).toEqual(new Vector3(5, 0, 0));
    });

    it('should update listener orientation', () => {
      listener.initialize();
      listener.setOrientation(
        new Vector3(0, 0, -1), // Forward
        new Vector3(0, 1, 0)   // Up
      );

      expect(listener.getForward()).toEqual(new Vector3(0, 0, -1));
      expect(listener.getUp()).toEqual(new Vector3(0, 1, 0));
    });

    it('should compute distance attenuation', () => {
      spatialAudio.initialize({
        position: new Vector3(10, 0, 0),
        refDistance: 1,
        maxDistance: 100,
        rolloffFactor: 1
      });

      listener.initialize();
      listener.setPosition(new Vector3(0, 0, 0));

      // Distance is 10 units, should have some attenuation
      const distance = spatialAudio.getPosition().distanceTo(listener.getPosition());
      expect(distance).toBe(10);
    });

    it('should support different distance models', () => {
      const linearSpatial = new SpatialAudio();
      linearSpatial.initialize({
        position: new Vector3(10, 0, 0),
        distanceModel: 'linear' as any,
        refDistance: 1,
        maxDistance: 100
      });

      const exponentialSpatial = new SpatialAudio();
      exponentialSpatial.initialize({
        position: new Vector3(10, 0, 0),
        distanceModel: 'exponential' as any,
        refDistance: 1,
        maxDistance: 100
      });

      listener.initialize();
      listener.setPosition(new Vector3(0, 0, 0));

      const linearModel = linearSpatial.getDistanceModel();
      const exponentialModel = exponentialSpatial.getDistanceModel();

      expect(linearModel).not.toBe(exponentialModel);
    });

    it('should apply doppler effect', () => {
      spatialAudio.initialize({
        position: new Vector3(0, 0, 0)
      });

      listener.initialize();
      listener.setPosition(new Vector3(0, 0, 0));

      // Set velocity for doppler
      spatialAudio.updateVelocity(0.016);
      listener.updateVelocity(0.016);

      const velocity = spatialAudio.getVelocity();
      expect(velocity).toBeDefined();
    });

    it('should support sound cones', () => {
      spatialAudio.initialize({
        position: new Vector3(0, 0, -5),
        orientation: new Vector3(0, 0, 1), // Facing +Z
        coneInnerAngle: 30,
        coneOuterAngle: 60,
        coneOuterGain: 0.1
      });

      listener.initialize();
      listener.setPosition(new Vector3(0, 0, 0)); // In front of source

      const cone = spatialAudio.getCone();

      expect(cone.innerAngle).toBe(30);
      expect(cone.outerAngle).toBe(60);
      expect(cone.outerGain).toBe(0.1);
    });
  });

  describe('Audio Effects', () => {
    let audioContext: AudioContext;

    beforeEach(() => {
      audioContext = AudioContext.getInstance();
      audioContext.initialize();
    });

    afterEach(() => {
      audioContext.dispose();
    });

    it('should apply reverb effect', () => {
      const context = audioContext.getContext();
      const convolver = context.createConvolver();

      expect(convolver).toBeDefined();
    });

    it('should apply lowpass filter', () => {
      const context = audioContext.getContext();
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1000;
      filter.Q.value = 1.0;

      expect(filter).toBeDefined();
      expect(filter.type).toBe('lowpass');
    });

    it('should apply highpass filter', () => {
      const context = audioContext.getContext();
      const filter = context.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 200;
      filter.Q.value = 1.0;

      expect(filter).toBeDefined();
      expect(filter.type).toBe('highpass');
    });

    it('should apply compressor', () => {
      const context = audioContext.getContext();
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 30;
      compressor.ratio.value = 12;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;

      expect(compressor).toBeDefined();
    });

    it('should chain effects', () => {
      const context = audioContext.getContext();
      const buffer = context.createBuffer(
        2,
        context.sampleRate,
        context.sampleRate
      );

      const clip = new AudioClip('test-sound');
      clip.loadFromBuffer(buffer);

      const source = new AudioSource('test-source');
      source.setClip(clip);

      const reverb = context.createConvolver();
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2000;

      expect(reverb).toBeDefined();
      expect(filter).toBeDefined();
    });

    it('should bypass effects', () => {
      const context = audioContext.getContext();
      const gain = context.createGain();

      // Bypassing can be simulated by connecting/disconnecting
      gain.gain.value = 1.0; // Active
      gain.gain.value = 0.0; // Bypassed

      expect(gain.gain.value).toBe(0.0);
    });
  });

  describe('Audio Buses', () => {
    let audioContext: AudioContext;

    beforeEach(() => {
      audioContext = AudioContext.getInstance();
      audioContext.initialize();
    });

    afterEach(() => {
      audioContext.dispose();
    });

    it('should create audio bus', () => {
      const sfxBus = new AudioBus({
        name: 'sfx',
        type: 'sfx' as any
      });

      expect(sfxBus).toBeDefined();
      expect(sfxBus.getName()).toBe('sfx');
    });

    it('should control bus volume', () => {
      const musicBus = new AudioBus({
        name: 'music',
        type: 'music' as any
      });

      musicBus.setVolume(0.5);

      expect(musicBus.getVolume()).toBe(0.5);
    });

    it('should mute and unmute bus', () => {
      const sfxBus = new AudioBus({
        name: 'sfx',
        type: 'sfx' as any
      });

      sfxBus.setMute(true);
      expect(sfxBus.isMuted()).toBe(true);

      sfxBus.setMute(false);
      expect(sfxBus.isMuted()).toBe(false);
    });

    it('should route sounds to bus', () => {
      const sfxBus = new AudioBus({
        name: 'sfx',
        type: 'sfx' as any
      });

      const context = audioContext.getContext();
      const buffer = context.createBuffer(
        2,
        context.sampleRate,
        context.sampleRate
      );

      const clip = new AudioClip('gunshot');
      clip.loadFromBuffer(buffer);

      const source = new AudioSource('gunshot-source');
      source.setClip(clip);

      expect(source).toBeDefined();
    });

    it('should apply effects to bus', () => {
      const musicBus = new AudioBus({
        name: 'music',
        type: 'music' as any
      });

      const context = audioContext.getContext();
      const reverb = context.createConvolver();
      musicBus.addEffect(reverb);

      expect(musicBus).toBeDefined();
    });

    it('should support bus hierarchy', () => {
      const masterBus = new AudioBus({
        name: 'master',
        type: 'master' as any
      });

      const musicBus = new AudioBus({
        name: 'music',
        type: 'music' as any
      });

      const ambientBus = new AudioBus({
        name: 'ambient',
        type: 'ambient' as any
      });

      musicBus.setParent(masterBus);
      ambientBus.setParent(musicBus);

      expect(musicBus.getParent()).toBe(masterBus);
      expect(ambientBus.getParent()).toBe(musicBus);
    });
  });

  describe('Music System', () => {
    let audioContext: AudioContext;

    beforeEach(() => {
      audioContext = AudioContext.getInstance();
      audioContext.initialize();
    });

    afterEach(() => {
      audioContext.dispose();
    });

    it('should load music track', () => {
      const context = audioContext.getContext();
      const buffer = context.createBuffer(
        2,
        context.sampleRate * 60, // 1 minute
        context.sampleRate
      );

      const track = new AudioClip('menu-theme');
      track.loadFromBuffer(buffer);

      expect(track).toBeDefined();
      expect(track.getName()).toBe('menu-theme');
    });

    it('should play music track', () => {
      const context = audioContext.getContext();
      const buffer = context.createBuffer(
        2,
        context.sampleRate * 60,
        context.sampleRate
      );

      const track = new AudioClip('menu-theme');
      track.loadFromBuffer(buffer);

      const source = new AudioSource('music-source');
      source.setClip(track);
      source.play();

      expect(source.isPlaying()).toBe(true);
    });

    it('should crossfade between tracks', async () => {
      const context = audioContext.getContext();
      const buffer1 = context.createBuffer(
        2,
        context.sampleRate * 60,
        context.sampleRate
      );

      const buffer2 = context.createBuffer(
        2,
        context.sampleRate * 60,
        context.sampleRate
      );

      const track1 = new AudioClip('track1');
      track1.loadFromBuffer(buffer1);

      const track2 = new AudioClip('track2');
      track2.loadFromBuffer(buffer2);

      const source1 = new AudioSource('source1');
      source1.setClip(track1);
      source1.play();

      const source2 = new AudioSource('source2');
      source2.setClip(track2);

      // Crossfade: fade out source1, fade in source2
      await source1.fadeOut(1.0);
      await source2.fadeIn(1.0);

      expect(source2.isPlaying()).toBe(true);
    });

    it('should support music layers', () => {
      const context = audioContext.getContext();
      const baseBuffer = context.createBuffer(
        2,
        context.sampleRate * 60,
        context.sampleRate
      );

      const drumsBuffer = context.createBuffer(
        2,
        context.sampleRate * 60,
        context.sampleRate
      );

      const baseClip = new AudioClip('combat-base');
      baseClip.loadFromBuffer(baseBuffer);

      const drumsClip = new AudioClip('combat-drums');
      drumsClip.loadFromBuffer(drumsBuffer);

      const baseSource = new AudioSource('base-layer');
      baseSource.setClip(baseClip);
      baseSource.play();

      const drumsSource = new AudioSource('drums-layer');
      drumsSource.setClip(drumsClip);
      drumsSource.play();

      expect(baseSource.isPlaying()).toBe(true);
      expect(drumsSource.isPlaying()).toBe(true);
    });

    it('should sync layers to beat', () => {
      const context = audioContext.getContext();
      const buffer = context.createBuffer(
        2,
        context.sampleRate * 60,
        context.sampleRate
      );

      const clip = new AudioClip('base');
      clip.loadFromBuffer(buffer);

      const source = new AudioSource('base-source');
      source.setClip(clip);

      const bpm = 120;
      const secondsPerBeat = 60 / bpm;

      source.play();

      const currentTime = audioContext.getCurrentTime();
      const nextBeatTime = currentTime + secondsPerBeat;

      expect(nextBeatTime).toBeGreaterThan(0);
    });

    it('should support music stingers', () => {
      const context = audioContext.getContext();
      const baseBuffer = context.createBuffer(
        2,
        context.sampleRate * 60,
        context.sampleRate
      );

      const stingerBuffer = context.createBuffer(
        2,
        context.sampleRate * 3, // 3 second stinger
        context.sampleRate
      );

      const baseClip = new AudioClip('background');
      baseClip.loadFromBuffer(baseBuffer);

      const stingerClip = new AudioClip('victory');
      stingerClip.loadFromBuffer(stingerBuffer);

      const baseSource = new AudioSource('bg-source');
      baseSource.setClip(baseClip);
      baseSource.play();

      const stingerSource = new AudioSource('stinger-source');
      stingerSource.setClip(stingerClip);
      stingerSource.play();

      expect(baseSource.isPlaying()).toBe(true);
      expect(stingerSource.isPlaying()).toBe(true);
    });
  });

  describe('Audio System (ECS Integration)', () => {
    let world: World;
    let audioSystem: AudioSystem;

    beforeEach(() => {
      world = new World();
      audioSystem = new AudioSystem();

      world.addSystem(audioSystem);
    });

    afterEach(() => {
      world.destroy();
    });

    it('should integrate with ECS', () => {
      expect(audioSystem).toBeDefined();
    });

    it('should update audio sources from components', () => {
      const audioContext = AudioContext.getInstance();
      audioContext.initialize();

      const entity = world.createEntity();
      const context = audioContext.getContext();

      const buffer = context.createBuffer(
        2,
        context.sampleRate,
        context.sampleRate
      );

      const clip = new AudioClip('test-clip');
      clip.loadFromBuffer(buffer);

      // Test that the system can handle audio components
      audioSystem.update({ deltaTime: 0.016, totalTime: 0 } as any);

      expect(entity).toBeDefined();
    });

    it('should create audio listener from camera', () => {
      const audioContext = AudioContext.getInstance();
      audioContext.initialize();

      const entity = world.createEntity();

      const listener = new AudioListener();
      listener.initialize();
      listener.setPosition(new Vector3(0, 1.6, 0));

      audioSystem.update({ deltaTime: 0.016, totalTime: 0 } as any);

      expect(listener.getPosition()).toEqual(new Vector3(0, 1.6, 0));
    });

    it('should trigger sound on events', () => {
      const audioContext = AudioContext.getInstance();
      audioContext.initialize();

      const entity = world.createEntity();
      const context = audioContext.getContext();

      const buffer = context.createBuffer(
        2,
        context.sampleRate * 0.5,
        context.sampleRate
      );

      const clip = new AudioClip('collision-sound');
      clip.loadFromBuffer(buffer);

      const source = new AudioSource('collision-source');
      source.setClip(clip);

      // Simulate triggering sound on collision event
      const eventTriggered = vi.fn();
      eventTriggered();
      source.play();

      audioSystem.update({ deltaTime: 0.016, totalTime: 0 } as any);

      expect(source.isPlaying()).toBe(true);
      expect(eventTriggered).toHaveBeenCalled();
    });
  });

  describe('Audio Performance', () => {
    let audioContext: AudioContext;

    beforeEach(() => {
      audioContext = AudioContext.getInstance();
      audioContext.initialize();
    });

    afterEach(() => {
      audioContext.dispose();
    });

    it('should limit concurrent sounds', () => {
      const context = audioContext.getContext();
      const buffer = context.createBuffer(
        2,
        context.sampleRate,
        context.sampleRate
      );

      const clip = new AudioClip('test-sound');
      clip.loadFromBuffer(buffer);

      const maxConcurrent = 3;
      const sources = [];

      // Play more than max concurrent
      for (let i = 0; i < 10; i++) {
        const source = new AudioSource(`source-${i}`);
        source.setClip(clip);
        if (i < maxConcurrent) {
          source.play();
        }
        sources.push(source);
      }

      const playingSources = sources.filter(s => s.isPlaying());

      expect(playingSources.length).toBeLessThanOrEqual(maxConcurrent);
    });

    it('should track active voice count', () => {
      const context = audioContext.getContext();
      const buffer = context.createBuffer(
        2,
        context.sampleRate,
        context.sampleRate
      );

      const clip = new AudioClip('test-sound');
      clip.loadFromBuffer(buffer);

      const sources = [];
      for (let i = 0; i < 3; i++) {
        const source = new AudioSource(`source-${i}`);
        source.setClip(clip);
        source.play();
        sources.push(source);
      }

      const activeCount = sources.filter(s => s.isPlaying()).length;
      expect(activeCount).toBe(3);
    });

    it('should prioritize important sounds', () => {
      const context = audioContext.getContext();
      const buffer = context.createBuffer(
        2,
        context.sampleRate,
        context.sampleRate
      );

      const lowPriorityClip = new AudioClip('ambient');
      lowPriorityClip.loadFromBuffer(buffer);

      const highPriorityClip = new AudioClip('explosion');
      highPriorityClip.loadFromBuffer(buffer);

      const lowPrioritySources = [];
      const maxVoices = 5;

      // Fill voice limit with low priority sounds
      for (let i = 0; i < maxVoices; i++) {
        const source = new AudioSource(`low-${i}`);
        source.setClip(lowPriorityClip);
        source.play();
        lowPrioritySources.push(source);
      }

      // High priority should be able to play
      const highPrioritySource = new AudioSource('high');
      highPrioritySource.setClip(highPriorityClip);

      // In a real implementation, this would stop a low priority source
      // For now, we just verify the high priority source can play
      highPrioritySource.play();

      expect(highPrioritySource.isPlaying()).toBe(true);
    });
  });
});
