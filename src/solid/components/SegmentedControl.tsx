import { createSignal, createEffect, on, onMount, onCleanup, For, Show } from 'solid-js';

interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>(props: SegmentedControlProps<T>) {
  let containerRef: HTMLDivElement | undefined;
  const [pillStyle, setPillStyle] = createSignal<{ left: number; width: number } | null>(null);
  // The pill jumps into place on first paint, then animates on value changes.
  const [hasChanged, setHasChanged] = createSignal(false);

  const measure = () => {
    if (!containerRef) return;
    const activeButton = containerRef.querySelector('[data-active="true"]') as HTMLElement | null;
    if (!activeButton) return;
    setPillStyle({
      left: activeButton.offsetLeft,
      width: activeButton.offsetWidth,
    });
  };

  createEffect(on(() => [props.value, props.options.length] as const, measure));

  createEffect(on(() => props.value, () => setHasChanged(true), { defer: true }));

  // Keep the pill aligned when the container itself resizes (e.g. panel width).
  onMount(() => {
    if (!containerRef) return;
    const ro = new ResizeObserver(measure);
    ro.observe(containerRef);
    onCleanup(() => ro.disconnect());
  });

  const transition = () => (
    hasChanged()
      ? 'left 0.2s cubic-bezier(0.25, 1, 0.5, 1), width 0.2s cubic-bezier(0.25, 1, 0.5, 1)'
      : 'none'
  );

  return (
    <div class="dialkit-segmented" ref={containerRef}>
      <Show when={pillStyle()}>
        {(style) => (
          <div
            class="dialkit-segmented-pill"
            style={{
              left: `${style().left}px`,
              width: `${style().width}px`,
              transition: transition(),
            }}
          />
        )}
      </Show>
      <For each={props.options}>
        {(option) => (
          <button
            onClick={() => props.onChange(option.value)}
            class="dialkit-segmented-button"
            data-active={String(props.value === option.value)}
          >
            {option.label}
          </button>
        )}
      </For>
    </div>
  );
}
