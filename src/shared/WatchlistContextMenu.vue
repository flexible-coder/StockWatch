<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  open: boolean;
  x: number;
  y: number;
  groups: string[];
  currentGroup: string;
  canMoveTop: boolean;
  canMoveBottom: boolean;
}>();

const emit = defineEmits<{
  top: [];
  bottom: [];
  editNote: [];
  moveGroup: [group: string];
  remove: [];
}>();

const menuStyle = computed(() => ({
  left: `${props.x}px`,
  top: `${props.y}px`,
}));
</script>

<template>
  <div v-if="open" class="watchlist-context-menu" :style="menuStyle">
    <button type="button" :disabled="!canMoveTop" @click="emit('top')">
      置顶
    </button>
    <button type="button" :disabled="!canMoveBottom" @click="emit('bottom')">
      置底
    </button>
    <div class="context-divider"></div>
    <button type="button" @click="emit('editNote')">编辑备注</button>
    <div class="context-section">
      <span>移动到分组</span>
      <button
        v-for="group in groups"
        :key="group"
        type="button"
        :disabled="group === currentGroup"
        @click="emit('moveGroup', group)"
      >
        {{ group }}
      </button>
    </div>
    <div class="context-divider"></div>
    <button type="button" class="danger" @click="emit('remove')">
      删除自选
    </button>
  </div>
</template>

<style scoped>
.watchlist-context-menu {
  position: fixed;
  z-index: 10000;
  min-width: 136px;
  max-width: 180px;
  padding: 6px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.16);
}

.watchlist-context-menu button {
  width: 100%;
  min-height: 30px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #111827;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  text-align: left;
}

.watchlist-context-menu button:hover:not(:disabled) {
  background: #f3f4f6;
}

.watchlist-context-menu button:disabled {
  color: #cbd5e1;
  cursor: default;
}

.watchlist-context-menu .danger {
  color: #dc2626;
}

.watchlist-context-menu .danger:hover {
  background: #fef2f2;
}

.context-section {
  padding: 3px 0;
}

.context-section span {
  display: block;
  padding: 4px 10px;
  color: #94a3b8;
  font-size: 11px;
}

.context-divider {
  height: 1px;
  margin: 5px 4px;
  background: #eef2f7;
}
</style>
