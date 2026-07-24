import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useSettingsStore } from './settingsStore'
import { useFinanceStore } from './financeStore'
import { useOrdersStore } from './ordersStore'
import { useCustomerStore } from './customerStore'
import { useOrderRuntimeStore } from './orderRuntimeStore'
import { readOrderDraftRecords, writeOrderDraftRecords } from './orderDraftPersistence'
import { makeOrder } from '../test/factories/order'
import {
  OPERATIONAL_SCHEMA_VERSION,
  createOperationalSnapshot,
  hydrateOperationalState,
  migrateOperationalSnapshot,
  persistOperationalStateNow,
  stopOperationalPersistence,
} from './operationalPersistence'
import { DEFAULT_OWNER_SETTINGS } from '../domain/settings/defaultOwnerSettings'

beforeEach(() => {
  window.localStorage.clear()
  stopOperationalPersistence()
  useSettingsStore.setState({ ...DEFAULT_OWNER_SETTINGS, settingsHasUnsavedChanges:false })
  useFinanceStore.setState({ transactions: [] })
  useOrdersStore.setState({ orders: [], lastSequence: {} })
  useCustomerStore.setState({ customers: [] })
  useOrderRuntimeStore.setState({ activities: {} })
  writeOrderDraftRecords([])
})

afterEach(() => stopOperationalPersistence())

