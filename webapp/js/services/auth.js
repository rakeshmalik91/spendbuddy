import { 
    getAuth, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut, 
    createUserWithEmailAndPassword, 
    sendEmailVerification, 
    deleteUser, 
    EmailAuthProvider, 
    reauthenticateWithCredential, 
    sendPasswordResetEmail,
    updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { state } from "../core/state.js";
import { FALLBACK_EMAIL } from "../../config.js";

/**
 * Initializes the authentication service and sets up the auth state listener.
 * @param {Object} app The Firebase App instance
 * @param {Function} onStateChanged Callback invoked when auth state changes (receives user object)
 */
export function initAuth(app, onStateChanged) {
    state.auth = getAuth(app);
    onAuthStateChanged(state.auth, (user) => {
        onStateChanged(user);
    });
}

/**
 * Returns the current authenticated user's email, or undefined if not logged in.
 */
export function getUserEmail() {
    return (state.auth && state.auth.currentUser) ? state.auth.currentUser.email : undefined;
}

/**
 * Returns the current authenticated user's email, falling back to the
 * configured default if auth hasn't resolved yet (e.g. during optimistic boot).
 */
export function getRequiredEmail() {
    const cachedEmail = typeof localStorage !== 'undefined' ? localStorage.getItem('expman_user_email') : null;
    return getUserEmail() || cachedEmail || FALLBACK_EMAIL;
}

/**
 * Logs in a user with email and password.
 */
export async function loginUser(email, password) {
    if (!state.auth) throw new Error("Auth not initialized");
    const userCredential = await signInWithEmailAndPassword(state.auth, email, password);
    return userCredential.user;
}

/**
 * Signs up a new user with email and password and sends a verification email.
 */
export async function signupUser(email, password) {
    if (!state.auth) throw new Error("Auth not initialized");
    const userCredential = await createUserWithEmailAndPassword(state.auth, email, password);
    await sendEmailVerification(userCredential.user);
    return userCredential.user;
}

/**
 * Sends a verification email to the given user.
 */
export async function sendUserEmailVerification(user) {
    await sendEmailVerification(user);
}

/**
 * Logs out the current user.
 */
export async function logoutUser() {
    if (!state.auth) return;
    if (window.Android && typeof window.Android.unlinkImapEmail === 'function') {
        try {
            window.Android.unlinkImapEmail();
        } catch (e) {
            console.error("Failed to unlink local IMAP credentials on logout:", e);
        }
    }
    await signOut(state.auth);
}

/**
 * Verifies the current user's password (re-authentication).
 */
export async function verifyPassword(password) {
    if (!state.auth || !state.auth.currentUser) throw new Error("User not logged in");
    const credential = EmailAuthProvider.credential(state.auth.currentUser.email, password);
    await reauthenticateWithCredential(state.auth.currentUser, credential);
}

/**
 * Changes the current user's password.
 */
export async function changeUserPassword(newPassword) {
    if (!state.auth || !state.auth.currentUser) throw new Error("User not logged in");
    await updatePassword(state.auth.currentUser, newPassword);
}

/**
 * Deletes the current user's account.
 */
export async function deleteUserAccount() {
    if (!state.auth || !state.auth.currentUser) throw new Error("User not logged in");
    await deleteUser(state.auth.currentUser);
}

/**
 * Sends a password reset email to the given email address.
 */
export async function sendResetEmail(email) {
    if (!state.auth) throw new Error("Auth not initialized");
    await sendPasswordResetEmail(state.auth, email);
}
