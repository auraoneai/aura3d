# Release Tracks

Version: 1.0.3
Date: 2026-06-03

Aura3D v1.0.3 is the root-runtime cleanup track for the public SDK, docs, npm package, GitHub repository, and marketing site.

## Launch Positioning

Aura3D is the AI-native TypeScript 3D SDK for browser software. It gives developers and AI coding agents a complete path from prompt to polished scene: primitives, scene kits, typed GLB/glTF assets, product viewers, physics, particles, materials, diagnostics, screenshot checks, templates, and static deployment workflows.

Aura3D is positioned for teams searching for a modern Three.js alternative, Babylon.js alternative, Unity-to-web workflow, Unreal-to-web workflow, WebGL/WebGPU 3D library, TypeScript 3D engine, React 3D SDK, GLB viewer, glTF product configurator, prompt-to-3D SDK, and AI agent development toolkit.

## Current Release

- npm package: `@aura3d/engine@1.0.3`
- Public developer API: `@aura3d/engine`
- Website: `https://aura3d.auraone.ai`
- Repository: `https://github.com/auraoneai/aura3d`
- Primary install path: `npm install @aura3d/engine`

## 1.0.3 Release Note

`@aura3d/engine@1.0.3` removes Three.js from the root engine runtime and npm
dependency graph. Three.js parity, migration, and compatibility tooling remain
available outside the default engine install path. Public Aura3D agent APIs,
typed assets, templates, diagnostics, and screenshots continue to use
Aura3D-owned runtime code.

## Launch Copy

Use direct product language:

- Aura3D turns prompts into editable TypeScript 3D scenes.
- Aura3D gives AI coding agents maintained scene systems instead of blank renderer glue.
- Aura3D ships typed assets, scene kits, diagnostics, screenshots, templates, and deploy checks.
- Aura3D helps teams build browser 3D product viewers, configurators, cinematic scenes, mini-games, data scenes, physics playgrounds, and AI-generated environments.
- Aura3D is built for developers comparing modern browser 3D libraries, Three.js alternatives, Babylon.js alternatives, Unity web options, and Unreal web options.

## Launch Assets

Keep these surfaces aligned for each public release:

- Root README and npm package metadata.
- GitHub description, homepage, and topics.
- Marketing website and generated HTML docs.
- Published npm package README.
- Agent docs under `docs/agents/`.
- Examples and template README files.

## Planning Document Cleanup

The former root planning PRDs were decomposed into durable docs and launch-facing evidence artifacts. Current docs should use these files instead of a root planning PRD:

- `docs/agents/prompt-to-3d-workflow.md`
- `docs/project/release-tracks.md`
- `docs/project/launch-positioning.md`
- `docs/project/marketing-site.md`
- `docs/examples/advanced-gallery.md`
