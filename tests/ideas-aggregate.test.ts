import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateTopDots, type DotEntry } from '../src/ideas.js';
import type { Dot } from '../src/adjacent/types.js';

function fakeDot(score: number, title: string): Dot {
  return {
    title,
    summary: `${title} summary`,
    rationale: `${title} rationale`,
    repoSurface: 'src/example.ts',
    effortEstimate: 'days',
    axisAScore: score,
    axisAJustification: 'a',
    axisBScore: score,
    axisBJustification: 'b',
    exportablePrompt: 'prompt body',
  };
}

function entry(runId: string, repo: string, dotId: string, score: number, title: string): DotEntry {
  return { runId, repo, dotArtifactId: dotId, dot: fakeDot(score, title) };
}

test('aggregateTopDots: sorts by combined axis A + B score descending', () => {
  const top = aggregateTopDots(
    [
      entry('r1', '/a', 'd1', 30, 'low'),
      entry('r1', '/a', 'd2', 90, 'high'),
      entry('r1', '/a', 'd3', 60, 'mid'),
    ],
    3,
  );
  assert.deepEqual(top.map((e) => e.dot.title), ['high', 'mid', 'low']);
});

test('aggregateTopDots: respects the limit', () => {
  const top = aggregateTopDots(
    [
      entry('r1', '/a', 'd1', 80, 'a'),
      entry('r1', '/a', 'd2', 70, 'b'),
      entry('r1', '/a', 'd3', 60, 'c'),
      entry('r1', '/a', 'd4', 50, 'd'),
      entry('r1', '/a', 'd5', 40, 'e'),
    ],
    2,
  );
  assert.equal(top.length, 2);
  assert.deepEqual(top.map((e) => e.dot.title), ['a', 'b']);
});

test('aggregateTopDots: aggregates across multiple runs and preserves repo identity', () => {
  const top = aggregateTopDots(
    [
      entry('r1', '/repo-a', 'd1', 40, 'a-low'),
      entry('r2', '/repo-b', 'd2', 95, 'b-best'),
      entry('r1', '/repo-a', 'd3', 70, 'a-mid'),
      entry('r2', '/repo-b', 'd4', 30, 'b-low'),
    ],
    3,
  );
  assert.deepEqual(top.map((e) => e.dot.title), ['b-best', 'a-mid', 'a-low']);
  assert.equal(top[0]!.repo, '/repo-b');
  assert.equal(top[1]!.repo, '/repo-a');
});

test('aggregateTopDots: returns an empty array when limit is zero or negative', () => {
  const inputs = [
    entry('r1', '/a', 'd1', 80, 'a'),
    entry('r1', '/a', 'd2', 70, 'b'),
  ];
  assert.deepEqual(aggregateTopDots(inputs, 0), []);
  assert.deepEqual(aggregateTopDots(inputs, -1), []);
});

test('aggregateTopDots: does not mutate the input array', () => {
  const inputs = [
    entry('r1', '/a', 'd1', 30, 'low'),
    entry('r1', '/a', 'd2', 90, 'high'),
  ];
  const snapshot = inputs.map((e) => e.dot.title);
  aggregateTopDots(inputs, 5);
  assert.deepEqual(inputs.map((e) => e.dot.title), snapshot);
});
