<script setup>
import { onMounted, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createClient } from '@supabase/supabase-js'
import { saveHistoryEntry } from '../api/history'

const route = useRoute(); const router = useRouter()
const sessionId = route.params.id; const token = route.params.token

// token をヘッダに入れたクライアント（RLS用）
const db = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    global: { headers: { 'x-session-token': String(token) } },
    auth: { persistSession: false, autoRefreshToken: false }
  }
)

// 追加：セッションの情報を保持
const session = ref(null)     // { id, title, created_at }

const members = ref([])
const expenses = ref([])
const memo = ref(''); const amount = ref(null)
const payerId = ref(null); const selected = ref([])
const loading = ref(false)

async function loadAll() {
  // ① セッション情報を取得（title, created_at を取る）
  const { data: s, error: se } = await db
    .from('sessions')
    .select('id, title, created_at')
    .eq('id', sessionId).eq('token', token)
    .single()
  if (se || !s) { alert('セッションが見つかりません'); router.push('/'); return }
  session.value = s

  // ② メンバー
  const { data: m } = await db
    .from('members')
    .select('id,name,active')
    .eq('session_id', sessionId).eq('active', true).order('id')
  members.value = m ?? []
  if (members.value.length && payerId.value == null) payerId.value = members.value[0].id
  if (selected.value.length === 0) selected.value = members.value.map(x=>x.id)

  // ③ 出費
  const { data: e } = await db
    .from('expenses')
    .select('id,payer_member_id,amount_jpy,beneficiaries,memo,created_at')
    .eq('session_id', sessionId).order('id')
  expenses.value = (e ?? []).slice().sort((a, b) => {
    const da = new Date(a?.created_at ?? 0).getTime()
    const db = new Date(b?.created_at ?? 0).getTime()
    return db - da
  })

  // このブラウザの履歴に保存（トップページの「開いたグループ」一覧用）
  const total = expenses.value.reduce((sum, x) => sum + (x?.amount_jpy ?? 0), 0)
  const headcount = members.value.length || 1
  saveHistoryEntry({
    id: s.id,
    token,
    title: s.title,
    created_at: s.created_at,
    members: members.value.map(m => m.name),
    total,
    per: Math.floor(total / headcount)
  })
}

async function addExpense() {
  if (!amount.value || !payerId.value || selected.value.length === 0) {
    alert('入力が足りません'); return
  }

  const memoForSave = (() => {
    const t = (memo.value || '').trim()
    if (!t) return null
    return t.endsWith('代') ? t : t + '代'
  })()

  loading.value = true
  const { error } = await db.from('expenses').insert([{
    session_id: sessionId,
    payer_member_id: payerId.value,
    amount_jpy: amount.value,
    beneficiaries: selected.value,
    memo: memoForSave
  }])
  loading.value = false

  if (error) return alert(error.message)
  amount.value = null
  memo.value = ''
  await loadAll()   // RLS環境ではRealtime通知が届かないため、登録後に自前で再読込する
}

function computeBalances(expenses) {
  const b = {}

  for (const e of expenses) {
    const ids = (e.beneficiaries ?? []).slice().sort((a,b)=>a-b) // 決定的な順序
    const k = ids.length
    if (!k || !e.amount_jpy) continue

    // 基本シェアと余り
    const base = Math.floor(e.amount_jpy / k)
    let r = e.amount_jpy % k

    // まず支払者に全額プラス
    b[e.payer_member_id] = (b[e.payer_member_id] ?? 0) + e.amount_jpy

    // 受益者に課金（余りは先頭から +1 円ずつ配る）
    for (let i = 0; i < k; i++) {
      const id = ids[i]
      const add = base + (r > 0 ? 1 : 0)
      b[id] = (b[id] ?? 0) - add
      if (r > 0) r--
    }
  }

  // デバッグ: 合計が0になるか確認（ならないならどこかに欠損がある）
  // const sum = Object.values(b).reduce((s, v) => s + v, 0)
  // console.log('balance sum =', sum)

  return b
}
function settleGreedy(bal) {
  const P=[],N=[]; for (const [id,v] of Object.entries(bal)) {
    const n=Number(id); if (v>0) P.push({id:n,v}); else if (v<0) N.push({id:n,v:-v})
  } P.sort((a,b)=>b.v-a.v); N.sort((a,b)=>b.v-a.v)
  const edges=[]; let i=0,j=0; while (i<P.length&&j<N.length) {
    const x=Math.min(P[i].v,N[j].v); edges.push({from:N[j].id,to:P[i].id,amount:x})
    if ((P[i].v-=x)===0) i++; if ((N[j].v-=x)===0) j++
  } return edges
}
const balances = computed(()=>computeBalances(expenses.value))
const edges = computed(()=>settleGreedy(balances.value))
function nameOf(id){ return members.value.find(m=>m.id===id)?.name ?? `#${id}` }

