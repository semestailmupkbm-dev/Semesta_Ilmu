import React, { useEffect, useState } from 'react';
import { Filter, Printer, QrCode, ShieldCheck, User } from 'lucide-react';
import QRCode from 'qrcode';
import { AppState, RaporPrintFilter } from '../types';
import {
  calculateStudentSubjectGrade,
  collectTeacherSubjectNotes,
  computeValidationCode,
  DEFAULT_RAPOR_PRINT_FILTER,
  formatTanggalID,
  getSubjectsForClass,
  gradeKey,
  metaKey,
  PREDIKAT_LABELS,
} from '../utils/academic';
import { generateRaporPDF } from '../utils/pdf';

interface PrintRaporViewProps {
  state: AppState;
  selectedClass: string;
  onNotify: (msg: string, isError?: boolean) => void;
}

const FILTER_LABELS: Array<{ key: keyof RaporPrintFilter; label: string }> = [
  { key: 'cover', label: 'Cover Rapor Eksklusif' },
  { key: 'schoolIdentity', label: 'Identitas Satuan Pendidikan' },
  { key: 'studentIdentity', label: 'Identitas & Foto Peserta Didik' },
  { key: 'grades', label: 'Laporan Hasil Belajar (Nilai)' },
  { key: 'profilLulusan', label: 'Projek Penguatan Profil Lulusan (8 Dimensi)' },
  { key: 'ekskul', label: 'Kegiatan Ekstrakurikuler' },
  { key: 'absensi', label: 'Ketidakhadiran' },
  { key: 'catatan', label: 'Catatan Wali Kelas & Guru Mapel' },
  { key: 'pengesahan', label: 'Pengesahan & TTD Digital' },
  { key: 'validasiPortfolio', label: 'QR Validasi Rapor & Portofolio' },
];

