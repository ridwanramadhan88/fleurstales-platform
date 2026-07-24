PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  branch_id TEXT,
  position TEXT,
  hire_date TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS operational_state_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  schema_version INTEGER NOT NULL,
  snapshot_revision INTEGER NOT NULL,
  resource_revision INTEGER NOT NULL,
  saved_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS domain_slices (
  slice_key TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS compatibility_resources (
  resource_key TEXT PRIMARY KEY,
  value TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS uploaded_files (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  original_name TEXT,
  stored_name TEXT NOT NULL,
  public_path TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by TEXT,
  uploaded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_kind ON uploaded_files(kind);

CREATE TABLE IF NOT EXISTS server_audit_events (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  actor_id TEXT,
  actor_role TEXT,
  branch_id TEXT,
  occurred_at TEXT NOT NULL,
  revision INTEGER,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_server_audit_occurred ON server_audit_events(occurred_at DESC);

CREATE TABLE IF NOT EXISTS store_settings (
  id TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  name TEXT,
  is_active INTEGER,
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  branch_id TEXT,
  system_role TEXT,
  status TEXT,
  username TEXT,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees(branch_id);
CREATE INDEX IF NOT EXISTS idx_employees_role ON employees(system_role);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT,
  phone TEXT,
  preferred_branch TEXT,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL,
  customer_id TEXT,
  branch_id TEXT,
  status TEXT,
  finance_verified INTEGER,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT,
  data_json TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_branch_status ON orders(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT,
  variant_id TEXT,
  quantity REAL,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_activities (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL,
  kind TEXT,
  occurred_at TEXT,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_activities_order ON order_activities(order_number, occurred_at DESC);

CREATE TABLE IF NOT EXISTS product_categories (
  id TEXT PRIMARY KEY,
  name TEXT,
  prefix TEXT,
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  product_code TEXT,
  category_id TEXT,
  is_active INTEGER,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT,
  status TEXT,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);

CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  branch_id TEXT,
  category TEXT,
  available_qty REAL,
  reserved_qty REAL,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inventory_items_branch ON inventory_items(branch_id);

CREATE TABLE IF NOT EXISTS inventory_transfers (
  id TEXT PRIMARY KEY,
  item_id TEXT,
  from_branch TEXT,
  to_branch TEXT,
  status TEXT,
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY,
  item_id TEXT,
  kind TEXT,
  quantity REAL,
  occurred_at TEXT,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_item ON inventory_movements(item_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS inventory_reservations (
  id TEXT PRIMARY KEY,
  order_id TEXT,
  branch_id TEXT,
  status TEXT,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_order ON inventory_reservations(order_id);

CREATE TABLE IF NOT EXISTS finance_transactions (
  id TEXT PRIMARY KEY,
  order_number TEXT,
  branch_id TEXT,
  type TEXT,
  category TEXT,
  status TEXT,
  amount REAL,
  occurred_at TEXT,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_order ON finance_transactions(order_number);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_branch_status ON finance_transactions(branch_id, status);

CREATE TABLE IF NOT EXISTS vouchers (
  id TEXT PRIMARY KEY,
  code TEXT,
  status TEXT,
  data_json TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers(code);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  type TEXT,
  created_at TEXT,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

CREATE TABLE IF NOT EXISTS application_audit_events (
  id TEXT PRIMARY KEY,
  entity_type TEXT,
  entity_id TEXT,
  action TEXT,
  outcome TEXT,
  actor_id TEXT,
  occurred_at TEXT,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_application_audit_entity ON application_audit_events(entity_type, entity_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS attendance_records (
  id TEXT PRIMARY KEY,
  employee_id TEXT,
  branch_id TEXT,
  work_date TEXT,
  status TEXT,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance_records(employee_id, work_date);

CREATE TABLE IF NOT EXISTS employee_schedules (
  id TEXT PRIMARY KEY,
  employee_id TEXT,
  branch_id TEXT,
  schedule_date TEXT,
  source TEXT,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_employee_schedules_date ON employee_schedules(schedule_date, branch_id);

CREATE TABLE IF NOT EXISTS schedule_publications (
  id TEXT PRIMARY KEY,
  branch_id TEXT,
  week_start TEXT,
  status TEXT,
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedule_revisions (
  id TEXT PRIMARY KEY,
  branch_id TEXT,
  effective_from TEXT,
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance_review_cases (
  id TEXT PRIMARY KEY,
  employee_id TEXT,
  status TEXT,
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employee_point_entries (
  id TEXT PRIMARY KEY,
  employee_id TEXT,
  status TEXT,
  points REAL,
  occurred_at TEXT,
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payroll_periods (
  id TEXT PRIMARY KEY,
  status TEXT,
  start_date TEXT,
  end_date TEXT,
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employee_compensations (
  id TEXT PRIMARY KEY,
  employee_id TEXT,
  effective_from TEXT,
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employee_payrolls (
  id TEXT PRIMARY KEY,
  employee_id TEXT,
  payroll_period_id TEXT,
  status TEXT,
  final_payroll REAL,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_employee_payrolls_period ON employee_payrolls(payroll_period_id, status);

CREATE TABLE IF NOT EXISTS payroll_reviews (
  id TEXT PRIMARY KEY,
  payroll_id TEXT,
  decision TEXT,
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payroll_proposals (
  id TEXT PRIMARY KEY,
  payroll_period_id TEXT,
  status TEXT,
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payroll_proposal_reviews (
  id TEXT PRIMARY KEY,
  payroll_proposal_id TEXT,
  decision TEXT,
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payroll_schedule_adjustments (
  id TEXT PRIMARY KEY,
  payroll_period_id TEXT,
  status TEXT,
  data_json TEXT NOT NULL
);
