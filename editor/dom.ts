/** Creates an element with an optional class and text; text is never read as markup. */
export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) {
    node.className = className
  }
  if (text !== undefined) {
    node.textContent = text
  }
  return node
}

/** A push button with a tooltip. */
export function button(label: string, title: string, onPress: () => void): HTMLButtonElement {
  const node = element('button', undefined, label)
  node.type = 'button'
  node.title = title
  node.addEventListener('click', onPress)
  return node
}
