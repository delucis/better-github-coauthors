// @ts-check
/// <reference path="../shared/settings.js" />

async function loadOptions() {
  const settings = await getSettings();

  /** @type {HTMLInputElement!} */ (
    document.getElementById("ignoredCoAuthors")
  ).value = settings.ignoredCoAuthors.join(", ");
  /** @type {HTMLInputElement!} */ (
    document.getElementById("stripExistingCoAuthors")
  ).checked = settings.stripExistingCoAuthors;
  /** @type {HTMLInputElement!} */ (document.getElementById("token")).value =
    settings.token;
}

/** @param {SubmitEvent} event */
async function handleSubmit(event) {
  if (!(event.target instanceof HTMLFormElement)) return;
  event.preventDefault();
  const data = new FormData(event.target);

  const ignoredCoAuthors = String(data.get("ignoredCoAuthors"))
    .split(",")
    .map((s) => s.trim());
  const stripExistingCoAuthors = data.get("stripExistingCoAuthors") === "on";
  const token = String(data.get("token"));

  await saveSettings({ ignoredCoAuthors, stripExistingCoAuthors, token });
}

document.addEventListener("DOMContentLoaded", loadOptions);
document.querySelector("form")?.addEventListener("submit", handleSubmit);
