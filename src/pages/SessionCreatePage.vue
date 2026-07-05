<script setup>
import { ref, nextTick, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { createClient } from '@supabase/supabase-js'
import { loadHistory, saveHistoryEntry, removeHistoryEntry } from '../api/history'

const router = useRouter()

// セッション名
const title = ref('')

// メンバーUI
const nameInput = ref('')
const names = ref([]) // ここに追加したメンバーがたまる
const inputEl = ref(null)
const loading = ref(false)

// 入力正規化（空白削除・全角空白対応）
function normalizeName(s) {
  return s.replace(/\s+/g, ' ').replace(/^[\s　]+|[\s　]+$/g, '')
}

// 追加（Enter or ボタン）
function addName() {
  const raw = nameInput.value
  // カンマ / 改行ペーストで一気に複数追加もOK
  if (raw.includes(',') || raw.includes('\n')) {
    const parts = raw.split(/[,|\n]/).map(normalizeName).filter(Boolean)
    for (const p of parts) pushUnique(p)
    nameInput.value = ''
    return focusInput()
  }
  const n = normalizeName(raw)
  if (!n) return
  pushUnique(n)
  nameInput.value = ''
  focusInput()
}

// 重複を入れない
function pushUnique(n) {
  if (names.value.some(x => x === n)) return
  // 20人くらいまでの軽いガード（必要なら調整）
  if (names.value.length >= 50) return alert('メンバーは最大50人まで')
  names.value.push(n)
}

function removeName(idx) {
  names.value.splice(idx, 1)
}

function focusInput() {
  nextTick(() => inputEl.value?.focus())
}

function genToken(bits = 128) {
  const a = new Uint8Array(bits/8); crypto.getRandomValues(a)
  return Array.from(a,b=>b.toString(16).padStart(2,'0')).join('')
}

async function createSession() {
  if (!title.value.trim()) return alert('タイトルを入れてください')
  if (names.value.length === 0) return alert('メンバーを1人以上追加してください')

  loading.value = true
  const token = genToken()

  // RLS: 作成直後の SELECT / members INSERT には x-session-token ヘッダが必要
  const db = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    {
      global: { headers: { 'x-session-token': token } },
      auth: { persistSession: false, autoRefreshToken: false }
    }
  )

  // 1) sessions
  const { data: sess, error: e1 } = await db
    .from('sessions')
    .insert([{ title: title.value, token }])
    .select('id, created_at')
    .single()
  if (e1 || !sess) {
    loading.value = false
    return alert(e1?.message ?? 'sessions insert 失敗')
  }

  // 2) members
  const rows = names.value.map(n => ({ session_id: sess.id, name: n, active: true }))
  const { error: e2 } = await db.from('members').insert(rows)
  if (e2) {
    loading.value = false
    return alert(e2.message)
  }

  // 履歴に保存（このブラウザで開いたグループ一覧）
  saveHistoryEntry({
    id: sess.id,
    token,
    title: title.value,
    created_at: sess.created_at,
    members: [...names.value],
    total: 0,
    per: 0
  })

  loading.value = false

  // // 3) 共有テキストを先にコピー（補間はバッククォート）
  // const newUrl = `${location.origin}/s/${sess.id}/${token}`
  // const msg = `waligaで会計は管理。waligaで会計は管理。waligaで会計は管理。忘れない内に入れましょう\n${newUrl}`

  // try {
  //   await navigator.clipboard.writeText(msg)
  //   alert('リンクコピー完了！忘れやん内にLINEで共有しときや')
  // } catch (err) {
  //   console.warn('clipboard failed:', err)
  //   // フォールバック：URLだけでもアラートに出す
  //   alert('コピーエラー')
  // }

  // 4) 最後に遷移
  router.push(`/s/${sess.id}/${token}`)
}

//　履歴機能の実装
// ＝＝＝＝ このブラウザで開いたグループ一覧（localStorage） ＝＝＝＝
// RLS導入により苗字での全体検索は廃止（他人のデータが見える設計だったため）
const pastEvents = ref([]);      // 表示用カード配列

