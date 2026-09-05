/**
 * Canonical TypeScript representation of the Phase 2 Supabase schema.
 *
 * This file is deliberately dependency-free so both applications can share the
 * exact same contract before @supabase/supabase-js is installed/connected.
 * Once a live project exists, generated Supabase CLI types can replace this
 * file without changing the repository contracts around it.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type StaffRole = 'owner' | 'admin' | 'finance' | 'hr' | 'florist'
export type CatalogMaterial = 'fresh' | 'artificial'
export type CatalogVariantStatus = 'active' | 'inactive'
export type PricingType = 'Fixed' | 'Starts From'
export type CatalogOrderType = 'Catalog' | 'Custom'
export type CustomerCreatedSource = 'storefront' | 'admin'
export type OrderSource = 'whatsapp' | 'walk_in' | 'customer_app'
export type OrderFulfillment = 'delivery' | 'pickup'
export type OrderStatus =
  | 'pending_verification'
  | 'confirmed'
  | 'processing'
  | 'ready'
  | 'delivering'
  | 'delivered'
  | 'picked_up'
  | 'cancelled'
  | 'failed'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'refund_pending' | 'refunded'
export type PaymentMethod = 'cash' | 'transfer'
export type PaymentAccountType = 'bank_transfer' | 'ewallet'
export type FinanceVerificationStatus = 'rejected' | 'review'
export type OrderPaymentEventType =
  | 'payment_received'
  | 'payment_reversed'
  | 'payment_status_adjusted'
  | 'refund_initiated'
  | 'refund_completed'
  | 'refund_cancelled'
export type OrderActivityKind = 'created' | 'status' | 'payment' | 'assignment' | 'fulfillment' | 'note' | 'system'

export interface StaffAccessProfileRow {
  user_id: string
  employee_id: string | null
  display_name: string
  role: StaffRole
  username: string | null
  email: string | null
  branch_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface StoreProfileRow {
  id: 'primary'
  store_name: string
  legal_name: string | null
  logo_url: string | null
  phone: string
  whatsapp: string
  email: string
  address: string
  currency: 'IDR'
  timezone: 'Asia/Jakarta'
  created_at: string
  updated_at: string
}

export interface OperationalStateRow {
  id: string
  revision: number
  snapshot: Json
  updated_by: string | null
  updated_at: string
}

export interface BranchRow {
  id: string
  name: string
  code: string
  address: string
  phone: string
  is_active: boolean
  is_default: boolean
  sort_order: number
  delivery_fee_idr: number
  opening_hours: Json
  latitude: number | null
  longitude: number | null
  manager_employee_id: string | null
  daily_order_limit: number | null
  created_at: string
  updated_at: string
}

export interface PublicPaymentAccountRow {
  id: string
  bank_name: string
  account_number: string
  account_holder: string
  type: PaymentAccountType
  is_active: boolean
  is_default: boolean
  display_order: number
  is_customer_visible: boolean
  branch_ids: string[]
  created_at: string
  updated_at: string
}

export interface StorefrontPaymentSettingsRow {
  id: 'primary'
  payment_instructions: string
  created_at: string
  updated_at: string
}

export interface OccasionRow {
  id: string
  name: string
  prefix: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ArrangementTypeRow {
  name: string
  sort_order: number
  created_at: string
}

export interface ProductRow {
  id: string
  product_code: string
  primary_occasion_id: string | null
  material: CatalogMaterial
  name: string
  description: string | null
  product_type: string | null
  collection_series: string | null
  pricing_type: PricingType | null
  order_type: CatalogOrderType | null
  is_featured: boolean
  is_active: boolean
  promo_label: string | null
  original_price_idr: number | null
  is_customizable: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ProductOccasionRow {
  product_id: string
  occasion_id: string
  sort_order: number
}

export interface ProductVariantRow {
  id: string
  product_id: string
  sku: string
  size: string
  price_idr: number
  status: CatalogVariantStatus
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ProductVariantCostRow {
  variant_id: string
  cost_idr: number | null
  updated_at: string
}

export interface ProductImageRow {
  id: string
  product_id: string
  storage_path: string
  alt_text: string | null
  sort_order: number
  is_primary: boolean
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp'
  byte_size: number | null
  width: number | null
  height: number | null
  created_at: string
  updated_at: string
}

export interface SizeGuideTemplateRow {
  id: string
  name: string
  storage_path: string
  mime_type: 'image/jpeg'
  byte_size: number
  width: 800
  height: 800
  created_at: string
  updated_at: string
}

export interface SizeGuideTargetRow {
  id: string
  template_id: string
  scope: 'product_type' | 'product'
  product_type: string | null
  product_id: string | null
  created_at: string
}

export interface CatalogSyncStateRow {
  id: 'primary'
  revision: number
  updated_at: string
  updated_by: string | null
}

export interface StoreSyncStateRow {
  id: 'primary'
  revision: number
  updated_at: string
  updated_by: string | null
}

export interface CatalogProductCodeTombstoneRow {
  product_code: string
  deleted_product_id: string | null
  deleted_at: string
  deleted_by: string | null
}

export interface CustomerRow {
  id: string
  revision: number
  name: string
  whatsapp_number: string
  normalized_whatsapp_number: string
  email: string | null
  birthday: string | null
  preferred_branch_id: string | null
  tags: string[]
  notes: string | null
  promo_code: string | null
  created_source: CustomerCreatedSource
  last_order_at: string | null
  created_at: string
  updated_at: string
}

export interface CustomerAddressRow {
  id: string
  customer_id: string
  label: string | null
  recipient_name: string | null
  whatsapp_number: string | null
  address: string
  city: string | null
  postal_code: string | null
  delivery_notes: string | null
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface OrderSequenceRow {
  branch_id: string
  sequence_year: number
  last_sequence: number
  updated_at: string
}

export interface OrderRow {
  id: string
  order_number: string
  revision: number
  storefront_idempotency_key: string | null
  public_tracking_id: string
  customer_id: string | null
  customer_name_snapshot: string
  customer_whatsapp_snapshot: string | null
  customer_email_snapshot: string | null
  customer_profile_suggestions: Json | null
  source: OrderSource
  fulfillment: OrderFulfillment
  status: OrderStatus
  branch_id: string
  total_idr: number
  items_subtotal_idr: number
  discount_idr: number
  delivery_fee_idr: number
  payment_status: PaymentStatus
  payment_method: PaymentMethod | null
  paid_amount_idr: number
  refund_amount_idr: number | null
  refund_reason: string | null
  refund_initiated_by: string | null
  refund_initiated_at: string | null
  refund_completed_by: string | null
  refund_completed_at: string | null
  refund_cancelled_by: string | null
  refund_cancelled_at: string | null
  refund_cancellation_reason: string | null
  schedule_label: string | null
  schedule_date: string | null
  schedule_time: string | null
  requested_pickup_date: string | null
  requested_pickup_time: string | null
  actual_picked_up_at: string | null
  finish_photo_url: string | null
  finish_photo_uploaded_by: string | null
  finish_photo_uploaded_at: string | null
  payment_proof_url: string | null
  order_note: string | null
  greeting_message: string | null
  greeting_card_name: string | null
  delivery_address: string | null
  delivery_instructions: string | null
  promo_code: string | null
  florist_display_name: string | null
  florist_assigned_employee_id: string | null
  florist_assigned_at: string | null
  florist_assigned_for_date: string | null
  florist_assigned_for_time: string | null
  florist_assigned_by_employee_id: string | null
  florist_assigned_by_name: string | null
  florist_schedule_override: boolean
  florist_schedule_override_reason: string | null
  florist_scheduled_branch_id: string | null
  florist_assigned_branch_id: string | null
  florist_scheduled_shift_start: string | null
  florist_scheduled_shift_end: string | null
  processing_started_at: string | null
  admin_handled_employee_id: string | null
  admin_handled_by_name: string | null
  completed_at: string | null
  finance_reference_code: string | null
  finance_verified: boolean
  finance_verified_by: string | null
  finance_verified_at: string | null
  finance_verification_status: FinanceVerificationStatus | null
  finance_verification_note: string | null
  finance_verification_actor: string | null
  finance_verification_at: string | null
  finance_resubmitted_by: string | null
  finance_resubmitted_at: string | null
  finance_resubmission_note: string | null
  finance_submission_revision: number | null
  cancellation_reason: string | null
  cancelled_by: string | null
  cancelled_at: string | null
  pending_change_request: Json | null
  edit_unlocked: boolean
  created_at: string
  updated_at: string
}

export interface OrderItemRow {
  id: string
  order_id: string
  product_id: string | null
  variant_id: string | null
  product_code_snapshot: string | null
  product_name_snapshot: string
  variant_sku_snapshot: string | null
  variant_size_snapshot: string | null
  quantity: number
  unit_price_idr: number
  created_at: string
}

export interface OrderPaymentEventRow {
  id: string
  order_id: string
  type: OrderPaymentEventType
  amount_idr: number
  previous_paid_amount_idr: number
  resulting_paid_amount_idr: number
  resulting_status: PaymentStatus
  method: PaymentMethod | null
  reference: string | null
  proof_id: string | null
  note: string | null
  actor_id: string | null
  actor_name: string
  occurred_at: string
  idempotency_key: string
  ledger_transaction_id: string | null
  created_at: string
}

export interface OrderActivityRow {
  id: string
  order_id: string
  kind: OrderActivityKind
  description: string
  actor: string
  occurred_at: string
  metadata: Json
  created_at: string
}

export interface ReplaceCatalogSnapshotRpcArgs {
  p_base_revision: number
  p_occasions: Json
  p_products: Json
}

export interface ReplaceProductImagesMetadataRpcArgs {
  p_base_revision: number
  p_product_id: string
  p_images: Json
}

export interface ReplaceSizeGuideLibraryRpcArgs {
  p_templates: Json
  p_targets: Json
}

export interface ReplaceArrangementTypesRpcArgs {
  p_names: Json
}

export interface ReplacePublicStoreSnapshotRpcArgs {
  p_base_revision: number
  p_profile: Json
  p_branches: Json
  p_payment_accounts: Json
  p_payment_instructions: string
}

export interface SaveCustomerProfileRpcArgs {
  p_customer: Json
  p_base_revision?: number | null
}

export interface DeleteCustomerProfileRpcArgs {
  p_customer_id: string
  p_base_revision: number
}

export interface CreateStorefrontOrderRpcArgs {
  p_idempotency_key: string
  p_customer: Json
  p_branch_id: string
  p_fulfillment: OrderFulfillment
  p_schedule_date: string
  p_schedule_time: string
  p_items: Json
  p_delivery_address?: string | null
  p_delivery_instructions?: string | null
  p_order_note?: string | null
  p_greeting_message?: string | null
  p_greeting_card_name?: string | null
  p_payment_method?: PaymentMethod | null
  p_promo_code?: string | null
}

export type TableDefinition<Row> = {
  Row: Row
  /** Phase 3 placeholder. Live project-generated types will make required insert fields exact. */
  Insert: Partial<Row>
  Update: Partial<Row>
  Relationships: []
}

