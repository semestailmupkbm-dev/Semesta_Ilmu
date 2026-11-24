import React, { useState } from 'react';
import { ArrowLeftRight, CalendarCheck2, Lock, RotateCcw, UserMinus, UserPlus } from 'lucide-react';
import { AppState, MutationRecord, Student, UserAccount } from '../types';
import {
  generateNIS,
  getClassTingkat,
  getFaseFromTingkat,
  isInputLockedForUser,
} from '../utils/academic';

interface MutasiViewProps {
  state: AppState;
  currentUser: UserAccount;
  selectedClass: string;
  onMutasiMasuk: (student: Student, record: MutationRecord) => void;
  onMutasiKeluar: (studentId: string, record: MutationRecord) => void;
  onRestoreStudent: (studentId: string) => void;
  onMigrateAcademicYear: (params: {
    nextAcademicYear: string;
    nextReportDate: string;
    archiveCurrentYear: boolean;
    decisions: Record<
      string,
      { action: 'naik' | 'tinggal' | 'lulus'; targetClass: string; targetJurusan: string }
    >;
  }) => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

export const MutasiView: React.FC<MutasiViewProps> = ({
  state,
  currentUser,
  selectedClass,
  onMutasiMasuk,
  onMutasiKeluar,
  onRestoreStudent,
  onMigrateAcademicYear,
  onNotify,
}) => {
  const isAdmin = currentUser.role === 'admin';
  const lockStatus = isInputLockedForUser(state.settings, state.academicYears, currentUser);
  const orderedClasses =
    state.classDefs.length > 0
      ? [...state.classDefs].sort((a, b) => a.urutan - b.urutan).map((c) => c.nama)
      : state.classes;

  const activeStudents = state.students.filter(
    (s) => s.status === 'Aktif' && (isAdmin || s.kelas === selectedClass)
  );
  const [tab, setTab] = useState<'mutasi' | 'migrasi'>('mutasi');
  const [mutFilter, setMutFilter] = useState<'ALL' | 'Masuk' | 'Keluar'>('ALL');
  const [mutSearch, setMutSearch] = useState('');

  // Mutasi Masuk state
  const [inNama, setInNama] = useState('');
  const [inNisn, setInNisn] = useState('');
  const [inNis, setInNis] = useState('');
  const [inKelas, setInKelas] = useState(selectedClass);
  const [inJk, setInJk] = useState<'L' | 'P'>('L');
  const [inJurusan, setInJurusan] = useState('Umum');
  const [inTempatLahir, setInTempatLahir] = useState('');
  const [inTanggalLahir, setInTanggalLahir] = useState('');
  const [inSekolahAsal, setInSekolahAsal] = useState('');
  const [inNomorSurat, setInNomorSurat] = useState('');
  const [inTanggal, setInTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [inAlasan, setInAlasan] = useState('');

  // Mutasi Keluar state
  const [outStudentId, setOutStudentId] = useState(activeStudents[0]?.id || '');
  const [outSekolahTujuan, setOutSekolahTujuan] = useState('');
  const [outNomorSurat, setOutNomorSurat] = useState('');
  const [outTanggal, setOutTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [outAlasan, setOutAlasan] = useState('');

  // Migrasi TA state
  const curYear = state.settings.tahunAjaran;
  const yearMatch = curYear.match(/^(\d{4})\/(\d{4})$/);
  const defaultNextYear = yearMatch
    ? `${Number(yearMatch[1]) + 1}/${Number(yearMatch[2]) + 1}`
    : '2027/2028';
  const [nextYear, setNextYear] = useState(defaultNextYear);
  const [nextReportDate, setNextReportDate] = useState(state.settings.tanggalRapor);
  const [archiveCurrent, setArchiveCurrent] = useState(true);
  const [decisions, setDecisions] = useState<
    Record<string, { action: 'naik' | 'tinggal' | 'lulus'; targetClass: string; targetJurusan: string }>
  >(() => {
    const map: Record<
      string,
      { action: 'naik' | 'tinggal' | 'lulus'; targetClass: string; targetJurusan: string }
    > = {};
    activeStudents.forEach((stu) => {
      const idx = orderedClasses.indexOf(stu.kelas);
      const t = getClassTingkat(stu.kelas, state.classDefs) ?? 7;
      if (t === 6 || t === 9 || t === 12) {
        map[stu.id] = { action: 'lulus', targetClass: stu.kelas, targetJurusan: stu.jurusan || 'Umum' };
      } else {
        const nextCls =
          idx >= 0 && idx + 1 < orderedClasses.length ? orderedClasses[idx + 1] : stu.kelas;
        map[stu.id] = {
          action: 'naik',
          targetClass: nextCls,
          targetJurusan: stu.jurusan || 'Umum',
        };
      }
    });
    return map;
  });

  const handleSubmitMasuk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inNama.trim() || !inSekolahAsal.trim()) {
      onNotify('Nama peserta didik dan sekolah/PKBM asal wajib diisi.', true);
      return;
    }
    const stuId = `stu-${Date.now()}`;
    const nis =
      inNis.trim() || generateNIS(inKelas, state.students, state.settings.tahunAjaran, state.classDefs);
    const t = getClassTingkat(inKelas, state.classDefs) ?? 7;
    const newStu: Student = {
      id: stuId,
      nis,
      nisn: inNisn.trim(),
      nama: inNama.trim(),
      kelas: inKelas,
      fase: getFaseFromTingkat(t),
      jurusan: t >= 11 ? inJurusan : 'Umum',
      jenisKelamin: inJk,
      tempatLahir: inTempatLahir.trim(),
      tanggalLahir: inTanggalLahir,
      agama: 'Islam',
      pendidikanSebelumnya: inSekolahAsal.trim(),
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
      awalMasukNote: `Mutasi masuk dari ${inSekolahAsal.trim()} (${inTanggal})`,
    };
    const rec: MutationRecord = {
      id: `mut-${Date.now()}`,
      jenis: 'Masuk',
      tanggal: inTanggal,
      studentId: stuId,
      nis,
      nisn: inNisn.trim(),
      namaSiswa: newStu.nama,
      kelas: inKelas,
      sekolahAsalTujuan: inSekolahAsal.trim(),
      nomorSurat: inNomorSurat.trim() || '-',
      alasan: inAlasan.trim() || 'Mutasi Masuk',
      tahunAjaran: state.settings.tahunAjaran,
      createdAt: new Date().toISOString(),
    };
    onMutasiMasuk(newStu, rec);
    setInNama('');
    setInNisn('');
    setInNis('');
    setInSekolahAsal('');
    setInNomorSurat('');
    setInAlasan('');
  };

  const handleSubmitKeluar = (e: React.FormEvent) => {
    e.preventDefault();
    const stu = activeStudents.find((s) => s.id === outStudentId);
    if (!stu) {
      onNotify('Pilih peserta didik aktif yang akan dimutasi keluar.', true);
      return;
    }
    if (!outSekolahTujuan.trim()) {
      onNotify('Masukkan nama sekolah / PKBM tujuan mutasi.', true);
      return;
    }
    const rec: MutationRecord = {
      id: `mut-${Date.now()}`,
      jenis: 'Keluar',
      tanggal: outTanggal,
      studentId: stu.id,
      nis: stu.nis,
      nisn: stu.nisn,
      namaSiswa: stu.nama,
      kelas: stu.kelas,
      sekolahAsalTujuan: outSekolahTujuan.trim(),
      nomorSurat: outNomorSurat.trim() || '-',
      alasan: outAlasan.trim() || 'Mutasi Keluar',
      tahunAjaran: state.settings.tahunAjaran,
      createdAt: new Date().toISOString(),
    };
    onMutasiKeluar(stu.id, rec);
    setOutSekolahTujuan('');
    setOutNomorSurat('');
    setOutAlasan('');
  };

  const filteredMutations = state.mutations
    .filter((m) => mutFilter === 'ALL' || m.jenis === mutFilter)
    .filter((m) => {
      const q = mutSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        m.namaSiswa.toLowerCase().includes(q) ||
        m.nis.toLowerCase().includes(q) ||
        m.sekolahAsalTujuan.toLowerCase().includes(q) ||
        m.nomorSurat.toLowerCase().includes(q)
      );
    });

