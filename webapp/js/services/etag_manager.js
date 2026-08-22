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
    if (state.fileHashes[filePath] !== undefined) {
        try {
            const currentMetadata = await getMetadata(fileRef);
            if (currentMetadata.md5Hash !== state.fileHashes[filePath]) {
                throw new Error("CONFLICT_DETECTED");
            }
        } catch (e) {
            if (e.message === "CONFLICT_DETECTED") throw e;
            // Ignore object-not-found
        }
    }
}
