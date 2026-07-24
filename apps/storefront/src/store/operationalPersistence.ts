/** Versioned demo persistence with sequential migrations and conflict detection. */
import {
  OPERATIONAL_STATE_RESOURCE,
  prototypeOperationalStateRepository,
} from '../data/operationalStateRepository'
import { useSettingsStore } from './settingsStore'
import { useHrStore } from './hrStore'
import { usePayrollStore } from './payrollStore'
import { useFinanceStore } from './financeStore'
import { useStockStore } from './stockStore'
import { useCatalogStore } from './catalogStore'
import { SEED_CATEGORIES, SEED_PRODUCTS } from './catalogStoreSeedData'
import { useVoucherStore } from './voucherStore'
import { useOrdersStore } from './ordersStore'
import { useCustomerStore } from './customerStore'
import { useNotificationStore } from './notificationStore'
import { useOrderRuntimeStore } from './orderRuntimeStore'
import { useAuditLogStore } from './auditLogStore'
import { normalizeOrderConcurrencyMetadata } from '../domain/orderConcurrencyDomain'
import {
  clearOrderDraftRecords,
  readOrderDraftRecords,
  writeOrderDraftRecords,
} from './orderDraftPersistence'
import { usePersistenceHealthStore, type PersistenceHealthPatch } from './persistenceHealthStore'

export const OPERATIONAL_SNAPSHOT_KEY = OPERATIONAL_STATE_RESOURCE
export const OPERATIONAL_SCHEMA_VERSION = 25
const PERSIST_DEBOUNCE_MS = 120

type DataSlice = Record<string, unknown>
export interface OperationalSnapshot {
  version: number
  revision: number
  savedAt: string
  state: {
    settings?: DataSlice
    hr?: DataSlice
    payroll?: DataSlice
    finance?: DataSlice
    stock?: DataSlice
    catalog?: DataSlice
    vouchers?: DataSlice
    orders?: DataSlice
    customers?: DataSlice
    notifications?: DataSlice
    orderActivities?: DataSlice
    auditLog?: DataSlice
    orderDrafts?: unknown[]
  }
}
const isRecord = (value: unknown): value is DataSlice => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const dataOnly = (state: Record<string, unknown>): DataSlice => Object.fromEntries(Object.entries(state).filter(([, value]) => typeof value !== 'function'))
let lastKnownRevision = 0
let localMutationSinceHydrate = false

export const createOperationalSnapshot = (revision = lastKnownRevision + 1): OperationalSnapshot => ({
  version: OPERATIONAL_SCHEMA_VERSION, revision, savedAt: new Date().toISOString(),
  state: {
    settings: { ...dataOnly(useSettingsStore.getState() as unknown as Record<string, unknown>), settingsHasUnsavedChanges: false },
    hr: dataOnly(useHrStore.getState() as unknown as Record<string, unknown>), payroll: dataOnly(usePayrollStore.getState() as unknown as Record<string, unknown>),
    finance: dataOnly(useFinanceStore.getState() as unknown as Record<string, unknown>), stock: dataOnly(useStockStore.getState() as unknown as Record<string, unknown>),
    catalog: dataOnly(useCatalogStore.getState() as unknown as Record<string, unknown>), vouchers: dataOnly(useVoucherStore.getState() as unknown as Record<string, unknown>),
    orders: dataOnly(useOrdersStore.getState() as unknown as Record<string, unknown>),
    customers: dataOnly(useCustomerStore.getState() as unknown as Record<string, unknown>),
    notifications: dataOnly(useNotificationStore.getState() as unknown as Record<string, unknown>),
    orderActivities: dataOnly(useOrderRuntimeStore.getState() as unknown as Record<string, unknown>),
    auditLog: dataOnly(useAuditLogStore.getState() as unknown as Record<string, unknown>),
    orderDrafts: readOrderDraftRecords<unknown>(),
  },
})

