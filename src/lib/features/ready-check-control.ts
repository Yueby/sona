/**
 * 允许接受对局后再拒绝
 *
 * 解禁 ReadyCheck 的接受/拒绝按钮，让玩家在已响应后仍能改变主意，且与"自动接受"不冲突。
 *
 * 设计要点：
 *   1. 状态来源——监听 /lol-matchmaking/v1/ready-check（LcuEventUri.READY_CHECK）ws 事件，
 *      读取 playerResponse（None/Accepted/Declined），即状态机上的 ready-check-data-player-response。
 *   2. 定向解禁——已接受(Accepted)只放开"拒绝"，已拒绝(Declined)只放开"接受"，
 *      未响应(None)保持原生（两个本就可点），避免"两个同时亮"的尴尬。
 *   3. 触发方式——纯事件驱动：READY_CHECK 事件在 15s 内每秒推送，每次推送都按最新状态解禁，
 *      不依赖 DOM 变化（置灰是 attribute/shadowRoot 变化，MutationObserver 时序不稳易漏触发）；
 *      正式进入 ChampSelect（或离开 ReadyCheck）即清理。
 *   4. 点击接管——按钮原生 handler 在已响应后不再处理点击，故给两个按钮各补一个 click，
 *      直接调用 lcu.acceptMatch()/declineMatch()，并通知自动接受模块（拒绝暂停、接受恢复）。
 */

import { logger } from '@/index'
import { lcu, LcuEventUri } from '@/lib/lcu'
import type { ReadyCheck, LCUEventMessage, GameflowPhase } from '@/lib/lcu'
import { notifyUserManuallyAccepted, notifyUserManuallyDeclined } from '@/lib/features/auto-accept'

const BUTTONS_CONTAINER_SELECTOR = '.ready-check-buttons-element'
const ACCEPT_BUTTON_SELECTOR = '.ready-check-button-accept'
const DECLINE_BUTTON_SELECTOR = '.ready-check-button-decline'
/** shadowRoot 内需要解禁的元素 */
const SHADOW_BUTTON_SELECTOR = '.lol-uikit-flat-button-wrapper, .lol-uikit-flat-button'
/** 已绑定点击事件的标记，避免重复绑定 */
const CLICK_BOUND_ATTR = 'data-sona-readycheck-bound'

type PlayerResponse = ReadyCheck['playerResponse']

/** 当前玩家在本次 ReadyCheck 的响应，决定解禁哪个按钮 */
let currentResponse: PlayerResponse = 'None'
/** gameflow 阶段订阅（离开 ReadyCheck 时清理） */
let phaseUnsub: (() => void) | null = null
/** ready-check 状态订阅（事件驱动：更新 playerResponse 并解禁） */
let readyCheckUnsub: (() => void) | null = null

// ==================== 定向解禁 ====================

/** 解禁单个按钮：移除 light DOM 的 *-disabled 与 shadowRoot 内的 .disabled，返回移除数量 */
function unlockButton(container: Element, target: 'accept' | 'decline'): number {
  const el = container.querySelector(target === 'accept' ? ACCEPT_BUTTON_SELECTOR : DECLINE_BUTTON_SELECTOR)
  if (!el) return 0

  let removed = 0

  // light DOM：移除形如 ready-check-button-xxx-disabled 的灰态 class
  Array.from(el.classList).forEach((cls) => {
    if (cls.endsWith('-disabled')) {
      el.classList.remove(cls)
      removed++
    }
  })

  // shadowRoot：移除 wrapper / button 上的 disabled
  el.querySelectorAll('lol-uikit-flat-button').forEach((host) => {
    const root = (host as HTMLElement).shadowRoot
    if (!root) return
    root.querySelectorAll(SHADOW_BUTTON_SELECTOR).forEach((b) => {
      if (b.classList.contains('disabled')) {
        b.classList.remove('disabled')
        removed++
      }
    })
  })

  return removed
}

/**
 * 根据当前响应解禁"相反"的按钮：
 *   - 已接受 → 放开拒绝按钮
 *   - 已拒绝 → 放开接受按钮
 *   - 未响应 → 保持原生（不干预）
 */
