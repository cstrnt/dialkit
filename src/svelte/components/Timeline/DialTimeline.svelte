<script lang="ts">
  import {
    TimelineStore,
    TimelineUiStore,
    isDevDefault,
  } from 'dialkit/timeline';
  import type { TimelineMeta } from 'dialkit/timeline';
  import Portal from '../../Portal.svelte';
  import type { DialTheme } from '../DialRoot.svelte';
  import TimelineSection from './TimelineSection.svelte';

  let {
    theme = 'system',
    defaultVisible = true,
    visible,
    onVisibilityChange,
    defaultOpen = true,
    productionEnabled = isDevDefault,
  } = $props<{
    theme?: DialTheme;
    defaultVisible?: boolean;
    visible?: boolean;
    onVisibilityChange?: (visible: boolean) => void;
    defaultOpen?: boolean;
    productionEnabled?: boolean;
  }>();

  const controllerId = Symbol('dialkit-timeline-visibility');
  let mounted = $state(false);
  let timelines = $state<TimelineMeta[]>([]);
  let dockVisible = $state(TimelineUiStore.getVisible());

  $effect(() => {
    if (typeof window === 'undefined') return;
    mounted = true;
    timelines = TimelineStore.getTimelines();
    dockVisible = TimelineUiStore.getVisible();
    const unsubscribeVisibility = TimelineUiStore.subscribe(() => {
      dockVisible = TimelineUiStore.getVisible();
    });
    const unregisterController = TimelineUiStore.registerController(controllerId, {
      visible,
      defaultVisible,
      onVisibilityChange,
    });
    dockVisible = TimelineUiStore.getVisible();
    const unsubscribeTimelines = TimelineStore.subscribeGlobal(() => {
      timelines = TimelineStore.getTimelines();
    });
    return () => {
      unregisterController();
      unsubscribeTimelines();
      unsubscribeVisibility();
    };
  });

  $effect(() => {
    TimelineUiStore.updateController(controllerId, {
      visible,
      defaultVisible,
      onVisibilityChange,
    });
  });
</script>

{#if productionEnabled && mounted && timelines.length > 0}
  <Portal target="body">
    <div class="dialkit-root dialkit-timeline" data-theme={theme} hidden={!dockVisible}>
      <div class="dialkit-timeline-dock">
        {#each timelines as timeline (timeline.id)}
          <TimelineSection meta={timeline} {defaultOpen} {theme} {dockVisible} />
        {/each}
      </div>
    </div>
  </Portal>
{/if}
