export type UserRole = 'admin' | 'walikelas' | 'guru' | 'ortu' | 'siswa';
export type LogbookAuthorRole = 'guru' | 'walikelas' | 'admin' | 'ortu' | 'siswa';
export type Jenjang = 'SD' | 'SMP' | 'SMA';
export type JurusanType = 'Umum' | 'IPA' | 'IPS';

export interface TeachingAssignment {
  kelas: string;
  subjectIds: string[];
}

export interface SchoolTenant {
  id: string;
  kodeSekolah: string;
  nama: string;
  npsn: string;
  jenisLembaga: 'PKBM' | 'Sekolah Formal';
  aktif: boolean;
  createdAt: string;
}

export interface UserAccount {
  id: string;
  schoolId: string;
  schoolName?: string;
  username: string;
  nama: string;
  nip?: string;
  role: UserRole;
  aktif: boolean;
  verified?: boolean;
  verificationNote?: string;
  waliKelasTarget?: string;
  teachingAssignments: TeachingAssignment[];
  linkedStudentIds: string[];
  createdAt: string;
}

export interface AuthStatusResponse {
  bootstrapRequired: boolean;
  hasAdmin: boolean;
  envPasscodeConfigured: boolean;
  accountCount: number;
  activeSchoolId: string;
  schools: Array<{
    id: string;
    kodeSekolah: string;
    nama: string;
    npsn: string;
    jenisLembaga: 'PKBM' | 'Sekolah Formal';
    bootstrapRequired: boolean;
  }>;
  classes: string[];
  classDefs: ClassDef[];
  subjects: Array<{
    id: string;
    kode: string;
    nama: string;
    tingkatList: number[];
    kelasList: string[];
  }>;
}

export interface ClassDef {
  id: string;
  nama: string;
  jenjang: Jenjang;
  tingkat: number;
  urutan: number;
}

export interface TujuanPembelajaran {
  id: string;
  kode: string;
  deskripsi: string;
}

export interface CapaianPembelajaran {
  id: string;
  kode: string;
  deskripsi: string;
  tingkatList?: number[];
  kelasList?: string[];
  tps: TujuanPembelajaran[];
}

export interface Subject {
  id: string;
  kode: string;
  nama: string;
  kelompok: string;
  kategoriPkbm: string;
  skk: number;
  aktif: boolean;
  urutan: number;
  guruPengampu: string;
  kelasList: string[];
  tingkatList: number[];
  jurusanList: string[];
  capaianPembelajaran: string;
  cps: CapaianPembelajaran[];
  tps: TujuanPembelajaran[];
}

export interface PortfolioItem {
  id: string;
  judul: string;
  kategori: string;
  url: string;
  tanggal: string;
  catatan?: string;
}

export interface Student {
  id: string;
  nis: string;
  nisn: string;
  nama: string;
  kelas: string;
  fase: string;
  jurusan: string;
  jenisKelamin: 'L' | 'P';
  tempatLahir: string;
  tanggalLahir: string;
  agama: string;
  pendidikanSebelumnya: string;
  alamat: string;
  namaAyah: string;
  namaIbu: string;
  pekerjaanAyah: string;
  pekerjaanIbu: string;
  namaWali: string;
  noTelpWali: string;
  status: 'Aktif' | 'Pindah' | 'Lulus';
  fotoDataUrl: string;
  portfolioFolderUrl: string;
  portfolioItems: PortfolioItem[];
  createdAt: string;
  awalMasukNote?: string;
}

export interface GradeEntry {
  tugas?: number | null;
  kuis?: number | null;
  ujian?: number | null;
  sts?: number | null;
  sas?: number | null;
  tpScores?: Record<string, number | null>;
  manualNilaiAkhir?: number | null;
  manualDeskripsi?: string;
  catatanGuru?: string;
}

export interface WaliKelasInfo {
  userId?: string;
  nama: string;
  nip: string;
  ttdDataUrl?: string;
}

export interface AcademicYearRecord {
  id: string;
  tahunAjaran: string;
  semester: '1' | '2';
  aktif: boolean;
  lockedForGuru: boolean;
  lockedForWaliKelas: boolean;
  createdAt: string;
  notes?: string;
}

