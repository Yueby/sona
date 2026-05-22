import { injector } from '@/lib/InjectorManager'

const SOCIAL_SCREEN_SELECTOR = 'div.screen-root[data-screen-name="social"]'
const GLASS_ATTR = 'data-sona-social-glass'
const STYLE_ATTR = 'data-sona-social-glass-style'

function ensureSocialGlassStyle(socialScreen: HTMLElement) {
  if (socialScreen.querySelector(`style[${STYLE_ATTR}]`)) return

  const style = document.createElement('style')
  style.setAttribute(STYLE_ATTR, 'true')
  style.textContent = `
    div.screen-root[data-screen-name="social"][${GLASS_ATTR}="true"] {
      background: transparent !important;
    }

    div.screen-root[data-screen-name="social"][${GLASS_ATTR}="true"] .lol-social-sidebar.ember-view {
      background: rgba(1, 10, 19, 0.28) !important;
      backdrop-filter: blur(14px) saturate(1.15) !important;
      -webkit-backdrop-filter: blur(14px) saturate(1.15) !important;
      box-shadow: inset 1px 0 0 rgba(200, 170, 110, 0.12) !important;
    }
  `

  socialScreen.prepend(style)
}

function tryApplySocialSidebarGlass(): boolean {
  const socialScreen = document.querySelector<HTMLElement>(SOCIAL_SCREEN_SELECTOR)
  if (!socialScreen) return true

  socialScreen.setAttribute(GLASS_ATTR, 'true')
  socialScreen.style.setProperty('background', 'transparent', 'important')
  ensureSocialGlassStyle(socialScreen)

  return true
}

let registered = false

export function initSocialSidebarGlass() {
  if (registered) return

  registered = true
  injector.register(tryApplySocialSidebarGlass)
}
