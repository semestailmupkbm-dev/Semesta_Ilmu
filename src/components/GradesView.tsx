import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Lock,
  SlidersHorizontal,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import {
  AcademicYearRecord,
  ClassDef,
  GradeEntry,
  SchoolSettings,
  Student,
  Subject,
  UserAccount,
} from '../types';
import {
  calculateStudentSubjectGrade,
  calculateSubjectClassStats,
  clampScore,
  filterSubjectsForUser,
  getClassTingkat,
  getSubjectCPsForClass,
  getSubjectsForClass,
  gradeKey,
  isInputLockedForUser,
} from '../utils/academic';
import { downloadGradeTemplate, importGradesExcel } from '../utils/excel';

interface GradesViewProps {
  students: Student[];
  subjects: Subject[];
  grades: Record<string, GradeEntry>;
  settings: SchoolSettings;
  academicYears?: AcademicYearRecord[];
  selectedClass: string;
  classDefs: ClassDef[];
  currentUser: UserAccount;
  onUpdateGrade: (key: string, entry: GradeEntry) => void;
  onBulkUpdateGrades: (grades: Record<string, GradeEntry>) => void;
  onQuickCreateStudent: (nama: string, kelas: string) => Student;
  onNotify: (msg: string, isError?: boolean) => void;
}

