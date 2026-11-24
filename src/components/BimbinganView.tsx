import React, { useMemo, useState } from 'react';
import {
  Calendar,
  CalendarClock,
  CheckCircle2,
  Search,
  Send,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  AppState,
  TutoringRecommendation,
  TutoringRequest,
  TutoringRequestStatus,
  UserAccount,
} from '../types';
import {
  filterSubjectsForUser,
  formatTanggalID,
  getAccessibleClassesForUser,
  getSubjectCPsForClass,
  getSubjectsForClass,
} from '../utils/academic';

interface BimbinganViewProps {
  state: AppState;
  currentUser: UserAccount;
  selectedClass: string;
  onCreateRecommendation: (payload: {
    studentId: string;
    subjectId: string;
    cpId: string;
    tpId?: string;
    rekomendasiGuru: string;
    tanggalRekomendasi: string;
  }) => Promise<boolean>;
  onDeleteRecommendation: (id: string) => Promise<boolean>;
  onUpdateRequest: (
    id: string,
    payload: {
      status?: TutoringRequestStatus;
      jadwalTanggal?: string;
      jadwalWaktu?: string;
      jadwalLokasi?: string;
      pembimbingNama?: string;
      catatanSekolah?: string;
    }
  ) => Promise<boolean>;
  onScheduleBatch: (payload: {
    requestIds: string[];
    jadwalTanggal: string;
    jadwalWaktu: string;
    jadwalLokasi: string;
    pembimbingNama: string;
    catatanSekolah?: string;
  }) => Promise<boolean>;
  onNotify: (msg: string, isError?: boolean) => void;
}

interface CpTpSummaryGroup {
  key: string;
  subjectId: string;
  subjectName: string;
  cpId: string;
  cpKode: string;
  cpDeskripsi: string;
  tpId?: string;
  tpKode?: string;
  tpDeskripsi?: string;
  requests: TutoringRequest[];
  uniqueStudentCount: number;
  pendingCount: number;
  approvedCount: number;
  scheduledCount: number;
  completedCount: number;
}

const STATUS_STYLE_MAP: Record<TutoringRequestStatus, string> = {
  'Menunggu Konfirmasi': 'text-amber-700',
  'Disetujui Guru': 'text-sky-700',
  'Dikonfirmasi Pengurus': 'text-emerald-700',
  Terjadwal: 'text-emerald-800',
  Selesai: 'text-slate-600',
  Ditolak: 'text-red-700',
};