const migrate1to2 = (snapshot: DataSlice): DataSlice => {
  const state = snapshot.state as DataSlice; const payroll = isRecord(state.payroll) ? state.payroll : undefined
  if (payroll && Array.isArray(payroll.employeePayrolls)) payroll.employeePayrolls = payroll.employeePayrolls.map((entry) => {
    if (!isRecord(entry)) return entry; const next={...entry}
    if (next.status==='void') next.status='resolved'; if (next.status==='clarification_requested') next.status='finance_rejected'
    if (typeof next.voidedAt==='string') next.resolvedAt=next.voidedAt; if (typeof next.voidedBy==='string') next.resolvedBy=next.voidedBy; if (typeof next.voidReason==='string') next.resolutionReason=next.voidReason
    delete next.voidedAt; delete next.voidedBy; delete next.voidReason; delete next.clarificationReason; return next
  })
  if (payroll && Array.isArray(payroll.payrollReviews)) payroll.payrollReviews = payroll.payrollReviews.map((entry) => !isRecord(entry) ? entry : ({...entry, decision: entry.decision==='voided'?'resolved':entry.decision==='clarification_requested'?'rejected':entry.decision}))
  snapshot.version=2; return snapshot
}
const migrate2to3 = (snapshot: DataSlice): DataSlice => {
  const state=snapshot.state as DataSlice; const settings=isRecord(state.settings)?state.settings:undefined
  if(settings){const payroll=isRecord(settings.payroll)?settings.payroll:undefined; const scheduling=isRecord(settings.scheduling)?settings.scheduling:undefined
    if(!Array.isArray(settings.payrollConfigRevisions)&&payroll) settings.payrollConfigRevisions=[{id:'payroll-config-migrated',effectiveFrom:'2026-01-01',value:payroll,createdAt:new Date().toISOString(),createdBy:'Migration',changeReason:'Migrated existing payroll configuration'}]
    if(!Array.isArray(settings.schedulingConfigRevisions)&&scheduling) settings.schedulingConfigRevisions=[{id:'scheduling-config-migrated',effectiveFrom:'2026-01-01',value:scheduling,createdAt:new Date().toISOString(),createdBy:'Migration',changeReason:'Migrated existing scheduling configuration'}]
  } snapshot.version=3; return snapshot
}
const migrate3to4 = (snapshot: DataSlice): DataSlice => {
  const state=snapshot.state as DataSlice; const settings=isRecord(state.settings)?state.settings:undefined; const payment=settings&&isRecord(settings.paymentMethods)?settings.paymentMethods:undefined
  if(payment&&Array.isArray(payment.bankAccounts)) payment.bankAccounts=payment.bankAccounts.map((entry,index)=>!isRecord(entry)?entry:({...entry,type:entry.type==='ewallet'?'ewallet':'bank_transfer',isActive:typeof entry.isActive==='boolean'?entry.isActive:true,isDefault:typeof entry.isDefault==='boolean'?entry.isDefault:index===0,displayOrder:typeof entry.displayOrder==='number'?entry.displayOrder:index,isCustomerVisible:typeof entry.isCustomerVisible==='boolean'?entry.isCustomerVisible:true,branchIds:Array.isArray(entry.branchIds)?entry.branchIds:[]}))
  snapshot.version=4; return snapshot
}
const migrate4to5 = (snapshot: DataSlice): DataSlice => {
  const state=snapshot.state as DataSlice; const settings=isRecord(state.settings)?state.settings:undefined
  if(settings){const permissions=isRecord(settings.permissions)?settings.permissions:undefined; const scheduling=isRecord(settings.scheduling)?settings.scheduling:undefined; const legacy=scheduling&&isRecord(scheduling.access)?scheduling.access:undefined
    if(permissions) for(const role of ['owner','admin','finance','hr','florist','employee']){const rp=isRecord(permissions[role])?permissions[role] as DataSlice:undefined;if(rp) rp.scheduling=typeof legacy?.[role]==='string'?legacy[role]:(role==='owner'||role==='hr'?'edit':'none')}
    if(scheduling) delete scheduling.access
    if(Array.isArray(settings.schedulingConfigRevisions)) settings.schedulingConfigRevisions=settings.schedulingConfigRevisions.map((entry)=>{if(!isRecord(entry)||!isRecord(entry.value))return entry;const next={...entry,value:{...entry.value}};delete (next.value as DataSlice).access;return next})
  } snapshot.version=5; return snapshot
}
const migrate5to6 = (snapshot: DataSlice): DataSlice => { snapshot.revision=typeof snapshot.revision==='number'?snapshot.revision:0; snapshot.version=6; return snapshot }
const migrate6to7 = (snapshot: DataSlice): DataSlice => { snapshot.version=7; return snapshot }
const migrate7to8 = (snapshot: DataSlice): DataSlice => {
  const state=snapshot.state as DataSlice
  const orders=isRecord(state.orders)?state.orders:undefined
  if(orders&&Array.isArray(orders.orders)) orders.orders=orders.orders.map((entry)=>isRecord(entry)?normalizeOrderConcurrencyMetadata(entry as unknown as import('../types/orders').OrderTableRow):entry)
  if(!isRecord(state.auditLog)) state.auditLog={events:[]}
  snapshot.version=8
  return snapshot
}
const migrate8to9 = (snapshot: DataSlice): DataSlice => {
  const state=snapshot.state as DataSlice
  const orders=isRecord(state.orders)?state.orders:undefined
  if(orders&&Array.isArray(orders.orders)) orders.orders=orders.orders.map((entry)=>!isRecord(entry)?entry:({
    ...entry,
    paymentHistory:Array.isArray(entry.paymentHistory)?entry.paymentHistory:[],
  }))
  const finance=isRecord(state.finance)?state.finance:undefined
  if(finance&&Array.isArray(finance.transactions)) finance.transactions=finance.transactions.map((entry)=>!isRecord(entry)?entry:({
    ...entry,
    source:typeof entry.source==='string'?entry.source:(entry.category==='order_payment'?'order_payment':'manual'),
    isSystemGenerated:typeof entry.isSystemGenerated==='boolean'?entry.isSystemGenerated:entry.category==='order_payment',
  }))
  snapshot.version=9
  return snapshot
}

