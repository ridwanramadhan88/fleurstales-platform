const json = (value) => JSON.stringify(value ?? null)
const array = (value) => Array.isArray(value) ? value : []
const recordId = (value, index, prefix) => String(value?.id ?? value?.orderNumber ?? value?.code ?? `${prefix}-${index}`)
const bool = (value) => value === true ? 1 : value === false ? 0 : null
const num = (value) => Number.isFinite(Number(value)) ? Number(value) : null

const TABLES_TO_CLEAR = [
  'order_items', 'product_variants', 'order_activities',
  'branches', 'employees', 'customers', 'orders',
  'product_categories', 'products',
  'inventory_items', 'inventory_transfers', 'inventory_movements', 'inventory_reservations',
  'finance_transactions', 'vouchers', 'notifications', 'application_audit_events',
  'attendance_records', 'employee_schedules', 'schedule_publications', 'schedule_revisions',
  'attendance_review_cases', 'employee_point_entries',
  'payroll_periods', 'employee_compensations', 'employee_payrolls', 'payroll_reviews',
  'payroll_proposals', 'payroll_proposal_reviews', 'payroll_schedule_adjustments',
  'store_settings',
]

const replaceSimpleCollection = (db, { table, rows, prefix, columns }) => {
  const columnNames = ['id', ...Object.keys(columns), 'data_json']
  const placeholders = columnNames.map(() => '?').join(', ')
  const statement = db.prepare(`INSERT INTO ${table} (${columnNames.join(', ')}) VALUES (${placeholders})`)
  rows.forEach((row, index) => {
    if (!row || typeof row !== 'object') return
    statement.run(recordId(row, index, prefix), ...Object.values(columns).map((resolve) => resolve(row)), json(row))
  })
}

