import { describe, it, expect } from 'vitest';
import {
  collectProcessTreePids,
  terminateProcessTree,
} from '../platform.js';

describe('collectProcessTreePids', () => {
  it('collects root and nested children', () => {
    const tree: Record<number, number[]> = {
      100: [101, 102],
      101: [103],
      102: [],
      103: [],
    };
    const listChildPids = (pid: number) => tree[pid] ?? [];
    expect(collectProcessTreePids(100, listChildPids).sort()).toEqual([100, 101, 102, 103]);
  });
});

describe('terminateProcessTree', () => {
  it('terminates children before root', async () => {
    const order: number[] = [];
    const dead = new Set<number>();
    const killFn = (pid: number, signal?: NodeJS.Signals | number) => {
      if (signal === 0) return !dead.has(pid);
      if (signal === 'SIGTERM' || signal === 'SIGKILL') {
        order.push(pid);
        dead.add(pid);
        return true;
      }
      return true;
    };
    const listChildPids = (pid: number) => (pid === 10 ? [11] : []);
    const outcomes = await terminateProcessTree(10, {
      killFn,
      listChildPids,
      sleepFn: async () => {},
      graceMs: 0,
    });
    expect(order).toEqual([11, 10]);
    expect(outcomes.every((o) => o.terminated)).toBe(true);
  });
});