const migrate9to10 = (snapshot: DataSlice): DataSlice => {
  const state=snapshot.state as DataSlice
  const settings=isRecord(state.settings)?state.settings:undefined
  if(settings){
    const staffRoles=isRecord(settings.staffRoles)?settings.staffRoles:undefined
    if(staffRoles){
      if(Array.isArray(staffRoles.roles)) staffRoles.roles=Array.from(new Set(staffRoles.roles.map((role)=>role==='employee'?'florist':role)))
      if(staffRoles.defaultRole==='employee') staffRoles.defaultRole='florist'
    }
  }
  const hr=isRecord(state.hr)?state.hr:undefined
  if(hr&&Array.isArray(hr.employees)) hr.employees=hr.employees.map((entry)=>!isRecord(entry)||entry.systemRole!=='employee'?entry:({
    ...entry,
    systemRole:'florist',
    position:entry.position==='Employee'?'Florist':entry.position,
    username:entry.username==='employee'?'florist2':entry.username,
  }))
  const payroll=isRecord(state.payroll)?state.payroll:undefined
  if(payroll&&Array.isArray(payroll.employeePayrolls)) payroll.employeePayrolls=payroll.employeePayrolls.map((entry)=>!isRecord(entry)||entry.employeeRole!=='employee'?entry:({...entry,employeeRole:'florist'}))
  snapshot.version=10
  return snapshot
}
const migrate10to11 = (snapshot: DataSlice): DataSlice => {
  const state=snapshot.state as DataSlice
  const hr=isRecord(state.hr)?state.hr:undefined
  if(hr&&!Array.isArray(hr.weeklySchedulePublications)) hr.weeklySchedulePublications=[]
  snapshot.version=11
  return snapshot
}

const migrate11to12 = (snapshot: DataSlice): DataSlice => {
  const state=snapshot.state as DataSlice
  const hr=isRecord(state.hr)?state.hr:undefined
  if(hr){
    const existing=Array.isArray(hr.employees)?hr.employees.filter((entry)=>isRecord(entry) && !['admin','florist','florist2'].includes(String(entry.username ?? '')) && !['admin','florist'].includes(String(entry.systemRole ?? ''))):[]
    const real=[
      ['emp-akbar','Akbar','admin','akbar'],['emp-teta','Teta','admin','teta'],['emp-shofi','Shofi','admin','shofi'],
      ['emp-zahra','Zahra','florist','zahra'],['emp-vero','Vero','florist','vero'],['emp-zizi','Zizi','florist','zizi'],
      ['emp-dela','Dela','florist','dela'],['emp-dila','Dila','florist','dila'],['emp-gaby','Gaby','florist','gaby'],
    ].map(([id,name,role,username])=>({id,name,position:role==='admin'?'Admin':'Florist',branch:'',systemRole:role,status:'active',phone:'',hireDate:'2024-01-01',username,pin:'123456'}))
    hr.employees=[...existing.map((entry)=>isRecord(entry)?({...entry,branch:''}):entry),...real]
    hr.employeeDefaultSchedules=[]
  }
  const settings=isRecord(state.settings)?state.settings:undefined
  if(settings&&Array.isArray(settings.branches)) settings.branches=settings.branches.map((branch)=>{
    if(!isRecord(branch)) return branch
    const hours=String(branch.id)==='Kedamaian'?['07:00','16:00']:String(branch.id)==='Pahoman'?['10:00','19:00']:null
    if(!hours) return branch
    const openingHours=Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map((day)=>[day,{isOpen:true,opensAt:hours[0],closesAt:hours[1]}]))
    return {...branch,openingHours}
  })
  snapshot.version=12
  return snapshot
}


