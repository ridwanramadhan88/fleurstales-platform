export const SETTINGS_NAVIGATION_REQUEST_EVENT = 'settings-navigation-requested'

export interface SettingsNavigationRequestDetail {
  continueNavigation: () => void
}

/**
 * Requests navigation away from Owner Settings. The Settings Center handles
 * the request and either continues immediately or asks the user to save or
 * discard the current draft first.
 */
export const requestSettingsNavigation = (continueNavigation: () => void) => {
  window.dispatchEvent(
    new CustomEvent<SettingsNavigationRequestDetail>(
      SETTINGS_NAVIGATION_REQUEST_EVENT,
      { detail: { continueNavigation } },
    ),
  )
}
