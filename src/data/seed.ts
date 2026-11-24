import { AppState, ClassDef, Subject } from '../types';
import { getFaseFromTingkat, getJenjangFromTingkat } from '../utils/academic';
import {
  buildDefaultDiagnosticPackages,
  buildDefaultSurveyPackages,
  buildDefaultTendikPackages,
  evaluateDiagnosticSubmission,
  evaluateSurveyResponse,
} from './templates';

export const DEFAULT_CLASS_DEFS: ClassDef[] = [
  { id: 'cls-1', nama: 'Kelas 1 SD', jenjang: 'SD', tingkat: 1, urutan: 1 },
  { id: 'cls-2', nama: 'Kelas 2 SD', jenjang: 'SD', tingkat: 2, urutan: 2 },
  { id: 'cls-3', nama: 'Kelas 3 SD', jenjang: 'SD', tingkat: 3, urutan: 3 },
  { id: 'cls-4', nama: 'Kelas 4 SD', jenjang: 'SD', tingkat: 4, urutan: 4 },
  { id: 'cls-5', nama: 'Kelas 5 SD', jenjang: 'SD', tingkat: 5, urutan: 5 },
  { id: 'cls-6', nama: 'Kelas 6 SD', jenjang: 'SD', tingkat: 6, urutan: 6 },
  { id: 'cls-7', nama: 'Kelas 7 SMP', jenjang: 'SMP', tingkat: 7, urutan: 7 },
  { id: 'cls-8', nama: 'Kelas 8 SMP', jenjang: 'SMP', tingkat: 8, urutan: 8 },
  { id: 'cls-9', nama: 'Kelas 9 SMP', jenjang: 'SMP', tingkat: 9, urutan: 9 },
  { id: 'cls-10', nama: 'Kelas 10 SMA', jenjang: 'SMA', tingkat: 10, urutan: 10 },
  { id: 'cls-11', nama: 'Kelas 11 SMA', jenjang: 'SMA', tingkat: 11, urutan: 11 },
  { id: 'cls-12', nama: 'Kelas 12 SMA', jenjang: 'SMA', tingkat: 12, urutan: 12 },
];

function buildDefaultCPs(
  subjectId: string,
  nama: string,
  tingkatList: number[],
  cpSummary: string,
  tp1Desc: string,
  tp2Desc: string
) {
  // Group CPs cleanly by Jenjang/Tingkatan so each level can be customized independently
  const groups: Array<{ label: string; tingkats: number[] }> = [];
  const sd = tingkatList.filter((t) => t <= 6);
  const smp = tingkatList.filter((t) => t >= 7 && t <= 9);
  const sma = tingkatList.filter((t) => t >= 10);
  if (sd.length > 0) groups.push({ label: 'SD', tingkats: sd });
  if (smp.length > 0) groups.push({ label: 'SMP', tingkats: smp });
  if (sma.length > 0) groups.push({ label: 'SMA', tingkats: sma });

  if (groups.length === 0) {
    groups.push({ label: 'Umum', tingkats: [7] });
  }

  return groups.map((g, idx) => ({
    id: `${subjectId}-cp-${g.label.toLowerCase()}`,
    kode: `CP ${idx + 1} (${g.label})`,
    deskripsi: `${cpSummary} — disesuaikan untuk jenjang ${g.label} (Kelas ${g.tingkats.join(', ')}) pada mata pelajaran ${nama}.`,
    tingkatList: g.tingkats,
    kelasList: [],
    tps: [
      {
        id: `${subjectId}-${g.label.toLowerCase()}-tp1`,
        kode: 'TP 1',
        deskripsi: `${tp1Desc} (${g.label})`,
      },
      {
        id: `${subjectId}-${g.label.toLowerCase()}-tp2`,
        kode: 'TP 2',
        deskripsi: `${tp2Desc} (${g.label})`,
      },
    ],
  }));
}

function makeSubject(params: {
  id: string;
  kode: string;
  nama: string;
  kelompok: string;
  kategoriPkbm: string;
  skk: number;
  urutan: number;
  guruPengampu: string;
  tingkatList: number[];
  jurusanList?: string[];
  cpSummary: string;
  tp1: string;
  tp2: string;
}): Subject {
  const cps = buildDefaultCPs(
    params.id,
    params.nama,
    params.tingkatList,
    params.cpSummary,
    params.tp1,
    params.tp2
  );
  return {
    id: params.id,
    kode: params.kode,
    nama: params.nama,
    kelompok: params.kelompok,
    kategoriPkbm: params.kategoriPkbm,
    skk: params.skk,
    aktif: true,
    urutan: params.urutan,
    guruPengampu: params.guruPengampu,
    kelasList: [],
    tingkatList: params.tingkatList,
    jurusanList: params.jurusanList || ['Umum', 'IPA', 'IPS'],
    capaianPembelajaran: cps[0]?.deskripsi || params.cpSummary,
    cps,
    tps: cps.flatMap((c) => c.tps),
  };
}

export interface CreateDefaultStateOptions {
  schoolId?: string;
  namaSekolah?: string;
  npsn?: string;
  jenisLembaga?: 'PKBM' | 'Sekolah Formal';
  emptyStudents?: boolean;
}

