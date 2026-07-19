// Behavior lock for the timeline core: parse → static → frame sampling.
// Run with `npm test` (node:test via tsx). These tests define the grammar's
// semantics — sequences with the hold rule, groups, independent property
// tracks, wrap continuity, and the copy/persistence value schema.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTimelineConfig,
  computeStaticClips,
  computeStaticTimeline,
  computeClipState,
  computeClipStaticFromValues,
  clampClipMove,
  clampClipResizeEnd,
  clampClipResizeStart,
  clampStepResize,
  clampTrackDelay,
  formatClock,
  formatStepLabel,
  normalizeLoopMode,
  normalizeTimelineValuesForCopy,
  timelinePopoverDisplayValues,
} from './timeline-core';
import type { TimelineConfig } from './timeline-core';
import { foldLoopTime, loopSpan } from './store/TimelineStore';

const near = (actual: number, expected: number, eps = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} ≈ ${expected}`);

const captureWarnings = (fn: () => void): string[] => {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  };
  try {
    fn();
  } finally {
    console.warn = original;
  }
  return warnings;
};

// The TimelineTest1 scene: a triangle sequence and two independent tracks.
const scene = {
  duration: 4.8,
  circle: {
    path: {
      at: 0,
      loop: true,
      from: { x: -70, y: 0 },
      transition: { type: 'easing', duration: 0.8, ease: [0.65, 0, 0.35, 1] },
      steps: [
        { duration: 0.8, to: { x: 0, y: 36 } },
        { duration: 0.8, to: { x: 70, y: 0 } },
        { duration: 0.8, to: { x: -70 } },
      ],
    },
    float: {
      at: 0,
      loop: true,
      props: {
        y: {
          from: -9,
          transition: { type: 'easing', duration: 0.6, ease: [0.45, 0, 0.55, 1] },
          steps: [
            { duration: 0.6, to: 9 },
            { duration: 0.6, to: -9 },
          ],
        },
        scale: {
          from: 0.94,
          delay: 0.12,
          transition: { type: 'easing', duration: 0.6, ease: [0.8, 0, 0.2, 1] },
          steps: [
            { duration: 0.6, to: 1.06 },
            { duration: 0.6, to: 0.94 },
          ],
        },
      },
    },
  },
} as unknown as TimelineConfig;

const parsed = parseTimelineConfig(scene);
const [path, float] = computeStaticClips(parsed, {});
const current = (state: Record<string, unknown>) => state.current as Record<string, number>;

describe('parse', () => {
  it('flattens groups into namespaced clips', () => {
    assert.deepEqual(parsed.clips.map((c) => c.key), ['circle.path', 'circle.float']);
    assert.equal(parsed.clips[0].group, 'circle');
    assert.equal(parsed.clips[0].label, 'Path');
  });

  it('sequences get step keys, props clips get tracks', () => {
    assert.deepEqual(parsed.clips[0].stepKeys, ['step1', 'step2', 'step3']);
    assert.deepEqual(parsed.clips[1].tracks, [
      { prop: 'y', stepKeys: ['step1', 'step2'] },
      { prop: 'scale', stepKeys: ['step1', 'step2'] },
    ]);
  });

  it('keeps loop behavior in code instead of the editable dial config', () => {
    const circle = parsed.dialConfig.circle as Record<string, Record<string, unknown>>;
    assert.equal(parsed.clips[0].loop, 'repeat');
    assert.equal(parsed.clips[1].loop, 'repeat');
    assert.ok(!('loop' in circle.path));
    assert.ok(!('loop' in circle.float));
  });

  it('keeps the configured timeline duration', () => {
    assert.equal(parsed.duration, 4.8);
  });

  it('infers an exact-fit duration when omitted — no dead tail', () => {
    const inferred = parseTimelineConfig({
      a: { at: 0.5, duration: 1.2, from: { x: 0 }, to: { x: 1 } },
    } as unknown as TimelineConfig);
    assert.equal(inferred.duration, 1.7);
  });

  it('track delays extend the inferred extent', () => {
    const inferred = parseTimelineConfig({
      a: { at: 0, props: { x: { from: 0, to: 1, duration: 1, delay: 0.6 } } },
    } as unknown as TimelineConfig);
    assert.equal(inferred.duration, 1.6); // 0 + 0.6 + 1
  });

  it('sanitizes malformed timing values before they reach the editor', () => {
    const warnings = captureWarnings(() => {
      const malformed = parseTimelineConfig({
        duration: Number.POSITIVE_INFINITY,
        skipped: { at: Number.NaN, duration: 10 },
        clamped: {
          at: -2,
          props: {
            x: { from: 0, to: 1, duration: -1, delay: Number.POSITIVE_INFINITY },
          },
        },
      } as unknown as TimelineConfig);

      assert.equal(malformed.duration, 0.05);
      assert.deepEqual(malformed.clips.map((clip) => clip.key), ['clamped']);
      assert.equal((malformed.dialConfig.clamped as Record<string, unknown>).at?.[0], 0);
      const clamped = malformed.dialConfig.clamped as Record<string, Record<string, unknown>>;
      assert.equal((clamped.x.delay as number[])[0], 0);
      assert.equal((clamped.x.duration as number[])[0], 0.05);
    });

    assert.ok(warnings.some((warning) => warning.includes('skipped')));
  });
});

describe('static pass', () => {
  it('sequence duration is the sum of its legs', () => {
    near(path.duration, 2.4);
    assert.equal(path.loop, 'repeat');
    assert.equal(path.end, 4.8); // looping → timeline end
    assert.deepEqual([...(path.props ?? [])].sort(), ['x', 'y']);
  });

  it('props clip extent is the widest track (delay + cycle)', () => {
    near(float.duration, 1.32);
    assert.equal(float.tracks?.length, 2);
    assert.equal(float.tracks?.[1].delay, 0.12);
  });

  it('legacy mirror loop values fold into repeat', () => {
    assert.equal(normalizeLoopMode('mirror'), 'repeat');
    assert.equal(normalizeLoopMode(true), 'repeat');
    assert.equal(normalizeLoopMode('off'), 'off');
  });
});

describe('sequences (shared timing)', () => {
  it('starts at from', () => {
    const s = computeClipState(path, 0);
    assert.equal(current(s).x, -70);
    assert.equal(s.step, 0);
  });

  it('lands each leg exactly', () => {
    const s = computeClipState(path, 0.8 - 1e-9);
    near(current(s).x, 0, 0.1);
    near(current(s).y, 36, 0.1);
  });

  it('holds untouched properties through a leg (hold rule)', () => {
    const s = computeClipState(path, 2.0); // mid leg 3 — only x animates
    assert.equal(s.step, 2);
    assert.equal(current(s).y, 0);
  });

  it('folds the cycle when looping', () => {
    const s = computeClipState(path, 2.45); // just past 2.4 → back in leg 1
    assert.equal(s.step, 0);
    near(current(s).x, -70, 5);
  });
});

describe('property tracks (independent timing)', () => {
  it('each track runs its own curve', () => {
    const s = computeClipState(float, 0.6 - 1e-9);
    near(current(s).y, 9, 0.05);
    assert.ok(current(s).scale < 1.06 - 0.001, 'delayed scale still catching up');
  });

  it('delay is a phase shift that persists across cycles', () => {
    near(current(computeClipState(float, 0.72 - 1e-9)).scale, 1.06, 0.01);
    near(current(computeClipState(float, 1.2 + 0.72 - 1e-9)).scale, 1.06, 0.01);
  });

  it('holds from before the delay elapses', () => {
    near(current(computeClipState(float, 0.05)).scale, 0.94, 0.01);
  });

  it('tracks can have independent periods', () => {
    const edited = computeStaticClips(parsed, { 'circle.float.scale.step1.duration': 0.7 });
    const clip = edited[1];
    near(clip.tracks?.[1].duration ?? 0, 1.3);
    near(clip.tracks?.[0].duration ?? 0, 1.2);
    const s = computeClipState(clip, 0, 6.0); // wrapped mid-flight
    near(current(s).y, -9, 0.05); // y at its own cycle start (6 % 1.2 = 0)
    assert.ok(Math.abs(current(s).scale - 0.94) > 0.005, 'scale desynced');
  });
});

describe('loop wrap continuity', () => {
  it('wrapped playback matches the equivalent first-pass phase', () => {
    const wrapped = computeClipState(float, 0.0, 5.0); // 5.0 % 1.2 = 0.2
    const firstPass = computeClipState(float, 0.2);
    near(current(wrapped).y, current(firstPass).y, 1e-6);
    assert.ok(Math.abs(current(wrapped).y - -9) > 1, 'not snapped to cycle start');
  });

  it('scrubbing pins the deterministic first-pass state', () => {
    near(current(computeClipState(float, 0.0)).y, -9, 1e-6);
  });
});

describe('simple clips and markers', () => {
  const simple = parseTimelineConfig({
    fade: { at: 0.5, duration: 1, from: { opacity: 0 }, to: { opacity: 1 } },
    marker: { at: 2 },
  } as unknown as TimelineConfig);
  const [fade, marker] = computeStaticClips(simple, {});

  it('from/to animates through the default curve', () => {
    assert.equal(fade.duration, 1);
    const mid = current(computeClipState(fade, 1.0)).opacity;
    assert.ok(mid > 0 && mid <= 1.2);
    near(current(computeClipState(fade, 3)).opacity, 1, 0.005);
  });

  it('markers carry timing state only', () => {
    assert.equal(marker.duration, 0);
    assert.equal(computeClipState(marker, 2.1).started, true);
    assert.equal(computeClipState(marker, 1.9).started, false);
    assert.equal(computeClipState(marker, 2.1).current, undefined);
  });
});

describe('single resolver', () => {
  it('does not mutate nested values while applying flat child overrides', () => {
    const simple = parseTimelineConfig({
      fade: { at: 0, duration: 1, from: { opacity: 0 }, to: { opacity: 1 } },
    } as unknown as TimelineConfig);
    const transition = {
      type: 'easing' as const,
      duration: 99,
      ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
    };

    computeClipStaticFromValues({
      'fade.at': 0,
      'fade.duration': 1,
      'fade.transition': transition,
      'fade.transition.duration': 1,
      'fade.from.opacity': 0,
      'fade.to.opacity': 1,
    }, simple.clips[0], simple.duration);

    assert.equal(transition.duration, 99);
  });

  it('dock statics built from flat values match hook statics', () => {
    const simple = parseTimelineConfig({
      fade: { at: 0.5, duration: 1, from: { opacity: 0 }, to: { opacity: 1 } },
    } as unknown as TimelineConfig);
    const values = {
      'fade.at': 0.5,
      'fade.duration': 1,
      'fade.transition': { type: 'spring', bounce: 0.2 },
      'fade.from.opacity': 0,
      'fade.to.opacity': 1,
    } as never;
    const viaResolved = computeStaticClips(simple, {})[0];
    const viaValues = computeClipStaticFromValues(values, simple.clips[0], simple.duration);
    assert.equal(viaValues.at, viaResolved.at);
    assert.equal(viaValues.duration, viaResolved.duration);
    assert.equal(viaValues.loop, viaResolved.loop);
    assert.equal(viaValues.tracks.length, viaResolved.tracks.length);
    near(
      current(computeClipState(viaValues, 1.0)).opacity,
      current(computeClipState(viaResolved, 1.0)).opacity,
      1e-9
    );
  });
});

describe('copy normalization', () => {
  it('drops config defaults and pins easing durations', () => {
    const copy = normalizeTimelineValuesForCopy(
      {
        'circle.float.y.delay': 0,
        'circle.float.scale.delay': 0.12,
        'circle.float.loop': 'repeat',
        'circle.path.step1.duration': 0.5,
        'circle.path.step1.transition': { type: 'easing', duration: 99, ease: [0.65, 0, 0.35, 1] },
      },
      parsed.clips
    );
    assert.ok(!('circle.float.y.delay' in copy), 'zero delay dropped');
    assert.equal(copy['circle.float.scale.delay'], 0.12);
    assert.ok(!('circle.float.loop' in copy), 'legacy loop value dropped');
    assert.equal((copy['circle.path.step1.transition'] as { duration: number }).duration, 0.5);
  });

  it('removes editor mode state and exports the effective physics duration', () => {
    const copy = normalizeTimelineValuesForCopy(
      {
        'circle.path.step1.duration': 0.2,
        'circle.path.step1.transition': {
          type: 'spring',
          stiffness: 100,
          damping: 10,
          mass: 1,
        },
        'circle.path.step1.transition.__mode': 'advanced',
      },
      parsed.clips
    );

    assert.ok(!('circle.path.step1.transition.__mode' in copy));
    assert.equal(copy['circle.path.step1.duration'], 1.06);
  });
});

describe('popover display values', () => {
  it('injects effective durations into stored shape-only transitions', () => {
    const values = {
      'circle.path.step1.duration': 0.8,
      'circle.path.step1.transition': { type: 'easing', duration: 0, ease: [0.65, 0, 0.35, 1] },
    };
    const display = timelinePopoverDisplayValues(values as never, 'circle.path', ['step1'], 'step1');
    assert.equal((display['circle.path.step1.transition'] as { duration: number }).duration, 0.8);
  });
});

describe('edit clamps', () => {
  it('keeps bars inside the timeline', () => {
    assert.equal(clampClipMove(4.5, 1, 4.8), 3.8);
    assert.equal(clampClipMove(-1, 1, 4.8), 0);
    near(clampClipResizeEnd(10, 4, 4.8), 0.8);
    assert.deepEqual(clampClipResizeStart(0.5, 0, 1), { at: 0.5, duration: 0.5 });
    near(clampStepResize(10, 0, 1.6, 4.8), 3.2);
    assert.equal(clampTrackDelay(-1, 0, 1.2, 4.8), 0);
    assert.equal(clampTrackDelay(9, 0, 1.2, 4.8), 3.6);
  });
});

describe('loop region (intro-then-idle)', () => {
  it('wraps back to the region start, not zero', () => {
    assert.deepEqual(foldLoopTime(2.0, 4.8, 1.2), { time: 2.0, wraps: 0 }); // inside window
    const folded = foldLoopTime(4.9, 4.8, 1.2);
    near(folded.time, 1.3);
    assert.equal(folded.wraps, 1);
  });

  it('continuous time (wraps × span + time) never jumps at the wrap', () => {
    const span = loopSpan(4.8, 1.2); // 3.6
    const folded = foldLoopTime(4.81, 4.8, 1.2);
    near(folded.wraps * span + folded.time, 4.81);
  });

  it('a full-timeline loop is the region degenerate case', () => {
    const folded = foldLoopTime(5.0, 4.8, 0);
    near(folded.time, 0.2);
    assert.equal(folded.wraps, 1);
    assert.equal(loopSpan(4.8, 0), 4.8);
  });

  it('a bad region start falls back to whole-timeline looping', () => {
    const folded = foldLoopTime(5.0, 4.8, 9); // start past the end
    near(folded.time, 0.2);
    assert.equal(folded.wraps, 1);
  });

  it('intro clips stay finished once the region loops', () => {
    // A one-shot clip that ends before the region: on any wrapped pass the
    // displayed time is past its end, so it rests at `to` and never replays.
    const simple = parseTimelineConfig({
      duration: 6,
      intro: { at: 0.2, duration: 0.5, from: { opacity: 0 }, to: { opacity: 1 } },
    } as unknown as TimelineConfig);
    const [intro] = computeStaticClips(simple, {});
    const wrapped = foldLoopTime(6.3, 6, 1.4); // playhead after one region pass
    const state = computeClipState(intro, wrapped.time, wrapped.wraps * loopSpan(6, 1.4) + wrapped.time);
    assert.equal(state.done, true);
    near(current(state).opacity, 1, 0.005);
  });
});

describe('config validation', () => {
  it('warns and skips entries that are neither clips nor groups', () => {
    let clips: string[] = [];
    const warnings = captureWarnings(() => {
      clips = parseTimelineConfig({
        good: { at: 0, duration: 1 },
        bad: { duration: 1 },
      } as unknown as TimelineConfig).clips.map((c) => c.key);
    });
    assert.deepEqual(clips, ['good']);
    assert.ok(warnings.some((w) => w.includes('"bad"')));
  });

  it('keeps valid clips in a group with a malformed sibling', () => {
    let clips: string[] = [];
    const warnings = captureWarnings(() => {
      clips = parseTimelineConfig({
        layer: { ok: { at: 0, duration: 1 }, broken: { duration: 1 } },
      } as unknown as TimelineConfig).clips.map((c) => c.key);
    });
    assert.deepEqual(clips, ['layer.ok']);
    assert.ok(warnings.some((w) => w.includes('layer.broken')));
  });

  it('warns when props conflicts with from/to/steps — props wins', () => {
    const warnings = captureWarnings(() => {
      const p = parseTimelineConfig({
        a: { at: 0, from: { x: 0 }, props: { y: { from: 0, to: 1, duration: 1 } } },
      } as unknown as TimelineConfig);
      assert.deepEqual(p.clips[0].tracks?.map((t) => t.prop), ['y']);
    });
    assert.ok(warnings.some((w) => w.includes('mutually exclusive')));
  });

  it('warns when to is combined with steps', () => {
    const warnings = captureWarnings(() => {
      parseTimelineConfig({
        a: { at: 0, from: { x: 0 }, to: { x: 5 }, steps: [{ duration: 0.3, to: { x: 1 } }] },
      } as unknown as TimelineConfig);
    });
    assert.ok(warnings.some((w) => w.includes('"to" is ignored')));
  });

  it('warns when a step animates a property with no starting value', () => {
    const warnings = captureWarnings(() => {
      parseTimelineConfig({
        a: { at: 0, from: { x: 0 }, steps: [{ duration: 0.3, to: { x: 1, y: 1 } }] },
      } as unknown as TimelineConfig);
    });
    assert.ok(warnings.some((w) => w.includes('"y"') && w.includes('starting value')));
  });

  it('warns when a props track has steps but no from', () => {
    const warnings = captureWarnings(() => {
      parseTimelineConfig({
        a: { at: 0, props: { y: { steps: [{ duration: 0.3, to: 1 }] } } },
      } as unknown as TimelineConfig);
    });
    assert.ok(warnings.some((w) => w.includes('track "y"')));
  });

  it('a clean config parses without warnings', () => {
    const warnings = captureWarnings(() => {
      parseTimelineConfig(scene);
    });
    assert.deepEqual(warnings, []);
  });
});

describe('duration defaults', () => {
  it('a from/to clip with no duration or transition defaults to the default spring settle time', () => {
    const p = parseTimelineConfig({
      a: { at: 0, from: { x: 0 }, to: { x: 1 } },
    } as unknown as TimelineConfig);
    const [clip] = computeStaticClips(p, {});
    assert.ok(
      clip.duration > 0.2 && clip.duration < 1,
      `expected settle-based duration, got ${clip.duration}`
    );
    near(p.duration, clip.duration, 0.011); // exact-fit inference follows
  });

  it('markers stay zero-length', () => {
    const p = parseTimelineConfig({ mark: { at: 1 } } as unknown as TimelineConfig);
    const [marker] = computeStaticClips(p, {});
    assert.equal(marker.duration, 0);
  });

  it('uses physics settle time consistently even when an explicit duration is present', () => {
    const p = parseTimelineConfig({
      a: {
        at: 0,
        duration: 0.1,
        from: { x: 0 },
        to: { x: 1 },
        transition: { type: 'spring', stiffness: 100, damping: 10, mass: 1 },
      },
    } as unknown as TimelineConfig);
    const [clip] = computeStaticClips(p, {});

    assert.equal(p.duration, 1.06);
    assert.equal(clip.duration, 1.06);
    assert.equal(((p.dialConfig.a as Record<string, unknown>).duration as number[])[0], 1.06);
  });

  it('extends a live timeline when an edited physics spring outgrows its authored window', () => {
    const p = parseTimelineConfig({
      dismiss: {
        at: 1.8,
        duration: 0.35,
        from: { opacity: 1 },
        to: { opacity: 0 },
        transition: { type: 'easing', duration: 0.35, ease: [0.55, 0, 1, 0.45] },
      },
    } as unknown as TimelineConfig);
    const resolved = computeStaticTimeline(p, {
      'dismiss.transition': { type: 'spring', stiffness: 200, damping: 25, mass: 1 },
    });

    assert.equal(p.duration, 2.15);
    assert.equal(resolved.clips[0].duration, 0.42);
    assert.equal(resolved.duration, 2.22);
    assert.equal(resolved.clips[0].end, 2.22);
  });

  it('enforces the minimum duration for animated clips while markers may remain instant', () => {
    const p = parseTimelineConfig({
      animated: {
        at: 0,
        duration: 0,
        from: { opacity: 0 },
        to: { opacity: 1 },
        transition: { type: 'easing', duration: 0, ease: [0, 0, 1, 1] },
      },
      marker: { at: 1, duration: 0 },
    } as unknown as TimelineConfig);
    const [animated, marker] = computeStaticClips(p, {});

    assert.equal(animated.duration, 0.05);
    assert.equal(marker.duration, 0);
  });
});

describe('formatting', () => {
  it('formats clocks and step labels', () => {
    assert.equal(formatClock(63.25, true), '01:03.3');
    assert.equal(formatClock(5), '00:05');
    assert.equal(formatStepLabel('step2'), 'Step 2');
  });
});
