<script setup lang="ts">
withDefaults(defineProps<{
  size?: 'sm' | 'md' | 'lg'
  tilt?: boolean
}>(), {
  size: 'md',
  tilt: false
})
</script>

<template>
  <span
    class="seal"
    :class="[size === 'sm' ? 'seal--sm' : size === 'lg' ? 'seal--lg' : 'seal--md', { 'seal--tilt': tilt }]"
    aria-hidden="true"
  >
    未央
  </span>
</template>