export interface SchoolSettings {
  jenisLembaga: 'PKBM' | 'Sekolah Formal';
  namaSekolah: string;
  npsn: string;
  nss: string;
  akreditasi: string;
  tahunAjaran: string;
  semester: '1' | '2';
  tahunAjaranAktif: boolean;
  lockedForGuru: boolean;
  lockedForWaliKelas: boolean;
  alamat: string;
  kelurahan: string;
  kecamatan: string;
  kabupaten: string;
  provinsi: string;
  kodePos: string;
  telepon: string;
  email: string;
  website: string;
  kepalaSekolah: string;
  nipKepalaSekolah: string;
  tempatRapor: string;
  tanggalRapor: string;
  logoDataUrl: string;
  ttdKepalaDataUrl: string;
  waliKelasMap: Record<string, WaliKelasInfo>;
  calculationMode: 'average' | 'weighted';
  kktp: number;
  bobot: {
    tugas: number;
    kuis: number;
    ujian: number;
  };
  gasEndpointUrl: string;
}

export interface P5Dimension {
  profil: string;
  capaian: 'MB' | 'SB' | 'BSH' | 'SAB';
  isCustom?: boolean;
}

export interface P5Project {
  id: string;
  studentId: string;
  semester: '1' | '2';
  tahunAjaran?: string;
  tema: string;
  judulProjek: string;
  deskripsi: string;
  dimensi: P5Dimension[];
}

export interface EkskulItem {
  id: string;
  nama: string;
  predikat: string;
  keterangan: string;
}

export interface ReportMeta {
  studentId: string;
  semester: '1' | '2';
  tahunAjaran?: string;
  ekskul: EkskulItem[];
  absensi: {
    sakit: number;
    izin: number;
    alpha: number;
  };
  catatanWaliKelas: string;
  keputusan?: string;
}

export interface CounselingNote {
  id: string;
  studentId: string;
  semester: '1' | '2';
  tahunAjaran: string;
  tanggal: string;
  kategori: string;
  topik: string;
  uraianMasalah: string;
  layananTindakLanjut: string;
  rekomendasiOrtu: string;
  konselorNama: string;
  tampilDiOrtu: boolean;
  createdAt: string;
}

export interface MutationRecord {
  id: string;
  jenis: 'Masuk' | 'Keluar';
  tanggal: string;
  studentId: string;
  nis: string;
  nisn: string;
  namaSiswa: string;
  kelas: string;
  sekolahAsalTujuan: string;
  nomorSurat: string;
  alasan: string;
  tahunAjaran: string;
  createdAt: string;
}

export interface AcademicArchive {
  id: string;
  tahunAjaran: string;
  archivedAt: string;
  totalSiswa: number;
  promotedCount: number;
  graduatedCount: number;
  retainedCount: number;
  students: Student[];
  grades: Record<string, GradeEntry>;
  p5Projects: P5Project[];
  reportMeta: Record<string, ReportMeta>;
  counselingNotes: CounselingNote[];
}

export interface LogbookReply {
  id: string;
  authorRole: LogbookAuthorRole;
  authorName: string;
  pesan: string;
  createdAt: string;
}

export interface LogbookEntry {
  id: string;
  studentId: string;
  studentName: string;
  kelas: string;
  authorRole: LogbookAuthorRole;
  authorName: string;
  subjectName?: string;
  kategori: string;
  prioritas: 'Normal' | 'Perlu Perhatian' | 'Segera';
  judul: string;
  pesan: string;
  status: 'Baru' | 'Dipantau Wali Kelas' | 'Selesai';
  replies: LogbookReply[];
  createdAt: string;
  updatedAt: string;
}

export interface ParentFeedback {
  id: string;
  studentId: string;
  semester: '1' | '2';
  tahunAjaran: string;
  parentUserId: string;
  parentName: string;
  konfirmasiStatus: 'Sudah Membaca & Memahami' | 'Perlu Konsultasi Wali Kelas' | 'Apresiasi & Dukungan';
  tanggapan: string;
  createdAt: string;
}

export interface RaporPrintFilter {
  cover: boolean;
  schoolIdentity: boolean;
  studentIdentity: boolean;
  grades: boolean;
  profilLulusan: boolean;
  ekskul: boolean;
  absensi: boolean;
  catatan: boolean;
  pengesahan: boolean;
  validasiPortfolio: boolean;
}

export type TutoringRequestStatus =
  | 'Menunggu Konfirmasi'
  | 'Disetujui Guru'
  | 'Dikonfirmasi Pengurus'
  | 'Terjadwal'
  | 'Selesai'
  | 'Ditolak';