export interface Database {
  public: {
    Tables: {
      staff_access_profiles: TableDefinition<StaffAccessProfileRow>
      store_profile: TableDefinition<StoreProfileRow>
      branches: TableDefinition<BranchRow>
      public_payment_accounts: TableDefinition<PublicPaymentAccountRow>
      storefront_payment_settings: TableDefinition<StorefrontPaymentSettingsRow>
      occasions: TableDefinition<OccasionRow>
      arrangement_types: TableDefinition<ArrangementTypeRow>
      products: TableDefinition<ProductRow>
      product_occasions: TableDefinition<ProductOccasionRow>
      product_variants: TableDefinition<ProductVariantRow>
      product_variant_costs: TableDefinition<ProductVariantCostRow>
      product_images: TableDefinition<ProductImageRow>
      size_guide_templates: TableDefinition<SizeGuideTemplateRow>
      size_guide_targets: TableDefinition<SizeGuideTargetRow>
      catalog_sync_state: TableDefinition<CatalogSyncStateRow>
      store_sync_state: TableDefinition<StoreSyncStateRow>
      catalog_product_code_tombstones: TableDefinition<CatalogProductCodeTombstoneRow>
      customers: TableDefinition<CustomerRow>
      customer_addresses: TableDefinition<CustomerAddressRow>
      order_sequences: TableDefinition<OrderSequenceRow>
      orders: TableDefinition<OrderRow>
      order_items: TableDefinition<OrderItemRow>
      order_payment_events: TableDefinition<OrderPaymentEventRow>
      order_activities: TableDefinition<OrderActivityRow>
      operational_state: TableDefinition<OperationalStateRow>
    }
    Views: Record<string, never>
    Functions: {
      get_store_admin_state: {
        Args: Record<string, never>
        Returns: Json
      }
      replace_public_store_snapshot: {
        Args: ReplacePublicStoreSnapshotRpcArgs
        Returns: Json
      }
      get_catalog_admin_state: {
        Args: Record<string, never>
        Returns: Json
      }
      replace_catalog_snapshot: {
        Args: ReplaceCatalogSnapshotRpcArgs
        Returns: Json
      }
      replace_product_images_metadata: {
        Args: ReplaceProductImagesMetadataRpcArgs
        Returns: Json
      }
      replace_size_guide_library: {
        Args: ReplaceSizeGuideLibraryRpcArgs
        Returns: Json
      }
      replace_arrangement_types: {
        Args: ReplaceArrangementTypesRpcArgs
        Returns: Json
      }
      save_customer_profile: {
        Args: SaveCustomerProfileRpcArgs
        Returns: Json
      }
      delete_customer_profile: {
        Args: DeleteCustomerProfileRpcArgs
        Returns: Json
      }
      create_storefront_order: {
        Args: CreateStorefrontOrderRpcArgs
        Returns: Json
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type PublicTableName = keyof Database['public']['Tables']
export type RowOf<T extends PublicTableName> = Database['public']['Tables'][T]['Row']
