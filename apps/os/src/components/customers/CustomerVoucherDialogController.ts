import { useEffect, useMemo, useState } from 'react'
import {
  useVoucherStore,
  type Voucher,
  type VoucherEligibility,
} from '../../store/voucherStore'
import { useCustomerStore } from '../../store/customerStore'
import type { CustomerProfile } from '../../store/customerStoreTypes'
import { toast } from '../../hooks/use-toast'
import type { CustomerVoucherDialogProps } from './CustomerVoucherDialog'
import { requestAppConfirmation } from '../ui/app-confirm'

export interface VoucherFormState {
  code: string
  percentOff: string
  startDate: string
  endDate: string
  minOrderIdr: string
  eligibility: VoucherEligibility
  selectedCustomerIds: string[]
}

export interface CustomerVoucherDialogViewModel
  extends CustomerVoucherDialogProps {
  vouchers: Voucher[]
  sortedVouchers: Voucher[]
  customers: CustomerProfile[]
  filteredCustomersForSelection: CustomerProfile[]
  editingId: string | null
  formOpen: boolean
  form: VoucherFormState
  customerQuery: string
  onDialogOpenChange: (next: boolean) => void
  onStartCreate: () => void
  onStartEdit: (voucher: Voucher) => void
  onCancelForm: () => void
  onSave: () => void
  onDelete: (voucher: Voucher) => void
  onSetVoucherActive: (voucherId: string, isActive: boolean) => void
  onCustomerQueryChange: (value: string) => void
  onFormFieldChange: <K extends keyof VoucherFormState>(
    field: K,
    value: VoucherFormState[K],
  ) => void
  onToggleSelectedCustomer: (customerId: string) => void
  getEligibilityLabel: (voucher: Voucher) => string
}

const emptyFormState: VoucherFormState = {
  code: '',
  percentOff: '',
  startDate: '',
  endDate: '',
  minOrderIdr: '',
  eligibility: 'all',
  selectedCustomerIds: [],
}

const formFromVoucher = (voucher: Voucher): VoucherFormState => ({
  code: voucher.code,
  percentOff: voucher.percentOff.toString(),
  startDate: voucher.startDate ?? '',
  endDate: voucher.endDate ?? '',
  minOrderIdr: voucher.minOrderIdr?.toString() ?? '',
  eligibility: voucher.eligibility,
  selectedCustomerIds: voucher.selectedCustomerIds ?? [],
})

export const useCustomerVoucherDialogController = ({
  open,
  onClose,
  initialCustomerId = null,
}: CustomerVoucherDialogProps): CustomerVoucherDialogViewModel => {
  const vouchers = useVoucherStore((state) => state.vouchers)
  const addVoucher = useVoucherStore((state) => state.addVoucher)
  const updateVoucher = useVoucherStore((state) => state.updateVoucher)
  const deleteVoucher = useVoucherStore((state) => state.deleteVoucher)
  const setVoucherActive = useVoucherStore((state) => state.setVoucherActive)
  const customers = useCustomerStore((state) => state.customers)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<VoucherFormState>(emptyFormState)
  const [customerQuery, setCustomerQuery] = useState('')

  useEffect(() => {
    if (open && initialCustomerId) {
      setEditingId(null)
      setCustomerQuery('')
      setForm({
        ...emptyFormState,
        eligibility: 'selected',
        selectedCustomerIds: [initialCustomerId],
      })
      setFormOpen(true)
    }
    if (!open) {
      setCustomerQuery('')
    }
  }, [open, initialCustomerId])

  const filteredCustomersForSelection = useMemo(() => {
    const query = customerQuery.trim().toLowerCase()
    if (!query) return customers
    return customers.filter((customer) =>
      `${customer.name} ${customer.whatsappNumber} ${customer.email ?? ''}`
        .toLowerCase()
        .includes(query),
    )
  }, [customers, customerQuery])

  const sortedVouchers = useMemo(
    () => [...vouchers].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [vouchers],
  )

  const cancelForm = () => {
    setFormOpen(false)
    setEditingId(null)
    setForm(emptyFormState)
  }

  return {
    open,
    onClose,
    initialCustomerId,
    vouchers,
    sortedVouchers,
    customers,
    filteredCustomersForSelection,
    editingId,
    formOpen,
    form,
    customerQuery,
    onDialogOpenChange: (next) => {
      if (!next) {
        cancelForm()
        onClose()
      }
    },
    onStartCreate: () => {
      setEditingId(null)
      setForm(emptyFormState)
      setFormOpen(true)
    },
    onStartEdit: (voucher) => {
      setEditingId(voucher.id)
      setForm(formFromVoucher(voucher))
      setFormOpen(true)
    },
    onCancelForm: cancelForm,
    onSave: () => {
      const percentOff = Number.parseInt(form.percentOff, 10)
      const minOrderParsed = Number.parseInt(form.minOrderIdr, 10)
      const payload = {
        code: form.code,
        percentOff,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        minOrderIdr:
          Number.isFinite(minOrderParsed) && minOrderParsed > 0
            ? minOrderParsed
            : undefined,
        eligibility: form.eligibility,
        selectedCustomerIds:
          form.eligibility === 'selected' ? form.selectedCustomerIds : undefined,
        isActive: true,
      }

      if (editingId) {
        const result = updateVoucher(editingId, payload)
        if (!result.ok) {
          toast({ description: result.reason })
          return
        }
        toast({ description: `Voucher "${payload.code.toUpperCase()}" updated.` })
      } else {
        const result = addVoucher(payload)
        if (!result.ok) {
          toast({ description: result.reason })
          return
        }
        toast({ description: `Voucher "${result.voucher.code}" created.` })
      }
      cancelForm()
    },
    onDelete: async (voucher) => {
      const confirmed = await requestAppConfirmation({ title: 'Delete voucher?', description: `Delete voucher "${voucher.code}"? This cannot be undone.`, confirmLabel: 'Delete voucher', destructive: true })
      if (!confirmed) return
      deleteVoucher(voucher.id)
      toast({ description: `Deleted voucher "${voucher.code}".` })
    },
    onSetVoucherActive: setVoucherActive,
    onCustomerQueryChange: setCustomerQuery,
    onFormFieldChange: (field, value) => {
      setForm((previous) => ({ ...previous, [field]: value }))
    },
    onToggleSelectedCustomer: (customerId) => {
      setForm((previous) => {
        const has = previous.selectedCustomerIds.includes(customerId)
        return {
          ...previous,
          selectedCustomerIds: has
            ? previous.selectedCustomerIds.filter((id) => id !== customerId)
            : [...previous.selectedCustomerIds, customerId],
        }
      })
    },
    getEligibilityLabel: (voucher) => {
      if (voucher.eligibility === 'vip') return 'VIP only'
      if (voucher.eligibility === 'selected') {
        const count = voucher.selectedCustomerIds?.length ?? 0
        return `${count} selected customer${count === 1 ? '' : 's'}`
      }
      return 'All customers'
    },
  }
}
