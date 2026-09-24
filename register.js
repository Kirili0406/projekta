import { auth, db } from "./firebase-config.js";
import { createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const form = document.getElementById("register-form-page");
const errorBox = document.getElementById("register-page-error");
const submit = document.getElementById("register-submit");

function friendlyError(error) {
  const messages = {
    "auth/email-already-in-use": "Этот email уже зарегистрирован. Попробуйте войти.",
    "auth/invalid-email": "Проверьте правильность email.",
    "auth/weak-password": "Пароль слишком простой. Используйте не менее 6 символов.",
    "auth/network-request-failed": "Нет соединения. Проверьте интернет и попробуйте снова.",
    "auth/operation-not-allowed": "Регистрация по email отключена в настройках Firebase Authentication."
  };
  return messages[error.code] || "Не удалось создать аккаунт. Проверьте настройки Firebase и введённые данные.";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.textContent = "";
  const name = document.getElementById("register-name").value.trim();
  const email = document.getElementById("register-email").value.trim();
  const phone = document.getElementById("register-phone").value.trim();
  const password = document.getElementById("register-password").value;
  const repeated = document.getElementById("register-password-repeat").value;

  if (!name) {
    errorBox.textContent = "Введите имя.";
    return;
  }
  if (password !== repeated) {
    errorBox.textContent = "Пароли не совпадают.";
    return;
  }

  submit.disabled = true;
  submit.textContent = "Создаём аккаунт…";
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName: name });
    await setDoc(doc(db, "users", credential.user.uid), {
      name,
      email: credential.user.email,
      phone,
      role: "user",
      createdAt: serverTimestamp()
    });
    window.location.href = "profile.html";
  } catch (error) {
    errorBox.textContent = friendlyError(error);
    submit.disabled = false;
    submit.textContent = "Зарегистрироваться";
  }
});
