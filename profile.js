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

const $ = (id) => document.getElementById(id);

// ============================================================
// ОБРАБОТКА ОШИБОК
// ============================================================

function showError(context, error) {
  console.error(`[Blik profile] ${context}:`, error);

  toast(
    `${context}: ${error?.message || "Неизвестная ошибка"}`
  );
}

// ============================================================
// ОСТАНОВКА ПОДПИСОК FIRESTORE
// ============================================================

function stopSubscriptions() {
  carsUnsub?.();
  historyUnsub?.();
  reviewsUnsub?.();

  carsUnsub = null;
  historyUnsub = null;
  reviewsUnsub = null;
}

// ============================================================
// ПРОФИЛЬ
// ============================================================

async function loadProfileForm(user) {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

  let data;

  if (snap.exists()) {
    data = snap.data() || {};
  } else {
    data = {
      name: user.displayName || "",
      email: user.email || "",
      phone: "",
      role: "user",
      createdAt: serverTimestamp()
    };

    await setDoc(userRef, data);
  }

  if ($("p-name")) {
    $("p-name").value = data.name || user.displayName || "";
  }

  if ($("p-phone")) {
    $("p-phone").value = data.phone || "";
  }

  if ($("p-email")) {
    $("p-email").value = user.email || data.email || "";
  }
}

// ============================================================
// СОХРАНЕНИЕ ПРОФИЛЯ
// ============================================================

function initProfileForm() {
  const form = $("profile-form");

  if (!form || form.dataset.bound === "true") {
    return;
  }

  form.dataset.bound = "true";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const user = auth.currentUser;

    if (!user) {
      toast("Сначала войдите в аккаунт.");
      return;
    }

    const name = $("p-name")?.value.trim() || "";
    const phone = $("p-phone")?.value.trim() || "";

    const button = form.querySelector('button[type="submit"]');

    if (!name) {
      toast("Введите имя.");
      $("p-name")?.focus();
      return;
    }

    if (button) {
      button.disabled = true;

      button.dataset.originalText ||= button.textContent;

      button.textContent = "Сохраняем…";
    }

    try {
      const userRef = doc(db, "users", user.uid);
      const snap = await getDoc(userRef);

      if (snap.exists()) {
        await updateDoc(userRef, {
          name,
          phone
        });
      } else {
        await setDoc(userRef, {
          name,
          phone,
          email: user.email || "",
          role: "user",
          createdAt: serverTimestamp()
        });
      }

      await updateProfile(user, {
        displayName: name
      });

      toast("Профиль успешно обновлён.");

    } catch (error) {
      showError("Не удалось сохранить профиль", error);

    } finally {
      if (button) {
        button.disabled = false;

        button.textContent =
          button.dataset.originalText || "Сохранить";
      }
    }
  });
}

// ============================================================
// МАШИНЫ
// ============================================================

function carRow(id, car) {
  return `
    <div class="item-row">

      <div class="item-row-main">

        <strong>
          ${escapeHtml(car.make || "")}
          ${escapeHtml(car.model || "")}
        </strong>

        <span class="item-row-sub">
          ${escapeHtml(car.plate || "Без номера")}
          · ${escapeHtml(String(car.year || "—"))}
          · ${escapeHtml(car.color || "")}
        </span>

      </div>

      <button
        class="btn btn-danger btn-sm"
        type="button"
        data-id="${escapeHtml(id)}"
        data-act="del-car"
      >
        Удалить
      </button>

    </div>
  `;
}

// ============================================================
// ЗАГРУЗКА МАШИН
// ============================================================

function subscribeCars(user) {
  const wrap = $("cars-list");

  if (!wrap) return;

  carsUnsub?.();

  const carsQuery = query(
    collection(db, "cars"),
    where("ownerId", "==", user.uid),
    orderBy("createdAt", "desc")
  );

  carsUnsub = onSnapshot(
    carsQuery,

    (snapshot) => {
      wrap.innerHTML = snapshot.empty
        ? `
          <div class="empty-state">
            Машин пока нет — добавьте первую ниже.
          </div>
        `
        : snapshot.docs
            .map((item) => carRow(item.id, item.data()))
            .join("");

      wrap
        .querySelectorAll("[data-act='del-car']")
        .forEach((button) => {

          button.addEventListener("click", async () => {
            if (!auth.currentUser) {
              toast("Сначала войдите в аккаунт.");
              return;
            }

            button.disabled = true;

            try {
              await deleteDoc(
                doc(db, "cars", button.dataset.id)
              );

              toast("Машина удалена.");

            } catch (error) {
              showError("Не удалось удалить машину", error);

              button.disabled = false;
            }
          });

        });
    },

    (error) => {
      showError("Не удалось загрузить машины", error);
    }
  );
}

// ============================================================
// ДОБАВЛЕНИЕ МАШИНЫ
// ============================================================

function initCarForm() {
  const form = $("car-form");

  if (!form || form.dataset.bound === "true") {
    return;
  }

  form.dataset.bound = "true";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const user = auth.currentUser;

    if (!user) {
      toast("Сначала войдите в аккаунт.");
      return;
    }

    const make = $("c-make")?.value.trim() || "";
    const model = $("c-model")?.value.trim() || "";

    if (!make || !model) {
      toast("Укажите марку и модель автомобиля.");
      return;
    }

    const button = form.querySelector('button[type="submit"]');

    if (button) {
      button.disabled = true;

      button.dataset.originalText ||= button.textContent;

      button.textContent = "Добавляем…";
    }

    try {
      await addDoc(collection(db, "cars"), {
        ownerId: user.uid,

        make,
        model,

        plate: $("c-plate")?.value.trim() || "",
        year: $("c-year")?.value.trim() || "",
        color: $("c-color")?.value.trim() || "",

        createdAt: serverTimestamp()
      });

      form.reset();

      toast("Машина добавлена.");

    } catch (error) {
      showError("Не удалось добавить машину", error);

    } finally {
      if (button) {
        button.disabled = false;

        button.textContent =
          button.dataset.originalText || "Добавить";
      }
    }
  });
}

