const header = document.querySelector("[data-header]");
const navToggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-nav]");

const updateHeader = () => {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 20);
};

const closeNav = () => {
  if (!navToggle) return;
  if (!document.body.classList.contains("nav-open")) return;

  document.body.classList.remove("nav-open");
  navToggle.setAttribute("aria-expanded", "false");
  navToggle.setAttribute("aria-label", "Menü öffnen");
};

window.addEventListener("scroll", updateHeader, { passive: true });
updateHeader();

if (navToggle) {
  navToggle.addEventListener("click", () => {
    const isOpen = document.body.classList.toggle("nav-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
    navToggle.setAttribute("aria-label", isOpen ? "Menü schließen" : "Menü öffnen");
  });
}

if (nav) {
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      closeNav();
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeNav();
  }
});

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.16 }
);

document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));

const atSign = String.fromCharCode(64);
const mailPrefix = ["mai", "lto", ":"].join("");
const getProtectedAddress = () => {
  const link = document.querySelector(".protected-mail");
  if (!link) return "";

  const { mailUser, mailDomain, mailTld } = link.dataset;
  if (!mailUser || !mailDomain || !mailTld) return "";

  return `${mailUser}${atSign}${mailDomain}.${mailTld}`;
};

document.querySelectorAll(".protected-mail").forEach((link) => {
  const { mailUser, mailDomain, mailTld } = link.dataset;
  if (!mailUser || !mailDomain || !mailTld) return;

  const address = `${mailUser}${atSign}${mailDomain}.${mailTld}`;
  link.href = `${mailPrefix}${address}`;
  link.textContent = address;
});

window.ksParkettTurnstile = (token) => {
  document.querySelectorAll("[data-turnstile-token]").forEach((input) => {
    input.value = token;
  });
};

document.querySelectorAll("[data-contact-form]").forEach((form) => {
  const startedAt = form.querySelector("[data-form-started-at]");
  const status = form.querySelector("[data-form-status]");
  const submitButton = form.querySelector('button[type="submit"]');
  const trapField = form.querySelector('input[name="website"]');
  const storageKey = "ks_contact_submit_at";
  const minSubmitDelay = 4000;
  const submitCooldown = 20000;
  const openedAt = Date.now();

  if (startedAt) {
    startedAt.value = String(openedAt);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const elapsed = Date.now() - openedAt;
    const lastSubmit = Number(window.localStorage.getItem(storageKey) || 0);

    if (elapsed < minSubmitDelay) {
      if (status) status.textContent = "Bitte prüfen Sie Ihre Angaben noch einmal.";
      return;
    }

    if (Date.now() - lastSubmit < submitCooldown) {
      if (status) status.textContent = "Bitte warten Sie kurz, bevor Sie erneut senden.";
      return;
    }

    if (trapField && trapField.value.trim()) {
      if (status) status.textContent = "Die Anfrage konnte nicht gesendet werden.";
      return;
    }

    window.localStorage.setItem(storageKey, String(Date.now()));

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Wird gesendet...";
    }

    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(new FormData(form)),
      });

      if (!response.ok) {
        throw new Error("Submit failed");
      }

      form.reset();
      if (startedAt) startedAt.value = String(Date.now());
      if (status) status.textContent = "Danke. Ihre Anfrage wurde gesendet.";
    } catch (error) {
      window.localStorage.removeItem(storageKey);
      const fallbackAddress = getProtectedAddress();
      if (status) {
        status.textContent =
          "Die Anfrage konnte nicht direkt gesendet werden. Es öffnet sich ein vorbereiteter Entwurf.";
      }

      if (fallbackAddress) {
        const fallbackBody = [...new FormData(form).entries()]
          .filter(([name]) => !["website", "started_at", "turnstile_token"].includes(name))
          .map(([name, value]) => `${name}: ${value}`)
          .join("\n");

        window.location.href = `${mailPrefix}${fallbackAddress}?subject=${encodeURIComponent(
          "Anfrage über die Website"
        )}&body=${encodeURIComponent(fallbackBody)}`;
      }
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Anfrage senden";
      }
    }
  });
});
