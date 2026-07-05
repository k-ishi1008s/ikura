// このブラウザで開いたグループの履歴（localStorage）
// RLS導入により苗字での全体検索は廃止。自分が開いたグループだけを端末内に記録する。

const KEY = 'ikura_history_v1'
const MAX = 50

export function loadHistory() {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

// entry: { id, token, title, created_at, members, total, per }
export function saveHistoryEntry(entry) {
  if (!entry?.id || !entry?.token) return
  const rest = loadHistory().filter(e => String(e.id) !== String(entry.id))
  const next = [{ ...entry, visited_at: new Date().toISOString() }, ...rest].slice(0, MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // 容量超過などは黙って無視（履歴はベストエフォート）
  }
}

export function removeHistoryEntry(id) {
  const next = loadHistory().filter(e => String(e.id) !== String(id))
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {}
}
