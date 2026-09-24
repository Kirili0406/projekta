// ============================================================
//  booking.js — «Мои записи» (bookings.html)
//  Активные действия: черновики (корзина), подтверждённые, в работе.
// ============================================================
import { db, auth } from "./firebase-config.js";
import {
  collection, query, where, orderBy, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { fmtPrice, fmtDate, statusLabel, escapeHtml, toast } from "./ui.js";
import { onRoleReady } from "./header.js";

let unsub = null;

function rowHtml(id, b) {
  const actions = [];
  if (b.status === "draft") {
    actions.push(`<button class="btn btn-primary btn-sm" data-act="confirm" data-id="${id}">Подтвердить</button>`);
    actions.push(`<button class="btn btn-danger btn-sm" data-act="remove" data-id="${id}">Удалить</button>`);
  } else if (b.status === "confirmed") {
    actions.push(`<button class="btn btn-danger btn-sm" data-act="cancel" data-id="${id}">Отменить</button>`);
  }
  return `
  <div class="item-row">
    <div class="item-row-main">
      <strong>${escapeHtml(b.serviceName)}</strong>
      <span class="item-row-sub">${escapeHtml(b.carLabel)} · ${fmtDate(b.date)} в ${b.time} · ${fmtPrice(b.price)}</span>
      <span class="status status-${b.status}">${statusLabel(b.status)}</span>
    </div>
    <div style="display:flex; gap:8px;">${actions.join("")}</div>
  </div>`;
}

function subscribe() {
  const list = document.getElementById("bookings-list");
  const totalEl = document.getElementById("cart-total");
  const confirmAllBtn = document.getElementById("btn-confirm-all");
  if (!auth.currentUser) {
    list.innerHTML = `<div class="empty-state">Войдите, чтобы увидеть свои записи.</div>`;
    totalEl.textContent = "";
    return;
  }
  if (unsub) unsub();
  const q = query(
    collection(db, "bookings"),
    where("userId", "==", auth.currentUser.uid),
    where("status", "in", ["draft", "confirmed", "in_progress"]),
    orderBy("createdAt", "desc")
  );
  unsub = onSnapshot(q, (snap) => {
    if (snap.empty) {
      list.innerHTML = `<div class="empty-state">Активных записей нет. Загляните в <a href="index.html" style="color:var(--aqua-bright)">каталог услуг</a>.</div>`;
      totalEl.textContent = "";
      confirmAllBtn.classList.add("hidden");
      return;
    }
    list.innerHTML = snap.docs.map(d => rowHtml(d.id, d.data())).join("");
    const drafts = snap.docs.filter(d => d.data().status === "draft");
    const draftTotal = drafts.reduce((sum, d) => sum + (d.data().price || 0), 0);
    totalEl.textContent = drafts.length ? `В корзине: ${drafts.length} · Сумма: ${fmtPrice(draftTotal)}` : "";
    confirmAllBtn.classList.toggle("hidden", drafts.length === 0);
    confirmAllBtn.onclick = () => drafts.forEach(d => confirmBooking(d.id));

    list.querySelectorAll("[data-act]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        if (btn.dataset.act === "confirm") confirmBooking(id);
        if (btn.dataset.act === "remove") removeBooking(id);
        if (btn.dataset.act === "cancel") cancelBooking(id);
      });
    });
  });
}

async function confirmBooking(id) {
  await updateDoc(doc(db, "bookings", id), { status: "confirmed", updatedAt: serverTimestamp() });
  toast("Запись подтверждена");
}
async function removeBooking(id) {
  await deleteDoc(doc(db, "bookings", id));
  toast("Удалено из корзины");
}
async function cancelBooking(id) {
  await updateDoc(doc(db, "bookings", id), { status: "cancelled", updatedAt: serverTimestamp() });
  toast("Запись отменена");
}

export function initBookingsPage() {
  if (!document.getElementById("bookings-list")) return;
  subscribe();
  onRoleReady(() => subscribe());
}
