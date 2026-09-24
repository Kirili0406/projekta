// ============================================================
//  admin.js — Админ-панель (admin.html), доступна только role === "admin"
// ============================================================
import { db, auth } from "./firebase-config.js";
import {
  collection, query, where, orderBy, onSnapshot, doc, addDoc, updateDoc, deleteDoc,
  getDoc, getDocs, getCountFromServer, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { fmtPrice, fmtDate, statusLabel, escapeHtml, toast, buildKeywords } from "./ui.js";
import { onRoleReady, currentRole } from "./header.js";

let editingServiceId = null;
let svcUnsub = null, bookUnsub = null, usersUnsub = null, reviewsUnsub = null;

function guard() {
  const gate = document.getElementById("admin-gate");
  const app = document.getElementById("admin-app");
  const ok = currentRole === "admin";
  gate.classList.toggle("hidden", ok);
  app.classList.toggle("hidden", !ok);
  return ok;
}

// ---------- УСЛУГИ ----------
function svcRow(id, s) {
  return `<tr>
    <td>${escapeHtml(s.name)}</td>
    <td>${escapeHtml(s.category || "")}</td>
    <td>${fmtPrice(s.price)}</td>
    <td>${s.durationMin || 30} мин</td>
    <td>${s.active ? "да" : "нет"}</td>
    <td style="white-space:nowrap;">
      <button class="btn btn-ghost btn-sm" data-act="edit-svc" data-id="${id}">Изменить</button>
      <button class="btn btn-danger btn-sm" data-act="del-svc" data-id="${id}">Удалить</button>
    </td>
  </tr>`;
}

function subscribeServices() {
  const tbody = document.getElementById("admin-services-body");
  if (svcUnsub) svcUnsub();
  svcUnsub = onSnapshot(query(collection(db, "services"), orderBy("createdAt", "desc")), (snap) => {
    tbody.innerHTML = snap.empty ? `<tr><td colspan="6" class="muted">Пока нет услуг.</td></tr>` : snap.docs.map(d => svcRow(d.id, d.data())).join("");
    tbody.querySelectorAll("[data-act='edit-svc']").forEach(b => b.addEventListener("click", () => editService(b.dataset.id)));
    tbody.querySelectorAll("[data-act='del-svc']").forEach(b => b.addEventListener("click", () => deleteService(b.dataset.id)));
  });
}

async function editService(id) {
  const snap = await getDoc(doc(db, "services", id));
  const s = snap.data();
  editingServiceId = id;
  document.getElementById("svc-name").value = s.name || "";
  document.getElementById("svc-category").value = s.category || "";
  document.getElementById("svc-description").value = s.description || "";
  document.getElementById("svc-price").value = s.price || "";
  document.getElementById("svc-duration").value = s.durationMin || 30;
  document.getElementById("svc-active").checked = s.active !== false;
  document.getElementById("svc-form-title").textContent = "Изменить услугу";
  document.getElementById("svc-cancel-edit").classList.remove("hidden");
  window.scrollTo({ top: document.getElementById("svc-form").offsetTop - 100, behavior: "smooth" });
}

function resetServiceForm() {
  editingServiceId = null;
  document.getElementById("svc-form").reset();
  document.getElementById("svc-active").checked = true;
  document.getElementById("svc-form-title").textContent = "Добавить услугу";
  document.getElementById("svc-cancel-edit").classList.add("hidden");
}

async function deleteService(id) {
  if (!confirm("Удалить эту услугу?")) return;
  await deleteDoc(doc(db, "services", id));
  toast("Услуга удалена");
}

function initServiceForm() {
  document.getElementById("svc-cancel-edit").addEventListener("click", resetServiceForm);
  document.getElementById("svc-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("svc-name").value.trim();
    const category = document.getElementById("svc-category").value.trim();
    const description = document.getElementById("svc-description").value.trim();
    const price = Number(document.getElementById("svc-price").value);
    const durationMin = Number(document.getElementById("svc-duration").value) || 30;
    const active = document.getElementById("svc-active").checked;
    const keywords = buildKeywords(name, description, category);

    if (editingServiceId) {
      await updateDoc(doc(db, "services", editingServiceId), { name, category, description, price, durationMin, active, keywords });
      toast("Услуга обновлена");
    } else {
      await addDoc(collection(db, "services"), {
        name, category, description, price, durationMin, active, keywords,
        rating: 0, reviewsCount: 0, createdAt: serverTimestamp()
      });
      toast("Услуга добавлена");
    }
    resetServiceForm();
  });
}

// ---------- ЗАПИСИ ----------
function bookRow(id, b) {
  const statuses = ["draft", "confirmed", "in_progress", "done", "cancelled"];
  const options = statuses.map(s => `<option value="${s}" ${b.status === s ? "selected" : ""}>${statusLabel(s)}</option>`).join("");
  return `<tr>
    <td>${fmtDate(b.date)} ${b.time}</td>
    <td>${escapeHtml(b.serviceName)}</td>
    <td>${escapeHtml(b.carLabel)}</td>
    <td>${fmtPrice(b.price)}</td>
    <td><select data-id="${id}" data-act="set-status">${options}</select></td>
  </tr>`;
}

