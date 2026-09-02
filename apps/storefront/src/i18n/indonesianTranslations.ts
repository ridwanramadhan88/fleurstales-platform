import { ID_EXACT_TRANSLATIONS } from './idTranslations'
import { ID_NATURAL_TRANSLATIONS } from './naturalTranslations'

/**
 * Canonical runtime Indonesian translation source.
 *
 * The old legacy/natural tables remain as backing data during this migration,
 * but UI translation must consume only ID_TRANSLATIONS / ID_PATTERN_TRANSLATIONS
 * from this module. Natural copy wins over legacy copy; targeted overrides fix
 * phrases that were still mixed-language or awkward in the merged glossary.
 */

const passiveReplacements: Array<[RegExp, string]> = [
  [/\bdi-reject\b/gi, 'ditolak'],
  [/\bdi-approve\b/gi, 'disetujui'],
  [/\bdi-save\b/gi, 'disimpan'],
  [/\bdi-edit\b/gi, 'diubah'],
  [/\bdi-update\b/gi, 'diperbarui'],
  [/\bdi-assign\b/gi, 'ditugaskan'],
  [/\bdi-confirm\b/gi, 'dikonfirmasi'],
  [/\bdi-verify\b/gi, 'diverifikasi'],
  [/\bdi-submit\b/gi, 'diajukan'],
  [/\bdi-resubmit\b/gi, 'diajukan ulang'],
  [/\bdi-publish\b/gi, 'diterbitkan'],
  [/\bdi-propose\b/gi, 'diajukan'],
  [/\bdipublish\b/gi, 'diterbitkan'],
]

const termReplacements: Array<[RegExp, string]> = [
  [/\borders?\b/gi, 'pesanan'],
  [/\bcustomers?\b/gi, 'pelanggan'],
  [/\bbranches?\b/gi, 'cabang'],
  [/\bfinance\b/gi, 'keuangan'],
  [/\brevenue\b/gi, 'pendapatan'],
  [/\bexpenses?\b/gi, 'pengeluaran'],
  [/\battendance\b/gi, 'kehadiran'],
  [/\bschedules?\b/gi, 'jadwal'],
  [/\bscheduling\b/gi, 'penjadwalan'],
  [/\bpayroll\b/gi, 'penggajian'],
  [/\binventory\b/gi, 'inventaris'],
  [/\bstock\b/gi, 'stok'],
  [/\brefunds?\b/gi, 'pengembalian dana'],
  [/\bstaff\b/gi, 'staf'],
  [/\bemployees?\b/gi, 'karyawan'],
  [/\broles?\b/gi, 'peran'],
  [/\bpermissions?\b/gi, 'izin akses'],
  [/\breviews?\b/gi, 'tinjau'],
  [/\bwarnings?\b/gi, 'peringatan'],
  [/\bproblems?\b/gi, 'masalah'],
  [/\bdelivery\b/gi, 'pengiriman'],
  [/\bcart\b/gi, 'keranjang'],
  [/\bcatalog\b/gi, 'katalog'],
  [/\bcategor(?:y|ies)\b/gi, 'kategori'],
  [/\bfeatured\b/gi, 'unggulan'],
  [/\bpoints?\b/gi, 'poin'],
  [/\bworkspaces?\b/gi, 'ruang kerja'],
  [/\bqueues?\b/gi, 'antrian'],
  [/\bassignments?\b/gi, 'penugasan'],
  [/\bassigned\b/gi, 'ditugaskan'],
  [/\bpending\b/gi, 'menunggu'],
  [/\bcheckout\b/gi, 'pembayaran'],
  [/\bpassword\b/gi, 'kata sandi'],
  [/\busername\b/gi, 'nama pengguna'],
  [/\bpublish\b/gi, 'terbitkan'],
  [/\bupload\b/gi, 'unggah'],
  [/\bdownload\b/gi, 'unduh'],
  [/\bexport\b/gi, 'ekspor'],
  [/\brealtime\b/gi, 'langsung'],
  [/\broster\b/gi, 'jadwal kerja'],
  [/\bvisits?\b/gi, 'kunjungan'],
  [/\bincome\b/gi, 'pendapatan'],
  [/\bsalary\b/gi, 'gaji'],
  [/\bsource\b/gi, 'sumber'],
  [/\bcards?\b/gi, 'kartu'],
  [/\balerts?\b/gi, 'peringatan'],
  [/\bcoverage\b/gi, 'cakupan'],
  [/\brestock\b/gi, 'isi ulang stok'],
  [/\bexpiry\b/gi, 'kedaluwarsa'],
  [/\bexpired\b/gi, 'kedaluwarsa'],
]

