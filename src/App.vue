<template>
  <header class="header">
    <div class="brand">
      <div class="brand-logo"></div>
      <div class="brand-name">ikura</div>
      <div style="margin-left:auto; display:flex; gap:8px;">
        <router-link to="/" style="text-decoration:none;">
          <button class="ghost">新しいイベント</button>
        </router-link>
      </div>
    </div>
  </header>
  <router-view />
  <footer class="site-footer">
    <router-link to="/legal/terms">利用規約</router-link>
    <router-link to="/legal/privacy">プライバシーポリシー</router-link>
    <router-link to="/legal/tokushoho">特定商取引法に基づく表記</router-link>
  </footer>
</template>