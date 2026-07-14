import { createSignal, onCleanup, Show, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import { animate } from 'motion';
import { DialStore, ShortcutConfig } from '../../store/DialStore';
import { createDropdownDismiss, createDropdownPresence, type AnimationHandle } from '../primitives';

interface ShortcutsMenuProps {
  panelId: string;
}

function formatShortcutKey(sc: ShortcutConfig): string {
  if (!sc.key) return '\u2014';
  const mod = sc.modifier === 'alt' ? '\u2325'
    : sc.modifier === 'shift' ? '\u21E7'
    : sc.modifier === 'meta' ? '\u2318'
    : '';
  return `${mod}${sc.key.toUpperCase()}`;
}

function formatInteraction(sc: ShortcutConfig): string {
  const interaction = sc.interaction ?? 'scroll';
  switch (interaction) {
    case 'scroll': return sc.key ? 'key+scroll' : 'scroll';
    case 'drag': return 'key+drag';
    case 'move': return 'key+move';
    case 'scroll-only': return 'scroll';
  }
}

export function ShortcutsMenu(props: ShortcutsMenuProps) {
  const [pos, setPos] = createSignal({ top: 0, right: 0 });

  let triggerRef!: HTMLButtonElement;
  let triggerTapAnim: AnimationHandle | null = null;

  const tapTransition = { type: 'spring' as const, visualDuration: 0.15, bounce: 0.3 };

  const dropdown = createDropdownPresence((el, done) =>
    animate(
      el,
      { opacity: 0, y: 4, scale: 0.97 },
      { type: 'spring', visualDuration: 0.15, bounce: 0, onComplete: done }
    )
  );

  const open = () => {
    const rect = triggerRef?.getBoundingClientRect();
    if (rect) {
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    dropdown.open();
  };

  const toggle = () => {
    if (dropdown.isOpen()) dropdown.close();
    else open();
  };

  createDropdownDismiss({
    isOpen: dropdown.isOpen,
    contains: (target) => triggerRef?.contains(target) || dropdown.contains(target),
    onDismiss: dropdown.close,
  });

  onCleanup(() => triggerTapAnim?.stop());

  const panel = () => DialStore.getPanel(props.panelId);

  const rows = () => {
    const p = panel();
    if (!p) return [];
    const shortcuts = Object.entries(p.shortcuts);
    if (shortcuts.length === 0) return [];

    return shortcuts.map(([path, shortcut]) => {
      const findLabel = (controls: typeof p.controls): string => {
        for (const c of controls) {
          if (c.path === path) return c.label;
          if (c.type === 'folder' && c.children) {
            const found = findLabel(c.children);
            if (found) return found;
          }
        }
        return path;
      };
      return {
        path,
        shortcut,
        label: findLabel(p.controls),
      };
    });
  };

  const tapTo = (scale: number) => {
    triggerTapAnim?.stop();
    triggerTapAnim = animate(triggerRef, { scale }, tapTransition);
  };

  return (
    <>
      <button
        ref={triggerRef}
        class="dialkit-shortcuts-trigger"
        onClick={toggle}
        onPointerDown={() => tapTo(0.9)}
        onPointerUp={() => tapTo(1)}
        onPointerCancel={() => tapTo(1)}
        onPointerLeave={() => tapTo(1)}
        title="Keyboard shortcuts"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <path d="M6 10H6.01" />
          <path d="M10 10H10.01" />
          <path d="M14 10H14.01" />
          <path d="M18 10H18.01" />
          <path d="M8 14H16" />
        </svg>
      </button>

      <Show when={dropdown.mounted()}>
        <Portal mount={document.body}>
          <div
            ref={(el) => {
              dropdown.setRef(el);
              animate(
                el,
                { opacity: [0, 1], y: [4, 0], scale: [0.97, 1] },
                { type: 'spring', visualDuration: 0.15, bounce: 0 }
              );
            }}
            class="dialkit-root dialkit-shortcuts-dropdown"
            style={{
              position: 'fixed',
              top: `${pos().top}px`,
              right: `${pos().right}px`,
            }}
          >
            <div class="dialkit-shortcuts-title">Keyboard Shortcuts</div>
            <div class="dialkit-shortcuts-list">
              <For each={rows()}>
                {(row) => (
                  <div class="dialkit-shortcuts-row">
                    <span class="dialkit-shortcuts-row-key">
                      {formatShortcutKey(row.shortcut)}
                    </span>
                    <span class="dialkit-shortcuts-row-label">{row.label}</span>
                    <span class="dialkit-shortcuts-row-mode">{formatInteraction(row.shortcut)}</span>
                  </div>
                )}
              </For>
            </div>
            <div class="dialkit-shortcuts-hint">See pill badges on controls for keys</div>
          </div>
        </Portal>
      </Show>
    </>
  );
}
