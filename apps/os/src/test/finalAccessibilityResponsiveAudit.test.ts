import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(path, 'utf8')

describe('final Business OS accessibility and responsive audit', () => {
  it('keeps header utilities at 44px touch targets on phone and tablet', () => {
    const topBar = read('src/components/dashboard/TopBar.tsx')

    expect(topBar).toContain('right-0 top-1/2 flex size-11')
    expect(topBar).toContain('flex min-h-11 items-center justify-between')
    expect(topBar).toContain('flex min-h-11 w-full items-center gap-2')
    expect(topBar).toContain('flex min-h-11 w-full items-center justify-between rounded-lg')
  })

  it('raises sidebar navigation targets on tablet without inflating desktop density', () => {
    const sidebar = read('src/components/layout/DesktopSidebar.tsx')

    expect(sidebar).toContain('h-10 w-full items-center md:h-11 lg:h-10')
    expect(sidebar).toContain('min-h-9 w-full items-center justify-between md:min-h-11 lg:min-h-9')
    expect(sidebar).toContain('className={`flex h-11 w-full items-center')
  })

  it('keeps notification actions touch-safe and respects device safe areas', () => {
    const notifications = read('src/components/notifications/NotificationCenter.tsx')
    const bottomBar = read('src/components/layout/BottomTabBar.tsx')

    expect(notifications).toContain('min-h-11 justify-self-start rounded-full')
    expect(notifications).toContain('min-h-11 w-full rounded-xl')
    expect(notifications).toContain('pt-[max(1rem,env(safe-area-inset-top))]')
    expect(notifications).toContain('pb-[max(1.25rem,env(safe-area-inset-bottom))]')
    expect(bottomBar).toContain('pb-[max(env(safe-area-inset-bottom),0px)]')
    expect(bottomBar).toContain('min-h-[52px]')
  })

  it('keeps shared dialogs and sheets inside narrow mobile viewports', () => {
    const dialog = read('src/components/ui/dialog.tsx')
    const sheet = read('src/components/ui/sheet.tsx')

    expect(dialog).toContain('w-[calc(100%-1rem)]')
    expect(dialog).toContain('max-w-[calc(100vw-1rem)]')
    expect(dialog).toContain('max-h-[calc(100dvh-1rem)]')
    expect(sheet).toContain('max-w-[calc(100vw-1rem)]')
    expect(sheet).toContain('mobile-sheet-safe')
    expect(sheet).toContain('md:max-h-dvh')
  })
})