export function createDefaultState(options: CreateDefaultStateOptions = {}): AppState {
  const schoolId = options.schoolId || 'sch-utama';
  const isEmpty = Boolean(options.emptyStudents);
  const classes = DEFAULT_CLASS_DEFS.map((c) => c.nama);
  const waliKelasMap: AppState['settings']['waliKelasMap'] = {};
  DEFAULT_CLASS_DEFS.forEach((c) => {
    waliKelasMap[c.nama] = {
      nama:
        c.nama === 'Kelas 7 SMP'
          ? 'Rina Marlina, M.Pd.'
          : c.nama === 'Kelas 10 SMA'
            ? 'Ahmad Fauzi, S.Pd.'
            : c.nama === 'Kelas 4 SD'
              ? 'Siti Nurhaliza, S.Pd.'
              : '',
      nip:
        c.nama === 'Kelas 7 SMP'
          ? '198705142010012008'
          : c.nama === 'Kelas 10 SMA'
            ? '198503212009021004'
            : '',
    };
  });

  const subjects: Subject[] = [
    makeSubject({
      id: 'subj-pabp',
      kode: 'PABP',
      nama: 'Pendidikan Agama dan Budi Pekerti',
      kelompok: 'A. Kelompok Mata Pelajaran Umum',
      kategoriPkbm: 'Umum / Wajib',
      skk: 2,
      urutan: 1,
      guruPengampu: 'Ust. Hendra Wijaya, S.Ag.',
      tingkatList: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      cpSummary: 'Memahami nilai keimanan, akhlak mulia, dan toleransi beragama dalam kehidupan sehari-hari',
      tp1: 'Mempraktikkan tata cara ibadah dan akhlak mulia dengan penuh kesadaran',
      tp2: 'Menjelaskan makna toleransi dan saling menghormati antar sesama',
    }),
    makeSubject({
      id: 'subj-pkn',
      kode: 'PPKN',
      nama: 'Pendidikan Pancasila',
      kelompok: 'A. Kelompok Mata Pelajaran Umum',
      kategoriPkbm: 'Umum / Wajib',
      skk: 2,
      urutan: 2,
      guruPengampu: 'Rina Marlina, M.Pd.',
      tingkatList: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      cpSummary: 'Menginternalisasi nilai-nilai Pancasila, UUD 1945, Bhinneka Tunggal Ika, dan NKRI',
      tp1: 'Menerapkan nilai Pancasila dalam musyawarah di lingkungan belajar dan masyarakat',
      tp2: 'Menganalisis norma, hak, dan kewajiban warga negara secara bertanggung jawab',
    }),
    makeSubject({
      id: 'subj-bind',
      kode: 'BIND',
      nama: 'Bahasa Indonesia',
      kelompok: 'A. Kelompok Mata Pelajaran Umum',
      kategoriPkbm: 'Umum / Wajib',
      skk: 4,
      urutan: 3,
      guruPengampu: 'Dewi Kartika, S.Pd.',
      tingkatList: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      cpSummary: 'Memiliki kemampuan berbahasa Indonesia secara kritis, santun, dan efektif dalam menyimak, membaca, berbicara, dan menulis',
      tp1: 'Menganalisis informasi tersurat dan tersirat dari teks deskripsi, narasi, dan eksposisi',
      tp2: 'Menyusun teks laporan hasil observasi atau gagasan tertulis dengan ejaan baku',
    }),
    makeSubject({
      id: 'subj-mat',
      kode: 'MAT',
      nama: 'Matematika',
      kelompok: 'A. Kelompok Mata Pelajaran Umum',
      kategoriPkbm: 'Umum / Wajib',
      skk: 4,
      urutan: 4,
      guruPengampu: 'Budi Santoso, S.Pd.',
      tingkatList: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      cpSummary: 'Memahami konsep bilangan, aljabar, pengukuran, geometri, serta analisis data dan peluang',
      tp1: 'Menyelesaikan masalah kontekstual menggunakan operasi bilangan dan aljabar',
      tp2: 'Menginterpretasikan data, grafik, serta konsep geometri dalam kehidupan nyata',
    }),
    makeSubject({
      id: 'subj-ipas',
      kode: 'IPAS',
      nama: 'Ilmu Pengetahuan Alam dan Sosial (IPAS)',
      kelompok: 'A. Kelompok Mata Pelajaran Umum',
      kategoriPkbm: 'Umum / Wajib',
      skk: 3,
      urutan: 5,
      guruPengampu: 'Siti Nurhaliza, S.Pd.',
      tingkatList: [3, 4, 5, 6],
      cpSummary: 'Mengamati fenomena alam dan sosial di lingkungan sekitar secara ilmiah',
      tp1: 'Mengidentifikasi hubungan makhluk hidup dengan ekosistem dan pelestarian alam',
      tp2: 'Menceritakan keragaman budaya dan aktivitas ekonomi masyarakat sekitar',
    }),
    makeSubject({
      id: 'subj-ipa-smp',
      kode: 'IPA',
      nama: 'Ilmu Pengetahuan Alam (IPA)',
      kelompok: 'A. Kelompok Mata Pelajaran Umum',
      kategoriPkbm: 'Umum / Wajib',
      skk: 3,
      urutan: 6,
      guruPengampu: 'Drs. Agus Salim',
      tingkatList: [7, 8, 9, 10],
      cpSummary: 'Melakukan penyelidikan ilmiah terhadap gejala alam, zat, energi, dan makhluk hidup',
      tp1: 'Melakukan pengukuran besaran dan menganalisis sifat zat serta perubahannya',
      tp2: 'Menjelaskan sistem organisasi kehidupan dan interaksi dalam ekosistem',
    }),
    makeSubject({
      id: 'subj-ips-smp',
      kode: 'IPS',
      nama: 'Ilmu Pengetahuan Sosial (IPS)',
      kelompok: 'A. Kelompok Mata Pelajaran Umum',
      kategoriPkbm: 'Umum / Wajib',
      skk: 3,
      urutan: 7,
      guruPengampu: 'Lestari Handayani, S.Sos.',
      tingkatList: [7, 8, 9, 10],
      cpSummary: 'Memahami interaksi sosial, keruangan, sejarah, serta aktivitas ekonomi masyarakat',
      tp1: 'Menganalisis kondisi geografis Indonesia dan pengaruhnya terhadap kehidupan sosial',
      tp2: 'Menjelaskan peran lembaga sosial dan kegiatan ekonomi dalam pemenuhan kebutuhan',
    }),
    makeSubject({
      id: 'subj-bing',
      kode: 'BING',
      nama: 'Bahasa Inggris',
      kelompok: 'A. Kelompok Mata Pelajaran Umum',
      kategoriPkbm: 'Umum / Wajib',
      skk: 2,
      urutan: 8,
      guruPengampu: 'Nadia Putri, S.Pd.',
      tingkatList: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      cpSummary: 'Menggunakan teks lisan, tulisan, dan visual berbahasa Inggris untuk berinteraksi sesuai konteks',
      tp1: 'Mengungkapkan perkenalan diri, ungkapan sapaan, dan deskripsi sederhana secara lisan',
      tp2: 'Memahami ide utama dari teks deskriptif dan prosedur berbahasa Inggris',
    }),
    makeSubject({
      id: 'subj-pjok',
      kode: 'PJOK',
      nama: 'Pendidikan Jasmani, Olahraga, dan Kesehatan',
      kelompok: 'A. Kelompok Mata Pelajaran Umum',
      kategoriPkbm: 'Umum / Wajib',
      skk: 2,
      urutan: 9,
      guruPengampu: 'Rizky Pratama, S.Or.',
      tingkatList: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      cpSummary: 'Mempraktikkan aktivitas jasmani, kebugaran, sportivitas, dan pola hidup sehat',
      tp1: 'Mempraktikkan gerak dasar permainan bola besar dan kebugaran jasmani',
      tp2: 'Menerapkan pola hidup bersih, gizi seimbang, dan menjaga keselamatan diri',
    }),
    makeSubject({
      id: 'subj-seni',
      kode: 'SENI',
      nama: 'Seni Budaya dan Prakarya',
      kelompok: 'B. Kelompok Mata Pelajaran Pilihan / Muatan Lokal & Keterampilan',
      kategoriPkbm: 'Keterampilan',
      skk: 2,
      urutan: 10,
      guruPengampu: 'Ratna Sari, S.Sn.',
      tingkatList: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      cpSummary: 'Mengekspresikan kreativitas estetika melalui karya seni rupa, musik, atau kriya',
      tp1: 'Menciptakan karya seni dua atau tiga dimensi berbahan ramah lingkungan',
      tp2: 'Mengapresiasi ragam seni budaya Nusantara secara kreatif',
    }),
    makeSubject({
      id: 'subj-inf',
      kode: 'INF',
      nama: 'Informatika',
      kelompok: 'A. Kelompok Mata Pelajaran Umum',
      kategoriPkbm: 'Umum / Wajib',
      skk: 2,
      urutan: 11,
      guruPengampu: 'Fajar Ramadhan, S.Kom.',
      tingkatList: [7, 8, 9, 10, 11, 12],
      cpSummary: 'Menerapkan berpikir komputasional, literasi digital, serta etika teknologi informasi',
      tp1: 'Menyusun langkah logis (algoritma) untuk memecahkan permasalahan sehari-hari',
      tp2: 'Mengolah dokumen digital, tabel data, dan menjaga keamanan data pribadi',
    }),
    makeSubject({
      id: 'subj-sej',
      kode: 'SEJ',
      nama: 'Sejarah',
      kelompok: 'A. Kelompok Mata Pelajaran Umum',
      kategoriPkbm: 'Umum / Wajib',
      skk: 2,
      urutan: 12,
      guruPengampu: 'Ahmad Fauzi, S.Pd.',
      tingkatList: [10, 11, 12],
      cpSummary: 'Menganalisis perkembangan sejarah bangsa Indonesia dan relevansinya dengan masa kini',
      tp1: 'Mengevaluasi peran tokoh pergerakan nasional dalam perjuangan kemerdekaan',
      tp2: 'Menyusun kronologi peristiwa sejarah secara kritis berdasarkan sumber sejarah',
    }),
    makeSubject({
      id: 'subj-mat-lan',
      kode: 'MAT-L',
      nama: 'Matematika Tingkat Lanjut (Peminatan IPA)',
      kelompok: 'B. Kelompok Mata Pelajaran Pilihan / Muatan Lokal & Keterampilan',
      kategoriPkbm: 'Peminatan / Pilihan',
      skk: 3,
      urutan: 13,
      guruPengampu: 'Budi Santoso, S.Pd.',
      tingkatList: [11, 12],
      jurusanList: ['IPA'],
      cpSummary: 'Menguasai konsep polinomial, matriks, transformasi geometri, dan kalkulus dasar',
      tp1: 'Menyelesaikan operasi matriks dan transformasi geometri pada bidang koordinat',
      tp2: 'Menerapkan limit dan turunan fungsi dalam pemecahan masalah sains',
    }),
    makeSubject({
      id: 'subj-pkwu',
      kode: 'PKM',
      nama: 'Pemberdayaan & Keterampilan / Prakarya Kewirausahaan',
      kelompok: 'B. Kelompok Mata Pelajaran Pilihan / Muatan Lokal & Keterampilan',
      kategoriPkbm: 'Pemberdayaan',
      skk: 3,
      urutan: 14,
      guruPengampu: 'Tutor Pemberdayaan',
      tingkatList: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      cpSummary: 'Mengembangkan kemandirian, kecakapan hidup, dan keterampilan kewirausahaan produktif',
      tp1: 'Merancang produk atau jasa sederhana bernilai ekonomi sesuai potensi lokal',
      tp2: 'Mempraktikkan kerja sama tim, pencatatan usaha, dan presentasi karya mandiri',
    }),
    makeSubject({
      id: 'subj-mulok',
      kode: 'MLK',
      nama: 'Muatan Lokal (Bahasa & Budaya Daerah)',
      kelompok: 'B. Kelompok Mata Pelajaran Pilihan / Muatan Lokal & Keterampilan',
      kategoriPkbm: 'Muatan Lokal',
      skk: 2,
      urutan: 15,
      guruPengampu: 'Sri Wahyuni, S.Pd.',
      tingkatList: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      cpSummary: 'Melestarikan bahasa daerah, unggah-ungguh, dan kearifan budaya lokal',
      tp1: 'Berkomunikasi menggunakan bahasa daerah secara santun sesuai konteks',
      tp2: 'Mengenal kesenian dan tradisi adat daerah setempat',
    }),
  ];

  const now = new Date().toISOString();

  const sampleStudents: AppState['students'] = [
    {
      id: 'stu-7-1',
      nis: '2607001',
      nisn: '0134567801',
      nama: 'Aisyah Zahra Putri',
      kelas: 'Kelas 7 SMP',
      fase: getFaseFromTingkat(7),
      jurusan: 'Umum',
      jenisKelamin: 'P',
      tempatLahir: 'Yogyakarta',
      tanggalLahir: '2013-04-12',
      agama: 'Islam',
      pendidikanSebelumnya: 'SD Negeri 1 Sleman',
      alamat: 'Jl. Kaliurang KM 7, Sleman',
      namaAyah: 'Hendra Kusuma',
      namaIbu: 'Sri Rahayu',
      pekerjaanAyah: 'Wiraswasta',
      pekerjaanIbu: 'Ibu Rumah Tangga',
      namaWali: 'Hendra Kusuma',
      noTelpWali: '081234567890',
      status: 'Aktif',
      fotoDataUrl: '',
      portfolioFolderUrl: 'https://drive.google.com/drive/folders/contoh-aisyah',
      portfolioItems: [
        {
          id: 'pf-1',
          judul: 'Laporan Pengamatan Ekosistem Sekolah',
          kategori: 'Proyek IPA',
          url: 'https://drive.google.com/drive/folders/contoh-aisyah',
          tanggal: '2026-10-12',
          catatan: 'Dokumentasi observasi lapangan dan herbarium mini.',
        },
      ],
      createdAt: now,
      awalMasukNote: 'Terdaftar di Kelas 7 SMP (SD Negeri 1 Sleman)',
    },
    {
      id: 'stu-7-2',
      nis: '2607002',
      nisn: '0134567802',
      nama: 'Muhammad Rayyan Pratama',
      kelas: 'Kelas 7 SMP',
      fase: getFaseFromTingkat(7),
      jurusan: 'Umum',
      jenisKelamin: 'L',
      tempatLahir: 'Bandung',
      tanggalLahir: '2013-08-24',
      agama: 'Islam',
      pendidikanSebelumnya: 'PKBM Paket A Semesta Ilmu',
      alamat: 'Jl. Magelang KM 5, Sleman',
      namaAyah: 'Dedi Pratama',
      namaIbu: 'Yulianti',
      pekerjaanAyah: 'Karyawan Swasta',
      pekerjaanIbu: 'Guru',
      namaWali: 'Dedi Pratama',
      noTelpWali: '081398765432',
      status: 'Aktif',
      fotoDataUrl: '',
      portfolioFolderUrl: '',
      portfolioItems: [],
      createdAt: now,
      awalMasukNote: 'Terdaftar di Kelas 7 SMP (PKBM Paket A Semesta Ilmu)',
    },
    {
      id: 'stu-7-3',
      nis: '2607003',
      nisn: '0134567803',
      nama: 'Nadia Kirana Sari',
      kelas: 'Kelas 7 SMP',
      fase: getFaseFromTingkat(7),
      jurusan: 'Umum',
      jenisKelamin: 'P',
      tempatLahir: 'Semarang',
      tanggalLahir: '2013-11-05',
      agama: 'Islam',
      pendidikanSebelumnya: 'MI Al-Hidayah',
      alamat: 'Jl. Solo KM 8, Yogyakarta',
      namaAyah: 'Bambang Sutrisno',
      namaIbu: 'Endang Lestari',
      pekerjaanAyah: 'PNS',
      pekerjaanIbu: 'Perawat',
      namaWali: 'Bambang Sutrisno',
      noTelpWali: '085612349876',
      status: 'Aktif',
      fotoDataUrl: '',
      portfolioFolderUrl: '',
      portfolioItems: [],
      createdAt: now,
      awalMasukNote: 'Terdaftar di Kelas 7 SMP (MI Al-Hidayah)',
    },
    {
      id: 'stu-4-1',
      nis: '2604001',
      nisn: '0161122334',
      nama: 'Dimas Aditya Nugroho',
      kelas: 'Kelas 4 SD',
      fase: getFaseFromTingkat(4),
      jurusan: 'Umum',
      jenisKelamin: 'L',
      tempatLahir: 'Sleman',
      tanggalLahir: '2016-02-19',
      agama: 'Islam',
      pendidikanSebelumnya: 'TK Pertiwi',
      alamat: 'Condongcatur, Depok, Sleman',
      namaAyah: 'Agus Nugroho',
      namaIbu: 'Rina Wati',
      pekerjaanAyah: 'Desainer Grafis',
      pekerjaanIbu: 'Wiraswasta',
      namaWali: 'Agus Nugroho',
      noTelpWali: '082144556677',
      status: 'Aktif',
      fotoDataUrl: '',
      portfolioFolderUrl: '',
      portfolioItems: [],
      createdAt: now,
      awalMasukNote: 'Terdaftar di Kelas 4 SD',
    },
    {
      id: 'stu-10-1',
      nis: '2610001',
      nisn: '0109988776',
      nama: 'Farhan Hakim Al-Faruq',
      kelas: 'Kelas 10 SMA',
      fase: getFaseFromTingkat(10),
      jurusan: 'Umum',
      jenisKelamin: 'L',
      tempatLahir: 'Jakarta',
      tanggalLahir: '2010-06-11',
      agama: 'Islam',
      pendidikanSebelumnya: 'SMP Negeri 4 Yogyakarta',
      alamat: 'Seturan, Depok, Sleman',
      namaAyah: 'Zainal Abidin',
      namaIbu: 'Mardiyah',
      pekerjaanAyah: 'Dosen',
      pekerjaanIbu: 'Apoteker',
      namaWali: 'Zainal Abidin',
      noTelpWali: '081900112233',
      status: 'Aktif',
      fotoDataUrl: '',
      portfolioFolderUrl: '',
      portfolioItems: [],
      createdAt: now,
      awalMasukNote: 'Terdaftar di Kelas 10 SMA (SMP Negeri 4 Yogyakarta)',
    },
  ];

  const grades: AppState['grades'] = {
    'stu-7-1::subj-bind::1': {
      tugas: 90,
      kuis: 88,
      ujian: 92,
      sts: 89,
      sas: 92,
      tpScores: { 'subj-bind-smp-tp1': 91, 'subj-bind-smp-tp2': 89 },
      catatanGuru: 'Aktif berdiskusi dan sangat teliti menyusun teks observasi.',
    },
    'stu-7-1::subj-mat::1': {
      tugas: 86,
      kuis: 84,
      ujian: 88,
      sts: 85,
      sas: 88,
      tpScores: { 'subj-mat-smp-tp1': 87, 'subj-mat-smp-tp2': 85 },
    },
    'stu-7-1::subj-ipa-smp::1': {
      tugas: 92,
      kuis: 90,
      ujian: 91,
      sts: 90,
      sas: 91,
      tpScores: { 'subj-ipa-smp-smp-tp1': 92, 'subj-ipa-smp-smp-tp2': 90 },
    },
    'stu-7-2::subj-bind::1': {
      tugas: 82,
      kuis: 80,
      ujian: 84,
      sts: 81,
      sas: 84,
    },
    'stu-7-2::subj-mat::1': {
      tugas: 78,
      kuis: 76,
      ujian: 80,
      sts: 77,
      sas: 80,
    },
    'stu-7-3::subj-bind::1': {
      tugas: 88,
      kuis: 85,
      ujian: 86,
      sts: 86,
      sas: 86,
    },
    'stu-7-3::subj-mat::1': {
      tugas: 90,
      kuis: 92,
      ujian: 89,
      sts: 91,
      sas: 89,
    },
  };

  return {
    schoolId,
    settings: {
      jenisLembaga: options.jenisLembaga || 'PKBM',
      namaSekolah: options.namaSekolah || 'PKBM Semesta Ilmu',
      npsn: options.npsn || (isEmpty ? '' : 'P9980123'),
      nss: isEmpty ? '' : '421.9/102/PKBM/2024',
      akreditasi: isEmpty ? '' : 'A (Unggul)',
      tahunAjaran: '2026/2027',
      semester: '1',
      tahunAjaranAktif: true,
      lockedForGuru: false,
      lockedForWaliKelas: false,
      alamat: 'Jl. Pendidikan Merdeka No. 45, Condongcatur',
      kelurahan: 'Condongcatur',
      kecamatan: 'Depok',
      kabupaten: 'Kabupaten Sleman',
      provinsi: 'DI Yogyakarta',
      kodePos: '55283',
      telepon: '(0274) 556789',
      email: 'info@semestailmu.sch.id',
      website: 'https://semestailmu.sch.id',
      kepalaSekolah: 'Dr. H. Ahmad Subarkah, M.Pd.',
      nipKepalaSekolah: '197508172000031002',
      tempatRapor: 'Sleman',
      tanggalRapor: '2026-12-19',
      logoDataUrl: '',
      ttdKepalaDataUrl: '',
      waliKelasMap,
      calculationMode: 'weighted',
      kktp: 75,
      bobot: {
        tugas: 35,
        kuis: 25,
        ujian: 40,
      },
      gasEndpointUrl: '',
    },
    academicYears: [
      {
        id: 'ay-2025-2026',
        tahunAjaran: '2025/2026',
        semester: '2',
        aktif: false,
        lockedForGuru: true,
        lockedForWaliKelas: true,
        createdAt: now,
        notes: 'Tahun Ajaran sebelumnya (Tutup Buku)',
      },
      {
        id: 'ay-2026-2027',
        tahunAjaran: '2026/2027',
        semester: '1',
        aktif: true,
        lockedForGuru: false,
        lockedForWaliKelas: false,
        createdAt: now,
        notes: 'Tahun Ajaran berjalan saat ini',
      },
    ],
    classes,
    classDefs: [...DEFAULT_CLASS_DEFS],
    subjects,
    students: isEmpty ? [] : sampleStudents,
    grades: isEmpty ? {} : grades,
    p5Projects: isEmpty
      ? []
      : [
          {
            id: 'p5-stu-7-1-1',
            studentId: 'stu-7-1',
            semester: '1',
            tahunAjaran: '2026/2027',
            tema: 'Gaya Hidup Berkelanjutan & Eco-Literacy',
            judulProjek: 'Bank Sampah & Kompos Mandiri Sekolah',
            deskripsi:
              'Peserta didik merancang sistem pemilahan sampah organik dan anorganik serta mengolah kompos di lingkungan PKBM.',
            dimensi: [
              { profil: 'Keimanan dan Ketakwaan terhadap Tuhan YME', capaian: 'SAB' },
              { profil: 'Kewargaan', capaian: 'BSH' },
              { profil: 'Penalaran Kritis', capaian: 'BSH' },
              { profil: 'Kreativitas', capaian: 'SAB' },
              { profil: 'Kolaborasi', capaian: 'BSH' },
              { profil: 'Kemandirian', capaian: 'BSH' },
              { profil: 'Kesehatan', capaian: 'BSH' },
              { profil: 'Komunikasi', capaian: 'SAB' },
            ],
          },
        ],
    reportMeta: isEmpty
      ? {}
      : {
          'stu-7-1::1': {
            studentId: 'stu-7-1',
            semester: '1',
            tahunAjaran: '2026/2027',
            ekskul: [
              {
                id: 'eks-1',
                nama: 'Pramuka / Kepanduan',
                predikat: 'Sangat Baik',
                keterangan: 'Aktif dalam kegiatan baris-berbaris, kepemimpinan regu, dan bakti sosial.',
              },
              {
                id: 'eks-2',
                nama: 'Klub Literasi & Jurnalistik',
                predikat: 'Baik',
                keterangan: 'Berperan aktif menulis artikel buletin sekolah.',
              },
            ],
            absensi: { sakit: 1, izin: 0, alpha: 0 },
            catatanWaliKelas:
              'Aisyah menunjukkan semangat belajar yang sangat baik, disiplin, dan peduli terhadap teman sebaya. Pertahankan prestasi di semester berikutnya.',
          },
        },
    counselingNotes: isEmpty
      ? []
      : [
          {
            id: 'bk-1',
            studentId: 'stu-7-1',
            semester: '1',
            tahunAjaran: '2026/2027',
            tanggal: '2026-10-20',
            kategori: 'Akademik & Belajar',
            topik: 'Penguatan minat riset sains',
            uraianMasalah: 'Siswa memiliki ketertarikan tinggi pada proyek pengamatan alam.',
            layananTindakLanjut: 'Diarahkan mengikuti kelompok karya ilmiah remaja PKBM.',
            rekomendasiOrtu: 'Dukung ketersediaan buku bacaan sains populer di rumah.',
            konselorNama: 'Rina Marlina, M.Pd.',
            tampilDiOrtu: true,
            createdAt: now,
          },
        ],
    mutations: [],
    archives: [],
    logbookEntries: isEmpty
      ? []
      : [
          {
            id: 'lb-1',
            studentId: 'stu-7-2',
            studentName: 'Muhammad Rayyan Pratama',
            kelas: 'Kelas 7 SMP',
            authorRole: 'guru',
            authorName: 'Budi Santoso, S.Pd.',
            subjectName: 'Matematika',
            kategori: 'Akademik',
            prioritas: 'Perlu Perhatian',
            judul: 'Latihan soal aljabar perlu pendampingan tambahan',
            pesan: 'Rayyan aktif di kelas namun masih perlu latihan bertahap pada soal cerita persamaan linear.',
            status: 'Dipantau Wali Kelas',
            replies: [
              {
                id: 'lbr-1',
                authorRole: 'walikelas',
                authorName: 'Rina Marlina, M.Pd.',
                pesan: 'Terima kasih infonya Pak Budi, akan kami jadwalkan klinik belajar tambahan hari Jumat.',
                createdAt: now,
              },
            ],
            createdAt: now,
            updatedAt: now,
          },
        ],
    parentFeedbacks: [],
    tutoringRecommendations: isEmpty
      ? []
      : [
          {
            id: 'trec-1',
            schoolId,
            studentId: 'stu-7-2',
            studentName: 'Muhammad Rayyan Pratama',
            nis: '2607002',
            kelas: 'Kelas 7 SMP',
            semester: '1',
            tahunAjaran: '2026/2027',
            subjectId: 'subj-mat',
            subjectName: 'Matematika',
            cpId: 'subj-mat-cp-smp',
            cpKode: 'CP 2 (SMP)',
            cpDeskripsi:
              'Memahami konsep bilangan, aljabar, pengukuran, geometri, serta analisis data dan peluang — disesuaikan untuk jenjang SMP (Kelas 7, 8, 9) pada mata pelajaran Matematika.',
            tpId: 'subj-mat-smp-tp1',
            tpKode: 'TP 1',
            tpDeskripsi: 'Menyelesaikan masalah kontekstual menggunakan operasi bilangan dan aljabar (SMP)',
            rekomendasiGuru:
              'Disarankan mengikuti klinik penguatan materi aljabar dasar & persamaan linear 1 variabel.',
            recommendedByUserId: 'seed-guru',
            recommendedByName: 'Budi Santoso, S.Pd.',
            recommendedByRole: 'guru',
            tanggalRekomendasi: '2026-10-21',
            status: 'Disarankan',
            createdAt: now,
          },
        ],
    tutoringRequests: isEmpty
      ? []
      : [
          {
            id: 'treq-1',
            schoolId,
            studentId: 'stu-7-3',
            studentName: 'Salsabila Putri',
            nis: '2607003',
            kelas: 'Kelas 7 SMP',
            semester: '1',
            tahunAjaran: '2026/2027',
            subjectId: 'subj-mat',
            subjectName: 'Matematika',
            cpId: 'subj-mat-cp-smp',
            cpKode: 'CP 2 (SMP)',
            cpDeskripsi:
              'Memahami konsep bilangan, aljabar, pengukuran, geometri, serta analisis data dan peluang — disesuaikan untuk jenjang SMP (Kelas 7, 8, 9) pada mata pelajaran Matematika.',
            tpId: 'subj-mat-smp-tp1',
            tpKode: 'TP 1',
            tpDeskripsi: 'Menyelesaikan masalah kontekstual menggunakan operasi bilangan dan aljabar (SMP)',
            sumber: 'Ortu',
            alasan: 'Ananda ingin memperdalam pemecahan soal cerita aljabar sebelum asesmen.',
            tanggalAjuan: '2026-10-22',
            parentUserId: 'seed-ortu',
            parentName: 'Orang Tua Salsabila',
            status: 'Menunggu Konfirmasi',
            createdAt: now,
            updatedAt: now,
          },
        ],
    procurementRequests: isEmpty
      ? []
      : [
          {
            id: 'pbj-1',
            schoolId,
            nomorPengajuan: 'PBJ-2026-001',
            tahunAjaran: '2026/2027',
            semester: '1',
            requesterUserId: 'seed-guru',
            requesterName: 'Drs. Agus Salim',
            requesterRole: 'guru',
            kelasTerkait: 'Kelas 7 SMP',
            subjectName: 'Ilmu Pengetahuan Alam (IPA)',
            kategori: 'Alat Pembelajaran',
            namaItem: 'Kit Praktikum Pengukuran & Massa Jenis',
            spesifikasi: 'Gelas ukur 100ml, neraca pegas, dan jangka sorong manual',
            qty: 4,
            satuan: 'Paket',
            hargaSatuan: 185000,
            total: 740000,
            prioritas: 'Normal',
            tanggalPengajuan: '2026-10-18',
            tanggalPenggunaan: '2026-11-05',
            lokasiAtauVendor: 'Laboratorium IPA / Toko Alat Edukasi',
            keterangan: 'Untuk praktik langsung pengukuran besaran pokok kelas 7 SMP.',
            status: 'Menunggu Persetujuan',
            createdAt: now,
            updatedAt: now,
          },
        ],
    ...(() => {
      const diagPkgs = buildDefaultDiagnosticPackages(schoolId, subjects, classes, '2026/2027', '1');
      const tendikPkgs = buildDefaultTendikPackages(schoolId, '2026/2027');
      const surveyPkgs = buildDefaultSurveyPackages(schoolId, '2026/2027', '1');
      if (isEmpty) {
        return {
          diagnosticPackages: diagPkgs,
          diagnosticSubmissions: [],
          lmsMaterials: [],
          lmsAssignments: [],
          lmsSubmissions: [],
          lmsDiscussions: [],
          tendikPackages: tendikPkgs,
          tendikSubmissions: [],
          surveyPackages: surveyPkgs,
          surveyResponses: [],
          studentEditRequests: [],
          letters: [],
        };
      }

      const nonAkPkg = diagPkgs.find((p) => p.kategori === 'Non-Akademik');
      const matPkg = diagPkgs.find((p) => p.subjectId === 'subj-mat');
      const sampleDiagSubs: AppState['diagnosticSubmissions'] = [];

      if (nonAkPkg) {
        const answers1 = [
          { questionId: 'na-psi-1', selectedOptionId: '5' },
          { questionId: 'na-psi-2', selectedOptionId: '4' },
          { questionId: 'na-psi-3', selectedOptionId: 'a' },
          { questionId: 'na-psi-4', selectedOptionId: '5' },
          { questionId: 'na-sel-1', selectedOptionId: '5' },
          { questionId: 'na-sel-2', selectedOptionId: 'a' },
          { questionId: 'na-sel-3', selectedOptionId: '4' },
          { questionId: 'na-sel-4', selectedOptionId: '5' },
          { questionId: 'na-gb-1', selectedOptionId: 'v' },
          { questionId: 'na-gb-2', selectedOptionId: 'v' },
          { questionId: 'na-gb-3', selectedOptionId: 'a' },
          { questionId: 'na-minat-1', selectedOptionId: 'sains' },
          { questionId: 'na-minat-2', selectedOptionId: 'a' },
          { questionId: 'na-minat-3', textAnswer: 'Ingin menjadi peneliti lingkungan dan aktif di klub literasi.' },
          { questionId: 'na-rumah-1', selectedOptionId: 'a' },
          { questionId: 'na-rumah-2', selectedOptionId: 'a' },
          { questionId: 'na-rumah-3', selectedOptionId: 'b' },
          { questionId: 'na-rumah-4', selectedOptionId: 'a' },
          { questionId: 'na-kel-1', selectedOptionId: 'a' },
          { questionId: 'na-kel-2', selectedOptionId: '5' },
          { questionId: 'na-kel-3', selectedOptionId: 'a' },
        ];
        sampleDiagSubs.push({
          id: 'dsub-nonak-stu-7-1',
          schoolId,
          studentId: 'stu-7-1',
          studentName: 'Aisyah Zahra Putri',
          nis: '2607001',
          kelas: 'Kelas 7 SMP',
          tahunAjaran: '2026/2027',
          semester: '1',
          submittedAt: now,
          answers: answers1,
          ...evaluateDiagnosticSubmission(nonAkPkg, answers1),
          catatanAnalisisPengurus: 'Profil belajar sangat optimal dengan preferensi Visual & minat riset sains.',
          keputusanTindakLanjut: 'Arahkan ke kelompok karya ilmiah remaja & pengayaan proyek.',
          verifiedByName: 'Pengurus Lembaga',
          verifiedAt: now,
        });

        const answers2 = [
          { questionId: 'na-psi-1', selectedOptionId: '3' },
          { questionId: 'na-psi-2', selectedOptionId: '2' },
          { questionId: 'na-psi-3', selectedOptionId: 'c' },
          { questionId: 'na-psi-4', selectedOptionId: '3' },
          { questionId: 'na-sel-1', selectedOptionId: '3' },
          { questionId: 'na-sel-2', selectedOptionId: 'c' },
          { questionId: 'na-sel-3', selectedOptionId: '2' },
          { questionId: 'na-sel-4', selectedOptionId: '4' },
          { questionId: 'na-gb-1', selectedOptionId: 'k' },
          { questionId: 'na-gb-2', selectedOptionId: 'k' },
          { questionId: 'na-gb-3', selectedOptionId: 'k' },
          { questionId: 'na-minat-1', selectedOptionId: 'tech' },
          { questionId: 'na-minat-2', selectedOptionId: 'c' },
          { questionId: 'na-minat-3', textAnswer: 'Tertarik belajar desain grafis dan praktik komputer.' },
          { questionId: 'na-rumah-1', selectedOptionId: 'c' },
          { questionId: 'na-rumah-2', selectedOptionId: 'c' },
          { questionId: 'na-rumah-3', selectedOptionId: 'd' },
          { questionId: 'na-rumah-4', selectedOptionId: 'b' },
          { questionId: 'na-kel-1', selectedOptionId: 'b' },
          { questionId: 'na-kel-2', selectedOptionId: '3' },
          { questionId: 'na-kel-3', selectedOptionId: 'b' },
        ];
        sampleDiagSubs.push({
          id: 'dsub-nonak-stu-7-2',
          schoolId,
          studentId: 'stu-7-2',
          studentName: 'Muhammad Rayyan Pratama',
          nis: '2607002',
          kelas: 'Kelas 7 SMP',
          tahunAjaran: '2026/2027',
          semester: '1',
          submittedAt: now,
          answers: answers2,
          ...evaluateDiagnosticSubmission(nonAkPkg, answers2),
        });
      }

      if (matPkg) {
        const ansMat2 = [
          { questionId: 'subj-mat-diag-1', selectedOptionId: 'b' },
          { questionId: 'subj-mat-diag-2', selectedOptionId: 'a' },
          { questionId: 'subj-mat-diag-3', selectedOptionId: 'b' },
          { questionId: 'subj-mat-diag-4', selectedOptionId: 'c' },
        ];
        sampleDiagSubs.push({
          id: 'dsub-mat-stu-7-2',
          schoolId,
          studentId: 'stu-7-2',
          studentName: 'Muhammad Rayyan Pratama',
          nis: '2607002',
          kelas: 'Kelas 7 SMP',
          tahunAjaran: '2026/2027',
          semester: '1',
          submittedAt: now,
          answers: ansMat2,
          ...evaluateDiagnosticSubmission(matPkg, ansMat2),
        });
      }

      const mandiriPkg = diagPkgs.find((p) => p.kategori === 'Pemelajar Mandiri');
      if (mandiriPkg) {
        const pmAns1 = [
          { questionId: 'pm-ini-1', selectedOptionId: '5' },
          { questionId: 'pm-ini-2', selectedOptionId: '5' },
          { questionId: 'pm-ini-3', selectedOptionId: 'a' },
          { questionId: 'pm-wkt-1', selectedOptionId: '4' },
          { questionId: 'pm-wkt-2', selectedOptionId: '5' },
          { questionId: 'pm-wkt-3', selectedOptionId: 'a' },
          { questionId: 'pm-str-1', selectedOptionId: '4' },
          { questionId: 'pm-str-2', selectedOptionId: '5' },
          { questionId: 'pm-str-3', selectedOptionId: 'a' },
          { questionId: 'pm-smb-1', selectedOptionId: '5' },
          { questionId: 'pm-smb-2', selectedOptionId: '5' },
          { questionId: 'pm-smb-3', selectedOptionId: 'a' },
          { questionId: 'pm-evl-1', selectedOptionId: '5' },
          { questionId: 'pm-evl-2', selectedOptionId: '4' },
          { questionId: 'pm-evl-3', selectedOptionId: '5' },
          { questionId: 'pm-res-1', selectedOptionId: '5' },
          { questionId: 'pm-res-2', selectedOptionId: '5' },
          { questionId: 'pm-res-3', textAnswer: 'Saya sudah rutin membuat catatan rangkuman sebelum tidur dan ingin menambah target membaca 1 buku sains per bulan.' },
        ];
        sampleDiagSubs.push({
          id: 'dsub-pm-stu-7-1',
          schoolId,
          studentId: 'stu-7-1',
          studentName: 'Aisyah Zahra Putri',
          nis: '2607001',
          kelas: 'Kelas 7 SMP',
          tahunAjaran: '2026/2027',
          semester: '1',
          submittedAt: now,
          answers: pmAns1,
          ...evaluateDiagnosticSubmission(mandiriPkg, pmAns1),
        });

        const pmAns2 = [
          { questionId: 'pm-ini-1', selectedOptionId: '3' },
          { questionId: 'pm-ini-2', selectedOptionId: '3' },
          { questionId: 'pm-ini-3', selectedOptionId: 'c' },
          { questionId: 'pm-wkt-1', selectedOptionId: '2' },
          { questionId: 'pm-wkt-2', selectedOptionId: '2' },
          { questionId: 'pm-wkt-3', selectedOptionId: 'c' },
          { questionId: 'pm-str-1', selectedOptionId: '3' },
          { questionId: 'pm-str-2', selectedOptionId: '3' },
          { questionId: 'pm-str-3', selectedOptionId: 'b' },
          { questionId: 'pm-smb-1', selectedOptionId: '3' },
          { questionId: 'pm-smb-2', selectedOptionId: '3' },
          { questionId: 'pm-smb-3', selectedOptionId: 'b' },
          { questionId: 'pm-evl-1', selectedOptionId: '3' },
          { questionId: 'pm-evl-2', selectedOptionId: '3' },
          { questionId: 'pm-evl-3', selectedOptionId: '3' },
          { questionId: 'pm-res-1', selectedOptionId: '3' },
          { questionId: 'pm-res-2', selectedOptionId: '3' },
          { questionId: 'pm-res-3', textAnswer: 'Sering terdistraksi ponsel saat belajar sore, ingin dibantu jadwal belajar harian.' },
        ];
        sampleDiagSubs.push({
          id: 'dsub-pm-stu-7-2',
          schoolId,
          studentId: 'stu-7-2',
          studentName: 'Muhammad Rayyan Pratama',
          nis: '2607002',
          kelas: 'Kelas 7 SMP',
          tahunAjaran: '2026/2027',
          semester: '1',
          submittedAt: now,
          answers: pmAns2,
          ...evaluateDiagnosticSubmission(mandiriPkg, pmAns2),
        });
      }

      const litPkg = surveyPkgs[0];
      const sampleSurveyResponses: AppState['surveyResponses'] = [];
      if (litPkg) {
        const litAns1 = [
          { questionId: 'lit-pj-1', selectedOptionId: 'a' },
          { questionId: 'lit-pj-2', selectedOptionId: 'a' },
          { questionId: 'lit-pj-3', selectedOptionIds: ['a', 'b', 'c'] },
          { questionId: 'lit-rt-1', selectedOptionId: 'a' },
          { questionId: 'lit-rt-2', selectedOptionId: 'a' },
          { questionId: 'lit-rt-3', selectedOptionId: '5' },
          { questionId: 'lit-ak-1', selectedOptionIds: ['a', 'b', 'd'] },
          { questionId: 'lit-ak-2', selectedOptionId: '5' },
          { questionId: 'lit-ak-3', selectedOptionId: '4' },
          { questionId: 'lit-gw-1', selectedOptionId: '5' },
          { questionId: 'lit-gw-2', selectedOptionId: '4' },
          { questionId: 'lit-dk-1', selectedOptionIds: ['a', 'b'] },
          { questionId: 'lit-dk-2', textAnswer: 'Aisyah gemar membaca buku ensiklopedia alam dan kisah ilmuwan Muslim.' },
        ];
        sampleSurveyResponses.push({
          id: 'srvres-lit-stu-7-1',
          schoolId,
          packageId: litPkg.id,
          packageJudul: litPkg.judul,
          kategori: 'Literasi Keluarga',
          studentId: 'stu-7-1',
          studentName: 'Aisyah Zahra Putri',
          nis: '2607001',
          kelas: 'Kelas 7 SMP',
          parentUserId: 'seed-ortu',
          parentName: 'Hendra Wijaya (Wali Aisyah)',
          tahunAjaran: '2026/2027',
          semester: '1',
          answers: litAns1,
          ...evaluateSurveyResponse(litPkg, litAns1),
          submittedAt: now,
          updatedAt: now,
        });
      }

      return {
        diagnosticPackages: diagPkgs,
        diagnosticSubmissions: sampleDiagSubs,
        lmsMaterials: [
          {
            id: 'lmsmat-1',
            schoolId,
            kelas: 'Kelas 7 SMP',
            subjectId: 'subj-mat',
            subjectName: 'Matematika',
            cpKode: 'CP 2 (SMP)',
            tpKode: 'TP 1',
            judul: 'Modul Pengantar Persamaan Linear Satu Variabel (PLSV)',
            tipe: 'Modul Bacaan' as const,
            konten:
              'Pelajari langkah mengubah soal cerita sehari-hari menjadi model matematika berbentuk ax + b = c. Kerjakan 3 contoh soal latihan di akhir modul sebelum mengirim tugas praktik.',
            authorUserId: 'seed-guru',
            authorName: 'Budi Santoso, S.Pd.',
            authorRole: 'guru' as const,
            completedByStudentIds: ['stu-7-1'],
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'lmsmat-2',
            schoolId,
            kelas: 'Kelas 7 SMP',
            subjectId: 'subj-ipa-smp',
            subjectName: 'Ilmu Pengetahuan Alam (IPA)',
            cpKode: 'CP 2 (SMP)',
            tpKode: 'TP 2',
            judul: 'Panduan Observasi Rantai Makanan & Ekosistem Sekolah',
            tipe: 'Lembar Kerja / Tautan' as const,
            konten:
              'Amati komponen biotik dan abiotik di taman PKBM/rumah, lalu catat interaksi produsen-konsumen-pengurai dalam format tabel pengamatan.',
            authorUserId: 'seed-guru-ipa',
            authorName: 'Drs. Agus Salim',
            authorRole: 'guru' as const,
            completedByStudentIds: ['stu-7-1'],
            createdAt: now,
            updatedAt: now,
          },
        ],
        lmsAssignments: [
          {
            id: 'lmsasg-1',
            schoolId,
            kelas: 'Kelas 7 SMP',
            subjectId: 'subj-mat',
            subjectName: 'Matematika',
            cpKode: 'CP 2 (SMP)',
            tpKode: 'TP 1',
            judul: 'Latihan Kontekstual Persamaan Linear',
            instruksi:
              'Sebuah taman berbentuk persegi panjang memiliki keliling 64 m. Jika panjangnya 4 meter lebih panjang dari lebarnya, tentukan panjang dan lebar taman beserta langkah penyelesaiannya!',
            tenggat: '2026-11-30',
            skorMaksimal: 100,
            authorUserId: 'seed-guru',
            authorName: 'Budi Santoso, S.Pd.',
            authorRole: 'guru' as const,
            status: 'Aktif' as const,
            createdAt: now,
            updatedAt: now,
          },
        ],
        lmsSubmissions: [
          {
            id: 'lmssub-1',
            schoolId,
            assignmentId: 'lmsasg-1',
            studentId: 'stu-7-1',
            studentName: 'Aisyah Zahra Putri',
            nis: '2607001',
            kelas: 'Kelas 7 SMP',
            jawabanTeks:
              'Misal lebar = x, maka panjang = x + 4. Keliling = 2(x + x + 4) = 64 -> 4x + 8 = 64 -> 4x = 56 -> x = 14 m. Jadi lebar = 14 m dan panjang = 18 m.',
            submittedAt: now,
            nilai: 95,
            umpanBalikGuru: 'Langkah pemodelan sangat runtut dan jawaban tepat.',
            gradedByName: 'Budi Santoso, S.Pd.',
            gradedAt: now,
          },
        ],
        lmsDiscussions: [
          {
            id: 'lmsdsc-1',
            schoolId,
            kelas: 'Kelas 7 SMP',
            subjectId: 'subj-mat',
            subjectName: 'Matematika',
            authorUserId: 'seed-guru',
            authorName: 'Budi Santoso, S.Pd.',
            authorRole: 'guru' as const,
            pesan:
              'Selamat datang di Ruang LMS Matematika Kelas 7! Silakan pelajari modul PLSV dan tanyakan di forum ini bila ada langkah aljabar yang masih membingungkan.',
            createdAt: now,
          },
        ],
        tendikPackages: tendikPkgs,
        tendikSubmissions: [],
        surveyPackages: surveyPkgs,
        surveyResponses: sampleSurveyResponses,
        studentEditRequests: [],
        letters: [],
      };
    })(),
    lastUpdated: now,
  };
}

export function normalizeClassDef(c: ClassDef, idx: number): ClassDef {
  return {
    ...c,
    jenjang: c.jenjang || getJenjangFromTingkat(c.tingkat || 7),
    tingkat: c.tingkat || 7,
    urutan: typeof c.urutan === 'number' ? c.urutan : idx + 1,
  };
}
