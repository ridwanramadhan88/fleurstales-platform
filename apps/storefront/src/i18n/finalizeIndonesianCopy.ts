const PHRASE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bdefault role\b/gi, 'peran bawaan'],
  [/\bdefault schedule\b/gi, 'jadwal bawaan'],
  [/\bdefault week\b/gi, 'minggu kerja bawaan'],
  [/\btop bar\b/gi, 'bilah atas'],
  [/\bonline store\b/gi, 'toko online'],
  [/\bgreeting card\b/gi, 'kartu ucapan'],
  [/\bcheck[- ]out\b/gi, 'absen pulang'],
  [/\bcheck[- ]in\b/gi, 'absen masuk'],
]

const TERM_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bBranch\b/g, 'Cabang'],
  [/\bDashboard\b/g, 'Ringkasan'],
  [/\bstorefront\b/gi, 'toko online'],
  [/\bSettings\b/g, 'Pengaturan'],
  [/\bEdit\b/g, 'Ubah'],
  [/\bCreate\b/g, 'Buat'],
  [/\bConfirm\b/g, 'Konfirmasi'],
  [/\bReady\b/g, 'Siap'],
  [/\bUpdate\b/g, 'Pembaruan'],
  [/\bDefault\b/g, 'Bawaan'],
  [/\bdefault\b/g, 'bawaan'],
  [/\bOFF\b/g, 'libur'],
  [/\bPickup\b/g, 'Pengambilan di Toko'],
  [/\bpickup\b/g, 'pengambilan di toko'],
  [/\bProduct\b/g, 'Produk'],
  [/\bproduct\b/g, 'produk'],
  [/\bCurrency\b/g, 'Mata uang'],
  [/\bcurrency\b/g, 'mata uang'],
  [/\btimezone\b/gi, 'zona waktu'],
  [/\breward\b/gi, 'imbalan'],
  [/\bscope\b/gi, 'cakupan'],
]

/**
 * Final cleanup for known static translation values only.
 *
 * Do not use this on arbitrary customer/product/user-entered text. Dynamic
 * pattern values intentionally bypass this function so business data remains
 * byte-for-byte unchanged.
 */
export const finalizeIndonesianStaticCopy = (value: string): string => {
  let result = value
  PHRASE_REPLACEMENTS.forEach(([pattern, replacement]) => {
    result = result.replace(pattern, replacement)
  })
  TERM_REPLACEMENTS.forEach(([pattern, replacement]) => {
    result = result.replace(pattern, replacement)
  })
  return result
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim()
}
