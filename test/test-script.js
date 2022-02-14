let bibSerializer = require('./../lib/serializers/bib.js')

const BibSierraRecord = require('./../lib/models/bib-sierra-record')

const bibJSON = require('./data/bib-11009512-with-parallels.json')

const bibRecord = BibSierraRecord.from(bibJSON);

let bib = bibSerializer.fromMarcJson(bibRecord)


module.exports = bib;
