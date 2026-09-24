// ============================================================
//  profile.js — Личный кабинет (profile.html)
// ============================================================
import { db, auth } from "./firebase-config.js";
import {
  doc, getDoc, updateDoc, collection, query, where, orderBy, onSnapshot,
  addDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { fmtPrice, fmtDate, statusLabel, escapeHtml, toast } from "./ui.js";
import { onRoleReady } from "./header.js";

let carsUnsub = null, historyUnsub = null, reviewsUnsub = null;

// ---------- профиль ----------
async function loadProfileForm() {
  if (!auth.currentUser) return;
  const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
  const data = snap.data() || {};
  document.getElementById("p-name").value = data.name || "";
  document.getElementById("p-phone").value = data.phone || "";
  document.getElementById("p-email").value = auth.currentUser.email;
}

function initProfileForm() {
  document.getElementById("profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    await updateDoc(doc(db, "users", auth.currentUser.uid), {
      name: document.getElementById("p-name").value.trim(),
      phone: document.getElementById("p-phone").value.trim()
    });
    toast("Профиль обновлён");
  });
}

// ---------- машины ----------
function carRow(id, c) {
  return `<div class="item-row">
    <div class="item-row-main">
      <strong>${escapeHtml(c.make)} ${escapeHtml(c.model)}</strong>
      <span class="item-row-sub">${escapeHtml(c.plate)} · ${c.year || "—"} · ${escapeHtml(c.color || "")}</span>
    </div>
    <button class="btn btn-danger btn-sm" data-id="${id}" data-act="del-car">Удалить</button>
  </div>`;
}

function subscribeCars() {
  const wrap = document.getElementById("cars-list");
  if (!auth.currentUser) return;
  if (carsUnsub) carsUnsub();
  const q = query(collection(db, "cars"), where("ownerId", "==", auth.currentUser.uid), orderBy("createdAt", "desc"));
  carsUnsub = onSnapshot(q, (snap) => {
    wrap.innerHTML = snap.empty
      ? `<div class="empty-state">Машин пока нет — добавьте первую ниже.</div>`
      : snap.docs.map(d => carRow(d.id, d.data())).join("");
    wrap.querySelectorAll("[data-act='del-car']").forEach(btn => {
      btn.addEventListener("click", async () => {
        await deleteDoc(doc(db, "cars", btn.dataset.id));
        toast("Машина удалена");
      });
    });
  });
}

function initCarForm() {
  document.getElementById("car-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "cars"), {
      ownerId: auth.currentUser.uid,
      make: document.getElementById("c-make").value.trim(),
      model: document.getElementById("c-model").value.trim(),
      plate: document.getElementById("c-plate").value.trim(),
      year: document.getElementById("c-year").value.trim(),
      color: document.getElementById("c-color").value.trim(),
      createdAt: serverTimestamp()
    });
    e.target.reset();
    toast("Машина добавлена");
  });
}

// ---------- история ----------
function historyRow(b) {
  return `<tr>
    <td>${fmtDate(b.date)} ${b.time}</td>
    <td>${escapeHtml(b.serviceName)}</td>
    <td>${escapeHtml(b.carLabel)}</td>
    <td>${fmtPrice(b.price)}</td>
    <td><span class="status status-${b.status}">${statusLabel(b.status)}</span></td>
  </tr>`;
}

function subscribeHistory() {
  const tbody = document.getElementById("history-body");
  if (!auth.currentUser) return;
  if (historyUnsub) historyUnsub();
  const q = query(
    collection(db, "bookings"),
    where("userId", "==", auth.currentUser.uid),
    where("status", "in", ["done", "cancelled"]),
    orderBy("createdAt", "desc")
  );
  historyUnsub = onSnapshot(q, (snap) => {
    tbody.innerHTML = snap.empty
      ? `<tr><td colspan="5" class="muted">История пока пуста.</td></tr>`
      : snap.docs.map(d => historyRow(d.data())).join("");
  });
}

// ---------- мои отзывы ----------
function reviewRow(id, r) {
  const date = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString("ru-RU") : "";
  return `<div class="item-row">
    <div class="item-row-main">
      <span class="stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span>
      <span class="item-row-sub">${date} · ${escapeHtml(r.text)}</span>
    </div>
    <button class="btn btn-danger btn-sm" data-id="${id}" data-act="del-review">Удалить</button>
  </div>`;
}

function subscribeReviews() {
  const wrap = document.getElementById("my-reviews-list");
  if (!auth.currentUser) return;
  if (reviewsUnsub) reviewsUnsub();
  const q = query(collection(db, "reviews"), where("userId", "==", auth.currentUser.uid), orderBy("createdAt", "desc"));
  reviewsUnsub = onSnapshot(q, (snap) => {
    wrap.innerHTML = snap.empty
      ? `<div class="empty-state">Вы ещё не оставляли отзывов.</div>`
      : snap.docs.map(d => reviewRow(d.id, d.data())).join("");
    wrap.querySelectorAll("[data-act='del-review']").forEach(btn => {
      btn.addEventListener("click", async () => {
        await deleteDoc(doc(db, "reviews", btn.dataset.id));
        toast("Отзыв удалён");
      });
    });
  });
}

// ---------- вкладки ----------
function initTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    });
  });
}

export function initProfilePage() {
  if (!document.getElementById("profile-form")) return;
  initTabs();
  initProfileForm();
  initCarForm();
  const boot = () => { loadProfileForm(); subscribeCars(); subscribeHistory(); subscribeReviews(); };
  boot();
  onRoleReady(() => boot());
}
