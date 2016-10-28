const api = require('./lib/nyplDataApi')

api.bib(process.argv[2]).then((resp) => {
  console.log('Bib: ', JSON.stringify(resp, null, 2))
})