function applyUnlock() {
  const container = document.querySelector(BUTTONS_CONTAINER_SELECTOR)
  if (!container) return

  if (currentResponse === 'Accepted') {
    unlockButton(container, 'decline')
  } else if (currentResponse === 'Declined') {
    unlockButton(container, 'accept')
  }
}

// ==================== 点击事件接管 ====================

/** 记录已绑定的元素与 handler，停止时统一解绑 */
const boundClicks: Array<{ el: Element; handler: EventListener }> = []

function bindClickHandler(el: Element | null, kind: 'accept' | 'decline') {
  if (!el || el.hasAttribute(CLICK_BOUND_ATTR)) return
  el.setAttribute(CLICK_BOUND_ATTR, 'true')

  const handler: EventListener = () => {
    // 先通知自动接受：玩家手动操作优先，拒绝则暂停、接受则恢复自动接受
    if (kind === 'accept') {
      notifyUserManuallyAccepted()
    } else {
      notifyUserManuallyDeclined()
    }

    // 不拦截默认/冒泡，让原生逻辑（若仍有效）照常运行，我们只额外补一刀
    const action = kind === 'accept' ? lcu.acceptMatch() : lcu.declineMatch()
    action
      .then(() => logger.info('[ReadyCheckControl] 已主动%s对局 ✓', kind === 'accept' ? '接受' : '拒绝'))
      .catch((err) => logger.error('[ReadyCheckControl] %s 调用失败:', kind, err))
  }

  el.addEventListener('click', handler)
  boundClicks.push({ el, handler })
}

function bindClickHandlers(container: Element) {
  bindClickHandler(container.querySelector(ACCEPT_BUTTON_SELECTOR), 'accept')
  bindClickHandler(container.querySelector(DECLINE_BUTTON_SELECTOR), 'decline')
}

function unbindClickHandlers() {
  for (const { el, handler } of boundClicks) {
    el.removeEventListener('click', handler)
    el.removeAttribute(CLICK_BOUND_ATTR)
  }
  boundClicks.length = 0
}

// ==================== 触发与清理 ====================

/**
 * 确保接受/拒绝按钮已接管点击（幂等）。
 * 这是与"解禁"完全独立的职责——只负责绑定点击转发到 LCU 接口，
 * 不参与、也不触发任何解禁逻辑。
 */
function ensureClickHandlers() {
  const container = document.querySelector(BUTTONS_CONTAINER_SELECTOR)
  if (!container) return
  bindClickHandlers(container)
}

/** 离开 ReadyCheck（进入 ChampSelect 等）时清理：解绑点击、重置状态 */
function cleanup() {
  unbindClickHandlers()
  currentResponse = 'None'
}

// ==================== 生命周期 ====================

let registered = false

export function updateAllowDeclineAfterAccept(enabled: boolean) {
  if (enabled && !registered) {
    registered = true
    currentResponse = 'None'

    // ready-check 状态事件（15s 内每秒推送）：纯事件驱动，更新响应 + 解禁 + 接管点击
    readyCheckUnsub = lcu.observe(LcuEventUri.READY_CHECK, (event: LCUEventMessage) => {
      const rc = event.data as ReadyCheck | null
      const next = rc?.playerResponse ?? 'None'
      if (next !== currentResponse) {
        currentResponse = next
        logger.info('[ReadyCheckControl] 玩家响应状态变化 → %s', currentResponse)
      }
      ensureClickHandlers()
      applyUnlock()
    })

    // gameflow 阶段：正式进入 ChampSelect 等（离开 ReadyCheck）即清理
    phaseUnsub = lcu.observe(LcuEventUri.GAMEFLOW_PHASE_CHANGE, (event: LCUEventMessage) => {
      const phase = event.data as GameflowPhase
      if (phase !== 'ReadyCheck') {
        cleanup()
      }
    })

    logger.info('Allow decline after accept enabled ✓')
  } else if (!enabled && registered) {
    registered = false
    if (phaseUnsub) {
      phaseUnsub()
      phaseUnsub = null
    }
    if (readyCheckUnsub) {
      readyCheckUnsub()
      readyCheckUnsub = null
    }
    cleanup()
    logger.info('Allow decline after accept disabled')
  }
}
