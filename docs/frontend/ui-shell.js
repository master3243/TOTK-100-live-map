function setSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", open);
  if (sidebarBackdrop) {
    sidebarBackdrop.hidden = !open;
    sidebarBackdrop.setAttribute("aria-hidden", open ? "false" : "true");
  }
  if (sidebarClose) {
    sidebarClose.hidden = !open;
    sidebarClose.setAttribute("aria-hidden", open ? "false" : "true");
  }
  // Keep the hamburger as "open menu"; close is via the top-right X, backdrop, or Escape.
}

if (sidebarToggle) {
  sidebarToggle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setSidebarOpen(true);
  });
}

if (sidebarBackdrop) {
  sidebarBackdrop.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setSidebarOpen(false);
  });
}

if (sidebarClose) {
  sidebarClose.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setSidebarOpen(false);
  });
}