const phraseReplacements: Array<[RegExp, string]> = [
  [/\bbase salary\b/gi, 'gaji pokok'],
  [/\bcheck[- ]in\b/gi, 'absen masuk'],
  [/\bcheck[- ]out\b/gi, 'absen pulang'],
  [/\bonline store\b/gi, 'toko online'],
  [/\bgreeting card\b/gi, 'kartu ucapan'],
  [/\btop bar\b/gi, 'bilah atas'],
  [/\bsingle view\b/gi, 'tampilan tunggal'],
  [/\binternal note\b/gi, 'catatan internal'],
  [/\breview task\b/gi, 'tugas peninjauan'],
]

const capitalizeLikeSource = (value: string, source: string): string => {
  if (!/^[A-Z]/.test(source) || !/^[a-zà-ÿ]/i.test(value)) return value
  return value.charAt(0).toLocaleUpperCase('id-ID') + value.slice(1)
}

const polishLegacyCopy = (value: string, source = value): string => {
  let result = value
  passiveReplacements.forEach(([pattern, replacement]) => {
    result = result.replace(pattern, replacement)
  })
  phraseReplacements.forEach(([pattern, replacement]) => {
    result = result.replace(pattern, replacement)
  })
  termReplacements.forEach(([pattern, replacement]) => {
    result = result.replace(pattern, replacement)
  })
  result = result
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim()
  return capitalizeLikeSource(result, source)
}

