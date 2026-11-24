import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BarChart3,
  BookOpen,
  Download,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AppState, Student, Subject, UserAccount } from '../types';
import { exportAnalyticsExcel } from '../utils/excel';
import {
  calculateStudentSubjectGrade,
  computeDescriptiveStats,
  filterSubjectsForUser,
  getAccessibleClassesForUser,
  getSubjectTPsForClass,
  getSubjectsForClass,
  gradeKey,
  metaKey,
  pearsonCorrelation,
} from '../utils/academic';

interface AnalyticsViewProps {
  state: AppState;
  currentUser: UserAccount;
  selectedClass: string;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  state,
  currentUser,
  selectedClass,
}) => {
  const { settings, students, subjects, grades, reportMeta, classDefs } = state;

  const orderedClasses =
    classDefs.length > 0
      ? [...classDefs].sort((a, b) => a.urutan - b.urutan).map((c) => c.nama)
      : state.classes;

  const accessibleClasses = useMemo(
    () => getAccessibleClassesForUser(orderedClasses, currentUser),
    [orderedClasses, currentUser]
  );

  const [classScope, setClassScope] = useState<string>(selectedClass || accessibleClasses[0] || '');
  const [semScope, setSemScope] = useState<'1' | '2'>(settings.semester);
  const [subjectScope, setSubjectScope] = useState<string>('ALL');

  useEffect(() => {
    if (selectedClass && (accessibleClasses.includes(selectedClass) || currentUser.role === 'admin')) {
      setClassScope(selectedClass);
    }
  }, [selectedClass, accessibleClasses, currentUser.role]);

  const targetClasses = useMemo(() => {
    if (classScope === 'ALL_ACCESSIBLE') return accessibleClasses;
    return [classScope];
  }, [classScope, accessibleClasses]);

  const scopedStudents = useMemo(
    () =>
      students
        .filter((s) => s.status === 'Aktif' && targetClasses.includes(s.kelas))
        .sort((a, b) => a.nama.localeCompare(b.nama, 'id')),
    [students, targetClasses]
  );

  const scopedSubjects = useMemo(() => {
    const map = new Map<string, Subject>();
    targetClasses.forEach((cls) => {
      const allClsSubjs = getSubjectsForClass(subjects, cls, classDefs);
      const allowed = filterSubjectsForUser(allClsSubjs, currentUser, cls, {
        includeWaliClassView: true,
      });
      allowed.forEach((sub) => map.set(sub.id, sub));
    });
    return Array.from(map.values()).sort((a, b) => a.urutan - b.urutan);
  }, [targetClasses, subjects, classDefs, currentUser]);

  useEffect(() => {
    if (subjectScope !== 'ALL' && !scopedSubjects.some((s) => s.id === subjectScope)) {
      setSubjectScope('ALL');
    }
  }, [scopedSubjects, subjectScope]);

  const activeSubjectsForCalc =
    subjectScope === 'ALL'
      ? scopedSubjects
      : scopedSubjects.filter((s) => s.id === subjectScope);

  // Collect raw paired records for statistical analysis
  const analysisData = useMemo(() => {
    const finalScores: number[] = [];
    const tugasArr: number[] = [];
    const kuisArr: number[] = [];
    const ujianArr: number[] = [];

    const pairTU_x: number[] = [];
    const pairTU_y: number[] = [];
    const pairKU_x: number[] = [];
    const pairKU_y: number[] = [];

    const perSubjectSummary: Array<{
      subject: Subject;
      count: number;
      mean: number;
      min: number;
      max: number;
      stdDev: number;
      tuntasPct: number;
      remedialCount: number;
    }> = [];

    const studentAverages: Array<{
      student: Student;
      avgSemActive: number | null;
      avgSemOther: number | null;
      delta: number | null;
      absensiTotal: number;
      remedialSubjects: string[];
      filled: number;
    }> = [];

    const otherSem: '1' | '2' = semScope === '1' ? '2' : '1';

    activeSubjectsForCalc.forEach((subj) => {
      const subjScores: number[] = [];
      let subjTuntas = 0;

      scopedStudents.forEach((stu) => {
        const stuAllowed = filterSubjectsForUser(
          getSubjectsForClass(subjects, stu.kelas, classDefs, stu.jurusan || 'Umum'),
          currentUser,
          stu.kelas,
          { includeWaliClassView: true }
        );
        if (!stuAllowed.some((s) => s.id === subj.id)) return;

        const entry = grades[gradeKey(stu.id, subj.id, semScope)];
        const calc = calculateStudentSubjectGrade(entry, subj, settings, stu.kelas, classDefs);

        if (calc.tugas !== null) tugasArr.push(calc.tugas);
        if (calc.kuis !== null) kuisArr.push(calc.kuis);
        if (calc.ujian !== null) ujianArr.push(calc.ujian);

        if (calc.tugas !== null && calc.ujian !== null) {
          pairTU_x.push(calc.tugas);
          pairTU_y.push(calc.ujian);
        }
        if (calc.kuis !== null && calc.ujian !== null) {
          pairKU_x.push(calc.kuis);
          pairKU_y.push(calc.ujian);
        }

        if (calc.nilaiAkhir !== null) {
          finalScores.push(calc.nilaiAkhir);
          subjScores.push(calc.nilaiAkhir);
          if (calc.tuntas) subjTuntas += 1;
        }
      });

      const subStats = computeDescriptiveStats(subjScores);
      perSubjectSummary.push({
        subject: subj,
        count: subStats.count,
        mean: subStats.mean,
        min: subStats.min,
        max: subStats.max,
        stdDev: subStats.stdDev,
        tuntasPct: subStats.count > 0 ? Math.round((subjTuntas / subStats.count) * 100) : 0,
        remedialCount: subjScores.filter((v) => v < settings.kktp).length,
      });
    });

    scopedStudents.forEach((stu) => {
      const stuAllowed = filterSubjectsForUser(
        getSubjectsForClass(subjects, stu.kelas, classDefs, stu.jurusan || 'Umum'),
        currentUser,
        stu.kelas,
        { includeWaliClassView: true }
      ).filter((s) => subjectScope === 'ALL' || s.id === subjectScope);

      const valsActive: number[] = [];
      const valsOther: number[] = [];
      const remedialSubjects: string[] = [];

      stuAllowed.forEach((subj) => {
        const c1 = calculateStudentSubjectGrade(
          grades[gradeKey(stu.id, subj.id, semScope)],
          subj,
          settings,
          stu.kelas,
          classDefs
        );
        if (c1.nilaiAkhir !== null) {
          valsActive.push(c1.nilaiAkhir);
          if (c1.nilaiAkhir < settings.kktp) {
            remedialSubjects.push(`${subj.kode} (${c1.nilaiAkhir})`);
          }
        }
        const c2 = calculateStudentSubjectGrade(
          grades[gradeKey(stu.id, subj.id, otherSem)],
          subj,
          settings,
          stu.kelas,
          classDefs
        );
        if (c2.nilaiAkhir !== null) valsOther.push(c2.nilaiAkhir);
      });

      const avgActive =
        valsActive.length > 0
          ? Math.round((valsActive.reduce((a, b) => a + b, 0) / valsActive.length) * 100) / 100
          : null;
      const avgOther =
        valsOther.length > 0
          ? Math.round((valsOther.reduce((a, b) => a + b, 0) / valsOther.length) * 100) / 100
          : null;
      const delta =
        avgActive !== null && avgOther !== null
          ? Math.round((avgActive - avgOther) * 100) / 100
          : null;
      const meta = reportMeta[metaKey(stu.id, semScope)];
      const absensiTotal = meta
        ? (meta.absensi.sakit || 0) + (meta.absensi.izin || 0) + (meta.absensi.alpha || 0)
        : 0;

      studentAverages.push({
        student: stu,
        avgSemActive: avgActive,
        avgSemOther: avgOther,
        delta,
        absensiTotal,
        remedialSubjects,
        filled: valsActive.length,
      });
    });

    // Attendance vs score correlation
    const absX: number[] = [];
    const absY: number[] = [];
    studentAverages.forEach((row) => {
      if (row.avgSemActive !== null) {
        absX.push(row.absensiTotal);
        absY.push(row.avgSemActive);
      }
    });

    const stats = computeDescriptiveStats(finalScores);
    const tuntasTotal = finalScores.filter((v) => v >= settings.kktp).length;
    const tuntasPct =
      finalScores.length > 0 ? Math.round((tuntasTotal / finalScores.length) * 1000) / 10 : 0;

    return {
      stats,
      tuntasTotal,
      tuntasPct,
      avgTugas: computeDescriptiveStats(tugasArr).mean,
      avgKuis: computeDescriptiveStats(kuisArr).mean,
      avgUjian: computeDescriptiveStats(ujianArr).mean,
      corrTugasUjian: pearsonCorrelation(pairTU_x, pairTU_y),
      corrKuisUjian: pearsonCorrelation(pairKU_x, pairKU_y),
      corrAbsensiNilai: pearsonCorrelation(absX, absY),
      perSubjectSummary,
      studentAverages,
    };
  }, [
    activeSubjectsForCalc,
    scopedStudents,
    subjects,
    classDefs,
    currentUser,
    grades,
    semScope,
    settings,
    subjectScope,
    reportMeta,
  ]);

  // TP Mastery Breakdown for specific subject (or first active subject)
  const tpFocusSubject =
    subjectScope !== 'ALL'
      ? activeSubjectsForCalc[0]
      : activeSubjectsForCalc[0] || null;

  const tpMasteryRows = useMemo(() => {
    if (!tpFocusSubject) return [];
    const sampleClass = classScope === 'ALL_ACCESSIBLE' ? targetClasses[0] : classScope;
    const tps = getSubjectTPsForClass(tpFocusSubject, sampleClass, classDefs);
    return tps.map((tp) => {
      const vals: number[] = [];
      scopedStudents.forEach((stu) => {
        const entry = grades[gradeKey(stu.id, tpFocusSubject.id, semScope)];
        const val = entry?.tpScores?.[tp.id];
        if (typeof val === 'number' && !Number.isNaN(val)) vals.push(val);
      });
      const avg =
        vals.length > 0
          ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
          : null;
      const tuntas = vals.filter((v) => v >= settings.kktp).length;
      return {
        tp,
        count: vals.length,
        avg,
        tuntasPct: vals.length > 0 ? Math.round((tuntas / vals.length) * 100) : null,
      };
    });
  }, [tpFocusSubject, classScope, targetClasses, classDefs, scopedStudents, grades, semScope, settings.kktp]);

  const remedialStudents = analysisData.studentAverages
    .filter((r) => r.remedialSubjects.length > 0)
    .sort((a, b) => (a.avgSemActive ?? 0) - (b.avgSemActive ?? 0));

  const pengayaanStudents = analysisData.studentAverages
    .filter((r) => r.avgSemActive !== null && r.avgSemActive >= 90)
    .sort((a, b) => (b.avgSemActive ?? 0) - (a.avgSemActive ?? 0));

  const handleExportExcel = () => {
    exportAnalyticsExcel({
      classScope,
      semScope,
      stats: analysisData.stats,
      tuntasPct: analysisData.tuntasPct,
      perSubjectSummary: analysisData.perSubjectSummary,
      studentAverages: analysisData.studentAverages,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header & Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold text-slate-900">
            Analisis Statistika & Hasil Belajar Akademik Terpadu
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Statistika deskriptif, sebaran distribusi nilai, korelasi komponen belajar, pemetaan ketuntasan TP, dan identifikasi remedial/pengayaan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={classScope}
            onChange={(e) => setClassScope(e.target.value)}
            aria-label="Filter Kelas Analisis"
            className="h-9 rounded-lg border border-slate-300 bg-white px-3 font-medium text-slate-900"
          >
            {accessibleClasses.length > 1 && (
              <option value="ALL_ACCESSIBLE">
                Semua Kelas ({accessibleClasses.length})
              </option>
            )}
            {accessibleClasses.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={subjectScope}
            onChange={(e) => setSubjectScope(e.target.value)}
            aria-label="Filter Mata Pelajaran Analisis"
            className="h-9 min-w-[180px] rounded-lg border border-slate-300 bg-white px-3 font-medium text-slate-900"
          >
            <option value="ALL">Semua Mata Pelajaran ({scopedSubjects.length})</option>
            {scopedSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.kode} — {s.nama}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setSemScope('1')}
              className={`px-3 py-1 rounded-md font-medium whitespace-nowrap ${
                semScope === '1' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Semester 1
            </button>
            <button
              type="button"
              onClick={() => setSemScope('2')}
              className={`px-3 py-1 rounded-md font-medium whitespace-nowrap ${
                semScope === '2' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Semester 2
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" /> Ekspor Excel
          </button>
        </div>
      </div>

      {/* Primary KPI & Descriptive Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Mean (Rata-rata)</div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {analysisData.stats.count > 0 ? analysisData.stats.mean.toFixed(2) : '-'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            N = {analysisData.stats.count} nilai
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Median / Modus</div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {analysisData.stats.count > 0 ? analysisData.stats.median.toFixed(1) : '-'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            Modus: {analysisData.stats.mode ?? 'Tidak tunggal'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Simpangan Baku (SD)</div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {analysisData.stats.count > 0 ? analysisData.stats.stdDev.toFixed(2) : '-'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            Varians: {analysisData.stats.variance.toFixed(1)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Min — Maks (Rentang)</div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {analysisData.stats.count > 0
              ? `${analysisData.stats.min}–${analysisData.stats.max}`
              : '-'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            Range: {analysisData.stats.range} · IQR: {analysisData.stats.iqr}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Ketuntasan KKTP ({settings.kktp})</div>
          <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
            {analysisData.tuntasPct}%
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            {analysisData.tuntasTotal} dari {analysisData.stats.count} entri
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Korelasi Tugas → Ujian</div>
          <div className="text-xl font-bold font-mono tabular-nums text-sky-700 mt-1">
            {analysisData.corrTugasUjian !== null ? `r = ${analysisData.corrTugasUjian}` : '-'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            Kuis→Ujian: {analysisData.corrKuisUjian ?? '-'}
          </div>
        </div>
      </div>

      {/* Charts Row: Histogram + Per-Subject Averages */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Histogram Sebaran Nilai Siswa
              </h2>
              <p className="text-xs text-slate-500">
                Frekuensi nilai akhir pada 5 interval rentang skor
              </p>
            </div>
            <BarChart3 className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={analysisData.stats.histogram}
                margin={{ top: 10, right: 12, left: -16, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                <Tooltip
                  formatter={(value, _name, item) => [
                    `${value} nilai (${item?.payload?.pct ?? 0}%)`,
                    'Frekuensi',
                  ]}
                  contentStyle={{ fontSize: '12px', borderRadius: '8px' }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={42}>
                  {analysisData.stats.histogram.map((b, i) => (
                    <Cell
                      key={b.bucket}
                      fill={
                        i === 0
                          ? '#dc2626'
                          : i === 1
                            ? '#d97706'
                            : i === 2
                              ? '#0284c7'
                              : '#15803d'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Perbandingan Rata-rata & Ketuntasan per Mata Pelajaran
              </h2>
              <p className="text-xs text-slate-500">
                Rata-rata skor vs batas KKTP {settings.kktp}
              </p>
            </div>
            <TrendingUp className="w-4 h-4 text-emerald-700" />
          </div>
          {analysisData.perSubjectSummary.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-slate-400">
              Belum ada mata pelajaran untuk dianalisis.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analysisData.perSubjectSummary.map((r) => ({
                    kode: r.subject.kode,
                    nama: r.subject.nama,
                    mean: r.mean,
                    tuntasPct: r.tuntasPct,
                  }))}
                  margin={{ top: 10, right: 12, left: -16, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="kode" tick={{ fontSize: 11, fill: '#475569' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#475569' }} />
                  <Tooltip
                    formatter={(val, name) => [
                      name === 'mean' ? Number(val).toFixed(2) : `${val}%`,
                      name === 'mean' ? 'Rata-rata' : 'Ketuntasan',
                    ]}
                    labelFormatter={(label, p) => p?.[0]?.payload?.nama || String(label)}
                    contentStyle={{ fontSize: '12px', borderRadius: '8px' }}
                  />
                  <ReferenceLine y={settings.kktp} stroke="#d97706" strokeDasharray="4 4" />
                  <Bar dataKey="mean" radius={[4, 4, 0, 0]} maxBarSize={36}>
                    {analysisData.perSubjectSummary.map((r) => (
                      <Cell
                        key={r.subject.id}
                        fill={r.mean >= settings.kktp ? '#15803d' : '#dc2626'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Component Diagnostics & Subject Statistical Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
          <div className="border-b border-slate-200 pb-2.5">
            <h2 className="text-sm font-semibold text-slate-900">
              Diagnostik Komponen & Korelasi Belajar
            </h2>
          </div>
          <div className="space-y-2.5">
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-600">Rata-rata Komponen Tugas</span>
              <span className="font-mono font-bold text-slate-900">
                {analysisData.avgTugas ? analysisData.avgTugas.toFixed(2) : '-'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-600">Rata-rata Komponen Kuis</span>
              <span className="font-mono font-bold text-slate-900">
                {analysisData.avgKuis ? analysisData.avgKuis.toFixed(2) : '-'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-600">Rata-rata Komponen Ujian</span>
              <span className="font-mono font-bold text-slate-900">
                {analysisData.avgUjian ? analysisData.avgUjian.toFixed(2) : '-'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-600">Kuartil 1 (Q1) · Kuartil 3 (Q3)</span>
              <span className="font-mono font-semibold text-slate-900">
                {analysisData.stats.q1} · {analysisData.stats.q3}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-600">Korelasi Ketidakhadiran vs Nilai (r)</span>
              <span className="font-mono font-semibold text-slate-900">
                {analysisData.corrAbsensiNilai ?? 'Data belum cukup'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed pt-1">
              Nilai korelasi Pearson (r) mendekati +1 menunjukkan konsistensi tinggi antara latihan (Tugas/Kuis) dan capaian Ujian; nilai negatif pada absensi menunjukkan dampak ketidakhadiran terhadap rata-rata nilai.
            </p>
          </div>
        </div>

        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">
              Matriks Statistika Per Mata Pelajaran (Semester {semScope})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-4 py-2.5">Mata Pelajaran</th>
                  <th className="px-3 py-2.5 text-center font-mono">N</th>
                  <th className="px-3 py-2.5 text-center font-mono">Mean</th>
                  <th className="px-3 py-2.5 text-center font-mono">SD</th>
                  <th className="px-3 py-2.5 text-center font-mono">Min–Max</th>
                  <th className="px-3 py-2.5 text-center font-mono">Tuntas</th>
                  <th className="px-3 py-2.5 text-center font-mono">Remedial</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {analysisData.perSubjectSummary.map((row) => (
                  <tr key={row.subject.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5">
                      <span className="font-mono font-semibold text-slate-700 mr-1.5">
                        {row.subject.kode}
                      </span>
                      <span className="font-medium text-slate-900">{row.subject.nama}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono tabular-nums">{row.count}</td>
                    <td className="px-3 py-2.5 text-center font-mono tabular-nums font-bold text-slate-900">
                      {row.count > 0 ? row.mean.toFixed(2) : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono tabular-nums text-slate-600">
                      {row.count > 0 ? row.stdDev.toFixed(2) : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono tabular-nums text-slate-600">
                      {row.count > 0 ? `${row.min}–${row.max}` : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono tabular-nums font-semibold text-emerald-700">
                      {row.count > 0 ? `${row.tuntasPct}%` : '-'}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-center font-mono tabular-nums font-semibold ${
                        row.remedialCount > 0 ? 'text-red-600' : 'text-slate-400'
                      }`}
                    >
                      {row.remedialCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* TP Mastery & Remedial/Enrichment Identification */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-emerald-700" />
              <h2 className="text-sm font-semibold text-slate-900">
                Analisis Ketercapaian TP ({tpFocusSubject?.kode || '-'})
              </h2>
            </div>
          </div>
          {tpMasteryRows.length === 0 ? (
            <p className="text-slate-500">Pilih mata pelajaran untuk melihat tingkat penguasaan per TP.</p>
          ) : (
            <div className="space-y-2.5">
              {tpMasteryRows.map((row) => (
                <div key={row.tp.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-900">{row.tp.kode}</span>
                    <span
                      className={`font-mono font-bold tabular-nums ${
                        row.avg === null
                          ? 'text-slate-400'
                          : row.avg >= settings.kktp
                            ? 'text-emerald-700'
                            : 'text-red-600'
                      }`}
                    >
                      {row.avg !== null ? `Rata-rata ${row.avg} · Tuntas ${row.tuntasPct}%` : 'Belum diisi'}
                    </span>
                  </div>
                  <p className="text-slate-600 leading-snug">{row.tp.deskripsi}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <h2 className="text-sm font-semibold text-slate-900">
                  Prioritas Pendampingan / Remedial ({remedialStudents.length})
                </h2>
              </div>
            </div>
            {remedialStudents.length === 0 ? (
              <p className="text-emerald-700 font-medium">
                Seluruh siswa pada filter ini mencapai ketuntasan KKTP ({settings.kktp}).
              </p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {remedialStudents.map((r) => (
                  <div key={r.student.id} className="py-2.5 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900">{r.student.nama}</span>
                      <span className="font-mono text-slate-500">{r.student.kelas}</span>
                    </div>
                    <div className="text-red-700 font-mono text-[11px]">
                      Belum tuntas: {r.remedialSubjects.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-emerald-700" />
                <h2 className="text-sm font-semibold text-slate-900">
                  Siswa Berprestasi / Pengayaan ({pengayaanStudents.length})
                </h2>
              </div>
            </div>
            {pengayaanStudents.length === 0 ? (
              <p className="text-slate-500">
                Belum ada siswa dengan rata-rata minimal 90 pada filter ini.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {pengayaanStudents.map((r) => (
                  <div key={r.student.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-900">{r.student.nama}</div>
                      <div className="text-[11px] text-slate-500">
                        {r.student.kelas} · Absensi: {r.absensiTotal} hari
                      </div>
                    </div>
                    <span className="font-mono font-bold text-emerald-700 tabular-nums">
                      {r.avgSemActive?.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
