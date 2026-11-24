import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  BookOpen,
  Download,
  ExternalLink,
  FolderKanban,
  History,
  Lock,
  MessageSquare,
  Plus,
  QrCode,
  Search,
  Trash2,
  User,
} from 'lucide-react';
import QRCode from 'qrcode';
import { AppState, PortfolioItem, Student, UserAccount } from '../types';
import {
  buildStudentCardVerifyUrl,
  calculateStudentSubjectGrade,
  formatTanggalID,
  getAccessibleClassesForUser,
  getSubjectsForClass,
  gradeKey,
  isInputLockedForUser,
  metaKey,
  PREDIKAT_LABELS,
  validatePortfolioUrl,
} from '../utils/academic';
import { generateRekamDidikPDF } from '../utils/pdf';

interface RekamDidikViewProps {
  state: AppState;
  currentUser: UserAccount;
  selectedClass: string;
  onUpdatePortfolio: (studentId: string, folderUrl: string, items: PortfolioItem[]) => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

type DossierTab = 'linimasa' | 'nilai' | 'bk' | 'portofolio' | 'ortu';

export const RekamDidikView: React.FC<RekamDidikViewProps> = ({
  state,
  currentUser,
  selectedClass,
  onUpdatePortfolio,
  onNotify,
}) => {
  const isAdmin = currentUser.role === 'admin';
  const orderedClasses = useMemo(
    () =>
      state.classDefs.length > 0
        ? [...state.classDefs].sort((a, b) => a.urutan - b.urutan).map((c) => c.nama)
        : state.classes,
    [state.classDefs, state.classes]
  );
  const accessibleClasses = useMemo(
    () => getAccessibleClassesForUser(orderedClasses, currentUser),
    [orderedClasses, currentUser]
  );

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | Student['status']>('ALL');
  const [classFilter, setClassFilter] = useState<string>(isAdmin ? 'ALL' : selectedClass);
  const [activeTab, setActiveTab] = useState<DossierTab>('linimasa');
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    if (!isAdmin && selectedClass) {
      setClassFilter(selectedClass);
    }
  }, [isAdmin, selectedClass]);

  const allAllowedStudents = useMemo(() => {
    return state.students
      .filter((s) => isAdmin || accessibleClasses.includes(s.kelas))
      .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  }, [state.students, isAdmin, accessibleClasses]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allAllowedStudents.filter((s) => {
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
      if (classFilter !== 'ALL' && s.kelas !== classFilter) return false;
      if (!q) return true;
      return (
        s.nama.toLowerCase().includes(q) ||
        s.nis.toLowerCase().includes(q) ||
        (s.nisn || '').toLowerCase().includes(q)
      );
    });
  }, [allAllowedStudents, search, statusFilter, classFilter]);

  const [selectedId, setSelectedId] = useState(filteredStudents[0]?.id || '');
  useEffect(() => {
    if (filteredStudents.length > 0 && !filteredStudents.some((s) => s.id === selectedId)) {
      setSelectedId(filteredStudents[0].id);
    }
  }, [filteredStudents, selectedId]);

  const activeStudent =
    filteredStudents.find((s) => s.id === selectedId) || filteredStudents[0] || null;

  // Portfolio editing state
  const [folderUrl, setFolderUrl] = useState('');
  const [qrPortfolio, setQrPortfolio] = useState('');
  const [qrCardVerify, setQrCardVerify] = useState('');
  const [judul, setJudul] = useState('');
  const [kategori, setKategori] = useState('Proyek Karya');
  const [itemUrl, setItemUrl] = useState('');
  const [catatan, setCatatan] = useState('');

  useEffect(() => {
    if (!activeStudent) return;
    setFolderUrl(activeStudent.portfolioFolderUrl || '');
    const qrText =
      activeStudent.portfolioFolderUrl?.trim() ||
      `SIM-RAPOR-PORTFOLIO|${activeStudent.nis}|${activeStudent.nama}|${activeStudent.kelas}`;
    QRCode.toDataURL(qrText, { margin: 1, width: 160 })
      .then(setQrPortfolio)
      .catch(() => setQrPortfolio(''));
    QRCode.toDataURL(buildStudentCardVerifyUrl(activeStudent.id, state.schoolId), {
      margin: 1,
      width: 160,
    })
      .then(setQrCardVerify)
      .catch(() => setQrCardVerify(''));
  }, [activeStudent, state.schoolId]);

  const lockInfo = isInputLockedForUser(state.settings, state.academicYears, currentUser);
  const canEditPortfolio =
    !lockInfo.locked &&
    activeStudent !== null &&
    (isAdmin ||
      (currentUser.role === 'walikelas' && currentUser.waliKelasTarget === activeStudent.kelas));

  const statusCounts = useMemo(() => {
    return {
      total: allAllowedStudents.length,
      aktif: allAllowedStudents.filter((s) => s.status === 'Aktif').length,
      lulus: allAllowedStudents.filter((s) => s.status === 'Lulus').length,
      pindah: allAllowedStudents.filter((s) => s.status === 'Pindah').length,
    };
  }, [allAllowedStudents]);

  const handleSaveFolder = () => {
    if (!activeStudent || !canEditPortfolio) return;
    if (folderUrl.trim() && !validatePortfolioUrl(folderUrl)) {
      onNotify('URL folder portofolio harus diawali https:// atau http://', true);
      return;
    }
    onUpdatePortfolio(activeStudent.id, folderUrl.trim(), activeStudent.portfolioItems || []);
    onNotify(`Tautan portofolio ${activeStudent.nama} disimpan.`);
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStudent || !canEditPortfolio) return;
    if (!judul.trim()) {
      onNotify('Judul karya portofolio wajib diisi.', true);
      return;
    }
    const cleanUrl = itemUrl.trim() ? validatePortfolioUrl(itemUrl) : '';
    if (itemUrl.trim() && !cleanUrl) {
      onNotify('URL karya harus menggunakan http:// atau https://', true);
      return;
    }
    const newItem: PortfolioItem = {
      id: `pf-${Date.now()}`,
      judul: judul.trim(),
      kategori,
      url: cleanUrl || folderUrl.trim(),
      tanggal: new Date().toISOString().slice(0, 10),
      catatan: catatan.trim(),
    };
    onUpdatePortfolio(activeStudent.id, folderUrl.trim(), [
      newItem,
      ...(activeStudent.portfolioItems || []),
    ]);
    setJudul('');
    setItemUrl('');
    setCatatan('');
    onNotify('Item portofolio karya ditambahkan.');
  };

  const handleDeleteItem = (itemId: string) => {
    if (!activeStudent || !canEditPortfolio) return;
    onUpdatePortfolio(
      activeStudent.id,
      folderUrl.trim(),
      (activeStudent.portfolioItems || []).filter((it) => it.id !== itemId)
    );
  };

  const handleDownloadPDF = async () => {
    if (!activeStudent) return;
    setPdfBusy(true);
    try {
      const doc = await generateRekamDidikPDF(activeStudent, state);
      doc.save(`Rekam_Didik_${activeStudent.nama.replace(/\s+/g, '_')}_${activeStudent.nis}.pdf`);
      onNotify(`Dokumen Rekam Didik ${activeStudent.nama} berhasil diunduh.`);
    } catch {
      onNotify('Gagal menyusun PDF Rekam Didik.', true);
    } finally {
      setPdfBusy(false);
    }
  };

  const stuSubjects = activeStudent
    ? getSubjectsForClass(
        state.subjects,
        activeStudent.kelas,
        state.classDefs,
        activeStudent.jurusan || 'Umum'
      )
    : [];
  const stuMutations = activeStudent
    ? state.mutations.filter((m) => m.studentId === activeStudent.id)
    : [];
  const stuBkNotes = activeStudent
    ? state.counselingNotes.filter((n) => n.studentId === activeStudent.id)
    : [];
  const stuProfilProjs = activeStudent
    ? state.p5Projects.filter((p) => p.studentId === activeStudent.id)
    : [];
  const stuLogbooks = activeStudent
    ? state.logbookEntries.filter((l) => l.studentId === activeStudent.id)
    : [];
  const stuFeedbacks = activeStudent
    ? (state.parentFeedbacks || []).filter((f) => f.studentId === activeStudent.id)
    : [];

  return (
    <div className="space-y-6">
      {/* Header & Directory Filter */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-slate-900">
              Direktori & Rekam Didik Terpadu (Seluruh Riwayat Peserta Didik)
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Menampilkan seluruh peserta didik sejak awal masuk ke database (Aktif, Lulus, dan Pindah), linimasa pendidikan, nilai lintas semester, BK, portofolio, dan ekspor PDF.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums">
            <span className="text-slate-700">
              Total Database: <strong className="text-slate-900">{statusCounts.total}</strong>
            </span>
            <span className="text-emerald-700">
              Aktif: <strong>{statusCounts.aktif}</strong>
            </span>
            <span className="text-sky-700">
              Lulus: <strong>{statusCounts.lulus}</strong>
            </span>
            <span className="text-amber-700">
              Pindah: <strong>{statusCounts.pindah}</strong>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
          <div className="sm:col-span-5 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama peserta didik, NIS, atau NISN..."
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-300 text-xs focus:border-emerald-700 focus:outline-none"
            />
          </div>
          <div className="sm:col-span-4">
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-900"
            >
              {isAdmin && <option value="ALL">Semua Kelas ({allAllowedStudents.length})</option>}
              {(isAdmin ? orderedClasses : accessibleClasses).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | Student['status'])}
              className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-900"
            >
              <option value="ALL">Semua Status (Aktif, Lulus, Pindah)</option>
              <option value="Aktif">Aktif</option>
              <option value="Lulus">Lulus</option>
              <option value="Pindah">Pindah</option>
            </select>
          </div>
        </div>
      </div>

      {lockInfo.locked && (
        <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50 flex items-center gap-2.5 text-xs text-amber-900">
          <Lock className="w-4 h-4 text-amber-700 shrink-0" />
          <span>{lockInfo.reason} Perubahan portofolio dinonaktifkan sementara.</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Directory List */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-900">
              Daftar Peserta Didik ({filteredStudents.length})
            </span>
          </div>
          <div className="max-h-[620px] overflow-y-auto divide-y divide-slate-100">
            {filteredStudents.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Tidak ada peserta didik sesuai filter pencarian.
              </div>
            ) : (
              filteredStudents.map((stu) => {
                const active = activeStudent?.id === stu.id;
                const statusColor =
                  stu.status === 'Aktif'
                    ? 'text-emerald-700'
                    : stu.status === 'Lulus'
                      ? 'text-sky-700'
                      : 'text-amber-700';
                return (
                  <button
                    key={stu.id}
                    type="button"
                    onClick={() => setSelectedId(stu.id)}
                    className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 transition-colors ${
                      active ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                        {stu.fotoDataUrl ? (
                          <img
                            src={stu.fotoDataUrl}
                            alt={stu.nama}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 truncate">
                          {stu.nama}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 truncate">
                          {stu.nis} · {stu.kelas}
                        </div>
                      </div>
                    </div>
                    <span className={`text-[11px] font-semibold whitespace-nowrap shrink-0 ${statusColor}`}>
                      {stu.status}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Full Dossier */}
        <div className="lg:col-span-8 space-y-4">
          {!activeStudent ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-xs text-slate-500">
              Pilih peserta didik di sebelah kiri untuk membuka Rekam Didik lengkap.
            </div>
          ) : (
            <>
              {/* Student Dossier Header */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-20 rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                    {activeStudent.fotoDataUrl ? (
                      <img
                        src={activeStudent.fotoDataUrl}
                        alt={activeStudent.nama}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User className="w-7 h-7 text-slate-400" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-900">{activeStudent.nama}</h2>
                      <span
                        className={`text-xs font-semibold ${
                          activeStudent.status === 'Aktif'
                            ? 'text-emerald-700'
                            : activeStudent.status === 'Lulus'
                              ? 'text-sky-700'
                              : 'text-amber-700'
                        }`}
                      >
                        · Status: {activeStudent.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 font-mono">
                      NIS {activeStudent.nis} · NISN {activeStudent.nisn || '-'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {activeStudent.kelas} ({activeStudent.fase}) ·{' '}
                      {activeStudent.jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan'} · Wali:{' '}
                      {activeStudent.namaWali || activeStudent.namaAyah || '-'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={pdfBusy}
                  onClick={handleDownloadPDF}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  {pdfBusy ? 'Menyusun PDF...' : 'Unduh PDF Rekam Didik'}
                </button>
              </div>

              {/* Dossier Tabs */}
              <div className="bg-white border border-slate-200 rounded-xl p-1.5 flex flex-wrap gap-1 text-xs">
                {(
                  [
                    { id: 'linimasa', label: 'Linimasa & Biodata', icon: History },
                    { id: 'nilai', label: 'Nilai Lintas Semester', icon: BookOpen },
                    { id: 'bk', label: 'Catatan BK & Profil Lulusan', icon: Award },
                    { id: 'portofolio', label: 'Penghubung & Portofolio', icon: FolderKanban },
                    { id: 'ortu', label: `Tanggapan Ortu (${stuFeedbacks.length})`, icon: MessageSquare },
                  ] as const
                ).map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-medium whitespace-nowrap shrink-0 transition-colors ${
                        active
                          ? 'bg-emerald-700 text-white'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Tab Content */}
              {activeTab === 'linimasa' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 text-xs">
                  <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-2">
                      Biodata Lengkap Peserta Didik
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2.5 gap-x-4">
                      <div>
                        <span className="text-slate-500">Tempat, Tgl Lahir:</span>
                        <div className="font-medium text-slate-900">
                          {activeStudent.tempatLahir || '-'},{' '}
                          {formatTanggalID(activeStudent.tanggalLahir)}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Agama:</span>
                        <div className="font-medium text-slate-900">{activeStudent.agama || '-'}</div>
                      </div>
                      <div>
                        <span className="text-slate-500">Pendidikan Sebelumnya:</span>
                        <div className="font-medium text-slate-900">
                          {activeStudent.pendidikanSebelumnya || '-'}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Tanggal Registrasi Database:</span>
                        <div className="font-medium text-slate-900 font-mono">
                          {formatTanggalID(activeStudent.createdAt?.slice(0, 10))}
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-slate-500">Alamat Lengkap:</span>
                        <div className="font-medium text-slate-900">{activeStudent.alamat || '-'}</div>
                      </div>
                      <div>
                        <span className="text-slate-500">Orang Tua (Ayah / Ibu):</span>
                        <div className="font-medium text-slate-900">
                          {activeStudent.namaAyah || '-'} / {activeStudent.namaIbu || '-'}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Wali & Kontak:</span>
                        <div className="font-medium text-slate-900">
                          {activeStudent.namaWali || '-'} ({activeStudent.noTelpWali || '-'})
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-2">
                      QR Keaktifan Kartu Pelajar
                    </h3>
                    <div className="flex items-center gap-4">
                      {qrCardVerify ? (
                        <img
                          src={qrCardVerify}
                          alt="QR Keaktifan"
                          className="w-24 h-24 rounded-lg border border-slate-200 p-1 bg-white"
                        />
                      ) : (
                        <QrCode className="w-16 h-16 text-slate-300" />
                      )}
                      <div className="space-y-1">
                        <div className="font-semibold text-slate-900">
                          Sinkronisasi Status Mutasi
                        </div>
                        <p className="text-slate-500 leading-relaxed">
                          Scan QR pada kartu pelajar menampilkan status terkini:{' '}
                          <strong
                            className={
                              activeStudent.status === 'Aktif' ? 'text-emerald-700' : 'text-red-700'
                            }
                          >
                            {activeStudent.status.toUpperCase()}
                          </strong>
                          .
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-12 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-2">
                      Linimasa Pendidikan, Kenaikan Kelas & Mutasi
                    </h3>
                    <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                      <div className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-900">
                            Pendaftaran Awal Peserta Didik
                          </div>
                          <div className="text-slate-600">
                            {activeStudent.awalMasukNote ||
                              `Terdaftar pertama kali pada ${activeStudent.kelas}`}
                          </div>
                        </div>
                        <span className="font-mono text-slate-500 shrink-0">
                          {formatTanggalID(activeStudent.createdAt?.slice(0, 10))}
                        </span>
                      </div>
                      {stuMutations.map((m) => (
                        <div
                          key={m.id}
                          className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div>
                            <div className="font-semibold text-slate-900">
                              Mutasi {m.jenis} — {m.sekolahAsalTujuan}
                            </div>
                            <div className="text-slate-600">
                              No. Surat: {m.nomorSurat || '-'} · Alasan: {m.alasan || '-'}
                            </div>
                          </div>
                          <span className="font-mono text-slate-500 shrink-0">
                            {formatTanggalID(m.tanggal)} ({m.tahunAjaran})
                          </span>
                        </div>
                      ))}
                      {state.archives.map((arc) => {
                        const prevRec = arc.students.find((s) => s.id === activeStudent.id);
                        if (!prevRec) return null;
                        return (
                          <div
                            key={arc.id}
                            className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                          >
                            <div>
                              <div className="font-semibold text-slate-900">
                                Arsip Tahun Ajaran {arc.tahunAjaran}
                              </div>
                              <div className="text-slate-600">
                                Tercatat pada {prevRec.kelas} · Status akhir: {prevRec.status}
                              </div>
                            </div>
                            <span className="font-mono text-slate-500 shrink-0">
                              {formatTanggalID(arc.archivedAt.slice(0, 10))}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'nilai' && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden text-xs">
                  <div className="px-5 py-4 border-b border-slate-200">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Rekap Nilai Lintas Semester — TA {state.settings.tahunAjaran}
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <tr>
                          <th className="px-4 py-3 font-mono">Kode</th>
                          <th className="px-4 py-3">Mata Pelajaran</th>
                          <th className="px-3 py-3 text-center font-mono">Semester 1 (Ganjil)</th>
                          <th className="px-3 py-3 text-center font-mono">Semester 2 (Genap)</th>
                          <th className="px-4 py-3">Catatan Guru Mapel (Sem. Aktif)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {stuSubjects.map((subj) => {
                          const e1 = state.grades[gradeKey(activeStudent.id, subj.id, '1')];
                          const e2 = state.grades[gradeKey(activeStudent.id, subj.id, '2')];
                          const c1 = calculateStudentSubjectGrade(
                            e1,
                            subj,
                            state.settings,
                            activeStudent.kelas,
                            state.classDefs
                          );
                          const c2 = calculateStudentSubjectGrade(
                            e2,
                            subj,
                            state.settings,
                            activeStudent.kelas,
                            state.classDefs
                          );
                          const activeEntry = state.settings.semester === '1' ? e1 : e2;
                          return (
                            <tr key={subj.id}>
                              <td className="px-4 py-3 font-mono text-slate-500">{subj.kode}</td>
                              <td className="px-4 py-3 font-semibold text-slate-900">
                                {subj.nama}
                              </td>
                              <td className="px-3 py-3 text-center font-mono">
                                {c1.nilaiAkhir !== null ? (
                                  <span className="font-bold text-slate-900">
                                    {c1.nilaiAkhir} ({c1.predikat})
                                  </span>
                                ) : (
                                  '-'
                                )}
                              </td>
                              <td className="px-3 py-3 text-center font-mono">
                                {c2.nilaiAkhir !== null ? (
                                  <span className="font-bold text-slate-900">
                                    {c2.nilaiAkhir} ({c2.predikat})
                                  </span>
                                ) : (
                                  '-'
                                )}
                              </td>
                              <td className="px-4 py-3 text-slate-600">
                                {activeEntry?.catatanGuru || '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'bk' && (
                <div className="space-y-5 text-xs">
                  <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-2">
                      Projek Penguatan Profil Lulusan (8 Dimensi Profil Lulusan)
                    </h3>
                    {stuProfilProjs.length === 0 ? (
                      <p className="text-slate-500">
                        Belum ada data Projek Penguatan Profil Lulusan untuk siswa ini.
                      </p>
                    ) : (
                      stuProfilProjs.map((proj) => (
                        <div
                          key={proj.id}
                          className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-2"
                        >
                          <div className="font-semibold text-slate-900">
                            Semester {proj.semester} · {proj.tema} — {proj.judulProjek}
                          </div>
                          {proj.deskripsi && <p className="text-slate-600">{proj.deskripsi}</p>}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                            {proj.dimensi.map((d, i) => (
                              <div key={i} className="text-slate-700">
                                • {d.profil}:{' '}
                                <strong className="text-emerald-800">
                                  {d.capaian} ({PREDIKAT_LABELS[d.capaian] || d.capaian})
                                </strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-2">
                      Catatan Bimbingan Konseling (BK) & Ketidakhadiran
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2">
                      {(['1', '2'] as const).map((sem) => {
                        const m = state.reportMeta[metaKey(activeStudent.id, sem)];
                        return (
                          <div
                            key={sem}
                            className="p-3 rounded-lg border border-slate-200 bg-slate-50"
                          >
                            <div className="font-semibold text-slate-800">
                              Semester {sem} ({sem === '1' ? 'Ganjil' : 'Genap'})
                            </div>
                            <div className="font-mono text-slate-600 mt-1">
                              Sakit: {m?.absensi.sakit ?? 0} · Izin: {m?.absensi.izin ?? 0} · Alpha:{' '}
                              {m?.absensi.alpha ?? 0}
                            </div>
                            {m?.ekskul && m.ekskul.length > 0 && (
                              <div className="mt-1 text-slate-600">
                                Ekskul: {m.ekskul.map((e) => `${e.nama} (${e.predikat})`).join(', ')}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {stuBkNotes.length === 0 ? (
                      <p className="text-slate-500">Belum ada catatan layanan BK.</p>
                    ) : (
                      <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                        {stuBkNotes.map((n) => (
                          <div key={n.id} className="p-3.5 space-y-1">
                            <div className="font-semibold text-slate-900">
                              {n.topik}{' '}
                              <span className="font-normal text-slate-500">
                                · {n.kategori} · {formatTanggalID(n.tanggal)} · Konselor:{' '}
                                {n.konselorNama}
                              </span>
                            </div>
                            <p className="text-slate-700">{n.uraianMasalah}</p>
                            {n.layananTindakLanjut && (
                              <p className="text-slate-600">
                                Tindak Lanjut: {n.layananTindakLanjut}
                              </p>
                            )}
                            {n.rekomendasiOrtu && (
                              <p className="text-emerald-800 font-medium">
                                Rekomendasi Ortu: {n.rekomendasiOrtu}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'portofolio' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 text-xs">
                  <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
                      <FolderKanban className="w-4 h-4 text-emerald-700" />
                      <h3 className="text-sm font-semibold text-slate-900">
                        Folder Google Drive & QR Portofolio
                      </h3>
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700 mb-1">
                        Tautan Folder Google Drive Portofolio
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          disabled={!canEditPortfolio}
                          value={folderUrl}
                          onChange={(e) => setFolderUrl(e.target.value)}
                          placeholder="https://drive.google.com/drive/folders/..."
                          className="flex-1 h-9 rounded-lg border border-slate-300 px-3 font-mono text-xs disabled:bg-slate-100"
                        />
                        <button
                          type="button"
                          disabled={!canEditPortfolio}
                          onClick={handleSaveFolder}
                          className="h-9 px-3.5 rounded-lg bg-emerald-700 text-white font-semibold hover:bg-emerald-800 disabled:opacity-50"
                        >
                          Simpan
                        </button>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center gap-3.5">
                      {qrPortfolio ? (
                        <img
                          src={qrPortfolio}
                          alt="QR Portofolio"
                          className="w-20 h-20 rounded-lg border border-slate-200 bg-white p-1"
                        />
                      ) : (
                        <QrCode className="w-16 h-16 text-slate-300" />
                      )}
                      <div className="space-y-1">
                        <div className="font-semibold text-slate-900">QR Portofolio Rapor</div>
                        <p className="text-slate-500">Otomatis disematkan di Rapor PDF siswa.</p>
                        {validatePortfolioUrl(folderUrl) && (
                          <a
                            href={validatePortfolioUrl(folderUrl)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-emerald-700 font-semibold hover:underline"
                          >
                            Buka Folder <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200 space-y-2">
                      <div className="font-semibold text-slate-900">
                        Log Buku Penghubung ({stuLogbooks.length})
                      </div>
                      {stuLogbooks.length === 0 ? (
                        <p className="text-slate-500">Belum ada catatan di Buku Penghubung.</p>
                      ) : (
                        <div className="space-y-2 max-h-56 overflow-y-auto">
                          {stuLogbooks.map((l) => (
                            <div
                              key={l.id}
                              className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 space-y-0.5"
                            >
                              <div className="font-semibold text-slate-900">
                                {l.judul} <span className="font-normal text-slate-500">({l.status})</span>
                              </div>
                              <p className="text-slate-600">{l.pesan}</p>
                              <div className="text-[11px] text-slate-400">
                                Oleh {l.authorName} · {l.replies.length} balasan
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                    <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-2.5">
                      Catatan Karya & Portofolio Peserta Didik
                    </h3>

                    {canEditPortfolio && (
                      <form onSubmit={handleAddItem} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                        <input
                          type="text"
                          value={judul}
                          onChange={(e) => setJudul(e.target.value)}
                          placeholder="Judul karya / proyek *"
                          className="sm:col-span-5 h-9 rounded-lg border border-slate-300 px-3"
                        />
                        <select
                          value={kategori}
                          onChange={(e) => setKategori(e.target.value)}
                          className="sm:col-span-3 h-9 rounded-lg border border-slate-300 bg-white px-2.5"
                        >
                          <option value="Proyek Karya">Proyek Karya</option>
                          <option value="Projek Profil Lulusan">Projek Profil Lulusan</option>
                          <option value="Karya Tulis">Karya Tulis</option>
                          <option value="Sertifikat">Sertifikat</option>
                        </select>
                        <input
                          type="url"
                          value={itemUrl}
                          onChange={(e) => setItemUrl(e.target.value)}
                          placeholder="URL Drive (opsional)"
                          className="sm:col-span-4 h-9 rounded-lg border border-slate-300 px-3 font-mono"
                        />
                        <input
                          type="text"
                          value={catatan}
                          onChange={(e) => setCatatan(e.target.value)}
                          placeholder="Catatan capaian karya..."
                          className="sm:col-span-9 h-9 rounded-lg border border-slate-300 px-3"
                        />
                        <button
                          type="submit"
                          className="sm:col-span-3 h-9 inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-700 text-white font-semibold hover:bg-emerald-800"
                        >
                          <Plus className="w-3.5 h-3.5" /> Tambah Karya
                        </button>
                      </form>
                    )}

                    <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                      {(activeStudent.portfolioItems || []).length === 0 ? (
                        <div className="p-6 text-center text-slate-500">
                          Belum ada item karya portofolio yang dicatat.
                        </div>
                      ) : (
                        activeStudent.portfolioItems.map((it) => {
                          const safeLink = it.url ? validatePortfolioUrl(it.url) : null;
                          return (
                            <div
                              key={it.id}
                              className="p-3.5 flex items-start justify-between gap-3"
                            >
                              <div className="space-y-0.5 min-w-0">
                                <div className="font-semibold text-slate-900">{it.judul}</div>
                                <div className="text-[11px] text-slate-500">
                                  {it.kategori} · {formatTanggalID(it.tanggal)}
                                </div>
                                {it.catatan && <p className="text-slate-600">{it.catatan}</p>}
                                {safeLink && (
                                  <a
                                    href={safeLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-emerald-700 font-medium hover:underline"
                                  >
                                    Lihat Tautan <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                              {canEditPortfolio && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteItem(it.id)}
                                  className="p-1 text-slate-400 hover:text-red-600 rounded"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'ortu' && (
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
                  <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-2">
                    Riwayat Konfirmasi & Tanggapan Orang Tua / Wali
                  </h3>
                  {stuFeedbacks.length === 0 ? (
                    <p className="text-slate-500 py-4">
                      Belum ada konfirmasi atau tanggapan orang tua melalui Portal Orang Tua.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                      {stuFeedbacks.map((fb) => (
                        <div key={fb.id} className="p-3.5 space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold text-slate-900">
                              {fb.parentName} — {fb.konfirmasiStatus}
                            </span>
                            <span className="font-mono text-[11px] text-slate-500">
                              TA {fb.tahunAjaran} · S{fb.semester} ·{' '}
                              {formatTanggalID(fb.createdAt.slice(0, 10))}
                            </span>
                          </div>
                          {fb.tanggapan && <p className="text-slate-700">{fb.tanggapan}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
