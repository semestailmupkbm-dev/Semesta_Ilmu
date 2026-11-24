import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  Filter,
  Printer,
  QrCode,
  ScanLine,
  User,
  X,
  XCircle,
} from 'lucide-react';
import QRCode from 'qrcode';
import { AppState, Student, UserAccount } from '../types';
import {
  buildStudentCardVerifyUrl,
  formatTanggalID,
  getAccessibleClassesForUser,
} from '../utils/academic';
import { generateKartuPelajarPDF } from '../utils/pdf';

const THEMES: Array<{
  id: string;
  label: string;
  bgClass: string;
  rgb: [number, number, number];
}> = [
  { id: 'emerald', label: 'Hijau Akademik', bgClass: 'bg-emerald-800', rgb: [21, 128, 61] },
  { id: 'navy', label: 'Biru Nusantara', bgClass: 'bg-sky-900', rgb: [12, 74, 110] },
  { id: 'slate', label: 'Hitam Elegan', bgClass: 'bg-slate-900', rgb: [15, 23, 42] },
];

interface KartuPelajarViewProps {
  state: AppState;
  currentUser?: UserAccount;
  selectedClass: string;
  onNotify: (msg: string, isError?: boolean) => void;
}

interface CardScanResult {
  found: boolean;
  aktifCard: boolean;
  student?: {
    id: string;
    nis: string;
    nisn: string;
    nama: string;
    kelas: string;
    fase: string;
    status: string;
    fotoDataUrl?: string;
  };
  school?: { namaSekolah: string; npsn: string; tahunAjaran: string };
  latestMutation?: { jenis: string; tanggal: string; sekolahAsalTujuan: string; alasan: string } | null;
}

