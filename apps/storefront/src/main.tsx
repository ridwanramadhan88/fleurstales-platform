import { createRoot } from 'react-dom/client'
import './shadcn.css'
import App from './App'
import { initializeOperationalPersistence } from './store/operationalPersistence'
import { UiLanguageBridge } from './i18n/UiLanguageBridge'
import { initializeStorefrontCatalogBridge } from './data/shared/catalogBridge'
import { initializeStorefrontStoreBridge } from './data/shared/storeBridge'
import { isSupabaseConfigured } from './data/shared/supabaseConfig'

const documentRoot = window.document.documentElement
documentRoot.classList.remove('dark')
documentRoot.style.colorScheme = 'light'
window.localStorage.removeItem('fleurstales:theme')

const root = createRoot(document.getElementById('app')!)

const renderStartupFailure = (error: unknown) => {
  console.error('Storefront startup failed', error)
  root.render(
    <main className="flex min-h-screen items-center justify-center bg-[#f7f0e8] px-6 text-center text-black">
      <section className="max-w-md">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.24em]">Fleurstales</p>
        <h1 className="text-2xl font-medium">We couldn&apos;t open the shop.</h1>
        <p className="mt-3 text-sm leading-6 text-black/65">
          Please check your connection, then try again.
        </p>
        <button
          type="button"
          className="mt-7 min-h-11 border border-black bg-black px-6 text-sm font-medium text-white"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </section>
    </main>,
  )
}

const start = async () => {
  // The aggregate browser database exists only for offline/demo mode. Once
  // Supabase is configured, global business data (Orders, CRM, vouchers, HR,
  // Finance, etc.) must come from the backend and must never be hydrated from
  // a customer's browser cache. Cart/checkout stores retain their own local
  // persistence independently.
  if (!isSupabaseConfigured()) await initializeOperationalPersistence()
  await initializeStorefrontStoreBridge()
  await initializeStorefrontCatalogBridge()
  root.render(<>
    <UiLanguageBridge />
    <App />
  </>)
}

void start().catch(renderStartupFailure)
