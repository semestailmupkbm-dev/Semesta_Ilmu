import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Edit3,
  Package,
  Plus,
  Search,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  AppState,
  ProcurementKategori,
  ProcurementRequest,
  ProcurementStatus,
  UserAccount,
} from '../types';
import {
  filterSubjectsForUser,
  formatRupiah,
  formatTanggalID,
  getAccessibleClassesForUser,
} from '../utils/academic';

interface ProcurementViewProps {
  state: AppState;
  currentUser: UserAccount;
  selectedClass: string;
  onCreateProcurement: (payload: {
    kategori: ProcurementKategori;
    namaItem: string;
    spesifikasi: string;
    kelasTerkait: string;
    subjectName: string;
    qty: number;
    satuan: string;
    hargaSatuan: number;
    prioritas: 'Normal' | 'Mendesak' | 'Terjadwal';
    tanggalPengajuan: string;
    tanggalPenggunaan: string;
    lokasiAtauVendor: string;
    keterangan: string;
  }) => Promise<boolean>;
  onUpdateProcurement: (
    id: string,
    payload: Partial<ProcurementRequest>
  ) => Promise<boolean>;
  onDeleteProcurement: (id: string) => Promise<boolean>;
  onNotify: (msg: string, isError?: boolean) => void;
}

const KATEGORI_OPTIONS: ProcurementKategori[] = [
  'Alat Pembelajaran',
  'Bahan Habis Pakai',
  'Kegiatan Siswa / Proyek',
  'Sarana & Prasarana',
  'Lainnya',
];

const SATUAN_PRESETS = ['Unit', 'Pcs', 'Paket', 'Set', 'Rim', 'Kotak', 'Kg', 'Liter', 'Sesi', 'Orang'];

const STATUS_TEXT_COLOR: Record<ProcurementStatus, string> = {
  'Menunggu Persetujuan': 'text-amber-700',
  'Revisi Diminta': 'text-orange-700',
  Disetujui: 'text-emerald-700',
  'Sudah Realisasi': 'text-sky-700',
  Ditolak: 'text-red-700',
};