export const PrintRaporView: React.FC<PrintRaporViewProps> = ({
  state,
  selectedClass,
  onNotify,
}) => {
  const { settings, students, subjects, grades, p5Projects, reportMeta, classDefs } = state;
  const semester = settings.semester;

  const classStudents = students
    .filter((s) => s.kelas === selectedClass && s.status === 'Aktif')
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));

  const [selectedId, setSelectedId] = useState(classStudents[0]?.id || '');
  const [docType, setDocType] = useState<'SAS' | 'STS'>('SAS');
  const [printFilter, setPrintFilter] = useState<RaporPrintFilter>(DEFAULT_RAPOR_PRINT_FILTER);
  const [printing, setPrinting] = useState(false);
  const [verifyQrUrl, setVerifyQrUrl] = useState('');
  const [portfolioQrUrl, setPortfolioQrUrl] = useState('');

  useEffect(() => {
    if (classStudents.length > 0 && !classStudents.some((s) => s.id === selectedId)) {
      setSelectedId(classStudents[0].id);
    }
  }, [classStudents, selectedId]);

  const activeStudent = classStudents.find((s) => s.id === selectedId) || classStudents[0];
  const vCode = activeStudent ? computeValidationCode(activeStudent, state, docType) : '';

  useEffect(() => {
    if (!activeStudent) return;
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'https://sim-rapor.local';
    QRCode.toDataURL(`${origin}/?verify=${encodeURIComponent(vCode)}`, { margin: 1, width: 120 })
      .then(setVerifyQrUrl)
      .catch(() => setVerifyQrUrl(''));
    const pfPayload =
      activeStudent.portfolioFolderUrl?.trim() ||
      `SIM-RAPOR-PORTFOLIO|${activeStudent.nis}|${activeStudent.nama}|${activeStudent.kelas}`;
    QRCode.toDataURL(pfPayload, { margin: 1, width: 120 })
      .then(setPortfolioQrUrl)
      .catch(() => setPortfolioQrUrl(''));
  }, [activeStudent, vCode]);

  const hasAnySection = Object.values(printFilter).some(Boolean);

  const handleDownloadSingle = async () => {
    if (!activeStudent) return;
    if (!hasAnySection) {
      onNotify('Pilih minimal 1 bagian rapor pada Menu Filter Pilih Print.', true);
      return;
    }
    setPrinting(true);
    try {
      const doc = await generateRaporPDF(
        activeStudent,
        state,
        docType,
        undefined,
        false,
        printFilter
      );
      doc.save(
        `Rapor_${docType}_${activeStudent.nama.replace(/\s+/g, '_')}_S${semester}.pdf`
      );
      onNotify(`Rapor PDF ${activeStudent.nama} berhasil diunduh.`);
    } catch {
      onNotify('Gagal menyusun PDF rapor.', true);
    } finally {
      setPrinting(false);
    }
  };

  const handleDownloadAll = async () => {
    if (classStudents.length === 0) return;
    if (!hasAnySection) {
      onNotify('Pilih minimal 1 bagian rapor pada Menu Filter Pilih Print.', true);
      return;
    }
    setPrinting(true);
    try {
      let doc = await generateRaporPDF(
        classStudents[0],
        state,
        docType,
        undefined,
        false,
        printFilter
      );
      for (let i = 1; i < classStudents.length; i++) {
        doc = await generateRaporPDF(classStudents[i], state, docType, doc, true, printFilter);
      }
      doc.save(`Rapor_Massal_${docType}_${selectedClass.replace(/\s+/g, '_')}_S${semester}.pdf`);
      onNotify(`Rapor massal ${classStudents.length} siswa berhasil diunduh.`);
    } catch {
      onNotify('Gagal menyusun PDF rapor massal.', true);
    } finally {
      setPrinting(false);
    }
  };

  if (!activeStudent) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-xs text-slate-500">
        Belum ada peserta didik aktif di {selectedClass}.
      </div>
    );
  }

  const stuSubjects = getSubjectsForClass(
    subjects,
    activeStudent.kelas,
    classDefs,
    activeStudent.jurusan || 'Umum'
  );
  const wali = settings.waliKelasMap[activeStudent.kelas] ?? { nama: '-', nip: '-' };
  const meta = reportMeta[metaKey(activeStudent.id, semester)];
  const stuProjs = p5Projects.filter(
    (p) => p.studentId === activeStudent.id && p.semester === semester
  );
  const teacherNotes = collectTeacherSubjectNotes(
    activeStudent,
    subjects,
    grades,
    semester,
    classDefs
  );
  const semLabel = semester === '1' ? '1 (Ganjil)' : '2 (Genap)';

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold text-slate-900">
            Pratinjau & Cetak Rapor Eksklusif — {selectedClass}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Rapor lengkap mulai Cover, Identitas Lembaga & Foto Siswa, Hasil Belajar, Profil Lulusan, Ekskul, Catatan, Pengesahan hingga QR Validasi & Portofolio.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={activeStudent.id}
            onChange={(e) => setSelectedId(e.target.value)}
            className="h-9 min-w-[210px] rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium"
          >
            {classStudents.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nama} ({s.nis})
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setDocType('SAS')}
              className={`px-3 py-1 rounded-md font-medium whitespace-nowrap ${
                docType === 'SAS' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Rapor Akhir (SAS)
            </button>
            <button
              type="button"
              onClick={() => setDocType('STS')}
              className={`px-3 py-1 rounded-md font-medium whitespace-nowrap ${
                docType === 'STS' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Rapor Tengah (STS)
            </button>
          </div>

          <button
            type="button"
            disabled={printing}
            onClick={handleDownloadSingle}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Printer className="w-3.5 h-3.5" />
            {printing ? 'Menyusun PDF...' : 'Unduh PDF Siswa Ini'}
          </button>

          <button
            type="button"
            disabled={printing}
            onClick={handleDownloadAll}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            Cetak Massal ({classStudents.length})
          </button>
        </div>
      </div>

      {/* Menu Filter Pilih Print */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-emerald-700" />
            <h2 className="text-sm font-semibold text-slate-900">
              Menu Filter Pilih Print Bagian Rapor
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPrintFilter(DEFAULT_RAPOR_PRINT_FILTER)}
              className="px-2.5 py-1 rounded border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50"
            >
              Semua Bagian (Lengkap)
            </button>
            <button
              type="button"
              onClick={() =>
                setPrintFilter({
                  cover: false,
                  schoolIdentity: false,
                  studentIdentity: false,
                  grades: true,
                  profilLulusan: false,
                  ekskul: false,
                  absensi: true,
                  catatan: true,
                  pengesahan: true,
                  validasiPortfolio: true,
                })
              }
              className="px-2.5 py-1 rounded border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50"
            >
              Nilai & Pengesahan Saja
            </button>
            <button
              type="button"
              onClick={() =>
                setPrintFilter({
                  cover: true,
                  schoolIdentity: true,
                  studentIdentity: true,
                  grades: false,
                  profilLulusan: false,
                  ekskul: false,
                  absensi: false,
                  catatan: false,
                  pengesahan: false,
                  validasiPortfolio: false,
                })
              }
              className="px-2.5 py-1 rounded border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50"
            >
              Cover & Identitas Saja
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {FILTER_LABELS.map((item) => (
            <label
              key={item.key}
              className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-slate-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={printFilter[item.key]}
                onChange={(e) =>
                  setPrintFilter((prev) => ({ ...prev, [item.key]: e.target.checked }))
                }
                className="accent-emerald-700"
              />
              <span className="font-medium text-slate-800">{item.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Live Exclusive Preview Sheets */}
      <div className="max-w-4xl mx-auto space-y-6 text-xs">
        {!hasAnySection && (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-500">
            Centang minimal satu bagian pada Menu Filter Pilih Print untuk melihat pratinjau rapor.
          </div>
        )}

        {/* Cover Preview */}
        {printFilter.cover && (
          <div className="bg-white border-2 border-emerald-700 rounded-xl p-8 sm:p-10 text-center space-y-6 shadow-xs">
            <div className="flex justify-center">
              {settings.logoDataUrl ? (
                <img
                  src={settings.logoDataUrl}
                  alt="Logo"
                  className="w-20 h-20 object-contain"
                />
              ) : (
                <div className="w-20 h-20 rounded-full border-2 border-emerald-700 flex items-center justify-center font-bold text-emerald-700">
                  RAPOR
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <h2 className="text-lg font-bold tracking-wide text-slate-900">
                LAPORAN HASIL BELAJAR PESERTA DIDIK
              </h2>
              <p className="text-xs font-semibold text-emerald-700 tracking-wider uppercase">
                {docType === 'STS'
                  ? 'Penilaian Tengah Semester · Kurikulum Merdeka'
                  : 'Kurikulum Merdeka · Satuan Pendidikan'}
              </p>
              <div className="text-sm font-bold text-slate-800 pt-2 uppercase">
                {settings.namaSekolah}
              </div>
              <div className="text-slate-500">
                NPSN {settings.npsn} · Akreditasi {settings.akreditasi}
              </div>
            </div>
            <div className="max-w-md mx-auto p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">
                Nama Peserta Didik
              </div>
              <div className="text-base font-bold text-slate-900 uppercase">
                {activeStudent.nama}
              </div>
              <div className="font-mono text-slate-700">
                NIS {activeStudent.nis} · NISN {activeStudent.nisn || '-'}
              </div>
              <div className="text-slate-600">
                {activeStudent.kelas} ({activeStudent.fase})
              </div>
            </div>
            <div className="pt-4 text-slate-700 font-semibold">
              TAHUN PELAJARAN {settings.tahunAjaran} · SEMESTER {semLabel.toUpperCase()}
            </div>
          </div>
        )}

        {/* School & Student Identity + Photo */}
        {(printFilter.schoolIdentity || printFilter.studentIdentity) && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
            {printFilter.schoolIdentity && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-center text-slate-900 uppercase border-b border-slate-200 pb-2">
                  Identitas Satuan Pendidikan
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
                  <div>Nama Lembaga: <strong>{settings.namaSekolah}</strong></div>
                  <div>Jenis / Akreditasi: <strong>{settings.jenisLembaga} · {settings.akreditasi}</strong></div>
                  <div>NPSN / NSS: <span className="font-mono">{settings.npsn} / {settings.nss || '-'}</span></div>
                  <div>Kepala Lembaga: <strong>{settings.kepalaSekolah}</strong></div>
                  <div className="sm:col-span-2">
                    Alamat: {settings.alamat}, {settings.kelurahan}, {settings.kecamatan}, {settings.kabupaten}, {settings.provinsi} {settings.kodePos}
                  </div>
                </div>
              </div>
            )}

            {printFilter.studentIdentity && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-center text-slate-900 uppercase border-b border-slate-200 pb-2">
                  Identitas Peserta Didik
                </h3>
                <div className="flex flex-col sm:flex-row gap-5 items-start">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
                    <div>Nama Lengkap: <strong>{activeStudent.nama}</strong></div>
                    <div>NIS / NISN: <span className="font-mono">{activeStudent.nis} / {activeStudent.nisn || '-'}</span></div>
                    <div>TTL: {activeStudent.tempatLahir || '-'}, {formatTanggalID(activeStudent.tanggalLahir)}</div>
                    <div>Jenis Kelamin / Agama: {activeStudent.jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan'} / {activeStudent.agama}</div>
                    <div>Kelas / Fase: <strong>{activeStudent.kelas} ({activeStudent.fase})</strong></div>
                    <div>Pendidikan Sebelumnya: {activeStudent.pendidikanSebelumnya || '-'}</div>
                    <div>Orang Tua: {activeStudent.namaAyah || '-'} / {activeStudent.namaIbu || '-'}</div>
                    <div>Wali / Kontak: {activeStudent.namaWali || '-'} ({activeStudent.noTelpWali || '-'})</div>
                    <div className="sm:col-span-2">Alamat: {activeStudent.alamat || '-'}</div>
                  </div>
                  <div className="w-24 h-32 rounded-lg border border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                    {activeStudent.fotoDataUrl ? (
                      <img
                        src={activeStudent.fotoDataUrl}
                        alt={activeStudent.nama}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center text-[10px] text-slate-400">
                        <User className="w-6 h-6 mx-auto mb-1" />
                        FOTO 3x4
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Academic Grades Preview */}
        {printFilter.grades && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5">
            <div className="flex items-start justify-between border-b-2 border-emerald-700 pb-4 gap-4">
              <div className="flex items-center gap-4">
                {settings.logoDataUrl && (
                  <img
                    src={settings.logoDataUrl}
                    alt="Logo"
                    className="w-12 h-12 object-contain"
                  />
                )}
                <div>
                  <h2 className="text-sm font-bold text-slate-900 uppercase">
                    {settings.namaSekolah}
                  </h2>
                  <p className="text-slate-600">
                    {settings.alamat}, {settings.kecamatan}, {settings.kabupaten}
                  </p>
                  <p className="text-slate-500">
                    NPSN: {settings.npsn} · Akreditasi: {settings.akreditasi}
                  </p>
                </div>
              </div>
              <div className="text-right font-mono text-[11px] text-emerald-800 shrink-0">
                <div className="inline-flex items-center gap-1 font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" /> Terverifikasi
                </div>
                <div>{vCode}</div>
              </div>
            </div>

            <div className="text-center font-bold text-sm text-slate-900">
              {docType === 'STS'
                ? 'LAPORAN HASIL BELAJAR TENGAH SEMESTER (STS)'
                : 'LAPORAN HASIL BELAJAR PESERTA DIDIK (KURIKULUM MERDEKA)'}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
              <div>Nama Peserta Didik: <strong>{activeStudent.nama}</strong></div>
              <div>Kelas / Fase: <strong>{activeStudent.kelas} ({activeStudent.fase})</strong></div>
              <div>NIS / NISN: <span className="font-mono">{activeStudent.nis} / {activeStudent.nisn || '-'}</span></div>
              <div>Semester / TA: <strong>{semLabel} · {settings.tahunAjaran}</strong></div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-emerald-700 text-white">
                  <tr>
                    <th className="px-3 py-2 w-10 text-center">No</th>
                    <th className="px-3 py-2 w-44">Mata Pelajaran</th>
                    <th className="px-3 py-2 w-16 text-center">Nilai</th>
                    <th className="px-3 py-2 w-14 text-center">Pred</th>
                    <th className="px-3 py-2">Capaian Kompetensi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {stuSubjects.map((subj, idx) => {
                    const entry = grades[gradeKey(activeStudent.id, subj.id, semester)];
                    const calc = calculateStudentSubjectGrade(
                      entry,
                      subj,
                      settings,
                      activeStudent.kelas,
                      classDefs
                    );
                    const val = docType === 'STS' ? calc.nilaiStsOnly : calc.nilaiAkhir;
                    return (
                      <tr key={subj.id}>
                        <td className="px-3 py-2.5 text-center font-mono">{idx + 1}</td>
                        <td className="px-3 py-2.5 font-semibold text-slate-900">{subj.nama}</td>
                        <td className="px-3 py-2.5 text-center font-mono font-bold">
                          {val ?? '-'}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono font-semibold">
                          {calc.predikat}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 leading-relaxed">
                          {calc.deskripsiFinal || 'Belum ada deskripsi capaian kompetensi.'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Secondary Page: Profil Lulusan, Ekskul, Absensi, Catatan, Pengesahan, QR */}
        {(printFilter.profilLulusan ||
          printFilter.ekskul ||
          printFilter.absensi ||
          printFilter.catatan ||
          printFilter.pengesahan ||
          printFilter.validasiPortfolio) && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5">
            {printFilter.profilLulusan && (
              <div className="space-y-2.5">
                <h3 className="text-sm font-bold text-slate-900">
                  A. Projek Penguatan Profil Lulusan (8 Dimensi Profil Lulusan)
                </h3>
                {stuProjs.length === 0 ? (
                  <p className="text-slate-500">
                    Belum ada data Projek Penguatan Profil Lulusan pada semester ini.
                  </p>
                ) : (
                  stuProjs.map((proj) => (
                    <div key={proj.id} className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="bg-slate-50 px-3.5 py-2 border-b border-slate-200 font-semibold text-slate-900">
                        Tema: {proj.tema} — {proj.judulProjek}
                      </div>
                      <table className="w-full text-left">
                        <thead className="bg-slate-800 text-white">
                          <tr>
                            <th className="px-3 py-2">Dimensi Profil Lulusan</th>
                            <th className="px-3 py-2 w-48">Capaian</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {proj.dimensi.map((d, i) => (
                            <tr key={i}>
                              <td className="px-3 py-2 text-slate-800">{d.profil}</td>
                              <td className="px-3 py-2 font-semibold text-emerald-800">
                                {d.capaian} ({PREDIKAT_LABELS[d.capaian] || d.capaian})
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))
                )}
              </div>
            )}

            {printFilter.ekskul && (
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900">B. Kegiatan Ekstrakurikuler</h3>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-800 text-white">
                      <tr>
                        <th className="px-3 py-2 w-10 text-center">No</th>
                        <th className="px-3 py-2">Kegiatan Ekstrakurikuler</th>
                        <th className="px-3 py-2 w-28 text-center">Predikat</th>
                        <th className="px-3 py-2">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {meta && meta.ekskul.length > 0 ? (
                        meta.ekskul.map((e, i) => (
                          <tr key={e.id}>
                            <td className="px-3 py-2 text-center font-mono">{i + 1}</td>
                            <td className="px-3 py-2 font-semibold">{e.nama}</td>
                            <td className="px-3 py-2 text-center">{e.predikat}</td>
                            <td className="px-3 py-2 text-slate-600">{e.keterangan}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-3 py-2 text-slate-500 text-center">
                            Tidak mengikuti kegiatan ekstrakurikuler tambahan.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(printFilter.absensi || printFilter.catatan) && (
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                {printFilter.absensi && (
                  <div className="sm:col-span-4 border border-slate-200 rounded-lg p-3.5 space-y-1.5">
                    <div className="font-bold text-slate-900">Ketidakhadiran</div>
                    <div className="flex justify-between">
                      <span>Sakit</span>
                      <span className="font-mono font-semibold">{meta?.absensi.sakit ?? 0} hari</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Izin</span>
                      <span className="font-mono font-semibold">{meta?.absensi.izin ?? 0} hari</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tanpa Keterangan</span>
                      <span className="font-mono font-semibold">{meta?.absensi.alpha ?? 0} hari</span>
                    </div>
                  </div>
                )}
                {printFilter.catatan && (
                  <div
                    className={`${
                      printFilter.absensi ? 'sm:col-span-8' : 'sm:col-span-12'
                    } border border-slate-200 rounded-lg p-3.5 space-y-1.5`}
                  >
                    <div className="font-bold text-slate-900">
                      Catatan Wali Kelas & Guru Mata Pelajaran
                    </div>
                    <p className="text-slate-700 whitespace-pre-line">
                      {meta?.catatanWaliKelas ||
                        'Terus tingkatkan semangat belajar dan kedisiplinan.'}
                    </p>
                    {teacherNotes.length > 0 &&
                      !meta?.catatanWaliKelas?.includes('Catatan Guru Mata Pelajaran:') && (
                        <div className="pt-1 text-slate-600 space-y-0.5">
                          <div className="font-semibold text-slate-800">Catatan Guru Mapel:</div>
                          {teacherNotes.map((n) => (
                            <div key={n.subjectId}>
                              • {n.subjectName} ({n.guruPengampu}): {n.catatan}
                            </div>
                          ))}
                        </div>
                      )}
                  </div>
                )}
              </div>
            )}

            {printFilter.pengesahan && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4 border-t border-slate-200 text-center">
                <div className="space-y-1">
                  <div>Mengetahui,</div>
                  <div>Orang Tua / Wali</div>
                  <div className="h-12" />
                  <div className="font-semibold border-t border-slate-400 pt-1 inline-block px-6">
                    {activeStudent.namaWali || activeStudent.namaAyah || '___________________'}
                  </div>
                </div>
                <div className="space-y-1">
                  <div>Mengetahui,</div>
                  <div>Kepala {settings.namaSekolah}</div>
                  <div className="h-12 flex items-center justify-center">
                    {settings.ttdKepalaDataUrl && (
                      <img
                        src={settings.ttdKepalaDataUrl}
                        alt="TTD Kepala"
                        className="h-10 object-contain"
                      />
                    )}
                  </div>
                  <div className="font-bold text-slate-900">{settings.kepalaSekolah || '-'}</div>
                  <div className="font-mono text-slate-500">
                    NIP. {settings.nipKepalaSekolah || '-'}
                  </div>
                </div>
                <div className="space-y-1">
                  <div>
                    {settings.tempatRapor}, {formatTanggalID(settings.tanggalRapor)}
                  </div>
                  <div>Wali Kelas</div>
                  <div className="h-12 flex items-center justify-center">
                    {wali.ttdDataUrl && (
                      <img src={wali.ttdDataUrl} alt="TTD Wali" className="h-10 object-contain" />
                    )}
                  </div>
                  <div className="font-bold text-slate-900">{wali.nama || '-'}</div>
                  <div className="font-mono text-slate-500">NIP/NUPTK. {wali.nip || '-'}</div>
                </div>
              </div>
            )}

            {printFilter.validasiPortfolio && (
              <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-200">
                <div className="flex items-center gap-3">
                  {verifyQrUrl ? (
                    <img
                      src={verifyQrUrl}
                      alt="QR Validasi"
                      className="w-16 h-16 border border-slate-200 rounded p-0.5"
                    />
                  ) : (
                    <QrCode className="w-12 h-12 text-slate-300" />
                  )}
                  <div>
                    <div className="font-semibold text-slate-900">QR Validasi Keaslian Rapor</div>
                    <div className="font-mono text-[11px] text-slate-500">{vCode}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="font-semibold text-slate-900">QR Portofolio Karya Siswa</div>
                    <div className="text-[11px] text-slate-500">
                      {activeStudent.portfolioFolderUrl ? 'Tautan Google Drive' : 'Arsip Identitas Karya'}
                    </div>
                  </div>
                  {portfolioQrUrl ? (
                    <img
                      src={portfolioQrUrl}
                      alt="QR Portofolio"
                      className="w-16 h-16 border border-slate-200 rounded p-0.5"
                    />
                  ) : (
                    <QrCode className="w-12 h-12 text-slate-300" />
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
