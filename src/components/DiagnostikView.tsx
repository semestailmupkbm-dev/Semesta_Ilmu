import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  FileText,
  Image as ImageIcon,
  Layers,
  Play,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
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
  DiagnosticCategory,
  DiagnosticOption,
  DiagnosticPackage,
  DiagnosticQuestion,
  DiagnosticQuestionType,
  DiagnosticSubmission,
  TendikQuestionPair,
  UserAccount,
} from '../types';
import {
  buildAcademicDiagnosticQuestionsForSubject,
  buildNonAkademikDiagnosticQuestions,
  buildPemelajarMandiriQuestions,
  NON_AKADEMIK_DOMAINS,
  PEMELAJAR_MANDIRI_DOMAINS,
} from '../data/templates';
import { formatTanggalID, getSubjectsForClass } from '../utils/academic';
import { downloadDiagnostikTemplate, importDiagnostikExcel } from '../utils/excel';
import { generateDiagnostikReportPDF } from '../utils/pdf';

const DIAGNOSTIK_TYPE_LABELS: Record<DiagnosticQuestionType, string> = {
  pilihan_ganda: 'Pilihan Ganda (PG)',
  pg_kompleks: 'PG Kompleks (Multi-Jawaban)',
  menjodohkan: 'Menjodohkan (Pasangan)',
  skala_likert: 'Skala Likert (1–5)',
  input_gambar: 'Input Gambar / Bukti Visual',
  isian_singkat: 'Isian Singkat / Reflektif',
  studi_kasus: 'Studi Kasus',
};

const DIAGNOSTIK_LIKERT_PRESET: DiagnosticOption[] = [
  { id: '1', label: '1 · Tidak Pernah', nilaiSkor: 1 },
  { id: '2', label: '2 · Jarang', nilaiSkor: 2 },
  { id: '3', label: '3 · Kadang-kadang', nilaiSkor: 3 },
  { id: '4', label: '4 · Sering', nilaiSkor: 4 },
  { id: '5', label: '5 · Selalu', nilaiSkor: 5 },
];

async function compressImageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 850;
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
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => reject(new Error('Gagal memproses berkas gambar.'));
      img.src = String(reader.result || '');
    };
    reader.onerror = () => reject(new Error('Gagal membaca berkas gambar.'));
    reader.readAsDataURL(file);
  });
}

interface DiagnostikViewProps {
  state: AppState;
  currentUser: UserAccount;
  selectedClass: string;
  onSavePackage: (pkgPayload: Partial<DiagnosticPackage>, editId?: string) => Promise<boolean>;
  onReleasePackage: (
    id: string,
    status: DiagnosticPackage['status'],
    targetKelasList?: string[]
  ) => Promise<boolean>;
  onDeletePackage: (id: string) => Promise<boolean>;
  onSubmitAssessment: (
    packageId: string,
    answers: DiagnosticAnswer[],
    studentId?: string
  ) => Promise<DiagnosticSubmission | null>;
  onVerifySubmission: (
    id: string,
    catatanAnalisisPengurus: string,
    keputusanTindakLanjut: string
  ) => Promise<boolean>;
  onNotify: (msg: string, isError?: boolean) => void;
}

const DOMAIN_AKADEMIK_HINTS = [
  'Bilangan & Operasi',
  'Aljabar & Pola',
  'Geometri & Pengukuran',
  'Data & Peluang',
  'Literasi Pemahaman Teks',
  'Konsep Kunci Mapel',
];