// ============================================================
// ИСТОРИЯ ЗАПИСЕЙ
// ============================================================

function historyRow(booking) {
  return `
    <tr>

      <td>
        ${fmtDate(booking.date)}
        ${escapeHtml(booking.time || "")}
      </td>

      <td>
        ${escapeHtml(booking.serviceName || "—")}
      </td>

      <td>
        ${escapeHtml(booking.carLabel || "—")}
      </td>

      <td>
        ${fmtPrice(Number(booking.price) || 0)}
      </td>

      <td>
        <span class="status status-${escapeHtml(booking.status || "")}">
          ${escapeHtml(
            statusLabel(booking.status) || booking.status || "—"
          )}
        </span>
      </td>

    </tr>
  `;
}

// ============================================================
// ЗАГРУЗКА ИСТОРИИ
// ============================================================

function subscribeHistory(user) {
  const tbody = $("history-body");

  if (!tbody) return;

  historyUnsub?.();

  const historyQuery = query(
    collection(db, "bookings"),

    where("userId", "==", user.uid),

    where("status", "in", ["done", "cancelled"]),

    orderBy("createdAt", "desc")
  );

  historyUnsub = onSnapshot(
    historyQuery,

    (snapshot) => {
      tbody.innerHTML = snapshot.empty
        ? `
          <tr>
            <td colspan="5" class="muted">
              История пока пуста.
            </td>
          </tr>
        `
        : snapshot.docs
            .map((item) => historyRow(item.data()))
            .join("");
    },

    (error) => {
      showError("Не удалось загрузить историю записей", error);
    }
  );
}

// ============================================================
// ОТЗЫВЫ
// ============================================================

function reviewRow(id, review) {
  const rating = Math.max(
    0,
    Math.min(5, Number(review.rating) || 0)
  );

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
        type="button"
        data-id="${escapeHtml(id)}"
        data-act="del-review"
      >
        Удалить
      </button>

    </div>
  `;
}

// ============================================================
// ЗАГРУЗКА ОТЗЫВОВ
// ============================================================

function subscribeReviews(user) {
  const wrap = $("my-reviews-list");

  if (!wrap) return;

  reviewsUnsub?.();

  const reviewsQuery = query(
    collection(db, "reviews"),

    where("userId", "==", user.uid),

    orderBy("createdAt", "desc")
  );

  reviewsUnsub = onSnapshot(
    reviewsQuery,

    (snapshot) => {
      wrap.innerHTML = snapshot.empty
        ? `
          <div class="empty-state">
            Вы ещё не оставляли отзывов.
          </div>
        `
        : snapshot.docs
            .map((item) => reviewRow(item.id, item.data()))
            .join("");

      wrap
        .querySelectorAll("[data-act='del-review']")
        .forEach((button) => {

          button.addEventListener("click", async () => {
            if (!auth.currentUser) {
              toast("Сначала войдите в аккаунт.");
              return;
            }

            button.disabled = true;

            try {
              await deleteDoc(
                doc(db, "reviews", button.dataset.id)
              );

              toast("Отзыв удалён.");

            } catch (error) {
              showError("Не удалось удалить отзыв", error);

              button.disabled = false;
            }
          });

        });
    },

    (error) => {
      showError("Не удалось загрузить отзывы", error);
    }
  );
}

// ============================================================
// ВКЛАДКИ ЛИЧНОГО КАБИНЕТА
// ============================================================

function initTabs() {
  document.querySelectorAll(".tab-btn").forEach((button) => {

    if (button.dataset.bound === "true") return;

    button.dataset.bound = "true";

    button.addEventListener("click", () => {

      document
        .querySelectorAll(".tab-btn")
        .forEach((item) => {
          item.classList.remove("active");
        });

      document
        .querySelectorAll(".tab-panel")
        .forEach((panel) => {
          panel.classList.remove("active");
        });

      button.classList.add("active");

      const panel = $(button.dataset.tab);

      if (panel) {
        panel.classList.add("active");
      }
    });

  });
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ЛИЧНОГО КАБИНЕТА
// ============================================================

export function initProfilePage() {
  if (!$("profile-form")) return;

  initTabs();
  initProfileForm();
  initCarForm();

  onAuthStateChanged(auth, async (user) => {

    stopSubscriptions();

    if (!user) {
      toast("Войдите в аккаунт, чтобы открыть личный кабинет.");
      return;
    }

    try {
      await loadProfileForm(user);

      subscribeCars(user);
      subscribeHistory(user);
      subscribeReviews(user);

    } catch (error) {
      showError("Не удалось загрузить личный кабинет", error);
    }

  });
}

// ============================================================
// АВТОМАТИЧЕСКИЙ ЗАПУСК
// ============================================================

if (document.readyState === "loading") {

  document.addEventListener(
    "DOMContentLoaded",
    initProfilePage,
    { once: true }
  );

} else {

  initProfilePage();

}
