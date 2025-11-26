/**
 * G3D 5.0 Timeline & Cinematics Module - Usage Examples
 *
 * Complete examples demonstrating the timeline system capabilities.
 */

import {
    Timeline,
    TimelineSystem,
    PlayableDirector,
    LoopMode,
    WrapMode,
    AnimationTrack,
    AudioTrack,
    CameraTrack,
    SignalTrack,
    ActivationTrack,
    ControlTrack,
    Easing,
    createTimelineSetup,
    createSignalAsset,
    createParameter,
    ParameterType,
    SignalReceiver
} from './index';

// ============================================================================
// Example 1: Basic Timeline Setup
// ============================================================================

export function example1_BasicTimeline() {
    console.log('=== Example 1: Basic Timeline ===');

    // Create timeline
    const timeline = new Timeline({
        name: 'GameIntro',
        duration: 10,
        loopMode: LoopMode.None,
        speed: 1.0
    });

    // Create director
    const director = new PlayableDirector(timeline);

    // Register with system
    const system = TimelineSystem.getInstance();
    system.register(timeline);

    // Play
    director.play();

    // Update in game loop (simulated)
    let time = 0;
    const interval = setInterval(() => {
        director.update(1 / 60); // 60 FPS
        time += 1 / 60;

        console.log(`Time: ${director.time.toFixed(2)}s`);

        if (time >= 10) {
            clearInterval(interval);
            console.log('Timeline completed');
        }
    }, 16);
}

// ============================================================================
// Example 2: Camera Cinematic
// ============================================================================

export function example2_CameraCinematic() {
    console.log('=== Example 2: Camera Cinematic ===');

    const { timeline, director, addCameraTrack } = createTimelineSetup({
        duration: 20
    });

    // Add camera track
    const cameraTrack = addCameraTrack();

    // Create cinematic camera movement
    cameraTrack.addCameraClip({
        startTime: 0,
        duration: 20,
        interpolation: 'smooth',
        asset: {
            name: 'Opening Shot',
            keyframes: [
                {
                    time: 0,
                    position: { x: 0, y: 5, z: -10 },
                    rotation: { x: 0, y: 0, z: 0 },
                    fov: 60,
                    shake: 0
                },
                {
                    time: 5,
                    position: { x: 10, y: 5, z: -10 },
                    lookAt: { x: 0, y: 0, z: 0 },
                    fov: 45,
                    shake: 0,
                    easing: Easing.easeInOutCubic
                },
                {
                    time: 10,
                    position: { x: 10, y: 3, z: -5 },
                    fov: 70,
                    shake: 0.2, // Add camera shake
                    depthOfField: {
                        enabled: true,
                        focusDistance: 5,
                        aperture: 2.8
                    }
                },
                {
                    time: 15,
                    position: { x: 0, y: 2, z: 0 },
                    rotation: { x: 0, y: 180, z: 0 },
                    fov: 60,
                    shake: 0
                }
            ]
        }
    });

    director.play();

    // Process camera output
    const update = () => {
        const output = cameraTrack.process(director.time, 1 / 60);
        if (output) {
            console.log('Camera:', {
                position: output.position,
                fov: output.fov,
                shake: output.shake
            });
            // Apply to actual camera...
        }
    };

    return { timeline, director, update };
}

// ============================================================================
// Example 3: Character Animation Sequence
// ============================================================================

export function example3_CharacterAnimation() {
    console.log('=== Example 3: Character Animation ===');

    const timeline = new Timeline({ duration: 15 });
    const animTrack = new AnimationTrack();
    animTrack.targetId = 'player';

    // Walk animation
    animTrack.addAnimationClip({
        startTime: 0,
        duration: 3,
        asset: {
            name: 'walk',
            duration: 1.5,
            frameRate: 30
        },
        easeInDuration: 0.2,
        easeOutDuration: 0.2,
        speedMultiplier: 1.0
    });

    // Jump animation with root motion
    animTrack.addAnimationClip({
        startTime: 3,
        duration: 1.5,
        asset: {
            name: 'jump',
            duration: 1.5,
            frameRate: 30,
            events: [
                { name: 'jump_start', time: 0, parameters: {} },
                { name: 'jump_land', time: 1.2, parameters: {} }
            ]
        },
        applyRootMotion: true,
        easeInDuration: 0.1
    });

    // Run animation
    animTrack.addAnimationClip({
        startTime: 4.5,
        duration: 5,
        asset: {
            name: 'run',
            duration: 1.0,
            frameRate: 30
        },
        speedMultiplier: 1.5,
        easeInDuration: 0.3
    });

    // Listen for animation events
    animTrack.onAnimationEvent('jump_start', (event) => {
        console.log('Character jumped!');
    });

    animTrack.onAnimationEvent('jump_land', (event) => {
        console.log('Character landed!');
    });

    timeline.addTrack(animTrack);

    return new PlayableDirector(timeline);
}