const POLISHED_TRANSLATION_OVERRIDES: Record<string, string> = {
  'Publish anyway': 'Tetap terbitkan',
  'Review schedule': 'Periksa jadwal',
  'Visit online store': 'Buka toko online',
  'Delivery orders are bank transfer only.': 'Pesanan pengiriman hanya dapat dibayar melalui transfer bank.',
  "Staff will verify it shortly — you'll see it appear in the internal Orders tab right away.":
    'Staf akan segera memverifikasi pesanan.',

  'Show stock tracking and inventory tools across the app.':
    'Tampilkan pelacakan stok dan fitur inventaris di seluruh aplikasi.',
  'Default: Off. Turning inventory off hides and pauses the feature; saved inventory is preserved.':
    'Default: Nonaktif. Menonaktifkan inventaris menyembunyikan dan menjeda fitur; data inventaris tetap tersimpan.',
  'Controls available delivery, pickup, and employee check-out times.':
    'Mengatur waktu pengiriman, pengambilan di toko, dan absen pulang karyawan.',
  'Base salary is configured individually for each employee in Settings → Staff & Roles. Role-based salary defaults are no longer used.':
    'Gaji pokok diatur per staf di Pengaturan → Staf & Peran. Default gaji berdasarkan peran tidak lagi digunakan.',

  'Employees & attendance': 'Karyawan & Kehadiran',
  'Revenue confirmed by Finance. Estimate includes finished Orders still pending. Branch:':
    'Pendapatan telah dikonfirmasi tim Keuangan. Estimasi termasuk pesanan selesai yang masih menunggu. Cabang:',
  'Finance confirmed': 'Dikonfirmasi tim Keuangan',
  'Orders in confirmed revenue': 'Pesanan dalam pendapatan terkonfirmasi',
  'Per confirmed order': 'Per pesanan terkonfirmasi',
  'Message to print on the greeting card, if any.': 'Pesan yang akan dicetak pada kartu ucapan, jika ada.',
  'Write the message on the card.': 'Tulis pesan pada kartu ucapan.',
  'Rejected by Finance': 'Ditolak tim Keuangan',

  'New entries always start as pending.': 'Transaksi baru selalu berstatus menunggu.',
  'Record company income or expenses for Finance verification.':
    'Catat pendapatan atau pengeluaran perusahaan untuk diverifikasi tim Keuangan.',
  'Finance refund queue': 'Antrian pengembalian dana Keuangan',
  'Finance can approve the whole monthly proposal or review employees individually. Rejected employees return to HR without reopening accepted employees.':
    'Tim Keuangan dapat menyetujui seluruh proposal bulanan atau meninjau tiap staf. Staf yang ditolak kembali ke HR tanpa membuka kembali staf yang sudah diterima.',
  'Rejected employees can be corrected or resolved by HR. Employee payrolls already approved by Finance remain locked and accepted.':
    'HR dapat memperbaiki atau menyelesaikan staf yang ditolak. Penggajian staf yang sudah disetujui tim Keuangan tetap terkunci dan diterima.',
  'Resolve and resubmit rejected employees before using group approval. Finance may still approve the other pending employees individually.':
    'Perbaiki dan ajukan ulang staf yang ditolak sebelum menyetujui grup. Tim Keuangan tetap dapat menyetujui staf lain yang menunggu satu per satu.',
  'Finance can adjust this generated cycle. Sensitive changes require Owner approval.':
    'Tim Keuangan dapat menyesuaikan siklus ini. Perubahan sensitif memerlukan persetujuan Owner.',

  'Generate the full roster, then adjust exceptions. HR must visit at least 3 days each week.':
    'Buat jadwal kerja lengkap, lalu sesuaikan pengecualian. HR wajib melakukan kunjungan minimal 3 hari setiap minggu.',
  'Generated roster currently meets minimum staffing.':
    'Jadwal kerja saat ini memenuhi jumlah minimum staf.',
  'Choose a branch visit and time, or set the day to WFH. HR needs at least 3 visit days each week.':
    'Pilih cabang dan waktu kunjungan, atau tetapkan hari sebagai WFH. HR memerlukan minimal 3 hari kunjungan setiap minggu.',
  'After two failed GPS attempts, you can continue. HR will review the attendance record.':
    'Setelah dua kali gagal GPS, Anda dapat melanjutkan. HR akan meninjau catatan kehadiran.',
  'Role changes affect permissions. Daily branch assignment is managed only from Scheduling.':
    'Perubahan peran memengaruhi izin akses. Penugasan cabang harian hanya dikelola dari Penjadwalan.',
  'This is an HR problem task only. It does not create attendance points.':
    'Ini hanya tugas peninjauan HR. Tugas ini tidak membuat poin kehadiran.',
  'Generate the payroll proposal to review salary, points, and HR adjustments.':
    'Buat proposal penggajian untuk meninjau gaji, poin, dan penyesuaian HR.',
  'Positive rewards or negative penalties. Pending until reviewed.':
    'Imbalan positif atau penalti negatif. Menunggu peninjauan.',
  'Schedule warning · HR review pending': 'Peringatan jadwal · menunggu peninjauan HR',
  'Your published branch and shift for this week.': 'Cabang dan Shift yang diterbitkan untuk minggu ini.',
  'Crop to 1:1 before upload': 'Potong ke rasio 1:1 sebelum unggah',

  'Finance order verification date scope': 'Rentang tanggal verifikasi pesanan oleh Keuangan',
  'Finance payroll review': 'Peninjauan penggajian oleh Keuangan',
  'Attendance review queue': 'Antrian peninjauan kehadiran',
  'Finance review deadline': 'Batas waktu peninjauan Keuangan',
  'Check-out branch warning': 'Peringatan cabang saat absen pulang',

  'Assigned and in-progress orders will appear here.':
    'Pesanan yang ditugaskan dan sedang diproses akan tampil di sini.',
  'Continue the most urgent assigned order first.':
    'Kerjakan pesanan paling mendesak yang ditugaskan terlebih dahulu.',
  'New assigned orders will appear here.':
    'Pesanan baru yang ditugaskan akan tampil di sini.',
  'Attendance checkout grace': 'Toleransi waktu absen pulang',
  'Attendance late grace': 'Toleransi keterlambatan kehadiran',
  'Checkout grace period': 'Toleransi waktu absen pulang',
  'Late and missing-checkout events create review cases. They do not affect points or payroll until HR reviews them.':
    'Keterlambatan dan absen pulang yang belum tercatat membuat kasus peninjauan. Hal ini tidak memengaruhi poin atau penggajian sampai ditinjau HR.',
  'Location validation and the grace windows used to create HR review warnings.':
    'Validasi lokasi dan batas toleransi yang digunakan untuk membuat peringatan peninjauan HR.',

  'Revenue (confirmed) uses Finance-verified collections. Estimated revenue includes finished orders awaiting confirmation. Scoped to':
    'Pendapatan terkonfirmasi menggunakan penerimaan yang diverifikasi tim Keuangan. Estimasi termasuk pesanan selesai yang menunggu konfirmasi. Cakupan:',
  '— use the branch switcher in the top bar to change this.':
    '— gunakan pemilih cabang di bilah atas untuk mengubahnya.',
  'Change requests awaiting review': 'Permintaan perubahan menunggu peninjauan',
  'Submitted by Admin/Owner on locked (finished) orders. Approving a cancellation voids it immediately; approving an edit only unlocks it for them to make the change themselves.':
    'Diajukan Admin/Owner pada pesanan terkunci yang sudah selesai. Persetujuan pembatalan langsung membatalkan pesanan; persetujuan perubahan hanya membuka kunci agar mereka dapat mengubahnya.',
  'Orders appear after delivery or pickup is complete. Finished orders stay locked from direct edits; Finance or Owner can verify, reject, or flag them for review.':
    'Pesanan muncul setelah pengiriman atau pengambilan selesai. Pesanan selesai tetap terkunci dari perubahan langsung; Keuangan atau Owner dapat memverifikasi, menolak, atau menandainya untuk ditinjau.',
  'Continue for HR review': 'Lanjutkan untuk peninjauan HR',
  'request submitted — awaiting Finance/Owner review.':
    'permintaan diajukan — menunggu peninjauan Keuangan/Owner.',
  'Review and restock soon': 'Perlu ditinjau dan segera isi ulang stok',
  'attendance warning(s) require HR review before submission.':
    'peringatan kehadiran harus ditinjau HR sebelum dikirim.',

  'orders today · realtime updates': 'Pesanan hari ini · diperbarui secara langsung',
  'No delivery, pickup, or check-out window.':
    'Tidak ada jendela waktu pengiriman, pengambilan di toko, atau absen pulang.',
  'Returning customer · Saved details matched from this WhatsApp number.':
    'Pelanggan lama · data tersimpan cocok dengan nomor WhatsApp ini.',
  'This product is customizable — leave a note at checkout for any special requests.':
    'Produk dapat disesuaikan. Tulis catatan saat pembayaran untuk permintaan khusus.',
  'pending point entry/entries must be resolved before submission.':
    'entri poin yang menunggu harus diselesaikan sebelum dikirim.',

  'Employee warning review': 'Peninjauan peringatan karyawan',
  'Problem List': 'Daftar Masalah',
  'Record as Problem': 'Catat sebagai Masalah',
  'Solve employee Problem': 'Selesaikan masalah karyawan',
  'Review note': 'Catatan peninjauan',
  'No employee warnings need review.': 'Tidak ada peringatan karyawan yang perlu ditinjau.',
  'No employee Problems recorded.': 'Belum ada masalah karyawan yang tercatat.',
  'No completed employee warnings yet.': 'Belum ada peringatan karyawan yang selesai.',
  'Missing checkout': 'Belum absen pulang',
  'Early checkout': 'Absen pulang terlalu awal',
  'Wrong branch': 'Cabang tidak sesuai',
  'Unscheduled attendance': 'Kehadiran di hari libur',
  'Delivery late': 'Pengiriman terlambat',
  'Delivery passed the scheduled time.': 'Pengiriman melewati waktu yang dijadwalkan.',
  'Source: Delivery Order': 'Sumber: Pesanan Pengiriman',

  'Propose ready': 'Ajukan status Siap',
  'Revenue (confirmed) uses Finance-verified collections.':
    'Pendapatan terkonfirmasi menggunakan penerimaan yang diverifikasi tim Keuangan.',
  'Estimated revenue includes finished orders awaiting confirmation.':
    'Perkiraan pendapatan termasuk pesanan selesai yang menunggu konfirmasi.',
  'Scoped to Kedamaian — use the branch switcher in the top bar to change this.':
    'Cabang aktif: Kedamaian. Ubah dari pemilih cabang di bilah atas.',
  'Admin resubmitted this order.': 'Admin mengajukan ulang pesanan ini.',
  'Publish schedule with coverage warnings?': 'Tetap terbitkan jadwal meski ada peringatan cakupan?',
  'Revenue confirmed includes verified refunds.':
    'Pendapatan terkonfirmasi sudah memperhitungkan pengembalian dana yang diverifikasi.',
  'Finished orders awaiting Finance confirmation.':
    'Pesanan selesai yang menunggu konfirmasi tim Keuangan.',
  'Create a new staff account.': 'Buat akun staf baru.',
  'Base salary is set per employee.': 'Gaji pokok diatur per staf.',
  'Changing role does not change salary.': 'Mengubah peran tidak mengubah gaji.',
  'Ready proposed. Waiting for Admin confirmation.':
    'Status Siap telah diajukan. Menunggu konfirmasi Admin.',
  'Ready proposed by Florist': 'Status Siap diajukan oleh Florist',
  'Florist finished. Admin confirmation required.':
    'Florist selesai. Diperlukan konfirmasi Admin.',
  'Confirmed and ready for fulfilment.': 'Dikonfirmasi dan siap diproses.',

  'Featured products are highlighted at the top of the storefront.':
    'Produk unggulan ditampilkan di bagian atas toko online.',
  'Important updates will appear here.': 'Pembaruan penting akan tampil di sini.',
  'Manage which active products are Featured and which have a percent-off promo running.':
    'Atur produk aktif yang menjadi unggulan dan promo potongan persentase yang sedang berjalan.',
}

