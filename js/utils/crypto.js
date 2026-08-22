const FIXED_SALT = "ExpenseIQ_V1_Salt";
const ITERATIONS = 100000;

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes;
}

export async function deriveKey(password) {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );
    return await window.crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: enc.encode(FIXED_SALT),
            iterations: ITERATIONS,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

export async function encryptData(key, text) {
    const enc = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        enc.encode(text)
    );
    
    const ivBase64 = arrayBufferToBase64(iv);
    const cipherBase64 = arrayBufferToBase64(ciphertext);
    return `ENC:${ivBase64}:${cipherBase64}`;
}

export async function decryptData(key, encryptedStr) {
    if (!encryptedStr.startsWith("ENC:")) return encryptedStr;
    const parts = encryptedStr.split(":");
    if (parts.length !== 3) throw new Error("Invalid encrypted string format");
    
    const iv = base64ToArrayBuffer(parts[1]);
    const cipherBytes = base64ToArrayBuffer(parts[2]);
    
    const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        cipherBytes
    );
    
    const dec = new TextDecoder();
    return dec.decode(decryptedBuffer);
}
