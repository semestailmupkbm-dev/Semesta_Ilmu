import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileCheck,
  MessageSquare,
  Plus,
  Send,
  Trash2,
  Video,
} from 'lucide-react';
import {
  AppState,
  LmsAssignment,
  LmsMaterial,
  LmsSubmission,
  UserAccount,
} from '../types';
import {
  filterSubjectsForUser,
  formatTanggalID,
  getAccessibleClassesForUser,
  getSubjectsForClass,
} from '../utils/academic';

interface LmsViewProps {
  state: AppState;
  currentUser: UserAccount;
  selectedClass: string;
  onCreateMaterial: (payload: {
    kelas: string;
    subjectId: string;
    cpKode?: string;
    tpKode?: string;
    judul: string;
    tipe: LmsMaterial['tipe'];
    konten: string;
    resourceUrl?: string;
  }) => Promise<boolean>;
  onDeleteMaterial: (id: string) => Promise<boolean>;
  onToggleCompleteMaterial: (id: string) => Promise<boolean>;
  onCreateAssignment: (payload: {
    kelas: string;
    subjectId: string;
    cpKode?: string;
    tpKode?: string;
    judul: string;
    instruksi: string;
    tenggat: string;
    skorMaksimal: number;
  }) => Promise<boolean>;
  onDeleteAssignment: (id: string) => Promise<boolean>;
  onSubmitAssignment: (payload: {
    assignmentId: string;
    jawabanTeks: string;
    lampiranUrl?: string;
  }) => Promise<boolean>;
  onGradeSubmission: (id: string, nilai: number, umpanBalikGuru: string) => Promise<boolean>;
  onPostDiscussion: (payload: {
    kelas: string;
    subjectId: string;
    pesan: string;
  }) => Promise<boolean>;
  activeStudentId?: string;
  onChangeActiveStudentId?: (studentId: string) => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

export const LmsView: React.FC<LmsViewProps> = ({
  state,
  currentUser,
  selectedClass,
  onCreateMaterial,
  onDeleteMaterial,
  onToggleCompleteMaterial,
  onCreateAssignment,
  onDeleteAssignment,
  onSubmitAssignment,
  onGradeSubmission,
  onPostDiscussion,
  activeStudentId,
  onChangeActiveStudentId,
  onNotify,
}) => {
  const isSiswa = currentUser.role === 'siswa';
  const isOrtu = currentUser.role === 'ortu';
  const isReadOnlyParent = isOrtu;
  const canTeach =
    currentUser.role === 'admin' ||
    currentUser.role === 'walikelas' ||
    currentUser.role === 'guru';

  const linkedChildren = useMemo(() => {
    if (!isOrtu && !isSiswa) return [];
    const ids = currentUser.linkedStudentIds || [];
    const matched = state.students.filter((s) => ids.includes(s.id));
    if (matched.length > 0) return matched;
    return isSiswa && state.students[0] ? [state.students[0]] : [];
  }, [isOrtu, isSiswa, currentUser.linkedStudentIds, state.students]);

  const [ortuViewAllChildren, setOrtuViewAllChildren] = useState(false);

  const activeChild = useMemo(() => {
    if (linkedChildren.length === 0) return null;
    if (activeStudentId) {
      const found = linkedChildren.find((s) => s.id === activeStudentId);
      if (found) return found;
    }
    return linkedChildren[0];
  }, [linkedChildren, activeStudentId]);

  const linkedStudent = isSiswa ? activeChild : isOrtu && !ortuViewAllChildren ? activeChild : null;

  const accessibleClasses = useMemo(() => {
    if (isSiswa && activeChild) return [activeChild.kelas];
    if (isOrtu) {
      return Array.from(new Set(linkedChildren.map((c) => c.kelas)));
    }
    return getAccessibleClassesForUser(state.classes, currentUser);
  }, [isSiswa, isOrtu, activeChild, linkedChildren, state.classes, currentUser]);

  const [lmsClass, setLmsClass] = useState<string>(
    (isSiswa || isOrtu) && activeChild
      ? activeChild.kelas
      : accessibleClasses.includes(selectedClass)
        ? selectedClass
        : accessibleClasses[0] || selectedClass
  );

  useEffect(() => {
    if ((isSiswa || isOrtu) && activeChild) {
      setLmsClass(activeChild.kelas);
    } else if (accessibleClasses.includes(selectedClass)) {
      setLmsClass(selectedClass);
    }
  }, [isSiswa, isOrtu, activeChild, selectedClass, accessibleClasses]);

  const classSubjects = useMemo(() => {
    if (isOrtu && ortuViewAllChildren) {
      const map = new Map<string, (typeof state.subjects)[number]>();
      for (const child of linkedChildren) {
        const childSubs = getSubjectsForClass(
          state.subjects,
          child.kelas,
          state.classDefs,
          child.jurusan || 'Umum'
        );
        for (const sub of childSubs) map.set(sub.id, sub);
      }
      return Array.from(map.values());
    }
    if ((isSiswa || isOrtu) && activeChild) {
      return getSubjectsForClass(
        state.subjects,
        activeChild.kelas,
        state.classDefs,
        activeChild.jurusan || 'Umum'
      );
    }
    const allInClass = getSubjectsForClass(state.subjects, lmsClass, state.classDefs);
    return filterSubjectsForUser(allInClass, currentUser, lmsClass, {
      includeWaliClassView: true,
    });
  }, [
    isSiswa,
    isOrtu,
    ortuViewAllChildren,
    linkedChildren,
    activeChild,
    state.subjects,
    state.classDefs,
    lmsClass,
    currentUser,
  ]);

  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  useEffect(() => {
    if (isOrtu && ortuViewAllChildren) return;
    if (!classSubjects.some((s) => s.id === selectedSubjectId)) {
      setSelectedSubjectId(classSubjects[0]?.id || '');
    }
  }, [isOrtu, ortuViewAllChildren, classSubjects, selectedSubjectId]);

  const activeSubject =
    isOrtu && ortuViewAllChildren && selectedSubjectId === 'ALL'
      ? undefined
      : classSubjects.find((s) => s.id === selectedSubjectId) ||
        (isOrtu && ortuViewAllChildren ? undefined : classSubjects[0]);

  const [tab, setTab] = useState<'materi' | 'tugas' | 'forum'>('materi');

  const childClassSet = useMemo(
    () => new Set(linkedChildren.map((c) => c.kelas)),
    [linkedChildren]
  );

  // Filter LMS items
  const materials = useMemo(
    () =>
      (state.lmsMaterials || []).filter((m) => {
        if (isOrtu && ortuViewAllChildren) {
          if (!childClassSet.has(m.kelas)) return false;
          if (selectedSubjectId && selectedSubjectId !== 'ALL' && m.subjectId !== selectedSubjectId) {
            return false;
          }
          return true;
        }
        return m.kelas === lmsClass && (!activeSubject || m.subjectId === activeSubject.id);
      }),
    [state.lmsMaterials, isOrtu, ortuViewAllChildren, childClassSet, selectedSubjectId, lmsClass, activeSubject]
  );

  const assignments = useMemo(
    () =>
      (state.lmsAssignments || []).filter((a) => {
        if (isOrtu && ortuViewAllChildren) {
          if (!childClassSet.has(a.kelas)) return false;
          if (selectedSubjectId && selectedSubjectId !== 'ALL' && a.subjectId !== selectedSubjectId) {
            return false;
          }
          return true;
        }
        return a.kelas === lmsClass && (!activeSubject || a.subjectId === activeSubject.id);
      }),
    [state.lmsAssignments, isOrtu, ortuViewAllChildren, childClassSet, selectedSubjectId, lmsClass, activeSubject]
  );

  const discussions = useMemo(
    () =>
      (state.lmsDiscussions || []).filter((d) => {
        if (isOrtu && ortuViewAllChildren) {
          if (!childClassSet.has(d.kelas)) return false;
          if (selectedSubjectId && selectedSubjectId !== 'ALL' && d.subjectId !== selectedSubjectId) {
            return false;
          }
          return true;
        }
        return d.kelas === lmsClass && (!activeSubject || d.subjectId === activeSubject.id);
      }),
    [state.lmsDiscussions, isOrtu, ortuViewAllChildren, childClassSet, selectedSubjectId, lmsClass, activeSubject]
  );

  // Material creation state
  const [matOpen, setMatOpen] = useState(false);
  const [matJudul, setMatJudul] = useState('');
  const [matTipe, setMatTipe] = useState<LmsMaterial['tipe']>('Modul Bacaan');
  const [matCpTp, setMatCpTp] = useState('');
  const [matKonten, setMatKonten] = useState('');
  const [matUrl, setMatUrl] = useState('');
  const [savingMat, setSavingMat] = useState(false);

  // Assignment creation state
  const [asgOpen, setAsgOpen] = useState(false);
  const [asgJudul, setAsgJudul] = useState('');
  const [asgCpTp, setAsgCpTp] = useState('');
  const [asgInstruksi, setAsgInstruksi] = useState('');
  const [asgTenggat, setAsgTenggat] = useState(() => {
    const d = new Date(Date.now() + 7 * 86400000);
    return d.toISOString().slice(0, 10);
  });
  const [asgMaxScore, setAsgMaxScore] = useState(100);
  const [savingAsg, setSavingAsg] = useState(false);

  // Student submission modal/inline
  const [submitTarget, setSubmitTarget] = useState<LmsAssignment | null>(null);
  const [jawabanTeks, setJawabanTeks] = useState('');
  const [lampiranUrl, setLampiranUrl] = useState('');
  const [submittingTask, setSubmittingTask] = useState(false);

  // Teacher grading inline state
  const [gradingDraft, setGradingDraft] = useState<
    Record<string, { nilai: string; umpan: string }>
  >({});

  // Forum input
  const [forumMsg, setForumMsg] = useState('');
  const [sendingForum, setSendingForum] = useState(false);

  const cpTpOptions = useMemo(() => {
    if (!activeSubject) return [];
    const list: Array<{ cpKode: string; tpKode: string; label: string }> = [];
    for (const cp of activeSubject.cps || []) {
      for (const tp of cp.tps || []) {
        list.push({ cpKode: cp.kode, tpKode: tp.kode, label: `${cp.kode} / ${tp.kode} — ${tp.deskripsi}` });
      }
    }
    return list;
  }, [activeSubject]);

  const handleSaveMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSubject) return;
    setSavingMat(true);
    try {
      const [cpKode, tpKode] = matCpTp ? matCpTp.split('|') : [undefined, undefined];
      const ok = await onCreateMaterial({
        kelas: lmsClass,
        subjectId: activeSubject.id,
        cpKode,
        tpKode,
        judul: matJudul.trim(),
        tipe: matTipe,
        konten: matKonten.trim(),
        resourceUrl: matUrl.trim() || undefined,
      });
      if (ok) {
        onNotify('Materi belajar LMS berhasil diterbitkan.');
        setMatOpen(false);
        setMatJudul('');
        setMatKonten('');
        setMatUrl('');
      }
    } finally {
      setSavingMat(false);
    }
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSubject) return;
    setSavingAsg(true);
    try {
      const [cpKode, tpKode] = asgCpTp ? asgCpTp.split('|') : [undefined, undefined];
      const ok = await onCreateAssignment({
        kelas: lmsClass,
        subjectId: activeSubject.id,
        cpKode,
        tpKode,
        judul: asgJudul.trim(),
        instruksi: asgInstruksi.trim(),
        tenggat: asgTenggat,
        skorMaksimal: asgMaxScore,
      });
      if (ok) {
        onNotify('Tugas LMS berhasil diterbitkan ke ruang kelas.');
        setAsgOpen(false);
        setAsgJudul('');
        setAsgInstruksi('');
      }
    } finally {
      setSavingAsg(false);
    }
  };

  const handleSendStudentSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitTarget) return;
    setSubmittingTask(true);
    try {
      const ok = await onSubmitAssignment({
        assignmentId: submitTarget.id,
        jawabanTeks: jawabanTeks.trim(),
        lampiranUrl: lampiranUrl.trim() || undefined,
      });
      if (ok) {
        onNotify('Jawaban tugas berhasil dikirim ke Guru.');
        setSubmitTarget(null);
        setJawabanTeks('');
        setLampiranUrl('');
      }
    } finally {
      setSubmittingTask(false);
    }
  };

  const handleSendForum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSubject || !forumMsg.trim()) return;
    setSendingForum(true);
    try {
      const ok = await onPostDiscussion({
        kelas: lmsClass,
        subjectId: activeSubject.id,
        pesan: forumMsg.trim(),
      });
      if (ok) setForumMsg('');
    } finally {
      setSendingForum(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header + Scope Selectors */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {isReadOnlyParent
                ? 'Pantau Ruang LMS Belajar Anak (Mode Orang Tua — Hanya Lihat)'
                : 'Ruang LMS Terpadu (Guru · Wali Kelas · Pengurus · Siswa)'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {isReadOnlyParent
                ? 'Orang tua dapat memantau materi pembelajaran, tugas, nilai, umpan balik guru, dan forum kelas seluruh anak tanpa memberikan input.'
                : 'Ruang belajar interaktif berbasis kelas & mata pelajaran: modul CP/TP, pengumpulan & penilaian tugas, serta forum diskusi kelas.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {isOrtu && linkedChildren.length > 0 && (
              <>
                <select
                  value={ortuViewAllChildren ? 'ALL_CHILDREN' : activeChild?.id || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'ALL_CHILDREN') {
                      setOrtuViewAllChildren(true);
                      setSelectedSubjectId('ALL');
                    } else {
                      setOrtuViewAllChildren(false);
                      onChangeActiveStudentId?.(val);
                    }
                  }}
                  className="h-9 rounded-lg border border-emerald-700 bg-emerald-50 px-2.5 font-semibold text-emerald-900"
                >
                  {linkedChildren.length > 1 && (
                    <option value="ALL_CHILDREN">
                      Semua Anak ({linkedChildren.length} Siswa)
                    </option>
                  )}
                  {linkedChildren.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.nama} ({child.kelas})
                    </option>
                  ))}
                </select>
              </>
            )}

            {!isOrtu && (
              <select
                value={lmsClass}
                onChange={(e) => setLmsClass(e.target.value)}
                disabled={isSiswa}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 font-medium text-slate-900 disabled:bg-slate-100"
              >
                {accessibleClasses.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}

            <select
              value={
                isOrtu && ortuViewAllChildren
                  ? selectedSubjectId || 'ALL'
                  : activeSubject?.id || ''
              }
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 font-medium text-slate-900 max-w-xs"
            >
              {isOrtu && ortuViewAllChildren && (
                <option value="ALL">Semua Mata Pelajaran Anak</option>
              )}
              {classSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.kode} — {s.nama}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isReadOnlyParent && (
          <div className="p-3 rounded-lg border border-sky-200 bg-sky-50 text-xs text-sky-900">
            <strong>Mode Pantau Orang Tua (Hanya Lihat):</strong> Anda sedang melihat aktivitas LMS untuk{' '}
            {ortuViewAllChildren
              ? `${linkedChildren.map((c) => `${c.nama} (${c.kelas})`).join(', ')}`
              : activeChild
                ? `${activeChild.nama} (${activeChild.kelas})`
                : 'peserta didik tertaut'}
            . Semua tombol input, unggah tugas, penandaan selesai, dan kirim pesan dinonaktifkan.
          </div>
        )}

        {/* Tab Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setTab('materi')}
              className={`px-3 py-1.5 rounded-md font-semibold whitespace-nowrap ${
                tab === 'materi' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Materi & Modul ({materials.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('tugas')}
              className={`px-3 py-1.5 rounded-md font-semibold whitespace-nowrap ${
                tab === 'tugas' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Tugas & Nilai ({assignments.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('forum')}
              className={`px-3 py-1.5 rounded-md font-semibold whitespace-nowrap ${
                tab === 'forum' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Forum Diskusi ({discussions.length})
            </button>
          </div>

          {canTeach && activeSubject && (
            <div className="flex items-center gap-2">
              {tab === 'materi' && (
                <button
                  type="button"
                  onClick={() => setMatOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> Tambah Materi Belajar
                </button>
              )}
              {tab === 'tugas' && (
                <button
                  type="button"
                  onClick={() => setAsgOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> Buat Tugas Baru
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create Material Inline Form */}
      {canTeach && tab === 'materi' && matOpen && (
        <form
          onSubmit={handleSaveMaterial}
          className="bg-white border border-emerald-200 rounded-xl p-5 space-y-3 text-xs"
        >
          <div className="font-bold text-slate-900 text-sm">
            Terbitkan Materi Baru — {activeSubject?.nama} ({lmsClass})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">Judul Modul *</label>
              <input
                type="text"
                required
                value={matJudul}
                onChange={(e) => setMatJudul(e.target.value)}
                placeholder="Mis. Modul 1: Strategi Memecahkan Masalah Bilangan Bulat"
                className="w-full h-9 rounded-lg border border-slate-300 px-3"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Tipe Materi</label>
              <select
                value={matTipe}
                onChange={(e) => setMatTipe(e.target.value as LmsMaterial['tipe'])}
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5"
              >
                <option value="Modul Bacaan">Modul Bacaan</option>
                <option value="Video Pembelajaran">Video Pembelajaran</option>
                <option value="Lembar Kerja / Tautan">Lembar Kerja / Tautan</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">Tautkan CP / TP (Opsional)</label>
              <select
                value={matCpTp}
                onChange={(e) => setMatCpTp(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5"
              >
                <option value="">-- Umum / Semua TP --</option>
                {cpTpOptions.map((o) => (
                  <option key={o.cpKode + o.tpKode} value={`${o.cpKode}|${o.tpKode}`}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Tautan Eksternal (Opsional)</label>
              <input
                type="url"
                value={matUrl}
                onChange={(e) => setMatUrl(e.target.value)}
                placeholder="https://..."
                className="w-full h-9 rounded-lg border border-slate-300 px-3"
              />
            </div>
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Isi Ringkasan & Langkah Belajar *</label>
            <textarea
              rows={3}
              required
              value={matKonten}
              onChange={(e) => setMatKonten(e.target.value)}
              placeholder="Tuliskan materi ringkas, poin penting CP/TP, atau petunjuk belajar siswa..."
              className="w-full rounded-lg border border-slate-300 p-3"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setMatOpen(false)}
              className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 font-medium"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={savingMat}
              className="px-4 py-2 rounded-lg bg-emerald-700 text-white font-semibold hover:bg-emerald-800 disabled:opacity-50"
            >
              {savingMat ? 'Menerbitkan...' : 'Terbitkan Materi'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 1: MATERI */}
      {tab === 'materi' && (
        <div className="space-y-3">
          {materials.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
              Belum ada modul materi pada mata pelajaran {activeSubject?.nama || '-'} kelas {lmsClass}.
            </div>
          ) : (
            materials.map((mat) => {
              const completed =
                linkedStudent && (mat.completedByStudentIds || []).includes(linkedStudent.id);
              return (
                <div
                  key={mat.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
                        {mat.tipe === 'Video Pembelajaran' ? (
                          <Video className="w-3.5 h-3.5 text-emerald-700" />
                        ) : (
                          <BookOpen className="w-3.5 h-3.5 text-emerald-700" />
                        )}
                        <span>
                          {mat.kelas} · {mat.subjectName} · {mat.tipe}
                          {mat.cpKode ? ` · ${mat.cpKode}${mat.tpKode ? ` / ${mat.tpKode}` : ''}` : ''}
                        </span>
                        <span>· {mat.authorName}</span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">{mat.judul}</h3>
                    </div>

                    <div className="flex items-center gap-2">
                      {isSiswa && (
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await onToggleCompleteMaterial(mat.id);
                            if (ok) {
                              onNotify(
                                completed
                                  ? 'Status selesai belajar dibatalkan.'
                                  : 'Modul ditandai selesai dipelajari.'
                              );
                            }
                          }}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap ${
                            completed
                              ? 'bg-emerald-700 text-white border-emerald-700'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {completed ? 'Selesai Dipelajari' : 'Tandai Selesai'}
                        </button>
                      )}
                      {isReadOnlyParent && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          {(ortuViewAllChildren ? linkedChildren.filter((c) => c.kelas === mat.kelas) : activeChild ? [activeChild] : []).map((child) => {
                            const childDone = (mat.completedByStudentIds || []).includes(child.id);
                            return (
                              <span
                                key={child.id}
                                className={`font-semibold px-2 py-0.5 rounded border ${
                                  childDone
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                    : 'border-slate-200 bg-slate-50 text-slate-600'
                                }`}
                              >
                                {child.nama.split(' ')[0]}: {childDone ? 'Sudah Dibaca' : 'Belum Dibaca'}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {canTeach && (
                        <span className="text-[11px] font-mono text-slate-500">
                          {mat.completedByStudentIds?.length || 0} siswa selesai
                        </span>
                      )}
                      {canTeach && (
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await onDeleteMaterial(mat.id);
                            if (ok) onNotify('Materi LMS dihapus.');
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                    {mat.konten}
                  </p>

                  {mat.resourceUrl && /^https?:\/\//i.test(mat.resourceUrl.trim()) && (
                    <a
                      href={mat.resourceUrl.trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Buka Tautan Sumber Belajar
                    </a>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Create Assignment Form */}
      {canTeach && tab === 'tugas' && asgOpen && (
        <form
          onSubmit={handleSaveAssignment}
          className="bg-white border border-emerald-200 rounded-xl p-5 space-y-3 text-xs"
        >
          <div className="font-bold text-slate-900 text-sm">
            Buat Tugas LMS Baru — {activeSubject?.nama} ({lmsClass})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">Judul Tugas *</label>
              <input
                type="text"
                required
                value={asgJudul}
                onChange={(e) => setAsgJudul(e.target.value)}
                placeholder="Mis. Latihan Soal Kontekstual TP-01"
                className="w-full h-9 rounded-lg border border-slate-300 px-3"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Tenggat Pengumpulan</label>
              <input
                type="date"
                value={asgTenggat}
                onChange={(e) => setAsgTenggat(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Skor Maksimal</label>
              <input
                type="number"
                min={10}
                max={100}
                value={asgMaxScore}
                onChange={(e) => setAsgMaxScore(Number(e.target.value) || 100)}
                className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono"
              />
            </div>
            <div className="sm:col-span-4">
              <label className="block font-medium text-slate-700 mb-1">Tautkan CP / TP (Opsional)</label>
              <select
                value={asgCpTp}
                onChange={(e) => setAsgCpTp(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5"
              >
                <option value="">-- Umum / Semua TP --</option>
                {cpTpOptions.map((o) => (
                  <option key={o.cpKode + o.tpKode} value={`${o.cpKode}|${o.tpKode}`}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Instruksi Pengerjaan *</label>
            <textarea
              rows={3}
              required
              value={asgInstruksi}
              onChange={(e) => setAsgInstruksi(e.target.value)}
              placeholder="Tuliskan soal atau instruksi pengumpulan tugas bagi siswa..."
              className="w-full rounded-lg border border-slate-300 p-3"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAsgOpen(false)}
              className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 font-medium"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={savingAsg}
              className="px-4 py-2 rounded-lg bg-emerald-700 text-white font-semibold hover:bg-emerald-800 disabled:opacity-50"
            >
              {savingAsg ? 'Menyimpan...' : 'Terbitkan Tugas'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: TUGAS & PENILAIAN */}
      {tab === 'tugas' && (
        <div className="space-y-4">
          {assignments.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
              Belum ada tugas pada mata pelajaran {activeSubject?.nama || '-'} kelas {lmsClass}.
            </div>
          ) : (
            assignments.map((asg) => {
              const subsForAsg = (state.lmsSubmissions || []).filter(
                (s) => s.assignmentId === asg.id
              );
              const mySub = isSiswa ? subsForAsg[0] : undefined;

              return (
                <div
                  key={asg.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
                        <ClipboardList className="w-3.5 h-3.5 text-emerald-700" />
                        <span>
                          {asg.kelas} · {asg.subjectName} · Tenggat: {formatTanggalID(asg.tenggat)} · Skor Maks {asg.skorMaksimal}
                          {asg.cpKode ? ` · ${asg.cpKode}` : ''}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">{asg.judul}</h3>
                      <p className="text-xs text-slate-700 whitespace-pre-line">{asg.instruksi}</p>
                    </div>

                    {canTeach && (
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await onDeleteAssignment(asg.id);
                          if (ok) onNotify('Tugas LMS dihapus.');
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {isReadOnlyParent ? (
                    <div className="border-t border-slate-200 pt-3 text-xs space-y-2">
                      {(ortuViewAllChildren
                        ? linkedChildren.filter((c) => c.kelas === asg.kelas)
                        : activeChild
                          ? [activeChild]
                          : []
                      ).map((child) => {
                        const childSub = subsForAsg.find((s) => s.studentId === child.id);
                        return (
                          <div
                            key={child.id}
                            className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-semibold text-slate-900">
                                Status Anak: {child.nama} ({child.kelas})
                              </span>
                              {childSub ? (
                                typeof childSub.nilai === 'number' ? (
                                  <span className="font-mono font-bold text-emerald-700 tabular-nums">
                                    Nilai: {childSub.nilai} / {asg.skorMaksimal}
                                  </span>
                                ) : (
                                  <span className="text-amber-700 font-medium">
                                    Sudah Dikumpulkan · Menunggu Nilai Guru
                                  </span>
                                )
                              ) : (
                                <span className="text-red-700 font-medium">Belum Mengumpulkan</span>
                              )}
                            </div>
                            {childSub && (
                              <>
                                <p className="text-slate-700 whitespace-pre-line">
                                  {childSub.jawabanTeks}
                                </p>
                                {childSub.lampiranUrl && /^https?:\/\//i.test(childSub.lampiranUrl.trim()) && (
                                  <a
                                    href={childSub.lampiranUrl.trim()}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-emerald-700 font-semibold hover:underline"
                                  >
                                    <ExternalLink className="w-3 h-3" /> Lihat Lampiran Anak
                                  </a>
                                )}
                                {childSub.umpanBalikGuru && (
                                  <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-900">
                                    <strong>Umpan Balik Guru ({childSub.gradedByName}):</strong>{' '}
                                    {childSub.umpanBalikGuru}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : isSiswa ? (
                    <div className="border-t border-slate-200 pt-3 text-xs space-y-2.5">
                      {mySub ? (
                        <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                              <FileCheck className="w-4 h-4" />
                              Sudah Dikumpulkan ({formatTanggalID(mySub.submittedAt.slice(0, 10))})
                            </span>
                            {typeof mySub.nilai === 'number' ? (
                              <span className="font-mono font-bold text-slate-900 tabular-nums">
                                Nilai: {mySub.nilai} / {asg.skorMaksimal}
                              </span>
                            ) : (
                              <span className="text-amber-700 font-medium">Menunggu Penilaian Guru</span>
                            )}
                          </div>
                          <p className="text-slate-700 whitespace-pre-line">{mySub.jawabanTeks}</p>
                          {mySub.umpanBalikGuru && (
                            <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-900">
                              <strong>Umpan Balik Guru ({mySub.gradedByName}):</strong>{' '}
                              {mySub.umpanBalikGuru}
                            </div>
                          )}
                          {typeof mySub.nilai !== 'number' && (
                            <button
                              type="button"
                              onClick={() => {
                                setSubmitTarget(asg);
                                setJawabanTeks(mySub.jawabanTeks);
                                setLampiranUrl(mySub.lampiranUrl || '');
                              }}
                              className="text-emerald-700 font-semibold underline"
                            >
                              Ubah Jawaban Tugas
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setSubmitTarget(asg);
                            setJawabanTeks('');
                            setLampiranUrl('');
                          }}
                          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap"
                        >
                          <Send className="w-3.5 h-3.5" /> Kumpulkan Jawaban Tugas
                        </button>
                      )}
                    </div>
                  ) : (
                    /* Teacher grading list */
                    <div className="border-t border-slate-200 pt-3 space-y-2 text-xs">
                      <div className="font-semibold text-slate-800">
                        Kiriman Jawaban Siswa ({subsForAsg.length})
                      </div>
                      {subsForAsg.length === 0 ? (
                        <p className="text-slate-500 italic">Belum ada siswa yang mengumpulkan tugas ini.</p>
                      ) : (
                        <div className="space-y-2">
                          {subsForAsg.map((sub: LmsSubmission) => {
                            const draft = gradingDraft[sub.id] || {
                              nilai: typeof sub.nilai === 'number' ? String(sub.nilai) : '',
                              umpan: sub.umpanBalikGuru || '',
                            };
                            return (
                              <div
                                key={sub.id}
                                className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 space-y-2"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-bold text-slate-900">
                                    {sub.studentName}{' '}
                                    <span className="font-mono font-normal text-slate-500">
                                      (NIS {sub.nis})
                                    </span>
                                  </span>
                                  <span className="font-mono text-[11px] text-slate-500">
                                    {formatTanggalID(sub.submittedAt.slice(0, 10))}
                                  </span>
                                </div>
                                <p className="text-slate-700 whitespace-pre-line">{sub.jawabanTeks}</p>
                                {sub.lampiranUrl && /^https?:\/\//i.test(sub.lampiranUrl.trim()) && (
                                  <a
                                    href={sub.lampiranUrl.trim()}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-emerald-700 font-semibold hover:underline"
                                  >
                                    <ExternalLink className="w-3 h-3" /> Lihat Lampiran Karya
                                  </a>
                                )}
                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                  <input
                                    type="number"
                                    min={0}
                                    max={asg.skorMaksimal}
                                    placeholder={`Nilai (0–${asg.skorMaksimal})`}
                                    value={draft.nilai}
                                    onChange={(e) =>
                                      setGradingDraft((prev) => ({
                                        ...prev,
                                        [sub.id]: { ...draft, nilai: e.target.value },
                                      }))
                                    }
                                    className="w-28 h-8 rounded border border-slate-300 bg-white px-2 font-mono"
                                  />
                                  <input
                                    type="text"
                                    placeholder="Umpan balik guru..."
                                    value={draft.umpan}
                                    onChange={(e) =>
                                      setGradingDraft((prev) => ({
                                        ...prev,
                                        [sub.id]: { ...draft, umpan: e.target.value },
                                      }))
                                    }
                                    className="flex-1 min-w-[180px] h-8 rounded border border-slate-300 bg-white px-2.5"
                                  />
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const n = Number(draft.nilai);
                                      if (!Number.isFinite(n)) {
                                        onNotify('Masukkan nilai angka yang valid.', true);
                                        return;
                                      }
                                      const ok = await onGradeSubmission(sub.id, n, draft.umpan);
                                      if (ok) onNotify(`Nilai untuk ${sub.studentName} tersimpan.`);
                                    }}
                                    className="h-8 px-3 rounded bg-emerald-700 text-white font-semibold hover:bg-emerald-800 whitespace-nowrap"
                                  >
                                    Simpan Nilai
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 3: FORUM DISKUSI */}
      {tab === 'forum' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <MessageSquare className="w-4 h-4 text-emerald-700" />
            Forum Diskusi{' '}
            {isOrtu && ortuViewAllChildren
              ? 'Semua Kelas Anak'
              : `${activeSubject?.nama || ''} — ${lmsClass}`}
          </div>

          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {discussions.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 border border-slate-200 rounded-lg bg-slate-50">
                Belum ada percakapan di ruang diskusi ini.
              </div>
            ) : (
              discussions.map((d) => {
                const isMine = d.authorUserId === currentUser.id;
                return (
                  <div
                    key={d.id}
                    className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                      isMine
                        ? 'border-emerald-200 bg-emerald-50/60'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900">
                        {d.authorName}{' '}
                        <span className="font-normal text-emerald-700">
                          ({d.authorRole === 'admin'
                            ? 'Pengurus'
                            : d.authorRole === 'walikelas'
                              ? 'Wali Kelas'
                              : d.authorRole === 'guru'
                                ? 'Guru'
                                : 'Siswa'}) · {d.kelas} · {d.subjectName}
                        </span>
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">
                        {formatTanggalID(d.createdAt.slice(0, 10))}
                      </span>
                    </div>
                    <p className="text-slate-800 whitespace-pre-line">{d.pesan}</p>
                  </div>
                );
              })
            )}
          </div>

          {isReadOnlyParent ? (
            <div className="pt-2 border-t border-slate-200 text-xs text-slate-500 italic">
              Mode pantau orang tua aktif — kolom kirim pesan forum dinonaktifkan.
            </div>
          ) : (
            <form onSubmit={handleSendForum} className="flex gap-2 pt-2 border-t border-slate-200">
              <input
                type="text"
                required
                value={forumMsg}
                onChange={(e) => setForumMsg(e.target.value)}
                placeholder="Tulis pertanyaan, penjelasan materi, atau tanggapan diskusi..."
                className="flex-1 h-10 rounded-lg border border-slate-300 px-3 text-xs focus:border-emerald-700 focus:outline-none"
              />
              <button
                type="submit"
                disabled={sendingForum}
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Send className="w-3.5 h-3.5" /> Kirim Pesan
              </button>
            </form>
          )}
        </div>
      )}

      {/* Student Assignment Submit Modal */}
      {submitTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 space-y-4 shadow-xl text-xs">
            <div className="font-bold text-sm text-slate-900">
              Kumpulkan Tugas: {submitTarget.judul}
            </div>
            <form onSubmit={handleSendStudentSubmission} className="space-y-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Jawaban / Uraian Penyelesaian *
                </label>
                <textarea
                  rows={4}
                  required
                  value={jawabanTeks}
                  onChange={(e) => setJawabanTeks(e.target.value)}
                  placeholder="Tuliskan jawaban atau kesimpulan Anda..."
                  className="w-full rounded-lg border border-slate-300 p-3"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Tautan Dokumen / Karya (Opsional, Google Drive/Docs)
                </label>
                <input
                  type="url"
                  value={lampiranUrl}
                  onChange={(e) => setLampiranUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full h-9 rounded-lg border border-slate-300 px-3"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSubmitTarget(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 font-medium text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingTask}
                  className="px-4 py-2 rounded-lg bg-emerald-700 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {submittingTask ? 'Mengirim...' : 'Kirim Jawaban'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
