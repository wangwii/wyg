<script setup lang="ts">
const image = (prompt: string, size: string) =>
  `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${encodeURIComponent(prompt)}&image_size=${size}`

const heroImage = image(
  'Through sheer translucent crimson silk curtain, a Chinese classical dancer in half silhouette — candlelight catches only the curve of shoulder and neck, long black hairpin catching the light, drifting incense, one silk sleeve flowing down, deep chiaroscuro, cinematic, 16:9, moody, film grain',
  'landscape_16_9'
)

const works = [
  {
    no: '壹',
    title: '绛衣',
    en: 'Crimson Robe',
    type: '独舞影像',
    year: '2026',
    desc: '长袖垂落如夜，红在镜头里一点点烧起来。',
    alt: '绛红长袖的古典舞者在暗场中回身，衣料被逆光穿透',
    ratio: 'aspect-[4/5]',
    span: 'lg:col-span-7',
    offset: '',
    src: image(
      'Chinese classical dancer in flowing crimson long sleeves, backlit by warm haze on a dark stage, fabric in motion, gold hairpin, theatrical smoke, cinematic film still',
      'portrait_4_3'
    )
  },
  {
    no: '贰',
    title: '焚香',
    en: 'Incense',
    type: '戏曲短章',
    year: '2025',
    desc: '一炷香的时间里，所有欲望都放轻了声音。',
    alt: '黑漆案上的折扇、胭脂与袅袅香烟，烛光下的静物',
    ratio: 'aspect-square',
    span: 'lg:col-span-5',
    offset: 'lg:mt-28',
    src: image(
      'Antique Chinese folding fan with gold leaf and crimson silk tassel on black lacquer table, burning incense, curling smoke, plum blossom branch, candlelight, luxurious still life, macro',
      'square_hd'
    )
  },
  {
    no: '叁',
    title: '夜宴',
    en: 'Night Banquet',
    type: '舞台组照',
    year: '2025',
    desc: '帐幔、灯火与未散的香气，构成一场漫长的夜。',
    alt: '朱红帐幔与金色雕花的戏曲舞台，灯笼暖光与香烟',
    ratio: 'aspect-[16/10]',
    span: 'lg:col-span-7',
    offset: '',
    src: image(
      'Chinese opera stage at night with vermilion curtains, warm lantern glow, ornate gold carved wood, incense haze, empty stage, dramatic cinematic wide shot',
      'landscape_16_9'
    )
  },
  {
    no: '肆',
    title: '朱砂',
    en: 'Cinnabar',
    type: '静物装置',
    year: '2024',
    desc: '铜镜、胭脂与金簪，替一个不肯开口的人说话。',
    alt: '古铜镜、朱砂胭脂盒与金簪置于暗色丝绸之上',
    ratio: 'aspect-square',
    span: 'lg:col-span-5',
    offset: 'lg:mt-20',
    src: image(
      'Antique bronze mirror, vermilion rouge compact, gold hairpin and crimson silk ribbon on dark silk fabric, candlelight, oriental luxury still life, moody shadows',
      'square_hd'
    )
  },
  {
    no: '伍',
    title: '残照',
    en: 'Afterglow',
    type: '水墨实验',
    year: '2024',
    desc: '把最后一抹红留在宣纸上，让它自己熄灭。',
    alt: '旧绢上的水墨山水，一轮朱红落日与金色印章',
    ratio: 'aspect-[21/9]',
    span: 'lg:col-span-12',
    offset: '',
    src: image(
      'Traditional Chinese ink wash landscape on aged silk scroll, single crimson sun, misty mountains, gold seal stamp, dark background, minimal oriental art',
      'landscape_16_9'
    )
  }
]

const portrait = image(
  'Portrait of a Chinese classical performer seated in a dim candlelit room, crimson silk robe, gold hairpin, half of the face in shadow, sultry mysterious mood, cinematic lighting, film grain',
  'portrait_4_3'
)

const shows = [
  { date: '2027.03.21', city: '上海', title: '夜宴 · 未央专场', venue: '兰心大戏院', status: '余席' },
  { date: '2027.05.09', city: '杭州', title: '焚香 · 双人篇', venue: '天目里剧场', status: '已满' },
  { date: '2027.09.18', city: '北京', title: '朱砂 · 独舞', venue: '蓬蒿剧场', status: '预售' },
  { date: '2027.11.30', city: '成都', title: '残照 · 影像现场', venue: '东郊记忆', status: '余席' }
]

let observer: IntersectionObserver | undefined

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'))
  nodes.forEach(node => node.classList.add('reveal'))

  observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return
      entry.target.classList.add('is-visible')
      observer?.unobserve(entry.target)
    })
  }, { threshold: 0.08, rootMargin: '0px 0px -10% 0px' })

  nodes.forEach(node => observer?.observe(node))
})

onBeforeUnmount(() => {
  observer?.disconnect()
})
</script>

