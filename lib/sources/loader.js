const NdJsonSource = require('./ndjson')

function load (source) {
  if (!source) throw new Error('No source configured')

  if (/\.ndjson$/.test(source)) {
    return new NdJsonSource(source)
  } else {
    // TODO: detect kinesis config here
    // e.g. return new KinesisSource('Bib')
  }
}

module.exports = { load }
