import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsCenterController } from './SettingsCenterController'
import { useSettingsStore } from '../../store/settingsStore'
import { useUserStore } from '../../store/userStore'

beforeEach(() => {
  useSettingsStore.getState().resetSettings()
  useUserStore.getState().setRole('owner')
})

describe('SettingsCenterController edit and leave flow', () => {
  it('stages and confirms a section-only save', () => {
    useSettingsStore.setState((state) => ({
      paymentMethods: { ...state.paymentMethods, paymentInstructions: '' },
    }))

    const { result } = renderHook(() => useSettingsCenterController())

    act(() => result.current.onEdit())
    act(() => result.current.onUpdateStoreProfile({ storeName: 'Fleurstales Updated' }))
    act(() => result.current.onSave())

    expect(result.current.saveConfirmationOpen).toBe(true)
    expect(result.current.pendingChangeSummary.some((line) => line.includes('Store name'))).toBe(true)
    expect(useSettingsStore.getState().storeProfile.storeName).not.toBe('Fleurstales Updated')

    act(() => result.current.onConfirmSave())

    expect(useSettingsStore.getState().storeProfile.storeName).toBe('Fleurstales Updated')
    expect(useSettingsStore.getState().paymentMethods.paymentInstructions).toBe('')
    expect(result.current.isEditing).toBe(false)
    expect(result.current.saveFeedback).toMatch(/Store Profile saved/i)
  })

  it('leaves a clean edit session in view mode when switching sections', () => {
    const { result } = renderHook(() => useSettingsCenterController())

    act(() => result.current.onEdit())
    expect(result.current.isEditing).toBe(true)

    act(() => result.current.onSectionChange('branches'))

    expect(result.current.activeSection).toBe('branches')
    expect(result.current.isEditing).toBe(false)
    expect(result.current.leaveConfirmationOpen).toBe(false)
  })

  it('requires a decision before switching sections with unsaved changes', () => {
    const { result } = renderHook(() => useSettingsCenterController())

    act(() => result.current.onEdit())
    act(() => result.current.onUpdateStoreProfile({ storeName: 'Fleurstales Draft' }))
    act(() => result.current.onSectionChange('branches'))

    expect(result.current.activeSection).toBe('store-profile')
    expect(result.current.leaveConfirmationOpen).toBe(true)
    expect(result.current.isEditing).toBe(true)

    act(() => result.current.onKeepEditing())

    expect(result.current.activeSection).toBe('store-profile')
    expect(result.current.leaveConfirmationOpen).toBe(false)
    expect(result.current.storeProfile.storeName).toBe('Fleurstales Draft')
  })

  it('discards the draft and completes the pending navigation', () => {
    const originalName = useSettingsStore.getState().storeProfile.storeName
    const { result } = renderHook(() => useSettingsCenterController())

    act(() => result.current.onEdit())
    act(() => result.current.onUpdateStoreProfile({ storeName: 'Discard Me' }))
    act(() => result.current.onSectionChange('branches'))
    act(() => result.current.onDiscardAndLeave())

    expect(result.current.activeSection).toBe('branches')
    expect(result.current.isEditing).toBe(false)
    expect(useSettingsStore.getState().storeProfile.storeName).toBe(originalName)
  })

  it('saves first and only then completes the pending navigation', () => {
    const { result } = renderHook(() => useSettingsCenterController())

    act(() => result.current.onEdit())
    act(() => result.current.onUpdateStoreProfile({ storeName: 'Save Then Leave' }))
    act(() => result.current.onSectionChange('branches'))
    act(() => result.current.onSaveAndLeave())

    expect(result.current.saveConfirmationOpen).toBe(true)
    expect(result.current.activeSection).toBe('store-profile')
    expect(useSettingsStore.getState().storeProfile.storeName).not.toBe('Save Then Leave')

    act(() => result.current.onConfirmSave())

    expect(useSettingsStore.getState().storeProfile.storeName).toBe('Save Then Leave')
    expect(result.current.activeSection).toBe('branches')
    expect(result.current.isEditing).toBe(false)
  })

  it('uses the same decision flow for external navigation and Cancel', () => {
    const { result } = renderHook(() => useSettingsCenterController())
    const continueNavigation = vi.fn()

    act(() => result.current.onEdit())
    act(() => result.current.onUpdateStoreProfile({ storeName: 'Fleurstales Draft' }))
    act(() => result.current.onRequestLeave(continueNavigation))

    expect(result.current.leaveConfirmationOpen).toBe(true)
    expect(continueNavigation).not.toHaveBeenCalled()

    act(() => result.current.onKeepEditing())
    act(() => result.current.onCancel())

    expect(result.current.leaveConfirmationOpen).toBe(true)
    expect(result.current.isEditing).toBe(true)

    act(() => result.current.onDiscardAndLeave())

    expect(result.current.isEditing).toBe(false)
    expect(continueNavigation).not.toHaveBeenCalled()
  })

  it('keeps editing if the save confirmation is cancelled', () => {
    const { result } = renderHook(() => useSettingsCenterController())

    act(() => result.current.onEdit())
    act(() => result.current.onUpdateStoreProfile({ storeName: 'Fleurstales Draft' }))
    act(() => result.current.onSave())
    expect(result.current.saveConfirmationOpen).toBe(true)

    act(() => result.current.onCancelSaveConfirmation())

    expect(result.current.saveConfirmationOpen).toBe(false)
    expect(result.current.isEditing).toBe(true)
    expect(result.current.isDirty).toBe(true)
    expect(useSettingsStore.getState().storeProfile.storeName).not.toBe('Fleurstales Draft')
  })
})
