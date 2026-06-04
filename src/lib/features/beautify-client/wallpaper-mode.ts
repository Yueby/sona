import { injector } from '@/lib/InjectorManager'
import type { BeautifyGlassConfig } from '@/lib/features/beautify-client/social-sidebar-glass'

const ACTIVITY_CENTER_SELECTOR = 'section#activity-center'
const ACTIVITY_SCREEN_SELECTOR = 'div.screen-root[data-screen-name="rcp-fe-lol-activity-center"]'
const SIDEBAR_SELECTOR = 'section.rcp-fe-viewport-sidebar'
/** 模式选择 / 大厅场景的背景切换器，内部 img 会盖住我们的壁纸，需要清空其 src */
const BG_SWITCHER_SELECTOR = '.bg-current.uikit-background-switcher'
/** 需要清空内部 img src 的所有背景切换器（含生涯背景切换器） */
const IMG_CLEAR_SELECTORS = [
  BG_SWITCHER_SELECTOR,
  '.style-profile-background-image.uikit-background-switcher',
].join(', ')
const WALLPAPER_STYLE_ID = 'sona-wallpaper-mode-style'

let glassConfig: BeautifyGlassConfig = {
  blur: 14,
  opacity: 28,
}
/** 模式选择 / 大厅场景背景切换器的毛玻璃参数 */
let sceneConfig: BeautifyGlassConfig = {
  blur: 0,
  opacity: 0,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function ensureWallpaperModeStyle() {
  let style = document.getElementById(WALLPAPER_STYLE_ID)
  if (!style) {
    style = document.createElement('style')
    style.id = WALLPAPER_STYLE_ID
    document.head.appendChild(style)
  }

  const blur = clamp(glassConfig.blur, 0, 40)
  const opacity = clamp(glassConfig.opacity, 0, 100) / 100
  const sceneBlurPx = clamp(sceneConfig.blur, 0, 40)
  const sceneOpacity = clamp(sceneConfig.opacity, 0, 100) / 100

  style.textContent = `
    ${ACTIVITY_CENTER_SELECTOR} {
      display: none !important;
    }

    ${ACTIVITY_SCREEN_SELECTOR} {
      opacity: 0 !important;
    }

    ${SIDEBAR_SELECTOR} {
      background: rgba(1, 10, 19, ${opacity}) !important;
      backdrop-filter: blur(${blur}px) !important;
      -webkit-backdrop-filter: blur(${blur}px) !important;
    }

    ${BG_SWITCHER_SELECTOR} {
      background: rgba(1, 10, 19, ${sceneOpacity}) !important;
      backdrop-filter: blur(${sceneBlurPx}px) !important;
      -webkit-backdrop-filter: blur(${sceneBlurPx}px) !important;
    }
  `
}

/** 清空背景切换器内部 img 的 src，避免大厅场景背景盖住自定义壁纸 */
function clearBackgroundSwitcherImages() {
  document.querySelectorAll<HTMLElement>(IMG_CLEAR_SELECTORS).forEach((switcher) => {
    switcher.querySelectorAll('img').forEach((img) => {
      // 客户端可能反复写回 src，仅在非空时清空以避免无意义的 DOM 抖动
      if (img.getAttribute('src')) img.setAttribute('src', '')
    })
  })
}

function tryApplyWallpaperMode(): boolean {
  ensureWallpaperModeStyle()
  clearBackgroundSwitcherImages()

  return true
}

let registered = false

export function updateBeautifyWallpaperMode(enabled: boolean) {
  if (enabled && !registered) {
    registered = true
    injector.register(tryApplyWallpaperMode)
    tryApplyWallpaperMode()
  } else if (!enabled && registered) {
    registered = false
    injector.unregister(tryApplyWallpaperMode)
    document.getElementById(WALLPAPER_STYLE_ID)?.remove()
  }
}

export function updateBeautifyWallpaperModeGlassConfig(config: BeautifyGlassConfig) {
  glassConfig = config
  if (registered) {
    ensureWallpaperModeStyle()
  }
}

export function updateBeautifyWallpaperSceneConfig(config: BeautifyGlassConfig) {
  sceneConfig = config
  if (registered) {
    ensureWallpaperModeStyle()
  }
}
