const graphql = require("graphql-request");
const express = require("express");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");
const https = require("https");

const app = express();
const port = 3000;

const query = graphql.gql`query getDemarche(
  $demarcheNumber: Int!
) {
  demarche(number: $demarcheNumber) {
    id
    number
    dossiers {
      nodes {
        ...DossierFragment
      }
    }
  }
}

fragment DossierFragment on Dossier {
  number
  pdf {
    url
  }
  champs {
    ...ChampFragment
    ...RootChampFragment
  }
}

fragment RootChampFragment on Champ {
  ... on RepetitionChamp {
    champs {
      ...ChampFragment
    }
  }
}

fragment ChampFragment on Champ {
  id
  label
  stringValue
  ... on PieceJustificativeChamp {
    file {
      ...FileFragment
    }
  }
}

fragment FileFragment on File {
  filename
  contentType
  checksum
  byteSizeBigInt
  url
}`;

app.use(express.static("public"));

app.get("/", function (req, res) {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/token.html", function (req, res) {
  res.sendFile(path.join(__dirname, "token.html"));
});

app.get("/archive/:numero_demarche", async (req, res) => {
  var numero_demarche = req.params.numero_demarche.toString();
  var bearerApiDS = req.query.bearer;
  mkdir(`temp/${numero_demarche}_temp/${numero_demarche}`);
  try {
    const data = await graphql.request({
      url: "https://www.demarches-simplifiees.fr/api/v2/graphql",
      document: query,
      variables: { demarcheNumber: parseInt(numero_demarche) },
      requestHeaders: {
        authorization: `Bearer ${bearerApiDS}`,
      },
    });
    console.log(data);
    fs.writeFileSync(
      path.join(
        __dirname,
        "temp",
        `${numero_demarche}_temp`,
        numero_demarche,
        `${data.demarche.number}.json`
      ),
      JSON.stringify(data)
    );
    data.demarche.dossiers.nodes.forEach(async (dossier) => {
      // Téléchargement du résumé pdf de chaque dossier
      let path_for_download = path.join(
        __dirname,
        "temp",
        `${numero_demarche}_temp`,
        numero_demarche,
        `${dossier.number.toString()}` //-${dossier.demandeur.nom}-${dossier.demandeur.prenom}`
      );
      mkdir(path_for_download);
      await download_file(path_for_download, "demarche.pdf", dossier.pdf.url);
      // Parcours des champs, recherche des champs pièce justificative
      await dossier.champs.forEach(async (element) => {
        if (element.file) {
          //Si le champ comporte une indication "file", on le télécharge
          await telechargement_fichier(dossier, element, numero_demarche);
        } else if (element.champs) {
          // Même chose pour les champs répétables
          await element.champs.forEach(async (champ_repetable) => {
            if (champ_repetable.file) {
              await telechargement_fichier(
                dossier,
                champ_repetable,
                numero_demarche
              );
            }
          });
        }
      });
    });
  } catch (error) {
    switch (
      JSON.parse(JSON.stringify(error, undefined, 2)).response.errors[0]
        .extensions.code
    ) {
      case "unauthorized":
        try {
          fs.writeFileSync(
            `${path_for_download}.txt`,
            "Action non autorisée. Votre token ne semble pas pouvoir accéder à cette démarche."
          );
        } catch (error) {}
        break;
      case "not_found ":
        try {
          fs.writeFileSync(
            `${path_for_download}.txt`,
            "La démarche cherchée n'a pas été trouvée."
          );
        } catch (error) {}
        break;
      default:
        try {
          fs.writeFileSync(
            `${path_for_download}.txt`,
            "Une erreur inconnue est survenue."
          );
        } catch (error) {}
        break;
    }
    console.log();
  }

  //Compression du dossier au format .zip

  var demarche_dossier = path.join(
    __dirname,
    "temp",
    `${numero_demarche}_temp`,
    numero_demarche
  );
  var demarche_dossier_cible = path.join(
    __dirname,
    "temp",
    `${numero_demarche}_temp`,
    `${numero_demarche}.zip`
  );

  await zipDirectory(demarche_dossier, demarche_dossier_cible);
  //une fois le dossier compressé on l'envoie
  console.log("Fichier à envoyer :", demarche_dossier_cible);
  res.download(demarche_dossier_cible, (err) => {
    console.log("download callback");
    //deleteFolderRecursive(path.join(__dirname, "temp", `${numero_demarche}_temp`))
    let dossier_a_supprimer = path.join(
      __dirname,
      "temp",
      `${numero_demarche}_temp`
    );
    fs.rmdir(dossier_a_supprimer, { recursive: true, force: true, maxRetries:3}, (err) => {
      if (err) {
        console.error(err);
      } else {
        console.log("Suppression effectuées : ", dossier_a_supprimer);
      }
    });
  });
});

function deleteFolderRecursive(directoryPath) {
  if (fs.existsSync(directoryPath)) {
    fs.readdirSync(directoryPath).forEach((file, index) => {
      console.log(file);
      const curPath = path.join(directoryPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        // recurse
        deleteFolderRecursive(curPath);
      } else {
        // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(directoryPath);
  }
}

async function telechargement_fichier(dossier, element, numero_demarche) {
  let path_for_download = path.join(
    __dirname,
    "temp",
    `${numero_demarche}_temp`,
    numero_demarche,
    `${dossier.number.toString()}`, //-${dossier.demandeur.nom}-${dossier.demandeur.prenom}`,
    "pieces_justificatives"
  );
  mkdir(path_for_download);
  await download_file(
    path_for_download,
    element.file.filename,
    element.file.url
  );
}

function mkdir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (error) {
    //console.error(error);
  }
}

async function download_file(folder, file_name, url) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(`${folder}/${file_name}`);
    https.get(url, (response) => {
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    });
  });
}

/**
 * @param {String} sourceDir: /some/folder/to/compress
 * @param {String} outPath: /path/to/created.zip
 * @returns {Promise}
 */
async function zipDirectory(sourceDir, outPath) {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const stream = fs.createWriteStream(outPath);

  return new Promise((resolve, reject) => {
    archive
      .directory(sourceDir, false)
      .on("error", (err) => reject(err))
      .pipe(stream);

    stream.on("close", () => resolve());
    archive.finalize();
  });
}

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
