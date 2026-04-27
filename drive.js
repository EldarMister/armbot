const { google } = require('googleapis');

function getDrive() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth });
}

/**
 * Возвращает:
 *   null  — папка с именем контейнера не найдена
 *   []    — папка найдена, но пустая
 *   [{name, url}]  — список файлов с прямыми ссылками на скачивание
 */
async function getContainerFiles(containerNomer) {
  const drive = getDrive();
  const parentId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const name = containerNomer.toUpperCase();

  // 1. Ищем вложенную папку с именем контейнера
  const folderRes = await drive.files.list({
    q: `name = '${name}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 1,
  });

  const folder = folderRes.data.files?.[0];
  if (!folder) return null;

  // 2. Список файлов внутри папки
  const filesRes = await drive.files.list({
    q: `'${folder.id}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType)',
    orderBy: 'name',
    pageSize: 50,
  });

  const files = filesRes.data.files || [];
  return files.map(f => ({
    name: f.name,
    // Прямая ссылка для скачивания (файл должен быть открыт «всем по ссылке»)
    url: `https://drive.google.com/uc?export=download&id=${f.id}`,
    viewUrl: `https://drive.google.com/file/d/${f.id}/view`,
  }));
}

module.exports = { getContainerFiles };
