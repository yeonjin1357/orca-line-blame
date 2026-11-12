/** The languages the view speaks: Korean for a Korean Orca, English for any other. */
export type Language = 'ko' | 'en'

/** The view's language for Orca's interface language, a BCP-47 tag such as `ko` or `en-US`. */
export function languageOf(locale: string): Language {
  return /^ko([-_]|$)/i.test(locale) ? 'ko' : 'en'
}

/** Everything the view says; the two languages below must each say all of it. */
export type Messages = {
  notCommitted: string
  authors(count: number): string
  lastChange(author: string, when: string): string
  hasUncommittedChanges: string
  pickFile: string
  find: string
  findInFile: string
  findingFile: string
  fileNotFound: string
  findFileFailed(reason: string): string
  loadingBlame: string
  blameFailed(reason: string): string
  addedInCommit: string
  changedInCommit: string
  moreLinesChanged(count: number): string
  earlierChangeNumber(position: number): string
  loadFailed(reason: string): string
  loadingChange: string
  lineNotInCommit: string
  close: string
  earlierChange: string
  showEarlierChange: string
  firstWrittenHere: string
  laterChange: string
  backToLaterChange: string
  noResults: string
  matchCase: string
  previousMatch: string
  nextMatch: string
}

const KOREAN: Messages = {
  notCommitted: '아직 커밋되지 않은 변경',
  authors: (count) => `작성자 ${count}명`,
  lastChange: (author, when) => `마지막 변경 ${author}, ${when}`,
  hasUncommittedChanges: '커밋 전 변경 있음',
  pickFile: '내용이 같은 파일이 여러 개예요. 보고 있는 파일을 골라 주세요.',
  find: '찾기',
  findInFile: '파일 안에서 찾기 (Ctrl+F)',
  findingFile: '파일 찾는 중…',
  fileNotFound: '워크스페이스에서 이 파일을 찾지 못했어요',
  findFileFailed: (reason) => `파일 찾기 실패: ${reason}`,
  loadingBlame: 'blame 불러오는 중…',
  blameFailed: (reason) => `blame 실패: ${reason}`,
  addedInCommit: '이 커밋에서 새로 추가된 줄',
  changedInCommit: '이 커밋에서 바뀐 내용',
  moreLinesChanged: (count) => `같은 자리에서 ${count}줄이 더 바뀌었어요`,
  earlierChangeNumber: (position) => `이 줄의 ${position}번째 이전 변경`,
  loadFailed: (reason) => `불러오지 못했어요: ${reason}`,
  loadingChange: '변경 내용 불러오는 중…',
  lineNotInCommit: '이 커밋의 변경 내용에서 이 줄을 찾지 못했어요 (병합 커밋일 수 있어요)',
  close: '닫기 (Esc)',
  earlierChange: '◀ 이전 변경',
  showEarlierChange: '이 줄을 그 전에 바꾼 커밋 보기',
  firstWrittenHere: '이 줄은 이 커밋에서 처음 생겼어요',
  laterChange: '다음 변경 ▶',
  backToLaterChange: '더 최근 변경으로 돌아가기',
  noResults: '결과 없음',
  matchCase: '대소문자 구분',
  previousMatch: '이전 (Shift+Enter)',
  nextMatch: '다음 (Enter)'
}

const ENGLISH: Messages = {
  notCommitted: 'Not committed yet',
  authors: (count) => (count === 1 ? '1 author' : `${count} authors`),
  lastChange: (author, when) => `last change by ${author}, ${when}`,
  hasUncommittedChanges: 'has uncommitted changes',
  pickFile: 'Several files have exactly this text. Pick the one you are viewing.',
  find: 'Find',
  findInFile: 'Find in file (Ctrl+F)',
  findingFile: 'Finding the file…',
  fileNotFound: 'This file was not found in any workspace',
  findFileFailed: (reason) => `Could not find the file: ${reason}`,
  loadingBlame: 'Loading blame…',
  blameFailed: (reason) => `Blame failed: ${reason}`,
  addedInCommit: 'Line added in this commit',
  changedInCommit: 'Changed in this commit',
  moreLinesChanged: (count) =>
    count === 1 ? '1 more line changed in the same place' : `${count} more lines changed in the same place`,
  earlierChangeNumber: (position) => `Earlier change ${position} of this line`,
  loadFailed: (reason) => `Could not load: ${reason}`,
  loadingChange: 'Loading the change…',
  lineNotInCommit: "This line was not found in the commit's changes (it may be a merge commit)",
  close: 'Close (Esc)',
  earlierChange: '◀ Earlier change',
  showEarlierChange: 'Show the commit that changed this line before',
  firstWrittenHere: 'This commit wrote the line first',
  laterChange: 'Later change ▶',
  backToLaterChange: 'Back to the more recent change',
  noResults: 'No results',
  matchCase: 'Match case',
  previousMatch: 'Previous (Shift+Enter)',
  nextMatch: 'Next (Enter)'
}

export function messagesFor(language: Language): Messages {
  return language === 'ko' ? KOREAN : ENGLISH
}
