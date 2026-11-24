import React, { useMemo, useRef, useState } from 'react';
import {
  Award,
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  Film,
  Image as ImageIcon,
  Layers,
  Play,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AppState,
  DiagnosticAnswer,
  TendikCompetency,
  TendikQuestion,
  TendikQuestionOption,
  TendikQuestionPair,
  TendikQuestionType,
  TendikSubmission,
  TendikTrainingPackage,
  TendikVideoReflectionSegment,
  UserAccount,
} from '../types';
import { TENDIK_COMPETENCIES } from '../data/templates';
import { formatTanggalID } from '../utils/academic';
import { downloadTendikTemplate, importTendikExcel } from '../utils/excel';

const TENDIK_TYPE_LABELS: Record<TendikQuestionType, string> = {
  pilihan_ganda: 'Pilihan Ganda (PG)',
  pg_kompleks: 'PG Kompleks (Multi-Jawaban)',
  menjodohkan: 'Menjodohkan (Pasangan)',
  skala_likert: 'Skala Likert (1–5)',
  input_gambar: 'Input Gambar / Bukti Visual',
  isian_singkat: 'Isian Singkat / Uraian',
  studi_kasus: 'Studi Kasus (PG / Uraian)',
};

const TENDIK_LIKERT_PRESET: TendikQuestionOption[] = [
  { id: '1', label: '1 · Belum Dilakukan', nilaiSkor: 20 },
  { id: '2', label: '2 · Jarang', nilaiSkor: 40 },
  { id: '3', label: '3 · Cukup Sering', nilaiSkor: 60 },
  { id: '4', label: '4 · Rutin', nilaiSkor: 80 },
  { id: '5', label: '5 · Sangat Konsisten & Terdokumentasi', nilaiSkor: 100 },
];

async function compressImageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 960;
        const scale = img.width > maxW ? maxW / img.width : 1;
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result || ''));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('Gagal memproses berkas gambar.'));
      img.src = String(reader.result || '');
    };
    reader.onerror = () => reject(new Error('Gagal membaca berkas gambar.'));
    reader.readAsDataURL(file);
  });
}

interface TendikViewProps {
  state: AppState;
  authToken: string;
  currentUser: UserAccount;
  onSavePackage: (payload: Partial<TendikTrainingPackage>, editId?: string) => Promise<boolean>;
  onDeletePackage: (id: string) => Promise<boolean>;
  onUploadVideo: (
    file: File
  ) => Promise<{ fileName: string; videoUrl: string; sizeBytes: number } | null>;
  onSubmitTendik: (payload: {
    packageId: string;
    answers: DiagnosticAnswer[];
    videoSourceType: 'upload' | 'url' | 'none';
    videoFileName?: string;
    videoUrl?: string;
    videoJudul?: string;
    videoDurasiDetik?: number;
    refleksiSegmen: TendikVideoReflectionSegment[];
  }) => Promise<TendikSubmission | null>;
  onReviewSubmission: (
    id: string,
    payload: {
      skorPraktikVideo?: number;
      statusReview: TendikSubmission['statusReview'];
      catatanPengurus: string;
      rekomendasiPelatihanLanjutan: string;
      segmentNotes: Record<string, string>;
    }
  ) => Promise<boolean>;
  onNotify: (msg: string, isError?: boolean) => void;
}

