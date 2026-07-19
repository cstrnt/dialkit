import { createEffect, createMemo, createSignal, createUniqueId, onCleanup, onMount, type Accessor } from 'solid-js';
import { isServer } from 'solid-js/web';
import { DialStore } from '../store/DialStore';
import { TimelineStore } from '../store/TimelineStore';
import {
  buildTimelineMeta,
  buildTimelineValues,
  computeStaticTimeline,
  parseTimelineConfig,
  resolveTimelineLoop,
  type DialTimelineOptions,
  type DialTimelineValues,
  type TimelineConfig,
} from '../timeline';

export type CreateDialTimelineOptions = DialTimelineOptions;

export function createDialTimeline<T extends TimelineConfig>(
  name: string,
  config: T,
  options?: CreateDialTimelineOptions
): Accessor<DialTimelineValues<T>> {
  const instanceId = createUniqueId();
  const hasStableId = options?.id !== undefined;
  const panelId = options?.id ?? `${name}-${instanceId}`;
  const parsed = createMemo(() => parseTimelineConfig(config));
  const [flatValues, setFlatValues] = createSignal(DialStore.getValues(panelId));
  const [transport, setTransport] = createSignal(TimelineStore.getTransport(panelId));
  const staticTimeline = createMemo(() => computeStaticTimeline(parsed(), flatValues()));
  const loopStart = () => resolveTimelineLoop(options?.loop).start;
  let mounted = false;

  const play = () => TimelineStore.play(panelId);
  const pause = () => TimelineStore.pause(panelId);
  const replay = () => TimelineStore.replay(panelId);
  const seek = (time: number) => TimelineStore.seek(panelId, time);

  if (!isServer) {
    const unsubscribeValues = DialStore.subscribe(panelId, () => {
      setFlatValues(DialStore.getValues(panelId));
    });
    const unsubscribeTransport = TimelineStore.subscribe(panelId, () => {
      setTransport(TimelineStore.getTransport(panelId));
    });
    onCleanup(() => {
      unsubscribeValues();
      unsubscribeTransport();
    });
  }

  onMount(() => {
    DialStore.registerPanel(panelId, name, parsed().dialConfig, undefined, {
      retainOnUnmount: hasStableId,
      persist: options?.persist,
      kind: 'timeline',
    });
    setFlatValues(DialStore.getValues(panelId));

    const currentStatic = staticTimeline();
    TimelineStore.register(
      buildTimelineMeta(panelId, name, currentStatic.duration, parsed(), options?.loop),
      { autoplay: options?.autoplay ?? true }
    );
    setTransport(TimelineStore.getTransport(panelId));
    mounted = true;

    onCleanup(() => {
      mounted = false;
      TimelineStore.unregister(panelId);
      DialStore.unregisterPanel(panelId);
    });
  });

  createEffect(() => {
    const currentParsed = parsed();
    const currentStatic = staticTimeline();
    if (!mounted) return;
    TimelineStore.update(
      buildTimelineMeta(panelId, name, currentStatic.duration, currentParsed, options?.loop)
    );
  });

  return createMemo(() => {
    const currentStatic = staticTimeline();
    return buildTimelineValues<T>(
      currentStatic.clips,
      transport(),
      currentStatic.duration,
      loopStart(),
      { play, pause, replay, seek }
    );
  });
}
