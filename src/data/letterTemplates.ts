import {
  LetterCategory,
  SchoolLetter,
  SchoolSettings,
  Student,
} from '../types';
import { formatTanggalID } from '../utils/academic';

export type LetterFieldInputType = 'text' | 'textarea' | 'date' | 'select' | 'number';

export interface LetterFieldDef {
  key: string;
  label: string;
  type: LetterFieldInputType;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
  options?: string[];
  helper?: string;
}

export type LetterLayoutKind =
  | 'surat_keterangan'
  | 'surat_resmi'
  | 'pengumuman'
  | 'surat_keputusan'
  | 'berita_acara'
  | 'surat_kuasa'
  | 'surat_izin';

export interface LetterTemplateDef {
  id: string;
  kategori: LetterCategory;
  subKategori?: string;
  kodeNomor: string;
  nama: string;
  deskripsi: string;
  formatLayout: LetterLayoutKind;
  studentRequestable?: boolean;
  requiresStudent?: boolean;
  defaultPerihal: string;
  defaultTargetAudience?: string;
  fields: LetterFieldDef[];
}

export interface LetterComposedSection {
  title?: string;
  type: 'paragraph' | 'keyvalue' | 'bullets' | 'numbered' | 'diktum';
  text?: string;
  rows?: Array<{ label: string; value: string }>;
  items?: string[];
}

export interface ComposedLetterDocument {
  judulDokumen: string;
  subJudul?: string;
  nomorSurat: string;
  tanggalText: string;
  lampiranText?: string;
  perihalText?: string;
  tujuanBlok?: string[];
  sections: LetterComposedSection[];
  penutup: string;
  jabatanPenandatangan: string;
  namaPenandatangan: string;
  nipPenandatangan: string;
  pemohonBlok?: { label: string; nama: string; sub: string };
}

export const LETTER_CATEGORIES: LetterCategory[] = [
  'Keperluan Internal Sekolah',
  'Keperluan Eksternal & Instansi Luar',
  'Mutasi, Kelulusan & Layanan Khusus',
  'Pengumuman Sekolah',
  'Kepegawaian & Tugas Pendidik',
  'Kerja Sama & Kemitraan',
  'Keuangan, Bantuan & Sarpras',
  'Tata Kelola, Dinas & Legalitas',
];

const ROMAN_MONTHS = [
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
  'XI',
  'XII',
];

