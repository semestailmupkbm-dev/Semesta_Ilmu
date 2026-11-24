import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  Eye,
  FileCheck2,
  FilePlus2,
  FileText,
  Megaphone,
  Send,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  AppState,
  LetterCategory,
  LetterStatus,
  SchoolLetter,
  Student,
  UserAccount,
} from '../types';
import {
  composeLetterDocument,
  formatNomorSurat,
  getLetterTemplateById,
  getNextLetterSequence,
  getStudentRequestableTemplates,
  getTemplatesByCategory,
  LETTER_CATEGORIES,
  LETTER_TEMPLATES,
  LetterTemplateDef,
} from '../data/letterTemplates';
import { formatTanggalID } from '../utils/academic';
import { generateLetterPDF } from '../utils/letterPdf';

interface SuratViewProps {
  state: AppState;
  currentUser: UserAccount;
  onCreateLetter: (payload: {
    templateId: string;
    studentId?: string;
    tanggalSurat: string;
    nomorSurat?: string;
    perihal: string;
    targetAudience?: string;
    targetKelasList?: string[];
    penerimaNama?: string;
    penerimaJabatan?: string;
    penerimaInstansi?: string;
    dynamicFields: Record<string, string>;
    penandatanganNama: string;
    penandatanganJabatan: string;
    penandatanganNip: string;
    status: 'Draft' | 'Terbit';
  }) => Promise<SchoolLetter | null>;
  onRequestLetter: (payload: {
    templateId: string;
    studentId?: string;
    perihal?: string;
    dynamicFields: Record<string, string>;
  }) => Promise<SchoolLetter | null>;
  onUpdateLetter: (id: string, payload: Partial<SchoolLetter>) => Promise<SchoolLetter | null>;
  onIssueLetter: (
    id: string,
    payload: {
      action: 'issue' | 'reject';
      nomorSurat?: string;
      perihal?: string;
      dynamicFields?: Record<string, string>;
      penandatanganNama?: string;
      penandatanganJabatan?: string;
      penandatanganNip?: string;
      catatanPengurus?: string;
    }
  ) => Promise<SchoolLetter | null>;
  onDeleteLetter: (id: string) => Promise<boolean>;
  onNotify: (msg: string, isError?: boolean) => void;
}

const STATUS_BADGE_CLASS: Record<LetterStatus, string> = {
  'Menunggu Persetujuan': 'bg-amber-50 text-amber-800 border-amber-200',
  Draft: 'bg-slate-100 text-slate-700 border-slate-200',
  Terbit: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Ditolak: 'bg-red-50 text-red-800 border-red-200',
};

function buildInitialFieldValues(
  tpl: LetterTemplateDef,
  existing?: Record<string, string>,
  student?: Student
): Record<string, string> {
  const out: Record<string, string> = {};
  const today = new Date().toISOString().slice(0, 10);
  tpl.fields.forEach((f) => {
    if (existing && existing[f.key] !== undefined) {
      out[f.key] = existing[f.key];
    } else if (f.defaultValue !== undefined) {
      out[f.key] = f.defaultValue;
    } else if (f.type === 'date') {
      out[f.key] = today;
    } else if (f.key === 'namaWaliPemohon' && student) {
      out[f.key] = student.namaWali || student.namaAyah || '';
    } else if (f.key === 'dataBenarResmi' && student) {
      out[f.key] = `Nama: ${student.nama}, NIS/NISN: ${student.nis}/${student.nisn || '-'}`;
    } else {
      out[f.key] = '';
    }
  });
  return out;
}

