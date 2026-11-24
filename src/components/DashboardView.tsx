import React from 'react';
import { BarChart3, ClipboardEdit, GraduationCap, Lock, Printer, Table2 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AppState, UserAccount } from '../types';
import {
  calculateClassLeger,
  calculateStudentSubjectGrade,
  filterSubjectsForUser,
  getSubjectsForClass,
  gradeKey,
  isInputLockedForUser,
  metaKey,
} from '../utils/academic';
import { SectionId } from './Sidebar';

interface DashboardViewProps {
  state: AppState;
  currentUser: UserAccount;
  selectedClass: string;
  onNavigate: (sec: SectionId) => void;
}

const PIE_COLORS = ['#15803d', '#0284c7', '#d97706', '#dc2626'];

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  currentUser,
  selectedClass,
  onNavigate,
}) => {
  const { settings, students, subjects, grades, reportMeta, p5Projects, classDefs, academicYears } = state;
  const semester = settings.semester;
  const role = currentUser.role;
  const lockStatus = isInputLockedForUser(settings, academicYears, currentUser);

  const activeStudents = students.filter((s) => s.kelas === selectedClass && s.status === 'Aktif');
  const classSubjectsAll = getSubjectsForClass(subjects, selectedClass, classDefs);
  const classSubjects = filterSubjectsForUser(classSubjectsAll, currentUser, selectedClass, {
    includeWaliClassView: true,
  });

  const legerRows = calculateClassLeger(
    students,
    classSubjects,
    grades,
    settings,
    semester,
    selectedClass,
    'SAS',
    classDefs
  );

  const predCounts = { A: 0, B: 0, C: 0, D: 0 };
  let totalEntriesPossible = activeStudents.length * classSubjects.length;
  let filledEntries = 0;
  let tuntasEntries = 0;

  const subjectAvgData = classSubjects.map((subj) => {
    let sum = 0;
    let cnt = 0;
    for (const stu of activeStudents) {
      const entry = grades[gradeKey(stu.id, subj.id, semester)];
      const calc = calculateStudentSubjectGrade(entry, subj, settings, stu.kelas, classDefs);
      if (calc.nilaiAkhir !== null) {
        filledEntries += 1;
        sum += calc.nilaiAkhir;
        cnt += 1;
        if (calc.tuntas) tuntasEntries += 1;
        if (calc.predikat in predCounts) {
          predCounts[calc.predikat as keyof typeof predCounts] += 1;
        }
      }
    }
    return {
      kode: subj.kode,
      nama: subj.nama,
      rataRata: cnt > 0 ? Math.round((sum / cnt) * 10) / 10 : 0,
    };
  });

  const pieData = [
    { name: 'Predikat A (90–100)', value: predCounts.A },
    { name: 'Predikat B (80–89)', value: predCounts.B },
    { name: `Predikat C (${settings.kktp}–79)`, value: predCounts.C },
    { name: `Predikat D (<${settings.kktp})`, value: predCounts.D },
  ].filter((d) => d.value > 0);

  const completionPct =
    totalEntriesPossible > 0 ? Math.round((filledEntries / totalEntriesPossible) * 100) : 0;

  const validRows = legerRows.filter((r) => r.jumlahMapelTerisi > 0);
  const overallAvg =
    validRows.length > 0
      ? (validRows.reduce((a, b) => a + b.rataRata, 0) / validRows.length).toFixed(2)
      : '0.00';

  const completedNotes = activeStudents.filter((s) => {
    const meta = reportMeta[metaKey(s.id, semester)];
    const hasProj = p5Projects.some((p) => p.studentId === s.id && p.semester === semester);
    return Boolean(meta && meta.catatanWaliKelas.trim()) && hasProj;
  }).length;

  const roleHeader =
    role === 'admin'
      ? 'Dasbor Pengurus PKBM / Sekolah'
      : role === 'walikelas'
        ? `Dasbor Wali ${selectedClass}`
        : 'Dasbor Guru Mata Pelajaran';

  return (
    <div className="space-y-6">
      {lockStatus.locked && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2.5 text-xs text-amber-900">
          <Lock className="w-4 h-4 text-amber-700 shrink-0" />
          <span>
            <strong>Akses Input Terkunci:</strong> {lockStatus.reason}
          </span>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-emerald-700">
            {roleHeader} · Semester {semester === '1' ? '1 (Ganjil)' : '2 (Genap)'} ·{' '}
            {settings.tahunAjaran} ({settings.tahunAjaranAktif === false ? 'Nonaktif' : 'Aktif'})
          </p>
          <h1 className="text-xl font-bold text-slate-900 mt-1">
            Pusat Pengolahan Nilai & Rapor {selectedClass}
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Kelola nilai komponen (Tugas, Kuis, Ujian), Capaian & Tujuan Pembelajaran per kelas, Projek Penguatan Profil Lulusan, portofolio, kartu pelajar, serta analisis statistika belajar.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('analytics')}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <BarChart3 className="w-4 h-4 text-emerald-700" />
            Analisis Statistika
          </button>
          <button
            type="button"
            onClick={() => onNavigate('grades')}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <ClipboardEdit className="w-4 h-4 text-slate-600" />
            Input Nilai Manual
          </button>
          {role === 'guru' ? (
            <button
              type="button"
              onClick={() => onNavigate('leger')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-700 text-sm font-medium text-white hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Table2 className="w-4 h-4" />
              Leger Kelas
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate('print')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-700 text-sm font-medium text-white hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Printer className="w-4 h-4" />
              Cetak Rapor PDF
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Siswa Aktif {selectedClass}</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900 tabular-nums font-mono">
              {activeStudents.length}
            </span>
            <span className="text-xs text-slate-500">dari {students.length} total siswa</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Kelengkapan Nilai Mapel</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900 tabular-nums font-mono">
              {completionPct}%
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              {filledEntries} / {totalEntriesPossible} entri
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Rata-rata Keseluruhan Kelas</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900 tabular-nums font-mono">
              {overallAvg}
            </span>
            <span className="text-xs text-emerald-700 font-medium tabular-nums">
              {tuntasEntries} / {filledEntries || 0} tuntas KKTP
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Profil Lulusan & Catatan Wali</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900 tabular-nums font-mono">
              {completedNotes}/{activeStudents.length}
            </span>
            <button
              type="button"
              onClick={() => onNavigate(role === 'guru' ? 'subjects' : 'parent')}
              className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-1"
            >
              <GraduationCap className="w-3.5 h-3.5" />
              {role === 'guru' ? 'Lihat CP & TP' : 'Portal Ortu'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Grafik Rata-rata Nilai per Mata Pelajaran ({selectedClass})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Garis putus-putus menunjukkan batas KKTP minimal ({settings.kktp})
              </p>
            </div>
          </div>

          {subjectAvgData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-slate-400">
              Belum ada data mata pelajaran yang dapat ditampilkan untuk akun Anda di kelas ini.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subjectAvgData} margin={{ top: 10, right: 16, left: -12, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="kode"
                    tick={{ fontSize: 11, fill: '#475569' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: '#475569' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value) => [Number(value).toFixed(1), 'Rata-rata']}
                    labelFormatter={(label, payload) =>
                      payload?.[0]?.payload?.nama || String(label)
                    }
                    contentStyle={{
                      fontSize: '12px',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                    }}
                  />
                  <ReferenceLine
                    y={settings.kktp}
                    stroke="#d97706"
                    strokeDasharray="4 4"
                    label={{
                      value: `KKTP ${settings.kktp}`,
                      position: 'right',
                      fill: '#b45309',
                      fontSize: 10,
                    }}
                  />
                  <Bar dataKey="rataRata" radius={[4, 4, 0, 0]} maxBarSize={36}>
                    {subjectAvgData.map((entry, idx) => (
                      <Cell
                        key={`bar-${idx}`}
                        fill={entry.rataRata >= settings.kktp ? '#15803d' : '#dc2626'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-slate-900">Distribusi Nilai Kelas</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Sebaran predikat mata pelajaran di {selectedClass}
            </p>
          </div>
          {pieData.length === 0 ? (
            <div className="flex-1 min-h-[220px] flex items-center justify-center text-xs text-slate-400">
              Belum ada nilai yang diinput di kelas ini.
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-between">
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={42}
                      outerRadius={72}
                      paddingAngle={2}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs">
                {pieData.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-700">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      <span>{item.name}</span>
                    </div>
                    <span className="font-mono font-semibold tabular-nums text-slate-900">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