const legacyTranslations = Object.fromEntries(
  Object.entries(ID_EXACT_TRANSLATIONS).map(([source, translated]) => [
    source,
    polishLegacyCopy(translated, source),
  ]),
)

export const ID_TRANSLATIONS: Record<string, string> = {
  ...legacyTranslations,
  ...ID_NATURAL_TRANSLATIONS,
  ...POLISHED_TRANSLATION_OVERRIDES,
}

export const normalizeIndonesianUiCopy = (value: string, source = value): string =>
  polishLegacyCopy(value, source)

export const ID_PATTERN_TRANSLATIONS: Array<
  [RegExp, (...matches: string[]) => string]
> = [
  [/^Showing (\d+) of (\d+)$/i, (_full, shown, total) => `Menampilkan ${shown} dari ${total}`],
  [/^(\d+) results?$/i, (_full, count) => `${count} hasil`],
  [/^(\d+) to review$/i, (_full, count) => `${count} perlu ditinjau`],
  [/^Needs review · (\d+)$/i, (_full, count) => `Perlu ditinjau · ${count}`],
  [/^(\d+) items? · (\d+) lines?$/i, (_full, items, lines) => `${items} item · ${lines} baris`],
  [/^Order (.+) details$/i, (_full, orderNumber) => `Detail pesanan ${orderNumber}`],
  [/^Branch: (.+)$/i, (_full, branch) => `Cabang: ${branch}`],
  [/^Search (.+)\.\.\.$/i, (_full, target) => `Cari ${polishLegacyCopy(target)}...`],
  [/^Search (.+)$/i, (_full, target) => `Cari ${polishLegacyCopy(target)}`],
  [/^Filter by (.+)$/i, (_full, target) => `Filter berdasarkan ${polishLegacyCopy(target)}`],
  [/^Updated (.+)$/i, (_full, value) => `Diperbarui ${value}`],
  [/^Last updated (.+)$/i, (_full, value) => `Terakhir diperbarui ${value}`],
  [/^Select (.+)$/i, (_full, value) => `Pilih ${polishLegacyCopy(value)}`],
  [/^Choose (.+)$/i, (_full, value) => `Pilih ${polishLegacyCopy(value)}`],
  [/^Add (.+)$/i, (_full, value) => `Tambah ${polishLegacyCopy(value)}`],
  [/^Create (.+)$/i, (_full, value) => `Buat ${polishLegacyCopy(value)}`],
  [/^Remove (.+)$/i, (_full, value) => `Hapus ${polishLegacyCopy(value)}`],
  [/^Delete (.+)$/i, (_full, value) => `Hapus ${polishLegacyCopy(value)}`],
  [/^Save (.+)$/i, (_full, value) => `Simpan ${polishLegacyCopy(value)}`],
  [/^View (.+)$/i, (_full, value) => `Lihat ${polishLegacyCopy(value)}`],
  [/^Review (.+)$/i, (_full, value) => `Tinjau ${polishLegacyCopy(value)}`],
  [/^No (.+) yet\.?$/i, (_full, value) => `Belum ada ${polishLegacyCopy(value)}.`],
  [/^No (.+) found\.?$/i, (_full, value) => `${polishLegacyCopy(value)} tidak ditemukan.`],
  [/^Waiting for (.+)$/i, (_full, value) => `Menunggu ${polishLegacyCopy(value)}`],
  [/^(\d+) unassigned$/i, (_full, value) => `${value} belum ditugaskan`],
  [/^(\d+) visits$/i, (_full, value) => `${value} kunjungan`],
  [/^(\d+) work · (\d+) OFF$/i, (_full, work, off) => `${work} kerja · ${off} libur`],
  [/^(.+) is required\.?$/i, (_full, value) => `${polishLegacyCopy(value)} wajib diisi.`],
  [/^(.+) saved\.?$/i, (_full, value) => `${polishLegacyCopy(value)} berhasil disimpan.`],
  [/^(.+) updated\.?$/i, (_full, value) => `${polishLegacyCopy(value)} berhasil diperbarui.`],
  [/^(.+) deleted\.?$/i, (_full, value) => `${polishLegacyCopy(value)} berhasil dihapus.`],
]