export const GradesView: React.FC<GradesViewProps> = ({
  students,
  subjects,
  grades,
  settings,
  academicYears,
  selectedClass,
  classDefs,
  currentUser,
  onUpdateGrade,
  onBulkUpdateGrades,
  onQuickCreateStudent,
  onNotify,
}) => {
  const semester = settings.semester;
  const isAdmin = currentUser.role === 'admin';
  const lockStatus = isInputLockedForUser(settings, academicYears, currentUser);
  const isLocked = lockStatus.locked;
  const tingkat = getClassTingkat(selectedClass, classDefs);
  const hasJurusan = tingkat !== null && tingkat >= 11;
  const [jurusanFilter, setJurusanFilter] = useState<'ALL' | 'IPA' | 'IPS'>('ALL');
  const [inputMode, setInputMode] = useState<'manual' | 'grid'>('manual');

  const classSubjectsAll = getSubjectsForClass(
    subjects,
    selectedClass,
    classDefs,
    hasJurusan ? jurusanFilter : 'ALL'
  );
  const classSubjects = filterSubjectsForUser(classSubjectsAll, currentUser, selectedClass);

  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(classSubjects[0]?.id || '');
  useEffect(() => {
    if (classSubjects.length > 0 && !classSubjects.some((s) => s.id === selectedSubjectId)) {
      setSelectedSubjectId(classSubjects[0].id);
    }
  }, [classSubjects, selectedSubjectId]);

  const activeSubject = classSubjects.find((s) => s.id === selectedSubjectId) || classSubjects[0];

  const classStudents = students
    .filter((s) => s.kelas === selectedClass && s.status === 'Aktif')
    .filter((s) => !hasJurusan || jurusanFilter === 'ALL' || s.jurusan === jurusanFilter)
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));

  const [studentMode, setStudentMode] = useState<'existing' | 'new'>('existing');
  const [selectedStudentId, setSelectedStudentId] = useState<string>(classStudents[0]?.id || '');
  const [newStudentName, setNewStudentName] = useState('');

  useEffect(() => {
    if (classStudents.length > 0 && !classStudents.some((s) => s.id === selectedStudentId)) {
      setSelectedStudentId(classStudents[0].id);
    }
  }, [classStudents, selectedStudentId]);

  const [manualTugas, setManualTugas] = useState('');
  const [manualKuis, setManualKuis] = useState('');
  const [manualUjian, setManualUjian] = useState('');
  const [manualCatatanGuru, setManualCatatanGuru] = useState('');

  useEffect(() => {
    if (studentMode === 'existing' && selectedStudentId && activeSubject) {
      const entry = grades[gradeKey(selectedStudentId, activeSubject.id, semester)];
      setManualTugas(entry?.tugas !== null && entry?.tugas !== undefined ? String(entry.tugas) : '');
      setManualKuis(entry?.kuis !== null && entry?.kuis !== undefined ? String(entry.kuis) : '');
      setManualUjian(entry?.ujian !== null && entry?.ujian !== undefined ? String(entry.ujian) : '');
      setManualCatatanGuru(entry?.catatanGuru || '');
    }
  }, [studentMode, selectedStudentId, activeSubject, grades, semester]);

  const [detailModalStudentId, setDetailModalStudentId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!activeSubject) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-2">
        <p className="text-sm font-semibold text-slate-900">
          Tidak ada mata pelajaran yang ditugaskan untuk Anda di {selectedClass}.
        </p>
        <p className="text-xs text-slate-500">
          Hubungi Pengurus PKBM (Admin) untuk penugasan mata pelajaran di kelas ini.
        </p>
      </div>
    );
  }

  const classStats = calculateSubjectClassStats(
    classStudents,
    activeSubject,
    grades,
    settings,
    classDefs
  );

  const validOverallScores = classStudents
    .map((s) => {
      const e = grades[gradeKey(s.id, activeSubject.id, semester)];
      return calculateStudentSubjectGrade(e, activeSubject, settings, s.kelas, classDefs)
        .nilaiAkhir;
    })
    .filter((v): v is number => v !== null);

  const overallClassAvg =
    validOverallScores.length > 0
      ? (validOverallScores.reduce((a, b) => a + b, 0) / validOverallScores.length).toFixed(2)
      : '-';

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) {
      onNotify(lockStatus.reason || 'Pengisian nilai sedang dikunci.', true);
      return;
    }
    let targetStudent = classStudents.find((s) => s.id === selectedStudentId);
    if (studentMode === 'new') {
      if (!isAdmin) {
        onNotify('Penambahan peserta didik baru hanya dapat dilakukan oleh Pengurus PKBM.', true);
        return;
      }
      if (!newStudentName.trim()) {
        onNotify('Masukkan nama siswa baru terlebih dahulu.', true);
        return;
      }
      targetStudent = onQuickCreateStudent(newStudentName.trim(), selectedClass);
      setStudentMode('existing');
      setSelectedStudentId(targetStudent.id);
      setNewStudentName('');
    }
    if (!targetStudent) {
      onNotify('Pilih peserta didik terlebih dahulu.', true);
      return;
    }

    const key = gradeKey(targetStudent.id, activeSubject.id, semester);
    const prev = grades[key] || {};
    onUpdateGrade(key, {
      ...prev,
      tugas: clampScore(manualTugas),
      kuis: clampScore(manualKuis),
      ujian: clampScore(manualUjian),
      catatanGuru: manualCatatanGuru.trim(),
    });
    onNotify(`Nilai ${targetStudent.nama} (${activeSubject.kode}) berhasil disimpan.`);
  };

  const handleGridCellChange = (
    studentId: string,
    target: { type: 'tugas' | 'kuis' | 'ujian' | 'sts' | 'sas' | 'manualNilai' | 'manualDesk' | 'catatanGuru' | 'tp'; tpId?: string },
    rawVal: string
  ) => {
    if (isLocked) return;
    const key = gradeKey(studentId, activeSubject.id, semester);
    const prev = grades[key] || {};
    if (target.type === 'tp' && target.tpId) {
      onUpdateGrade(key, {
        ...prev,
        tpScores: {
          ...(prev.tpScores || {}),
          [target.tpId]: clampScore(rawVal),
        },
      });
    } else if (target.type === 'manualNilai') {
      onUpdateGrade(key, { ...prev, manualNilaiAkhir: clampScore(rawVal) });
    } else if (target.type === 'manualDesk') {
      onUpdateGrade(key, { ...prev, manualDeskripsi: rawVal });
    } else if (target.type === 'catatanGuru') {
      onUpdateGrade(key, { ...prev, catatanGuru: rawVal });
    } else {
      onUpdateGrade(key, { ...prev, [target.type]: clampScore(rawVal) });
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (isLocked) {
      onNotify(lockStatus.reason || 'Pengisian nilai sedang dikunci.', true);
      return;
    }
    try {
      const { updatedGrades, matchedCount } = await importGradesExcel(
        file,
        classStudents,
        activeSubject,
        semester,
        grades,
        selectedClass,
        classDefs
      );
      onBulkUpdateGrades(updatedGrades);
      onNotify(`Nilai Excel berhasil diimpor untuk ${matchedCount} peserta didik.`);
    } catch {
      onNotify('Gagal membaca file Excel nilai.', true);
    }
  };

  const detailStudent = detailModalStudentId
    ? classStudents.find((s) => s.id === detailModalStudentId)
    : null;
  const detailEntry = detailStudent
    ? grades[gradeKey(detailStudent.id, activeSubject.id, semester)] || {}
    : null;
  const detailCalc =
    detailStudent && detailEntry
      ? calculateStudentSubjectGrade(
          detailEntry,
          activeSubject,
          settings,
          detailStudent.kelas,
          classDefs
        )
      : null;
  const detailCps = detailStudent
    ? getSubjectCPsForClass(activeSubject, detailStudent.kelas, classDefs)
    : [];

  return (
    <div className="space-y-6">
      {isLocked && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2.5 text-xs text-amber-900">
          <Lock className="w-4 h-4 text-amber-700 shrink-0" />
          <span>
            <strong>Pengisian Nilai Dikunci:</strong> {lockStatus.reason} Anda hanya dapat melihat nilai tanpa mengubah data.
          </span>
        </div>
      )}
      {/* Top Bar Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label
              htmlFor="grade-subject-select"
              className="block text-xs font-medium text-slate-500 mb-1"
            >
              Mata Pelajaran ({selectedClass})
            </label>
            <select
              id="grade-subject-select"
              value={activeSubject.id}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="h-9 min-w-[260px] rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 focus:border-emerald-700 focus:outline-none"
            >
              {classSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.kode} — {s.nama}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-500 mb-1">Mode Input Nilai</span>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setInputMode('manual')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  inputMode === 'manual'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Input Manual Per Siswa
              </button>
              <button
                type="button"
                onClick={() => setInputMode('grid')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  inputMode === 'grid'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tabel Nilai Kelas
              </button>
            </div>
          </div>

          {hasJurusan && (
            <div>
              <span className="block text-xs font-medium text-slate-500 mb-1">
                Filter Jurusan (Kelas {tingkat})
              </span>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {(['ALL', 'IPA', 'IPS'] as const).map((j) => (
                  <button
                    key={j}
                    type="button"
                    onClick={() => setJurusanFilter(j)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      jurusanFilter === j
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {j === 'ALL' ? 'Semua' : j}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleImportExcel}
            className="hidden"
          />
          <button
            type="button"
            onClick={() =>
              downloadGradeTemplate(
                classStudents,
                activeSubject,
                settings,
                semester,
                selectedClass,
                grades,
                classDefs
              )
            }
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Unduh Template Excel
          </button>
          <button
            type="button"
            disabled={isLocked}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-emerald-700 text-xs font-medium text-white hover:bg-emerald-800 whitespace-nowrap disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            Impor Nilai Excel
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Rata-rata Tugas Kelas</div>
          <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
            {classStats.avgTugas === null ? '-' : classStats.avgTugas.toFixed(1)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Rata-rata Kuis Kelas</div>
          <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
            {classStats.avgKuis === null ? '-' : classStats.avgKuis.toFixed(1)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Rata-rata Ujian Kelas</div>
          <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
            {classStats.avgUjian === null ? '-' : classStats.avgUjian.toFixed(1)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Rata-rata Mapel ({activeSubject.kode})</div>
          <div className="text-lg font-bold font-mono tabular-nums text-emerald-700 mt-1">
            {classStats.avgSubjectClass === null ? '-' : classStats.avgSubjectClass.toFixed(2)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 col-span-2 lg:col-span-1">
          <div className="text-xs text-slate-500">Rata-rata Keseluruhan Kelas</div>
          <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
            {overallClassAvg}
          </div>
        </div>
      </div>

      {/* Mode 1: Input Manual */}
      {inputMode === 'manual' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleManualSubmit}
            className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5"
          >
            <div className="border-b border-slate-200 pb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Input Nilai Manual Komponen Siswa
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Metode aktif:{' '}
                  {settings.calculationMode === 'average'
                    ? 'Rata-rata Murni (Tugas, Kuis, Ujian)'
                    : `Berbobot (Tugas ${settings.bobot.tugas}% · Kuis ${settings.bobot.kuis}% · Ujian ${settings.bobot.ujian}%)`}
                </p>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={() => setStudentMode((m) => (m === 'existing' ? 'new' : 'existing'))}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap disabled:opacity-50"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  {studentMode === 'existing' ? 'Input Siswa Baru' : 'Pilih dari Daftar'}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {studentMode === 'existing'
                    ? `Nama Siswa (${selectedClass})`
                    : `Nama Siswa Baru (Masuk ke ${selectedClass})`}
                </label>
                {studentMode === 'existing' ? (
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 focus:border-emerald-700 focus:outline-none"
                  >
                    {classStudents.length === 0 ? (
                      <option value="">Belum ada siswa di kelas ini</option>
                    ) : (
                      classStudents.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nama} (NIS {s.nis})
                        </option>
                      ))
                    )}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={newStudentName}
                    onChange={(e) => setNewStudentName(e.target.value)}
                    placeholder="Ketik nama lengkap siswa baru..."
                    className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm focus:border-emerald-700 focus:outline-none"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Mata Pelajaran
                </label>
                <select
                  value={activeSubject.id}
                  onChange={(e) => setSelectedSubjectId(e.target.value)}
                  className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 focus:border-emerald-700 focus:outline-none"
                >
                  {classSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nama} ({s.kode})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Improvement #5: Clear dedicated headings directly above Tugas, Kuis, and Ujian columns */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
              <div>
                <label
                  htmlFor="manual-tugas"
                  className="block text-xs font-semibold text-slate-800 mb-1"
                >
                  Nilai Tugas (0–100)
                </label>
                <input
                  id="manual-tugas"
                  type="number"
                  min={0}
                  max={100}
                  disabled={isLocked}
                  value={manualTugas}
                  onChange={(e) => setManualTugas(e.target.value)}
                  placeholder="Contoh: 85"
                  className="w-full h-11 rounded-lg border border-slate-300 px-3 font-mono tabular-nums text-base font-semibold text-slate-900 focus:border-emerald-700 focus:outline-none disabled:bg-slate-100"
                />
              </div>
              <div>
                <label
                  htmlFor="manual-kuis"
                  className="block text-xs font-semibold text-slate-800 mb-1"
                >
                  Nilai Kuis (0–100)
                </label>
                <input
                  id="manual-kuis"
                  type="number"
                  min={0}
                  max={100}
                  disabled={isLocked}
                  value={manualKuis}
                  onChange={(e) => setManualKuis(e.target.value)}
                  placeholder="Contoh: 88"
                  className="w-full h-11 rounded-lg border border-slate-300 px-3 font-mono tabular-nums text-base font-semibold text-slate-900 focus:border-emerald-700 focus:outline-none disabled:bg-slate-100"
                />
              </div>
              <div>
                <label
                  htmlFor="manual-ujian"
                  className="block text-xs font-semibold text-slate-800 mb-1"
                >
                  Nilai Ujian (0–100)
                </label>
                <input
                  id="manual-ujian"
                  type="number"
                  min={0}
                  max={100}
                  disabled={isLocked}
                  value={manualUjian}
                  onChange={(e) => setManualUjian(e.target.value)}
                  placeholder="Contoh: 90"
                  className="w-full h-11 rounded-lg border border-slate-300 px-3 font-mono tabular-nums text-base font-semibold text-slate-900 focus:border-emerald-700 focus:outline-none disabled:bg-slate-100"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="manual-catatan-guru"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Catatan Guru Mata Pelajaran (Terintegrasi ke Catatan Wali Kelas & Portal Orang Tua)
              </label>
              <textarea
                id="manual-catatan-guru"
                rows={2}
                disabled={isLocked}
                value={manualCatatanGuru}
                onChange={(e) => setManualCatatanGuru(e.target.value)}
                placeholder="Misal: Ananda aktif berdiskusi dan sangat teliti menyelesaikan latihan..."
                className="w-full rounded-lg border border-slate-300 p-3 text-xs leading-relaxed focus:border-emerald-700 focus:outline-none disabled:bg-slate-100"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              {studentMode === 'existing' && selectedStudentId ? (
                <button
                  type="button"
                  onClick={() => setDetailModalStudentId(selectedStudentId)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:underline"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Sesuaikan Skor TP / STS / SAS / Override
                </button>
              ) : (
                <span />
              )}
              <button
                type="submit"
                disabled={isLocked}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                {isLocked ? 'Pengisian Dikunci' : 'Simpan Nilai Siswa'}
              </button>
            </div>
          </form>

          {/* Right Quick Student List */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900">
                Daftar Siswa — {activeSubject.nama}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Klik nama siswa untuk memuat & memperbarui komponen nilainya.
              </p>
            </div>
            <div className="divide-y divide-slate-200 max-h-[430px] overflow-y-auto">
              {classStudents.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Belum ada siswa aktif di {selectedClass}.{' '}
                  {isAdmin
                    ? 'Tambahkan siswa melalui Data Siswa atau tombol Input Siswa Baru.'
                    : 'Hubungi Pengurus PKBM untuk mendaftarkan peserta didik ke kelas ini.'}
                </div>
              ) : (
                classStudents.map((stu) => {
                  const entry = grades[gradeKey(stu.id, activeSubject.id, semester)];
                  const calc = calculateStudentSubjectGrade(
                    entry,
                    activeSubject,
                    settings,
                    stu.kelas,
                    classDefs
                  );
                  const active = studentMode === 'existing' && selectedStudentId === stu.id;
                  return (
                    <button
                      key={stu.id}
                      type="button"
                      onClick={() => {
                        setStudentMode('existing');
                        setSelectedStudentId(stu.id);
                      }}
                      className={`w-full px-5 py-3 flex items-center justify-between gap-3 text-left transition-colors ${
                        active ? 'bg-emerald-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">
                          {stu.nama}
                        </div>
                        <div className="text-xs font-mono tabular-nums text-slate-500">
                          T:{calc.tugas ?? '-'} · K:{calc.kuis ?? '-'} · U:{calc.ujian ?? '-'}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className={`font-mono tabular-nums text-sm font-bold ${
                            calc.nilaiAkhir === null
                              ? 'text-slate-400'
                              : calc.tuntas
                                ? 'text-emerald-700'
                                : 'text-red-600'
                          }`}
                        >
                          {calc.nilaiAkhir ?? '-'}
                        </span>
                        <span className="block text-[11px] font-mono text-slate-500">
                          {calc.predikat}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mode 2: Class Spreadsheet Table */}
      {inputMode === 'grid' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                <tr>
                  <th className="px-3 py-3 w-10 text-center">No</th>
                  <th className="px-4 py-3 min-w-[200px]">Nama Peserta Didik</th>
                  <th className="px-2 py-3 w-24 text-center font-mono">Nilai Tugas</th>
                  <th className="px-2 py-3 w-24 text-center font-mono">Nilai Kuis</th>
                  <th className="px-2 py-3 w-24 text-center font-mono">Nilai Ujian</th>
                  <th className="px-2 py-3 w-24 text-center font-mono">Rata-rata</th>
                  <th className="px-3 py-3 w-24 text-center font-semibold text-slate-900">
                    Nilai Rapor
                  </th>
                  <th className="px-2 py-3 w-16 text-center">Pred</th>
                  <th className="px-4 py-3 min-w-[240px]">Deskripsi Capaian Otomatis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {classStudents.map((stu, idx) => {
                  const entry = grades[gradeKey(stu.id, activeSubject.id, semester)];
                  const calc = calculateStudentSubjectGrade(
                    entry,
                    activeSubject,
                    settings,
                    stu.kelas,
                    classDefs
                  );
                  const belowKktp = calc.nilaiAkhir !== null && calc.nilaiAkhir < settings.kktp;
                  return (
                    <tr key={stu.id} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2.5 text-center font-mono tabular-nums text-xs text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-900 leading-snug">{stu.nama}</div>
                        <div className="text-xs font-mono tabular-nums text-slate-400">
                          NIS {stu.nis}
                        </div>
                      </td>
                      <td className="px-1.5 py-2 text-center">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          disabled={isLocked}
                          value={entry?.tugas ?? ''}
                          onChange={(e) =>
                            handleGridCellChange(stu.id, { type: 'tugas' }, e.target.value)
                          }
                          aria-label={`${stu.nama} Nilai Tugas`}
                          className="w-18 h-8 rounded-md border border-slate-300 text-center font-mono tabular-nums text-xs text-slate-900 focus:border-emerald-700 focus:outline-none disabled:bg-slate-100"
                        />
                      </td>
                      <td className="px-1.5 py-2 text-center">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          disabled={isLocked}
                          value={entry?.kuis ?? ''}
                          onChange={(e) =>
                            handleGridCellChange(stu.id, { type: 'kuis' }, e.target.value)
                          }
                          aria-label={`${stu.nama} Nilai Kuis`}
                          className="w-18 h-8 rounded-md border border-slate-300 text-center font-mono tabular-nums text-xs text-slate-900 focus:border-emerald-700 focus:outline-none disabled:bg-slate-100"
                        />
                      </td>
                      <td className="px-1.5 py-2 text-center">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          disabled={isLocked}
                          value={entry?.ujian ?? ''}
                          onChange={(e) =>
                            handleGridCellChange(stu.id, { type: 'ujian' }, e.target.value)
                          }
                          aria-label={`${stu.nama} Nilai Ujian`}
                          className="w-18 h-8 rounded-md border border-slate-300 text-center font-mono tabular-nums text-xs text-slate-900 focus:border-emerald-700 focus:outline-none disabled:bg-slate-100"
                        />
                      </td>
                      <td className="px-2 py-2.5 text-center font-mono tabular-nums text-xs text-slate-600">
                        {calc.rataKomponen === null ? '-' : calc.rataKomponen.toFixed(1)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`font-mono tabular-nums text-sm font-bold ${
                            calc.nilaiAkhir === null
                              ? 'text-slate-400'
                              : belowKktp
                                ? 'text-red-600'
                                : 'text-emerald-700'
                          }`}
                        >
                          {calc.nilaiAkhir ?? '-'}
                        </span>
                        {calc.isManualNilai && (
                          <span className="block text-[10px] text-amber-700">Manual</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-center font-mono font-semibold text-xs text-slate-800">
                        {calc.predikat}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1 min-w-0">
                            <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                              {calc.deskripsiFinal ||
                                'Masukkan nilai komponen untuk menyusun deskripsi otomatis.'}
                            </p>
                            {entry?.catatanGuru?.trim() && (
                              <p className="text-[11px] font-medium text-emerald-800 line-clamp-1">
                                Catatan Guru: {entry.catatanGuru}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setDetailModalStudentId(stu.id)}
                            title="Sesuaikan Nilai / TP / Catatan Guru"
                            className="p-1 text-slate-400 hover:text-emerald-700 rounded shrink-0"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {classStudents.length > 0 && (
                <tfoot className="bg-slate-50 border-t border-slate-200 text-xs font-semibold text-slate-800">
                  <tr>
                    <td colSpan={2} className="px-4 py-3 text-right">
                      Rata-rata Kelas ({activeSubject.kode})
                    </td>
                    <td className="px-2 py-3 text-center font-mono tabular-nums">
                      {classStats.avgTugas === null ? '-' : classStats.avgTugas.toFixed(1)}
                    </td>
                    <td className="px-2 py-3 text-center font-mono tabular-nums">
                      {classStats.avgKuis === null ? '-' : classStats.avgKuis.toFixed(1)}
                    </td>
                    <td className="px-2 py-3 text-center font-mono tabular-nums">
                      {classStats.avgUjian === null ? '-' : classStats.avgUjian.toFixed(1)}
                    </td>
                    <td className="px-2 py-3 text-center font-mono tabular-nums">
                      {classStats.avgSubjectClass === null
                        ? '-'
                        : classStats.avgSubjectClass.toFixed(1)}
                    </td>
                    <td className="px-3 py-3 text-center font-mono tabular-nums text-emerald-700">
                      {classStats.avgSubjectClass === null
                        ? '-'
                        : classStats.avgSubjectClass.toFixed(2)}
                    </td>
                    <td colSpan={2} className="px-4 py-3 text-slate-500 font-normal">
                      {classStats.tuntasCount} dari {classStats.filledStudents} siswa mencapai KKTP (
                      {settings.kktp})
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Detail TP / STS / SAS / Manual Override Modal */}
      {detailStudent && detailEntry && detailCalc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Detail Tujuan Pembelajaran & Penyesuaian Deskripsi
                </h3>
                <p className="text-xs text-slate-500">
                  {detailStudent.nama} · {activeSubject.nama} ({detailStudent.kelas})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailModalStudentId(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm">
              {detailCps.length > 0 && (
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-slate-800">
                    Skor Per CP & Tujuan Pembelajaran ({detailStudent.kelas})
                  </div>
                  {detailCps.map((cp) => (
                    <div
                      key={cp.id}
                      className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-2"
                    >
                      <div className="text-xs font-semibold text-emerald-800">
                        {cp.kode}: <span className="font-normal text-slate-700">{cp.deskripsi}</span>
                      </div>
                      {cp.tps.map((tp) => (
                        <div key={tp.id} className="flex items-center gap-3 bg-white p-2 rounded border border-slate-200">
                          <span className="text-xs font-mono font-semibold text-slate-700 w-14 shrink-0">
                            {tp.kode}
                          </span>
                          <span className="text-xs text-slate-600 flex-1">{tp.deskripsi}</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            disabled={isLocked}
                            value={detailEntry.tpScores?.[tp.id] ?? ''}
                            onChange={(e) =>
                              handleGridCellChange(
                                detailStudent.id,
                                { type: 'tp', tpId: tp.id },
                                e.target.value
                              )
                            }
                            className="w-20 h-8 rounded border border-slate-300 px-2 text-center font-mono text-xs disabled:bg-slate-100"
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tengah Semester (STS)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    disabled={isLocked}
                    value={detailEntry.sts ?? ''}
                    onChange={(e) =>
                      handleGridCellChange(detailStudent.id, { type: 'sts' }, e.target.value)
                    }
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono text-xs disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nilai Akhir (SAS)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    disabled={isLocked}
                    value={detailEntry.sas ?? ''}
                    onChange={(e) =>
                      handleGridCellChange(detailStudent.id, { type: 'sas' }, e.target.value)
                    }
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono text-xs disabled:bg-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nilai Hitung Otomatis
                  </label>
                  <div className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 flex items-center font-mono font-bold text-slate-900">
                    {detailCalc.nilaiAkhir ?? '-'}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Override Nilai Akhir (Opsional)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    disabled={isLocked}
                    value={detailEntry.manualNilaiAkhir ?? ''}
                    onChange={(e) =>
                      handleGridCellChange(detailStudent.id, { type: 'manualNilai' }, e.target.value)
                    }
                    placeholder="Kosongkan jika otomatis"
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono text-xs disabled:bg-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Deskripsi Capaian Kompetensi (Kosongkan untuk Otomatis)
                </label>
                <textarea
                  rows={3}
                  disabled={isLocked}
                  value={detailEntry.manualDeskripsi ?? ''}
                  onChange={(e) =>
                    handleGridCellChange(detailStudent.id, { type: 'manualDesk' }, e.target.value)
                  }
                  placeholder={detailCalc.autoDeskripsi}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Catatan Guru Mapel
                </label>
                <textarea
                  rows={2}
                  disabled={isLocked}
                  value={detailEntry.catatanGuru ?? ''}
                  onChange={(e) =>
                    handleGridCellChange(detailStudent.id, { type: 'catatanGuru' }, e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs disabled:bg-slate-100"
                />
              </div>

              <div className="pt-2 border-t border-slate-200 flex justify-end">
                <button
                  type="button"
                  onClick={() => setDetailModalStudentId(null)}
                  className="px-4 py-2 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  Selesai
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