function subscribeBookings() {
  const tbody = document.getElementById("admin-bookings-body");
  const filter = document.getElementById("booking-filter").value;
  if (bookUnsub) bookUnsub();
  const constraints = filter ? [where("status", "==", filter)] : [];
  bookUnsub = onSnapshot(query(collection(db, "bookings"), ...constraints, orderBy("createdAt", "desc")), (snap) => {
    tbody.innerHTML = snap.empty ? `<tr><td colspan="5" class="muted">Записей нет.</td></tr>` : snap.docs.map(d => bookRow(d.id, d.data())).join("");
    tbody.querySelectorAll("[data-act='set-status']").forEach(sel => {
      sel.addEventListener("change", async () => {
        await updateDoc(doc(db, "bookings", sel.dataset.id), { status: sel.value, updatedAt: serverTimestamp() });
        toast("Статус записи обновлён");
      });
    });
  });
}

// ---------- ПОЛЬЗОВАТЕЛИ ----------
function userRow(id, u) {
  return `<tr>
    <td>${escapeHtml(u.name || "")}</td>
    <td>${escapeHtml(u.email || "")}</td>
    <td>${escapeHtml(u.phone || "—")}</td>
    <td>
      <select data-id="${id}" data-act="set-role">
        <option value="user" ${u.role === "user" ? "selected" : ""}>user</option>
        <option value="admin" ${u.role === "admin" ? "selected" : ""}>admin</option>
      </select>
    </td>
  </tr>`;
}

function subscribeUsers() {
  const tbody = document.getElementById("admin-users-body");
  if (usersUnsub) usersUnsub();
  usersUnsub = onSnapshot(collection(db, "users"), (snap) => {
    tbody.innerHTML = snap.empty ? `<tr><td colspan="4" class="muted">Нет пользователей.</td></tr>` : snap.docs.map(d => userRow(d.id, d.data())).join("");
    tbody.querySelectorAll("[data-act='set-role']").forEach(sel => {
      sel.addEventListener("change", async () => {
        await updateDoc(doc(db, "users", sel.dataset.id), { role: sel.value });
        toast("Роль пользователя обновлена");
      });
    });
  });
}

// ---------- МОДЕРАЦИЯ ОТЗЫВОВ ----------
function modRow(id, r) {
  return `<tr>
    <td>${escapeHtml(r.userName)}</td>
    <td>${"★".repeat(r.rating)}</td>
    <td>${escapeHtml(r.text)}</td>
    <td><button class="btn btn-danger btn-sm" data-id="${id}" data-act="del-review">Удалить</button></td>
  </tr>`;
}

function subscribeReviewsMod() {
  const tbody = document.getElementById("admin-reviews-body");
  if (reviewsUnsub) reviewsUnsub();
  reviewsUnsub = onSnapshot(query(collection(db, "reviews"), orderBy("createdAt", "desc")), (snap) => {
    tbody.innerHTML = snap.empty ? `<tr><td colspan="4" class="muted">Отзывов нет.</td></tr>` : snap.docs.map(d => modRow(d.id, d.data())).join("");
    tbody.querySelectorAll("[data-act='del-review']").forEach(b => b.addEventListener("click", async () => {
      if (!confirm("Удалить отзыв?")) return;
      await deleteDoc(doc(db, "reviews", b.dataset.id));
      toast("Отзыв удалён");
    }));
  });
}

// ---------- СТАТИСТИКА (getCountFromServer — агрегация без загрузки документов) ----------
async function loadStats() {
  const box = document.getElementById("stats-box");
  const [services, bookings, done, users] = await Promise.all([
    getCountFromServer(collection(db, "services")),
    getCountFromServer(collection(db, "bookings")),
    getCountFromServer(query(collection(db, "bookings"), where("status", "==", "done"))),
    getCountFromServer(collection(db, "users"))
  ]);
  const doneSnap = await getDocs(query(collection(db, "bookings"), where("status", "==", "done")));
  const revenue = doneSnap.docs.reduce((sum, d) => sum + (d.data().price || 0), 0);
  box.innerHTML = `
    <div class="item-row"><span>Услуг в каталоге</span><strong>${services.data().count}</strong></div>
    <div class="item-row"><span>Всего записей</span><strong>${bookings.data().count}</strong></div>
    <div class="item-row"><span>Завершено записей</span><strong>${done.data().count}</strong></div>
    <div class="item-row"><span>Выручка по завершённым</span><strong>${fmtPrice(revenue)}</strong></div>
    <div class="item-row"><span>Зарегистрировано пользователей</span><strong>${users.data().count}</strong></div>
  `;
}

function initTabs() {
  document.querySelectorAll("#admin-app .tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#admin-app .tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll("#admin-app .tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
      if (btn.dataset.tab === "tab-stats") loadStats();
    });
  });
}

export function initAdminPage() {
  if (!document.getElementById("admin-app")) return;
  initTabs();
  initServiceForm();
  document.getElementById("booking-filter").addEventListener("change", subscribeBookings);

  const boot = () => {
    if (!guard()) return;
    subscribeServices();
    subscribeBookings();
    subscribeUsers();
    subscribeReviewsMod();
    loadStats();
  };
  onRoleReady(boot);
  boot();
}
