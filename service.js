// ============================================================
//  service.js — детальная страница услуги (service.html)
// ============================================================
import { db } from "./firebase-config.js";
import {
  doc, getDoc, collection, query, where, orderBy, limit, startAfter, getDocs,
  onSnapshot, addDoc, serverTimestamp, updateDoc, increment
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { fmtPrice, starString, escapeHtml, toast, buildKeywords } from "./ui.js";
import { requireAuth, onRoleReady } from "./header.js";
import { auth } from "./firebase-config.js";

const params = new URLSearchParams(location.search);
const serviceId = params.get("id");

const SLOTS = ["09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00"];
let selectedSlot = null;
let currentService = null;
let slotUnsub = null;
let reviewsCursor = null;

const el = (id) => document.getElementById(id);

async function loadService() {
  if (!serviceId) { el("detail-root").innerHTML = "<p>Услуга не найдена.</p>"; return; }
  const snap = await getDoc(doc(db, "services", serviceId));
  if (!snap.exists()) { el("detail-root").innerHTML = "<p>Услуга не найдена или была удалена.</p>"; return; }
  currentService = { id: snap.id, ...snap.data() };
  renderService(currentService);
  loadRelated(currentService);
  loadReviews(true);
}

function renderService(s) {
  document.title = `${s.name} — АкваЛайн`;
  el("s-badge").textContent = s.category || "Услуга";
  el("s-name").textContent = s.name;
  el("s-desc").textContent = s.description || "";
  el("s-price").textContent = fmtPrice(s.price);
  el("s-duration").textContent = `${s.durationMin || 30} мин`;
  el("s-rating").innerHTML = `${starString(s.rating)} <span class="muted">(${s.reviewsCount || 0} отзывов)</span>`;
  el("s-media-letter").textContent = (s.name || "?").slice(0, 1).toUpperCase();
}

// ---------- сопутствующие услуги (с пагинацией) ----------
async function loadRelated(s) {
  const wrap = el("related-grid");
  const q = query(
    collection(db, "services"),
    where("active", "==", true),
    where("category", "==", s.category || "__none__"),
    orderBy("createdAt", "desc"),
    limit(5)
  );
  const snap = await getDocs(q);
  const docs = snap.docs.filter(d => d.id !== s.id).slice(0, 4);
  if (!docs.length) { wrap.innerHTML = `<p class="muted">Похожих услуг пока нет.</p>`; return; }
  wrap.innerHTML = docs.map(d => {
    const x = d.data();
    return `<a class="card" href="service.html?id=${d.id}">
      <div class="card-media">${escapeHtml((x.name||"?").slice(0,1).toUpperCase())}</div>
      <div class="card-body">
        <span class="card-cat">${escapeHtml(x.category||"")}</span>
        <span class="card-title">${escapeHtml(x.name)}</span>
        <div class="card-foot"><span class="price">${fmtPrice(x.price)}</span><span class="rating">${starString(x.rating)}</span></div>
      </div>
    </a>`;
  }).join("");
}

// ---------- отзывы ----------
function reviewHtml(r) {
  const date = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString("ru-RU") : "";
  return `<div class="review">
    <div class="review-head"><span>${escapeHtml(r.userName)}</span><span>${date}</span></div>
    <div class="stars">${starString(r.rating)}</div>
    <p>${escapeHtml(r.text)}</p>
  </div>`;
}

async function loadReviews(reset) {
  const list = el("reviews-list");
  if (reset) { list.innerHTML = ""; reviewsCursor = null; }
  const constraints = [
    where("serviceId", "==", serviceId),
    orderBy("createdAt", "desc"),
    limit(5)
  ];
  if (reviewsCursor) constraints.push(startAfter(reviewsCursor));
  const snap = await getDocs(query(collection(db, "reviews"), ...constraints));
  if (snap.empty && reset) {
    list.innerHTML = `<p class="muted">Отзывов пока нет — станьте первым.</p>`;
  }
  snap.docs.forEach(d => list.insertAdjacentHTML("beforeend", reviewHtml(d.data())));
  reviewsCursor = snap.docs.at(-1) || reviewsCursor;
  el("btn-more-reviews").classList.toggle("hidden", snap.docs.length < 5);
}

function initReviewForm() {
  el("btn-more-reviews").addEventListener("click", () => loadReviews(false));

  el("review-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!requireAuth("Войдите, чтобы оставить отзыв")) return;
    const rating = Number(el("review-rating").value);
    const text = el("review-text").value.trim();
    if (!text) return;
    await addDoc(collection(db, "reviews"), {
      serviceId,
      userId: auth.currentUser.uid,
      userName: auth.currentUser.displayName || auth.currentUser.email.split("@")[0],
      rating, text,
      createdAt: serverTimestamp()
    });
    // Денормализация: обновляем счётчик и приблизительный рейтинг на самой услуге
    const newCount = (currentService.reviewsCount || 0) + 1;
    const newRating = ((currentService.rating || 0) * (currentService.reviewsCount || 0) + rating) / newCount;
    await updateDoc(doc(db, "services", serviceId), { reviewsCount: increment(1), rating: newRating });
    currentService.reviewsCount = newCount;
    currentService.rating = newRating;
    renderService(currentService);
    el("review-text").value = "";
    toast("Спасибо за отзыв!");
    loadReviews(true);
  });
}

