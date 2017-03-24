const csv = require('csvtojson')
const fs = require('fs')

var translations = [
  {
    from: './data/field-mapping-marc.csv',
    columns: [0, 1, 3, 4, 5, 7],
    headers: ['name', 'predicate', 'bib_path', 'item_path', 'recap_path', 'marc_field_name']
  },
  {
    from: './data/field-mapping-resources.csv',
    columns: [0, 1, 2, 4, 5],
    startAt: 16,
    headers: ['name', 'predicate', 'JSON-LD key', 'domain', 'range']
  },
  {
    from: './data/lookup-location-code-to-org-id.csv',
    headers: ['key', 'value'],
    makeMap: true
  },
  {
    from: './data/lookup-lc-mediatypes.csv',
    headers: ['key', 'value'],
    makeMap: true
  },
  {
    from: './data/lookup-lc-carriertypes.csv',
    headers: ['key', 'value'],
    makeMap: true
  },
  {
    from: './data/lookup-856-label-to-resource-class.csv',
    headers: ['key', 'value'],
    makeMap: true
  },
  {
    from: './data/lookup-language-code-to-label.csv',
    headers: ['key', 'value'],
    makeMap: true
  },
  {
    from: './data/lookup-agent-role-to-loc-role.csv',
    headers: ['key', 'value'],
    makeMap: true
  },
  {
    from: './data/lookup-genre-code-to-label.csv',
    headers: ['key', 'value'],
    makeMap: true
  },
  {
    from: './data/lookup-bib-levels.csv',
    headers: ['key', 'value'],
    makeMap: true
  },
  {
    from: './data/lookup-rectypes-to-resource-types.csv',
    headers: ['key', 'value'],
    makeMap: true
  },
  {
    from: './data/lookup-resource-types.csv',
    headers: ['key', 'value'],
    makeMap: true
  }
]

translations.forEach((translation) => {
  var opts = {}

  if (translation.headers) opts.headers = translation.headers
  if (translation.columns) opts.includeColumns = translation.columns

  var obj = translation.makeMap ? {} : []

  var consumed = 0
  csv(opts)
  .fromFile(translation.from)
  .on('json', (row) => {
    consumed += 1

    if (translation.startAt && translation.startAt > consumed) return

    if (translation.makeMap) {
      // Don't override existing value; keep first
      if (obj[row.key]) return

      obj[row.key] = row.value
    } else obj.push(row)
  })
  .on('done', (error) => {
    if (error) console.error(error.message)

    var savePath = translation.from.replace(/\.csv$/, '.json')
    fs.writeFile(savePath, JSON.stringify(obj, null, 2), function (err) {
      if (err) console.error('Error: ' + err.message)

      console.log('Wrote ' + savePath)
    })
  })
})
