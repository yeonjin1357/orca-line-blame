/** How the platform writes the shortcut that finds in a file; `platform` is `navigator.platform`. */
export function findShortcut(platform: string): string {
  return /^(Mac|iPhone|iPad)/.test(platform) ? '⌘F' : 'Ctrl+F'
}