const fmtJPY = (n) =>
  Number(n || 0).toLocaleString('ja-JP', {
    style: 'currency', currency: 'JPY', maximumFractionDigits: 0
  });

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('ja-JP', { year:'numeric', month:'short', day:'numeric' }) : '';

onMounted(() => {
  pastEvents.value = loadHistory();
});

function openSessionCard(ev) {
  // そのイベントへ移動
  router.push(`/s/${ev.id}/${ev.token}`);
}

function reuseMembers(ev) {
  // 同じメンバーを上に復元（タイトルは絶対に上書きしない）
  names.value = [...ev.members];
  focusInput();   // 入力欄にフォーカス戻す
}

function removeCard(ev) {
  if (!confirm('この履歴を削除しますか？（グループ自体は消えません）')) return;
  removeHistoryEntry(ev.id);
  pastEvents.value = loadHistory();
}

</script>

<template>
  <main class="container">
    <div class="maincard" style="display:flex; flex-direction:column; gap:12px;">

      <!-- <label class="small">タイトル</label> -->
      <input v-model="title" placeholder="イベントタイトル" />

      <!-- メンバー入力欄 -->
      <!-- <label class="small" style="margin-top:4px;">メンバー名</label> -->
      <div class="row" style="gap:8px; align-items:center;">
        <input
          ref="inputEl"
          v-model="nameInput"
          placeholder="メンバー苗字"
          @keyup.enter.prevent="addName"
          autocomplete="off"
          autocapitalize="none"
          style="flex:1; padding:10px 12px; height:40px;"
        />
        <button class="ghost" @click="addName" style="height:40px; padding:0 14px; white-space:nowrap;">追加</button>
      </div>

      <!-- メンバー一覧 -->
      <div class="row" style="gap:6px; flex-wrap:wrap;">
        <span v-for="(n,i) in names" :key="i"
          style="display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border:1px solid #eee; border-radius:999px; background:#fff; font-size:13px; font-weight: 600;">
          {{ n }}
          <button class="ghost" style="padding:2px 6px; font-size:14px;" @click="removeName(i)">×</button>
        </span>
      </div>

      <button :disabled="loading" @click="createSession" style="width:100%; margin-top:8px;">
        グループを作成
      </button>
    </div>
  </main>

  <!-- ＝＝＝＝ このブラウザで開いたグループ一覧 ＝＝＝＝ -->
  <div class="container">
    <div class="card card--frameless" style="margin-top:8px;">
      <div v-if="pastEvents.length" class="small" style="font-weight:600;">
        このブラウザで開いたグループ
      </div>

      <!-- 結果リスト -->
      <div v-if="pastEvents.length" style="margin-top:10px; display:flex; flex-direction:column; gap:12px;">
        <div v-for="ev in pastEvents" :key="ev.id" class="card">
          <div class="section">
            <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px;">
              <div class="small">作成日: {{ fmtDate(ev.created_at) }}</div>
              <button class="ghost" style="padding:2px 8px; font-size:13px;" @click="removeCard(ev)">×</button>
            </div>
            <h3 style="margin:0; white-space:normal; overflow-wrap:break-word;">
              {{ ev.title || 'セッション' }}
            </h3>
            <div class="small">{{ (ev.members ?? []).join('・') }}</div>
          </div>

          <!-- 合計 / 1人（SessionPageと同じ見た目ルール） -->
          <div class="settle-summary split2 badges" style="margin-top:12px;">
            <div class="col left">
              <span class="badge-circle total">計</span>
              <span class="amount total">{{ fmtJPY(ev.total) }}</span>
            </div>
            <div class="col right">
              <span class="badge-pill per">1人</span>
              <span class="amount per">{{ fmtJPY(ev.per) }}</span>
            </div>
          </div>

          <!-- ボタン2つ（横並び） -->
          <button class="btn-mini orange" style="width:100%; margin-top:10px;" @click="openSessionCard(ev)">イベントを見る</button>
          <button class="btn-mini blue"  style="width:100%; margin-top:10px;" @click="reuseMembers(ev)">同じメンバーを入力</button>
        </div>
      </div>

      <div v-else class="small" style="margin-top:8px;">
        まだ履歴はありません。グループを作成するか、共有されたリンクを開くとここに表示されます。
      </div>
    </div>
   </div>
</template>