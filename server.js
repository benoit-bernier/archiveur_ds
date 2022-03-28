const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const fs = require("fs");
const https = require("https");
import { request, gql } from "graphql-request";

const app = express();
const port = 3000;

const query = gql`
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

  fragment DemarcheDescriptorFragment on DemarcheDescriptor {
    id
    number
    title
    description
    state
    declarative
    dateCreation
    datePublication
    dateDerniereModification
    dateDepublication
    dateFermeture
  }

  fragment DeletedDossierFragment on DeletedDossier {
    id
    number
    dateSupression
    state
    reason
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

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.get("/", function (req, res) {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/get_last_cobaye_id", function (req, res) {
  let nombre;
  let files = fs.readdirSync(path.join(__dirname, "data"));
  nombre = files.length;
  res.send(
    (nombre === undefined || nombre === null
      ? Math.floor(100000 + Math.random() * 900000)
      : nombre
    ).toString()
  ); // envoie le nombre de fichiers ou un nombre aléatoire à 6 chiffres
});

app.get("/archive", function (req, res) {
  const numero_demarche = 56504; //Math.floor(10000 + Math.random() * 90000);
  fs.mkdir("temp/" + numero_demarche, (err) => {
    if (err) {
      throw err;
    }
  });
  request({
    url: "https://www.demarches-simplifiees.fr/api/v2/graphql",
    document: query,
    variables: { demarcheNumber: 56504 },
    requestHeaders: {
      authorization: "Bearer vgYasHB8kxYELzjEtbdYXWBj",
    },
  }).then((data) => console.log(data));
});

function download_file(folder, file_name, url) {
  const file = fs.createWriteStream(`${folder}/${file_name}`);
  const request = https.get(url, (response) => {
    response.pipe(file);
  });
}

function getDataFromAPI(params) {}

app.post("/", function requestHandler(req, res) {
  res.end("Hello, World!");
});

app.post("/save_data", function requestHandler(req, res) {
  console.log(req.body);
  let data = req.body;
  fs.writeFileSync(
    path.join(__dirname, "data", `${data.user_id}.json`),
    JSON.stringify(data)
  );
  res.end(JSON.stringify({ ok: 200 }));
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