  return (
    <div className="space-y-6">
      {lockStatus.locked && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2.5 text-xs text-amber-900">
          <Lock className="w-4 h-4 text-amber-700 shrink-0" />
          <span>{lockStatus.reason}</span>
        </div>
      )}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Mutasi Siswa & Migrasi Tahun Ajaran
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tahun Ajaran Aktif:{' '}
            <span className="font-mono font-semibold text-slate-800">
              {state.settings.tahunAjaran}
            </span>{' '}
            · Siswa Aktif: {activeStudents.length} · Riwayat Mutasi: {state.mutations.length} · Arsip Tahun: {state.archives.length}
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0 text-xs">
          <button
            type="button"
            onClick={() => setTab('mutasi')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === 'mutasi'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" /> Mutasi Siswa
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setTab('migrasi')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 font-medium rounded-md transition-colors whitespace-nowrap ${
                tab === 'migrasi'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarCheck2 className="w-3.5 h-3.5" /> Migrasi Tahun Ajaran
            </button>
          )}
        </div>
      </div>

      {tab === 'mutasi' ? (
        <div className="space-y-6">
          <div className={`grid grid-cols-1 ${isAdmin ? 'lg:grid-cols-2' : ''} gap-6 items-start`}>
            {isAdmin && (
              <form
                onSubmit={handleSubmitMasuk}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs"
              >
              <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                <UserPlus className="w-4 h-4 text-emerald-700" />
                <h3 className="text-sm font-semibold text-slate-900">Mutasi Masuk</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">
                    Nama Lengkap Peserta Didik *
                  </label>
                  <input
                    type="text"
                    required
                    value={inNama}
                    onChange={(e) => setInNama(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">NISN</label>
                  <input
                    type="text"
                    value={inNisn}
                    onChange={(e) => setInNisn(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    NIS Baru (Kosong = Otomatis)
                  </label>
                  <input
                    type="text"
                    value={inNis}
                    onChange={(e) => setInNis(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Kelas Penempatan</label>
                  <select
                    value={inKelas}
                    onChange={(e) => setInKelas(e.target.value)}
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
                  <label className="block font-medium text-slate-700 mb-1">Jenis Kelamin</label>
                  <select
                    value={inJk}
                    onChange={(e) => setInJk(e.target.value as 'L' | 'P')}
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
                    value={inTempatLahir}
                    onChange={(e) => setInTempatLahir(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Tanggal Lahir</label>
                  <input
                    type="date"
                    value={inTanggalLahir}
                    onChange={(e) => setInTanggalLahir(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-2.5"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Jurusan (SMA)</label>
                  <select
                    value={inJurusan}
                    onChange={(e) => setInJurusan(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5"
                  >
                    <option value="Umum">Umum</option>
                    <option value="IPA">IPA</option>
                    <option value="IPS">IPS</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Tanggal Mutasi Masuk
                  </label>
                  <input
                    type="date"
                    value={inTanggal}
                    onChange={(e) => setInTanggal(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-2.5"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">
                    Sekolah / PKBM Asal *
                  </label>
                  <input
                    type="text"
                    required
                    value={inSekolahAsal}
                    onChange={(e) => setInSekolahAsal(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nomor Surat Pindah</label>
                  <input
                    type="text"
                    value={inNomorSurat}
                    onChange={(e) => setInNomorSurat(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Alasan / Keterangan Mutasi
                  </label>
                  <input
                    type="text"
                    value={inAlasan}
                    onChange={(e) => setInAlasan(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full h-9 rounded-lg bg-emerald-700 text-white font-semibold hover:bg-emerald-800"
              >
                Proses Mutasi Masuk & Tambahkan ke Kelas
              </button>
            </form>
            )}

            <form
              onSubmit={handleSubmitKeluar}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs"
            >
              <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                <UserMinus className="w-4 h-4 text-amber-700" />
                <h3 className="text-sm font-semibold text-slate-900">Mutasi Keluar</h3>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Pilih Peserta Didik Aktif *
                </label>
                <select
                  value={outStudentId}
                  onChange={(e) => setOutStudentId(e.target.value)}
                  className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5"
                >
                  {activeStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nama} — {s.kelas} (NIS {s.nis})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Sekolah / PKBM Tujuan *
                </label>
                <input
                  type="text"
                  required
                  value={outSekolahTujuan}
                  onChange={(e) => setOutSekolahTujuan(e.target.value)}
                  className="w-full h-9 rounded-lg border border-slate-300 px-3"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nomor Surat Mutasi</label>
                  <input
                    type="text"
                    value={outNomorSurat}
                    onChange={(e) => setOutNomorSurat(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Tanggal Mutasi Keluar
                  </label>
                  <input
                    type="date"
                    value={outTanggal}
                    onChange={(e) => setOutTanggal(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-2.5"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Alasan Mutasi Keluar
                </label>
                <input
                  type="text"
                  value={outAlasan}
                  onChange={(e) => setOutAlasan(e.target.value)}
                  className="w-full h-9 rounded-lg border border-slate-300 px-3"
                />
              </div>
              <button
                type="submit"
                disabled={lockStatus.locked}
                className="w-full h-9 rounded-lg bg-amber-700 text-white font-semibold hover:bg-amber-800 disabled:opacity-50"
              >
                Proses Mutasi Keluar
              </button>
            </form>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Buku Catatan Mutasi Masuk & Keluar
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <input
                  type="text"
                  value={mutSearch}
                  onChange={(e) => setMutSearch(e.target.value)}
                  placeholder="Cari nama / NIS / sekolah..."
                  className="h-8 w-48 rounded-lg border border-slate-300 px-2.5"
                />
                {(['ALL', 'Masuk', 'Keluar'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setMutFilter(f)}
                    className={`px-2.5 py-1 rounded-md border font-medium ${
                      mutFilter === f
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white text-slate-600 border-slate-300'
                    }`}
                  >
                    {f === 'ALL' ? 'Semua' : f}
                  </button>
                ))}
              </div>
            </div>

            {filteredMutations.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 border border-slate-200 rounded-lg bg-slate-50">
                Belum ada riwayat mutasi yang sesuai filter.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-3 py-2.5">Jenis</th>
                      <th className="px-3 py-2.5">Tanggal</th>
                      <th className="px-3 py-2.5">Nama & NIS</th>
                      <th className="px-3 py-2.5">Kelas</th>
                      <th className="px-3 py-2.5">Sekolah Asal / Tujuan</th>
                      <th className="px-3 py-2.5">No. Surat & Alasan</th>
                      <th className="px-3 py-2.5 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredMutations.map((m) => (
                      <tr key={m.id}>
                        <td className="px-3 py-2.5 font-semibold">
                          <span className={m.jenis === 'Masuk' ? 'text-emerald-700' : 'text-amber-700'}>
                            {m.jenis}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono">{m.tanggal}</td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-slate-900">{m.namaSiswa}</div>
                          <div className="font-mono text-slate-500">NIS {m.nis}</div>
                        </td>
                        <td className="px-3 py-2.5">{m.kelas}</td>
                        <td className="px-3 py-2.5">{m.sekolahAsalTujuan}</td>
                        <td className="px-3 py-2.5">
                          <div>{m.nomorSurat}</div>
                          <div className="text-slate-500">{m.alasan}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {isAdmin && m.jenis === 'Keluar' && (
                            <button
                              type="button"
                              onClick={() => onRestoreStudent(m.studentId)}
                              className="inline-flex items-center gap-1 text-emerald-700 hover:underline font-medium"
                            >
                              <RotateCcw className="w-3 h-3" /> Aktifkan Kembali
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Tahun Ajaran Saat Ini</label>
              <div className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 flex items-center font-mono font-semibold text-slate-800">
                {state.settings.tahunAjaran}
              </div>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Tahun Ajaran Baru *</label>
              <input
                type="text"
                value={nextYear}
                onChange={(e) => setNextYear(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Tanggal Rapor Tahun Baru
              </label>
              <input
                type="date"
                value={nextReportDate}
                onChange={(e) => setNextReportDate(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-300 px-2.5"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={archiveCurrent}
              onChange={(e) => setArchiveCurrent(e.target.checked)}
              className="accent-emerald-700"
            />
            <span>
              Arsipkan seluruh nilai, Projek Profil Lulusan, dan catatan tahun ajaran {state.settings.tahunAjaran} sebelum memulai lembar nilai Semester 1 tahun ajaran baru (Direkomendasikan)
            </span>
          </label>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-[380px]">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 sticky top-0">
                  <tr>
                    <th className="px-4 py-2.5">Nama Peserta Didik</th>
                    <th className="px-3 py-2.5">Kelas Asal</th>
                    <th className="px-3 py-2.5">Keputusan Migrasi</th>
                    <th className="px-3 py-2.5">Kelas Tujuan Baru</th>
                    <th className="px-3 py-2.5">Jurusan Baru</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {activeStudents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-500">
                        Belum ada data peserta didik yang tersedia.
                      </td>
                    </tr>
                  ) : (
                    activeStudents.map((stu) => {
                      const dec = decisions[stu.id] || {
                        action: 'naik' as const,
                        targetClass: stu.kelas,
                        targetJurusan: stu.jurusan || 'Umum',
                      };
                      return (
                        <tr key={stu.id}>
                          <td className="px-4 py-2.5 font-medium text-slate-900">{stu.nama}</td>
                          <td className="px-3 py-2.5">{stu.kelas}</td>
                          <td className="px-3 py-2.5">
                            <select
                              value={dec.action}
                              onChange={(e) =>
                                setDecisions((prev) => ({
                                  ...prev,
                                  [stu.id]: {
                                    ...dec,
                                    action: e.target.value as 'naik' | 'tinggal' | 'lulus',
                                  },
                                }))
                              }
                              className="h-8 rounded border border-slate-300 bg-white px-2"
                            >
                              <option value="naik">Naik Kelas</option>
                              <option value="tinggal">Tinggal di Kelas</option>
                              <option value="lulus">Lulus Satuan Pendidikan</option>
                            </select>
                          </td>
                          <td className="px-3 py-2.5">
                            {dec.action === 'lulus' ? (
                              <span className="text-sky-700 font-semibold">Status: Lulus</span>
                            ) : (
                              <select
                                value={dec.targetClass}
                                disabled={dec.action === 'tinggal'}
                                onChange={(e) =>
                                  setDecisions((prev) => ({
                                    ...prev,
                                    [stu.id]: { ...dec, targetClass: e.target.value },
                                  }))
                                }
                                className="h-8 rounded border border-slate-300 bg-white px-2 disabled:bg-slate-100"
                              >
                                {orderedClasses.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <select
                              value={dec.targetJurusan}
                              onChange={(e) =>
                                setDecisions((prev) => ({
                                  ...prev,
                                  [stu.id]: { ...dec, targetJurusan: e.target.value },
                                }))
                              }
                              className="h-8 rounded border border-slate-300 bg-white px-2"
                            >
                              <option value="Umum">Umum</option>
                              <option value="IPA">IPA</option>
                              <option value="IPS">IPS</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() =>
                onMigrateAcademicYear({
                  nextAcademicYear: nextYear.trim() || defaultNextYear,
                  nextReportDate,
                  archiveCurrentYear: archiveCurrent,
                  decisions,
                })
              }
              className="h-10 px-5 rounded-lg bg-emerald-700 text-white font-semibold hover:bg-emerald-800"
            >
              Jalankan Migrasi Tahun Ajaran ke {nextYear}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
