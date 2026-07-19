import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TimelineStore } from './store/TimelineStore';
import { TimelineUiStore } from './store/TimelineUiStore';

const meta = (id: string, duration = 2) => ({
  id,
  name: id,
  duration,
  loop: false,
  loopStart: 0,
  clips: [],
});

describe('TimelineStore', () => {
  it('ignores non-finite seeks and sanitizes invalid durations', () => {
    const id = 'store-finite-values';
    TimelineStore.register(meta(id), { autoplay: false });
    TimelineStore.seek(id, 1.25);
    assert.equal(TimelineStore.getTransport(id).time, 1.25);

    TimelineStore.seek(id, Number.NaN);
    assert.equal(TimelineStore.getTransport(id).time, 1.25);

    TimelineStore.update(meta(id, Number.POSITIVE_INFINITY));
    assert.deepEqual(TimelineStore.getTransport(id), {
      time: 0,
      playing: false,
      duration: 0,
      wraps: 0,
    });
    TimelineStore.unregister(id);
  });

  it('advances by wall time after a delayed animation frame', () => {
    const id = 'store-wall-time';
    const originalWindow = (globalThis as { window?: unknown }).window;
    let frame: ((now: number) => void) | undefined;
    (globalThis as { window?: unknown }).window = {
      requestAnimationFrame(callback: (now: number) => void) {
        frame = callback;
        return 1;
      },
    };

    try {
      const before = performance.now();
      TimelineStore.register(meta(id, 5), { autoplay: true });
      assert.ok(frame, 'autoplay schedules a frame');
      frame!(before + 1_500);
      assert.ok(
        TimelineStore.getTransport(id).time > 1.4,
        `expected wall-clock progress, got ${TimelineStore.getTransport(id).time}`
      );
      TimelineStore.unregister(id);
      frame!(before + 1_600);
    } finally {
      if (originalWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window?: unknown }).window = originalWindow;
      }
    }
  });
});

describe('TimelineUiStore', () => {
  it('supports toolkit-driven uncontrolled visibility', () => {
    const controller = Symbol('uncontrolled');
    const changes: boolean[] = [];
    const unregister = TimelineUiStore.registerController(controller, {
      defaultVisible: false,
      onVisibilityChange: (visible) => changes.push(visible),
    });

    assert.equal(TimelineUiStore.getVisible(), false);
    TimelineUiStore.requestVisible(true);
    assert.equal(TimelineUiStore.getVisible(), true);
    assert.deepEqual(changes, [true]);
    unregister();
  });

  it('requests rather than mutates controlled visibility', () => {
    const controller = Symbol('controlled');
    const changes: boolean[] = [];
    const unregister = TimelineUiStore.registerController(controller, {
      visible: true,
      defaultVisible: true,
      onVisibilityChange: (visible) => changes.push(visible),
    });

    TimelineUiStore.requestVisible(false);
    assert.equal(TimelineUiStore.getVisible(), true);
    assert.deepEqual(changes, [false]);

    TimelineUiStore.updateController(controller, {
      visible: false,
      defaultVisible: true,
      onVisibilityChange: (visible) => changes.push(visible),
    });
    assert.equal(TimelineUiStore.getVisible(), false);
    unregister();
  });
});