function formatSeconds(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

export const TendikView: React.FC<TendikViewProps> = ({
  state,
  authToken,
  currentUser,
  onSavePackage,
  onDeletePackage,
  onUploadVideo,
  onSubmitTendik,
  onReviewSubmission,
  onNotify,
}) => {
  const isAdmin = currentUser.role === 'admin';
  const packages = state.tendikPackages || [];
  const submissions = state.tendikSubmissions || [];

  const [adminTab, setAdminTab] = useState<'olah' | 'packages'>('olah');

  // Teacher / Admin submission modal
  const [activePkg, setActivePkg] = useState<TendikTrainingPackage | null>(null);
  const [answersMap, setAnswersMap] = useState<Record<string, DiagnosticAnswer>>({});
  const [videoSourceType, setVideoSourceType] = useState<'upload' | 'url' | 'none'>('upload');
  const [videoFileName, setVideoFileName] = useState<string>('');
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [videoJudul, setVideoJudul] = useState<string>('');
  const [videoDurasi, setVideoDurasi] = useState<number>(0);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [segments, setSegments] = useState<TendikVideoReflectionSegment[]>([]);
  const [submittingPkg, setSubmittingPkg] = useState(false);

  const teacherVideoRef = useRef<HTMLVideoElement | null>(null);
  const reviewVideoRef = useRef<HTMLVideoElement | null>(null);
  const tendikToolbarImportRef = useRef<HTMLInputElement | null>(null);
  const tendikBuilderImportRef = useRef<HTMLInputElement | null>(null);

  // Admin Review Modal
  const [reviewSub, setReviewSub] = useState<TendikSubmission | null>(null);
  const [revSkorVideo, setRevSkorVideo] = useState<number>(85);
  const [revStatus, setRevStatus] = useState<TendikSubmission['statusReview']>('Lulus Pelatihan');
  const [revCatatan, setRevCatatan] = useState('');
  const [revRekomendasi, setRevRekomendasi] = useState('');
  const [revSegNotes, setRevSegNotes] = useState<Record<string, string>>({});
  const [savingReview, setSavingReview] = useState(false);

  // Admin Package Builder Modal
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editPkgId, setEditPkgId] = useState<string | null>(null);
  const [pkgKode, setPkgKode] = useState('');
  const [pkgJudul, setPkgJudul] = useState('');
  const [pkgDeskripsi, setPkgDeskripsi] = useState('');
  const [pkgKompList, setPkgKompList] = useState<TendikCompetency[]>([...TENDIK_COMPETENCIES]);
  const [pkgWajibVideo, setPkgWajibVideo] = useState(true);
  const [pkgInstruksiVideo, setPkgInstruksiVideo] = useState(
    'Unggah rekaman praktik pembelajaran (MP4/WebM/MOV), lalu tandai potongan menit penting untuk refleksi kompetensi.'
  );
  const [pkgMinSegmen, setPkgMinSegmen] = useState(2);
  const [pkgDurasi, setPkgDurasi] = useState(40);
  const [pkgStatus, setPkgStatus] = useState<TendikTrainingPackage['status']>('Dirilis');
  const [pkgQuestions, setPkgQuestions] = useState<TendikQuestion[]>([]);
  const [savingPkg, setSavingPkg] = useState(false);

  const resolveStreamUrl = (subOrUrl?: { videoSourceType?: string; videoUrl?: string }) => {
    if (!subOrUrl?.videoUrl) return '';
    if (subOrUrl.videoSourceType === 'upload' && subOrUrl.videoUrl.startsWith('/api/tendik/video/')) {
      const sep = subOrUrl.videoUrl.includes('?') ? '&' : '?';
      return `${subOrUrl.videoUrl}${sep}token=${encodeURIComponent(authToken)}`;
    }
    return subOrUrl.videoUrl;
  };

  // Analytics across 5 competencies for Admin
  const adminAnalytics = useMemo(() => {
    const chartData = TENDIK_COMPETENCIES.map((comp) => {
      const vals = submissions
        .map((s) => s.skorPerKompetensi?.[comp])
        .filter((v): v is number => typeof v === 'number');
      const avg = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
      return { kompetensi: comp, rataSkor: avg };
    });

    const totalSubs = submissions.length;
    const lulusCount = submissions.filter((s) => s.statusReview === 'Lulus Pelatihan').length;
    const avgFinal =
      totalSubs > 0
        ? Math.round(
            submissions.reduce(
              (acc, s) => acc + (s.skorAkhirGabungan ?? s.skorAsesmenTotal ?? 0),
              0
            ) / totalSubs
          )
        : 0;

    return { chartData, totalSubs, lulusCount, avgFinal };
  }, [submissions]);

  // Open teacher runner modal
  const openRunPackage = (pkg: TendikTrainingPackage) => {
    const existing = submissions.find(
      (s) => s.packageId === pkg.id && s.userId === currentUser.id
    );
    const ansInit: Record<string, DiagnosticAnswer> = {};
    if (existing) {
      for (const a of existing.answers) ansInit[a.questionId] = a;
    }
    setAnswersMap(ansInit);
    setVideoSourceType(
      existing?.videoSourceType || (pkg.wajibUploadVideo ? 'upload' : 'none')
    );
    setVideoFileName(existing?.videoFileName || '');
    setVideoUrl(existing?.videoUrl || '');
    setVideoJudul(existing?.videoJudul || '');
    setVideoDurasi(existing?.videoDurasiDetik || 0);
    setSegments(
      existing?.refleksiSegmen?.length
        ? existing.refleksiSegmen
        : pkg.wajibUploadVideo
          ? [
              {
                id: `seg-${Date.now()}-1`,
                startDetik: 15,
                endDetik: 60,
                startLabel: '00:15',
                endLabel: '01:00',
                kompetensiTerkait: pkg.kompetensiList[0] || 'Pedagogik',
                aspekDiamati: 'Apersepsi & penyampaian tujuan pembelajaran',
                refleksiDiri: '',
                rencanaPerbaikan: '',
              },
            ]
          : []
    );
    setActivePkg(pkg);
  };

  const handleVideoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingVideo(true);
    try {
      const uploaded = await onUploadVideo(file);
      if (uploaded) {
        setVideoSourceType('upload');
        setVideoFileName(uploaded.fileName);
        setVideoUrl(uploaded.videoUrl);
        if (!videoJudul.trim()) {
          setVideoJudul(file.name.replace(/\.(mp4|webm|mov)$/i, ''));
        }
        onNotify('Video praktik berhasil diunggah ke server sekolah.');
      }
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleAddSegmentFromPlayer = () => {
    const cur = Math.floor(teacherVideoRef.current?.currentTime || 0);
    const end = cur + 30;
    setSegments((prev) => [
      ...prev,
      {
        id: `seg-${Date.now()}-${prev.length + 1}`,
        startDetik: cur,
        endDetik: end,
        startLabel: formatSeconds(cur),
        endLabel: formatSeconds(end),
        kompetensiTerkait: activePkg?.kompetensiList[0] || 'Pedagogik',
        aspekDiamati: '',
        refleksiDiri: '',
        rencanaPerbaikan: '',
      },
    ]);
  };

  const handleSubmitPackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePkg) return;
    const missingCount = activePkg.pertanyaan.filter((q) => {
      const a = answersMap[q.id];
      if (!a) return true;
      if (q.tipe === 'pg_kompleks') {
        return !a.selectedOptionIds || a.selectedOptionIds.length === 0;
      }
      if (q.tipe === 'menjodohkan') {
        const pairs = q.pasanganMenjodohkan || [];
        return pairs.some((p) => !a.matchingAnswers?.[p.id]);
      }
      if (q.tipe === 'input_gambar') {
        return !a.imageDataUrl || !a.imageDataUrl.trim();
      }
      if (q.tipe === 'isian_singkat' || (q.tipe === 'studi_kasus' && q.opsi.length === 0)) {
        return !a.textAnswer || !a.textAnswer.trim();
      }
      return !a.selectedOptionId;
    }).length;

    if (missingCount > 0) {
      onNotify(
        `Masih ada ${missingCount} butir asesmen kompetensi yang belum dilengkapi jawabannya.`,
        true
      );
      return;
    }

    const filledSegments = segments.filter((s) => s.refleksiDiri.trim());
    if (activePkg.wajibUploadVideo && (videoSourceType === 'none' || !videoUrl.trim())) {
      onNotify('Paket pelatihan ini mewajibkan unggahan video atau tautan video praktik.', true);
      return;
    }
    if (activePkg.minRefleksiSegmen > 0 && filledSegments.length < activePkg.minRefleksiSegmen) {
      onNotify(
        `Isi minimal ${activePkg.minRefleksiSegmen} segmen refleksi potongan menit video terlebih dahulu.`,
        true
      );
      return;
    }

    setSubmittingPkg(true);
    try {
      const saved = await onSubmitTendik({
        packageId: activePkg.id,
        answers: Object.values(answersMap),
        videoSourceType,
        videoFileName: videoSourceType === 'upload' ? videoFileName : undefined,
        videoUrl: videoSourceType === 'none' ? undefined : videoUrl,
        videoJudul: videoJudul.trim(),
        videoDurasiDetik: videoDurasi,
        refleksiSegmen: segments.filter((s) => s.refleksiDiri.trim()),
      });
      if (saved) {
        onNotify('Asesmen Tendik & refleksi potongan video berhasil dikirim ke Pengurus.');
        setActivePkg(null);
      }
    } finally {
      setSubmittingPkg(false);
    }
  };

  // Admin review modal helpers
  const openReviewModal = (sub: TendikSubmission) => {
    setReviewSub(sub);
    setRevSkorVideo(sub.skorPraktikVideo ?? 85);
    setRevStatus(
      sub.statusReview === 'Belum Ditinjau' ? 'Lulus Pelatihan' : sub.statusReview
    );
    setRevCatatan(sub.catatanPengurus || '');
    setRevRekomendasi(sub.rekomendasiPelatihanLanjutan || '');
    const map: Record<string, string> = {};
    for (const s of sub.refleksiSegmen) {
      map[s.id] = s.catatanPengurus || '';
    }
    setRevSegNotes(map);
  };

  const seekReviewVideo = (seconds: number) => {
    if (!reviewVideoRef.current) return;
    reviewVideoRef.current.currentTime = Math.max(0, seconds);
    reviewVideoRef.current.play().catch(() => {});
  };

  const handleSaveReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewSub) return;
    setSavingReview(true);
    try {
      const ok = await onReviewSubmission(reviewSub.id, {
        skorPraktikVideo: revSkorVideo,
        statusReview: revStatus,
        catatanPengurus: revCatatan.trim(),
        rekomendasiPelatihanLanjutan: revRekomendasi.trim(),
        segmentNotes: revSegNotes,
      });
      if (ok) {
        onNotify('Penilaian video & review kompetensi Tendik berhasil disimpan.');
        setReviewSub(null);
      }
    } finally {
      setSavingReview(false);
    }
  };

  // Package builder helpers
  const openCreatePackage = () => {
    setEditPkgId(null);
    setPkgKode(`TDK-KUSTOM-${(packages.length + 1).toString().padStart(2, '0')}`);
    setPkgJudul('Paket Pelatihan & Refleksi Video Kustom Tendik');
    setPkgDeskripsi(
      'Evaluasi kompetensi Profesional, Pedagogik, Kepribadian, Digital, dan Sosial disertai refleksi potongan menit video mengajar.'
    );
    setPkgKompList([...TENDIK_COMPETENCIES]);
    setPkgWajibVideo(true);
    setPkgInstruksiVideo(
      'Unggah video praktik pembelajaran (MP4/WebM), tandai potongan menit krusial dan tuliskan refleksinya.'
    );
    setPkgMinSegmen(2);
    setPkgDurasi(35);
    setPkgStatus('Dirilis');
    setPkgQuestions([
      {
        id: `tq-${Date.now()}-1`,
        kompetensi: 'Pedagogik',
        indikatorKinerja: 'Pembelajaran diferensiasi berbasis asesmen diagnostik',
        tipe: 'pilihan_ganda',
        pertanyaan:
          'Langkah awal setelah mengetahui hasil asesmen diagnostik siswa beragam pada satu kelas adalah...',
        opsi: [
          {
            id: 'a',
            label: 'Menyusun strategi diferensiasi aktivitas & kelompok bimbingan sesuai level kesiapan siswa',
            nilaiSkor: 100,
            isCorrect: true,
          },
          {
            id: 'b',
            label: 'Menggunakan pendekatan seragam tanpa penyesuaian',
            nilaiSkor: 35,
            isCorrect: false,
          },
        ],
        bobotPoin: 25,
      },
    ]);
    setBuilderOpen(true);
  };

  const openEditPackage = (pkg: TendikTrainingPackage) => {
    setEditPkgId(pkg.id);
    setPkgKode(pkg.kodePaket);
    setPkgJudul(pkg.judul);
    setPkgDeskripsi(pkg.deskripsi);
    setPkgKompList(pkg.kompetensiList);
    setPkgWajibVideo(pkg.wajibUploadVideo);
    setPkgInstruksiVideo(pkg.instruksiVideo);
    setPkgMinSegmen(pkg.minRefleksiSegmen);
    setPkgDurasi(pkg.durasiMenit);
    setPkgStatus(pkg.status);
    setPkgQuestions(JSON.parse(JSON.stringify(pkg.pertanyaan)));
    setBuilderOpen(true);
  };

  const handleAddTendikQuestion = () => {
    const newQ: TendikQuestion = {
      id: `tq-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      kompetensi: pkgKompList[0] || 'Profesional',
      indikatorKinerja: 'Indikator Kinerja Utama Tendik',
      tipe: 'pilihan_ganda',
      pertanyaan: '',
      opsi: [
        { id: 'a', label: 'Respons optimal (Skor 100)', nilaiSkor: 100, isCorrect: true },
        { id: 'b', label: 'Respons cukup (Skor 60)', nilaiSkor: 60, isCorrect: false },
        { id: 'c', label: 'Respons perlu pembinaan (Skor 25)', nilaiSkor: 25, isCorrect: false },
      ],
      bobotPoin: 20,
    };
    setPkgQuestions((prev) => [...prev, newQ]);
  };

  const handleSavePackageBuilder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pkgJudul.trim() || pkgKompList.length === 0) {
      onNotify('Judul paket dan minimal 1 kompetensi Tendik wajib dipilih.', true);
      return;
    }
    const validQs = pkgQuestions.filter((q) => q.pertanyaan.trim());
    if (validQs.length === 0) {
      onNotify('Tambahkan minimal 1 pertanyaan evaluasi.', true);
      return;
    }
    setSavingPkg(true);
    try {
      const ok = await onSavePackage(
        {
          kodePaket: pkgKode.trim(),
          judul: pkgJudul.trim(),
          deskripsi: pkgDeskripsi.trim(),
          kompetensiList: pkgKompList,
          targetRoles: ['guru', 'walikelas'],
          wajibUploadVideo: pkgWajibVideo,
          instruksiVideo: pkgInstruksiVideo.trim(),
          minRefleksiSegmen: pkgMinSegmen,
          durasiMenit: pkgDurasi,
          status: pkgStatus,
          pertanyaan: validQs,
        },
        editPkgId || undefined
      );
      if (ok) {
        onNotify(editPkgId ? 'Paket Tendik diperbarui.' : 'Paket Pelatihan Tendik baru disimpan.');
        setBuilderOpen(false);
      }
    } finally {
      setSavingPkg(false);
    }
  };

  const handleExportTendikCsv = () => {
    const headers = [
      'Nama Tendik',
      'Peran',
      'Paket Pelatihan',
      'Profesional',
      'Pedagogik',
      'Kepribadian',
      'Digital',
      'Sosial',
      'Skor Instrumen',
      'Skor Video Praktik',
      'Skor Akhir Gabungan',
      'Jumlah Segmen Refleksi',
      'Status Review',
      'Catatan Pengurus',
      'Rekomendasi Lanjutan',
    ];
    const esc = (v: unknown) => {
      const raw = String(v ?? '');
      const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const rows = submissions.map((s) =>
      [
        s.userName,
        s.userRole,
        s.packageJudul,
        s.skorPerKompetensi.Profesional ?? '-',
        s.skorPerKompetensi.Pedagogik ?? '-',
        s.skorPerKompetensi.Kepribadian ?? '-',
        s.skorPerKompetensi.Digital ?? '-',
        s.skorPerKompetensi.Sosial ?? '-',
        s.skorAsesmenTotal,
        s.skorPraktikVideo ?? '-',
        s.skorAkhirGabungan ?? s.skorAsesmenTotal,
        s.refleksiSegmen.length,
        s.statusReview,
        s.catatanPengurus || '-',
        s.rekomendasiPelatihanLanjutan || '-',
      ].map(esc)
    );
    const csv = [headers.map(esc).join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Olah_Hasil_Tendik_${state.settings.tahunAjaran.replace('/', '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            Asesmen & Pelatihan Tendik (5 Kompetensi + Refleksi Video)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Kompetensi Profesional, Pedagogik, Kepribadian, Digital, dan Sosial dengan unggahan video praktik serta refleksi potongan menit-menit pembelajaran.
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs shrink-0">
            <button
              type="button"
              onClick={() => setAdminTab('olah')}
              className={`px-3 py-1.5 rounded-md font-semibold whitespace-nowrap ${
                adminTab === 'olah' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Olah Hasil & Review Video ({submissions.length})
            </button>
            <button
              type="button"
              onClick={() => setAdminTab('packages')}
              className={`px-3 py-1.5 rounded-md font-semibold whitespace-nowrap ${
                adminTab === 'packages' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Kelola Paket Pelatihan ({packages.length})
            </button>
          </div>
        )}
      </div>

      {/* ADMIN TAB 1: OLAH HASIL & REVIEW VIDEO */}
      {isAdmin && adminTab === 'olah' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Total Submisi Tendik</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {adminAnalytics.totalSubs}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Guru & Wali Kelas peserta pelatihan
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Rata-rata Skor Gabungan</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                {adminAnalytics.avgFinal}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                50% Instrumen + 50% Video Praktik
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Lulus Pelatihan Internal</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {adminAnalytics.lulusCount}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Telah direview & disahkan Pengurus
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-700" />
                <h2 className="text-sm font-semibold text-slate-900">
                  Rata-Rata Capaian 5 Kompetensi Tendik Lembaga
                </h2>
              </div>
              <button
                type="button"
                onClick={handleExportTendikCsv}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" /> Ekspor Olah Hasil (.csv)
              </button>
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={adminAnalytics.chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="kompetensi" tick={{ fontSize: 11, fill: '#475569' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#475569' }} />
                  <Tooltip />
                  <Bar dataKey="rataSkor" name="Rata-rata Skor" fill="#047857" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Submissions Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {submissions.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Belum ada Guru / Wali Kelas yang mengumpulkan asesmen pelatihan & video refleksi.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Pendidik</th>
                      <th className="px-3 py-3">Paket Pelatihan</th>
                      <th className="px-3 py-3">Skor 5 Kompetensi</th>
                      <th className="px-3 py-3">Video & Refleksi</th>
                      <th className="px-3 py-3">Skor Akhir & Status</th>
                      <th className="px-4 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {submissions.map((sub) => (
                      <tr key={sub.id} className="hover:bg-slate-50/70 align-top">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{sub.userName}</div>
                          <div className="text-[11px] text-slate-500">
                            {sub.userRole === 'walikelas' ? 'Wali Kelas' : 'Guru Mapel'} ·{' '}
                            {formatTanggalID(sub.submittedAt.slice(0, 10))}
                          </div>
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-800 max-w-[200px]">
                          {sub.packageJudul}
                        </td>
                        <td className="px-3 py-3 font-mono text-[11px] tabular-nums text-slate-700">
                          {TENDIK_COMPETENCIES.map((c) => {
                            const val = sub.skorPerKompetensi?.[c];
                            return val !== undefined ? `${c.slice(0, 3)}: ${val}` : null;
                          })
                            .filter(Boolean)
                            .join(' · ')}
                        </td>
                        <td className="px-3 py-3">
                          <div className="inline-flex items-center gap-1 font-medium text-slate-800">
                            <Film className="w-3.5 h-3.5 text-emerald-700" />
                            <span>{sub.refleksiSegmen.length} potongan menit</span>
                          </div>
                          {sub.videoJudul && (
                            <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                              {sub.videoJudul}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-mono font-bold text-slate-900 tabular-nums">
                            {sub.skorAkhirGabungan ?? sub.skorAsesmenTotal}
                          </div>
                          <div
                            className={`text-[11px] font-semibold ${
                              sub.statusReview === 'Lulus Pelatihan'
                                ? 'text-emerald-700'
                                : sub.statusReview === 'Direview Pengurus'
                                  ? 'text-slate-700'
                                  : 'text-amber-700'
                            }`}
                          >
                            {sub.statusReview}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openReviewModal(sub)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-[11px] font-semibold hover:bg-emerald-800"
                          >
                            <Video className="w-3.5 h-3.5" /> Tinjau Video & Nilai
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PACKAGES LIST (Visible to Teachers & Admin Packages Tab) */}
      {(!isAdmin || adminTab === 'packages') && (
        <div className="space-y-4">
          {isAdmin && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-600">
                Susun paket pelatihan 5 kompetensi (bawaan, impor Excel, atau kustom) untuk dikerjakan di akun Guru/Wali Kelas.
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <input
                  ref={tendikToolbarImportRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    try {
                      const { questions, skippedCount } = await importTendikExcel(file);
                      if (questions.length === 0) {
                        onNotify('File Excel tidak memiliki butir soal Tendik yang valid.', true);
                        return;
                      }
                      openCreatePackage();
                      setPkgQuestions(questions);
                      onNotify(
                        `${questions.length} butir soal Tendik diimpor ke form paket baru${skippedCount > 0 ? ` (${skippedCount} baris dilewati)` : ''}.`
                      );
                    } catch {
                      onNotify('Gagal membaca file Excel soal pelatihan Tendik.', true);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => downloadTendikTemplate()}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" /> Unduh Template (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={() => tendikToolbarImportRef.current?.click()}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" /> Impor Soal (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={openCreatePackage}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" /> Buat Paket Pelatihan Kustom
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {packages.map((pkg) => {
              const mySub = submissions.find(
                (s) => s.packageId === pkg.id && s.userId === currentUser.id
              );
              return (
                <div
                  key={pkg.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-mono text-slate-500">
                        {pkg.kodePaket} · {pkg.durasiMenit} menit · {pkg.pertanyaan.length} butir
                      </span>
                      <span
                        className={`font-semibold ${
                          pkg.status === 'Dirilis'
                            ? 'text-emerald-700'
                            : pkg.status === 'Ditutup'
                              ? 'text-red-700'
                              : 'text-amber-700'
                        }`}
                      >
                        {pkg.status}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">{pkg.judul}</h3>
                    <p className="text-xs text-slate-600">{pkg.deskripsi}</p>
                    <div className="text-[11px] text-emerald-800 font-medium">
                      Kompetensi: {pkg.kompetensiList.join(' · ')}
                    </div>
                    {pkg.wajibUploadVideo && (
                      <div className="text-[11px] text-slate-500">
                        Wajib Video Praktik + minimal {pkg.minRefleksiSegmen} refleksi potongan menit
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-200 pt-3 space-y-2">
                    {!isAdmin && mySub && (
                      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" /> {mySub.statusReview}
                          </span>
                          <span className="font-mono font-bold text-slate-900 tabular-nums">
                            Skor: {mySub.skorAkhirGabungan ?? mySub.skorAsesmenTotal}
                          </span>
                        </div>
                        {mySub.catatanPengurus && (
                          <p className="text-[11px] text-slate-600">
                            <strong>Catatan Pengurus:</strong> {mySub.catatanPengurus}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => openRunPackage(pkg)}
                        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap"
                      >
                        <Play className="w-3.5 h-3.5" />
                        {mySub ? 'Perbarui Asesmen & Video' : 'Ikuti Asesmen & Unggah Video'}
                      </button>

                      {isAdmin && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditPackage(pkg)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Edit Paket
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const ok = await onDeletePackage(pkg.id);
                              if (ok) onNotify('Paket Tendik dihapus.');
                            }}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TEACHER / USER SUBMISSION MODAL (Quiz + Video Upload + Timestamp Reflection Segments) */}
      {activePkg && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-mono text-emerald-700 font-semibold">
                  {activePkg.kodePaket} · {activePkg.kompetensiList.join(' · ')}
                </div>
                <h3 className="text-sm font-bold text-slate-900">{activePkg.judul}</h3>
              </div>
              <button
                type="button"
                onClick={() => setActivePkg(null)}
                className="p-1 text-slate-400 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitPackage} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
              {/* Section A: Questions */}
              <div className="space-y-3">
                <div className="font-bold text-sm text-slate-900">
                  Bagian A — Instrumen 5 Kompetensi Tendik ({activePkg.pertanyaan.length} Butir)
                </div>
                {activePkg.pertanyaan.map((q, idx) => {
                  const ans = answersMap[q.id];
                  const pairs = q.pasanganMenjodohkan || [];
                  const rightChoices = Array.from(new Set(pairs.map((p) => p.kanan).filter(Boolean)));
                  return (
                    <div key={q.id} className="p-4 rounded-xl border border-slate-200 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                        <span className="font-semibold text-emerald-700">
                          Kompetensi {q.kompetensi} · {q.indikatorKinerja}
                        </span>
                        <span className="font-mono text-slate-600">
                          #{idx + 1} · {TENDIK_TYPE_LABELS[q.tipe] || q.tipe}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-slate-900">{q.pertanyaan}</div>
                      {q.gambarUrl &&
                        /^(https?:\/\/|data:image\/)/i.test(q.gambarUrl.trim()) && (
                          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 inline-block">
                            <img
                              src={q.gambarUrl.trim()}
                              alt={`Ilustrasi soal ${idx + 1}`}
                              className="max-h-48 rounded object-contain"
                            />
                          </div>
                        )}

                      {q.tipe === 'pg_kompleks' ? (
                        <div className="space-y-1.5">
                          <div className="text-[11px] text-slate-500">
                            Pilih semua jawaban yang benar / sesuai (boleh lebih dari satu):
                          </div>
                          {q.opsi.map((opt: TendikQuestionOption) => {
                            const selectedIds = ans?.selectedOptionIds || [];
                            const checked = selectedIds.includes(opt.id);
                            return (
                              <label
                                key={opt.id}
                                className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer ${
                                  checked
                                    ? 'border-emerald-700 bg-emerald-50/70 font-medium text-slate-900'
                                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    const nextIds = checked
                                      ? selectedIds.filter((id) => id !== opt.id)
                                      : [...selectedIds, opt.id];
                                    setAnswersMap((prev) => ({
                                      ...prev,
                                      [q.id]: {
                                        ...(prev[q.id] || { questionId: q.id }),
                                        questionId: q.id,
                                        selectedOptionIds: nextIds,
                                      },
                                    }));
                                  }}
                                  className="accent-emerald-700"
                                />
                                <span>{opt.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : q.tipe === 'menjodohkan' ? (
                        <div className="space-y-2">
                          <div className="text-[11px] text-slate-500">
                            Pasangkan setiap pernyataan di sisi kiri dengan jawaban paling tepat di sisi kanan:
                          </div>
                          {pairs.map((pair, pIdx) => (
                            <div
                              key={pair.id}
                              className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center p-2.5 rounded-lg border border-slate-200 bg-slate-50/60"
                            >
                              <div className="sm:col-span-6 text-xs font-medium text-slate-800">
                                {pIdx + 1}. {pair.kiri}
                              </div>
                              <div className="sm:col-span-6">
                                <select
                                  value={ans?.matchingAnswers?.[pair.id] || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setAnswersMap((prev) => ({
                                      ...prev,
                                      [q.id]: {
                                        ...(prev[q.id] || { questionId: q.id }),
                                        questionId: q.id,
                                        matchingAnswers: {
                                          ...(prev[q.id]?.matchingAnswers || {}),
                                          [pair.id]: val,
                                        },
                                      },
                                    }));
                                  }}
                                  className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800"
                                >
                                  <option value="">-- Pilih Pasangan --</option>
                                  {rightChoices.map((rc) => (
                                    <option key={rc} value={rc}>
                                      {rc}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : q.tipe === 'input_gambar' ? (
                        <div className="space-y-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/60">
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-300 bg-white font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">
                              <ImageIcon className="w-3.5 h-3.5 text-emerald-700" />
                              Unggah Foto / Tangkapan Layar
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={async (e) => {
                                  const f = e.target.files?.[0];
                                  if (!f) return;
                                  try {
                                    const dataUrl = await compressImageFileToDataUrl(f);
                                    setAnswersMap((prev) => ({
                                      ...prev,
                                      [q.id]: {
                                        ...(prev[q.id] || { questionId: q.id }),
                                        questionId: q.id,
                                        imageDataUrl: dataUrl,
                                      },
                                    }));
                                  } catch {
                                    onNotify('Gagal membaca berkas gambar.', true);
                                  }
                                }}
                                className="hidden"
                              />
                            </label>
                            <span className="text-[11px] text-slate-500">atau tautan gambar (HTTPS):</span>
                            <input
                              type="url"
                              value={
                                ans?.imageDataUrl && !ans.imageDataUrl.startsWith('data:')
                                  ? ans.imageDataUrl
                                  : ''
                              }
                              onChange={(e) =>
                                setAnswersMap((prev) => ({
                                  ...prev,
                                  [q.id]: {
                                    ...(prev[q.id] || { questionId: q.id }),
                                    questionId: q.id,
                                    imageDataUrl: e.target.value,
                                  },
                                }))
                              }
                              placeholder="https://..."
                              className="flex-1 min-w-[180px] h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                            />
                          </div>
                          {ans?.imageDataUrl && (
                            <div className="space-y-1.5">
                              <img
                                src={ans.imageDataUrl}
                                alt="Bukti visual tendik"
                                className="max-h-52 rounded-lg border border-slate-200 object-contain bg-white"
                              />
                            </div>
                          )}
                          <input
                            type="text"
                            value={ans?.imageCaption || ''}
                            onChange={(e) =>
                              setAnswersMap((prev) => ({
                                ...prev,
                                [q.id]: {
                                  ...(prev[q.id] || { questionId: q.id }),
                                  questionId: q.id,
                                  imageCaption: e.target.value,
                                },
                              }))
                            }
                            placeholder="Keterangan singkat gambar bukti / media ajar..."
                            className="w-full h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                          />
                        </div>
                      ) : q.tipe === 'isian_singkat' || (q.tipe === 'studi_kasus' && q.opsi.length === 0) ? (
                        <textarea
                          rows={3}
                          value={ans?.textAnswer || ''}
                          onChange={(e) =>
                            setAnswersMap((prev) => ({
                              ...prev,
                              [q.id]: {
                                ...(prev[q.id] || { questionId: q.id }),
                                questionId: q.id,
                                textAnswer: e.target.value,
                              },
                            }))
                          }
                          placeholder="Tuliskan jawaban uraian / studi kasus Anda secara ringkas dan konkret..."
                          className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs"
                        />
                      ) : (
                        <div className="space-y-1.5">
                          {q.opsi.map((opt: TendikQuestionOption) => {
                            const picked = ans?.selectedOptionId === opt.id;
                            return (
                              <label
                                key={opt.id}
                                className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer ${
                                  picked
                                    ? 'border-emerald-700 bg-emerald-50/70 font-medium text-slate-900'
                                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`tdk-${q.id}`}
                                  checked={picked}
                                  onChange={() =>
                                    setAnswersMap((prev) => ({
                                      ...prev,
                                      [q.id]: { questionId: q.id, selectedOptionId: opt.id },
                                    }))
                                  }
                                  className="accent-emerald-700"
                                />
                                <span>{opt.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Section B: Video Upload & Timestamp Reflections */}
              <div className="space-y-4 border-t border-slate-200 pt-5">
                <div>
                  <div className="font-bold text-sm text-slate-900">
                    Bagian B — Unggah Video Praktik & Refleksi Potongan Menit Video
                  </div>
                  <p className="text-slate-600 mt-0.5">{activePkg.instruksiVideo}</p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex items-center gap-1.5 font-medium">
                      <input
                        type="radio"
                        checked={videoSourceType === 'upload'}
                        onChange={() => setVideoSourceType('upload')}
                        className="accent-emerald-700"
                      />
                      Unggah Berkas Video (MP4/WebM/MOV)
                    </label>
                    <label className="inline-flex items-center gap-1.5 font-medium">
                      <input
                        type="radio"
                        checked={videoSourceType === 'url'}
                        onChange={() => setVideoSourceType('url')}
                        className="accent-emerald-700"
                      />
                      Tautan Video Eksternal (HTTPS)
                    </label>
                  </div>

                  {videoSourceType === 'upload' ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-slate-300 bg-white font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        {uploadingVideo ? 'Mengunggah Video...' : 'Pilih & Unggah Video'}
                        <input
                          type="file"
                          accept="video/mp4,video/webm,video/quicktime"
                          onChange={handleVideoFileChange}
                          className="hidden"
                        />
                      </label>
                      {videoFileName && (
                        <span className="font-mono text-emerald-700 font-semibold">
                          Terunggah: {videoFileName}
                        </span>
                      )}
                    </div>
                  ) : videoSourceType === 'url' ? (
                    <input
                      type="url"
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder="https://.../rekaman-mengajar.mp4"
                      className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3"
                    />
                  ) : null}

                  <input
                    type="text"
                    value={videoJudul}
                    onChange={(e) => setVideoJudul(e.target.value)}
                    placeholder="Judul Video Praktik Pembelajaran (Mis. Praktik Apersepsi Kelas 7 SMP)"
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3"
                  />

                  {videoUrl && (
                    <div className="space-y-2">
                      <video
                        ref={teacherVideoRef}
                        src={resolveStreamUrl({ videoSourceType, videoUrl })}
                        controls
                        onLoadedMetadata={(e) => {
                          const d = Math.round(e.currentTarget.duration || 0);
                          if (d > 0) setVideoDurasi(d);
                        }}
                        className="w-full max-h-64 rounded-lg bg-slate-900 border border-slate-200"
                      />
                      <button
                        type="button"
                        onClick={handleAddSegmentFromPlayer}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-emerald-700 text-white font-semibold hover:bg-emerald-800"
                      >
                        <Clock className="w-3.5 h-3.5" /> Tandai Menit Pemutar Saat Ini untuk Refleksi
                      </button>
                    </div>
                  )}
                </div>

                {/* Reflection Segments Editor */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">
                      Potongan Menit & Refleksi ({segments.length} segmen · min.{' '}
                      {activePkg.minRefleksiSegmen})
                    </span>
                    <button
                      type="button"
                      onClick={handleAddSegmentFromPlayer}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Plus className="w-3 h-3" /> Tambah Segmen Manual
                    </button>
                  </div>

                  {segments.map((seg, idx) => (
                    <div
                      key={seg.id}
                      className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono font-bold text-emerald-800">
                          Potongan Menit #{idx + 1} ({seg.startLabel} – {seg.endLabel})
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="text-[11px] text-slate-600">
                            Mulai (dtk):
                            <input
                              type="number"
                              min={0}
                              value={seg.startDetik}
                              onChange={(e) => {
                                const val = Math.max(0, Number(e.target.value) || 0);
                                setSegments((prev) =>
                                  prev.map((s, i) =>
                                    i === idx
                                      ? { ...s, startDetik: val, startLabel: formatSeconds(val) }
                                      : s
                                  )
                                );
                              }}
                              className="ml-1 w-16 h-7 rounded border border-slate-300 bg-white px-1.5 font-mono"
                            />
                          </label>
                          <label className="text-[11px] text-slate-600">
                            Selesai (dtk):
                            <input
                              type="number"
                              min={0}
                              value={seg.endDetik}
                              onChange={(e) => {
                                const val = Math.max(0, Number(e.target.value) || 0);
                                setSegments((prev) =>
                                  prev.map((s, i) =>
                                    i === idx
                                      ? { ...s, endDetik: val, endLabel: formatSeconds(val) }
                                      : s
                                  )
                                );
                              }}
                              className="ml-1 w-16 h-7 rounded border border-slate-300 bg-white px-1.5 font-mono"
                            />
                          </label>
                          <select
                            value={seg.kompetensiTerkait}
                            onChange={(e) =>
                              setSegments((prev) =>
                                prev.map((s, i) =>
                                  i === idx
                                    ? { ...s, kompetensiTerkait: e.target.value as TendikCompetency }
                                    : s
                                )
                              )
                            }
                            className="h-7 rounded border border-slate-300 bg-white px-2"
                          >
                            {TENDIK_COMPETENCIES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() =>
                              setSegments((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="text-red-600 hover:underline"
                          >
                            Hapus
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={seg.aspekDiamati}
                        onChange={(e) =>
                          setSegments((prev) =>
                            prev.map((s, i) =>
                              i === idx ? { ...s, aspekDiamati: e.target.value } : s
                            )
                          )
                        }
                        placeholder="Aspek pembelajaran yang terjadi pada potongan menit ini..."
                        className="w-full h-8 rounded border border-slate-300 bg-white px-2.5"
                      />
                      <textarea
                        rows={2}
                        value={seg.refleksiDiri}
                        onChange={(e) =>
                          setSegments((prev) =>
                            prev.map((s, i) =>
                              i === idx ? { ...s, refleksiDiri: e.target.value } : s
                            )
                          )
                        }
                        placeholder="Refleksi diri: apa yang sudah berjalan baik dan kendala pada menit ini? *"
                        className="w-full rounded border border-slate-300 bg-white p-2.5"
                      />
                      <input
                        type="text"
                        value={seg.rencanaPerbaikan}
                        onChange={(e) =>
                          setSegments((prev) =>
                            prev.map((s, i) =>
                              i === idx ? { ...s, rencanaPerbaikan: e.target.value } : s
                            )
                          )
                        }
                        placeholder="Rencana perbaikan ke depan pada kompetensi ini..."
                        className="w-full h-8 rounded border border-slate-300 bg-white px-2.5"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="sticky bottom-0 bg-white border-t border-slate-200 pt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActivePkg(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 font-medium text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingPkg}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-emerald-700 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {submittingPkg ? 'Mengirim...' : 'Kirim Asesmen & Video Refleksi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADMIN VIDEO & REFLECTION REVIEW MODAL */}
      {reviewSub && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-emerald-700" />
                <h3 className="text-sm font-bold text-slate-900">
                  Review Video & 5 Kompetensi Tendik: {reviewSub.userName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReviewSub(null)}
                className="p-1 text-slate-400 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {TENDIK_COMPETENCIES.map((c) => (
                  <div key={c} className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                    <div className="text-[11px] text-slate-500">{c}</div>
                    <div className="font-mono font-bold text-base text-slate-900 tabular-nums mt-0.5">
                      {reviewSub.skorPerKompetensi?.[c] ?? '-'}
                    </div>
                  </div>
                ))}
              </div>

              {reviewSub.videoUrl && (
                <div className="space-y-2">
                  <div className="font-semibold text-slate-900">
                    Pemutar Video Praktik ({reviewSub.videoJudul || reviewSub.videoFileName || 'Tautan Video'}) — Klik segmen menit di bawah untuk melompat langsung
                  </div>
                  <video
                    ref={reviewVideoRef}
                    src={resolveStreamUrl(reviewSub)}
                    controls
                    className="w-full max-h-72 rounded-xl bg-slate-900 border border-slate-200"
                  />
                </div>
              )}

              <div className="space-y-3">
                <div className="font-bold text-slate-900">
                  Refleksi Potongan Menit Video ({reviewSub.refleksiSegmen.length})
                </div>
                {[...reviewSub.refleksiSegmen]
                  .sort((a, b) => a.startDetik - b.startDetik)
                  .map((seg) => (
                    <div
                      key={seg.id}
                      className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => seekReviewVideo(seg.startDetik)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-700 text-white font-mono font-semibold hover:bg-emerald-800"
                        >
                          <Play className="w-3 h-3" /> {seg.startLabel} – {seg.endLabel}
                        </button>
                        <span className="font-semibold text-emerald-800">
                          Kompetensi {seg.kompetensiTerkait}
                        </span>
                      </div>
                      <div className="font-medium text-slate-800">{seg.aspekDiamati}</div>
                      <p className="text-slate-700">
                        <strong>Refleksi Pendidik:</strong> {seg.refleksiDiri}
                      </p>
                      {seg.rencanaPerbaikan && (
                        <p className="text-slate-600">
                          <strong>Rencana Perbaikan:</strong> {seg.rencanaPerbaikan}
                        </p>
                      )}
                      <input
                        type="text"
                        value={revSegNotes[seg.id] || ''}
                        onChange={(e) =>
                          setRevSegNotes((prev) => ({ ...prev, [seg.id]: e.target.value }))
                        }
                        placeholder="Catatan Pengurus khusus untuk potongan menit ini..."
                        className="w-full h-8 rounded border border-slate-300 bg-white px-2.5"
                      />
                    </div>
                  ))}
              </div>

              {/* Submitted Answers Breakdown including Images & Matching & PG Kompleks */}
              {(() => {
                const pkg = packages.find((p) => p.id === reviewSub.packageId);
                if (!pkg) return null;
                return (
                  <div className="space-y-2 border-t border-slate-200 pt-4">
                    <div className="font-bold text-slate-900">
                      Rincian Jawaban Instrumen Kompetensi ({pkg.pertanyaan.length} Butir)
                    </div>
                    <div className="space-y-2">
                      {pkg.pertanyaan.map((q, qIdx) => {
                        const ans = reviewSub.answers.find((a) => a.questionId === q.id);
                        return (
                          <div
                            key={q.id}
                            className="p-3 rounded-lg border border-slate-200 bg-white space-y-1.5"
                          >
                            <div className="text-[11px] text-slate-500">
                              #{qIdx + 1} · {q.kompetensi} · {TENDIK_TYPE_LABELS[q.tipe] || q.tipe}
                            </div>
                            <div className="font-semibold text-slate-900">{q.pertanyaan}</div>

                            {q.tipe === 'input_gambar' ? (
                              <div className="space-y-1.5 pt-1">
                                {ans?.imageDataUrl ? (
                                  <img
                                    src={ans.imageDataUrl}
                                    alt="Bukti visual tendik"
                                    className="max-h-56 rounded-lg border border-slate-200 object-contain bg-slate-50"
                                  />
                                ) : (
                                  <span className="text-red-600">Tidak ada gambar diunggah.</span>
                                )}
                                {ans?.imageCaption && (
                                  <div className="text-slate-600">
                                    Keterangan: {ans.imageCaption}
                                  </div>
                                )}
                              </div>
                            ) : q.tipe === 'menjodohkan' ? (
                              <div className="space-y-1 pt-1">
                                {(q.pasanganMenjodohkan || []).map((p) => {
                                  const pickedRight = ans?.matchingAnswers?.[p.id];
                                  const isMatch = pickedRight === p.kanan;
                                  return (
                                    <div key={p.id} className="flex flex-wrap gap-2 text-[11px]">
                                      <span className="text-slate-700">{p.kiri}</span>
                                      <span className="text-slate-400">→</span>
                                      <span
                                        className={`font-semibold ${
                                          isMatch ? 'text-emerald-700' : 'text-amber-700'
                                        }`}
                                      >
                                        {pickedRight || '(Kosong)'}
                                      </span>
                                      {!isMatch && (
                                        <span className="text-slate-400">(Kunci: {p.kanan})</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : q.tipe === 'pg_kompleks' ? (
                              <div className="text-emerald-800 font-medium">
                                Pilihan:{' '}
                                {q.opsi
                                  .filter((o) => (ans?.selectedOptionIds || []).includes(o.id))
                                  .map((o) => o.label)
                                  .join(' | ') || '(Tidak ada)'}
                              </div>
                            ) : q.tipe === 'isian_singkat' ? (
                              <div className="text-slate-800 bg-slate-50 p-2 rounded border border-slate-100">
                                {ans?.textAnswer || '(Kosong)'}
                              </div>
                            ) : (
                              <div className="text-emerald-800 font-medium">
                                Jawaban:{' '}
                                {q.opsi.find((o) => o.id === ans?.selectedOptionId)?.label ||
                                  '(Tidak diisi)'}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <form onSubmit={handleSaveReview} className="space-y-3 border-t border-slate-200 pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-800 mb-1">
                      Skor Video Praktik Mengajar (0–100) *
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      required
                      value={revSkorVideo}
                      onChange={(e) => setRevSkorVideo(Number(e.target.value) || 0)}
                      className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-800 mb-1">
                      Keputusan Status Review *
                    </label>
                    <select
                      value={revStatus}
                      onChange={(e) =>
                        setRevStatus(e.target.value as TendikSubmission['statusReview'])
                      }
                      className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5"
                    >
                      <option value="Direview Pengurus">Direview Pengurus (Perlu Penguatan)</option>
                      <option value="Lulus Pelatihan">Lulus Pelatihan Internal</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">
                    Catatan Evaluasi Pengurus
                  </label>
                  <textarea
                    rows={2}
                    value={revCatatan}
                    onChange={(e) => setRevCatatan(e.target.value)}
                    placeholder="Apresiasi kekuatan dan masukan konstruktif dari observasi video..."
                    className="w-full rounded-lg border border-slate-300 p-2.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">
                    Rekomendasi Pelatihan / Coaching Lanjutan
                  </label>
                  <input
                    type="text"
                    value={revRekomendasi}
                    onChange={(e) => setRevRekomendasi(e.target.value)}
                    placeholder="Mis. Pendampingan pemanfaatan media interaktif LMS / microteaching"
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setReviewSub(null)}
                    className="px-4 py-2 rounded-lg border border-slate-300 font-medium text-slate-700"
                  >
                    Tutup
                  </button>
                  <button
                    type="submit"
                    disabled={savingReview}
                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-emerald-700 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    {savingReview ? 'Menyimpan...' : 'Simpan Nilai & Sahkan Review'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN PACKAGE BUILDER MODAL */}
      {builderOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-700" />
                <h3 className="text-sm font-bold text-slate-900">
                  {editPkgId ? 'Edit Paket Pelatihan Tendik' : 'Buat Paket Pelatihan Tendik Kustom'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setBuilderOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePackageBuilder} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Kode Paket</label>
                  <input
                    type="text"
                    value={pkgKode}
                    onChange={(e) => setPkgKode(e.target.value.toUpperCase())}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Status Rilis</label>
                  <select
                    value={pkgStatus}
                    onChange={(e) =>
                      setPkgStatus(e.target.value as TendikTrainingPackage['status'])
                    }
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5"
                  >
                    <option value="Draft">Draft</option>
                    <option value="Dirilis">Dirilis ke Guru & Wali Kelas</option>
                    <option value="Ditutup">Ditutup</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Durasi (Menit)</label>
                  <input
                    type="number"
                    min={10}
                    value={pkgDurasi}
                    onChange={(e) => setPkgDurasi(Number(e.target.value) || 30)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block font-medium text-slate-700 mb-1">Judul Paket *</label>
                  <input
                    type="text"
                    required
                    value={pkgJudul}
                    onChange={(e) => setPkgJudul(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block font-medium text-slate-700 mb-1">Deskripsi</label>
                  <input
                    type="text"
                    value={pkgDeskripsi}
                    onChange={(e) => setPkgDeskripsi(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
              </div>

              <div>
                <div className="font-medium text-slate-700 mb-1.5">
                  Kompetensi yang Diukur (5 Pilar Tendik)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {TENDIK_COMPETENCIES.map((comp) => {
                    const active = pkgKompList.includes(comp);
                    return (
                      <button
                        key={comp}
                        type="button"
                        onClick={() =>
                          setPkgKompList((prev) =>
                            active ? prev.filter((c) => c !== comp) : [...prev, comp]
                          )
                        }
                        className={`px-3 py-1.5 rounded border text-xs font-semibold ${
                          active
                            ? 'bg-emerald-700 text-white border-emerald-700'
                            : 'bg-white text-slate-600 border-slate-300'
                        }`}
                      >
                        {comp}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="flex items-center gap-2 font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={pkgWajibVideo}
                    onChange={(e) => setPkgWajibVideo(e.target.checked)}
                    className="accent-emerald-700"
                  />
                  Wajib Unggah Video Praktik
                </label>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">
                    Minimal Segmen Refleksi Menit
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={pkgMinSegmen}
                    onChange={(e) => setPkgMinSegmen(Number(e.target.value) || 0)}
                    className="w-full h-8 rounded border border-slate-300 bg-white px-2 font-mono"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-[11px] text-slate-600 mb-1">
                    Instruksi Tugas Video
                  </label>
                  <input
                    type="text"
                    value={pkgInstruksiVideo}
                    onChange={(e) => setPkgInstruksiVideo(e.target.value)}
                    className="w-full h-8 rounded border border-slate-300 bg-white px-2.5"
                  />
                </div>
              </div>

              {/* Questions Editor */}
              <div className="space-y-3 border-t border-slate-200 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-slate-900">
                    Butir Instrumen Kompetensi ({pkgQuestions.length})
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={tendikBuilderImportRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        try {
                          const { questions, skippedCount } = await importTendikExcel(file);
                          if (questions.length === 0) {
                            onNotify('File Excel tidak memiliki butir soal yang valid.', true);
                            return;
                          }
                          setPkgQuestions(questions);
                          onNotify(
                            `${questions.length} butir soal Tendik dimuat dari Excel${skippedCount > 0 ? ` (${skippedCount} baris dilewati)` : ''}.`
                          );
                        } catch {
                          onNotify('Gagal mengimpor file Excel soal Tendik.', true);
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => downloadTendikTemplate(pkgQuestions, pkgJudul)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Download className="w-3.5 h-3.5" /> Template (.xlsx)
                    </button>
                    <button
                      type="button"
                      onClick={() => tendikBuilderImportRef.current?.click()}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Upload className="w-3.5 h-3.5" /> Impor (.xlsx)
                    </button>
                    <button
                      type="button"
                      onClick={handleAddTendikQuestion}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah Butir
                    </button>
                  </div>
                </div>

                <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
                  {pkgQuestions.map((q, qIdx) => (
                    <div
                      key={q.id}
                      className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono font-bold text-slate-700">#{qIdx + 1}</span>
                        <select
                          value={q.kompetensi}
                          onChange={(e) =>
                            setPkgQuestions((prev) =>
                              prev.map((item, i) =>
                                i === qIdx
                                  ? { ...item, kompetensi: e.target.value as TendikCompetency }
                                  : item
                              )
                            )
                          }
                          className="h-8 rounded border border-slate-300 bg-white px-2 font-semibold"
                        >
                          {TENDIK_COMPETENCIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        <select
                          value={q.tipe}
                          onChange={(e) => {
                            const nextType = e.target.value as TendikQuestionType;
                            setPkgQuestions((prev) =>
                              prev.map((item, i) => {
                                if (i !== qIdx) return item;
                                let nextOpsi = item.opsi;
                                let nextPairs = item.pasanganMenjodohkan;
                                if (nextType === 'skala_likert' && item.opsi.length !== 5) {
                                  nextOpsi = TENDIK_LIKERT_PRESET.map((o) => ({ ...o }));
                                } else if (nextType === 'menjodohkan') {
                                  nextPairs =
                                    item.pasanganMenjodohkan && item.pasanganMenjodohkan.length > 0
                                      ? item.pasanganMenjodohkan
                                      : [
                                          { id: `p-${Date.now()}-1`, kiri: 'Pernyataan 1', kanan: 'Pasangan 1' },
                                          { id: `p-${Date.now()}-2`, kiri: 'Pernyataan 2', kanan: 'Pasangan 2' },
                                        ];
                                } else if (
                                  nextType === 'input_gambar' ||
                                  nextType === 'isian_singkat'
                                ) {
                                  nextOpsi = [];
                                } else if (item.opsi.length === 0) {
                                  nextOpsi = [
                                    { id: 'a', label: 'Pilihan A (Benar)', nilaiSkor: 100, isCorrect: true },
                                    { id: 'b', label: 'Pilihan B', nilaiSkor: 40, isCorrect: false },
                                  ];
                                }
                                return {
                                  ...item,
                                  tipe: nextType,
                                  opsi: nextOpsi,
                                  pasanganMenjodohkan: nextPairs,
                                };
                              })
                            );
                          }}
                          className="h-8 rounded border border-slate-300 bg-white px-2 font-medium text-slate-800"
                        >
                          {Object.entries(TENDIK_TYPE_LABELS).map(([val, lbl]) => (
                            <option key={val} value={val}>
                              {lbl}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={q.indikatorKinerja}
                          onChange={(e) =>
                            setPkgQuestions((prev) =>
                              prev.map((item, i) =>
                                i === qIdx ? { ...item, indikatorKinerja: e.target.value } : item
                              )
                            )
                          }
                          placeholder="Indikator Kinerja"
                          className="flex-1 min-w-[160px] h-8 rounded border border-slate-300 bg-white px-2"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setPkgQuestions((prev) => prev.filter((_, i) => i !== qIdx))
                          }
                          className="text-red-600 hover:underline px-1.5"
                        >
                          Hapus
                        </button>
                      </div>

                      <textarea
                        rows={2}
                        value={q.pertanyaan}
                        onChange={(e) =>
                          setPkgQuestions((prev) =>
                            prev.map((item, i) =>
                              i === qIdx ? { ...item, pertanyaan: e.target.value } : item
                            )
                          )
                        }
                        placeholder="Tuliskan pertanyaan, instruksi gambar, atau studi kasus kompetensi..."
                        className="w-full rounded border border-slate-300 bg-white px-3 py-2"
                      />

                      {/* Optional question illustration image */}
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 cursor-pointer">
                          <ImageIcon className="w-3 h-3" />
                          Gambar Pendukung Soal (Opsional)
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              try {
                                const dataUrl = await compressImageFileToDataUrl(f);
                                setPkgQuestions((prev) =>
                                  prev.map((item, i) =>
                                    i === qIdx ? { ...item, gambarUrl: dataUrl } : item
                                  )
                                );
                              } catch {
                                onNotify('Gagal mengunggah gambar soal.', true);
                              }
                            }}
                            className="hidden"
                          />
                        </label>
                        {q.gambarUrl && (
                          <button
                            type="button"
                            onClick={() =>
                              setPkgQuestions((prev) =>
                                prev.map((item, i) =>
                                  i === qIdx ? { ...item, gambarUrl: undefined } : item
                                )
                              )
                            }
                            className="text-red-600 hover:underline"
                          >
                            Hapus Gambar Soal
                          </button>
                        )}
                      </div>

                      {/* ANSWER / OPTION EDITOR DIRECTLY UNDER EACH QUESTION */}
                      {q.tipe === 'menjodohkan' ? (
                        <div className="space-y-2 pt-2 border-t border-slate-200/80 pl-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-slate-700">
                              Pasangan Jawaban Menjodohkan (Kiri ↔ Kanan)
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setPkgQuestions((prev) =>
                                  prev.map((item, i) =>
                                    i === qIdx
                                      ? {
                                          ...item,
                                          pasanganMenjodohkan: [
                                            ...(item.pasanganMenjodohkan || []),
                                            {
                                              id: `pair-${Date.now()}-${(item.pasanganMenjodohkan || []).length}`,
                                              kiri: '',
                                              kanan: '',
                                            },
                                          ],
                                        }
                                      : item
                                  )
                                )
                              }
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline"
                            >
                              <Plus className="w-3 h-3" /> Tambah Pasangan
                            </button>
                          </div>
                          {(q.pasanganMenjodohkan || []).map((pair: TendikQuestionPair, pIdx) => (
                            <div key={pair.id} className="flex flex-wrap items-center gap-2">
                              <input
                                type="text"
                                value={pair.kiri}
                                onChange={(e) =>
                                  setPkgQuestions((prev) =>
                                    prev.map((item, i) =>
                                      i === qIdx
                                        ? {
                                            ...item,
                                            pasanganMenjodohkan: (
                                              item.pasanganMenjodohkan || []
                                            ).map((p, pi) =>
                                              pi === pIdx ? { ...p, kiri: e.target.value } : p
                                            ),
                                          }
                                        : item
                                    )
                                  )
                                }
                                placeholder={`Pernyataan Kiri ${pIdx + 1}`}
                                className="flex-1 min-w-[160px] h-8 rounded border border-slate-300 bg-white px-2"
                              />
                              <span className="text-slate-400">↔</span>
                              <input
                                type="text"
                                value={pair.kanan}
                                onChange={(e) =>
                                  setPkgQuestions((prev) =>
                                    prev.map((item, i) =>
                                      i === qIdx
                                        ? {
                                            ...item,
                                            pasanganMenjodohkan: (
                                              item.pasanganMenjodohkan || []
                                            ).map((p, pi) =>
                                              pi === pIdx ? { ...p, kanan: e.target.value } : p
                                            ),
                                          }
                                        : item
                                    )
                                  )
                                }
                                placeholder={`Pasangan Benar ${pIdx + 1}`}
                                className="flex-1 min-w-[160px] h-8 rounded border border-slate-300 bg-white px-2"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setPkgQuestions((prev) =>
                                    prev.map((item, i) =>
                                      i === qIdx
                                        ? {
                                            ...item,
                                            pasanganMenjodohkan: (
                                              item.pasanganMenjodohkan || []
                                            ).filter((_, pi) => pi !== pIdx),
                                          }
                                        : item
                                    )
                                  )
                                }
                                className="p-1 text-slate-400 hover:text-red-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : q.tipe === 'input_gambar' ? (
                        <div className="p-2.5 rounded border border-emerald-200 bg-emerald-50/50 text-[11px] text-emerald-900">
                          Mode <strong>Input Gambar</strong>: Peserta (Guru/Wali Kelas) akan mengunggah berkas gambar (PNG/JPG/WEBP) atau tautan foto + keterangan saat mengisi asesmen, dan gambar akan langsung tampil di panel Review Pengurus.
                        </div>
                      ) : q.tipe === 'isian_singkat' ? (
                        <div className="p-2.5 rounded border border-slate-200 bg-white text-[11px] text-slate-600 space-y-2">
                          <div>
                            Mode <strong>Isian Singkat / Uraian</strong>: Peserta akan menuliskan jawaban terbuka yang tampil pada panel Review Pengurus.
                          </div>
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">
                              Kunci Jawaban Singkat Otomatis (Opsional — pisahkan alternatif dengan |)
                            </label>
                            <input
                              type="text"
                              value={q.opsi.find((o) => o.isCorrect)?.label || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setPkgQuestions((prev) =>
                                  prev.map((item, i) =>
                                    i === qIdx
                                      ? {
                                          ...item,
                                          opsi: val.trim()
                                            ? [{ id: 'a', label: val, nilaiSkor: 100, isCorrect: true }]
                                            : [],
                                        }
                                      : item
                                  )
                                );
                              }}
                              placeholder="Kosongkan untuk refleksi terbuka; atau isi kunci jawaban..."
                              className="w-full h-8 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-800"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2 pt-2 border-t border-slate-200/80 pl-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-slate-700">
                              Opsi Jawaban &amp; Skor (0–100)
                              {q.tipe === 'pg_kompleks'
                                ? ' — Centang semua kunci jawaban benar'
                                : q.tipe === 'skala_likert'
                                  ? ' — Skala bertingkat'
                                  : ' — Centang kunci benar'}
                            </span>
                            <div className="flex items-center gap-2">
                              {q.tipe === 'skala_likert' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPkgQuestions((prev) =>
                                      prev.map((item, i) =>
                                        i === qIdx
                                          ? {
                                              ...item,
                                              opsi: TENDIK_LIKERT_PRESET.map((o) => ({ ...o })),
                                            }
                                          : item
                                      )
                                    )
                                  }
                                  className="text-[11px] font-medium text-slate-600 hover:underline"
                                >
                                  Isi Preset Likert 1–5
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setPkgQuestions((prev) =>
                                    prev.map((item, i) =>
                                      i === qIdx
                                        ? {
                                            ...item,
                                            opsi: [
                                              ...item.opsi,
                                              {
                                                id: `opt-${Date.now()}-${item.opsi.length}`,
                                                label: `Opsi ${item.opsi.length + 1}`,
                                                nilaiSkor: 50,
                                                isCorrect: false,
                                              },
                                            ],
                                          }
                                        : item
                                    )
                                  )
                                }
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline"
                              >
                                <Plus className="w-3 h-3" /> Tambah Opsi
                              </button>
                            </div>
                          </div>

                          {q.opsi.map((opt: TendikQuestionOption, oIdx) => (
                            <div key={opt.id} className="flex items-center gap-2">
                              {q.tipe !== 'skala_likert' && (
                                <input
                                  type={q.tipe === 'pg_kompleks' ? 'checkbox' : 'radio'}
                                  name={`builder-correct-${q.id}`}
                                  checked={Boolean(opt.isCorrect)}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setPkgQuestions((prev) =>
                                      prev.map((item, i) => {
                                        if (i !== qIdx) return item;
                                        return {
                                          ...item,
                                          opsi: item.opsi.map((o, oi) => {
                                            if (item.tipe === 'pg_kompleks') {
                                              return oi === oIdx
                                                ? { ...o, isCorrect: checked }
                                                : o;
                                            }
                                            return {
                                              ...o,
                                              isCorrect: oi === oIdx,
                                              nilaiSkor: oi === oIdx ? 100 : o.nilaiSkor === 100 ? 30 : o.nilaiSkor,
                                            };
                                          }),
                                        };
                                      })
                                    );
                                  }}
                                  title="Tandai sebagai kunci jawaban benar"
                                  className="accent-emerald-700 shrink-0"
                                />
                              )}
                              <input
                                type="text"
                                value={opt.label}
                                onChange={(e) =>
                                  setPkgQuestions((prev) =>
                                    prev.map((item, i) =>
                                      i === qIdx
                                        ? {
                                            ...item,
                                            opsi: item.opsi.map((o, oi) =>
                                              oi === oIdx ? { ...o, label: e.target.value } : o
                                            ),
                                          }
                                        : item
                                    )
                                  )
                                }
                                placeholder={`Label pilihan ${oIdx + 1}`}
                                className="flex-1 h-8 rounded border border-slate-300 bg-white px-2.5"
                              />
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={opt.nilaiSkor}
                                onChange={(e) =>
                                  setPkgQuestions((prev) =>
                                    prev.map((item, i) =>
                                      i === qIdx
                                        ? {
                                            ...item,
                                            opsi: item.opsi.map((o, oi) =>
                                              oi === oIdx
                                                ? {
                                                    ...o,
                                                    nilaiSkor: Math.min(
                                                      100,
                                                      Math.max(0, Number(e.target.value) || 0)
                                                    ),
                                                  }
                                                : o
                                            ),
                                          }
                                        : item
                                    )
                                  )
                                }
                                title="Skor opsi (0-100)"
                                className="w-16 h-8 rounded border border-slate-300 bg-white px-1.5 text-center font-mono"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setPkgQuestions((prev) =>
                                    prev.map((item, i) =>
                                      i === qIdx
                                        ? { ...item, opsi: item.opsi.filter((_, oi) => oi !== oIdx) }
                                        : item
                                    )
                                  )
                                }
                                className="p-1 text-slate-400 hover:text-red-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBuilderOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 font-medium text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingPkg}
                  className="px-5 py-2 rounded-lg bg-emerald-700 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {savingPkg ? 'Menyimpan...' : 'Simpan Paket Tendik'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