export const SuratView: React.FC<SuratViewProps> = ({
  state,
  currentUser,
  onCreateLetter,
  onRequestLetter,
  onUpdateLetter,
  onIssueLetter,
  onDeleteLetter,
  onNotify,
}) => {
  const isAdmin = currentUser.role === 'admin';
  const isSiswa = currentUser.role === 'siswa';
  const isOrtu = currentUser.role === 'ortu';
  const letters = state.letters || [];
  const settings = state.settings;

  const linkedStudentsForUser = useMemo(() => {
    if (!isSiswa && !isOrtu) return [];
    const ids = currentUser.linkedStudentIds || [];
    const matched = state.students.filter((s) => ids.includes(s.id));
    if (matched.length > 0) return matched;
    return isSiswa && state.students[0] ? [state.students[0]] : [];
  }, [isSiswa, isOrtu, currentUser.linkedStudentIds, state.students]);

  const [reqStudentId, setReqStudentId] = useState<string>(
    () => linkedStudentsForUser[0]?.id || ''
  );

  const linkedStudent = useMemo(() => {
    if (linkedStudentsForUser.length === 0) return null;
    return (
      linkedStudentsForUser.find((s) => s.id === reqStudentId) ||
      linkedStudentsForUser[0]
    );
  }, [linkedStudentsForUser, reqStudentId]);

  const pendingLetters = useMemo(
    () => letters.filter((l) => l.status === 'Menunggu Persetujuan'),
    [letters]
  );

  // Admin tabs
  const [adminTab, setAdminTab] = useState<'requests' | 'compose' | 'archive'>(
    pendingLetters.length > 0 ? 'requests' : 'compose'
  );

  // Siswa tabs
  const [siswaTab, setSiswaTab] = useState<'pengumuman' | 'ajukan' | 'riwayat'>('pengumuman');

  // Shared preview modal
  const [previewLetter, setPreviewLetter] = useState<SchoolLetter | null>(null);

  // Admin Composer state
  const [editingLetterId, setEditingLetterId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<LetterCategory>(LETTER_CATEGORIES[0]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(LETTER_TEMPLATES[0].id);
  const [formStudentId, setFormStudentId] = useState<string>(state.students[0]?.id || '');
  const [formTanggal, setFormTanggal] = useState<string>(new Date().toISOString().slice(0, 10));
  const [formNomor, setFormNomor] = useState<string>('');
  const [formPerihal, setFormPerihal] = useState<string>(LETTER_TEMPLATES[0].defaultPerihal);
  const [formTargetAudience, setFormTargetAudience] = useState<string>('Seluruh Peserta Didik & Orang Tua/Wali');
  const [formTargetClasses, setFormTargetClasses] = useState<string[]>([]);
  const [formPenerimaNama, setFormPenerimaNama] = useState<string>('');
  const [formPenerimaJabatan, setFormPenerimaJabatan] = useState<string>('');
  const [formPenerimaInstansi, setFormPenerimaInstansi] = useState<string>('');
  const [formFields, setFormFields] = useState<Record<string, string>>(() =>
    buildInitialFieldValues(LETTER_TEMPLATES[0], undefined, state.students[0])
  );
  const [formSignerName, setFormSignerName] = useState<string>(
    settings.kepalaSekolah || 'Kepala Satuan Pendidikan'
  );
  const [formSignerTitle, setFormSignerTitle] = useState<string>(
    settings.jenisLembaga === 'PKBM' ? 'Ketua / Kepala PKBM' : `Kepala ${settings.jenisLembaga}`
  );
  const [formSignerNip, setFormSignerNip] = useState<string>(settings.nipKepalaSekolah || '-');
  const [savingForm, setSavingForm] = useState(false);

  // Admin Archive Filters
  const [archiveCategory, setArchiveCategory] = useState<'Semua' | LetterCategory>('Semua');
  const [archiveStatus, setArchiveStatus] = useState<'Semua' | LetterStatus>('Semua');
  const [archiveSearch, setArchiveSearch] = useState('');

  // Admin Review/Issue Student Request Modal
  const [reviewingReq, setReviewingReq] = useState<SchoolLetter | null>(null);
  const [revFields, setRevFields] = useState<Record<string, string>>({});
  const [revPerihal, setRevPerihal] = useState('');
  const [revNomor, setRevNomor] = useState('');
  const [revCatatan, setRevCatatan] = useState('');
  const [revShowPreview, setRevShowPreview] = useState(false);
  const [processingReview, setProcessingReview] = useState(false);

  // Siswa Request Form state
  const requestableTemplates = useMemo(() => getStudentRequestableTemplates(), []);
  const [reqTemplateId, setReqTemplateId] = useState<string>(requestableTemplates[0]?.id || '');
  const [reqFields, setReqFields] = useState<Record<string, string>>(() =>
    requestableTemplates[0]
      ? buildInitialFieldValues(requestableTemplates[0], undefined, linkedStudent || undefined)
      : {}
  );
  const [submittingReq, setSubmittingReq] = useState(false);

  const activeTemplate =
    getLetterTemplateById(selectedTemplateId) || LETTER_TEMPLATES[0];
  const categoryTemplates = useMemo(
    () => getTemplatesByCategory(selectedCategory),
    [selectedCategory]
  );

  const nextAutoSeq = useMemo(
    () => getNextLetterSequence(letters, formTanggal),
    [letters, formTanggal]
  );
  const autoNomorPreview = useMemo(
    () => formatNomorSurat(nextAutoSeq, activeTemplate.kodeNomor, settings, formTanggal),
    [nextAutoSeq, activeTemplate.kodeNomor, settings, formTanggal]
  );

  const selectTemplate = (tpl: LetterTemplateDef) => {
    setEditingLetterId(null);
    setSelectedCategory(tpl.kategori);
    setSelectedTemplateId(tpl.id);
    setFormPerihal(tpl.defaultPerihal);
    setFormNomor('');
    setFormTargetAudience(tpl.defaultTargetAudience || 'Seluruh Peserta Didik & Orang Tua/Wali');
    setFormTargetClasses([]);
    const stu = state.students.find((s) => s.id === formStudentId) || state.students[0];
    setFormFields(buildInitialFieldValues(tpl, undefined, stu));
  };

  const loadLetterToComposer = (letter: SchoolLetter) => {
    const tpl = getLetterTemplateById(letter.templateId) || LETTER_TEMPLATES[0];
    setEditingLetterId(letter.id);
    setSelectedCategory(tpl.kategori);
    setSelectedTemplateId(tpl.id);
    setFormStudentId(letter.studentId || '');
    setFormTanggal(letter.tanggalSurat || new Date().toISOString().slice(0, 10));
    setFormNomor(letter.nomorSurat || '');
    setFormPerihal(letter.perihal || tpl.defaultPerihal);
    setFormTargetAudience(letter.targetAudience || tpl.defaultTargetAudience || '');
    setFormTargetClasses(letter.targetKelasList || []);
    setFormPenerimaNama(letter.penerimaNama || '');
    setFormPenerimaJabatan(letter.penerimaJabatan || '');
    setFormPenerimaInstansi(letter.penerimaInstansi || '');
    const stu = state.students.find((s) => s.id === letter.studentId);
    setFormFields(buildInitialFieldValues(tpl, letter.dynamicFields, stu));
    setFormSignerName(letter.penandatanganNama || settings.kepalaSekolah);
    setFormSignerTitle(letter.penandatanganJabatan || 'Kepala Satuan Pendidikan');
    setFormSignerNip(letter.penandatanganNip || settings.nipKepalaSekolah || '-');
    setAdminTab('compose');
  };

  const handleSaveComposer = async (targetStatus: 'Draft' | 'Terbit') => {
    if (!formPerihal.trim()) {
      onNotify('Perihal surat wajib diisi.', true);
      return;
    }
    const missingReq = activeTemplate.fields.filter(
      (f) => f.required && !(formFields[f.key] || '').trim()
    );
    if (missingReq.length > 0) {
      onNotify(`Mohon lengkapi kolom wajib: ${missingReq.map((m) => m.label).join(', ')}`, true);
      return;
    }
    setSavingForm(true);
    try {
      const payload = {
        templateId: activeTemplate.id,
        studentId: activeTemplate.requiresStudent || formStudentId ? formStudentId || undefined : undefined,
        tanggalSurat: formTanggal,
        nomorSurat: formNomor.trim() || undefined,
        perihal: formPerihal.trim(),
        targetAudience:
          activeTemplate.formatLayout === 'pengumuman' ? formTargetAudience.trim() : undefined,
        targetKelasList:
          activeTemplate.formatLayout === 'pengumuman' ? formTargetClasses : undefined,
        penerimaNama: formPenerimaNama.trim() || undefined,
        penerimaJabatan: formPenerimaJabatan.trim() || undefined,
        penerimaInstansi: formPenerimaInstansi.trim() || undefined,
        dynamicFields: formFields,
        penandatanganNama: formSignerName.trim() || settings.kepalaSekolah,
        penandatanganJabatan: formSignerTitle.trim() || 'Kepala Satuan Pendidikan',
        penandatanganNip: formSignerNip.trim() || '-',
        status: targetStatus,
      };
      const saved = editingLetterId
        ? await onUpdateLetter(editingLetterId, payload)
        : await onCreateLetter(payload);
      if (saved) {
        onNotify(
          targetStatus === 'Terbit'
            ? `Surat/Pengumuman berhasil diterbitkan (${saved.nomorSurat}).`
            : 'Draft surat berhasil disimpan.'
        );
        setEditingLetterId(null);
        setFormNomor('');
        setPreviewLetter(saved);
        setAdminTab('archive');
      }
    } finally {
      setSavingForm(false);
    }
  };

  const openReviewRequestModal = (req: SchoolLetter) => {
    const tpl = getLetterTemplateById(req.templateId) || LETTER_TEMPLATES[0];
    const stu = state.students.find((s) => s.id === req.studentId);
    const seq = getNextLetterSequence(letters, req.tanggalSurat);
    setReviewingReq(req);
    setRevFields(buildInitialFieldValues(tpl, req.dynamicFields, stu));
    setRevPerihal(req.perihal || tpl.defaultPerihal);
    setRevNomor(req.nomorSurat || formatNomorSurat(seq, tpl.kodeNomor, settings, req.tanggalSurat));
    setRevCatatan('');
    setRevShowPreview(false);
  };

  const handleConfirmReviewRequest = async (action: 'issue' | 'reject') => {
    if (!reviewingReq) return;
    setProcessingReview(true);
    try {
      const updated = await onIssueLetter(reviewingReq.id, {
        action,
        nomorSurat: action === 'issue' ? revNomor.trim() : undefined,
        perihal: revPerihal.trim(),
        dynamicFields: revFields,
        penandatanganNama: settings.kepalaSekolah || 'Kepala Satuan Pendidikan',
        penandatanganJabatan:
          settings.jenisLembaga === 'PKBM' ? 'Ketua / Kepala PKBM' : `Kepala ${settings.jenisLembaga}`,
        penandatanganNip: settings.nipKepalaSekolah || '-',
        catatanPengurus: revCatatan.trim() || undefined,
      });
      if (updated) {
        onNotify(
          action === 'issue'
            ? `Pengajuan siswa disetujui dan diterbitkan (${updated.nomorSurat}).`
            : 'Pengajuan surat ditolak dengan catatan pengurus.'
        );
        setReviewingReq(null);
        if (action === 'issue') setPreviewLetter(updated);
      }
    } finally {
      setProcessingReview(false);
    }
  };

  const handleDownloadPdf = (letter: SchoolLetter) => {
    const stu = state.students.find((s) => s.id === letter.studentId);
    const doc = generateLetterPDF(letter, settings, stu);
    const safeNomor = (letter.nomorSurat || letter.kodeNomor || 'Surat').replace(/[^a-zA-Z0-9_-]+/g, '_');
    doc.save(`${safeNomor}_${letter.templateNama.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 32)}.pdf`);
    onNotify('PDF surat resmi berhasil diunduh.');
  };

  const filteredArchive = useMemo(() => {
    const q = archiveSearch.trim().toLowerCase();
    return letters.filter((l) => {
      if (archiveCategory !== 'Semua' && l.kategori !== archiveCategory) return false;
      if (archiveStatus !== 'Semua' && l.status !== archiveStatus) return false;
      if (q) {
        const hay = `${l.nomorSurat} ${l.templateNama} ${l.perihal} ${l.studentName || ''} ${l.penerimaInstansi || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [letters, archiveCategory, archiveStatus, archiveSearch]);

  // Live preview object for composer
  const composerDraftPreview: SchoolLetter = useMemo(
    () => ({
      id: editingLetterId || 'preview',
      schoolId: state.schoolId || currentUser.schoolId,
      nomorSurat: formNomor.trim() || autoNomorPreview,
      urutanNomor: nextAutoSeq,
      kodeNomor: activeTemplate.kodeNomor,
      templateId: activeTemplate.id,
      templateNama: activeTemplate.nama,
      kategori: activeTemplate.kategori,
      subKategori: activeTemplate.subKategori,
      perihal: formPerihal || activeTemplate.defaultPerihal,
      tanggalSurat: formTanggal,
      tahunAjaran: settings.tahunAjaran,
      semester: settings.semester,
      studentId: activeTemplate.requiresStudent || formStudentId ? formStudentId || undefined : undefined,
      studentName: state.students.find((s) => s.id === formStudentId)?.nama,
      studentNis: state.students.find((s) => s.id === formStudentId)?.nis,
      studentKelas: state.students.find((s) => s.id === formStudentId)?.kelas,
      targetAudience: formTargetAudience,
      targetKelasList: formTargetClasses,
      penerimaNama: formPenerimaNama,
      penerimaJabatan: formPenerimaJabatan,
      penerimaInstansi: formPenerimaInstansi,
      dynamicFields: formFields,
      penandatanganNama: formSignerName,
      penandatanganJabatan: formSignerTitle,
      penandatanganNip: formSignerNip,
      status: 'Draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    [
      editingLetterId,
      state.schoolId,
      state.students,
      currentUser.schoolId,
      formNomor,
      autoNomorPreview,
      nextAutoSeq,
      activeTemplate,
      formPerihal,
      formTanggal,
      settings.tahunAjaran,
      settings.semester,
      formStudentId,
      formTargetAudience,
      formTargetClasses,
      formPenerimaNama,
      formPenerimaJabatan,
      formPenerimaInstansi,
      formFields,
      formSignerName,
      formSignerTitle,
      formSignerNip,
    ]
  );

  // =====================================================================
  // RENDER MODAL PREVIEW KOP SURAT RESMI
  // =====================================================================
  const renderLetterPaper = (letter: SchoolLetter) => {
    const stu = state.students.find((s) => s.id === letter.studentId);
    const composed = composeLetterDocument(letter, settings, stu);
    const tpl = getLetterTemplateById(letter.templateId);

    return (
      <div className="bg-white border border-slate-300 rounded-lg p-6 sm:p-8 text-[13px] text-slate-900 space-y-4 leading-relaxed shadow-xs">
        {/* Kop Surat */}
        <div className="flex items-center gap-4 border-b-2 border-slate-900 pb-3">
          {settings.logoDataUrl && (
            <img
              src={settings.logoDataUrl}
              alt="Logo Lembaga"
              className="w-16 h-16 object-contain shrink-0"
            />
          )}
          <div className="flex-1 text-center">
            <div className="text-[11px] font-bold tracking-wide text-slate-600 uppercase">
              {settings.jenisLembaga === 'PKBM'
                ? 'Pusat Kegiatan Belajar Masyarakat (PKBM)'
                : 'Satuan Pendidikan Formal'}
            </div>
            <div className="text-base font-bold text-slate-950 uppercase">
              {settings.namaSekolah}
            </div>
            <div className="text-[11px] text-slate-600">
              {settings.alamat}, {settings.kelurahan}, {settings.kecamatan}, {settings.kabupaten},{' '}
              {settings.provinsi} {settings.kodePos}
            </div>
            <div className="text-[11px] text-slate-600">
              NPSN: {settings.npsn || '-'} · Telp: {settings.telepon || '-'} · Email:{' '}
              {settings.email || '-'}
            </div>
          </div>
        </div>

        {/* Header Surat */}
        {tpl?.formatLayout === 'surat_resmi' || tpl?.formatLayout === 'surat_izin' ? (
          <div className="space-y-3">
            <div className="flex flex-wrap justify-between gap-4">
              <div className="space-y-0.5">
                <div>
                  <span className="inline-block w-20 font-semibold">Nomor</span>: {composed.nomorSurat}
                </div>
                <div>
                  <span className="inline-block w-20 font-semibold">Lampiran</span>:{' '}
                  {composed.lampiranText || '-'}
                </div>
                <div>
                  <span className="inline-block w-20 font-semibold">Perihal</span>:{' '}
                  <span className="font-semibold">{composed.perihalText || letter.perihal}</span>
                </div>
              </div>
              <div className="text-right text-slate-700">{composed.tanggalText}</div>
            </div>
            {composed.tujuanBlok && composed.tujuanBlok.length > 0 && (
              <div className="pt-1">
                {composed.tujuanBlok.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center space-y-1 pt-1">
            <div className="text-sm font-bold underline underline-offset-4 uppercase">
              {composed.judulDokumen}
            </div>
            {composed.subJudul && <div className="font-semibold text-slate-800">{composed.subJudul}</div>}
            <div className="text-xs text-slate-700 font-mono">Nomor: {composed.nomorSurat}</div>
          </div>
        )}

        {/* Body Sections */}
        <div className="space-y-3 pt-1">
          {composed.sections.map((sec, idx) => (
            <div key={idx} className="space-y-1.5">
              {sec.title && <div className="font-bold text-slate-900">{sec.title}</div>}
              {sec.type === 'paragraph' && sec.text && <p>{sec.text}</p>}
              {sec.type === 'keyvalue' && sec.rows && (
                <table className="w-full text-[13px]">
                  <tbody>
                    {sec.rows.map((row, ri) => (
                      <tr key={ri} className="align-top">
                        <td className="py-0.5 pr-2 font-semibold w-48">{row.label}</td>
                        <td className="py-0.5 pr-2 w-3">:</td>
                        <td className="py-0.5">{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {(sec.type === 'bullets' || sec.type === 'numbered' || sec.type === 'diktum') &&
                sec.items && (
                  <ul className="space-y-1 pl-5 list-disc">
                    {sec.items.map((item, ii) => (
                      <li key={ii}>
                        {sec.type !== 'bullets' ? `${ii + 1}. ` : ''}
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          ))}
        </div>

        <p>{composed.penutup}</p>

        {/* Tanda Tangan */}
        <div
          className={`pt-4 flex ${
            composed.pemohonBlok ? 'justify-between' : 'justify-end'
          } gap-6 text-[13px]`}
        >
          {composed.pemohonBlok && (
            <div className="w-56">
              <div className="mt-5">{composed.pemohonBlok.label}</div>
              <div className="h-14" />
              <div className="font-bold">{composed.pemohonBlok.nama}</div>
              {composed.pemohonBlok.sub && (
                <div className="text-xs text-slate-600">{composed.pemohonBlok.sub}</div>
              )}
            </div>
          )}
          <div className="w-60">
            <div>{composed.tanggalText}</div>
            <div>{composed.jabatanPenandatangan}</div>
            <div className="h-14 flex items-center">
              {settings.ttdKepalaDataUrl &&
                (composed.jabatanPenandatangan.toLowerCase().includes('kepala') ||
                  composed.jabatanPenandatangan.toLowerCase().includes('ketua')) && (
                  <img
                    src={settings.ttdKepalaDataUrl}
                    alt="TTD Kepala"
                    className="max-h-14 object-contain"
                  />
                )}
            </div>
            <div className="font-bold">{composed.namaPenandatangan}</div>
            {composed.nipPenandatangan && composed.nipPenandatangan !== '-' && (
              <div className="text-xs text-slate-600">NIP/NUPTK: {composed.nipPenandatangan}</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // =====================================================================
  // RENDER SISWA & ORANG TUA / WALI VIEW
  // =====================================================================
  if (isSiswa || isOrtu) {
    const pengumumanList = letters.filter(
      (l) => l.kategori === 'Pengumuman Sekolah' && l.status === 'Terbit'
    );
    const myLetters = letters.filter((l) => l.kategori !== 'Pengumuman Sekolah');
    const selectedReqTpl =
      requestableTemplates.find((t) => t.id === reqTemplateId) || requestableTemplates[0];

    const handleSubmitStudentRequest = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedReqTpl) return;
      if (!linkedStudent) {
        onNotify('Akun Anda belum tertaut ke data peserta didik aktif. Hubungi Pengurus.', true);
        return;
      }
      const missing = selectedReqTpl.fields.filter(
        (f) => f.required && !(reqFields[f.key] || '').trim()
      );
      if (missing.length > 0) {
        onNotify(`Lengkapi isian wajib: ${missing.map((m) => m.label).join(', ')}`, true);
        return;
      }
      setSubmittingReq(true);
      try {
        const created = await onRequestLetter({
          templateId: selectedReqTpl.id,
          studentId: linkedStudent.id,
          perihal: selectedReqTpl.defaultPerihal,
          dynamicFields: reqFields,
        });
        if (created) {
          onNotify('Pengajuan surat berhasil dikirim ke Pengurus untuk diterbitkan.');
          setSiswaTab('riwayat');
        }
      } finally {
        setSubmittingReq(false);
      }
    };

    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              Layanan Surat &amp; Pengumuman Sekolah
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {linkedStudent
                ? `${linkedStudent.nama} · NIS ${linkedStudent.nis} · ${linkedStudent.kelas}`
                : isOrtu
                  ? 'Portal Orang Tua / Wali'
                  : 'Portal Peserta Didik'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setSiswaTab('pengumuman')}
              className={`px-3 py-1.5 rounded-md font-semibold whitespace-nowrap ${
                siswaTab === 'pengumuman' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Pengumuman ({pengumumanList.length})
            </button>
            <button
              type="button"
              onClick={() => setSiswaTab('ajukan')}
              className={`px-3 py-1.5 rounded-md font-semibold whitespace-nowrap ${
                siswaTab === 'ajukan' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Ajukan Surat ke Pengurus
            </button>
            <button
              type="button"
              onClick={() => setSiswaTab('riwayat')}
              className={`px-3 py-1.5 rounded-md font-semibold whitespace-nowrap ${
                siswaTab === 'riwayat' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Status & Unduh Surat ({myLetters.length})
            </button>
          </div>
        </div>

        {siswaTab === 'pengumuman' && (
          <div className="space-y-4">
            {pengumumanList.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
                Belum ada pengumuman resmi dari sekolah untuk kelas Anda saat ini.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pengumumanList.map((ann) => (
                  <div
                    key={ann.id}
                    className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-emerald-700">
                        <span className="inline-flex items-center gap-1 font-semibold">
                          <Megaphone className="w-3.5 h-3.5" />
                          {ann.subKategori || 'Pengumuman Resmi'}
                        </span>
                        <span>{formatTanggalID(ann.tanggalSurat)}</span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">{ann.perihal}</h3>
                      <p className="text-xs text-slate-600">Nomor: {ann.nomorSurat}</p>
                      <p className="text-[11px] text-slate-500">
                        Sasaran: {ann.targetAudience || 'Seluruh Siswa'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setPreviewLetter(ann)}
                        className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Eye className="w-3.5 h-3.5" /> Baca Pengumuman
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadPdf(ann)}
                        className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800"
                      >
                        <Download className="w-3.5 h-3.5" /> Unduh PDF
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {siswaTab === 'ajukan' && selectedReqTpl && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 space-y-2 max-h-[70vh] overflow-y-auto">
              <div className="text-xs font-bold text-slate-900 mb-2">
                Pilih Jenis Surat yang Dibutuhkan
              </div>
              {requestableTemplates.map((tpl) => {
                const active = tpl.id === selectedReqTpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => {
                      setReqTemplateId(tpl.id);
                      setReqFields(buildInitialFieldValues(tpl, undefined, linkedStudent || undefined));
                    }}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      active
                        ? 'border-emerald-700 bg-emerald-50/70'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-[10px] font-mono text-emerald-700">{tpl.kategori}</div>
                    <div className="text-xs font-bold text-slate-900 mt-0.5">{tpl.nama}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{tpl.deskripsi}</div>
                  </button>
                );
              })}
            </div>

            <form
              onSubmit={handleSubmitStudentRequest}
              className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4 text-xs"
            >
              <div>
                <div className="text-[11px] font-mono text-emerald-700">{selectedReqTpl.kategori}</div>
                <h2 className="text-sm font-bold text-slate-900">{selectedReqTpl.nama}</h2>
                <p className="text-slate-600 mt-0.5">{selectedReqTpl.deskripsi}</p>
              </div>

              {isOrtu && linkedStudentsForUser.length > 1 && (
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">
                    Pilih Peserta Didik (Anak) *
                  </label>
                  <select
                    value={linkedStudent?.id || ''}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setReqStudentId(nextId);
                      const nextStu = linkedStudentsForUser.find((s) => s.id === nextId);
                      setReqFields(buildInitialFieldValues(selectedReqTpl, undefined, nextStu));
                    }}
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 font-medium"
                  >
                    {linkedStudentsForUser.map((child) => (
                      <option key={child.id} value={child.id}>
                        {child.nama} — NIS {child.nis} ({child.kelas})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-3 border-t border-slate-200 pt-3">
                {selectedReqTpl.fields.map((field) => (
                  <div key={field.key}>
                    <label className="block font-semibold text-slate-800 mb-1">
                      {field.label} {field.required && <span className="text-red-600">*</span>}
                    </label>
                    {field.type === 'textarea' ? (
                      <textarea
                        rows={3}
                        required={field.required}
                        value={reqFields[field.key] || ''}
                        onChange={(e) =>
                          setReqFields((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        placeholder={field.placeholder}
                        className="w-full rounded-lg border border-slate-300 p-2.5"
                      />
                    ) : field.type === 'select' ? (
                      <select
                        value={reqFields[field.key] || ''}
                        onChange={(e) =>
                          setReqFields((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5"
                      >
                        {(field.options || []).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                        required={field.required}
                        value={reqFields[field.key] || ''}
                        onChange={(e) =>
                          setReqFields((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        placeholder={field.placeholder}
                        className="w-full h-9 rounded-lg border border-slate-300 px-3"
                      />
                    )}
                    {field.helper && <p className="text-[11px] text-slate-500 mt-0.5">{field.helper}</p>}
                  </div>
                ))}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={submittingReq}
                  className="inline-flex items-center gap-1.5 h-9 px-5 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {submittingReq ? 'Mengirim Pengajuan...' : 'Kirim Pengajuan ke Pengurus'}
                </button>
              </div>
            </form>
          </div>
        )}

        {siswaTab === 'riwayat' && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {myLetters.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Belum ada riwayat pengajuan atau surat yang diterbitkan untuk Anda.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {myLetters.map((l) => (
                  <div
                    key={l.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900">{l.templateNama}</span>
                        <span
                          className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${
                            STATUS_BADGE_CLASS[l.status]
                          }`}
                        >
                          {l.status}
                        </span>
                      </div>
                      <div className="text-slate-600">
                        {l.nomorSurat ? `Nomor: ${l.nomorSurat} · ` : ''}
                        Tanggal: {formatTanggalID(l.tanggalSurat)}
                      </div>
                      {l.catatanPengurus && (
                        <div className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded px-2.5 py-1">
                          <strong>Catatan Pengurus:</strong> {l.catatanPengurus}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setPreviewLetter(l)}
                        className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-slate-300 font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Eye className="w-3.5 h-3.5" /> Pratinjau
                      </button>
                      {l.status === 'Terbit' && (
                        <button
                          type="button"
                          onClick={() => handleDownloadPdf(l)}
                          className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-emerald-700 font-semibold text-white hover:bg-emerald-800"
                        >
                          <Download className="w-3.5 h-3.5" /> Unduh PDF Resmi
                        </button>
                      )}
                      {l.status === 'Menunggu Persetujuan' && (
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await onDeleteLetter(l.id);
                            if (ok) onNotify('Pengajuan surat dibatalkan.');
                          }}
                          className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Batalkan
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {previewLetter && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
            <div className="bg-slate-100 border border-slate-200 rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-xl">
              <div className="px-5 py-3.5 bg-white border-b border-slate-200 flex items-center justify-between rounded-t-xl">
                <div className="font-bold text-sm text-slate-900">{previewLetter.templateNama}</div>
                <div className="flex items-center gap-2">
                  {previewLetter.status === 'Terbit' && (
                    <button
                      type="button"
                      onClick={() => handleDownloadPdf(previewLetter)}
                      className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800"
                    >
                      <Download className="w-3.5 h-3.5" /> Unduh PDF
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPreviewLetter(null)}
                    className="p-1 text-slate-400 hover:text-slate-900"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="p-5 overflow-y-auto">{renderLetterPaper(previewLetter)}</div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =====================================================================
  // RENDER ORTU / GURU / WALI KELAS (READ-ONLY) VIEW
  // =====================================================================
  if (!isAdmin) {
    const visibleLetters = letters.filter((l) => l.status === 'Terbit');
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h1 className="text-lg font-bold text-slate-900">
            Pengumuman & Surat Resmi Lembaga
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {isOrtu
              ? 'Menampilkan pengumuman sekolah serta surat keterangan resmi putra/putri Anda yang telah terbit.'
              : 'Menampilkan pengumuman sekolah dan surat tugas/kepegawaian resmi yang diterbitkan Pengurus.'}
          </p>
        </div>

        {visibleLetters.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
            Belum ada surat atau pengumuman resmi yang diterbitkan.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleLetters.map((l) => (
              <div
                key={l.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-emerald-700">
                    <span>{l.subKategori || l.kategori}</span>
                    <span>{formatTanggalID(l.tanggalSurat)}</span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">{l.perihal || l.templateNama}</h3>
                  <p className="text-xs text-slate-600">
                    Nomor: {l.nomorSurat}
                    {l.studentName ? ` · Siswa: ${l.studentName}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setPreviewLetter(l)}
                    className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Eye className="w-3.5 h-3.5" /> Pratinjau
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadPdf(l)}
                    className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800"
                  >
                    <Download className="w-3.5 h-3.5" /> Unduh PDF
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {previewLetter && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
            <div className="bg-slate-100 border border-slate-200 rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-xl">
              <div className="px-5 py-3.5 bg-white border-b border-slate-200 flex items-center justify-between rounded-t-xl">
                <div className="font-bold text-sm text-slate-900">{previewLetter.templateNama}</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadPdf(previewLetter)}
                    className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800"
                  >
                    <Download className="w-3.5 h-3.5" /> Unduh PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewLetter(null)}
                    className="p-1 text-slate-400 hover:text-slate-900"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="p-5 overflow-y-auto">{renderLetterPaper(previewLetter)}</div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =====================================================================
  // RENDER ADMIN (PENGURUS) VIEW
  // =====================================================================
  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            Sistem Administrasi Surat & Pengumuman Sekolah
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            41 template surat terstruktur (Internal, Eksternal, Mutasi/SKL, Pengumuman Siswa, Kepegawaian, Kemitraan, Sarpras, Dinas) dengan penomoran otomatis, penerbitan dari pengajuan siswa, dan PDF Kop Surat resmi.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs shrink-0">
          <button
            type="button"
            onClick={() => setAdminTab('requests')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold whitespace-nowrap ${
              adminTab === 'requests' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Pengajuan Siswa ({pendingLetters.length})
          </button>
          <button
            type="button"
            onClick={() => setAdminTab('compose')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold whitespace-nowrap ${
              adminTab === 'compose' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            <FilePlus2 className="w-3.5 h-3.5 text-emerald-700" />
            {editingLetterId ? 'Edit Surat' : 'Buat Surat / Pengumuman'}
          </button>
          <button
            type="button"
            onClick={() => setAdminTab('archive')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold whitespace-nowrap ${
              adminTab === 'archive' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-slate-600" />
            Arsip ({letters.length})
          </button>
        </div>
      </div>

      {/* TAB 1: PENGAJUAN SISWA */}
      {adminTab === 'requests' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {pendingLetters.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 space-y-2">
              <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto" />
              <div className="font-semibold text-slate-800">
                Tidak ada pengajuan surat siswa yang menunggu persetujuan.
              </div>
              <p>
                Pengajuan surat yang dikirim siswa dari Portal Siswa akan otomatis masuk ke daftar ini untuk Anda terbitkan.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {pendingLetters.map((req) => (
                <div
                  key={req.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">{req.templateNama}</span>
                      <span className="px-2 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-200 text-[11px] font-semibold">
                        Menunggu Persetujuan
                      </span>
                    </div>
                    <div className="text-slate-600">
                      Pemohon: <strong>{req.studentName || req.requestedByName || '-'}</strong>{' '}
                      {req.studentNis ? `(NIS ${req.studentNis} · ${req.studentKelas})` : ''} · Diajukan{' '}
                      {formatTanggalID(req.tanggalSurat)}
                    </div>
                    <div className="text-[11px] text-slate-500 line-clamp-1">
                      {Object.entries(req.dynamicFields || {})
                        .filter(([, v]) => Boolean(v))
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(' · ')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openReviewRequestModal(req)}
                      className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-700 font-semibold text-white hover:bg-emerald-800"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" /> Tinjau & Terbitkan
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: BUAT SURAT / PENGUMUMAN */}
      {adminTab === 'compose' && (
        <div className="space-y-5">
          {/* Category Pills Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="text-xs font-bold text-slate-900">1. Pilih Kategori & Jenis Surat</div>
            <div className="flex flex-wrap gap-1.5">
              {LETTER_CATEGORIES.map((cat) => {
                const count = getTemplatesByCategory(cat).length;
                const active = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(cat);
                      const first = getTemplatesByCategory(cat)[0];
                      if (first) selectTemplate(first);
                    }}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
              {categoryTemplates.map((tpl) => {
                const active = tpl.id === activeTemplate.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => selectTemplate(tpl)}
                    className={`text-left p-3 rounded-lg border transition-colors flex flex-col justify-between gap-1.5 ${
                      active
                        ? 'border-emerald-700 bg-emerald-50/70'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 text-[10px] font-mono">
                        <span className="text-emerald-800 font-semibold">{tpl.kodeNomor}</span>
                        {tpl.studentRequestable && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700">
                            Ajuan Siswa
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-bold text-slate-900 mt-1">{tpl.nama}</div>
                      {tpl.subKategori && (
                        <div className="text-[10px] text-emerald-700 font-medium">
                          {tpl.subKategori}
                        </div>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 line-clamp-2">{tpl.deskripsi}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dynamic Input + Live Kop Preview */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            <div className="xl:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <div className="text-[11px] font-mono text-emerald-700">
                    2. Input Poin-Poin Dinamis ({activeTemplate.kodeNomor})
                  </div>
                  <h2 className="text-sm font-bold text-slate-900">{activeTemplate.nama}</h2>
                </div>
                {editingLetterId && (
                  <button
                    type="button"
                    onClick={() => selectTemplate(activeTemplate)}
                    className="text-[11px] text-slate-500 hover:text-slate-900 underline"
                  >
                    Batal Edit
                  </button>
                )}
              </div>

              {(activeTemplate.requiresStudent ||
                activeTemplate.kategori === 'Keperluan Internal Sekolah' ||
                activeTemplate.kategori === 'Mutasi, Kelulusan & Layanan Khusus') && (
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">
                    Peserta Didik Terkait {activeTemplate.requiresStudent && '*'}
                  </label>
                  <select
                    value={formStudentId}
                    onChange={(e) => {
                      const sid = e.target.value;
                      setFormStudentId(sid);
                      const stu = state.students.find((s) => s.id === sid);
                      if (stu && activeTemplate.fields.some((f) => f.key === 'namaWaliPemohon')) {
                        setFormFields((prev) => ({
                          ...prev,
                          namaWaliPemohon:
                            prev.namaWaliPemohon || stu.namaWali || stu.namaAyah || '',
                        }));
                      }
                    }}
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5"
                  >
                    {!activeTemplate.requiresStudent && <option value="">-- Tidak Tertaut Siswa --</option>}
                    {state.students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nama} ({s.kelas} · NIS {s.nis})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">Tanggal Surat *</label>
                  <input
                    type="date"
                    value={formTanggal}
                    onChange={(e) => setFormTanggal(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">
                    Nomor Surat (Kosong = Otomatis)
                  </label>
                  <input
                    type="text"
                    value={formNomor}
                    onChange={(e) => setFormNomor(e.target.value)}
                    placeholder={autoNomorPreview}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-800 mb-1">Perihal / Judul Surat *</label>
                  <input
                    type="text"
                    value={formPerihal}
                    onChange={(e) => setFormPerihal(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
              </div>

              {activeTemplate.formatLayout === 'pengumuman' && (
                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 space-y-2.5">
                  <div>
                    <label className="block font-semibold text-slate-800 mb-1">
                      Sasaran Pengumuman
                    </label>
                    <input
                      type="text"
                      value={formTargetAudience}
                      onChange={(e) => setFormTargetAudience(e.target.value)}
                      className="w-full h-8 rounded border border-slate-300 bg-white px-2.5"
                    />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800 mb-1">
                      Cakupan Kelas (Kosongkan = Semua Kelas)
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {state.classes.map((cls) => {
                        const checked = formTargetClasses.includes(cls);
                        return (
                          <button
                            key={cls}
                            type="button"
                            onClick={() =>
                              setFormTargetClasses((prev) =>
                                checked ? prev.filter((c) => c !== cls) : [...prev, cls]
                              )
                            }
                            className={`px-2 py-1 rounded border text-[11px] font-medium ${
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
                </div>
              )}

              {activeTemplate.formatLayout === 'surat_resmi' && (
                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Jabatan Penerima
                    </label>
                    <input
                      type="text"
                      value={formPenerimaJabatan}
                      onChange={(e) => setFormPenerimaJabatan(e.target.value)}
                      placeholder="Mis. Kepala Dinas / HRD"
                      className="w-full h-8 rounded border border-slate-300 bg-white px-2"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Nama Penerima
                    </label>
                    <input
                      type="text"
                      value={formPenerimaNama}
                      onChange={(e) => setFormPenerimaNama(e.target.value)}
                      placeholder="Opsional"
                      className="w-full h-8 rounded border border-slate-300 bg-white px-2"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Instansi / Tujuan
                    </label>
                    <input
                      type="text"
                      value={formPenerimaInstansi}
                      onChange={(e) => setFormPenerimaInstansi(e.target.value)}
                      placeholder="Nama Instansi"
                      className="w-full h-8 rounded border border-slate-300 bg-white px-2"
                    />
                  </div>
                </div>
              )}

              {/* Template-specific Dynamic Fields */}
              <div className="space-y-3 border-t border-slate-200 pt-3">
                {activeTemplate.fields.map((field) => (
                  <div key={field.key}>
                    <label className="block font-semibold text-slate-800 mb-1">
                      {field.label} {field.required && <span className="text-red-600">*</span>}
                    </label>
                    {field.type === 'textarea' ? (
                      <textarea
                        rows={3}
                        value={formFields[field.key] || ''}
                        onChange={(e) =>
                          setFormFields((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        placeholder={field.placeholder}
                        className="w-full rounded-lg border border-slate-300 p-2.5"
                      />
                    ) : field.type === 'select' ? (
                      <select
                        value={formFields[field.key] || ''}
                        onChange={(e) =>
                          setFormFields((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5"
                      >
                        {(field.options || []).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                        value={formFields[field.key] || ''}
                        onChange={(e) =>
                          setFormFields((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        placeholder={field.placeholder}
                        className="w-full h-9 rounded-lg border border-slate-300 px-3"
                      />
                    )}
                    {field.helper && <p className="text-[11px] text-slate-500 mt-0.5">{field.helper}</p>}
                  </div>
                ))}
              </div>

              {/* Penandatangan */}
              <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Penandatangan
                  </label>
                  <input
                    type="text"
                    value={formSignerName}
                    onChange={(e) => setFormSignerName(e.target.value)}
                    className="w-full h-8 rounded border border-slate-300 bg-white px-2"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Jabatan
                  </label>
                  <input
                    type="text"
                    value={formSignerTitle}
                    onChange={(e) => setFormSignerTitle(e.target.value)}
                    className="w-full h-8 rounded border border-slate-300 bg-white px-2"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    NIP / NUPTK
                  </label>
                  <input
                    type="text"
                    value={formSignerNip}
                    onChange={(e) => setFormSignerNip(e.target.value)}
                    className="w-full h-8 rounded border border-slate-300 bg-white px-2"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  disabled={savingForm}
                  onClick={() => handleDownloadPdf(composerDraftPreview)}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Download className="w-3.5 h-3.5" /> Unduh Pratinjau PDF
                </button>
                <button
                  type="button"
                  disabled={savingForm}
                  onClick={() => handleSaveComposer('Draft')}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-slate-300 bg-white font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  Simpan Draft
                </button>
                <button
                  type="button"
                  disabled={savingForm}
                  onClick={() => handleSaveComposer('Terbit')}
                  className="inline-flex items-center gap-1.5 h-9 px-5 rounded-lg bg-emerald-700 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  <FileCheck2 className="w-3.5 h-3.5" />
                  {savingForm ? 'Menerbitkan...' : 'Terbitkan Surat Resmi'}
                </button>
              </div>
            </div>

            <div className="xl:col-span-6 space-y-2">
              <div className="text-xs font-bold text-slate-800 flex items-center justify-between px-1">
                <span>Pratinjau Dokumen Resmi (Kop Surat Lembaga)</span>
                <span className="font-mono text-[11px] text-emerald-700">
                  {formNomor.trim() || autoNomorPreview}
                </span>
              </div>
              {renderLetterPaper(composerDraftPreview)}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ARSIP SURAT & PENGUMUMAN */}
      {adminTab === 'archive' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3 text-xs">
            <select
              value={archiveCategory}
              onChange={(e) => setArchiveCategory(e.target.value as 'Semua' | LetterCategory)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 font-medium"
            >
              <option value="Semua">Semua Kategori</option>
              {LETTER_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={archiveStatus}
              onChange={(e) => setArchiveStatus(e.target.value as 'Semua' | LetterStatus)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 font-medium"
            >
              <option value="Semua">Semua Status</option>
              <option value="Terbit">Terbit</option>
              <option value="Menunggu Persetujuan">Menunggu Persetujuan</option>
              <option value="Draft">Draft</option>
              <option value="Ditolak">Ditolak</option>
            </select>
            <input
              type="text"
              value={archiveSearch}
              onChange={(e) => setArchiveSearch(e.target.value)}
              placeholder="Cari nomor surat, perihal, nama siswa, atau instansi..."
              className="flex-1 min-w-[220px] h-9 rounded-lg border border-slate-300 px-3"
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {filteredArchive.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Belum ada arsip surat pada filter ini.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Nomor & Tanggal</th>
                      <th className="px-3 py-3">Jenis & Perihal</th>
                      <th className="px-3 py-3">Terkait</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredArchive.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50/70 align-top">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-mono font-semibold text-slate-900">
                            {l.nomorSurat || '(Belum Bernomor)'}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {formatTanggalID(l.tanggalSurat)}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-bold text-slate-900">{l.templateNama}</div>
                          <div className="text-slate-600">{l.perihal}</div>
                          <div className="text-[11px] text-emerald-700">{l.kategori}</div>
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {l.studentName || l.penerimaInstansi || l.targetAudience || '-'}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${
                              STATUS_BADGE_CLASS[l.status]
                            }`}
                          >
                            {l.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap space-x-1.5">
                          <button
                            type="button"
                            onClick={() => setPreviewLetter(l)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Eye className="w-3.5 h-3.5" /> Pratinjau
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadPdf(l)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-700 font-semibold text-white hover:bg-emerald-800"
                          >
                            <Download className="w-3.5 h-3.5" /> PDF
                          </button>
                          <button
                            type="button"
                            onClick={() => loadLetterToComposer(l)}
                            className="p-1.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-100"
                            title="Edit surat"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const ok = await onDeleteLetter(l.id);
                              if (ok) onNotify('Surat dihapus dari arsip.');
                            }}
                            className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                            title="Hapus surat"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
      )}

      {/* MODAL REVIEW PENGAJUAN SISWA */}
      {reviewingReq && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <div className="text-[11px] font-mono text-amber-700 font-semibold">
                  Pengajuan Surat Peserta Didik / Wali
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  {reviewingReq.templateNama} — {reviewingReq.studentName || reviewingReq.requestedByName}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRevShowPreview((v) => !v)}
                  className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Eye className="w-3.5 h-3.5" />
                  {revShowPreview ? 'Kembali ke Form' : 'Pratinjau Kop Surat'}
                </button>
                <button
                  type="button"
                  onClick={() => setReviewingReq(null)}
                  className="p-1 text-slate-400 hover:text-slate-900"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {revShowPreview ? (
                <div className="bg-slate-100 rounded-xl p-4">
                  {renderLetterPaper({
                    ...reviewingReq,
                    nomorSurat: revNomor.trim() || reviewingReq.nomorSurat,
                    perihal: revPerihal.trim() || reviewingReq.perihal,
                    dynamicFields: revFields,
                    penandatanganNama: settings.kepalaSekolah || 'Kepala Satuan Pendidikan',
                    penandatanganJabatan:
                      settings.jenisLembaga === 'PKBM'
                        ? 'Ketua / Kepala PKBM'
                        : `Kepala ${settings.jenisLembaga}`,
                    penandatanganNip: settings.nipKepalaSekolah || '-',
                    status: 'Terbit',
                  })}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-800 mb-1">
                        Nomor Surat Terbit *
                      </label>
                      <input
                        type="text"
                        value={revNomor}
                        onChange={(e) => setRevNomor(e.target.value)}
                        className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-800 mb-1">Perihal</label>
                      <input
                        type="text"
                        value={revPerihal}
                        onChange={(e) => setRevPerihal(e.target.value)}
                        className="w-full h-9 rounded-lg border border-slate-300 px-3"
                      />
                    </div>
                  </div>

                  <div className="space-y-3 border-t border-slate-200 pt-3">
                    {(getLetterTemplateById(reviewingReq.templateId)?.fields || []).map((field) => (
                      <div key={field.key}>
                        <label className="block font-semibold text-slate-800 mb-1">{field.label}</label>
                        {field.type === 'textarea' ? (
                          <textarea
                            rows={2}
                            value={revFields[field.key] || ''}
                            onChange={(e) =>
                              setRevFields((prev) => ({ ...prev, [field.key]: e.target.value }))
                            }
                            className="w-full rounded-lg border border-slate-300 p-2.5"
                          />
                        ) : field.type === 'select' ? (
                          <select
                            value={revFields[field.key] || ''}
                            onChange={(e) =>
                              setRevFields((prev) => ({ ...prev, [field.key]: e.target.value }))
                            }
                            className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5"
                          >
                            {(field.options || []).map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                            value={revFields[field.key] || ''}
                            onChange={(e) =>
                              setRevFields((prev) => ({ ...prev, [field.key]: e.target.value }))
                            }
                            className="w-full h-9 rounded-lg border border-slate-300 px-3"
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-800 mb-1">
                      Catatan Pengurus (Untuk Siswa / Orang Tua)
                    </label>
                    <input
                      type="text"
                      value={revCatatan}
                      onChange={(e) => setRevCatatan(e.target.value)}
                      placeholder="Mis. Surat sudah terbit dan dapat diunduh langsung dalam format PDF."
                      className="w-full h-9 rounded-lg border border-slate-300 px-3"
                    />
                  </div>
                </>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  disabled={processingReview}
                  onClick={() => handleConfirmReviewRequest('reject')}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-red-300 text-red-700 font-semibold hover:bg-red-50 disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" /> Tolak Pengajuan
                </button>
                <button
                  type="button"
                  disabled={processingReview}
                  onClick={() => handleConfirmReviewRequest('issue')}
                  className="inline-flex items-center gap-1.5 h-9 px-5 rounded-lg bg-emerald-700 text-white font-semibold hover:bg-emerald-800 disabled:opacity-50"
                >
                  <FileCheck2 className="w-3.5 h-3.5" />
                  {processingReview ? 'Menerbitkan...' : 'Setujui & Terbitkan Surat'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PRATINJAU SURAT */}
      {previewLetter && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-slate-100 border border-slate-200 rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-xl">
            <div className="px-5 py-3.5 bg-white border-b border-slate-200 flex items-center justify-between rounded-t-xl">
              <div className="font-bold text-sm text-slate-900">
                {previewLetter.templateNama} ({previewLetter.status})
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadPdf(previewLetter)}
                  className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  <Download className="w-3.5 h-3.5" /> Unduh PDF Resmi
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewLetter(null)}
                  className="p-1 text-slate-400 hover:text-slate-900"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-5 overflow-y-auto">{renderLetterPaper(previewLetter)}</div>
          </div>
        </div>
      )}
    </div>
  );
};
