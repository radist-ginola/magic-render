export type ShortcutAction = 'help' | 'new' | 'open' | 'save' | 'import' | 'render' | 'pause' | 'cancel' | 'play' | 'reset-preview' | 'zoom-in' | 'zoom-out' | 'delete-layer' | 'nudge-left' | 'nudge-right' | 'nudge-up' | 'nudge-down' | 'escape' | `page-${number}` | `tab-${number}`;
export type ShortcutEvent = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>;

export function editorShortcut(event: ShortcutEvent, editable: boolean, modal: boolean): ShortcutAction | null {
  const key = event.key.toLowerCase();
  const command = event.ctrlKey || event.metaKey;
  if (key === 'escape') return 'escape';
  if (modal) return command && key === 's' ? 'save' : null;
  if (key === 'f1') return 'help';
  if (command && event.shiftKey) {
    if (key === 'p') return 'pause';
    if (key === 'x') return 'cancel';
  }
  if (command && !event.altKey) {
    const digit = /^digit([1-6])$/.exec(event.code.toLowerCase());
    if (digit) return `page-${digit[1]}` as ShortcutAction;
    return ({ n: 'new', o: 'open', s: 'save', i: 'import', enter: 'render' } as Record<string, ShortcutAction>)[key] ?? null;
  }
  if (editable) return null;
  if (event.altKey && !command) {
    const digit = /^digit([1-6])$/.exec(event.code.toLowerCase());
    return digit ? `tab-${digit[1]}` as ShortcutAction : null;
  }
  if (event.shiftKey && !key.startsWith('arrow')) return null;
  return ({ ' ': 'play', home: 'reset-preview', '=': 'zoom-in', '+': 'zoom-in', '-': 'zoom-out', delete: 'delete-layer', backspace: 'delete-layer', arrowleft: 'nudge-left', arrowright: 'nudge-right', arrowup: 'nudge-up', arrowdown: 'nudge-down' } as Record<string, ShortcutAction>)[key] ?? null;
}

export function isEditingField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || !!target.closest('input, textarea, select, [contenteditable="true"]'));
}
