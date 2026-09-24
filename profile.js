// ============================================================
// profile.js — Личный кабинет БЛИК
// Firebase SDK 10.13.0
// ============================================================

import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import {
  fmtPrice,
  fmtDate,
  statusLabel,
  escapeHtml,
  toast
} from "./ui.js";

let carsUnsub = null;
let historyUnsub = null;
let reviewsUnsub = null;

let currentUser = null;

// ==================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==================================================

function getElement(id) {
  return document.getElementById(id);
}

function showError(error) {
  console.error("Ошибка личного кабинета:", error);

  if (error.code === "permission-denied") {
    alert("Нет доступа к данным. Проверьте правила Firestore.");
  } else {
    alert("Произошла ошибка. Проверьте интернет и настройки Firebase.");
  }
}

// ==================================================
// ПРОФИЛЬ
// ==================================================

async function loadProfileForm() {
  if (!currentUser) return;

  try {
    const userRef = doc(db, "users", currentUser.uid);
    const snap = await getDoc(userRef);

    const data = snap.exists() ? snap.data() : {};

    if (getElement("p-name")) {
      getElement("p-name").value =
        data.name || currentUser.displayName || "";
    }

    if (getElement("p-phone")) {
      getElement("p-phone").value = data.phone || "";
    }

    if (getElement("p-email")) {
      getElement("p-email").value = currentUser.email || "";
    }
  } catch (error) {
    showError(error);
  }
}

function initProfileForm() {
  const form = getElement("profile-form");

  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser) {
      alert("Сначала войдите в аккаунт.");
      return;
    }

    const name = getElement("p-name")?.value.trim() || "";
    const phone = getElement("p-phone")?.value.trim() || "";

    if (!name) {
      alert("Введите имя.");
      return;
    }

    try {
      const userRef = doc(db, "users", currentUser.uid);

      await setDoc(userRef, {
        name,
        phone,
        email: currentUser.email || "",
        updatedAt: serverTimestamp()
      }, { merge: true });

      await updateProfile(currentUser, {
        displayName: name
      });

      toast("Профиль обновлён");
    } catch (error) {
      showError(error);
    }
  });
}

// ==================================================
// МОИ МАШИНЫ
// ==================================================

function carRow(id, car) {
  return `
    <div class="item-row">
      <div class="item-row-main">
        <strong>
          ${escapeHtml(car.make || "")}
          ${escapeHtml(car.model || "")}
        </strong>

        <span class="item-row-sub">
          ${escapeHtml(car.plate || "")}
          · ${escapeHtml(String(car.year || "—"))}
          · ${escapeHtml(car.color || "")}
        </span>
      </div>

      <button
        class="btn btn-danger btn-sm"
        data-id="${escapeHtml(id)}"
        data-act="del-car"
        type="button"
      >
        Удалить
      </button>
    </div>
  `;
}

function subscribeCars() {
  const wrap = getElement("cars-list");

  if (!wrap || !currentUser) return;

  if (carsUnsub) carsUnsub();

  const q = query(
    collection(db, "cars"),
    where("ownerId", "==", currentUser.uid),
    orderBy("createdAt", "desc")
  );

  carsUnsub = onSnapshot(q, (snap) => {
    wrap.innerHTML = snap.empty
      ? `<div class="empty-state">Машин пока нет — добавьте первую ниже.</div>`
      : snap.docs.map(d => carRow(d.id, d.data())).join("");

    wrap.querySelectorAll("[data-act='del-car']").forEach(button => {
      button.addEventListener("click", async () => {
        if (!confirm("Удалить эту машину?")) return;

        try {
          await deleteDoc(doc(db, "cars", button.dataset.id));
          toast("Машина удалена");
        } catch (error) {
          showError(error);
        }
      });
    });
  }, showError);
}

function initCarForm() {
  const form = getElement("car-form");

  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser) {
      alert("Сначала войдите в аккаунт.");
      return;
    }

    const make = getElement("c-make")?.value.trim() || "";
    const model = getElement("c-model")?.value.trim() || "";
    const plate = getElement("c-plate")?.value.trim() || "";
    const year = getElement("c-year")?.value.trim() || "";
    const color = getElement("c-color")?.value.trim() || "";

    if (!make || !model || !plate) {
      alert("Заполните марку, модель и номер машины.");
      return;
    }

    try {
      await addDoc(collection(db, "cars"), {
        ownerId: currentUser.uid,
        make,
        model,
        plate,
        year,
        color,
        createdAt: serverTimestamp()
      });

      form.reset();
      toast("Машина добавлена");
    } catch (error) {
      showError(error);
    }
  });
}

