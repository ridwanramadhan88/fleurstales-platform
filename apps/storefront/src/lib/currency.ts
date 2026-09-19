const DEFAULT_IDR_FORMATTER = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 0,
})

export const formatIdr = (
  amount: number,
  formatter: Intl.NumberFormat = DEFAULT_IDR_FORMATTER,
): string => `Rp. ${formatter.format(amount)}`