// ============================================================================
// Example 4: Audio Sequencing
// ============================================================================

export function example4_AudioSequencing() {
    console.log('=== Example 4: Audio Sequencing ===');

    const timeline = new Timeline({ duration: 30 });
    const audioTrack = new AudioTrack();
    audioTrack.masterVolume = 0.8;

    // Background music with fade in/out
    audioTrack.addAudioClip({
        startTime: 0,
        duration: 30,
        asset: {
            name: 'background_music',
            buffer: null, // Would be actual audio buffer
            duration: 30
        },
        volume: 0.6,
        fadeIn: 2.0,
        fadeOut: 3.0,
        volumeCurve: [
            { time: 0, value: 0 },
            { time: 2, value: 1 },
            { time: 27, value: 1 },
            { time: 30, value: 0 }
        ]
    });

    // Sound effects
    audioTrack.addAudioClip({
        startTime: 5,
        duration: 1,
        asset: {
            name: 'explosion',
            buffer: null,
            duration: 1
        },
        volume: 1.2,
        pitch: 0.9,
        useSpatialAudio: true,
        spatialPosition: { x: 10, y: 0, z: 5 }
    });

    audioTrack.addAudioClip({
        startTime: 10,
        duration: 0.5,
        asset: {
            name: 'gunshot',
            buffer: null,
            duration: 0.5
        },
        volume: 1.0,
        pitch: 1.1
    });

    timeline.addTrack(audioTrack);

    return new PlayableDirector(timeline);
}

// ============================================================================
// Example 5: Signal Events
// ============================================================================

export function example5_SignalEvents() {
    console.log('=== Example 5: Signal Events ===');

    // Define signal schemas
    const explosionSignal = createSignalAsset(
        'explosion',
        [
            createParameter('position', ParameterType.Vector3, { required: true }),
            createParameter('intensity', ParameterType.Number, { defaultValue: 1.0 }),
            createParameter('radius', ParameterType.Number, { defaultValue: 5.0 })
        ],
        'Explosion event'
    );

    const dialogueSignal = createSignalAsset(
        'dialogue',
        [
            createParameter('character', ParameterType.String, { required: true }),
            createParameter('text', ParameterType.String, { required: true }),
            createParameter('duration', ParameterType.Number, { defaultValue: 3.0 })
        ],
        'Dialogue event'
    );

    // Create timeline with signal track
    const timeline = new Timeline({ duration: 20 });
    const signalTrack = new SignalTrack();

    // Add signal markers
    signalTrack.addMarker(3, 'explosion', {
        position: { x: 10, y: 0, z: 5 },
        intensity: 2.0,
        radius: 8.0
    });

    signalTrack.addMarker(8, 'dialogue', {
        character: 'Hero',
        text: 'Look out!',
        duration: 2.5
    });

    signalTrack.addMarker(15, 'explosion', {
        position: { x: -5, y: 0, z: 10 },
        intensity: 1.5,
        radius: 6.0
    });

    // Listen for signals
    signalTrack.on('explosion', (event) => {
        console.log('Explosion at:', event.payload.position);
        console.log('Intensity:', event.payload.intensity);
        // Spawn explosion effect...
    });

    signalTrack.on('dialogue', (event) => {
        console.log(`${event.payload.character}: "${event.payload.text}"`);
        // Show dialogue UI...
    });

    // Listen to all signals
    signalTrack.on('*', (event) => {
        console.log('Signal received:', event.signal, 'at time', event.time);
    });

    timeline.addTrack(signalTrack);

    return new PlayableDirector(timeline);
}

// ============================================================================
// Example 6: Complete Cutscene
// ============================================================================

