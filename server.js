//import { request, gql } from "graphql-request";
const graphql = require("graphql-request");
const express = require("express");
const zip = require("express-zip");
const path = require("path");
const bodyParser = require("body-parser");
const fs = require("fs");
const archiver = require("archiver");
const rimraf = require("rimraf");
const https = require("https");

const app = express();
const port = 3000;

const query = graphql.gql`
  query getDemarche(
    $demarcheNumber: Int!
    $state: DossierState
    $order: Order
    $after: String
  ) {
    demarche(number: $demarcheNumber) {
      id
      number
      title
      publishedRevision {
        ...RevisionFragment
      }
      groupeInstructeurs {
        id
        number
        label
        instructeurs {
          id
          email
        }
      }
      dossiers(state: $state, order: $order, after: $after) {
        nodes {
          ...DossierFragment
        }
      }
    }
  }

  fragment DossierFragment on Dossier {
    id
    number
    archived
    state
    dateDerniereModification
    datePassageEnConstruction
    datePassageEnInstruction
    dateTraitement
    motivation
    motivationAttachment {
      ...FileFragment
    }
    attestation {
      ...FileFragment
    }
    pdf {
      url
    }
    instructeurs {
      email
    }
    groupeInstructeur {
      id
      number
      label
    }
    revision {
      ...RevisionFragment
    }
    champs {
      ...ChampFragment
      ...RootChampFragment
    }
    annotations {
      ...ChampFragment
      ...RootChampFragment
    }
    avis {
      ...AvisFragment
    }
    messages {
      ...MessageFragment
    }
    demandeur {
      ... on PersonnePhysique {
        civilite
        nom
        prenom
        dateDeNaissance
      }
      ...PersonneMoraleFragment
    }
  }

  fragment RevisionFragment on Revision {
    id
    champDescriptors {
      ...ChampDescriptorFragment
      champDescriptors {
        ...ChampDescriptorFragment
      }
    }
    annotationDescriptors {
      ...ChampDescriptorFragment
      champDescriptors {
        ...ChampDescriptorFragment
      }
    }
  }

  fragment ChampDescriptorFragment on ChampDescriptor {
    id
    type
    label
    description
    required
    options
  }

  fragment AvisFragment on Avis {
    id
    question
    reponse
    dateQuestion
    dateReponse
    claimant {
      email
    }
    expert {
      email
    }
    attachment {
      ...FileFragment
    }
  }

  fragment MessageFragment on Message {
    id
    email
    body
    createdAt
    attachment {
      ...FileFragment
    }
  }

  fragment GeoAreaFragment on GeoArea {
    id
    source
    description
    geometry {
      type
      coordinates
    }
    ... on ParcelleCadastrale {
      commune
      numero
      section
      prefixe
      surface
    }
  }

  fragment RootChampFragment on Champ {
    ... on RepetitionChamp {
      champs {
        ...ChampFragment
      }
    }
    ... on SiretChamp {
      etablissement {
        ...PersonneMoraleFragment
      }
    }
    ... on CarteChamp {
      geoAreas {
        ...GeoAreaFragment
      }
    }
    ... on DossierLinkChamp {
      dossier {
        id
        state
        usager {
          email
        }
      }
    }
  }

  fragment ChampFragment on Champ {
    id
    label
    stringValue
    ... on DateChamp {
      date
    }
    ... on DatetimeChamp {
      datetime
    }
    ... on CheckboxChamp {
      checked: value
    }
    ... on DecimalNumberChamp {
      decimalNumber: value
    }
    ... on IntegerNumberChamp {
      integerNumber: value
    }
    ... on CiviliteChamp {
      civilite: value
    }
    ... on LinkedDropDownListChamp {
      primaryValue
      secondaryValue
    }
    ... on MultipleDropDownListChamp {
      values
    }
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
    ... on CommuneChamp {
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

  fragment PersonneMoraleFragment on PersonneMorale {
    siret
    siegeSocial
    naf
    libelleNaf
    address {
      ...AddressFragment
    }
    entreprise {
      siren
      capitalSocial
      numeroTvaIntracommunautaire
      formeJuridique
      formeJuridiqueCode
      nomCommercial
      raisonSociale
      siretSiegeSocial
      codeEffectifEntreprise
      dateCreation
      nom
      prenom
      attestationFiscaleAttachment {
        ...FileFragment
      }
      attestationSocialeAttachment {
        ...FileFragment
      }
    }
    association {
      rna
      titre
      objet
      dateCreation
      dateDeclaration
      datePublication
    }
  }

  fragment FileFragment on File {
    filename
    contentType
    checksum
    byteSizeBigInt
    url
  }

  fragment AddressFragment on Address {
    label
    type
    streetAddress
    streetNumber
    streetName
    postalCode
    cityName
    cityCode
    departmentName
    departmentCode
    regionName
    regionCode
  }
`;

