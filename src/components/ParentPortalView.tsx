import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Download,
  ExternalLink,
  MessageSquare,
  QrCode,
  Search,
  Send,
  User,
} from 'lucide-react';
import QRCode from 'qrcode';
import { AppState, ParentFeedback, UserAccount } from '../types';
import {
  calculateClassLeger,
  calculateStudentSubjectGrade,
  formatTanggalID,
  getSubjectCPsForClass,
  getSubjectsForClass,
  gradeKey,
  metaKey,
  PREDIKAT_LABELS,
  validatePortfolioUrl,
} from '../utils/academic';
import { generateRaporPDF } from '../utils/pdf';

interface ParentPortalViewProps {
  state: AppState;
  currentUser: UserAccount;
  selectedClass: string;
  onSubmitParentFeedback?: (payload: {
    studentId: string;
    konfirmasiStatus: ParentFeedback['konfirmasiStatus'];
    tanggapan: string;
  }) => Promise<boolean>;
  onCreateTutoringRequests?: (payload: {
    studentId: string;
    subjectId: string;
    cpId: string;
    tpIds: string[];
    alasan: string;
    tanggalAjuan: string;
    recommendationId?: string;
  }) => Promise<boolean>;
  onOpenPenghubung?: () => void;
  onOpenLms?: () => void;
  onOpenSurveys?: () => void;
  activeStudentId?: string;
  onChangeActiveStudentId?: (studentId: string) => void;
  onNotify?: (msg: string, isError?: boolean) => void;
}

const KONFIRMASI_OPTIONS: ParentFeedback['konfirmasiStatus'][] = [
  'Sudah Membaca & Memahami',
  'Perlu Konsultasi Wali Kelas',
  'Apresiasi & Dukungan',
];