export function example6_CompleteCutscene() {
    console.log('=== Example 6: Complete Cutscene ===');

    const cutscene = new Timeline({
        name: 'Boss Intro',
        duration: 30,
        loopMode: LoopMode.None
    });

    // Camera track
    const cameraTrack = new CameraTrack();
    cameraTrack.addCameraClip({
        startTime: 0,
        duration: 30,
        asset: {
            name: 'Boss Reveal',
            keyframes: [
                { time: 0, position: { x: 0, y: 2, z: -10 }, fov: 60 },
                { time: 5, position: { x: 5, y: 3, z: -8 }, fov: 50 },
                { time: 10, position: { x: 0, y: 5, z: -5 }, fov: 40 },
                { time: 15, position: { x: -5, y: 3, z: -8 }, fov: 50 },
                { time: 20, position: { x: 0, y: 2, z: -10 }, fov: 60 }
            ]
        }
    });
    cutscene.addTrack(cameraTrack);

    // Character animation
    const charAnim = new AnimationTrack();
    charAnim.targetId = 'boss';
    charAnim.addAnimationClip({
        startTime: 0,
        duration: 10,
        asset: { name: 'idle_menacing', duration: 2, frameRate: 30 }
    });
    charAnim.addAnimationClip({
        startTime: 10,
        duration: 3,
        asset: { name: 'roar', duration: 3, frameRate: 30 }
    });
    charAnim.addAnimationClip({
        startTime: 13,
        duration: 17,
        asset: { name: 'battle_ready', duration: 1.5, frameRate: 30 }
    });
    cutscene.addTrack(charAnim);

    // Audio
    const audio = new AudioTrack();
    audio.addAudioClip({
        startTime: 0,
        duration: 30,
        asset: { name: 'boss_theme', buffer: null, duration: 30 },
        fadeIn: 2.0
    });
    audio.addAudioClip({
        startTime: 10,
        duration: 3,
        asset: { name: 'boss_roar', buffer: null, duration: 3 },
        volume: 1.5
    });
    cutscene.addTrack(audio);

    // Activation (door closes)
    const activation = new ActivationTrack();
    activation.defaultTargetId = 'arena_door';
    activation.addActivationClip({
        startTime: 5,
        duration: 2,
        startState: { active: true, visible: true },
        endState: { active: false, visible: false }
    });
    cutscene.addTrack(activation);

    // Signals
    const signals = new SignalTrack();
    signals.addMarker(12, 'start_boss_music');
    signals.addMarker(25, 'enable_player_control');
    signals.addMarker(30, 'start_boss_ai');

    signals.on('start_boss_music', () => {
        console.log('Starting boss music');
    });

    signals.on('enable_player_control', () => {
        console.log('Player can move now');
    });

    signals.on('start_boss_ai', () => {
        console.log('Boss fight begins!');
    });

    cutscene.addTrack(signals);

    // Create director
    const director = new PlayableDirector({
        timeline: cutscene,
        wrapMode: WrapMode.Once,
        playOnStart: true
    });

    // Handle completion
    director.on('completed', () => {
        console.log('Cutscene finished');
        // Transition to gameplay...
    });

    return director;
}

// ============================================================================
// Example 7: Timeline System Management
// ============================================================================

export function example7_TimelineSystem() {
    console.log('=== Example 7: Timeline System ===');

    const system = TimelineSystem.getInstance();

    // Create multiple timelines
    const gameplay = new Timeline({ name: 'Gameplay', duration: 60 });
    const ui = new Timeline({ name: 'UI Animations', duration: 5 });
    const ambient = new Timeline({ name: 'Ambient Effects', duration: 30 });

    // Register timelines with different priorities
    system.register(gameplay, true, 100);  // Highest priority
    system.register(ui, true, 50);
    system.register(ambient, true, 10);    // Lowest priority

    // Global time control
    system.timeScale = 1.0;

    // Game loop
    function gameLoop(deltaTime: number) {
        // Update all registered timelines
        system.update(deltaTime);

        // Check metrics
        const metrics = system.metrics;
        if (metrics.lastUpdateDuration > 1.0) {
            console.warn('Timeline update took too long:', metrics.lastUpdateDuration, 'ms');
        }
    }

    // Slow motion effect
    function enableSlowMotion() {
        system.timeScale = 0.3;
    }

    // Pause all timelines
    function pauseGame() {
        system.pause();
    }

    // Resume all timelines
    function resumeGame() {
        system.resume();
    }

    return {
        system,
        gameLoop,
        enableSlowMotion,
        pauseGame,
        resumeGame
    };
}

// ============================================================================
// Run Examples
// ============================================================================

if (typeof window === 'undefined') {
    // Node.js environment - run examples
    console.log('G3D Timeline & Cinematics - Examples\n');

    // Uncomment to run specific examples
    // example1_BasicTimeline();
    // example2_CameraCinematic();
    // example3_CharacterAnimation();
    // example4_AudioSequencing();
    // example5_SignalEvents();
    // example6_CompleteCutscene();
    // example7_TimelineSystem();
}