//const numero_demarche = 57091;

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.get("/", function (req, res) {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/token.html", function (req, res) {
  res.sendFile(path.join(__dirname, "token.html"));
});

app.get("/test", (req, res) => {
  res
    .attachment(
      "C:\\Users\\bbernier\\Desktop\\stage\\archiveur_ds\\temp\\57091\\57091.zip"
    )
    .send();
});

app.get("/archive/:numero_demarche", async (req, res) => {
  var numero_demarche = req.params.numero_demarche.toString();
  var bearerApiDS = req.query.bearer;
  mkdir("temp/" + numero_demarche);
  graphql
    .request({
      url: "https://www.demarches-simplifiees.fr/api/v2/graphql",
      document: query,
      variables: { demarcheNumber: parseInt(numero_demarche) },
      requestHeaders: {
        authorization: `Bearer ${bearerApiDS}`,
      },
    })
    .then((data) => {
      console.log(data);
      fs.writeFileSync(
        path.join(
          __dirname,
          "temp",
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
          numero_demarche,
          `${dossier.number.toString()}-${dossier.demandeur.nom}-${
            dossier.demandeur.prenom
          }`
        );
        mkdir(path_for_download);
        await download_file(path_for_download, "demarche.pdf", dossier.pdf.url);
        // Parcours des champs, recherche des champs pièce justificative
        dossier.champs.forEach((element) => {
          if (element.file) {
            //Si le champ comporte une indication "file", on le télécharge
            telechargement_fichier(dossier, element, numero_demarche);
          } else if (element.champs) {
            // Même chose pour les champs répétables
            element.champs.forEach((champ_repetable) => {
              if (champ_repetable.file) {
                telechargement_fichier(
                  dossier,
                  champ_repetable,
                  numero_demarche
                );
              }
            });
          }
        });
        //Compression du dossier au format .zip

        var demarche_dossier = path.join(__dirname, "temp", numero_demarche);
        var demarche_dossier_cible = path.join(
          __dirname,
          "temp",
          numero_demarche,
          `${numero_demarche}.zip`
        );
        zipDirectory(demarche_dossier, demarche_dossier_cible).then(
          async (e) => {
            //une fois le dossier compressé on l'envoie
            res.attachment(demarche_dossier_cible).send();

            //une fois le zip envoyé, on supprime tout ce qu'on a créé.
            try {
              fs.rmdir(demarche_dossier, { recursive: true }, (error) => {
                if (error) {
                  console.error(error);
                } else {
                  console.log(`Dossier ${demarche_dossier} supprimé`);
                }
              });
              console.log(`${demarche_dossier} supprimé`);
            } catch (err) {
              console.error(`Error while deleting ${dir}.`);
            }
          }
        );
      });
    });
});

async function telechargement_fichier(dossier, element, numero_demarche) {
  let path_for_download = path.join(
    __dirname,
    "temp",
    numero_demarche,
    `${dossier.number.toString()}-${dossier.demandeur.nom}-${
      dossier.demandeur.prenom
    }`,
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
    fs.mkdirSync(dir);
  } catch (error) {
    //console.error(error);
  }
}

function download_file(folder, file_name, url) {
  const file = fs.createWriteStream(`${folder}/${file_name}`);
  https.get(url, (response) => {
    response.pipe(file);
    file.on("finish", () => {
      file.close();
    });
  });
}

/**
 * @param {String} sourceDir: /some/folder/to/compress
 * @param {String} outPath: /path/to/created.zip
 * @returns {Promise}
 */
function zipDirectory(sourceDir, outPath) {
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