//合計と一人当たり
const totalAmount = computed(()=>
  (expenses.value ??[]).reduce((sum,e)=>sum + (e?.amount_jpy ?? 0),0)
)
// active=trueの人数
const headcount = computed(() => (members.value ?? []).length)
const perPersonAmount = computed(() =>
  headcount.value > 0 ? Math.floor(totalAmount.value / headcount.value) : 0
)

const fmtJPY = (n) =>
  Number(n).toLocaleString('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 })

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) : ''

const initials = (full) => {
  const s = String(full ?? '').trim()
  if (!s) return '?'
  // 和文は先頭1文字、英字は先頭1～2文字（例: "Ishibashi Koutarou" -> "IK"）
  const ja = s[0]
  const en = s.split(/\s+/).map(w => w[0]).join('').slice(0,2)
  return /[^\x00-\x7F]/.test(s) ? ja : en
}

const createdLabel = computed(() => {
  const d = session.value?.created_at
  if (!d) return ''
  return new Date(d).toLocaleDateString('ja-JP', { year:'numeric', month:'short', day:'numeric' })
})

function copyLink(){ 
  const msg = `会計はここに全部つっこむように！！ 夜露死苦
  ${location.href}`
  navigator.clipboard.writeText(msg).then(()=>alert('コピー完了！すぐにLINEで共有！！')) 
}

// 旧実装は Supabase Realtime で他端末の変更も反映していたが、
// RLS(x-session-token ヘッダ方式)では WebSocket にヘッダが乗らず通知が許可されないため廃止。
// 自分の操作は addExpense 内の loadAll() で即時反映される。
onMounted(loadAll)

// ルート表示/個人表示のトグル
const showPersonal = ref(false)

// 個人ごとの負担額（受益者シェア合計）
const personalSpends = computed(() => {
  const map = new Map()
  for (const e of (expenses.value ?? [])) {
    if (!e?.beneficiaries?.length || !e.amount_jpy) continue
    const share = Math.floor(e.amount_jpy / e.beneficiaries.length)
    for (const bid of e.beneficiaries) {
      map.set(bid, (map.get(bid) || 0) + share)
    }
  }
  // メンバー全員を0込みで出す
  const rows = (members.value ?? []).map(m => ({
    id: m.id,
    amount: map.get(m.id) || 0
  }))
  // 金額降順
  rows.sort((a,b)=> b.amount - a.amount)
  return rows
})

</script>