const migrate12to13 = (snapshot: DataSlice): DataSlice => {
  const state=snapshot.state as DataSlice
  const hr=isRecord(state.hr)?state.hr:undefined
  if(hr&&!Array.isArray(hr.scheduleRevisions)) hr.scheduleRevisions=[]
  snapshot.version=13
  return snapshot
}

const migrate13to14 = (snapshot: DataSlice): DataSlice => {
  const state=snapshot.state as DataSlice
  const legacyOrderNumbers=new Set(['KDM-2026-0142','KDM-2026-0143','KDM-2026-0144','PHM-2026-0099','PHM-2026-0100','KDM-2026-0141','PHM-2026-0098','PHM-2026-0096','KDM-2026-0140','PHM-2026-0097','PHM-2026-0095','KDM-2026-0138'])
  const orders=isRecord(state.orders)?state.orders:undefined
  if(orders&&Array.isArray(orders.orders)){
    orders.orders=orders.orders.filter((entry)=>!isRecord(entry)||!legacyOrderNumbers.has(String(entry.orderNumber ?? '')))
    orders.lastSequence={Kedamaian:0,Pahoman:0}
  }
  const finance=isRecord(state.finance)?state.finance:undefined
  if(finance&&Array.isArray(finance.transactions)) finance.transactions=finance.transactions.filter((entry)=>!isRecord(entry)||!['txn-seed-1','txn-seed-2','txn-seed-3'].includes(String(entry.id ?? '')))
  snapshot.version=14
  return snapshot
}



const migrate14to15 = (snapshot: DataSlice): DataSlice => {
  const state=snapshot.state as DataSlice
  const settings=isRecord(state.settings)?state.settings:undefined
  if(settings){
    const profile=isRecord(settings.storeProfile)?settings.storeProfile:undefined
    if(profile) profile.inventoryEnabled=false
  }
  // Inventory remains disabled. Catalog materials recipes are removed in schema 19.
  snapshot.version=15
  return snapshot
}

const migrate15to16 = (snapshot: DataSlice): DataSlice => {
  const state=snapshot.state as DataSlice
  const settings=isRecord(state.settings)?state.settings:undefined
  const profile=settings&&isRecord(settings.storeProfile)?settings.storeProfile:undefined
  // Disabled Inventory remains a runtime feature gate. Legacy Catalog recipe data is removed in schema 19.
  void profile
  snapshot.version=16
  return snapshot
}


const migrate16to17 = (snapshot: DataSlice): DataSlice => {
  const state=snapshot.state as DataSlice
  const hr=isRecord(state.hr)?state.hr:undefined
  if(hr&&Array.isArray(hr.scheduleOverrides)) hr.scheduleOverrides=hr.scheduleOverrides.map((entry)=>{
    if(!isRecord(entry)||typeof entry.workMode==='string') return entry
    const note=typeof entry.note==='string'?entry.note.trim().toLowerCase():''
    const isClearLegacyWfh=/^(wfh|work from home)(?:\s*[-–—:].*)?$/.test(note)
    return isClearLegacyWfh?{...entry,workMode:'wfh'}:{...entry,workMode:'onsite'}
  })
  snapshot.version=17
  return snapshot
}


