import { createRoot } from 'react-dom/client'
import './shadcn.css'
import App from './App'
import { removeLocalOperationalBackup } from './data/operationalStateRepository'
import { UiLanguageBridge } from './i18n/UiLanguageBridge'
import { initializeBusinessOsCatalogBridge } from './data/shared/catalogBridge'
import { initializeBusinessOsStoreBridge } from './data/shared/storeBridge'
import { isSharedBackendConfigured } from './api/remoteSession'
import { bootstrapSharedData } from './data/shared/bootstrap'

const root = createRoot(document.getElementById('app')!)

const renderStartupFailure = (error: unknown) => {
  console.error('Fleurstales OS startup failed', error)
  root.render(
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-center text-foreground">
      <section className="max-w-md rounded-xl border bg-card p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Fleurstales OS tidak dapat dimulai</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Periksa koneksi, lalu muat ulang ruang kerja.
        </p>
        <button
          type="button"
          className="mt-6 min-h-11 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground"
          onClick={() => window.location.reload()}
        >
          Muat ulang
        </button>
      </section>
    </main>,
  )
}

const start = async () => {
  // Supabase is the durable operational source. Remove the retired aggregate
  // browser backup before production data bridges hydrate the application.
  removeLocalOperationalBackup()
  if (!isSharedBackendConfigured()) {
    // With Supabase the real load happens after sign-in (App.handleSignIn), once
    // the staff role is known. Boot only attaches the focus-refresh listeners.
    const skipInitialRefresh = bootstrapSharedData().enabled
    await initializeBusinessOsStoreBridge({ skipInitialRefresh })
    await initializeBusinessOsCatalogBridge({ skipInitialRefresh })
  }
  root.render(<>
    <UiLanguageBridge />
    <App />
  </>)
}

void start().catch(renderStartupFailure)
