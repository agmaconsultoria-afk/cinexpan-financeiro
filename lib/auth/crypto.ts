/**
 * Hash de senha e geração de token de sessão — SOMENTE SERVIDOR.
 *
 * Usa apenas o módulo nativo `crypto` do Node (scrypt), sem dependências
 * externas — o servidor não consegue instalar pacotes novos (firewall).
 */
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

/** Gera o hash de uma senha no formato "scrypt$<salt>$<hash>". */
export function hashSenha(senha: string): string {
  const salt = randomBytes(16);
  const derivado = scryptSync(senha, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derivado.toString("hex")}`;
}

/** Verifica a senha contra o hash armazenado (comparação em tempo constante). */
export function verificarSenha(senha: string, armazenado: string): boolean {
  const partes = armazenado.split("$");
  if (partes.length !== 3 || partes[0] !== "scrypt") return false;
  const salt = Buffer.from(partes[1], "hex");
  const hash = Buffer.from(partes[2], "hex");
  let teste: Buffer;
  try {
    teste = scryptSync(senha, salt, hash.length);
  } catch {
    return false;
  }
  return hash.length === teste.length && timingSafeEqual(hash, teste);
}

/** Token aleatório de 256 bits (hex) para a sessão. */
export function novoToken(): string {
  return randomBytes(32).toString("hex");
}
