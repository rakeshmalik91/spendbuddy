import { getMetadata } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { state } from "../core/state.js";

/**
 * Stores the md5Hash (ETag) of a file to detect concurrent modifications later.
 */
export async function storeFileHash(fileRef) {
    const filePath = fileRef.fullPath;
    try {
        const metadata = await getMetadata(fileRef);
        state.fileHashes[filePath] = metadata.md5Hash;
    } catch (metaErr) {
        state.fileHashes[filePath] = null;
    }
}

/**
 * Verifies that the cloud file has not been modified since we last downloaded it.
 * Throws "CONFLICT_DETECTED" if the hash has changed.
 */
export async function verifyFileHashBeforeUpload(fileRef) {
    const filePath = fileRef.fullPath;
    const knownHash = state.fileHashes[filePath];

    try {
        const currentMetadata = await getMetadata(fileRef);
        // If file exists in cloud (has an md5Hash in metadata):
        // 1. If our client has no knownHash (undefined, null, or empty), we never validated or synced this file in this session.
        //    Overwriting existing cloud data without a known base hash is dangerous and rejected as a conflict.
        // 2. If the cloud hash differs from our known local hash, another device has updated the file.
        if (currentMetadata && currentMetadata.md5Hash) {
            if (!knownHash || currentMetadata.md5Hash !== knownHash) {
                console.warn(`[ETag] Conflict detected for ${filePath}. Known local hash: "${knownHash}", Cloud md5Hash: "${currentMetadata.md5Hash}"`);
                throw new Error("CONFLICT_DETECTED");
            }
        }
    } catch (e) {
        if (e.message === "CONFLICT_DETECTED") throw e;
        // If the file does not exist in the cloud yet (e.g. brand new user or new year file), upload is safe.
        const isNotFound = e.code === 'storage/object-not-found' ||
            (e.message && (e.message.includes('object-not-found') || e.message.includes('does not exist')));
        if (isNotFound) {
            return;
        }
        // Rethrow network or permission errors so unverified uploads cannot proceed
        throw e;
    }
}
