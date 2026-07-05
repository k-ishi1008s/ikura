// router.js
import { createRouter, createWebHistory } from 'vue-router'
import SessionCreatePage from './pages/SessionCreatePage.vue'
import SessionPage from './pages/SessionPage.vue'
import MemberEditPage from './pages/MemberEditPage.vue'
import ExpenseEditPage from './pages/ExpenseEditPage.vue'
import TokushohoPage from './pages/legal/TokushohoPage.vue'
import PrivacyPage from './pages/legal/PrivacyPage.vue'
import TermsPage from './pages/legal/TermsPage.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: SessionCreatePage },
    { path: '/s/:id/:token', component: SessionPage, name: 'session' },
    { path: '/s/:id/:token/edit', component: MemberEditPage, name: 'member-edit' },
    {
      path: '/s/:id/:token/expense/:expId/edit',
      component: ExpenseEditPage,
      name: 'expense-edit'
    },
    { path: '/legal/tokushoho', component: TokushohoPage, name: 'tokushoho' },
    { path: '/legal/privacy', component: PrivacyPage, name: 'privacy' },
    { path: '/legal/terms', component: TermsPage, name: 'terms' }
  ]
})