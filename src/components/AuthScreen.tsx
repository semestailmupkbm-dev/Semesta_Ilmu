import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  LogIn,
  Plus,
  QrCode,
  ShieldCheck,
  Trash2,
  User,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';
import {
  AuthStatusResponse,
  TeachingAssignment,
  UserAccount,
  UserRole,
} from '../types';
import { formatTanggalID, getSubjectsForClass } from '../utils/academic';

interface AuthScreenProps {
  initialVerifyCode?: string | null;
  initialVerifyCardId?: string | null;
  initialVerifySchoolId?: string | null;
  onAuthenticated: (token: string, user: UserAccount) => void;
}

interface VerifyResult {
  valid: boolean;
  code: string;
  docType?: string;
  averageScore?: number;
  student?: { nama: string; nis: string; nisn?: string; kelas: string };
  school?: { namaSekolah: string; npsn: string; tahunAjaran: string; semester: string };
}

interface CardVerifyResult {
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
  latestMutation?: {
    jenis: string;
    tanggal: string;
    sekolahAsalTujuan: string;
    alasan: string;
  } | null;
}

const ROLE_CARDS: Array<{ id: UserRole; label: string; hint: string }> = [
  {
    id: 'admin',
    label: 'Pengurus PKBM / Admin',
    hint: 'Kelola lembaga, tahun ajaran, kunci pengisian, siswa, verifikasi guru, bimbingan, pengajuan, dan seluruh rapor.',
  },
  {
    id: 'walikelas',
    label: 'Wali Kelas (Rangkap)',
    hint: 'Kelola kelas perwalian, Profil Lulusan, BK, bimbingan belajar, pengajuan alat/kegiatan, & cetak rapor.',
  },
  {
    id: 'guru',
    label: 'Guru Mata Pelajaran',
    hint: 'Input nilai, CP/TP mapel yang diampu, bimbingan belajar CP/TP, pengajuan alat/kegiatan, & Buku Penghubung.',
  },
  {
    id: 'ortu',
    label: 'Orang Tua / Wali',
    hint: 'Pantau rapor, ajukan bimbingan belajar CP/TP, portofolio, Profil Lulusan, BK, & Buku Penghubung.',
  },
  {
    id: 'siswa',
    label: 'Siswa / Peserta Didik',
    hint: 'Kerjakan Asesmen Diagnostik Akademik & Non-Akademik yang dirilis Pengurus serta akses Ruang LMS.',
  },
];

