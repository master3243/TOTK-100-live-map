function $(selector) {
  return document.querySelector(selector);
}

function byId(...ids) {
  return Object.fromEntries(ids.map((id) => [id, $(`#${id}`)]));
}
