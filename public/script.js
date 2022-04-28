var bearerApiDS = sessionStorage.getItem("DS");


document.getElementById("archive-btn").addEventListener("click", () => {
  check_demarche();
});

document.getElementById("annuler_archive_demarche").addEventListener("click", () => {
  location.reload();
});

document.getElementById("telecharger_archive_demarche").addEventListener("click", () => {
  download_archive();
});

document
  .getElementById("search-787-input")
  .addEventListener("keypress", function (e) {
    if (e.key === "Enter") {
      check_demarche();
    }
  });

  function check_demarche() {
    if (bearerApiDS) {
      let url = `${window.location.origin}/check/${
        document.getElementById("search-787-input").value
      }?bearer=${bearerApiDS}`;
      fetch(url)
      .then(function(response) {
        return response.json();
      })
      .then(function(jsonResponse) {
        if(jsonResponse.id_ds){
          document.querySelectorAll(".fr-alert").forEach( alert => {
            alert.style.display = "none"
          })
          document.getElementById("demarche_title").innerText = `Démarche n° ${jsonResponse.id_ds} - ${jsonResponse.titre} - ${jsonResponse.nb_dossier} dossiers`
          document.getElementById("demarche_placeholder").style.display = "block"
        } else if (jsonResponse.reponse) {
          document.getElementById("alert-text-explication").innerText = jsonResponse.reponse
          document.getElementById("alert_demarche").style.display = "block";
        }
      });      
    } else {
      document.getElementById("alert_token").style.display = "block";
    }
  }

function download_archive() {
  if (bearerApiDS) {
    let url = `${window.location.origin}/download/${
      document.getElementById("search-787-input").value
    }?bearer=${bearerApiDS}`;
    window.open(url);
  } else {
    document.getElementById("alert_token").style.display = "block";
  }
}