<template>
  <div>
    <!-- 卷首 -->
    <section
      id="top"
      class="hero"
    >
      <div
        class="hero-media"
        aria-hidden="true"
      >
        <img
          :src="heroImage"
          alt=""
          fetchpriority="high"
        >
      </div>
      <div
        class="hero-veil"
        aria-hidden="true"
      />
      <div
        class="hero-glow"
        aria-hidden="true"
      />

      <!-- 烛光光锥扫动 -->
      <div
        class="hero-beam"
        aria-hidden="true"
      />

      <!-- 水袖曲线：金线沿身体轮廓弯曲，古典+性感 -->
      <svg
        class="hero-sleeve"
        viewBox="0 0 400 800"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M320,20 C280,180 160,260 180,420 C200,580 340,640 310,780"
          fill="none"
          stroke="url(#gold-line)"
          stroke-width="1.2"
          stroke-linecap="round"
        />
        <defs>
          <linearGradient
            id="gold-line"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop
              offset="0%"
              stop-color="#D9B878"
              stop-opacity="0.05"
            />
            <stop
              offset="25%"
              stop-color="#E7CD9C"
              stop-opacity="0.9"
            />
            <stop
              offset="55%"
              stop-color="#C69C55"
              stop-opacity="0.75"
            />
            <stop
              offset="85%"
              stop-color="#D9B878"
              stop-opacity="0.85"
            />
            <stop
              offset="100%"
              stop-color="#D9B878"
              stop-opacity="0.08"
            />
          </linearGradient>
        </defs>
      </svg>

      <!-- 残卷：温庭筠艳诗半开 -->
      <div
        class="hero-scroll"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 28 280"
          width="28"
          height="280"
        >
          <path
            d="M14,2 L22,5 Q24,8 22,12 L22,268 Q24,272 22,275 L14,278 L6,275 Q4,272 6,268 L6,12 Q4,8 6,5 Z"
            fill="rgba(230,215,188,0.88)"
          />
          <path
            d="M14,4 L20,6.5 Q21.5,9.5 20,12 L20,268 Q21.5,270.5 20,273.5 L14,276"
            fill="none"
            stroke="rgba(120,40,40,0.18)"
            stroke-width="0.3"
          />
          <!-- 卷头轴心 -->
          <circle
            cx="14"
            cy="3"
            r="1.8"
            fill="rgba(90,30,30,0.85)"
          />
          <circle
            cx="14"
            cy="277"
            r="1.8"
            fill="rgba(90,30,30,0.85)"
          />
        </svg>
        <div class="hero-scroll-text">
          <span>小山重叠金明灭</span>
          <span>鬓云欲度香腮雪</span>
          <span>懒起画蛾眉</span>
          <span>弄妆梳洗迟</span>
        </div>
      </div>

      <!-- 凤钗（CSS 绘制） -->
      <div
        class="hero-hairpin"
        aria-hidden="true"
      >
        <span class="hero-hairpin-shaft" />
        <span class="hero-hairpin-head" />
        <span class="hero-hairpin-drop" />
      </div>

      <!-- 飘动花瓣（5 片，纯 CSS） -->
      <span
        v-for="n in 5"
        :key="n"
        class="hero-petal"
        :style="{ '--delay': `${n * 1.8}s`, '--left': `${8 + n * 18}%`, '--dur': `${26 + n * 4}s` }"
      />

      <div
        class="hero-frame"
        aria-hidden="true"
      >
        <span /><span /><span /><span />
      </div>

      <div class="container-edge hero-inner">
        <div class="hero-copy">
          <p class="eyebrow">
            古典舞 · 戏曲意象 · 东方影像
          </p>
          <p class="hero-lede">
            一袭绛衣，半卷旧梦。<br>
            在烛影与丝弦之间，把东方的烈与柔，<br class="hidden sm:block">
            演成一场不肯醒来的夜。
          </p>
          <div class="hero-actions">
            <a
              href="#works"
              class="btn btn-primary"
            >入卷<span aria-hidden="true">↓</span></a>
            <a
              href="#contact"
              class="btn btn-ghost"
            >邀约</a>
          </div>
        </div>

        <div class="hero-title-wrap">
          <h1 class="hero-title">
            未央
          </h1>
          <p class="hero-vertical">
            烛影摇红 · 丝弦未歇
          </p>
        </div>
      </div>

      <a
        href="#preface"
        class="hero-scroll"
      >
        <span>卷一 · 序</span>
        <span
          class="scroll-line"
          aria-hidden="true"
        />
      </a>
    </section>

    <!-- 卷一 · 序 -->
    <section
      id="preface"
      class="section preface"
    >
      <div class="container-edge">
        <div
          class="section-head"
          data-reveal
        >
          <div>
            <p class="section-kicker">
              卷一
            </p>
            <h2 class="section-title">
              序
            </h2>
          </div>
          <p class="section-desc">
            一场关于红、关于夜、关于不肯低头的柔的独白。
          </p>
        </div>

        <div class="preface-grid">
          <blockquote
            class="preface-quote"
            data-reveal
          >
            「她不是在跳舞，<br>
            她是在把一场夜，<br>
            一寸一寸地烧尽。」
            <footer>—— 观众手记</footer>
          </blockquote>

          <div
            class="preface-body"
            data-reveal
          >
            <p>
              未央以古典舞与戏曲身段为骨，以胭脂、烛火与旧绢为色。作品在舞台与影像之间游走，
              收集那些被时间磨得发亮的东方瞬间——烈而不俗，艳而不轻。
            </p>
            <p>
              她相信美从来不是温顺的。它需要一点冒犯：把太浓的颜色、太慢的呼吸、太旧的梦，
              直接推到人眼前。
            </p>
            <ul class="facts">
              <li>
                <span>作品</span>
                <strong>12</strong>
              </li>
              <li>
                <span>场次</span>
                <strong>38</strong>
              </li>
              <li>
                <span>城市</span>
                <strong>09</strong>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- 卷二 · 作品 -->
    <section
      id="works"
      class="section works"
    >
      <div class="container-edge">
        <div
          class="section-head"
          data-reveal
        >
          <div>
            <p class="section-kicker">
              卷二
            </p>
            <h2 class="section-title">
              作品选
            </h2>
          </div>
          <p class="section-desc">
            五则影像与舞台片段。光影是新的水袖，镜头是新的戏台。
          </p>
        </div>

        <div class="works-grid">
          <article
            v-for="work in works"
            :key="work.title"
            class="work"
            :class="[work.span, work.offset]"
            data-reveal
          >
            <div
              class="work-media"
              :class="work.ratio"
            >
              <img
                :src="work.src"
                :alt="work.alt"
                loading="lazy"
              >
              <span
                class="work-frame"
                aria-hidden="true"
              />
              <span
                class="work-no"
                aria-hidden="true"
              >{{ work.no }}</span>
            </div>
            <div class="work-caption">
              <div>
                <h3>
                  {{ work.title }}
                  <em>{{ work.en }}</em>
                </h3>
                <p>{{ work.desc }}</p>
              </div>
              <p class="work-meta">
                <span>{{ work.type }}</span>
                <span>·</span>
                <span>{{ work.year }}</span>
              </p>
            </div>
          </article>
        </div>
      </div>
    </section>

    <!-- 卷三 · 自述 -->
    <section
      id="about"
      class="section about"
    >
      <div class="container-edge about-grid">
        <div
          class="about-media"
          data-reveal
        >
          <img
            :src="portrait"
            alt="烛光房间中身着绛红长衫的古典舞者肖像"
            loading="lazy"
          >
          <span class="about-seal">
            <BrandSeal
              size="lg"
              tilt
            />
          </span>
        </div>

        <div
          class="about-copy"
          data-reveal
        >
          <div>
            <p class="section-kicker">
              卷三
            </p>
            <h2 class="section-title">
              自述
            </h2>
          </div>
          <p>
            生于江南，长在戏台边。十岁习舞，二十岁以后，开始用身体写东方的叙事：
            不急，不解释，只把情绪推到最满。
          </p>
          <p>
            近年在剧场、时装与影像之间往返，让古典的身体出现在本不属于它的地方——
            霓虹下、镜面前、无人经过的长廊里。因为她始终觉得，传统不是被供起来的，
            而是被重新点燃的。
          </p>
          <dl class="about-meta">
            <div>
              <dt>现居</dt>
              <dd>上海</dd>
            </div>
            <div>
              <dt>媒介</dt>
              <dd>舞台 · 影像 · 装置</dd>
            </div>
            <div>
              <dt>合作</dt>
              <dd>剧场 / 时装 / 美术馆</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>

    <!-- 卷四 · 场次 -->
    <section
      id="stage"
      class="section stage"
    >
      <div class="container-edge">
        <div
          class="section-head"
          data-reveal
        >
          <div>
            <p class="section-kicker">
              卷四
            </p>
            <h2 class="section-title">
              场次
            </h2>
          </div>
          <p class="section-desc">
            巡演 · 二〇二七。更多场次仍在筹划，也接受专场邀约。
          </p>
        </div>

        <ul
          class="stage-list"
          data-reveal
        >
          <li
            v-for="show in shows"
            :key="show.date"
            class="stage-row"
          >
            <span class="stage-date">{{ show.date }}</span>
            <span class="stage-city">{{ show.city }}</span>
            <span class="stage-title">
              {{ show.title }}
              <em>{{ show.venue }}</em>
            </span>
            <span
              class="stage-status"
              :data-status="show.status"
            >{{ show.status }}</span>
          </li>
        </ul>

        <p
          class="stage-note"
          data-reveal
        >
          ※ 演出前四十分钟开放入场，建议着深色衣物，便于入戏。
        </p>
      </div>
    </section>

    <!-- 卷五 · 联络 -->
    <section
      id="contact"
      class="section contact"
    >
      <div
        class="container-edge contact-inner"
        data-reveal
      >
        <p class="eyebrow">
          卷五 · 联络
        </p>
        <h2 class="contact-title">
          若有一场夜，<br>
          值得为东方而燃。
        </h2>
        <p class="contact-sub">
          演出邀约 · 影像合作 · 品牌共创
        </p>
        <a
          href="mailto:studio@jiangxue.art"
          class="mail-link"
        >studio@jiangxue.art</a>
        <span class="contact-seal">
          <BrandSeal
            size="md"
            tilt
          />
        </span>
      </div>
    </section>
  </div>
</template>
