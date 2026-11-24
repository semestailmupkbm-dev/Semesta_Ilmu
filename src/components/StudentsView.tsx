import React, { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Edit3,
  FileSpreadsheet,
  Hash,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import {
  ClassDef,
  Student,
  StudentEditEditableFields,
  StudentEditRequest,
  UserAccount,
} from '../types';
import {
  generateNIS,
  getClassTingkat,
  getFaseFromTingkat,
  resizeImageToDataUrl,
} from '../utils/academic';
import {
  downloadAllClassesStudentTemplate,
  downloadStudentTemplate,
  importStudentsAllClassesExcel,
  importStudentsExcel,
} from '../utils/excel';

interface StudentsViewProps {
  students: Student[];
  currentUser: UserAccount;
  selectedClass: string;
  classes: string[];
  classDefs: ClassDef[];
  tahunAjaran: string;
  studentEditRequests?: StudentEditRequest[];
  onSaveStudent: (student: Student, isNew: boolean) => void;
  onImportStudents: (rows: Partial<Student>[]) => void;
  onAutoGenerateNIS: () => void;
  onDeleteStudent: (id: string) => void;
  onSubmitStudentEditRequest?: (
    studentId: string,
    proposedChanges: Partial<StudentEditEditableFields>,
    alasanPerubahan: string
  ) => Promise<boolean>;
  onReviewStudentEditRequest?: (
    id: string,
    status: 'Disetujui' | 'Ditolak',
    catatanPengurus: string
  ) => Promise<boolean>;
  onNotify: (msg: string, isError?: boolean) => void;
}

const EDIT_FIELD_LABELS: Record<keyof StudentEditEditableFields, string> = {
  nama: 'Nama Lengkap',
  nisn: 'NISN',
  jurusan: 'Jurusan / Peminatan',
  jenisKelamin: 'Jenis Kelamin',
  tempatLahir: 'Tempat Lahir',
  tanggalLahir: 'Tanggal Lahir',
  agama: 'Agama',
  pendidikanSebelumnya: 'Pendidikan Sebelumnya',
  alamat: 'Alamat',
  namaAyah: 'Nama Ayah',
  namaIbu: 'Nama Ibu',
  pekerjaanAyah: 'Pekerjaan Ayah',
  pekerjaanIbu: 'Pekerjaan Ibu',
  namaWali: 'Nama Wali',
  noTelpWali: 'No. Telp Wali',
  portfolioFolderUrl: 'Folder Portofolio',
  fotoDataUrl: 'Foto Siswa',
};

export const StudentsView: React.FC<StudentsViewProps> = ({
  students,
  currentUser,
  selectedClass,
  classes,
  classDefs,
  tahunAjaran,
  studentEditRequests = [],
  onSaveStudent,
  onImportStudents,
  onAutoGenerateNIS,
  onDeleteStudent,
  onSubmitStudentEditRequest,
  onReviewStudentEditRequest,
  onNotify,
}) => {
  const isAdmin = currentUser.role === 'admin';
  const isWaliKelas = currentUser.role === 'walikelas';
  const waliTargetClass = currentUser.waliKelasTarget || '';

  const [search, setSearch] = useState('');
  const [showAllClasses, setShowAllClasses] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [isNew, setIsNew] = useState(false);

  // Bulk all-classes import preview state (Pengurus)
  const [bulkPreview, setBulkPreview] = useState<{
    matchedRows: Partial<Student>[];
    unmatchedRows: Array<{ rowNumber: number; nama: string; kelasInput: string }>;
    summaryByClass: Record<string, number>;
  } | null>(null);

  // Wali Kelas proposal modal state
  const [proposeStudent, setProposeStudent] = useState<Student | null>(null);
  const [proposeDraft, setProposeDraft] = useState<Partial<StudentEditEditableFields>>({});
  const [proposeReason, setProposeReason] = useState('');
  const [submittingProposal, setSubmittingProposal] = useState(false);

  // Pengurus review notes state
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bulkFileInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const orderedClasses =
    classDefs.length > 0
      ? [...classDefs].sort((a, b) => a.urutan - b.urutan).map((c) => c.nama)
      : classes;

  const pendingEditRequests = useMemo(
    () => studentEditRequests.filter((r) => r.status === 'Menunggu Persetujuan'),
    [studentEditRequests]
  );

  const filtered = students
    .filter((s) => (showAllClasses && isAdmin ? true : s.kelas === selectedClass))
    .filter((s) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        s.nama.toLowerCase().includes(q) ||
        s.nis.toLowerCase().includes(q) ||
        (s.nisn || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));

  const openNew = () => {
    if (!isAdmin) return;
    const t = getClassTingkat(selectedClass, classDefs) ?? 7;
    setIsNew(true);
    setEditing({
      id: `stu-${Date.now()}`,
      nis: generateNIS(selectedClass, students, tahunAjaran, classDefs),
      nisn: '',
      nama: '',
      kelas: selectedClass,
      fase: getFaseFromTingkat(t),
      jurusan: t >= 11 ? 'IPA' : 'Umum',
      jenisKelamin: 'L',
      tempatLahir: '',
      tanggalLahir: '',
      agama: 'Islam',
      pendidikanSebelumnya: '',
      alamat: '',
      namaAyah: '',
      namaIbu: '',
      pekerjaanAyah: '',
      pekerjaanIbu: '',
      namaWali: '',
      noTelpWali: '',
      status: 'Aktif',
      fotoDataUrl: '',
      portfolioFolderUrl: '',
      portfolioItems: [],
      createdAt: new Date().toISOString(),
    });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !isAdmin) return;
    try {
      const rows = await importStudentsExcel(file, selectedClass, classDefs);
      onImportStudents(rows);
      onNotify(`${rows.length} data siswa berhasil diimpor dari Excel.`);
    } catch {
      onNotify('Gagal membaca file Excel data siswa.', true);
    }
  };

  const handleBulkAllClassesImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !isAdmin) return;
    try {
      const parsed = await importStudentsAllClassesExcel(file, orderedClasses, classDefs);
      if (parsed.matchedRows.length === 0 && parsed.unmatchedRows.length === 0) {
        onNotify('File Excel kosong atau tidak memiliki baris data siswa yang valid.', true);
        return;
      }
      setBulkPreview(parsed);
    } catch {
      onNotify('Gagal membaca file Excel impor seluruh kelas aktif.', true);
    }
  };

  const openWaliProposal = (stu: Student) => {
    setProposeStudent(stu);
    setProposeDraft({
      nama: stu.nama,
      nisn: stu.nisn || '',
      jurusan: stu.jurusan || 'Umum',
      jenisKelamin: stu.jenisKelamin,
      tempatLahir: stu.tempatLahir || '',
      tanggalLahir: stu.tanggalLahir || '',
      agama: stu.agama || 'Islam',
      pendidikanSebelumnya: stu.pendidikanSebelumnya || '',
      alamat: stu.alamat || '',
      namaAyah: stu.namaAyah || '',
      namaIbu: stu.namaIbu || '',
      pekerjaanAyah: stu.pekerjaanAyah || '',
      pekerjaanIbu: stu.pekerjaanIbu || '',
      namaWali: stu.namaWali || '',
      noTelpWali: stu.noTelpWali || '',
      portfolioFolderUrl: stu.portfolioFolderUrl || '',
    });
    setProposeReason('');
  };

  const handleSubmitProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposeStudent || !onSubmitStudentEditRequest) return;
    const diff: Partial<StudentEditEditableFields> = {};
    (Object.keys(EDIT_FIELD_LABELS) as Array<keyof StudentEditEditableFields>).forEach((k) => {
      const nextVal = proposeDraft[k];
      const prevVal = proposeStudent[k];
      if (nextVal !== undefined && String(nextVal ?? '') !== String(prevVal ?? '')) {
        (diff as Record<string, unknown>)[k] = nextVal;
      }
    });
    if (Object.keys(diff).length === 0) {
      onNotify('Tidak ada perubahan biodata yang diajukan.', true);
      return;
    }
    if (!proposeReason.trim()) {
      onNotify('Alasan perubahan biodata wajib diisi.', true);
      return;
    }
    setSubmittingProposal(true);
    try {
      const ok = await onSubmitStudentEditRequest(proposeStudent.id, diff, proposeReason.trim());
      if (ok) {
        onNotify(
          `Usulan edit biodata ${proposeStudent.nama} dikirim dan menunggu persetujuan Pengurus.`
        );
        setProposeStudent(null);
      }
    } finally {
      setSubmittingProposal(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editing) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file, 360, 440, false);
      setEditing({ ...editing, fotoDataUrl: dataUrl });
    } catch {
      onNotify('File foto tidak valid.', true);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!editing || !editing.nama.trim()) {
      onNotify('Nama lengkap siswa wajib diisi.', true);
      return;
    }
    const t = getClassTingkat(editing.kelas, classDefs) ?? 7;
    onSaveStudent(
      {
        ...editing,
        nama: editing.nama.trim(),
        fase: getFaseFromTingkat(t),
      },
      isNew
    );
    setEditing(null);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold text-slate-900">
            Data Induk Peserta Didik ({showAllClasses && isAdmin ? 'Semua Kelas' : selectedClass})
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Total ditampilkan: {filtered.length} siswa ·{' '}
            {isAdmin
              ? 'Mendukung tambah siswa, impor per kelas maupun seluruh kelas aktif sekaligus, NIS otomatis & persetujuan edit wali kelas.'
              : isWaliKelas
                ? `Wali Kelas (${waliTargetClass || '-'}): Anda dapat mengajukan edit biodata siswa kelas binaan untuk disetujui Pengurus.`
                : 'Mode Lihat: penambahan dan penghapusan peserta didik hanya dilakukan oleh Pengurus PKBM.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama / NIS / NISN..."
              className="h-9 w-52 pl-8 pr-3 rounded-lg border border-slate-300 text-xs focus:border-emerald-700 focus:outline-none"
            />
          </div>

          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => setShowAllClasses((v) => !v)}
                className={`h-9 px-3 rounded-lg border text-xs font-medium whitespace-nowrap ${
                  showAllClasses
                    ? 'border-emerald-700 bg-emerald-50 text-emerald-800'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {showAllClasses ? 'Semua Kelas' : `Hanya ${selectedClass}`}
              </button>

              <button
                type="button"
                onClick={onAutoGenerateNIS}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Hash className="w-3.5 h-3.5" /> Buat NIS Otomatis
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleImport}
                className="hidden"
              />
              <input
                ref={bulkFileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleBulkAllClassesImport}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => downloadStudentTemplate(selectedClass)}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" /> Template Kelas Ini
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5" /> Impor Kelas Ini
              </button>
              <button
                type="button"
                onClick={() => downloadAllClassesStudentTemplate(orderedClasses)}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-emerald-700 bg-emerald-50 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 whitespace-nowrap"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> Template Semua Kelas
              </button>
              <button
                type="button"
                onClick={() => bulkFileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-emerald-700 bg-white text-xs font-semibold text-emerald-800 hover:bg-emerald-50 whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5" /> Impor Semua Kelas
              </button>
              <button
                type="button"
                onClick={openNew}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-700 text-xs font-medium text-white hover:bg-emerald-800 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" /> Tambah Siswa
              </button>
            </>
          )}
        </div>
      </div>

      {/* Pengurus Approval Queue for Wali Kelas Edits */}
      {isAdmin && studentEditRequests.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              <h2 className="text-sm font-bold text-slate-900">
                Persetujuan Usulan Edit Biodata Siswa dari Wali Kelas ({pendingEditRequests.length}{' '}
                Menunggu)
              </h2>
            </div>
            <span className="text-[11px] text-slate-500">
              Data induk baru berubah setelah disetujui Pengurus
            </span>
          </div>
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {studentEditRequests.map((req) => (
              <div
                key={req.id}
                className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                  req.status === 'Menunggu Persetujuan'
                    ? 'border-amber-200 bg-amber-50/40'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-slate-900">{req.studentName}</span>{' '}
                    <span className="font-mono text-slate-500">
                      ({req.kelas} · NIS {req.nis})
                    </span>
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      Diajukan oleh: <strong>{req.requestedByName}</strong> · Alasan:{' '}
                      {req.alasanPerubahan}
                    </div>
                  </div>
                  <span
                    className={`font-semibold px-2 py-0.5 rounded border text-[11px] ${
                      req.status === 'Disetujui'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : req.status === 'Ditolak'
                          ? 'border-red-200 bg-red-50 text-red-700'
                          : 'border-amber-300 bg-amber-100 text-amber-900'
                    }`}
                  >
                    {req.status}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 bg-white border border-slate-200 rounded-lg p-2.5">
                  {(Object.keys(req.proposedChanges) as Array<keyof StudentEditEditableFields>).map(
                    (field) => (
                      <div key={field} className="text-[11px]">
                        <span className="font-semibold text-slate-700">
                          {EDIT_FIELD_LABELS[field] || field}:
                        </span>{' '}
                        <span className="line-through text-slate-400">
                          {String(req.previousValues[field] ?? '-')}
                        </span>{' '}
                        →{' '}
                        <span className="font-semibold text-emerald-800">
                          {String(req.proposedChanges[field] ?? '-')}
                        </span>
                      </div>
                    )
                  )}
                </div>

                {req.status === 'Menunggu Persetujuan' && onReviewStudentEditRequest ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={reviewNotes[req.id] || ''}
                      onChange={(e) =>
                        setReviewNotes((prev) => ({ ...prev, [req.id]: e.target.value }))
                      }
                      placeholder="Catatan persetujuan / alasan penolakan Pengurus (opsional)..."
                      className="flex-1 min-w-[200px] h-8 rounded border border-slate-300 bg-white px-2.5"
                    />
                    <button
                      type="button"
                      disabled={reviewingId === req.id}
                      onClick={async () => {
                        setReviewingId(req.id);
                        try {
                          const ok = await onReviewStudentEditRequest(
                            req.id,
                            'Ditolak',
                            reviewNotes[req.id] || ''
                          );
                          if (ok) onNotify('Usulan edit biodata siswa ditolak.');
                        } finally {
                          setReviewingId(null);
                        }
                      }}
                      className="h-8 px-3 rounded border border-red-300 text-red-700 bg-white font-semibold hover:bg-red-50 disabled:opacity-50"
                    >
                      Tolak
                    </button>
                    <button
                      type="button"
                      disabled={reviewingId === req.id}
                      onClick={async () => {
                        setReviewingId(req.id);
                        try {
                          const ok = await onReviewStudentEditRequest(
                            req.id,
                            'Disetujui',
                            reviewNotes[req.id] || ''
                          );
                          if (ok) onNotify('Usulan disetujui & biodata siswa otomatis diperbarui.');
                        } finally {
                          setReviewingId(null);
                        }
                      }}
                      className="inline-flex items-center gap-1 h-8 px-3 rounded bg-emerald-700 text-white font-semibold hover:bg-emerald-800 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Setujui & Terapkan
                    </button>
                  </div>
                ) : (
                  req.catatanPengurus && (
                    <div className="text-[11px] text-slate-600">
                      Catatan Pengurus ({req.reviewedByName}): {req.catatanPengurus}
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
              <tr>
                <th className="px-4 py-3 w-12 text-center">No</th>
                <th className="px-4 py-3 min-w-[210px]">Peserta Didik</th>
                <th className="px-3 py-3 font-mono">NIS / NISN</th>
                <th className="px-3 py-3">Kelas & Fase</th>
                <th className="px-3 py-3 text-center">L/P</th>
                <th className="px-3 py-3">Orang Tua / Wali</th>
                <th className="px-3 py-3 text-center">Status</th>
                {(isAdmin || isWaliKelas) && <th className="px-4 py-3 text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin || isWaliKelas ? 8 : 7} className="px-6 py-10 text-center text-xs text-slate-500">
                    Tidak ada peserta didik yang sesuai.
                  </td>
                </tr>
              ) : (
                filtered.map((stu, idx) => (
                  <tr key={stu.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 text-center font-mono tabular-nums text-xs text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg border border-slate-200 bg-slate-100 overflow-hidden flex items-center justify-center shrink-0">
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
                        <div>
                          <div className="font-medium text-slate-900">{stu.nama}</div>
                          <div className="text-xs text-slate-500">
                            {stu.tempatLahir || '-'}, {stu.tanggalLahir || '-'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono tabular-nums text-xs text-slate-700">
                      <div>{stu.nis || '-'}</div>
                      <div className="text-slate-400">{stu.nisn || '-'}</div>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <div className="font-medium text-slate-800">{stu.kelas}</div>
                      <div className="text-slate-500">
                        {stu.fase}
                        {stu.jurusan && stu.jurusan !== 'Umum' ? ` · ${stu.jurusan}` : ''}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center text-xs font-mono">{stu.jenisKelamin}</td>
                    <td className="px-3 py-3 text-xs text-slate-600">
                      <div>{stu.namaWali || stu.namaAyah || '-'}</div>
                      <div className="font-mono text-[11px] text-slate-400">
                        {stu.noTelpWali || '-'}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center text-xs font-semibold">
                      <span
                        className={
                          stu.status === 'Aktif'
                            ? 'text-emerald-700'
                            : stu.status === 'Lulus'
                              ? 'text-sky-700'
                              : 'text-amber-700'
                        }
                      >
                        {stu.status}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setIsNew(false);
                            setEditing({ ...stu });
                          }}
                          className="p-1.5 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100 inline-flex"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteStudent(stu.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 inline-flex ml-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                    {isWaliKelas && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {stu.kelas === waliTargetClass ? (
                          <button
                            type="button"
                            onClick={() => openWaliProposal(stu)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> Ajukan Edit
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">Hanya Lihat</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Wali Kelas submitted proposals history */}
      {isWaliKelas && studentEditRequests.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-slate-900">
            Riwayat Usulan Edit Biodata Siswa ({studentEditRequests.length})
          </h2>
          <div className="space-y-2">
            {studentEditRequests.map((req) => (
              <div
                key={req.id}
                className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs flex flex-wrap items-center justify-between gap-2"
              >
                <div>
                  <span className="font-semibold text-slate-900">{req.studentName}</span> ({req.kelas}) ·{' '}
                  <span className="text-slate-600">
                    {Object.keys(req.proposedChanges)
                      .map((k) => EDIT_FIELD_LABELS[k as keyof StudentEditEditableFields] || k)
                      .join(', ')}
                  </span>
                  {req.catatanPengurus && (
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Catatan Pengurus: {req.catatanPengurus}
                    </div>
                  )}
                </div>
                <span
                  className={`font-semibold px-2 py-0.5 rounded border text-[11px] ${
                    req.status === 'Disetujui'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : req.status === 'Ditolak'
                        ? 'border-red-200 bg-red-50 text-red-700'
                        : 'border-amber-200 bg-amber-50 text-amber-800'
                  }`}
                >
                  {req.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {editing && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-base font-semibold text-slate-900">
                {isNew ? 'Tambah Peserta Didik Baru' : `Edit Data: ${editing.nama}`}
              </h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="p-1 text-slate-400 hover:text-slate-800 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
              <div className="flex items-center gap-4 pb-3 border-b border-slate-200">
                <div className="w-16 h-20 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                  {editing.fotoDataUrl ? (
                    <img
                      src={editing.fotoDataUrl}
                      alt={editing.nama}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-6 h-6 text-slate-400" />
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="font-semibold text-slate-900">Foto Peserta Didik (Kartu Pelajar)</div>
                  <div className="flex items-center gap-2">
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="px-3 py-1.5 rounded border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Unggah Foto
                    </button>
                    {editing.fotoDataUrl && (
                      <button
                        type="button"
                        onClick={() => setEditing({ ...editing, fotoDataUrl: '' })}
                        className="text-red-600 hover:underline"
                      >
                        Hapus Foto
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Nama Lengkap *</label>
                  <input
                    type="text"
                    required
                    value={editing.nama}
                    onChange={(e) => setEditing({ ...editing, nama: e.target.value })}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">NIS</label>
                  <input
                    type="text"
                    value={editing.nis}
                    onChange={(e) => setEditing({ ...editing, nis: e.target.value })}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">NISN</label>
                  <input
                    type="text"
                    value={editing.nisn}
                    onChange={(e) => setEditing({ ...editing, nisn: e.target.value })}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Kelas</label>
                  <select
                    value={editing.kelas}
                    onChange={(e) => setEditing({ ...editing, kelas: e.target.value })}
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5"
                  >
                    {orderedClasses.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Jurusan / Peminatan
                  </label>
                  <select
                    value={editing.jurusan}
                    onChange={(e) => setEditing({ ...editing, jurusan: e.target.value })}
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5"
                  >
                    <option value="Umum">Umum</option>
                    <option value="IPA">IPA</option>
                    <option value="IPS">IPS</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Jenis Kelamin</label>
                  <select
                    value={editing.jenisKelamin}
                    onChange={(e) =>
                      setEditing({ ...editing, jenisKelamin: e.target.value as 'L' | 'P' })
                    }
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5"
                  >
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Status</label>
                  <select
                    value={editing.status}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        status: e.target.value as Student['status'],
                      })
                    }
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5"
                  >
                    <option value="Aktif">Aktif</option>
                    <option value="Pindah">Pindah</option>
                    <option value="Lulus">Lulus</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Tempat Lahir</label>
                  <input
                    type="text"
                    value={editing.tempatLahir}
                    onChange={(e) => setEditing({ ...editing, tempatLahir: e.target.value })}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Tanggal Lahir</label>
                  <input
                    type="date"
                    value={editing.tanggalLahir}
                    onChange={(e) => setEditing({ ...editing, tanggalLahir: e.target.value })}
                    className="w-full h-9 rounded-lg border border-slate-300 px-2.5"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nama Ayah</label>
                  <input
                    type="text"
                    value={editing.namaAyah}
                    onChange={(e) => setEditing({ ...editing, namaAyah: e.target.value })}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nama Ibu</label>
                  <input
                    type="text"
                    value={editing.namaIbu}
                    onChange={(e) => setEditing({ ...editing, namaIbu: e.target.value })}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nama Wali</label>
                  <input
                    type="text"
                    value={editing.namaWali}
                    onChange={(e) => setEditing({ ...editing, namaWali: e.target.value })}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">No. Telp Wali</label>
                  <input
                    type="text"
                    value={editing.noTelpWali}
                    onChange={(e) => setEditing({ ...editing, noTelpWali: e.target.value })}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Alamat</label>
                  <input
                    type="text"
                    value={editing.alamat}
                    onChange={(e) => setEditing({ ...editing, alamat: e.target.value })}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-700 font-medium text-white hover:bg-emerald-800"
                >
                  Simpan Data Siswa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Bulk All-Classes Import Preview Modal */}
      {bulkPreview && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl max-h-[85vh] overflow-y-auto shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">
                Pratinjau Impor Siswa Seluruh Kelas Aktif
              </h2>
              <button
                type="button"
                onClick={() => setBulkPreview(null)}
                className="p-1 text-slate-400 hover:text-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900">
                Total terklasifikasi otomatis ke kelas aktif:{' '}
                <strong className="font-mono">{bulkPreview.matchedRows.length} siswa</strong> di{' '}
                <strong className="font-mono">
                  {Object.keys(bulkPreview.summaryByClass).length} kelas
                </strong>
                .
              </div>
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-200">
                {Object.entries(bulkPreview.summaryByClass).map(([cls, cnt]) => (
                  <div key={cls} className="px-3.5 py-2 flex items-center justify-between">
                    <span className="font-semibold text-slate-800">{cls}</span>
                    <span className="font-mono font-bold text-emerald-700">{cnt} siswa</span>
                  </div>
                ))}
              </div>
              {bulkPreview.unmatchedRows.length > 0 && (
                <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 space-y-1">
                  <div className="font-semibold text-amber-900">
                    {bulkPreview.unmatchedRows.length} baris diabaikan karena nama kelas tidak cocok dengan daftar kelas aktif:
                  </div>
                  <div className="max-h-24 overflow-y-auto text-[11px] text-amber-800 space-y-0.5">
                    {bulkPreview.unmatchedRows.map((u, i) => (
                      <div key={i}>
                        • Baris {u.rowNumber}: {u.nama} (Kelas tertulis: &ldquo;{u.kelasInput || 'kosong'}&rdquo;)
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setBulkPreview(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-medium"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={bulkPreview.matchedRows.length === 0}
                  onClick={() => {
                    onImportStudents(bulkPreview.matchedRows);
                    onNotify(
                      `${bulkPreview.matchedRows.length} siswa berhasil diimpor & diklasifikasikan ke masing-masing kelas.`
                    );
                    setBulkPreview(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-emerald-700 text-white font-semibold hover:bg-emerald-800 disabled:opacity-50"
                >
                  Konfirmasi Impor {bulkPreview.matchedRows.length} Siswa
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Wali Kelas Edit Biodata Proposal Modal */}
      {proposeStudent && isWaliKelas && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Ajukan Edit Biodata Siswa: {proposeStudent.nama}
                </h2>
                <div className="text-[11px] text-slate-500">
                  Kelas {proposeStudent.kelas} · NIS {proposeStudent.nis} · Memerlukan Persetujuan Pengurus
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProposeStudent(null)}
                className="p-1 text-slate-400 hover:text-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmitProposal} className="p-6 space-y-4 text-xs">
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
                Wali Kelas hanya dapat mengajukan pembaruan biodata. Tambah/hapus siswa serta mutasi kelas & status hanya dikelola oleh Pengurus PKBM.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Nama Lengkap *</label>
                  <input
                    type="text"
                    required
                    value={proposeDraft.nama || ''}
                    onChange={(e) => setProposeDraft({ ...proposeDraft, nama: e.target.value })}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">NISN</label>
                  <input
                    type="text"
                    value={proposeDraft.nisn || ''}
                    onChange={(e) => setProposeDraft({ ...proposeDraft, nisn: e.target.value })}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Jenis Kelamin</label>
                  <select
                    value={proposeDraft.jenisKelamin || 'L'}
                    onChange={(e) =>
                      setProposeDraft({
                        ...proposeDraft,
                        jenisKelamin: e.target.value as 'L' | 'P',
                      })
                    }
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5"
                  >
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Tempat Lahir</label>
                  <input
                    type="text"
                    value={proposeDraft.tempatLahir || ''}
                    onChange={(e) =>
                      setProposeDraft({ ...proposeDraft, tempatLahir: e.target.value })
                    }
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Tanggal Lahir</label>
                  <input
                    type="date"
                    value={proposeDraft.tanggalLahir || ''}
                    onChange={(e) =>
                      setProposeDraft({ ...proposeDraft, tanggalLahir: e.target.value })
                    }
                    className="w-full h-9 rounded-lg border border-slate-300 px-2.5"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nama Ayah</label>
                  <input
                    type="text"
                    value={proposeDraft.namaAyah || ''}
                    onChange={(e) =>
                      setProposeDraft({ ...proposeDraft, namaAyah: e.target.value })
                    }
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nama Ibu</label>
                  <input
                    type="text"
                    value={proposeDraft.namaIbu || ''}
                    onChange={(e) => setProposeDraft({ ...proposeDraft, namaIbu: e.target.value })}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nama Wali</label>
                  <input
                    type="text"
                    value={proposeDraft.namaWali || ''}
                    onChange={(e) =>
                      setProposeDraft({ ...proposeDraft, namaWali: e.target.value })
                    }
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">No. Telp Wali</label>
                  <input
                    type="text"
                    value={proposeDraft.noTelpWali || ''}
                    onChange={(e) =>
                      setProposeDraft({ ...proposeDraft, noTelpWali: e.target.value })
                    }
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Alamat</label>
                  <input
                    type="text"
                    value={proposeDraft.alamat || ''}
                    onChange={(e) => setProposeDraft({ ...proposeDraft, alamat: e.target.value })}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-800 mb-1">
                    Alasan / Dasar Pembaruan Data *
                  </label>
                  <input
                    type="text"
                    required
                    value={proposeReason}
                    onChange={(e) => setProposeReason(e.target.value)}
                    placeholder="Mis. Koreksi ejaan nama sesuai Akta Kelahiran / nomor HP wali terbaru"
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
              </div>
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setProposeStudent(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 font-medium text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingProposal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {submittingProposal ? 'Mengirim...' : 'Kirim Usulan ke Pengurus'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
