<script setup lang="ts">
const navItems = [
  { label: '卷首', href: '#top' },
  { label: '作品', href: '#works' },
  { label: '自述', href: '#about' },
  { label: '场次', href: '#stage' },
  { label: '联络', href: '#contact' }
]

const year = new Date().getFullYear()
const scrolled = ref(false)
const menuOpen = ref(false)

const onScroll = () => {
  scrolled.value = window.scrollY > 24
}

onMounted(() => {
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  document.body.style.overflow = ''
})

watch(menuOpen, (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
})

useHead({
  htmlAttrs: {
    lang: 'zh-CN',
    class: 'dark'
  },
  link: [
    { rel: 'icon', href: '/wyg/favicon.ico' }
  ]
})

const title = '未央 · 古典舞与东方影像作品集'
const description = '未央，古典舞者与影像创作者。以古典舞、戏曲身段与东方影像，在红与夜之间，书写热烈而妖冶的东方叙事。'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  ogType: 'website',
  twitterCard: 'summary_large_image'
})
</script>

<template>
  <UApp>
    <a
      class="skip-link"
      href="#works"
    >跳到作品</a>

    <header
      class="site-header"
      :class="{ 'is-scrolled': scrolled }"
    >
      <div class="container-edge flex h-20 items-center justify-between gap-6">
        <NuxtLink
          to="/"
          class="brand"
          aria-label="未央 · 返回首页"
        >
          <BrandSeal size="sm" />
          <span class="brand-word">
            未央
            <small>WEIYANG</small>
          </span>
        </NuxtLink>

        <nav
          class="hidden items-center gap-9 md:flex"
          aria-label="主导航"
        >
          <a
            v-for="item in navItems"
            :key="item.href"
            :href="item.href"
            class="nav-link"
          >
            {{ item.label }}
          </a>
        </nav>

        <div class="flex items-center gap-3">
          <a
            href="#contact"
            class="btn btn-ghost hidden px-6 py-2.5 md:inline-flex"
          >邀约</a>
          <button
            type="button"
            class="menu-button md:hidden"
            :class="{ 'menu-open': menuOpen }"
            :aria-expanded="menuOpen"
            aria-controls="mobile-nav"
            aria-label="打开导航菜单"
            @click="menuOpen = !menuOpen"
          >
            <span class="menu-line" />
            <span class="menu-line" />
          </button>
        </div>
      </div>
    </header>

    <Transition name="menu">
      <div
        v-if="menuOpen"
        id="mobile-nav"
        class="fixed inset-x-0 top-20 bottom-0 z-40 overflow-y-auto border-t border-gold-400/15 bg-ink-950/95 px-6 pt-4 pb-10 backdrop-blur-xl md:hidden"
      >
        <nav
          class="flex flex-col"
          aria-label="移动导航"
        >
          <a
            v-for="(item, index) in navItems"
            :key="item.href"
            :href="item.href"
            class="flex items-center justify-between border-b border-gold-400/15 py-5 text-lg tracking-[0.32em] text-ink-100 transition-colors hover:text-gold-300"
            @click="menuOpen = false"
          >
            <span>{{ item.label }}</span>
            <span class="font-display text-xs tracking-[0.3em] text-gold-500/70">
              {{ String(index + 1).padStart(2, '0') }}
            </span>
          </a>
        </nav>
        <a
          href="#contact"
          class="btn btn-primary mt-8 w-full"
          @click="menuOpen = false"
        >邀约 · 来信</a>
      </div>
    </Transition>

    <main id="main">
      <NuxtPage />
    </main>

    <footer class="site-footer">
      <div class="container-edge">
        <div class="footer-grid">
          <div class="footer-brand">
            <NuxtLink
              to="/"
              class="brand"
              aria-label="未央 · 返回首页"
            >
              <BrandSeal
                size="md"
                tilt
              />
              <span class="brand-word">
                未央
                <small>WEIYANG</small>
              </span>
            </NuxtLink>
            <p>古典舞者 · 影像创作者。以身体书写东方，在红与夜之间，寻找不肯熄灭的美。</p>
          </div>

          <div class="footer-col">
            <h4>目录</h4>
            <a
              v-for="item in navItems"
              :key="item.href"
              :href="item.href"
            >{{ item.label }}</a>
          </div>

          <div class="footer-col">
            <h4>联络</h4>
            <a href="mailto:studio@jiangxue.art">studio@jiangxue.art</a>
            <a href="#contact">演出邀约</a>
            <a href="#contact">影像合作</a>
          </div>
        </div>

        <div class="footer-bottom">
          <p>© {{ year }} 未央工作室 · WEIYANG STUDIO</p>
          <p>本站视觉为概念作品</p>
        </div>
      </div>
    </footer>
  </UApp>
</template>
