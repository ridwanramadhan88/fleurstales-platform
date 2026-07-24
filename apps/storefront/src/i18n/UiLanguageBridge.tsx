import { useLayoutEffect } from 'react'
import { translateUiText } from './translateUiText'
import { useUiLanguage, type UiLanguage } from './uiLanguage'

type TextRecord = { original: string; applied: string }
type AttributeRecord = { original: string; applied: string }

const textRecords = new WeakMap<Text, TextRecord>()
const attributeRecords = new WeakMap<Element, Map<string, AttributeRecord>>()
const TRANSLATABLE_ATTRIBUTES = ['placeholder', 'title', 'aria-label'] as const

const shouldSkip = (element: Element | null): boolean => {
  if (!element) return true
  return Boolean(element.closest('script, style, code, pre, svg, [data-no-translate], [contenteditable="true"]'))
}

const translateTextNode = (node: Text, language: UiLanguage) => {
  if (shouldSkip(node.parentElement)) return
  const current = node.data
  const record = textRecords.get(node)
  const original = record && current === record.applied ? record.original : current
  const translated = language === 'id' ? translateUiText(original, 'id') : original
  textRecords.set(node, { original, applied: translated })
  if (current !== translated) node.data = translated
}

const translateAttributes = (element: Element, language: UiLanguage) => {
  if (shouldSkip(element)) return
  let records = attributeRecords.get(element)
  if (!records) {
    records = new Map()
    attributeRecords.set(element, records)
  }

  TRANSLATABLE_ATTRIBUTES.forEach((attribute) => {
    const current = element.getAttribute(attribute)
    if (!current) return
    const record = records!.get(attribute)
    const original = record && current === record.applied ? record.original : current
    const translated = language === 'id' ? translateUiText(original, 'id') : original
    records!.set(attribute, { original, applied: translated })
    if (current !== translated) element.setAttribute(attribute, translated)
  })
}

const translateSubtree = (root: Node, language: UiLanguage) => {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text, language)
    return
  }
  if (!(root instanceof Element) && !(root instanceof Document)) return

  if (root instanceof Element) translateAttributes(root, language)
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node as Text, language)
    else translateAttributes(node as Element, language)
    node = walker.nextNode()
  }
}

/**
 * Compatibility bridge for the existing UI while text is progressively moved
 * to explicit i18n keys. It translates visible copy and accessibility labels
 * without changing IDs, business values, names, or workflow data.
 */
export const UiLanguageBridge = () => {
  const language = useUiLanguage((state) => state.language)

  useLayoutEffect(() => {
    document.documentElement.lang = language === 'id' ? 'id' : 'en'
    translateSubtree(document.body, language)

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'characterData') translateSubtree(mutation.target, language)
        if (mutation.type === 'attributes' && mutation.target instanceof Element) translateAttributes(mutation.target, language)
        mutation.addedNodes.forEach((node) => translateSubtree(node, language))
      })
    })

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
    })

    return () => observer.disconnect()
  }, [language])

  return null
}