export function deriveSchoolNumberSlug(settings?: SchoolSettings): string {
  const jenis = (settings?.jenisLembaga || 'PKBM').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const words = (settings?.namaSekolah || '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0 && w.toUpperCase() !== jenis);
  const initials = words
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  return initials ? `${jenis}-${initials}` : jenis || 'SEKOLAH';
}

export function getNextLetterSequence(
  existingLetters: SchoolLetter[],
  tanggalSurat?: string
): number {
  const targetYear =
    tanggalSurat && /^\d{4}/.test(tanggalSurat)
      ? tanggalSurat.slice(0, 4)
      : new Date().getFullYear().toString();
  let maxSeq = 0;
  for (const l of existingLetters || []) {
    const sameYear =
      (l.tanggalSurat && l.tanggalSurat.startsWith(targetYear)) ||
      (l.nomorSurat && l.nomorSurat.endsWith(`/${targetYear}`));
    if (!sameYear) continue;
    if (typeof l.urutanNomor === 'number' && l.urutanNomor > maxSeq) {
      maxSeq = l.urutanNomor;
      continue;
    }
    const m = String(l.nomorSurat || '').match(/^(\d{1,5})\//);
    if (m) {
      const n = Number(m[1]);
      if (!Number.isNaN(n) && n > maxSeq) maxSeq = n;
    }
  }
  return maxSeq + 1;
}

export function formatNomorSurat(
  seq: number,
  kodeNomor: string,
  settings?: SchoolSettings,
  tanggalSurat?: string
): string {
  const cleanSeq = String(Math.max(1, seq)).padStart(3, '0');
  const d = tanggalSurat ? new Date(`${tanggalSurat}T00:00:00`) : new Date();
  const validDate = Number.isNaN(d.getTime()) ? new Date() : d;
  const romanMonth = ROMAN_MONTHS[validDate.getMonth()] || 'I';
  const year = validDate.getFullYear();
  const slug = deriveSchoolNumberSlug(settings);
  const cleanKode = (kodeNomor || 'SRT').trim().toUpperCase().replace(/\s+/g, '-');
  return `${cleanSeq}/${cleanKode}/${slug}/${romanMonth}/${year}`;
}

export const LETTER_TEMPLATES: LetterTemplateDef[] = [
  // =========================================================
  // 1. KEPERLUAN INTERNAL SEKOLAH
  // =========================================================
  {
    id: 'sk_aktif_belajar',
    kategori: 'Keperluan Internal Sekolah',
    kodeNomor: 'SK-AKTIF',
    nama: 'Surat Keterangan Aktif Belajar',
    deskripsi:
      'Bukti resmi bahwa peserta didik terdaftar dan masih aktif mengikuti pembelajaran pada tahun ajaran berjalan.',
    formatLayout: 'surat_keterangan',
    studentRequestable: true,
    requiresStudent: true,
    defaultPerihal: 'Surat Keterangan Aktif Belajar Peserta Didik',
    fields: [
      {
        key: 'keperluan',
        label: 'Keperluan Penerbitan Surat',
        type: 'text',
        required: true,
        placeholder: 'Mis. Administrasi kependudukan / KJP / BPJS / Persyaratan lomba',
        defaultValue: 'Keperluan administrasi peserta didik',
      },
      {
        key: 'statusKehadiran',
        label: 'Catatan Keaktifan Pembelajaran',
        type: 'text',
        defaultValue: 'Aktif mengikuti kegiatan belajar mengajar sesuai jadwal satuan pendidikan',
      },
      {
        key: 'masaBerlaku',
        label: 'Masa Berlaku Surat',
        type: 'text',
        defaultValue: 'Semester berjalan Tahun Ajaran aktif',
      },
    ],
  },
  {
    id: 'surat_izin_sakit',
    kategori: 'Keperluan Internal Sekolah',
    kodeNomor: 'SZ-ABS',
    nama: 'Surat Izin Tidak Masuk Sekolah / Sakit',
    deskripsi:
      'Pengajuan/pencatatan izin tidak mengikuti pembelajaran karena sakit atau keperluan keluarga.',
    formatLayout: 'surat_izin',
    studentRequestable: true,
    requiresStudent: true,
    defaultPerihal: 'Permohonan Izin Tidak Mengikuti Pembelajaran',
    fields: [
      {
        key: 'jenisIzin',
        label: 'Kategori Ketidakhadiran',
        type: 'select',
        required: true,
        options: ['Sakit', 'Izin Keperluan Keluarga', 'Izin Kegiatan Penting Lainnya'],
        defaultValue: 'Sakit',
      },
      {
        key: 'tanggalMulai',
        label: 'Tanggal Mulai Izin',
        type: 'date',
        required: true,
      },
      {
        key: 'tanggalSelesai',
        label: 'Tanggal Selesai Izin',
        type: 'date',
        required: true,
      },
      {
        key: 'alasanDetail',
        label: 'Keterangan / Alasan Ketidakhadiran',
        type: 'textarea',
        required: true,
        placeholder: 'Jelaskan kondisi kesehatan atau keperluan keluarga secara singkat...',
      },
      {
        key: 'namaWaliPemohon',
        label: 'Nama Orang Tua / Wali Mengetahui',
        type: 'text',
        placeholder: 'Otomatis diambil dari data orang tua jika dikosongkan',
      },
    ],
  },
  {
    id: 'surat_dispensasi',
    kategori: 'Keperluan Internal Sekolah',
    kodeNomor: 'DISP',
    nama: 'Surat Dispensasi Siswa',
    deskripsi:
      'Diberikan kepada siswa yang meninggalkan jam pelajaran karena tugas resmi sekolah (lomba, pentas seni, latihan, organisasi).',
    formatLayout: 'surat_keterangan',
    studentRequestable: true,
    requiresStudent: true,
    defaultPerihal: 'Surat Dispensasi Mengikuti Kegiatan Resmi',
    fields: [
      {
        key: 'namaKegiatan',
        label: 'Nama Kegiatan / Lomba / Tugas',
        type: 'text',
        required: true,
        placeholder: 'Mis. Olimpiade Sains Tingkat Kabupaten / Pentas Seni Daerah',
      },
      {
        key: 'penyelenggara',
        label: 'Penyelenggara Kegiatan',
        type: 'text',
        required: true,
        placeholder: 'Mis. Dinas Pendidikan Kabupaten Sleman',
      },
      {
        key: 'tanggalPelaksanaan',
        label: 'Hari & Tanggal Pelaksanaan',
        type: 'text',
        required: true,
        placeholder: 'Mis. Rabu–Kamis, 14–15 Oktober 2026',
      },
      {
        key: 'waktuTempat',
        label: 'Waktu & Lokasi Kegiatan',
        type: 'text',
        required: true,
        placeholder: 'Mis. 08.00–15.00 WIB di Gedung Serbaguna',
      },
      {
        key: 'pendamping',
        label: 'Guru / Pembina Pendamping',
        type: 'text',
        placeholder: 'Nama guru pendamping (jika ada)',
      },
    ],
  },
  {
    id: 'surat_peringatan_siswa',
    kategori: 'Keperluan Internal Sekolah',
    kodeNomor: 'SP-SISWA',
    nama: 'Surat Peringatan / Pembinaan Siswa',
    deskripsi:
      'Mencatat pelanggaran tata tertib dan mengundang orang tua/wali untuk pembinaan lanjutan.',
    formatLayout: 'surat_resmi',
    studentRequestable: false,
    requiresStudent: true,
    defaultPerihal: 'Pemberitahuan Pembinaan Kedisiplinan & Undangan Orang Tua/Wali',
    fields: [
      {
        key: 'tingkatPeringatan',
        label: 'Tingkat Surat Peringatan',
        type: 'select',
        required: true,
        options: ['Pembinaan Awal / Teguran Lisan Tercatat', 'Surat Peringatan I (SP-1)', 'Surat Peringatan II (SP-2)', 'Surat Peringatan III (SP-3)'],
        defaultValue: 'Surat Peringatan I (SP-1)',
      },
      {
        key: 'uraianPelanggaran',
        label: 'Uraian Catatan Kedisiplinan / Ketidakhadiran',
        type: 'textarea',
        required: true,
        placeholder: 'Jelaskan kronologi pelanggaran tata tertib atau ketidakhadiran tanpa keterangan...',
      },
      {
        key: 'jadwalPertemuanOrtu',
        label: 'Jadwal Pertemuan Orang Tua / Wali',
        type: 'text',
        required: true,
        placeholder: 'Mis. Senin, 20 Oktober 2026 pukul 09.00 WIB di Ruang BK',
      },
      {
        key: 'tindakLanjut',
        label: 'Rencana Pembinaan yang Disiapkan',
        type: 'textarea',
        defaultValue: 'Konseling terarah bersama Wali Kelas, Guru BK, dan komitmen bersama orang tua/wali.',
      },
    ],
  },

  // =========================================================
  // 2. KEPERLUAN EKSTERNAL & INSTANSI LUAR
  // =========================================================
  {
    id: 'sk_beasiswa_bantuan',
    kategori: 'Keperluan Eksternal & Instansi Luar',
    kodeNomor: 'SK-BEA',
    nama: 'Surat Pengantar / Keterangan Beasiswa atau Bantuan',
    deskripsi:
      'Memuat identitas siswa, status keaktifan, serta keterangan prestasi atau kondisi administrasi syarat beasiswa/PIP/KIP.',
    formatLayout: 'surat_keterangan',
    studentRequestable: true,
    requiresStudent: true,
    defaultPerihal: 'Surat Keterangan Pengajuan Beasiswa / Bantuan Pendidikan',
    fields: [
      {
        key: 'namaProgram',
        label: 'Nama Program Beasiswa / Bantuan',
        type: 'text',
        required: true,
        placeholder: 'Mis. Program Indonesia Pintar (PIP) / Beasiswa Prestasi Daerah',
      },
      {
        key: 'instansiTujuan',
        label: 'Instansi / Lembaga Pemberi Bantuan',
        type: 'text',
        required: true,
        placeholder: 'Mis. Dinas Pendidikan / Baznas / Yayasan Beasiswa',
      },
      {
        key: 'keteranganPendukung',
        label: 'Keterangan Pendukung (Prestasi / Peringkat / Kondisi Ekonomi)',
        type: 'textarea',
        required: true,
        placeholder: 'Mis. Peserta didik berprestasi akademik peringkat 3 besar kelas dan aktif berorganisasi.',
      },
      {
        key: 'pernyataanBeasiswaLain',
        label: 'Status Penerimaan Beasiswa Lain',
        type: 'text',
        defaultValue: 'Saat ini belum/tidak sedang menerima beasiswa sejenis dari sumber lain',
      },
    ],
  },
  {
    id: 'sk_berkelakuan_baik',
    kategori: 'Keperluan Eksternal & Instansi Luar',
    kodeNomor: 'SKBB',
    nama: 'Surat Keterangan Berkelakuan Baik',
    deskripsi:
      'Untuk pendaftaran lomba, organisasi, program kepemudaan, beasiswa, atau administrasi yang mensyaratkan catatan sikap.',
    formatLayout: 'surat_keterangan',
    studentRequestable: true,
    requiresStudent: true,
    defaultPerihal: 'Surat Keterangan Berkelakuan Baik',
    fields: [
      {
        key: 'keperluan',
        label: 'Keperluan Pengajuan SKBB',
        type: 'text',
        required: true,
        placeholder: 'Mis. Pendaftaran Beasiswa / Seleksi Paskibraka / Pendaftaran Sekolah Lanjutan',
      },
      {
        key: 'penilaianSikap',
        label: 'Catatan Sikap & Kedisiplinan',
        type: 'textarea',
        defaultValue:
          'Selama mengikuti pendidikan di satuan pendidikan ini, peserta didik bersangkutan berkelakuan baik, menaati tata tertib lembaga, serta tidak pernah terlibat pelanggaran hukum maupun tata tertib berat.',
      },
    ],
  },
  {
    id: 'surat_pengantar_magang',
    kategori: 'Keperluan Eksternal & Instansi Luar',
    kodeNomor: 'SP-PKL',
    nama: 'Surat Pengantar Magang / PKL / Kunjungan Belajar',
    deskripsi:
      'Mengajukan penempatan praktik kerja lapangan (PKL), magang vokasi, observasi, atau kunjungan ke mitra/DUDI.',
    formatLayout: 'surat_resmi',
    studentRequestable: true,
    requiresStudent: true,
    defaultPerihal: 'Permohonan Penempatan Magang / Praktik Kerja Lapangan (PKL)',
    fields: [
      {
        key: 'instansiMitra',
        label: 'Nama Instansi / Perusahaan / Mitra Tujuan',
        type: 'text',
        required: true,
        placeholder: 'Mis. PT Karya Digital Nusantara / Balai Latihan Kerja',
      },
      {
        key: 'alamatMitra',
        label: 'Alamat Instansi Mitra',
        type: 'text',
        required: true,
        placeholder: 'Alamat lengkap mitra tujuan',
      },
      {
        key: 'bidangKegiatan',
        label: 'Jenis Program & Bidang Keahlian',
        type: 'text',
        required: true,
        placeholder: 'Mis. Praktik Kerja Lapangan (PKL) Bidang Administrasi Perkantoran / Desain',
      },
      {
        key: 'periodePelaksanaan',
        label: 'Periode Pelaksanaan',
        type: 'text',
        required: true,
        placeholder: 'Mis. 1 November 2026 s.d. 31 Januari 2027 (3 Bulan)',
      },
      {
        key: 'pembimbingSekolah',
        label: 'Nama & Kontak Pembimbing dari Sekolah',
        type: 'text',
        placeholder: 'Nama guru pembimbing & No. HP',
      },
    ],
  },
  {
    id: 'sk_rekomendasi_siswa',
    kategori: 'Keperluan Eksternal & Instansi Luar',
    kodeNomor: 'REKOM',
    nama: 'Surat Keterangan Pendamping / Rekomendasi Siswa',
    deskripsi:
      'Mendukung keikutsertaan siswa dalam seleksi lomba, pelatihan, pertukaran pelajar, atau kegiatan resmi eksternal.',
    formatLayout: 'surat_keterangan',
    studentRequestable: true,
    requiresStudent: true,
    defaultPerihal: 'Surat Rekomendasi Peserta Didik',
    fields: [
      {
        key: 'programTujuan',
        label: 'Nama Seleksi / Lomba / Program Eksternal',
        type: 'text',
        required: true,
        placeholder: 'Mis. Seleksi Duta Literasi / Pelatihan Kewirausahaan Pemuda',
      },
      {
        key: 'penyelenggara',
        label: 'Lembaga Penyelenggara',
        type: 'text',
        required: true,
        placeholder: 'Mis. Kementerian Pendidikan / Pemerintah Daerah',
      },
      {
        key: 'alasanRekomendasi',
        label: 'Pertimbangan & Keunggulan Peserta Didik',
        type: 'textarea',
        required: true,
        placeholder: 'Jelaskan kompetensi, prestasi, atau karakter unggulan yang mendasari rekomendasi...',
      },
    ],
  },

  // =========================================================
  // 3. MUTASI, KELULUSAN & LAYANAN KHUSUS
  // =========================================================
  {
    id: 'sk_pindah_mutasi',
    kategori: 'Mutasi, Kelulusan & Layanan Khusus',
    kodeNomor: 'MUT-OUT',
    nama: 'Surat Keterangan Pindah Sekolah / Mutasi Keluar',
    deskripsi:
      'Dikeluarkan satuan pendidikan asal sebagai dokumen resmi pindah jalur, pindah rombel, atau pindah satuan pendidikan.',
    formatLayout: 'surat_keterangan',
    studentRequestable: true,
    requiresStudent: true,
    defaultPerihal: 'Surat Keterangan Pindah Sekolah / Mutasi Peserta Didik',
    fields: [
      {
        key: 'sekolahTujuan',
        label: 'Satuan Pendidikan Tujuan',
        type: 'text',
        required: true,
        placeholder: 'Nama sekolah/PKBM tujuan (dan kabupaten/kota)',
      },
      {
        key: 'alasanPindah',
        label: 'Alasan Pindah / Mutasi',
        type: 'text',
        required: true,
        placeholder: 'Mis. Mengikuti perpindahan domisili orang tua / Pindah jalur pendidikan',
      },
      {
        key: 'tanggalEfektif',
        label: 'Tanggal Efektif Mutasi',
        type: 'date',
        required: true,
      },
      {
        key: 'kelengkapanLampiran',
        label: 'Berkas yang Disertakan',
        type: 'text',
        defaultValue: 'Rapor asli terakhir, fotokopi akta/KK, serta status mutasi Dapodik.',
      },
    ],
  },
  {
    id: 'surat_permohonan_mutasi_masuk',
    kategori: 'Mutasi, Kelulusan & Layanan Khusus',
    kodeNomor: 'MUT-IN',
    nama: 'Surat Permohonan / Pengantar Mutasi Masuk',
    deskripsi:
      'Pengajuan atau surat pengantar penerimaan mutasi masuk siswa beserta kelengkapan berkas rapor, surat pindah asal, dan Dapodik.',
    formatLayout: 'surat_resmi',
    studentRequestable: true,
    requiresStudent: true,
    defaultPerihal: 'Surat Keterangan Kesediaan / Pengantar Mutasi Masuk Peserta Didik',
    fields: [
      {
        key: 'sekolahAsal',
        label: 'Satuan Pendidikan Asal',
        type: 'text',
        required: true,
        placeholder: 'Nama sekolah/PKBM asal peserta didik',
      },
      {
        key: 'kelasTujuan',
        label: 'Kelas / Program yang Dituju',
        type: 'text',
        required: true,
        placeholder: 'Mis. Kelas 8 SMP (Paket B)',
      },
      {
        key: 'berkasPendukung',
        label: 'Daftar Berkas Pendukung Terlampir',
        type: 'textarea',
        defaultValue: '1. Rapor lengkap dari sekolah asal\n2. Surat Keterangan Pindah dari satuan pendidikan asal\n3. Fotokopi Kartu Keluarga, Akta Kelahiran, dan cetak NISN/Dapodik',
      },
    ],
  },
  {
    id: 'skl_kelulusan',
    kategori: 'Mutasi, Kelulusan & Layanan Khusus',
    kodeNomor: 'SKL',
    nama: 'Surat Keterangan Lulus (SKL)',
    deskripsi:
      'Dokumen resmi sementara sebelum ijazah asli terbit untuk keperluan pendaftaran jenjang berikutnya atau melamar kerja.',
    formatLayout: 'surat_keterangan',
    studentRequestable: true,
    requiresStudent: true,
    defaultPerihal: 'Surat Keterangan Lulus (SKL) Sementara',
    fields: [
      {
        key: 'programJenjang',
        label: 'Jenjang / Program Kelulusan',
        type: 'text',
        required: true,
        placeholder: 'Mis. Paket A (Setara SD) / Paket B (Setara SMP) / Paket C (Setara SMA)',
      },
      {
        key: 'nomorSkKelulusan',
        label: 'Nomor SK Penetapan Kelulusan',
        type: 'text',
        required: true,
        placeholder: 'Mis. 042/SK-LULUS/PKBM/V/2026',
      },
      {
        key: 'tanggalRapatKelulusan',
        label: 'Tanggal Rapat Dewan Pendidik / Kelulusan',
        type: 'date',
        required: true,
      },
      {
        key: 'rataRataNilai',
        label: 'Rata-rata Nilai Akhir / Ijazah Sementara',
        type: 'text',
        placeholder: 'Mis. 86,50',
      },
    ],
  },
  {
    id: 'sk_nilai_sementara',
    kategori: 'Mutasi, Kelulusan & Layanan Khusus',
    kodeNomor: 'SK-NILAI',
    nama: 'Surat Keterangan Rapor / Nilai Sementara',
    deskripsi:
      'Bukti capaian belajar atau rekap nilai sementara sebelum rapor/dokumen resmi terbit atau saat proses verifikasi data.',
    formatLayout: 'surat_keterangan',
    studentRequestable: true,
    requiresStudent: true,
    defaultPerihal: 'Surat Keterangan Capaian Nilai Rapor Sementara',
    fields: [
      {
        key: 'periodeSemester',
        label: 'Periode Semester & Tahun Ajaran',
        type: 'text',
        required: true,
        placeholder: 'Mis. Semester 1 (Ganjil) Tahun Ajaran 2026/2027',
      },
      {
        key: 'ringkasanCapaian',
        label: 'Ringkasan Nilai / Capaian Akademik',
        type: 'textarea',
        required: true,
        placeholder: 'Tuliskan rincian nilai rata-rata, status ketuntasan KKTP, atau keterangan capaian sementara...',
      },
      {
        key: 'keperluan',
        label: 'Keperluan Penerbitan',
        type: 'text',
        defaultValue: 'Verifikasi administrasi akademik sambil menunggu penerbitan rapor resmi.',
      },
    ],
  },
  {
    id: 'sk_beda_data',
    kategori: 'Mutasi, Kelulusan & Layanan Khusus',
    kodeNomor: 'SK-BEDA',
    nama: 'Surat Keterangan Beda Data / Kesalahan Penulisan',
    deskripsi:
      'Menjelaskan perbedaan atau kekeliruan penulisan nama, tanggal lahir, NIK, atau data administrasi sambil menunggu perbaikan resmi.',
    formatLayout: 'surat_keterangan',
    studentRequestable: true,
    requiresStudent: true,
    defaultPerihal: 'Surat Keterangan Perbedaan / Ralat Data Peserta Didik',
    fields: [
      {
        key: 'jenisData',
        label: 'Jenis Data yang Berbeda',
        type: 'select',
        required: true,
        options: ['Nama Lengkap', 'Tempat / Tanggal Lahir', 'NIK / KK', 'NISN', 'Nama Orang Tua / Wali', 'Lainnya'],
        defaultValue: 'Nama Lengkap',
      },
      {
        key: 'dokumenSumberSalah',
        label: 'Tertulis pada Dokumen (Sumber Lama/Keliru)',
        type: 'text',
        required: true,
        placeholder: 'Mis. Tertulis di Ijazah SD / Rapor Lama: "M. Rayan"',
      },
      {
        key: 'dataBenarResmi',
        label: 'Data yang Benar Sesuai Dokumen Kependudukan (KK/Akta)',
        type: 'text',
        required: true,
        placeholder: 'Mis. Sesuai Akta Kelahiran & KK: "Muhammad Rayyan Pratama"',
      },
      {
        key: 'keteranganTambahan',
        label: 'Keterangan Penegasan Identitas',
        type: 'textarea',
        defaultValue:
          'Kedua penulisan data tersebut merujuk pada satu orang peserta didik yang sama dan sah tercatat di satuan pendidikan kami, sambil menunggu proses pemutakhiran data resmi.',
      },
    ],
  },

  // =========================================================
  // 4. PENGUMUMAN SEKOLAH UNTUK SISWA
  // =========================================================
  {
    id: 'png_jadwal_ujian',
    kategori: 'Pengumuman Sekolah',
    subKategori: 'Akademik & Penilaian',
    kodeNomor: 'PNG-UJN',
    nama: 'Pengumuman Jadwal Ujian / Asesmen',
    deskripsi:
      'Pemberitahuan jadwal penilaian tengah/akhir semester, asesmen sumatif, ujian kesetaraan, tata tertib & perlengkapan wajib.',
    formatLayout: 'pengumuman',
    defaultPerihal: 'Jadwal Pelaksanaan Asesmen / Ujian Semester',
    defaultTargetAudience: 'Seluruh Peserta Didik & Orang Tua/Wali',
    fields: [
      {
        key: 'jenisUjian',
        label: 'Nama Asesmen / Ujian',
        type: 'text',
        required: true,
        placeholder: 'Mis. Sumatif Akhir Semester (SAS) Ganjil / Ujian Kesetaraan',
      },
      {
        key: 'tanggalPelaksanaan',
        label: 'Rentang Tanggal & Waktu Pelaksanaan',
        type: 'text',
        required: true,
        placeholder: 'Mis. Senin–Sabtu, 7–12 Desember 2026 pukul 07.30–12.00 WIB',
      },
      {
        key: 'perlengkapanWajib',
        label: 'Perlengkapan & Syarat yang Wajib Dibawa',
        type: 'textarea',
        defaultValue: 'Kartu Peserta Ujian, alat tulis lengkap, serta berpakaian seragam/rapi sesuai ketentuan lembaga.',
      },
      {
        key: 'tataTertib',
        label: 'Tata Tertib & Ketentuan Kehadiran',
        type: 'textarea',
        defaultValue: 'Peserta didik wajib hadir 15 menit sebelum asesmen dimulai dan menjaga ketertiban selama ujian berlangsung.',
      },
    ],
  },
  {
    id: 'png_pembagian_rapor',
    kategori: 'Pengumuman Sekolah',
    subKategori: 'Akademik & Penilaian',
    kodeNomor: 'PNG-RPR',
    nama: 'Pengumuman Pembagian Rapor',
    deskripsi:
      'Informasi tanggal, waktu, teknis pengambilan rapor (tatap muka orang tua/wali atau daring), serta syarat administrasi.',
    formatLayout: 'pengumuman',
    defaultPerihal: 'Pemberitahuan Jadwal & Teknis Pembagian Rapor Hasil Belajar',
    defaultTargetAudience: 'Orang Tua/Wali & Peserta Didik',
    fields: [
      {
        key: 'hariTanggalWaktu',
        label: 'Hari, Tanggal & Waktu',
        type: 'text',
        required: true,
        placeholder: 'Mis. Sabtu, 19 Desember 2026 · Pukul 08.30–12.00 WIB',
      },
      {
        key: 'teknisLokasi',
        label: 'Teknis Pengambilan (Tatap Muka / Daring)',
        type: 'text',
        required: true,
        placeholder: 'Mis. Hadir tatap muka Orang Tua/Wali di Ruang Kelas masing-masing / Portal Orang Tua',
      },
      {
        key: 'syaratAdministrasi',
        label: 'Syarat Administrasi Sebelum Pengambilan',
        type: 'textarea',
        defaultValue: 'Menyelesaikan seluruh tugas pembelajaran/remedial bersama guru mapel dan membawa kartu kendali siswa.',
      },
    ],
  },
  {
    id: 'png_libur_awal_ta',
    kategori: 'Pengumuman Sekolah',
    subKategori: 'Akademik & Penilaian',
    kodeNomor: 'PNG-LBR',
    nama: 'Pengumuman Libur Semester & Awal Tahun Ajaran',
    deskripsi:
      'Jadwal libur resmi, tanggal masuk kembali, masa pengenalan lingkungan belajar (MPLS/orientasi), dan pembagian kelas.',
    formatLayout: 'pengumuman',
    defaultPerihal: 'Pemberitahuan Libur Semester & Jadwal Awal Masuk Pembelajaran',
    defaultTargetAudience: 'Seluruh Peserta Didik, Guru & Orang Tua/Wali',
    fields: [
      {
        key: 'periodeLibur',
        label: 'Jadwal Libur Resmi',
        type: 'text',
        required: true,
        placeholder: 'Mis. 21 Desember 2026 s.d. 3 Januari 2027',
      },
      {
        key: 'tanggalMasuk',
        label: 'Tanggal Masuk Kembali / Awal Semester',
        type: 'text',
        required: true,
        placeholder: 'Mis. Senin, 4 Januari 2027 pukul 07.30 WIB',
      },
      {
        key: 'infoOrientasi',
        label: 'Agenda MPLS / Orientasi & Pembagian Kelas',
        type: 'textarea',
        defaultValue: 'Hari pertama diisi dengan pengarahan wali kelas, pembagian jadwal pelajaran baru, dan asesmen diagnostik awal.',
      },
    ],
  },
  {
    id: 'png_kelulusan_ijazah',
    kategori: 'Pengumuman Sekolah',
    subKategori: 'Akademik & Penilaian',
    kodeNomor: 'PNG-IJZ',
    nama: 'Pengumuman Kelulusan & Pengambilan Ijazah / SKL',
    deskripsi:
      'Teknis pengumuman kelulusan, jadwal cap tiga jari, serta prosedur pengambilan SKL atau ijazah.',
    formatLayout: 'pengumuman',
    defaultPerihal: 'Pengumuman Kelulusan & Jadwal Pengambilan SKL / Ijazah',
    defaultTargetAudience: 'Peserta Didik Tingkat Akhir & Orang Tua/Wali',
    fields: [
      {
        key: 'jadwalPengumuman',
        label: 'Jadwal & Kanal Pengumuman Kelulusan',
        type: 'text',
        required: true,
        placeholder: 'Mis. Senin, 5 Mei 2026 pukul 10.00 WIB melalui surat resmi & portal lembaga',
      },
      {
        key: 'jadwalCapJari',
        label: 'Jadwal Cap Tiga Jari & Pengambilan SKL/Ijazah',
        type: 'text',
        required: true,
        placeholder: 'Mis. 12–16 Mei 2026 pukul 08.00–13.00 WIB di Ruang Tata Usaha',
      },
      {
        key: 'prosedurPengambilan',
        label: 'Syarat & Prosedur Pengambilan',
        type: 'textarea',
        defaultValue: 'Peserta didik wajib hadir langsung (tidak diwakilkan) untuk pembubuhan cap tiga jari dengan berpakaian rapi dan bersepatu, serta membawa kartu pelajar.',
      },
    ],
  },
  {
    id: 'png_ekskul_lomba_hb',
    kategori: 'Pengumuman Sekolah',
    subKategori: 'Kegiatan & Kesiswaan',
    kodeNomor: 'PNG-KEG',
    nama: 'Pengumuman Kegiatan Ekstrakurikuler, Lomba & Hari Besar',
    deskripsi:
      'Pemberitahuan pentas seni, class meeting, peringatan hari nasional/keagamaan, maupun seleksi lomba.',
    formatLayout: 'pengumuman',
    defaultPerihal: 'Pemberitahuan Pelaksanaan Kegiatan Kesiswaan / Peringatan Hari Besar',
    defaultTargetAudience: 'Seluruh Peserta Didik',
    fields: [
      {
        key: 'namaKegiatan',
        label: 'Nama Kegiatan / Lomba / Peringatan',
        type: 'text',
        required: true,
        placeholder: 'Mis. Class Meeting & Pentas Seni Akhir Semester / Peringatan Hari Pendidikan',
      },
      {
        key: 'waktuTempat',
        label: 'Waktu & Tempat Pelaksanaan',
        type: 'text',
        required: true,
        placeholder: 'Mis. 14–16 Desember 2026 di Aula & Lapangan Lembaga',
      },
      {
        key: 'ketentuanPeserta',
        label: 'Ketentuan Pendaftaran & Pakaian / Perlengkapan',
        type: 'textarea',
        required: true,
        placeholder: 'Jelaskan cabang lomba, pakaian yang dikenakan, dan penanggung jawab kegiatan...',
      },
    ],
  },
  {
    id: 'png_outing_class',
    kategori: 'Pengumuman Sekolah',
    subKategori: 'Kegiatan & Kesiswaan',
    kodeNomor: 'PNG-OUT',
    nama: 'Pengumuman Outing Class / Kunjungan Belajar / Praktik Lapangan',
    deskripsi:
      'Informasi tujuan kegiatan, jadwal keberangkatan-kepulangan, perlengkapan peserta didik, pendamping & izin orang tua.',
    formatLayout: 'pengumuman',
    defaultPerihal: 'Pemberitahuan Kegiatan Outing Class & Kunjungan Belajar Lapangan',
    defaultTargetAudience: 'Peserta Didik & Orang Tua/Wali',
    fields: [
      {
        key: 'tujuanLokasi',
        label: 'Lokasi Tujuan Outing / Praktik Lapangan',
        type: 'text',
        required: true,
        placeholder: 'Mis. Museum Taman Pintar & Sentra Agroekologi Sleman',
      },
      {
        key: 'jadwalBerangkatPulang',
        label: 'Jadwal Keberangkatan & Kepulangan',
        type: 'text',
        required: true,
        placeholder: 'Mis. Kamis, 12 November 2026 · Berangkat 07.00 WIB, Kembali 15.30 WIB',
      },
      {
        key: 'perlengkapanPendamping',
        label: 'Perlengkapan Siswa & Tim Pendamping',
        type: 'textarea',
        defaultValue: 'Membawa buku catatan lapangan, botol minum, obat pribadi (bila ada), serta mengenakan seragam/kaos identitas lembaga. Didampingi oleh Wali Kelas & Guru Pembimbing.',
      },
      {
        key: 'ketentuanIzinOrtu',
        label: 'Ketentuan Izin Orang Tua / Wali',
        type: 'text',
        defaultValue: 'Orang tua/wali dimohon mengisi konfirmasi izin melalui Buku Penghubung / formulir izin paling lambat H-2 kegiatan.',
      },
    ],
  },
  {
    id: 'png_undangan_ortu',
    kategori: 'Pengumuman Sekolah',
    subKategori: 'Kegiatan & Kesiswaan',
    kodeNomor: 'PNG-UND',
    nama: 'Pengumuman Undangan Pertemuan Orang Tua / Wali',
    deskripsi:
      'Pemberitahuan rapat komite, sosialisasi program pembelajaran/kurikulum, atau forum komunikasi wali kelas dan orang tua.',
    formatLayout: 'pengumuman',
    defaultPerihal: 'Undangan Pertemuan Orang Tua / Wali Peserta Didik',
    defaultTargetAudience: 'Seluruh Orang Tua / Wali Peserta Didik',
    fields: [
      {
        key: 'agendaPertemuan',
        label: 'Agenda Utama Pertemuan',
        type: 'text',
        required: true,
        placeholder: 'Mis. Sosialisasi Kurikulum Merdeka, Asesmen Diagnostik & Program Semester',
      },
      {
        key: 'hariTanggalWaktu',
        label: 'Hari, Tanggal & Pukul',
        type: 'text',
        required: true,
        placeholder: 'Mis. Sabtu, 10 Oktober 2026 · Pukul 09.00–11.00 WIB',
      },
      {
        key: 'tempatPertemuan',
        label: 'Tempat / Tautan Pertemuan',
        type: 'text',
        required: true,
        placeholder: 'Mis. Aula Utama Satuan Pendidikan',
      },
      {
        key: 'catatanKehadiran',
        label: 'Catatan Tambahan',
        type: 'textarea',
        defaultValue: 'Mengingat pentingnya agenda demi kemajuan belajar putra-putri Bapak/Ibu, kehadiran tepat waktu sangat kami harapkan.',
      },
    ],
  },
  {
    id: 'png_pemutakhiran_data',
    kategori: 'Pengumuman Sekolah',
    subKategori: 'Administrasi & Data Peserta Didik',
    kodeNomor: 'PNG-DAT',
    nama: 'Pengumuman Pemutakhiran / Verifikasi Data Siswa',
    deskripsi:
      'Pemberitahuan pengumpulan atau pengecekan berkas KK, Akta Kelahiran, NISN, KIP, atau data Dapodik.',
    formatLayout: 'pengumuman',
    defaultPerihal: 'Pemberitahuan Pemutakhiran & Verifikasi Data Induk Dapodik Siswa',
    defaultTargetAudience: 'Peserta Didik & Orang Tua/Wali',
    fields: [
      {
        key: 'berkasDiminta',
        label: 'Berkas yang Harus Diverifikasi / Dikumpulkan',
        type: 'textarea',
        required: true,
        defaultValue: '1. Fotokopi Kartu Keluarga (KK) terbaru\n2. Fotokopi Akta Kelahiran\n3. Nomor NISN / Kartu Indonesia Pintar (KIP) jika memiliki\n4. Nomor HP aktif Orang Tua/Wali',
      },
      {
        key: 'batasWaktu',
        label: 'Batas Waktu Pengumpulan & Cara Pengiriman',
        type: 'text',
        required: true,
        placeholder: 'Mis. Paling lambat Jumat, 30 Oktober 2026 ke Tata Usaha / Wali Kelas',
      },
    ],
  },
  {
    id: 'png_daftar_ulang',
    kategori: 'Pengumuman Sekolah',
    subKategori: 'Administrasi & Data Peserta Didik',
    kodeNomor: 'PNG-REG',
    nama: 'Pengumuman Daftar Ulang / Registrasi Ulang',
    deskripsi:
      'Informasi jadwal dan berkas yang harus dilengkapi siswa lama untuk melanjutkan ke semester atau jenjang berikutnya.',
    formatLayout: 'pengumuman',
    defaultPerihal: 'Pengumuman Jadwal Daftar Ulang Peserta Didik',
    defaultTargetAudience: 'Peserta Didik Aktif & Orang Tua/Wali',
    fields: [
      {
        key: 'jadwalDaftarUlang',
        label: 'Jadwal Pelayanan Daftar Ulang',
        type: 'text',
        required: true,
        placeholder: 'Mis. 22–30 Juni 2026 (Senin–Jumat pukul 08.00–14.00 WIB)',
      },
      {
        key: 'syaratDaftarUlang',
        label: 'Syarat & Berkas Registrasi Ulang',
        type: 'textarea',
        defaultValue: 'Membawa Rapor Semester genap, mengisi formulir pemutakhiran data wali, serta menyelesaikan administrasi registrasi sesuai ketentuan.',
      },
    ],
  },
  {
    id: 'png_beasiswa',
    kategori: 'Pengumuman Sekolah',
    subKategori: 'Administrasi & Data Peserta Didik',
    kodeNomor: 'PNG-BEA',
    nama: 'Pengumuman Bantuan Pendidikan / Beasiswa',
    deskripsi:
      'Informasi syarat, batas waktu pendaftaran, dan kelengkapan dokumen bagi peserta didik yang memenuhi kriteria.',
    formatLayout: 'pengumuman',
    defaultPerihal: 'Informasi Pendaftaran Program Bantuan Pendidikan / Beasiswa',
    defaultTargetAudience: 'Peserta Didik & Orang Tua/Wali',
    fields: [
      {
        key: 'namaProgram',
        label: 'Nama Program Beasiswa / Bantuan',
        type: 'text',
        required: true,
        placeholder: 'Mis. Beasiswa PIP / Bantuan Pendidikan Daerah',
      },
      {
        key: 'kriteriaSyarat',
        label: 'Kriteria & Kelengkapan Dokumen',
        type: 'textarea',
        required: true,
        placeholder: 'Sebutkan kriteria penerima dan berkas persyaratan (KIP/SKTM/Prestasi/KK)...',
      },
      {
        key: 'batasPendaftaran',
        label: 'Batas Waktu & Narahubung Pendaftaran',
        type: 'text',
        required: true,
        placeholder: 'Mis. Paling lambat 25 November 2026 melalui Bagian Kesiswaan / TU',
      },
    ],
  },
  {
    id: 'png_perubahan_jadwal',
    kategori: 'Pengumuman Sekolah',
    subKategori: 'Khusus, Perubahan Jadwal & Darurat',
    kodeNomor: 'PNG-JDW',
    nama: 'Pengumuman Perubahan Jam Belajar atau Pembelajaran Daring',
    deskripsi:
      'Penyesuaian jadwal akibat rapat dewan guru, kegiatan lembaga, hari libur fakultatif, atau kondisi cuaca/lingkungan.',
    formatLayout: 'pengumuman',
    defaultPerihal: 'Pemberitahuan Penyesuaian Jadwal Belajar / Pembelajaran Daring',
    defaultTargetAudience: 'Seluruh Peserta Didik, Guru & Orang Tua/Wali',
    fields: [
      {
        key: 'alasanPenyesuaian',
        label: 'Dasar / Alasan Perubahan Jadwal',
        type: 'text',
        required: true,
        placeholder: 'Mis. Rapat Evaluasi Dewan Guru / Cuaca Ekstrem / Pemeliharaan Sarana',
      },
      {
        key: 'tanggalBerlaku',
        label: 'Hari & Tanggal Berlaku',
        type: 'text',
        required: true,
        placeholder: 'Mis. Jumat, 6 November 2026',
      },
      {
        key: 'skemaPembelajaran',
        label: 'Teknis / Skema Pembelajaran Pengganti',
        type: 'textarea',
        required: true,
        defaultValue: 'Pembelajaran dilaksanakan secara daring melalui menu Ruang LMS Belajar (materi dan tugas mandiri tersedia sesuai jadwal mata pelajaran).',
      },
    ],
  },
  {
    id: 'png_kesehatan_keamanan',
    kategori: 'Pengumuman Sekolah',
    subKategori: 'Khusus, Perubahan Jadwal & Darurat',
    kodeNomor: 'PNG-KES',
    nama: 'Pengumuman Kewaspadaan Kesehatan / Keamanan Lingkungan',
    deskripsi:
      'Imbauan terkait pencegahan penyakit menular, protokol kesehatan, atau aturan keselamatan antar-jemput siswa.',
    formatLayout: 'pengumuman',
    defaultPerihal: 'Imbauan Kewaspadaan Kesehatan & Keamanan Lingkungan Belajar',
    defaultTargetAudience: 'Seluruh Warga Satuan Pendidikan & Orang Tua/Wali',
    fields: [
      {
        key: 'topikKewaspadaan',
        label: 'Fokus Imbauan Kesehatan / Keamanan',
        type: 'text',
        required: true,
        placeholder: 'Mis. Pencegahan Penyakit Menular Musiman & Ketertiban Antar-Jemput Siswa',
      },
      {
        key: 'langkahPencegahan',
        label: 'Poin-Poin Aturan & Protokol Wajib',
        type: 'textarea',
        required: true,
        defaultValue: '1. Siswa yang sedang demam atau sakit menular diimbau beristirahat di rumah dengan melaporkan izin ke Wali Kelas.\n2. Membawa bekal minum pribadi dan menjaga kebersihan ruang belajar.\n3. Penjemputan siswa dilakukan di area gerbang sekolah pada waktu yang telah ditentukan.',
      },
    ],
  },

  // =========================================================
  // 5. KEPEGAWAIAN & TUGAS PENDIDIK / TENAGA KEPENDIDIKAN
  // =========================================================
  {
    id: 'st_tugas_pegawai',
    kategori: 'Kepegawaian & Tugas Pendidik',
    kodeNomor: 'ST',
    nama: 'Surat Tugas (ST)',
    deskripsi:
      'Penugasan resmi bagi guru, tutor, atau staf mengikuti pelatihan, diklat, workshop, mengawas ujian, atau pendampingan.',
    formatLayout: 'surat_resmi',
    defaultPerihal: 'Surat Tugas Pendidik / Tenaga Kependidikan',
    fields: [
      {
        key: 'namaPegawai',
        label: 'Nama Pegawai / Guru / Tutor yang Ditugaskan',
        type: 'text',
        required: true,
        placeholder: 'Mis. Budi Santoso, S.Pd. (dan/atau tim)',
      },
      {
        key: 'nipJabatanPegawai',
        label: 'NIP / NUPTK & Jabatan',
        type: 'text',
        required: true,
        placeholder: 'Mis. Guru Mata Pelajaran Matematika',
      },
      {
        key: 'dasarPenugasan',
        label: 'Dasar Surat / Undangan',
        type: 'text',
        defaultValue: 'Program Kerja Peningkatan Mutu & Undangan Instansi Terkait',
      },
      {
        key: 'uraianTugas',
        label: 'Uraian Tugas yang Dilaksanakan',
        type: 'textarea',
        required: true,
        placeholder: 'Mis. Mengikuti Workshop Implementasi Kurikulum Merdeka / Mengawas Ujian Kesetaraan',
      },
      {
        key: 'waktuTempatTugas',
        label: 'Hari, Tanggal, Waktu & Lokasi Tugas',
        type: 'text',
        required: true,
        placeholder: 'Mis. Rabu–Kamis, 18–19 November 2026 di Balai Guru Penggerak',
      },
    ],
  },
  {
    id: 'sk_keputusan_pegawai',
    kategori: 'Kepegawaian & Tugas Pendidik',
    kodeNomor: 'SK',
    nama: 'Surat Keputusan (SK) Kepala Lembaga',
    deskripsi:
      'Penetapan resmi internal seperti SK pembagian tugas mengajar, SK wali kelas, SK panitia ujian/kegiatan, atau pengangkatan.',
    formatLayout: 'surat_keputusan',
    defaultPerihal: 'Keputusan Kepala Satuan Pendidikan Tentang Penetapan Tugas',
    fields: [
      {
        key: 'tentang',
        label: 'Tentang (Judul Penetapan SK)',
        type: 'text',
        required: true,
        placeholder: 'Mis. Pembagian Tugas Mengajar, Wali Kelas & Panitia Asesmen Semester Ganjil TA 2026/2027',
      },
      {
        key: 'menimbang',
        label: 'Konsiderans Menimbang',
        type: 'textarea',
        required: true,
        defaultValue: 'Bahwa demi kelancaran pelaksanaan kegiatan pembelajaran dan tata kelola akademik pada satuan pendidikan, dipandang perlu menetapkan pembagian tugas dan tanggung jawab pendidik/tenaga kependidikan.',
      },
      {
        key: 'mengingat',
        label: 'Dasar Hukum / Mengingat',
        type: 'textarea',
        defaultValue: '1. Undang-Undang Nomor 20 Tahun 2003 tentang Sistem Pendidikan Nasional\n2. Ketentuan Kurikulum Merdeka & Kalender Pendidikan Tahun Ajaran berjalan\n3. Hasil Rapat Dewan Pendidik dan Pengurus Lembaga',
      },
      {
        key: 'memutuskan',
        label: 'Diktum Menetapkan / Isi Keputusan',
        type: 'textarea',
        required: true,
        placeholder: 'PERTAMA: Menetapkan nama-nama pendidik dan pembagian tugas sebagaimana tercantum...\nKEDUA: Keputusan ini berlaku sejak tanggal ditetapkan...',
      },
    ],
  },
  {
    id: 'sk_aktif_mengajar',
    kategori: 'Kepegawaian & Tugas Pendidik',
    kodeNomor: 'SK-KBM',
    nama: 'Surat Keterangan Mengajar / Aktif Bekerja',
    deskripsi:
      'Bukti resmi status kepegawaian dan beban mengajar pendidik untuk keperluan sertifikasi, tunjangan, atau administrasi instansi/bank.',
    formatLayout: 'surat_keterangan',
    defaultPerihal: 'Surat Keterangan Aktif Mengajar / Bekerja',
    fields: [
      {
        key: 'namaPegawai',
        label: 'Nama Pendidik / Tenaga Kependidikan',
        type: 'text',
        required: true,
      },
      {
        key: 'nipNuptk',
        label: 'NIP / NUPTK / NIK',
        type: 'text',
        placeholder: 'Nomor induk kepegawaian atau NIK',
      },
      {
        key: 'jabatanMapel',
        label: 'Jabatan & Mata Pelajaran Diampu',
        type: 'text',
        required: true,
        placeholder: 'Mis. Guru Tetap / Tutor Mata Pelajaran Bahasa Indonesia & Wali Kelas 7',
      },
      {
        key: 'bebanJam',
        label: 'Beban Mengajar & Masa Kerja',
        type: 'text',
        required: true,
        placeholder: 'Mis. 24 JP/SKK per minggu · Aktif bekerja sejak Juli 2023 s.d. sekarang',
      },
      {
        key: 'keperluan',
        label: 'Keperluan Surat',
        type: 'text',
        defaultValue: 'Persyaratan administrasi sertifikasi / tunjangan profesi / perbankan.',
      },
    ],
  },
  {
    id: 'sp_teguran_pegawai',
    kategori: 'Kepegawaian & Tugas Pendidik',
    kodeNomor: 'SP-PEG',
    nama: 'Surat Peringatan / Teguran Pegawai',
    deskripsi:
      'Dokumen pembinaan kedisiplinan internal bagi staf atau pendidik.',
    formatLayout: 'surat_resmi',
    defaultPerihal: 'Surat Teguran & Pembinaan Disiplin Pegawai',
    fields: [
      {
        key: 'namaPegawai',
        label: 'Nama Pegawai / Pendidik',
        type: 'text',
        required: true,
      },
      {
        key: 'jabatanPegawai',
        label: 'Jabatan / Unit Kerja',
        type: 'text',
        required: true,
      },
      {
        key: 'tingkatSp',
        label: 'Kategori Peringatan',
        type: 'select',
        options: ['Teguran Tertulis / Pembinaan', 'Surat Peringatan I (SP-1)', 'Surat Peringatan II (SP-2)', 'Surat Peringatan III (SP-3)'],
        defaultValue: 'Surat Peringatan I (SP-1)',
      },
      {
        key: 'uraianPelanggaran',
        label: 'Uraian Pelanggaran / Ketidaksesuaian Kinerja',
        type: 'textarea',
        required: true,
      },
      {
        key: 'arahanPerbaikan',
        label: 'Arahan Perbaikan & Evaluasi',
        type: 'textarea',
        defaultValue: 'Diharapkan segera melakukan perbaikan kinerja dan kedisiplinan kerja dalam kurun waktu 14 hari kerja ke depan.',
      },
    ],
  },

  // =========================================================
  // 6. KERJA SAMA, KEMITRAAN & HUBUNGAN EKSTERNAL
  // =========================================================
  {
    id: 'surat_permohonan_mou',
    kategori: 'Kerja Sama & Kemitraan',
    kodeNomor: 'MOU',
    nama: 'Surat Permohonan Kerja Sama / MoU',
    deskripsi:
      'Pengajuan kemitraan dengan DUDI, puskesmas, kepolisian, kelurahan, atau lembaga pelatihan untuk magang, penyuluhan, atau pendampingan.',
    formatLayout: 'surat_resmi',
    defaultPerihal: 'Permohonan Penjajakan Kerja Sama Program (MoU)',
    fields: [
      {
        key: 'bidangKerjasama',
        label: 'Bidang & Ruang Lingkup Kerja Sama',
        type: 'text',
        required: true,
        placeholder: 'Mis. Praktik Kerja Lapangan (PKL), Pelatihan Vokasi, atau Penyuluhan Kesehatan',
      },
      {
        key: 'tujuanManfaat',
        label: 'Tujuan & Bentuk Sinergi Program',
        type: 'textarea',
        required: true,
        placeholder: 'Jelaskan bentuk kegiatan bersama, durasi kemitraan, dan manfaat bagi peserta didik/masyarakat...',
      },
      {
        key: 'usulanJadwalAudiensi',
        label: 'Usulan Jadwal Audiensi / Penandatanganan',
        type: 'text',
        placeholder: 'Mis. Minggu kedua November 2026 menyesuaikan kesediaan Bapak/Ibu',
      },
    ],
  },
  {
    id: 'surat_undangan_narasumber',
    kategori: 'Kerja Sama & Kemitraan',
    kodeNomor: 'UND-NRS',
    nama: 'Surat Undangan Narasumber / Pemateri',
    deskripsi:
      'Permohonan resmi mengundang praktisi, tokoh masyarakat, atau instansi untuk kelas inspirasi, pelatihan vokasi, atau sosialisasi.',
    formatLayout: 'surat_resmi',
    defaultPerihal: 'Permohonan Kesediaan Menjadi Narasumber / Pemateri',
    fields: [
      {
        key: 'namaAcara',
        label: 'Nama Kegiatan / Kelas Inspirasi / Pelatihan',
        type: 'text',
        required: true,
        placeholder: 'Mis. Kelas Inspirasi Kewirausahaan & Literasi Digital Siswa',
      },
      {
        key: 'topikMateri',
        label: 'Topik Materi yang Diharapkan',
        type: 'text',
        required: true,
        placeholder: 'Mis. Membangun Keterampilan Siap Kerja dan Etika Profesi',
      },
      {
        key: 'hariTanggalWaktu',
        label: 'Hari, Tanggal & Durasi Sesi',
        type: 'text',
        required: true,
        placeholder: 'Mis. Jumat, 20 November 2026 · Pukul 09.00–11.00 WIB',
      },
      {
        key: 'lokasiAcara',
        label: 'Lokasi Pelaksanaan',
        type: 'text',
        required: true,
        placeholder: 'Mis. Aula Satuan Pendidikan',
      },
      {
        key: 'narahubung',
        label: 'Narahubung Panitia',
        type: 'text',
        placeholder: 'Nama & nomor telepon panitia',
      },
    ],
  },
  {
    id: 'surat_izin_tempat',
    kategori: 'Kerja Sama & Kemitraan',
    kodeNomor: 'IZN-TMP',
    nama: 'Surat Permohonan Izin Tempat / Peminjaman Fasilitas',
    deskripsi:
      'Pengajuan penggunaan gedung, lapangan, aula, atau sarana milik pihak luar untuk kegiatan belajar atau acara lembaga.',
    formatLayout: 'surat_resmi',
    defaultPerihal: 'Permohonan Izin Penggunaan Tempat / Peminjaman Fasilitas',
    fields: [
      {
        key: 'fasilitasDipinjam',
        label: 'Nama Gedung / Lapangan / Sarana yang Diajukan',
        type: 'text',
        required: true,
        placeholder: 'Mis. Aula Balai Desa / Lapangan Olahraga Kecamatan',
      },
      {
        key: 'namaKegiatan',
        label: 'Keperluan / Nama Kegiatan',
        type: 'text',
        required: true,
        placeholder: 'Mis. Gelar Karya Projek P5 & Pentas Seni Akhir Tahun',
      },
      {
        key: 'waktuPeminjaman',
        label: 'Tanggal & Jam Peminjaman',
        type: 'text',
        required: true,
        placeholder: 'Mis. Sabtu, 19 Desember 2026 · Pukul 07.00–15.00 WIB',
      },
      {
        key: 'jumlahPeserta',
        label: 'Perkiraan Jumlah Peserta & Komitmen Kebersihan',
        type: 'textarea',
        defaultValue: 'Diikuti oleh sekitar 120 peserta didik dan pendidik. Kami berkomitmen menjaga ketertiban, keamanan, serta kebersihan fasilitas sebelum dan sesudah pemakaian.',
      },
    ],
  },
  {
    id: 'surat_ucapan_terima_kasih',
    kategori: 'Kerja Sama & Kemitraan',
    kodeNomor: 'SUK',
    nama: 'Surat Ucapan Terima Kasih',
    deskripsi:
      'Apresiasi resmi kepada mitra, sponsor, narasumber, atau orang tua setelah kegiatan selesai dilaksanakan.',
    formatLayout: 'surat_resmi',
    defaultPerihal: 'Ucapan Terima Kasih & Apresiasi Dukungan Kegiatan',
    fields: [
      {
        key: 'kegiatanTerkait',
        label: 'Nama Kegiatan / Kontribusi yang Telah Diberikan',
        type: 'text',
        required: true,
        placeholder: 'Mis. Narasumber Workshop Vokasi / Dukungan Sarana Pojok Baca',
      },
      {
        key: 'tanggalKegiatan',
        label: 'Tanggal Pelaksanaan',
        type: 'text',
        required: true,
        placeholder: 'Mis. 14 Oktober 2026',
      },
      {
        key: 'isiApresiasi',
        label: 'Pesan Apresiasi & Dampak Positif',
        type: 'textarea',
        defaultValue: 'Kontribusi dan dukungan yang Bapak/Ibu/Instansi berikan telah memberikan dampak sangat positif bagi peningkatan kualitas pembelajaran dan motivasi peserta didik kami. Semoga kerja sama baik ini senantiasa terjaga.',
      },
    ],
  },

  // =========================================================
  // 7. KEUANGAN, BANTUAN & SARANA PRASARANA
  // =========================================================
  {
    id: 'surat_permohonan_bantuan',
    kategori: 'Keuangan, Bantuan & Sarpras',
    kodeNomor: 'PRO-BNT',
    nama: 'Surat Permohonan Bantuan / Pengantar Proposal',
    deskripsi:
      'Pengajuan dukungan dana, hibah sarana belajar, buku, atau fasilitas ke dinas terkait, CSR perusahaan, maupun donatur.',
    formatLayout: 'surat_resmi',
    defaultPerihal: 'Permohonan Bantuan Dukungan Sarana Prasarana Pembelajaran',
    fields: [
      {
        key: 'jenisBantuan',
        label: 'Jenis Bantuan yang Diajukan',
        type: 'text',
        required: true,
        placeholder: 'Mis. Pengadaan Buku Perpustakaan, Perangkat Komputer Praktik, atau Hibah Sarana Belajar',
      },
      {
        key: 'latarBelakangKebutuhan',
        label: 'Latar Belakang Kebutuhan & Dampak Penerima Manfaat',
        type: 'textarea',
        required: true,
        placeholder: 'Jelaskan jumlah siswa sasaran, kebutuhan riil sarana, dan manfaat jangka panjangnya...',
      },
      {
        key: 'estimasiKebutuhan',
        label: 'Ringkasan Kebutuhan / Lampiran Proposal',
        type: 'text',
        defaultValue: 'Terlampir Proposal Kegiatan & Rencana Anggaran Biaya (RAB).',
      },
    ],
  },
  {
    id: 'surat_tagihan_keuangan',
    kategori: 'Keuangan, Bantuan & Sarpras',
    kodeNomor: 'KEU-PBR',
    nama: 'Surat Pemberitahuan / Tagihan Administrasi Keuangan',
    deskripsi:
      'Informasi rincian biaya kegiatan, iuran komite/operasional (jika berlaku), atau pengingat tenggat pembayaran kepada orang tua/wali.',
    formatLayout: 'surat_resmi',
    requiresStudent: true,
    defaultPerihal: 'Pemberitahuan Administrasi Keuangan / Kegiatan Pembelajaran',
    fields: [
      {
        key: 'rincianBiaya',
        label: 'Rincian Komponen Biaya & Nominal (Rp)',
        type: 'textarea',
        required: true,
        placeholder: 'Mis.\n1. Iuran Operasional / Komite Bulan November 2026: Rp ...\n2. Biaya Kegiatan Praktik / Uji Kompetensi: Rp ...',
      },
      {
        key: 'totalNominal',
        label: 'Total Nominal Tagihan',
        type: 'text',
        required: true,
        placeholder: 'Mis. Rp 250.000,-',
      },
      {
        key: 'tenggatRekening',
        label: 'Batas Waktu & Kanal Pembayaran Resmi',
        type: 'textarea',
        required: true,
        placeholder: 'Mis. Pembayaran dapat diselesaikan paling lambat 15 November 2026 melalui Bendahara Lembaga atau Rekening resmi ...',
      },
    ],
  },
  {
    id: 'sk_lunas_tunggakan',
    kategori: 'Keuangan, Bantuan & Sarpras',
    kodeNomor: 'KEU-LNS',
    nama: 'Surat Keterangan Lunas / Bebas Tunggakan',
    deskripsi:
      'Bukti penyelesaian kewajiban administrasi keuangan siswa, umumnya diminta saat pengambilan dokumen kelulusan atau mutasi keluar.',
    formatLayout: 'surat_keterangan',
    studentRequestable: true,
    requiresStudent: true,
    defaultPerihal: 'Surat Keterangan Lunas Administrasi Keuangan',
    fields: [
      {
        key: 'periodeLunas',
        label: 'Cakupan Periode / Komponen yang Dilunasi',
        type: 'text',
        required: true,
        defaultValue: 'Seluruh kewajiban administrasi operasional & kegiatan sampai Tahun Ajaran berjalan',
      },
      {
        key: 'keperluan',
        label: 'Keperluan Surat',
        type: 'text',
        defaultValue: 'Syarat pengambilan Ijazah/SKL atau penyelesaian proses mutasi peserta didik.',
      },
    ],
  },
  {
    id: 'bast_serah_terima',
    kategori: 'Keuangan, Bantuan & Sarpras',
    kodeNomor: 'BAST',
    nama: 'Berita Acara Serah Terima (BAST)',
    deskripsi:
      'Bukti serah terima barang, bantuan sarana, dokumen penting, maupun inventaris antar-pihak.',
    formatLayout: 'berita_acara',
    defaultPerihal: 'Berita Acara Serah Terima Barang / Dokumen / Bantuan',
    fields: [
      {
        key: 'pihakPertama',
        label: 'PIHAK PERTAMA (Yang Menyerahkan — Nama & Jabatan)',
        type: 'text',
        required: true,
        placeholder: 'Mis. Drs. Hendra Wijaya (Perwakilan Mitra / Penyedia / Kepala Lembaga)',
      },
      {
        key: 'pihakKedua',
        label: 'PIHAK KEDUA (Yang Menerima — Nama & Jabatan)',
        type: 'text',
        required: true,
        placeholder: 'Mis. Siti Aminah, S.Pd. (Kepala Sarpras / Bendahara Barang)',
      },
      {
        key: 'daftarBarang',
        label: 'Rincian Barang / Dokumen / Sarana yang Diserahterimakan',
        type: 'textarea',
        required: true,
        placeholder: '1. Laptop Praktik Siswa — 5 Unit (Kondisi Baik & Lengkap)\n2. Printer Laser — 1 Unit',
      },
      {
        key: 'keteranganKondisi',
        label: 'Pernyataan Kondisi & Tanggung Jawab',
        type: 'textarea',
        defaultValue: 'Seluruh barang/dokumen tersebut telah diperiksa bersama dan diterima dalam keadaan baik serta lengkap untuk dipergunakan sebagaimana mestinya.',
      },
    ],
  },

  // =========================================================
  // 8. TATA KELOLA, DINAS & LEGALITAS LEMBAGA
  // =========================================================
  {
    id: 'surat_pengantar_dinas',
    kategori: 'Tata Kelola, Dinas & Legalitas',
    kodeNomor: 'SP-DNS',
    nama: 'Surat Pengantar Dinas / Laporan Berkala',
    deskripsi:
      'Dokumen pengantar pengiriman laporan bulanan/semester, data peserta didik, atau berkas akreditasi ke dinas pendidikan.',
    formatLayout: 'surat_resmi',
    defaultPerihal: 'Pengantar Penyampaian Laporan Berkala / Berkas Lembaga',
    fields: [
      {
        key: 'jenisLaporan',
        label: 'Jenis Laporan / Berkas yang Dikirim',
        type: 'text',
        required: true,
        placeholder: 'Mis. Laporan Bulanan Data Peserta Didik & PTK Semester Ganjil TA 2026/2027',
      },
      {
        key: 'daftarLampiran',
        label: 'Daftar Berkas / Lampiran (Tabel Ringkas)',
        type: 'textarea',
        required: true,
        placeholder: '1. Rekapitulasi Jumlah Siswa Aktif — 1 Berkas\n2. Rekap Kehadiran Tutor & Tendik — 1 Berkas\n3. Berita Acara Verifikasi Data — 1 Berkas',
      },
    ],
  },
  {
    id: 'surat_kuasa',
    kategori: 'Tata Kelola, Dinas & Legalitas',
    kodeNomor: 'SK-KUA',
    nama: 'Surat Kuasa Resmi Lembaga',
    deskripsi:
      'Pelimpahan wewenang sementara, misalnya untuk pengambilan dokumen resmi, pengurusan rekening lembaga, atau perwakilan rapat dinas.',
    formatLayout: 'surat_kuasa',
    defaultPerihal: 'Surat Kuasa Pelimpahan Wewenang Sementara',
    fields: [
      {
        key: 'pemberiKuasa',
        label: 'Nama & Jabatan Pemberi Kuasa',
        type: 'text',
        required: true,
        placeholder: 'Kosongkan / sesuaikan dengan nama Kepala Lembaga',
      },
      {
        key: 'penerimaKuasaNama',
        label: 'Nama Lengkap Penerima Kuasa',
        type: 'text',
        required: true,
      },
      {
        key: 'penerimaKuasaIdentitas',
        label: 'NIK / NIP & Jabatan Penerima Kuasa',
        type: 'text',
        required: true,
        placeholder: 'Mis. NIK 3404... · Staf Tata Usaha / Wakil Kepala Lembaga',
      },
      {
        key: 'uraianKuasa',
        label: 'Wewenang / Urusan yang Dikuasakan',
        type: 'textarea',
        required: true,
        placeholder: 'Mis. Mengambil blangko ijazah / mengurus administrasi rekening operasional di Bank ... / mewakili rapat koordinasi di Dinas Pendidikan',
      },
      {
        key: 'masaBerlakuKuasa',
        label: 'Batas Masa Berlaku Surat Kuasa',
        type: 'text',
        defaultValue: 'Berlaku sejak tanggal ditandatangani hingga urusan tersebut selesai dilaksanakan.',
      },
    ],
  },
  {
    id: 'berita_acara_kegiatan',
    kategori: 'Tata Kelola, Dinas & Legalitas',
    kodeNomor: 'BA-KEG',
    nama: 'Berita Acara Kegiatan / Ujian / Rapat',
    deskripsi:
      'Catatan resmi jalannya peristiwa penting (pelaksanaan asesmen, rapat kelulusan, atau kejadian khusus ujian) yang ditandatangani panitia/saksi.',
    formatLayout: 'berita_acara',
    defaultPerihal: 'Berita Acara Pelaksanaan Kegiatan / Rapat / Asesmen',
    fields: [
      {
        key: 'namaKegiatan',
        label: 'Nama Kegiatan / Ujian / Rapat',
        type: 'text',
        required: true,
        placeholder: 'Mis. Pelaksanaan Asesmen Sumatif Akhir Semester / Rapat Pleno Kelulusan',
      },
      {
        key: 'waktuTempat',
        label: 'Hari, Tanggal, Waktu & Lokasi',
        type: 'text',
        required: true,
        placeholder: 'Mis. Senin, 7 Desember 2026 pukul 08.00–10.00 WIB di Ruang Ujian 1',
      },
      {
        key: 'jumlahHadir',
        label: 'Rekapitulasi Kehadiran (Terdaftar / Hadir / Tidak Hadir)',
        type: 'text',
        required: true,
        placeholder: 'Mis. Terdaftar: 32 orang, Hadir: 31 orang, Tidak Hadir: 1 orang (Sakit)',
      },
      {
        key: 'catatanJalannyaAcara',
        label: 'Catatan Jalannya Acara / Kejadian Khusus / Keputusan',
        type: 'textarea',
        required: true,
        defaultValue: 'Pelaksanaan kegiatan berjalan dengan tertib, aman, dan lancar sesuai tata tertib yang berlaku tanpa kendala berarti.',
      },
      {
        key: 'saksiPanitia',
        label: 'Pengawas / Saksi / Notulis yang Menandatangani',
        type: 'text',
        placeholder: 'Mis. Pengawas Ruang / Sekretaris Panitia',
      },
    ],
  },
  {
    id: 'surat_balasan_resmi',
    kategori: 'Tata Kelola, Dinas & Legalitas',
    kodeNomor: 'SBL',
    nama: 'Surat Balasan / Tanggapan Resmi',
    deskripsi:
      'Jawaban tertulis atas surat masuk dari instansi pemerintah, mitra, maupun pengaduan/permohonan orang tua siswa.',
    formatLayout: 'surat_resmi',
    defaultPerihal: 'Tanggapan / Balasan Resmi Surat Masuk',
    fields: [
      {
        key: 'nomorSuratMasuk',
        label: 'Nomor & Tanggal Surat Masuk yang Dibalas',
        type: 'text',
        required: true,
        placeholder: 'Mis. Nomor 120/DISDIK/X/2026 tertanggal 10 Oktober 2026',
      },
      {
        key: 'isiTanggapan',
        label: 'Isi Pokok Jawaban / Tanggapan Resmi',
        type: 'textarea',
        required: true,
        placeholder: 'Tuliskan persetujuan, tindak lanjut, konfirmasi data, atau tanggapan resmi lembaga secara jelas...',
      },
      {
        key: 'kontakKoordinasi',
        label: 'Kontak Koordinasi Lanjutan',
        type: 'text',
        defaultValue: 'Untuk koordinasi teknis lebih lanjut dapat menghubungi Tata Usaha / Sekretariat lembaga pada jam kerja.',
      },
    ],
  },
];

export function getLetterTemplateById(templateId: string): LetterTemplateDef | undefined {
  return LETTER_TEMPLATES.find((t) => t.id === templateId);
}

export function getTemplatesByCategory(category: LetterCategory): LetterTemplateDef[] {
  return LETTER_TEMPLATES.filter((t) => t.kategori === category);
}

export function getStudentRequestableTemplates(): LetterTemplateDef[] {
  return LETTER_TEMPLATES.filter((t) => t.studentRequestable);
}

function buildStudentIdentityRows(student?: Student, fallbackLetter?: SchoolLetter): Array<{ label: string; value: string }> {
  if (!student && !fallbackLetter?.studentName) return [];
  const ttl = student
    ? [student.tempatLahir, student.tanggalLahir ? formatTanggalID(student.tanggalLahir) : '']
        .filter(Boolean)
        .join(', ') || '-'
    : '-';
  return [
    { label: 'Nama Lengkap', value: student?.nama || fallbackLetter?.studentName || '-' },
    { label: 'NIS / NISN', value: `${student?.nis || fallbackLetter?.studentNis || '-'} / ${student?.nisn || '-'}` },
    { label: 'Tempat, Tanggal Lahir', value: ttl },
    { label: 'Kelas / Program', value: student?.kelas || fallbackLetter?.studentKelas || '-' },
    { label: 'Nama Orang Tua / Wali', value: student?.namaWali || student?.namaAyah || student?.namaIbu || '-' },
    { label: 'Alamat', value: student?.alamat || '-' },
  ];
}

export function composeLetterDocument(
  letter: SchoolLetter,
  settings: SchoolSettings,
  student?: Student
): ComposedLetterDocument {
  const tpl = getLetterTemplateById(letter.templateId);
  const f = letter.dynamicFields || {};
  const tanggalText = `${settings.tempatRapor || settings.kabupaten || 'Sleman'}, ${formatTanggalID(
    letter.tanggalSurat || new Date().toISOString().slice(0, 10)
  )}`;
  const namaPenandatangan = letter.penandatanganNama || settings.kepalaSekolah || 'Kepala Satuan Pendidikan';
  const jabatanPenandatangan =
    letter.penandatanganJabatan ||
    (settings.jenisLembaga === 'PKBM' ? 'Ketua / Kepala PKBM' : `Kepala ${settings.jenisLembaga || 'Sekolah'}`);
  const nipPenandatangan = letter.penandatanganNip ?? settings.nipKepalaSekolah ?? '-';

  const schoolIdentityText = `${settings.namaSekolah} (NPSN ${settings.npsn || '-'})`;
  const stuRows = buildStudentIdentityRows(student, letter);
  const nomorDisplay =
    letter.nomorSurat?.trim() ||
    `[Draft · Akan diberi nomor ${letter.kodeNomor} saat terbit]`;

  // PENGUMUMAN
  if (tpl?.formatLayout === 'pengumuman') {
    const detailRows: Array<{ label: string; value: string }> = [
      { label: 'Ditujukan Kepada', value: letter.targetAudience || tpl.defaultTargetAudience || 'Peserta Didik & Orang Tua/Wali' },
    ];
    if (letter.targetKelasList && letter.targetKelasList.length > 0) {
      detailRows.push({ label: 'Cakupan Kelas', value: letter.targetKelasList.join(', ') });
    }
    const multilineSections: LetterComposedSection[] = [];
    tpl.fields.forEach((fd) => {
      const val = f[fd.key];
      if (!val || !val.trim()) return;
      const trimmed = val.trim();
      if (trimmed.includes('\n')) {
        multilineSections.push({
          title: fd.label,
          type: 'bullets',
          items: trimmed
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        });
      } else if (fd.type === 'textarea' && trimmed.length > 90) {
        multilineSections.push({
          title: fd.label,
          type: 'paragraph',
          text: trimmed,
        });
      } else {
        detailRows.push({
          label: fd.label,
          value: fd.type === 'date' ? formatTanggalID(trimmed) : trimmed,
        });
      }
    });

    return {
      judulDokumen: 'PENGUMUMAN RESMI',
      subJudul: letter.perihal || tpl.nama,
      nomorSurat: nomorDisplay,
      tanggalText,
      sections: [
        {
          type: 'paragraph',
          text: `Dengan hormat, melalui pengumuman resmi ini Pimpinan dan Dewan Pendidik ${schoolIdentityText} menyampaikan informasi penting kepada ${letter.targetAudience || 'seluruh peserta didik dan orang tua/wali'} untuk Tahun Ajaran ${settings.tahunAjaran} Semester ${settings.semester === '1' ? 'Ganjil' : 'Genap'} sebagai berikut:`,
        },
        {
          type: 'keyvalue',
          rows: detailRows,
        },
        ...multilineSections,
      ],
      penutup:
        'Demikian pengumuman ini disampaikan untuk menjadi perhatian dan dilaksanakan dengan penuh tanggung jawab. Atas perhatian dan kerja sama Bapak/Ibu serta seluruh peserta didik, kami ucapkan terima kasih.',
      jabatanPenandatangan,
      namaPenandatangan,
      nipPenandatangan,
    };
  }

  // SURAT KEPUTUSAN (SK)
  if (tpl?.formatLayout === 'surat_keputusan') {
    return {
      judulDokumen: 'SURAT KEPUTUSAN',
      subJudul: `TENTANG: ${(f.tentang || letter.perihal || tpl.nama).toUpperCase()}`,
      nomorSurat: nomorDisplay,
      tanggalText,
      sections: [
        {
          type: 'paragraph',
          text: `KEPALA ${settings.namaSekolah.toUpperCase()} (${settings.jenisLembaga})`,
        },
        {
          title: 'Menimbang',
          type: 'paragraph',
          text: f.menimbang || '-',
        },
        {
          title: 'Mengingat',
          type: 'bullets',
          items: (f.mengingat || '-')
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        },
        {
          title: 'MEMUTUSKAN / MENETAPKAN',
          type: 'diktum',
          items: (f.memutuskan || '-')
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        },
      ],
      penutup: `Ditetapkan di ${settings.tempatRapor || 'Sleman'} pada tanggal ${formatTanggalID(
        letter.tanggalSurat || new Date().toISOString().slice(0, 10)
      )}.`,
      jabatanPenandatangan,
      namaPenandatangan,
      nipPenandatangan,
    };
  }

  // BERITA ACARA (BAST / Kegiatan)
  if (tpl?.formatLayout === 'berita_acara') {
    const rows: Array<{ label: string; value: string }> = [];
    const bulletSections: LetterComposedSection[] = [];
    tpl.fields.forEach((fd) => {
      const val = f[fd.key];
      if (!val || !val.trim()) return;
      const trimmed = val.trim();
      if (trimmed.includes('\n')) {
        bulletSections.push({
          title: fd.label,
          type: 'bullets',
          items: trimmed
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        });
      } else if (fd.type === 'textarea' && trimmed.length > 90) {
        bulletSections.push({
          title: fd.label,
          type: 'paragraph',
          text: trimmed,
        });
      } else {
        rows.push({
          label: fd.label,
          value: fd.type === 'date' ? formatTanggalID(trimmed) : trimmed,
        });
      }
    });

    return {
      judulDokumen: tpl.nama.toUpperCase(),
      subJudul: letter.perihal,
      nomorSurat: nomorDisplay,
      tanggalText,
      sections: [
        {
          type: 'paragraph',
          text: `Pada hari ini, ${formatTanggalID(
            letter.tanggalSurat || new Date().toISOString().slice(0, 10)
          )}, bertempat di lingkungan ${schoolIdentityText}, telah dibuat dan disahkan ${tpl.nama} dengan rincian sebagai berikut:`,
        },
        {
          type: 'keyvalue',
          rows,
        },
        ...bulletSections,
      ],
      penutup:
        'Demikian Berita Acara ini dibuat dengan sebenar-benarnya untuk dapat dipergunakan sebagai bukti administratif yang sah.',
      jabatanPenandatangan,
      namaPenandatangan,
      nipPenandatangan,
      pemohonBlok: f.pihakKedua
        ? {
            label: 'Yang Menerima / Saksi',
            nama: f.pihakKedua,
            sub: 'Tanda Tangan',
          }
        : f.saksiPanitia
          ? {
              label: 'Saksi / Pengawas',
              nama: f.saksiPanitia,
              sub: 'Panitia Pelaksana',
            }
          : undefined,
    };
  }

  // SURAT KUASA
  if (tpl?.formatLayout === 'surat_kuasa') {
    return {
      judulDokumen: 'SURAT KUASA',
      nomorSurat: nomorDisplay,
      tanggalText,
      sections: [
        {
          type: 'paragraph',
          text: `Yang bertanda tangan di bawah ini, ${f.pemberiKuasa || `${namaPenandatangan} (${jabatanPenandatangan} ${settings.namaSekolah})`}, selanjutnya disebut sebagai PEMBERI KUASA, dengan ini memberikan kuasa penuh kepada:`,
        },
        {
          type: 'keyvalue',
          rows: [
            { label: 'Nama Penerima Kuasa', value: f.penerimaKuasaNama || '-' },
            { label: 'Identitas / Jabatan', value: f.penerimaKuasaIdentitas || '-' },
          ],
        },
        {
          title: 'Untuk dan Atas Nama Lembaga Melaksanakan',
          type: 'paragraph',
          text: f.uraianKuasa || '-',
        },
        {
          title: 'Masa Berlaku Kuasa',
          type: 'paragraph',
          text: f.masaBerlakuKuasa || '-',
        },
      ],
      penutup:
        'Demikian Surat Kuasa ini dibuat dengan penuh tanggung jawab agar dapat dipergunakan sebagaimana mestinya.',
      jabatanPenandatangan: 'Pemberi Kuasa / ' + jabatanPenandatangan,
      namaPenandatangan,
      nipPenandatangan,
      pemohonBlok: {
        label: 'Penerima Kuasa',
        nama: f.penerimaKuasaNama || '(....................)',
        sub: f.penerimaKuasaIdentitas || '',
      },
    };
  }

  // SURAT IZIN SISWA
  if (tpl?.formatLayout === 'surat_izin') {
    const detailRows = (tpl?.fields || [])
      .filter((fd) => f[fd.key])
      .map((fd) => ({
        label: fd.label,
        value: fd.type === 'date' ? formatTanggalID(f[fd.key]) : f[fd.key],
      }));
    return {
      judulDokumen: 'SURAT IZIN PESERTA DIDIK',
      nomorSurat: nomorDisplay,
      tanggalText,
      perihalText: letter.perihal,
      tujuanBlok: [
        'Yth. Kepala Lembaga & Wali Kelas',
        settings.namaSekolah,
        `di ${settings.kabupaten || 'Tempat'}`,
      ],
      sections: [
        {
          type: 'paragraph',
          text: `Dengan hormat, yang bertanda tangan / mengajukan permohonan izin di bawah ini menerangkan bahwa peserta didik:`,
        },
        ...(stuRows.length > 0 ? [{ type: 'keyvalue' as const, rows: stuRows }] : []),
        {
          title: 'Rincian Ketidakhadiran',
          type: 'keyvalue',
          rows: detailRows,
        },
      ],
      penutup:
        'Demikian surat izin ini disampaikan untuk menjadi maklum dan dicatat pada daftar hadir pembelajaran. Atas perhatian Bapak/Ibu Wali Kelas dan Pengurus, kami ucapkan terima kasih.',
      jabatanPenandatangan: `Mengetahui & Mengesahkan · ${jabatanPenandatangan}`,
      namaPenandatangan,
      nipPenandatangan,
      pemohonBlok: {
        label: 'Orang Tua / Wali / Pemohon',
        nama: f.namaWaliPemohon || student?.namaWali || student?.namaAyah || letter.requestedByName || 'Pemohon',
        sub: student ? `Wali dari ${student.nama}` : '',
      },
    };
  }

  // SURAT RESMI (Eksternal, Tugas, Peringatan, Kerja Sama, Dinas, Balasan)
  if (tpl?.formatLayout === 'surat_resmi') {
    const tujuanLines: string[] = [];
    if (letter.penerimaNama || letter.penerimaJabatan || letter.penerimaInstansi || f.instansiMitra) {
      tujuanLines.push(`Kepada Yth. ${letter.penerimaJabatan || letter.penerimaNama || 'Bapak/Ibu Pimpinan'}`);
      if (letter.penerimaInstansi || f.instansiMitra) {
        tujuanLines.push(letter.penerimaInstansi || f.instansiMitra);
      }
      tujuanLines.push(`di ${f.alamatMitra || settings.kabupaten || 'Tempat'}`);
    } else if (student) {
      tujuanLines.push(`Kepada Yth. Orang Tua / Wali dari ${student.nama}`);
      tujuanLines.push(`Peserta Didik ${student.kelas} · ${settings.namaSekolah}`);
    }

    const detailRows: Array<{ label: string; value: string }> = [];
    const multilineSections: LetterComposedSection[] = [];
    (tpl?.fields || []).forEach((fd) => {
      const val = f[fd.key];
      if (!val || !val.trim()) return;
      const trimmed = val.trim();
      if (trimmed.includes('\n')) {
        multilineSections.push({
          title: fd.label,
          type: 'bullets',
          items: trimmed
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        });
      } else if (fd.type === 'textarea' && trimmed.length > 90) {
        multilineSections.push({
          title: fd.label,
          type: 'paragraph',
          text: trimmed,
        });
      } else {
        detailRows.push({
          label: fd.label,
          value: fd.type === 'date' ? formatTanggalID(trimmed) : trimmed,
        });
      }
    });

    return {
      judulDokumen: tpl.nama.toUpperCase(),
      nomorSurat: nomorDisplay,
      tanggalText,
      lampiranText: f.estimasiKebutuhan ? '1 (Satu) Berkas' : '-',
      perihalText: letter.perihal || tpl.defaultPerihal,
      tujuanBlok: tujuanLines.length > 0 ? tujuanLines : undefined,
      sections: [
        {
          type: 'paragraph',
          text: `Dengan hormat, bersama surat ini ${schoolIdentityText} menyampaikan hal terkait ${letter.perihal || tpl.nama} pada Tahun Ajaran ${settings.tahunAjaran} dengan rincian sebagai berikut:`,
        },
        ...(stuRows.length > 0 ? [{ title: 'Identitas Peserta Didik', type: 'keyvalue' as const, rows: stuRows }] : []),
        ...(detailRows.length > 0 ? [{ type: 'keyvalue' as const, rows: detailRows }] : []),
        ...multilineSections,
      ],
      penutup:
        'Demikian surat resmi ini kami sampaikan untuk dilaksanakan dan/atau ditindaklanjuti sebagaimana mestinya. Atas perhatian dan kerja sama yang baik, kami ucapkan terima kasih.',
      jabatanPenandatangan,
      namaPenandatangan,
      nipPenandatangan,
    };
  }

  // DEFAULT: SURAT KETERANGAN / SKL / REKOMENDASI / MUTASI / BEDA DATA / LUNAS
  const detailRows: Array<{ label: string; value: string }> = [];
  const multilineSections: LetterComposedSection[] = [];
  (tpl?.fields || []).forEach((fd) => {
    const val = f[fd.key];
    if (!val || !val.trim()) return;
    const trimmed = val.trim();
    if (trimmed.includes('\n')) {
      multilineSections.push({
        title: fd.label,
        type: 'bullets',
        items: trimmed
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      });
    } else if (fd.type === 'textarea' && trimmed.length > 90) {
      multilineSections.push({
        title: fd.label,
        type: 'paragraph',
        text: trimmed,
      });
    } else {
      detailRows.push({
        label: fd.label,
        value: fd.type === 'date' ? formatTanggalID(trimmed) : trimmed,
      });
    }
  });

  return {
    judulDokumen: (tpl?.nama || letter.templateNama).toUpperCase(),
    nomorSurat: nomorDisplay,
    tanggalText,
    sections: [
      {
        type: 'paragraph',
        text: `Yang bertanda tangan di bawah ini, ${jabatanPenandatangan} ${schoolIdentityText}, alamat ${settings.alamat}, ${settings.kecamatan}, ${settings.kabupaten}, dengan ini menerangkan bahwa:`,
      },
      ...(stuRows.length > 0 ? [{ type: 'keyvalue' as const, rows: stuRows }] : []),
      ...(detailRows.length > 0
        ? [
            {
              title: 'Keterangan Resmi',
              type: 'keyvalue' as const,
              rows: detailRows,
            },
          ]
        : []),
      ...multilineSections,
    ],
    penutup:
      'Demikian surat keterangan ini dibuat dengan sebenarnya agar dapat dipergunakan sebagaimana mestinya.',
    jabatanPenandatangan,
    namaPenandatangan,
    nipPenandatangan,
  };
}
