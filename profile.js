import { auth, db } from "firebase-config.js";

import {
  onAuthStateChanged,
  updateProfile,
  signOut
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

const $ = (id) => document.getElementById(id);

let currentUser = null;
let initialized = false;

let carsUnsub = null;
let historyUnsub = null;
let reviewsUnsub = null;

function showError(message, error) {
  console.error("[Blik profile]", message, error);
  toast(`${message}: ${error?.message || "Неизвестная ошибка"}`);
}

function stopSubscriptions() {
  carsUnsub?.();
  historyUnsub?.();
  reviewsUnsub?.();

  carsUnsub = null;
  historyUnsub = null;
  reviewsUnsub = null;
}

// -------------------- Профиль --------------------

async function loadProfileForm(user) {
  const userRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(userRef);

  let data;

  if (snapshot.exists()) {
    data = snapshot.data() || {};
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

  // Поддерживает оба варианта ID поля email.
  const emailInput = $("p-email") || $("register-email");

  if (emailInput) {
    emailInput.value = user.email || data.email || "";
    emailInput.readOnly = true;
  }
}

function initProfileForm() {
  const form = $("profile-form");

  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = "true";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser) {
      toast("Сначала войдите в аккаунт.");
      return;
    }

    const name = $("p-name")?.value.trim() || "";
    const phone = $("p-phone")?.value.trim() || "";

    if (!name) {
      toast("Введите имя.");
      $("p-name")?.focus();
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    const originalText = button?.textContent || "Сохранить";

    if (button) {
      button.disabled = true;
      button.textContent = "Сохраняем…";
    }

    try {
      const userRef = doc(db, "users", currentUser.uid);
      const snapshot = await getDoc(userRef);

      if (snapshot.exists()) {
        // Не изменяем роль пользователя.
        await updateDoc(userRef, { name, phone });
      } else {
        await setDoc(userRef, {
          name,
          phone,
          email: currentUser.email || "",
          role: "user",
          createdAt: serverTimestamp()
        });
      }

      await updateProfile(currentUser, { displayName: name });

      toast("Профиль успешно обновлён.");
    } catch (error) {
      showError("Не удалось сохранить профиль", error);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
    }
  });
}

// -------------------- Машины --------------------

function carRow(id, car) {
  return `
    <div class="item-row">
      <div class="item-row-main">
        <strong>${escapeHtml(car.make || "")} ${escapeHtml(car.model || "")}</strong>
        <span class="item-row-sub">
          ${escapeHtml(car.plate || "Без номера")} ·
          ${escapeHtml(String(car.year || "—"))} ·
          ${escapeHtml(car.color || "")}
        </span>
      </div>

      <button
        class="btn btn-danger btn-sm"
        type="button"
        data-id="${escapeHtml(id)}"
        data-act="del-car">
        Удалить
      </button>
    </div>
  `;
}

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
        ? <div class="empty-state">Машин пока нет — добавьте первую ниже.</div>
        : snapshot.docs
            .map((item) => carRow(item.id, item.data()))
            .join("");

      wrap.querySelectorAll("[data-act='del-car']").forEach((button) => {
        button.addEventListener("click", async () => {
          if (!currentUser) return;

          if (!confirm("Удалить эту машину?")) return;

          button.disabled = true;

          try {
            await deleteDoc(doc(db, "cars", button.dataset.id));
            toast("Машина удалена.");
          } catch (error) {
            showError("Не удалось удалить машину", error);
            button.disabled = false;
          }
        });
      });
    },
    (error) => showError("Не удалось загрузить машины", error)
  );
}

function initCarForm() {
  const form = $("car-form");

  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = "true";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser) {
      toast("Сначала войдите в аккаунт.");
      return;
    }

    const make = $("c-make")?.value.trim() || "";
    const model = $("c-model")?.value.trim() || "";
    const plate = $("c-plate")?.value.trim() || "";

    if (!make || !model || !plate) {
      toast("Укажите марку, модель и госномер.");
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    const originalText = button?.textContent || "Добавить машину";

    if (button) {
      button.disabled = true;
      button.textContent = "Добавляем…";
    }

    try {
      await addDoc(collection(db, "cars"), {
        ownerId: currentUser.uid,
        make,
        model,
        plate,
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
        button.textContent = originalText;
      }
    }
  });
}

// -------------------- История записей --------------------

function historyRow(booking) {
  return `
    <tr>
      <td>${fmtDate(booking.date)} ${escapeHtml(booking.time || "")}</td>
      <td>${escapeHtml(booking.serviceName || "—")}</td>
      <td>${escapeHtml(booking.carLabel || "—")}</td>
      <td>${fmtPrice(Number(booking.price) || 0)}</td>
      <td>
        <span class="status status-${escapeHtml(booking.status || "")}">
          ${escapeHtml(statusLabel(booking.status) || booking.status || "—")}
        </span>
      </td>
    </tr>
  `;
}

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
        ? <tr><td colspan="5" class="muted">История пока пуста.</td></tr>
        : snapshot.docs
            .map((item) => historyRow(item.data()))
            .join("");
    },
    (error) => showError("Не удалось загрузить историю записей", error)
  );
}

// -------------------- Отзывы --------------------

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
          ${escapeHtml(date)} · ${escapeHtml(review.text || "")}
        </span>
      </div>

      <button
        class="btn btn-danger btn-sm"
        type="button"
        data-id="${escapeHtml(id)}"
        data-act="del-review">
        Удалить
      </button>
    </div>
  `;
}

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
        ? <div class="empty-state">Вы ещё не оставляли отзывов.</div>
        : snapshot.docs
            .map((item) => reviewRow(item.id, item.data()))
            .join("");

      wrap.querySelectorAll("[data-act='del-review']").forEach((button) => {
        button.addEventListener("click", async () => {
          if (!currentUser) return;

          if (!confirm("Удалить этот отзыв?")) return;

          button.disabled = true;

          try {
            await deleteDoc(doc(db, "reviews", button.dataset.id));
            toast("Отзыв удалён.");
          } catch (error) {
            showError("Не удалось удалить отзыв", error);
            button.disabled = false;
          }
        });
      });
    },
    (error) => showError("Не удалось загрузить отзывы", error)
  );
}

// -------------------- Вкладки --------------------

function initTabs() {
  document.querySelectorAll(".tab-btn").forEach((button) => {
    if (button.dataset.bound === "true") return;
    button.dataset.bound = "true";

    button.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((item) => {
        item.classList.remove("active");
      });

      document.querySelectorAll(".tab-panel").forEach((panel) => {
        panel.classList.remove("active");
      });

      button.classList.add("active");

      const panel = $(button.dataset.tab);
      if (panel) panel.classList.add("active");
    });
  });
}

// -------------------- Запуск кабинета --------------------

export function initProfilePage() {
  if (initialized || !$("profile-form")) return;
  initialized = true;

  initTabs();
  initProfileForm();
  initCarForm();

  onAuthStateChanged(auth, async (user) => {
    stopSubscriptions();
    currentUser = user;

    if (!user) {
      toast("Войдите в аккаунт, чтобы открыть личный кабинет.");

      // Страница входа должна находиться в index.html.
      window.location.replace("index.html");
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
