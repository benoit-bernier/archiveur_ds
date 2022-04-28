const graphql = require("graphql-request");
const express = require("express");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");
const https = require("https");
const helmet = require("helmet");
var compression = require("compression");

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
  ... on AddressChamp {
    address {
      ...AddressFragment
    }
  }
  ...on CommuneChamp {
    commune {
      name
      code
    }
    departement {
      name
      code
    }
  }
}

fragment AddressFragment on Address {
  label
  type
  cityName
  cityCode
  departmentName
  departmentCode
  regionName
  regionCode
}

fragment FileFragment on File {
  filename
  contentType
  checksum
  byteSizeBigInt
  url
}`;

const simple_query = graphql.gql`query getDemarche(
  $demarcheNumber: Int!
) {
  demarche(number: $demarcheNumber) {
    id
    number
    title
    dossiers{
      nodes {
        ...DossierFragment
      }
    }
  }
}
fragment DossierFragment on Dossier {
  id
}
`;

app.use(express.static("public"));
app.use(helmet());
app.use(compression());

app.get("/", function (req, res) {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/token.html", function (req, res) {
  res.sendFile(path.join(__dirname, "token.html"));
});

app.get("/check/:numero_demarche", async (req, res) => {
  var numero_demarche = req.params.numero_demarche.toString();
  var bearerApiDS = req.query.bearer;
  try {
    const data = await graphql.request({
      url: "https://www.demarches-simplifiees.fr/api/v2/graphql",
      document: simple_query,
      variables: { demarcheNumber: parseInt(numero_demarche) },
      requestHeaders: {
        authorization: `Bearer ${bearerApiDS}`,
      },
    });
    console.log(data);
    answer = {
      id_ds: data.demarche.number,
      titre: data.demarche.title,
      nb_dossier: data.demarche.dossiers.nodes.length,
    };
  } catch (error) {
    console.log(error);
    console.log(JSON.parse(JSON.stringify(error, undefined, 2)).response.errors[0]
    .extensions.code)
    switch (
      JSON.parse(JSON.stringify(error, undefined, 2)).response.errors[0]
        .extensions.code
    ) {
      case "unauthorized":
        answer = {
          reponse:
            "Action non autorisée. Votre token ne semble pas pouvoir accéder à cette démarche.",
        };
        break;
      case "not_found":
        answer = {
          reponse: "La démarche cherchée n'a pas été trouvée.",
        };
        break;
      default:
        answer = {
          reponse: "Une erreur inconnue est survenue.",
        };
        break;
    }
  }
  res.json(answer);
});

app.get("/download/:numero_demarche", async (req, res) => {
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
    await Promise.all(
      data.demarche.dossiers.nodes.map(async (dossier) => {
        // Téléchargement du résumé pdf de chaque dossier
        let path_for_download = path.join(
          __dirname,
          "temp",
          `${numero_demarche}_temp`,
          numero_demarche,
          `${dossier.number.toString()}` //-${dossier.demandeur.nom}-${dossier.demandeur.prenom}` // /!\ si on réactive cette fonctionnalité, il faut changer la query.
        );
        mkdir(path_for_download);
        await download_file(path_for_download, "demarche.pdf", dossier.pdf.url);
        // Parcours des champs, recherche des champs pièce justificative
        await Promise.all(
          dossier.champs.map(async (element) => {
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
          })
        );
      })
    );
  } catch (error) {
    console.error(error);
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
  } finally {
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
    res.download(demarche_dossier_cible, (err) => {
      let dossier_a_supprimer = path.join(
        __dirname,
        "temp",
        `${numero_demarche}_temp`
      );

      fs.rmdir(
        dossier_a_supprimer,
        { recursive: true, force: true, maxRetries: 3 },
        (err) => {
          if (err) {
            console.error(err);
          } else {
            console.log("Suppression effectuée : ", dossier_a_supprimer);
          }
        }
      );
    });
  }
});

async function telechargement_fichier(dossier, element, numero_demarche) {
  return new Promise((resolve) => {
    let path_for_download = path.join(
      __dirname,
      "temp",
      `${numero_demarche}_temp`,
      numero_demarche,
      `${dossier.number.toString()}`, //-${dossier.demandeur.nom}-${dossier.demandeur.prenom}`,
      "pieces_justificatives"
    );
    mkdir(path_for_download);
    download_file(
      path_for_download,
      element.file.filename,
      element.file.url
    ).then(() => resolve());
  });
}

/**
 * @param {String} dir: /some/folder/to/create
 */
function mkdir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (error) {
    //console.error(error);
  }
}

async function download_file(folder, file_name, url) {
  return new Promise((resolve) => {
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

    stream.on("close", () => {
      resolve();
    });
    archive.finalize();
  });
}

app.listen(process.env.PORT || port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