export const materializeOperationalSnapshot = (db, snapshot) => {
  const state = snapshot?.state && typeof snapshot.state === 'object' ? snapshot.state : {}
  const timestamp = new Date().toISOString()

  db.prepare('DELETE FROM domain_slices').run()
  const insertSlice = db.prepare('INSERT INTO domain_slices (slice_key, data_json, updated_at) VALUES (?, ?, ?)')
  for (const [sliceKey, value] of Object.entries(state)) insertSlice.run(sliceKey, json(value), timestamp)

  for (const table of TABLES_TO_CLEAR) db.prepare(`DELETE FROM ${table}`).run()

  if (state.settings && typeof state.settings === 'object') {
    db.prepare('INSERT INTO store_settings (id, data_json, updated_at) VALUES (?, ?, ?)').run('current', json(state.settings), timestamp)
  }

  replaceSimpleCollection(db, {
    table: 'branches', rows: array(state.settings?.branches), prefix: 'branch',
    columns: { name: (row) => row.name ?? null, is_active: (row) => bool(row.isActive) },
  })
  replaceSimpleCollection(db, {
    table: 'employees', rows: array(state.hr?.employees), prefix: 'employee',
    columns: {
      branch_id: (row) => row.branchId ?? row.branch ?? null,
      system_role: (row) => row.systemRole ?? null,
      status: (row) => row.status ?? null,
      username: (row) => row.username ?? null,
    },
  })
  replaceSimpleCollection(db, {
    table: 'customers', rows: array(state.customers?.customers), prefix: 'customer',
    columns: {
      name: (row) => row.name ?? null,
      phone: (row) => row.phone ?? null,
      preferred_branch: (row) => row.preferredBranch ?? null,
    },
  })

  const orderRows = array(state.orders?.orders)
  replaceSimpleCollection(db, {
    table: 'orders', rows: orderRows, prefix: 'order',
    columns: {
      order_number: (row) => row.orderNumber ?? recordId(row, 0, 'order'),
      customer_id: (row) => row.customerId ?? null,
      branch_id: (row) => row.branch ?? null,
      status: (row) => row.status ?? null,
      finance_verified: (row) => bool(row.financeVerified),
      revision: (row) => num(row.revision) ?? 0,
      updated_at: (row) => row.updatedAt ?? null,
    },
  })
  const insertOrderItem = db.prepare('INSERT INTO order_items (id, order_id, product_id, variant_id, quantity, data_json) VALUES (?, ?, ?, ?, ?, ?)')
  orderRows.forEach((order, orderIndex) => {
    const orderId = recordId(order, orderIndex, 'order')
    array(order?.items).forEach((item, itemIndex) => insertOrderItem.run(
      String(item?.id ?? `${orderId}:item:${itemIndex}`),
      orderId,
      item?.productId ?? null,
      item?.variantId ?? null,
      num(item?.quantity),
      json(item),
    ))
  })

  const activities = state.orderActivities?.activities && typeof state.orderActivities.activities === 'object'
    ? state.orderActivities.activities
    : {}
  const insertActivity = db.prepare('INSERT INTO order_activities (id, order_number, kind, occurred_at, data_json) VALUES (?, ?, ?, ?, ?)')
  for (const [orderNumber, entries] of Object.entries(activities)) {
    array(entries).forEach((entry, index) => insertActivity.run(
      recordId(entry, index, `${orderNumber}:activity`), orderNumber, entry?.kind ?? null, entry?.at ?? null, json(entry),
    ))
  }

  replaceSimpleCollection(db, {
    table: 'product_categories', rows: array(state.catalog?.categories), prefix: 'category',
    columns: { name: (row) => row.name ?? null, prefix: (row) => row.prefix ?? null },
  })
  const products = array(state.catalog?.products)
  replaceSimpleCollection(db, {
    table: 'products', rows: products, prefix: 'product',
    columns: {
      product_code: (row) => row.productId ?? null,
      category_id: (row) => row.categoryId ?? row.category ?? null,
      is_active: (row) => bool(row.isActive),
    },
  })
  const insertVariant = db.prepare('INSERT INTO product_variants (id, product_id, sku, status, data_json) VALUES (?, ?, ?, ?, ?)')
  products.forEach((product, productIndex) => {
    const productId = recordId(product, productIndex, 'product')
    array(product?.variants).forEach((variant, variantIndex) => insertVariant.run(
      String(variant?.id ?? `${productId}:variant:${variantIndex}`), productId, variant?.sku ?? null, variant?.status ?? null, json(variant),
    ))
  })

  replaceSimpleCollection(db, {
    table: 'inventory_items', rows: array(state.stock?.items), prefix: 'stock',
    columns: {
      branch_id: (row) => row.branch ?? null,
      category: (row) => row.category ?? null,
      available_qty: (row) => num(row.availableQty),
      reserved_qty: (row) => num(row.reservedQty),
    },
  })
  replaceSimpleCollection(db, {
    table: 'inventory_transfers', rows: array(state.stock?.transfers), prefix: 'transfer',
    columns: {
      item_id: (row) => row.itemId ?? null,
      from_branch: (row) => row.fromBranch ?? null,
      to_branch: (row) => row.toBranch ?? null,
      status: (row) => row.status ?? null,
    },
  })
  replaceSimpleCollection(db, {
    table: 'inventory_movements', rows: array(state.stock?.events), prefix: 'movement',
    columns: {
      item_id: (row) => row.itemId ?? null,
      kind: (row) => row.kind ?? null,
      quantity: (row) => num(row.quantity),
      occurred_at: (row) => row.createdAt ?? null,
    },
  })
  replaceSimpleCollection(db, {
    table: 'inventory_reservations', rows: array(state.stock?.reservations), prefix: 'reservation',
    columns: {
      order_id: (row) => row.orderId ?? null,
      branch_id: (row) => row.branch ?? null,
      status: (row) => row.status ?? null,
    },
  })

  replaceSimpleCollection(db, {
    table: 'finance_transactions', rows: array(state.finance?.transactions), prefix: 'transaction',
    columns: {
      order_number: (row) => row.orderNumber ?? null,
      branch_id: (row) => row.branch ?? null,
      type: (row) => row.type ?? null,
      category: (row) => row.category ?? null,
      status: (row) => row.status ?? null,
      amount: (row) => num(row.amount),
      occurred_at: (row) => row.createdAt ?? row.occurredAt ?? null,
    },
  })
  replaceSimpleCollection(db, {
    table: 'vouchers', rows: array(state.vouchers?.vouchers), prefix: 'voucher',
    columns: { code: (row) => row.code ?? null, status: (row) => row.status ?? (row.isActive === false ? 'inactive' : 'active') },
  })
  replaceSimpleCollection(db, {
    table: 'notifications', rows: array(state.notifications?.notifications), prefix: 'notification',
    columns: { type: (row) => row.type ?? row.severity ?? null, created_at: (row) => row.createdAt ?? null },
  })
  replaceSimpleCollection(db, {
    table: 'application_audit_events', rows: array(state.auditLog?.events), prefix: 'audit',
    columns: {
      entity_type: (row) => row.entityType ?? null,
      entity_id: (row) => row.entityId ?? null,
      action: (row) => row.action ?? null,
      outcome: (row) => row.outcome ?? null,
      actor_id: (row) => row.actor?.employeeId ?? null,
      occurred_at: (row) => row.occurredAt ?? null,
    },
  })

  replaceSimpleCollection(db, {
    table: 'attendance_records', rows: array(state.hr?.attendance), prefix: 'attendance',
    columns: {
      employee_id: (row) => row.employeeId ?? null,
      branch_id: (row) => row.branchId ?? row.branch ?? null,
      work_date: (row) => row.date ?? row.workDate ?? null,
      status: (row) => row.status ?? null,
    },
  })
  const schedules = [
    ...array(state.hr?.employeeDefaultSchedules).map((item) => ({ ...item, __source: 'default' })),
    ...array(state.hr?.scheduleOverrides).map((item) => ({ ...item, __source: 'override' })),
  ]
  replaceSimpleCollection(db, {
    table: 'employee_schedules', rows: schedules, prefix: 'schedule',
    columns: {
      employee_id: (row) => row.employeeId ?? null,
      branch_id: (row) => row.branchId ?? row.branch ?? null,
      schedule_date: (row) => row.date ?? row.effectiveFrom ?? null,
      source: (row) => row.__source ?? null,
    },
  })
  replaceSimpleCollection(db, {
    table: 'schedule_publications', rows: array(state.hr?.weeklySchedulePublications), prefix: 'publication',
    columns: { branch_id: (row) => row.branchId ?? null, week_start: (row) => row.weekStart ?? null, status: (row) => row.status ?? null },
  })
  replaceSimpleCollection(db, {
    table: 'schedule_revisions', rows: array(state.hr?.scheduleRevisions), prefix: 'schedule-revision',
    columns: { branch_id: (row) => row.branchId ?? null, effective_from: (row) => row.effectiveFrom ?? row.createdAt ?? null },
  })
  replaceSimpleCollection(db, {
    table: 'attendance_review_cases', rows: array(state.hr?.attendanceReviewCases), prefix: 'attendance-review',
    columns: { employee_id: (row) => row.employeeId ?? null, status: (row) => row.status ?? null },
  })
  replaceSimpleCollection(db, {
    table: 'employee_point_entries', rows: array(state.hr?.employeePointEntries), prefix: 'points',
    columns: {
      employee_id: (row) => row.employeeId ?? null,
      status: (row) => row.status ?? null,
      points: (row) => num(row.points ?? row.value),
      occurred_at: (row) => row.createdAt ?? row.occurredAt ?? null,
    },
  })

  replaceSimpleCollection(db, {
    table: 'payroll_periods', rows: array(state.payroll?.periods), prefix: 'payroll-period',
    columns: { status: (row) => row.status ?? null, start_date: (row) => row.startDate ?? row.periodStart ?? null, end_date: (row) => row.endDate ?? row.periodEnd ?? null },
  })
  replaceSimpleCollection(db, {
    table: 'employee_compensations', rows: array(state.payroll?.compensations), prefix: 'compensation',
    columns: { employee_id: (row) => row.employeeId ?? null, effective_from: (row) => row.effectiveFrom ?? null },
  })
  replaceSimpleCollection(db, {
    table: 'employee_payrolls', rows: array(state.payroll?.employeePayrolls), prefix: 'employee-payroll',
    columns: {
      employee_id: (row) => row.employeeId ?? null,
      payroll_period_id: (row) => row.payrollPeriodId ?? null,
      status: (row) => row.status ?? null,
      final_payroll: (row) => num(row.finalPayrollIdr),
    },
  })
  replaceSimpleCollection(db, {
    table: 'payroll_reviews', rows: array(state.payroll?.payrollReviews), prefix: 'payroll-review',
    columns: { payroll_id: (row) => row.payrollDraftId ?? row.employeePayrollId ?? null, decision: (row) => row.decision ?? null },
  })
  replaceSimpleCollection(db, {
    table: 'payroll_proposals', rows: array(state.payroll?.payrollProposals), prefix: 'payroll-proposal',
    columns: { payroll_period_id: (row) => row.payrollPeriodId ?? null, status: (row) => row.status ?? null },
  })
  replaceSimpleCollection(db, {
    table: 'payroll_proposal_reviews', rows: array(state.payroll?.payrollProposalReviews), prefix: 'proposal-review',
    columns: { payroll_proposal_id: (row) => row.payrollProposalId ?? null, decision: (row) => row.decision ?? null },
  })
  replaceSimpleCollection(db, {
    table: 'payroll_schedule_adjustments', rows: array(state.payroll?.payrollScheduleAdjustments), prefix: 'payroll-adjustment',
    columns: { payroll_period_id: (row) => row.payrollPeriodId ?? null, status: (row) => row.status ?? null },
  })
}

export const clearOperationalMaterialization = (db) => {
  db.prepare('DELETE FROM domain_slices').run()
  for (const table of TABLES_TO_CLEAR) db.prepare(`DELETE FROM ${table}`).run()
}