const migrate17to18 = (snapshot: DataSlice): DataSlice => {
  const state=snapshot.state as DataSlice
  const finance=isRecord(state.finance)?state.finance:undefined
  if(finance){
    if(!Array.isArray(finance.categoryOverrides)) finance.categoryOverrides=[]
    if(Array.isArray(finance.customCategories)) finance.customCategories=finance.customCategories.map((entry)=>{
      if(!isRecord(entry)) return entry
      const scopePolicy=typeof entry.scopePolicy==='string'?entry.scopePolicy:(entry.branchRequired?'branch':'company')
      return {
        ...entry,
        scopePolicy,
        allowScopeOverride:typeof entry.allowScopeOverride==='boolean'?entry.allowScopeOverride:true,
        updatedBy:typeof entry.updatedBy==='string'?entry.updatedBy:entry.createdBy,
      }
    })
    if(Array.isArray(finance.transactions)) finance.transactions=finance.transactions.map((entry)=>{
      if(!isRecord(entry)) return entry
      const source=typeof entry.source==='string'?entry.source:(entry.category==='order_payment'?'order_payment':entry.category==='order_refund'?'order_refund':entry.category==='payroll'?'payroll':'manual')
      const automatic=typeof entry.isSystemGenerated==='boolean'?entry.isSystemGenerated:source!=='manual'
      const transactionDate=typeof entry.transactionDate==='string'?entry.transactionDate:(typeof entry.createdAt==='string'?entry.createdAt:new Date(0).toISOString())
      const scope=typeof entry.scope==='string'?entry.scope:(entry.branch&&entry.branch!=='All'?'branch':'company')
      const branch=scope==='company'?'All':entry.branch
      let groupType=typeof entry.groupType==='string'?entry.groupType:undefined
      let groupKey=typeof entry.groupKey==='string'?entry.groupKey:undefined
      let groupLabel=typeof entry.groupLabel==='string'?entry.groupLabel:undefined
      if(!groupType&&source==='order_payment'){groupType='order_day';groupKey=transactionDate.slice(0,10);groupLabel=groupKey}
      if(!groupType&&source==='order_refund'){groupType='refund_day';groupKey=transactionDate.slice(0,10);groupLabel=groupKey}
      if(!groupType&&source==='payroll'){groupType='payroll_cycle';groupKey=typeof entry.payrollPeriodId==='string'?entry.payrollPeriodId:transactionDate.slice(0,10);groupLabel=typeof entry.payrollPeriodId==='string'?entry.payrollPeriodId:groupKey}
      return {...entry,source,isSystemGenerated:automatic,entryMode:typeof entry.entryMode==='string'?entry.entryMode:(automatic?'automatic':'manual'),transactionDate,scope,branch,groupType,groupKey,groupLabel}
    })
  }
  const hr=isRecord(state.hr)?state.hr:undefined
  if(hr){
    const pointRules=isRecord(hr.pointRules)?hr.pointRules:{}
    hr.pointRules={...pointRules,orderContributionActiveFrom:typeof pointRules.orderContributionActiveFrom==='string'?pointRules.orderContributionActiveFrom:new Date().toISOString()}
  }
  snapshot.version=18
  return snapshot
}


const migrate18to19 = (snapshot: DataSlice): DataSlice => {
  const state=snapshot.state as DataSlice
  const catalog=isRecord(state.catalog)?state.catalog:undefined
  if(catalog&&Array.isArray(catalog.products)) catalog.products=catalog.products.map((entry)=>{
    if(!isRecord(entry)) return entry
    const next={...entry}
    delete next.recipe
    delete next.linkedStockItemIds
    return next
  })
  snapshot.version=19
  return snapshot
}


const migrate19to20 = (snapshot: DataSlice): DataSlice => {
  const state=snapshot.state as DataSlice
  const stock=isRecord(state.stock)?state.stock:undefined
  if(stock) delete stock.reservations
  snapshot.version=20
  return snapshot
}