export const AuthScreen: React.FC<AuthScreenProps> = ({
  initialVerifyCode,
  initialVerifyCardId,
  initialVerifySchoolId,
  onAuthenticated,
}) => {
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('');
  const [status, setStatus] = useState<AuthStatusResponse>({
    bootstrapRequired: false,
    hasAdmin: false,
    envPasscodeConfigured: false,
    accountCount: 0,
    activeSchoolId: 'sch-utama',
    schools: [],
    classes: [],
    classDefs: [],
    subjects: [],
  });

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Signup & New School Onboarding state
  const [createNewSchool, setCreateNewSchool] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSchoolKode, setNewSchoolKode] = useState('');
  const [newSchoolNpsn, setNewSchoolNpsn] = useState('');
  const [newSchoolJenis, setNewSchoolJenis] = useState<'PKBM' | 'Sekolah Formal'>('PKBM');

  const [regRole, setRegRole] = useState<UserRole>('guru');
  const [regNama, setRegNama] = useState('');
  const [regNip, setRegNip] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [regWaliKelas, setRegWaliKelas] = useState('Kelas 7 SMP');
  const [regAssignments, setRegAssignments] = useState<TeachingAssignment[]>([]);
  const [regChildNis, setRegChildNis] = useState('');
  const [adminAuthPassword, setAdminAuthPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingMsg, setPendingMsg] = useState<string | null>(null);

  // Verification modal (Rapor VLD or Student ID Card QR)
  const [verifyOpen, setVerifyOpen] = useState(
    Boolean(initialVerifyCode || initialVerifyCardId)
  );
  const [verifyTab, setVerifyTab] = useState<'rapor' | 'card'>(
    initialVerifyCardId ? 'card' : 'rapor'
  );
  const [verifyInput, setVerifyInput] = useState(initialVerifyCode || '');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

  const [cardInput, setCardInput] = useState(initialVerifyCardId || '');
  const [verifyingCard, setVerifyingCard] = useState(false);
  const [cardResult, setCardResult] = useState<CardVerifyResult | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingStatus(true);
    const qs = selectedSchoolId ? `?schoolId=${encodeURIComponent(selectedSchoolId)}` : '';
    fetch(`/api/auth/status${qs}`)
      .then((res) => res.json())
      .then((data: AuthStatusResponse) => {
        if (!active) return;
        setStatus(data);
        if (!selectedSchoolId && data.activeSchoolId) {
          setSelectedSchoolId(data.activeSchoolId);
        }
        const clsList = data.classes || [];
        const defaultCls = clsList.includes('Kelas 7 SMP')
          ? 'Kelas 7 SMP'
          : clsList[0] || 'Kelas 7 SMP';
        setRegWaliKelas(defaultCls);
        setRegAssignments([{ kelas: defaultCls, subjectIds: [] }]);
        if (
          !selectedSchoolId &&
          (data.bootstrapRequired || (data.accountCount === 0 && !data.envPasscodeConfigured))
        ) {
          setMode('signup');
          setRegRole('admin');
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingStatus(false);
      });
    return () => {
      active = false;
    };
  }, [selectedSchoolId]);

  const effectiveSchoolId = selectedSchoolId || status.activeSchoolId || 'sch-utama';

  const runVerify = async (code: string) => {
    const clean = code.trim();
    if (!clean) return;
    setVerifying(true);
    try {
      const sParam = initialVerifySchoolId || effectiveSchoolId;
      const res = await fetch(
        `/api/verify?code=${encodeURIComponent(clean)}&schoolId=${encodeURIComponent(sParam)}`
      );
      const data = await res.json();
      setVerifyResult(data);
    } catch {
      setVerifyResult({ valid: false, code: clean });
    } finally {
      setVerifying(false);
    }
  };

  const runVerifyCard = async (idOrNis: string) => {
    const clean = idOrNis.trim();
    if (!clean) return;
    setVerifyingCard(true);
    try {
      const sParam = initialVerifySchoolId || effectiveSchoolId;
      const query = clean.startsWith('stu-')
        ? `id=${encodeURIComponent(clean)}`
        : `nis=${encodeURIComponent(clean)}&id=${encodeURIComponent(clean)}`;
      const res = await fetch(`/api/verify-card?${query}&schoolId=${encodeURIComponent(sParam)}`);
      const data = await res.json();
      setCardResult(data);
    } catch {
      setCardResult({ found: false, aktifCard: false });
    } finally {
      setVerifyingCard(false);
    }
  };

  useEffect(() => {
    if (initialVerifyCode) {
      setVerifyOpen(true);
      setVerifyTab('rapor');
      setVerifyInput(initialVerifyCode);
      runVerify(initialVerifyCode);
    }
  }, [initialVerifyCode]);

  useEffect(() => {
    if (initialVerifyCardId) {
      setVerifyOpen(true);
      setVerifyTab('card');
      setCardInput(initialVerifyCardId);
      runVerifyCard(initialVerifyCardId);
    }
  }, [initialVerifyCardId]);

  const classList = status.classes.length > 0 ? status.classes : ['Kelas 7 SMP'];
  const requiresAdminAuth =
    !createNewSchool && Boolean(status.hasAdmin || status.envPasscodeConfigured);
  const schoolsList = status.schools || [];

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setPendingMsg(null);
    if (!username.trim() || !password) {
      setErrorMsg('Masukkan username dan kata sandi terlebih dahulu.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: effectiveSchoolId,
          username: username.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.token || !data.user) {
        setErrorMsg(data.error || 'Username atau kata sandi tidak sesuai.');
        return;
      }
      onAuthenticated(data.token, data.user);
    } catch {
      setErrorMsg('Gagal menghubungi server autentikasi.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setPendingMsg(null);
    if (createNewSchool && !newSchoolName.trim()) {
      setErrorMsg('Nama sekolah / lembaga baru wajib diisi.');
      return;
    }
    if (!regNama.trim() || !regUsername.trim()) {
      setErrorMsg('Nama lengkap dan username wajib diisi.');
      return;
    }
    if (regPassword.length < 6) {
      setErrorMsg('Kata sandi minimal 6 karakter.');
      return;
    }
    if (regPassword !== regConfirm) {
      setErrorMsg('Konfirmasi kata sandi tidak cocok.');
      return;
    }
    if (!createNewSchool && regRole === 'admin' && requiresAdminAuth && !adminAuthPassword) {
      setErrorMsg('Masukkan kata sandi Pengurus PKBM aktif pada sekolah ini untuk menambah akun admin.');
      return;
    }
    if (
      !createNewSchool &&
      regRole === 'guru' &&
      regAssignments.every((a) => a.subjectIds.length === 0)
    ) {
      setErrorMsg('Pilih minimal 1 mata pelajaran yang diajarkan untuk diverifikasi oleh Admin.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: createNewSchool ? undefined : effectiveSchoolId,
          createNewSchool,
          newSchoolName: createNewSchool ? newSchoolName.trim() : undefined,
          newSchoolKode: createNewSchool ? newSchoolKode.trim() : undefined,
          newSchoolNpsn: createNewSchool ? newSchoolNpsn.trim() : undefined,
          newSchoolJenis: createNewSchool ? newSchoolJenis : undefined,
          nama: regNama.trim(),
          nip: regNip.trim(),
          username: regUsername.trim().toLowerCase(),
          password: regPassword,
          role: createNewSchool ? 'admin' : regRole,
          waliKelasTarget: !createNewSchool && regRole === 'walikelas' ? regWaliKelas : undefined,
          teachingAssignments:
            !createNewSchool && (regRole === 'guru' || regRole === 'walikelas')
              ? regAssignments.filter((a) => a.kelas && a.subjectIds.length > 0)
              : [],
          childNisCodes:
            !createNewSchool && (regRole === 'ortu' || regRole === 'siswa')
              ? regChildNis.trim()
              : undefined,
          adminAuthPassword:
            !createNewSchool && regRole === 'admin' && requiresAdminAuth
              ? adminAuthPassword
              : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal mendaftarkan akun baru.');
        return;
      }
      if (data.pendingVerification) {
        setPendingMsg(
          data.message ||
            'Pendaftaran berhasil. Akun Guru & daftar mapel Anda berstatus Nonaktif menunggu verifikasi Pengurus PKBM (Admin) sebelum bisa login.'
        );
        setMode('signin');
        setUsername(regUsername.trim().toLowerCase());
        setPassword('');
        setRegPassword('');
        setRegConfirm('');
        return;
      }
      if (data.token && data.user) {
        onAuthenticated(data.token, data.user);
      }
    } catch {
      setErrorMsg('Gagal terhubung ke server pendaftaran.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSubjectInAssignment = (idx: number, subjectId: string) => {
    setRegAssignments((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const exists = item.subjectIds.includes(subjectId);
        return {
          ...item,
          subjectIds: exists
            ? item.subjectIds.filter((id) => id !== subjectId)
            : [...item.subjectIds, subjectId],
        };
      })
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between p-4 sm:p-8">
      <div className="max-w-6xl w-full mx-auto my-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Branding & Role Overview */}
        <div className="lg:col-span-5 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="text-lg font-bold tracking-tight text-slate-900">SIM Rapor Merdeka</div>
              <div className="text-xs text-slate-500">
                Multi-Sekolah Terisolasi · Nilai, Bimbingan CP/TP & Pengajuan
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight leading-tight">
              Pendaftaran & Akses Terintegrasi Sesuai Peran
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Setiap sekolah / lembaga memiliki ruang data terisolasi penuh untuk siswa, orang tua, guru, wali kelas, bimbingan CP/TP, dan pengajuan sarana kegiatan agar tidak pernah tercampur.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3 text-xs">
            {ROLE_CARDS.map((card) => (
              <div key={card.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
                <div className="font-semibold text-slate-900">{card.label}</div>
                <p className="text-slate-600 leading-relaxed">{card.hint}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => {
                setVerifyTab('rapor');
                setVerifyOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors"
            >
              <QrCode className="w-4 h-4 text-emerald-700" />
              Verifikasi Keaslian Rapor (VLD-...)
            </button>
            <button
              type="button"
              onClick={() => {
                setVerifyTab('card');
                setVerifyOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors"
            >
              <CreditCard className="w-4 h-4 text-emerald-700" />
              Cek QR Keaktifan Kartu Pelajar
            </button>
          </div>
        </div>

        {/* Right Auth Panel */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setCreateNewSchool(false);
                  setErrorMsg(null);
                }}
                className={`px-4 py-2 rounded-md font-semibold transition-colors ${
                  mode === 'signin'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Masuk (Sign In)
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setErrorMsg(null);
                  setPendingMsg(null);
                }}
                className={`px-4 py-2 rounded-md font-semibold transition-colors ${
                  mode === 'signup'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Daftar Akun / Sekolah Baru
              </button>
            </div>
            {loadingStatus && <span className="text-xs text-slate-400">Memuat sekolah...</span>}
          </div>

          {pendingMsg && (
            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 flex items-start gap-3 text-xs text-amber-900">
              <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold">Menunggu Verifikasi Admin</div>
                <p className="leading-relaxed">{pendingMsg}</p>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 rounded-xl border border-red-200 bg-red-50 flex items-start gap-2.5 text-xs text-red-800">
              <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {mode === 'signin' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Masuk ke SIM Rapor Merdeka</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pilih satuan pendidikan Anda lalu masukkan username dan kata sandi akun aktif.
                </p>
              </div>

              {schoolsList.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Sekolah / Lembaga (Data Terisolasi)
                  </label>
                  <select
                    value={effectiveSchoolId}
                    onChange={(e) => {
                      setSelectedSchoolId(e.target.value);
                      setErrorMsg(null);
                    }}
                    className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 focus:border-emerald-700 focus:outline-none"
                  >
                    {schoolsList.map((sch) => (
                      <option key={sch.id} value={sch.id}>
                        {sch.nama} ({sch.jenisLembaga} · {sch.kodeSekolah})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Masukkan username..."
                  className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm focus:border-emerald-700 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Kata Sandi</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan kata sandi..."
                  className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm focus:border-emerald-700 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-10 rounded-lg bg-emerald-700 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 inline-flex items-center justify-center gap-2 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                {submitting ? 'Memproses...' : 'Masuk Sekarang'}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setErrorMsg(null);
                  }}
                  className="text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
                >
                  Belum punya akun atau ingin mendaftarkan sekolah baru? Klik di sini
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="border-b border-slate-200 pb-3">
                <h2 className="text-lg font-bold text-slate-900">
                  {createNewSchool
                    ? 'Daftarkan Sekolah / Lembaga Baru & Admin Pertama'
                    : status.bootstrapRequired
                      ? 'Buat Akun Pengurus PKBM (Admin) Pertama'
                      : 'Registrasi Akun Baru Sebelum Sign In'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {createNewSchool
                    ? 'Sekolah baru memiliki database terpisah untuk seluruh siswa, guru, orang tua, rapor, bimbingan & pengajuan.'
                    : 'Pilih sekolah tujuan dan peran akun. Akun Guru & Wali Kelas berstatus nonaktif sampai diverifikasi Admin sekolah terkait.'}
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                <label className="flex items-center justify-between gap-3 cursor-pointer text-xs">
                  <span className="inline-flex items-center gap-2 font-semibold text-slate-900">
                    <Building2 className="w-4 h-4 text-emerald-700" />
                    Daftarkan Sekolah / Lembaga Baru (Tenant Terpisah)
                  </span>
                  <input
                    type="checkbox"
                    checked={createNewSchool}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setCreateNewSchool(next);
                      if (next) setRegRole('admin');
                      setErrorMsg(null);
                    }}
                    className="w-4 h-4 accent-emerald-700"
                  />
                </label>

                {createNewSchool ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 text-xs">
                    <div className="sm:col-span-2">
                      <label className="block font-medium text-slate-700 mb-1">
                        Nama Sekolah / PKBM Baru *
                      </label>
                      <input
                        type="text"
                        required
                        value={newSchoolName}
                        onChange={(e) => setNewSchoolName(e.target.value)}
                        placeholder="Contoh: PKBM Tunas Harapan Bandung"
                        className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">
                        Kode Sekolah (Singkat)
                      </label>
                      <input
                        type="text"
                        value={newSchoolKode}
                        onChange={(e) => setNewSchoolKode(e.target.value.toUpperCase())}
                        placeholder="Mis. PKBM-THB"
                        className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">NPSN</label>
                      <input
                        type="text"
                        value={newSchoolNpsn}
                        onChange={(e) => setNewSchoolNpsn(e.target.value)}
                        placeholder="Mis. P9988776"
                        className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block font-medium text-slate-700 mb-1">
                        Jenis Lembaga
                      </label>
                      <select
                        value={newSchoolJenis}
                        onChange={(e) =>
                          setNewSchoolJenis(e.target.value as 'PKBM' | 'Sekolah Formal')
                        }
                        className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3"
                      >
                        <option value="PKBM">PKBM (Paket A/B/C Kesetaraan)</option>
                        <option value="Sekolah Formal">Sekolah Formal (SD / SMP / SMA)</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  schoolsList.length > 0 && (
                    <div className="pt-2 border-t border-slate-200">
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Sekolah / Lembaga Tujuan Pendaftaran
                      </label>
                      <select
                        value={effectiveSchoolId}
                        onChange={(e) => {
                          setSelectedSchoolId(e.target.value);
                          setErrorMsg(null);
                        }}
                        className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-900"
                      >
                        {schoolsList.map((sch) => (
                          <option key={sch.id} value={sch.id}>
                            {sch.nama} ({sch.jenisLembaga} · {sch.kodeSekolah})
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                )}
              </div>

              {!createNewSchool && (
                <div>
                  <span className="block text-xs font-medium text-slate-700 mb-1.5">
                    1. Pilih Peran Akun Baru
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ROLE_CARDS.map((card) => {
                      const active = regRole === card.id;
                      return (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() => {
                            setRegRole(card.id);
                            setErrorMsg(null);
                          }}
                          className={`p-3 rounded-xl border text-left transition-colors ${
                            active
                              ? 'border-emerald-700 bg-emerald-50/70'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="text-xs font-semibold text-slate-900">{card.label}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                            {card.hint}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {createNewSchool ? 'Nama Admin / Kepala Pengurus *' : 'Nama Lengkap & Gelar *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={regNama}
                    onChange={(e) => setRegNama(e.target.value)}
                    placeholder="Mis. Budi Santoso, S.Pd."
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-emerald-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Username (3–32 huruf kecil/angka) *
                  </label>
                  <input
                    type="text"
                    required
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value.toLowerCase())}
                    placeholder="Mis. budisantoso"
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 text-sm font-mono focus:border-emerald-700 focus:outline-none"
                  />
                </div>
                {!createNewSchool && (regRole === 'guru' || regRole === 'walikelas') && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      NIP / NUPTK (Opsional)
                    </label>
                    <input
                      type="text"
                      value={regNip}
                      onChange={(e) => setRegNip(e.target.value)}
                      placeholder="Mis. 198705142010012008"
                      className="w-full h-9 rounded-lg border border-slate-300 px-3 text-sm font-mono focus:border-emerald-700 focus:outline-none"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kata Sandi (Min. 6 karakter) *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-emerald-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Ulangi Kata Sandi *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={regConfirm}
                    onChange={(e) => setRegConfirm(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-emerald-700 focus:outline-none"
                  />
                </div>
              </div>

              {!createNewSchool && regRole === 'admin' && requiresAdminAuth && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Otorisasi Pengurus PKBM Aktif (Kata Sandi Admin Sekolah Ini)
                  </label>
                  <input
                    type="password"
                    required
                    value={adminAuthPassword}
                    onChange={(e) => setAdminAuthPassword(e.target.value)}
                    placeholder="Masukkan kata sandi Pengurus PKBM sekolah ini..."
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-emerald-700 focus:outline-none"
                  />
                </div>
              )}

              {!createNewSchool && regRole === 'walikelas' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kelas Perwalian Utama
                  </label>
                  <select
                    value={regWaliKelas}
                    onChange={(e) => setRegWaliKelas(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-emerald-700 focus:outline-none"
                  >
                    {classList.map((cls) => (
                      <option key={cls} value={cls}>
                        {cls}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {!createNewSchool && (regRole === 'walikelas' || regRole === 'guru') && (
                <div className="space-y-2.5 pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-slate-900">
                        Penugasan Mengajar Lintas Kelas & Daftar Mapel
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Daftar guru dan pilihan mapel akan diverifikasi Admin sekolah ini sebelum akun diaktifkan.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setRegAssignments((prev) => [
                          ...prev,
                          { kelas: classList[0] || 'Kelas 7 SMP', subjectIds: [] },
                        ])
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 shrink-0"
                    >
                      <Plus className="w-3 h-3" /> Tambah Kelas
                    </button>
                  </div>

                  <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                    {regAssignments.map((assign, idx) => {
                      const availSubjs = getSubjectsForClass(
                        status.subjects as any,
                        assign.kelas,
                        status.classDefs
                      );
                      const list = availSubjs.length > 0 ? availSubjs : status.subjects;
                      return (
                        <div
                          key={idx}
                          className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <select
                              value={assign.kelas}
                              onChange={(e) => {
                                const val = e.target.value;
                                setRegAssignments((prev) =>
                                  prev.map((a, i) =>
                                    i === idx ? { kelas: val, subjectIds: [] } : a
                                  )
                                );
                              }}
                              className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-medium text-slate-900"
                            >
                              {classList.map((cls) => (
                                <option key={cls} value={cls}>
                                  {cls}
                                </option>
                              ))}
                            </select>
                            {regAssignments.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setRegAssignments((prev) => prev.filter((_, i) => i !== idx))
                                }
                                className="text-red-600 hover:text-red-700 text-xs inline-flex items-center gap-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Hapus
                              </button>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {list.map((s) => {
                              const picked = assign.subjectIds.includes(s.id);
                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => toggleSubjectInAssignment(idx, s.id)}
                                  className={`px-2 py-1 rounded border text-[11px] font-medium transition-colors ${
                                    picked
                                      ? 'bg-emerald-700 text-white border-emerald-700'
                                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                                  }`}
                                >
                                  {s.kode} — {s.nama}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {!createNewSchool && (regRole === 'ortu' || regRole === 'siswa') && (
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700">
                    {regRole === 'siswa'
                      ? 'Verifikasi NIS / NISN Peserta Didik Aktif *'
                      : 'Verifikasi & Tautkan Data Anak (NIS / NISN)'}
                  </label>
                  <input
                    type="text"
                    required={regRole === 'siswa'}
                    value={regChildNis}
                    onChange={(e) => setRegChildNis(e.target.value)}
                    placeholder={
                      regRole === 'siswa'
                        ? 'Masukkan NIS atau NISN Anda (misal: 2607001)'
                        : 'Contoh: 2607001 (pisahkan koma jika lebih dari 1 anak, opsional)'
                    }
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-mono focus:border-emerald-700 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-500">
                    {regRole === 'siswa'
                      ? 'Wajib cocok dengan data siswa berstatus Aktif pada sekolah tujuan (1 siswa hanya dapat diklaim 1 akun).'
                      : 'Demi keamanan privasi data anak, penautan NIS oleh Orang Tua akan diverifikasi & diaktifkan oleh Pengurus PKBM (Admin) sekolah tujuan.'}
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-10 rounded-lg bg-emerald-700 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 inline-flex items-center justify-center gap-2 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                {submitting
                  ? 'Mendaftarkan...'
                  : createNewSchool
                    ? 'Buat Sekolah Baru & Masuk Sebagai Admin'
                    : regRole === 'guru' || regRole === 'walikelas'
                      ? 'Daftar & Ajukan Verifikasi Admin'
                      : 'Daftar & Masuk Sekarang'}
              </button>
            </form>
          )}
        </div>
      </div>

      <footer className="text-center text-xs text-slate-400 pt-6">
        SIM Rapor Merdeka · Kurikulum Merdeka & Multi-Sekolah Terisolasi
      </footer>

      {verifyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Verifikasi QR Keaslian Rapor & Keaktifan Kartu Pelajar
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setVerifyOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-800 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setVerifyTab('rapor')}
                  className={`flex-1 py-1.5 rounded-md font-semibold ${
                    verifyTab === 'rapor' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Keaslian Lembar Rapor (VLD)
                </button>
                <button
                  type="button"
                  onClick={() => setVerifyTab('card')}
                  className={`flex-1 py-1.5 rounded-md font-semibold ${
                    verifyTab === 'card' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Keaktifan Kartu Pelajar (NIS / QR)
                </button>
              </div>

              {verifyTab === 'rapor' ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Kode Otentikasi Rapor (VLD-...)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={verifyInput}
                        onChange={(e) => setVerifyInput(e.target.value)}
                        placeholder="Contoh: VLD-26S1-2607001-A1B2C3D4"
                        className="flex-1 h-9 rounded-lg border border-slate-300 px-3 font-mono text-xs"
                      />
                      <button
                        type="button"
                        disabled={verifying}
                        onClick={() => runVerify(verifyInput)}
                        className="h-9 px-4 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                      >
                        {verifying ? 'Memeriksa...' : 'Verifikasi'}
                      </button>
                    </div>
                  </div>

                  {verifyResult && (
                    <div
                      className={`p-4 rounded-xl border text-xs space-y-2 ${
                        verifyResult.valid
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                          : 'border-red-200 bg-red-50 text-red-900'
                      }`}
                    >
                      {verifyResult.valid && verifyResult.student ? (
                        <>
                          <div className="flex items-center gap-2 font-bold text-emerald-800">
                            <CheckCircle2 className="w-4 h-4" /> Dokumen Rapor Terverifikasi Asli
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 pt-1">
                            <div>
                              Nama:{' '}
                              <span className="font-semibold">{verifyResult.student.nama}</span>
                            </div>
                            <div>
                              NIS: <span className="font-mono">{verifyResult.student.nis}</span>
                            </div>
                            <div>
                              Kelas:{' '}
                              <span className="font-semibold">{verifyResult.student.kelas}</span>
                            </div>
                            <div>
                              Jenis: <span className="font-semibold">{verifyResult.docType}</span>
                            </div>
                            <div>
                              Rata-rata:{' '}
                              <span className="font-mono font-bold">
                                {verifyResult.averageScore}
                              </span>
                            </div>
                            <div>
                              Lembaga:{' '}
                              <span className="font-semibold">
                                {verifyResult.school?.namaSekolah}
                              </span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center gap-2 font-semibold">
                          <XCircle className="w-4 h-4" /> Kode validasi tidak cocok dengan arsip
                          rapor aktif.
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      NIS atau ID Siswa (dari Scan QR Kartu Pelajar)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={cardInput}
                        onChange={(e) => setCardInput(e.target.value)}
                        placeholder="Masukkan NIS siswa atau ID dari QR..."
                        className="flex-1 h-9 rounded-lg border border-slate-300 px-3 font-mono text-xs"
                      />
                      <button
                        type="button"
                        disabled={verifyingCard}
                        onClick={() => runVerifyCard(cardInput)}
                        className="h-9 px-4 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                      >
                        {verifyingCard ? 'Memeriksa...' : 'Cek Kartu'}
                      </button>
                    </div>
                  </div>

                  {cardResult && (
                    <div className="space-y-3 text-xs">
                      {cardResult.found && cardResult.student ? (
                        <>
                          <div
                            className={`p-3.5 rounded-xl border flex items-center gap-2.5 font-semibold ${
                              cardResult.aktifCard
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                                : 'border-red-200 bg-red-50 text-red-900'
                            }`}
                          >
                            {cardResult.aktifCard ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                            ) : (
                              <XCircle className="w-5 h-5 text-red-600 shrink-0" />
                            )}
                            <div>
                              <div>
                                {cardResult.aktifCard
                                  ? 'KARTU PELAJAR AKTIF & SAH'
                                  : `KARTU NONAKTIF — SISWA ${cardResult.student.status.toUpperCase()}`}
                              </div>
                              <div className="text-[11px] font-normal">
                                Tersinkron langsung dengan database mutasi siswa.
                              </div>
                            </div>
                          </div>

                          <div className="flex items-start gap-3 p-3.5 rounded-lg border border-slate-200 bg-slate-50">
                            <div className="w-12 h-14 rounded border border-slate-200 bg-white overflow-hidden flex items-center justify-center shrink-0">
                              {cardResult.student.fotoDataUrl ? (
                                <img
                                  src={cardResult.student.fotoDataUrl}
                                  alt={cardResult.student.nama}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <User className="w-5 h-5 text-slate-400" />
                              )}
                            </div>
                            <div className="space-y-0.5">
                              <div className="font-bold text-slate-900">
                                {cardResult.student.nama}
                              </div>
                              <div className="font-mono text-slate-600">
                                NIS {cardResult.student.nis} · NISN{' '}
                                {cardResult.student.nisn || '-'}
                              </div>
                              <div className="text-slate-700">
                                {cardResult.student.kelas} ({cardResult.student.fase})
                              </div>
                              <div className="text-slate-500">
                                {cardResult.school?.namaSekolah} · TA{' '}
                                {cardResult.school?.tahunAjaran}
                              </div>
                            </div>
                          </div>

                          {cardResult.latestMutation && !cardResult.aktifCard && (
                            <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-900">
                              <div className="font-semibold">Catatan Mutasi Terakhir:</div>
                              <div>
                                Mutasi {cardResult.latestMutation.jenis} (
                                {formatTanggalID(cardResult.latestMutation.tanggal)}) —{' '}
                                {cardResult.latestMutation.sekolahAsalTujuan} (
                                {cardResult.latestMutation.alasan})
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-900 font-semibold flex items-center gap-2">
                          <XCircle className="w-4 h-4" /> Data kartu pelajar tidak ditemukan.
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
