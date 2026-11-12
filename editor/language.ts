import { languageOf, messagesFor } from './messages'

/** The view's language, from Orca's interface language when the view opened. */
export const language = languageOf(orca.locale)

/** What the view says, in that language. */
export const text = messagesFor(language)