// ==================================================
// ИСТОРИЯ ЗАПИСЕЙ
// ==================================================

function historyRow(booking) {
  return `
    <tr>
      <td>
        ${fmtDate(booking.date)}
        ${escapeHtml(booking.time || "")}
      </td>

      <td>${escapeHtml(booking.serviceName || "")}</td>

      <td>${escapeHtml(booking.carLabel || "")}</td>

      <td>${fmtPrice(booking.price || 0)}</td>

      <td>
        <span class="status status-${escapeHtml(booking.status || "")}">
          ${escapeHtml(statusLabel(booking.status) || "")}
        </span>
      </td>
    </tr>
  `;
}

function subscribeHistory() {
  const tbody = getElement("history-body");

  if (!tbody || !currentUser) return;

  if (historyUnsub) historyUnsub();

  const q = query(
    collection(db, "bookings"),
    where("userId", "==", currentUser.uid),
    where("status", "in", ["done", "cancelled"]),
    orderBy("createdAt", "desc")
  );

  historyUnsub = onSnapshot(q, (snap) => {
    tbody.innerHTML = snap.empty
      ? `<tr><td colspan="5" class="muted">История пока пуста.</td></tr>`
      : snap.docs.map(d => historyRow(d.data())).join("");
  }, showError);
}

// ==================================================
// МОИ ОТЗЫВЫ
// ==================================================

function reviewRow(id, review) {
  const rating = Math.max(0, Math.min(5, Number(review.rating) || 0));

  const date = review.createdAt?.toDate
    ? review.createdAt.toDate().toLocaleDateString("ru-RU")
    : "";

  return `
    <div class="item-row">
      <div class="item-row-main">

        <span class="stars">
          ${"★".repeat(rating)}${"☆".repeat(5 - rating)}
        </span>

        <span class="item-row-sub">
          ${escapeHtml(date)}
          · ${escapeHtml(review.text || "")}
        </span>

      </div>

      <button
        class="btn btn-danger btn-sm"
        data-id="${escapeHtml(id)}"
        data-act="del-review"
        type="button"
      >
        Удалить
      </button>
    </div>
  `;
}

function subscribeReviews() {
  const wrap = getElement("my-reviews-list");

  if (!wrap || !currentUser) return;

  if (reviewsUnsub) reviewsUnsub();

  const q = query(
    collection(db, "reviews"),
    where("userId", "==", currentUser.uid),
    orderBy("createdAt", "desc")
  );

  reviewsUnsub = onSnapshot(q, (snap) => {
    wrap.innerHTML = snap.empty
      ? `<div class="empty-state">Вы ещё не оставляли отзывов.</div>`
      : snap.docs.map(d => reviewRow(d.id, d.data())).join("");

    wrap.querySelectorAll("[data-act='del-review']").forEach(button => {
      button.addEventListener("click", async () => {
        if (!confirm("Удалить этот отзыв?")) return;

        try {
          await deleteDoc(doc(db, "reviews", button.dataset.id));
          toast("Отзыв удалён");
        } catch (error) {
          showError(error);
        }
      });
    });
  }, showError);
}

// ==================================================
// ВКЛАДКИ
// ==================================================

function initTabs() {
  document.querySelectorAll(".tab-btn").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(tab => {
        tab.classList.remove("active");
      });

      document.querySelectorAll(".tab-panel").forEach(panel => {
        panel.classList.remove("active");
      });

      button.classList.add("active");

      const target = getElement(button.dataset.tab);

      if (target) {
        target.classList.add("active");
      }
    });
  });
}

// ==================================================
// ЗАПУСК ЛИЧНОГО КАБИНЕТА
// ==================================================

function startProfilePage() {
  initTabs();
  initProfileForm();
  initCarForm();

  loadProfileForm();
  subscribeCars();
  subscribeHistory();
  subscribeReviews();
}

export function initProfilePage() {
  if (!getElement("profile-form")) return;

  onAuthStateChanged(auth, (user) => {
    currentUser = user;

    if (!user) {
      window.location.href = "index.html";
      return;
    }

    startProfilePage();
  });
}

// Автоматический запуск страницы
initProfilePage();
