// ============================================================
//  catalog.js — каталог услуг (index.html)
// ============================================================
import { db } from "./firebase-config.js";
import {
  collection, query, where, orderBy, limit, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { fmtPrice, starString, debounce, escapeHtml } from "./ui.js";

const PAGE_SIZE = 9;

const state = {
  search: "",
  category: "",
  sort: "createdAt_desc",
  pageLimit: PAGE_SIZE
};

let unsubscribe = null;
const grid = document.getElementById("catalog-grid");
const emptyState = document.getElementById("catalog-empty");
const moreBtn = document.getElementById("btn-more");

function sortToOrder(sortKey) {
  switch (sortKey) {
    case "price_asc": return ["price", "asc"];
    case "price_desc": return ["price", "desc"];
    case "rating_desc": return ["rating", "desc"];
    default: return ["createdAt", "desc"];
  }
}

function buildQuery() {
  const constraints = [where("active", "==", true)];
  if (state.category) constraints.push(where("category", "==", state.category));
  if (state.search.trim()) {
    constraints.push(where("keywords", "array-contains", state.search.trim().toLowerCase()));
  }
  const [field, dir] = sortToOrder(state.sort);
  constraints.push(orderBy(field, dir));
  constraints.push(limit(state.pageLimit));
  return query(collection(db, "services"), ...constraints);
}

function cardHtml(id, s) {
  return `
  <a class="card" href="service.html?id=${id}">
    <div class="card-media">${escapeHtml((s.name || "?").slice(0, 1).toUpperCase())}</div>
    <div class="card-body">
      <span class="card-cat">${escapeHtml(s.category || "Услуга")}</span>
      <span class="card-title">${escapeHtml(s.name)}</span>
      <p class="card-desc">${escapeHtml((s.description || "").slice(0, 90))}${(s.description || "").length > 90 ? "…" : ""}</p>
      <div class="card-foot">
        <span class="price">${fmtPrice(s.price)} <small>· ${s.durationMin || 30} мин</small></span>
        <span class="rating">${starString(s.rating)} <span class="muted">(${s.reviewsCount || 0})</span></span>
      </div>
    </div>
  </a>`;
}

function subscribe() {
  if (unsubscribe) unsubscribe();
  unsubscribe = onSnapshot(buildQuery(), (snap) => {
    if (snap.empty) {
      grid.innerHTML = "";
      emptyState.classList.remove("hidden");
      moreBtn.classList.add("hidden");
      return;
    }
    emptyState.classList.add("hidden");
    grid.innerHTML = snap.docs.map(d => cardHtml(d.id, d.data())).join("");
    // Показываем «Показать ещё», если получили ровно текущий лимит —
    // вероятно, есть ещё элементы за пределами страницы.
    moreBtn.classList.toggle("hidden", snap.docs.length < state.pageLimit);
  }, (err) => {
    console.error("Каталог Firebase недоступен:", err);
    // Не стираем демо-карточки: сайт остаётся визуально рабочим
    // даже до подключения собственного Firebase-проекта.
    emptyState.classList.add("hidden");
    moreBtn.classList.add("hidden");
  });
}

export function initCatalog() {
  if (!grid) return;

  document.getElementById("search-input").addEventListener("input", debounce((e) => {
    state.search = e.target.value;
    state.pageLimit = PAGE_SIZE;
    subscribe();
  }));

  document.getElementById("category-select").addEventListener("change", (e) => {
    state.category = e.target.value;
    state.pageLimit = PAGE_SIZE;
    subscribe();
  });

  document.getElementById("sort-select").addEventListener("change", (e) => {
    state.sort = e.target.value;
    state.pageLimit = PAGE_SIZE;
    subscribe();
  });

  moreBtn.addEventListener("click", () => {
    state.pageLimit += PAGE_SIZE;
    subscribe();
  });

  subscribe();
}