export const KartuPelajarView: React.FC<KartuPelajarViewProps> = ({
  state,
  currentUser,
  selectedClass,
  onNotify,
}) => {
  const isAdmin = !currentUser || currentUser.role === 'admin';
  const orderedClasses = useMemo(
    () =>
      state.classDefs.length > 0
        ? [...state.classDefs].sort((a, b) => a.urutan - b.urutan).map((c) => c.nama)
        : state.classes,
    [state.classDefs, state.classes]
  );
  const accessibleClasses = useMemo(
    () =>
      currentUser
        ? getAccessibleClassesForUser(orderedClasses, currentUser)
        : orderedClasses,
    [orderedClasses, currentUser]
  );

  const [classFilter, setClassFilter] = useState<string>(selectedClass);
  const [statusFilter, setStatusFilter] = useState<'Aktif' | 'ALL'>('Aktif');
  const [sideMode, setSideMode] = useState<'both' | 'front' | 'back'>('both');
  const [validUntil, setValidUntil] = useState('30 Juni 2027');
  const [themeId, setThemeId] = useState('emerald');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // Live QR dataURL map
  const [qrMap, setQrMap] = useState<Record<string, string>>({});

  // Live scan test modal
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<CardScanResult | null>(null);

  useEffect(() => {
    setClassFilter(selectedClass);
  }, [selectedClass]);

  const filteredStudents = useMemo(() => {
    return state.students
      .filter((s) => {
        if (!isAdmin && !accessibleClasses.includes(s.kelas)) return false;
        if (classFilter !== 'ALL' && s.kelas !== classFilter) return false;
        if (statusFilter === 'Aktif' && s.status !== 'Aktif') return false;
        return true;
      })
      .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  }, [state.students, isAdmin, accessibleClasses, classFilter, statusFilter]);

  // Select all visible students whenever filter changes
  useEffect(() => {
    setSelectedIds(new Set(filteredStudents.map((s) => s.id)));
  }, [filteredStudents]);

  // Pre-generate QR thumbnails
  useEffect(() => {
    let active = true;
    Promise.all(
      filteredStudents.map(async (stu) => {
        try {
          const url = await QRCode.toDataURL(
            buildStudentCardVerifyUrl(stu.id, state.schoolId),
            {
              margin: 1,
              width: 110,
            }
          );
          return [stu.id, url] as const;
        } catch {
          return [stu.id, ''] as const;
        }
      })
    ).then((pairs) => {
      if (!active) return;
      const map: Record<string, string> = {};
      pairs.forEach(([id, dataUrl]) => {
        map[id] = dataUrl;
      });
      setQrMap(map);
    });
    return () => {
      active = false;
    };
  }, [filteredStudents]);

  const activeTheme = THEMES.find((t) => t.id === themeId) || THEMES[0];
  const printableStudents = filteredStudents.filter((s) => selectedIds.has(s.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePrint = async () => {
    if (printableStudents.length === 0) {
      onNotify('Pilih minimal 1 peserta didik untuk dicetak.', true);
      return;
    }
    setBusy(true);
    try {
      const doc = await generateKartuPelajarPDF(printableStudents, state, activeTheme.rgb, {
        sideMode,
        validUntil: validUntil.trim() || 'Selama Aktif',
      });
      const label = classFilter === 'ALL' ? 'Semua_Kelas' : classFilter.replace(/\s+/g, '_');
      doc.save(`Kartu_Pelajar_${label}_${sideMode}.pdf`);
      onNotify(`Kartu Pelajar PDF (${printableStudents.length} siswa) berhasil diunduh.`);
    } catch {
      onNotify('Gagal menyusun PDF Kartu Pelajar.', true);
    } finally {
      setBusy(false);
    }
  };

  const handleTestScanQr = async (stu: Student) => {
    setScanModalOpen(true);
    setScanning(true);
    setScanResult(null);
    try {
      const schoolIdParam = encodeURIComponent(state.schoolId || currentUser?.schoolId || '');
      const res = await fetch(`/api/verify-card?id=${encodeURIComponent(stu.id)}&schoolId=${schoolIdParam}`);
      const data = await res.json();
      setScanResult(data);
    } catch {
      onNotify('Gagal menguji endpoint verifikasi QR kartu.', true);
      setScanModalOpen(false);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Print Button */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold text-slate-900">
            Kartu Pelajar Profesional (Depan & Belakang + QR Keaktifan Mutasi)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Ukuran standar ID-1 dengan tampilan Depan & Belakang, filter cetak per siswa/kelas/status, serta QR Scan Keaktifan yang otomatis nonaktif jika siswa lulus atau pindah.
          </p>
        </div>

        <button
          type="button"
          disabled={busy || printableStudents.length === 0}
          onClick={handlePrint}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <Printer className="w-3.5 h-3.5" />
          {busy ? 'Menyusun PDF...' : `Cetak / Unduh PDF (${printableStudents.length} Siswa)`}
        </button>
      </div>

      {/* Filter Cetak Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-emerald-700" />
            <h2 className="text-sm font-semibold text-slate-900">Filter Cetak Kartu Pelajar</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedIds(new Set(filteredStudents.map((s) => s.id)))}
              className="px-2.5 py-1 rounded border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50"
            >
              Pilih Semua ({filteredStudents.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="px-2.5 py-1 rounded border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50"
            >
              Kosongkan Pilihan
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block font-medium text-slate-700 mb-1">Filter Kelas</label>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 font-medium"
            >
              {isAdmin && <option value="ALL">Semua Kelas</option>}
              {(isAdmin ? orderedClasses : accessibleClasses).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Status Keaktifan</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'Aktif' | 'ALL')}
              className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5"
            >
              <option value="Aktif">Hanya Siswa Aktif</option>
              <option value="ALL">Semua Status (Aktif / Lulus / Pindah)</option>
            </select>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Sisi Cetak</label>
            <select
              value={sideMode}
              onChange={(e) => setSideMode(e.target.value as 'both' | 'front' | 'back')}
              className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 font-medium"
            >
              <option value="both">Depan & Belakang (2 Sisi)</option>
              <option value="front">Tampak Depan Saja</option>
              <option value="back">Tampak Belakang Saja</option>
            </select>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Masa Berlaku Kartu</label>
            <input
              type="text"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              placeholder="30 Juni 2027"
              className="w-full h-9 rounded-lg border border-slate-300 px-3"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Tema Warna Kartu</label>
            <select
              value={themeId}
              onChange={(e) => setThemeId(e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 font-medium"
            >
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {filteredStudents.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-xs text-slate-500">
          <CreditCard className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          Tidak ada peserta didik yang sesuai dengan filter cetak kartu.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredStudents.map((stu) => {
            const checked = selectedIds.has(stu.id);
            const qrImg = qrMap[stu.id];
            const isActiveStu = stu.status === 'Aktif';
            return (
              <div
                key={stu.id}
                className={`bg-white border rounded-xl p-4 space-y-3 transition-colors ${
                  checked ? 'border-emerald-300' : 'border-slate-200 opacity-70'
                }`}
              >
                {/* Row Control Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 text-xs">
                  <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-900">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelect(stu.id)}
                      className="accent-emerald-700"
                    />
                    <span>{stu.nama}</span>
                    <span className="font-mono font-normal text-slate-500">
                      · NIS {stu.nis} · {stu.kelas}
                    </span>
                    <span className={isActiveStu ? 'text-emerald-700' : 'text-red-600'}>
                      · {stu.status}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleTestScanQr(stu)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-50 whitespace-nowrap"
                  >
                    <ScanLine className="w-3.5 h-3.5 text-emerald-700" />
                    Simulasi Scan QR Keaktifan
                  </button>
                </div>

                {/* Front + Back Side-by-Side Cards */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Tampak Depan */}
                  {(sideMode === 'both' || sideMode === 'front') && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between bg-white shadow-2xs">
                      <div className={`${activeTheme.bgClass} text-white px-4 py-2.5 flex items-center gap-3`}>
                        {state.settings.logoDataUrl && (
                          <img
                            src={state.settings.logoDataUrl}
                            alt="Logo"
                            className="w-8 h-8 object-contain bg-white/90 rounded p-0.5 shrink-0"
                          />
                        )}
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold tracking-wider">
                            KARTU TANDA PESERTA DIDIK — TAMPAK DEPAN
                          </div>
                          <div className="text-[10px] opacity-85 uppercase truncate">
                            {state.settings.namaSekolah}
                          </div>
                        </div>
                      </div>

                      <div className="p-4 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-16 h-20 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                            {stu.fotoDataUrl ? (
                              <img
                                src={stu.fotoDataUrl}
                                alt={stu.nama}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <User className="w-6 h-6 text-slate-400" />
                            )}
                          </div>
                          <div className="space-y-0.5 min-w-0">
                            <div className="text-sm font-bold text-slate-900 truncate">
                              {stu.nama}
                            </div>
                            <div className="font-mono text-[11px] text-slate-600">
                              NIS {stu.nis} · NISN {stu.nisn || '-'}
                            </div>
                            <div className="text-slate-700">
                              {stu.kelas} ({stu.fase})
                            </div>
                            <div className="text-slate-500 text-[11px]">
                              {stu.tempatLahir || '-'}, {formatTanggalID(stu.tanggalLahir)}
                            </div>
                            <div
                              className={`text-[11px] font-bold pt-1 ${
                                isActiveStu ? 'text-emerald-700' : 'text-red-600'
                              }`}
                            >
                              {isActiveStu
                                ? 'STATUS: PESERTA DIDIK AKTIF'
                                : `STATUS: NONAKTIF (${stu.status.toUpperCase()})`}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 text-center">
                          {qrImg ? (
                            <img
                              src={qrImg}
                              alt="QR Kartu"
                              className="w-14 h-14 border border-slate-200 rounded p-0.5"
                            />
                          ) : (
                            <QrCode className="w-12 h-12 text-slate-300" />
                          )}
                          <div className="text-[9px] text-slate-400 mt-0.5 font-mono">QR SCAN</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tampak Belakang */}
                  {(sideMode === 'both' || sideMode === 'back') && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between bg-white shadow-2xs">
                      <div className={`${activeTheme.bgClass} text-white px-4 py-2`}>
                        <div className="text-[11px] font-bold tracking-wider">
                          KETENTUAN & VERIFIKASI KEAKTIFAN — TAMPAK BELAKANG
                        </div>
                      </div>

                      <div className="p-4 flex items-start justify-between gap-4 text-[11px]">
                        <div className="space-y-2 text-slate-600 leading-relaxed flex-1">
                          <ol className="list-decimal list-inside space-y-0.5">
                            <li>Kartu ini adalah tanda pengenal resmi peserta didik aktif.</li>
                            <li>
                              Berlaku otomatis nonaktif apabila peserta didik lulus atau mutasi keluar.
                            </li>
                            <li>
                              Pindai kode QR untuk memverifikasi profil dan keaktifan secara real-time.
                            </li>
                          </ol>
                          <div className="text-slate-500 pt-1">
                            Berlaku s.d.: <strong className="text-slate-800">{validUntil || 'Selama Aktif'}</strong>
                          </div>
                          <div className="pt-1">
                            <div className="text-slate-500">Kepala {state.settings.namaSekolah}</div>
                            {state.settings.ttdKepalaDataUrl && (
                              <img
                                src={state.settings.ttdKepalaDataUrl}
                                alt="TTD Kepala"
                                className="h-6 object-contain my-0.5"
                              />
                            )}
                            <div className="font-bold text-slate-900">
                              {state.settings.kepalaSekolah || '-'}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 text-center space-y-1">
                          {qrImg ? (
                            <img
                              src={qrImg}
                              alt="QR Verifikasi Belakang"
                              className="w-20 h-20 border border-slate-200 rounded p-0.5"
                            />
                          ) : (
                            <QrCode className="w-16 h-16 text-slate-300" />
                          )}
                          <div className="font-mono text-[10px] font-semibold text-slate-700">
                            SCAN KEAKTIFAN
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Simulasi Scan QR Keaktifan */}
      {scanModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ScanLine className="w-4 h-4 text-emerald-700" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Hasil Scan QR Verifikasi Kartu Pelajar
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setScanModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-800 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 text-xs space-y-4">
              {scanning ? (
                <div className="py-8 text-center text-slate-500">
                  Memeriksa status keaktifan siswa dari server...
                </div>
              ) : scanResult && scanResult.found && scanResult.student ? (
                <>
                  <div
                    className={`p-3.5 rounded-xl border flex items-center gap-2.5 font-semibold ${
                      scanResult.aktifCard
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        : 'border-red-200 bg-red-50 text-red-900'
                    }`}
                  >
                    {scanResult.aktifCard ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600 shrink-0" />
                    )}
                    <div>
                      <div>
                        {scanResult.aktifCard
                          ? 'KARTU PELAJAR AKTIF & SAH'
                          : `KARTU NONAKTIF — SISWA ${scanResult.student.status.toUpperCase()}`}
                      </div>
                      <div className="text-[11px] font-normal mt-0.5">
                        Sinkron real-time dengan database mutasi siswa.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5 p-3.5 rounded-lg border border-slate-200 bg-slate-50">
                    <div className="w-14 h-16 rounded-lg border border-slate-200 bg-white overflow-hidden flex items-center justify-center shrink-0">
                      {scanResult.student.fotoDataUrl ? (
                        <img
                          src={scanResult.student.fotoDataUrl}
                          alt={scanResult.student.nama}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-bold text-slate-900">
                        {scanResult.student.nama}
                      </div>
                      <div className="font-mono text-slate-600">
                        NIS {scanResult.student.nis} · NISN {scanResult.student.nisn || '-'}
                      </div>
                      <div className="text-slate-700">
                        {scanResult.student.kelas} ({scanResult.student.fase})
                      </div>
                      <div className="text-slate-500">
                        {scanResult.school?.namaSekolah} · TA {scanResult.school?.tahunAjaran}
                      </div>
                    </div>
                  </div>

                  {scanResult.latestMutation && !scanResult.aktifCard && (
                    <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-900">
                      <div className="font-semibold">Keterangan Mutasi Terakhir:</div>
                      <div>
                        Mutasi {scanResult.latestMutation.jenis} pada{' '}
                        {formatTanggalID(scanResult.latestMutation.tanggal)} —{' '}
                        {scanResult.latestMutation.sekolahAsalTujuan} (
                        {scanResult.latestMutation.alasan})
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-6 text-center text-red-600">
                  Data kartu pelajar tidak ditemukan di database.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