const migrate20to21 = (snapshot: DataSlice): DataSlice => {
  const state=snapshot.state as DataSlice
  const catalog=isRecord(state.catalog)?state.catalog:undefined
  const requiredOccasions=[
    {id:'cat_birthday',name:'Birthday',prefix:'BDY'},
    {id:'cat_anniversary',name:'Anniversary',prefix:'ANN'},
    {id:'cat_general_gifting',name:'General Gifting',prefix:'GFT'},
    {id:'cat_graduation',name:'Graduation',prefix:'GRD'},
    {id:'cat_congratulations',name:'Congratulations',prefix:'CON'},
    {id:'cat_wedding',name:'Wedding',prefix:'WED'},
    {id:'cat_condolence',name:'Condolence',prefix:'CDL'},
  ]
  if(catalog){
    const currentCategories=Array.isArray(catalog.categories)?catalog.categories:[]
    const existingNames=new Set(currentCategories.filter(isRecord).map((entry)=>String(entry.name??'')))
    catalog.categories=[...currentCategories,...requiredOccasions.filter((entry)=>!existingNames.has(entry.name))]
    if(Array.isArray(catalog.products)) catalog.products=catalog.products.map((entry)=>{
      if(!isRecord(entry)) return entry
      const category=typeof entry.category==='string'?entry.category:'General Gifting'
      const occasions=Array.isArray(entry.occasionTags)?entry.occasionTags.filter((value)=>typeof value==='string'):[category]
      const collection=typeof entry.collectionSeries==='string'?entry.collectionSeries:undefined
      return {
        ...entry,
        category,
        occasionTags:[...new Set([category,...occasions])],
        productType:typeof entry.productType==='string'?entry.productType:(typeof entry.description==='string'?entry.description:undefined),
        collectionSeries:collection,
        pricingType:entry.pricingType==='Starts From'?'Starts From':'Fixed',
        orderType:entry.orderType==='Custom'?'Custom':'Catalog',
      }
    })
  }
  snapshot.version=21
  return snapshot
}



const migrate21to22 = (snapshot: DataSlice): DataSlice => {
  const state=snapshot.state as DataSlice
  state.catalog={
    products:structuredClone(SEED_PRODUCTS),
    categories:structuredClone(SEED_CATEGORIES),
    deletedProductIds:[],
  }
  snapshot.version=22
  return snapshot
}

const migrate22to23 = (snapshot: DataSlice): DataSlice => {
  const state=snapshot.state as DataSlice
  state.catalog={
    products:structuredClone(SEED_PRODUCTS),
    categories:structuredClone(SEED_CATEGORIES),
    deletedProductIds:[],
  }
  snapshot.version=23
  return snapshot
}

/** Phase 1 shared-data normalization: both apps hydrate the same canonical catalog. */
const migrate23to24 = (snapshot: DataSlice): DataSlice => {
  const state=snapshot.state as DataSlice
  state.catalog={
    products:structuredClone(SEED_PRODUCTS),
    categories:structuredClone(SEED_CATEGORIES),
    deletedProductIds:[],
  }
  snapshot.version=24
  return snapshot
}

/** Removes legacy showcase records while retaining Catalog, Store settings and remote orders. */
const migrate24to25 = (snapshot: DataSlice): DataSlice => {
  const state=snapshot.state as DataSlice
  const demoEmployeeIds=new Set(['emp-budi','emp-dewi','emp-bintang','emp-akbar','emp-teta','emp-shofi','emp-zahra','emp-vero','emp-zizi','emp-dela','emp-dila','emp-gaby'])
  const demoCustomerIds=new Set(['cust-sari','cust-andra','cust-nadia','cust-melati','cust-citra'])
  const hr=isRecord(state.hr)?state.hr:undefined
  if(hr){
    if(Array.isArray(hr.employees)) hr.employees=hr.employees.filter((entry)=>!isRecord(entry)||!demoEmployeeIds.has(String(entry.id ?? '')))
    if(Array.isArray(hr.scheduleOverrides)) hr.scheduleOverrides=hr.scheduleOverrides.filter((entry)=>!isRecord(entry)||!demoEmployeeIds.has(String(entry.employeeId ?? '')))
    if(Array.isArray(hr.weeklySchedulePublications)) hr.weeklySchedulePublications=hr.weeklySchedulePublications.filter((entry)=>!isRecord(entry)||!String(entry.id ?? '').startsWith('schedule-publication-All-2026-07-'))
  }
  const payroll=isRecord(state.payroll)?state.payroll:undefined
  if(payroll&&Array.isArray(payroll.compensations)) payroll.compensations=payroll.compensations.filter((entry)=>!isRecord(entry)||!(String(entry.createdBy ?? '')==='Demo setup'||String(entry.id ?? '').startsWith('comp-emp-')))
  const vouchers=isRecord(state.vouchers)?state.vouchers:undefined
  if(vouchers&&Array.isArray(vouchers.vouchers)) vouchers.vouchers=vouchers.vouchers.filter((entry)=>!isRecord(entry)||String(entry.id ?? '')!=='voucher-vip10')
  const customers=isRecord(state.customers)?state.customers:undefined
  if(customers&&Array.isArray(customers.customers)) customers.customers=customers.customers.filter((entry)=>!isRecord(entry)||!demoCustomerIds.has(String(entry.id ?? '')))
  snapshot.version=25
  return snapshot
}

