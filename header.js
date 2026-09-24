// ============================================================
//  header.js — общая шапка сайта + модалка авторизации
//  Подключается на каждой странице: <div id="app-header"></div>
// ============================================================
import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc, setDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { toast, openModal, closeModal, markActiveNav } from "./ui.js";

const NAV_ITEMS = [
  { href: "index.html", label: "Каталог услуг" },
  { href: "bookings.html", label: "Мои записи" },
  { href: "profile.html", label: "Личный кабинет" }
];

export let currentUser = null;
export let currentRole = "guest";
const roleListeners = [];
export function onRoleReady(fn) { roleListeners.push(fn); }

function headerTemplate() {
  const links = NAV_ITEMS.map(i => `<a href="${i.href}">${i.label}</a>`).join("");
  return `
  <header class="site-header">
    <nav class="nav">
      <a href="index.html" class="brand"><span class="drop"></span>БЛИК</a>
      <div class="nav-links" id="nav-links">
        ${links}
        <a href="admin.html" id="admin-link" class="hidden">Админ-панель</a>
      </div>
      <div class="nav-auth">
        <span class="user-chip" id="user-chip"></span>
        <a class="btn btn-ghost btn-sm" id="btn-register-page" href="register.html">Регистрация</a>
        <button class="btn btn-ghost btn-sm" id="btn-login">Войти</button>
        <button class="btn btn-primary btn-sm hidden" id="btn-logout">Выйти</button>
      </div>
    </nav>
  </header>

  <div class="modal-backdrop" id="auth-modal">
    <div class="modal">
      <div class="modal-head">
        <h3 id="auth-modal-title">Вход</h3>
        <button class="modal-close" id="auth-modal-close" aria-label="Закрыть">&times;</button>
      </div>

      <form id="login-form">
        <div class="field"><label>Email</label><input type="email" required id="login-email"></div>
        <div class="field"><label>Пароль</label><input type="password" required minlength="6" id="login-password"></div>
        <p class="form-error" id="login-error"></p>
        <button class="btn btn-primary btn-block" type="submit">Войти</button>
        <div class="modal-switch">
          <button type="button" id="link-forgot">Забыли пароль?</button>
        </div>
        <div class="modal-switch">
          Нет аккаунта? <button type="button" id="link-to-register">Зарегистрироваться</button>
        </div>
      </form>

      <form id="register-form" class="hidden">
        <div class="field"><label>Имя</label><input type="text" required id="reg-name"></div>
        <div class="field"><label>Email</label><input type="email" required id="reg-email"></div>
        <div class="field"><label>Телефон</label><input type="tel" placeholder="+7 900 000-00-00" id="reg-phone"></div>
        <div class="field"><label>Пароль (мин. 6 символов)</label><input type="password" required minlength="6" id="reg-password"></div>
        <p class="form-error" id="register-error"></p>
        <button class="btn btn-primary btn-block" type="submit">Создать аккаунт</button>
        <div class="modal-switch">
          Уже есть аккаунт? <button type="button" id="link-to-login">Войти</button>
        </div>
      </form>
    </div>
  </div>`;
}

function switchForm(which) {
  document.getElementById("login-form").classList.toggle("hidden", which !== "login");
  document.getElementById("register-form").classList.toggle("hidden", which !== "register");
  document.getElementById("auth-modal-title").textContent = which === "login" ? "Вход" : "Регистрация";
}

async function ensureUserDoc(user, extra = {}) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      name: extra.name || user.email.split("@")[0],
      email: user.email,
      phone: extra.phone || "",
      role: "user",
      createdAt: serverTimestamp()
    });
  }
  return (await getDoc(ref)).data();
}

function renderAuthedUI(profile) {
  const chip = document.getElementById("user-chip");
  const loginBtn = document.getElementById("btn-login");
  const logoutBtn = document.getElementById("btn-logout");
  const adminLink = document.getElementById("admin-link");
  if (profile) {
    chip.style.display = "inline-flex";
    chip.innerHTML = `${profile.name || currentUser.email} ${profile.role === "admin" ? '<span class="role-pill">admin</span>' : ""}`;
    loginBtn.classList.add("hidden");
    document.getElementById("btn-register-page")?.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
    adminLink.classList.toggle("hidden", profile.role !== "admin");
  } else {
    chip.style.display = "none";
    loginBtn.classList.remove("hidden");
    document.getElementById("btn-register-page")?.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    adminLink.classList.add("hidden");
  }
}

export function requireAuth(redirectMsg = "Войдите, чтобы продолжить") {
  if (!currentUser) {
    toast(redirectMsg, "error");
    openModal("auth-modal");
    return false;
  }
  return true;
}

export function initHeader() {
  const mount = document.getElementById("app-header");
  if (!mount) return;
  mount.innerHTML = headerTemplate();
  markActiveNav();

  document.getElementById("btn-login").onclick = () => openModal("auth-modal");
  document.getElementById("auth-modal-close").onclick = () => closeModal("auth-modal");
  document.getElementById("link-to-register").onclick = () => switchForm("register");
  document.getElementById("link-to-login").onclick = () => switchForm("login");
  document.getElementById("link-forgot").onclick = async () => {
    const email = document.getElementById("login-email").value.trim();
    if (!email) return toast("Введите email в поле выше, затем нажмите снова", "error");
    try {
      await sendPasswordResetEmail(auth, email);
      toast("Письмо для сброса пароля отправлено");
    } catch (e) { toast(e.message, "error"); }
  };

  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    try {
      await signInWithEmailAndPassword(auth, email, password);
      closeModal("auth-modal");
      toast("Добро пожаловать!");
    } catch (err) {
      document.getElementById("login-error").textContent = "Не удалось войти: проверьте email и пароль";
    }
  });

  document.getElementById("register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("reg-name").value.trim();
    const phone = document.getElementById("reg-phone").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const password = document.getElementById("reg-password").value;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await ensureUserDoc(cred.user, { name, phone });
      closeModal("auth-modal");
      toast("Аккаунт создан, добро пожаловать!");
    } catch (err) {
      document.getElementById("register-error").textContent = "Ошибка регистрации: " + (err.code === "auth/email-already-in-use" ? "email уже используется" : "проверьте данные");
    }
  });

  document.getElementById("btn-logout").onclick = async () => {
    await signOut(auth);
    toast("Вы вышли из аккаунта");
  };

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
      const profile = await ensureUserDoc(user);
      currentRole = profile.role;
      renderAuthedUI(profile);
    } else {
      currentRole = "guest";
      renderAuthedUI(null);
    }
    roleListeners.forEach(fn => fn(currentUser, currentRole));
  });
}