describe('operational persistence boundary', () => {
  it('serializes data without store actions or unsaved Settings UI state', () => {
    useSettingsStore.setState({ settingsHasUnsavedChanges:true })
    const snapshot = createOperationalSnapshot()
    expect(snapshot.version).toBe(OPERATIONAL_SCHEMA_VERSION)
    expect(snapshot.state.settings?.settingsHasUnsavedChanges).toBe(false)
    expect(snapshot.state.settings?.applySettings).toBeUndefined()
  })


  it('includes orders, customers, activity history, and drafts in one backup snapshot', () => {
    useOrdersStore.setState({
      orders: [makeOrder({ orderNumber: 'BACKUP-ORDER', customerId: 'cust-backup' })],
      lastSequence: { Kedamaian: 9 },
    })
    useCustomerStore.setState({
      customers: [{ id: 'cust-backup', name: 'Backup Customer', whatsappNumber: '081234', normalizedWhatsappNumber: '6281234' }],
    })
    useOrderRuntimeStore.setState({
      activities: {
        'BACKUP-ORDER': [
          {
            id: 'activity-1',
            kind: 'note',
            description: 'Persistent note',
            at: '2026-07-12T00:00:00.000Z',
            actor: 'Admin',
          },
        ],
      },
    })
    writeOrderDraftRecords([{ id: 'draft-backup', values: { customerName: 'Draft' } }])

    const snapshot = createOperationalSnapshot()

    expect(snapshot.state.orders?.orders).toEqual([
      expect.objectContaining({ orderNumber: 'BACKUP-ORDER', customerId: 'cust-backup' }),
    ])
    expect(snapshot.state.customers?.customers).toEqual([
      expect.objectContaining({ id: 'cust-backup' }),
    ])
    expect(snapshot.state.orderActivities?.activities).toEqual(
      expect.objectContaining({ 'BACKUP-ORDER': expect.any(Array) }),
    )
    expect(snapshot.state.orderDrafts).toEqual([
      expect.objectContaining({ id: 'draft-backup' }),
    ])
  })

  it('rehydrates the complete operational graph, not only finance/settings data', async () => {
    useOrdersStore.setState({
      orders: [makeOrder({ orderNumber: 'RESTORE-ORDER', customerId: 'cust-restore' })],
      lastSequence: { Kedamaian: 4 },
    })
    useCustomerStore.setState({
      customers: [{ id: 'cust-restore', name: 'Restore Customer', whatsappNumber: '089999', normalizedWhatsappNumber: '6289999' }],
    })
    useOrderRuntimeStore.setState({
      activities: {
        'RESTORE-ORDER': [
          {
            id: 'activity-restore',
            kind: 'system',
            description: 'Restore me',
            at: '2026-07-12T00:00:00.000Z',
            actor: 'System',
          },
        ],
      },
    })
    writeOrderDraftRecords([{ id: 'draft-restore' }])
    await persistOperationalStateNow()

    useOrdersStore.setState({ orders: [], lastSequence: {} })
    useCustomerStore.setState({ customers: [] })
    useOrderRuntimeStore.setState({ activities: {} })
    writeOrderDraftRecords([])

    expect(await hydrateOperationalState()).toBe(true)
    expect(useOrdersStore.getState().orders[0]?.orderNumber).toBe('RESTORE-ORDER')
    expect(useCustomerStore.getState().customers[0]?.id).toBe('cust-restore')
    expect(useOrderRuntimeStore.getState().activities['RESTORE-ORDER']?.[0]?.id).toBe(
      'activity-restore',
    )
    expect(readOrderDraftRecords<{ id: string }>()[0]?.id).toBe('draft-restore')
  })

  it('rehydrates linked operational stores before render', async () => {
    useFinanceStore.setState({ transactions:[{
      id:'persisted-txn', type:'expense', category:'supplies', branch:'Kedamaian',
      amount:125000, method:'cash', status:'pending', description:'Persist me',
      actor:'Finance', createdAt:'2026-07-11T00:00:00.000Z', updatedAt:'2026-07-11T00:00:00.000Z',
    }] })
    await persistOperationalStateNow()
    useFinanceStore.setState({ transactions:[] })
    expect(await hydrateOperationalState()).toBe(true)
    expect(useFinanceStore.getState().transactions[0]?.id).toBe('persisted-txn')
  })


  it('migrates legacy payroll void and clarification records into the current model', () => {
    const migrated = migrateOperationalSnapshot({
      version: 1,
      savedAt: '2026-07-11T00:00:00.000Z',
      state: {
        payroll: {
          employeePayrolls: [
            { id:'resolved-draft', status:'void', voidedAt:'2026-07-10', voidedBy:'HR', voidReason:'Moved to next period' },
            { id:'returned-draft', status:'clarification_requested', clarificationReason:'Check points' },
          ],
          payrollReviews: [
            { id:'review-1', decision:'voided' },
            { id:'review-2', decision:'clarification_requested' },
          ],
        },
      },
    })

    expect(migrated?.version).toBe(OPERATIONAL_SCHEMA_VERSION)
    expect(migrated?.state.payroll?.employeePayrolls).toEqual([
      expect.objectContaining({ id:'resolved-draft', status:'resolved', resolvedBy:'HR', resolutionReason:'Moved to next period' }),
      expect.objectContaining({ id:'returned-draft', status:'finance_rejected' }),
    ])
    expect(migrated?.state.payroll?.payrollReviews).toEqual([
      expect.objectContaining({ decision:'resolved' }),
      expect.objectContaining({ decision:'rejected' }),
    ])
  })


  it.each([1, 2, 3, 4, 5])('migrates schema v%s sequentially to the current version', (version) => {
    const migrated = migrateOperationalSnapshot({
      version,
      savedAt: '2026-07-11T00:00:00.000Z',
      state: {
        settings: {
          payroll: { periodStartDay:21 },
          scheduling: { defaultWeeklySchedule:{}, access:{ owner:'edit', hr:'view' } },
          permissions: {
            owner:{}, admin:{}, finance:{}, hr:{}, florist:{}, employee:{},
          },
          paymentMethods: {
            bankAccounts:[{ id:'legacy-account', bankName:'BCA', accountNumber:'1', accountHolder:'Store' }],
          },
        },
        payroll: { employeePayrolls:[], payrollReviews:[] },
      },
    })

    expect(migrated?.version).toBe(OPERATIONAL_SCHEMA_VERSION)
    expect(migrated?.revision).toEqual(expect.any(Number))
    if (version <= 2) {
      expect(migrated?.state.settings?.payrollConfigRevisions).toEqual(expect.any(Array))
      expect(migrated?.state.settings?.schedulingConfigRevisions).toEqual(expect.any(Array))
    }
    if (version <= 3) {
      expect((migrated?.state.settings?.paymentMethods as { bankAccounts?: Array<{ isActive?: boolean }> })?.bankAccounts?.[0]?.isActive).toBe(true)
    }
    if (version <= 4) {
      expect((migrated?.state.settings?.permissions as Record<string, Record<string, unknown>>)?.owner?.scheduling).toBeDefined()
    }
  })


  it('migrates legacy finance records into explicit scope, entry mode, and business-date groups', () => {
    const migrated = migrateOperationalSnapshot({
      version:17,
      revision:1,
      savedAt:'2026-07-16T00:00:00.000Z',
      state:{
        finance:{
          customCategories:[{
            id:'custom:legacy',
            name:'Legacy expense',
            direction:'expense',
            active:true,
            branchRequired:false,
            paymentMethodRequired:true,
            placeholder:'Legacy',
            createdBy:'Finance',
            createdAt:'2026-07-01T00:00:00.000Z',
            updatedAt:'2026-07-01T00:00:00.000Z',
          }],
          transactions:[
            {
              id:'legacy-order',
              type:'income',
              category:'order_payment',
              branch:'Kedamaian',
              amount:300000,
              method:'transfer',
              status:'verified',
              description:'Order payment',
              orderNumber:'KDM-1',
              createdAt:'2026-07-15T10:00:00.000Z',
              updatedAt:'2026-07-15T10:00:00.000Z',
            },
            {
              id:'legacy-shared',
              type:'expense',
              category:'payroll',
              branch:'All',
              amount:5000000,
              method:'transfer',
              status:'verified',
              description:'Payroll',
              payrollPeriodId:'payroll-2026-07',
              createdAt:'2026-07-20T10:00:00.000Z',
              updatedAt:'2026-07-20T10:00:00.000Z',
            },
          ],
        },
        hr:{ pointRules:{} },
      },
    })
    expect(migrated?.version).toBe(OPERATIONAL_SCHEMA_VERSION)
    expect(migrated?.state.finance?.categoryOverrides).toEqual([])
    expect((migrated?.state.finance?.customCategories as Array<Record<string,unknown>>)[0]).toMatchObject({
      scopePolicy:'company',
      allowScopeOverride:true,
      updatedBy:'Finance',
    })
    expect((migrated?.state.finance?.transactions as Array<Record<string,unknown>>)[0]).toMatchObject({
      source:'order_payment',
      entryMode:'automatic',
      scope:'branch',
      transactionDate:'2026-07-15T10:00:00.000Z',
      groupType:'order_day',
      groupKey:'2026-07-15',
    })
    expect((migrated?.state.finance?.transactions as Array<Record<string,unknown>>)[1]).toMatchObject({
      source:'payroll',
      entryMode:'automatic',
      scope:'company',
      branch:'All',
      groupType:'payroll_cycle',
      groupKey:'payroll-2026-07',
    })
    expect((migrated?.state.hr?.pointRules as Record<string,unknown>).orderContributionActiveFrom).toEqual(expect.any(String))
  })

  it('ignores unknown schema versions instead of applying unsafe data', () => {
    expect(migrateOperationalSnapshot({ version:999, state:{} })).toBeNull()
  })
})
