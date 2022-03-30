var bearerApiDS = sessionStorage.getItem("DS");

document.getElementById("archive-btn").addEventListener("click", () => {
  let url =
    `http://localhost:3000/archive/${document.getElementById("search-787-input").value}?bearer=${bearerApiDS}`;
  window.open(url);
});
