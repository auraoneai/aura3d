import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';

it('Smart City publishes mounted control state while paused and ignores superseded completions', async () => {
  const source = readFileSync('apps/showcase-smart-city-control/src/main.ts', 'utf8');
  const parsed = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
  const declaration = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'applyScene');
  if (!declaration) throw new Error('Missing actual route update function');
  const code = ts.transpileModule(declaration.getText(parsed), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const completions: Array<() => void> = [];
  const statuses: string[] = [];
  const stepAsync = vi.fn().mockResolvedValue(undefined);
  const context = { sceneUpdateGeneration: 0, lastChanged: '', activeBuild: {},
    buildSmartCityScene: () => ({ snapshot: {} }), updateControlState: vi.fn(),
    publishEvidence: (status: string) => statuses.push(status), console,
    app: { setScene: vi.fn(), ready: () => new Promise<void>(resolve => completions.push(resolve)), stepAsync }
  };
  const apply = runInNewContext(`${code}\napplyScene`, context) as (change: string) => void;
  apply('district:core');
  expect(statuses).toEqual(['booting']);
  expect(stepAsync).not.toHaveBeenCalled();
  completions[0]!();
  await vi.waitFor(() => expect(statuses).toEqual(['booting', 'ready']));
  expect(stepAsync).toHaveBeenCalledExactlyOnceWith(0);
  apply('camera:street'); apply('camera:flythrough');
  completions[1]!();
  await Promise.resolve(); await Promise.resolve();
  expect(stepAsync).toHaveBeenCalledTimes(1);
  completions[2]!();
  await vi.waitFor(() => expect(statuses).toEqual(['booting', 'ready', 'booting', 'booting', 'ready']));
  expect(stepAsync).toHaveBeenCalledTimes(2);
});

it('initial readiness is published after the first real submission without waiting for twelve animation frames', async () => {
  const source = readFileSync('apps/showcase-smart-city-control/src/main.ts', 'utf8');
  const parsed = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
  const declaration = parsed.statements.find(node => ts.isExpressionStatement(node) && node.getText(parsed).startsWith('void app.ready().then'));
  if (!declaration) throw new Error('Missing actual initial mount completion path');
  const code = ts.transpileModule(declaration.getText(parsed), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let completeMount!: () => void;
  const statuses: string[] = [];
  const stepAsync = vi.fn().mockResolvedValue(undefined);
  runInNewContext(code, { sceneUpdateGeneration: 0, console,
    publishEvidence: (status: string) => statuses.push(status),
    app: { ready: () => new Promise<void>(resolve => { completeMount = resolve; }), stepAsync }
  });
  expect(statuses).toEqual([]);
  completeMount();
  await vi.waitFor(() => expect(statuses).toEqual(['ready']));
  expect(stepAsync).toHaveBeenCalledExactlyOnceWith(0);
});

it('Smart City enlarges its bounds-derived command vehicle for the compact composition probe', () => {
  const source = readFileSync('apps/showcase-smart-city-control/src/main.ts', 'utf8');
  expect(source).toContain('window.innerWidth < 700');
  expect(source).toContain('extent: [0.35, 0.1, 0.35] as const');
  expect(source).toContain(': VEHICLE_STATION_FOOTPRINT_REGION');
  expect(source).toContain('targetMaxDimension: vehicleTargetMaxDimension()');
  expect(source).toContain('const distanceScale = compact ? 1.45 : 2.6');
  expect(source).toContain('fov: compactViewport ? 40 : 44');
});
