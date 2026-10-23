/**
 * SH-01 — reference interpreter for the TSL subset. It evaluates a graph on the
 * CPU with the same op semantics as constant folding (`evalOp`), so tests can
 * check numeric results of the exact graph the GLSL emitter lowers.
 */

import { TSL_MAX_STATIC_LOOP, TslNode, dimOf, evalOp, parseHexColor, tslError, type TslBlock, type TslBuiltinName, type TslType, type TslValue } from "./ir.js";

export interface TslEvalContext {
  readonly positionLocal?: readonly number[];
  readonly positionWorld?: readonly number[];
  readonly normalLocal?: readonly number[];
  readonly normalWorld?: readonly number[];
  readonly uv?: readonly number[];
  readonly time?: number;
  readonly cameraPosition?: readonly number[];
  /** Per-uniform-node overrides (mirrors `handle.setUniform`). */
  readonly uniforms?: ReadonlyMap<TslNode, number | boolean | readonly number[]>;
  /** Texture sampler for `texture(handle, uv)` nodes (default: opaque white). */
  readonly textures?: (handle: unknown, uv: readonly number[]) => readonly number[];
}

const MAX_STEPS = 200_000;

function uniformValue(node: TslNode, override: number | boolean | readonly number[] | undefined): readonly number[] {
  const raw = override ?? (node.data.k === "uniform" ? node.data.value : undefined);
  if (typeof raw === "number") return [raw];
  if (typeof raw === "boolean") return [raw ? 1 : 0];
  if (typeof raw === "string") return [...parseHexColor(raw)];
  if (Array.isArray(raw) || ArrayBuffer.isView(raw)) return Array.from(raw as ArrayLike<number>);
  return tslError("invalid-tsl-graph", `uniform node has no numeric value to evaluate`);
}

export function evaluateTsl(node: TslNode, context: TslEvalContext = {}): TslValue {
  const env = new Map<TslNode, number[]>();
  let steps = 0;

  const builtin = (name: TslBuiltinName): readonly number[] => {
    const value = context[name];
    if (value === undefined) return tslError("invalid-tsl-graph", `evaluateTsl context is missing "${name}"`);
    return typeof value === "number" ? [value] : value;
  };

  const run = (block: TslBlock): void => {
    for (const statement of block) {
      if (++steps > MAX_STEPS) tslError("invalid-tsl-graph", "interpreter step limit exceeded");
      switch (statement.s) {
        case "decl":
          env.set(statement.node, [...value((statement.node.data as { init: TslNode }).init).value]);
          break;
        case "assign": {
          const target = statement.target;
          const rhs = value(statement.value);
          if (statement.op === undefined) env.set(target, [...rhs.value]);
          else {
            const name = statement.op === "+" ? "add" : statement.op === "-" ? "sub" : statement.op === "*" ? "mul" : "div";
            env.set(target, evalOp(name, [{ type: target.type, value: env.get(target)! }, rhs], target.type));
          }
          break;
        }
        case "if": {
          const taken = statement.branches.find((branch) => value(branch.cond).value[0] === 1);
          if (taken) run(taken.block);
          else if (statement.otherwise) run(statement.otherwise);
          break;
        }
        case "loop": {
          const start = value(statement.start).value[0]!;
          const end = value(statement.end).value[0]!;
          if (end - start > TSL_MAX_STATIC_LOOP) tslError("invalid-tsl-graph", "loop exceeds the iteration limit");
          for (let i = start; i < end; i++) {
            env.set(statement.index, [i]);
            run(statement.block);
          }
          break;
        }
      }
    }
  };

  const value = (n: TslNode): TslValue => {
    const d = n.data;
    switch (d.k) {
      case "const": return { type: n.type, value: d.value };
      case "builtin": return { type: n.type, value: builtin(d.name) };
      case "uniform": return { type: n.type, value: uniformValue(n, context.uniforms?.get(n)) };
      case "op": return { type: n.type, value: evalOp(d.op, d.args.map(value), n.type) };
      case "swizzle": {
        const src = value(d.src).value;
        return { type: n.type, value: [...d.comps].map((c) => src[("xyzw").indexOf(c)]!) };
      }
      case "construct": {
        const flat = d.args.flatMap((arg) => [...value(arg).value]);
        const need = dimOf(n.type);
        return { type: n.type, value: flat.length === 1 && need > 1 ? Array.from({ length: need }, () => flat[0]!) : flat };
      }
      case "texture": {
        const handle = d.sampler.data.k === "uniform" ? d.sampler.data.value : undefined;
        const sample = context.textures?.(handle, value(d.uv).value) ?? [1, 1, 1, 1];
        return { type: "vec4", value: sample };
      }
      case "element": {
        const index = value(d.index).value[0]!;
        const element = d.array.elements[index];
        if (!element) return tslError("invalid-tsl-graph", `uniformArray index ${index} is out of range`);
        return value(element);
      }
      case "var":
      case "loopIndex": {
        const stored = env.get(n);
        if (!stored) return tslError("invalid-tsl-graph", "variable read before its declaration executed");
        return { type: n.type as TslType, value: stored };
      }
      case "call": {
        run(d.block);
        return value(d.result);
      }
    }
  };

  return value(node);
}