export const ProcurementView: React.FC<ProcurementViewProps> = ({
  state,
  currentUser,
  selectedClass,
  onCreateProcurement,
  onUpdateProcurement,
  onDeleteProcurement,
  onNotify,
}) => {
  const isAdmin = currentUser.role === 'admin';
  const items = state.procurementRequests || [];

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterKategori, setFilterKategori] = useState('ALL');
  const [showCreateForm, setShowCreateForm] = useState(!isAdmin);

  // Create form fields
  const todayStr = new Date().toISOString().slice(0, 10);
  const [kategori, setKategori] = useState<ProcurementKategori>('Alat Pembelajaran');
  const [namaItem, setNamaItem] = useState('');
  const [spesifikasi, setSpesifikasi] = useState('');
  const [kelasTerkait, setKelasTerkait] = useState(selectedClass || '');
  const [subjectName, setSubjectName] = useState('');
  const [qty, setQty] = useState<number>(1);
  const [satuan, setSatuan] = useState('Paket');
  const [hargaSatuan, setHargaSatuan] = useState<number>(0);
  const [prioritas, setPrioritas] = useState<'Normal' | 'Mendesak' | 'Terjadwal'>('Normal');
  const [tanggalPengajuan, setTanggalPengajuan] = useState(todayStr);
  const [tanggalPenggunaan, setTanggalPenggunaan] = useState(todayStr);
  const [lokasiAtauVendor, setLokasiAtauVendor] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit / Approval modal state (for Pengurus edit+approval OR requester draft edit)
  const [editingItem, setEditingItem] = useState<ProcurementRequest | null>(null);
  const [eKategori, setEKategori] = useState<ProcurementKategori>('Alat Pembelajaran');
  const [eNama, setENama] = useState('');
  const [eSpek, setESpek] = useState('');
  const [eKelas, setEKelas] = useState('');
  const [eMapel, setEMapel] = useState('');
  const [eQty, setEQty] = useState<number>(1);
  const [eSatuan, setESatuan] = useState('Paket');
  const [eHarga, setEHarga] = useState<number>(0);
  const [ePrioritas, setEPrioritas] = useState<'Normal' | 'Mendesak' | 'Terjadwal'>('Normal');
  const [eTanggalPakai, setETanggalPakai] = useState('');
  const [eLokasi, setELokasi] = useState('');
  const [eKet, setEKet] = useState('');
  const [eStatus, setEStatus] = useState<ProcurementStatus>('Menunggu Persetujuan');
  const [eCatatan, setECatatan] = useState('');
  const [eRealisasiBiaya, setERealisasiBiaya] = useState<string>('');
  const [eTanggalRealisasi, setETanggalRealisasi] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const accessibleClasses = isAdmin
    ? state.classes
    : getAccessibleClassesForUser(state.classes, currentUser);
  const userSubjects = filterSubjectsForUser(state.subjects, currentUser, kelasTerkait || undefined);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filterStatus !== 'ALL' && item.status !== filterStatus) return false;
      if (filterKategori !== 'ALL' && item.kategori !== filterKategori) return false;
      if (!q) return true;
      return (
        item.namaItem.toLowerCase().includes(q) ||
        item.nomorPengajuan.toLowerCase().includes(q) ||
        item.requesterName.toLowerCase().includes(q) ||
        (item.keterangan || '').toLowerCase().includes(q) ||
        (item.kelasTerkait || '').toLowerCase().includes(q)
      );
    });
  }, [items, filterStatus, filterKategori, search]);

  const stats = useMemo(() => {
    const menunggu = items.filter((i) => i.status === 'Menunggu Persetujuan');
    const disetujui = items.filter(
      (i) => i.status === 'Disetujui' || i.status === 'Sudah Realisasi'
    );
    const totalNilaiDiajukan = items.reduce((acc, i) => acc + (i.total || 0), 0);
    const totalNilaiDisetujui = disetujui.reduce((acc, i) => acc + (i.total || 0), 0);
    return {
      totalCount: items.length,
      menungguCount: menunggu.length,
      disetujuiCount: disetujui.length,
      totalNilaiDiajukan,
      totalNilaiDisetujui,
    };
  }, [items]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!namaItem.trim()) {
      onNotify('Nama barang atau jenis kegiatan wajib diisi.', true);
      return;
    }
    if (qty <= 0) {
      onNotify('Jumlah (Qty) minimal 1.', true);
      return;
    }
    setSubmitting(true);
    try {
      const ok = await onCreateProcurement({
        kategori,
        namaItem: namaItem.trim(),
        spesifikasi: spesifikasi.trim(),
        kelasTerkait,
        subjectName,
        qty,
        satuan: satuan.trim() || 'Unit',
        hargaSatuan: Math.max(0, hargaSatuan),
        prioritas,
        tanggalPengajuan,
        tanggalPenggunaan,
        lokasiAtauVendor: lokasiAtauVendor.trim(),
        keterangan: keterangan.trim(),
      });
      if (ok) {
        setNamaItem('');
        setSpesifikasi('');
        setQty(1);
        setHargaSatuan(0);
        setLokasiAtauVendor('');
        setKeterangan('');
        onNotify('Pengajuan alat, bahan / kegiatan berhasil dikirim ke Pengurus.');
      } else {
        onNotify('Gagal mengirim pengajuan.', true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openEditModal = (item: ProcurementRequest) => {
    setEditingItem(item);
    setEKategori(item.kategori);
    setENama(item.namaItem);
    setESpek(item.spesifikasi || '');
    setEKelas(item.kelasTerkait || '');
    setEMapel(item.subjectName || '');
    setEQty(item.qty);
    setESatuan(item.satuan);
    setEHarga(item.hargaSatuan);
    setEPrioritas(item.prioritas);
    setETanggalPakai(item.tanggalPenggunaan);
    setELokasi(item.lokasiAtauVendor || '');
    setEKet(item.keterangan || '');
    setEStatus(item.status);
    setECatatan(item.catatanPengurus || '');
    setERealisasiBiaya(
      item.realisasiBiaya !== undefined ? String(item.realisasiBiaya) : String(item.total)
    );
    setETanggalRealisasi(item.tanggalRealisasi || todayStr);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    if (!eNama.trim()) {
      onNotify('Nama item / kegiatan tidak boleh kosong.', true);
      return;
    }
    setSavingEdit(true);
    try {
      const payload: Partial<ProcurementRequest> = {
        kategori: eKategori,
        namaItem: eNama.trim(),
        spesifikasi: eSpek.trim(),
        kelasTerkait: eKelas,
        subjectName: eMapel,
        qty: Math.max(1, eQty),
        satuan: eSatuan.trim() || 'Unit',
        hargaSatuan: Math.max(0, eHarga),
        prioritas: ePrioritas,
        tanggalPenggunaan: eTanggalPakai,
        lokasiAtauVendor: eLokasi.trim(),
        keterangan: eKet.trim(),
      };
      if (isAdmin) {
        payload.status = eStatus;
        payload.catatanPengurus = eCatatan.trim();
        if (eStatus === 'Sudah Realisasi') {
          payload.realisasiBiaya = Math.max(0, Number(eRealisasiBiaya) || Math.round(eQty * eHarga));
          payload.tanggalRealisasi = eTanggalRealisasi || todayStr;
        }
      }
      const ok = await onUpdateProcurement(editingItem.id, payload);
      if (ok) {
        onNotify(
          isAdmin
            ? `Pengajuan ${editingItem.nomorPengajuan} berhasil diperbarui (${eStatus}).`
            : `Perubahan ajuan ${editingItem.nomorPengajuan} berhasil disimpan.`
        );
        setEditingItem(null);
      } else {
        onNotify('Gagal menyimpan perubahan pengajuan.', true);
      }
    } finally {
      setSavingEdit(false);
    }
  };

  const handleQuickApprove = async (item: ProcurementRequest, nextStatus: ProcurementStatus) => {
    const ok = await onUpdateProcurement(item.id, {
      status: nextStatus,
      catatanPengurus:
        item.catatanPengurus ||
        (nextStatus === 'Disetujui'
          ? `Disetujui oleh ${currentUser.nama} pada ${formatTanggalID(todayStr)}.`
          : nextStatus === 'Ditolak'
            ? 'Pengajuan belum dapat disetujui pada periode ini.'
            : item.catatanPengurus),
    });
    if (ok) {
      onNotify(`Status ${item.nomorPengajuan} diperbarui menjadi "${nextStatus}".`);
    } else {
      onNotify('Gagal memperbarui status pengajuan.', true);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'No Pengajuan',
      'Tanggal Ajuan',
      'Tanggal Penggunaan',
      'Pengaju',
      'Peran',
      'Kategori/Jenis',
      'Nama Barang/Kegiatan',
      'Spesifikasi',
      'Kelas',
      'Mapel',
      'Qty',
      'Satuan',
      'Harga Satuan',
      'Total',
      'Prioritas',
      'Status',
      'Catatan Pengurus',
      'Keterangan',
    ];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = filteredItems.map((i) =>
      [
        i.nomorPengajuan,
        i.tanggalPengajuan,
        i.tanggalPenggunaan,
        i.requesterName,
        i.requesterRole,
        i.kategori,
        i.namaItem,
        i.spesifikasi || '',
        i.kelasTerkait || '',
        i.subjectName || '',
        i.qty,
        i.satuan,
        i.hargaSatuan,
        i.total,
        i.prioritas,
        i.status,
        i.catatanPengurus || '',
        i.keterangan || '',
      ]
        .map(escape)
        .join(',')
    );
    const csv = '\uFEFF' + [headers.map(escape).join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Rekap_Pengajuan_Alat_Kegiatan_${state.settings.tahunAjaran.replace('/', '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify('Rekap pengajuan CSV berhasil diunduh.');
  };

  return (
    <div className="space-y-6">
      {/* Header & KPI */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {isAdmin
                ? 'Persetujuan & Pengelolaan Pengajuan Alat, Bahan & Kegiatan'
                : 'Pengajuan Alat, Bahan Pembelajaran & Kegiatan'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isAdmin
                ? 'Tinjau, edit qty/harga/jadwal, berikan catatan, dan setujui atau realisasikan pengajuan dari Guru maupun Wali Kelas.'
                : 'Ajukan kebutuhan alat peraga, bahan habis pakai, atau kegiatan pembelajaran lengkap dengan estimasi biaya dan tanggal penggunaan.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowCreateForm((v) => !v)}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              {showCreateForm ? 'Tutup Form Pengajuan' : 'Buat Pengajuan Baru'}
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredItems.length === 0}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" /> Unduh Rekap CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
            <div className="text-xs text-slate-500">Total Pengajuan Tercatat</div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {stats.totalCount}
            </div>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
            <div className="text-xs text-slate-500">Menunggu Persetujuan</div>
            <div className="text-xl font-bold font-mono tabular-nums text-amber-700 mt-1">
              {stats.menungguCount}
            </div>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
            <div className="text-xs text-slate-500">Total Nilai Diajukan</div>
            <div className="text-base sm:text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
              {formatRupiah(stats.totalNilaiDiajukan)}
            </div>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
            <div className="text-xs text-slate-500">Anggaran Disetujui / Realisasi</div>
            <div className="text-base sm:text-lg font-bold font-mono tabular-nums text-emerald-700 mt-1">
              {formatRupiah(stats.totalNilaiDisetujui)}
            </div>
          </div>
        </div>
      </div>

      {/* Form Pengajuan Baru */}
      {showCreateForm && (
        <form
          onSubmit={handleCreateSubmit}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 text-xs"
        >
          <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-emerald-700" />
              <h3 className="text-sm font-semibold text-slate-900">
                Formulir Pengajuan Alat, Bahan atau Kegiatan
              </h3>
            </div>
            <div className="text-sm font-mono font-bold tabular-nums text-emerald-800">
              Estimasi Total: {formatRupiah(Math.max(1, qty) * Math.max(0, hargaSatuan))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Jenis / Kategori Pengajuan *
              </label>
              <select
                value={kategori}
                onChange={(e) => setKategori(e.target.value as ProcurementKategori)}
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3"
              >
                {KATEGORI_OPTIONS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">
                Nama Barang / Alat / Nama Kegiatan *
              </label>
              <input
                type="text"
                required
                value={namaItem}
                onChange={(e) => setNamaItem(e.target.value)}
                placeholder="Mis. Kertas Gambar A3, Kit Praktikum IPA, atau Kunjungan Edukasi Museum"
                className="w-full h-9 rounded-lg border border-slate-300 px-3"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Prioritas</label>
              <select
                value={prioritas}
                onChange={(e) => setPrioritas(e.target.value as 'Normal' | 'Mendesak' | 'Terjadwal')}
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3"
              >
                <option value="Normal">Normal</option>
                <option value="Terjadwal">Terjadwal</option>
                <option value="Mendesak">Mendesak</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Qty *</label>
              <input
                type="number"
                min={1}
                required
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Satuan *</label>
              <input
                type="text"
                list="procurement-satuan-list"
                required
                value={satuan}
                onChange={(e) => setSatuan(e.target.value)}
                placeholder="Unit / Paket / Pcs / Sesi"
                className="w-full h-9 rounded-lg border border-slate-300 px-3"
              />
              <datalist id="procurement-satuan-list">
                {SATUAN_PRESETS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Harga Satuan (Rp) *</label>
              <input
                type="number"
                min={0}
                required
                value={hargaSatuan}
                onChange={(e) => setHargaSatuan(Math.max(0, Number(e.target.value) || 0))}
                className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Total Biaya (Otomatis)</label>
              <div className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 flex items-center font-mono font-bold tabular-nums text-emerald-800">
                {formatRupiah(Math.max(1, qty) * Math.max(0, hargaSatuan))}
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Tanggal Pengajuan</label>
              <input
                type="date"
                value={tanggalPengajuan}
                onChange={(e) => setTanggalPengajuan(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-300 px-3"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Tanggal Penggunaan *</label>
              <input
                type="date"
                required
                value={tanggalPenggunaan}
                onChange={(e) => setTanggalPenggunaan(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-300 px-3"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Kelas Terkait (Opsional)</label>
              <select
                value={kelasTerkait}
                onChange={(e) => setKelasTerkait(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3"
              >
                <option value="">Umum / Lintas Kelas</option>
                {accessibleClasses.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Mapel Terkait (Opsional)</label>
              <select
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3"
              >
                <option value="">Umum / Kegiatan Sekolah</option>
                {userSubjects.map((s) => (
                  <option key={s.id} value={s.nama}>
                    {s.nama}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">
                Spesifikasi / Rincian Ukuran / Merk
              </label>
              <input
                type="text"
                value={spesifikasi}
                onChange={(e) => setSpesifikasi(e.target.value)}
                placeholder="Mis. Ukuran 100ml kaca borosilikat atau detail pelaksanaan kegiatan"
                className="w-full h-9 rounded-lg border border-slate-300 px-3"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">
                Lokasi Penggunaan / Referensi Vendor
              </label>
              <input
                type="text"
                value={lokasiAtauVendor}
                onChange={(e) => setLokasiAtauVendor(e.target.value)}
                placeholder="Mis. Ruang Lab IPA / Koperasi PKBM"
                className="w-full h-9 rounded-lg border border-slate-300 px-3"
              />
            </div>

            <div className="sm:col-span-4">
              <label className="block font-medium text-slate-700 mb-1">
                Keterangan & Tujuan Penggunaan *
              </label>
              <textarea
                rows={2}
                required
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
                placeholder="Jelaskan urgensi, manfaat bagi pembelajaran siswa, atau rincian pelaksanaan..."
                className="w-full rounded-lg border border-slate-300 p-3"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="h-9 px-5 rounded-lg bg-emerald-700 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {submitting ? 'Mengirim Pengajuan...' : 'Kirim Pengajuan ke Pengurus'}
            </button>
          </div>
        </form>
      )}

      {/* Filter & Daftar Pengajuan */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nomor, nama item, pengaju, atau keterangan..."
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-300 focus:border-emerald-700 focus:outline-none"
            />
          </div>
          <select
            value={filterKategori}
            onChange={(e) => setFilterKategori(e.target.value)}
            className="h-9 rounded-lg border border-slate-300 bg-white px-3"
          >
            <option value="ALL">Semua Jenis / Kategori</option>
            {KATEGORI_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-9 rounded-lg border border-slate-300 bg-white px-3"
          >
            <option value="ALL">Semua Status Persetujuan</option>
            <option value="Menunggu Persetujuan">Menunggu Persetujuan</option>
            <option value="Revisi Diminta">Revisi Diminta</option>
            <option value="Disetujui">Disetujui</option>
            <option value="Sudah Realisasi">Sudah Realisasi</option>
            <option value="Ditolak">Ditolak</option>
          </select>
        </div>

        {filteredItems.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            Belum ada data pengajuan alat, bahan, atau kegiatan yang sesuai filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-4 py-3">No & Tanggal Pakai</th>
                  <th className="px-4 py-3">Jenis & Nama Barang / Kegiatan</th>
                  <th className="px-4 py-3">Pengaju</th>
                  <th className="px-3 py-3 text-right font-mono">Qty</th>
                  <th className="px-3 py-3 text-right font-mono">Harga Satuan</th>
                  <th className="px-3 py-3 text-right font-mono">Total</th>
                  <th className="px-4 py-3">Status & Catatan Pengurus</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredItems.map((item) => {
                  const canRequesterEdit =
                    !isAdmin &&
                    item.requesterUserId === currentUser.id &&
                    (item.status === 'Menunggu Persetujuan' || item.status === 'Revisi Diminta');
                  return (
                    <tr key={item.id} className="align-top hover:bg-slate-50/70">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-mono font-semibold text-slate-900">
                          {item.nomorPengajuan}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Pakai: {formatTanggalID(item.tanggalPenggunaan)}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Ajuan: {formatTanggalID(item.tanggalPengajuan)} · {item.prioritas}
                        </div>
                      </td>
                      <td className="px-4 py-3 min-w-[230px]">
                        <div className="text-[11px] text-emerald-700 font-semibold">
                          {item.kategori}
                          {item.kelasTerkait ? ` · ${item.kelasTerkait}` : ''}
                        </div>
                        <div className="font-semibold text-slate-900">{item.namaItem}</div>
                        {item.spesifikasi && (
                          <div className="text-slate-500 mt-0.5">{item.spesifikasi}</div>
                        )}
                        {item.keterangan && (
                          <div className="text-slate-600 mt-0.5">{item.keterangan}</div>
                        )}
                        {item.lokasiAtauVendor && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Lokasi/Vendor: {item.lokasiAtauVendor}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-medium text-slate-900">{item.requesterName}</div>
                        <div className="text-[11px] text-slate-500">
                          {item.requesterRole === 'walikelas'
                            ? 'Wali Kelas'
                            : item.requesterRole === 'guru'
                              ? 'Guru Mapel'
                              : 'Pengurus'}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                        {item.qty} {item.satuan}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                        {formatRupiah(item.hargaSatuan)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-bold tabular-nums text-slate-900 whitespace-nowrap">
                        {formatRupiah(item.total)}
                        {item.realisasiBiaya !== undefined && item.status === 'Sudah Realisasi' && (
                          <div className="text-[11px] font-normal text-sky-700">
                            Realisasi: {formatRupiah(item.realisasiBiaya)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 min-w-[190px]">
                        <div className={`font-semibold ${STATUS_TEXT_COLOR[item.status]}`}>
                          {item.status}
                        </div>
                        {item.catatanPengurus && (
                          <div className="text-slate-600 mt-0.5 leading-snug">
                            Catatan: {item.catatanPengurus}
                          </div>
                        )}
                        {item.reviewedByName && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Ditinjau: {item.reviewedByName}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {isAdmin && item.status === 'Menunggu Persetujuan' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleQuickApprove(item, 'Disetujui')}
                                title="Setujui langsung"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-emerald-700 bg-emerald-50 text-emerald-900 font-semibold hover:bg-emerald-100"
                              >
                                <CheckCircle2 className="w-3 h-3" /> Setujui
                              </button>
                              <button
                                type="button"
                                onClick={() => handleQuickApprove(item, 'Ditolak')}
                                title="Tolak pengajuan"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-red-200 bg-white text-red-700 font-medium hover:bg-red-50"
                              >
                                <XCircle className="w-3 h-3" />
                              </button>
                            </>
                          )}
                          {(isAdmin || canRequesterEdit) && (
                            <button
                              type="button"
                              onClick={() => openEditModal(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-50"
                            >
                              <Edit3 className="w-3 h-3" />
                              {isAdmin ? 'Edit & Proses' : 'Edit'}
                            </button>
                          )}
                          {(isAdmin || canRequesterEdit) && (
                            <button
                              type="button"
                              onClick={async () => {
                                const ok = await onDeleteProcurement(item.id);
                                if (ok) onNotify(`Pengajuan ${item.nomorPengajuan} dihapus.`);
                              }}
                              title="Hapus pengajuan"
                              className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Edit / Persetujuan & Catatan Pengurus */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEdit}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl text-xs"
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  {isAdmin
                    ? `Edit, Catatan & Persetujuan Pengurus — ${editingItem.nomorPengajuan}`
                    : `Edit Ajuan — ${editingItem.nomorPengajuan}`}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Diajukan oleh {editingItem.requesterName} ({formatTanggalID(editingItem.tanggalPengajuan)})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="p-1 text-slate-400 hover:text-slate-800 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Jenis / Kategori</label>
                  <select
                    value={eKategori}
                    onChange={(e) => setEKategori(e.target.value as ProcurementKategori)}
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3"
                  >
                    {KATEGORI_OPTIONS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Prioritas</label>
                  <select
                    value={ePrioritas}
                    onChange={(e) =>
                      setEPrioritas(e.target.value as 'Normal' | 'Mendesak' | 'Terjadwal')
                    }
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3"
                  >
                    <option value="Normal">Normal</option>
                    <option value="Terjadwal">Terjadwal</option>
                    <option value="Mendesak">Mendesak</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">
                    Nama Barang / Kegiatan *
                  </label>
                  <input
                    type="text"
                    required
                    value={eNama}
                    onChange={(e) => setENama(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2 sm:col-span-2">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Qty</label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={eQty}
                      onChange={(e) => setEQty(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Satuan</label>
                    <input
                      type="text"
                      required
                      value={eSatuan}
                      onChange={(e) => setESatuan(e.target.value)}
                      className="w-full h-9 rounded-lg border border-slate-300 px-3"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Harga Satuan (Rp)</label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={eHarga}
                      onChange={(e) => setEHarga(Math.max(0, Number(e.target.value) || 0))}
                      className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2 p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <span className="font-medium text-slate-700">Total Biaya Setelah Penyesuaian</span>
                  <span className="font-mono text-sm font-bold text-emerald-800 tabular-nums">
                    {formatRupiah(Math.max(1, eQty) * Math.max(0, eHarga))}
                  </span>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Tanggal Penggunaan</label>
                  <input
                    type="date"
                    value={eTanggalPakai}
                    onChange={(e) => setETanggalPakai(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Lokasi / Vendor</label>
                  <input
                    type="text"
                    value={eLokasi}
                    onChange={(e) => setELokasi(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Spesifikasi</label>
                  <input
                    type="text"
                    value={eSpek}
                    onChange={(e) => setESpek(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Keterangan Pengaju</label>
                  <textarea
                    rows={2}
                    value={eKet}
                    onChange={(e) => setEKet(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2.5"
                  />
                </div>
              </div>

              {isAdmin && (
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <div className="font-semibold text-slate-900">
                    Keputusan & Catatan Pengurus Sekolah
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">
                        Status Keputusan
                      </label>
                      <select
                        value={eStatus}
                        onChange={(e) => setEStatus(e.target.value as ProcurementStatus)}
                        className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 font-semibold"
                      >
                        <option value="Menunggu Persetujuan">Menunggu Persetujuan</option>
                        <option value="Revisi Diminta">Revisi Diminta</option>
                        <option value="Disetujui">Disetujui</option>
                        <option value="Sudah Realisasi">Sudah Realisasi</option>
                        <option value="Ditolak">Ditolak</option>
                      </select>
                    </div>
                    {eStatus === 'Sudah Realisasi' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block font-medium text-slate-700 mb-1">
                            Biaya Realisasi (Rp)
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={eRealisasiBiaya}
                            onChange={(e) => setERealisasiBiaya(e.target.value)}
                            className="w-full h-9 rounded-lg border border-slate-300 px-2.5 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block font-medium text-slate-700 mb-1">
                            Tgl Realisasi
                          </label>
                          <input
                            type="date"
                            value={eTanggalRealisasi}
                            onChange={(e) => setETanggalRealisasi(e.target.value)}
                            className="w-full h-9 rounded-lg border border-slate-300 px-2"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Catatan Pengurus (Alasan Persetujuan / Revisi / Penolakan)
                    </label>
                    <textarea
                      rows={2}
                      value={eCatatan}
                      onChange={(e) => setECatatan(e.target.value)}
                      placeholder="Tuliskan arahan penganggaran, penyesuaian qty/harga, atau alasan revisi/penolakan..."
                      className="w-full rounded-lg border border-slate-300 p-2.5"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2 sticky bottom-0">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="h-9 px-4 rounded-lg border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="h-9 px-4 rounded-lg bg-emerald-700 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {savingEdit ? 'Menyimpan...' : isAdmin ? 'Simpan Perubahan & Keputusan' : 'Simpan Perubahan'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
