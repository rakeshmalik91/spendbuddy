import { $, $$ } from "../core/init.js";

/* ══════════════ MOBILE MENU ══════════════ */

export function setupMobileMenu() {
    $('#hamburger').addEventListener('click', () => {
        $('#sidebar').classList.toggle('open');
    });
    $('#main-content').addEventListener('click', () => {
        $('#sidebar').classList.remove('open');
    });
}

