import { getServerSecret } from "@/db";
import { AppError } from "./errors";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encryptionKey(): Promise<CryptoKey> {
  const secret = getServerSecret("APP_ENCRYPTION_KEY");
  if (!secret || secret.length < 24) {
    throw new AppError(
      503,
      "AI_ENCRYPTION_NOT_CONFIGURED",
      "服务端尚未配置 APP_ENCRYPTION_KEY，无法安全保存模型密钥",
    );
  }
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(value: string): Promise<{ cipherText: string; iv: string }> {
  const key = await encryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(value));
  return { cipherText: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) };
}

export async function decryptSecret(cipherText: string, iv: string): Promise<string> {
  try {
    const key = await encryptionKey();
    const ivBytes = Uint8Array.from(fromBase64(iv)) as Uint8Array<ArrayBuffer>;
    const cipherBytes = Uint8Array.from(fromBase64(cipherText)) as Uint8Array<ArrayBuffer>;
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes },
      key,
      cipherBytes,
    );
    return decoder.decode(decrypted);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(503, "AI_KEY_DECRYPTION_FAILED", "模型密钥无法解密，请重新保存 AI 设置");
  }
}