const MIGRATIONS: Record<number,(snapshot:DataSlice)=>DataSlice>={1:migrate1to2,2:migrate2to3,3:migrate3to4,4:migrate4to5,5:migrate5to6,6:migrate6to7,7:migrate7to8,8:migrate8to9,9:migrate9to10,10:migrate10to11,11:migrate11to12,12:migrate12to13,13:migrate13to14,14:migrate14to15,15:migrate15to16,16:migrate16to17,17:migrate17to18,18:migrate18to19,19:migrate19to20,20:migrate20to21,21:migrate21to22,22:migrate22to23,23:migrate23to24,24:migrate24to25}

export const migrateOperationalSnapshot = (value: unknown): OperationalSnapshot | null => {
  if(!isRecord(value)||!isRecord(value.state)||typeof value.version!=='number'||value.version<1||value.version>OPERATIONAL_SCHEMA_VERSION)return null
  let snapshot=structuredClone(value) as DataSlice
  while((snapshot.version as number)<OPERATIONAL_SCHEMA_VERSION){const migration=MIGRATIONS[snapshot.version as number];if(!migration)return null;snapshot=migration(snapshot)}
  if(typeof snapshot.revision!=='number') snapshot.revision=0
  if(typeof snapshot.savedAt!=='string') snapshot.savedAt=new Date(0).toISOString()
  return snapshot as unknown as OperationalSnapshot
}

let isHydrating=false; let saveTimer:ReturnType<typeof setTimeout>|undefined; let unsubscribeExternal:(()=>void)|undefined; let unsubscribeStores:Array<()=>void>=[]
const applySlice=(slice:unknown,store:{setState:(partial:never,replace?:false)=>void})=>{if(isRecord(slice))store.setState(slice as never,false)}
const updateHealth=(partial:PersistenceHealthPatch)=>usePersistenceHealthStore.getState().setHealth(partial)

export const hydrateOperationalState = async (): Promise<boolean> => {
  const raw=await prototypeOperationalStateRepository.load(); if(!raw)return false
  let parsed:unknown; try{parsed=JSON.parse(raw)}catch{updateHealth({status:'error',message:'Saved operational data is not valid JSON.'});return false}
  const snapshot=migrateOperationalSnapshot(parsed); if(!snapshot){updateHealth({status:'error',message:'Saved operational data uses an unsupported schema.'});return false}
  isHydrating=true
  try{applySlice(snapshot.state.settings,useSettingsStore);useSettingsStore.setState({settingsHasUnsavedChanges:false});applySlice(snapshot.state.hr,useHrStore);applySlice(snapshot.state.payroll,usePayrollStore);applySlice(snapshot.state.finance,useFinanceStore);applySlice(snapshot.state.stock,useStockStore);applySlice(snapshot.state.catalog,useCatalogStore);applySlice(snapshot.state.vouchers,useVoucherStore);applySlice(snapshot.state.orders,useOrdersStore);applySlice(snapshot.state.customers,useCustomerStore);applySlice(snapshot.state.notifications,useNotificationStore);applySlice(snapshot.state.orderActivities,useOrderRuntimeStore);applySlice(snapshot.state.auditLog,useAuditLogStore);if(Array.isArray(snapshot.state.orderDrafts))writeOrderDraftRecords(snapshot.state.orderDrafts);lastKnownRevision=snapshot.revision;localMutationSinceHydrate=false;updateHealth({status:'saved',lastSavedAt:snapshot.savedAt,schemaVersion:snapshot.version,revision:snapshot.revision,storageBytes:new Blob([raw]).size,message:undefined})}finally{isHydrating=false}
  return true
}

