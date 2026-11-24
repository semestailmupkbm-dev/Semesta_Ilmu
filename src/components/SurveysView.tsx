import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Download,
  Edit3,
  Eye,
  Plus,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  AppState,
  DiagnosticAnswer,
  SurveyOption,
  SurveyPackage,
  SurveyQuestion,
  SurveyQuestionType,
  SurveyResponse,
  UserAccount,
} from '../types';
import { SURVEY_LITERASI_DOMAINS } from '../data/templates';

interface SurveysViewProps {
  state: AppState;
  currentUser: UserAccount;
  selectedClass: string;
  activeStudentId?: string;
  onChangeActiveStudentId?: (id: string) => void;
  onSavePackage: (payload: Partial<SurveyPackage>, editId?: string) => Promise<boolean>;
  onReleasePackage: (id: string, status: SurveyPackage['status']) => Promise<boolean>;
  onDeletePackage: (id: string) => Promise<boolean>;
  onSubmitResponse: (
    packageId: string,
    studentId: string,
    answers: DiagnosticAnswer[]
  ) => Promise<SurveyResponse | null>;
  onVerifyResponse: (id: string, catatanPengurus: string) => Promise<boolean>;
  onNotify: (msg: string, isError?: boolean) => void;
}

const QUESTION_TYPE_LABELS: Record<SurveyQuestionType, string> = {
  pilihan_ganda: 'Pilihan Ganda (1 Jawaban)',
  pg_kompleks: 'PG Kompleks (Banyak Pilihan)',
  skala_likert: 'Skala Likert (1–5)',
  isian_singkat: 'Isian Singkat / Uraian',
};

const LIKERT_PRESET: SurveyOption[] = [
  { id: '1', label: '1 · Belum Pernah / Tidak Ada', nilaiSkor: 1 },
  { id: '2', label: '2 · Jarang', nilaiSkor: 2 },
  { id: '3', label: '3 · Kadang-kadang', nilaiSkor: 3 },
  { id: '4', label: '4 · Sering / Rutin', nilaiSkor: 4 },
  { id: '5', label: '5 · Sangat Rutin & Konsisten', nilaiSkor: 5 },
];