export const DiagnostikView: React.FC<DiagnostikViewProps> = ({
  state,
  currentUser,
  selectedClass,
  onSavePackage,
  onReleasePackage,
  onDeletePackage,
  onSubmitAssessment,
  onVerifySubmission,
  onNotify,
}) => {
  const isAdmin = currentUser.role === 'admin';
  const isSiswa = currentUser.role === 'siswa';
  const isTeacherReadOnly =
    currentUser.role === 'guru' || currentUser.role === 'walikelas';

  const packages = state.diagnosticPackages || [];
  const submissions = state.diagnosticSubmissions || [];

  const linkedStudent = useMemo(() => {
    if (!isSiswa) return null;
    const sid = (currentUser.linkedStudentIds || [])[0];
    return state.students.find((s) => s.id === sid) || state.students[0] || null;
  }, [isSiswa, currentUser.linkedStudentIds, state.students]);

  const studentSubjects = useMemo(() => {
    if (!linkedStudent) return [];
    return getSubjectsForClass(
      state.subjects,
      linkedStudent.kelas,
      state.classDefs,
      linkedStudent.jurusan || 'Umum'
    );
  }, [linkedStudent, state.subjects, state.classDefs]);

  // Admin tabs
  const [adminTab, setAdminTab] = useState<'results' | 'packages'>('results');
  const [filterCategory, setFilterCategory] = useState<'Semua' | DiagnosticCategory>('Semua');
  const [filterKelas, setFilterKelas] = useState<string>('ALL');
  const [filterAttentionOnly, setFilterAttentionOnly] = useState(false);

  // Runner modal (used by Siswa, or Pengurus preview/test)
  const [activePackage, setActivePackage] = useState<DiagnosticPackage | null>(null);
  const [answersMap, setAnswersMap] = useState<Record<string, DiagnosticAnswer>>({});
  const [submittingQuiz, setSubmittingQuiz] = useState(false);
  const [previewStudentId, setPreviewStudentId] = useState<string>('');

  // Admin audit & verification modal
  const [inspectSub, setInspectSub] = useState<DiagnosticSubmission | null>(null);
  const [catatanAnalisis, setCatatanAnalisis] = useState('');
  const [keputusanTindak, setKeputusanTindak] = useState('');
  const [savingVerify, setSavingVerify] = useState(false);

  // Admin Package Builder Modal
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingPkgId, setEditingPkgId] = useState<string | null>(null);
  const [pkgKode, setPkgKode] = useState('');
  const [pkgJudul, setPkgJudul] = useState('');
  const [pkgDeskripsi, setPkgDeskripsi] = useState('');
  const [pkgKategori, setPkgKategori] = useState<DiagnosticCategory>('Akademik');
  const [pkgSubjectId, setPkgSubjectId] = useState<string>(state.subjects[0]?.id || '');
  const [pkgTargetClasses, setPkgTargetClasses] = useState<string[]>(state.classes);
  const [pkgDurasi, setPkgDurasi] = useState<number>(20);
  const [pkgStatus, setPkgStatus] = useState<DiagnosticPackage['status']>('Dirilis');
  const [pkgQuestions, setPkgQuestions] = useState<DiagnosticQuestion[]>([]);
  const [savingPkg, setSavingPkg] = useState(false);

  const diagToolbarImportRef = useRef<HTMLInputElement | null>(null);
  const diagBuilderImportRef = useRef<HTMLInputElement | null>(null);

  // Available packages for student
  const studentVisiblePackages = useMemo(() => {
    if (!isSiswa || !linkedStudent) return packages;
    const subjIdSet = new Set(studentSubjects.map((s) => s.id));
    return packages.filter((p) => {
      if (p.status !== 'Dirilis') return false;
      if (p.targetKelasList.length > 0 && !p.targetKelasList.includes(linkedStudent.kelas)) {
        return false;
      }
      if (p.kategori === 'Akademik' && p.subjectId && !subjIdSet.has(p.subjectId)) {
        return false;
      }
      return true;
    });
  }, [isSiswa, linkedStudent, packages, studentSubjects]);

  const filteredSubmissions = useMemo(() => {
    return submissions.filter((s) => {
      if (filterCategory !== 'Semua' && s.kategori !== filterCategory) return false;
      if (filterKelas !== 'ALL' && s.kelas !== filterKelas) return false;
      if (filterAttentionOnly) {
        const hasFlag =
          (s.indikatorPerluPerhatian?.length ?? 0) > 0 ||
          s.levelPenguasaan === 'Perlu Intervensi Dasar' ||
          s.levelPenguasaan === 'Berkembang / Perlu Penguatan';
        if (!hasFlag) return false;
      }
      return true;
    });
  }, [submissions, filterCategory, filterKelas, filterAttentionOnly]);

  // Analytics summaries for Admin
  const analyticsStats = useMemo(() => {
    const nonAkSubs = filteredSubmissions.filter((s) => s.kategori === 'Non-Akademik');
    const akSubs = filteredSubmissions.filter((s) => s.kategori === 'Akademik');
    const pmSubs = filteredSubmissions.filter((s) => s.kategori === 'Pemelajar Mandiri');

    const chartSourceSubs =
      filterCategory === 'Pemelajar Mandiri'
        ? pmSubs
        : nonAkSubs.length > 0
          ? nonAkSubs
          : pmSubs;

    const domainAgg = new Map<string, { sum: number; count: number }>();
    for (const sub of chartSourceSubs) {
      for (const d of sub.skorDomainNonAkademik || []) {
        const cur = domainAgg.get(d.domain) || { sum: 0, count: 0 };
        cur.sum += d.persen;
        cur.count++;
        domainAgg.set(d.domain, cur);
      }
    }
    const domainChartData = Array.from(domainAgg.entries()).map(([domain, v]) => ({
      domain: domain.replace('Latar Belakang ', 'Latar '),
      rataPersen: v.count > 0 ? Math.round(v.sum / v.count) : 0,
    }));

    const vakCounts = { Visual: 0, Auditori: 0, Kinestetik: 0 };
    for (const sub of nonAkSubs) {
      if (sub.profilGayaBelajar?.dominan) {
        vakCounts[sub.profilGayaBelajar.dominan]++;
      }
    }

    const avgAkademik =
      akSubs.length > 0
        ? Math.round(akSubs.reduce((acc, s) => acc + (s.skorAkademik || 0), 0) / akSubs.length)
        : 0;

    const pmSudahCount = pmSubs.filter(
      (s) => s.statusPemelajarMandiri === 'Sudah Pemelajar Mandiri'
    ).length;
    const avgKemandirian =
      pmSubs.length > 0
        ? Math.round(
            pmSubs.reduce((acc, s) => acc + (s.skorKemandirian ?? 0), 0) / pmSubs.length
          )
        : 0;

    const attentionCount = filteredSubmissions.filter(
      (s) =>
        (s.indikatorPerluPerhatian?.length ?? 0) > 0 ||
        s.levelPenguasaan === 'Perlu Intervensi Dasar' ||
        s.statusPemelajarMandiri === 'Belum Pemelajar Mandiri (Butuh Pendampingan)'
    ).length;

    const verifiedCount = filteredSubmissions.filter((s) => Boolean(s.verifiedAt)).length;

    return {
      total: filteredSubmissions.length,
      nonAkCount: nonAkSubs.length,
      akCount: akSubs.length,
      pmCount: pmSubs.length,
      pmSudahCount,
      avgKemandirian,
      avgAkademik,
      vakCounts,
      attentionCount,
      verifiedCount,
      domainChartData,
      isShowingPmChart:
        filterCategory === 'Pemelajar Mandiri' || (nonAkSubs.length === 0 && pmSubs.length > 0),
    };
  }, [filteredSubmissions, filterCategory]);

  // Open quiz runner
  const openQuizRunner = (pkg: DiagnosticPackage) => {
    const existingSub = isSiswa && linkedStudent
      ? submissions.find((s) => s.packageId === pkg.id && s.studentId === linkedStudent.id)
      : undefined;
    const initAnswers: Record<string, DiagnosticAnswer> = {};
    if (existingSub) {
      for (const a of existingSub.answers) {
        initAnswers[a.questionId] = a;
      }
    }
    setAnswersMap(initAnswers);
    if (isAdmin && !previewStudentId) {
      const candidate =
        state.students.find((s) => s.status === 'Aktif' && pkg.targetKelasList.includes(s.kelas)) ||
        state.students[0];
      setPreviewStudentId(candidate?.id || '');
    }
    setActivePackage(pkg);
  };

  const handleSubmitQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePackage) return;
    const missingRequired = activePackage.pertanyaan.filter((q) => {
      if (!q.wajib) return false;
      const ans = answersMap[q.id];
      if (!ans) return true;
      if (q.tipe === 'pg_kompleks') {
        return !ans.selectedOptionIds || ans.selectedOptionIds.length === 0;
      }
      if (q.tipe === 'menjodohkan') {
        const pairs = q.pasanganMenjodohkan || [];
        return pairs.some((p) => !ans.matchingAnswers?.[p.id]);
      }
      if (q.tipe === 'input_gambar') {
        return !ans.imageDataUrl || !ans.imageDataUrl.trim();
      }
      if (q.tipe === 'isian_singkat' || (q.tipe === 'studi_kasus' && q.opsi.length === 0)) {
        return !ans.textAnswer?.trim();
      }
      return !ans.selectedOptionId && typeof ans.scaleValue !== 'number';
    });
    if (missingRequired.length > 0) {
      onNotify(
        `Masih ada ${missingRequired.length} butir pertanyaan wajib yang belum dijawab.`,
        true
      );
      return;
    }

    setSubmittingQuiz(true);
    try {
      const payloadAnswers = Object.values(answersMap);
      const saved = await onSubmitAssessment(
        activePackage.id,
        payloadAnswers,
        isAdmin ? previewStudentId : undefined
      );
      if (saved) {
        onNotify('Asesmen diagnostik berhasil dikirim & diolah sistem.');
        setActivePackage(null);
      }
    } finally {
      setSubmittingQuiz(false);
    }
  };

  // Builder helpers
  const openCreateBuilder = (presetKategori: DiagnosticCategory, presetSubjectId?: string) => {
    setEditingPkgId(null);
    const subj = state.subjects.find((s) => s.id === (presetSubjectId || state.subjects[0]?.id));
    setPkgKategori(presetKategori);
    setPkgSubjectId(subj?.id || '');
    if (presetKategori === 'Pemelajar Mandiri') {
      setPkgKode(`DIAG-MANDIRI-${(packages.length + 1).toString().padStart(2, '0')}`);
      setPkgJudul('Asesmen Status & Derajat Pemelajar Mandiri Murid');
      setPkgDeskripsi(
        'Instrumen 6 dimensi Self-Regulated Learning untuk menentukan status pemelajar mandiri murid beserta derajat kemandiriannya (Derajat I–IV).'
      );
      setPkgTargetClasses(state.classes);
      setPkgQuestions(buildPemelajarMandiriQuestions());
    } else if (presetKategori === 'Non-Akademik') {
      setPkgKode(`DIAG-NONAK-${(packages.length + 1).toString().padStart(2, '0')}`);
      setPkgJudul('Asesmen Diagnostik Non-Akademik Kustom');
      setPkgDeskripsi(
        'Menggali kondisi psikologis, sosial-emosional, gaya belajar, minat, aktivitas di rumah, serta latar belakang keluarga peserta didik.'
      );
      setPkgTargetClasses(state.classes);
      setPkgQuestions(buildNonAkademikDiagnosticQuestions());
    } else {
      const targetSubj = subj || state.subjects[0];
      setPkgKode(`DIAG-${targetSubj?.kode || 'MAPEL'}-${(packages.length + 1).toString().padStart(2, '0')}`);
      setPkgJudul(targetSubj ? `Diagnostik Akademik: ${targetSubj.nama}` : 'Diagnostik Akademik Baru');
      setPkgDeskripsi(
        targetSubj
          ? `Pemetaan kesiapan konsep & kompetensi prasyarat mata pelajaran ${targetSubj.nama} berdasarkan CP/TP.`
          : ''
      );
      setPkgTargetClasses(targetSubj?.kelasList.length ? targetSubj.kelasList : [selectedClass]);
      setPkgQuestions(
        targetSubj ? buildAcademicDiagnosticQuestionsForSubject(targetSubj, 7) : []
      );
    }
    setPkgDurasi(20);
    setPkgStatus('Dirilis');
    setBuilderOpen(true);
  };

  const openEditBuilder = (pkg: DiagnosticPackage) => {
    setEditingPkgId(pkg.id);
    setPkgKode(pkg.kodePaket);
    setPkgJudul(pkg.judul);
    setPkgDeskripsi(pkg.deskripsi);
    setPkgKategori(pkg.kategori);
    setPkgSubjectId(pkg.subjectId || state.subjects[0]?.id || '');
    setPkgTargetClasses(pkg.targetKelasList || state.classes);
    setPkgDurasi(pkg.durasiMenit || 20);
    setPkgStatus(pkg.status);
    setPkgQuestions(JSON.parse(JSON.stringify(pkg.pertanyaan || [])));
    setBuilderOpen(true);
  };

  const handleLoadSubjectPresetQuestions = () => {
    const subj = state.subjects.find((s) => s.id === pkgSubjectId);
    if (!subj) return;
    setPkgQuestions(buildAcademicDiagnosticQuestionsForSubject(subj, 7));
    if (!pkgJudul.trim() || pkgJudul.startsWith('Diagnostik Akademik:')) {
      setPkgJudul(`Diagnostik Akademik: ${subj.nama}`);
    }
    setPkgKode(`DIAG-${subj.kode}-${(packages.length + 1).toString().padStart(2, '0')}`);
    if (subj.kelasList.length > 0) setPkgTargetClasses(subj.kelasList);
    onNotify(`Butir soal diagnostik otomatis dimuat dari mapel & CP/TP ${subj.nama}.`);
  };

  const handleAddQuestion = () => {
    const qId = `q-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const defaultDomain =
      pkgKategori === 'Pemelajar Mandiri'
        ? PEMELAJAR_MANDIRI_DOMAINS[0]
        : pkgKategori === 'Non-Akademik'
          ? 'Psikologis'
          : DOMAIN_AKADEMIK_HINTS[0];
    const newQ: DiagnosticQuestion = {
      id: qId,
      domain: defaultDomain,
      tipe: 'pilihan_ganda',
      pertanyaan: '',
      opsi: [
        { id: 'a', label: 'Pilihan A', isCorrect: pkgKategori === 'Akademik', nilaiSkor: 25 },
        { id: 'b', label: 'Pilihan B', isCorrect: false, nilaiSkor: pkgKategori === 'Akademik' ? 0 : 4 },
        { id: 'c', label: 'Pilihan C', isCorrect: false, nilaiSkor: pkgKategori === 'Akademik' ? 0 : 3 },
      ],
      bobotPoin: pkgKategori === 'Akademik' ? 25 : 5,
      wajib: true,
    };
    setPkgQuestions((prev) => [...prev, newQ]);
  };

  const updateQuestion = (idx: number, patch: Partial<DiagnosticQuestion>) => {
    setPkgQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };

  const updateOption = (qIdx: number, oIdx: number, patch: Partial<DiagnosticOption>) => {
    setPkgQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        return {
          ...q,
          opsi: q.opsi.map((o, j) => (j === oIdx ? { ...o, ...patch } : o)),
        };
      })
    );
  };

  const handleSaveBuilder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pkgJudul.trim()) {
      onNotify('Judul paket asesmen wajib diisi.', true);
      return;
    }
    const validQuestions = pkgQuestions.filter((q) => q.pertanyaan.trim());
    if (validQuestions.length === 0) {
      onNotify('Tambahkan minimal 1 pertanyaan yang terisi lengkap.', true);
      return;
    }
    setSavingPkg(true);
    try {
      const ok = await onSavePackage(
        {
          kodePaket: pkgKode.trim(),
          judul: pkgJudul.trim(),
          deskripsi: pkgDeskripsi.trim(),
          kategori: pkgKategori,
          subjectId: pkgKategori === 'Akademik' ? pkgSubjectId : undefined,
          targetKelasList: pkgTargetClasses,
          durasiMenit: pkgDurasi,
          status: pkgStatus,
          pertanyaan: validQuestions,
        },
        editingPkgId || undefined
      );
      if (ok) {
        onNotify(editingPkgId ? 'Paket asesmen diagnostik diperbarui.' : 'Paket asesmen baru disimpan.');
        setBuilderOpen(false);
      }
    } finally {
      setSavingPkg(false);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Tanggal',
      'NIS',
      'Nama Siswa',
      'Kelas',
      'Kategori',
      'Paket Asesmen',
      'Mapel',
      'Skor Akademik / Rata-rata',
      'Level / Gaya Belajar VAK',
      'Minat Dominan',
      'Indikator Perhatian',
      'Rekomendasi Sistem',
      'Keputusan Pengurus',
      'Catatan Pengurus',
      'Diverifikasi Oleh',
    ];
    const escape = (v: unknown) => {
      const raw = String(v ?? '');
      const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const rows = filteredSubmissions.map((s) => {
      const avgNonAk =
        s.skorDomainNonAkademik && s.skorDomainNonAkademik.length > 0
          ? Math.round(
              s.skorDomainNonAkademik.reduce((a, b) => a + b.persen, 0) /
                s.skorDomainNonAkademik.length
            )
          : '';
      return [
        formatTanggalID(s.submittedAt.slice(0, 10)),
        s.nis,
        s.studentName,
        s.kelas,
        s.kategori,
        s.packageJudul,
        s.subjectName || '-',
        s.kategori === 'Akademik'
          ? `${s.skorAkademik ?? 0}%`
          : s.kategori === 'Pemelajar Mandiri'
            ? `${s.skorKemandirian ?? 0}%`
            : `${avgNonAk}%`,
        s.kategori === 'Akademik'
          ? s.levelPenguasaan || '-'
          : s.kategori === 'Pemelajar Mandiri'
            ? `${s.statusPemelajarMandiri || '-'} (${s.derajatKemandirian || '-'})`
            : s.profilGayaBelajar
              ? `${s.profilGayaBelajar.dominan} (V:${s.profilGayaBelajar.visual}% A:${s.profilGayaBelajar.auditori}% K:${s.profilGayaBelajar.kinestetik}%)`
              : '-',
        s.minatDominan || '-',
        (s.indikatorPerluPerhatian || []).join('; ') || 'Aman',
        s.rekomendasiTindakLanjut,
        s.keputusanTindakLanjut || '-',
        s.catatanAnalisisPengurus || '-',
        s.verifiedByName || 'Belum Diverifikasi',
      ].map(escape);
    });
    const csv = [headers.map(escape).join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Olah_Hasil_Diagnostik_${state.settings.tahunAjaran.replace('/', '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = () => {
    if (filteredSubmissions.length === 0) {
      onNotify('Tidak ada hasil asesmen pada filter saat ini untuk dicetak.', true);
      return;
    }
    const label = `${filterCategory}${filterKelas !== 'ALL' ? ` · ${filterKelas}` : ''}`;
    const doc = generateDiagnostikReportPDF(state, filteredSubmissions, label);
    doc.save(`Laporan_Olah_Diagnostik_${state.settings.tahunAjaran.replace('/', '-')}.pdf`);
    onNotify('Laporan PDF Olah Hasil Diagnostik berhasil diunduh.');
  };

  const openVerifyModal = (sub: DiagnosticSubmission) => {
    setInspectSub(sub);
    setCatatanAnalisis(sub.catatanAnalisisPengurus || '');
    setKeputusanTindak(
      sub.keputusanTindakLanjut ||
        (sub.kategori === 'Akademik'
          ? sub.levelPenguasaan === 'Mahir / Pengayaan'
            ? 'Berikan Proyek Pengayaan & Pendalaman Materi'
            : 'Jadwalkan Bimbingan Penguatan CP/TP Prasyarat'
          : sub.kategori === 'Pemelajar Mandiri'
            ? sub.statusPemelajarMandiri === 'Sudah Pemelajar Mandiri'
              ? 'Berikan Proyek Riset Mandiri & Peran Tutor Sebaya'
              : 'Berikan Pendampingan Kontrak Belajar & Monitoring Mingguan'
            : (sub.indikatorPerluPerhatian?.length ?? 0) > 0
              ? 'Jadwalkan Konseling Wali Kelas/BK & Koordinasi Orang Tua'
              : 'Terapkan Diferensiasi Gaya Belajar Dominan di Kelas')
    );
  };

  const handleSaveVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectSub) return;
    setSavingVerify(true);
    try {
      const ok = await onVerifySubmission(
        inspectSub.id,
        catatanAnalisis.trim(),
        keputusanTindak.trim()
      );
      if (ok) {
        onNotify('Verifikasi analisis & keputusan tindak lanjut pengurus tersimpan.');
        setInspectSub(null);
      }
    } finally {
      setSavingVerify(false);
    }
  };

  // =====================================================================
  // RENDER: STUDENT VIEW (Login Siswa -> Kerjakan Paket Dirilis + Lihat Hasil)
  // =====================================================================
  if (isSiswa) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              Asesmen Diagnostik Akademik & Non-Akademik
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {linkedStudent
                ? `Peserta Didik: ${linkedStudent.nama} · NIS ${linkedStudent.nis} · ${linkedStudent.kelas} (${studentSubjects.length} Mata Pelajaran)`
                : 'Akun siswa tertaut'}
            </p>
          </div>
          <div className="text-xs text-slate-600 font-mono tabular-nums">
            Dirilis: {studentVisiblePackages.length} paket · Selesai: {submissions.length}
          </div>
        </div>

        {/* Available Packages for Student */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {studentVisiblePackages.length === 0 ? (
            <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
              Belum ada paket asesmen diagnostik yang dirilis Pengurus untuk kelas dan mata pelajaran Anda saat ini.
            </div>
          ) : (
            studentVisiblePackages.map((pkg) => {
              const mySub = submissions.find((s) => s.packageId === pkg.id);
              return (
                <div
                  key={pkg.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-slate-500">
                      <span>
                        {pkg.kodePaket} · {pkg.kategori}
                        {pkg.subjectName ? ` · ${pkg.subjectName}` : ''}
                      </span>
                      <span>{pkg.durasiMenit} menit · {pkg.pertanyaan.length} butir</span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">{pkg.judul}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">{pkg.deskripsi}</p>
                  </div>

                  {mySub ? (
                    <div className="border-t border-slate-200 pt-3 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                          <CheckCircle2 className="w-4 h-4" />
                          Sudah Dikerjakan ({formatTanggalID(mySub.submittedAt.slice(0, 10))})
                        </span>
                        <button
                          type="button"
                          onClick={() => openQuizRunner(pkg)}
                          className="text-slate-600 hover:text-slate-900 underline whitespace-nowrap"
                        >
                          Perbarui Jawaban
                        </button>
                      </div>
                      {mySub.kategori === 'Akademik' ? (
                        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-600">Skor Kesiapan Mapel</span>
                            <span className="font-mono font-bold text-slate-900 tabular-nums">
                              {mySub.skorAkademik ?? 0}% ({mySub.jumlahBenar}/{mySub.jumlahSoal})
                            </span>
                          </div>
                          <div className="font-semibold text-emerald-800">{mySub.levelPenguasaan}</div>
                          <p className="text-[11px] text-slate-600">{mySub.rekomendasiTindakLanjut}</p>
                        </div>
                      ) : mySub.kategori === 'Pemelajar Mandiri' ? (
                        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`font-bold ${
                                mySub.statusPemelajarMandiri === 'Sudah Pemelajar Mandiri'
                                  ? 'text-emerald-700'
                                  : 'text-amber-700'
                              }`}
                            >
                              {mySub.statusPemelajarMandiri}
                            </span>
                            <span className="font-mono font-bold text-slate-900 tabular-nums">
                              {mySub.skorKemandirian ?? 0}%
                            </span>
                          </div>
                          <div className="font-semibold text-slate-800">
                            {mySub.derajatKemandirian}
                          </div>
                          <p className="text-[11px] text-slate-600">{mySub.rekomendasiTindakLanjut}</p>
                        </div>
                      ) : (
                        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                          {mySub.profilGayaBelajar && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-600">Gaya Belajar Dominan</span>
                              <span className="font-semibold text-emerald-800">
                                {mySub.profilGayaBelajar.dominan} · V {mySub.profilGayaBelajar.visual}% / A{' '}
                                {mySub.profilGayaBelajar.auditori}% / K {mySub.profilGayaBelajar.kinestetik}%
                              </span>
                            </div>
                          )}
                          {mySub.minatDominan && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-600">Minat & Bakat Utama</span>
                              <span className="font-medium text-slate-900">{mySub.minatDominan}</span>
                            </div>
                          )}
                          <p className="text-[11px] text-slate-600">{mySub.rekomendasiTindakLanjut}</p>
                        </div>
                      )}
                      {mySub.catatanAnalisisPengurus && (
                        <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900">
                          <strong>Arahan Pengurus:</strong> {mySub.keputusanTindakLanjut || '-'}{' '}
                          {mySub.catatanAnalisisPengurus ? `— ${mySub.catatanAnalisisPengurus}` : ''}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="border-t border-slate-200 pt-3 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-xs text-amber-700 font-medium">
                        <Clock className="w-3.5 h-3.5" /> Belum Dikerjakan
                      </span>
                      <button
                        type="button"
                        onClick={() => openQuizRunner(pkg)}
                        className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap shrink-0"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Mulai Kerjakan
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Quiz Runner Modal */}
        {activePackage && (
          <QuizRunnerModal
            pkg={activePackage}
            answersMap={answersMap}
            setAnswersMap={setAnswersMap}
            submitting={submittingQuiz}
            onSubmit={handleSubmitQuiz}
            onClose={() => setActivePackage(null)}
          />
        )}
      </div>
    );
  }

  // =====================================================================
  // RENDER: ADMIN (PENGURUS) VIEW
  // =====================================================================
  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            {isTeacherReadOnly
              ? 'Hasil Diagnostik & Status Pemelajar Mandiri Siswa (Guru / Wali Kelas)'
              : 'Asesmen Diagnostik Akademik, Non-Akademik & Pemelajar Mandiri'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {isTeacherReadOnly
              ? 'Menampilkan olah hasil asesmen diagnostik akademik, non-akademik, serta status & derajat kemandirian murid sesuai kelas/mapel penugasan Anda.'
              : 'Kelola & rilis instrumen diagnostik ke Login Siswa, lalu olah hasil akademik, non-akademik, dan status derajat pemelajar mandiri secara akuntabel.'}
          </p>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setAdminTab('results')}
                className={`px-3 py-1.5 rounded-md font-semibold whitespace-nowrap ${
                  adminTab === 'results'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Olah Hasil & Audit ({submissions.length})
              </button>
              <button
                type="button"
                onClick={() => setAdminTab('packages')}
                className={`px-3 py-1.5 rounded-md font-semibold whitespace-nowrap ${
                  adminTab === 'packages'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Paket & Rilis ke Siswa ({packages.length})
              </button>
            </div>
          </div>
        )}
      </div>

      {(!isAdmin || adminTab === 'results') ? (
        <div className="space-y-6">
          {/* KPI Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Total Hasil Diagnostik</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {analyticsStats.total}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {analyticsStats.akCount} Ak · {analyticsStats.nonAkCount} Non-Ak · {analyticsStats.pmCount} Mandiri
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Pemelajar Mandiri (≥70%)</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                {analyticsStats.pmSudahCount}{' '}
                <span className="text-sm font-normal text-slate-400">/ {analyticsStats.pmCount}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Indeks rata-rata kemandirian: {analyticsStats.avgKemandirian}%
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Rata-rata Kesiapan Mapel & VAK</div>
              <div className="text-sm font-bold font-mono tabular-nums text-slate-900 mt-2">
                Akademik {analyticsStats.avgAkademik}% · V:{analyticsStats.vakCounts.Visual} A:{analyticsStats.vakCounts.Auditori} K:{analyticsStats.vakCounts.Kinestetik}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Basis strategi diferensiasi kelas
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Perlu Pendampingan / Terverifikasi</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-amber-700 mt-1">
                {analyticsStats.attentionCount}{' '}
                <span className="text-sm font-normal text-slate-400">
                  / {analyticsStats.verifiedCount} sah
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Indikator psikologis / kemandirian / intervensi
              </div>
            </div>
          </div>

          {/* Domain Chart */}
          {analyticsStats.domainChartData.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-emerald-700" />
                  <h2 className="text-sm font-semibold text-slate-900">
                    {analyticsStats.isShowingPmChart
                      ? 'Rekapitulasi 6 Dimensi Kemandirian Belajar (SRL %)'
                      : 'Rekapitulasi Indeks Kesiapan 6 Dimensi Non-Akademik (%)'}
                  </h2>
                </div>
                <span className="text-[11px] text-slate-500 font-mono">
                  Skala 0–100% terstandar instrumen
                </span>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analyticsStats.domainChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="domain" tick={{ fontSize: 11, fill: '#475569' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#475569' }} />
                    <Tooltip />
                    <Bar dataKey="rataPersen" name="Rata-rata Indeks (%)" fill="#047857" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Filter + Export Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value as 'Semua' | DiagnosticCategory)}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 font-medium text-slate-800"
              >
                <option value="Semua">Semua Kategori</option>
                <option value="Pemelajar Mandiri">Pemelajar Mandiri (Status & Derajat)</option>
                <option value="Akademik">Akademik (Mapel)</option>
                <option value="Non-Akademik">Non-Akademik (6 Dimensi)</option>
              </select>
              <select
                value={filterKelas}
                onChange={(e) => setFilterKelas(e.target.value)}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 font-medium text-slate-800"
              >
                <option value="ALL">Semua Kelas</option>
                {state.classes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <label className="inline-flex items-center gap-2 px-3 h-9 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterAttentionOnly}
                  onChange={(e) => setFilterAttentionOnly(e.target.checked)}
                  className="accent-emerald-700"
                />
                <span className="text-slate-700 font-medium">Hanya yang perlu pendampingan</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" /> Ekspor CSV
              </button>
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap shrink-0"
              >
                <FileText className="w-3.5 h-3.5" /> Unduh Laporan PDF Resmi
              </button>
            </div>
          </div>

          {/* Submissions Audit Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {filteredSubmissions.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Belum ada pengumpulan asesmen diagnostik pada filter ini.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Peserta Didik</th>
                      <th className="px-3 py-3">Paket & Kategori</th>
                      <th className="px-3 py-3">Hasil Terolah</th>
                      <th className="px-4 py-3">Rekomendasi & Indikator</th>
                      <th className="px-3 py-3">Verifikasi Pengurus</th>
                      <th className="px-4 py-3 text-right">Audit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredSubmissions.map((sub) => {
                      const hasWarning =
                        (sub.indikatorPerluPerhatian?.length ?? 0) > 0 ||
                        sub.levelPenguasaan === 'Perlu Intervensi Dasar';
                      return (
                        <tr key={sub.id} className="hover:bg-slate-50/70 align-top">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">{sub.studentName}</div>
                            <div className="font-mono text-[11px] text-slate-500">
                              {sub.kelas} · NIS {sub.nis}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-medium text-slate-900">{sub.packageJudul}</div>
                            <div className="text-[11px] text-slate-500">
                              {sub.kategori}
                              {sub.subjectName ? ` · ${sub.subjectName}` : ''} ·{' '}
                              {formatTanggalID(sub.submittedAt.slice(0, 10))}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            {sub.kategori === 'Akademik' ? (
                              <div>
                                <div className="font-mono font-bold text-slate-900 tabular-nums">
                                  {sub.skorAkademik ?? 0}% ({sub.jumlahBenar}/{sub.jumlahSoal})
                                </div>
                                <div
                                  className={`text-[11px] font-semibold ${
                                    sub.levelPenguasaan === 'Mahir / Pengayaan' ||
                                    sub.levelPenguasaan === 'Cakap / Siap Reguler'
                                      ? 'text-emerald-700'
                                      : 'text-amber-700'
                                  }`}
                                >
                                  {sub.levelPenguasaan}
                                </div>
                              </div>
                            ) : sub.kategori === 'Pemelajar Mandiri' ? (
                              <div className="space-y-0.5">
                                <div className="font-mono font-bold text-slate-900 tabular-nums">
                                  Indeks {sub.skorKemandirian ?? 0}%
                                </div>
                                <div
                                  className={`text-[11px] font-semibold ${
                                    sub.statusPemelajarMandiri === 'Sudah Pemelajar Mandiri'
                                      ? 'text-emerald-700'
                                      : 'text-amber-700'
                                  }`}
                                >
                                  {sub.statusPemelajarMandiri}
                                </div>
                                <div className="text-[11px] text-slate-600">
                                  {sub.derajatKemandirian}
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-0.5">
                                <div className="font-semibold text-emerald-800">
                                  Gaya: {sub.profilGayaBelajar?.dominan || '-'}
                                </div>
                                <div className="text-[11px] text-slate-600">
                                  Minat: {sub.minatDominan || '-'}
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 max-w-xs space-y-1">
                            {hasWarning && (
                              <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>
                                  {(sub.indikatorPerluPerhatian || []).join(', ') ||
                                    'Perlu Intervensi Dasar'}
                                </span>
                              </div>
                            )}
                            <p className="text-[11px] text-slate-600 leading-snug">
                              {sub.rekomendasiTindakLanjut}
                            </p>
                          </td>
                          <td className="px-3 py-3">
                            {sub.verifiedAt ? (
                              <div className="space-y-0.5">
                                <div className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                                  <ShieldCheck className="w-3.5 h-3.5" /> Sah ({sub.verifiedByName})
                                </div>
                                <div className="text-[11px] text-slate-600">
                                  {sub.keputusanTindakLanjut}
                                </div>
                              </div>
                            ) : (
                              <span className="text-amber-700 font-medium">Menunggu Verifikasi</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => openVerifyModal(sub)}
                              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              {isAdmin ? 'Periksa & Sahkan' : 'Lihat Detail'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* TAB 2: Kelola & Rilis Paket ke Siswa */
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-600">
              Buat paket kustom, impor soal Excel (7 tipe), atau muat instrumen bawaan untuk dirilis langsung ke Login Siswa.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={diagToolbarImportRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  try {
                    const { questions, skippedCount } = await importDiagnostikExcel(file);
                    if (questions.length === 0) {
                      onNotify('File Excel tidak berisi butir soal diagnostik yang valid.', true);
                      return;
                    }
                    openCreateBuilder('Akademik');
                    setPkgQuestions(questions);
                    onNotify(
                      `${questions.length} butir soal diagnostik diimpor ke paket baru${skippedCount > 0 ? ` (${skippedCount} baris dilewati)` : ''}.`
                    );
                  } catch {
                    onNotify('Gagal membaca file Excel soal diagnostik.', true);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => downloadDiagnostikTemplate(undefined, 'Akademik')}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" /> Unduh Template (.xlsx)
              </button>
              <button
                type="button"
                onClick={() => diagToolbarImportRef.current?.click()}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <Upload className="w-3.5 h-3.5" /> Impor Soal (.xlsx)
              </button>
              <button
                type="button"
                onClick={() => openCreateBuilder('Pemelajar Mandiri')}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-emerald-700 bg-emerald-50 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> Paket Pemelajar Mandiri
              </button>
              <button
                type="button"
                onClick={() => openCreateBuilder('Non-Akademik')}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> Paket Non-Akademik
              </button>
              <button
                type="button"
                onClick={() => openCreateBuilder('Akademik')}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" /> Paket Akademik / Mapel
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {packages.map((pkg) => {
              const subCount = submissions.filter((s) => s.packageId === pkg.id).length;
              return (
                <div
                  key={pkg.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-mono text-slate-500">
                        {pkg.kodePaket} · {pkg.kategori}
                        {pkg.subjectName ? ` · ${pkg.subjectName}` : ''}
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
                    <div className="text-[11px] text-slate-500 font-mono">
                      Target: {pkg.targetKelasList.join(', ')} · {pkg.pertanyaan.length} butir ·{' '}
                      {subCount} respons siswa
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {pkg.status !== 'Dirilis' ? (
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await onReleasePackage(pkg.id, 'Dirilis');
                            if (ok) onNotify(`Paket ${pkg.kodePaket} dirilis ke Login Siswa.`);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-700 text-white text-[11px] font-semibold hover:bg-emerald-800 whitespace-nowrap"
                        >
                          <Send className="w-3 h-3" /> Rilis ke Siswa
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await onReleasePackage(pkg.id, 'Ditutup');
                            if (ok) onNotify(`Paket ${pkg.kodePaket} ditutup.`);
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-[11px] font-semibold hover:bg-amber-100 whitespace-nowrap"
                        >
                          Tutup Rilis
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openQuizRunner(pkg)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        Uji / Simulasi
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditBuilder(pkg)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Edit Butir
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await onDeletePackage(pkg.id);
                          if (ok) onNotify('Paket asesmen dihapus.');
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"
                        title="Hapus paket"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Admin Audit & Verification Drawer/Modal */}
      {inspectSub && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-700" />
                <h3 className="text-sm font-bold text-slate-900">
                  Audit & Verifikasi Hasil: {inspectSub.studentName} ({inspectSub.kelas})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectSub(null)}
                className="p-1 text-slate-400 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3.5">
                <div>
                  <span className="text-slate-500 block">Paket Instrumen</span>
                  <span className="font-semibold text-slate-900">{inspectSub.packageJudul}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Kategori & Mapel</span>
                  <span className="font-semibold text-slate-900">
                    {inspectSub.kategori}
                    {inspectSub.subjectName ? ` · ${inspectSub.subjectName}` : ''}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Waktu Kirim</span>
                  <span className="font-mono text-slate-900">
                    {formatTanggalID(inspectSub.submittedAt.slice(0, 10))}
                  </span>
                </div>
              </div>

              {inspectSub.kategori === 'Akademik' ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200">
                    <div>
                      <div className="text-slate-500">Level Penguasaan Awal</div>
                      <div className="text-sm font-bold text-emerald-800">
                        {inspectSub.levelPenguasaan}
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="text-xl font-bold text-slate-900 tabular-nums">
                        {inspectSub.skorAkademik ?? 0}%
                      </div>
                      <div className="text-slate-500">
                        Benar {inspectSub.jumlahBenar}/{inspectSub.jumlahSoal}
                      </div>
                    </div>
                  </div>
                  {(inspectSub.breakdownPerDomain?.length ?? 0) > 0 && (
                    <div className="border border-slate-200 rounded-lg divide-y divide-slate-200">
                      {inspectSub.breakdownPerDomain!.map((b) => (
                        <div key={b.domain} className="px-3.5 py-2 flex items-center justify-between">
                          <span className="font-medium text-slate-800">{b.domain}</span>
                          <span className="font-mono tabular-nums text-slate-700">
                            {b.benar}/{b.total} ({b.persen}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : inspectSub.kategori === 'Pemelajar Mandiri' ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-lg border border-emerald-200 bg-emerald-50/60 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-slate-600">Status & Derajat Pemelajar Mandiri (SRL)</div>
                      <div
                        className={`text-sm font-bold ${
                          inspectSub.statusPemelajarMandiri === 'Sudah Pemelajar Mandiri'
                            ? 'text-emerald-800'
                            : 'text-amber-800'
                        }`}
                      >
                        {inspectSub.statusPemelajarMandiri}
                      </div>
                      <div className="text-xs font-semibold text-slate-800 mt-0.5">
                        {inspectSub.derajatKemandirian}
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="text-2xl font-bold text-slate-900 tabular-nums">
                        {inspectSub.skorKemandirian ?? 0}%
                      </div>
                      <div className="text-[11px] text-slate-500">Ambang Mandiri ≥ 70%</div>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-[11px] text-slate-700">
                    <strong>Formula Akuntabilitas:</strong> Derajat IV (85–100%: Mandiri Transformatif), Derajat III (70–84%: Mandiri Konsisten), Derajat II (50–69%: Berkembang/Transisi), Derajat I (0–49%: Perlu Bimbingan Intensif). Setiap skor dihitung langsung dari 6 dimensi SRL di bawah.
                  </div>
                  {(inspectSub.skorDomainNonAkademik?.length ?? 0) > 0 && (
                    <div className="border border-slate-200 rounded-lg divide-y divide-slate-200">
                      {inspectSub.skorDomainNonAkademik!.map((d) => (
                        <div key={d.domain} className="p-3 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-900">{d.domain}</span>
                            <span
                              className={`font-mono font-semibold tabular-nums ${
                                d.kategori === 'Optimal'
                                  ? 'text-emerald-700'
                                  : d.kategori === 'Cukup Baik'
                                    ? 'text-slate-700'
                                    : 'text-red-700'
                              }`}
                            >
                              {d.persen}% ({d.kategori})
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded bg-slate-200 overflow-hidden">
                            <div
                              className="h-full bg-emerald-700"
                              style={{ width: `${d.persen}%` }}
                            />
                          </div>
                          <p className="text-[11px] text-slate-500">{d.ringkasan}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {inspectSub.profilGayaBelajar && (
                    <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-slate-500">Profil Gaya Belajar VAK & Minat</div>
                        <div className="font-bold text-slate-900">
                          Dominan {inspectSub.profilGayaBelajar.dominan} · Minat Utama:{' '}
                          {inspectSub.minatDominan || '-'}
                        </div>
                      </div>
                      <div className="font-mono text-slate-800 tabular-nums">
                        Visual {inspectSub.profilGayaBelajar.visual}% · Auditori{' '}
                        {inspectSub.profilGayaBelajar.auditori}% · Kinestetik{' '}
                        {inspectSub.profilGayaBelajar.kinestetik}%
                      </div>
                    </div>
                  )}
                  {(inspectSub.skorDomainNonAkademik?.length ?? 0) > 0 && (
                    <div className="border border-slate-200 rounded-lg divide-y divide-slate-200">
                      {inspectSub.skorDomainNonAkademik!.map((d) => (
                        <div key={d.domain} className="p-3 space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-900">{d.domain}</span>
                            <span
                              className={`font-mono font-semibold tabular-nums ${
                                d.kategori === 'Optimal'
                                  ? 'text-emerald-700'
                                  : d.kategori === 'Cukup Baik'
                                    ? 'text-slate-700'
                                    : 'text-red-700'
                              }`}
                            >
                              {d.persen}% ({d.kategori})
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500">{d.ringkasan}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Pertanyaan & Jawaban Mentah untuk Akuntabilitas Audit */}
              <div className="space-y-2">
                <div className="font-semibold text-slate-900">
                  Jejak Jawaban Mentah Peserta Didik (Audit Akuntabel)
                </div>
                <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {inspectSub.answers.map((ans, idx) => {
                    const pkg = packages.find((p) => p.id === inspectSub.packageId);
                    const q = pkg?.pertanyaan.find((pq) => pq.id === ans.questionId);
                    const opt = q?.opsi.find((o) => o.id === ans.selectedOptionId);
                    const multiOpts = (ans.selectedOptionIds || [])
                      .map((id) => q?.opsi.find((o) => o.id === id)?.label || id)
                      .filter(Boolean);
                    const matchEntries = q?.pasanganMenjodohkan
                      ? q.pasanganMenjodohkan.map(
                          (p) => `${p.kiri} → ${ans.matchingAnswers?.[p.id] || '-'}`
                        )
                      : [];
                    return (
                      <div key={ans.questionId + idx} className="p-2.5 text-[11px] space-y-1">
                        <div className="font-medium text-slate-800">
                          {idx + 1}. [{q?.domain || '-'} · {q?.tipe || '-'}] {q?.pertanyaan || ans.questionId}
                        </div>
                        {q?.tipe === 'input_gambar' ? (
                          <div className="space-y-1">
                            {ans.imageDataUrl && (
                              <img
                                src={ans.imageDataUrl}
                                alt="Bukti jawaban siswa"
                                className="max-h-32 rounded border border-slate-200 object-contain bg-white"
                              />
                            )}
                            <div className="text-emerald-800">
                              Keterangan: {ans.imageCaption || '(tanpa keterangan)'}
                            </div>
                          </div>
                        ) : q?.tipe === 'pg_kompleks' ? (
                          <div className="text-emerald-800">
                            Pilihan: {multiOpts.length > 0 ? multiOpts.join('; ') : '-'}
                          </div>
                        ) : q?.tipe === 'menjodohkan' ? (
                          <div className="text-emerald-800">
                            Pasangan: {matchEntries.length > 0 ? matchEntries.join(' | ') : '-'}
                          </div>
                        ) : (
                          <div className="text-emerald-800">
                            Jawaban: {opt?.label || ans.textAnswer || ans.scaleValue || '-'}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {isAdmin ? (
                <form onSubmit={handleSaveVerify} className="space-y-3 border-t border-slate-200 pt-4">
                  <div>
                    <label className="block font-semibold text-slate-800 mb-1">
                      Keputusan Tindak Lanjut Pengurus / Sekolah *
                    </label>
                    <input
                      type="text"
                      required
                      value={keputusanTindak}
                      onChange={(e) => setKeputusanTindak(e.target.value)}
                      placeholder="Mis. Jadwalkan Bimbingan Penguatan CP-MAT-01 / Pendampingan BK"
                      className="w-full h-9 rounded-lg border border-slate-300 px-3"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-800 mb-1">
                      Catatan Analisis & Pertanggungjawaban Pengurus
                    </label>
                    <textarea
                      rows={3}
                      value={catatanAnalisis}
                      onChange={(e) => setCatatanAnalisis(e.target.value)}
                      placeholder="Tuliskan dasar interpretasi hasil dan koordinasi dengan wali kelas/guru/orang tua..."
                      className="w-full rounded-lg border border-slate-300 p-3"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setInspectSub(null)}
                      className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50"
                    >
                      Tutup
                    </button>
                    <button
                      type="submit"
                      disabled={savingVerify}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 text-white font-semibold hover:bg-emerald-800 disabled:opacity-50"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      {savingVerify ? 'Menyimpan...' : 'Sahkan Hasil & Simpan Tindak Lanjut'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-3 border-t border-slate-200 pt-4">
                  {inspectSub.verifiedAt && (
                    <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900 space-y-1">
                      <div className="font-semibold">
                        Keputusan Pengurus ({inspectSub.verifiedByName}):{' '}
                        {inspectSub.keputusanTindakLanjut || '-'}
                      </div>
                      {inspectSub.catatanAnalisisPengurus && (
                        <div>{inspectSub.catatanAnalisisPengurus}</div>
                      )}
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setInspectSub(null)}
                      className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50"
                    >
                      Tutup
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Runner Modal (when Admin tests/simulates a package) */}
      {activePackage && (
        <QuizRunnerModal
          pkg={activePackage}
          answersMap={answersMap}
          setAnswersMap={setAnswersMap}
          submitting={submittingQuiz}
          onSubmit={handleSubmitQuiz}
          onClose={() => setActivePackage(null)}
          isAdminSimulation
          students={state.students.filter((s) => s.status === 'Aktif')}
          previewStudentId={previewStudentId}
          setPreviewStudentId={setPreviewStudentId}
        />
      )}

      {/* Package Custom Builder Modal */}
      {builderOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-700" />
                <h3 className="text-sm font-bold text-slate-900">
                  {editingPkgId ? 'Edit Paket Asesmen Diagnostik' : 'Buat Paket Asesmen Diagnostik Kustom'}
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

            <form onSubmit={handleSaveBuilder} className="p-6 space-y-5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Kategori *</label>
                  <select
                    value={pkgKategori}
                    onChange={(e) => setPkgKategori(e.target.value as DiagnosticCategory)}
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5"
                  >
                    <option value="Akademik">Akademik (Sesuai Mapel)</option>
                    <option value="Non-Akademik">Non-Akademik (6 Dimensi)</option>
                    <option value="Pemelajar Mandiri">Pemelajar Mandiri (SRL 6 Dimensi)</option>
                  </select>
                </div>
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
                    onChange={(e) => setPkgStatus(e.target.value as DiagnosticPackage['status'])}
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5"
                  >
                    <option value="Draft">Draft (Belum Terlihat Siswa)</option>
                    <option value="Dirilis">Dirilis ke Login Siswa</option>
                    <option value="Ditutup">Ditutup</option>
                  </select>
                </div>
              </div>

              {pkgKategori === 'Akademik' && (
                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block font-medium text-slate-700 mb-1">
                      Mata Pelajaran Sasaran *
                    </label>
                    <select
                      value={pkgSubjectId}
                      onChange={(e) => setPkgSubjectId(e.target.value)}
                      className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5"
                    >
                      {state.subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.kode} — {s.nama}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handleLoadSubjectPresetQuestions}
                    className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-emerald-700 text-emerald-800 bg-white font-semibold hover:bg-emerald-50 whitespace-nowrap"
                  >
                    <BookOpen className="w-3.5 h-3.5" /> Muat Butir Otomatis dari Mapel & CP/TP
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Judul Paket *</label>
                  <input
                    type="text"
                    required
                    value={pkgJudul}
                    onChange={(e) => setPkgJudul(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Durasi (Menit)</label>
                  <input
                    type="number"
                    min={5}
                    max={180}
                    value={pkgDurasi}
                    onChange={(e) => setPkgDurasi(Number(e.target.value) || 20)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono"
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
                <div className="font-medium text-slate-700 mb-1.5">Target Kelas Siswa</div>
                <div className="flex flex-wrap gap-1.5">
                  {state.classes.map((cls) => {
                    const checked = pkgTargetClasses.includes(cls);
                    return (
                      <button
                        key={cls}
                        type="button"
                        onClick={() =>
                          setPkgTargetClasses((prev) =>
                            checked ? prev.filter((c) => c !== cls) : [...prev, cls]
                          )
                        }
                        className={`px-2.5 py-1 rounded border text-[11px] font-medium ${
                          checked
                            ? 'bg-emerald-700 text-white border-emerald-700'
                            : 'bg-white text-slate-600 border-slate-300'
                        }`}
                      >
                        {cls}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Questions Builder */}
              <div className="space-y-3 border-t border-slate-200 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-slate-900">
                    Daftar Butir Pertanyaan ({pkgQuestions.length})
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={diagBuilderImportRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        try {
                          const defaultDom =
                            pkgKategori === 'Pemelajar Mandiri'
                              ? PEMELAJAR_MANDIRI_DOMAINS[0]
                              : pkgKategori === 'Non-Akademik'
                                ? 'Psikologis'
                                : DOMAIN_AKADEMIK_HINTS[0];
                          const { questions, skippedCount } = await importDiagnostikExcel(file, defaultDom);
                          if (questions.length === 0) {
                            onNotify('File Excel tidak memiliki butir pertanyaan yang valid.', true);
                            return;
                          }
                          setPkgQuestions(questions);
                          onNotify(
                            `${questions.length} butir pertanyaan berhasil dimuat dari Excel${skippedCount > 0 ? ` (${skippedCount} baris dilewati)` : ''}.`
                          );
                        } catch {
                          onNotify('Gagal mengimpor file Excel soal diagnostik.', true);
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => downloadDiagnostikTemplate(pkgQuestions, pkgKategori, pkgJudul)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Download className="w-3.5 h-3.5" /> Template (.xlsx)
                    </button>
                    <button
                      type="button"
                      onClick={() => diagBuilderImportRef.current?.click()}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Upload className="w-3.5 h-3.5" /> Impor (.xlsx)
                    </button>
                    <button
                      type="button"
                      onClick={handleAddQuestion}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah Butir Pertanyaan
                    </button>
                  </div>
                </div>

                <div className="space-y-3 max-h-[48vh] overflow-y-auto pr-1">
                  {pkgQuestions.map((q, qIdx) => (
                    <div
                      key={q.id}
                      className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono font-bold text-slate-700">
                          Butir #{qIdx + 1}
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          {pkgKategori === 'Non-Akademik' ? (
                            <select
                              value={q.domain}
                              onChange={(e) => updateQuestion(qIdx, { domain: e.target.value })}
                              className="h-8 rounded border border-slate-300 bg-white px-2"
                            >
                              {NON_AKADEMIK_DOMAINS.map((d) => (
                                <option key={d} value={d}>
                                  {d}
                                </option>
                              ))}
                            </select>
                          ) : pkgKategori === 'Pemelajar Mandiri' ? (
                            <select
                              value={q.domain}
                              onChange={(e) => updateQuestion(qIdx, { domain: e.target.value })}
                              className="h-8 rounded border border-slate-300 bg-white px-2"
                            >
                              {PEMELAJAR_MANDIRI_DOMAINS.map((d) => (
                                <option key={d} value={d}>
                                  {d}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={q.domain}
                              onChange={(e) => updateQuestion(qIdx, { domain: e.target.value })}
                              placeholder="Domain / Topik CP-TP"
                              className="h-8 rounded border border-slate-300 bg-white px-2 w-40"
                            />
                          )}
                          <select
                            value={q.tipe}
                            onChange={(e) => {
                              const nextType = e.target.value as DiagnosticQuestionType;
                              let nextOpsi = q.opsi;
                              let nextPairs = q.pasanganMenjodohkan;
                              if (nextType === 'skala_likert' && q.opsi.length !== 5) {
                                nextOpsi = DIAGNOSTIK_LIKERT_PRESET.map((o) => ({ ...o }));
                              } else if (nextType === 'menjodohkan') {
                                nextOpsi = [];
                                nextPairs =
                                  q.pasanganMenjodohkan && q.pasanganMenjodohkan.length > 0
                                    ? q.pasanganMenjodohkan
                                    : [
                                        { id: `dp-${Date.now()}-1`, kiri: 'Pernyataan 1', kanan: 'Pasangan 1' },
                                        { id: `dp-${Date.now()}-2`, kiri: 'Pernyataan 2', kanan: 'Pasangan 2' },
                                      ];
                              } else if (nextType === 'input_gambar' || nextType === 'isian_singkat') {
                                nextOpsi = [];
                              } else if (q.opsi.length === 0) {
                                nextOpsi = [
                                  { id: 'a', label: 'Pilihan A', isCorrect: true, nilaiSkor: q.bobotPoin || 10 },
                                  { id: 'b', label: 'Pilihan B', isCorrect: false, nilaiSkor: 0 },
                                ];
                              }
                              updateQuestion(qIdx, {
                                tipe: nextType,
                                opsi: nextOpsi,
                                pasanganMenjodohkan: nextPairs,
                              });
                            }}
                            className="h-8 rounded border border-slate-300 bg-white px-2 font-medium"
                          >
                            {Object.entries(DIAGNOSTIK_TYPE_LABELS).map(([val, lbl]) => (
                              <option key={val} value={val}>
                                {lbl}
                              </option>
                            ))}
                          </select>
                          <label className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                            Bobot
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={q.bobotPoin}
                              onChange={(e) =>
                                updateQuestion(qIdx, {
                                  bobotPoin: Math.max(1, Number(e.target.value) || 10),
                                })
                              }
                              className="w-12 h-8 rounded border border-slate-300 bg-white px-1 text-center font-mono"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              setPkgQuestions((prev) => prev.filter((_, i) => i !== qIdx))
                            }
                            className="text-red-600 hover:underline px-2"
                          >
                            Hapus
                          </button>
                        </div>
                      </div>

                      <textarea
                        rows={2}
                        value={q.pertanyaan}
                        onChange={(e) => updateQuestion(qIdx, { pertanyaan: e.target.value })}
                        placeholder="Tuliskan teks pertanyaan, instruksi bukti gambar, atau narasi studi kasus..."
                        className="w-full rounded border border-slate-300 bg-white px-3 py-2"
                      />

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
                                updateQuestion(qIdx, { gambarUrl: dataUrl });
                              } catch {
                                onNotify('Gagal mengunggah gambar pendukung soal.', true);
                              }
                            }}
                            className="hidden"
                          />
                        </label>
                        {q.gambarUrl && (
                          <button
                            type="button"
                            onClick={() => updateQuestion(qIdx, { gambarUrl: undefined })}
                            className="text-red-600 hover:underline"
                          >
                            Hapus Gambar Soal
                          </button>
                        )}
                      </div>

                      {q.tipe === 'menjodohkan' ? (
                        <div className="space-y-2 pt-2 border-t border-slate-200/80 pl-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-slate-700">
                              Pasangan Menjodohkan (Kiri ↔ Kanan)
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const cur = q.pasanganMenjodohkan || [];
                                updateQuestion(qIdx, {
                                  pasanganMenjodohkan: [
                                    ...cur,
                                    { id: `dp-${Date.now()}-${cur.length + 1}`, kiri: '', kanan: '' },
                                  ],
                                });
                              }}
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
                                  updateQuestion(qIdx, {
                                    pasanganMenjodohkan: (q.pasanganMenjodohkan || []).map((p, pi) =>
                                      pi === pIdx ? { ...p, kiri: e.target.value } : p
                                    ),
                                  })
                                }
                                placeholder={`Pernyataan Kiri ${pIdx + 1}`}
                                className="flex-1 min-w-[150px] h-8 rounded border border-slate-300 bg-white px-2"
                              />
                              <span className="text-slate-400">↔</span>
                              <input
                                type="text"
                                value={pair.kanan}
                                onChange={(e) =>
                                  updateQuestion(qIdx, {
                                    pasanganMenjodohkan: (q.pasanganMenjodohkan || []).map((p, pi) =>
                                      pi === pIdx ? { ...p, kanan: e.target.value } : p
                                    ),
                                  })
                                }
                                placeholder={`Pasangan Benar ${pIdx + 1}`}
                                className="flex-1 min-w-[150px] h-8 rounded border border-slate-300 bg-white px-2"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateQuestion(qIdx, {
                                    pasanganMenjodohkan: (q.pasanganMenjodohkan || []).filter(
                                      (_, pi) => pi !== pIdx
                                    ),
                                  })
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
                          Mode <strong>Input Gambar</strong>: Siswa mengunggah foto bukti/karya/catatan dan menulis keterangan singkat.
                        </div>
                      ) : q.tipe === 'isian_singkat' ? (
                        <div className="p-2.5 rounded border border-slate-200 bg-white text-[11px] text-slate-600 space-y-2">
                          <div>
                            Mode <strong>Isian Singkat / Reflektif</strong>: Siswa menuliskan jawaban langsung di kotak teks.
                          </div>
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">
                              Kunci Jawaban Singkat Otomatis (Opsional — pisahkan variasi jawaban dengan |)
                            </label>
                            <input
                              type="text"
                              value={q.opsi.find((o) => o.isCorrect)?.label || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateQuestion(qIdx, {
                                  opsi: val.trim()
                                    ? [{ id: 'a', label: val, isCorrect: true, nilaiSkor: q.bobotPoin || 10 }]
                                    : [],
                                });
                              }}
                              placeholder="Kosongkan jika uraian bebas; misal: Jakarta|DKI Jakarta"
                              className="w-full h-8 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-800"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1.5 pt-2 border-t border-slate-200/80 pl-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-slate-700">
                              Opsi Jawaban{' '}
                              {q.tipe === 'pg_kompleks'
                                ? '— Centang semua kunci benar'
                                : q.tipe === 'studi_kasus'
                                  ? '— Opsional (kosongkan semua opsi jika ingin jawaban uraian studi kasus)'
                                  : q.tipe === 'skala_likert'
                                    ? '— Skala 1–5'
                                    : '— Pilih kunci benar / skor'}
                            </span>
                            <div className="flex items-center gap-2">
                              {q.tipe === 'skala_likert' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateQuestion(qIdx, {
                                      opsi: DIAGNOSTIK_LIKERT_PRESET.map((o) => ({ ...o })),
                                    })
                                  }
                                  className="text-[11px] font-medium text-slate-600 hover:underline"
                                >
                                  Preset Likert 1–5
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  updateQuestion(qIdx, {
                                    opsi: [
                                      ...q.opsi,
                                      {
                                        id: `opt-${Date.now()}-${q.opsi.length}`,
                                        label: `Opsi ${q.opsi.length + 1}`,
                                        nilaiSkor: pkgKategori === 'Akademik' ? 0 : 3,
                                        isCorrect: false,
                                      },
                                    ],
                                  })
                                }
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline"
                              >
                                <Plus className="w-3 h-3" /> Tambah Opsi
                              </button>
                            </div>
                          </div>

                          {q.opsi.map((opt, oIdx) => (
                            <div key={opt.id} className="flex flex-wrap items-center gap-2">
                              {q.tipe !== 'skala_likert' && (
                                <input
                                  type={q.tipe === 'pg_kompleks' ? 'checkbox' : 'radio'}
                                  name={`correct-${q.id}`}
                                  checked={Boolean(opt.isCorrect)}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    updateQuestion(qIdx, {
                                      opsi: q.opsi.map((o, j) => {
                                        if (q.tipe === 'pg_kompleks') {
                                          return j === oIdx ? { ...o, isCorrect: checked } : o;
                                        }
                                        return {
                                          ...o,
                                          isCorrect: j === oIdx,
                                          nilaiSkor:
                                            pkgKategori === 'Akademik'
                                              ? j === oIdx
                                                ? q.bobotPoin
                                                : 0
                                              : o.nilaiSkor,
                                        };
                                      }),
                                    });
                                  }}
                                  title="Tandai sebagai kunci jawaban benar"
                                  className="accent-emerald-700 shrink-0"
                                />
                              )}
                              <input
                                type="text"
                                value={opt.label}
                                onChange={(e) =>
                                  updateOption(qIdx, oIdx, { label: e.target.value })
                                }
                                placeholder={`Label opsi ${oIdx + 1}`}
                                className="flex-1 min-w-[180px] h-8 rounded border border-slate-300 bg-white px-2.5"
                              />
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={opt.nilaiSkor ?? 0}
                                onChange={(e) =>
                                  updateOption(qIdx, oIdx, {
                                    nilaiSkor: Math.max(0, Number(e.target.value) || 0),
                                  })
                                }
                                title="Skor opsi"
                                className="w-16 h-8 rounded border border-slate-300 bg-white px-1.5 text-center font-mono"
                              />
                              {pkgKategori === 'Non-Akademik' && (
                                <input
                                  type="text"
                                  value={opt.traitTag || ''}
                                  onChange={(e) =>
                                    updateOption(qIdx, oIdx, { traitTag: e.target.value })
                                  }
                                  placeholder="Tag (Visual/Minat)"
                                  className="w-32 h-8 rounded border border-slate-300 bg-white px-2 text-[11px]"
                                />
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  updateQuestion(qIdx, {
                                    opsi: q.opsi.filter((_, oi) => oi !== oIdx),
                                  })
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
                  className="px-4 py-2 rounded-lg border border-slate-300 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingPkg}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  <ClipboardCheck className="w-4 h-4" />
                  {savingPkg ? 'Menyimpan...' : 'Simpan Paket Diagnostik'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// Reusable Quiz Runner Modal
interface QuizRunnerModalProps {
  pkg: DiagnosticPackage;
  answersMap: Record<string, DiagnosticAnswer>;
  setAnswersMap: React.Dispatch<React.SetStateAction<Record<string, DiagnosticAnswer>>>;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  isAdminSimulation?: boolean;
  students?: AppState['students'];
  previewStudentId?: string;
  setPreviewStudentId?: (id: string) => void;
}

const QuizRunnerModal: React.FC<QuizRunnerModalProps> = ({
  pkg,
  answersMap,
  setAnswersMap,
  submitting,
  onSubmit,
  onClose,
  isAdminSimulation,
  students = [],
  previewStudentId,
  setPreviewStudentId,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-xl">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-mono text-emerald-700 font-semibold">
              {pkg.kodePaket} · {pkg.kategori}
              {pkg.subjectName ? ` · ${pkg.subjectName}` : ''}
            </div>
            <h3 className="text-sm font-bold text-slate-900">{pkg.judul}</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-900">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {isAdminSimulation && setPreviewStudentId && (
            <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 flex flex-wrap items-center justify-between gap-3">
              <span className="font-medium text-amber-900">
                Mode Simulasi Pengurus — Pilih siswa target pencatatan:
              </span>
              <select
                value={previewStudentId}
                onChange={(e) => setPreviewStudentId(e.target.value)}
                className="h-8 rounded border border-amber-300 bg-white px-2.5 text-xs font-medium text-slate-900"
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nama} ({s.kelas} · NIS {s.nis})
                  </option>
                ))}
              </select>
            </div>
          )}

          {pkg.pertanyaan.map((q, idx) => {
            const current = answersMap[q.id];
            const rightChoices =
              q.tipe === 'menjodohkan' && q.pasanganMenjodohkan
                ? [...q.pasanganMenjodohkan.map((p) => p.kanan)].sort((a, b) =>
                    a.localeCompare(b)
                  )
                : [];
            return (
              <div key={q.id} className="p-4 rounded-xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span className="font-semibold text-emerald-700">
                    {q.domain}
                    {q.subDimensi ? ` · ${q.subDimensi}` : ''} · {DIAGNOSTIK_TYPE_LABELS[q.tipe]}
                  </span>
                  <span className="font-mono">
                    Butir {idx + 1}/{pkg.pertanyaan.length}
                  </span>
                </div>
                <div className="text-sm font-medium text-slate-900 leading-snug">
                  {idx + 1}. {q.pertanyaan}
                </div>
                {q.gambarUrl &&
                  (/^(https?:\/\/|data:image\/)/i.test(q.gambarUrl.trim())) && (
                    <img
                      src={q.gambarUrl.trim()}
                      alt="Ilustrasi soal"
                      className="max-h-56 rounded-lg border border-slate-200 object-contain bg-slate-50"
                    />
                  )}

                {q.tipe === 'pg_kompleks' ? (
                  <div className="space-y-1.5">
                    <div className="text-[11px] text-slate-500">
                      Pilih satu atau lebih jawaban yang tepat:
                    </div>
                    {q.opsi.map((opt) => {
                      const pickedIds = current?.selectedOptionIds || [];
                      const checked = pickedIds.includes(opt.id);
                      return (
                        <label
                          key={opt.id}
                          className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            checked
                              ? 'border-emerald-700 bg-emerald-50/70 text-slate-900 font-medium'
                              : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const nextIds = e.target.checked
                                ? [...pickedIds, opt.id]
                                : pickedIds.filter((x) => x !== opt.id);
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
                      Pilih pasangan kanan yang paling tepat untuk setiap pernyataan kiri:
                    </div>
                    {(q.pasanganMenjodohkan || []).map((pair) => (
                      <div
                        key={pair.id}
                        className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center p-2.5 rounded-lg border border-slate-200 bg-slate-50/70"
                      >
                        <div className="sm:col-span-6 font-medium text-slate-800">{pair.kiri}</div>
                        <div className="sm:col-span-1 text-center text-slate-400">→</div>
                        <div className="sm:col-span-5">
                          <select
                            value={current?.matchingAnswers?.[pair.id] || ''}
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
                        Unggah Foto / Gambar Bukti
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
                              // ignore invalid image
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                      <span className="text-[11px] text-slate-500">atau tautan HTTPS:</span>
                      <input
                        type="url"
                        value={
                          current?.imageDataUrl && !current.imageDataUrl.startsWith('data:')
                            ? current.imageDataUrl
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
                        className="flex-1 min-w-[160px] h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                      />
                    </div>
                    {current?.imageDataUrl &&
                      /^(https?:\/\/|data:image\/)/i.test(current.imageDataUrl.trim()) && (
                        <img
                          src={current.imageDataUrl.trim()}
                          alt="Pratinjau bukti gambar"
                          className="max-h-52 rounded-lg border border-slate-200 object-contain bg-white"
                        />
                      )}
                    <input
                      type="text"
                      value={current?.imageCaption || ''}
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
                      placeholder="Keterangan singkat gambar yang diunggah..."
                      className="w-full h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                    />
                  </div>
                ) : q.tipe === 'isian_singkat' ||
                  (q.tipe === 'studi_kasus' && q.opsi.length === 0) ? (
                  <textarea
                    rows={3}
                    value={current?.textAnswer || ''}
                    onChange={(e) =>
                      setAnswersMap((prev) => ({
                        ...prev,
                        [q.id]: { questionId: q.id, textAnswer: e.target.value },
                      }))
                    }
                    placeholder="Tuliskan jawaban atau analisis Anda secara jelas..."
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-xs"
                  />
                ) : (
                  <div className="space-y-1.5">
                    {q.opsi.map((opt) => {
                      const picked = current?.selectedOptionId === opt.id;
                      return (
                        <label
                          key={opt.id}
                          className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            picked
                              ? 'border-emerald-700 bg-emerald-50/70 text-slate-900 font-medium'
                              : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`q-${q.id}`}
                            checked={picked}
                            onChange={() =>
                              setAnswersMap((prev) => ({
                                ...prev,
                                [q.id]: {
                                  questionId: q.id,
                                  selectedOptionId: opt.id,
                                  scaleValue: opt.nilaiSkor,
                                },
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

          <div className="sticky bottom-0 bg-white border-t border-slate-200 pt-4 pb-1 flex items-center justify-between gap-3">
            <span className="text-slate-500 font-mono">
              Terjawab {Object.keys(answersMap).length}/{pkg.pertanyaan.length} butir
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-300 font-medium text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-emerald-700 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                {submitting ? 'Memproses...' : 'Kirim & Olah Hasil'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