export interface TutoringRecommendation {
  id: string;
  schoolId: string;
  studentId: string;
  studentName: string;
  nis: string;
  kelas: string;
  semester: '1' | '2';
  tahunAjaran: string;
  subjectId: string;
  subjectName: string;
  cpId: string;
  cpKode: string;
  cpDeskripsi: string;
  tpId?: string;
  tpKode?: string;
  tpDeskripsi?: string;
  rekomendasiGuru: string;
  recommendedByUserId: string;
  recommendedByName: string;
  recommendedByRole: 'guru' | 'walikelas' | 'admin';
  tanggalRekomendasi: string;
  status: 'Disarankan' | 'Diajukan Ortu' | 'Selesai';
  createdAt: string;
}

export interface TutoringRequest {
  id: string;
  schoolId: string;
  studentId: string;
  studentName: string;
  nis: string;
  kelas: string;
  semester: '1' | '2';
  tahunAjaran: string;
  subjectId: string;
  subjectName: string;
  cpId: string;
  cpKode: string;
  cpDeskripsi: string;
  tpId?: string;
  tpKode?: string;
  tpDeskripsi?: string;
  sumber: 'Ortu' | 'Rekomendasi Guru';
  recommendationId?: string;
  alasan: string;
  tanggalAjuan: string;
  parentUserId: string;
  parentName: string;
  status: TutoringRequestStatus;
  confirmedByGuruName?: string;
  confirmedByGuruAt?: string;
  approvedByPengurusName?: string;
  approvedByPengurusAt?: string;
  jadwalTanggal?: string;
  jadwalWaktu?: string;
  jadwalLokasi?: string;
  pembimbingNama?: string;
  catatanSekolah?: string;
  createdAt: string;
  updatedAt: string;
}

export type ProcurementKategori =
  | 'Alat Pembelajaran'
  | 'Bahan Habis Pakai'
  | 'Kegiatan Siswa / Proyek'
  | 'Sarana & Prasarana'
  | 'Lainnya';

export type ProcurementStatus =
  | 'Menunggu Persetujuan'
  | 'Revisi Diminta'
  | 'Disetujui'
  | 'Sudah Realisasi'
  | 'Ditolak';

export interface ProcurementRequest {
  id: string;
  schoolId: string;
  nomorPengajuan: string;
  tahunAjaran: string;
  semester: '1' | '2';
  requesterUserId: string;
  requesterName: string;
  requesterRole: 'guru' | 'walikelas' | 'admin';
  kelasTerkait?: string;
  subjectName?: string;
  kategori: ProcurementKategori;
  namaItem: string;
  spesifikasi?: string;
  qty: number;
  satuan: string;
  hargaSatuan: number;
  total: number;
  prioritas: 'Normal' | 'Mendesak' | 'Terjadwal';
  tanggalPengajuan: string;
  tanggalPenggunaan: string;
  lokasiAtauVendor?: string;
  keterangan: string;
  status: ProcurementStatus;
  catatanPengurus?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  realisasiBiaya?: number;
  tanggalRealisasi?: string;
  createdAt: string;
  updatedAt: string;
}

export type DiagnosticCategory = 'Akademik' | 'Non-Akademik' | 'Pemelajar Mandiri';

export type DiagnosticNonAkademikDomain =
  | 'Psikologis'
  | 'Sosial-Emosional'
  | 'Gaya Belajar'
  | 'Minat & Bakat'
  | 'Aktivitas di Rumah'
  | 'Latar Belakang Keluarga'
  | 'Umum';

export type DiagnosticQuestionType =
  | 'pilihan_ganda'
  | 'pg_kompleks'
  | 'menjodohkan'
  | 'skala_likert'
  | 'input_gambar'
  | 'isian_singkat'
  | 'studi_kasus';

export interface DiagnosticOption {
  id: string;
  label: string;
  isCorrect?: boolean;
  nilaiSkor?: number;
  traitTag?: string;
}

export interface DiagnosticQuestion {
  id: string;
  domain: string;
  subDimensi?: string;
  tipe: DiagnosticQuestionType;
  pertanyaan: string;
  gambarUrl?: string;
  opsi: DiagnosticOption[];
  pasanganMenjodohkan?: TendikQuestionPair[];
  bobotPoin: number;
  cpKode?: string;
  tpKode?: string;
  wajib: boolean;
}

