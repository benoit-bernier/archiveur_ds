//import { request, gql } from "graphql-request";
const graphql = require("graphql-request");
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const fs = require("fs");
const https = require("https");
const archiver = require("archiver");

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

app.get("/archive/:numero_demarche", function (req, res) {
  var numero_demarche = req.params.numero_demarche.toString();
  mkdir("temp/" + numero_demarche);
  graphql
    .request({
      url: "https://www.demarches-simplifiees.fr/api/v2/graphql",
      document: query,
      variables: { demarcheNumber: parseInt(numero_demarche) },
      requestHeaders: {
        authorization: "Bearer vgYasHB8kxYELzjEtbdYXWBj",
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
      data.demarche.dossiers.nodes.forEach((dossier) => {
        // Téléchargement du résumé pdf de chaque dossier
        let path_for_download = path.join(
          __dirname,
          "temp",
          numero_demarche,
          dossier.number.toString()
        );
        mkdir(path_for_download);
        download_file(
          path_for_download,
          `${dossier.number.toString()}_resume.pdf`,
          dossier.pdf.url
        );
        // Parcours des champs, recherche des champs pièce justificative
        dossier.champs.forEach((element) => {
          if (element.file) {
            telechargement_fichier(dossier, element, numero_demarche);
          } else if (element.champs) {
            element.champs.forEach((champ_repetable) => {
              if (champ_repetable.file) {
                telechargement_fichier(dossier, champ_repetable, numero_demarche);
              }
            });
          }
        });
        var demarche_dossier = path.join(__dirname, "temp", numero_demarche);
        var demarche_dossier_cible = path.join(
          __dirname,
          "temp",
          `${numero_demarche}.zip`
        );
        zipDirectory(demarche_dossier, demarche_dossier_cible).then((e) => {
          res.download(demarche_dossier_cible);
        });
      });
    });
});

function telechargement_fichier(dossier, element, numero_demarche) {
  let path_for_download = path.join(
    __dirname,
    "temp",
    numero_demarche,
    dossier.number.toString(),
    "pieces_justificatives"
  );
  mkdir(path_for_download);
  download_file(path_for_download, element.file.filename, element.file.url);
}

function mkdir(dir) {
  fs.mkdir(dir, (err) => {
    if (err) {
      console.error(err);
    }
  });
}

function download_file(folder, file_name, url) {
  const file = fs.createWriteStream(`${folder}/${file_name}`);
  const request = https.get(url, (response) => {
    response.pipe(file);
  });
}

function getDataFromAPI(params) {}

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
