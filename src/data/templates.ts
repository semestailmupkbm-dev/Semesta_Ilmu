import {
  DiagnosticAnswer,
  DiagnosticDomainScore,
  DiagnosticPackage,
  DiagnosticQuestion,
  DiagnosticSubmission,
  Subject,
  SurveyDomainScore,
  SurveyPackage,
  SurveyQuestion,
  SurveyResponse,
  TendikCompetency,
  TendikQuestion,
  TendikTrainingPackage,
} from '../types';

export const TENDIK_COMPETENCIES: TendikCompetency[] = [
  'Profesional',
  'Pedagogik',
  'Kepribadian',
  'Digital',
  'Sosial',
];

export const NON_AKADEMIK_DOMAINS = [
  'Psikologis',
  'Sosial-Emosional',
  'Gaya Belajar',
  'Minat & Bakat',
  'Aktivitas di Rumah',
  'Latar Belakang Keluarga',
] as const;

export const PEMELAJAR_MANDIRI_DOMAINS = [
  'Inisiatif & Kesadaran Tujuan Belajar',
  'Manajemen Waktu & Disiplin Jadwal',
  'Strategi Belajar & Eksekusi Tugas',
  'Pencarian Sumber & Literasi Digital',
  'Evaluasi Diri & Refleksi Kesalahan',
  'Resiliensi & Ketekunan Belajar',
] as const;

export const SURVEY_LITERASI_DOMAINS = [
  'Ketersediaan Pojok Baca & Koleksi Buku',
  'Rutinitas & Durasi Membaca di Rumah',
  'Kegiatan Literasi Aktif Keluarga',
  'Keteladanan & Ekosistem Bebas Gawai',
  'Dukungan & Aspirasi Literasi Sekolah',
] as const;

export function buildPemelajarMandiriQuestions(): DiagnosticQuestion[] {
  const likert5 = (s1: string, s2: string, s3: string, s4: string, s5: string) => [
    { id: '1', label: `1 · ${s1}`, nilaiSkor: 1 },
    { id: '2', label: `2 · ${s2}`, nilaiSkor: 2 },
    { id: '3', label: `3 · ${s3}`, nilaiSkor: 3 },
    { id: '4', label: `4 · ${s4}`, nilaiSkor: 4 },
    { id: '5', label: `5 · ${s5}`, nilaiSkor: 5 },
  ];

  return [
    // 1. Inisiatif & Kesadaran Tujuan Belajar
    {
      id: 'pm-ini-1',
      domain: 'Inisiatif & Kesadaran Tujuan Belajar',
      subDimensi: 'Penetapan Target Pribadi',
      tipe: 'skala_likert',
      pertanyaan:
        'Saya memulai belajar atau membaca materi sebelum diminta atau diingatkan berulang kali oleh guru maupun orang tua.',
      opsi: likert5('Belum Pernah', 'Jarang', 'Kadang-kadang', 'Sering', 'Selalu Konsisten'),
      bobotPoin: 10,
      wajib: true,
    },
    {
      id: 'pm-ini-2',
      domain: 'Inisiatif & Kesadaran Tujuan Belajar',
      subDimensi: 'Pemahaman Tujuan Pembelajaran',
      tipe: 'skala_likert',
      pertanyaan:
        'Sebelum mengerjakan modul atau tugas, saya memahami tujuan yang ingin dicapai dan manfaatnya bagi diri saya.',
      opsi: likert5('Tidak Pernah', 'Jarang', 'Cukup Sering', 'Sering', 'Selalu'),
      bobotPoin: 10,
      wajib: true,
    },
    {
      id: 'pm-ini-3',
      domain: 'Inisiatif & Kesadaran Tujuan Belajar',
      subDimensi: 'Respons Saat Ada Materi Baru',
      tipe: 'pilihan_ganda',
      pertanyaan:
        'Ketika guru merilis materi baru di Ruang LMS atau memberi modul baru, apa yang biasanya pertama kali kamu lakukan?',
      opsi: [
        {
          id: 'a',
          label: 'Langsung membuka materi, mencatat bagian penting, dan menyiapkan pertanyaan bila ada yang belum jelas',
          nilaiSkor: 5,
        },
        {
          id: 'b',
          label: 'Membaca sekilas jika sedang ada waktu luang di minggu yang sama',
          nilaiSkor: 4,
        },
        {
          id: 'c',
          label: 'Membuka materi hanya menjelang tenggat pengumpulan tugas',
          nilaiSkor: 2,
        },
        {
          id: 'd',
          label: 'Menunggu diingatkan wali kelas atau orang tua terlebih dahulu',
          nilaiSkor: 1,
        },
      ],
      bobotPoin: 10,
      wajib: true,
    },

    // 2. Manajemen Waktu & Disiplin Jadwal
    {
      id: 'pm-wkt-1',
      domain: 'Manajemen Waktu & Disiplin Jadwal',
      subDimensi: 'Konsistensi Jadwal Belajar',
      tipe: 'skala_likert',
      pertanyaan:
        'Saya memiliki jadwal rutin belajar di rumah dan menepatinya walaupun tidak ada ulangan keesokan harinya.',
      opsi: likert5('Tidak Punya Jadwal', 'Jarang Ditepati', 'Kadang-kadang', 'Sering Ditepati', 'Rutin & Terjadwal'),
      bobotPoin: 10,
      wajib: true,
    },
    {
      id: 'pm-wkt-2',
      domain: 'Manajemen Waktu & Disiplin Jadwal',
      subDimensi: 'Pengendalian Distraksi Gawai',
      tipe: 'skala_likert',
      pertanyaan:
        'Saat sedang belajar, saya mampu menunda bermain game atau media sosial hingga target belajar selesai.',
      opsi: likert5('Sangat Sulit', 'Sering Terganggu', 'Cukup Terkendali', 'Terkendali', 'Sangat Disiplin'),
      bobotPoin: 10,
      wajib: true,
    },
    {
      id: 'pm-wkt-3',
      domain: 'Manajemen Waktu & Disiplin Jadwal',
      subDimensi: 'Ketepatan Tenggat Tugas',
      tipe: 'pilihan_ganda',
      pertanyaan:
        'Bagaimana kebiasaanmu menyelesaikan tugas dengan tenggat waktu 5–7 hari?',
      opsi: [
        {
          id: 'a',
          label: 'Membagi pengerjaan secara bertahap sejak hari pertama agar selesai sebelum tenggat',
          nilaiSkor: 5,
        },
        {
          id: 'b',
          label: 'Mengerjakan 2–3 hari sebelum tenggat hingga tuntas',
          nilaiSkor: 4,
        },
        {
          id: 'c',
          label: 'Mengerjakan terburu-buru pada malam terakhir sebelum dikumpulkan',
          nilaiSkor: 2,
        },
        {
          id: 'd',
          label: 'Sering melewati batas waktu karena lupa atau menunda',
          nilaiSkor: 1,
        },
      ],
      bobotPoin: 10,
      wajib: true,
    },

    // 3. Strategi Belajar & Eksekusi Tugas
    {
      id: 'pm-str-1',
      domain: 'Strategi Belajar & Eksekusi Tugas',
      subDimensi: 'Teknik Mengolah Materi',
      tipe: 'skala_likert',
      pertanyaan:
        'Saya menggunakan cara belajar aktif seperti membuat rangkuman, peta konsep, atau latihan soal sendiri—bukan sekadar membaca pasif.',
      opsi: likert5('Tidak Pernah', 'Jarang', 'Kadang-kadang', 'Sering', 'Selalu'),
      bobotPoin: 10,
      wajib: true,
    },
    {
      id: 'pm-str-2',
      domain: 'Strategi Belajar & Eksekusi Tugas',
      subDimensi: 'Kemandirian Pengerjaan',
      tipe: 'skala_likert',
      pertanyaan:
        'Saya membaca instruksi tugas secara utuh dan mencoba menyelesaikannya dengan pemahaman sendiri sebelum meminta bantuan.',
      opsi: likert5('Selalu Minta Dibantu', 'Sering Bergantung', 'Cukup Mandiri', 'Mandiri', 'Sangat Mandiri'),
      bobotPoin: 10,
      wajib: true,
    },
    {
      id: 'pm-str-3',
      domain: 'Strategi Belajar & Eksekusi Tugas',
      subDimensi: 'Penataan Lingkungan Belajar',
      tipe: 'pilihan_ganda',
      pertanyaan:
        'Jika merasa jenuh atau kehilangan fokus saat belajar sendiri, langkah apa yang kamu ambil?',
      opsi: [
        {
          id: 'a',
          label: 'Beristirahat singkat 5–10 menit, mengganti teknik belajar, lalu melanjutkan target semula',
          nilaiSkor: 5,
        },
        {
          id: 'b',
          label: 'Berpindah ke mata pelajaran lain yang lebih ringan terlebih dahulu lalu kembali lagi',
          nilaiSkor: 4,
        },
        {
          id: 'c',
          label: 'Langsung berhenti belajar dan membuka ponsel cukup lama',
          nilaiSkor: 2,
        },
        {
          id: 'd',
          label: 'Menutup buku dan meninggalkan tugas hingga esok hari',
          nilaiSkor: 1,
        },
      ],
      bobotPoin: 10,
      wajib: true,
    },

    // 4. Pencarian Sumber & Literasi Digital
    {
      id: 'pm-smb-1',
      domain: 'Pencarian Sumber & Literasi Digital',
      subDimensi: 'Eksplorasi Sumber Belajar',
      tipe: 'skala_likert',
      pertanyaan:
        'Jika penjelasan di buku/modul belum cukup, saya mencari sumber tambahan (video edukasi, buku perpustakaan, atau catatan lain) secara mandiri.',
      opsi: likert5('Tidak Pernah', 'Jarang', 'Kadang-kadang', 'Sering', 'Selalu Aktif'),
      bobotPoin: 10,
      wajib: true,
    },
    {
      id: 'pm-smb-2',
      domain: 'Pencarian Sumber & Literasi Digital',
      subDimensi: 'Kejujuran Akademik Digital',
      tipe: 'skala_likert',
      pertanyaan:
        'Saat menggunakan internet untuk belajar, saya menyaring kebenaran informasi dan menuliskannya dengan bahasa sendiri tanpa menyalin mentah.',
      opsi: likert5('Sering Menyalin Langsung', 'Masih Menyalin', 'Kadang Menyaring', 'Sering Mengolah Sendiri', 'Selalu Mengolah & Kritis'),
      bobotPoin: 10,
      wajib: true,
    },
    {
      id: 'pm-smb-3',
      domain: 'Pencarian Sumber & Literasi Digital',
      subDimensi: 'Strategi Bertanya Terarah',
      tipe: 'pilihan_ganda',
      pertanyaan:
        'Ketika mengalami kebuntuan pada satu soal atau konsep yang sulit, apa yang kamu lakukan?',
      opsi: [
        {
          id: 'a',
          label: 'Menandai bagian yang tidak dipahami, mencari contoh serupa, lalu bertanya secara spesifik kepada guru/teman',
          nilaiSkor: 5,
        },
        {
          id: 'b',
          label: 'Langsung bertanya kepada guru/teman bagian mana yang benar',
          nilaiSkor: 3,
        },
        {
          id: 'c',
          label: 'Menyalin jawaban teman tanpa memahami prosesnya',
          nilaiSkor: 1,
        },
        {
          id: 'd',
          label: 'Membiarkan soal kosong tanpa mencari tahu lagi',
          nilaiSkor: 1,
        },
      ],
      bobotPoin: 10,
      wajib: true,
    },

    // 5. Evaluasi Diri & Refleksi Kesalahan
    {
      id: 'pm-evl-1',
      domain: 'Evaluasi Diri & Refleksi Kesalahan',
      subDimensi: 'Koreksi Mandiri Sebelum Kumpul',
      tipe: 'skala_likert',
      pertanyaan:
        'Saya memeriksa kembali pekerjaan/jawaban saya sebelum dikumpulkan untuk memastikan kelengkapan dan ketepatan langkahnya.',
      opsi: likert5('Tidak Pernah', 'Jarang', 'Kadang-kadang', 'Sering', 'Selalu'),
      bobotPoin: 10,
      wajib: true,
    },
    {
      id: 'pm-evl-2',
      domain: 'Evaluasi Diri & Refleksi Kesalahan',
      subDimensi: 'Pemanfaatan Umpan Balik Guru',
      tipe: 'skala_likert',
      pertanyaan:
        'Ketika nilai tugas atau ulangan belum memuaskan, saya mempelajari kembali letak kesalahan dan memperbaikinya.',
      opsi: likert5('Mengabaikan Nilai', 'Jarang Mengecek', 'Kadang Memperbaiki', 'Sering Refleksi', 'Selalu Evaluasi & Perbaiki'),
      bobotPoin: 10,
      wajib: true,
    },
    {
      id: 'pm-evl-3',
      domain: 'Evaluasi Diri & Refleksi Kesalahan',
      subDimensi: 'Kesadaran Kekuatan & Kelemahan',
      tipe: 'skala_likert',
      pertanyaan:
        'Saya mengetahui dengan jelas topik/mata pelajaran mana yang sudah saya kuasai dan mana yang masih memerlukan latihan ekstra.',
      opsi: likert5('Tidak Tahu Sama Sekali', 'Kurang Paham', 'Cukup Tahu', 'Tahu Jelas', 'Sangat Sadar & Punya Rencana'),
      bobotPoin: 10,
      wajib: true,
    },

    // 6. Resiliensi & Ketekunan Belajar
    {
      id: 'pm-res-1',
      domain: 'Resiliensi & Ketekunan Belajar',
      subDimensi: 'Daya Tahan Menghadapi Materi Sulit',
      tipe: 'skala_likert',
      pertanyaan:
        'Saya tetap bertahan mencoba beberapa pendekatan berbeda ketika menemukan soal atau proyek yang terasa menantang.',
      opsi: likert5('Langsung Menyerah', 'Mudah Putus Asa', 'Cukup Bertahan', 'Tekun Mencoba', 'Sangat Tangguh & Pantang Menyerah'),
      bobotPoin: 10,
      wajib: true,
    },
    {
      id: 'pm-res-2',
      domain: 'Resiliensi & Ketekunan Belajar',
      subDimensi: 'Pengelolaan Rasa Cemas Belajar',
      tipe: 'skala_likert',
      pertanyaan:
        'Kegagalan atau nilai kurang baik memicu saya untuk memperbaiki strategi belajar, bukan membuat saya berhenti berusaha.',
      opsi: likert5('Berhenti Berusaha', 'Sangat Terpuruk', 'Cukup Bangkit', 'Cepat Bangkit', 'Menjadikan Umpan Balik Pertumbuhan'),
      bobotPoin: 10,
      wajib: true,
    },
    {
      id: 'pm-res-3',
      domain: 'Resiliensi & Ketekunan Belajar',
      subDimensi: 'Komitmen Menuntaskan Target',
      tipe: 'isian_singkat',
      pertanyaan:
        'Tuliskan satu kebiasaan belajar mandiri yang sudah berjalan baik pada dirimu dan satu target kemandirian belajar yang ingin kamu tingkatkan semester ini:',
      opsi: [],
      bobotPoin: 0,
      wajib: false,
    },
  ];
}