export const BimbinganView: React.FC<BimbinganViewProps> = ({
  state,
  currentUser,
  selectedClass,
  onCreateRecommendation,
  onDeleteRecommendation,
  onUpdateRequest,
  onScheduleBatch,
  onNotify,
}) => {
  const isAdmin = currentUser.role === 'admin';
  const [activeTab, setActiveTab] = useState<'rekap' | 'requests' | 'recommendations'>('rekap');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterSubject, setFilterSubject] = useState<string>('ALL');
  const [filterClass, setFilterClass] = useState<string>('ALL');

  const requests = state.tutoringRequests || [];
  const recommendations = state.tutoringRecommendations || [];

  const accessibleClasses = getAccessibleClassesForUser(state.classes, currentUser);
  const activeStudents = state.students.filter((s) => {
    if (s.status !== 'Aktif') return false;
    if (isAdmin) return true;
    return accessibleClasses.includes(s.kelas);
  });

  // Batch schedule modal state
  const [batchTargetGroup, setBatchTargetGroup] = useState<CpTpSummaryGroup | null>(null);
  const [singleTargetReq, setSingleTargetReq] = useState<TutoringRequest | null>(null);
  const [schedTanggal, setSchedTanggal] = useState(() => new Date().toISOString().slice(0, 10));
  const [schedWaktu, setSchedWaktu] = useState('14:00 - 15:30 WIB');
  const [schedLokasi, setSchedLokasi] = useState('Ruang Bimbingan / Google Meet');
  const [schedPembimbing, setSchedPembimbing] = useState(currentUser.nama);
  const [schedCatatan, setSchedCatatan] = useState('');
  const [schedBusy, setSchedBusy] = useState(false);

  // Recommendation creator form
  const defaultStudent =
    activeStudents.find((s) => s.kelas === selectedClass) || activeStudents[0] || null;
  const [recStudentId, setRecStudentId] = useState(defaultStudent?.id || '');
  const recStudent = activeStudents.find((s) => s.id === recStudentId) || defaultStudent;

  const recAvailableSubjects = useMemo(() => {
    if (!recStudent) return [];
    const classSubjs = getSubjectsForClass(
      state.subjects,
      recStudent.kelas,
      state.classDefs,
      recStudent.jurusan || 'Umum'
    );
    return filterSubjectsForUser(classSubjs, currentUser, recStudent.kelas);
  }, [recStudent, state.subjects, state.classDefs, currentUser]);

  const [recSubjectId, setRecSubjectId] = useState('');
  const activeRecSubject =
    recAvailableSubjects.find((s) => s.id === recSubjectId) || recAvailableSubjects[0] || null;

  const recCps = useMemo(() => {
    if (!activeRecSubject || !recStudent) return [];
    return getSubjectCPsForClass(activeRecSubject, recStudent.kelas, state.classDefs);
  }, [activeRecSubject, recStudent, state.classDefs]);

  const [recCpId, setRecCpId] = useState('');
  const activeRecCp = recCps.find((c) => c.id === recCpId) || recCps[0] || null;

  const [recTpId, setRecTpId] = useState('');
  const [recNote, setRecNote] = useState('');
  const [recDate, setRecDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sendingRec, setSendingRec] = useState(false);

  const filteredRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (filterStatus !== 'ALL' && r.status !== filterStatus) return false;
      if (filterSubject !== 'ALL' && r.subjectId !== filterSubject) return false;
      if (filterClass !== 'ALL' && r.kelas !== filterClass) return false;
      if (!q) return true;
      return (
        r.studentName.toLowerCase().includes(q) ||
        r.nis.toLowerCase().includes(q) ||
        r.subjectName.toLowerCase().includes(q) ||
        r.cpKode.toLowerCase().includes(q) ||
        (r.tpDeskripsi || '').toLowerCase().includes(q) ||
        r.alasan.toLowerCase().includes(q)
      );
    });
  }, [requests, filterStatus, filterSubject, filterClass, search]);

  // Aggregate total unique students per CP & TP (same or different) for scheduling
  const cpTpGroups = useMemo<CpTpSummaryGroup[]>(() => {
    const map = new Map<string, TutoringRequest[]>();
    filteredRequests.forEach((r) => {
      const key = `${r.subjectId}::${r.cpId}::${r.tpId || 'CP_ALL'}`;
      const list = map.get(key) || [];
      list.push(r);
      map.set(key, list);
    });

    const groups: CpTpSummaryGroup[] = [];
    map.forEach((list, key) => {
      const first = list[0];
      const activeStudentIds = new Set(
        list.filter((x) => x.status !== 'Ditolak').map((x) => x.studentId)
      );
      groups.push({
        key,
        subjectId: first.subjectId,
        subjectName: first.subjectName,
        cpId: first.cpId,
        cpKode: first.cpKode,
        cpDeskripsi: first.cpDeskripsi,
        tpId: first.tpId,
        tpKode: first.tpKode,
        tpDeskripsi: first.tpDeskripsi,
        requests: list,
        uniqueStudentCount: activeStudentIds.size,
        pendingCount: list.filter((x) => x.status === 'Menunggu Konfirmasi').length,
        approvedCount: list.filter(
          (x) => x.status === 'Disetujui Guru' || x.status === 'Dikonfirmasi Pengurus'
        ).length,
        scheduledCount: list.filter((x) => x.status === 'Terjadwal').length,
        completedCount: list.filter((x) => x.status === 'Selesai').length,
      });
    });

    return groups.sort((a, b) => b.uniqueStudentCount - a.uniqueStudentCount);
  }, [filteredRequests]);

  const uniqueStudentsTotal = new Set(
    requests.filter((r) => r.status !== 'Ditolak').map((r) => r.studentId)
  ).size;
  const pendingTotal = requests.filter((r) => r.status === 'Menunggu Konfirmasi').length;
  const scheduledTotal = requests.filter((r) => r.status === 'Terjadwal').length;

  const subjectOptions = Array.from(
    new Map(requests.map((r) => [r.subjectId, { id: r.subjectId, nama: r.subjectName }])).values()
  );

  const handleOpenBatchSchedule = (grp: CpTpSummaryGroup) => {
    setBatchTargetGroup(grp);
    setSingleTargetReq(null);
    setSchedTanggal(new Date().toISOString().slice(0, 10));
    setSchedWaktu('14:00 - 15:30 WIB');
    setSchedLokasi('Ruang Bimbingan Sekolah / Google Meet');
    setSchedPembimbing(currentUser.nama);
    setSchedCatatan(`Jadwal bimbingan kelompok untuk ${grp.subjectName} (${grp.cpKode}${grp.tpKode ? ` · ${grp.tpKode}` : ''}).`);
  };

  const handleOpenSingleSchedule = (reqItem: TutoringRequest) => {
    setSingleTargetReq(reqItem);
    setBatchTargetGroup(null);
    setSchedTanggal(reqItem.jadwalTanggal || new Date().toISOString().slice(0, 10));
    setSchedWaktu(reqItem.jadwalWaktu || '14:00 - 15:30 WIB');
    setSchedLokasi(reqItem.jadwalLokasi || 'Ruang Bimbingan / Google Meet');
    setSchedPembimbing(reqItem.pembimbingNama || currentUser.nama);
    setSchedCatatan(reqItem.catatanSekolah || '');
  };

  const handleSubmitSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedTanggal.trim()) {
      onNotify('Tanggal pelaksanaan bimbingan wajib diisi.', true);
      return;
    }
    setSchedBusy(true);
    try {
      if (batchTargetGroup) {
        const ids = batchTargetGroup.requests
          .filter((r) => r.status !== 'Selesai' && r.status !== 'Ditolak')
          .map((r) => r.id);
        if (ids.length === 0) {
          onNotify('Tidak ada ajuan aktif untuk dijadwalkan pada kelompok ini.', true);
          return;
        }
        const ok = await onScheduleBatch({
          requestIds: ids,
          jadwalTanggal: schedTanggal,
          jadwalWaktu: schedWaktu,
          jadwalLokasi: schedLokasi,
          pembimbingNama: schedPembimbing,
          catatanSekolah: schedCatatan,
        });
        if (ok) {
          onNotify(`Berhasil menjadwalkan ${ids.length} ajuan bimbingan pada ${batchTargetGroup.cpKode}.`);
          setBatchTargetGroup(null);
        } else {
          onNotify('Gagal menjadwalkan kelompok bimbingan.', true);
        }
      } else if (singleTargetReq) {
        const ok = await onUpdateRequest(singleTargetReq.id, {
          status: 'Terjadwal',
          jadwalTanggal: schedTanggal,
          jadwalWaktu: schedWaktu,
          jadwalLokasi: schedLokasi,
          pembimbingNama: schedPembimbing,
          catatanSekolah: schedCatatan,
        });
        if (ok) {
          onNotify(`Bimbingan belajar untuk ${singleTargetReq.studentName} telah dijadwalkan.`);
          setSingleTargetReq(null);
        } else {
          onNotify('Gagal menyimpan jadwal bimbingan.', true);
        }
      }
    } finally {
      setSchedBusy(false);
    }
  };

  const handleQuickConfirm = async (reqItem: TutoringRequest, nextStatus: TutoringRequestStatus) => {
    const ok = await onUpdateRequest(reqItem.id, {
      status: nextStatus,
      catatanSekolah:
        nextStatus === 'Ditolak'
          ? 'Silakan hubungi wali kelas / guru mapel untuk penyesuaian materi.'
          : nextStatus === 'Disetujui Guru'
            ? `Disetujui oleh ${currentUser.nama} untuk dilanjutkan ke penjadwalan.`
            : nextStatus === 'Dikonfirmasi Pengurus'
              ? `Dikonfirmasi oleh Pengurus (${currentUser.nama}).`
              : reqItem.catatanSekolah,
    });
    if (ok) {
      onNotify(`Status ajuan ${reqItem.studentName} diperbarui menjadi "${nextStatus}".`);
    } else {
      onNotify('Gagal memperbarui status ajuan bimbingan.', true);
    }
  };

  const handleCreateRecSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recStudent || !activeRecSubject || !activeRecCp) {
      onNotify('Pilih siswa, mata pelajaran, dan CP terlebih dahulu.', true);
      return;
    }
    if (!recNote.trim()) {
      onNotify('Tuliskan alasan / catatan rekomendasi bimbingan belajar.', true);
      return;
    }
    setSendingRec(true);
    try {
      const ok = await onCreateRecommendation({
        studentId: recStudent.id,
        subjectId: activeRecSubject.id,
        cpId: activeRecCp.id,
        tpId: recTpId || undefined,
        rekomendasiGuru: recNote.trim(),
        tanggalRekomendasi: recDate,
      });
      if (ok) {
        setRecNote('');
        onNotify(`Rekomendasi bimbingan untuk ${recStudent.nama} berhasil dikirim ke Portal Orang Tua.`);
      } else {
        onNotify('Gagal mengirim rekomendasi bimbingan.', true);
      }
    } finally {
      setSendingRec(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & KPI Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Bimbingan Belajar Terpadu Berbasis CP & TP
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Konfirmasi ajuan bimbingan belajar dari Orang Tua, kirim rekomendasi guru, dan lihat rangkuman total siswa per CP & TP untuk penjadwalan kelompok.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs shrink-0 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('rekap')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'rekap'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Rangkuman CP & TP ({cpTpGroups.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('requests')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'requests'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ajuan Orang Tua ({requests.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('recommendations')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'recommendations'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Rekomendasi Guru ({recommendations.length})
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
            <div className="text-xs text-slate-500">Topik CP / TP Diajukan</div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {cpTpGroups.length}
            </div>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
            <div className="text-xs text-slate-500">Total Siswa Unik Mengajukan</div>
            <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
              {uniqueStudentsTotal}
            </div>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
            <div className="text-xs text-slate-500">Menunggu Konfirmasi</div>
            <div className="text-xl font-bold font-mono tabular-nums text-amber-700 mt-1">
              {pendingTotal}
            </div>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
            <div className="text-xs text-slate-500">Sudah Terjadwal</div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {scheduledTotal}
            </div>
          </div>
        </div>

        {activeTab !== 'recommendations' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-1">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari siswa, CP/TP, atau alasan..."
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-300 bg-white focus:border-emerald-700 focus:outline-none"
              />
            </div>
            <select
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3"
            >
              <option value="ALL">Semua Mata Pelajaran</option>
              {subjectOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nama}
                </option>
              ))}
            </select>
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3"
            >
              <option value="ALL">Semua Kelas</option>
              {(isAdmin ? state.classes : accessibleClasses).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3"
            >
              <option value="ALL">Semua Status</option>
              <option value="Menunggu Konfirmasi">Menunggu Konfirmasi</option>
              <option value="Disetujui Guru">Disetujui Guru</option>
              <option value="Dikonfirmasi Pengurus">Dikonfirmasi Pengurus</option>
              <option value="Terjadwal">Terjadwal</option>
              <option value="Selesai">Selesai</option>
              <option value="Ditolak">Ditolak</option>
            </select>
          </div>
        )}
      </div>

      {/* TAB 1: Rangkuman Total Siswa per CP & TP untuk Penjadwalan */}
      {activeTab === 'rekap' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Rangkuman Total Siswa per CP & TP (Pengaturan Jadwal Kelompok)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Pengajuan dengan CP dan TP yang sama dikelompokkan otomatis agar Pengurus dan Guru terkait dapat langsung menjadwalkan sesi bersama.
              </p>
            </div>
          </div>

          {cpTpGroups.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500">
              Belum ada ajuan bimbingan belajar yang sesuai dengan filter.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {cpTpGroups.map((grp) => {
                const schedulableCount = grp.requests.filter(
                  (r) => r.status !== 'Selesai' && r.status !== 'Ditolak'
                ).length;
                return (
                  <div key={grp.key} className="p-5 space-y-3 text-xs">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          <span className="font-semibold text-emerald-700">{grp.subjectName}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono font-semibold text-slate-800">{grp.cpKode}</span>
                          {grp.tpKode && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono font-semibold text-slate-800">{grp.tpKode}</span>
                            </>
                          )}
                        </div>
                        <div className="text-sm font-semibold text-slate-900 leading-snug">
                          {grp.tpDeskripsi
                            ? grp.tpDeskripsi
                            : `Seluruh Tujuan pada ${grp.cpKode}: ${grp.cpDeskripsi}`}
                        </div>
                        {grp.tpDeskripsi && (
                          <div className="text-slate-500 leading-relaxed">
                            CP: {grp.cpDeskripsi}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-4 shrink-0">
                        <div className="text-right">
                          <div className="text-[11px] text-slate-500">Total Siswa Mengajukan</div>
                          <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                            {grp.uniqueStudentCount} Siswa
                          </div>
                          <div className="text-[11px] text-slate-500 tabular-nums">
                            {grp.pendingCount} Menunggu · {grp.approvedCount} Disetujui · {grp.scheduledCount} Terjadwal
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={schedulableCount === 0}
                          onClick={() => handleOpenBatchSchedule(grp)}
                          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-40 whitespace-nowrap shrink-0"
                        >
                          <CalendarClock className="w-3.5 h-3.5" />
                          Jadwalkan Kelompok ({schedulableCount})
                        </button>
                      </div>
                    </div>

                    {/* Students inside this CP/TP group */}
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                          <tr>
                            <th className="px-3.5 py-2">Peserta Didik</th>
                            <th className="px-3.5 py-2">Kelas</th>
                            <th className="px-3.5 py-2">Tanggal Ajuan</th>
                            <th className="px-3.5 py-2">Alasan & Sumber</th>
                            <th className="px-3.5 py-2">Status & Jadwal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {grp.requests.map((r) => (
                            <tr key={r.id}>
                              <td className="px-3.5 py-2 font-medium text-slate-900">
                                {r.studentName}{' '}
                                <span className="font-mono text-[11px] text-slate-500">({r.nis})</span>
                              </td>
                              <td className="px-3.5 py-2 text-slate-700 whitespace-nowrap">{r.kelas}</td>
                              <td className="px-3.5 py-2 font-mono text-slate-600 whitespace-nowrap">
                                {formatTanggalID(r.tanggalAjuan)}
                              </td>
                              <td className="px-3.5 py-2 text-slate-600">
                                <div>{r.alasan}</div>
                                <div className="text-[11px] text-slate-400">Sumber: {r.sumber}</div>
                              </td>
                              <td className="px-3.5 py-2">
                                <div className={`font-semibold ${STATUS_STYLE_MAP[r.status]}`}>
                                  {r.status}
                                </div>
                                {r.jadwalTanggal && (
                                  <div className="text-[11px] text-slate-600 font-mono">
                                    {formatTanggalID(r.jadwalTanggal)} · {r.jadwalWaktu || '-'} ({r.jadwalLokasi || '-'})
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Daftar Ajuan & Konfirmasi Individual */}
      {activeTab === 'requests' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">
              Daftar Pengajuan Bimbingan Belajar & Konfirmasi Guru / Pengurus
            </h3>
          </div>

          {filteredRequests.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500">
              Belum ada pengajuan bimbingan belajar dari orang tua.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredRequests.map((r) => (
                <div
                  key={r.id}
                  className="p-5 flex flex-col lg:flex-row lg:items-start justify-between gap-4 text-xs"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span className="font-semibold text-slate-900 text-xs">{r.studentName}</span>
                      <span>·</span>
                      <span>{r.kelas}</span>
                      <span>·</span>
                      <span className="font-semibold text-emerald-700">{r.subjectName}</span>
                      <span>·</span>
                      <span className="font-mono">Ajuan: {formatTanggalID(r.tanggalAjuan)}</span>
                    </div>

                    <div className="font-semibold text-slate-900">
                      {r.cpKode}
                      {r.tpKode ? ` · ${r.tpKode}: ${r.tpDeskripsi}` : ` — ${r.cpDeskripsi}`}
                    </div>

                    <p className="text-slate-600 leading-relaxed">
                      <strong>Alasan Orang Tua ({r.parentName}):</strong> {r.alasan}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px]">
                      <span className={`font-semibold ${STATUS_STYLE_MAP[r.status]}`}>
                        Status: {r.status}
                      </span>
                      {r.confirmedByGuruName && (
                        <span className="text-slate-500">
                          · Disetujui Guru: {r.confirmedByGuruName}
                        </span>
                      )}
                      {r.approvedByPengurusName && (
                        <span className="text-slate-500">
                          · Dikonfirmasi Pengurus: {r.approvedByPengurusName}
                        </span>
                      )}
                    </div>

                    {r.jadwalTanggal && (
                      <div className="p-2.5 rounded-lg border border-emerald-200 bg-emerald-50/70 text-emerald-950 space-y-0.5">
                        <div className="font-semibold">
                          Jadwal: {formatTanggalID(r.jadwalTanggal)} · {r.jadwalWaktu || '-'}
                        </div>
                        <div>
                          Lokasi/Media: {r.jadwalLokasi || '-'} · Pembimbing:{' '}
                          {r.pembimbingNama || '-'}
                        </div>
                        {r.catatanSekolah && <div>Catatan: {r.catatanSekolah}</div>}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {!isAdmin && r.status === 'Menunggu Konfirmasi' && (
                      <button
                        type="button"
                        onClick={() => handleQuickConfirm(r, 'Disetujui Guru')}
                        className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-sky-700 bg-sky-50 text-sky-900 font-semibold hover:bg-sky-100 whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Setujui Guru
                      </button>
                    )}

                    {isAdmin &&
                      (r.status === 'Menunggu Konfirmasi' || r.status === 'Disetujui Guru') && (
                        <button
                          type="button"
                          onClick={() => handleQuickConfirm(r, 'Dikonfirmasi Pengurus')}
                          className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-emerald-700 bg-emerald-50 text-emerald-900 font-semibold hover:bg-emerald-100 whitespace-nowrap"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Konfirmasi Pengurus
                        </button>
                      )}

                    {r.status !== 'Ditolak' && r.status !== 'Selesai' && (
                      <button
                        type="button"
                        onClick={() => handleOpenSingleSchedule(r)}
                        className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-emerald-700 text-white font-semibold hover:bg-emerald-800 whitespace-nowrap"
                      >
                        <Calendar className="w-3.5 h-3.5" /> Atur Jadwal
                      </button>
                    )}

                    {r.status === 'Terjadwal' && (
                      <button
                        type="button"
                        onClick={() => handleQuickConfirm(r, 'Selesai')}
                        className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-slate-300 bg-white text-slate-800 font-semibold hover:bg-slate-50 whitespace-nowrap"
                      >
                        Tandai Selesai
                      </button>
                    )}

                    {r.status === 'Menunggu Konfirmasi' && (
                      <button
                        type="button"
                        onClick={() => handleQuickConfirm(r, 'Ditolak')}
                        className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-red-200 bg-white text-red-700 font-medium hover:bg-red-50 whitespace-nowrap"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Tolak
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Rekomendasi Bimbingan Belajar dari Guru */}
      {activeTab === 'recommendations' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start text-xs">
          <form
            onSubmit={handleCreateRecSubmit}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          >
            <div className="border-b border-slate-200 pb-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Kirim Rekomendasi Bimbingan Belajar ke Orang Tua
              </h3>
              <p className="text-slate-500 mt-0.5">
                Rekomendasi akan langsung terbaca pada Portal Orang Tua agar wali murid dapat mengajukan jadwal bimbingan untuk CP/TP terkait.
              </p>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Peserta Didik *</label>
              <select
                value={recStudent?.id || ''}
                onChange={(e) => {
                  setRecStudentId(e.target.value);
                  setRecSubjectId('');
                  setRecCpId('');
                  setRecTpId('');
                }}
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3"
              >
                {activeStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nama} — {s.kelas} ({s.nis})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Mata Pelajaran (Sesuai Penugasan) *
              </label>
              <select
                value={activeRecSubject?.id || ''}
                onChange={(e) => {
                  setRecSubjectId(e.target.value);
                  setRecCpId('');
                  setRecTpId('');
                }}
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3"
              >
                {recAvailableSubjects.length === 0 ? (
                  <option value="">Tidak ada mapel sesuai penugasan pada kelas siswa ini</option>
                ) : (
                  recAvailableSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.kode} — {s.nama}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Capaian Pembelajaran (CP) *
              </label>
              <select
                value={activeRecCp?.id || ''}
                onChange={(e) => {
                  setRecCpId(e.target.value);
                  setRecTpId('');
                }}
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3"
              >
                {recCps.map((cp) => (
                  <option key={cp.id} value={cp.id}>
                    {cp.kode} — {cp.deskripsi.slice(0, 70)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Tujuan Pembelajaran (TP) Spesifik (Opsional)
              </label>
              <select
                value={recTpId}
                onChange={(e) => setRecTpId(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3"
              >
                <option value="">Seluruh TP dalam CP ini</option>
                {(activeRecCp?.tps || []).map((tp) => (
                  <option key={tp.id} value={tp.id}>
                    {tp.kode} — {tp.deskripsi}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Tanggal Rekomendasi</label>
              <input
                type="date"
                value={recDate}
                onChange={(e) => setRecDate(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-300 px-3"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Catatan & Alasan Rekomendasi Guru *
              </label>
              <textarea
                rows={3}
                required
                value={recNote}
                onChange={(e) => setRecNote(e.target.value)}
                placeholder="Jelaskan materi yang perlu pendampingan atau klinik belajar..."
                className="w-full rounded-lg border border-slate-300 p-3 leading-relaxed"
              />
            </div>

            <button
              type="submit"
              disabled={sendingRec || !activeRecSubject || !activeRecCp}
              className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-700 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {sendingRec ? 'Mengirim Rekomendasi...' : 'Kirim Rekomendasi ke Orang Tua'}
            </button>
          </form>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Riwayat Rekomendasi Guru ({recommendations.length})
              </h3>
            </div>
            {recommendations.length === 0 ? (
              <div className="p-10 text-center text-slate-500">
                Belum ada rekomendasi bimbingan belajar yang dikirim.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {recommendations.map((rec) => (
                  <div key={rec.id} className="p-4 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-slate-900">
                          {rec.studentName} · {rec.kelas} ·{' '}
                          <span className="text-emerald-700">{rec.subjectName}</span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {rec.cpKode}
                          {rec.tpKode ? ` · ${rec.tpKode}` : ''} ·{' '}
                          {formatTanggalID(rec.tanggalRekomendasi)} · Status:{' '}
                          <strong className="text-slate-800">{rec.status}</strong>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await onDeleteRecommendation(rec.id);
                          if (ok) onNotify('Rekomendasi dihapus.');
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                        title="Hapus rekomendasi"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-slate-700 leading-relaxed">{rec.rekomendasiGuru}</p>
                    {rec.tpDeskripsi && (
                      <div className="text-[11px] text-slate-500">TP: {rec.tpDeskripsi}</div>
                    )}
                    <div className="text-[11px] text-slate-400">
                      Direkomendasikan oleh {rec.recommendedByName}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Penjadwalan Kelompok / Individual */}
      {(batchTargetGroup || singleTargetReq) && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitSchedule}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-lg overflow-hidden shadow-xl text-xs"
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-emerald-700" />
                <h3 className="text-sm font-semibold text-slate-900">
                  {batchTargetGroup
                    ? `Jadwalkan Kelompok (${batchTargetGroup.uniqueStudentCount} Siswa)`
                    : `Atur Jadwal Bimbingan — ${singleTargetReq?.studentName}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBatchTargetGroup(null);
                  setSingleTargetReq(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-800 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
                <div className="font-semibold text-slate-900">
                  {batchTargetGroup?.subjectName || singleTargetReq?.subjectName} ·{' '}
                  {batchTargetGroup?.cpKode || singleTargetReq?.cpKode}
                  {(batchTargetGroup?.tpKode || singleTargetReq?.tpKode) &&
                    ` · ${batchTargetGroup?.tpKode || singleTargetReq?.tpKode}`}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {batchTargetGroup?.tpDeskripsi ||
                    singleTargetReq?.tpDeskripsi ||
                    batchTargetGroup?.cpDeskripsi ||
                    singleTargetReq?.cpDeskripsi}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Tanggal Pelaksanaan *
                  </label>
                  <input
                    type="date"
                    required
                    value={schedTanggal}
                    onChange={(e) => setSchedTanggal(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Waktu / Jam *</label>
                  <input
                    type="text"
                    required
                    value={schedWaktu}
                    onChange={(e) => setSchedWaktu(e.target.value)}
                    placeholder="14:00 - 15:30 WIB"
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Ruang / Tautan Daring *
                  </label>
                  <input
                    type="text"
                    required
                    value={schedLokasi}
                    onChange={(e) => setSchedLokasi(e.target.value)}
                    placeholder="Ruang Belajar 2 / Google Meet"
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Guru Pembimbing *</label>
                  <input
                    type="text"
                    required
                    value={schedPembimbing}
                    onChange={(e) => setSchedPembimbing(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Catatan Persiapan / Materi Bimbingan
                </label>
                <textarea
                  rows={2}
                  value={schedCatatan}
                  onChange={(e) => setSchedCatatan(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2.5"
                />
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setBatchTargetGroup(null);
                  setSingleTargetReq(null);
                }}
                className="h-9 px-4 rounded-lg border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={schedBusy}
                className="h-9 px-4 rounded-lg bg-emerald-700 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {schedBusy ? 'Menyimpan Jadwal...' : 'Konfirmasi & Simpan Jadwal'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
