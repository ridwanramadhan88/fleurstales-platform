type Replacement = [RegExp, string]

const PHRASE_REPLACEMENTS: Replacement[] = [
  [/\bPeriod vs Previous Period\b/gi, 'periode vs periode sebelumnya'],
  [/\bSingle view\b/gi, 'tampilan tunggal'],
  [/\bdefault role\b/gi, 'peran bawaan'],
  [/\bdefault schedule\b/gi, 'jadwal bawaan'],
  [/\bdefault week\b/gi, 'minggu kerja bawaan'],
  [/\btop bar\b/gi, 'bilah atas'],
  [/\bonline store\b/gi, 'toko online'],
  [/\bgreeting card\b/gi, 'kartu ucapan'],
  [/\bcheck[- ]out\b/gi, 'absen pulang'],
  [/\bcheck[- ]in\b/gi, 'absen masuk'],
  [/\bbase salary\b/gi, 'gaji pokok'],
  [/\bstaff & roles\b/gi, 'staf & peran'],
  [/\border verification\b/gi, 'verifikasi pesanan'],
  [/\border reconciliation\b/gi, 'rekonsiliasi pesanan'],
  [/\brefund queue\b/gi, 'antrean pengembalian dana'],
  [/\bmonthly report\b/gi, 'laporan bulanan'],
  [/\bstore profile\b/gi, 'profil toko'],
  [/\binternal note\b/gi, 'catatan internal'],
  [/\breview task\b/gi, 'tugas peninjauan'],
]

const TERM_REPLACEMENTS: Replacement[] = [
  [/\bOrders?\b/gi, 'pesanan'],
  [/\bFinance\b/gi, 'keuangan'],
  [/\bRevenue\b/gi, 'pendapatan'],
  [/\bExpenses?\b/gi, 'pengeluaran'],
  [/\bSchedules?\b/gi, 'jadwal'],
  [/\bPayroll\b/gi, 'penggajian'],
  [/\bInventory\b/gi, 'inventaris'],
  [/\bDashboard\b/gi, 'ringkasan'],
  [/\bCustomers?\b/gi, 'pelanggan'],
  [/\bBranches?\b/gi, 'cabang'],
  [/\bRefunds?\b/gi, 'pengembalian dana'],
  [/\bAttendance\b/gi, 'kehadiran'],
  [/\bOwner\b/gi, 'pemilik'],
  [/\bHR\b/g, 'SDM'],
  [/\bFlorists?\b/gi, 'perangkai bunga'],
  [/\bStaff\b/gi, 'staf'],
  [/\bEmployees?\b/gi, 'karyawan'],
  [/\bRoles?\b/gi, 'peran'],
  [/\bPermissions?\b/gi, 'izin akses'],
  [/\bWorkspace(s)?\b/gi, 'ruang kerja'],
  [/\bCatalog\b/gi, 'katalog'],
  [/\bCategor(?:y|ies)\b/gi, 'kategori'],
  [/\bStock\b/gi, 'stok'],
  [/\bDelivery\b/gi, 'pengiriman'],
  [/\bCheckout\b/gi, 'pembayaran'],
  [/\bPayment\b/gi, 'pembayaran'],
  [/\bSalary\b/gi, 'gaji'],
  [/\bShift\b/gi, 'giliran kerja'],
  [/\bWFH\b/g, 'kerja dari rumah'],
  [/\bOFF\b/g, 'libur'],
  [/\bReports?\b/gi, 'laporan'],
  [/\bNotifications?\b/gi, 'notifikasi'],
  [/\bProfile\b/gi, 'profil'],
  [/\bUsername\b/gi, 'nama pengguna'],
  [/\bPassword\b/gi, 'kata sandi'],
  [/\bPublish\b/gi, 'terbitkan'],
  [/\bUpload\b/gi, 'unggah'],
  [/\bDownload\b/gi, 'unduh'],
  [/\bExport\b/gi, 'ekspor'],
  [/\bImport\b/gi, 'impor'],
  [/\bDefault\b/gi, 'bawaan'],
  [/\bPickup\b/gi, 'pengambilan di toko'],
  [/\bProduct\b/gi, 'produk'],
  [/\bCurrency\b/gi, 'mata uang'],
  [/\btimezone\b/gi, 'zona waktu'],
  [/\breward\b/gi, 'imbalan'],
  [/\bscope\b/gi, 'cakupan'],
  [/\bstorefront\b/gi, 'toko online'],
  [/\bSettings\b/gi, 'pengaturan'],
  [/\bEdit\b/gi, 'ubah'],
  [/\bCreate\b/gi, 'buat'],
  [/\bConfirm\b/gi, 'konfirmasi'],
  [/\bReady\b/gi, 'siap'],
  [/\bUpdate\b/gi, 'pembaruan'],
]

const preserveSourceCapitalization = (source: string, replacement: string): string => {
  if (replacement === replacement.toUpperCase()) return replacement
  if (!/^[A-Z]/.test(source)) return replacement
  return replacement.charAt(0).toLocaleUpperCase('id-ID') + replacement.slice(1)
}

const applyReplacements = (value: string, replacements: Replacement[]): string => {
  let result = value
  replacements.forEach(([pattern, replacement]) => {
    result = result.replace(pattern, (match) => preserveSourceCapitalization(match, replacement))
  })
  return result
}

/**
 * Final cleanup for known static translation values only.
 *
 * Do not use this on arbitrary customer/product/user-entered text. Dynamic
 * pattern values intentionally bypass this function so business data remains
 * byte-for-byte unchanged.
 */
export const finalizeIndonesianStaticCopy = (value: string): string => {
  const result = applyReplacements(
    applyReplacements(value, PHRASE_REPLACEMENTS),
    TERM_REPLACEMENTS,
  )
  return result
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim()
}