export function buildLiterasiKeluargaSurveyQuestions(): SurveyQuestion[] {
  return [
    // Domain 1: Ketersediaan Pojok Baca & Koleksi Buku
    {
      id: 'lit-pj-1',
      domain: 'Ketersediaan Pojok Baca & Koleksi Buku',
      tipe: 'pilihan_ganda',
      pertanyaan:
        'Apakah di rumah saat ini tersedia pojok baca atau area khusus yang tenang & terang untuk anak membaca buku?',
      opsi: [
        {
          id: 'a',
          label: 'Ya, tersedia pojok baca khusus yang tertata rapi, nyaman, dan mudah dijangkau anak',
          nilaiSkor: 5,
          traitTag: 'Tersedia Khusus & Tertata',
        },
        {
          id: 'b',
          label: 'Ada rak/meja belajar bersama yang juga digunakan untuk menyimpan buku bacaan',
          nilaiSkor: 4,
          traitTag: 'Tersedia Bersama Meja Belajar',
        },
        {
          id: 'c',
          label: 'Belum ada pojok baca khusus, buku masih disimpan tercampur di lemari/tas',
          nilaiSkor: 2,
          traitTag: 'Belum Tertata Khusus',
        },
        {
          id: 'd',
          label: 'Belum tersedia area baca maupun tempat penyimpanan buku anak di rumah',
          nilaiSkor: 1,
          traitTag: 'Belum Tersedia',
        },
      ],
      wajib: true,
    },
    {
      id: 'lit-pj-2',
      domain: 'Ketersediaan Pojok Baca & Koleksi Buku',
      tipe: 'pilihan_ganda',
      pertanyaan:
        'Berapa perkiraan jumlah buku bacaan non-pelajaran (cerita, ensiklopedia, komik edukasi, buku agama/sains populer) yang tersedia di rumah?',
      opsi: [
        { id: 'a', label: 'Lebih dari 30 judul buku', nilaiSkor: 5, traitTag: '> 30 Buku' },
        { id: 'b', label: '15 – 30 judul buku', nilaiSkor: 4, traitTag: '15–30 Buku' },
        { id: 'c', label: '5 – 14 judul buku', nilaiSkor: 3, traitTag: '5–14 Buku' },
        { id: 'd', label: 'Kurang dari 5 buku / hampir belum ada', nilaiSkor: 1, traitTag: '< 5 Buku' },
      ],
      wajib: true,
    },
    {
      id: 'lit-pj-3',
      domain: 'Ketersediaan Pojok Baca & Koleksi Buku',
      tipe: 'pg_kompleks',
      pertanyaan:
        'Jenis bahan bacaan apa saja yang tersedia dan dapat diakses anak di rumah? (Boleh pilih lebih dari satu)',
      opsi: [
        { id: 'a', label: 'Buku cerita / fiksi anak & remaja', nilaiSkor: 5 },
        { id: 'b', label: 'Ensiklopedia / pengetahuan populer / sains', nilaiSkor: 5 },
        { id: 'c', label: 'Buku keagamaan / kisah keteladanan / karakter', nilaiSkor: 5 },
        { id: 'd', label: 'Majalah / koran anak / artikel digital terkurasi', nilaiSkor: 5 },
        { id: 'e', label: 'Hanya buku paket/LKS pelajaran sekolah', nilaiSkor: 2 },
      ],
      wajib: true,
    },

    // Domain 2: Rutinitas & Durasi Membaca di Rumah
    {
      id: 'lit-rt-1',
      domain: 'Rutinitas & Durasi Membaca di Rumah',
      tipe: 'pilihan_ganda',
      pertanyaan:
        'Seberapa sering anak melakukan kegiatan membaca di luar tugas wajib sekolah dalam sepekan?',
      opsi: [
        { id: 'a', label: 'Setiap hari (6–7 hari/pekan)', nilaiSkor: 5, traitTag: 'Setiap Hari (6–7x/pekan)' },
        { id: 'b', label: 'Rutin 3–5 hari/pekan', nilaiSkor: 4, traitTag: '3–5 hari/pekan' },
        { id: 'c', label: 'Kadang-kadang 1–2 hari/pekan', nilaiSkor: 3, traitTag: '1–2 hari/pekan' },
        { id: 'd', label: 'Jarang sekali / hampir tidak pernah', nilaiSkor: 1, traitTag: 'Jarang (< 1x/pekan)' },
      ],
      wajib: true,
    },
    {
      id: 'lit-rt-2',
      domain: 'Rutinitas & Durasi Membaca di Rumah',
      tipe: 'pilihan_ganda',
      pertanyaan:
        'Rata-rata durasi anak membaca buku/bacaan pilihan sendiri dalam satu kali sesi di rumah adalah...',
      opsi: [
        { id: 'a', label: 'Lebih dari 30 menit per sesi', nilaiSkor: 5 },
        { id: 'b', label: '15 – 30 menit per sesi', nilaiSkor: 4 },
        { id: 'c', label: '5 – 15 menit per sesi', nilaiSkor: 3 },
        { id: 'd', label: 'Kurang dari 5 menit / mudah terdistraksi', nilaiSkor: 1 },
      ],
      wajib: true,
    },
    {
      id: 'lit-rt-3',
      domain: 'Rutinitas & Durasi Membaca di Rumah',
      tipe: 'skala_likert',
      pertanyaan:
        'Keluarga memiliki waktu baca bersama (misalnya 15 menit sebelum tidur atau akhir pekan) secara konsisten.',
      opsi: [
        { id: '1', label: '1 · Belum Pernah Dilakukan', nilaiSkor: 1 },
        { id: '2', label: '2 · Sangat Jarang', nilaiSkor: 2 },
        { id: '3', label: '3 · Kadang-kadang', nilaiSkor: 3 },
        { id: '4', label: '4 · Rutin Mingguan', nilaiSkor: 4 },
        { id: '5', label: '5 · Rutin Hampir Setiap Hari', nilaiSkor: 5 },
      ],
      wajib: true,
    },

    // Domain 3: Kegiatan Literasi Aktif Keluarga
    {
      id: 'lit-ak-1',
      domain: 'Kegiatan Literasi Aktif Keluarga',
      tipe: 'pg_kompleks',
      pertanyaan:
        'Kegiatan literasi apa saja yang pernah/rutin dilakukan bersama anak di rumah selama 1 bulan terakhir? (Pilih semua yang sesuai)',
      opsi: [
        { id: 'a', label: 'Membaca nyaring (read-aloud) atau bergantian membaca cerita', nilaiSkor: 5 },
        { id: 'b', label: 'Berdiskusi & menceritakan kembali isi buku atau berita yang dibaca', nilaiSkor: 5 },
        { id: 'c', label: 'Menulis buku harian, ringkasan bacaan, atau daftar kosakata baru', nilaiSkor: 5 },
        { id: 'd', label: 'Mengunjungi perpustakaan umum, Taman Bacaan Masyarakat (TBM), atau toko buku', nilaiSkor: 5 },
        { id: 'e', label: 'Belum ada kegiatan literasi bersama yang dilakukan di rumah', nilaiSkor: 1 },
      ],
      wajib: true,
    },
    {
      id: 'lit-ak-2',
      domain: 'Kegiatan Literasi Aktif Keluarga',
      tipe: 'skala_likert',
      pertanyaan:
        'Orang tua mengajak anak berdiskusi tentang makna, pesan moral, atau menghubungkan isi bacaan dengan kehidupan sehari-hari.',
      opsi: [
        { id: '1', label: '1 · Tidak Pernah', nilaiSkor: 1 },
        { id: '2', label: '2 · Jarang', nilaiSkor: 2 },
        { id: '3', label: '3 · Kadang-kadang', nilaiSkor: 3 },
        { id: '4', label: '4 · Sering', nilaiSkor: 4 },
        { id: '5', label: '5 · Selalu Mendiskusikan', nilaiSkor: 5 },
      ],
      wajib: true,
    },
    {
      id: 'lit-ak-3',
      domain: 'Kegiatan Literasi Aktif Keluarga',
      tipe: 'skala_likert',
      pertanyaan:
        'Anak didorong mengekspresikan ide secara tertulis (catatan harian, surat, komik mini, atau ringkasan proyek) di luar tugas sekolah.',
      opsi: [
        { id: '1', label: '1 · Tidak Pernah', nilaiSkor: 1 },
        { id: '2', label: '2 · Jarang', nilaiSkor: 2 },
        { id: '3', label: '3 · Kadang-kadang', nilaiSkor: 3 },
        { id: '4', label: '4 · Sering', nilaiSkor: 4 },
        { id: '5', label: '5 · Sangat Rutin', nilaiSkor: 5 },
      ],
      wajib: true,
    },

    // Domain 4: Keteladanan & Ekosistem Bebas Gawai
    {
      id: 'lit-gw-1',
      domain: 'Keteladanan & Ekosistem Bebas Gawai',
      tipe: 'skala_likert',
      pertanyaan:
        'Orang tua/anggota keluarga dewasa memberi contoh nyata membaca buku atau bahan bacaan bermutu di hadapan anak.',
      opsi: [
        { id: '1', label: '1 · Belum Menjadi Kebiasaan', nilaiSkor: 1 },
        { id: '2', label: '2 · Jarang Terlihat Anak', nilaiSkor: 2 },
        { id: '3', label: '3 · Kadang-kadang', nilaiSkor: 3 },
        { id: '4', label: '4 · Sering', nilaiSkor: 4 },
        { id: '5', label: '5 · Teladan Harian Keluarga', nilaiSkor: 5 },
      ],
      wajib: true,
    },
    {
      id: 'lit-gw-2',
      domain: 'Keteladanan & Ekosistem Bebas Gawai',
      tipe: 'skala_likert',
      pertanyaan:
        'Keluarga menerapkan aturan pembatasan gawai/TV/game pada jam belajar & membaca malam hari secara konsisten.',
      opsi: [
        { id: '1', label: '1 · Tidak Ada Pembatasan', nilaiSkor: 1 },
        { id: '2', label: '2 · Ada Aturan Tapi Jarang Dipatuhi', nilaiSkor: 2 },
        { id: '3', label: '3 · Cukup Dipatuhi', nilaiSkor: 3 },
        { id: '4', label: '4 · Konsisten dengan Pengawasan', nilaiSkor: 4 },
        { id: '5', label: '5 · Sangat Konsisten & Disepakati Bersama', nilaiSkor: 5 },
      ],
      wajib: true,
    },

    // Domain 5: Dukungan & Aspirasi Literasi Sekolah
    {
      id: 'lit-dk-1',
      domain: 'Dukungan & Aspirasi Literasi Sekolah',
      tipe: 'pg_kompleks',
      pertanyaan:
        'Bentuk dukungan literasi apa yang paling dibutuhkan keluarga dari sekolah/PKBM untuk memperkuat budaya baca di rumah?',
      opsi: [
        { id: 'a', label: 'Peminjaman rutin buku bacaan dari perpustakaan/pojok baca sekolah', nilaiSkor: 5 },
        { id: 'b', label: 'Daftar rekomendasi judul buku sesuai usia dan minat anak', nilaiSkor: 5 },
        { id: 'c', label: 'Panduan praktis orang tua mendampingi anak membaca & diskusi buku', nilaiSkor: 5 },
        { id: 'd', label: 'Tantangan/jurnal literasi mingguan antara orang tua, siswa, dan wali kelas', nilaiSkor: 5 },
      ],
      wajib: true,
    },
    {
      id: 'lit-dk-2',
      domain: 'Dukungan & Aspirasi Literasi Sekolah',
      tipe: 'isian_singkat',
      pertanyaan:
        'Ceritakan topik bacaan favorit anak saat ini serta kendala utama (jika ada) dalam membangun kebiasaan membaca di rumah:',
      opsi: [],
      wajib: false,
    },
  ];
}