// ---------- бронирование / слоты в реальном времени ----------
async function loadUserCars() {
  const select = el("car-select");
  if (!auth.currentUser) {
    select.innerHTML = `<option value="">Войдите, чтобы выбрать машину</option>`;
    return;
  }
  const snap = await getDocs(query(collection(db, "cars"), where("ownerId", "==", auth.currentUser.uid)));
  if (snap.empty) {
    select.innerHTML = `<option value="">Нет машин — добавьте в профиле</option>`;
    return;
  }
  select.innerHTML = snap.docs.map(d => {
    const c = d.data();
    return `<option value="${d.id}" data-label="${escapeHtml(c.make)} ${escapeHtml(c.model)} · ${escapeHtml(c.plate)}">${escapeHtml(c.make)} ${escapeHtml(c.model)} · ${escapeHtml(c.plate)}</option>`;
  }).join("");
}

function subscribeSlots(dateStr) {
  if (slotUnsub) slotUnsub();
  selectedSlot = null;
  const q = query(
    collection(db, "bookings"),
    where("serviceId", "==", serviceId),
    where("date", "==", dateStr)
  );
  slotUnsub = onSnapshot(q, (snap) => {
    const taken = new Set(
      snap.docs
        .filter(d => d.data().status !== "cancelled")
        .map(d => d.data().time)
    );
    renderSlots(taken);
  });
}

function renderSlots(taken) {
  el("slot-grid").innerHTML = SLOTS.map(t => {
    const disabled = taken.has(t);
    return `<button type="button" class="slot-btn${selectedSlot === t ? " selected" : ""}" data-time="${t}" ${disabled ? "disabled" : ""}>${t}</button>`;
  }).join("");
  el("slot-grid").querySelectorAll(".slot-btn:not(:disabled)").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedSlot = btn.dataset.time;
      el("slot-grid").querySelectorAll(".slot-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });
}

function initBookingBox() {
  const dateInput = el("date-input");
  const today = new Date().toISOString().slice(0, 10);
  dateInput.min = today;
  dateInput.value = today;
  subscribeSlots(today);
  dateInput.addEventListener("change", () => subscribeSlots(dateInput.value));

  onRoleReady(() => loadUserCars());
  loadUserCars();

  el("btn-add-booking").addEventListener("click", async () => {
    if (!requireAuth("Войдите, чтобы записаться")) return;
    const carSelect = el("car-select");
    const carId = carSelect.value;
    if (!carId) return toast("Выберите машину (или добавьте её в профиле)", "error");
    if (!selectedSlot) return toast("Выберите время", "error");
    const carLabel = carSelect.selectedOptions[0].dataset.label;

    await addDoc(collection(db, "bookings"), {
      userId: auth.currentUser.uid,
      serviceId,
      serviceName: currentService.name,
      price: currentService.price,
      carId, carLabel,
      date: dateInput.value,
      time: selectedSlot,
      status: "draft",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    toast("Добавлено в «Мои записи» — подтвердите её там");
  });
}

export function initServicePage() {
  if (!el("detail-root")) return;
  loadService();
  initReviewForm();
  initBookingBox();
}
