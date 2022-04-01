var bearerApiDS = sessionStorage.getItem("DS");

document.getElementById("archive-btn").addEventListener("click", () => {
  download_archive();
});
document
  .getElementById("search-787-input")
  .addEventListener("keypress", function (e) {
    if (e.key === "Enter") {
      download_archive();
    }
  });
  
function download_archive() {
  if (bearerApiDS) {
    let url = `http://localhost:3000/archive/${
      document.getElementById("search-787-input").value
    }?bearer=${bearerApiDS}`;
    window.open(url);
  } else {
    document.getElementById("alert_token").style.display = "block";
  }
}