export function buildDefaultSurveyPackages(
  schoolId: string,
  tahunAjaran: string,
  semester: '1' | '2'
): SurveyPackage[] {
  const now = new Date().toISOString();
  return [
    {
      id: `srvpkg-literasi-${schoolId}`,
      schoolId,
      kodePaket: 'SRV-LITKEL-01',
      judul: 'Survei Ekosistem Literasi Keluarga & Kebiasaan Membaca di Rumah',
      deskripsi:
        'Memetakan ketersediaan pojok baca keluarga, koleksi buku non-pelajaran, rutinitas membaca, kegiatan literasi aktif orang tua-anak, pengelolaan gawai, serta kebutuhan dukungan dari sekolah.',
      kategori: 'Literasi Keluarga',
      targetKelasList: [],
      status: 'Dirilis',
      isTemplateBuiltIn: true,
      pertanyaan: buildLiterasiKeluargaSurveyQuestions(),
      tahunAjaran,
      semester,
      createdByName: 'Pengurus Lembaga',
      releasedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function evaluateSurveyResponse(
  pkg: SurveyPackage,
  answers: DiagnosticAnswer[]
): Pick<
  SurveyResponse,
  | 'indeksLiterasi'
  | 'kategoriLiterasi'
  | 'adaPojokBaca'
  | 'jumlahBukuRumah'
  | 'frekuensiMembaca'
  | 'domainScores'
  | 'rekomendasiTindakLanjut'
> {
  const answerMap = new Map(answers.map((a) => [a.questionId, a]));
  const domainBuckets = new Map<string, number[]>();

  let adaPojokBaca: string | undefined;
  let jumlahBukuRumah: string | undefined;
  let frekuensiMembaca: string | undefined;

  for (const q of pkg.pertanyaan) {
    const ans = answerMap.get(q.id);
    if (!ans) continue;

    if (q.id === 'lit-pj-1') {
      const picked = q.opsi.find((o) => o.id === ans.selectedOptionId);
      adaPojokBaca = picked?.traitTag || picked?.label;
    } else if (q.id === 'lit-pj-2') {
      const picked = q.opsi.find((o) => o.id === ans.selectedOptionId);
      jumlahBukuRumah = picked?.traitTag || picked?.label;
    } else if (q.id === 'lit-rt-1') {
      const picked = q.opsi.find((o) => o.id === ans.selectedOptionId);
      frekuensiMembaca = picked?.traitTag || picked?.label;
    }

    if (q.tipe === 'isian_singkat') continue;

    let itemScore = 0;
    if (q.tipe === 'pg_kompleks') {
      const ids = Array.isArray(ans.selectedOptionIds) ? ans.selectedOptionIds : [];
      const positiveOpts = q.opsi.filter((o) => (o.nilaiSkor ?? 5) >= 3);
      const pickedOpts = q.opsi.filter((o) => ids.includes(o.id));
      const hasNegativeOnly = pickedOpts.length > 0 && pickedOpts.every((o) => (o.nilaiSkor ?? 5) <= 2);
      if (hasNegativeOnly) {
        itemScore = 1.5;
      } else if (positiveOpts.length > 0) {
        const matchedPos = pickedOpts.filter((o) => (o.nilaiSkor ?? 5) >= 3).length;
        // Selecting >= 2 active practices yields strong score (3..5), 1 yields 3
        itemScore = matchedPos === 0 ? 1 : Math.min(5, 2 + Math.round((matchedPos / Math.min(3, positiveOpts.length)) * 3));
      }
    } else {
      const picked = q.opsi.find((o) => o.id === ans.selectedOptionId);
      const maxOpt = Math.max(...q.opsi.map((o) => o.nilaiSkor ?? 5), 5);
      const rawVal = picked?.nilaiSkor ?? (typeof ans.scaleValue === 'number' ? ans.scaleValue : 0);
      itemScore = rawVal > 0 ? (rawVal / maxOpt) * 5 : 0;
    }

    if (itemScore > 0) {
      const arr = domainBuckets.get(q.domain) || [];
      arr.push(itemScore);
      domainBuckets.set(q.domain, arr);
    }
  }

  const domainScores: SurveyDomainScore[] = [];
  let sumAll = 0;
  let cntAll = 0;
  const weakDomains: string[] = [];

  for (const [domain, values] of domainBuckets.entries()) {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const skorPersen = Math.min(100, Math.max(0, Math.round((avg / 5) * 100)));
    const kategori: SurveyDomainScore['kategori'] =
      skorPersen >= 78 ? 'Sangat Baik' : skorPersen >= 58 ? 'Cukup Baik' : 'Perlu Penguatan';
    let ringkasan = 'Dukungan lingkungan rumah pada dimensi ini sudah sangat baik.';
    if (kategori === 'Cukup Baik') {
      ringkasan = 'Berjalan cukup baik, dapat ditingkatkan dengan pembiasaan rutin bersama keluarga.';
    } else if (kategori === 'Perlu Penguatan') {
      ringkasan = 'Perlu intervensi kolaboratif sekolah-keluarga (pinjam buku / panduan membaca rumah).';
      weakDomains.push(`${domain} (${skorPersen}%)`);
    }
    domainScores.push({ domain, skorPersen, kategori, ringkasan });
    sumAll += skorPersen;
    cntAll++;
  }

  const indeksLiterasi = cntAll > 0 ? Math.round(sumAll / cntAll) : 0;
  const kategoriLiterasi: SurveyResponse['kategoriLiterasi'] =
    indeksLiterasi >= 80
      ? 'Ekosistem Literasi Sangat Mendukung'
      : indeksLiterasi >= 60
        ? 'Cukup Mendukung'
        : 'Perlu Penguatan Literasi Rumah';

  const rekParts = [
    `Indeks Literasi Keluarga tercatat ${indeksLiterasi}% (${kategoriLiterasi}).`,
  ];
  if (weakDomains.length > 0) {
    rekParts.push(
      `Prioritas penguatan bersama wali kelas/guru: ${weakDomains.join(', ')}. Rekomendasikan program pinjam buku mingguan & sudut baca sederhana di rumah.`
    );
  } else {
    rekParts.push(
      'Pertahankan budaya membaca bersama dan libatkan anak dalam klub/proyek literasi sekolah.'
    );
  }

  return {
    indeksLiterasi,
    kategoriLiterasi,
    adaPojokBaca,
    jumlahBukuRumah,
    frekuensiMembaca,
    domainScores,
    rekomendasiTindakLanjut: rekParts.join(' '),
  };
}

export function buildNonAkademikDiagnosticQuestions(): DiagnosticQuestion[] {
  return [
    // 1. Psikologis (4 items)
    {
      id: 'na-psi-1',
      domain: 'Psikologis',
      subDimensi: 'Motivasi & Ketahanan Belajar',
      tipe: 'skala_likert',
      pertanyaan:
        'Saya merasa bersemangat dan memiliki tujuan jelas saat mengikuti pembelajaran di sekolah/PKBM.',
      opsi: [
        { id: '1', label: '1 · Sangat Tidak Setuju', nilaiSkor: 1 },
        { id: '2', label: '2 · Tidak Setuju', nilaiSkor: 2 },
        { id: '3', label: '3 · Cukup Setuju', nilaiSkor: 3 },
        { id: '4', label: '4 · Setuju', nilaiSkor: 4 },
        { id: '5', label: '5 · Sangat Setuju', nilaiSkor: 5 },
      ],
      bobotPoin: 5,
      wajib: true,
    },
    {
      id: 'na-psi-2',
      domain: 'Psikologis',
      subDimensi: 'Ketenangan Menghadapi Tantangan',
      tipe: 'skala_likert',
      pertanyaan:
        'Ketika menghadapi soal ujian atau materi yang sulit, saya mampu tetap tenang dan mencari cara penyelesaian tanpa panik berlebihan.',
      opsi: [
        { id: '1', label: '1 · Sangat Jarang', nilaiSkor: 1 },
        { id: '2', label: '2 · Jarang', nilaiSkor: 2 },
        { id: '3', label: '3 · Kadang-kadang', nilaiSkor: 3 },
        { id: '4', label: '4 · Sering', nilaiSkor: 4 },
        { id: '5', label: '5 · Selalu', nilaiSkor: 5 },
      ],
      bobotPoin: 5,
      wajib: true,
    },
    {
      id: 'na-psi-3',
      domain: 'Psikologis',
      subDimensi: 'Kualitas Tidur & Energi',
      tipe: 'pilihan_ganda',
      pertanyaan:
        'Bagaimana perasaan dan tingkat konsentrasi Anda selama mengikuti pelajaran pagi hingga siang hari dalam 2 minggu terakhir?',
      opsi: [
        { id: 'a', label: 'Sangat segar, fokus penuh, dan antusias', nilaiSkor: 5 },
        { id: 'b', label: 'Cukup baik, sesekali lelah di jam terakhir', nilaiSkor: 4 },
        { id: 'c', label: 'Mudah mengantuk atau pikiran sering melayang', nilaiSkor: 2 },
        { id: 'd', label: 'Merasa tertekan, cemas, atau sangat lelah setiap hari', nilaiSkor: 1 },
      ],
      bobotPoin: 5,
      wajib: true,
    },
    {
      id: 'na-psi-4',
      domain: 'Psikologis',
      subDimensi: 'Kepercayaan Diri',
      tipe: 'skala_likert',
      pertanyaan:
        'Saya yakin kemampuan belajar saya dapat terus berkembang apabila saya berlatih secara konsisten.',
      opsi: [
        { id: '1', label: '1 · Sangat Tidak Yakin', nilaiSkor: 1 },
        { id: '2', label: '2 · Kurang Yakin', nilaiSkor: 2 },
        { id: '3', label: '3 · Netral', nilaiSkor: 3 },
        { id: '4', label: '4 · Yakin', nilaiSkor: 4 },
        { id: '5', label: '5 · Sangat Yakin', nilaiSkor: 5 },
      ],
      bobotPoin: 5,
      wajib: true,
    },

    // 2. Sosial-Emosional (4 items)
    {
      id: 'na-sel-1',
      domain: 'Sosial-Emosional',
      subDimensi: 'Interaksi & Kerjasama Teman',
      tipe: 'skala_likert',
      pertanyaan:
        'Saya merasa nyaman berdiskusi, bekerja dalam kelompok, dan menghargai pendapat teman sebaya.',
      opsi: [
        { id: '1', label: '1 · Sangat Tidak Nyaman', nilaiSkor: 1 },
        { id: '2', label: '2 · Kurang Nyaman', nilaiSkor: 2 },
        { id: '3', label: '3 · Cukup Nyaman', nilaiSkor: 3 },
        { id: '4', label: '4 · Nyaman', nilaiSkor: 4 },
        { id: '5', label: '5 · Sangat Nyaman', nilaiSkor: 5 },
      ],
      bobotPoin: 5,
      wajib: true,
    },
    {
      id: 'na-sel-2',
      domain: 'Sosial-Emosional',
      subDimensi: 'Regulasi Emosi',
      tipe: 'pilihan_ganda',
      pertanyaan:
        'Saat terjadi perbedaan pendapat atau kekecewaan dengan teman maupun guru, tindakan apa yang paling sering Anda lakukan?',
      opsi: [
        { id: 'a', label: 'Menenangkan diri lalu berbicara baik-baik mencari solusi', nilaiSkor: 5 },
        { id: 'b', label: 'Diam sejenak lalu menceritakan ke guru/wali kelas', nilaiSkor: 4 },
        { id: 'c', label: 'Memendam perasaan dan menarik diri dari kelompok', nilaiSkor: 2 },
        { id: 'd', label: 'Langsung marah atau meninggalkan kegiatan belajar', nilaiSkor: 1 },
      ],
      bobotPoin: 5,
      wajib: true,
    },
    {
      id: 'na-sel-3',
      domain: 'Sosial-Emosional',
      subDimensi: 'Keberanian Bertanya',
      tipe: 'skala_likert',
      pertanyaan:
        'Saya berani bertanya kepada guru atau wali kelas jika ada materi pelajaran atau tugas yang belum saya pahami.',
      opsi: [
        { id: '1', label: '1 · Tidak Pernah', nilaiSkor: 1 },
        { id: '2', label: '2 · Jarang', nilaiSkor: 2 },
        { id: '3', label: '3 · Kadang-kadang', nilaiSkor: 3 },
        { id: '4', label: '4 · Sering', nilaiSkor: 4 },
        { id: '5', label: '5 · Selalu', nilaiSkor: 5 },
      ],
      bobotPoin: 5,
      wajib: true,
    },
    {
      id: 'na-sel-4',
      domain: 'Sosial-Emosional',
      subDimensi: 'Rasa Aman di Lingkungan Sekolah',
      tipe: 'skala_likert',
      pertanyaan:
        'Saya merasa diterima, aman, dan bebas dari perundungan di lingkungan kelas maupun satuan pendidikan.',
      opsi: [
        { id: '1', label: '1 · Tidak Aman', nilaiSkor: 1 },
        { id: '2', label: '2 · Kurang Aman', nilaiSkor: 2 },
        { id: '3', label: '3 · Cukup Aman', nilaiSkor: 3 },
        { id: '4', label: '4 · Aman', nilaiSkor: 4 },
        { id: '5', label: '5 · Sangat Aman', nilaiSkor: 5 },
      ],
      bobotPoin: 5,
      wajib: true,
    },

    // 3. Gaya Belajar (Visual / Auditori / Kinestetik — 3 items)
    {
      id: 'na-gb-1',
      domain: 'Gaya Belajar',
      subDimensi: 'Cara Memahami Materi Baru',
      tipe: 'pilihan_ganda',
      pertanyaan: 'Saat mempelajari topik baru, cara mana yang paling cepat membuat Anda paham?',
      opsi: [
        { id: 'v', label: 'Melihat gambar, diagram, peta konsep, warna, atau membaca catatan rapi', traitTag: 'Visual', nilaiSkor: 5 },
        { id: 'a', label: 'Mendengarkan penjelasan guru, diskusi tanya jawab, atau audio', traitTag: 'Auditori', nilaiSkor: 5 },
        { id: 'k', label: 'Mempraktikkan langsung, eksperimen, bergerak, atau membuat karya fisik', traitTag: 'Kinestetik', nilaiSkor: 5 },
      ],
      bobotPoin: 5,
      wajib: true,
    },
    {
      id: 'na-gb-2',
      domain: 'Gaya Belajar',
      subDimensi: 'Strategi Mengingat Pelajaran',
      tipe: 'pilihan_ganda',
      pertanyaan: 'Ketika mengulang materi untuk persiapan ujian, aktivitas apa yang paling membantu?',
      opsi: [
        { id: 'v', label: 'Membuat ringkasan berwarna, mind-map, atau menonton infografis', traitTag: 'Visual', nilaiSkor: 5 },
        { id: 'a', label: 'Membaca dengan suara pelan atau berdiskusi saling tanya dengan teman', traitTag: 'Auditori', nilaiSkor: 5 },
        { id: 'k', label: 'Mengerjakan soal latihan simulasi sambil berjalan/menggunakan alat peraga', traitTag: 'Kinestetik', nilaiSkor: 5 },
      ],
      bobotPoin: 5,
      wajib: true,
    },
    {
      id: 'na-gb-3',
      domain: 'Gaya Belajar',
      subDimensi: 'Preferensi Instruksi Tugas',
      tipe: 'pilihan_ganda',
      pertanyaan: 'Petunjuk tugas seperti apa yang paling Anda sukai dari guru?',
      opsi: [
        { id: 'v', label: 'Contoh hasil jadi tertulis lengkap beserta bagan langkah kerja', traitTag: 'Visual', nilaiSkor: 5 },
        { id: 'a', label: 'Penjelasan lisan langkah demi langkah di depan kelas', traitTag: 'Auditori', nilaiSkor: 5 },
        { id: 'k', label: 'Demonstrasi langsung lalu langsung mencoba di tempat', traitTag: 'Kinestetik', nilaiSkor: 5 },
      ],
      bobotPoin: 5,
      wajib: true,
    },

    // 4. Minat & Bakat (3 items)
    {
      id: 'na-minat-1',
      domain: 'Minat & Bakat',
      subDimensi: 'Bidang Ketertarikan Utama',
      tipe: 'pilihan_ganda',
      pertanyaan: 'Bidang kegiatan atau mata pelajaran apa yang paling Anda nantikan dan gemari?',
      opsi: [
        { id: 'sains', label: 'Matematika, Sains, Eksperimen Alam & Logika', traitTag: 'Sains & Analitis', nilaiSkor: 5 },
        { id: 'tech', label: 'Komputer, Desain Digital, Coding & Teknologi', traitTag: 'Teknologi & Digital', nilaiSkor: 5 },
        { id: 'lit', label: 'Menulis Cerita, Bahasa, Komunikasi & Public Speaking', traitTag: 'Bahasa & Literasi', nilaiSkor: 5 },
        { id: 'art', label: 'Seni Rupa, Musik, Prakarya & Proyek Kreatif', traitTag: 'Seni & Kreativitas', nilaiSkor: 5 },
        { id: 'soc', label: 'Kewirausahaan, Organisasi Sosial, Olahraga & Kepemimpinan', traitTag: 'Sosial & Kewirausahaan', nilaiSkor: 5 },
      ],
      bobotPoin: 5,
      wajib: true,
    },
    {
      id: 'na-minat-2',
      domain: 'Minat & Bakat',
      subDimensi: 'Kegiatan Waktu Luang',
      tipe: 'pilihan_ganda',
      pertanyaan: 'Saat memiliki waktu luang di luar jam belajar wajib, kegiatan produktif apa yang sering Anda pilih?',
      opsi: [
        { id: 'a', label: 'Membaca buku/artikel atau menulis catatan kreatif', traitTag: 'Bahasa & Literasi', nilaiSkor: 5 },
        { id: 'b', label: 'Menggambar, membuat kerajinan, atau memainkan alat musik', traitTag: 'Seni & Kreativitas', nilaiSkor: 5 },
        { id: 'c', label: 'Mengulik aplikasi, video edukasi teknologi, atau desain grafis', traitTag: 'Teknologi & Digital', nilaiSkor: 5 },
        { id: 'd', label: 'Berolahraga, berdagang kecil-kecilan, atau kegiatan sosial/remaja', traitTag: 'Sosial & Kewirausahaan', nilaiSkor: 5 },
      ],
      bobotPoin: 5,
      wajib: true,
    },
    {
      id: 'na-minat-3',
      domain: 'Minat & Bakat',
      subDimensi: 'Cita-cita & Rencana Studi',
      tipe: 'isian_singkat',
      pertanyaan:
        'Tuliskan cita-cita, keterampilan yang ingin Anda kuasai tahun ini, atau ekskul/proyek yang Anda minati:',
      opsi: [],
      bobotPoin: 5,
      wajib: false,
    },

    // 5. Aktivitas di Rumah (4 items)
    {
      id: 'na-rumah-1',
      domain: 'Aktivitas di Rumah',
      subDimensi: 'Durasi Belajar Mandiri',
      tipe: 'pilihan_ganda',
      pertanyaan: 'Berapa lama rata-rata Anda mengulang pelajaran atau mengerjakan tugas di rumah setiap hari?',
      opsi: [
        { id: 'a', label: 'Lebih dari 90 menit dengan jadwal teratur', nilaiSkor: 5 },
        { id: 'b', label: '45 – 90 menit per hari', nilaiSkor: 4 },
        { id: 'c', label: '15 – 45 menit (hanya jika ada PR)', nilaiSkor: 3 },
        { id: 'd', label: 'Hampir tidak sempat belajar di rumah karena kesibukan lain', nilaiSkor: 1 },
      ],
      bobotPoin: 5,
      wajib: true,
    },
    {
      id: 'na-rumah-2',
      domain: 'Aktivitas di Rumah',
      subDimensi: 'Suasana Tempat Belajar',
      tipe: 'pilihan_ganda',
      pertanyaan: 'Bagaimana kondisi tempat belajar Anda di rumah saat malam/sore hari?',
      opsi: [
        { id: 'a', label: 'Tenang, terang, memiliki meja belajar khusus', nilaiSkor: 5 },
        { id: 'b', label: 'Cukup kondusif di ruang keluarga meski berbagi ruangan', nilaiSkor: 4 },
        { id: 'c', label: 'Kurang tenang / pencahayaan terbatas', nilaiSkor: 2 },
        { id: 'd', label: 'Sulit berkonsentrasi karena bising atau harus bekerja membantu rumah', nilaiSkor: 1 },
      ],
      bobotPoin: 5,
      wajib: true,
    },
    {
      id: 'na-rumah-3',
      domain: 'Aktivitas di Rumah',
      subDimensi: 'Tanggung Jawab Pekerjaan/Domestik',
      tipe: 'pilihan_ganda',
      pertanyaan: 'Selain belajar, aktivitas apa yang rutin Anda lakukan di rumah sepulang sekolah?',
      opsi: [
        { id: 'a', label: 'Membantu pekerjaan rumah ringan dan tetap punya waktu istirahat cukup', nilaiSkor: 5 },
        { id: 'b', label: 'Mengikuti kursus/les atau kegiatan positif terjadwal', nilaiSkor: 5 },
        { id: 'c', label: 'Banyak menggunakan gawai/game hingga larut malam', nilaiSkor: 2 },
        { id: 'd', label: 'Menjaga adik/bekerja paruh waktu cukup lama setiap hari', nilaiSkor: 2 },
      ],
      bobotPoin: 5,
      wajib: true,
    },
    {
      id: 'na-rumah-4',
      domain: 'Aktivitas di Rumah',
      subDimensi: 'Pemanfaatan Perangkat Belajar',
      tipe: 'pilihan_ganda',
      pertanyaan: 'Akses perangkat dan internet yang tersedia di rumah untuk mengakses materi LMS/tugas:',
      opsi: [
        { id: 'a', label: 'Memiliki HP/Laptop pribadi dan koneksi internet lancar', nilaiSkor: 5 },
        { id: 'b', label: 'Berbagi HP dengan orang tua/saudara dengan kuota terbatas', nilaiSkor: 3 },
        { id: 'c', label: 'Mengandalkan WiFi publik / fasilitas PKBM/sekolah', nilaiSkor: 2 },
        { id: 'd', label: 'Sangat terbatas / tidak memiliki perangkat digital di rumah', nilaiSkor: 1 },
      ],
      bobotPoin: 5,
      wajib: true,
    },

    // 6. Latar Belakang Keluarga (4 items)
    {
      id: 'na-kel-1',
      domain: 'Latar Belakang Keluarga',
      subDimensi: 'Pendampingan Belajar Orang Tua/Wali',
      tipe: 'pilihan_ganda',
      pertanyaan: 'Siapa yang biasanya mendampingi atau menanyakan perkembangan belajar Anda di rumah?',
      opsi: [
        { id: 'a', label: 'Ibu/Ayah secara rutin berdiskusi dan membantu mengarahkan belajar', nilaiSkor: 5 },
        { id: 'b', label: 'Orang tua memperhatikan namun sibuk bekerja sehingga hanya sesekali', nilaiSkor: 3 },
        { id: 'c', label: 'Kakak/Wali/Kerabat lain yang membantu di rumah', nilaiSkor: 4 },
        { id: 'd', label: 'Belajar sepenuhnya sendiri tanpa ada pendampingan keluarga', nilaiSkor: 2 },
      ],
      bobotPoin: 5,
      wajib: true,
    },
    {
      id: 'na-kel-2',
      domain: 'Latar Belakang Keluarga',
      subDimensi: 'Komunikasi & Dukungan Emosional Keluarga',
      tipe: 'skala_likert',
      pertanyaan:
        'Saya merasa didengarkan dan mendapat dukungan moral dari keluarga terhadap pilihan pendidikan serta bakat saya.',
      opsi: [
        { id: '1', label: '1 · Sangat Kurang', nilaiSkor: 1 },
        { id: '2', label: '2 · Kurang', nilaiSkor: 2 },
        { id: '3', label: '3 · Cukup', nilaiSkor: 3 },
        { id: '4', label: '4 · Baik', nilaiSkor: 4 },
        { id: '5', label: '5 · Sangat Baik', nilaiSkor: 5 },
      ],
      bobotPoin: 5,
      wajib: true,
    },
    {
      id: 'na-kel-3',
      domain: 'Latar Belakang Keluarga',
      subDimensi: 'Jarak & Akses Transportasi ke Sekolah',
      tipe: 'pilihan_ganda',
      pertanyaan: 'Bagaimana kemudahan akses transportasi Anda menuju lokasi belajar/sekolah?',
      opsi: [
        { id: 'a', label: 'Dekat dan mudah (< 15 menit, diantar/jalan kaki/kendaraan aman)', nilaiSkor: 5 },
        { id: 'b', label: 'Jarak sedang (15–30 menit) menggunakan angkutan/motor', nilaiSkor: 4 },
        { id: 'c', label: 'Jauh (> 30 menit) namun jadwal masih terjangkau', nilaiSkor: 3 },
        { id: 'd', label: 'Sering terkendala biaya atau kendaraan untuk hadir tatap muka', nilaiSkor: 1 },
      ],
      bobotPoin: 5,
      wajib: true,
    },
    {
      id: 'na-kel-4',
      domain: 'Latar Belakang Keluarga',
      subDimensi: 'Catatan Kondisi Khusus Keluarga',
      tipe: 'isian_singkat',
      pertanyaan:
        'Apakah ada informasi latar belakang keluarga, kesehatan, atau kebutuhan khusus yang perlu diketahui Wali Kelas/Guru BK agar pembelajaran Anda lebih nyaman? (Opsional):',
      opsi: [],
      bobotPoin: 5,
      wajib: false,
    },
  ];
}

export function buildAcademicDiagnosticQuestionsForSubject(
  subj: Subject,
  tingkatHint = 7
): DiagnosticQuestion[] {
  const nameLower = subj.nama.toLowerCase();
  const cp0 = subj.cps?.[0];
  const cpCode = cp0?.kode || 'CP 1';
  const tp1Code = cp0?.tps?.[0]?.kode || 'TP 1';
  const tp2Code = cp0?.tps?.[1]?.kode || 'TP 2';

  if (nameLower.includes('matematika')) {
    return [
      {
        id: `${subj.id}-diag-1`,
        domain: 'Bilangan & Operasi Dasar',
        cpKode: cpCode,
        tpKode: tp1Code,
        tipe: 'pilihan_ganda',
        pertanyaan:
          tingkatHint <= 6
            ? 'Hasil dari 3/4 + 2/8 dalam bentuk paling sederhana adalah...'
            : 'Seorang siswa memiliki tabungan Rp240.000. Sebanyak 3/8 bagian digunakan membeli buku dan Rp45.000 untuk alat tulis. Sisa tabungan sekarang adalah...',
        opsi:
          tingkatHint <= 6
            ? [
                { id: 'a', label: '5/12', isCorrect: false, nilaiSkor: 0 },
                { id: 'b', label: '1 (satu)', isCorrect: true, nilaiSkor: 25 },
                { id: 'c', label: '5/8', isCorrect: false, nilaiSkor: 0 },
                { id: 'd', label: '7/8', isCorrect: false, nilaiSkor: 0 },
              ]
            : [
                { id: 'a', label: 'Rp95.000', isCorrect: false, nilaiSkor: 0 },
                { id: 'b', label: 'Rp105.000', isCorrect: true, nilaiSkor: 25 },
                { id: 'c', label: 'Rp120.000', isCorrect: false, nilaiSkor: 0 },
                { id: 'd', label: 'Rp150.000', isCorrect: false, nilaiSkor: 0 },
              ],
        bobotPoin: 25,
        wajib: true,
      },
      {
        id: `${subj.id}-diag-2`,
        domain: 'Aljabar & Persamaan Linear',
        cpKode: cpCode,
        tpKode: tp1Code,
        tipe: 'pilihan_ganda',
        pertanyaan:
          tingkatHint <= 6
            ? 'Sebuah kotak berisi 12 pensil dibagikan rata kepada 3 siswa, lalu tiap siswa mendapat tambahan 2 pensil. Jumlah pensil tiap siswa sekarang adalah...'
            : 'Diketahui persamaan linear 3x - 7 = 14. Nilai dari 2x + 5 adalah...',
        opsi:
          tingkatHint <= 6
            ? [
                { id: 'a', label: '5 pensil', isCorrect: false, nilaiSkor: 0 },
                { id: 'b', label: '6 pensil', isCorrect: true, nilaiSkor: 25 },
                { id: 'c', label: '8 pensil', isCorrect: false, nilaiSkor: 0 },
                { id: 'd', label: '14 pensil', isCorrect: false, nilaiSkor: 0 },
              ]
            : [
                { id: 'a', label: '14', isCorrect: false, nilaiSkor: 0 },
                { id: 'b', label: '19', isCorrect: true, nilaiSkor: 25 },
                { id: 'c', label: '21', isCorrect: false, nilaiSkor: 0 },
                { id: 'd', label: '23', isCorrect: false, nilaiSkor: 0 },
              ],
        bobotPoin: 25,
        wajib: true,
      },
      {
        id: `${subj.id}-diag-3`,
        domain: 'Geometri & Pengukuran',
        cpKode: cpCode,
        tpKode: tp2Code,
        tipe: 'pilihan_ganda',
        pertanyaan:
          'Sebuah taman berbentuk persegi panjang memiliki panjang 18 meter dan lebar 12 meter. Panjang pagar minimal untuk mengelilingi seluruh taman tersebut adalah...',
        opsi: [
          { id: 'a', label: '30 meter', isCorrect: false, nilaiSkor: 0 },
          { id: 'b', label: '60 meter', isCorrect: true, nilaiSkor: 25 },
          { id: 'c', label: '108 meter', isCorrect: false, nilaiSkor: 0 },
          { id: 'd', label: '216 meter', isCorrect: false, nilaiSkor: 0 },
        ],
        bobotPoin: 25,
        wajib: true,
      },
      {
        id: `${subj.id}-diag-4`,
        domain: 'Analisis Data & Peluang',
        cpKode: cpCode,
        tpKode: tp2Code,
        tipe: 'pilihan_ganda',
        pertanyaan:
          'Nilai ulangan harian 5 siswa berturut-turut adalah: 70, 80, 85, 75, dan 90. Rata-rata nilai kelima siswa tersebut adalah...',
        opsi: [
          { id: 'a', label: '78', isCorrect: false, nilaiSkor: 0 },
          { id: 'b', label: '80', isCorrect: true, nilaiSkor: 25 },
          { id: 'c', label: '82', isCorrect: false, nilaiSkor: 0 },
          { id: 'd', label: '85', isCorrect: false, nilaiSkor: 0 },
        ],
        bobotPoin: 25,
        wajib: true,
      },
    ];
  }

  if (nameLower.includes('bahasa indonesia')) {
    return [
      {
        id: `${subj.id}-diag-1`,
        domain: 'Membaca & Memahami Gagasan Utama',
        cpKode: cpCode,
        tpKode: tp1Code,
        tipe: 'pilihan_ganda',
        pertanyaan:
          'Bacalah paragraf: "Pengelolaan sampah organik rumah tangga menjadi kompos tidak hanya mengurangi volume limbah lingkungan, tetapi juga menghasilkan pupuk subur bagi tanaman pekarangan." Gagasan utama kalimat tersebut adalah...',
        opsi: [
          { id: 'a', label: 'Semua tanaman pekarangan membutuhkan pupuk kimia', isCorrect: false, nilaiSkor: 0 },
          { id: 'b', label: 'Manfaat ganda mengolah sampah organik menjadi kompos', isCorrect: true, nilaiSkor: 25 },
          { id: 'c', label: 'Cara membakar sampah rumah tangga setiap sore', isCorrect: false, nilaiSkor: 0 },
          { id: 'd', label: 'Harga jual pupuk kompos di pasar modern', isCorrect: false, nilaiSkor: 0 },
        ],
        bobotPoin: 25,
        wajib: true,
      },
      {
        id: `${subj.id}-diag-2`,
        domain: 'Kaidah Kebahasaan & Ejaan Baku',
        cpKode: cpCode,
        tpKode: tp2Code,
        tipe: 'pilihan_ganda',
        pertanyaan: 'Manakah penulisan kata baku yang tepat sesuai KBBI dan EYD V?',
        opsi: [
          { id: 'a', label: 'Praktek analisis sistem resiko', isCorrect: false, nilaiSkor: 0 },
          { id: 'b', label: 'Praktik analisis sistem risiko', isCorrect: true, nilaiSkor: 25 },
          { id: 'c', label: 'Praktek analisa sistim risiko', isCorrect: false, nilaiSkor: 0 },
          { id: 'd', label: 'Praktik analisa sistim resiko', isCorrect: false, nilaiSkor: 0 },
        ],
        bobotPoin: 25,
        wajib: true,
      },
      {
        id: `${subj.id}-diag-3`,
        domain: 'Struktur Teks Laporan & Eksposisi',
        cpKode: cpCode,
        tpKode: tp2Code,
        tipe: 'pilihan_ganda',
        pertanyaan:
          'Bagian dalam teks laporan hasil observasi yang berisi gambaran umum objek yang diamati sebelum masuk ke rincian sifat atau manfaat disebut...',
        opsi: [
          { id: 'a', label: 'Deskripsi bagian', isCorrect: false, nilaiSkor: 0 },
          { id: 'b', label: 'Pernyataan umum / definisi umum', isCorrect: true, nilaiSkor: 25 },
          { id: 'c', label: 'Koda / amanat cerita', isCorrect: false, nilaiSkor: 0 },
          { id: 'd', label: 'Orientasi konflik', isCorrect: false, nilaiSkor: 0 },
        ],
        bobotPoin: 25,
        wajib: true,
      },
      {
        id: `${subj.id}-diag-4`,
        domain: 'Menulis Ringkasan Kritis',
        cpKode: cpCode,
        tpKode: tp1Code,
        tipe: 'pilihan_ganda',
        pertanyaan:
          'Kalimat efektif yang paling tepat untuk menyampaikan ajakan menjaga kebersihan kelas adalah...',
        opsi: [
          { id: 'a', label: 'Agar supaya kelas bersih maka siswa harus piket semua.', isCorrect: false, nilaiSkor: 0 },
          { id: 'b', label: 'Para siswa-siswa diharapkan menjaga kebersihan ruang kelas.', isCorrect: false, nilaiSkor: 0 },
          { id: 'c', label: 'Seluruh siswa diharapkan menjaga kebersihan ruang kelas setiap hari.', isCorrect: true, nilaiSkor: 25 },
          { id: 'd', label: 'Kebersihan kelas itu adalah tanggung jawab daripada kita bersama.', isCorrect: false, nilaiSkor: 0 },
        ],
        bobotPoin: 25,
        wajib: true,
      },
    ];
  }

  if (nameLower.includes('ipa') || nameLower.includes('ipas') || nameLower.includes('biologi') || nameLower.includes('fisika')) {
    return [
      {
        id: `${subj.id}-diag-1`,
        domain: 'Metode Ilmiah & Pengukuran',
        cpKode: cpCode,
        tpKode: tp1Code,
        tipe: 'pilihan_ganda',
        pertanyaan:
          'Dalam penyelidikan ilmiah di laboratorium, langkah pertama yang dilakukan peneliti setelah mengamati suatu fenomena alam adalah...',
        opsi: [
          { id: 'a', label: 'Menarik kesimpulan akhir sebelum menguji data', isCorrect: false, nilaiSkor: 0 },
          { id: 'b', label: 'Merumuskan masalah dan menyusun hipotesis sementara', isCorrect: true, nilaiSkor: 25 },
          { id: 'c', label: 'Mengabaikan variabel kontrol percobaan', isCorrect: false, nilaiSkor: 0 },
          { id: 'd', label: 'Mengganti alat ukur tanpa kalibrasi', isCorrect: false, nilaiSkor: 0 },
        ],
        bobotPoin: 25,
        wajib: true,
      },
      {
        id: `${subj.id}-diag-2`,
        domain: 'Besaran, Zat & Perubahannya',
        cpKode: cpCode,
        tpKode: tp1Code,
        tipe: 'pilihan_ganda',
        pertanyaan:
          'Peristiwa mencairnya es batu dan menguapnya air saat dipanaskan termasuk perubahan fisika karena...',
        opsi: [
          { id: 'a', label: 'Menghasilkan zat baru yang tidak dapat kembali', isCorrect: false, nilaiSkor: 0 },
          { id: 'b', label: 'Hanya mengubah wujud tanpa membentuk jenis zat kimia baru', isCorrect: true, nilaiSkor: 25 },
          { id: 'c', label: 'Terjadi reaksi pembakaran dengan oksigen', isCorrect: false, nilaiSkor: 0 },
          { id: 'd', label: 'Massa molekul air berubah menjadi logam', isCorrect: false, nilaiSkor: 0 },
        ],
        bobotPoin: 25,
        wajib: true,
      },
      {
        id: `${subj.id}-diag-3`,
        domain: 'Ekosistem & Makhluk Hidup',
        cpKode: cpCode,
        tpKode: tp2Code,
        tipe: 'pilihan_ganda',
        pertanyaan:
          'Pada suatu ekosistem sawah: Padi → Belalang → Katak → Ular. Apabila populasi katak menurun drastis akibat perburuan, dampak langsung yang paling mungkin terjadi adalah...',
        opsi: [
          { id: 'a', label: 'Populasi belalang meningkat pesat dan hasil padi menurun', isCorrect: true, nilaiSkor: 25 },
          { id: 'b', label: 'Populasi ular bertambah karena makanannya melimpah', isCorrect: false, nilaiSkor: 0 },
          { id: 'c', label: 'Populasi padi meningkat tanpa ada hama', isCorrect: false, nilaiSkor: 0 },
          { id: 'd', label: 'Belalang langsung punah seketika', isCorrect: false, nilaiSkor: 0 },
        ],
        bobotPoin: 25,
        wajib: true,
      },
      {
        id: `${subj.id}-diag-4`,
        domain: 'Energi & Aplikasi Sehari-hari',
        cpKode: cpCode,
        tpKode: tp2Code,
        tipe: 'pilihan_ganda',
        pertanyaan:
          'Alat rumah tangga yang mengubah energi listrik menjadi energi gerak secara utama adalah...',
        opsi: [
          { id: 'a', label: 'Setrika listrik', isCorrect: false, nilaiSkor: 0 },
          { id: 'b', label: 'Lampu pijar', isCorrect: false, nilaiSkor: 0 },
          { id: 'c', label: 'Kipas angin dan blender', isCorrect: true, nilaiSkor: 25 },
          { id: 'd', label: 'Pemanas air listrik', isCorrect: false, nilaiSkor: 0 },
        ],
        bobotPoin: 25,
        wajib: true,
      },
    ];
  }

  // Dynamic CP/TP-aligned template for any subject
  const cps = subj.cps && subj.cps.length > 0 ? subj.cps : [];
  const tpDescs = cps.flatMap((c) => c.tps.map((t) => ({ cp: c.kode, tp: t.kode, desc: t.deskripsi })));
  const item1 = tpDescs[0] || { cp: cpCode, tp: tp1Code, desc: `Konsep dasar ${subj.nama}` };
  const item2 = tpDescs[1] || { cp: cpCode, tp: tp2Code, desc: `Penerapan kontekstual ${subj.nama}` };

  return [
    {
      id: `${subj.id}-diag-1`,
      domain: `${item1.cp} · ${item1.tp}`,
      cpKode: item1.cp,
      tpKode: item1.tp,
      tipe: 'pilihan_ganda',
      pertanyaan: `Pemahaman awal terkait kompetensi "${item1.desc}": langkah pertama yang tepat saat mempelajari topik ini adalah...`,
      opsi: [
        { id: 'a', label: 'Mengidentifikasi konsep kunci, istilah penting, dan tujuan penerapannya', isCorrect: true, nilaiSkor: 35 },
        { id: 'b', label: 'Menghafal tanpa memahami konteks penggunaan', isCorrect: false, nilaiSkor: 0 },
        { id: 'c', label: 'Melewati materi prasyarat secara langsung', isCorrect: false, nilaiSkor: 0 },
      ],
      bobotPoin: 35,
      wajib: true,
    },
    {
      id: `${subj.id}-diag-2`,
      domain: `${item2.cp} · ${item2.tp}`,
      cpKode: item2.cp,
      tpKode: item2.tp,
      tipe: 'pilihan_ganda',
      pertanyaan: `Dalam praktik pembelajaran ${subj.nama} untuk tujuan "${item2.desc}", indikator keberhasilan paling tepat ditunjukkan dengan...`,
      opsi: [
        { id: 'a', label: 'Mampu menghubungkan konsep dengan contoh nyata dan menjelaskan alasannya', isCorrect: true, nilaiSkor: 35 },
        { id: 'b', label: 'Hanya menyalin ulang definisi dari buku', isCorrect: false, nilaiSkor: 0 },
        { id: 'c', label: 'Menghindari diskusi atau praktik penyelesaian masalah', isCorrect: false, nilaiSkor: 0 },
      ],
      bobotPoin: 35,
      wajib: true,
    },
    {
      id: `${subj.id}-diag-3`,
      domain: `Kesiapan Materi ${subj.nama}`,
      cpKode: cpCode,
      tpKode: tp1Code,
      tipe: 'skala_likert',
      pertanyaan: `Seberapa siap dan paham Anda terhadap materi prasyarat mata pelajaran ${subj.nama} sebelum memasuki bab semester ini?`,
      opsi: [
        { id: '1', label: '1 · Belum Paham Sama Sekali', nilaiSkor: 6 },
        { id: '2', label: '2 · Masih Banyak Bingung', nilaiSkor: 12 },
        { id: '3', label: '3 · Paham Sebagian', nilaiSkor: 18 },
        { id: '4', label: '4 · Cukup Siap', nilaiSkor: 24 },
        { id: '5', label: '5 · Sangat Siap & Paham', nilaiSkor: 30 },
      ],
      bobotPoin: 30,
      wajib: true,
    },
  ];
}

export function buildDefaultDiagnosticPackages(
  schoolId: string,
  subjects: Subject[],
  classes: string[],
  tahunAjaran: string,
  semester: '1' | '2'
): DiagnosticPackage[] {
  const now = new Date().toISOString();
  const smpClasses = classes.filter((c) => c.includes('SMP') || c.includes('7') || c.includes('8') || c.includes('9'));
  const targetClassesAll = classes.length > 0 ? classes : ['Kelas 7 SMP'];
  const matSubj = subjects.find((s) => s.id === 'subj-mat') || subjects[0];
  const bindSubj = subjects.find((s) => s.id === 'subj-bind');

  const pkgs: DiagnosticPackage[] = [
    {
      id: `diagpkg-nonak-${schoolId}`,
      schoolId,
      kodePaket: 'DIAG-NONAK-01',
      judul: 'Asesmen Diagnostik Non-Akademik Komprehensif (6 Dimensi Siswa)',
      deskripsi:
        'Menggali kondisi psikologis, sosial-emosional, gaya belajar (Visual/Auditori/Kinestetik), minat & bakat, aktivitas belajar di rumah, serta latar belakang keluarga peserta didik.',
      kategori: 'Non-Akademik',
      targetKelasList: targetClassesAll,
      targetTingkatList: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      durasiMenit: 20,
      status: 'Dirilis',
      isTemplateBuiltIn: true,
      releasedAt: now,
      releasedByName: 'Pengurus Lembaga',
      pertanyaan: buildNonAkademikDiagnosticQuestions(),
      tahunAjaran,
      semester,
      createdByName: 'Pengurus Lembaga',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `diagpkg-mandiri-${schoolId}`,
      schoolId,
      kodePaket: 'DIAG-MANDIRI-01',
      judul: 'Asesmen Status Pemelajar Mandiri Murid (Self-Regulated Learning)',
      deskripsi:
        'Instrumen terukur berbasis 6 dimensi Self-Regulated Learning (Inisiatif, Manajemen Waktu, Strategi Belajar, Pencarian Sumber & Literasi Digital, Evaluasi Diri, dan Resiliensi) untuk memetakan status dan derajat kemandirian belajar murid.',
      kategori: 'Pemelajar Mandiri',
      targetKelasList: targetClassesAll,
      targetTingkatList: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      durasiMenit: 15,
      status: 'Dirilis',
      isTemplateBuiltIn: true,
      releasedAt: now,
      releasedByName: 'Pengurus Lembaga',
      pertanyaan: buildPemelajarMandiriQuestions(),
      tahunAjaran,
      semester,
      createdByName: 'Pengurus Lembaga',
      createdAt: now,
      updatedAt: now,
    },
  ];

  if (matSubj) {
    pkgs.push({
      id: `diagpkg-mat-${schoolId}`,
      schoolId,
      kodePaket: `DIAG-${matSubj.kode}-01`,
      judul: `Asesmen Diagnostik Awal: ${matSubj.nama}`,
      deskripsi: `Pemetaan kemampuan prasyarat numerasi, aljabar, geometri, dan data pada mata pelajaran ${matSubj.nama} untuk penentuan strategi pembelajaran berdiferensiasi.`,
      kategori: 'Akademik',
      subjectId: matSubj.id,
      subjectName: matSubj.nama,
      targetKelasList: smpClasses.length > 0 ? smpClasses : targetClassesAll,
      targetTingkatList: matSubj.tingkatList,
      durasiMenit: 25,
      status: 'Dirilis',
      isTemplateBuiltIn: true,
      releasedAt: now,
      releasedByName: 'Pengurus Lembaga',
      pertanyaan: buildAcademicDiagnosticQuestionsForSubject(matSubj, 7),
      tahunAjaran,
      semester,
      createdByName: 'Pengurus Lembaga',
      createdAt: now,
      updatedAt: now,
    });
  }

  if (bindSubj) {
    pkgs.push({
      id: `diagpkg-bind-${schoolId}`,
      schoolId,
      kodePaket: `DIAG-${bindSubj.kode}-01`,
      judul: `Asesmen Diagnostik Awal: ${bindSubj.nama}`,
      deskripsi: `Pemetaan literasi membaca kritis, kaidah kebahasaan, dan struktur teks pada mata pelajaran ${bindSubj.nama}.`,
      kategori: 'Akademik',
      subjectId: bindSubj.id,
      subjectName: bindSubj.nama,
      targetKelasList: targetClassesAll,
      targetTingkatList: bindSubj.tingkatList,
      durasiMenit: 20,
      status: 'Draft',
      isTemplateBuiltIn: true,
      pertanyaan: buildAcademicDiagnosticQuestionsForSubject(bindSubj, 7),
      tahunAjaran,
      semester,
      createdByName: 'Pengurus Lembaga',
      createdAt: now,
      updatedAt: now,
    });
  }

  return pkgs;
}

export function evaluateDiagnosticSubmission(
  pkg: DiagnosticPackage,
  answers: DiagnosticAnswer[]
): Omit<
  DiagnosticSubmission,
  | 'id'
  | 'schoolId'
  | 'studentId'
  | 'studentName'
  | 'nis'
  | 'kelas'
  | 'tahunAjaran'
  | 'semester'
  | 'submittedAt'
  | 'answers'
> {
  const answerMap = new Map(answers.map((a) => [a.questionId, a]));

  if (pkg.kategori === 'Akademik') {
    let earnedPoints = 0;
    let totalPoints = 0;
    let correctCount = 0;
    let scorableCount = 0;
    const domainStats = new Map<string, { earned: number; total: number; benar: number; count: number }>();

    for (const q of pkg.pertanyaan) {
      const ans = answerMap.get(q.id);
      const bobot = Math.max(1, q.bobotPoin || 10);
      const domStat = domainStats.get(q.domain) || { earned: 0, total: 0, benar: 0, count: 0 };

      if (q.tipe === 'pilihan_ganda') {
        scorableCount++;
        totalPoints += bobot;
        domStat.total += bobot;
        domStat.count++;
        const picked = q.opsi.find((o) => o.id === ans?.selectedOptionId);
        if (picked?.isCorrect) {
          correctCount++;
          earnedPoints += bobot;
          domStat.earned += bobot;
          domStat.benar++;
        } else if (picked && typeof picked.nilaiSkor === 'number' && !q.opsi.some((o) => o.isCorrect)) {
          const ratio = Math.min(1, Math.max(0, picked.nilaiSkor / (picked.nilaiSkor > 5 ? 100 : 5)));
          const pts = Math.round(bobot * ratio);
          earnedPoints += pts;
          domStat.earned += pts;
          if (ratio >= 0.7) {
            correctCount++;
            domStat.benar++;
          }
        }
      } else if (q.tipe === 'pg_kompleks') {
        scorableCount++;
        totalPoints += bobot;
        domStat.total += bobot;
        domStat.count++;
        const selected = new Set(ans?.selectedOptionIds || []);
        const correctOpts = q.opsi.filter((o) => o.isCorrect);
        if (correctOpts.length > 0) {
          const hit = correctOpts.filter((o) => selected.has(o.id)).length;
          const wrongPicked = q.opsi.filter((o) => !o.isCorrect && selected.has(o.id)).length;
          const ratio = Math.min(1, Math.max(0, (hit - wrongPicked * 0.5) / correctOpts.length));
          const pts = Math.round(bobot * ratio);
          earnedPoints += pts;
          domStat.earned += pts;
          if (ratio >= 0.7) {
            correctCount++;
            domStat.benar++;
          }
        } else if (selected.size > 0) {
          const sumPicked = q.opsi
            .filter((o) => selected.has(o.id))
            .reduce((acc, o) => acc + (o.nilaiSkor || 0), 0);
          const maxScore = q.opsi.reduce((acc, o) => acc + (o.nilaiSkor || 0), 0) || 100;
          const ratio = Math.min(1, Math.max(0, sumPicked / maxScore));
          const pts = Math.round(bobot * ratio);
          earnedPoints += pts;
          domStat.earned += pts;
          if (ratio >= 0.7) {
            correctCount++;
            domStat.benar++;
          }
        }
      } else if (q.tipe === 'menjodohkan') {
        const pairs = q.pasanganMenjodohkan || [];
        if (pairs.length > 0) {
          scorableCount++;
          totalPoints += bobot;
          domStat.total += bobot;
          domStat.count++;
          const mapAns = ans?.matchingAnswers || {};
          const matched = pairs.filter((p) => mapAns[p.id] && mapAns[p.id] === p.kanan).length;
          const ratio = matched / pairs.length;
          const pts = Math.round(bobot * ratio);
          earnedPoints += pts;
          domStat.earned += pts;
          if (ratio >= 0.7) {
            correctCount++;
            domStat.benar++;
          }
        }
      } else if (q.tipe === 'skala_likert') {
        totalPoints += bobot;
        domStat.total += bobot;
        const picked = q.opsi.find((o) => o.id === ans?.selectedOptionId);
        const maxScale = Math.max(...q.opsi.map((o) => o.nilaiSkor ?? 5), 5);
        const val = picked?.nilaiSkor ?? (typeof ans?.scaleValue === 'number' ? ans.scaleValue : 0);
        const earned = Math.round((Math.min(val, maxScale) / maxScale) * bobot);
        earnedPoints += earned;
        domStat.earned += earned;
        if (val >= maxScale * 0.7) {
          correctCount++;
          domStat.benar++;
        }
        scorableCount++;
        domStat.count++;
      } else if (q.tipe === 'studi_kasus') {
        scorableCount++;
        totalPoints += bobot;
        domStat.total += bobot;
        domStat.count++;
        if (q.opsi.length > 0) {
          const picked = q.opsi.find((o) => o.id === ans?.selectedOptionId);
          if (picked?.isCorrect) {
            correctCount++;
            earnedPoints += bobot;
            domStat.earned += bobot;
            domStat.benar++;
          } else if (picked && typeof picked.nilaiSkor === 'number') {
            const maxOpt = Math.max(...q.opsi.map((o) => o.nilaiSkor ?? 5), 5);
            const ratio = Math.min(1, Math.max(0, picked.nilaiSkor / maxOpt));
            const pts = Math.round(bobot * ratio);
            earnedPoints += pts;
            domStat.earned += pts;
            if (ratio >= 0.7) {
              correctCount++;
              domStat.benar++;
            }
          }
        } else if (ans?.textAnswer && ans.textAnswer.trim().length >= 5) {
          const pts = Math.round(bobot * 0.85);
          earnedPoints += pts;
          domStat.earned += pts;
          correctCount++;
          domStat.benar++;
        }
      } else if (q.tipe === 'input_gambar') {
        scorableCount++;
        totalPoints += bobot;
        domStat.total += bobot;
        domStat.count++;
        if (ans?.imageDataUrl && ans.imageDataUrl.trim().length > 10) {
          const pts = Math.round(bobot * 0.85);
          earnedPoints += pts;
          domStat.earned += pts;
          correctCount++;
          domStat.benar++;
        }
      } else if (q.tipe === 'isian_singkat') {
        scorableCount++;
        totalPoints += bobot;
        domStat.total += bobot;
        domStat.count++;
        const rawText = (ans?.textAnswer || '').trim();
        const correctOpt = q.opsi.find((o) => o.isCorrect && o.label.trim());
        if (correctOpt) {
          const expected = correctOpt.label
            .split(/[|;,]/)
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
          if (expected.includes(rawText.toLowerCase())) {
            correctCount++;
            earnedPoints += bobot;
            domStat.earned += bobot;
            domStat.benar++;
          }
        } else if (rawText.length >= 2) {
          const pts = Math.round(bobot * 0.85);
          earnedPoints += pts;
          domStat.earned += pts;
          correctCount++;
          domStat.benar++;
        }
      }

      domainStats.set(q.domain, domStat);
    }

    const skorAkademik = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    const levelPenguasaan: DiagnosticSubmission['levelPenguasaan'] =
      skorAkademik >= 85
        ? 'Mahir / Pengayaan'
        : skorAkademik >= 70
          ? 'Cakap / Siap Reguler'
          : skorAkademik >= 50
            ? 'Berkembang / Perlu Penguatan'
            : 'Perlu Intervensi Dasar';

    const breakdownPerDomain = Array.from(domainStats.entries()).map(([domain, st]) => ({
      domain,
      benar: st.benar,
      total: Math.max(1, st.count),
      persen: st.total > 0 ? Math.round((st.earned / st.total) * 100) : 0,
    }));

    const weakDomains = breakdownPerDomain.filter((d) => d.persen < 70).map((d) => d.domain);
    const rekomendasiTindakLanjut =
      skorAkademik >= 85
        ? `Siap mengikuti tantangan pengayaan dan proyek pendalaman pada ${pkg.subjectName || pkg.judul}.`
        : weakDomains.length > 0
          ? `Perlu penguatan konsep & bimbingan bertahap khususnya pada topik: ${weakDomains.join(', ')}.`
          : `Dapat mengikuti pembelajaran reguler dengan pendampingan latihan soal kontekstual.`;

    return {
      packageId: pkg.id,
      packageJudul: pkg.judul,
      kategori: 'Akademik',
      subjectId: pkg.subjectId,
      subjectName: pkg.subjectName,
      skorAkademik,
      jumlahBenar: correctCount,
      jumlahSoal: Math.max(1, scorableCount),
      levelPenguasaan,
      breakdownPerDomain,
      rekomendasiTindakLanjut,
    };
  }

  if (pkg.kategori === 'Pemelajar Mandiri') {
    const domainScoresMap = new Map<string, number[]>();
    let totalScoreSum = 0;
    let totalItemCount = 0;

    for (const q of pkg.pertanyaan) {
      const ans = answerMap.get(q.id);
      if (!ans) continue;
      let normalized5 = 0;

      if (q.tipe === 'pg_kompleks') {
        const selected = new Set(ans.selectedOptionIds || []);
        const correctOpts = q.opsi.filter((o) => o.isCorrect);
        if (correctOpts.length > 0) {
          const hit = correctOpts.filter((o) => selected.has(o.id)).length;
          const wrongPicked = q.opsi.filter((o) => !o.isCorrect && selected.has(o.id)).length;
          const ratio = Math.min(1, Math.max(0, (hit - wrongPicked * 0.5) / correctOpts.length));
          normalized5 = ratio * 5;
        } else if (selected.size > 0) {
          const avgOpt =
            q.opsi.filter((o) => selected.has(o.id)).reduce((a, o) => a + (o.nilaiSkor ?? 3), 0) /
            selected.size;
          const maxOpt = Math.max(...q.opsi.map((o) => o.nilaiSkor ?? 5), 5);
          normalized5 = (avgOpt / maxOpt) * 5;
        }
      } else if (q.tipe === 'menjodohkan') {
        const pairs = q.pasanganMenjodohkan || [];
        if (pairs.length > 0) {
          const mapAns = ans.matchingAnswers || {};
          const matched = pairs.filter((p) => mapAns[p.id] && mapAns[p.id] === p.kanan).length;
          normalized5 = (matched / pairs.length) * 5;
        }
      } else if (q.tipe === 'input_gambar') {
        if (ans.imageDataUrl && ans.imageDataUrl.trim().length > 10) normalized5 = 4.25;
      } else if (q.tipe === 'isian_singkat') {
        const rawText = (ans.textAnswer || '').trim();
        const correctOpt = q.opsi.find((o) => o.isCorrect && o.label.trim());
        if (correctOpt) {
          const expected = correctOpt.label
            .split(/[|;,]/)
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
          normalized5 = expected.includes(rawText.toLowerCase()) ? 5 : 1;
        } else if (rawText.length >= 3) {
          normalized5 = 4.25;
        } else {
          continue;
        }
      } else if (q.tipe === 'studi_kasus' && q.opsi.length === 0) {
        if (ans.textAnswer && ans.textAnswer.trim().length >= 5) normalized5 = 4.25;
      } else {
        const picked = q.opsi.find((o) => o.id === ans.selectedOptionId);
        const maxOpt = Math.max(...q.opsi.map((o) => o.nilaiSkor ?? 5), 5);
        const rawVal = picked?.nilaiSkor ?? (typeof ans.scaleValue === 'number' ? ans.scaleValue : 0);
        if (rawVal > 0) {
          normalized5 = (rawVal / maxOpt) * 5;
        }
      }

      if (normalized5 > 0) {
        const arr = domainScoresMap.get(q.domain) || [];
        arr.push(normalized5);
        domainScoresMap.set(q.domain, arr);
        totalScoreSum += normalized5;
        totalItemCount++;
      }
    }

    const skorKemandirian =
      totalItemCount > 0 ? Math.round((totalScoreSum / (totalItemCount * 5)) * 100) : 0;
    const statusPemelajarMandiri: DiagnosticSubmission['statusPemelajarMandiri'] =
      skorKemandirian >= 70
        ? 'Sudah Pemelajar Mandiri'
        : 'Belum Pemelajar Mandiri (Butuh Pendampingan)';

    const derajatKemandirian: DiagnosticSubmission['derajatKemandirian'] =
      skorKemandirian >= 85
        ? 'Derajat IV — Pemelajar Mandiri Otonom (85–100%)'
        : skorKemandirian >= 70
          ? 'Derajat III — Pemelajar Mandiri Berkembang (70–84%)'
          : skorKemandirian >= 50
            ? 'Derajat II — Pemelajar Transisi / Terbimbing (50–69%)'
            : 'Derajat I — Pemelajar Bergantung / Pendampingan Intensif (< 50%)';

    const skorDomainNonAkademik: DiagnosticDomainScore[] = [];
    const indikatorPerluPerhatian: string[] = [];
    const strongDomains: string[] = [];

    for (const [domain, values] of domainScoresMap.entries()) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const persen = Math.round((avg / 5) * 100);
      const kategori: DiagnosticDomainScore['kategori'] =
        persen >= 78 ? 'Optimal' : persen >= 60 ? 'Cukup Baik' : 'Perlu Pendampingan';

      let ringkasan = 'Kebiasaan belajar mandiri berjalan konsisten tanpa ketergantungan instruksi terus-menerus.';
      if (kategori === 'Cukup Baik') {
        ringkasan = 'Cukup mandiri pada situasi rutin, namun masih perlu penguatan saat materi kompleks.';
      } else if (kategori === 'Perlu Pendampingan') {
        ringkasan = 'Masih bergantung pada arahan guru/orang tua; perlu scaffolding bertahap & checklist harian.';
        indikatorPerluPerhatian.push(`${domain} (${persen}%)`);
      }
      if (persen >= 78) strongDomains.push(`${domain} (${persen}%)`);

      skorDomainNonAkademik.push({
        domain,
        skorRata: Number(avg.toFixed(2)),
        persen,
        kategori,
        ringkasan,
      });
    }

    const rekParts: string[] = [
      `[Formula Akuntabilitas SRL] Skor Kemandirian = ${skorKemandirian}% (${statusPemelajarMandiri} · ${derajatKemandirian}) dari ${totalItemCount} indikator terukur.`,
    ];
    if (strongDomains.length > 0) {
      rekParts.push(`Kekuatan utama: ${strongDomains.join(', ')}.`);
    }
    if (indikatorPerluPerhatian.length > 0) {
      rekParts.push(
        `Area pembinaan prioritas Wali Kelas & Guru Mapel: ${indikatorPerluPerhatian.join(', ')}. Berikan target belajar mingguan tertulis, log refleksi, dan pengawasan bertahap.`
      );
    } else {
      rekParts.push(
        'Siswa layak diberi proyek eksplorasi mandiri, peran tutor sebaya, atau kontrak belajar berbasis riset.'
      );
    }

    return {
      packageId: pkg.id,
      packageJudul: pkg.judul,
      kategori: 'Pemelajar Mandiri',
      skorKemandirian,
      statusPemelajarMandiri,
      derajatKemandirian,
      skorDomainNonAkademik,
      indikatorPerluPerhatian,
      rekomendasiTindakLanjut: rekParts.join(' '),
    };
  }

  // Non-Akademik evaluation
  const domainScoresMap = new Map<string, number[]>();
  const gayaCounts = { Visual: 0, Auditori: 0, Kinestetik: 0 };
  const minatTagCounts = new Map<string, number>();

  for (const q of pkg.pertanyaan) {
    const ans = answerMap.get(q.id);
    if (!ans) continue;

    if (q.domain === 'Gaya Belajar') {
      if (q.tipe === 'pg_kompleks') {
        const pickedOpts = q.opsi.filter((o) => (ans.selectedOptionIds || []).includes(o.id));
        pickedOpts.forEach((picked) => {
          if (picked.traitTag === 'Visual') gayaCounts.Visual++;
          else if (picked.traitTag === 'Auditori') gayaCounts.Auditori++;
          else if (picked.traitTag === 'Kinestetik') gayaCounts.Kinestetik++;
        });
      } else {
        const picked = q.opsi.find((o) => o.id === ans.selectedOptionId);
        if (picked?.traitTag === 'Visual') gayaCounts.Visual++;
        else if (picked?.traitTag === 'Auditori') gayaCounts.Auditori++;
        else if (picked?.traitTag === 'Kinestetik') gayaCounts.Kinestetik++;
      }
      continue;
    }

    if (q.domain === 'Minat & Bakat') {
      if (q.tipe === 'pg_kompleks') {
        q.opsi
          .filter((o) => (ans.selectedOptionIds || []).includes(o.id))
          .forEach((picked) => {
            if (picked.traitTag) {
              minatTagCounts.set(picked.traitTag, (minatTagCounts.get(picked.traitTag) || 0) + 1);
            }
          });
      } else {
        const picked = q.opsi.find((o) => o.id === ans.selectedOptionId);
        if (picked?.traitTag) {
          minatTagCounts.set(picked.traitTag, (minatTagCounts.get(picked.traitTag) || 0) + 1);
        }
      }
      continue;
    }

    let val = 0;
    if (q.tipe === 'isian_singkat') {
      const rawText = (ans.textAnswer || '').trim();
      const correctOpt = q.opsi.find((o) => o.isCorrect && o.label.trim());
      if (correctOpt) {
        const expected = correctOpt.label
          .split(/[|;,]/)
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        val = expected.includes(rawText.toLowerCase()) ? 5 : 1;
      } else if (rawText.length >= 3) {
        val = 4.25;
      } else {
        continue;
      }
    } else if (q.tipe === 'pg_kompleks') {
      const selected = new Set(ans.selectedOptionIds || []);
      const pickedOpts = q.opsi.filter((o) => selected.has(o.id));
      if (pickedOpts.length > 0) {
        const maxOpt = Math.max(...q.opsi.map((o) => o.nilaiSkor ?? 5), 5);
        const avgPicked = pickedOpts.reduce((acc, o) => acc + (o.nilaiSkor ?? 3), 0) / pickedOpts.length;
        val = Number(((avgPicked / maxOpt) * 5).toFixed(2));
      }
    } else if (q.tipe === 'menjodohkan') {
      const pairs = q.pasanganMenjodohkan || [];
      if (pairs.length > 0) {
        const mapAns = ans.matchingAnswers || {};
        const matched = pairs.filter((p) => mapAns[p.id] && mapAns[p.id] === p.kanan).length;
        val = Number(((matched / pairs.length) * 5).toFixed(2));
      }
    } else if (q.tipe === 'input_gambar') {
      if (ans.imageDataUrl && ans.imageDataUrl.trim().length > 10) val = 4.25;
    } else if (q.tipe === 'studi_kasus' && q.opsi.length === 0) {
      if (ans.textAnswer && ans.textAnswer.trim().length >= 5) val = 4.25;
    } else {
      const picked = q.opsi.find((o) => o.id === ans.selectedOptionId);
      const maxOpt = Math.max(...q.opsi.map((o) => o.nilaiSkor ?? 5), 5);
      const raw = picked?.nilaiSkor ?? (typeof ans.scaleValue === 'number' ? ans.scaleValue : 0);
      if (raw > 0) {
        val = Number(((raw / maxOpt) * 5).toFixed(2));
      }
    }

    if (val > 0) {
      const arr = domainScoresMap.get(q.domain) || [];
      arr.push(val);
      domainScoresMap.set(q.domain, arr);
    }
  }

  const totalGaya = gayaCounts.Visual + gayaCounts.Auditori + gayaCounts.Kinestetik;
  const visualPct = totalGaya > 0 ? Math.round((gayaCounts.Visual / totalGaya) * 100) : 34;
  const audPct = totalGaya > 0 ? Math.round((gayaCounts.Auditori / totalGaya) * 100) : 33;
  const kinPct = totalGaya > 0 ? Math.max(0, 100 - visualPct - audPct) : 33;
  const dominan: 'Visual' | 'Auditori' | 'Kinestetik' =
    gayaCounts.Visual >= gayaCounts.Auditori && gayaCounts.Visual >= gayaCounts.Kinestetik
      ? 'Visual'
      : gayaCounts.Auditori >= gayaCounts.Kinestetik
        ? 'Auditori'
        : 'Kinestetik';

  const minatEntries = Array.from(minatTagCounts.entries()).sort((a, b) => b[1] - a[1]);
  const minatDominan = minatEntries[0]?.[0] || 'Belum Teridentifikasi';

  const skorDomainNonAkademik: DiagnosticDomainScore[] = [];
  const indikatorPerluPerhatian: string[] = [];

  for (const [domain, values] of domainScoresMap.entries()) {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const persen = Math.round((avg / 5) * 100);
    const kategori: DiagnosticDomainScore['kategori'] =
      persen >= 78 ? 'Optimal' : persen >= 56 ? 'Cukup Baik' : 'Perlu Pendampingan';

    let ringkasan = 'Kondisi sangat mendukung pembelajaran.';
    if (kategori === 'Cukup Baik') {
      ringkasan = 'Stabil, tetap perlu pemantauan berkala dan komunikasi dua arah.';
    } else if (kategori === 'Perlu Pendampingan') {
      ringkasan = 'Menunjukkan hambatan signifikan; rekomendasikan sesi konseling & koordinasi orang tua.';
      indikatorPerluPerhatian.push(`${domain} (${persen}%)`);
    }

    skorDomainNonAkademik.push({
      domain,
      skorRata: Number(avg.toFixed(2)),
      persen,
      kategori,
      ringkasan,
    });
  }

  const rekomendasiParts: string[] = [
    `Sesuaikan metode mengajar dengan gaya belajar dominan ${dominan} (${dominan === 'Visual' ? 'media visual/mind-map' : dominan === 'Auditori' ? 'diskusi lisan/audio' : 'praktik langsung/kinestetik'}) serta minat utama ${minatDominan}.`,
  ];
  if (indikatorPerluPerhatian.length > 0) {
    rekomendasiParts.push(
      `Prioritaskan pendampingan wali kelas/BK serta komunikasi Buku Penghubung orang tua pada aspek: ${indikatorPerluPerhatian.join(', ')}.`
    );
  } else {
    rekomendasiParts.push('Kesiapan psikologis, sosial-emosional, dan dukungan rumah berada dalam kondisi baik.');
  }

  return {
    packageId: pkg.id,
    packageJudul: pkg.judul,
    kategori: 'Non-Akademik',
    profilGayaBelajar: {
      dominan,
      visual: visualPct,
      auditori: audPct,
      kinestetik: kinPct,
    },
    minatDominan,
    skorDomainNonAkademik,
    indikatorPerluPerhatian,
    rekomendasiTindakLanjut: rekomendasiParts.join(' '),
  };
}

export function buildDefaultTendikQuestions(): TendikQuestion[] {
  return [
    // 1. Profesional
    {
      id: 'tdk-prof-1',
      kompetensi: 'Profesional',
      indikatorKinerja: 'Penguasaan struktur CP/TP & kedalaman materi ajar',
      tipe: 'pilihan_ganda',
      pertanyaan:
        'Dalam menurunkan Capaian Pembelajaran (CP) ke Tujuan Pembelajaran (TP) yang bermakna bagi peserta didik kesetaraan/formal, pendekatan yang paling tepat adalah...',
      opsi: [
        {
          id: 'a',
          label: 'Menyesuaikan urutan TP dengan tingkat kesiapan peserta didik dan konteks lokal tanpa mengurangi esensi CP',
          nilaiSkor: 100,
          isCorrect: true,
        },
        {
          id: 'b',
          label: 'Menyalin seluruh isi buku teks secara kaku tanpa analisis diagnostik kelas',
          nilaiSkor: 25,
          isCorrect: false,
        },
        {
          id: 'c',
          label: 'Mengurangi jumlah CP agar seluruh siswa mendapat nilai minimal sama',
          nilaiSkor: 20,
          isCorrect: false,
        },
      ],
      bobotPoin: 20,
    },
    {
      id: 'tdk-prof-2',
      kompetensi: 'Profesional',
      indikatorKinerja: 'Pengembangan keprofesian berkelanjutan & riset praktik baik',
      tipe: 'skala_likert',
      pertanyaan:
        'Saya secara rutin memperbarui bahan ajar dan merefleksikan ketepatan materi ajar terhadap perkembangan ilmu pengetahuan terkini.',
      opsi: [
        { id: '1', label: '1 · Belum Dilakukan', nilaiSkor: 20 },
        { id: '2', label: '2 · Jarang', nilaiSkor: 40 },
        { id: '3', label: '3 · Kadang-kadang', nilaiSkor: 60 },
        { id: '4', label: '4 · Rutin', nilaiSkor: 80 },
        { id: '5', label: '5 · Sangat Konsisten & Terdokumentasi', nilaiSkor: 100 },
      ],
      bobotPoin: 20,
    },

    // 2. Pedagogik
    {
      id: 'tdk-ped-1',
      kompetensi: 'Pedagogik',
      indikatorKinerja: 'Pembelajaran berdiferensiasi berbasis asesmen diagnostik',
      tipe: 'pilihan_ganda',
      pertanyaan:
        'Jika hasil asesmen diagnostik menunjukkan 40% siswa di kelas belum menguasai prasyarat materi dan 20% sudah mahir, strategi pedagogik terbaik saat mengajar adalah...',
      opsi: [
        {
          id: 'a',
          label: 'Mengajar pada kecepatan rata-rata tanpa membedakan tugas',
          nilaiSkor: 30,
          isCorrect: false,
        },
        {
          id: 'b',
          label: 'Menerapkan diferensiasi proses/produk: kelompok fondasi mendapat scaffolding bertahap, kelompok mahir mendapat proyek pengayaan',
          nilaiSkor: 100,
          isCorrect: true,
        },
        {
          id: 'c',
          label: 'Menunda materi baru sampai semua siswa menghafal definisi',
          nilaiSkor: 40,
          isCorrect: false,
        },
      ],
      bobotPoin: 20,
    },
    {
      id: 'tdk-ped-2',
      kompetensi: 'Pedagogik',
      indikatorKinerja: 'Umpan balik formatif konstruktif',
      tipe: 'skala_likert',
      pertanyaan:
        'Saya memberikan umpan balik formatif yang spesifik (bukan hanya angka) terhadap karya/kesalahan belajar siswa agar mereka tahu langkah perbaikannya.',
      opsi: [
        { id: '1', label: '1 · Belum Pernah', nilaiSkor: 20 },
        { id: '2', label: '2 · Jarang', nilaiSkor: 40 },
        { id: '3', label: '3 · Cukup Sering', nilaiSkor: 65 },
        { id: '4', label: '4 · Sering', nilaiSkor: 85 },
        { id: '5', label: '5 · Selalu pada Setiap Asesmen', nilaiSkor: 100 },
      ],
      bobotPoin: 20,
    },

    // 3. Kepribadian
    {
      id: 'tdk-kep-1',
      kompetensi: 'Kepribadian',
      indikatorKinerja: 'Kematangan emosi, integritas, & keteladanan pendidik',
      tipe: 'studi_kasus',
      pertanyaan:
        'Saat siswa bersikap menantang atau terlambat berulang kali di kelas, respons yang mencerminkan kompetensi kepribadian pendidik yang matang adalah...',
      opsi: [
        {
          id: 'a',
          label: 'Menegur dengan nada tinggi di depan kelas agar memberi efek jera',
          nilaiSkor: 20,
          isCorrect: false,
        },
        {
          id: 'b',
          label: 'Tetap tenang menjaga wibawa, mengajak siswa berdialog empat mata usai sesi untuk memahami akar masalah dan menyepakati komitmen',
          nilaiSkor: 100,
          isCorrect: true,
        },
        {
          id: 'c',
          label: 'Membiarkan saja agar tidak terjadi konflik di kelas',
          nilaiSkor: 35,
          isCorrect: false,
        },
      ],
      bobotPoin: 20,
    },

    // 4. Digital
    {
      id: 'tdk-dig-1',
      kompetensi: 'Digital',
      indikatorKinerja: 'Integrasi LMS, media pembelajaran digital, & keamanan data siswa',
      tipe: 'pilihan_ganda',
      pertanyaan:
        'Praktik terbaik kompetensi digital pendidik dalam memanfaatkan Ruang LMS dan alat evaluasi daring adalah...',
      opsi: [
        {
          id: 'a',
          label: 'Mengunggah modul interaktif terstruktur sesuai CP/TP, menjaga privasi nilai siswa, dan memanfaatkan analitik kelas untuk bimbingan',
          nilaiSkor: 100,
          isCorrect: true,
        },
        {
          id: 'b',
          label: 'Membagikan seluruh daftar nilai dan catatan BK siswa di grup pesan terbuka',
          nilaiSkor: 15,
          isCorrect: false,
        },
        {
          id: 'c',
          label: 'Hanya menggunakan PDF foto buram tanpa interaksi kelas',
          nilaiSkor: 40,
          isCorrect: false,
        },
      ],
      bobotPoin: 20,
    },
    {
      id: 'tdk-dig-2',
      kompetensi: 'Digital',
      indikatorKinerja: 'Literasi produksi video & perangkat produktivitas ajar',
      tipe: 'skala_likert',
      pertanyaan:
        'Saya mampu merekam, mengulas potongan menit pembelajaran, serta mengelola materi/penugasan pada Ruang LMS sekolah secara mandiri.',
      opsi: [
        { id: '1', label: '1 · Masih Sangat Terbantu Orang Lain', nilaiSkor: 20 },
        { id: '2', label: '2 · Dasar', nilaiSkor: 45 },
        { id: '3', label: '3 · Cukup Mandiri', nilaiSkor: 70 },
        { id: '4', label: '4 · Mahir', nilaiSkor: 88 },
        { id: '5', label: '5 · Sangat Mahir & Bisa Membimbing Rekan', nilaiSkor: 100 },
      ],
      bobotPoin: 20,
    },

    // 5. Sosial
    {
      id: 'tdk-sos-1',
      kompetensi: 'Sosial',
      indikatorKinerja: 'Kolaborasi inklusif dengan orang tua, rekan sejawat, & masyarakat',
      tipe: 'pilihan_ganda',
      pertanyaan:
        'Ketika orang tua mengeluhkan anaknya kesulitan pada satu TP tertentu melalui Buku Penghubung/Portal Orang Tua, sikap sosial pendidik yang profesional adalah...',
      opsi: [
        {
          id: 'a',
          label: 'Merespons santun dan empatik, memvalidasi kendala belajar, dan berkolaborasi dengan Wali Kelas menyusun jadwal bimbingan belajar terarah',
          nilaiSkor: 100,
          isCorrect: true,
        },
        {
          id: 'b',
          label: 'Menyalahkan kurangnya pengawasan orang tua di rumah',
          nilaiSkor: 15,
          isCorrect: false,
        },
        {
          id: 'c',
          label: 'Menunda balasan hingga pembagian rapor akhir semester',
          nilaiSkor: 30,
          isCorrect: false,
        },
      ],
      bobotPoin: 20,
    },
    {
      id: 'tdk-ped-pgk-1',
      kompetensi: 'Pedagogik',
      indikatorKinerja: 'Pemilihan strategi pembelajaran berdiferensiasi multi-aspek (PG Kompleks)',
      tipe: 'pg_kompleks',
      pertanyaan:
        'Pilih SEMUA komponen yang wajib diperhatikan saat merancang pembelajaran berdiferensiasi di kelas heterogen:',
      opsi: [
        {
          id: 'a',
          label: 'Kesiapan belajar peserta didik berdasarkan asesmen diagnostik awal',
          nilaiSkor: 34,
          isCorrect: true,
        },
        {
          id: 'b',
          label: 'Minat serta profil gaya belajar (Visual/Auditori/Kinestetik)',
          nilaiSkor: 33,
          isCorrect: true,
        },
        {
          id: 'c',
          label: 'Menyeragamkan satu produk tugas identik tanpa opsi demonstrasi pemahaman',
          nilaiSkor: 0,
          isCorrect: false,
        },
        {
          id: 'd',
          label: 'Diferensiasi konten, proses pendampingan, dan produk hasil belajar',
          nilaiSkor: 33,
          isCorrect: true,
        },
      ],
      bobotPoin: 20,
    },
    {
      id: 'tdk-prof-match-1',
      kompetensi: 'Profesional',
      indikatorKinerja: 'Kesesuaian instrumen evaluasi dengan tujuan pembelajaran (Menjodohkan)',
      tipe: 'menjodohkan',
      pertanyaan:
        'Pasangkan jenis kebutuhan evaluasi kelas di sebelah kiri dengan instrumen/fitur yang paling tepat di sebelah kanan:',
      opsi: [],
      pasanganMenjodohkan: [
        {
          id: 'pair-1',
          kiri: 'Memetakan penguasaan prasyarat siswa sebelum bab baru',
          kanan: 'Asesmen Diagnostik Akademik',
        },
        {
          id: 'pair-2',
          kiri: 'Menilai keterampilan praktik & karakter lintas mata pelajaran',
          kanan: 'Projek Penguatan Profil Lulusan',
        },
        {
          id: 'pair-3',
          kiri: 'Menganalisis tingkat kemandirian & kendala belajar berkala',
          kanan: 'Refleksi Formatif & Buku Penghubung',
        },
      ],
      bobotPoin: 20,
    },
    {
      id: 'tdk-dig-img-1',
      kompetensi: 'Digital',
      indikatorKinerja: 'Dokumentasi bukti visual rancangan media ajar / papan refleksi kelas (Input Gambar)',
      tipe: 'input_gambar',
      pertanyaan:
        'Unggah foto/tangkapan layar contoh media ajar digital, rubrik, atau suasana fasilitasi kelas yang paling membanggakan beserta keterangan singkatnya:',
      opsi: [],
      bobotPoin: 20,
    },
    {
      id: 'tdk-sos-isian-1',
      kompetensi: 'Sosial',
      indikatorKinerja: 'Refleksi komunikasi kolaboratif dengan orang tua & rekan sejawat (Isian / Uraian)',
      tipe: 'isian_singkat',
      pertanyaan:
        'Tuliskan satu praktik kolaborasi paling berdampak yang pernah Anda lakukan bersama orang tua atau rekan guru untuk membantu siswa yang mengalami hambatan belajar:',
      opsi: [],
      bobotPoin: 20,
    },
  ];
}

export function buildDefaultTendikPackages(
  schoolId: string,
  tahunAjaran: string
): TendikTrainingPackage[] {
  const now = new Date().toISOString();
  const allQuestions = buildDefaultTendikQuestions();

  return [
    {
      id: `tdkpkg-all-${schoolId}`,
      schoolId,
      kodePaket: 'TDK-5KOMP-01',
      judul: 'Pelatihan & Asesmen 5 Kompetensi Tendik + Refleksi Video Mengajar',
      deskripsi:
        'Paket komprehensif mengukur 5 pilar kompetensi Guru/Wali Kelas (Profesional, Pedagogik, Kepribadian, Digital, Sosial) dengan variasi soal PG, PG Kompleks, Menjodohkan, Skala Likert, Studi Kasus, dan Unggah Bukti Gambar + refleksi video mengajar.',
      kompetensiList: ['Profesional', 'Pedagogik', 'Kepribadian', 'Digital', 'Sosial'],
      targetRoles: ['guru', 'walikelas'],
      wajibUploadVideo: true,
      instruksiVideo:
        'Unggah rekaman praktik mengajar / fasilitasi kelas / bimbingan belajar (durasi 3–15 menit, MP4/WebM), lalu tandai minimal 2 potongan menit penting untuk direfleksikan sesuai 5 kompetensi tendik.',
      minRefleksiSegmen: 2,
      durasiMenit: 45,
      status: 'Dirilis',
      isTemplateBuiltIn: true,
      pertanyaan: allQuestions,
      tahunAjaran,
      createdByName: 'Pengurus Lembaga',
      releasedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `tdkpkg-digped-${schoolId}`,
      schoolId,
      kodePaket: 'TDK-DIGPED-02',
      judul: 'Sertifikasi Internal: Pedagogik Diferensiasi & Literasi Digital LMS',
      deskripsi:
        'Fokus penguatan kompetensi Pedagogik dan Digital untuk implementasi Ruang LMS, modul multimedia, dan umpan balik formatif berbasis bukti video.',
      kompetensiList: ['Pedagogik', 'Digital'],
      targetRoles: ['guru', 'walikelas'],
      wajibUploadVideo: true,
      instruksiVideo:
        'Unggah potongan rekaman demonstrasi penggunaan LMS / media digital di kelas dan tuliskan refleksi pada menit transisi aktivitas siswa.',
      minRefleksiSegmen: 2,
      durasiMenit: 30,
      status: 'Dirilis',
      isTemplateBuiltIn: true,
      pertanyaan: allQuestions.filter(
        (q) => q.kompetensi === 'Pedagogik' || q.kompetensi === 'Digital'
      ),
      tahunAjaran,
      createdByName: 'Pengurus Lembaga',
      releasedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function evaluateTendikSubmission(
  pkg: TendikTrainingPackage,
  answers: DiagnosticAnswer[]
): {
  skorPerKompetensi: Partial<Record<TendikCompetency, number>>;
  skorAsesmenTotal: number;
} {
  const answerMap = new Map(answers.map((a) => [a.questionId, a]));
  const buckets = new Map<TendikCompetency, { earned: number; max: number }>();

  for (const q of pkg.pertanyaan) {
    const ans = answerMap.get(q.id);
    const maxQ = 100;
    let val = 0;

    if (q.tipe === 'pg_kompleks') {
      const selected = new Set(ans?.selectedOptionIds || []);
      const correctOpts = q.opsi.filter((o) => o.isCorrect);
      if (correctOpts.length > 0) {
        const hit = correctOpts.filter((o) => selected.has(o.id)).length;
        const wrongPicked = q.opsi.filter((o) => !o.isCorrect && selected.has(o.id)).length;
        const raw = Math.round(((hit - wrongPicked * 0.5) / correctOpts.length) * 100);
        val = Math.min(100, Math.max(0, raw));
      } else {
        const sumPicked = q.opsi
          .filter((o) => selected.has(o.id))
          .reduce((acc, o) => acc + (o.nilaiSkor || 0), 0);
        val = Math.min(100, Math.max(0, sumPicked));
      }
    } else if (q.tipe === 'menjodohkan') {
      const pairs = q.pasanganMenjodohkan || [];
      if (pairs.length > 0) {
        const mapAns = ans?.matchingAnswers || {};
        const matched = pairs.filter((p) => mapAns[p.id] && mapAns[p.id] === p.kanan).length;
        val = Math.round((matched / pairs.length) * 100);
      }
    } else if (q.tipe === 'input_gambar') {
      val = ans?.imageDataUrl && ans.imageDataUrl.trim().length > 10 ? 85 : 0;
    } else if (q.tipe === 'isian_singkat') {
      const rawText = (ans?.textAnswer || '').trim();
      const correctOpt = q.opsi.find((o) => o.isCorrect && o.label.trim());
      if (correctOpt) {
        const expected = correctOpt.label
          .split(/[|;,]/)
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        val = expected.includes(rawText.toLowerCase()) ? 100 : 0;
      } else {
        val = rawText.length >= 5 ? 85 : 0;
      }
    } else if (q.tipe === 'studi_kasus' && q.opsi.length === 0) {
      val = ans?.textAnswer && ans.textAnswer.trim().length >= 5 ? 85 : 0;
    } else {
      const picked = q.opsi.find((o) => o.id === ans?.selectedOptionId);
      val = picked ? picked.nilaiSkor : typeof ans?.scaleValue === 'number' ? ans.scaleValue : 0;
    }

    const prev = buckets.get(q.kompetensi) || { earned: 0, max: 0 };
    prev.earned += Math.min(maxQ, Math.max(0, val));
    prev.max += maxQ;
    buckets.set(q.kompetensi, prev);
  }

  const skorPerKompetensi: Partial<Record<TendikCompetency, number>> = {};
  let sumAll = 0;
  let countAll = 0;

  for (const comp of TENDIK_COMPETENCIES) {
    const b = buckets.get(comp);
    if (b && b.max > 0) {
      const score = Math.round((b.earned / b.max) * 100);
      skorPerKompetensi[comp] = score;
      sumAll += score;
      countAll++;
    }
  }

  const skorAsesmenTotal = countAll > 0 ? Math.round(sumAll / countAll) : 0;
  return { skorPerKompetensi, skorAsesmenTotal };
}
