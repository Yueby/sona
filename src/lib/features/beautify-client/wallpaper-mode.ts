import { injector } from '@/lib/InjectorManager'
import type { BeautifyGlassConfig } from '@/lib/features/beautify-client/social-sidebar-glass'

const ACTIVITY_CENTER_SELECTOR = 'section#activity-center'
const ACTIVITY_SCREEN_SELECTOR = 'div.screen-root[data-screen-name="rcp-fe-lol-activity-center"]'
const SIDEBAR_SELECTOR = 'section.rcp-fe-viewport-sidebar'
const WALLPAPER_STYLE_ID = 'sona-wallpaper-mode-style'

let glassConfig: BeautifyGlassConfig = {
  blur: 14,
  opacity: 28,
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
  `
}

function tryApplyWallpaperMode(): boolean {
  ensureWallpaperModeStyle()

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
