/** Copy text using the async clipboard where available, with an iOS Safari fallback. */
export async function copyTextToClipboard(value: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Older iOS versions can expose Clipboard API but reject writes outside
      // a secure/user-gesture context. Fall through to the selection fallback.
    }
  }

  if (typeof document === 'undefined') throw new Error('Clipboard is unavailable.');
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.opacity = '0';
  textarea.style.fontSize = '16px';
  document.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    if (!document.execCommand('copy')) throw new Error('Copy command was rejected.');
  } finally {
    textarea.remove();
  }
}