<template>
  <main class="container" style="display:flex; flex-direction:column; gap:14px;">
    <!-- ここが新規：セッション名と作成日 -->
    <div class="card" v-if="session">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <div style="min-width:0">
          <div class="small">作成日: {{ createdLabel }}</div> <!-- 作成日 -->
          <h3 style="margin:0; display:flex; align-items:flex-start; gap:6px; white-space:normal; width: 100%; overflow-wrap: break-word;">
            <span style="flex:1 1 auto; overflow-wrap: break-word;">{{ session.title || 'セッション' }}</span>
            <!-- 編集ページへ遷移 -->
            <button class="icon-btn-quiet" @click="$router.push(`/s/${sessionId}/${token}/edit`)" title="編集">✏️</button>
          </h3>
          <div class="small"> {{ members.map(m => m.name).join('・') }} </div> <!-- メンバー一覧 -->
        </div>
        <div class="row" style="gap:8px; flex-shrink:0;">
          <button class="ghost" @click="copyLink">共有</button>
        </div>
      </div>
    </div>

    <div class="maincard">
      <!-- ① 文章UI：Xが Yの Z代を払って ¥A かかった -->
      <div class="sentence">

        <!-- 1行目：支払者 -->
        <select v-model.number="payerId" class="in-sent select">
          <option v-for="m in members" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
        <span class="in-sent">が</span>

        <!-- 改行（強制） -->
        <span class="br"></span>

        <!-- 2行目：受益者（メンバー選択のみ） -->
        <div class="in-sent chip-list tight">
          <label v-for="m in members" :key="m.id" class="chip small">
            <input type="checkbox" :value="m.id" v-model="selected" />
            <span>{{ m.name }}</span>
          </label>
        </div>

        <!-- 改行（強制） -->
        <span class="br"></span>

        <!-- 3行目：「の」から続く -->
        <span class="in-sent">の</span>

        <div class="in-sent input-suffix">
          <input v-model="memo" placeholder="夕食" class="in-sent input" />
          <span class="suffix">代</span>
        </div>

        <span class="in-sent">を払って</span>

        <div class="in-sent input-prefix">
          <span class="prefix">¥</span>
          <input type="number" v-model.number="amount" min="1" inputmode="numeric"
                placeholder="3000" class="in-sent input num" />
        </div>

        <span class="in-sent">かかった</span>
      </div>

      <div class="spacer"></div>

      <!-- 送信 -->
      <button class="btn-register big" :disabled="loading" @click="addExpense" style="width:100%;">登録する</button>
    </div>

    <div class="card card--frameless">
      <div class="section" style="display:flex; align-items:center; justify-content:space-between;">
        <h5 style="margin:0 0 6px;">清算ルート</h5>
        <button class="link-small" :class="{ active: showPersonal}" @click="showPersonal = !showPersonal">
          個人
        </button>
      </div>
      <div v-if="showPersonal">
        <div v-if="personalSpends.length === 0" class="small">立て替え履歴がありません</div>
        <ul v-else class="list routes">
          <li v-for="p in personalSpends" :key="p.id" class="route-row">
            <span class="route-who"><b>{{ nameOf(p.id) }}</b></span>
            <span class="route-amt">{{ fmtJPY(p.amount) }}</span>
          </li>
        </ul>
      </div>
      <div v-else>
        <div v-if="edges.length === 0" class="small">清算は不要です</div>
        <ul v-else class="list routes">
          <li v-for="(e,i) in edges" :key="i" class="route-row">
            <span class="route-who">
              <b>{{ nameOf(e.from) }}</b> → <b>{{ nameOf(e.to) }}</b>
            </span>
            <span class="route-amt">{{ fmtJPY(e.amount) }}</span>
          </li>
        </ul>
        
        <div class="settle-summary split2 badges">
          <div class="col left">
            <!-- <span class="label">合計</span> -->
            <span class="badge-circle total">計</span>
            <span class="amount total">{{ fmtJPY(totalAmount) }}</span>
          </div>
          <div class="col right">
            <!-- <span class="label">一人当たり</span> -->
            <span class="badge-pill per">1人</span>
            <span class="amount per">{{ fmtJPY(perPersonAmount) }}</span>
          </div>
        </div>
      </div>
      
    </div>

    <div class="card card--frameless">
      <div class="section">
        <h5 style="margin:0 0 6px;">立て替え履歴</h5>
      </div>
      <ul class="expense-cards">
      <li v-for="(e,i) in expenses" :key="e.id ?? i" class="expense-item">
        <div class="left">
          <div class="title-row">
            <b class="title">
                {{ e.memo ?? '（無題）' }}
            </b>
            <button class="icon-btn-quiet"
              @click="e?.id ? $router.push(`/s/${sessionId}/${token}/expense/${e.id}/edit`) : alert('この履歴は編集できません')"
              title="編集"
            >✏️</button>
          </div>

          <div class="meta">
            {{ nameOf(e.payer_member_id) }} が立て替え（{{ fmtDate(e.created_at) }}）
          </div>

          <div class="chips">
            <span class="mini-chip" v-for="bid in e.beneficiaries" :key="bid">
              {{ initials(nameOf(bid)) }}
            </span>
          </div>
        </div>

        <div class="right amount">{{ fmtJPY(e.amount_jpy) }}</div>
      </li>
    </ul>
    </div>
  </main>
</template>
