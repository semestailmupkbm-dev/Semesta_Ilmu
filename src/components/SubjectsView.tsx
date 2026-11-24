import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronRight,
  Copy,
  Download,
  Edit3,
  Layers,
  Lock,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  AcademicYearRecord,
  CapaianPembelajaran,
  ClassDef,
  SchoolSettings,
  Subject,
  TujuanPembelajaran,
  UserAccount,
} from '../types';
import {
  filterSubjectsForUser,
  getAccessibleClassesForUser,
  getClassTingkat,
  getSubjectCPsForClass,
  getSubjectsForClass,
  isInputLockedForUser,
  isTeacherSubjectRestricted,
  PKBM_KATEGORI_LIST,
  syncSubjectFromCPs,
} from '../utils/academic';
import { downloadCPTP_Template, importCPTP_Excel } from '../utils/excel';

interface SubjectsViewProps {
  subjects: Subject[];
  settings?: SchoolSettings;
  academicYears?: AcademicYearRecord[];
  selectedClass: string;
  classes: string[];
  classDefs: ClassDef[];
  currentUser: UserAccount;
  onSaveSubject: (subject: Subject, isNew: boolean, immediate?: boolean) => void;
  onBulkUpdateSubjects: (subjects: Subject[]) => void;
  onDeleteSubject: (id: string) => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

export const SubjectsView: React.FC<SubjectsViewProps> = ({
  subjects,
  settings,
  academicYears,
  selectedClass,
  classes,
  classDefs,
  currentUser,
  onSaveSubject,
  onBulkUpdateSubjects,
  onDeleteSubject,
  onNotify,
}) => {
  const isRestrictedGuru = isTeacherSubjectRestricted(currentUser);
  const canCreateOrDelete = currentUser.role === 'admin';
  const lockStatus = settings
    ? isInputLockedForUser(settings, academicYears, currentUser)
    : { locked: false, reason: '' };
  const isLocked = lockStatus.locked;

  // Target class for CP/TP viewing & editing (Improvement #1)
  const [cpClassFilter, setCpClassFilter] = useState<string>(selectedClass);
  useEffect(() => {
    setCpClassFilter(selectedClass);
  }, [selectedClass]);

  const [scopeFilter, setScopeFilter] = useState<'class' | 'all'>('class');
  const [quickEdit, setQuickEdit] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [isNewModal, setIsNewModal] = useState(false);

  // Selected subject & selected CP in the CP -> TP hierarchy panel
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [selectedCpId, setSelectedCpId] = useState<string>('');
  const [draftSubject, setDraftSubject] = useState<Subject | null>(null);
  const [hasUnsavedCpTp, setHasUnsavedCpTp] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Enforce Improvement #4: restricted guru ONLY sees subjects they teach!
  const userScopedSubjects = filterSubjectsForUser(
    subjects,
    currentUser,
    scopeFilter === 'class' ? cpClassFilter : undefined
  );

  const displayedSubjects =
    scopeFilter === 'class'
      ? getSubjectsForClass(userScopedSubjects, cpClassFilter, classDefs)
      : [...userScopedSubjects].sort((a, b) => a.urutan - b.urutan);

  const activeSubject =
    displayedSubjects.find((s) => s.id === selectedSubjectId) || displayedSubjects[0] || null;

  useEffect(() => {
    if (activeSubject && activeSubject.id !== selectedSubjectId) {
      setSelectedSubjectId(activeSubject.id);
    }
  }, [activeSubject, selectedSubjectId]);

  useEffect(() => {
    if (!activeSubject) {
      setDraftSubject(null);
      setHasUnsavedCpTp(false);
      return;
    }
    if (!draftSubject || draftSubject.id !== activeSubject.id || !hasUnsavedCpTp) {
      setDraftSubject(JSON.parse(JSON.stringify(activeSubject)));
      setHasUnsavedCpTp(false);
    }
  }, [activeSubject]);

  const workingSubject =
    draftSubject && activeSubject && draftSubject.id === activeSubject.id
      ? draftSubject
      : activeSubject;

  const classCPs = workingSubject
    ? getSubjectCPsForClass(workingSubject, cpClassFilter, classDefs)
    : [];

  const activeCp = classCPs.find((c) => c.id === selectedCpId) || classCPs[0] || null;

  useEffect(() => {
    if (activeCp && activeCp.id !== selectedCpId) {
      setSelectedCpId(activeCp.id);
    } else if (!activeCp && selectedCpId) {
      setSelectedCpId('');
    }
  }, [activeCp, selectedCpId]);

  const activeTingkat = getClassTingkat(cpClassFilter, classDefs);

  const formatCoverage = (s: Subject) => {
    if (s.kelasList && s.kelasList.length > 0) return s.kelasList.join(', ');
    if (s.tingkatList && s.tingkatList.length > 0) {
      if (s.tingkatList.length === 12) return 'Semua Tingkat (1–12)';
      return `Tingkat ${s.tingkatList.join(', ')}`;
    }
    return 'Semua Kelas';
  };

  const handleQuickPatch = (id: string, patch: Partial<Subject>) => {
    const next = subjects.map((s) => (s.id === id ? { ...s, ...patch } : s));
    onBulkUpdateSubjects(next);
  };

  const openNewModal = () => {
    const t = getClassTingkat(cpClassFilter, classDefs);
    const id = `subj-${Date.now()}`;
    const newSubj: Subject = {
      id,
      kode: '',
      nama: '',
      kelompok: 'A. Kelompok Mata Pelajaran Umum',
      kategoriPkbm: 'Umum / Wajib',
      skk: 2,
      aktif: true,
      urutan: subjects.length + 1,
      guruPengampu: '',
      kelasList: [cpClassFilter],
      tingkatList: t ? [t] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      jurusanList: ['Umum', 'IPA', 'IPS'],
      capaianPembelajaran: '',
      cps: [
        {
          id: `${id}-cp1`,
          kode: 'CP 1',
          deskripsi: '',
          tingkatList: t ? [t] : [7],
          kelasList: [cpClassFilter],
          tps: [
            { id: `${id}-tp1`, kode: 'TP 1', deskripsi: '' },
            { id: `${id}-tp2`, kode: 'TP 2', deskripsi: '' },
          ],
        },
      ],
      tps: [
        { id: `${id}-tp1`, kode: 'TP 1', deskripsi: '' },
        { id: `${id}-tp2`, kode: 'TP 2', deskripsi: '' },
      ],
    };
    setIsNewModal(true);
    setEditingSubject(newSubj);
  };

  const handleAddPkbmPack = () => {
    const existingCodes = new Set(subjects.map((s) => s.kode.toUpperCase()));
    const candidates: Subject[] = [
      syncSubjectFromCPs({
        id: `subj-pkbm-pmb-${Date.now()}`,
        kode: 'PMB',
        nama: 'Pemberdayaan & Kemandirian PKBM',
        kelompok: 'B. Kelompok Mata Pelajaran Pilihan / Muatan Lokal & Keterampilan',
        kategoriPkbm: 'Pemberdayaan',
        skk: 2,
        aktif: true,
        urutan: subjects.length + 1,
        guruPengampu: 'Tutor Pemberdayaan',
        kelasList: [],
        tingkatList: [4, 5, 6, 7, 8, 9, 10, 11, 12],
        jurusanList: ['Umum', 'IPA', 'IPS'],
        capaianPembelajaran:
          'Peserta didik mampu mengembangkan kesadaran diri, keterampilan sosial, dan proyek kemandirian berbasis kebutuhan komunitas.',
        cps: [
          {
            id: `cp-pmb-${Date.now()}`,
            kode: 'CP 1',
            deskripsi:
              'Peserta didik mampu mengembangkan kesadaran diri, keterampilan sosial, dan proyek kemandirian berbasis kebutuhan komunitas.',
            tingkatList: [4, 5, 6, 7, 8, 9, 10, 11, 12],
            kelasList: [],
            tps: [
              {
                id: `tp-pmb-1-${Date.now()}`,
                kode: 'TP 1',
                deskripsi: 'Merencanakan kegiatan pemberdayaan diri dan kerja sama tim di lingkungan belajar',
              },
              {
                id: `tp-pmb-2-${Date.now()}`,
                kode: 'TP 2',
                deskripsi: 'Mempresentasikan hasil proyek kemandirian secara komunikatif',
              },
            ],
          },
        ],
        tps: [],
      }),
    ].filter((c) => !existingCodes.has(c.kode.toUpperCase()));

    if (candidates.length === 0) {
      onNotify('Paket Pemberdayaan PKBM (PMB) sudah tersedia di daftar mata pelajaran.');
      return;
    }
    onBulkUpdateSubjects([...subjects, ...candidates]);
    onNotify('Paket Pemberdayaan PKBM berhasil ditambahkan.');
  };

  const handleDuplicate = (subj: Subject) => {
    const id = `subj-${Date.now()}`;
    const copy: Subject = syncSubjectFromCPs({
      ...subj,
      id,
      kode: `${subj.kode}-2`,
      nama: `${subj.nama} (Salinan)`,
      urutan: subjects.length + 1,
      cps: subj.cps.map((cp, ci) => ({
        ...cp,
        id: `${id}-cp-${ci}`,
        tps: cp.tps.map((tp, ti) => ({ ...tp, id: `${id}-cp-${ci}-tp-${ti}` })),
      })),
    });
    onSaveSubject(copy, true);
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (isLocked) {
      onNotify(lockStatus.reason || 'Pengisian CP & TP sedang dikunci.', true);
      return;
    }
    try {
      const allowedIds = isRestrictedGuru
        ? new Set(filterSubjectsForUser(subjects, currentUser).map((s) => s.id))
        : undefined;
      const { updatedSubjects, updatedCount } = await importCPTP_Excel(file, subjects, allowedIds);
      if (updatedCount === 0) {
        onNotify(
          'Tidak ada baris mapel yang cocok atau diizinkan pada file Excel. Periksa kolom Kode_Mapel / Nama_Mapel.',
          true
        );
        return;
      }
      onBulkUpdateSubjects(updatedSubjects);
      onNotify(`CP & TP untuk ${updatedCount} mata pelajaran berhasil diimpor dari Excel.`);
    } catch {
      onNotify('Gagal membaca file Excel CP & TP.', true);
    }
  };

  // --- Improvement #1: Direct CP & nested TP management with explicit Save ---
  const commitDraftLocally = (updated: Subject) => {
    setDraftSubject(updated);
    setHasUnsavedCpTp(true);
  };

  const handleSaveCpTpChanges = () => {
    if (!workingSubject) return;
    const synced = syncSubjectFromCPs(workingSubject);
    onSaveSubject(synced, false, true);
    setDraftSubject(synced);
    setHasUnsavedCpTp(false);
    onNotify(`Perubahan CP & TP untuk ${workingSubject.nama} berhasil disimpan.`);
  };

  const handleAddCpToActiveSubject = () => {
    if (!workingSubject) return;
    const newCpId = `${workingSubject.id}-cp-${Date.now()}`;
    const nextNum = (workingSubject.cps?.length || 0) + 1;
    const newCp: CapaianPembelajaran = {
      id: newCpId,
      kode: `CP ${nextNum}`,
      deskripsi: `Capaian Pembelajaran ${workingSubject.nama} (${cpClassFilter})`,
      tingkatList: activeTingkat ? [activeTingkat] : [],
      kelasList: [cpClassFilter],
      tps: [
        {
          id: `${newCpId}-tp1`,
          kode: 'TP 1',
          deskripsi: '',
        },
      ],
    };
    const updated = syncSubjectFromCPs({
      ...workingSubject,
      cps: [...(workingSubject.cps || []), newCp],
    });
    commitDraftLocally(updated);
    setSelectedCpId(newCpId);
  };

  const handleUpdateCp = (cpId: string, patch: Partial<CapaianPembelajaran>) => {
    if (!workingSubject) return;
    const updated = syncSubjectFromCPs({
      ...workingSubject,
      cps: workingSubject.cps.map((cp) => (cp.id === cpId ? { ...cp, ...patch } : cp)),
    });
    commitDraftLocally(updated);
  };

  const handleDeleteCp = (cpId: string) => {
    if (!workingSubject) return;
    const updated = syncSubjectFromCPs({
      ...workingSubject,
      cps: workingSubject.cps.filter((cp) => cp.id !== cpId),
    });
    commitDraftLocally(updated);
  };

  const handleAddTpUnderCp = (cpId: string) => {
    if (!workingSubject) return;
    const updated = syncSubjectFromCPs({
      ...workingSubject,
      cps: workingSubject.cps.map((cp) => {
        if (cp.id !== cpId) return cp;
        const nextIdx = cp.tps.length + 1;
        const newTp: TujuanPembelajaran = {
          id: `${cp.id}-tp-${Date.now()}`,
          kode: `TP ${nextIdx}`,
          deskripsi: '',
        };
        return { ...cp, tps: [...cp.tps, newTp] };
      }),
    });
    commitDraftLocally(updated);
  };

  const handleUpdateTpUnderCp = (
    cpId: string,
    tpId: string,
    field: 'kode' | 'deskripsi',
    value: string
  ) => {
    if (!workingSubject) return;
    const updated = syncSubjectFromCPs({
      ...workingSubject,
      cps: workingSubject.cps.map((cp) => {
        if (cp.id !== cpId) return cp;
        return {
          ...cp,
          tps: cp.tps.map((tp) => (tp.id === tpId ? { ...tp, [field]: value } : tp)),
        };
      }),
    });
    commitDraftLocally(updated);
  };

  const handleDeleteTpUnderCp = (cpId: string, tpId: string) => {
    if (!workingSubject) return;
    const updated = syncSubjectFromCPs({
      ...workingSubject,
      cps: workingSubject.cps.map((cp) => {
        if (cp.id !== cpId) return cp;
        return { ...cp, tps: cp.tps.filter((tp) => tp.id !== tpId) };
      }),
    });
    commitDraftLocally(updated);
  };

  const handleModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubject || !editingSubject.kode.trim() || !editingSubject.nama.trim()) {
      onNotify('Kode dan Nama Mata Pelajaran wajib diisi.', true);
      return;
    }
    const clean = syncSubjectFromCPs({
      ...editingSubject,
      kode: editingSubject.kode.trim().toUpperCase(),
      nama: editingSubject.nama.trim(),
    });
    onSaveSubject(clean, isNewModal, true);
    setEditingSubject(null);
  };

  const orderedClasses =
    classDefs.length > 0
      ? [...classDefs].sort((a, b) => a.urutan - b.urutan).map((c) => c.nama)
      : classes;
  const accessibleClasses = getAccessibleClassesForUser(orderedClasses, currentUser);

  return (
    <div className="space-y-6">
      {isLocked && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2.5 text-xs text-amber-900">
          <Lock className="w-4 h-4 text-amber-700 shrink-0" />
          <span>
            <strong>Pengisian CP & TP Dikunci:</strong> {lockStatus.reason}
          </span>
        </div>
      )}
      {/* Header Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold text-slate-900">
            Mata Pelajaran, Capaian Pembelajaran (CP) & Tujuan Pembelajaran (TP)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {isRestrictedGuru
              ? 'Mode Penugasan Terbatas: Anda hanya dapat melihat & mengelola CP serta TP untuk mata pelajaran dan kelas yang ditugaskan kepada Anda.'
              : 'Setiap kelas memiliki CP yang dapat ditambah dan disesuaikan per tingkatan. TP dikelola langsung di bawah CP yang dipilih.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={cpClassFilter}
            onChange={(e) => setCpClassFilter(e.target.value)}
            aria-label="Pilih Kelas untuk CP/TP"
            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 focus:border-emerald-700 focus:outline-none"
          >
            {accessibleClasses.map((cls) => (
              <option key={cls} value={cls}>
                {cls}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setScopeFilter('class')}
              className={`px-3 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                scopeFilter === 'class' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Mapel {cpClassFilter}
            </button>
            <button
              type="button"
              onClick={() => setScopeFilter('all')}
              className={`px-3 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                scopeFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Semua ({userScopedSubjects.length})
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleImportExcel}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => downloadCPTP_Template(userScopedSubjects, cpClassFilter, classDefs)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Template CP & TP
          </button>
          <button
            type="button"
            disabled={isLocked}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            Impor Excel CP & TP
          </button>

          {canCreateOrDelete && (
            <>
              <button
                type="button"
                onClick={() => setQuickEdit((v) => !v)}
                className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-medium whitespace-nowrap ${
                  quickEdit
                    ? 'border-emerald-700 bg-emerald-50 text-emerald-800'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                {quickEdit ? 'Selesai Edit Cepat' : 'Edit Cepat Tabel'}
              </button>
              <button
                type="button"
                onClick={handleAddPkbmPack}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-700" />+ Paket Pemberdayaan PKBM
              </button>
              <button
                type="button"
                onClick={openNewModal}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-700 text-xs font-medium text-white hover:bg-emerald-800 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah Mapel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Improvement #1: Per-Class CP & Nested TP Workspace */}
      {workingSubject && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70">
            <div className="flex items-center gap-2.5">
              <Layers className="w-4 h-4 text-emerald-700 shrink-0" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Struktur CP & TP Kelas {cpClassFilter} — {workingSubject.nama} ({workingSubject.kode})
                </h2>
                <p className="text-xs text-slate-500">
                  Pilih salah satu CP di sebelah kiri, edit CP/TP, lalu klik tombol Simpan Perubahan CP & TP.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {hasUnsavedCpTp && (
                <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-300 px-2.5 py-1 rounded-md">
                  Ada perubahan belum disimpan
                </span>
              )}
              <button
                type="button"
                onClick={() => downloadCPTP_Template([workingSubject], cpClassFilter, classDefs)}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Unduh Template Mapel Ini
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                Impor CP & TP
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={handleSaveCpTpChanges}
                className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-50 ${
                  hasUnsavedCpTp
                    ? 'bg-emerald-700 text-white hover:bg-emerald-800 shadow-xs'
                    : 'border border-emerald-700 bg-white text-emerald-800 hover:bg-emerald-50'
                }`}
              >
                <Save className="w-3.5 h-3.5" />
                Simpan Perubahan CP & TP
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={handleAddCpToActiveSubject}
                className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 shrink-0 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah CP untuk {cpClassFilter}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
            {/* Left Column: CP List for this Class / Tingkatan */}
            <div className="lg:col-span-5 p-4 space-y-2.5">
              <div className="text-xs font-semibold text-slate-700">
                Daftar Capaian Pembelajaran ({classCPs.length} CP untuk {cpClassFilter})
              </div>

              {classCPs.length === 0 ? (
                <div className="p-6 text-center border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 space-y-2">
                  <p>Belum ada CP khusus untuk {cpClassFilter}.</p>
                  <button
                    type="button"
                    onClick={handleAddCpToActiveSubject}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-emerald-700 text-white font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah CP Pertama
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {classCPs.map((cp) => {
                    const isSelected = activeCp?.id === cp.id;
                    const scopeLabel =
                      cp.kelasList && cp.kelasList.length > 0
                        ? `Khusus ${cp.kelasList.join(', ')}`
                        : cp.tingkatList && cp.tingkatList.length > 0
                          ? `Tingkat ${cp.tingkatList.join(', ')}`
                          : 'Semua Tingkatan';
                    return (
                      <div
                        key={cp.id}
                        onClick={() => setSelectedCpId(cp.id)}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-emerald-700 bg-emerald-50/70'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-xs font-bold text-emerald-800 shrink-0">
                              {cp.kode}
                            </span>
                            <span className="text-[11px] text-slate-500 truncate">
                              · {scopeLabel} · {cp.tps.length} TP
                            </span>
                          </div>
                          <ChevronRight
                            className={`w-4 h-4 shrink-0 ${
                              isSelected ? 'text-emerald-700' : 'text-slate-400'
                            }`}
                          />
                        </div>
                        <p className="text-xs text-slate-700 mt-1.5 line-clamp-2 leading-relaxed">
                          {cp.deskripsi || 'Belum ada deskripsi CP.'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Selected CP Editor + TPs Nested Underneath Selected CP */}
            <div className="lg:col-span-7 p-4 space-y-4">
              {!activeCp ? (
                <div className="h-full min-h-[180px] flex items-center justify-center text-xs text-slate-400">
                  Pilih atau tambahkan CP terlebih dahulu untuk mengelola TP di bawahnya.
                </div>
              ) : (
                <>
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900">
                        Detail & Cakupan Tingkatan CP Terpilih
                      </span>
                      {workingSubject.cps.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteCp(activeCp.id)}
                          className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Hapus CP
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">Kode CP</label>
                        <input
                          type="text"
                          value={activeCp.kode}
                          onChange={(e) => handleUpdateCp(activeCp.id, { kode: e.target.value })}
                          className="w-full h-8 rounded-md border border-slate-300 bg-white px-2.5 font-mono font-semibold text-slate-900"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block font-medium text-slate-700 mb-1">
                          Penyesuaian Tingkatan / Kelas CP
                        </label>
                        <select
                          value={
                            activeCp.kelasList && activeCp.kelasList.length > 0
                              ? 'class_only'
                              : activeCp.tingkatList && activeCp.tingkatList.length > 0
                                ? 'tingkat_only'
                                : 'all'
                          }
                          onChange={(e) => {
                            const mode = e.target.value;
                            if (mode === 'class_only') {
                              handleUpdateCp(activeCp.id, {
                                kelasList: [cpClassFilter],
                                tingkatList: activeTingkat ? [activeTingkat] : [],
                              });
                            } else if (mode === 'tingkat_only') {
                              handleUpdateCp(activeCp.id, {
                                kelasList: [],
                                tingkatList: activeTingkat ? [activeTingkat] : [7],
                              });
                            } else {
                              handleUpdateCp(activeCp.id, {
                                kelasList: [],
                                tingkatList: [],
                              });
                            }
                          }}
                          className="w-full h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-900"
                        >
                          <option value="class_only">Khusus Kelas {cpClassFilter}</option>
                          <option value="tingkat_only">
                            Semua Kelas Tingkat {activeTingkat ?? '-'}
                          </option>
                          <option value="all">Semua Tingkatan Mapel Ini</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Tingkatan Berlaku (1–12, klik untuk toggle tingkatan)
                      </label>
                      <div className="flex flex-wrap gap-1">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((t) => {
                          const checked = (activeCp.tingkatList || []).includes(t);
                          return (
                            <button
                              key={t}
                              type="button"
                              onClick={() => {
                                const cur = activeCp.tingkatList || [];
                                const next = cur.includes(t)
                                  ? cur.filter((x) => x !== t)
                                  : [...cur, t].sort((a, b) => a - b);
                                handleUpdateCp(activeCp.id, {
                                  tingkatList: next,
                                  kelasList: [],
                                });
                              }}
                              className={`w-7 h-7 rounded text-[11px] font-mono font-semibold border transition-colors ${
                                checked
                                  ? 'bg-emerald-700 text-white border-emerald-700'
                                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                              }`}
                            >
                              {t}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Rumusan Capaian Pembelajaran (CP)
                      </label>
                      <textarea
                        rows={2}
                        value={activeCp.deskripsi}
                        onChange={(e) => handleUpdateCp(activeCp.id, { deskripsi: e.target.value })}
                        placeholder="Tuliskan rumusan capaian pembelajaran untuk kelas/tingkatan ini..."
                        className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs leading-relaxed focus:border-emerald-700 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Nested TPs strictly underneath the selected CP */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-semibold text-slate-900">
                          Tujuan Pembelajaran (TP) di Bawah {activeCp.kode}
                        </h3>
                        <p className="text-[11px] text-slate-500">
                          TP ini terhubung langsung ke {activeCp.kode} dan otomatis digunakan untuk deskripsi rapor kelas {cpClassFilter}.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={isLocked}
                        onClick={() => handleAddTpUnderCp(activeCp.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-emerald-700 bg-emerald-50 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 shrink-0 disabled:opacity-50"
                      >
                        <Plus className="w-3.5 h-3.5" /> Tambah TP di {activeCp.kode}
                      </button>
                    </div>

                    <div className="space-y-2">
                      {activeCp.tps.length === 0 ? (
                        <div className="p-4 text-center border border-dashed border-slate-300 rounded-lg text-xs text-slate-500">
                          Belum ada TP di bawah {activeCp.kode}. Klik &ldquo;+ Tambah TP&rdquo; di atas.
                        </div>
                      ) : (
                        activeCp.tps.map((tp) => (
                          <div key={tp.id} className="flex items-start gap-2">
                            <input
                              type="text"
                              disabled={isLocked}
                              value={tp.kode}
                              onChange={(e) =>
                                handleUpdateTpUnderCp(activeCp.id, tp.id, 'kode', e.target.value)
                              }
                              className="w-20 h-9 rounded-lg border border-slate-300 px-2.5 text-xs font-mono shrink-0 focus:border-emerald-700 focus:outline-none disabled:bg-slate-100"
                            />
                            <input
                              type="text"
                              disabled={isLocked}
                              value={tp.deskripsi}
                              onChange={(e) =>
                                handleUpdateTpUnderCp(activeCp.id, tp.id, 'deskripsi', e.target.value)
                              }
                              placeholder="Deskripsi tujuan pembelajaran..."
                              className="flex-1 h-9 rounded-lg border border-slate-300 px-3 text-xs focus:border-emerald-700 focus:outline-none disabled:bg-slate-100"
                            />
                            {!isLocked && (
                              <button
                                type="button"
                                onClick={() => handleDeleteTpUnderCp(activeCp.id, tp.id)}
                                aria-label="Hapus TP"
                                className="h-9 px-2 text-slate-400 hover:text-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-500">
                        {hasUnsavedCpTp
                          ? 'Perubahan CP/TP belum tersimpan permanen. Klik Simpan untuk menyimpan.'
                          : 'Semua perubahan CP & TP tersimpan.'}
                      </span>
                      <button
                        type="button"
                        disabled={isLocked}
                        onClick={handleSaveCpTpChanges}
                        className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap"
                      >
                        <Save className="w-3.5 h-3.5" />
                        Simpan Perubahan CP & TP
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Subject List Table */}
      {displayedSubjects.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <BookOpen className="w-9 h-9 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-800">
            {isRestrictedGuru
              ? 'Belum ada mata pelajaran yang ditugaskan untuk Anda pada cakupan ini.'
              : 'Belum ada mata pelajaran'}
          </p>
          {canCreateOrDelete && (
            <button
              type="button"
              onClick={openNewModal}
              className="mt-3 px-4 py-2 rounded-lg bg-emerald-700 text-xs font-medium text-white"
            >
              Tambah Mata Pelajaran
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                <tr>
                  <th className="px-3 py-3 w-14 text-center">Urut</th>
                  <th className="px-3 py-3 w-28">Kode</th>
                  <th className="px-4 py-3 min-w-[220px]">Mata Pelajaran & Guru</th>
                  <th className="px-3 py-3 w-36">Kategori PKBM</th>
                  <th className="px-3 py-3 w-16 text-center">SKK</th>
                  <th className="px-4 py-3 min-w-[200px]">Cakupan / Status</th>
                  <th className="px-3 py-3 text-right">CP / TP ({cpClassFilter})</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {displayedSubjects.map((subj) => {
                  const isActive = subj.aktif !== false;
                  const isFocused = activeSubject?.id === subj.id;
                  const cpsForClass = getSubjectCPsForClass(subj, cpClassFilter, classDefs);
                  const tpCountForClass = cpsForClass.reduce((acc, c) => acc + c.tps.length, 0);

                  return (
                    <tr
                      key={subj.id}
                      onClick={() => setSelectedSubjectId(subj.id)}
                      className={`cursor-pointer transition-colors ${
                        isFocused
                          ? 'bg-emerald-50/70'
                          : isActive
                            ? 'hover:bg-slate-50/80'
                            : 'opacity-60 bg-slate-50/50'
                      }`}
                    >
                      <td className="px-3 py-3 text-center font-mono tabular-nums text-xs text-slate-500">
                        {quickEdit && canCreateOrDelete ? (
                          <input
                            type="number"
                            min={1}
                            value={subj.urutan}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              handleQuickPatch(subj.id, { urutan: Number(e.target.value) || 1 })
                            }
                            className="w-12 h-8 rounded border border-slate-300 text-center font-mono text-xs bg-white"
                          />
                        ) : (
                          subj.urutan
                        )}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs font-semibold text-slate-800">
                        {quickEdit && canCreateOrDelete ? (
                          <input
                            type="text"
                            value={subj.kode}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              handleQuickPatch(subj.id, { kode: e.target.value.toUpperCase() })
                            }
                            className="w-24 h-8 rounded border border-slate-300 px-2 font-mono text-xs bg-white"
                          />
                        ) : (
                          subj.kode
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {quickEdit && canCreateOrDelete ? (
                          <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={subj.nama}
                              onChange={(e) => handleQuickPatch(subj.id, { nama: e.target.value })}
                              className="w-full h-8 rounded border border-slate-300 px-2 text-xs font-medium bg-white"
                            />
                            <input
                              type="text"
                              value={subj.guruPengampu}
                              placeholder="Nama Guru / Tutor Pengampu"
                              onChange={(e) =>
                                handleQuickPatch(subj.id, { guruPengampu: e.target.value })
                              }
                              className="w-full h-7 rounded border border-slate-300 px-2 text-[11px] bg-white"
                            />
                          </div>
                        ) : (
                          <>
                            <div className="font-medium text-slate-900">{subj.nama}</div>
                            <div className="text-xs text-slate-500">{subj.guruPengampu || '-'}</div>
                          </>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-700">
                        {quickEdit && canCreateOrDelete ? (
                          <select
                            value={
                              subj.kategoriPkbm ||
                              (subj.kelompok.startsWith('A') ? 'Umum / Wajib' : 'Keterampilan')
                            }
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              handleQuickPatch(subj.id, { kategoriPkbm: e.target.value })
                            }
                            className="w-full h-8 rounded border border-slate-300 bg-white px-1.5 text-xs"
                          >
                            {PKBM_KATEGORI_LIST.map((k) => (
                              <option key={k} value={k}>
                                {k}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span>
                            {subj.kategoriPkbm ||
                              (subj.kelompok.startsWith('A') ? 'Umum / Wajib' : 'Keterampilan')}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center font-mono text-xs text-slate-700">
                        {quickEdit && canCreateOrDelete ? (
                          <input
                            type="number"
                            min={1}
                            max={12}
                            value={subj.skk ?? 2}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              handleQuickPatch(subj.id, {
                                skk: Math.max(1, Number(e.target.value) || 2),
                              })
                            }
                            className="w-12 h-8 rounded border border-slate-300 text-center font-mono text-xs bg-white"
                          />
                        ) : (
                          subj.skk ?? 2
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <div className="font-mono text-[11px]">{formatCoverage(subj)}</div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[11px] text-slate-400">
                            {(subj.jurusanList || ['Umum']).join('/')}
                          </span>
                          {canCreateOrDelete && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleQuickPatch(subj.id, { aktif: !isActive });
                              }}
                              className={`text-[11px] font-semibold underline ${
                                isActive ? 'text-emerald-700' : 'text-amber-700'
                              }`}
                            >
                              {isActive ? 'Aktif' : 'Nonaktif'}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                        {cpsForClass.length} CP · {tpCountForClass} TP
                      </td>
                      <td
                        className="px-4 py-3 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setIsNewModal(false);
                            setEditingSubject(JSON.parse(JSON.stringify(subj)));
                          }}
                          title={`Edit detail ${subj.nama}`}
                          className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100 inline-flex"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        {canCreateOrDelete && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleDuplicate(subj)}
                              title={`Duplikat ${subj.nama}`}
                              className="p-1.5 text-slate-500 hover:text-emerald-700 rounded-md hover:bg-emerald-50 inline-flex ml-0.5"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteSubject(subj.id)}
                              title={`Hapus ${subj.nama}`}
                              className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50 inline-flex ml-0.5"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Subject Edit Modal */}
      {editingSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-base font-semibold text-slate-900">
                {isNewModal ? 'Tambah Mata Pelajaran' : `Edit Mapel: ${editingSubject.nama}`}
              </h2>
              <button
                type="button"
                onClick={() => setEditingSubject(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleModalSubmit} className="p-6 space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kode Mapel *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!canCreateOrDelete}
                    value={editingSubject.kode}
                    onChange={(e) =>
                      setEditingSubject({
                        ...editingSubject,
                        kode: e.target.value.toUpperCase(),
                      })
                    }
                    placeholder="Mis. MAT / KTR"
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono focus:border-emerald-700 focus:outline-none disabled:bg-slate-100"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nama Mata Pelajaran *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!canCreateOrDelete}
                    value={editingSubject.nama}
                    onChange={(e) =>
                      setEditingSubject({ ...editingSubject, nama: e.target.value })
                    }
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 focus:border-emerald-700 focus:outline-none disabled:bg-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Guru / Tutor Pengampu
                  </label>
                  <input
                    type="text"
                    value={editingSubject.guruPengampu}
                    onChange={(e) =>
                      setEditingSubject({ ...editingSubject, guruPengampu: e.target.value })
                    }
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kategori PKBM
                  </label>
                  <select
                    value={editingSubject.kategoriPkbm}
                    onChange={(e) =>
                      setEditingSubject({ ...editingSubject, kategoriPkbm: e.target.value })
                    }
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                  >
                    {PKBM_KATEGORI_LIST.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">SKK / Jam</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={editingSubject.skk}
                    onChange={(e) =>
                      setEditingSubject({
                        ...editingSubject,
                        skk: Math.max(1, Number(e.target.value) || 2),
                      })
                    }
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono"
                  />
                </div>
              </div>

              {canCreateOrDelete && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Cakupan Tingkatan Mapel (1–12)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((t) => {
                      const active = editingSubject.tingkatList.includes(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => {
                            const next = active
                              ? editingSubject.tingkatList.filter((x) => x !== t)
                              : [...editingSubject.tingkatList, t].sort((a, b) => a - b);
                            setEditingSubject({ ...editingSubject, tingkatList: next, kelasList: [] });
                          }}
                          className={`px-2.5 py-1 rounded-md border text-xs font-mono font-semibold ${
                            active
                              ? 'bg-emerald-700 text-white border-emerald-700'
                              : 'bg-white text-slate-600 border-slate-300'
                          }`}
                        >
                          Kelas {t}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-900">
                      Daftar CP & TP Tersimpan ({editingSubject.cps.length} CP)
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Setiap CP memiliki daftar TP tepat di bawahnya.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newCpId = `${editingSubject.id}-cp-${Date.now()}`;
                      setEditingSubject({
                        ...editingSubject,
                        cps: [
                          ...editingSubject.cps,
                          {
                            id: newCpId,
                            kode: `CP ${editingSubject.cps.length + 1}`,
                            deskripsi: '',
                            tingkatList: activeTingkat ? [activeTingkat] : [],
                            kelasList: [],
                            tps: [{ id: `${newCpId}-tp1`, kode: 'TP 1', deskripsi: '' }],
                          },
                        ],
                      });
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    + Tambah CP
                  </button>
                </div>

                <div className="space-y-3">
                  {editingSubject.cps.map((cp) => (
                    <div
                      key={cp.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={cp.kode}
                          onChange={(e) =>
                            setEditingSubject({
                              ...editingSubject,
                              cps: editingSubject.cps.map((x) =>
                                x.id === cp.id ? { ...x, kode: e.target.value } : x
                              ),
                            })
                          }
                          className="w-28 h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-mono font-semibold"
                        />
                        <input
                          type="text"
                          value={cp.deskripsi}
                          placeholder="Deskripsi Capaian Pembelajaran..."
                          onChange={(e) =>
                            setEditingSubject({
                              ...editingSubject,
                              cps: editingSubject.cps.map((x) =>
                                x.id === cp.id ? { ...x, deskripsi: e.target.value } : x
                              ),
                            })
                          }
                          className="flex-1 h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setEditingSubject({
                              ...editingSubject,
                              cps: editingSubject.cps.filter((x) => x.id !== cp.id),
                            })
                          }
                          className="text-slate-400 hover:text-red-600 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-medium text-slate-600">
                          <span>Tujuan Pembelajaran (TP) di bawah {cp.kode}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setEditingSubject({
                                ...editingSubject,
                                cps: editingSubject.cps.map((x) =>
                                  x.id === cp.id
                                    ? {
                                        ...x,
                                        tps: [
                                          ...x.tps,
                                          {
                                            id: `${cp.id}-tp-${Date.now()}`,
                                            kode: `TP ${x.tps.length + 1}`,
                                            deskripsi: '',
                                          },
                                        ],
                                      }
                                    : x
                                ),
                              })
                            }
                            className="text-emerald-700 hover:underline font-semibold"
                          >
                            + Tambah TP
                          </button>
                        </div>
                        {cp.tps.map((tp) => (
                          <div key={tp.id} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={tp.kode}
                              onChange={(e) =>
                                setEditingSubject({
                                  ...editingSubject,
                                  cps: editingSubject.cps.map((x) =>
                                    x.id === cp.id
                                      ? {
                                          ...x,
                                          tps: x.tps.map((t) =>
                                            t.id === tp.id ? { ...t, kode: e.target.value } : t
                                          ),
                                        }
                                      : x
                                  ),
                                })
                              }
                              className="w-16 h-8 rounded border border-slate-300 bg-white px-2 text-xs font-mono"
                            />
                            <input
                              type="text"
                              value={tp.deskripsi}
                              placeholder="Deskripsi TP..."
                              onChange={(e) =>
                                setEditingSubject({
                                  ...editingSubject,
                                  cps: editingSubject.cps.map((x) =>
                                    x.id === cp.id
                                      ? {
                                          ...x,
                                          tps: x.tps.map((t) =>
                                            t.id === tp.id
                                              ? { ...t, deskripsi: e.target.value }
                                              : t
                                          ),
                                        }
                                      : x
                                  ),
                                })
                              }
                              className="flex-1 h-8 rounded border border-slate-300 bg-white px-2.5 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setEditingSubject({
                                  ...editingSubject,
                                  cps: editingSubject.cps.map((x) =>
                                    x.id === cp.id
                                      ? { ...x, tps: x.tps.filter((t) => t.id !== tp.id) }
                                      : x
                                  ),
                                })
                              }
                              className="text-slate-400 hover:text-red-600 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingSubject(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isLocked}
                  className="px-4 py-2 rounded-lg bg-emerald-700 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  Simpan Mata Pelajaran
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
