import React, { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Send, Users, Wifi, WifiOff } from 'lucide-react';
import {
  AppState,
  LogbookAuthorRole,
  LogbookEntry,
  UserAccount,
  UserRole,
} from '../types';
import {
  filterSubjectsForUser,
  getAccessibleClassesForUser,
  getSubjectsForClass,
} from '../utils/academic';

const ROLE_LABELS: Record<LogbookAuthorRole, string> = {
  guru: 'Guru Mapel',
  walikelas: 'Wali Kelas',
  admin: 'Pengurus PKBM',
  ortu: 'Orang Tua / Wali',
  siswa: 'Siswa / Peserta Didik',
};

const KATEGORI_LIST = [
  'Akademik',
  'Kehadiran',
  'Sikap & Perilaku',
  'Bimbingan Khusus',
  'Apresiasi',
  'Tindak Lanjut PKBM',
  'Konsultasi Orang Tua',
];

function formatShortTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

interface PenghubungViewProps {
  state: AppState;
  currentUser: UserAccount;
  selectedClass: string;
  activeRole: UserRole;
  senderName: string;
  onChangeSenderName: (name: string) => void;
  entries: LogbookEntry[];
  presenceUsers: Array<{ name: string; role: string }>;
  wsConnected: boolean;
  onCreateEntry: (
    entry: Omit<LogbookEntry, 'id' | 'replies' | 'createdAt' | 'updatedAt'>
  ) => Promise<boolean>;
  onReplyEntry: (
    entryId: string,
    authorRole: LogbookAuthorRole,
    authorName: string,
    pesan: string,
    nextStatus?: LogbookEntry['status']
  ) => Promise<boolean>;
  onUpdateStatus: (entryId: string, status: LogbookEntry['status']) => void;
  activeStudentId?: string;
  onChangeActiveStudentId?: (studentId: string) => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

export const PenghubungView: React.FC<PenghubungViewProps> = ({
  state,
  currentUser,
  selectedClass,
  activeRole,
  senderName,
  onChangeSenderName,
  entries,
  presenceUsers,
  wsConnected,
  onCreateEntry,
  onReplyEntry,
  onUpdateStatus,
  activeStudentId,
  onChangeActiveStudentId,
  onNotify,
}) => {
  const effectiveRole: LogbookAuthorRole = activeRole;
  const isOrtu = effectiveRole === 'ortu';

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

  // Scope students strictly by role
  const activeStudents = useMemo(() => {
    return state.students
      .filter((s) => {
        if (s.status !== 'Aktif') return false;
        if (effectiveRole === 'admin') return true;
        if (effectiveRole === 'ortu') {
          return (currentUser.linkedStudentIds || []).includes(s.id);
        }
        return accessibleClasses.includes(s.kelas);
      })
      .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  }, [state.students, effectiveRole, currentUser.linkedStudentIds, accessibleClasses]);

  const defaultStudent =
    (activeStudentId ? activeStudents.find((s) => s.id === activeStudentId) : undefined) ??
    activeStudents.find((s) => s.kelas === selectedClass) ??
    activeStudents[0];

  const [studentId, setStudentId] = useState(defaultStudent?.id ?? '');
  useEffect(() => {
    if (isOrtu && activeStudentId && activeStudents.some((s) => s.id === activeStudentId)) {
      setStudentId(activeStudentId);
    } else if (defaultStudent && !activeStudents.some((s) => s.id === studentId)) {
      setStudentId(defaultStudent.id);
    }
  }, [isOrtu, activeStudentId, defaultStudent, activeStudents, studentId]);

  const [subjectName, setSubjectName] = useState('');
  const [kategori, setKategori] = useState(isOrtu ? 'Konsultasi Orang Tua' : 'Akademik');
  const [prioritas, setPrioritas] = useState<LogbookEntry['prioritas']>('Normal');
  const [judul, setJudul] = useState('');
  const [pesan, setPesan] = useState('');
  const [sending, setSending] = useState(false);

  const [scopeFilter, setScopeFilter] = useState<'all' | 'class'>('all');
  const [statusFilter, setStatusFilter] = useState<'ALL' | LogbookEntry['status']>('ALL');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const targetStudent = activeStudents.find((s) => s.id === studentId) ?? defaultStudent;

  const studentSubjects = useMemo(() => {
    if (!targetStudent) return [];
    const classSubjs = getSubjectsForClass(
      state.subjects,
      targetStudent.kelas,
      state.classDefs,
      targetStudent.jurusan || 'Umum'
    );
    if (effectiveRole === 'guru') {
      return filterSubjectsForUser(classSubjs, currentUser, targetStudent.kelas);
    }
    return classSubjs;
  }, [targetStudent, state.subjects, state.classDefs, effectiveRole, currentUser]);

  // Filter entries according to user role & assignments
  const scopedEntries = useMemo(() => {
    return entries.filter((e) => {
      if (effectiveRole === 'admin') return true;
      if (effectiveRole === 'ortu') {
        return (currentUser.linkedStudentIds || []).includes(e.studentId);
      }
      return accessibleClasses.includes(e.kelas);
    });
  }, [entries, effectiveRole, currentUser.linkedStudentIds, accessibleClasses]);

  const visibleEntries = scopedEntries
    .filter((e) => scopeFilter !== 'class' || e.kelas === selectedClass)
    .filter((e) => statusFilter === 'ALL' || e.status === statusFilter);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetStudent) {
      onNotify('Pilih peserta didik terlebih dahulu.', true);
      return;
    }
    if (!judul.trim() || !pesan.trim()) {
      onNotify('Judul dan catatan perkembangan wajib diisi.', true);
      return;
    }
    setSending(true);
    try {
      const ok = await onCreateEntry({
        studentId: targetStudent.id,
        studentName: targetStudent.nama,
        kelas: targetStudent.kelas,
        authorRole: effectiveRole,
        authorName: senderName.trim() || ROLE_LABELS[effectiveRole],
        subjectName: subjectName || undefined,
        kategori,
        prioritas,
        judul: judul.trim(),
        pesan: pesan.trim(),
        status: 'Baru',
      });
      if (ok) {
        setJudul('');
        setPesan('');
        onNotify('Pesan Buku Penghubung dikirim secara real-time.');
      } else {
        onNotify('Gagal mengirim pesan ke server.', true);
      }
    } finally {
      setSending(false);
    }
  };

  const handleReply = async (entry: LogbookEntry) => {
    const text = (replyDrafts[entry.id] || '').trim();
    if (!text) return;
    const nextStatus =
      effectiveRole === 'walikelas' && entry.status === 'Baru' ? 'Dipantau Wali Kelas' : undefined;
    const ok = await onReplyEntry(
      entry.id,
      effectiveRole,
      senderName.trim() || ROLE_LABELS[effectiveRole],
      text,
      nextStatus
    );
    if (ok) {
      setReplyDrafts((prev) => ({ ...prev, [entry.id]: '' }));
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-semibold text-slate-900">
              Buku Penghubung 4-Arah (Pengurus · Wali Kelas · Guru · Orang Tua)
            </h2>
            <span
              className={`inline-flex items-center gap-1 text-xs font-medium ${
                wsConnected ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              {wsConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              {wsConnected ? 'Terhubung Real-Time' : 'Mode Sinkronisasi REST'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Komunikasi terarah sesuai penugasan kelas/mapel dan tautan anak orang tua untuk pendampingan akademik, kehadiran, dan pembinaan siswa.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-slate-600">
            <Users className="w-3.5 h-3.5 text-emerald-700" />
            <span className="font-medium">{Math.max(1, presenceUsers.length)} sesi aktif</span>
          </div>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Pengirim ({ROLE_LABELS[effectiveRole]}):</span>
            <input
              type="text"
              value={senderName}
              onChange={(e) => onChangeSenderName(e.target.value)}
              className="h-8 w-44 rounded-lg border border-slate-300 px-2.5 text-xs font-medium text-slate-900"
            />
          </div>
        </div>
      </div>

      {activeStudents.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-xs text-slate-500">
          {isOrtu
            ? 'Akun Orang Tua Anda belum ditautkan ke data siswa. Hubungi Pengurus PKBM untuk menautkan NIS ananda.'
            : 'Belum ada peserta didik aktif sesuai penugasan kelas Anda.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleCreate}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4 text-xs"
          >
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
              <MessageSquare className="w-4 h-4 text-emerald-700" />
              <h3 className="text-sm font-semibold text-slate-900">
                {isOrtu ? 'Kirim Pesan ke Wali Kelas / Guru' : 'Catat Perkembangan / Pesan Siswa'}
              </h3>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Peserta Didik</label>
              <select
                value={targetStudent?.id ?? ''}
                onChange={(e) => {
                  setStudentId(e.target.value);
                  if (isOrtu) onChangeActiveStudentId?.(e.target.value);
                }}
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-medium text-slate-900"
              >
                {activeStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nama} — {s.kelas}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Kategori Laporan</label>
                <select
                  value={kategori}
                  onChange={(e) => setKategori(e.target.value)}
                  className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5"
                >
                  {KATEGORI_LIST.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Tingkat Perhatian</label>
                <select
                  value={prioritas}
                  onChange={(e) => setPrioritas(e.target.value as LogbookEntry['prioritas'])}
                  className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5"
                >
                  <option value="Normal">Normal</option>
                  <option value="Perlu Perhatian">Perlu Perhatian</option>
                  <option value="Segera">Segera (Prioritas)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Terkait Mata Pelajaran (Opsional)
              </label>
              <select
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5"
              >
                <option value="">Umum / Non-Mapel Tertentu</option>
                {studentSubjects.map((s) => (
                  <option key={s.id} value={s.nama}>
                    {s.nama}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Ringkasan / Judul Catatan *
              </label>
              <input
                type="text"
                required
                value={judul}
                onChange={(e) => setJudul(e.target.value)}
                placeholder="Contoh: Koordinasi tugas proyek / Izin tidak masuk"
                className="w-full h-9 rounded-lg border border-slate-300 px-3"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Detail Pesan & Arahan Tindak Lanjut *
              </label>
              <textarea
                rows={4}
                required
                value={pesan}
                onChange={(e) => setPesan(e.target.value)}
                placeholder="Tuliskan pesan untuk Pengurus, Wali Kelas, Guru Mapel, atau Orang Tua..."
                className="w-full rounded-lg border border-slate-300 p-3 leading-relaxed"
              />
            </div>

            <button
              type="submit"
              disabled={sending}
              className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {sending ? 'Mengirim...' : 'Kirim ke Buku Penghubung (Real-Time)'}
            </button>
          </form>

          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
              {!isOrtu ? (
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
                  <button
                    type="button"
                    onClick={() => setScopeFilter('all')}
                    className={`px-3 py-1 rounded-md font-medium ${
                      scopeFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    Semua Penugasan ({scopedEntries.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setScopeFilter('class')}
                    className={`px-3 py-1 rounded-md font-medium ${
                      scopeFilter === 'class'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    {selectedClass}
                  </button>
                </div>
              ) : (
                <div className="text-xs font-semibold text-slate-800">
                  Komunikasi Anak Anda ({scopedEntries.length})
                </div>
              )}

              <div className="flex items-center gap-1.5 text-xs">
                {(['ALL', 'Baru', 'Dipantau Wali Kelas', 'Selesai'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-md border font-medium ${
                      statusFilter === st
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white text-slate-600 border-slate-300'
                    }`}
                  >
                    {st === 'ALL' ? 'Semua' : st}
                  </button>
                ))}
              </div>
            </div>

            {visibleEntries.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-xs text-slate-500">
                Belum ada catatan Buku Penghubung pada filter ini.
              </div>
            ) : (
              <div className="space-y-3">
                {visibleEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-slate-500">
                          <span className="font-semibold text-slate-900">{entry.studentName}</span>{' '}
                          · {entry.kelas} · {entry.kategori}
                          {entry.subjectName ? ` · ${entry.subjectName}` : ''}
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 mt-0.5">{entry.judul}</h4>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isOrtu ? (
                          <span className="text-[11px] font-semibold text-emerald-700">
                            Status: {entry.status}
                          </span>
                        ) : (
                          <select
                            value={entry.status}
                            onChange={(e) =>
                              onUpdateStatus(entry.id, e.target.value as LogbookEntry['status'])
                            }
                            className="h-7 rounded border border-slate-300 bg-white px-2 text-[11px] font-medium"
                          >
                            <option value="Baru">Baru</option>
                            <option value="Dipantau Wali Kelas">Dipantau Wali Kelas</option>
                            <option value="Selesai">Selesai</option>
                          </select>
                        )}
                      </div>
                    </div>

                    <p className="text-slate-700 leading-relaxed">{entry.pesan}</p>

                    <div className="text-[11px] text-slate-400">
                      Dikirim oleh {entry.authorName} ({ROLE_LABELS[entry.authorRole]}) ·{' '}
                      {formatShortTime(entry.createdAt)}
                    </div>

                    {entry.replies.length > 0 && (
                      <div className="pt-2 border-t border-slate-100 space-y-2">
                        {entry.replies.map((rep) => (
                          <div
                            key={rep.id}
                            className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-0.5"
                          >
                            <div className="font-semibold text-slate-800">
                              {rep.authorName} ({ROLE_LABELS[rep.authorRole]}){' '}
                              <span className="font-normal text-slate-400">
                                · {formatShortTime(rep.createdAt)}
                              </span>
                            </div>
                            <p className="text-slate-700">{rep.pesan}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="pt-2 flex items-center gap-2">
                      <input
                        type="text"
                        value={replyDrafts[entry.id] || ''}
                        onChange={(e) =>
                          setReplyDrafts((prev) => ({ ...prev, [entry.id]: e.target.value }))
                        }
                        placeholder="Tulis balasan atau tindak lanjut..."
                        className="flex-1 h-8 rounded-lg border border-slate-300 px-3"
                      />
                      <button
                        type="button"
                        onClick={() => handleReply(entry)}
                        className="h-8 px-3 rounded-lg bg-slate-900 text-white font-medium hover:bg-slate-800"
                      >
                        Balas
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
