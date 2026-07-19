import { defineComponent, h, onMounted, onUnmounted, ref } from 'vue';
import { ICON_TIMELINE } from '../../../icons';
import { TimelineUiStore } from '../../../store/TimelineUiStore';

export const TimelineToggleButton = defineComponent({
  name: 'DialKitTimelineToggleButton',
  setup() {
    const visible = ref(TimelineUiStore.getVisible());
    let unsubscribe: (() => void) | undefined;
    onMounted(() => {
      unsubscribe = TimelineUiStore.subscribe(() => {
        visible.value = TimelineUiStore.getVisible();
      });
    });
    onUnmounted(() => unsubscribe?.());
    return () => {
      const label = visible.value ? 'Hide timeline' : 'Show timeline';
      return h('button', {
        class: 'dialkit-toolbar-add dialkit-timeline-toolbar-toggle',
        'data-active': visible.value || undefined,
        'aria-pressed': visible.value,
        'aria-label': label,
        title: label,
        onClick: () => TimelineUiStore.toggle(),
      }, [
        h('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
          ICON_TIMELINE.map((path) => h('path', { d: path, fill: 'currentColor' }))),
      ]);
    };
  },
});
