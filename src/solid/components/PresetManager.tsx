import { createSignal, createEffect, on, onMount, onCleanup, Show, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import { animate } from 'motion';
import { ICON_CHEVRON, ICON_TRASH } from '../../icons';
import { getDialKitPortalRoot, getDropdownPosition } from '../../dropdown-position';
import { DialStore } from '../../store/DialStore';
import type { Preset } from '../../store/DialStore';
import { createDropdownDismiss, createDropdownPresence, type AnimationHandle } from '../primitives';

interface PresetManagerProps {
  panelId: string;
  presets: Preset[];
  activePresetId: string | null;
  onAdd: () => void;
}

export function PresetManager(props: PresetManagerProps) {
  const [pos, setPos] = createSignal({ top: 0, left: 0, width: 0 });
  const [portalTarget, setPortalTarget] = createSignal<HTMLElement | null>(null);
  let triggerRef!: HTMLButtonElement;
  let chevronRef!: SVGSVGElement;
  let chevronAnim: AnimationHandle | null = null;

  const hasPresets = () => props.presets.length > 0;
  const activePreset = () => props.presets.find((p) => p.id === props.activePresetId);

  const dropdown = createDropdownPresence((el, done) =>
    animate(
      el,
      { opacity: 0, y: 4, scale: 0.97 },
      { type: 'spring', visualDuration: 0.15, bounce: 0, onComplete: done }
    )
  );

  onMount(() => {
    setPortalTarget(getDialKitPortalRoot(triggerRef) ?? document.body);
    onCleanup(() => chevronAnim?.stop());
  });

  // Renders at its resting state via inline style; animate on changes only.
  createEffect(on([dropdown.isOpen, hasPresets] as const, ([open, has]) => {
    if (!chevronRef) return;
    chevronAnim?.stop();
    chevronAnim = animate(
      chevronRef,
      { rotate: open ? 180 : 0, opacity: has ? 0.6 : 0.25 },
      { type: 'spring', visualDuration: 0.2, bounce: 0.15 }
    );
  }, { defer: true }));

  const updatePos = () => {
    const root = portalTarget();
    if (!triggerRef || !root) return;
    setPos(getDropdownPosition(triggerRef, root, { allowAbove: false }));
  };

  const openDropdown = () => {
    if (!hasPresets()) return;
    updatePos();
    dropdown.open();
  };

  const toggle = () => {
    if (dropdown.isOpen()) dropdown.close();
    else openDropdown();
  };

  createDropdownDismiss({
    isOpen: dropdown.isOpen,
    contains: (target) => triggerRef?.contains(target) || dropdown.contains(target),
    onDismiss: dropdown.close,
    onViewportChange: updatePos,
  });

  const handleSelect = (presetId: string | null) => {
    if (presetId) DialStore.loadPreset(props.panelId, presetId);
    else DialStore.clearActivePreset(props.panelId);
    dropdown.close();
  };

  const handleDelete = (e: MouseEvent, presetId: string) => {
    e.stopPropagation();
    DialStore.deletePreset(props.panelId, presetId);
  };

  return (
    <div class="dialkit-preset-manager">
      <button
        ref={triggerRef}
        class="dialkit-preset-trigger"
        onClick={toggle}
        data-open={String(dropdown.isOpen())}
        data-has-preset={String(!!activePreset())}
        data-disabled={String(!hasPresets())}
      >
        <span class="dialkit-preset-label">
          {activePreset() ? activePreset()!.name : 'Version 1'}
        </span>
        <svg
          ref={chevronRef}
          class="dialkit-select-chevron"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          style={{ opacity: hasPresets() ? 0.6 : 0.25 }}
        >
          <path d={ICON_CHEVRON} />
        </svg>
      </button>

      <Show when={!!portalTarget()}>
        <Portal mount={portalTarget()!}>
          <Show when={dropdown.mounted()}>
            <div
              ref={(el) => {
                dropdown.setRef(el);
                animate(
                  el,
                  { opacity: [0, 1], y: [4, 0], scale: [0.97, 1] },
                  { type: 'spring', visualDuration: 0.15, bounce: 0 }
                );
              }}
              class="dialkit-root dialkit-preset-dropdown"
              style={{
                position: 'absolute',
                top: `${pos().top}px`,
                left: `${pos().left}px`,
                'min-width': `${pos().width}px`,
              }}
            >
              <div
                class="dialkit-preset-item"
                data-active={String(!props.activePresetId)}
                onClick={() => handleSelect(null)}
              >
                <span class="dialkit-preset-name">Version 1</span>
              </div>

              <For each={props.presets}>
                {(preset) => (
                  <div
                    class="dialkit-preset-item"
                    data-active={String(preset.id === props.activePresetId)}
                    onClick={() => handleSelect(preset.id)}
                  >
                    <span class="dialkit-preset-name">{preset.name}</span>
                    <button
                      class="dialkit-preset-delete"
                      onClick={(e) => handleDelete(e, preset.id)}
                      title="Delete preset"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d={ICON_TRASH[0]} />
                        <path d={ICON_TRASH[1]} />
                        <path d={ICON_TRASH[2]} />
                        <path d={ICON_TRASH[3]} />
                        <path d={ICON_TRASH[4]} />
                      </svg>
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Portal>
      </Show>
    </div>
  );
}