export const ParentPortalView: React.FC<ParentPortalViewProps> = ({
  state,
  currentUser,
  selectedClass,
  onSubmitParentFeedback,
  onCreateTutoringRequests,
  onOpenPenghubung,
  onOpenLms,
  onOpenSurveys,
  activeStudentId,
  onChangeActiveStudentId,
  onNotify,
}) => {
  const isOrtu = currentUser.role === 'ortu';
  const linkedIds = currentUser.linkedStudentIds || [];

  const availableStudents = isOrtu
    ? state.students.filter((s) => linkedIds.includes(s.id))
    : state.students.filter((s) => s.status === 'Aktif');

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(
    (activeStudentId && availableStudents.some((s) => s.id === activeStudentId)
      ? activeStudentId
      : availableStudents.find((s) => s.kelas === selectedClass)?.id) ||
      availableStudents[0]?.id ||
      ''
  );
  const [qrUrl, setQrUrl] = useState('');
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Parent feedback / confirmation form
  const [konfirmasiStatus, setKonfirmasiStatus] = useState<ParentFeedback['konfirmasiStatus']>(
    'Sudah Membaca & Memahami'
  );
  const [tanggapan, setTanggapan] = useState('');
  const [submittingFb, setSubmittingFb] = useState(false);

  // Bimbingan Belajar CP & TP state
  const [bimbinganSubjectId, setBimbinganSubjectId] = useState('');
  const [bimbinganCpId, setBimbinganCpId] = useState('');
  const [bimbinganTpIds, setBimbinganTpIds] = useState<string[]>([]);
  const [bimbinganAlasan, setBimbinganAlasan] = useState('');
  const [bimbinganTanggal, setBimbinganTanggal] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [bimbinganRecId, setBimbinganRecId] = useState<string | undefined>(undefined);
  const [submittingBimbingan, setSubmittingBimbingan] = useState(false);

  useEffect(() => {
    if (activeStudentId && availableStudents.some((s) => s.id === activeStudentId)) {
      setSelectedId(activeStudentId);
    } else if (availableStudents.length > 0 && !availableStudents.some((s) => s.id === selectedId)) {
      setSelectedId(availableStudents[0].id);
    }
  }, [activeStudentId, availableStudents, selectedId]);

  const filteredList = availableStudents.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return s.nama.toLowerCase().includes(q) || s.nis.toLowerCase().includes(q);
  });

  const stu =
    filteredList.find((s) => s.id === selectedId) ||
    availableStudents.find((s) => s.id === selectedId) ||
    availableStudents[0];

  useEffect(() => {
    if (!stu) return;
    const payload =
      stu.portfolioFolderUrl?.trim() ||
      `SIM-RAPOR-PORTFOLIO|${stu.nis}|${stu.nama}|${stu.kelas}`;
    QRCode.toDataURL(payload, { margin: 1, width: 130 })
      .then(setQrUrl)
      .catch(() => setQrUrl(''));
  }, [stu]);

  if (!stu) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-xs text-slate-500">
        {isOrtu
          ? 'Akun Orang Tua Anda belum ditautkan ke data siswa. Hubungi Pengurus PKBM untuk menautkan NIS anak Anda.'
          : 'Belum ada data peserta didik aktif.'}
      </div>
    );
  }

  const semester = state.settings.semester;
  const stuSubjects = getSubjectsForClass(
    state.subjects,
    stu.kelas,
    state.classDefs,
    stu.jurusan || 'Umum'
  );
  const legerRows = calculateClassLeger(
    state.students,
    state.subjects,
    state.grades,
    state.settings,
    semester,
    stu.kelas,
    'SAS',
    state.classDefs
  );
  const myLeger = legerRows.find((r) => r.student.id === stu.id);
  const meta = state.reportMeta[metaKey(stu.id, semester)];
  const profilLulusanList = state.p5Projects.filter(
    (p) => p.studentId === stu.id && p.semester === semester
  );
  const bkNotes = state.counselingNotes.filter((n) => n.studentId === stu.id && n.tampilDiOrtu);
  const stuFeedbacks = (state.parentFeedbacks || []).filter((f) => f.studentId === stu.id);
  const stuRecommendations = (state.tutoringRecommendations || []).filter(
    (r) => r.studentId === stu.id
  );
  const stuTutoringRequests = (state.tutoringRequests || []).filter((r) => r.studentId === stu.id);

  const activeBimbinganSubject =
    stuSubjects.find((s) => s.id === bimbinganSubjectId) || stuSubjects[0];
  const subjectCPs = activeBimbinganSubject
    ? getSubjectCPsForClass(activeBimbinganSubject, stu.kelas, state.classDefs)
    : [];
  const activeBimbinganCP =
    subjectCPs.find((c) => c.id === bimbinganCpId) || subjectCPs[0] || null;
  const activeGradeEntry = activeBimbinganSubject
    ? state.grades[gradeKey(stu.id, activeBimbinganSubject.id, semester)]
    : undefined;

  const tuntasCount = stuSubjects.filter((subj) => {
    const entry = state.grades[gradeKey(stu.id, subj.id, semester)];
    return calculateStudentSubjectGrade(entry, subj, state.settings, stu.kelas, state.classDefs)
      .tuntas;
  }).length;

  const safeFolder = stu.portfolioFolderUrl ? validatePortfolioUrl(stu.portfolioFolderUrl) : null;

  const handleDownloadRapor = async () => {
    setDownloadingPdf(true);
    try {
      const doc = await generateRaporPDF(stu, state, 'SAS');
      doc.save(`Rapor_${stu.nama.replace(/\s+/g, '_')}_S${semester}.pdf`);
      onNotify?.(`Rapor PDF ${stu.nama} berhasil diunduh.`);
    } catch {
      onNotify?.('Gagal mengunduh PDF rapor.', true);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSubmitParentFeedback) return;
    setSubmittingFb(true);
    try {
      const ok = await onSubmitParentFeedback({
        studentId: stu.id,
        konfirmasiStatus,
        tanggapan: tanggapan.trim(),
      });
      if (ok) {
        setTanggapan('');
        onNotify?.('Tanggapan & konfirmasi orang tua berhasil dikirim ke sekolah.');
      } else {
        onNotify?.('Gagal mengirim tanggapan orang tua.', true);
      }
    } finally {
      setSubmittingFb(false);
    }
  };

  const handleApplyRecommendation = (rec: (typeof stuRecommendations)[number]) => {
    setBimbinganSubjectId(rec.subjectId);
    setBimbinganCpId(rec.cpId);
    setBimbinganTpIds(rec.tpId ? [rec.tpId] : []);
    setBimbinganRecId(rec.id);
    setBimbinganAlasan(
      `Menindaklanjuti rekomendasi ${rec.recommendedByName}: ${rec.rekomendasiGuru}`
    );
    setBimbinganTanggal(new Date().toISOString().slice(0, 10));
    onNotify?.('Data rekomendasi guru dimuat ke formulir ajuan bimbingan di bawah.');
  };

  const handleSubmitBimbingan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateTutoringRequests || !activeBimbinganSubject || !activeBimbinganCP) {
      onNotify?.('Pilih mata pelajaran dan Capaian Pembelajaran (CP) terlebih dahulu.', true);
      return;
    }
    if (!bimbinganAlasan.trim()) {
      onNotify?.('Tuliskan alasan atau materi yang belum dipahami anak.', true);
      return;
    }
    setSubmittingBimbingan(true);
    try {
      const ok = await onCreateTutoringRequests({
        studentId: stu.id,
        subjectId: activeBimbinganSubject.id,
        cpId: activeBimbinganCP.id,
        tpIds: bimbinganTpIds,
        alasan: bimbinganAlasan.trim(),
        tanggalAjuan: bimbinganTanggal,
        recommendationId: bimbinganRecId,
      });
      if (ok) {
        setBimbinganAlasan('');
        setBimbinganTpIds([]);
        setBimbinganRecId(undefined);
        onNotify?.('Ajuan bimbingan belajar berhasil dikirim ke Guru & Pengurus sekolah.');
      }
    } finally {
      setSubmittingBimbingan(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-16 rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center overflow-hidden shrink-0">
            {stu.fotoDataUrl ? (
              <img src={stu.fotoDataUrl} alt={stu.nama} className="w-full h-full object-cover" />
            ) : (
              <User className="w-6 h-6 text-slate-400" />
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-emerald-700">
              Portal Orang Tua / Wali · {state.settings.namaSekolah}
            </p>
            <h2 className="text-xl font-bold text-slate-900 mt-0.5">
              Laporan Perkembangan Belajar: {stu.nama}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {stu.kelas}
              {stu.jurusan && stu.jurusan !== 'Umum' ? ` (${stu.jurusan})` : ''} · {stu.fase} · NIS{' '}
              {stu.nis} · Wali: {stu.namaWali || stu.namaAyah || '-'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {(!isOrtu || availableStudents.length > 1) && (
            <>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari nama / NIS anak..."
                  className="h-9 w-44 pl-8 pr-3 rounded-lg border border-slate-300 text-xs focus:border-emerald-700 focus:outline-none"
                />
              </div>
              <select
                value={stu.id}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                  onChangeActiveStudentId?.(e.target.value);
                }}
                className="h-9 min-w-[190px] rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium"
              >
                {(filteredList.length > 0 ? filteredList : availableStudents).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nama} ({s.kelas})
                  </option>
                ))}
              </select>
            </>
          )}

          <button
            type="button"
            disabled={downloadingPdf}
            onClick={handleDownloadRapor}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            {downloadingPdf ? 'Menyusun PDF...' : 'Unduh Rapor PDF'}
          </button>

          {onOpenSurveys && (
            <button
              type="button"
              onClick={onOpenSurveys}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-emerald-700 bg-emerald-50 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 whitespace-nowrap shrink-0"
            >
              <BookOpen className="w-3.5 h-3.5 text-emerald-700" />
              Survei Literasi & Ortu
            </button>
          )}

          {onOpenLms && (
            <button
              type="button"
              onClick={onOpenLms}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <BookOpen className="w-3.5 h-3.5 text-emerald-700" />
              Pantau LMS Anak
            </button>
          )}

          {onOpenPenghubung && (
            <button
              type="button"
              onClick={onOpenPenghubung}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <MessageSquare className="w-3.5 h-3.5 text-emerald-700" />
              Buku Penghubung
            </button>
          )}
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Rata-rata Nilai Ananda</div>
          <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
            {myLeger ? myLeger.rataRata.toFixed(2) : '-'}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Ketuntasan Mata Pelajaran</div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {tuntasCount} / {stuSubjects.length}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Posisi / Peringkat Kelas</div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            #{myLeger?.peringkat || '-'}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Ketidakhadiran Semester Ini</div>
          <div className="text-sm font-mono tabular-nums font-semibold text-slate-900 mt-2">
            S:{meta?.absensi.sakit ?? 0} · I:{meta?.absensi.izin ?? 0} · A:{meta?.absensi.alpha ?? 0}
          </div>
        </div>
      </div>

      {/* Detailed Grades Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">
            Laporan Rapor — Rincian Nilai & Capaian Kompetensi
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-4 py-3">Mata Pelajaran</th>
                <th className="px-3 py-3 text-center font-mono">Tugas</th>
                <th className="px-3 py-3 text-center font-mono">Kuis</th>
                <th className="px-3 py-3 text-center font-mono">Ujian</th>
                <th className="px-3 py-3 text-center font-mono font-bold text-slate-900">
                  Nilai Akhir
                </th>
                <th className="px-3 py-3 text-center">Predikat</th>
                <th className="px-4 py-3">Capaian Belajar Ananda</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {stuSubjects.map((subj) => {
                const entry = state.grades[gradeKey(stu.id, subj.id, semester)];
                const calc = calculateStudentSubjectGrade(
                  entry,
                  subj,
                  state.settings,
                  stu.kelas,
                  state.classDefs
                );
                return (
                  <tr key={subj.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{subj.nama}</td>
                    <td className="px-3 py-3 text-center font-mono">{calc.tugas ?? '-'}</td>
                    <td className="px-3 py-3 text-center font-mono">{calc.kuis ?? '-'}</td>
                    <td className="px-3 py-3 text-center font-mono">{calc.ujian ?? '-'}</td>
                    <td className="px-3 py-3 text-center font-mono font-bold text-emerald-700">
                      {calc.nilaiAkhir ?? '-'}
                    </td>
                    <td className="px-3 py-3 text-center font-mono font-semibold">
                      {calc.predikat}
                    </td>
                    <td className="px-4 py-3 text-slate-600 leading-relaxed">
                      <div>{calc.deskripsiFinal || '-'}</div>
                      {entry?.catatanGuru && (
                        <div className="text-emerald-800 font-medium mt-1">
                          Catatan Guru: {entry.catatanGuru}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bimbingan Belajar CP & TP + Rekomendasi Guru */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 text-xs">
        <div className="border-b border-slate-200 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <BookOpen className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Pengajuan Bimbingan Belajar (CP & TP) & Rekomendasi Guru
              </h3>
              <p className="text-slate-500 mt-0.5">
                Pilih mata pelajaran untuk melihat seluruh CP & TP yang dipelajari, lalu ajukan bimbingan belajar untuk materi yang masih belum dipahami atau berdasarkan rekomendasi guru.
              </p>
            </div>
          </div>
          <span className="font-mono text-[11px] font-semibold text-slate-600 tabular-nums shrink-0">
            {stuRecommendations.length} Rekomendasi · {stuTutoringRequests.length} Ajuan
          </span>
        </div>

        {/* Rekomendasi Guru */}
        {stuRecommendations.length > 0 && (
          <div className="space-y-2">
            <div className="font-semibold text-slate-800">
              Rekomendasi Bimbingan dari Guru ({stuRecommendations.length})
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {stuRecommendations.map((rec) => (
                <div
                  key={rec.id}
                  className="p-3.5 rounded-lg border border-amber-200 bg-amber-50/70 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      {rec.subjectName} · {rec.cpKode}
                      {rec.tpKode ? ` (${rec.tpKode})` : ''}
                    </span>
                    <span className="font-mono text-[11px] font-semibold text-amber-800">
                      {rec.status}
                    </span>
                  </div>
                  <p className="text-slate-700 leading-relaxed">
                    {rec.tpDeskripsi || rec.cpDeskripsi}
                  </p>
                  <div className="text-amber-950 font-medium">
                    Saran Guru: {rec.rekomendasiGuru}
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[11px] text-slate-500">
                      Oleh {rec.recommendedByName} · {formatTanggalID(rec.tanggalRekomendasi)}
                    </span>
                    {onCreateTutoringRequests && rec.status === 'Disarankan' && (
                      <button
                        type="button"
                        onClick={() => handleApplyRecommendation(rec)}
                        className="px-2.5 py-1 rounded-md bg-emerald-700 text-white font-semibold hover:bg-emerald-800 whitespace-nowrap"
                      >
                        Ajukan Bimbingan Ini
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pemilihan Mapel, Seluruh CP & TP, dan Formulir Ajuan */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form onSubmit={handleSubmitBimbingan} className="lg:col-span-7 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  1. Pilih Mata Pelajaran
                </label>
                <select
                  value={activeBimbinganSubject?.id || ''}
                  onChange={(e) => {
                    setBimbinganSubjectId(e.target.value);
                    setBimbinganCpId('');
                    setBimbinganTpIds([]);
                    setBimbinganRecId(undefined);
                  }}
                  className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 font-medium"
                >
                  {stuSubjects.map((subj) => (
                    <option key={subj.id} value={subj.id}>
                      {subj.kode} — {subj.nama}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  2. Tanggal Ajuan Bimbingan
                </label>
                <input
                  type="date"
                  required
                  value={bimbinganTanggal}
                  onChange={(e) => setBimbinganTanggal(e.target.value)}
                  className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono"
                />
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">
                  3. Daftar Seluruh CP & TP ({subjectCPs.length} CP)
                </span>
                {bimbinganTpIds.length > 0 && (
                  <span className="font-mono text-emerald-700 font-semibold">
                    {bimbinganTpIds.length} TP dipilih
                  </span>
                )}
              </div>

              {subjectCPs.length === 0 ? (
                <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
                  Belum ada CP / TP tercatat pada mata pelajaran ini untuk kelas {stu.kelas}.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {subjectCPs.map((cp) => {
                    const isSelectedCp = activeBimbinganCP?.id === cp.id;
                    return (
                      <div
                        key={cp.id}
                        className={`rounded-lg border p-3 space-y-2 transition-colors ${
                          isSelectedCp
                            ? 'border-emerald-700 bg-emerald-50/40'
                            : 'border-slate-200 bg-slate-50/50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setBimbinganCpId(cp.id);
                              setBimbinganTpIds([]);
                            }}
                            className="text-left space-y-0.5 flex-1"
                          >
                            <div className="font-semibold text-slate-900">
                              <span className="font-mono text-emerald-700">{cp.kode}</span> —{' '}
                              {cp.deskripsi}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {cp.tps.length} Tujuan Pembelajaran (TP)
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setBimbinganCpId(cp.id);
                              setBimbinganTpIds([]);
                            }}
                            className={`px-2 py-1 rounded border text-[11px] font-semibold shrink-0 ${
                              isSelectedCp
                                ? 'bg-emerald-700 text-white border-emerald-700'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            {isSelectedCp ? 'CP Dipilih' : 'Pilih CP'}
                          </button>
                        </div>

                        {cp.tps.length > 0 && (
                          <div className="pl-2 space-y-1.5 border-l border-slate-200">
                            {cp.tps.map((tp) => {
                              const checked =
                                isSelectedCp && bimbinganTpIds.includes(tp.id);
                              const tpScore = activeGradeEntry?.tpScores?.[tp.id];
                              const belowKktp =
                                typeof tpScore === 'number' && tpScore < state.settings.kktp;
                              return (
                                <label
                                  key={tp.id}
                                  className="flex items-start justify-between gap-2 p-2 rounded border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer"
                                >
                                  <div className="flex items-start gap-2">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) => {
                                        const isChecked = e.target.checked;
                                        if (!isSelectedCp) {
                                          setBimbinganCpId(cp.id);
                                          setBimbinganTpIds(isChecked ? [tp.id] : []);
                                        } else {
                                          setBimbinganTpIds((prev) =>
                                            isChecked
                                              ? [...prev, tp.id]
                                              : prev.filter((id) => id !== tp.id)
                                          );
                                        }
                                      }}
                                      className="mt-0.5 accent-emerald-700"
                                    />
                                    <div>
                                      <span className="font-mono font-semibold text-slate-800">
                                        {tp.kode}
                                      </span>{' '}
                                      <span className="text-slate-700">{tp.deskripsi}</span>
                                    </div>
                                  </div>
                                  <span
                                    className={`font-mono text-[11px] tabular-nums shrink-0 ${
                                      typeof tpScore === 'number'
                                        ? belowKktp
                                          ? 'text-red-600 font-bold'
                                          : 'text-emerald-700 font-semibold'
                                        : 'text-slate-400'
                                    }`}
                                  >
                                    {typeof tpScore === 'number'
                                      ? `Nilai ${tpScore}${belowKktp ? ' (<KKTP)' : ''}`
                                      : 'Belum dinilai'}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-[11px] text-slate-500">
                Centang satu atau beberapa TP spesifik di dalam CP terpilih, atau biarkan kosong untuk mengajukan bimbingan pada keseluruhan CP tersebut.
              </p>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                4. Alasan / Bagian Materi yang Belum Dipahami Ananda *
              </label>
              <textarea
                rows={2}
                required
                value={bimbinganAlasan}
                onChange={(e) => setBimbinganAlasan(e.target.value)}
                placeholder="Misal: Ananda masih kesulitan menyelesaikan soal cerita pecahan campuran pada TP-02 dan perlu pengulangan contoh soal..."
                className="w-full rounded-lg border border-slate-300 p-2.5 leading-relaxed"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={submittingBimbingan || !onCreateTutoringRequests || !activeBimbinganCP}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-700 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                {submittingBimbingan ? 'Mengirim Ajuan...' : 'Ajukan Bimbingan Belajar'}
              </button>
              {bimbinganRecId && (
                <button
                  type="button"
                  onClick={() => setBimbinganRecId(undefined)}
                  className="text-slate-500 hover:text-slate-800 underline"
                >
                  Batalkan tautan rekomendasi
                </button>
              )}
            </div>
          </form>

          {/* Riwayat & Jadwal Bimbingan Anak */}
          <div className="lg:col-span-5 space-y-2.5">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5 text-emerald-700" />
              Riwayat & Jadwal Bimbingan Belajar Ananda ({stuTutoringRequests.length})
            </div>

            {stuTutoringRequests.length === 0 ? (
              <div className="p-6 rounded-lg border border-slate-200 bg-slate-50 text-center text-slate-500">
                Belum ada pengajuan bimbingan belajar untuk {stu.nama}.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg max-h-[420px] overflow-y-auto">
                {stuTutoringRequests.map((req) => (
                  <div key={req.id} className="p-3.5 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-slate-900">
                        {req.subjectName} · {req.cpKode}
                        {req.tpKode ? ` · ${req.tpKode}` : ' (Seluruh CP)'}
                      </div>
                      <span
                        className={`font-mono text-[11px] font-semibold shrink-0 ${
                          req.status === 'Ditolak'
                            ? 'text-red-700'
                            : req.status === 'Selesai' || req.status === 'Terjadwal'
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                        }`}
                      >
                        {req.status}
                      </span>
                    </div>
                    <p className="text-slate-600">
                      {req.tpDeskripsi || req.cpDeskripsi}
                    </p>
                    <div className="text-slate-800">
                      Alasan: {req.alasan}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Ajuan {formatTanggalID(req.tanggalAjuan)} · Sumber: {req.sumber}
                      {req.confirmedByGuruName ? ` · Guru: ${req.confirmedByGuruName}` : ''}
                      {req.approvedByPengurusName
                        ? ` · Pengurus: ${req.approvedByPengurusName}`
                        : ''}
                    </div>
                    {req.jadwalTanggal && (
                      <div className="p-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-950 font-medium">
                        Jadwal: {formatTanggalID(req.jadwalTanggal)}
                        {req.jadwalWaktu ? ` (${req.jadwalWaktu})` : ''} ·{' '}
                        {req.jadwalLokasi || 'Ruang Bimbingan'} · Pembimbing:{' '}
                        {req.pembimbingNama || '-'}
                      </div>
                    )}
                    {req.catatanSekolah && (
                      <div className="text-emerald-800 font-medium">
                        Catatan Sekolah: {req.catatanSekolah}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Portfolio Karya, Projek Profil Lulusan, Ekskul & Catatan BK */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start text-xs">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-2.5">
            Portofolio Karya Ananda
          </h3>
          <div className="flex items-center gap-4">
            {qrUrl ? (
              <img
                src={qrUrl}
                alt="QR Portofolio"
                className="w-24 h-24 rounded-lg border border-slate-200 p-1"
              />
            ) : (
              <QrCode className="w-16 h-16 text-slate-300" />
            )}
            <div className="space-y-1.5">
              <div className="font-semibold text-slate-800">Folder Google Drive Karya</div>
              <p className="text-slate-500">
                Pindai QR atau klik tautan berikut untuk melihat arsip karya ananda.
              </p>
              {safeFolder && (
                <a
                  href={safeFolder}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-700 font-semibold hover:underline"
                >
                  Buka Folder Google Drive <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200 space-y-2">
            <div className="font-semibold text-slate-800">
              Daftar Karya Tercatat ({(stu.portfolioItems || []).length})
            </div>
            {(stu.portfolioItems || []).length === 0 ? (
              <p className="text-slate-500">Belum ada karya portofolio yang dicatat.</p>
            ) : (
              <div className="space-y-2">
                {stu.portfolioItems.map((it) => {
                  const link = it.url ? validatePortfolioUrl(it.url) : null;
                  return (
                    <div
                      key={it.id}
                      className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 space-y-0.5"
                    >
                      <div className="font-semibold text-slate-900">{it.judul}</div>
                      <div className="text-[11px] text-slate-500">
                        {it.kategori} · {formatTanggalID(it.tanggal)}
                      </div>
                      {it.catatan && <p className="text-slate-600">{it.catatan}</p>}
                      {link && (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-emerald-700 font-medium hover:underline"
                        >
                          Lihat Karya <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-2.5">
            Projek Penguatan Profil Lulusan, Ekstrakurikuler & Catatan BK
          </h3>

          {profilLulusanList.length === 0 ? (
            <p className="text-slate-500">
              Belum ada data Projek Penguatan Profil Lulusan pada semester ini.
            </p>
          ) : (
            profilLulusanList.map((p) => (
              <div key={p.id} className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <div className="font-semibold text-slate-900">
                  {p.tema} — {p.judulProjek}
                </div>
                {p.deskripsi && <p className="text-slate-600">{p.deskripsi}</p>}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 text-[11px] text-emerald-900">
                  {p.dimensi.map((d, i) => (
                    <div key={i}>
                      • {d.profil}: <strong>{PREDIKAT_LABELS[d.capaian] || d.capaian}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}

          <div>
            <div className="font-semibold text-slate-800 mb-1">Kegiatan Ekstrakurikuler</div>
            {meta && meta.ekskul.length > 0 ? (
              <ul className="space-y-1 text-slate-600">
                {meta.ekskul.map((e) => (
                  <li key={e.id}>
                    • <strong>{e.nama}</strong> ({e.predikat}) — {e.keterangan}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-500">Belum ada data ekstrakurikuler.</p>
            )}
          </div>

          {meta?.catatanWaliKelas && (
            <div className="pt-2 border-t border-slate-200 space-y-1">
              <div className="font-semibold text-slate-800">Catatan Wali Kelas</div>
              <p className="text-slate-600 whitespace-pre-line">{meta.catatanWaliKelas}</p>
            </div>
          )}

          <div className="pt-2 border-t border-slate-200 space-y-1.5">
            <div className="font-semibold text-slate-800">Catatan Bimbingan Konseling (BK)</div>
            {bkNotes.length === 0 ? (
              <p className="text-slate-500">Belum ada catatan BK yang dibagikan.</p>
            ) : (
              bkNotes.map((n) => (
                <div key={n.id} className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-semibold text-slate-900">
                    {n.topik}{' '}
                    <span className="font-normal text-slate-500">
                      · {n.kategori} · {formatTanggalID(n.tanggal)}
                    </span>
                  </div>
                  <p className="text-slate-700">{n.uraianMasalah}</p>
                  {n.rekomendasiOrtu && (
                    <p className="text-emerald-800 font-medium">
                      Rekomendasi Orang Tua: {n.rekomendasiOrtu}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Tanggapan / Konfirmasi Orang Tua */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 text-xs">
        <div className="border-b border-slate-200 pb-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Tanggapan & Konfirmasi Orang Tua / Wali
          </h3>
          <p className="text-slate-500 mt-0.5">
            Konfirmasikan bahwa Anda telah menelaah laporan belajar, projek Profil Lulusan, dan catatan BK ananda, serta tuliskan tanggapan untuk Wali Kelas / Pengurus.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form onSubmit={handleSubmitFeedback} className="lg:col-span-6 space-y-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1.5">
                Status Konfirmasi Orang Tua
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {KONFIRMASI_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setKonfirmasiStatus(opt)}
                    className={`p-2.5 rounded-lg border text-left font-medium transition-colors ${
                      konfirmasiStatus === opt
                        ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Catatan / Tanggapan Orang Tua
              </label>
              <textarea
                rows={3}
                value={tanggapan}
                onChange={(e) => setTanggapan(e.target.value)}
                placeholder="Tuliskan tanggapan, masukan, atau permohonan konsultasi untuk Wali Kelas..."
                className="w-full rounded-lg border border-slate-300 p-3 leading-relaxed"
              />
            </div>

            <button
              type="submit"
              disabled={submittingFb || !onSubmitParentFeedback}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-700 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {submittingFb ? 'Mengirim Konfirmasi...' : 'Kirim Konfirmasi & Tanggapan'}
            </button>
          </form>

          <div className="lg:col-span-6 space-y-2">
            <div className="font-semibold text-slate-800">
              Riwayat Konfirmasi & Tanggapan ({stuFeedbacks.length})
            </div>
            {stuFeedbacks.length === 0 ? (
              <div className="p-6 rounded-lg border border-slate-200 bg-slate-50 text-center text-slate-500">
                Belum ada konfirmasi atau tanggapan orang tua untuk siswa ini.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg max-h-64 overflow-y-auto">
                {stuFeedbacks.map((fb) => (
                  <div key={fb.id} className="p-3.5 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-800">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {fb.konfirmasiStatus}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">
                        {formatTanggalID(fb.createdAt.slice(0, 10))}
                      </span>
                    </div>
                    {fb.tanggapan && <p className="text-slate-700">{fb.tanggapan}</p>}
                    <div className="text-[11px] text-slate-400">
                      Oleh {fb.parentName} · TA {fb.tahunAjaran} S{fb.semester}
                    </div>
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
