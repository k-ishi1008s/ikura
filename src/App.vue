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
</template>