import { For } from 'solid-js';
import { ICON_TIMELINE } from '../../../icons';
import { TimelineUiStore } from '../../../store/TimelineUiStore';
import { fromStore } from '../../primitives';

export function TimelineToggleButton() {
  const visible = fromStore(
    () => TimelineUiStore.getVisible(),
    (notify) => TimelineUiStore.subscribe(notify)
  );
  const label = () => visible() ? 'Hide timeline' : 'Show timeline';
  return (
    <button
      class="dialkit-toolbar-add dialkit-timeline-toolbar-toggle"
      data-active={visible() || undefined}
      aria-pressed={visible()}
      aria-label={label()}
      title={label()}
      onClick={() => TimelineUiStore.toggle()}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <For each={ICON_TIMELINE}>{(path) => <path d={path} fill="currentColor" />}</For>
      </svg>
    </button>
  );
}
