import React, { useEffect, useState } from 'react';
import { Award, Lock, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import {
  AppState,
  CounselingNote,
  EkskulItem,
  P5Dimension,
  P5Project,
  ReportMeta,
  UserAccount,
} from '../types';
import {
  collectTeacherSubjectNotes,
  createDefaultProfilLulusanDimensions,
  isInputLockedForUser,
  mergeTeacherNotesIntoWaliNote,
  metaKey,
  PREDIKAT_LABELS,
} from '../utils/academic';

interface ExtrasViewProps {
  state: AppState;
  currentUser: UserAccount;
  selectedClass: string;
  onSaveP5: (proj: P5Project) => void;
  onSaveMeta: (key: string, meta: ReportMeta) => void;
  onApplyP5TemplateToClass: (tema: string, judulProjek: string, deskripsi: string) => void;
  onSaveCounselingNote: (note: CounselingNote, isNew: boolean) => void;
  onDeleteCounselingNote: (id: string) => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

export const ExtrasView: React.FC<ExtrasViewProps> = ({
  state,
  currentUser,
  selectedClass,
  onSaveP5,
  onSaveMeta,
  onApplyP5TemplateToClass,
  onSaveCounselingNote,
  onDeleteCounselingNote,
  onNotify,
}) => {
  const semester = state.settings.semester;
  const classStudents = state.students
    .filter((s) => s.kelas === selectedClass && s.status === 'Aktif')
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));

  const [selectedId, setSelectedId] = useState(classStudents[0]?.id || '');
  useEffect(() => {
    if (classStudents.length > 0 && !classStudents.some((s) => s.id === selectedId)) {
      setSelectedId(classStudents[0].id);
    }
  }, [classStudents, selectedId]);

  const activeStudent = classStudents.find((s) => s.id === selectedId) || classStudents[0];

  // Custom Dimension input
  const [customDimName, setCustomDimName] = useState('');
  const [customDimCapaian, setCustomDimCapaian] = useState<P5Dimension['capaian']>('BSH');

  // BK Form
  const [bkForm, setBkForm] = useState<CounselingNote | null>(null);
  const [bkIsNew, setBkIsNew] = useState(false);

  const lockInfo = isInputLockedForUser(state.settings, state.academicYears, currentUser);
  const isOutOfWaliScope =
    currentUser.role === 'walikelas' &&
    Boolean(currentUser.waliKelasTarget) &&
    currentUser.waliKelasTarget !== selectedClass;
  const isReadOnly = lockInfo.locked || isOutOfWaliScope || currentUser.role === 'guru';

  if (!activeStudent) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-xs text-slate-500">
        Belum ada peserta didik aktif di {selectedClass}.
      </div>
    );
  }

  const mKey = metaKey(activeStudent.id, semester);
  const currentMeta: ReportMeta = state.reportMeta[mKey] || {
    studentId: activeStudent.id,
    semester,
    ekskul: [],
    absensi: { sakit: 0, izin: 0, alpha: 0 },
    catatanWaliKelas: '',
  };

  const currentProject: P5Project =
    state.p5Projects.find((p) => p.studentId === activeStudent.id && p.semester === semester) || {
      id: `p5-${activeStudent.id}-s${semester}`,
      studentId: activeStudent.id,
      semester,
      tahunAjaran: state.settings.tahunAjaran,
      tema: 'Gaya Hidup Berkelanjutan & Kemandirian',
      judulProjek: 'Proyek Penguatan 8 Dimensi Profil Lulusan',
      deskripsi: '',
      dimensi: createDefaultProfilLulusanDimensions(),
    };

  const teacherNotes = collectTeacherSubjectNotes(
    activeStudent,
    state.subjects,
    state.grades,
    semester,
    state.classDefs
  );

  const studentBkNotes = state.counselingNotes.filter((n) => n.studentId === activeStudent.id);

  const updateMeta = (patch: Partial<ReportMeta>) => {
    if (isReadOnly) return;
    onSaveMeta(mKey, { ...currentMeta, ...patch });
  };

  const addEkskul = () => {
    if (isReadOnly) return;
    const item: EkskulItem = {
      id: `eks-${Date.now()}`,
      nama: 'Pramuka',
      predikat: 'Baik',
      keterangan: 'Aktif mengikuti latihan rutin.',
    };
    updateMeta({ ekskul: [...currentMeta.ekskul, item] });
  };

  const handleAddCustomDimension = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    const label = customDimName.trim();
    if (!label) {
      onNotify('Nama dimensi Profil Lulusan custom wajib diisi.', true);
      return;
    }
    onSaveP5({
      ...currentProject,
      dimensi: [
        ...currentProject.dimensi,
        { profil: label, capaian: customDimCapaian, isCustom: true },
      ],
    });
    setCustomDimName('');
    onNotify(`Dimensi "${label}" ditambahkan.`);
  };

  const handleLoadEightDimensions = () => {
    if (isReadOnly) return;
    const existingMap = new Map(currentProject.dimensi.map((d) => [d.profil, d]));
    const defaults = createDefaultProfilLulusanDimensions().map(
      (def) => existingMap.get(def.profil) || def
    );
    const customs = currentProject.dimensi.filter(
      (d) => !defaults.some((def) => def.profil === d.profil)
    );
    onSaveP5({
      ...currentProject,
      dimensi: [...defaults, ...customs],
    });
    onNotify('8 Dimensi Profil Lulusan standar berhasil dimuat.');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold text-slate-900">
            Projek Penguatan Profil Lulusan, Ekstrakurikuler, Ketidakhadiran & BK — {selectedClass}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Semester {semester === '1' ? '1 (Ganjil)' : '2 (Genap)'} · {state.settings.tahunAjaran} · 8 Dimensi Profil Lulusan + Dimensi Custom
          </p>
        </div>
        <select
          value={activeStudent.id}
          onChange={(e) => setSelectedId(e.target.value)}
          className="h-9 min-w-[240px] rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900"
        >
          {classStudents.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nama} (NIS {s.nis})
            </option>
          ))}
        </select>
      </div>

      {isReadOnly && (
        <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50 flex items-center gap-2.5 text-xs text-amber-900">
          <Lock className="w-4 h-4 text-amber-700 shrink-0" />
          <span>
            {lockInfo.locked
              ? lockInfo.reason
              : isOutOfWaliScope
                ? `Mode Baca Saja: Anda tercatat sebagai Wali Kelas ${currentUser.waliKelasTarget}, bukan ${selectedClass}.`
                : 'Mode Baca Saja.'}
          </span>
        </div>
      )}

      {/* Projek Penguatan Profil Lulusan Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 text-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-emerald-700" />
            <h2 className="text-sm font-semibold text-slate-900">
              Projek Penguatan Profil Lulusan (8 Dimensi + Custom)
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isReadOnly}
              onClick={handleLoadEightDimensions}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Muat 8 Dimensi Standar
            </button>
            <button
              type="button"
              disabled={isReadOnly}
              onClick={() =>
                onApplyP5TemplateToClass(
                  currentProject.tema,
                  currentProject.judulProjek,
                  currentProject.deskripsi
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-700 bg-emerald-50 text-emerald-800 font-semibold hover:bg-emerald-100 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" /> Terapkan ke Semua Siswa {selectedClass}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Tema Projek Profil Lulusan
            </label>
            <input
              type="text"
              disabled={isReadOnly}
              value={currentProject.tema}
              onChange={(e) => onSaveP5({ ...currentProject, tema: e.target.value })}
              className="w-full h-9 rounded-lg border border-slate-300 px-3 disabled:bg-slate-100"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Judul Projek Profil Lulusan
            </label>
            <input
              type="text"
              disabled={isReadOnly}
              value={currentProject.judulProjek}
              onChange={(e) => onSaveP5({ ...currentProject, judulProjek: e.target.value })}
              className="w-full h-9 rounded-lg border border-slate-300 px-3 disabled:bg-slate-100"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block font-medium text-slate-700 mb-1">Deskripsi Projek</label>
            <textarea
              rows={2}
              disabled={isReadOnly}
              value={currentProject.deskripsi}
              onChange={(e) => onSaveP5({ ...currentProject, deskripsi: e.target.value })}
              className="w-full rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-100"
            />
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="font-semibold text-slate-800">
            Capaian Dimensi Profil Lulusan ({currentProject.dimensi.length} Dimensi)
          </div>
          {currentProject.dimensi.map((d, idx) => (
            <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
              <div className="sm:col-span-7 flex items-center gap-2">
                <span className="w-6 text-center font-mono text-slate-400">{idx + 1}.</span>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={d.profil}
                  onChange={(e) => {
                    const next = currentProject.dimensi.map((x, i) =>
                      i === idx ? { ...x, profil: e.target.value } : x
                    );
                    onSaveP5({ ...currentProject, dimensi: next });
                  }}
                  className="flex-1 h-8 rounded border border-slate-300 px-2.5 disabled:bg-slate-100"
                />
              </div>
              <select
                disabled={isReadOnly}
                value={d.capaian}
                onChange={(e) => {
                  const next = currentProject.dimensi.map((x, i) =>
                    i === idx
                      ? { ...x, capaian: e.target.value as P5Dimension['capaian'] }
                      : x
                  );
                  onSaveP5({ ...currentProject, dimensi: next });
                }}
                className="sm:col-span-4 h-8 rounded border border-slate-300 bg-white px-2 disabled:bg-slate-100"
              >
                {Object.entries(PREDIKAT_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {k} — {label}
                  </option>
                ))}
              </select>
              <div className="sm:col-span-1 flex justify-end">
                <button
                  type="button"
                  disabled={isReadOnly}
                  title="Hapus dimensi"
                  onClick={() => {
                    const next = currentProject.dimensi.filter((_, i) => i !== idx);
                    onSaveP5({ ...currentProject, dimensi: next });
                  }}
                  className="p-1.5 text-slate-400 hover:text-red-600 rounded disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          {!isReadOnly && (
            <form
              onSubmit={handleAddCustomDimension}
              className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-3 border-t border-slate-200 items-center"
            >
              <input
                type="text"
                value={customDimName}
                onChange={(e) => setCustomDimName(e.target.value)}
                placeholder="Tambah dimensi custom (mis. Literasi Digital / Kewirausahaan)..."
                className="sm:col-span-7 h-8 rounded-lg border border-slate-300 px-3"
              />
              <select
                value={customDimCapaian}
                onChange={(e) => setCustomDimCapaian(e.target.value as P5Dimension['capaian'])}
                className="sm:col-span-3 h-8 rounded-lg border border-slate-300 bg-white px-2"
              >
                {Object.entries(PREDIKAT_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {k} — {label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="sm:col-span-2 h-8 inline-flex items-center justify-center gap-1 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" /> Dimensi Custom
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Ekskul, Absensi & Catatan Wali */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h2 className="text-sm font-semibold text-slate-900">Kegiatan Ekstrakurikuler</h2>
            <button
              type="button"
              disabled={isReadOnly}
              onClick={addEkskul}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" /> Tambah Ekskul
            </button>
          </div>
          {currentMeta.ekskul.length === 0 ? (
            <p className="text-slate-500">Belum ada data ekstrakurikuler.</p>
          ) : (
            <div className="space-y-3">
              {currentMeta.ekskul.map((ek, idx) => (
                <div
                  key={ek.id}
                  className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-2"
                >
                  <div className="flex gap-2">
                    <input
                      type="text"
                      disabled={isReadOnly}
                      value={ek.nama}
                      onChange={(e) => {
                        const next = currentMeta.ekskul.map((x, i) =>
                          i === idx ? { ...x, nama: e.target.value } : x
                        );
                        updateMeta({ ekskul: next });
                      }}
                      placeholder="Nama Ekstrakurikuler"
                      className="flex-1 h-8 rounded border border-slate-300 bg-white px-2.5 font-medium disabled:bg-slate-100"
                    />
                    <select
                      disabled={isReadOnly}
                      value={ek.predikat}
                      onChange={(e) => {
                        const next = currentMeta.ekskul.map((x, i) =>
                          i === idx ? { ...x, predikat: e.target.value } : x
                        );
                        updateMeta({ ekskul: next });
                      }}
                      className="h-8 rounded border border-slate-300 bg-white px-2 disabled:bg-slate-100"
                    >
                      <option value="Sangat Baik">Sangat Baik</option>
                      <option value="Baik">Baik</option>
                      <option value="Cukup">Cukup</option>
                    </select>
                    <button
                      type="button"
                      disabled={isReadOnly}
                      onClick={() =>
                        updateMeta({ ekskul: currentMeta.ekskul.filter((_, i) => i !== idx) })
                      }
                      className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={ek.keterangan}
                    onChange={(e) => {
                      const next = currentMeta.ekskul.map((x, i) =>
                        i === idx ? { ...x, keterangan: e.target.value } : x
                      );
                      updateMeta({ ekskul: next });
                    }}
                    placeholder="Keterangan capaian..."
                    className="w-full h-8 rounded border border-slate-300 bg-white px-2.5 disabled:bg-slate-100"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="pt-3 border-t border-slate-200 space-y-2">
            <h3 className="font-semibold text-slate-900">Ketidakhadiran (Hari)</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-600 mb-1">Sakit</label>
                <input
                  type="number"
                  min={0}
                  disabled={isReadOnly}
                  value={currentMeta.absensi.sakit}
                  onChange={(e) =>
                    updateMeta({
                      absensi: {
                        ...currentMeta.absensi,
                        sakit: Math.max(0, Number(e.target.value) || 0),
                      },
                    })
                  }
                  className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">Izin</label>
                <input
                  type="number"
                  min={0}
                  disabled={isReadOnly}
                  value={currentMeta.absensi.izin}
                  onChange={(e) =>
                    updateMeta({
                      absensi: {
                        ...currentMeta.absensi,
                        izin: Math.max(0, Number(e.target.value) || 0),
                      },
                    })
                  }
                  className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">Tanpa Keterangan</label>
                <input
                  type="number"
                  min={0}
                  disabled={isReadOnly}
                  value={currentMeta.absensi.alpha}
                  onChange={(e) =>
                    updateMeta({
                      absensi: {
                        ...currentMeta.absensi,
                        alpha: Math.max(0, Number(e.target.value) || 0),
                      },
                    })
                  }
                  className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono disabled:bg-slate-100"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h2 className="text-sm font-semibold text-slate-900">Catatan Wali Kelas</h2>
            {teacherNotes.length > 0 && !isReadOnly && (
              <button
                type="button"
                onClick={() => {
                  const merged = mergeTeacherNotesIntoWaliNote(
                    currentMeta.catatanWaliKelas,
                    teacherNotes
                  );
                  updateMeta({ catatanWaliKelas: merged });
                  onNotify('Catatan Guru Mapel berhasil disinkronkan ke Catatan Wali Kelas.');
                }}
                className="text-emerald-700 font-semibold hover:underline"
              >
                + Gabungkan {teacherNotes.length} Catatan Guru Mapel
              </button>
            )}
          </div>
          <textarea
            rows={6}
            disabled={isReadOnly}
            value={currentMeta.catatanWaliKelas}
            onChange={(e) => updateMeta({ catatanWaliKelas: e.target.value })}
            placeholder="Tuliskan catatan motivasi dan perkembangan belajar peserta didik..."
            className="w-full rounded-lg border border-slate-300 p-3 leading-relaxed disabled:bg-slate-100"
          />
          {teacherNotes.length > 0 && (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
              <div className="font-semibold text-slate-800">Ringkasan Catatan Guru Mapel:</div>
              {teacherNotes.map((tn) => (
                <div key={tn.subjectId} className="text-slate-600">
                  • <span className="font-medium">{tn.subjectName}</span>: {tn.catatan}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bimbingan Konseling (BK) */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Catatan Bimbingan Konseling (BK) — {activeStudent.nama}
            </h2>
            <p className="text-slate-500 mt-0.5">
              Catat layanan konseling, tindak lanjut, dan saran pendampingan. Catatan yang dicentang &ldquo;Tampilkan ke Orang Tua&rdquo; otomatis muncul di Portal Orang Tua.
            </p>
          </div>
          <button
            type="button"
            disabled={isReadOnly}
            onClick={() => {
              setBkIsNew(true);
              setBkForm({
                id: `bk-${Date.now()}`,
                studentId: activeStudent.id,
                semester,
                tahunAjaran: state.settings.tahunAjaran,
                tanggal: new Date().toISOString().slice(0, 10),
                kategori: 'Akademik & Belajar',
                topik: '',
                uraianMasalah: '',
                layananTindakLanjut: '',
                rekomendasiOrtu: '',
                konselorNama: currentUser.nama,
                tampilDiOrtu: true,
                createdAt: new Date().toISOString(),
              });
            }}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-700 font-medium text-white hover:bg-emerald-800 disabled:opacity-50 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> Tambah Catatan BK
          </button>
        </div>

        {bkForm && !isReadOnly && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!bkForm.topik.trim() || !bkForm.uraianMasalah.trim()) {
                onNotify('Topik dan uraian konseling wajib diisi.', true);
                return;
              }
              onSaveCounselingNote({ ...bkForm, studentId: activeStudent.id }, bkIsNew);
              setBkForm(null);
            }}
            className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Tanggal</label>
                <input
                  type="date"
                  value={bkForm.tanggal}
                  onChange={(e) => setBkForm({ ...bkForm, tanggal: e.target.value })}
                  className="w-full h-8 rounded border border-slate-300 bg-white px-2.5"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Kategori BK</label>
                <input
                  type="text"
                  value={bkForm.kategori}
                  onChange={(e) => setBkForm({ ...bkForm, kategori: e.target.value })}
                  className="w-full h-8 rounded border border-slate-300 bg-white px-2.5"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Topik *</label>
                <input
                  type="text"
                  required
                  value={bkForm.topik}
                  onChange={(e) => setBkForm({ ...bkForm, topik: e.target.value })}
                  className="w-full h-8 rounded border border-slate-300 bg-white px-2.5"
                />
              </div>
            </div>
            <textarea
              rows={2}
              required
              placeholder="Uraian observasi / permasalahan..."
              value={bkForm.uraianMasalah}
              onChange={(e) => setBkForm({ ...bkForm, uraianMasalah: e.target.value })}
              className="w-full rounded border border-slate-300 bg-white p-2.5"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Layanan / Tindak lanjut..."
                value={bkForm.layananTindakLanjut}
                onChange={(e) => setBkForm({ ...bkForm, layananTindakLanjut: e.target.value })}
                className="h-8 rounded border border-slate-300 bg-white px-2.5"
              />
              <input
                type="text"
                placeholder="Rekomendasi untuk Orang Tua..."
                value={bkForm.rekomendasiOrtu}
                onChange={(e) => setBkForm({ ...bkForm, rekomendasiOrtu: e.target.value })}
                className="h-8 rounded border border-slate-300 bg-white px-2.5"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bkForm.tampilDiOrtu}
                  onChange={(e) => setBkForm({ ...bkForm, tampilDiOrtu: e.target.checked })}
                  className="accent-emerald-700"
                />
                <span>Tampilkan di Portal Orang Tua</span>
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBkForm(null)}
                  className="px-3 py-1.5 rounded border border-slate-300 bg-white"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-emerald-700 text-white font-semibold"
                >
                  Simpan Catatan BK
                </button>
              </div>
            </div>
          </form>
        )}

        {studentBkNotes.length === 0 ? (
          <p className="text-slate-500">Belum ada catatan bimbingan konseling untuk siswa ini.</p>
        ) : (
          <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
            {studentBkNotes.map((n) => (
              <div key={n.id} className="p-3.5 flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="font-semibold text-slate-900">
                    {n.topik}{' '}
                    <span className="font-normal text-slate-500">
                      · {n.kategori} · {n.tanggal}
                    </span>
                  </div>
                  <p className="text-slate-700">{n.uraianMasalah}</p>
                  {n.rekomendasiOrtu && (
                    <p className="text-emerald-800">Saran Orang Tua: {n.rekomendasiOrtu}</p>
                  )}
                </div>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => onDeleteCounselingNote(n.id)}
                    className="p-1 text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