export interface DiagnosticPackage {
  id: string;
  schoolId: string;
  kodePaket: string;
  judul: string;
  deskripsi: string;
  kategori: DiagnosticCategory;
  subjectId?: string;
  subjectName?: string;
  targetKelasList: string[];
  targetTingkatList: number[];
  durasiMenit: number;
  status: 'Draft' | 'Dirilis' | 'Ditutup';
  isTemplateBuiltIn?: boolean;
  releasedAt?: string;
  releasedByName?: string;
  pertanyaan: DiagnosticQuestion[];
  tahunAjaran: string;
  semester: '1' | '2';
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiagnosticAnswer {
  questionId: string;
  selectedOptionId?: string;
  selectedOptionIds?: string[];
  matchingAnswers?: Record<string, string>;
  imageDataUrl?: string;
  imageCaption?: string;
  scaleValue?: number;
  textAnswer?: string;
}

export interface DiagnosticDomainScore {
  domain: string;
  skorRata: number;
  persen: number;
  kategori: 'Optimal' | 'Cukup Baik' | 'Perlu Pendampingan';
  ringkasan: string;
}

export interface DiagnosticSubmission {
  id: string;
  schoolId: string;
  packageId: string;
  packageJudul: string;
  kategori: DiagnosticCategory;
  subjectId?: string;
  subjectName?: string;
  studentId: string;
  studentName: string;
  nis: string;
  kelas: string;
  tahunAjaran: string;
  semester: '1' | '2';
  submittedAt: string;
  answers: DiagnosticAnswer[];
  skorAkademik?: number;
  jumlahBenar?: number;
  jumlahSoal?: number;
  levelPenguasaan?:
    | 'Mahir / Pengayaan'
    | 'Cakap / Siap Reguler'
    | 'Berkembang / Perlu Penguatan'
    | 'Perlu Intervensi Dasar';
  breakdownPerDomain?: Array<{ domain: string; benar: number; total: number; persen: number }>;
  profilGayaBelajar?: {
    dominan: 'Visual' | 'Auditori' | 'Kinestetik';
    visual: number;
    auditori: number;
    kinestetik: number;
  };
  minatDominan?: string;
  skorDomainNonAkademik?: DiagnosticDomainScore[];
  indikatorPerluPerhatian?: string[];
  skorKemandirian?: number;
  statusPemelajarMandiri?:
    | 'Sudah Pemelajar Mandiri'
    | 'Belum Pemelajar Mandiri (Butuh Pendampingan)';
  derajatKemandirian?:
    | 'Derajat IV — Pemelajar Mandiri Otonom (85–100%)'
    | 'Derajat III — Pemelajar Mandiri Berkembang (70–84%)'
    | 'Derajat II — Pemelajar Transisi / Terbimbing (50–69%)'
    | 'Derajat I — Pemelajar Bergantung / Pendampingan Intensif (< 50%)';
  rekomendasiTindakLanjut: string;
  catatanAnalisisPengurus?: string;
  keputusanTindakLanjut?: string;
  verifiedByName?: string;
  verifiedAt?: string;
}

export interface LmsMaterial {
  id: string;
  schoolId: string;
  kelas: string;
  subjectId: string;
  subjectName: string;
  cpKode?: string;
  tpKode?: string;
  judul: string;
  tipe: 'Modul Bacaan' | 'Video Pembelajaran' | 'Lembar Kerja / Tautan';
  konten: string;
  resourceUrl?: string;
  authorUserId: string;
  authorName: string;
  authorRole: 'admin' | 'walikelas' | 'guru';
  completedByStudentIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LmsAssignment {
  id: string;
  schoolId: string;
  kelas: string;
  subjectId: string;
  subjectName: string;
  cpKode?: string;
  tpKode?: string;
  judul: string;
  instruksi: string;
  tenggat: string;
  skorMaksimal: number;
  authorUserId: string;
  authorName: string;
  authorRole: 'admin' | 'walikelas' | 'guru';
  status: 'Aktif' | 'Ditutup';
  createdAt: string;
  updatedAt: string;
}

export interface LmsSubmission {
  id: string;
  schoolId: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  nis: string;
  kelas: string;
  jawabanTeks: string;
  lampiranUrl?: string;
  submittedAt: string;
  nilai?: number;
  umpanBalikGuru?: string;
  gradedByName?: string;
  gradedAt?: string;
}

export interface LmsDiscussion {
  id: string;
  schoolId: string;
  kelas: string;
  subjectId: string;
  subjectName: string;
  authorUserId: string;
  authorName: string;
  authorRole: LogbookAuthorRole;
  pesan: string;
  createdAt: string;
}

export type TendikCompetency =
  | 'Profesional'
  | 'Pedagogik'
  | 'Kepribadian'
  | 'Digital'
  | 'Sosial';

export interface TendikQuestionOption {
  id: string;
  label: string;
  nilaiSkor: number;
  isCorrect?: boolean;
}

export type TendikQuestionType =
  | 'pilihan_ganda'
  | 'pg_kompleks'
  | 'menjodohkan'
  | 'skala_likert'
  | 'input_gambar'
  | 'isian_singkat'
  | 'studi_kasus';

export interface TendikQuestionPair {
  id: string;
  kiri: string;
  kanan: string;
}

export interface TendikQuestion {
  id: string;
  kompetensi: TendikCompetency;
  tipe: TendikQuestionType;
  pertanyaan: string;
  indikatorKinerja: string;
  gambarUrl?: string;
  opsi: TendikQuestionOption[];
  pasanganMenjodohkan?: TendikQuestionPair[];
  bobotPoin: number;
}

export interface TendikTrainingPackage {
  id: string;
  schoolId: string;
  kodePaket: string;
  judul: string;
  deskripsi: string;
  kompetensiList: TendikCompetency[];
  targetRoles: Array<'guru' | 'walikelas'>;
  wajibUploadVideo: boolean;
  instruksiVideo: string;
  minRefleksiSegmen: number;
  durasiMenit: number;
  status: 'Draft' | 'Dirilis' | 'Ditutup';
  isTemplateBuiltIn?: boolean;
  pertanyaan: TendikQuestion[];
  tahunAjaran: string;
  createdByName: string;
  releasedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TendikVideoReflectionSegment {
  id: string;
  startDetik: number;
  endDetik: number;
  startLabel: string;
  endLabel: string;
  kompetensiTerkait: TendikCompetency;
  aspekDiamati: string;
  refleksiDiri: string;
  rencanaPerbaikan: string;
  catatanPengurus?: string;
}

export interface TendikSubmission {
  id: string;
  schoolId: string;
  packageId: string;
  packageJudul: string;
  userId: string;
  userName: string;
  userRole: 'guru' | 'walikelas' | 'admin';
  nip?: string;
  tahunAjaran: string;
  answers: DiagnosticAnswer[];
  skorPerKompetensi: Partial<Record<TendikCompetency, number>>;
  skorAsesmenTotal: number;
  videoSourceType?: 'upload' | 'url' | 'none';
  videoFileName?: string;
  videoUrl?: string;
  videoJudul?: string;
  videoDurasiDetik?: number;
  refleksiSegmen: TendikVideoReflectionSegment[];
  statusReview: 'Belum Ditinjau' | 'Direview Pengurus' | 'Lulus Pelatihan';
  skorPraktikVideo?: number;
  skorAkhirGabungan?: number;
  catatanPengurus?: string;
  rekomendasiPelatihanLanjutan?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  submittedAt: string;
  updatedAt: string;
}

export type SurveyQuestionType =
  | 'pilihan_ganda'
  | 'pg_kompleks'
  | 'skala_likert'
  | 'isian_singkat';

export interface SurveyOption {
  id: string;
  label: string;
  nilaiSkor?: number;
  traitTag?: string;
}

export interface SurveyQuestion {
  id: string;
  domain: string;
  tipe: SurveyQuestionType;
  pertanyaan: string;
  opsi: SurveyOption[];
  wajib: boolean;
}

export interface SurveyPackage {
  id: string;
  schoolId: string;
  kodePaket: string;
  judul: string;
  deskripsi: string;
  kategori: 'Literasi Keluarga' | 'Kustom';
  targetKelasList: string[];
  status: 'Draft' | 'Dirilis' | 'Ditutup';
  isTemplateBuiltIn?: boolean;
  pertanyaan: SurveyQuestion[];
  tahunAjaran: string;
  semester: '1' | '2';
  createdByName: string;
  releasedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SurveyDomainScore {
  domain: string;
  skorPersen: number;
  kategori: 'Sangat Baik' | 'Cukup Baik' | 'Perlu Penguatan';
  ringkasan: string;
}

export interface SurveyResponse {
  id: string;
  schoolId: string;
  packageId: string;
  packageJudul: string;
  kategori: 'Literasi Keluarga' | 'Kustom';
  studentId: string;
  studentName: string;
  nis: string;
  kelas: string;
  parentUserId: string;
  parentName: string;
  tahunAjaran: string;
  semester: '1' | '2';
  answers: DiagnosticAnswer[];
  indeksLiterasi: number;
  kategoriLiterasi:
    | 'Ekosistem Literasi Sangat Mendukung'
    | 'Cukup Mendukung'
    | 'Perlu Penguatan Literasi Rumah';
  adaPojokBaca?: string;
  jumlahBukuRumah?: string;
  frekuensiMembaca?: string;
  domainScores: SurveyDomainScore[];
  rekomendasiTindakLanjut: string;
  catatanPengurus?: string;
  verifiedByName?: string;
  verifiedAt?: string;
  submittedAt: string;
  updatedAt: string;
}

export type StudentEditEditableFields = Pick<
  Student,
  | 'nisn'
  | 'nama'
  | 'jenisKelamin'
  | 'tempatLahir'
  | 'tanggalLahir'
  | 'agama'
  | 'pendidikanSebelumnya'
  | 'alamat'
  | 'namaAyah'
  | 'namaIbu'
  | 'pekerjaanAyah'
  | 'pekerjaanIbu'
  | 'namaWali'
  | 'noTelpWali'
  | 'jurusan'
  | 'portfolioFolderUrl'
  | 'fotoDataUrl'
>;

export interface StudentEditRequest {
  id: string;
  schoolId: string;
  studentId: string;
  studentName: string;
  nis: string;
  kelas: string;
  requestedByUserId: string;
  requestedByName: string;
  alasanPerubahan: string;
  previousValues: Partial<StudentEditEditableFields>;
  proposedChanges: Partial<StudentEditEditableFields>;
  status: 'Menunggu Persetujuan' | 'Disetujui' | 'Ditolak';
  catatanPengurus?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  createdAt: string;
}

export type LetterCategory =
  | 'Keperluan Internal Sekolah'
  | 'Keperluan Eksternal & Instansi Luar'
  | 'Mutasi, Kelulusan & Layanan Khusus'
  | 'Pengumuman Sekolah'
  | 'Kepegawaian & Tugas Pendidik'
  | 'Kerja Sama & Kemitraan'
  | 'Keuangan, Bantuan & Sarpras'
  | 'Tata Kelola, Dinas & Legalitas';

export type LetterStatus =
  | 'Draft'
  | 'Menunggu Persetujuan'
  | 'Terbit'
  | 'Ditolak';

export interface SchoolLetter {
  id: string;
  schoolId: string;
  templateId: string;
  templateNama: string;
  kategori: LetterCategory;
  subKategori?: string;
  kodeNomor: string;
  nomorSurat: string;
  urutanNomor?: number;
  perihal: string;
  tanggalSurat: string;
  status: LetterStatus;
  studentId?: string;
  studentName?: string;
  studentNis?: string;
  studentKelas?: string;
  targetAudience?: string;
  targetKelasList?: string[];
  penerimaNama?: string;
  penerimaJabatan?: string;
  penerimaInstansi?: string;
  dynamicFields: Record<string, string>;
  penandatanganNama?: string;
  penandatanganJabatan?: string;
  penandatanganNip?: string;
  requestedByUserId?: string;
  requestedByName?: string;
  requestedByRole?: UserRole;
  alasanPengajuan?: string;
  catatanPengurus?: string;
  issuedByName?: string;
  issuedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppState {
  schoolId?: string;
  settings: SchoolSettings;
  academicYears: AcademicYearRecord[];
  classes: string[];
  classDefs: ClassDef[];
  subjects: Subject[];
  students: Student[];
  grades: Record<string, GradeEntry>;
  p5Projects: P5Project[];
  reportMeta: Record<string, ReportMeta>;
  counselingNotes: CounselingNote[];
  mutations: MutationRecord[];
  archives: AcademicArchive[];
  logbookEntries: LogbookEntry[];
  parentFeedbacks: ParentFeedback[];
  tutoringRecommendations: TutoringRecommendation[];
  tutoringRequests: TutoringRequest[];
  procurementRequests: ProcurementRequest[];
  diagnosticPackages: DiagnosticPackage[];
  diagnosticSubmissions: DiagnosticSubmission[];
  lmsMaterials: LmsMaterial[];
  lmsAssignments: LmsAssignment[];
  lmsSubmissions: LmsSubmission[];
  lmsDiscussions: LmsDiscussion[];
  tendikPackages: TendikTrainingPackage[];
  tendikSubmissions: TendikSubmission[];
  surveyPackages: SurveyPackage[];
  surveyResponses: SurveyResponse[];
  studentEditRequests: StudentEditRequest[];
  letters?: SchoolLetter[];
  lastUpdated?: string;
}