export const SurveysView: React.FC<SurveysViewProps> = ({
  state,
  currentUser,
  selectedClass,
  activeStudentId,
  onChangeActiveStudentId,
  onSavePackage,
  onReleasePackage,
  onDeletePackage,
  onSubmitResponse,
  onVerifyResponse,
  onNotify,
}) => {
  const isAdmin = currentUser.role === 'admin';
  const isOrtu = currentUser.role === 'ortu';
  const isTeacher = currentUser.role === 'guru' || currentUser.role === 'walikelas';

  const packages = useMemo(() => state.surveyPackages || [], [state.surveyPackages]);
  const responses = useMemo(() => state.surveyResponses || [], [state.surveyResponses]);

  const linkedStudents = useMemo(() => {
    if (isOrtu) {
      const ids = new Set(currentUser.linkedStudentIds || []);
      return state.students.filter((s) => ids.has(s.id));
    }
    return state.students.filter((s) => s.status === 'Aktif');
  }, [isOrtu, currentUser.linkedStudentIds, state.students]);

  const [internalStudentId, setInternalStudentId] = useState<string>(
    activeStudentId || linkedStudents[0]?.id || ''
  );

  useEffect(() => {
    if (activeStudentId && linkedStudents.some((s) => s.id === activeStudentId)) {
      setInternalStudentId(activeStudentId);
    } else if (!linkedStudents.some((s) => s.id === internalStudentId)) {
      setInternalStudentId(linkedStudents[0]?.id || '');
    }
  }, [activeStudentId, linkedStudents, internalStudentId]);

  const selectedStudentId =
    activeStudentId && linkedStudents.some((s) => s.id === activeStudentId)
      ? activeStudentId
      : internalStudentId || linkedStudents[0]?.id || '';

  const selectedStudent = linkedStudents.find((s) => s.id === selectedStudentId);

  const handleSelectStudent = (id: string) => {
    setInternalStudentId(id);
    onChangeActiveStudentId?.(id);
  };

  // Tabs for Pengurus
  const [adminTab, setAdminTab] = useState<'analytics' | 'packages'>('analytics');

  // Filter state for analytics
  const [filterPkgId, setFilterPkgId] = useState<string>('ALL');
  const [filterKelas, setFilterKelas] = useState<string>(isTeacher && selectedClass ? selectedClass : 'ALL');
  const [filterKategori, setFilterKategori] = useState<string>('ALL');

  // Runner modal state (for Ortu or Admin simulation)
  const [runnerPkg, setRunnerPkg] = useState<SurveyPackage | null>(null);
  const [runnerStudentId, setRunnerStudentId] = useState<string>('');
  const [runnerAnswers, setRunnerAnswers] = useState<Record<string, DiagnosticAnswer>>({});
  const [submittingRunner, setSubmittingRunner] = useState(false);

  // Builder modal state (Admin)
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingPkgId, setEditingPkgId] = useState<string | undefined>(undefined);
  const [pkgKode, setPkgKode] = useState('');
  const [pkgJudul, setPkgJudul] = useState('');
  const [pkgDeskripsi, setPkgDeskripsi] = useState('');
  const [pkgKategori, setPkgKategori] = useState<'Literasi Keluarga' | 'Kustom'>('Kustom');
  const [pkgTargetClasses, setPkgTargetClasses] = useState<string[]>([]);
  const [pkgStatus, setPkgStatus] = useState<SurveyPackage['status']>('Draft');
  const [pkgQuestions, setPkgQuestions] = useState<SurveyQuestion[]>([]);
  const [savingPkg, setSavingPkg] = useState(false);

  // Detail & Verify Modal
  const [detailResp, setDetailResp] = useState<SurveyResponse | null>(null);
  const [verifyNote, setVerifyNote] = useState('');
  const [verifying, setVerifying] = useState(false);

  // --- Filtered Analytics ---
  const filteredResponses = useMemo(() => {
    return responses.filter((r) => {
      if (filterPkgId !== 'ALL' && r.packageId !== filterPkgId) return false;
      if (filterKelas !== 'ALL' && r.kelas !== filterKelas) return false;
      if (filterKategori !== 'ALL' && r.kategoriLiterasi !== filterKategori) return false;
      return true;
    });
  }, [responses, filterPkgId, filterKelas, filterKategori]);

  const analyticsStats = useMemo(() => {
    const total = filteredResponses.length;
    const avgIndex =
      total > 0
        ? Math.round(filteredResponses.reduce((acc, r) => acc + r.indeksLiterasi, 0) / total)
        : 0;
    const pojokKhususCount = filteredResponses.filter(
      (r) => r.adaPojokBaca && r.adaPojokBaca.toLowerCase().includes('khusus')
    ).length;
    const pojokReadyCount = filteredResponses.filter(
      (r) =>
        r.adaPojokBaca &&
        (r.adaPojokBaca.toLowerCase().includes('khusus') ||
          r.adaPojokBaca.toLowerCase().includes('meja belajar'))
    ).length;
    const needSupportCount = filteredResponses.filter(
      (r) => r.kategoriLiterasi === 'Perlu Penguatan Literasi Rumah'
    ).length;

    const domMap = new Map<string, number[]>();
    filteredResponses.forEach((r) => {
      (r.domainScores || []).forEach((d) => {
        const arr = domMap.get(d.domain) || [];
        arr.push(d.skorPersen);
        domMap.set(d.domain, arr);
      });
    });

    const chartData = Array.from(domMap.entries()).map(([domain, arr]) => ({
      domain: domain.length > 26 ? `${domain.slice(0, 24)}…` : domain,
      fullDomain: domain,
      skor: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length),
    }));

    return {
      total,
      avgIndex,
      pojokKhususCount,
      pojokReadyPct: total > 0 ? Math.round((pojokReadyCount / total) * 100) : 0,
      needSupportCount,
      chartData,
    };
  }, [filteredResponses]);

  // --- Runner Helpers ---
  const openRunner = (pkg: SurveyPackage, stuId: string) => {
    const existing = responses.find((r) => r.packageId === pkg.id && r.studentId === stuId);
    const initial: Record<string, DiagnosticAnswer> = {};
    if (existing) {
      existing.answers.forEach((a) => {
        initial[a.questionId] = a;
      });
    }
    setRunnerPkg(pkg);
    setRunnerStudentId(stuId);
    setRunnerAnswers(initial);
  };

  const handleSubmitRunner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!runnerPkg || !runnerStudentId) return;

    const missing = runnerPkg.pertanyaan.filter((q) => {
      if (!q.wajib) return false;
      const a = runnerAnswers[q.id];
      if (!a) return true;
      if (q.tipe === 'pg_kompleks') return !a.selectedOptionIds || a.selectedOptionIds.length === 0;
      if (q.tipe === 'isian_singkat') return !a.textAnswer || !a.textAnswer.trim();
      return !a.selectedOptionId;
    });

    if (missing.length > 0) {
      onNotify(`Harap lengkapi ${missing.length} pertanyaan wajib sebelum mengirim survei.`, true);
      return;
    }

    setSubmittingRunner(true);
    const list = runnerPkg.pertanyaan
      .map((q) => runnerAnswers[q.id])
      .filter((a): a is DiagnosticAnswer => Boolean(a));
    const saved = await onSubmitResponse(runnerPkg.id, runnerStudentId, list);
    setSubmittingRunner(false);

    if (saved) {
      onNotify('Terima kasih! Jawaban survei berhasil disimpan & diolah.');
      setRunnerPkg(null);
    }
  };

  // --- Builder Helpers ---
  const openCreateBuilder = () => {
    setEditingPkgId(undefined);
    setPkgKode(`SRV-KUS-${String(packages.length + 1).padStart(2, '0')}`);
    setPkgJudul('');
    setPkgDeskripsi('');
    setPkgKategori('Kustom');
    setPkgTargetClasses([]);
    setPkgStatus('Draft');
    setPkgQuestions([
      {
        id: `sq-${Date.now()}-1`,
        domain: 'Ketersediaan Fasilitas Rumah',
        tipe: 'skala_likert',
        pertanyaan: '',
        opsi: LIKERT_PRESET.map((o) => ({ ...o })),
        wajib: true,
      },
    ]);
    setBuilderOpen(true);
  };

  const openEditBuilder = (pkg: SurveyPackage) => {
    setEditingPkgId(pkg.id);
    setPkgKode(pkg.kodePaket);
    setPkgJudul(pkg.judul);
    setPkgDeskripsi(pkg.deskripsi);
    setPkgKategori(pkg.kategori);
    setPkgTargetClasses(pkg.targetKelasList || []);
    setPkgStatus(pkg.status);
    setPkgQuestions(
      pkg.pertanyaan.map((q) => ({
        ...q,
        opsi: q.opsi.map((o) => ({ ...o })),
      }))
    );
    setBuilderOpen(true);
  };

  const handleSaveBuilder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pkgJudul.trim()) {
      onNotify('Judul survei wajib diisi.', true);
      return;
    }
    const validQuestions = pkgQuestions.filter((q) => q.pertanyaan.trim().length > 0);
    if (validQuestions.length === 0) {
      onNotify('Minimal harus ada 1 butir pertanyaan yang terisi.', true);
      return;
    }

    setSavingPkg(true);
    const ok = await onSavePackage(
      {
        kodePaket: pkgKode.trim() || undefined,
        judul: pkgJudul.trim(),
        deskripsi: pkgDeskripsi.trim(),
        kategori: pkgKategori,
        targetKelasList: pkgTargetClasses,
        status: pkgStatus,
        pertanyaan: validQuestions,
      },
      editingPkgId
    );
    setSavingPkg(false);
    if (ok) {
      onNotify(editingPkgId ? 'Paket survei berhasil diperbarui.' : 'Paket survei baru dibuat.');
      setBuilderOpen(false);
    }
  };

  const handleExportCsv = () => {
    if (filteredResponses.length === 0) {
      onNotify('Belum ada respons survei untuk diekspor.', true);
      return;
    }
    const header = [
      'NIS',
      'Nama Siswa',
      'Kelas',
      'Nama Orang Tua/Wali',
      'Paket Survei',
      'Indeks Literasi (%)',
      'Kategori',
      'Ketersediaan Pojok Baca',
      'Koleksi Buku Rumah',
      'Frekuensi Membaca',
      'Rekomendasi Tindak Lanjut',
    ];
    const rows = filteredResponses.map((r) =>
      [
        r.nis,
        r.studentName,
        r.kelas,
        r.parentName,
        r.packageJudul,
        String(r.indeksLiterasi),
        r.kategoriLiterasi,
        r.adaPojokBaca || '-',
        r.jumlahBukuRumah || '-',
        r.frekuensiMembaca || '-',
        r.rekomendasiTindakLanjut,
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(',')
    );
    const blob = new Blob([[header.join(','), ...rows].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Olahan_Survei_OrangTua_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderAnalyticsSection = () => (
    <div className="space-y-5">
      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Paket Survei
            </label>
            <select
              value={filterPkgId}
              onChange={(e) => setFilterPkgId(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 focus:border-emerald-700 focus:outline-none"
            >
              <option value="ALL">Semua Paket Survei</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.kodePaket} · {p.judul}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Kelas</label>
            <select
              value={filterKelas}
              onChange={(e) => setFilterKelas(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 focus:border-emerald-700 focus:outline-none"
            >
              <option value="ALL">Semua Kelas Akses</option>
              {state.classes.map((cls) => (
                <option key={cls} value={cls}>
                  {cls}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Kategori Ekosistem
            </label>
            <select
              value={filterKategori}
              onChange={(e) => setFilterKategori(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 focus:border-emerald-700 focus:outline-none"
            >
              <option value="ALL">Semua Kategori</option>
              <option value="Ekosistem Literasi Sangat Mendukung">Sangat Mendukung (≥ 80%)</option>
              <option value="Cukup Mendukung">Cukup Mendukung (60–79%)</option>
              <option value="Perlu Penguatan Literasi Rumah">Perlu Penguatan (&lt; 60%)</option>
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          className="h-9 px-3.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          Ekspor Olahan CSV
        </button>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Total Respons Terkumpul</div>
          <div className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">
            {analyticsStats.total}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Partisipasi keluarga siswa</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Rata-rata Indeks Literasi</div>
          <div className="mt-1.5 text-2xl font-bold text-emerald-700 tabular-nums">
            {analyticsStats.avgIndex}%
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Skor komposit 5 domain rumah</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Ketersediaan Area / Pojok Baca</div>
          <div className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">
            {analyticsStats.pojokReadyPct}%
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {analyticsStats.pojokKhususCount} keluarga punya pojok baca khusus
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Perlu Penguatan Literasi Rumah</div>
          <div className="mt-1.5 text-2xl font-bold text-amber-700 tabular-nums">
            {analyticsStats.needSupportCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Prioritas pinjam buku / pendampingan</div>
        </div>
      </div>

      {/* Domain Chart */}
      {analyticsStats.chartData.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Grafik Capaian per Domain Literasi Keluarga
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Rata-rata skor persentase berdasarkan isian orang tua (0–100%).
              </p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={analyticsStats.chartData}
                layout="vertical"
                margin={{ top: 4, right: 24, left: 16, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis
                  type="category"
                  dataKey="domain"
                  width={185}
                  tick={{ fontSize: 11, fill: '#334155' }}
                />
                <Tooltip
                  formatter={(value) => [`${value ?? 0}%`, 'Rata-rata Skor']}
                  labelFormatter={(_, payload) =>
                    payload?.[0]?.payload?.fullDomain || ''
                  }
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="skor" radius={[0, 4, 4, 0]} barSize={20}>
                  {analyticsStats.chartData.map((entry, idx) => (
                    <Cell
                      key={`cell-${idx}`}
                      fill={
                        entry.skor >= 78
                          ? '#047857'
                          : entry.skor >= 58
                            ? '#0284c7'
                            : '#d97706'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Results Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Rincian Olahan Survei per Peserta Didik
          </h3>
          <span className="text-xs text-slate-500 tabular-nums">
            {filteredResponses.length} data ditampilkan
          </span>
        </div>

        {filteredResponses.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Belum ada data pengisian survei orang tua pada filter ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                  <th className="py-2.5 px-4">Siswa &amp; Kelas</th>
                  <th className="py-2.5 px-4">Pengisi (Orang Tua)</th>
                  <th className="py-2.5 px-4">Pojok Baca &amp; Koleksi</th>
                  <th className="py-2.5 px-4">Frekuensi Baca</th>
                  <th className="py-2.5 px-4 text-right">Indeks</th>
                  <th className="py-2.5 px-4">Status Ekosistem</th>
                  <th className="py-2.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {filteredResponses.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{r.studentName}</div>
                      <div className="text-[11px] text-slate-500">
                        NIS {r.nis} · {r.kelas}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-700">{r.parentName}</td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">{r.adaPojokBaca || '-'}</div>
                      <div className="text-[11px] text-slate-500">
                        Koleksi: {r.jumlahBukuRumah || '-'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-700">{r.frekuensiMembaca || '-'}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                      {r.indeksLiterasi}%
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-[11px] font-semibold ${
                          r.kategoriLiterasi === 'Ekosistem Literasi Sangat Mendukung'
                            ? 'text-emerald-700'
                            : r.kategoriLiterasi === 'Cukup Mendukung'
                              ? 'text-sky-700'
                              : 'text-amber-700'
                        }`}
                      >
                        {r.kategoriLiterasi}
                      </span>
                      {r.verifiedAt && (
                        <div className="text-[10px] text-slate-400">
                          Terverifikasi · {r.verifiedByName}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setDetailResp(r);
                          setVerifyNote(r.catatanPengurus || '');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Detail &amp; Rincian
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
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-700 text-xs font-semibold">
            <BookOpen className="w-4 h-4" />
            <span>Survei Orang Tua &amp; Pemetaan Literasi Keluarga</span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 mt-1">
            {isOrtu
              ? 'Pengisian Survei Keluarga & Literasi Rumah'
              : isTeacher
                ? 'Olahan Hasil Survei Orang Tua & Literasi Keluarga'
                : 'Manajemen Survei Orang Tua & Olahan Hasil Literasi'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
            {isOrtu
              ? 'Bantu sekolah memahami fasilitas pojok baca, koleksi buku, dan kebiasaan membaca anak di rumah agar pendampingan guru lebih tepat sasaran.'
              : 'Memetakan ketersediaan pojok baca, buku bacaan, kegiatan literasi rumah, dan kebutuhan dukungan keluarga; hasil otomatis tersaji untuk Pengurus, Wali Kelas, dan Guru.'}
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setAdminTab('analytics')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                  adminTab === 'analytics'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Olahan Hasil
              </button>
              <button
                type="button"
                onClick={() => setAdminTab('packages')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                  adminTab === 'packages'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Kelola Paket Survei
              </button>
            </div>
            <button
              type="button"
              onClick={openCreateBuilder}
              className="h-9 px-3.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Buat Survei Kustom
            </button>
          </div>
        )}
      </div>

      {/* VIEW 1: ORANG TUA */}
      {isOrtu && (
        <div className="space-y-5">
          {/* Active Child Selector */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Users className="w-4 h-4 text-emerald-700 shrink-0" />
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  Pilih Anak Aktif untuk Pengisian Survei
                </div>
                <div className="text-[11px] text-slate-500">
                  Pilihan anak aktif ini otomatis tersinkron dengan Portal Orang Tua dan Ruang LMS.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {linkedStudents.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => handleSelectStudent(st.id)}
                  className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                    selectedStudentId === st.id
                      ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {st.nama} · {st.kelas}
                </button>
              ))}
            </div>
          </div>

          {/* List Released Surveys for Selected Child */}
          {!selectedStudent ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
              Belum ada peserta didik tertaut pada akun orang tua ini.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {packages
                .filter(
                  (pkg) =>
                    pkg.status === 'Dirilis' &&
                    (!pkg.targetKelasList ||
                      pkg.targetKelasList.length === 0 ||
                      pkg.targetKelasList.includes(selectedStudent.kelas))
                )
                .map((pkg) => {
                  const resp = responses.find(
                    (r) => r.packageId === pkg.id && r.studentId === selectedStudent.id
                  );
                  return (
                    <div
                      key={pkg.id}
                      className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                          <span className="font-mono font-semibold text-emerald-700">
                            {pkg.kodePaket} · {pkg.kategori}
                          </span>
                          <span>{pkg.pertanyaan.length} Pertanyaan</span>
                        </div>
                        <h3 className="text-base font-bold text-slate-900">{pkg.judul}</h3>
                        <p className="text-xs text-slate-600 leading-relaxed">{pkg.deskripsi}</p>

                        {resp && (
                          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 space-y-1.5 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-emerald-900 inline-flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                                Sudah Diisi untuk {selectedStudent.nama}
                              </span>
                              <span className="font-mono font-bold text-emerald-800 tabular-nums">
                                Indeks {resp.indeksLiterasi}%
                              </span>
                            </div>
                            <div className="text-[11px] text-emerald-800">
                              Kategori: <span className="font-semibold">{resp.kategoriLiterasi}</span>
                            </div>
                            {resp.adaPojokBaca && (
                              <div className="text-[11px] text-slate-700">
                                Pojok Baca: {resp.adaPojokBaca} · Koleksi: {resp.jumlahBukuRumah || '-'} · Rutinitas: {resp.frekuensiMembaca || '-'}
                              </div>
                            )}
                            {resp.catatanPengurus && (
                              <div className="pt-1.5 border-t border-emerald-200/70 text-[11px] text-slate-700">
                                <span className="font-semibold">Tindak Lanjut Sekolah:</span>{' '}
                                {resp.catatanPengurus}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                        <span className="text-[11px] text-slate-500">
                          Anak aktif: <strong className="text-slate-800">{selectedStudent.nama}</strong>
                        </span>
                        <div className="flex items-center gap-2">
                          {resp && (
                            <button
                              type="button"
                              onClick={() => {
                                setDetailResp(resp);
                                setVerifyNote(resp.catatanPengurus || '');
                              }}
                              className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                            >
                              Lihat Ringkasan
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openRunner(pkg, selectedStudent.id)}
                            className="h-9 px-4 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 inline-flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <ClipboardList className="w-3.5 h-3.5" />
                            {resp ? 'Perbarui Jawaban' : 'Isi Survei Sekarang'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: PENGURUS MANAGE PACKAGES */}
      {isAdmin && adminTab === 'packages' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {packages.map((pkg) => {
            const respCount = responses.filter((r) => r.packageId === pkg.id).length;
            return (
              <div
                key={pkg.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-mono font-semibold text-slate-600">
                      {pkg.kodePaket} · {pkg.kategori}
                    </span>
                    <span
                      className={`font-semibold ${
                        pkg.status === 'Dirilis'
                          ? 'text-emerald-700'
                          : pkg.status === 'Ditutup'
                            ? 'text-slate-500'
                            : 'text-amber-700'
                      }`}
                    >
                      Status: {pkg.status}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900">{pkg.judul}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{pkg.deskripsi}</p>
                  <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-1 pt-1">
                    <span>{pkg.pertanyaan.length} butir pertanyaan</span>
                    <span>·</span>
                    <span>
                      Target:{' '}
                      {pkg.targetKelasList.length === 0
                        ? 'Seluruh Kelas Aktif'
                        : pkg.targetKelasList.join(', ')}
                    </span>
                    <span>·</span>
                    <span className="font-semibold text-slate-700 tabular-nums">
                      {respCount} respons masuk
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-1.5">
                    {pkg.status !== 'Dirilis' && (
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await onReleasePackage(pkg.id, 'Dirilis');
                          if (ok) onNotify('Survei dirilis ke Portal Orang Tua.');
                        }}
                        className="h-8 px-3 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 whitespace-nowrap"
                      >
                        Rilis ke Ortu
                      </button>
                    )}
                    {pkg.status === 'Dirilis' && (
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await onReleasePackage(pkg.id, 'Ditutup');
                          if (ok) onNotify('Pengisian survei ditutup.');
                        }}
                        className="h-8 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        Tutup Survei
                      </button>
                    )}
                    {state.students.length > 0 && (
                      <button
                        type="button"
                        onClick={() => openRunner(pkg, state.students[0].id)}
                        className="h-8 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        Simulasi Isi
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditBuilder(pkg)}
                      className="h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    {!pkg.isTemplateBuiltIn && (
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await onDeletePackage(pkg.id);
                          if (ok) onNotify('Paket survei dihapus.');
                        }}
                        className="h-8 px-2.5 rounded-lg border border-red-200 bg-white text-xs font-medium text-red-700 hover:bg-red-50 inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Hapus
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW 3: ANALYTICS (PENGURUS + WALI KELAS + GURU) */}
      {(isTeacher || (isAdmin && adminTab === 'analytics')) && renderAnalyticsSection()}

      {/* MODAL: SURVEY RUNNER */}
      {runnerPkg && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-mono font-semibold text-emerald-700">
                  {runnerPkg.kodePaket} · {runnerPkg.kategori}
                </div>
                <h3 className="text-base font-bold text-slate-900">{runnerPkg.judul}</h3>
              </div>
              <button
                type="button"
                onClick={() => setRunnerPkg(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label="Tutup survei"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitRunner} className="flex-1 overflow-y-auto p-5 space-y-5">
              {isAdmin && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-slate-700">
                    Simulasi Pengisian Atas Nama Siswa:
                  </span>
                  <select
                    value={runnerStudentId}
                    onChange={(e) => setRunnerStudentId(e.target.value)}
                    className="h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                  >
                    {state.students
                      .filter((s) => s.status === 'Aktif')
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nama} ({s.kelas})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {runnerPkg.pertanyaan.map((q, idx) => {
                const ans = runnerAnswers[q.id];
                return (
                  <div
                    key={q.id}
                    className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-medium text-slate-500">
                          Butir {idx + 1} · {q.domain} · {QUESTION_TYPE_LABELS[q.tipe]}
                          {q.wajib && <span className="text-red-600 ml-1">*Wajib</span>}
                        </div>
                        <p className="text-sm font-semibold text-slate-900 mt-0.5">{q.pertanyaan}</p>
                      </div>
                    </div>

                    {q.tipe === 'isian_singkat' ? (
                      <textarea
                        rows={3}
                        value={ans?.textAnswer || ''}
                        onChange={(e) =>
                          setRunnerAnswers((prev) => ({
                            ...prev,
                            [q.id]: { questionId: q.id, textAnswer: e.target.value },
                          }))
                        }
                        placeholder="Tuliskan jawaban atau keterangan keluarga Anda di sini..."
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-800 focus:border-emerald-700 focus:outline-none"
                      />
                    ) : q.tipe === 'pg_kompleks' ? (
                      <div className="space-y-2">
                        {q.opsi.map((opt) => {
                          const selectedIds = ans?.selectedOptionIds || [];
                          const checked = selectedIds.includes(opt.id);
                          return (
                            <label
                              key={opt.id}
                              className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                                checked
                                  ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 font-medium'
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
                                  setRunnerAnswers((prev) => ({
                                    ...prev,
                                    [q.id]: {
                                      questionId: q.id,
                                      selectedOptionIds: nextIds,
                                    },
                                  }));
                                }}
                                className="mt-0.5 accent-emerald-700"
                              />
                              <span>{opt.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {q.opsi.map((opt) => {
                          const checked = ans?.selectedOptionId === opt.id;
                          return (
                            <label
                              key={opt.id}
                              className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                                checked
                                  ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 font-medium'
                                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`srv-q-${q.id}`}
                                checked={checked}
                                onChange={() =>
                                  setRunnerAnswers((prev) => ({
                                    ...prev,
                                    [q.id]: {
                                      questionId: q.id,
                                      selectedOptionId: opt.id,
                                      scaleValue: opt.nilaiSkor,
                                    },
                                  }))
                                }
                                className="mt-0.5 accent-emerald-700"
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

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 sticky bottom-0 bg-white py-3">
                <button
                  type="button"
                  onClick={() => setRunnerPkg(null)}
                  className="h-9 px-4 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingRunner}
                  className="h-9 px-4 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 inline-flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {submittingRunner ? 'Menyimpan...' : 'Kirim Jawaban Survei'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PACKAGE BUILDER (ADMIN) */}
      {builderOpen && isAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {editingPkgId ? 'Edit Paket Survei Orang Tua' : 'Buat Paket Survei Orang Tua Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setBuilderOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBuilder} className="flex-1 overflow-y-auto p-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kode Paket</label>
                  <input
                    type="text"
                    value={pkgKode}
                    onChange={(e) => setPkgKode(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs font-mono uppercase focus:border-emerald-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kategori</label>
                  <select
                    value={pkgKategori}
                    onChange={(e) =>
                      setPkgKategori(
                        e.target.value === 'Literasi Keluarga' ? 'Literasi Keluarga' : 'Kustom'
                      )
                    }
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs bg-white focus:border-emerald-700 focus:outline-none"
                  >
                    <option value="Kustom">Kustom</option>
                    <option value="Literasi Keluarga">Literasi Keluarga</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status Rilis</label>
                  <select
                    value={pkgStatus}
                    onChange={(e) => setPkgStatus(e.target.value as SurveyPackage['status'])}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs bg-white focus:border-emerald-700 focus:outline-none"
                  >
                    <option value="Draft">Draft (Disimpan)</option>
                    <option value="Dirilis">Dirilis ke Orang Tua</option>
                    <option value="Ditutup">Ditutup</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Judul Survei</label>
                <input
                  type="text"
                  value={pkgJudul}
                  onChange={(e) => setPkgJudul(e.target.value)}
                  placeholder="Contoh: Survei Kesiapan Pendampingan Belajar & Literasi Rumah"
                  className="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs focus:border-emerald-700 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Deskripsi</label>
                <textarea
                  rows={2}
                  value={pkgDeskripsi}
                  onChange={(e) => setPkgDeskripsi(e.target.value)}
                  placeholder="Tujuan survei dan petunjuk pengisian bagi orang tua..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-emerald-700 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Target Kelas (kosongkan semua bila berlaku untuk seluruh kelas)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {state.classes.map((cls) => {
                    const active = pkgTargetClasses.includes(cls);
                    return (
                      <button
                        key={cls}
                        type="button"
                        onClick={() =>
                          setPkgTargetClasses((prev) =>
                            active ? prev.filter((c) => c !== cls) : [...prev, cls]
                          )
                        }
                        className={`px-2.5 py-1 rounded-md border text-[11px] font-medium ${
                          active
                            ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                            : 'border-slate-200 bg-white text-slate-600'
                        }`}
                      >
                        {cls}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Question Editor */}
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-900">
                    Daftar Butir Survei ({pkgQuestions.length})
                  </h4>
                  <button
                    type="button"
                    onClick={() =>
                      setPkgQuestions((prev) => [
                        ...prev,
                        {
                          id: `sq-${Date.now()}-${prev.length + 1}`,
                          domain:
                            pkgKategori === 'Literasi Keluarga'
                              ? SURVEY_LITERASI_DOMAINS[0]
                              : 'Umum',
                          tipe: 'pilihan_ganda',
                          pertanyaan: '',
                          opsi: [
                            { id: 'a', label: 'Ya / Sangat Mendukung', nilaiSkor: 5 },
                            { id: 'b', label: 'Cukup Mendukung', nilaiSkor: 3 },
                            { id: 'c', label: 'Belum Tersedia', nilaiSkor: 1 },
                          ],
                          wajib: true,
                        },
                      ])
                    }
                    className="h-8 px-3 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Tambah Pertanyaan
                  </button>
                </div>

                {pkgQuestions.map((q, qIdx) => (
                  <div
                    key={q.id}
                    className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-700">
                        Butir #{qIdx + 1}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={q.domain}
                          onChange={(e) =>
                            setPkgQuestions((prev) =>
                              prev.map((item, idx) =>
                                idx === qIdx ? { ...item, domain: e.target.value } : item
                              )
                            )
                          }
                          placeholder="Domain / Aspek"
                          className="h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                        />
                        <select
                          value={q.tipe}
                          onChange={(e) => {
                            const nextType = e.target.value as SurveyQuestionType;
                            setPkgQuestions((prev) =>
                              prev.map((item, idx) => {
                                if (idx !== qIdx) return item;
                                let nextOpsi = item.opsi;
                                if (nextType === 'skala_likert' && item.opsi.length !== 5) {
                                  nextOpsi = LIKERT_PRESET.map((o) => ({ ...o }));
                                } else if (nextType === 'isian_singkat') {
                                  nextOpsi = [];
                                } else if (
                                  (nextType === 'pilihan_ganda' || nextType === 'pg_kompleks') &&
                                  item.opsi.length === 0
                                ) {
                                  nextOpsi = [
                                    { id: 'a', label: 'Pilihan 1', nilaiSkor: 5 },
                                    { id: 'b', label: 'Pilihan 2', nilaiSkor: 3 },
                                  ];
                                }
                                return { ...item, tipe: nextType, opsi: nextOpsi };
                              })
                            );
                          }}
                          className="h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                        >
                          {Object.entries(QUESTION_TYPE_LABELS).map(([val, lbl]) => (
                            <option key={val} value={val}>
                              {lbl}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            setPkgQuestions((prev) => prev.filter((_, idx) => idx !== qIdx))
                          }
                          className="h-8 px-2 rounded-lg border border-red-200 bg-white text-red-700 text-xs hover:bg-red-50"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>

                    <textarea
                      rows={2}
                      value={q.pertanyaan}
                      onChange={(e) =>
                        setPkgQuestions((prev) =>
                          prev.map((item, idx) =>
                            idx === qIdx ? { ...item, pertanyaan: e.target.value } : item
                          )
                        )
                      }
                      placeholder="Tuliskan pertanyaan survei..."
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                    />

                    {/* Options Editor under Question */}
                    {q.tipe !== 'isian_singkat' && (
                      <div className="space-y-2 pl-2 border-l-2 border-slate-200">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-slate-600">
                            Pilihan Jawaban &amp; Skor (1–5)
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setPkgQuestions((prev) =>
                                prev.map((item, idx) =>
                                  idx === qIdx
                                    ? {
                                        ...item,
                                        opsi: [
                                          ...item.opsi,
                                          {
                                            id: `opt-${Date.now()}-${item.opsi.length}`,
                                            label: `Pilihan ${item.opsi.length + 1}`,
                                            nilaiSkor: 3,
                                          },
                                        ],
                                      }
                                    : item
                                )
                              )
                            }
                            className="text-[11px] font-semibold text-emerald-700 hover:underline inline-flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" />
                            Tambah Opsi
                          </button>
                        </div>

                        {q.opsi.map((opt, oIdx) => (
                          <div key={opt.id} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={opt.label}
                              onChange={(e) =>
                                setPkgQuestions((prev) =>
                                  prev.map((item, idx) =>
                                    idx === qIdx
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
                              className="flex-1 h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                            />
                            <input
                              type="number"
                              min={1}
                              max={5}
                              value={opt.nilaiSkor ?? 3}
                              onChange={(e) =>
                                setPkgQuestions((prev) =>
                                  prev.map((item, idx) =>
                                    idx === qIdx
                                      ? {
                                          ...item,
                                          opsi: item.opsi.map((o, oi) =>
                                            oi === oIdx
                                              ? {
                                                  ...o,
                                                  nilaiSkor: Math.min(
                                                    5,
                                                    Math.max(1, Number(e.target.value) || 1)
                                                  ),
                                                }
                                              : o
                                          ),
                                        }
                                      : item
                                  )
                                )
                              }
                              className="w-16 h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-center font-mono"
                              title="Skor 1-5"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setPkgQuestions((prev) =>
                                  prev.map((item, idx) =>
                                    idx === qIdx
                                      ? { ...item, opsi: item.opsi.filter((_, oi) => oi !== oIdx) }
                                      : item
                                  )
                                )
                              }
                              className="p-1.5 text-slate-400 hover:text-red-600"
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

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 sticky bottom-0 bg-white py-3">
                <button
                  type="button"
                  onClick={() => setBuilderOpen(false)}
                  className="h-9 px-4 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingPkg}
                  className="h-9 px-4 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800"
                >
                  {savingPkg ? 'Menyimpan...' : 'Simpan Paket Survei'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RESPONSE DETAIL & VERIFY */}
      {detailResp && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-slate-500">
                  {detailResp.packageJudul} · {detailResp.kelas}
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  {detailResp.studentName} (Pengisi: {detailResp.parentName})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailResp(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
                  <div className="text-[11px] text-slate-500">Indeks Literasi Keluarga</div>
                  <div className="text-xl font-bold text-emerald-700 font-mono tabular-nums mt-0.5">
                    {detailResp.indeksLiterasi}%
                  </div>
                  <div className="text-[11px] font-medium text-slate-700 mt-0.5">
                    {detailResp.kategoriLiterasi}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
                  <div className="text-[11px] text-slate-500">Pojok Baca &amp; Koleksi Buku</div>
                  <div className="font-semibold text-slate-900 mt-1">
                    {detailResp.adaPojokBaca || '-'}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5">
                    Koleksi: {detailResp.jumlahBukuRumah || '-'}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
                  <div className="text-[11px] text-slate-500">Rutinitas Membaca</div>
                  <div className="font-semibold text-slate-900 mt-1">
                    {detailResp.frekuensiMembaca || '-'}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-semibold text-slate-900">Skor per Domain Literasi</div>
                {(detailResp.domainScores || []).map((d) => (
                  <div key={d.domain} className="border border-slate-200 rounded-lg p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800">{d.domain}</span>
                      <span className="font-mono font-bold text-slate-900 tabular-nums">
                        {d.skorPersen}% · {d.kategori}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          d.skorPersen >= 78
                            ? 'bg-emerald-600'
                            : d.skorPersen >= 58
                              ? 'bg-sky-600'
                              : 'bg-amber-600'
                        }`}
                        style={{ width: `${d.skorPersen}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-500">{d.ringkasan}</p>
                  </div>
                ))}
              </div>

              {/* Open answers / selected practices */}
              {(() => {
                const pkg = packages.find((p) => p.id === detailResp.packageId);
                if (!pkg) return null;
                return (
                  <div className="space-y-2">
                    <div className="font-semibold text-slate-900">Detail Jawaban Orang Tua</div>
                    <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                      {pkg.pertanyaan.map((q, i) => {
                        const ans = detailResp.answers.find((a) => a.questionId === q.id);
                        let ansText = '-';
                        if (q.tipe === 'isian_singkat') {
                          ansText = ans?.textAnswer || '(Tidak diisi)';
                        } else if (q.tipe === 'pg_kompleks') {
                          const labels = q.opsi
                            .filter((o) => (ans?.selectedOptionIds || []).includes(o.id))
                            .map((o) => o.label);
                          ansText = labels.length > 0 ? labels.join('; ') : '-';
                        } else {
                          ansText =
                            q.opsi.find((o) => o.id === ans?.selectedOptionId)?.label || '-';
                        }
                        return (
                          <div key={q.id} className="p-3 space-y-0.5">
                            <div className="text-[11px] text-slate-500">
                              {i + 1}. {q.pertanyaan}
                            </div>
                            <div className="font-medium text-slate-900">{ansText}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="font-semibold text-slate-800 mb-1">
                  Rekomendasi Olahan Sistem
                </div>
                <p className="text-slate-600 leading-relaxed">
                  {detailResp.rekomendasiTindakLanjut}
                </p>
              </div>

              {isAdmin && (
                <div className="border-t border-slate-200 pt-3 space-y-2">
                  <label className="block font-semibold text-slate-900">
                    Catatan &amp; Pengesahan Pengurus Sekolah
                  </label>
                  <textarea
                    rows={2}
                    value={verifyNote}
                    onChange={(e) => setVerifyNote(e.target.value)}
                    placeholder="Contoh: Disarankan mengikuti program pinjam buku mingguan bersama Wali Kelas..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={verifying}
                      onClick={async () => {
                        setVerifying(true);
                        const ok = await onVerifyResponse(detailResp.id, verifyNote);
                        setVerifying(false);
                        if (ok) {
                          onNotify('Catatan tindak lanjut survei berhasil disimpan.');
                          setDetailResp(null);
                        }
                      }}
                      className="h-9 px-4 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800"
                    >
                      {verifying ? 'Menyimpan...' : 'Simpan Catatan Pengurus'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