export const persistOperationalStateNow = async (): Promise<void> => {
  if(isHydrating)return
  updateHealth({status:'saving',message:undefined})
  try{const raw=await prototypeOperationalStateRepository.load();if(raw){const current=migrateOperationalSnapshot(JSON.parse(raw));if(current&&current.revision>lastKnownRevision){updateHealth({status:'conflict',revision:current.revision,message:'Newer data exists in another tab. Reload that data before saving.'});return}}
    const snapshot=createOperationalSnapshot();const serialized=JSON.stringify(snapshot);await prototypeOperationalStateRepository.save(serialized);lastKnownRevision=snapshot.revision;localMutationSinceHydrate=false;updateHealth({status:'saved',lastSavedAt:snapshot.savedAt,schemaVersion:snapshot.version,revision:snapshot.revision,storageBytes:new Blob([serialized]).size,message:undefined})
  }catch(error){updateHealth({status:'error',message:error instanceof Error?error.message:'Changes could not be saved locally.'})}
}
const scheduleSave=()=>{if(isHydrating)return;localMutationSinceHydrate=true;if(saveTimer)clearTimeout(saveTimer);saveTimer=setTimeout(()=>{saveTimer=undefined;void persistOperationalStateNow()},PERSIST_DEBOUNCE_MS)}
export const startOperationalPersistence=():()=>void=>{if(unsubscribeStores.length)return stopOperationalPersistence;unsubscribeStores=[useSettingsStore,useHrStore,usePayrollStore,useFinanceStore,useStockStore,useCatalogStore,useVoucherStore,useOrdersStore,useCustomerStore,useNotificationStore,useOrderRuntimeStore,useAuditLogStore].map((store)=>store.subscribe(scheduleSave));unsubscribeExternal=prototypeOperationalStateRepository.subscribe(()=>{if(localMutationSinceHydrate){updateHealth({status:'conflict',message:'Another tab saved newer data while this tab has local changes.'});return}void hydrateOperationalState()});return stopOperationalPersistence}
export const stopOperationalPersistence=()=>{if(saveTimer)clearTimeout(saveTimer);saveTimer=undefined;unsubscribeStores.forEach((u)=>u());unsubscribeStores=[];unsubscribeExternal?.();unsubscribeExternal=undefined}
export const initializeOperationalPersistence=async():Promise<void>=>{await hydrateOperationalState();startOperationalPersistence()}
export const reconnectOperationalPersistence=async():Promise<void>=>{stopOperationalPersistence();await hydrateOperationalState();startOperationalPersistence()}

export const exportOperationalBackup = (): string => JSON.stringify(createOperationalSnapshot(lastKnownRevision), null, 2)
export const restoreOperationalBackup = async (raw:string):Promise<void>=>{let parsed:unknown;try{parsed=JSON.parse(raw)}catch{throw new Error('Backup is not valid JSON.')}const snapshot=migrateOperationalSnapshot(parsed);if(!snapshot)throw new Error('Backup schema is unsupported or incomplete.');snapshot.revision=lastKnownRevision+1;snapshot.savedAt=new Date().toISOString();await prototypeOperationalStateRepository.save(JSON.stringify(snapshot));await hydrateOperationalState()}
export const resetOperationalDemoData = async ():Promise<void>=>{
  isHydrating=true
  try{
    useSettingsStore.setState(useSettingsStore.getInitialState(),true)
    useHrStore.setState(useHrStore.getInitialState(),true)
    usePayrollStore.setState(usePayrollStore.getInitialState(),true)
    useFinanceStore.setState(useFinanceStore.getInitialState(),true)
    useStockStore.setState(useStockStore.getInitialState(),true)
    useCatalogStore.setState(useCatalogStore.getInitialState(),true)
    useVoucherStore.setState(useVoucherStore.getInitialState(),true)
    useOrdersStore.setState(useOrdersStore.getInitialState(),true)
    useCustomerStore.setState(useCustomerStore.getInitialState(),true)
    useNotificationStore.setState(useNotificationStore.getInitialState(),true)
    useOrderRuntimeStore.setState(useOrderRuntimeStore.getInitialState(),true)
    useAuditLogStore.setState(useAuditLogStore.getInitialState(),true)
    clearOrderDraftRecords()
    await Promise.all([
      prototypeOperationalStateRepository.remove(),
      prototypeOperationalStateRepository.removeLegacyResources([
        'orders',
        'customers',
        'notifications',
        'order-activities',
        'audit-log',
      ]),
    ])
    lastKnownRevision=0;localMutationSinceHydrate=false
    updateHealth({status:'idle',lastSavedAt:undefined,revision:0,storageBytes:0,message:'Operational data was reset to a clean state.'})
  }finally{isHydrating=false}
}
