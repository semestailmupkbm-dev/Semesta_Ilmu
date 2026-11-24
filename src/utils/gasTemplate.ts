export const TARGET_DRIVE_FOLDER_ID = '15sLbrUw-mkEOBjEFrhJK-CN9tnbFrIjg';
export const TARGET_DRIVE_FOLDER_URL =
  'https://drive.google.com/drive/folders/15sLbrUw-mkEOBjEFrhJK-CN9tnbFrIjg?usp=sharing';

export const GAS_SPREADSHEET_DB_SCRIPT = `// ============================================================================
// SIM RAPOR MERDEKA — DATABASE PERMANEN BERBASIS GOOGLE SPREADSHEET
// Otomatis membuat & menyimpan file "SIM_RAPOR_MERDEKA_DATABASE" di folder:
// https://drive.google.com/drive/folders/15sLbrUw-mkEOBjEFrhJK-CN9tnbFrIjg
//
// Cara Deploy (Sekali Saja):
// 1. Buka https://script.google.com -> Proyek Baru -> Tempel seluruh kode ini.
// 2. Klik "Terapkan" (Deploy) -> "Deployment baru" (New deployment).
// 3. Jenis: "Aplikasi web" (Web app)
//    - Jalankan sebagai (Execute as): Saya (Me)
//    - Yang memiliki akses (Who has access): Siapa saja (Anyone)
// 4. Salin URL Web App (/exec) lalu tempel di menu Pengaturan -> Identitas, Akun & Sync
//    dan tambahkan ke Secrets AI Studio sebagai GAS_DB_URL agar tetap pulih otomatis.
// ============================================================================

var DRIVE_FOLDER_ID = '15sLbrUw-mkEOBjEFrhJK-CN9tnbFrIjg';
var DB_FILENAME = 'SIM_RAPOR_MERDEKA_DATABASE';
var CHUNK_SIZE = 40000; // Aman di bawah batas 50.000 karakter per sel Google Sheets

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function getOrCreateDatabaseSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var cachedId = props.getProperty('SPREADSHEET_ID');
  if (cachedId) {
    try {
      var existing = SpreadsheetApp.openById(cachedId);
      if (existing) return existing;
    } catch (err) {
      // File terhapus atau dipindah, lanjut cari di folder target
    }
  }

  var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  var files = folder.getFilesByName(DB_FILENAME);
  while (files.hasNext()) {
    var f = files.next();
    if (!f.isTrashed() && f.getMimeType() === MimeType.GOOGLE_SHEETS) {
      props.setProperty('SPREADSHEET_ID', f.getId());
      return SpreadsheetApp.openById(f.getId());
    }
  }

  var ss = SpreadsheetApp.create(DB_FILENAME);
  var file = DriveApp.getFileById(ss.getId());
  file.moveTo(folder);
  props.setProperty('SPREADSHEET_ID', ss.getId());
  return ss;
}

function getOrCreateSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0 && headers && headers.length > 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function writeTable_(ss, sheetName, headers, rows) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  sheet.clearContents();
  var values = [headers].concat(rows || []);
  sheet.getRange(1, 1, values.length, headers.length).setValues(values);
  sheet.setFrozenRows(1);
  return sheet;
}

function readMeta_(ss) {
  var metaSheet = ss.getSheetByName('Meta_DB');
  var meta = {};
  if (!metaSheet || metaSheet.getLastRow() < 2) return meta;
  var rows = metaSheet.getRange(2, 1, metaSheet.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < rows.length; i++) {
    var k = String(rows[i][0] || '').trim();
    if (k) meta[k] = String(rows[i][1] || '');
  }
  return meta;
}

function readStoreFromSpreadsheet_() {
  var ss = getOrCreateDatabaseSpreadsheet_();
  var meta = readMeta_(ss);

  var schools = [];
  var schSheet = ss.getSheetByName('Schools');
  if (schSheet && schSheet.getLastRow() >= 2) {
    var schRows = schSheet.getRange(2, 1, schSheet.getLastRow() - 1, 7).getValues();
    for (var i = 0; i < schRows.length; i++) {
      var r = schRows[i];
      if (!r[0]) continue;
      schools.push({
        id: String(r[0]),
        kodeSekolah: String(r[1] || ''),
        nama: String(r[2] || ''),
        npsn: String(r[3] || ''),
        jenisLembaga: String(r[4] || 'PKBM') === 'Sekolah Formal' ? 'Sekolah Formal' : 'PKBM',
        aktif: String(r[5]) !== 'false' && r[5] !== false,
        createdAt: String(r[6] || ''),
      });
    }
  }

  var users = [];
  var usrSheet = ss.getSheetByName('Users');
  if (usrSheet && usrSheet.getLastRow() >= 2) {
    var usrRows = usrSheet.getRange(2, 1, usrSheet.getLastRow() - 1, 16).getValues();
    for (var j = 0; j < usrRows.length; j++) {
      var u = usrRows[j];
      if (!u[0] || !u[3]) continue;
      var assignments = [];
      var linked = [];
      try { assignments = JSON.parse(String(u[11] || '[]')); } catch (e) {}
      try { linked = JSON.parse(String(u[12] || '[]')); } catch (e) {}
      users.push({
        id: String(u[0]),
        schoolId: String(u[1] || ''),
        schoolName: String(u[2] || ''),
        username: String(u[3]),
        nama: String(u[4] || ''),
        nip: String(u[5] || ''),
        role: String(u[6] || 'guru'),
        aktif: String(u[7]) === 'true' || u[7] === true,
        verified: String(u[8]) === 'true' || u[8] === true,
        verificationNote: String(u[9] || ''),
        waliKelasTarget: u[10] ? String(u[10]) : undefined,
        teachingAssignments: assignments,
        linkedStudentIds: linked,
        passwordHash: String(u[13] || ''),
        passwordSalt: String(u[14] || ''),
        createdAt: String(u[15] || ''),
      });
    }
  }

  var states = {};
  var chunkSheet = ss.getSheetByName('State_Chunks');
  if (chunkSheet && chunkSheet.getLastRow() >= 2) {
    var cRows = chunkSheet.getRange(2, 1, chunkSheet.getLastRow() - 1, 3).getValues();
    var grouped = {};
    for (var k = 0; k < cRows.length; k++) {
      var sid = String(cRows[k][0] || '').trim();
      var idx = Number(cRows[k][1] || 0);
      var chunk = String(cRows[k][2] || '');
      if (!sid) continue;
      if (!grouped[sid]) grouped[sid] = [];
      grouped[sid].push({ idx: idx, chunk: chunk });
    }
    var schoolKeys = Object.keys(grouped);
    for (var sIdx = 0; sIdx < schoolKeys.length; sIdx++) {
      var sId = schoolKeys[sIdx];
      grouped[sId].sort(function (a, b) { return a.idx - b.idx; });
      var joined = grouped[sId].map(function (item) { return item.chunk; }).join('');
      if (joined) {
        try {
          states[sId] = JSON.parse(joined);
        } catch (err) {}
      }
    }
  }

  return {
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    folderId: DRIVE_FOLDER_ID,
    updatedAt: meta.updatedAt || '',
    schoolsCount: schools.length,
    usersCount: users.length,
    store: {
      schools: schools,
      users: users,
      states: states,
      sessionSecret: meta.sessionSecret || '',
      updatedAt: meta.updatedAt || '',
    },
  };
}

function writeStoreToSpreadsheet_(storePayload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = getOrCreateDatabaseSpreadsheet_();
    var nowIso = new Date().toISOString();
    var schools = storePayload.schools || [];
    var users = storePayload.users || [];
    var states = storePayload.states || {};

    var schoolRows = schools.map(function (sc) {
      return [
        sc.id || '',
        sc.kodeSekolah || '',
        sc.nama || '',
        sc.npsn || '',
        sc.jenisLembaga || 'PKBM',
        sc.aktif !== false ? 'true' : 'false',
        sc.createdAt || nowIso,
      ];
    });
    writeTable_(ss, 'Schools', ['id', 'kodeSekolah', 'nama', 'npsn', 'jenisLembaga', 'aktif', 'createdAt'], schoolRows);

    var userRows = users.map(function (u) {
      return [
        u.id || '',
        u.schoolId || '',
        u.schoolName || '',
        u.username || '',
        u.nama || '',
        u.nip || '',
        u.role || 'guru',
        u.aktif ? 'true' : 'false',
        u.verified ? 'true' : 'false',
        u.verificationNote || '',
        u.waliKelasTarget || '',
        JSON.stringify(u.teachingAssignments || []),
        JSON.stringify(u.linkedStudentIds || []),
        u.passwordHash || '',
        u.passwordSalt || '',
        u.createdAt || nowIso,
      ];
    });
    writeTable_(
      ss,
      'Users',
      [
        'id',
        'schoolId',
        'schoolName',
        'username',
        'nama',
        'nip',
        'role',
        'aktif',
        'verified',
        'verificationNote',
        'waliKelasTarget',
        'teachingAssignmentsJson',
        'linkedStudentIdsJson',
        'passwordHash',
        'passwordSalt',
        'createdAt',
      ],
      userRows
    );

    var chunkRows = [];
    var studentSummaryRows = [];
    var schoolNameMap = {};
    schools.forEach(function (sc) {
      schoolNameMap[sc.id] = sc.nama || sc.id;
    });

    Object.keys(states).forEach(function (schoolId) {
      var st = states[schoolId];
      var jsonStr = JSON.stringify(st);
      var totalChunks = Math.max(1, Math.ceil(jsonStr.length / CHUNK_SIZE));
      for (var c = 0; c < totalChunks; c++) {
        chunkRows.push([schoolId, c, jsonStr.slice(c * CHUNK_SIZE, (c + 1) * CHUNK_SIZE)]);
      }

      var stuList = (st && st.students) || [];
      stuList.forEach(function (stu) {
        studentSummaryRows.push([
          schoolNameMap[schoolId] || schoolId,
          stu.kelas || '',
          stu.nis || '',
          stu.nisn || '',
          stu.nama || '',
          stu.jenisKelamin || '',
          stu.status || 'Aktif',
          stu.namaWali || stu.namaAyah || '',
          stu.noTelpWali || '',
          stu.alamat || '',
        ]);
      });
    });
    writeTable_(ss, 'State_Chunks', ['schoolId', 'chunkIndex', 'payloadChunk'], chunkRows);

    var accountSummaryRows = users.map(function (u) {
      return [
        u.schoolName || schoolNameMap[u.schoolId] || u.schoolId,
        u.username || '',
        u.nama || '',
        u.role || '',
        u.aktif ? 'Aktif' : 'Menunggu Verifikasi',
        u.waliKelasTarget || '-',
        u.createdAt || '',
      ];
    });
    writeTable_(
      ss,
      'Ringkasan_Akun',
      ['Sekolah', 'Username', 'Nama', 'Peran', 'Status', 'Wali Kelas', 'Dibuat'],
      accountSummaryRows
    );

    writeTable_(
      ss,
      'Ringkasan_Siswa',
      ['Sekolah', 'Kelas', 'NIS', 'NISN', 'Nama Siswa', 'L/P', 'Status', 'Orang Tua/Wali', 'No Telp', 'Alamat'],
      studentSummaryRows
    );

    writeTable_(ss, 'Meta_DB', ['key', 'value'], [
      ['version', '2.0-multitenant'],
      ['updatedAt', storePayload.updatedAt || nowIso],
      ['sessionSecret', storePayload.sessionSecret || ''],
      ['schoolsCount', String(schools.length)],
      ['usersCount', String(users.length)],
      ['studentsCount', String(studentSummaryRows.length)],
      ['spreadsheetUrl', ss.getUrl()],
      ['folderId', DRIVE_FOLDER_ID],
    ]);

    return {
      ok: true,
      spreadsheetId: ss.getId(),
      spreadsheetUrl: ss.getUrl(),
      folderId: DRIVE_FOLDER_ID,
      updatedAt: storePayload.updatedAt || nowIso,
      schoolsCount: schools.length,
      usersCount: users.length,
      studentsCount: studentSummaryRows.length,
    };
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'ping';
    if (action === 'pull_db') {
      return jsonResponse_(readStoreFromSpreadsheet_());
    }
    var ss = getOrCreateDatabaseSpreadsheet_();
    var meta = readMeta_(ss);
    if (action === 'pull') {
      var pulled = readStoreFromSpreadsheet_();
      var firstId = pulled.store.schools[0] ? pulled.store.schools[0].id : null;
      return jsonResponse_(firstId && pulled.store.states[firstId] ? pulled.store.states[firstId] : {});
    }
    return jsonResponse_({
      ok: true,
      status: 'SIM Rapor Spreadsheet DB Ready',
      spreadsheetId: ss.getId(),
      spreadsheetUrl: ss.getUrl(),
      folderId: DRIVE_FOLDER_ID,
      schoolsCount: Number(meta.schoolsCount || 0),
      usersCount: Number(meta.usersCount || 0),
      updatedAt: meta.updatedAt || '',
    });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var action = body.action || 'ping';
    if (action === 'push_db' && body.store) {
      return jsonResponse_(writeStoreToSpreadsheet_(body.store));
    }
    if (action === 'pull_db') {
      return jsonResponse_(readStoreFromSpreadsheet_());
    }
    if (action === 'push' && body.payload) {
      var ss = getOrCreateDatabaseSpreadsheet_();
      var jsonStr = JSON.stringify(body.payload);
      var rows = [];
      var total = Math.max(1, Math.ceil(jsonStr.length / CHUNK_SIZE));
      for (var i = 0; i < total; i++) {
        rows.push(['legacy', i, jsonStr.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)]);
      }
      writeTable_(ss, 'Snapshot_Manual', ['key', 'chunkIndex', 'payloadChunk'], rows);
      return jsonResponse_({ ok: true, spreadsheetUrl: ss.getUrl() });
    }
    var targetSs = getOrCreateDatabaseSpreadsheet_();
    var meta = readMeta_(targetSs);
    return jsonResponse_({
      ok: true,
      status: 'SIM Rapor Spreadsheet DB Ready',
      spreadsheetId: targetSs.getId(),
      spreadsheetUrl: targetSs.getUrl(),
      folderId: DRIVE_FOLDER_ID,
      schoolsCount: Number(meta.schoolsCount || 0),
      usersCount: Number(meta.usersCount || 0),
      updatedAt: meta.updatedAt || '',
    });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}`;
