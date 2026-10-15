import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import type { SupportLimits } from '../../types/api';

/** Arquivo escolhido no aparelho, antes do envio. */
export interface PickedFile {
  name: string;
  mimeType: string;
  sizeBytes: number;
  uri: string;
  /** web: o File do navegador (lido sem expo-file-system) */
  webFile?: Blob;
}

export type PickResult = { kind: 'picked'; file: PickedFile } | { kind: 'cancelled' } | { kind: 'invalid'; message: string };

const EXTENSION_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
};

/** Alguns provedores (Android/Drive) não informam o tipo: deduz pela extensão. */
export function inferMimeType(name: string, declared: string | null | undefined): string {
  const normalized = declared?.trim().toLowerCase();
  if (normalized && normalized !== 'application/octet-stream') return normalized === 'image/jpg' ? 'image/jpeg' : normalized;
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_TYPES[extension] ?? 'application/octet-stream';
}

/** Validação amigável antes do envio (o servidor confere de novo, inclusive o conteúdo). */
export function validatePickedFile(file: Pick<PickedFile, 'mimeType' | 'sizeBytes'>, limits: Pick<SupportLimits, 'allowedMimeTypes' | 'maxAttachmentBytes'>): string | null {
  if (!limits.allowedMimeTypes.includes(file.mimeType)) return 'Esse tipo de arquivo não é aceito. Envie PDF, imagem (JPG, PNG) ou documento (DOC, DOCX, TXT).';
  if (file.sizeBytes > limits.maxAttachmentBytes) return 'O arquivo é maior que 5 MB. Tente uma versão menor ou uma foto com menos resolução.';
  if (file.sizeBytes <= 0) return 'O arquivo está vazio.';
  return null;
}

/** Abre o seletor do sistema (arquivos, fotos, iCloud/Drive). */
export async function pickSupportFile(limits: Pick<SupportLimits, 'allowedMimeTypes' | 'maxAttachmentBytes'>): Promise<PickResult> {
  const result = await DocumentPicker.getDocumentAsync({ type: [...limits.allowedMimeTypes], copyToCacheDirectory: true, multiple: false, base64: false });
  if (result.canceled) return { kind: 'cancelled' };
  const asset = result.assets[0];
  if (!asset) return { kind: 'cancelled' };
  const file: PickedFile = {
    name: asset.name,
    mimeType: inferMimeType(asset.name, asset.mimeType),
    sizeBytes: asset.size ?? asset.file?.size ?? 0,
    uri: asset.uri,
    ...(asset.file ? { webFile: asset.file } : {}),
  };
  const problem = validatePickedFile(file, limits);
  return problem ? { kind: 'invalid', message: problem } : { kind: 'picked', file };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler o arquivo.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/** Conteúdo em base64 para o envio (sem prefixo data:). */
export async function readAsBase64(file: PickedFile): Promise<string> {
  if (Platform.OS === 'web' || file.webFile) {
    if (file.webFile) return blobToBase64(file.webFile);
    const response = await fetch(file.uri);
    return blobToBase64(await response.blob());
  }
  return new File(file.uri).base64();
}
